"use client";

/**
 * Refund (part of) a paid payment link to the customer's card (STRIPE-LINKS SL-21/SL-22).
 *
 * Opened from a row of Banking ▸ Payment Links (31 Oct 2026). It used to open from the order's Finance card,
 * among the order's everyday buttons, where a refund was one press away from a mistake; it now lives in
 * Banking, and its last button stays disabled until the person ticks a box that names the amount going back.
 *
 * Owner only, and only where the server says so (`canRefund`): the screen that opens it draws the action for
 * no other row. The money comes from the business's own Stripe balance and Stripe keeps its fee; the form says
 * both before anything is sent. It does not say the customer will be emailed: whether Stripe emails a refund
 * receipt is the business's own Stripe setting.
 */

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { formatMinor, type PaymentLinkRow } from "@/components/PaymentLinksPanel";
import { minorToInputText, parseRequestAmount, requestAmountMessage } from "@/lib/studioflow/money";
import {
  newClientRefundId, refundOrderPayment, refundRefusal, refundRefusalText, refundResult,
  type PaymentRequestRefundFields, type RefundReason,
} from "@/lib/studioflow/stripeConnect";

/** A row as the refund form reads it: the shared fields, plus what the server says about refunding it (SL-22). */
export type RefundableRow = PaymentLinkRow & PaymentRequestRefundFields;

/** One refund submit: retried as it is, it keeps its id, so the server and Stripe make it once. */
export type RefundAttempt = { paymentRequestId: string; amountMinor: number; reason: RefundReason; clientRefundId: string };

/** What Stripe made of a refund the server accepted, for the screen to say. */
export type RefundNotice = { tone: string; text: string };

export default function RefundPaymentDialog({
  companyId,
  row,
  t,
  locale,
  attemptRef,
  onBusyChange,
  onClose,
  onRefunded,
  onRowChanged,
}: {
  companyId: string;
  row: RefundableRow;
  t: (text: string) => string;
  /** The person's locale tag. Only the pre-filled amount uses it; the amount's reading does not depend on it. */
  locale: string;
  /** The last submit, held by the screen that opens this form so it outlives the form: closed and opened again
   *  for the same row, amount and reason, a refund whose answer was lost is sent again with the same id. */
  attemptRef: MutableRefObject<RefundAttempt | null>;
  /** The refund is on its way (true) or answered (false): the opener keeps every other refund action still. */
  onBusyChange?: (busy: boolean) => void;
  onClose: () => void;
  /** The server accepted the refund. The screen says what Stripe made of it, closes this form and reads its list again. */
  onRefunded: (notice: RefundNotice) => void | Promise<void>;
  /** A refusal with a reason is the server's answer about this row as it is now: the screen reads its list again. */
  onRowChanged: () => void;
}) {
  const rowCurrency = row.currency || "";
  const formId = `refund-form-${row.paymentRequestId}`;
  // The whole refundable remainder, the way the New payment link form starts at the headroom; editable for a
  // partial refund.
  const [refundAmount, setRefundAmount] = useState(() => minorToInputText(row.refundableMinor ?? 0, rowCurrency, locale));
  const [refundReason, setRefundReason] = useState<RefundReason>("requested_by_customer");
  const [refundError, setRefundError] = useState("");
  const [refunding, setRefunding] = useState(false);
  // The guard against a refund by mistake (31 Oct 2026): the last button stays disabled until this is ticked, and
  // every change to the amount unticks it, so what was agreed to is always the amount that is sent.
  const [understood, setUnderstood] = useState(false);
  const refundFieldRef = useRef<HTMLInputElement | null>(null);

  // Focus moves into the form when it opens, onto the amount, so it can be read and changed at once.
  useEffect(() => {
    refundFieldRef.current?.focus();
    refundFieldRef.current?.select();
  }, []);

  const setBusy = (busy: boolean) => {
    setRefunding(busy);
    onBusyChange?.(busy);
  };
  const closeRefund = () => {
    if (refunding) return; // the answer is on its way; the form stays until it arrives
    onClose();
  };

  const refund = async () => {
    if (!understood) return;
    // Read exactly as the New payment link form reads an amount: "12,50" is 12.50 in every locale, and an amount
    // that could mean two things is refused rather than guessed.
    const parsed = parseRequestAmount(refundAmount, rowCurrency, locale);
    if (!parsed.ok) { setRefundError(t(requestAmountMessage(parsed.reason))); return; }
    const most = row.refundableMinor ?? 0;
    if (parsed.amountMinor > most) {
      setRefundError(t(refundRefusalText("refund_amount_too_large")).replace("{amount}", formatMinor(most, rowCurrency)));
      return;
    }
    // The same submit, retried (the answer was lost, Stripe was slow), keeps its id, so it is one refund however
    // many times it is sent. A different amount, reason or row is a different refund and gets a new id.
    const previous = attemptRef.current;
    const attempt: RefundAttempt = previous
      && previous.paymentRequestId === row.paymentRequestId
      && previous.amountMinor === parsed.amountMinor
      && previous.reason === refundReason
      ? previous
      : { paymentRequestId: row.paymentRequestId, amountMinor: parsed.amountMinor, reason: refundReason, clientRefundId: newClientRefundId() };
    attemptRef.current = attempt;
    setBusy(true);
    setRefundError("");
    try {
      const result = await refundOrderPayment({
        companyId,
        orderId: row.orderId,
        paymentRequestId: attempt.paymentRequestId,
        amountMinor: attempt.amountMinor,
        reason: attempt.reason,
        clientRefundId: attempt.clientRefundId,
      });
      attemptRef.current = null;
      const outcome = refundResult(result.refund.status);
      const amountText = formatMinor(result.refund.amountMinor || attempt.amountMinor, result.refund.currency || rowCurrency);
      // The screen says it, closes the form and reads the list again: the row's refunded and refundable amounts.
      await onRefunded({
        tone: outcome.tone,
        text: outcome.tone === "done" ? `${t(outcome.text)} ${amountText}` : t(outcome.text),
      });
    } catch (e) {
      const refusal = refundRefusal(e);
      // A definite answer (the server said no, and not "it may have reached Stripe"): the next submit is a new refund.
      if (refusal.reason && !refusal.retry) attemptRef.current = null;
      setRefundError(t(refusal.text).replace("{amount}", formatMinor(refusal.refundableMinor ?? most, rowCurrency)));
      // A refusal with a reason is the server's answer about this row as it is now (refunded elsewhere, disputed,
      // less left): the list is read again so the row says so too. The form and its sentence stay.
      if (refusal.reason) onRowChanged();
    } finally {
      setBusy(false);
    }
  };

  const typed = parseRequestAmount(refundAmount, rowCurrency, locale);
  return (
    <div
      id={formId}
      role="dialog"
      aria-labelledby={`${formId}-title`}
      aria-describedby={`${formId}-terms`}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeRefund(); } }}
      style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", textAlign: "left", whiteSpace: "normal",
        border: "1px solid rgba(120,120,140,0.22)", borderRadius: 10, padding: 12 }}
    >
      <strong id={`${formId}-title`} style={{ flexBasis: "100%", fontSize: 13 }}>{t("Refund this payment")}</strong>
      <label style={{ display: "grid", gap: 3, fontSize: 11.5, opacity: 0.75 }}>
        {t("Amount to refund")}
        <input
          ref={refundFieldRef}
          value={refundAmount}
          onChange={(e) => { setRefundAmount(e.target.value); setUnderstood(false); }}
          inputMode="decimal"
          disabled={refunding}
          aria-describedby={`${formId}-most`}
          placeholder={minorToInputText(0, rowCurrency, locale)}
          style={{ width: 120 }}
        />
      </label>
      <label style={{ display: "grid", gap: 3, fontSize: 11.5, opacity: 0.75 }}>
        {t("Reason")}
        <select value={refundReason} disabled={refunding} onChange={(e) => setRefundReason(e.target.value === "duplicate" ? "duplicate" : "requested_by_customer")}>
          <option value="requested_by_customer">{t("Customer asked for a refund")}</option>
          <option value="duplicate">{t("Duplicate payment")}</option>
        </select>
      </label>
      <span id={`${formId}-most`} style={{ fontSize: 11.5, opacity: 0.75, alignSelf: "center" }}>
        {t("Up to {amount}").replace("{amount}", formatMinor(row.refundableMinor ?? 0, rowCurrency))}
      </span>
      <p id={`${formId}-terms`} style={{ margin: 0, flexBasis: "100%", fontSize: 12.5 }}>
        {t("A refund cannot be undone. The money comes from your Stripe balance, and Stripe keeps its processing fee.")}
      </p>
      {/* The box names the amount as typed, in the row's currency. An amount that cannot be read has nothing to
          agree to: the line says why instead, and the box comes back once the amount reads. */}
      {typed.ok ? (
        <label style={{ display: "flex", gap: 6, alignItems: "center", flexBasis: "100%", fontSize: 12.5 }}>
          <input type="checkbox" checked={understood} disabled={refunding} onChange={(e) => setUnderstood(e.target.checked)} />
          {t("I understand this sends {amount} back to the customer's card.").replace("{amount}", formatMinor(typed.amountMinor, rowCurrency))}
        </label>
      ) : (
        <p style={{ margin: 0, flexBasis: "100%", fontSize: 12, color: "#b45309" }}>{t(requestAmountMessage(typed.reason))}</p>
      )}
      <button
        type="button"
        disabled={refunding || !understood}
        onClick={() => void refund()}
        style={{ border: 0, borderRadius: 8, background: "#b91c1c", color: "#fff", cursor: refunding || !understood ? "default" : "pointer",
          font: "inherit", fontSize: 13, fontWeight: 700, padding: "7px 13px", opacity: refunding || !understood ? 0.5 : 1 }}
      >
        {refunding
          ? t("Refunding…")
          : typed.ok ? t("Refund {amount}").replace("{amount}", formatMinor(typed.amountMinor, rowCurrency)) : t("Refund payment")}
      </button>
      <button
        type="button"
        disabled={refunding}
        onClick={closeRefund}
        style={{ border: "1px solid rgba(120,120,140,0.35)", borderRadius: 8, background: "transparent", color: "inherit",
          cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700, padding: "6px 12px" }}
      >
        {t("Close")}
      </button>
      {refundError ? (
        <p role="alert" style={{ margin: 0, flexBasis: "100%", fontSize: 12.5, color: "#b91c1c" }}>{refundError}</p>
      ) : null}
    </div>
  );
}

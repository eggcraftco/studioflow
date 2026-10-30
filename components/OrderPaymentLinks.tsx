"use client";

/**
 * Ask this order's customer to pay, from the order itself.
 *
 * The same callables, the same server arithmetic and the same records as the
 * Banking → Payment Links screen. Nothing is computed here that the server
 * computes there: the outstanding balance, the headroom left after the links
 * already open, and the refusal when a new link would over-collect all arrive
 * from `listOrderPaymentRequests` and `createOrderPaymentRequest`. A second
 * calculation on this screen would be a second answer, and two answers about
 * money is one too many.
 *
 * Three things it deliberately does not do:
 *
 *   it does not pick the order or the workspace — both are the screen's own,
 *   so the two fields most likely to be got wrong cannot be;
 *
 *   it does not choose the currency — the server resolves the workspace's, and
 *   refuses rather than guessing when the workspace's symbol names more than
 *   one ("¥" is JPY or CNY, and those differ by a factor of a hundred);
 *
 *   it does not message the customer. The link is copied by a person who
 *   decides where it goes. Sending it automatically would make an order edit
 *   into an outbound message, which is not what anybody pressed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { formatMinor, tabForStatus, type PaymentLinkRow } from "@/components/PaymentLinksPanel";
import { minorToInputText, parseRequestAmount, requestAmountMessage } from "@/lib/studioflow/money";
import { usePaymentLinksAvailable } from "@/lib/studioflow/usePaymentLinksAvailable";
import { ETSY_COPY_LINK_NOTE } from "@/lib/studioflow/etsyOrder";
import {
  newClientRefundId, refundOrderPayment, refundRefusal, refundRefusalText, refundResult,
  type PaymentRequestRefundFields, type RefundReason,
} from "@/lib/studioflow/stripeConnect";

/** A row as this card reads it: the shared fields, plus what the server says about refunding it (SL-22). */
type OrderLinkRow = PaymentLinkRow & PaymentRequestRefundFields;

type ListResult = {
  ok: boolean;
  /** The ISO code the server would charge in; "" when the workspace has not
   *  settled an ambiguous symbol. Never derived here. */
  currency: string;
  outstandingMinor: number;
  headroomMinor: number;
  requests: OrderLinkRow[];
};

/** One refund submit: retried as it is, it keeps its id, so the server and Stripe make it once. */
type RefundAttempt = { paymentRequestId: string; amountMinor: number; reason: RefundReason; clientRefundId: string };

/** Same classification as the Banking panel, for the same reason. */
function messageForError(error: unknown): string {
  const code = String((error as { code?: string })?.code || "");
  const raw = String((error as Error)?.message || "");
  if (/permission-denied/.test(code) || /permission/i.test(raw)) {
    return "Your workspace access does not include financial information.";
  }
  if (/unauthenticated/.test(code)) return "Sign in again to see payment links.";
  if (/not-found/.test(code)) return "That order no longer exists.";
  if (/unavailable|deadline-exceeded/.test(code) || /fetch|network/i.test(raw)) {
    return "Payment links could not be loaded. Check your connection and try again.";
  }
  return "Payment links could not be loaded.";
}

export default function OrderPaymentLinks({
  companyId,
  orderId,
  t,
  canCreate,
  locale,
  onSizeChange,
  etsyOrder = false,
  onPaymentChanged,
}: {
  companyId: string;
  orderId: string;
  t: (text: string) => string;
  /** The person's locale tag. Only the pre-filled amount uses it; the amount's reading does not depend on it. */
  locale: string;
  /** Whether this person may ask a customer for money. The server checks again. */
  canCreate: boolean;
  /** The card grew or shrank on its own (it appears after two reads, a form opens, a link is shown). The order
   *  board sizes its cards from a measurement it takes when IT renders, so without this the Financial card kept
   *  its pre-load height and the card below it was drawn over this one. Same contract as OrderShipmentsPanel. */
  onSizeChange?: () => void;
  /** Etsy API Terms: NivaDesk never sends this link to an Etsy buyer; copying stays, with the M2 warning. */
  etsyOrder?: boolean;
  /** A link's payment or refund changed since the last read — the server has already repaired the order's own
   *  totals (paid, remaining) from the ledger, and the screen that drew them should read the order again. */
  onPaymentChanged?: () => void;
}) {
  // The pilot gate, as the server answers it (S2). Outside the pilot this card
  // does not exist: nothing is listed, nothing is asked, nothing is shown.
  const available = usePaymentLinksAvailable(companyId);
  const [state, setState] = useState<ListResult | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("remaining_balance");
  const [createError, setCreateError] = useState("");
  const [busy, setBusy] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [shownId, setShownId] = useState("");
  // Refunds from NivaDesk (SL-21, 30 Oct 2026): one refund form at a time, under its own row.
  const [refundFor, setRefundFor] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState<RefundReason>("requested_by_customer");
  const [refundError, setRefundError] = useState("");
  const [refundNotice, setRefundNotice] = useState<{ id: string; tone: string; text: string } | null>(null);
  const refundAttempt = useRef<RefundAttempt | null>(null);
  const refundFieldRef = useRef<HTMLInputElement | null>(null);
  const refundOpenerRef = useRef<HTMLButtonElement | null>(null);
  const latest = useRef(0);
  const sizeChangeRef = useRef(onSizeChange);
  sizeChangeRef.current = onSizeChange;
  const observerRef = useRef<ResizeObserver | null>(null);
  // Attached to whichever root is drawn (the card, or its error line): a new root, a removed one, and every
  // change in its height are reported, so the board re-measures the card this lives in.
  const rootRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (node && typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => sizeChangeRef.current?.());
      observer.observe(node);
      observerRef.current = observer;
    }
    sizeChangeRef.current?.();
  }, []);

  const load = useCallback(async () => {
    if (!companyId || !orderId || available !== true) return;
    const ticket = ++latest.current;
    setError("");
    try {
      const call = httpsCallable<{ companyId: string; orderId: string }, ListResult>(
        functions, "listOrderPaymentRequests");
      const response = await call({ companyId, orderId });
      if (ticket !== latest.current) return;
      setState(response.data);
      setError("");
    } catch (e) {
      if (ticket !== latest.current) return;
      // Unknown, not empty — so nothing below claims "no links" when the truth
      // is "we could not find out".
      setState(null);
      setError(messageForError(e));
    }
  }, [companyId, orderId, available]);

  useEffect(() => { void load(); }, [load]);

  // SC-9 (29 Oct 2026). A payment or a refund reaches NivaDesk through Stripe's webhook, not through this
  // screen, so the card read the links once and went on showing "open" after the customer had paid — and the
  // order's totals around it stayed where they were. Now: while a link is open or in flight the card asks
  // again every 15 seconds the tab is visible, and every time the tab comes back (a refund is made in the
  // Stripe tab); when a link's money moved, the order itself is read again.
  const paymentChangedRef = useRef(onPaymentChanged);
  paymentChangedRef.current = onPaymentChanged;
  const fingerprint = useRef("");
  useEffect(() => {
    if (!state) return;
    const next = state.requests
      .map((row) => `${row.paymentRequestId}:${row.publicStatus}:${row.paidAmountMinor}:${row.refundedAmountMinor}`)
      .sort().join("|");
    const before = fingerprint.current;
    fingerprint.current = next;
    if (before && before !== next) paymentChangedRef.current?.();
  }, [state]);
  // A refund Stripe holds as pending (the balance cannot cover it yet) finishes, or fails, through the
  // webhook as well, so the card keeps asking while one is waiting.
  const waiting = useMemo(
    () => (state?.requests ?? []).some((row) => row.publicStatus === "open" || row.publicStatus === "processing"
      || (row.refundPendingMinor ?? 0) > 0),
    [state]
  );
  useEffect(() => {
    if (available !== true || typeof document === "undefined") return;
    const again = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    const timer = waiting ? window.setInterval(again, 15000) : 0;
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);
      if (timer) window.clearInterval(timer);
    };
  }, [available, load, waiting]);

  const openRequests = useMemo(
    () => (state?.requests ?? []).filter((row) => tabForStatus(row.publicStatus) === "open"),
    [state]
  );
  const settled = useMemo(
    () => (state?.requests ?? []).filter((row) => tabForStatus(row.publicStatus) !== "open"),
    [state]
  );

  const create = async () => {
    // In the currency the SERVER resolved, and the same in every locale: a
    // Turkish "12,50" is 12.50, "1,250" is refused as two readings rather than
    // guessed, and anything that is not an amount is refused rather than
    // dropped. This used to delete every comma, so "12,50" asked for 1,250.00.
    const parsed = parseRequestAmount(amount, state?.currency ?? "", locale);
    if (!parsed.ok) { setCreateError(t(requestAmountMessage(parsed.reason))); return; }
    const amountMinor = parsed.amountMinor;
    setBusy("create");
    setCreateError("");
    try {
      const call = httpsCallable<{ companyId: string; orderId: string; amountMinor: number; purpose: string; clientRequestId: string }, unknown>(
        functions, "createOrderPaymentRequest");
      await call({
        companyId, orderId, amountMinor, purpose,
        // So a retry after a failed write resumes the same request instead of
        // opening a second link for the same money.
        clientRequestId: `${orderId}:${amountMinor}:${purpose}:${Date.now()}`,
      });
      setOpen(false);
      setAmount("");
      await load();
    } catch (e) {
      // The server's own sentence, which names which fix applies.
      setCreateError(t((e as Error).message || "That payment link cannot be created."));
    } finally {
      setBusy("");
    }
  };

  const cancel = async (row: PaymentLinkRow) => {
    setBusy(row.paymentRequestId);
    try {
      const call = httpsCallable<{ companyId: string; paymentRequestId: string }, unknown>(functions, "cancelOrderPaymentRequest");
      await call({ companyId, paymentRequestId: row.paymentRequestId });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  // ---- Refunds from NivaDesk (SL-21, 30 Oct 2026) ----------------------------------------------------------
  // Owner only, and only where the server says so (`canRefund`). The money comes from the business's own Stripe
  // balance and Stripe keeps its fee; the form says both before anything is sent. It does not say the customer
  // will be emailed: whether Stripe emails a refund receipt is the business's own Stripe setting.
  const refunding = busy.startsWith("refund:");
  const openRefund = (row: OrderLinkRow, opener: HTMLButtonElement) => {
    refundOpenerRef.current = opener;
    setRefundFor(row.paymentRequestId);
    // The whole refundable remainder, the way the New payment link form starts at the headroom; editable for a
    // partial refund.
    setRefundAmount(minorToInputText(row.refundableMinor ?? 0, row.currency || state?.currency || "", locale));
    setRefundReason("requested_by_customer");
    setRefundError("");
    setRefundNotice(null);
  };
  const closeRefund = () => {
    if (refunding) return; // the answer is on its way; the form stays until it arrives
    setRefundFor("");
    setRefundError("");
    refundOpenerRef.current?.focus();
  };
  // Focus moves into the form when it opens, onto the amount, so it can be read and changed at once.
  useEffect(() => {
    if (!refundFor) return;
    refundFieldRef.current?.focus();
    refundFieldRef.current?.select();
  }, [refundFor]);

  const refund = async (row: OrderLinkRow) => {
    const rowCurrency = row.currency || state?.currency || "";
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
    const previous = refundAttempt.current;
    const attempt: RefundAttempt = previous
      && previous.paymentRequestId === row.paymentRequestId
      && previous.amountMinor === parsed.amountMinor
      && previous.reason === refundReason
      ? previous
      : { paymentRequestId: row.paymentRequestId, amountMinor: parsed.amountMinor, reason: refundReason, clientRefundId: newClientRefundId() };
    refundAttempt.current = attempt;
    setBusy(`refund:${row.paymentRequestId}`);
    setRefundError("");
    try {
      const result = await refundOrderPayment({
        companyId, orderId,
        paymentRequestId: attempt.paymentRequestId,
        amountMinor: attempt.amountMinor,
        reason: attempt.reason,
        clientRefundId: attempt.clientRefundId,
      });
      refundAttempt.current = null;
      const outcome = refundResult(result.refund.status);
      const amountText = formatMinor(result.refund.amountMinor || attempt.amountMinor, result.refund.currency || rowCurrency);
      setRefundNotice({
        id: row.paymentRequestId,
        tone: outcome.tone,
        text: outcome.tone === "done" ? `${t(outcome.text)} ${amountText}` : t(outcome.text),
      });
      setRefundFor("");
      // The list again: the row's refunded and refundable amounts, and (through the fingerprint above) the order.
      await load();
    } catch (e) {
      const refusal = refundRefusal(e);
      setRefundError(t(refusal.text).replace("{amount}", formatMinor(refusal.refundableMinor ?? most, rowCurrency)));
      // A refusal with a reason is the server's answer about this row as it is now (refunded elsewhere, disputed,
      // less left): read the list again so the row says so too. The form and its sentence stay.
      if (refusal.reason) void load();
    } finally {
      setBusy("");
    }
  };

  const copy = async (row: PaymentLinkRow) => {
    try {
      await navigator.clipboard.writeText(row.url);
      setCopiedId(row.paymentRequestId);
      window.setTimeout(() => setCopiedId(""), 2000);
    } catch {
      // Clipboard refused (insecure context, or the person declined). Showing
      // the link is the fallback that always works.
      setShownId(row.paymentRequestId);
    }
  };

  const purposeLabel = (value: string) =>
    value === "deposit" ? t("Deposit")
      : value === "instalment" ? t("Instalment")
        : value === "remaining_balance" ? t("Remaining balance") : t("Payment");
  const statusLabel = (status: string) =>
    status === "partially_refunded" ? t("Partially refunded") : t(status.charAt(0).toUpperCase() + status.slice(1));

  if (available !== true) return null;
  if (error) {
    return (
      <div ref={rootRef} className="finance-payments-ledger" role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: "#b91c1c" }}>{t(error)}</span>
        <button type="button" className="finance-payments-add" onClick={() => void load()}>{t("Try again")}</button>
      </div>
    );
  }
  if (!state) return null;
  // Every figure below is formatted in the currency the SERVER resolved.
  const currency = state.currency;

  return (
    <div ref={rootRef} className="finance-payments-ledger">
      <div className="finance-payments-head">
        <span className="finance-payments-title">
          {t("Payment links")}
          {state.requests.length > 0 ? <span className="finance-payments-count">{state.requests.length}</span> : null}
        </span>
        {canCreate && state.headroomMinor > 0 ? (
          <button type="button" className="finance-payments-add" onClick={() => { setOpen((value) => !value); setCreateError(""); if (!open && !amount) setAmount(minorToInputText(state.headroomMinor, currency, locale)); }}>
            {open ? t("Close") : `+ ${t("New payment link")}`}
          </button>
        ) : null}
      </div>

      {/* The server's three figures, shown rather than recomputed. */}
      <p style={{ margin: "2px 0 8px", fontSize: 12, opacity: 0.75 }}>
        {t("Still to pay")}: <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatMinor(state.outstandingMinor, currency)}</strong>
        {" · "}
        {t("Not yet asked for")}: <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatMinor(state.headroomMinor, currency)}</strong>
      </p>

      {open ? (
        <div className="finance-payments-form" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "grid", gap: 3, fontSize: 11, opacity: 0.75 }}>
            {t("Purpose")}
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
              <option value="deposit">{t("Deposit")}</option>
              <option value="instalment">{t("Instalment")}</option>
              <option value="remaining_balance">{t("Remaining balance")}</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 3, fontSize: 11, opacity: 0.75 }}>
            {t("Amount")}
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={minorToInputText(0, currency, locale)} style={{ width: 110 }} />
          </label>
          <button type="button" className="finance-payments-add" disabled={busy === "create"} onClick={() => void create()}>
            {busy === "create" ? t("Creating…") : t("Create link")}
          </button>
          {createError ? (
            <p role="alert" style={{ margin: 0, flexBasis: "100%", fontSize: 12, color: "#b91c1c" }}>{createError}</p>
          ) : null}
        </div>
      ) : null}

      {etsyOrder && state.requests.some((row) => row.url && tabForStatus(row.publicStatus) === "open") ? (
        <p data-etsy-compliance="copy-link" style={{ margin: "0 0 6px", fontSize: 12, color: "#b45309" }}>{t(ETSY_COPY_LINK_NOTE)}</p>
      ) : null}

      {state.requests.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>{t("No payment links for this order yet.")}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {[...openRequests, ...settled].map((row) => (
            <li key={row.paymentRequestId} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 12.5 }}>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{formatMinor(row.amountMinor, row.currency || currency)}</span>
              <span style={{ opacity: 0.8 }}>{purposeLabel(row.purpose)}</span>
              <span style={{ opacity: 0.7 }}>{statusLabel(row.publicStatus)}</span>
              {/*
                A test-mode link and a real customer's link are otherwise
                identical on this row. Marked only when the server says the mode
                is not "live", so production rows are untouched and a row that
                carries no mode at all stays unmarked rather than guessed at.
              */}
              {row.mode && row.mode !== "live" ? (
                <span
                  title={t("This link was created on a Stripe test account. No real money moves.")}
                  style={{
                    color: "#b45309",
                    border: "1px solid currentColor",
                    borderRadius: 4,
                    padding: "0 4px",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    textTransform: "uppercase"
                  }}
                >
                  {t("Test")}
                </span>
              ) : null}
              {row.paidAmountMinor > 0 ? (
                <span style={{ opacity: 0.7 }}>{t("Paid")} {formatMinor(row.paidAmountMinor, row.currency || currency)}</span>
              ) : null}
              {row.refundedAmountMinor > 0 ? (
                <span style={{ opacity: 0.7 }}>{t("Refunded")} {formatMinor(row.refundedAmountMinor, row.currency || currency)}</span>
              ) : null}
              {(row.refundPendingMinor ?? 0) > 0 ? (
                <span style={{ color: "#b45309" }} title={t("Refund pending. Stripe will finish this when your Stripe balance allows.")}>
                  {t("Refund pending")} {formatMinor(row.refundPendingMinor ?? 0, row.currency || currency)}
                </span>
              ) : null}
              {row.stale ? (
                <span style={{ color: "#b45309" }}>
                  {row.staleReason === "order_fully_settled" ? t("This order is already settled") : t("More than this order still owes")}
                </span>
              ) : null}
              {row.url && tabForStatus(row.publicStatus) === "open" ? (
                <>
                  <button type="button" className="finance-payments-add" onClick={() => void copy(row)}>
                    {copiedId === row.paymentRequestId ? t("Copied") : t("Copy link")}
                  </button>
                  <button type="button" className="finance-payments-add" onClick={() => setShownId(shownId === row.paymentRequestId ? "" : row.paymentRequestId)}>
                    {shownId === row.paymentRequestId ? t("Hide link") : t("Show link")}
                  </button>
                  {canCreate ? (
                    <button type="button" className="finance-payments-add" disabled={busy === row.paymentRequestId} onClick={() => void cancel(row)}>
                      {busy === row.paymentRequestId ? t("Cancelling…") : t("Cancel")}
                    </button>
                  ) : null}
                </>
              ) : null}
              {/* A settled row, and only when the server says THIS person may refund it now (an older server sends
                  no canRefund, so no button). Banking's list stays read-only. */}
              {tabForStatus(row.publicStatus) !== "open" && row.canRefund === true && (row.refundableMinor ?? 0) > 0 ? (
                <button
                  type="button"
                  className="finance-payments-add"
                  aria-expanded={refundFor === row.paymentRequestId}
                  aria-controls={`refund-form-${row.paymentRequestId}`}
                  disabled={busy !== ""}
                  onClick={(e) => (refundFor === row.paymentRequestId ? closeRefund() : openRefund(row, e.currentTarget))}
                >
                  {t("Refund payment")}
                </button>
              ) : null}
              {refundNotice && refundNotice.id === row.paymentRequestId ? (
                <span role="status" style={{ flexBasis: "100%", fontSize: 12, color: refundNotice.tone === "done" ? "#047857" : "#b45309" }}>
                  {refundNotice.text}
                </span>
              ) : null}
              {refundFor === row.paymentRequestId ? (() => {
                const rowCurrency = row.currency || currency;
                const formId = `refund-form-${row.paymentRequestId}`;
                const typed = parseRequestAmount(refundAmount, rowCurrency, locale);
                return (
                  <div
                    id={formId}
                    role="dialog"
                    aria-labelledby={`${formId}-title`}
                    aria-describedby={`${formId}-terms`}
                    className="finance-payments-form"
                    onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeRefund(); } }}
                    style={{ flexBasis: "100%", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}
                  >
                    <strong id={`${formId}-title`} style={{ flexBasis: "100%", fontSize: 12.5 }}>{t("Refund this payment")}</strong>
                    <label style={{ display: "grid", gap: 3, fontSize: 11, opacity: 0.75 }}>
                      {t("Amount to refund")}
                      <input
                        ref={refundFieldRef}
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        inputMode="decimal"
                        disabled={refunding}
                        aria-describedby={`${formId}-most`}
                        placeholder={minorToInputText(0, rowCurrency, locale)}
                        style={{ width: 110 }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 3, fontSize: 11, opacity: 0.75 }}>
                      {t("Reason")}
                      <select value={refundReason} disabled={refunding} onChange={(e) => setRefundReason(e.target.value === "duplicate" ? "duplicate" : "requested_by_customer")}>
                        <option value="requested_by_customer">{t("Customer asked for a refund")}</option>
                        <option value="duplicate">{t("Duplicate payment")}</option>
                      </select>
                    </label>
                    <span id={`${formId}-most`} style={{ fontSize: 11, opacity: 0.75, alignSelf: "center" }}>
                      {t("Up to {amount}").replace("{amount}", formatMinor(row.refundableMinor ?? 0, rowCurrency))}
                    </span>
                    <p id={`${formId}-terms`} style={{ margin: 0, flexBasis: "100%", fontSize: 12 }}>
                      {t("A refund cannot be undone. The money comes from your Stripe balance, and Stripe keeps its processing fee.")}
                    </p>
                    <button type="button" className="finance-payments-add" disabled={refunding} onClick={() => void refund(row)}>
                      {refunding
                        ? t("Refunding…")
                        : typed.ok ? t("Refund {amount}").replace("{amount}", formatMinor(typed.amountMinor, rowCurrency)) : t("Refund payment")}
                    </button>
                    <button type="button" className="finance-payments-add" disabled={refunding} onClick={closeRefund}>{t("Close")}</button>
                    {refundError ? (
                      <p role="alert" style={{ margin: 0, flexBasis: "100%", fontSize: 12, color: "#b91c1c" }}>{refundError}</p>
                    ) : null}
                  </div>
                );
              })() : null}
              {etsyOrder && copiedId === row.paymentRequestId ? (
                <span role="status" data-etsy-compliance="copied" style={{ flexBasis: "100%", fontSize: 11.5, color: "#b45309" }}>{t(ETSY_COPY_LINK_NOTE)}</span>
              ) : null}
              {shownId === row.paymentRequestId && row.url ? (
                <span style={{ flexBasis: "100%", wordBreak: "break-all", fontSize: 11.5, opacity: 0.8 }}>{row.url}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

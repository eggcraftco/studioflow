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

type ListResult = {
  ok: boolean;
  /** The ISO code the server would charge in; "" when the workspace has not
   *  settled an ambiguous symbol. Never derived here. */
  currency: string;
  outstandingMinor: number;
  headroomMinor: number;
  requests: PaymentLinkRow[];
};

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
}: {
  companyId: string;
  orderId: string;
  t: (text: string) => string;
  /** Whether this person may ask a customer for money. The server checks again. */
  canCreate: boolean;
}) {
  const [state, setState] = useState<ListResult | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("remaining_balance");
  const [createError, setCreateError] = useState("");
  const [busy, setBusy] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [shownId, setShownId] = useState("");
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!companyId || !orderId) return;
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
  }, [companyId, orderId]);

  useEffect(() => { void load(); }, [load]);

  const openRequests = useMemo(
    () => (state?.requests ?? []).filter((row) => tabForStatus(row.publicStatus) === "open"),
    [state]
  );
  const settled = useMemo(
    () => (state?.requests ?? []).filter((row) => tabForStatus(row.publicStatus) !== "open"),
    [state]
  );

  const create = async () => {
    const text = amount.trim().replace(/,/g, "");
    if (!/^\d+(\.\d{0,2})?$/.test(text) || Number(text) <= 0) { setCreateError(t("Enter an amount above zero.")); return; }
    const [whole, fraction = ""] = text.split(".");
    // From the TEXT, never by multiplying a float: 19.99 * 100 is
    // 1998.9999999999998 and this is the last stop before a server that
    // charges what it is given.
    const amountMinor = Number(`${whole}${(fraction + "00").slice(0, 2)}`);
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
      setCreateError((e as Error).message || t("That payment link cannot be created."));
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

  if (error) {
    return (
      <div className="finance-payments-ledger" role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: "#b91c1c" }}>{t(error)}</span>
        <button type="button" className="finance-payments-add" onClick={() => void load()}>{t("Try again")}</button>
      </div>
    );
  }
  if (!state) return null;
  // Every figure below is formatted in the currency the SERVER resolved.
  const currency = state.currency;

  return (
    <div className="finance-payments-ledger">
      <div className="finance-payments-head">
        <span className="finance-payments-title">
          {t("Payment links")}
          {state.requests.length > 0 ? <span className="finance-payments-count">{state.requests.length}</span> : null}
        </span>
        {canCreate && state.headroomMinor > 0 ? (
          <button type="button" className="finance-payments-add" onClick={() => { setOpen((value) => !value); setCreateError(""); if (!open && !amount) setAmount(formatMinor(state.headroomMinor, currency).replace(/[^\d.]/g, "")); }}>
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
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" style={{ width: 110 }} />
          </label>
          <button type="button" className="finance-payments-add" disabled={busy === "create"} onClick={() => void create()}>
            {busy === "create" ? t("Creating…") : t("Create link")}
          </button>
          {createError ? (
            <p role="alert" style={{ margin: 0, flexBasis: "100%", fontSize: 12, color: "#b91c1c" }}>{createError}</p>
          ) : null}
        </div>
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
              {row.paidAmountMinor > 0 ? (
                <span style={{ opacity: 0.7 }}>{t("Paid")} {formatMinor(row.paidAmountMinor, row.currency || currency)}</span>
              ) : null}
              {row.refundedAmountMinor > 0 ? (
                <span style={{ opacity: 0.7 }}>{t("Refunded")} {formatMinor(row.refundedAmountMinor, row.currency || currency)}</span>
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

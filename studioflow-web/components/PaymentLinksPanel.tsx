"use client";

/**
 * Banking → Payment Links.
 *
 * Every card payment link this workspace has asked a customer for, in one
 * place. The tabs are the plan's (§4.2) and they are the states the reducer
 * actually produces, so a row can never fall between them.
 *
 * Two deliberate refusals, both about not lying to the workspace:
 *
 *   - the raw Stripe URL is not printed in the list. It is a live payment page
 *     for somebody else's money; it is copied on request and shown on request,
 *     and the row otherwise identifies the link by the order it belongs to.
 *   - a link the order can no longer justify is marked, with the excess named
 *     in money. The link keeps working — it is in the customer's inbox and the
 *     page is Stripe's — so pretending we cancelled it would be worse than
 *     saying plainly that it is now too big.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export type PaymentLinkRow = {
  paymentRequestId: string;
  orderId: string;
  purpose: string;
  amountMinor: number;
  currency: string;
  publicStatus: string;
  url: string;
  createdAtMs: number;
  paidAtMs: number;
  expiresAtMs: number;
  paidAmountMinor: number;
  refundedAmountMinor: number;
  createdByUid: string;
  stale?: boolean;
  staleReason?: string;
  excessMinor?: number;
  overpaidMinor?: number;
};

type Tab = "open" | "paid" | "expired" | "cancelled" | "problem" | "all";

/** Which tab a status belongs to. Every status the reducer can produce is here. */
export function tabForStatus(status: string): Exclude<Tab, "all"> {
  switch (status) {
    case "draft":
    case "open":
    case "processing":
      return "open";
    case "paid":
      return "paid";
    case "expired":
      return "expired";
    case "cancelled":
      return "cancelled";
    case "refunded":
    case "partially_refunded":
    case "disputed":
      return "problem";
    default:
      // A status nobody has written a tab for still has to be reachable, and
      // "open" is the tab a workspace looks at — better seen than filed away.
      return "open";
  }
}

const ZERO_DECIMAL = new Set(["JPY"]);

/** Minor units to a readable amount. Mirrors functions/payments/money.js. */
export function formatMinor(amountMinor: number, currency: string): string {
  const code = String(currency || "").toUpperCase();
  const digits = ZERO_DECIMAL.has(code) ? 0 : 2;
  const value = amountMinor / (digits === 0 ? 1 : 100);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${code}`;
  }
}

/**
 * What to put in front of a person when the read fails.
 *
 * The first version printed `(e as Error).message`, which for a callable is the
 * raw Firebase code — the screen said "internal". A code is not something
 * anybody can act on, so the two cases a workspace can actually do something
 * about get their own sentence and everything else gets an honest generic one.
 */
function messageForError(error: unknown): string {
  const code = String((error as { code?: string })?.code || "");
  const raw = String((error as Error)?.message || "");
  if (/permission-denied/.test(code) || /permission/i.test(raw)) {
    return "Your workspace access does not include financial information.";
  }
  if (/unauthenticated/.test(code)) return "Sign in again to see payment links.";
  if (/unavailable|deadline-exceeded/.test(code) || /fetch|network/i.test(raw)) {
    return "Payment links could not be loaded. Check your connection and try again.";
  }
  return "Payment links could not be loaded.";
}

export default function PaymentLinksPanel({
  companyId,
  t,
  onOpenOrder,
  orders,
}: {
  companyId: string;
  t: (text: string) => string;
  onOpenOrder?: (orderId: string) => void;
  /** The workspace's orders, for the picker. null while they are still loading. */
  orders?: { id: string; customerName: string; designName: string }[] | null;
}) {
  const [rows, setRows] = useState<PaymentLinkRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("open");
  const [busyId, setBusyId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createOrderId, setCreateOrderId] = useState("");
  const [createAmount, setCreateAmount] = useState("");
  const [createPurpose, setCreatePurpose] = useState("remaining_balance");
  const [createError, setCreateError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [shownId, setShownId] = useState("");

  // Which load is the newest. Two can be in flight at once — React remounts the
  // panel on a tab switch, and Strict Mode runs the effect twice in development
  // — and without this the LOSER decides what the screen says. A failure that
  // resolves after a success left the error banner up over a table full of
  // rows, which is a screen telling the workspace two contradictory things.
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!companyId) return;
    const ticket = ++latest.current;
    setError("");
    try {
      const call = httpsCallable<{ companyId: string }, { requests: PaymentLinkRow[]; truncated: boolean }>(
        functions, "listWorkspacePaymentRequests");
      const response = await call({ companyId });
      if (ticket !== latest.current) return;
      setRows(response.data?.requests ?? []);
      setTruncated(response.data?.truncated === true);
      // A success clears whatever the last failure said. Leaving it up is how a
      // recovered screen keeps apologising.
      setError("");
    } catch (e) {
      if (ticket !== latest.current) return;
      // A refused read is not an empty list. An empty list says "you have never
      // asked anyone to pay"; this says we could not find out — so the rows
      // stay UNKNOWN (null) and the empty state does not render underneath the
      // error, which is what the first version did: it told the workspace both
      // "something went wrong" and "you have no payment links", and only one of
      // those was true.
      setRows(null);
      setError(messageForError(e));
    }
  }, [companyId, t]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { open: 0, paid: 0, expired: 0, cancelled: 0, problem: 0, all: 0 };
    for (const row of rows ?? []) { out[tabForStatus(row.publicStatus)] += 1; out.all += 1; }
    return out;
  }, [rows]);

  const visible = useMemo(
    () => (rows ?? []).filter((row) => tab === "all" || tabForStatus(row.publicStatus) === tab),
    [rows, tab]
  );

  /**
   * Ask a customer to pay.
   *
   * The amount is typed as money and sent as MINOR UNITS, converted from the
   * text rather than by multiplying a float: 19.99 * 100 is 1998.9999999999998,
   * and this is the last place before a server that will happily charge what it
   * is given. The server checks it again — this is a convenience, not the
   * guard.
   */
  const create = async () => {
    const text = createAmount.trim().replace(/,/g, "");
    if (!createOrderId) { setCreateError(t("Choose an order.")); return; }
    if (!/^\d+(\.\d{0,2})?$/.test(text) || Number(text) <= 0) { setCreateError(t("Enter an amount above zero.")); return; }
    const [whole, fraction = ""] = text.split(".");
    const amountMinor = Number(`${whole}${(fraction + "00").slice(0, 2)}`);
    setCreating(true);
    setCreateError("");
    try {
      const call = httpsCallable<
        { companyId: string; orderId: string; amountMinor: number; purpose: string; clientRequestId: string },
        unknown
      >(functions, "createOrderPaymentRequest");
      await call({
        companyId, orderId: createOrderId, amountMinor, purpose: createPurpose,
        // Sent so a retry after a failed WRITE cannot open a second link for
        // the same money — the server resumes the same request.
        clientRequestId: `${createOrderId}:${amountMinor}:${createPurpose}:${Date.now()}`,
      });
      setCreateOpen(false);
      setCreateAmount("");
      await load();
    } catch (e) {
      // The server's own sentence, which names which fix applies — reduce this
      // link, or cancel the one already open.
      setCreateError((e as Error).message || t("That payment link cannot be created."));
    } finally {
      setCreating(false);
    }
  };

  const cancel = async (row: PaymentLinkRow) => {
    setBusyId(row.paymentRequestId);
    try {
      const call = httpsCallable<{ companyId: string; paymentRequestId: string }, unknown>(functions, "cancelOrderPaymentRequest");
      await call({ companyId, paymentRequestId: row.paymentRequestId });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId("");
    }
  };

  const copy = async (row: PaymentLinkRow) => {
    try {
      await navigator.clipboard.writeText(row.url);
      setCopiedId(row.paymentRequestId);
      window.setTimeout(() => setCopiedId(""), 2000);
    } catch {
      // Clipboard refused (an insecure context, or the user declined). Showing
      // the link is the fallback that always works.
      setShownId(row.paymentRequestId);
    }
  };

  const purposeLabel = (purpose: string) =>
    purpose === "deposit" ? t("Deposit")
      : purpose === "instalment" ? t("Instalment")
        : purpose === "remaining_balance" ? t("Remaining balance")
          : t("Payment");

  const statusLabel = (status: string) =>
    status === "partially_refunded" ? t("Partially refunded") : t(status.charAt(0).toUpperCase() + status.slice(1));

  const TABS: [Tab, string][] = [
    ["open", t("Open")],
    ["paid", t("Paid")],
    ["expired", t("Expired")],
    ["cancelled", t("Cancelled")],
    ["problem", t("Refunded / Disputed")],
    ["all", t("All")],
  ];

  const field: React.CSSProperties = {
    border: "1px solid rgba(120,120,140,0.35)", borderRadius: 8, padding: "7px 10px",
    font: "inherit", fontSize: 13, background: "transparent", color: "inherit", minWidth: 0,
  };

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button" onClick={() => { setCreateOpen((open) => !open); setCreateError(""); }}
          style={{ border: 0, borderRadius: 8, background: "#2563eb", color: "#fff", cursor: "pointer",
            font: "inherit", fontSize: 13, fontWeight: 700, padding: "8px 14px" }}
        >
          {createOpen ? t("Close") : t("New payment link")}
        </button>
      </div>

      {createOpen ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start",
          border: "1px solid rgba(120,120,140,0.22)", borderRadius: 10, padding: 12 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 11.5, opacity: 0.75 }}>
            {t("Order")}
            <select value={createOrderId} onChange={(e) => setCreateOrderId(e.target.value)} style={{ ...field, minWidth: 200 }}>
              <option value="">{orders === null ? t("Loading…") : t("Choose an order.")}</option>
              {(orders ?? []).map((order) => (
                <option key={order.id} value={order.id}>
                  {[order.customerName, order.designName].filter(Boolean).join(" — ") || order.id}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 11.5, opacity: 0.75 }}>
            {t("Purpose")}
            <select value={createPurpose} onChange={(e) => setCreatePurpose(e.target.value)} style={field}>
              <option value="deposit">{t("Deposit")}</option>
              <option value="instalment">{t("Instalment")}</option>
              <option value="remaining_balance">{t("Remaining balance")}</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 11.5, opacity: 0.75 }}>
            {t("Amount")}
            {/* inputMode decimal, so a phone shows the number pad. */}
            <input
              value={createAmount} onChange={(e) => setCreateAmount(e.target.value)}
              inputMode="decimal" placeholder="0.00" style={{ ...field, width: 110 }}
            />
          </label>
          <button
            type="button" disabled={creating} onClick={() => void create()}
            style={{ alignSelf: "end", border: 0, borderRadius: 8, background: "#2563eb", color: "#fff",
              cursor: creating ? "default" : "pointer", font: "inherit", fontSize: 13, fontWeight: 700,
              padding: "8px 14px", opacity: creating ? 0.6 : 1 }}
          >
            {creating ? t("Creating…") : t("Create link")}
          </button>
          {createError ? (
            <p role="alert" style={{ margin: 0, flexBasis: "100%", fontSize: 12.5, color: "#b91c1c" }}>{createError}</p>
          ) : null}
        </div>
      ) : null}

      <div role="tablist" aria-label={t("Payment link states")} style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {TABS.map(([key, label]) => (
          <button
            key={key} type="button" role="tab" aria-selected={tab === key}
            onClick={() => setTab(key)}
            style={{
              border: 0, background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 700,
              padding: "8px 12px", marginBottom: -1,
              color: tab === key ? "#2563eb" : "inherit",
              borderBottom: tab === key ? "2px solid #2563eb" : "2px solid transparent",
            }}
          >
            {/* No count until the rows are known. "(0)" beside a failed read
                is the same lie the empty state was. */}
            {label}{rows ? ` (${counts[key] ?? 0})` : ""}
          </button>
        ))}
      </div>

      {error ? (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>{t(error)}</p>
          {/* Reloading the page was the only way back. A read that failed once
              is exactly the kind that succeeds on the second try. */}
          <button
            type="button" onClick={() => void load()}
            style={{ border: "1px solid rgba(120,120,140,0.35)", borderRadius: 7, background: "transparent",
              cursor: "pointer", font: "inherit", fontSize: 12.5, fontWeight: 700, padding: "4px 12px" }}
          >
            {t("Try again")}
          </button>
        </div>
      ) : null}

      {rows === null ? (
        // Unknown, for either reason: still loading, or the read failed. When
        // it failed the error block above is already saying so, and saying
        // "Loading…" underneath it would contradict it.
        error ? null : <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>{t("Loading…")}</p>
      ) : visible.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
          {tab === "open" ? t("No payment links are waiting to be paid.") : t("Nothing here yet.")}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.65 }}>
                <th style={{ padding: "6px 10px 6px 0", fontWeight: 600 }}>{t("Order")}</th>
                <th style={{ padding: "6px 10px", fontWeight: 600 }}>{t("Purpose")}</th>
                <th style={{ padding: "6px 10px", fontWeight: 600, textAlign: "right" }}>{t("Amount")}</th>
                <th style={{ padding: "6px 10px", fontWeight: 600, textAlign: "right" }}>{t("Paid")}</th>
                <th style={{ padding: "6px 10px", fontWeight: 600 }}>{t("Status")}</th>
                <th style={{ padding: "6px 10px", fontWeight: 600 }}>{t("Created")}</th>
                <th style={{ padding: "6px 0 6px 10px", fontWeight: 600 }} />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.paymentRequestId} style={{ borderTop: "1px solid rgba(120,120,140,0.18)" }}>
                  <td style={{ padding: "9px 10px 9px 0", fontVariantNumeric: "tabular-nums" }}>
                    {onOpenOrder ? (
                      <button type="button" onClick={() => onOpenOrder(row.orderId)}
                        style={{ border: 0, background: "transparent", color: "#2563eb", cursor: "pointer", padding: 0, font: "inherit" }}>
                        {row.orderId}
                      </button>
                    ) : row.orderId}
                  </td>
                  <td style={{ padding: "9px 10px" }}>{purposeLabel(row.purpose)}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatMinor(row.amountMinor, row.currency)}
                  </td>
                  <td style={{ padding: "9px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {row.paidAmountMinor > 0 ? formatMinor(row.paidAmountMinor, row.currency) : "—"}
                    {row.refundedAmountMinor > 0 ? (
                      <div style={{ fontSize: 11.5, opacity: 0.7 }}>
                        {t("Refunded")} {formatMinor(row.refundedAmountMinor, row.currency)}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: "9px 10px" }}>
                    {statusLabel(row.publicStatus)}
                    {row.stale ? (
                      <div style={{ fontSize: 11.5, color: "#b45309" }}>
                        {row.staleReason === "order_fully_settled"
                          ? t("This order is already settled")
                          : t("More than this order still owes")}
                        {row.excessMinor ? ` · ${formatMinor(row.excessMinor, row.currency)}` : ""}
                      </div>
                    ) : null}
                    {row.overpaidMinor ? (
                      <div style={{ fontSize: 11.5, color: "#b45309" }}>
                        {t("Overpaid")} {formatMinor(row.overpaidMinor, row.currency)}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {row.createdAtMs ? new Date(row.createdAtMs).toLocaleDateString() : "—"}
                    {row.expiresAtMs ? (
                      <div style={{ fontSize: 11.5, opacity: 0.7 }}>
                        {t("Expires")} {new Date(row.expiresAtMs).toLocaleDateString()}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: "9px 0 9px 10px", whiteSpace: "nowrap", textAlign: "right" }}>
                    {row.url && tabForStatus(row.publicStatus) === "open" ? (
                      <>
                        <button type="button" onClick={() => void copy(row)}
                          style={{ border: 0, background: "transparent", color: "#2563eb", cursor: "pointer", padding: "2px 6px", font: "inherit" }}>
                          {copiedId === row.paymentRequestId ? t("Copied") : t("Copy link")}
                        </button>
                        <button type="button" onClick={() => setShownId(shownId === row.paymentRequestId ? "" : row.paymentRequestId)}
                          style={{ border: 0, background: "transparent", color: "#2563eb", cursor: "pointer", padding: "2px 6px", font: "inherit" }}>
                          {shownId === row.paymentRequestId ? t("Hide link") : t("Show link")}
                        </button>
                        <button type="button" disabled={busyId === row.paymentRequestId} onClick={() => void cancel(row)}
                          style={{ border: 0, background: "transparent", color: "#b91c1c", cursor: "pointer", padding: "2px 6px", font: "inherit" }}>
                          {busyId === row.paymentRequestId ? t("Cancelling…") : t("Cancel")}
                        </button>
                      </>
                    ) : null}
                    {shownId === row.paymentRequestId && row.url ? (
                      <div style={{ marginTop: 6, textAlign: "left", wordBreak: "break-all", fontSize: 11.5, opacity: 0.8 }}>{row.url}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {truncated ? (
        <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
          {t("Only the most recent payment links are shown.")}
        </p>
      ) : null}
    </section>
  );
}

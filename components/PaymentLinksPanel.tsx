"use client";

/**
 * Banking → Payment Links.
 *
 * Every card payment link this workspace has asked a customer for, in one
 * place. The tabs are the plan's (§4.2) and they are the states the reducer
 * actually produces, so a row can never fall between them.
 *
 * Refunds are made here too (31 Oct 2026), and only here: a paid row the server says this person may refund
 * (`canRefund`) has a "Refund…" action that opens RefundPaymentDialog under the row. It used to be a button on
 * the order's Finance card, one press from a refund by mistake; the card now points to this tab.
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
import { minorToInputText, parseRequestAmount, requestAmountMessage } from "@/lib/studioflow/money";
import { ETSY_COPY_LINK_NOTE, isEtsyOrderId } from "@/lib/studioflow/etsyOrder";
import {
  createStandalonePaymentRequest, isStandaloneRow, newClientRequestId, orderLinkRefusalText, orderReferenceOfRow,
  paymentLinkRefusal, standaloneFormProblem, STANDALONE_TITLE_MAX, type PaymentRequestRefundFields,
} from "@/lib/studioflow/stripeConnect";
import RefundPaymentDialog, { type RefundAttempt, type RefundNotice } from "@/components/RefundPaymentDialog";
import { usePaymentLinksPlan } from "@/lib/studioflow/usePaymentLinksAvailable";
import { loadWorkspaceSettingsOverview } from "@/lib/studioflow/firestore";
import { workspaceCurrencyCodes } from "@/lib/studioflow/orderCurrency";

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
  /**
   * Which Stripe reality this link belongs to — "test" or "live".
   *
   * Optional, like the four fields above it, because a row written before the
   * server sent this field must still render exactly as it did before rather
   * than claim a mode nobody recorded. An absent mode is shown unmarked, which
   * is the safe direction: unmarked-and-live is correct, and unmarked-and-test
   * is no worse than every row looked yesterday.
   */
  mode?: string;
  /**
   * Order-less links (SL-24, 30 Oct 2026). Optional for the same reason: an older server sends none, and every
   * row is then an order's row. `kind: "standalone"` was made without an order, `title` says what it is for,
   * and once it is paid the server opens the order and fills `orderId` (and, when it sends them, the order's
   * number as `projectNumber` / `orderReference`).
   */
  kind?: "order" | "standalone";
  title?: string;
  projectNumber?: number;
  orderReference?: string;
};

/** One order-less submit. Retried as it is, it keeps its id, so the server makes one link. */
type StandaloneSubmit = {
  title: string;
  amountMinor: number;
  customerName: string;
  customerEmail: string;
  collectPhone: boolean;
  collectAddress: boolean;
};
type StandaloneAttempt = StandaloneSubmit & { clientRequestId: string };

function sameStandaloneSubmit(a: StandaloneSubmit, b: StandaloneSubmit): boolean {
  return a.title === b.title && a.amountMinor === b.amountMinor && a.customerName === b.customerName
    && a.customerEmail === b.customerEmail && a.collectPhone === b.collectPhone && a.collectAddress === b.collectAddress;
}

/** A row as this list reads it: the shared fields, plus what the server says about refunding it (SL-22). */
type ListedRow = PaymentLinkRow & PaymentRequestRefundFields;

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
  locale,
}: {
  companyId: string;
  t: (text: string) => string;
  /** The person's locale tag, for the amount field's own decimal mark. */
  locale: string;
  onOpenOrder?: (orderId: string) => void;
  /** The workspace's orders, for the picker. null while they are still loading. */
  orders?: { id: string; customerName: string; designName: string }[] | null;
}) {
  const [rows, setRows] = useState<ListedRow[] | null>(null);
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
  // SL-23: the plan's answer (same read as the pilot gate). Exactly false (Free): no "New payment link" here;
  // exactly true: the server has order-less links too (SL-24 ships with the plan answer); null: as before.
  const planAllowed = usePaymentLinksPlan(companyId);
  // Order-less links (SL-24): the form, its one attempt, and the workspace's currency for reading the amount.
  const [standaloneOpen, setStandaloneOpen] = useState(false);
  const [standaloneTitle, setStandaloneTitle] = useState("");
  const [standaloneAmount, setStandaloneAmount] = useState("");
  const [standaloneName, setStandaloneName] = useState("");
  const [standaloneEmail, setStandaloneEmail] = useState("");
  const [standalonePhone, setStandalonePhone] = useState(false);
  const [standaloneAddress, setStandaloneAddress] = useState(false);
  const [standaloneError, setStandaloneError] = useState("");
  const [standaloneBusy, setStandaloneBusy] = useState(false);
  const [standaloneNotice, setStandaloneNotice] = useState("");
  /** The workspace's ISO code when its symbol means exactly one; "" when not; null until read. */
  const [standaloneCurrency, setStandaloneCurrency] = useState<string | null>(null);
  const standaloneAttempt = useRef<StandaloneAttempt | null>(null);
  const standaloneFieldRef = useRef<HTMLInputElement | null>(null);
  const standaloneOpenerRef = useRef<HTMLButtonElement | null>(null);
  // Refunds (SL-21; here since 31 Oct 2026): one refund form at a time, under its own row. The last submit is kept
  // here rather than in the form, so closing and reopening it cannot turn a retry into a second refund.
  const [refundFor, setRefundFor] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [refundNotice, setRefundNotice] = useState<(RefundNotice & { id: string }) | null>(null);
  const refundAttempt = useRef<RefundAttempt | null>(null);
  const refundOpenerRef = useRef<HTMLButtonElement | null>(null);

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
      const call = httpsCallable<{ companyId: string }, { requests: ListedRow[]; truncated: boolean }>(
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

  // A refunded row leaves the Paid tab (it is "Partially refunded" or "Refunded" now). Until the tab changes it
  // stays where the person refunded it, with what Stripe made of the refund under it.
  const visible = useMemo(
    () => (rows ?? []).filter((row) => tab === "all" || tabForStatus(row.publicStatus) === tab
      || row.paymentRequestId === refundNotice?.id),
    [rows, tab, refundNotice]
  );

  // A refund Stripe holds as pending (the balance cannot cover it yet) finishes, or fails, through the webhook:
  // while one is waiting the list is read again every 15 seconds the tab is visible, so the row follows it.
  const refundWaiting = useMemo(() => (rows ?? []).some((row) => (row.refundPendingMinor ?? 0) > 0), [rows]);
  useEffect(() => {
    if (!refundWaiting || typeof document === "undefined") return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => window.clearInterval(timer);
  }, [refundWaiting, load]);

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
    if (!createOrderId) { setCreateError(t("Choose an order.")); return; }
    setCreating(true);
    setCreateError("");
    // The minor unit depends on the currency the server will charge in (a yen
    // has none), and that is the ORDER's workspace currency as the server
    // resolves it — so ask the server before reading the amount. This used to
    // delete every comma and assume two decimals: "12,50" became 1,250.00, and
    // a yen amount was a hundred times too large.
    let currency = "";
    try {
      const info = httpsCallable<{ companyId: string; orderId: string }, { currency?: string }>(functions, "listOrderPaymentRequests");
      currency = String((await info({ companyId, orderId: createOrderId })).data?.currency ?? "");
    } catch (e) {
      setCreateError(t(messageForError(e)));
      setCreating(false);
      return;
    }
    const parsed = parseRequestAmount(createAmount, currency, locale);
    if (!parsed.ok) { setCreateError(t(requestAmountMessage(parsed.reason))); setCreating(false); return; }
    const amountMinor = parsed.amountMinor;
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
      // link, or cancel the one already open. The plan refusal (SL-23) has its own.
      setCreateError(t(orderLinkRefusalText(e)));
    } finally {
      setCreating(false);
    }
  };

  // ---- Order-less links (SL-24, 30 Oct 2026) ------------------------------------------------------------------
  // Ask for money without an order: what it is for, the amount, optionally who pays, and whether Stripe asks for a
  // phone number and a delivery address. When the customer pays, the server opens the order with what they typed.
  // Nothing here messages the customer: the link is copied by a person who decides where it goes.

  // The amount is read in the workspace's currency (the server charges in it, as for an order's link): a symbol
  // that means one ISO code gives that code's decimals (a JPY workspace has none); one that means several (¥ is
  // JPY or CNY), or none, reads with two, and the server refuses an ambiguous currency rather than guessing.
  useEffect(() => {
    if (!standaloneOpen || standaloneCurrency !== null || !companyId) return;
    let active = true;
    loadWorkspaceSettingsOverview(companyId)
      .then((overview) => {
        const codes = workspaceCurrencyCodes({ selectedCurrency: overview.selectedCurrency });
        if (active) setStandaloneCurrency(codes.length === 1 ? codes[0] : "");
      })
      .catch(() => { if (active) setStandaloneCurrency(""); });
    return () => { active = false; };
  }, [standaloneOpen, standaloneCurrency, companyId]);

  // Focus moves into the form when it opens, onto what the payment is for.
  useEffect(() => {
    if (standaloneOpen) standaloneFieldRef.current?.focus();
  }, [standaloneOpen]);

  const openStandalone = () => {
    setCreateOpen(false);
    setStandaloneError("");
    setStandaloneNotice("");
    setStandaloneOpen(true);
  };
  const closeStandalone = () => {
    if (standaloneBusy) return; // the answer is on its way; the form stays until it arrives
    setStandaloneOpen(false);
    setStandaloneError("");
    standaloneOpenerRef.current?.focus();
  };

  const createStandalone = async () => {
    const problem = standaloneFormProblem({ title: standaloneTitle, customerEmail: standaloneEmail });
    if (problem) { setStandaloneError(t(problem)); return; }
    // Read exactly as the order link form reads an amount: "12,50" is 12.50 in every locale, and an amount that
    // could mean two things is refused rather than guessed.
    const parsed = parseRequestAmount(standaloneAmount, standaloneCurrency ?? "", locale);
    if (!parsed.ok) { setStandaloneError(t(requestAmountMessage(parsed.reason))); return; }
    const submit: StandaloneSubmit = {
      title: standaloneTitle.trim(),
      amountMinor: parsed.amountMinor,
      customerName: standaloneName.trim(),
      customerEmail: standaloneEmail.trim(),
      collectPhone: standalonePhone,
      collectAddress: standaloneAddress,
    };
    // The same submit, retried (the answer was lost), keeps its id, so it is one link however many times it is
    // sent. Anything changed is a different link and gets a new id.
    const previous = standaloneAttempt.current;
    const attempt: StandaloneAttempt = previous && sameStandaloneSubmit(previous, submit)
      ? previous
      : { ...submit, clientRequestId: newClientRequestId() };
    standaloneAttempt.current = attempt;
    setStandaloneBusy(true);
    setStandaloneError("");
    try {
      const result = await createStandalonePaymentRequest({
        companyId,
        title: attempt.title,
        amountMinor: attempt.amountMinor,
        customerName: attempt.customerName,
        customerEmail: attempt.customerEmail,
        collectPhone: attempt.collectPhone,
        collectAddress: attempt.collectAddress,
        clientRequestId: attempt.clientRequestId,
      });
      if (!result.ok) throw Object.assign(new Error(""), { code: "functions/unknown" });
      standaloneAttempt.current = null;
      setStandaloneOpen(false);
      setStandaloneTitle(""); setStandaloneAmount(""); setStandaloneName(""); setStandaloneEmail("");
      setStandalonePhone(false); setStandaloneAddress(false);
      setStandaloneNotice(t("Payment link created. Copy it and send it to your customer."));
      // The new link, shown under its row, on the tab it lives in.
      setTab("open");
      setShownId(String(result.request?.paymentRequestId ?? ""));
      await load();
    } catch (e) {
      const refusal = paymentLinkRefusal(e);
      // A definite answer (the server read this submit and said no): the next submit is a new link. A lost
      // answer, or one the server marks retry, keeps the id, so trying again cannot make a second link.
      if (refusal.definite) standaloneAttempt.current = null;
      setStandaloneError(t(refusal.text));
    } finally {
      setStandaloneBusy(false);
    }
  };

  /** "Order #1042" once the paid link has opened its order; "Open order" when the row names no number. */
  const orderLinkLabel = (row: PaymentLinkRow) => {
    const reference = orderReferenceOfRow(row);
    return reference ? t("Order {reference}").replace("{reference}", reference) : t("Open order");
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

  // ---- Refunds (SL-21 / SL-22; moved here from the order card, 31 Oct 2026) -------------------------------------
  // The form, its checks and the call are RefundPaymentDialog's; this list decides which rows offer it (only where
  // the server says canRefund), keeps the last submit, and reads itself again once the server has answered.
  const openRefund = (row: ListedRow, opener: HTMLButtonElement) => {
    refundOpenerRef.current = opener;
    setRefundNotice(null);
    setRefundFor(row.paymentRequestId);
  };
  const closeRefund = () => {
    if (refunding) return; // the answer is on its way; the form stays until it arrives
    setRefundFor("");
    refundOpenerRef.current?.focus();
  };
  const refunded = async (row: ListedRow, notice: RefundNotice) => {
    setRefundNotice({ ...notice, id: row.paymentRequestId });
    setRefundFor("");
    // The list again: the row's refunded and refundable amounts, and its new status.
    await load();
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
      {planAllowed === false ? (
        // Free (SL-23): no new links. The ones already sent stay below, and can still be copied and cancelled.
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          {t("Stripe payments are part of the paid plans.")}{" "}
          <a href="/settings?section=plan-access" style={{ color: "#2563eb", fontWeight: 700 }}>{t("See plans")}</a>
        </p>
      ) : planAllowed === true ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button" ref={standaloneOpenerRef}
            aria-expanded={standaloneOpen} aria-controls="standalone-link-form"
            onClick={() => (standaloneOpen ? closeStandalone() : openStandalone())}
            style={{ border: 0, borderRadius: 8, background: "#2563eb", color: "#fff", cursor: "pointer",
              font: "inherit", fontSize: 13, fontWeight: 700, padding: "8px 14px" }}
          >
            {standaloneOpen ? t("Close") : t("New payment link")}
          </button>
          <button
            type="button" onClick={() => { setStandaloneOpen(false); setCreateOpen((open) => !open); setCreateError(""); }}
            style={{ border: "1px solid rgba(120,120,140,0.35)", borderRadius: 8, background: "transparent", color: "inherit",
              cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700, padding: "7px 13px" }}
          >
            {createOpen ? t("Close") : t("Link for an order")}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button" onClick={() => { setCreateOpen((open) => !open); setCreateError(""); }}
            style={{ border: 0, borderRadius: 8, background: "#2563eb", color: "#fff", cursor: "pointer",
              font: "inherit", fontSize: 13, fontWeight: 700, padding: "8px 14px" }}
          >
            {createOpen ? t("Close") : t("New payment link")}
          </button>
        </div>
      )}

      {standaloneNotice ? <p role="status" style={{ margin: 0, fontSize: 12.5, color: "#047857" }}>{standaloneNotice}</p> : null}

      {standaloneOpen && planAllowed === true ? (
        <div
          id="standalone-link-form"
          role="dialog"
          aria-labelledby="standalone-link-form-title"
          aria-describedby="standalone-link-form-note"
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeStandalone(); } }}
          style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start",
            border: "1px solid rgba(120,120,140,0.22)", borderRadius: 10, padding: 12 }}
        >
          <strong id="standalone-link-form-title" style={{ flexBasis: "100%", fontSize: 13 }}>{t("New payment link")}</strong>
          <label style={{ display: "grid", gap: 4, fontSize: 11.5, opacity: 0.75, flex: "1 1 260px" }}>
            {t("What is this payment for?")}
            <input
              ref={standaloneFieldRef}
              value={standaloneTitle} onChange={(e) => setStandaloneTitle(e.target.value)}
              maxLength={STANDALONE_TITLE_MAX} disabled={standaloneBusy} style={field}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 11.5, opacity: 0.75 }}>
            {standaloneCurrency ? `${t("Amount")} (${standaloneCurrency})` : t("Amount")}
            <input
              value={standaloneAmount} onChange={(e) => setStandaloneAmount(e.target.value)}
              inputMode="decimal" disabled={standaloneBusy}
              placeholder={minorToInputText(0, standaloneCurrency ?? "", locale)} style={{ ...field, width: 120 }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 11.5, opacity: 0.75, flex: "1 1 180px" }}>
            {t("Customer name (optional)")}
            <input value={standaloneName} onChange={(e) => setStandaloneName(e.target.value)} autoComplete="off" disabled={standaloneBusy} style={field} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 11.5, opacity: 0.75, flex: "1 1 220px" }}>
            {t("Customer email (optional)")}
            <input type="email" value={standaloneEmail} onChange={(e) => setStandaloneEmail(e.target.value)} autoComplete="off" disabled={standaloneBusy} style={field} />
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, flexBasis: "100%" }}>
            <input type="checkbox" checked={standalonePhone} onChange={(e) => setStandalonePhone(e.target.checked)} disabled={standaloneBusy} />
            {t("Ask for phone number")}
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, flexBasis: "100%" }}>
            <input type="checkbox" checked={standaloneAddress} onChange={(e) => setStandaloneAddress(e.target.checked)} disabled={standaloneBusy} />
            {t("Ask for delivery address")}
          </label>
          <p id="standalone-link-form-note" style={{ margin: 0, flexBasis: "100%", fontSize: 12, opacity: 0.8 }}>
            {t("When the customer pays, NivaDesk opens the order with the details they enter.")}
          </p>
          <button
            type="button" disabled={standaloneBusy || standaloneCurrency === null} onClick={() => void createStandalone()}
            style={{ border: 0, borderRadius: 8, background: "#2563eb", color: "#fff",
              cursor: standaloneBusy ? "default" : "pointer", font: "inherit", fontSize: 13, fontWeight: 700,
              padding: "8px 14px", opacity: standaloneBusy || standaloneCurrency === null ? 0.6 : 1 }}
          >
            {standaloneBusy ? t("Creating…") : t("Create link")}
          </button>
          <button
            type="button" disabled={standaloneBusy} onClick={closeStandalone}
            style={{ border: "1px solid rgba(120,120,140,0.35)", borderRadius: 8, background: "transparent", color: "inherit",
              cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700, padding: "7px 13px" }}
          >
            {t("Close")}
          </button>
          {standaloneError ? (
            <p role="alert" style={{ margin: 0, flexBasis: "100%", fontSize: 12.5, color: "#b91c1c" }}>{standaloneError}</p>
          ) : null}
        </div>
      ) : null}

      {createOpen && planAllowed !== false ? (
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
              inputMode="decimal" placeholder={minorToInputText(0, "", locale)} style={{ ...field, width: 110 }}
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
            onClick={() => { setTab(key); setRefundNotice(null); }}
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
              {visible.map((row) => [
                <tr key={row.paymentRequestId} style={{ borderTop: "1px solid rgba(120,120,140,0.18)" }}>
                  <td style={{ padding: "9px 10px 9px 0", fontVariantNumeric: "tabular-nums" }}>
                    {isStandaloneRow(row) ? (
                      // An order-less link: what it is for, then its order once the customer has paid and the
                      // server has opened it (SL-25); while it is open, a line saying the order comes with the payment.
                      <>
                        <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{row.title || t("Payment")}</span>
                        <div style={{ fontSize: 11.5, opacity: 0.75 }}>
                          {row.orderId ? (
                            onOpenOrder ? (
                              <button type="button" onClick={() => onOpenOrder(row.orderId)}
                                style={{ border: 0, background: "transparent", color: "#2563eb", cursor: "pointer", padding: 0, font: "inherit" }}>
                                {orderLinkLabel(row)}
                              </button>
                            ) : orderLinkLabel(row)
                          ) : tabForStatus(row.publicStatus) === "open" ? t("The order opens when the customer pays.") : null}
                        </div>
                      </>
                    ) : onOpenOrder ? (
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
                    {(row.refundPendingMinor ?? 0) > 0 ? (
                      <div style={{ fontSize: 11.5, color: "#b45309" }} title={t("Refund pending. Stripe will finish this when your Stripe balance allows.")}>
                        {t("Refund pending")} {formatMinor(row.refundPendingMinor ?? 0, row.currency)}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: "9px 10px" }}>
                    {statusLabel(row.publicStatus)}
                    {/*
                      Inline rather than a sub-line like the two below it: those
                      qualify the status, this qualifies the whole row. Shown
                      only when the server says the mode is not "live", so a
                      production row is untouched and a row carrying no mode at
                      all stays unmarked rather than guessed at.
                    */}
                    {row.mode && row.mode !== "live" ? (
                      <span
                        title={t("This link was created on a Stripe test account. No real money moves.")}
                        style={{
                          marginLeft: 6,
                          color: "#b45309",
                          border: "1px solid currentColor",
                          borderRadius: 4,
                          padding: "0 4px",
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: 0.3,
                          textTransform: "uppercase",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {t("Test")}
                      </span>
                    ) : null}
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
                    {/* A paid row, and only when the server says THIS person may refund it now: an older server, a
                        member without the right and a payment with nothing left send no canRefund, and see nothing. */}
                    {tabForStatus(row.publicStatus) !== "open" && row.canRefund === true && (row.refundableMinor ?? 0) > 0 ? (
                      <button
                        type="button"
                        aria-expanded={refundFor === row.paymentRequestId}
                        aria-controls={`refund-form-${row.paymentRequestId}`}
                        disabled={refunding || busyId !== ""}
                        onClick={(e) => (refundFor === row.paymentRequestId ? closeRefund() : openRefund(row, e.currentTarget))}
                        style={{ border: 0, background: "transparent", color: "#b91c1c", cursor: "pointer", padding: "2px 6px", font: "inherit" }}
                      >
                        {t("Refund…")}
                      </button>
                    ) : null}
                    {/* Etsy API Terms: an Etsy order's link is never sent to the buyer by NivaDesk. */}
                    {isEtsyOrderId(row.orderId) && row.url && tabForStatus(row.publicStatus) === "open" ? (
                      <div role={copiedId === row.paymentRequestId ? "status" : undefined} data-etsy-compliance="copy-link"
                        style={{ marginTop: 6, textAlign: "left", whiteSpace: "normal", fontSize: 11.5, color: "#b45309" }}>
                        {t(ETSY_COPY_LINK_NOTE)}
                      </div>
                    ) : null}
                    {shownId === row.paymentRequestId && row.url ? (
                      <div style={{ marginTop: 6, textAlign: "left", wordBreak: "break-all", fontSize: 11.5, opacity: 0.8 }}>{row.url}</div>
                    ) : null}
                  </td>
                </tr>,
                refundFor === row.paymentRequestId || refundNotice?.id === row.paymentRequestId ? (
                  <tr key={`${row.paymentRequestId}:refund`}>
                    <td colSpan={7} style={{ padding: "0 0 10px" }}>
                      {refundNotice && refundNotice.id === row.paymentRequestId ? (
                        <p role="status" style={{ margin: "0 0 6px", fontSize: 12.5, color: refundNotice.tone === "done" ? "#047857" : "#b45309" }}>
                          {refundNotice.text}
                        </p>
                      ) : null}
                      {refundFor === row.paymentRequestId ? (
                        <RefundPaymentDialog
                          companyId={companyId}
                          row={row}
                          t={t}
                          locale={locale}
                          attemptRef={refundAttempt}
                          onBusyChange={setRefunding}
                          onClose={closeRefund}
                          onRefunded={(notice) => refunded(row, notice)}
                          onRowChanged={() => void load()}
                        />
                      ) : null}
                    </td>
                  </tr>
                ) : null,
              ])}
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

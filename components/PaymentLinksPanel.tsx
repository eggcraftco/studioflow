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
  createAttachedPaymentRequest, createStandalonePaymentRequest, isStandaloneRow, newClientRequestId, orderLinkRefusalText, orderReferenceOfRow,
  orderLabelProblem, ORDER_LABEL_MAX, paymentLinkRefusal, standaloneFormProblem, STANDALONE_TITLE_MAX, type PaymentRequestRefundFields,
} from "@/lib/studioflow/stripeConnect";
import RefundPaymentDialog, { type RefundAttempt, type RefundNotice } from "@/components/RefundPaymentDialog";
import { usePaymentLinksPlan } from "@/lib/studioflow/usePaymentLinksAvailable";
import { loadWorkspaceSettingsOverview } from "@/lib/studioflow/firestore";
import { workspaceCurrencyCodes } from "@/lib/studioflow/orderCurrency";
import s from "./PaymentLinksPanel.module.css";

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
  /**
   * SL-29..SL-31 (4 Nov 2026), all optional (an older server sends none): the payment was added to the payer's
   * open order (never sent since the owner's decision 9.9, 5 Nov 2026: a link made without an order is never put
   * on an order by itself); the payer's unpaid orders it may have been for, for a person to merge; the order's own name,
   * whether it is in the Trash, and — when the link's order was merged into another — the order it came from
   * (`orderId` is then the order the money lives on).
   */
  addedToOrder?: boolean;
  possibleOrders?: { orderId: string; projectNumber: number }[];
  orderName?: string;
  orderInTrash?: boolean;
  mergedFromOrderId?: string;
};

/** An order as the pickers list it: number, names, what it still owes and its email (for SL-29's suggestion). */
type PickerOrder = { id: string; customerName: string; designName: string; projectNumber?: number; remainingAmount?: number; emailAddress?: string };

/** One order-less submit. Retried as it is, it keeps its id, so the server makes one link. */
type StandaloneSubmit = {
  title: string;
  amountMinor: number;
  customerName: string;
  customerEmail: string;
  collectPhone: boolean;
  collectAddress: boolean;
  /** SL-28: the order this link is attached to ("" = none; a new order opens when it is paid) and what the money is. */
  orderId: string;
  purpose: string;
};
type StandaloneAttempt = StandaloneSubmit & { clientRequestId: string };

function sameStandaloneSubmit(a: StandaloneSubmit, b: StandaloneSubmit): boolean {
  return a.title === b.title && a.amountMinor === b.amountMinor && a.customerName === b.customerName
    && a.customerEmail === b.customerEmail && a.collectPhone === b.collectPhone && a.collectAddress === b.collectAddress
    && a.orderId === b.orderId && a.purpose === b.purpose;
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
  orders?: PickerOrder[] | null;
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
  // SL-27: what the customer is buying, typed by hand; empty = Stripe's page says "Order #N".
  const [createLabel, setCreateLabel] = useState("");
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
  // SL-28 (31 Oct 2026): the same form can attach its link to one of the workspace's orders ("" = none). The customer
  // still sees only the title typed above; the payment counts against what that order still owes.
  const [standaloneOrderId, setStandaloneOrderId] = useState("");
  const [standalonePurpose, setStandalonePurpose] = useState("remaining_balance");
  /** What the server says about the chosen order: the currency it charges in, what is still to pay, what is not yet asked for. */
  const [attachInfo, setAttachInfo] = useState<{ currency: string; outstandingMinor: number; headroomMinor: number } | null>(null);
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
  // The reference design (4 Nov 2026): history search and filter, one row menu open at a time, and a search box
  // over each order picker.
  const [search, setSearch] = useState("");
  const [purposeFilter, setPurposeFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("any");
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuFor, setMenuFor] = useState("");
  const [standaloneOrderQuery, setStandaloneOrderQuery] = useState("");
  const [createOrderQuery, setCreateOrderQuery] = useState("");
  const filterRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuFor && !filterOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (menuFor && !target?.closest?.(`[data-row-menu="${menuFor}"]`)) setMenuFor("");
      if (filterOpen && filterRef.current && !filterRef.current.contains(target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuFor, filterOpen]);

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
    // Only the workspace decides what is read: `t` is a new function on every render of the page, and having it here
    // read the whole list again each time Banking re-rendered (twelve reads for three page loads on the rig).
  }, [companyId]);

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
    const labelProblem = orderLabelProblem(createLabel);
    if (labelProblem) { setCreateError(t(labelProblem)); return; }
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
        { companyId: string; orderId: string; amountMinor: number; purpose: string; clientRequestId: string; label?: string },
        unknown
      >(functions, "createOrderPaymentRequest");
      await call({
        companyId, orderId: createOrderId, amountMinor, purpose: createPurpose,
        // SL-27: only when something was typed; an older server ignores it and the page says "Order #N".
        ...(createLabel.trim() ? { label: createLabel.trim() } : {}),
        // Sent so a retry after a failed WRITE cannot open a second link for
        // the same money — the server resumes the same request.
        clientRequestId: `${createOrderId}:${amountMinor}:${createPurpose}:${Date.now()}`,
      });
      setCreateOpen(false);
      setCreateAmount("");
      setCreateLabel("");
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
    // Either form: the order pickers show what each order still owes in it (4 Nov 2026).
    if (!(standaloneOpen || createOpen) || standaloneCurrency !== null || !companyId) return;
    let active = true;
    loadWorkspaceSettingsOverview(companyId)
      .then((overview) => {
        const codes = workspaceCurrencyCodes({ selectedCurrency: overview.selectedCurrency });
        if (active) setStandaloneCurrency(codes.length === 1 ? codes[0] : "");
      })
      .catch(() => { if (active) setStandaloneCurrency(""); });
    return () => { active = false; };
  }, [standaloneOpen, createOpen, standaloneCurrency, companyId]);

  // The chosen order's own figures (SL-28), read from the server like the order card does: the currency its link is
  // charged in, what it still owes and what is not yet asked for. The amount is pre-filled only while it is empty.
  useEffect(() => {
    if (!standaloneOpen || !standaloneOrderId || !companyId) { setAttachInfo(null); return; }
    let active = true;
    setAttachInfo(null);
    const info = httpsCallable<{ companyId: string; orderId: string }, { currency?: string; outstandingMinor?: number; headroomMinor?: number }>(functions, "listOrderPaymentRequests");
    info({ companyId, orderId: standaloneOrderId })
      .then((response) => {
        if (!active) return;
        const data = response.data ?? {};
        const next = { currency: String(data.currency ?? ""), outstandingMinor: Number(data.outstandingMinor ?? 0), headroomMinor: Number(data.headroomMinor ?? 0) };
        setAttachInfo(next);
        if (next.headroomMinor > 0) setStandaloneAmount((current) => current || minorToInputText(next.headroomMinor, next.currency, locale));
      })
      .catch((e) => { if (active) { setStandaloneOrderId(""); setStandaloneError(t(messageForError(e))); } });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standaloneOpen, standaloneOrderId, companyId]);

  // Focus moves into the form when it opens, onto what the payment is for.
  useEffect(() => {
    if (standaloneOpen) standaloneFieldRef.current?.focus();
  }, [standaloneOpen]);

  /** The currency the amount is read and shown in: the chosen order's (as the server resolved it), else the workspace's. */
  const standaloneAmountCurrency = standaloneOrderId ? (attachInfo?.currency ?? "") : (standaloneCurrency ?? "");
  /** What the pickers show what is still to pay in: the workspace's currency, once read. */
  const pickerCurrency = standaloneCurrency ?? "";

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
    const attached = standaloneOrderId !== "";
    // SL-28: an attached link asks nothing of the customer's details (the order has them) and is charged in the
    // currency the SERVER resolved for that order; an order-less one in the workspace's own, as before.
    const problem = standaloneFormProblem({ title: standaloneTitle, customerEmail: attached ? "" : standaloneEmail });
    if (problem) { setStandaloneError(t(problem)); return; }
    if (attached && attachInfo === null) { setStandaloneError(t("Loading…")); return; }
    // Read exactly as the order link form reads an amount: "12,50" is 12.50 in every locale, and an amount that
    // could mean two things is refused rather than guessed.
    const parsed = parseRequestAmount(standaloneAmount, (attached ? attachInfo?.currency : standaloneCurrency) ?? "", locale);
    if (!parsed.ok) { setStandaloneError(t(requestAmountMessage(parsed.reason))); return; }
    const submit: StandaloneSubmit = {
      title: standaloneTitle.trim(),
      amountMinor: parsed.amountMinor,
      customerName: attached ? "" : standaloneName.trim(),
      customerEmail: attached ? "" : standaloneEmail.trim(),
      collectPhone: attached ? false : standalonePhone,
      collectAddress: attached ? false : standaloneAddress,
      orderId: standaloneOrderId,
      purpose: attached ? standalonePurpose : "",
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
      // SL-28: attached to an order, the order link's own call named by what was typed above; else order-less.
      const result = attempt.orderId
        ? await createAttachedPaymentRequest({
          companyId, orderId: attempt.orderId, title: attempt.title, amountMinor: attempt.amountMinor,
          purpose: attempt.purpose, clientRequestId: attempt.clientRequestId,
        })
        : await createStandalonePaymentRequest({
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
      setStandaloneOrderId(""); setStandalonePurpose("remaining_balance"); setAttachInfo(null);
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

  // ---- The reference design (4 Nov 2026) ------------------------------------------------------------------------
  // A header with the two ways to ask for money, then one card: the state tabs with their counts, the history
  // toolbar (search + filter), and the table. Every action is the one this panel already had; only where it sits
  // changed. A row's order is named "Order #N" (the server's number, or the order the money now lives on after a
  // merge), never by its document id.

  /** Which status pill a link's state gets. */
  const pillClass = (status: string) => {
    if (status === "paid") return s.pillPaid;
    if (status === "open" || status === "draft") return s.pillOpen;
    if (status === "processing" || status === "partially_refunded") return s.pillWait;
    if (status === "disputed") return s.pillRed;
    return s.pillGrey;
  };

  /** "#101" for a row whose order has a number; "" when it has none (or no order yet). */
  const orderNumberOf = (row: ListedRow) => (row.projectNumber && row.projectNumber > 0 ? `#${row.projectNumber}` : orderReferenceOfRow(row));

  /** What the ORDER column says first: what the link is for (typed), else the order's own name, else its number. */
  const rowHeading = (row: ListedRow) => {
    if (isStandaloneRow(row)) return row.title || t("Payment");
    const reference = orderNumberOf(row);
    return row.title || row.orderName || (reference ? t("Order {reference}").replace("{reference}", reference) : t("Payment"));
  };

  const matchesSearch = (row: ListedRow, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const reference = orderNumberOf(row);
    const haystack = [
      row.title, row.orderName, reference, reference.replace("#", ""), purposeLabel(row.purpose), statusLabel(row.publicStatus),
      formatMinor(row.amountMinor, row.currency), (row.amountMinor / 100).toFixed(2),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  };

  const matchesFilter = (row: ListedRow) => {
    if (purposeFilter !== "all" && (row.purpose || "payment") !== purposeFilter) return false;
    if (periodFilter !== "any" && row.createdAtMs) {
      const days = periodFilter === "7" ? 7 : periodFilter === "30" ? 30 : 365;
      if (Date.now() - row.createdAtMs > days * 24 * 60 * 60 * 1000) return false;
    }
    return true;
  };

  const shownRows = visible.filter((row) => matchesSearch(row, search) && matchesFilter(row));
  const activeFilters = (purposeFilter !== "all" ? 1 : 0) + (periodFilter !== "any" ? 1 : 0);

  /** The order pickers: number, customer and design, and what is still to pay — narrowed by what was typed above them. */
  const orderOptionLabel = (order: PickerOrder) => {
    const remaining = Number(order.remainingAmount || 0);
    const owes = remaining > 0
      ? ` · ${t("Still to pay")}: ${pickerCurrency ? formatMinor(Math.round(remaining * 100), pickerCurrency) : remaining.toFixed(2)}`
      : "";
    const name = [order.customerName, order.designName].filter(Boolean).join(" — ") || order.id;
    return `${order.projectNumber ? `#${order.projectNumber} · ` : ""}${name}${owes}`;
  };
  const pickerOrders = (query: string, keep: string) => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    const all = orders ?? [];
    if (!q) return all;
    return all.filter((order) => order.id === keep || [order.customerName, order.designName, order.emailAddress, order.projectNumber ? String(order.projectNumber) : ""]
      .filter(Boolean).join(" ").toLowerCase().includes(q));
  };

  // SL-29's question, asked while the link is being made: the name or email typed here belongs to a customer who
  // still owes on an order. The payment can be added to it now, instead of opening a second order when it is paid.
  const standaloneSuggestions = useMemo(() => {
    if (standaloneOrderId || !orders) return [];
    const email = standaloneEmail.trim().toLowerCase();
    const name = standaloneName.trim().toLowerCase();
    const fullName = name.split(/\s+/).length >= 2 ? name : "";
    if (!email && !fullName) return [];
    return orders.filter((order) => Number(order.remainingAmount || 0) > 0 && (
      (email && String(order.emailAddress || "").trim().toLowerCase() === email)
      || (fullName && String(order.customerName || "").trim().toLowerCase() === fullName)
    )).slice(0, 3);
  }, [orders, standaloneEmail, standaloneName, standaloneOrderId]);

  const openMenuRow = (id: string) => setMenuFor((current) => (current === id ? "" : id));

  const searchIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  );
  const filterIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );

  const COLUMNS = [t("Order"), t("Purpose"), t("Amount"), t("Paid"), t("Status"), t("Created"), t("Actions")];

  return (
    <section className={s.panel}>
      <header className={s.head}>
        <div>
          <h2 className={s.title}>{t("Payment links")}</h2>
          <p className={s.subtitle}>{t("Create, manage and track payment requests in one place.")}</p>
        </div>
        {planAllowed === false ? null : (
          <div className={s.headActions}>
            {planAllowed === true ? (
              <button
                type="button" className={s.button}
                aria-expanded={createOpen}
                onClick={() => { setStandaloneOpen(false); setCreateOpen((open) => !open); setCreateError(""); }}
              >
                {createOpen ? t("Close") : t("Link for an order")}
              </button>
            ) : null}
            <button
              type="button" ref={standaloneOpenerRef} className={s.primary}
              aria-expanded={planAllowed === true ? standaloneOpen : createOpen}
              aria-controls={planAllowed === true ? "standalone-link-form" : undefined}
              onClick={() => (planAllowed === true
                ? (standaloneOpen ? closeStandalone() : openStandalone())
                : (setCreateOpen((open) => !open), setCreateError("")))}
            >
              {(planAllowed === true ? standaloneOpen : createOpen) ? t("Close") : (<><span className={s.plus} aria-hidden="true">+</span>{t("New payment link")}</>)}
            </button>
          </div>
        )}
      </header>

      {planAllowed === false ? (
        // Free (SL-23): no new links. The ones already sent stay below, and can still be copied and cancelled.
        <p className={s.note}>
          {t("Stripe payments are part of the paid plans.")}{" "}
          <a href="/settings?section=plan-access" style={{ color: "#2563eb", fontWeight: 700 }}>{t("See plans")}</a>
        </p>
      ) : null}

      {standaloneNotice ? <p role="status" className={s.done}>{standaloneNotice}</p> : null}

      {standaloneOpen && planAllowed === true ? (
        <div
          id="standalone-link-form" role="dialog" className={s.formCard}
          aria-labelledby="standalone-link-form-title" aria-describedby="standalone-link-form-note"
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeStandalone(); } }}
        >
          <strong id="standalone-link-form-title" className={s.formTitle}>{t("New payment link")}</strong>
          <label className={s.field} style={{ flex: "1 1 260px" }}>
            {t("What is this payment for?")}
            <input
              ref={standaloneFieldRef} className={s.input}
              value={standaloneTitle} onChange={(e) => setStandaloneTitle(e.target.value)}
              maxLength={STANDALONE_TITLE_MAX} disabled={standaloneBusy}
            />
          </label>
          <label className={s.field}>
            {standaloneAmountCurrency ? `${t("Amount")} (${standaloneAmountCurrency})` : t("Amount")}
            <input
              className={s.input} style={{ width: 130 }}
              value={standaloneAmount} onChange={(e) => setStandaloneAmount(e.target.value)}
              inputMode="decimal" disabled={standaloneBusy}
              placeholder={minorToInputText(0, standaloneAmountCurrency, locale)}
            />
          </label>
          {/* SL-28: attach the link to one of the workspace's orders. The customer never sees which. */}
          {orders !== undefined ? (
            <div className={s.field} style={{ flexBasis: "100%" }}>
              <label htmlFor="standalone-order-search">{t("Add to an order (optional)")}</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  id="standalone-order-search" className={s.input} style={{ flex: "0 1 200px" }}
                  value={standaloneOrderQuery} onChange={(e) => setStandaloneOrderQuery(e.target.value)}
                  placeholder={t("Search orders")} disabled={standaloneBusy || orders === null} autoComplete="off"
                />
                <select
                  className={s.input} style={{ flex: "1 1 320px", maxWidth: 560 }} aria-label={t("Add to an order (optional)")}
                  value={standaloneOrderId} onChange={(e) => { setStandaloneOrderId(e.target.value); setStandaloneError(""); }}
                  disabled={standaloneBusy} data-attach-order
                >
                  <option value="">{orders === null ? t("Loading…") : t("No order (a new one opens when it is paid)")}</option>
                  {pickerOrders(standaloneOrderQuery, standaloneOrderId).map((order) => (
                    <option key={order.id} value={order.id}>{orderOptionLabel(order)}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
          {standaloneSuggestions.length ? (
            <div className={s.suggest} role="status" data-attach-suggestion>
              <span>{t("This customer still owes on an order. Add the link to it, so the payment counts there instead of opening a second order.")}</span>
              {standaloneSuggestions.map((order) => (
                <button key={order.id} type="button" className={s.button} style={{ padding: "6px 12px", fontSize: 13 }}
                  onClick={() => { setStandaloneOrderId(order.id); setStandaloneError(""); }}>
                  {t("Add to {order}").replace("{order}", order.projectNumber ? `#${order.projectNumber}` : (order.designName || order.customerName))}
                </button>
              ))}
            </div>
          ) : null}
          {standaloneOrderId !== "" ? (
            <>
              <label className={s.field}>
                {t("Purpose")}
                <select className={s.input} value={standalonePurpose} onChange={(e) => setStandalonePurpose(e.target.value)} disabled={standaloneBusy}>
                  <option value="deposit">{t("Deposit")}</option>
                  <option value="instalment">{t("Instalment")}</option>
                  <option value="remaining_balance">{t("Remaining balance")}</option>
                </select>
              </label>
              <p className={s.note} style={{ alignSelf: "end", fontSize: 12.5 }}>
                {attachInfo
                  ? `${t("Still to pay")}: ${formatMinor(attachInfo.outstandingMinor, attachInfo.currency)} · ${t("Not yet asked for")}: ${formatMinor(attachInfo.headroomMinor, attachInfo.currency)}`
                  : t("Loading…")}
              </p>
            </>
          ) : (
            <>
              <label className={s.field} style={{ flex: "1 1 180px" }}>
                {t("Customer name (optional)")}
                <input className={s.input} value={standaloneName} onChange={(e) => setStandaloneName(e.target.value)} autoComplete="off" disabled={standaloneBusy} />
              </label>
              <label className={s.field} style={{ flex: "1 1 220px" }}>
                {t("Customer email (optional)")}
                <input className={s.input} type="email" value={standaloneEmail} onChange={(e) => setStandaloneEmail(e.target.value)} autoComplete="off" disabled={standaloneBusy} />
              </label>
              <label className={s.check}>
                <input type="checkbox" checked={standalonePhone} onChange={(e) => setStandalonePhone(e.target.checked)} disabled={standaloneBusy} />
                {t("Ask for phone number")}
              </label>
              <label className={s.check}>
                <input type="checkbox" checked={standaloneAddress} onChange={(e) => setStandaloneAddress(e.target.checked)} disabled={standaloneBusy} />
                {t("Ask for delivery address")}
              </label>
            </>
          )}
          <p id="standalone-link-form-note" className={s.formNote}>
            {standaloneOrderId !== ""
              ? t("The payment is added to this order. Your customer sees only the name you typed above, not the order.")
              : t("When the customer pays, NivaDesk opens the order with the details they enter.")}
          </p>
          <button
            type="button" className={s.primary}
            disabled={standaloneBusy || (standaloneOrderId !== "" ? attachInfo === null : standaloneCurrency === null)}
            onClick={() => void createStandalone()}
          >
            {standaloneBusy ? t("Creating…") : t("Create link")}
          </button>
          <button type="button" className={s.button} disabled={standaloneBusy} onClick={closeStandalone}>{t("Close")}</button>
          {standaloneError ? <p role="alert" className={s.alert}>{standaloneError}</p> : null}
        </div>
      ) : null}

      {createOpen && planAllowed !== false ? (
        <div className={s.formCard}>
          <strong className={s.formTitle}>{t("Link for an order")}</strong>
          <div className={s.field} style={{ flexBasis: "100%" }}>
            <label htmlFor="order-link-search">{t("Order")}</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                id="order-link-search" className={s.input} style={{ flex: "0 1 200px" }}
                value={createOrderQuery} onChange={(e) => setCreateOrderQuery(e.target.value)}
                placeholder={t("Search orders")} disabled={creating || orders === null} autoComplete="off"
              />
              <select className={s.input} style={{ flex: "1 1 320px", maxWidth: 560 }} aria-label={t("Order")}
                value={createOrderId} onChange={(e) => setCreateOrderId(e.target.value)}>
                <option value="">{orders === null ? t("Loading…") : t("Choose an order.")}</option>
                {pickerOrders(createOrderQuery, createOrderId).map((order) => (
                  <option key={order.id} value={order.id}>{orderOptionLabel(order)}</option>
                ))}
              </select>
            </div>
          </div>
          <label className={s.field}>
            {t("Purpose")}
            <select className={s.input} value={createPurpose} onChange={(e) => setCreatePurpose(e.target.value)}>
              <option value="deposit">{t("Deposit")}</option>
              <option value="instalment">{t("Instalment")}</option>
              <option value="remaining_balance">{t("Remaining balance")}</option>
            </select>
          </label>
          <label className={s.field}>
            {t("Amount")}
            {/* inputMode decimal, so a phone shows the number pad. */}
            <input
              className={s.input} style={{ width: 130 }}
              value={createAmount} onChange={(e) => setCreateAmount(e.target.value)}
              inputMode="decimal" placeholder={minorToInputText(0, "", locale)}
            />
          </label>
          <label className={s.field} style={{ flex: "1 1 260px" }}>
            {t("What the customer is buying (optional)")}
            <input
              className={s.input}
              value={createLabel} onChange={(e) => setCreateLabel(e.target.value)}
              maxLength={ORDER_LABEL_MAX} disabled={creating} autoComplete="off" data-order-link-label
              placeholder={t("Shown on the payment page. Left empty, it shows the order number.")}
            />
          </label>
          <button type="button" className={s.primary} style={{ alignSelf: "end" }} disabled={creating} onClick={() => void create()}>
            {creating ? t("Creating…") : t("Create link")}
          </button>
          {createError ? <p role="alert" className={s.alert}>{createError}</p> : null}
        </div>
      ) : null}

      <div className={s.card}>
        <div role="tablist" aria-label={t("Payment link states")} className={s.tabs}>
          {TABS.map(([key, label]) => (
            <button
              key={key} type="button" role="tab" aria-selected={tab === key}
              className={`${s.tab} ${tab === key ? s.tabActive : ""}`}
              onClick={() => { setTab(key); setRefundNotice(null); setMenuFor(""); }}
            >
              {label}
              {/* No count until the rows are known ("0" beside a failed read is the lie the empty state was);
                  the badge keeps its place meanwhile, so the tabs do not move when the counts arrive. */}
              <span className={`${s.badge} ${rows ? "" : s.badgeUnknown}`}>{rows ? counts[key] ?? 0 : 0}</span>
            </button>
          ))}
        </div>

        <div className={s.toolbar}>
          <span className={s.historyTitle}>{t("Payment link history")}</span>
          <label className={s.search}>
            {searchIcon}
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search payments")} aria-label={t("Search payments")} />
          </label>
          <div className={s.filterWrap} ref={filterRef}>
            <button type="button" className={s.button} aria-expanded={filterOpen} aria-haspopup="dialog" onClick={() => setFilterOpen((open) => !open)}>
              {filterIcon}{t("Filter")}{activeFilters ? <span className={s.filterCount}>{activeFilters}</span> : null}
            </button>
            {filterOpen ? (
              <div className={s.popover} role="dialog" aria-label={t("Filter")} onKeyDown={(e) => { if (e.key === "Escape") setFilterOpen(false); }}>
                <label className={s.field}>
                  {t("Purpose")}
                  <select className={s.input} value={purposeFilter} onChange={(e) => setPurposeFilter(e.target.value)}>
                    <option value="all">{t("All")}</option>
                    <option value="deposit">{t("Deposit")}</option>
                    <option value="instalment">{t("Instalment")}</option>
                    <option value="remaining_balance">{t("Remaining balance")}</option>
                    <option value="payment">{t("Payment")}</option>
                  </select>
                </label>
                <label className={s.field}>
                  {t("Created")}
                  <select className={s.input} value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
                    <option value="any">{t("Any time")}</option>
                    <option value="7">{t("Last 7 days")}</option>
                    <option value="30">{t("Last 30 days")}</option>
                    <option value="365">{t("Last 12 months")}</option>
                  </select>
                </label>
                {activeFilters ? (
                  <button type="button" className={s.linkButton} style={{ justifySelf: "start", fontSize: 13 }}
                    onClick={() => { setPurposeFilter("all"); setPeriodFilter("any"); }}>
                    {t("Clear filters")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div role="alert" className={s.errorBar}>
            <span>{t(error)}</span>
            {/* Reloading the page was the only way back. A read that failed once
                is exactly the kind that succeeds on the second try. */}
            <button type="button" className={s.button} style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => void load()}>{t("Try again")}</button>
          </div>
        ) : null}

        {rows === null ? (
          // Unknown, for either reason: still loading, or the read failed. Loading keeps the table's own shape
          // (three placeholder rows), so nothing below it jumps when the links arrive; a failed read says so above.
          error ? null : (
            <div className={s.tableWrap} aria-busy="true" aria-label={t("Loading…")}>
              <table className={s.table}>
                <tbody>
                  {[0, 1, 2].map((index) => (
                    <tr key={index} className={s.skeleton}>
                      <td><div className={s.skeletonBar} style={{ width: "55%" }} /></td>
                      <td><div className={s.skeletonBar} style={{ width: "60%" }} /></td>
                      <td><div className={s.skeletonBar} /></td>
                      <td><div className={s.skeletonBar} /></td>
                      <td><div className={s.skeletonBar} style={{ width: "70%" }} /></td>
                      <td><div className={s.skeletonBar} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : shownRows.length === 0 ? (
          <p className={s.empty}>
            {visible.length > 0 ? t("No payment links match your search.")
              : tab === "open" ? t("No payment links are waiting to be paid.") : t("Nothing here yet.")}
          </p>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>{COLUMNS[0]}</th>
                  <th>{COLUMNS[1]}</th>
                  <th className={s.num}>{COLUMNS[2]}</th>
                  <th className={s.num}>{COLUMNS[3]}</th>
                  <th>{COLUMNS[4]}</th>
                  <th>{COLUMNS[5]}</th>
                  <th className={s.actionsCol}>{COLUMNS[6]}</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map((row) => {
                  const state = tabForStatus(row.publicStatus);
                  const reference = orderNumberOf(row);
                  const canOpenOrder = Boolean(row.orderId) && Boolean(onOpenOrder);
                  const isOpen = Boolean(row.url) && state === "open";
                  const menuItems = [
                    canOpenOrder ? { key: "order", label: reference ? t("Open order {reference}").replace("{reference}", reference) : t("Open order"), run: () => onOpenOrder?.(row.orderId) } : null,
                    isOpen ? { key: "show", label: shownId === row.paymentRequestId ? t("Hide link") : t("Show link"), run: () => setShownId(shownId === row.paymentRequestId ? "" : row.paymentRequestId) } : null,
                    isOpen ? { key: "cancel", label: busyId === row.paymentRequestId ? t("Cancelling…") : t("Cancel link"), danger: true, run: () => void cancel(row) } : null,
                  ].filter(Boolean) as { key: string; label: string; danger?: boolean; run: () => void }[];
                  const rowMenu = menuItems.length ? (
                    <span className={s.menuWrap} data-row-menu={row.paymentRequestId}>
                      <button type="button" className={s.more} aria-haspopup="menu" aria-expanded={menuFor === row.paymentRequestId}
                        aria-label={t("More actions")} onClick={() => openMenuRow(row.paymentRequestId)}>
                        <span aria-hidden="true">···</span>
                      </button>
                      {menuFor === row.paymentRequestId ? (
                        <span className={s.menu} role="menu" onKeyDown={(e) => { if (e.key === "Escape") setMenuFor(""); }}>
                          {menuItems.map((item) => (
                            <button key={item.key} type="button" role="menuitem" className={item.danger ? s.danger : undefined}
                              disabled={item.key === "cancel" && busyId === row.paymentRequestId}
                              onClick={() => { setMenuFor(""); item.run(); }}>
                              {item.label}
                            </button>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  ) : null;
                  return [
                    <tr key={row.paymentRequestId}>
                      <td data-label={COLUMNS[0]}>
                        <div className={s.orderTitle}>{rowHeading(row)}</div>
                        {row.orderId ? (
                          canOpenOrder ? (
                            <button type="button" className={s.linkButton} style={{ fontSize: 13, marginTop: 3 }} onClick={() => onOpenOrder?.(row.orderId)}>
                              {reference ? t("Order {reference}").replace("{reference}", reference) : t("Open order")}
                            </button>
                          ) : <div className={s.sub}>{reference ? t("Order {reference}").replace("{reference}", reference) : null}</div>
                        ) : state === "open" ? <div className={s.sub}>{t("The order opens when the customer pays.")}</div> : null}
                        {row.addedToOrder ? <div className={s.subOk}>{t("Added to the customer's open order")}</div> : null}
                        {row.orderInTrash ? <div className={s.subWarn}>{t("This order is in the Trash")}</div> : null}
                        {(row.possibleOrders ?? []).length ? (
                          <div className={s.subWarn} data-possible-orders>
                            {t("This customer also has an unpaid order. If this payment was for it, merge the two orders in Orders.")}{" "}
                            {(row.possibleOrders ?? []).map((candidate, index) => (
                              <span key={candidate.orderId}>
                                {index ? ", " : ""}
                                {onOpenOrder ? (
                                  <button type="button" className={s.linkButton} onClick={() => onOpenOrder(candidate.orderId)}>
                                    {candidate.projectNumber ? `#${candidate.projectNumber}` : t("Open order")}
                                  </button>
                                ) : (candidate.projectNumber ? `#${candidate.projectNumber}` : "")}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td data-label={COLUMNS[1]}>{purposeLabel(row.purpose)}</td>
                      <td data-label={COLUMNS[2]} className={`${s.num} ${s.amount}`}>{formatMinor(row.amountMinor, row.currency)}</td>
                      <td data-label={COLUMNS[3]} className={s.num}>
                        <div>
                          {row.paidAmountMinor > 0 ? formatMinor(row.paidAmountMinor, row.currency) : "—"}
                          {row.refundedAmountMinor > 0 ? <div className={s.sub}>{t("Refunded")} {formatMinor(row.refundedAmountMinor, row.currency)}</div> : null}
                          {(row.refundPendingMinor ?? 0) > 0 ? (
                            <div className={s.subWarn} title={t("Refund pending. Stripe will finish this when your Stripe balance allows.")}>
                              {t("Refund pending")} {formatMinor(row.refundPendingMinor ?? 0, row.currency)}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td data-label={COLUMNS[4]}>
                        <div>
                          <span className={`${s.pill} ${pillClass(row.publicStatus)}`}>{statusLabel(row.publicStatus)}</span>
                          {/* Shown only when the server says the mode is not "live", so a production row is untouched
                              and a row carrying no mode at all stays unmarked rather than guessed at. */}
                          {row.mode && row.mode !== "live" ? (
                            <span className={s.test} title={t("This link was created on a Stripe test account. No real money moves.")}>{t("Test")}</span>
                          ) : null}
                          {row.stale ? (
                            <div className={s.subWarn}>
                              {row.staleReason === "order_fully_settled" ? t("This order is already settled") : t("More than this order still owes")}
                              {row.excessMinor ? ` · ${formatMinor(row.excessMinor, row.currency)}` : ""}
                            </div>
                          ) : null}
                          {row.overpaidMinor ? <div className={s.subWarn}>{t("Overpaid")} {formatMinor(row.overpaidMinor, row.currency)}</div> : null}
                        </div>
                      </td>
                      <td data-label={COLUMNS[5]} style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        <div>
                          {row.createdAtMs ? new Date(row.createdAtMs).toLocaleDateString(locale) : "—"}
                          {row.expiresAtMs ? <div className={s.sub}>{t("Expires")} {new Date(row.expiresAtMs).toLocaleDateString(locale)}</div> : null}
                        </div>
                      </td>
                      <td data-label={COLUMNS[6]} className={s.actionsCol}>
                        <div>
                          <span className={s.rowActions}>
                            {isOpen ? (
                              <button type="button" className={s.copy} onClick={() => void copy(row)}>
                                {copiedId === row.paymentRequestId ? t("Copied") : t("Copy link")}
                              </button>
                            ) : null}
                            {/* A paid row, and only when the server says THIS person may refund it now: an older server, a
                                member without the right and a payment with nothing left send no canRefund, and see nothing. */}
                            {tabForStatus(row.publicStatus) !== "open" && row.canRefund === true && (row.refundableMinor ?? 0) > 0 ? (
                              <button
                                type="button" className={s.refund}
                                aria-expanded={refundFor === row.paymentRequestId}
                                aria-controls={`refund-form-${row.paymentRequestId}`}
                                disabled={refunding || busyId !== ""}
                                onClick={(e) => (refundFor === row.paymentRequestId ? closeRefund() : openRefund(row, e.currentTarget))}
                              >
                                {t("Refund…")}
                              </button>
                            ) : null}
                            {rowMenu}
                          </span>
                          {/* Etsy API Terms: an Etsy order's link is never sent to the buyer by NivaDesk. */}
                          {isEtsyOrderId(row.orderId) && isOpen ? (
                            <div role={copiedId === row.paymentRequestId ? "status" : undefined} data-etsy-compliance="copy-link" className={s.etsy}>
                              {t(ETSY_COPY_LINK_NOTE)}
                            </div>
                          ) : null}
                          {shownId === row.paymentRequestId && row.url ? <div className={s.shown}>{row.url}</div> : null}
                        </div>
                      </td>
                    </tr>,
                    refundFor === row.paymentRequestId || refundNotice?.id === row.paymentRequestId ? (
                      <tr key={`${row.paymentRequestId}:refund`} className={s.detailRow}>
                        <td colSpan={7}>
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
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}

        {truncated ? <p className={s.foot}>{t("Only the most recent payment links are shown.")}</p> : null}
      </div>
    </section>
  );
}

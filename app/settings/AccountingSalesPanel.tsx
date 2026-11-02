"use client";

// The Sales tab of the accounting connection (QuickBooks Online and Xero), phase 3a: the owner
// previews and approves the sales invoices, payments and refunds NivaDesk sends to the books.
// Nothing is sent without the owner's approval; the server (functions/accountingPosting.js)
// re-checks every rule — owner, Pro/Team, the workspace's posting switch, this connection as
// the writer, the preview the owner saw — so this screen only explains and asks.
//
// Where posting is not open for the workspace (writeOpen false) the tab shows exactly the
// read-only panel every workspace saw before; a reader the server refuses sees it too.
// Copy uses {provider} (the provider's short name) and other {placeholders} filled in after
// translation, so one set of translations serves both providers.
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import { CardTitle } from "@/components/CardTitle";
import { friendlyErrorMessage } from "@/lib/studioflow/friendlyError";
import {
  accountingConnectRefusal, accountingErrorCode, accountingPostingApprove, accountingPostingIgnore, accountingPostingList, accountingPostingResolveChange,
  accountingPostingRetry, accountingPostingScan, accountingPostingSettingsSave, getAccountingCatalog, xeroConnectStart,
  ACCOUNT_MAPPING_KEYS, POSTING_DEPOSIT_METHODS,
  type AccountingCatalog, type AccountingProvider, type PostingList, type PostingMethod, type PostingRow, type PostingScanResult
} from "@/lib/studioflow/quickbooks";

type Props = {
  companyId: string;
  connectionId: string;
  provider: AccountingProvider;
  /** Short name used in the copy: "QuickBooks", "Xero". */
  providerShort: string;
  /** Full name for the card eyebrow: "QuickBooks Online", "Xero". */
  providerName: string;
  language: string;
  /** The read-only panel shown before posting opened — rendered unchanged where posting is closed. */
  closedPanel: ReactNode;
  /** Opens the Setup tab, where the connection is made the accounting writer with a start date. */
  onOpenSetup: () => void;
};

type FilterKey = "ready" | "review" | "sending" | "sent" | "changed" | "problems" | "ignored";
const FILTER_ORDER: FilterKey[] = ["ready", "review", "sending", "sent", "changed", "problems", "ignored"];
const MAX_APPROVE = 50;
const SENT = new Set(["synced", "reconciled", "conflict"]);
const SALE_ON_ITS_WAY = new Set(["queued", "retry", "synced", "reconciled", "conflict"]);

const METHOD_LABELS: Record<PostingMethod, string> = {
  stripe: "Payment links (Stripe)",
  card: "Card",
  paypal: "PayPal",
  bank_transfer: "Bank transfer",
  bank: "Bank feed match",
  cash: "Cash",
  other: "Other"
};

// A sale whose only reason is the missing invoice number is approvable: the server gives the number.
function isApprovable(row: PostingRow): boolean {
  if (row.status === "ready") return true;
  const reasons = row.reasons || [];
  return row.status === "draft" && row.kind === "sale" && reasons.length === 1 && reasons[0] === "invoice_number_missing";
}

function matches(row: PostingRow, filter: FilterKey): boolean {
  switch (filter) {
    case "ready": return isApprovable(row);
    case "review": return row.status === "draft" && !isApprovable(row);
    case "sending": return row.status === "queued" || row.status === "retry";
    case "sent": return row.status === "synced" || row.status === "reconciled";
    case "changed": return Boolean(row.changed) || row.status === "conflict";
    case "problems": return row.status === "needs_attention";
    case "ignored": return row.status === "ignored";
  }
}

const KIND_ORDER: Record<string, number> = { sale: 0, payment: 1, refund: 2 };

const card: CSSProperties = { display: "grid", gap: 10 };
const softBox: CSSProperties = { border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", background: "var(--panel)", display: "grid", gap: 8, minWidth: 0 };
const selectStyle: CSSProperties = { fontSize: 12.5, padding: "6px 9px", borderRadius: 7, border: "1px solid rgba(120,120,140,0.35)", background: "transparent", color: "inherit", width: "100%", minWidth: 0 };
const small: CSSProperties = { fontSize: 12, opacity: 0.75 };
const th: CSSProperties = { textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.6, padding: "4px 6px", borderBottom: "1px solid rgba(120,120,140,0.25)" };
const td: CSSProperties = { padding: "4px 6px", fontSize: 12.5, borderBottom: "1px solid rgba(120,120,140,0.12)", verticalAlign: "top", overflowWrap: "anywhere" };
type Tone = "accent" | "success" | "warning" | "danger" | "muted";
const badge = (tone: Tone): CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700, lineHeight: 1.5, whiteSpace: "nowrap",
  color: "inherit",
  background: tone === "muted" ? "rgba(120,120,140,0.14)" : `var(--${tone}-soft)`,
  border: `1px solid ${tone === "muted" ? "rgba(120,120,140,0.25)" : `var(--${tone})`}`
});
const chip = (active: boolean): CSSProperties => ({
  border: `1px solid ${active ? "var(--accent)" : "rgba(120,120,140,0.3)"}`, background: active ? "var(--accent-soft)" : "transparent", color: "inherit",
  borderRadius: 999, padding: "5px 11px", fontSize: 12.5, fontWeight: active ? 800 : 600, cursor: "pointer", whiteSpace: "nowrap"
});
const linkButton: CSSProperties = { border: 0, background: "transparent", color: "var(--accent)", padding: 0, fontSize: 12.5, fontWeight: 700, cursor: "pointer" };

export function AccountingSalesPanel({ companyId, connectionId, provider, providerShort, providerName, language, closedPanel, onOpenSetup }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const pt = useCallback((template: string) => t(template).replace(/\{provider\}/g, providerShort), [t, providerShort]);
  const locale = studioLocaleTag(language);

  const [data, setData] = useState<PostingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  // Where the last action's result is shown: next to the control that started it.
  const [feedbackAt, setFeedbackAt] = useState<"header" | "settings" | "list">("list");
  const [filter, setFilter] = useState<FilterKey | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [approveFailures, setApproveFailures] = useState<{ id: string; label: string; reason: string }[]>([]);
  const [scanResult, setScanResult] = useState<PostingScanResult | null>(null);
  const [ignoreOpen, setIgnoreOpen] = useState("");
  const [ignoreReason, setIgnoreReason] = useState("");
  const [customerChoice, setCustomerChoice] = useState<Record<string, string>>({});
  const [confirmVoid, setConfirmVoid] = useState("");
  const [catalog, setCatalog] = useState<AccountingCatalog | null>(null);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [salesItemDraft, setSalesItemDraft] = useState("");
  const [invoiceStatusDraft, setInvoiceStatusDraft] = useState<"AUTHORISED" | "DRAFT">("AUTHORISED");
  const [depositDraft, setDepositDraft] = useState<Partial<Record<PostingMethod, string>>>({});

  const load = useCallback(async () => {
    if (!companyId || !connectionId) return;
    try {
      const next = await accountingPostingList(companyId, connectionId);
      setData(next);
      setDenied(false);
      setLoadError("");
    } catch (err) {
      // A reader the server does not let in sees the panel everyone saw before — and so does every
      // workspace while the callable is not deployed yet (the web may ship before the functions).
      const code = accountingErrorCode(err);
      if (code === "permission-denied" || code === "not-found" || code === "unimplemented") setDenied(true);
      else setLoadError(friendlyErrorMessage(err, t) || t("Could not load."));
    } finally {
      setLoading(false);
    }
  }, [companyId, connectionId, t]);
  useEffect(() => { void load(); }, [load]);

  const isOwner = data?.isOwner === true;
  const writeOpen = data?.writeOpen === true;
  useEffect(() => {
    if (!writeOpen || !isOwner || catalogLoaded) return;
    let cancelled = false;
    getAccountingCatalog(companyId, connectionId)
      .then((next) => { if (!cancelled) setCatalog(next); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setCatalogLoaded(true); });
    return () => { cancelled = true; };
  }, [writeOpen, isOwner, catalogLoaded, companyId, connectionId]);

  // The settings drafts follow what is saved.
  const savedPosting = data?.posting;
  useEffect(() => {
    if (!savedPosting) return;
    setSalesItemDraft(savedPosting.qboSalesItemId || "");
    setInvoiceStatusDraft(savedPosting.xeroInvoiceStatus === "DRAFT" ? "DRAFT" : "AUTHORISED");
    setDepositDraft({ ...(savedPosting.depositAccounts || {}) });
  }, [savedPosting]);

  const rows = useMemo(() => data?.postings || [], [data]);
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const counts = useMemo(() => {
    const out = Object.fromEntries(FILTER_ORDER.map((key) => [key, 0])) as Record<FilterKey, number>;
    for (const row of rows) for (const key of FILTER_ORDER) if (matches(row, key)) out[key] += 1;
    return out;
  }, [rows]);
  // The list opens where there is something to do.
  const activeFilter: FilterKey = filter || (["ready", "problems", "changed", "review", "sending", "sent", "ignored"] as FilterKey[]).find((key) => counts[key] > 0) || "ready";

  // ---- words --------------------------------------------------------------------------------
  const money = useCallback((amount: number | null | undefined, currency?: string) => {
    const value = Number(amount) || 0;
    if (!currency) return value.toFixed(2);
    try { return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value); } catch { return `${value.toFixed(2)} ${currency}`; }
  }, [locale]);
  const day = useCallback((iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "—";
    try { return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))); } catch { return iso; }
  }, [locale]);
  const ago = useCallback((ms: number | undefined) => {
    if (!ms) return "—";
    const diff = Math.max(0, Date.now() - ms);
    if (diff < 90 * 1000) return t("Just now");
    if (diff < 90 * 60 * 1000) return `${Math.round(diff / 60000)} ${t("minutes ago")}`;
    if (diff < 36 * 60 * 60 * 1000) return `${Math.round(diff / 3600000)} ${t("hours ago")}`;
    return `${Math.round(diff / 86400000)} ${t("days ago")}`;
  }, [t]);
  const when = useCallback((ms: number) => {
    try { return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ms)); } catch { return new Date(ms).toLocaleString(); }
  }, [locale]);
  const methodLabel = useCallback((key: string) => t(METHOD_LABELS[key as PostingMethod] || METHOD_LABELS.other), [t]);
  const accountLabel = useCallback((key: string) => {
    const row = ACCOUNT_MAPPING_KEYS.find((item) => item.key === key);
    return row ? t(row.label) : key;
  }, [t]);

  // The server's label is English ("Invoice 2026-0041 · Jane Doe", "Payment 120.00 · card"): a sale
  // keeps its number and customer under translated words; a payment or refund is named by its method
  // (its kind and amount are shown beside it).
  const titleOf = useCallback((kind: string, label: string, docNumber?: string, method?: string) => {
    if (kind !== "sale") return methodLabel(method || "other");
    const [head = "", ...rest] = String(label || "").split(" · ");
    const reference = docNumber ? `${t("Invoice")} ${docNumber}` : head.startsWith("Order ") ? `${t("Order")} ${head.slice(6)}` : head.startsWith("Invoice ") ? `${t("Invoice")} ${head.slice(8)}` : head;
    return rest.length ? `${reference} · ${rest.join(" · ")}` : reference;
  }, [t, methodLabel]);
  const rowTitle = useCallback((row: PostingRow) => titleOf(row.kind, row.label, row.docNumber, row.method), [titleOf]);

  // Every reason code the server gives, in words. An unknown code is shown as it is.
  const reasonText = useCallback((code: string): string => {
    const fixed: Record<string, string> = {
      order_deleted: t("The order was deleted."),
      finance_not_ready: t("The order's finance figures are not ready yet — open and save the order."),
      margin_scheme: t("Margin-scheme sale: your accountant posts these for now."),
      tax_needs_review: t("The order's tax needs review first."),
      vat_rate_unsupported: t("The order's VAT rate is not a UK rate."),
      nothing_to_invoice: t("Nothing to invoice on this order."),
      invoice_number_missing: t("An invoice number will be given on approval."),
      lines_do_not_match_revenue: t("The invoice lines do not add up to the order total."),
      currency_unknown: t("The workspace currency is ambiguous — set it in Financial Settings."),
      currency_mismatch: t("Different currency from your books."),
      date_missing: t("The order has no date."),
      ledger_row_missing: t("The card payment's record is missing."),
      payments_exceed_invoice: t("Payments add up to more than the invoice."),
      connection_not_linked: t("The connection needs reconnecting."),
      connection_not_primary: t("This connection is not set as the accounting writer."),
      xero_write_permission_missing: t("Xero has not allowed NivaDesk to write yet."),
      before_boundary: pt("Before the date your books start in {provider}."),
      after_write_end: t("After this connection's end date."),
      book_closed: pt("That period is closed in {provider}."),
      sale_vat_unknown: t("The sale's VAT is unknown."),
      approve_invoice_first: t("Approve the invoice first."),
      preview_stale: t("The order changed since you looked — refresh."),
      customer_choice_needed: pt("Choose the customer in {provider}."),
      reconnect_required: pt("Reconnect {provider}."),
      retries_exhausted: pt("{provider} did not answer; retry later."),
      provider_permission_denied: pt("{provider} refused the request."),
      provider_conflict: pt("Changed in {provider} meanwhile."),
      doc_number_taken: pt("That invoice number already exists in {provider}."),
      provider_rejected: pt("{provider} rejected the document."),
      internal_error: t("Something went wrong on our side."),
      provider_totals_differ: pt("Posted, but {provider}'s totals differ."),
      no_answer: pt("{provider} did not answer yet; NivaDesk tries again."),
      rate_limit: pt("Waiting — {provider} asked us to slow down"),
      order_missing: t("The order no longer exists."),
      event_gone: t("It is no longer on the order — refresh."),
      not_found: t("It is no longer there — refresh."),
      not_in_books: pt("It was not found in {provider}."),
      void_not_supported: pt("This cannot be voided from NivaDesk; do it in {provider}."),
      void_needs_removed_source: pt("This cannot be voided from NivaDesk; do it in {provider}."),
      provider_unsupported: t("This connection cannot receive documents."),
      choice_not_offered: t("That customer is no longer offered — refresh and choose again."),
      void_payments_first: t("Void the payments sent against this invoice first."),
      nothing_changed: t("Nothing to keep — refresh."),
      accounting_write_plan_required: t("Sending is part of NivaDesk Pro and Team."),
      accounting_write_closed: pt("Sending to {provider} is not open for this workspace yet.")
    };
    if (fixed[code]) return fixed[code];
    const [head, arg = ""] = code.split(":");
    if (head === "mapping_stale") return pt("A mapping points to something no longer in {provider} — sync and map again.");
    if (head === "mapping_missing") {
      if (arg === "sales_item") return t("Choose the sales item.");
      if (arg.startsWith("tax_")) return t("Map the VAT code ({code}).").replace("{code}", arg.slice(4));
      if (arg.startsWith("account_")) return t("Map the account ({account}).").replace("{account}", accountLabel(arg.slice(8)));
      if (arg.startsWith("deposit_")) return t("Choose where {method} payments are deposited.").replace("{method}", methodLabel(arg.slice(8)));
    }
    if (head === "account_without_code") return t("The mapped Xero account ({account}) has no code.").replace("{account}", accountLabel(arg));
    if (head === "deposit_account_not_payable") return t("That Xero account cannot receive payments ({method}).").replace("{method}", methodLabel(arg));
    if (code.startsWith("status_")) return t("Its state changed meanwhile — refresh.");
    return code;
  }, [t, pt, accountLabel, methodLabel]);
  const known = (code: string) => reasonText(code) !== code;

  // A refused call: the server's reason in words, otherwise its message.
  const errorText = useCallback((err: unknown) => {
    const reason = accountingConnectRefusal(err);
    if (reason && reasonText(reason) !== reason) return reasonText(reason);
    return friendlyErrorMessage(err, t) || t("Could not load.");
  }, [reasonText, t]);

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(""); setNotice("");
    setFeedbackAt(key === "scan" || key === "consent" ? "header" : key === "settings" ? "settings" : "list");
    try { await fn(); } catch (err) { setError(errorText(err)); } finally { setBusy(""); }
  }

  // ---- states before the panel ----------------------------------------------------------------
  if (loading && !data) {
    return (
      <section className="card app-card quick-reply-settings-card" data-accounting-sales="loading">
        <CardTitle icon="docText" eyebrow={providerName} title={t("Sales")} />
        <p className="muted-copy">{t("Loading…")}</p>
      </section>
    );
  }
  if (denied || (data && !data.writeOpen)) return <>{closedPanel}</>;
  if (!data) {
    return (
      <>
        {closedPanel}
        <div className="settings-action-row" data-accounting-sales="error" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <span className="layout-error" style={{ margin: 0 }}>{t("Could not check what is waiting to be sent.")} {loadError}</span>
          <button type="button" className="button secondary" onClick={() => { setLoading(true); void load(); }}>{t("Try again")}</button>
        </div>
      </>
    );
  }

  // ---- the panel --------------------------------------------------------------------------------
  const { connection, canPost, planAllows } = data;
  const isWriter = connection.mode === "primary_write";
  const needsXeroConsent = provider === "xero" && connection.scopeLevel !== "write";
  const sandbox = connection.environment === "sandbox";
  const lastUpdated = rows.reduce((max, row) => Math.max(max, Number(row.updatedAtMs || 0)), 0);
  const saleOf = (row: PostingRow) => (row.kind === "sale" ? row : row.dependsOn ? byId.get(row.dependsOn) : undefined);

  // A payment can go only with or after its invoice.
  const blockedByInvoice = (row: PostingRow) => {
    if (row.kind === "sale") return false;
    const sale = saleOf(row);
    return Boolean(sale) && !isApprovable(sale as PostingRow) && !SALE_ON_ITS_WAY.has((sale as PostingRow).status);
  };
  const selectable = (row: PostingRow) => canPost && isApprovable(row) && !blockedByInvoice(row);
  const chosen = selected.filter((id) => { const row = byId.get(id); return Boolean(row && selectable(row)); });

  function toggle(row: PostingRow, on: boolean) {
    setApproveFailures([]); setConfirmApprove(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) {
        next.add(row.id);
        // Ticking a payment ticks its invoice when the invoice is waiting too.
        const sale = row.kind === "sale" ? null : saleOf(row);
        if (sale && isApprovable(sale)) next.add(sale.id);
      } else {
        next.delete(row.id);
        // Without its invoice a payment would be refused: they come off together.
        if (row.kind === "sale") for (const other of rows) if (other.dependsOn === row.id) next.delete(other.id);
      }
      return [...next];
    });
  }

  // Groups by order: the sale first, then its payments and refunds.
  const visible = rows.filter((row) => matches(row, activeFilter));
  const groups: { key: string; sale?: PostingRow; rows: PostingRow[]; latest: string }[] = [];
  const groupIndex = new Map<string, number>();
  for (const row of visible) {
    const key = row.orderId || row.dependsOn || row.id;
    if (!groupIndex.has(key)) { groupIndex.set(key, groups.length); groups.push({ key, sale: saleOf(row), rows: [], latest: "" }); }
    const group = groups[groupIndex.get(key) as number];
    group.rows.push(row);
    if (!group.sale) group.sale = saleOf(row);
    if ((row.occurredOn || "") > group.latest) group.latest = row.occurredOn || "";
  }
  for (const group of groups) group.rows.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || String(a.occurredOn).localeCompare(String(b.occurredOn)));
  groups.sort((a, b) => b.latest.localeCompare(a.latest));

  function selectAllVisible() {
    setApproveFailures([]); setConfirmApprove(false);
    const next: string[] = [];
    for (const group of groups) {
      const ids = new Set<string>();
      for (const row of group.rows) {
        if (!selectable(row)) continue;
        ids.add(row.id);
        const sale = row.kind === "sale" ? null : saleOf(row);
        if (sale && isApprovable(sale)) ids.add(sale.id);
      }
      // Whole orders only, so no payment is cut from its invoice at the limit.
      if (next.length + ids.size > MAX_APPROVE) break;
      next.push(...ids);
    }
    setSelected(next);
  }

  const kindLabel = (kind: string) => (kind === "sale" ? t("Invoice") : kind === "refund" ? t("Refund") : t("Payment"));
  // A provider-verified payment came through the processor that holds it: PayPal pay links or Stripe.
  const evidenceLabel = (row: PostingRow) => (row.evidence === "provider" ? (row.method === "paypal" ? "PayPal" : "Stripe") : row.evidence === "bank" ? t("Bank") : row.evidence === "manual" ? t("Manual") : "");
  const choiceNeeded = (row: PostingRow) => row.status === "needs_attention" && (row.attentionReason === "customer_choice_needed" || (!row.attentionReason && row.lastError === "customer_choice_needed"));
  // A problem in words, by the server's attentionReason. Only provider_rejected shows lastError, which
  // is then the provider's own message; our own errors (internal_error) are never shown raw. Rows
  // written before attentionReason existed fall back to reading lastError.
  const problemText = (row: PostingRow) => {
    if (row.status !== "needs_attention" || choiceNeeded(row)) return "";
    const code = row.attentionReason || "";
    const detail = (row.lastError || "").trim();
    if (code === "provider_rejected") return detail && detail !== "provider_rejected" ? `${pt("{provider} rejected it:")} ${detail}` : reasonText("provider_rejected");
    if (code) return reasonText(code);
    if (!detail) return "";
    return known(detail) ? reasonText(detail) : `${pt("{provider} rejected it:")} ${detail}`;
  };
  // Why a sent document is in conflict: the server says; older rows are read from the totals.
  const conflictTotals = (row: PostingRow) => (row.conflictReason ? row.conflictReason === "provider_totals_differ" : totalsDiffer(row));
  const waitingText = (row: PostingRow) => {
    if (row.waitingFor === "invoice") return t("Waiting for its invoice");
    if (row.waitingFor === "invoice_busy") return t("Waiting — another payment on this invoice is being sent");
    if (row.waitingFor === "rate_limit") return pt("Waiting — {provider} asked us to slow down");
    if (row.waitingFor === "switch") return t("Paused — posting is closed");
    if (row.waitingFor === "plan") return t("Paused — needs Pro or Team");
    return "";
  };
  const totalsDiffer = (row: PostingRow) => {
    const totals = row.providerTotals;
    if (!totals) return false;
    if (row.kind !== "sale") return Math.abs(Number(totals.total) - Number(row.amount)) > 0.005;
    const preview = row.preview;
    if (!preview) return false;
    const tolerance = Math.min(0.1, 0.01 * Math.max(1, (preview.lines || []).length)) + 0.0001;
    return Math.abs(Number(totals.total) - Number(preview.expectedTotal)) > 0.005 || Math.abs(Number(totals.tax) - Number(preview.expectedTax)) > tolerance;
  };
  const statusOf = (row: PostingRow): { text: string; tone: Tone } => {
    if (row.providerState === "voided") return { text: pt("Voided in {provider}"), tone: "muted" };
    if (isApprovable(row)) return blockedByInvoice(row) ? { text: t("Waiting for its invoice"), tone: "muted" } : { text: t("Ready to send"), tone: "accent" };
    switch (row.status) {
      case "draft": return { text: t("Needs review"), tone: "muted" };
      case "queued": return { text: t("Sending"), tone: "accent" };
      case "retry": return { text: waitingText(row) || t("Waiting to try again"), tone: "warning" };
      case "needs_attention": return { text: t("Problem"), tone: "danger" };
      case "synced": return { text: t("Sent"), tone: "success" };
      case "reconciled": return { text: t("Sent and checked"), tone: "success" };
      case "conflict": return { text: pt("Differs from {provider}"), tone: "warning" };
      case "ignored": return { text: t("Ignored"), tone: "muted" };
      default: return { text: row.status, tone: "muted" };
    }
  };
  const openUrl = (row: PostingRow) => {
    if (!row.externalId) return null;
    const id = encodeURIComponent(row.externalId);
    if (provider === "quickbooks_online") {
      const host = sandbox ? "https://app.sandbox.qbo.intuit.com" : "https://app.qbo.intuit.com";
      const path = row.kind === "sale" ? "invoice" : row.kind === "refund" ? "refundreceipt" : "recvpayment";
      return { href: `${host}/app/${path}?txnId=${id}`, label: pt("Open in {provider}") };
    }
    if (row.kind === "sale") return { href: `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${id}`, label: pt("Open in {provider}") };
    return { href: "https://go.xero.com/", label: pt("Open {provider}") };
  };

  // ---- actions --------------------------------------------------------------------------------
  async function scan() {
    await act("scan", async () => {
      const result = await accountingPostingScan(companyId, connectionId);
      setScanResult(result);
      await load();
    });
  }

  async function saveSettings() {
    await act("settings", async () => {
      await accountingPostingSettingsSave(companyId, connectionId, provider === "quickbooks_online"
        ? { qboSalesItemId: salesItemDraft, depositAccounts: depositDraft }
        : { xeroInvoiceStatus: invoiceStatusDraft, depositAccounts: depositDraft });
      setNotice(t("Saved. Press Refresh to check the documents again with these settings."));
      await load();
    });
  }

  async function approve() {
    const items = chosen.map((id) => byId.get(id) as PostingRow).map((row) => ({ id: row.id, hash: row.sourceHash }));
    if (!items.length) return;
    await act("approve", async () => {
      const result = await accountingPostingApprove(companyId, connectionId, items);
      const failures = (result.results || []).filter((row) => !row.ok).map((row) => ({ id: row.id, label: (() => { const r = byId.get(row.id); return r ? `${kindLabel(r.kind)} · ${rowTitle(r)}` : row.id; })(), reason: reasonText(row.reason || "") }));
      setApproveFailures(failures);
      setConfirmApprove(false);
      setSelected([]);
      if (result.approved) setNotice(pt("{count} approved — on their way to {provider}.").replace("{count}", String(result.approved)));
      await load();
    });
  }

  async function ignore(row: PostingRow) {
    const reason = ignoreReason.trim();
    if (!reason) return;
    await act(`ignore-${row.id}`, async () => {
      await accountingPostingIgnore(companyId, connectionId, row.id, reason);
      setIgnoreOpen(""); setIgnoreReason("");
      setSelected((prev) => prev.filter((id) => id !== row.id));
      await load();
    });
  }

  async function retry(row: PostingRow, choice?: string) {
    await act(`retry-${row.id}`, async () => {
      await accountingPostingRetry(companyId, connectionId, row.id, choice);
      setNotice(pt("Sending to {provider} again."));
      await load();
    });
  }

  async function resolve(row: PostingRow, action: "keep" | "void") {
    await act(`${action}-${row.id}`, async () => {
      await accountingPostingResolveChange(companyId, connectionId, row.id, action);
      setConfirmVoid("");
      setNotice(action === "keep" ? pt("Kept as it is in {provider}.") : pt("Voiding in {provider}…"));
      await load();
    });
  }

  async function allowXeroWrite() {
    await act("consent", async () => {
      const result = await xeroConnectStart(companyId, "write");
      if (!result.authorizeUrl) throw new Error(t("Could not load."));
      window.location.assign(result.authorizeUrl);
    });
  }

  // ---- summary of the selection, per kind and currency ------------------------------------------
  const selectionSummary = (() => {
    const perKind: Record<string, { count: number; totals: Record<string, number> }> = {};
    for (const id of chosen) {
      const row = byId.get(id);
      if (!row) continue;
      const entry = perKind[row.kind] || (perKind[row.kind] = { count: 0, totals: {} });
      entry.count += 1;
      entry.totals[row.currency || ""] = (entry.totals[row.currency || ""] || 0) + (Number(row.amount) || 0);
    }
    return (["sale", "payment", "refund"] as const).filter((kind) => perKind[kind]).map((kind) => {
      const entry = perKind[kind];
      const label = kind === "sale" ? t("Invoices") : kind === "payment" ? t("Payments") : t("Refunds");
      return `${label}: ${entry.count} · ${Object.entries(entry.totals).map(([currency, total]) => money(total, currency)).join(" + ")}`;
    });
  })();

  const feedback = (area: "header" | "settings" | "list") => (feedbackAt === area && (notice || error) ? (
    <>
      {notice ? <p className="success-copy" style={{ margin: 0 }} role="status">{notice}</p> : null}
      {error ? <p className="layout-error" style={{ margin: 0 }} role="alert">{error}</p> : null}
    </>
  ) : null);

  // ---- settings card (owner) ------------------------------------------------------------------
  const accounts = (catalog?.accounts || []).filter((account) => account.active !== false);
  // The catalogue row is slim (no "payments enabled"); the server reads the full account and says which take payments.
  const payable = (account: AccountingCatalog["accounts"][number]) => String(account.accountType).toUpperCase() === "BANK" || account.enablePaymentsToAccount === true || (data?.payableAccountIds || []).includes(account.externalId);
  const depositOptions = (method: PostingMethod) => {
    // Xero takes a payment only into a bank account or one open to payments; the saved choice always stays listed.
    const list = provider === "xero" ? accounts.filter((account) => payable(account) || account.externalId === depositDraft[method]) : accounts;
    return list.map((account) => <option key={account.externalId} value={account.externalId}>{account.fullyQualifiedName || account.name}{account.accountNumber ? ` (${account.accountNumber})` : ""} · {account.accountType}</option>);
  };
  const settingsCard = isOwner ? (
    <section className="card app-card quick-reply-settings-card" data-accounting-sales="settings">
      <CardTitle icon="finance" eyebrow={t("Settings")} title={pt("How documents go to {provider}")} />
      {!catalogLoaded ? <p className="muted-copy">{t("Loading…")}</p> : !catalog ? <p className="muted-copy">{t("Sync first to load the chart of accounts.")}</p> : (
        <div style={card}>
          {provider === "quickbooks_online" ? (
            <label style={{ fontSize: 12.5, display: "grid", gap: 4 }}>{t("Product or service on invoice lines")}
              <select style={selectStyle} value={salesItemDraft} onChange={(event) => setSalesItemDraft(event.target.value)}>
                <option value="">{t("Not chosen")}</option>
                {(catalog.items || []).filter((item) => item.externalId === salesItemDraft || (item.active !== false && !/^(category|group)$/i.test(item.type || ""))).map((item) => <option key={item.externalId} value={item.externalId}>{item.name}{item.type ? ` · ${item.type}` : ""}</option>)}
              </select>
              <span style={small}>{t("QuickBooks puts a product or service on every invoice line; its income account is where the sale lands.")}</span>
            </label>
          ) : (
            <label style={{ fontSize: 12.5, display: "grid", gap: 4 }}>{t("Invoice status in Xero")}
              <select style={selectStyle} value={invoiceStatusDraft} onChange={(event) => setInvoiceStatusDraft(event.target.value === "DRAFT" ? "DRAFT" : "AUTHORISED")}>
                <option value="AUTHORISED">{t("Approved — payments can be recorded against it")}</option>
                <option value="DRAFT">{t("Draft — your accountant approves it in Xero")}</option>
              </select>
              <span style={small}>{t("Xero cannot record a payment against a draft invoice; payments wait until it is approved there.")}</span>
            </label>
          )}
          <div style={{ display: "grid", gap: 6 }}>
            <strong style={{ fontSize: 12.5 }}>{t("Where payments are deposited")}</strong>
            <span style={small}>{t("Choose an account for each way you take money. “Other” is used for any method left empty.")}{provider === "xero" ? ` ${t("In Xero only a bank account, or one with “Enable payments to this account” ticked, can receive payments.")}` : ""}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              {POSTING_DEPOSIT_METHODS.map((method) => (
                <label key={method} style={{ fontSize: 12.5, display: "grid", gap: 4, minWidth: 0 }}>{methodLabel(method)}
                  <select style={selectStyle} value={depositDraft[method] || ""} onChange={(event) => setDepositDraft((prev) => ({ ...prev, [method]: event.target.value }))}>
                    <option value="">{method === "other" ? t("Not chosen") : t("Use “Other”")}</option>
                    {depositOptions(method)}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div className="settings-action-row">
            <button type="button" className="button secondary" disabled={busy === "settings"} onClick={() => void saveSettings()}>{busy === "settings" ? t("Saving…") : t("Save sending settings")}</button>
          </div>
          {feedback("settings")}
        </div>
      )}
    </section>
  ) : null;

  // ---- one row ----------------------------------------------------------------------------------
  const renderRow = (row: PostingRow, first: boolean) => {
    const status = statusOf(row);
    const reasons = row.reasons || [];
    const open = expanded[row.id] === true;
    const link = SENT.has(row.status) ? openUrl(row) : null;
    const number = row.externalNumber || row.providerTotals?.number || "";
    const evidence = row.kind === "sale" ? "" : evidenceLabel(row);
    const showReasons = (row.status === "draft" || row.status === "ready") && reasons.length > 0;
    const problem = problemText(row);
    const retryNote = row.status === "retry" && !row.waitingFor
      ? `${reasonText(row.lastError === "rate_limit" ? "rate_limit" : "no_answer")}${row.nextAttemptAtMs ? ` ${t("Next try:")} ${when(row.nextAttemptAtMs)}` : ""}` : "";
    const conflictNote = row.status === "conflict" ? (conflictTotals(row) ? reasonText("provider_totals_differ") : reasonText("provider_conflict")) : "";
    const checkable = selectable(row);
    const canIgnore = isOwner && ["draft", "ready", "needs_attention", "retry"].includes(row.status) && !row.externalId;
    const canRetry = isOwner && canPost && ["needs_attention", "retry"].includes(row.status) && Boolean(row.approvedAtMs) && !choiceNeeded(row);
    const choosing = isOwner && canPost && choiceNeeded(row);
    const canKeep = isOwner && SENT.has(row.status) && (Boolean(row.changed) || row.status === "conflict");
    const canVoid = isOwner && canPost && SENT.has(row.status) && row.changed?.removed === true && row.kind !== "refund" && row.providerState !== "voided";
    const rowBusy = busy.endsWith(`-${row.id}`);
    return (
      <div key={row.id} data-posting-row={row.id} data-posting-status={row.status} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: first ? 0 : "1px solid rgba(120,120,140,0.14)", minWidth: 0 }}>
        {canPost && isOwner ? (
          isApprovable(row)
            ? <input type="checkbox" aria-label={t("Select")} style={{ marginTop: 3, flex: "0 0 auto", width: 14, height: 14 }} disabled={!checkable || busy === "approve"} checked={checkable && chosen.includes(row.id)} onChange={(event) => toggle(row, event.target.checked)} />
            : <span aria-hidden="true" style={{ flex: "0 0 auto", width: 14 }} />
        ) : null}
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "grid", gap: 5 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap" }}>
            <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
              <span style={badge("muted")}>{kindLabel(row.kind)}</span>
              <strong style={{ fontSize: 13, overflowWrap: "anywhere" }}>{rowTitle(row)}</strong>
            </span>
            <strong style={{ fontSize: 13.5, whiteSpace: "nowrap" }}>{money(row.amount, row.currency)}</strong>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
            <span style={{ opacity: 0.75 }}>{day(row.occurredOn)}</span>
            {evidence ? <span style={badge("muted")}>{evidence}</span> : null}
            <span style={badge(status.tone)}>{status.text}</span>
            {number ? <span style={{ opacity: 0.8 }}>{pt("{provider} no.")} {number}</span> : null}
            {link ? <a href={link.href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontWeight: 700 }}>{link.label}</a> : null}
            {row.postedAtMs ? <span style={{ opacity: 0.65 }}>{t("Sent")} {ago(row.postedAtMs)}</span> : null}
          </div>
          {showReasons ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, display: "grid", gap: 2 }}>
              {reasons.map((code) => <li key={code} style={code === "invoice_number_missing" ? { opacity: 0.8 } : undefined}>{reasonText(code)}</li>)}
            </ul>
          ) : null}
          {isApprovable(row) && blockedByInvoice(row) ? <span style={{ fontSize: 12 }}>{reasonText("approve_invoice_first")}</span> : null}
          {row.status === "queued" && row.approvedAtMs ? <span style={small}>{t("Approved")} {ago(row.approvedAtMs)}</span> : null}
          {retryNote ? <span style={{ fontSize: 12 }}>{retryNote}</span> : null}
          {row.status === "retry" && row.waitingFor && row.nextAttemptAtMs ? <span style={small}>{t("Next try:")} {when(row.nextAttemptAtMs)}</span> : null}
          {problem ? <span className="layout-error" style={{ margin: 0, fontSize: 12 }}>{problem}</span> : null}
          {row.status === "ignored" && row.ignoredReason ? <span style={small}>{t("Reason:")} {row.ignoredReason}</span> : null}
          {conflictNote ? (
            <span style={{ fontSize: 12 }}>
              {conflictNote}
              {conflictTotals(row) && row.providerTotals ? ` ${providerShort}: ${money(row.providerTotals.total, row.currency)}${row.kind === "sale" ? ` (${t("VAT")} ${money(row.providerTotals.tax, row.currency)})` : ""} · NivaDesk: ${money(row.kind === "sale" ? row.preview?.expectedTotal : row.amount, row.currency)}${row.kind === "sale" ? ` (${t("VAT")} ${money(row.preview?.expectedTax, row.currency)})` : ""}` : ""}
            </span>
          ) : null}
          {row.changed ? (
            <span style={{ ...badge("warning"), whiteSpace: "normal", justifySelf: "start", borderRadius: 8 }}>
              {row.changed.removed
                ? pt("Removed in NivaDesk after it was sent to {provider}.")
                : `${pt("Changed in NivaDesk after it was sent to {provider}.")} ${t("Now:")} ${titleOf(row.kind, row.changed.label, row.docNumber, row.method)} · ${money(row.changed.amount, row.currency)}`}
            </span>
          ) : null}

          {choosing ? (
            <div style={softBox}>
              <strong style={{ fontSize: 12.5 }}>{pt("Choose the customer in {provider}.")}</strong>
              <span style={small}>{pt("More than one {provider} customer could be this person. Choose one, or create a new customer.")}</span>
              {(row.customerCandidates || []).map((candidate) => (
                <label key={candidate.externalId} style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "flex-start", minWidth: 0 }}>
                  <input type="radio" name={`customer-${row.id}`} checked={customerChoice[row.id] === candidate.externalId} onChange={() => setCustomerChoice((prev) => ({ ...prev, [row.id]: candidate.externalId }))} />
                  <span style={{ overflowWrap: "anywhere" }}>{candidate.displayName || candidate.externalId}{candidate.email ? <span style={{ opacity: 0.7 }}> · {candidate.email}</span> : null}</span>
                </label>
              ))}
              <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center" }}>
                <input type="radio" name={`customer-${row.id}`} checked={customerChoice[row.id] === "new"} onChange={() => setCustomerChoice((prev) => ({ ...prev, [row.id]: "new" }))} /> {pt("Create a new customer in {provider}")}
              </label>
              <div className="settings-action-row">
                <button type="button" className="button" disabled={rowBusy || !customerChoice[row.id]} onClick={() => void retry(row, customerChoice[row.id])}>{busy === `retry-${row.id}` ? t("Loading…") : t("Use this and send")}</button>
              </div>
            </div>
          ) : null}

          {open && row.preview ? (
            <div style={softBox} data-posting-preview={row.id}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>{t("Description")}</th><th style={{ ...th, textAlign: "right" }}>{t("Qty")}</th><th style={{ ...th, textAlign: "right" }}>{t("Amount")}</th></tr></thead>
                  <tbody>
                    {(row.preview.lines || []).map((line, index) => (
                      <tr key={index}>
                        <td style={td}>{line.description}</td>
                        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{line.quantity}</td>
                        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{money(line.amount, row.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "3px 12px", margin: 0, fontSize: 12.5 }}>
                {row.kind === "sale" ? (
                  <>
                    <dt>{pt("VAT {provider} will calculate")}</dt><dd style={{ margin: 0, textAlign: "right" }}>{money(row.preview.expectedTax, row.currency)}</dd>
                    <dt>{t("VAT in NivaDesk")}</dt><dd style={{ margin: 0, textAlign: "right" }}>{money(row.preview.nivadeskVat, row.currency)}</dd>
                    <dt style={Math.abs(Number(row.preview.vatDifference) || 0) > 0.0049 ? { fontWeight: 800 } : undefined}>{t("Difference")}</dt>
                    <dd style={{ margin: 0, textAlign: "right", ...(Math.abs(Number(row.preview.vatDifference) || 0) > 0.0049 ? { fontWeight: 800, background: "var(--warning-soft)", borderRadius: 6, padding: "0 6px" } : {}) }}>{money(row.preview.vatDifference, row.currency)}</dd>
                  </>
                ) : null}
                <dt style={{ fontWeight: 700 }}>{t("Expected total")}</dt><dd style={{ margin: 0, textAlign: "right", fontWeight: 700 }}>{money(row.preview.expectedTotal, row.currency)}</dd>
              </dl>
              {row.kind === "sale" && Math.abs(Number(row.preview.vatDifference) || 0) > 0.0049 ? <span style={small}>{pt("{provider} rounds VAT line by line, so a few pence of difference can be normal. A bigger one is worth a look before you approve.")}</span> : null}
            </div>
          ) : null}

          {ignoreOpen === row.id ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input className="input" style={{ flex: "1 1 200px", fontSize: 12, minWidth: 0 }} autoFocus placeholder={t("Why is this not sent? (required)")} value={ignoreReason} onChange={(event) => setIgnoreReason(event.target.value)} />
              <button type="button" className="button secondary" disabled={rowBusy || !ignoreReason.trim()} onClick={() => void ignore(row)}>{busy === `ignore-${row.id}` ? t("Loading…") : t("Ignore")}</button>
              <button type="button" className="button secondary" onClick={() => { setIgnoreOpen(""); setIgnoreReason(""); }}>{t("Cancel")}</button>
            </div>
          ) : null}

          {confirmVoid === row.id ? (
            <div style={softBox}>
              <span style={{ fontSize: 12.5 }}>{pt("Void this in {provider}? The document stays there, marked void, and its amounts no longer count.")}</span>
              <div className="settings-action-row">
                <button type="button" className="button danger" disabled={rowBusy} onClick={() => void resolve(row, "void")}>{busy === `void-${row.id}` ? t("Loading…") : t("Yes, void it")}</button>
                <button type="button" className="button secondary" onClick={() => setConfirmVoid("")}>{t("Cancel")}</button>
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            {row.preview ? <button type="button" style={linkButton} aria-expanded={open} onClick={() => setExpanded((prev) => ({ ...prev, [row.id]: !open }))}>{open ? t("Hide preview") : t("Show preview")}</button> : null}
            {canRetry ? <button type="button" style={linkButton} disabled={rowBusy} onClick={() => void retry(row)}>{busy === `retry-${row.id}` ? t("Loading…") : t("Try again")}</button> : null}
            {canKeep ? <button type="button" style={linkButton} disabled={rowBusy} onClick={() => void resolve(row, "keep")}>{row.status === "conflict" && !row.changed ? pt("Accept the version in {provider}") : pt("Keep what {provider} has")}</button> : null}
            {canVoid && confirmVoid !== row.id ? <button type="button" style={{ ...linkButton, color: "var(--danger)" }} disabled={rowBusy} onClick={() => setConfirmVoid(row.id)}>{pt("Void in {provider}")}</button> : null}
            {canIgnore && ignoreOpen !== row.id ? <button type="button" style={{ ...linkButton, color: "inherit", opacity: 0.75 }} onClick={() => { setIgnoreOpen(row.id); setIgnoreReason(""); }}>{t("Ignore")}</button> : null}
          </div>
        </div>
      </div>
    );
  };

  const filterLabels: Record<FilterKey, string> = {
    ready: t("Ready"), review: t("Needs review"), sending: t("Sending"), sent: t("Sent"), changed: t("Changed"), problems: t("Problems"), ignored: t("Ignored")
  };
  const tooMany = chosen.length > MAX_APPROVE;

  return (
    <div className="settings-card-stack" data-accounting-sales="open" style={{ minWidth: 0 }}>
      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="docText" eyebrow={providerName} title={pt("Sales to {provider}")} />
        <p className="muted-copy">{pt("Approve what goes to {provider}; nothing is sent without you.")}{isOwner ? ` ${t("Invoices, payments and refunds come from your orders; Refresh brings in new and changed ones.")}` : ""}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 12.5 }}>
          {connection.writeBoundaryDate ? <span>{pt("Books start in {provider} on")} <strong>{day(connection.writeBoundaryDate)}</strong></span> : null}
          {lastUpdated ? <span style={{ opacity: 0.75 }}>{t("Last updated")} {ago(lastUpdated)}</span> : null}
          {sandbox ? <span style={badge("muted")}>{t("Sandbox")}</span> : null}
        </div>
        {isOwner ? (
          <div className="settings-action-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="button secondary" disabled={busy === "scan"} onClick={() => void scan()}>{busy === "scan" ? t("Checking orders…") : t("Refresh")}</button>
          </div>
        ) : null}
        {scanResult ? (
          <p style={{ fontSize: 12.5, margin: 0 }} data-accounting-sales="scan-result">
            {t("{orders} orders checked from {date}: {created} new, {refreshed} updated, {changed} changed after sending.")
              .replace("{orders}", String(scanResult.orders)).replace("{date}", day(scanResult.since)).replace("{created}", String(scanResult.created))
              .replace("{refreshed}", String(scanResult.refreshed)).replace("{changed}", String(scanResult.changed))}
            {scanResult.truncated ? ` ${t("Only part of your orders could be read this time; refresh again later.")}` : ""}
          </p>
        ) : null}
        {feedback("header")}
        {loadError ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="layout-error" style={{ margin: 0 }}>{t("Could not load the list.")} {loadError}</span>
            <button type="button" className="button secondary" onClick={() => void load()}>{t("Try again")}</button>
          </div>
        ) : null}

        {needsXeroConsent ? (
          <div style={softBox} data-accounting-sales="xero-consent">
            <span style={{ fontSize: 12.5 }}>{reasonText("xero_write_permission_missing")} {isOwner ? pt("You approve it on {provider}'s screen and come back here.") : null}</span>
            {isOwner ? <div className="settings-action-row"><button type="button" className="button" disabled={busy === "consent"} onClick={() => void allowXeroWrite()}>{busy === "consent" ? t("Loading…") : pt("Allow NivaDesk to write to {provider}")}</button></div> : null}
          </div>
        ) : null}
        {!isWriter ? (
          <div style={softBox} data-accounting-sales="not-writer">
            <span style={{ fontSize: 12.5 }}>{pt("Sending needs this connection set as the accounting writer, with the date your books start in {provider}.")}</span>
            {isOwner ? <div className="settings-action-row"><button type="button" className="button secondary" onClick={onOpenSetup}>{t("Open setup")}</button></div> : null}
          </div>
        ) : null}
        {!planAllows ? <div style={softBox} data-accounting-sales="plan"><span style={{ fontSize: 12.5 }}>{t("Sending is part of NivaDesk Pro and Team.")}</span></div> : null}
        {!isOwner ? <p style={{ ...small, margin: 0 }} data-accounting-sales="read-only">{t("You can see what is waiting and what was sent. Only the workspace owner approves and sends.")}</p> : null}
      </section>

      {settingsCard}

      <section className="card app-card quick-reply-settings-card" data-accounting-sales="list">
        {feedback("list")}
        <div role="group" aria-label={t("Sales")} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTER_ORDER.map((key) => (
            <button key={key} type="button" aria-pressed={activeFilter === key} data-filter={key} style={chip(activeFilter === key)} onClick={() => setFilter(key)}>
              {filterLabels[key]} <span style={{ opacity: 0.7 }}>{counts[key]}</span>
            </button>
          ))}
        </div>

        {isOwner && canPost && activeFilter === "ready" && counts.ready > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div className="settings-action-row" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <button type="button" className="button" disabled={!chosen.length || tooMany || busy === "approve"} onClick={() => { setApproveFailures([]); setConfirmApprove(true); }}>
                {t("Approve and send ({count})").replace("{count}", String(chosen.length))}
              </button>
              <button type="button" style={linkButton} onClick={() => (chosen.length ? setSelected([]) : selectAllVisible())}>{chosen.length ? t("Clear selection") : t("Select all ready")}</button>
              {tooMany ? <span style={{ fontSize: 12 }}>{t("Approve at most 50 at a time.")}</span> : null}
            </div>
            {confirmApprove && chosen.length ? (
              <div style={{ ...softBox, borderColor: "var(--accent)" }} role="group" aria-label={t("Approve and send")} data-accounting-sales="confirm">
                <strong style={{ fontSize: 13 }}>{chosen.length === 1 ? pt("Send 1 document to {provider}?") : pt("Send {count} documents to {provider}?").replace("{count}", String(chosen.length))}</strong>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{selectionSummary.map((line) => <li key={line}>{line}</li>)}</ul>
                <span style={small}>{pt("Each document goes to {provider} once, as the preview shows it. An order that changed since you looked is held back for you to see again.")}</span>
                <div className="settings-action-row">
                  <button type="button" className="button" disabled={busy === "approve"} onClick={() => void approve()}>{busy === "approve" ? t("Sending…") : t("Yes, send")}</button>
                  <button type="button" className="button secondary" onClick={() => setConfirmApprove(false)}>{t("Cancel")}</button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {approveFailures.length ? (
          <div style={{ ...softBox, borderColor: "var(--danger)" }} data-accounting-sales="approve-failures">
            <strong style={{ fontSize: 12.5 }}>{t("Not approved:")}</strong>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{approveFailures.map((row) => <li key={row.id} style={{ overflowWrap: "anywhere" }}>{row.label}: {row.reason}</li>)}</ul>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="muted-copy" data-accounting-sales="empty">{isOwner ? t("Nothing to send for this period — press Refresh.") : t("Nothing to send for this period.")}</p>
        ) : groups.length === 0 ? (
          <p className="muted-copy">{t("Nothing in this list.")}</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {groups.map((group) => {
              const saleShown = group.rows.some((row) => row.kind === "sale");
              return (
                <div key={group.key} data-posting-order={group.key} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "4px 12px", minWidth: 0 }}>
                  {!saleShown ? (
                    <div style={{ fontSize: 12, opacity: 0.75, padding: "6px 0", overflowWrap: "anywhere" }}>
                      {group.sale ? `${rowTitle(group.sale)} · ${statusOf(group.sale).text}` : `${t("Order")} ${group.key}`}
                    </div>
                  ) : null}
                  {group.rows.map((row, index) => renderRow(row, index === 0 && saleShown))}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default AccountingSalesPanel;

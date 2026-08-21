"use client";

// Bank spending feed (Open Banking via TrueLayer).
// Owner-only: connect a business bank account, see the live transaction feed.
// Read-only account information — the app can never move money.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { db, functions, storage } from "@/lib/firebase/client";
import { loadWorkspaceContext, loadWorkspaceOrderOptions, type OrderOptionItem, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { detectRecurringSpends, monthlyFixedTotal, recurringMerchantKey, type RecurringSpend } from "@/lib/studioflow/bankInsights";
import { studioT } from "@/lib/studioflow/language";

type BankAccountInfo = { id: string; name: string; currency: string };
type BankConnection = {
  id: string;
  providerName: string;
  providerLogo: string;
  status: string;
  accounts: BankAccountInfo[];
  lastSyncedAt: Date | null;
};
type BankTransaction = {
  id: string;
  amount: number;
  currency: string;
  bookingDate: string;
  description: string;
  counterparty: string;
  status: string;
  receiptPath: string;
  receiptName: string;
  linkedOrderId: string;
  linkedOrderLabel: string;
  category: string;
  categoryAuto: string;
  txType: string;
};

// TrueLayer transaction_category → coloured badge (short label, t()'d at
// render time; universal abbreviations like DD/SO/ATM stay as-is).
const TX_TYPE_META: Record<string, { label: string; color: string; translate: boolean }> = {
  PURCHASE: { label: "Card", color: "#2563eb", translate: true },
  POS: { label: "Card", color: "#2563eb", translate: true },
  DIRECT_DEBIT: { label: "DD", color: "#7c3aed", translate: false },
  STANDING_ORDER: { label: "SO", color: "#0e7a55", translate: false },
  TRANSFER: { label: "Transfer", color: "#0f766e", translate: true },
  BILL_PAYMENT: { label: "Bill", color: "#b45309", translate: true },
  ATM: { label: "ATM", color: "#be185d", translate: false },
  CASH: { label: "Cash", color: "#be185d", translate: true },
  FEE_CHARGE: { label: "Fee", color: "#b91c1c", translate: true },
  INTEREST: { label: "Interest", color: "#16a34a", translate: true },
  CREDIT: { label: "Incoming", color: "#16a34a", translate: true },
  DEBIT: { label: "Payment", color: "#6b7280", translate: true }
};
type BankRule = { id: string; keyword: string; category: string };

const BANK_CATEGORIES = [
  "Materials", "Shipping", "Software", "Subscriptions", "Fees",
  "Marketing", "Travel", "Utilities", "Rent", "Staff", "Tax", "Other"
] as const;

// Deterministic, readable chip colour per category name.
const CATEGORY_PALETTE = ["#2563eb", "#0e7a55", "#b45309", "#7c3aed", "#be185d", "#0f766e", "#b91c1c", "#4d7c0f", "#a21caf", "#1d4ed8", "#92400e", "#6b7280"];
function categoryColor(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}
function effectiveCategory(tx: BankTransaction) {
  return tx.category || tx.categoryAuto || "";
}

// Rule-keyword suggestion: the first meaningful word of the merchant name
// ("AMAZON MKTPLC AMZN.CO.UK*123" → "amazon"), so the rule catches every
// variant instead of only the exact string.
function suggestRuleKeyword(tx: BankTransaction): string {
  const base = (tx.counterparty || tx.description).trim().toLowerCase();
  const word = base.split(/[\s*,/]+/).find(part => part.replace(/[^a-zç-ü]/gi, "").length >= 3);
  return (word || base).replace(/[^\p{L}\p{N}. -]/gu, "").slice(0, 60);
}

function toDate(value: unknown): Date | null {
  const v = value as { toDate?: () => Date } | null | undefined;
  return v && typeof v.toDate === "function" ? v.toDate() : null;
}

function BankPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, language } = useAuth();
  const t = (text: string) => studioT(text, language);

  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<"month" | "year">("month");
  // Navigable period: month view walks month by month, year view year by year.
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-based, for month view
  const [linkPickerTxId, setLinkPickerTxId] = useState<string | null>(null);
  const [orderOptions, setOrderOptions] = useState<OrderOptionItem[] | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [pendingAttachTxId, setPendingAttachTxId] = useState<string | null>(null);
  const [rules, setRules] = useState<BankRule[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [showRecurring, setShowRecurring] = useState(true);
  const [categoryPickerTxId, setCategoryPickerTxId] = useState<string | null>(null);
  const [categoryCustomText, setCategoryCustomText] = useState("");
  const [categoryMakeRule, setCategoryMakeRule] = useState(false);
  const [categoryRuleKeyword, setCategoryRuleKeyword] = useState("");
  const [ocrInboxPath, setOcrInboxPath] = useState<string | null>(null);
  const [ocrFileName, setOcrFileName] = useState("");
  const [ocrParsed, setOcrParsed] = useState<{ amount: number; date: string } | null>(null);
  const [ocrCandidates, setOcrCandidates] = useState<Array<{ transactionId: string; score: number; amount: number; currency: string; bookingDate: string; counterparty: string; description: string; hasReceipt: boolean }> | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const context = await loadWorkspaceContext(user.uid);
        if (!cancelled) setWorkspace(context);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load the workspace.");
      } finally {
        if (!cancelled) setWorkspaceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const isOwner = workspace?.role === "owner";
  const companyId = workspace?.id ?? "";

  // Live views over the server-written feed (owner-only per Firestore rules).
  useEffect(() => {
    if (!companyId || !isOwner) return;
    const unsubConnections = onSnapshot(
      collection(db, "companies", companyId, "bankConnections"),
      snap => {
        setConnections(snap.docs.map(doc => {
          const data = doc.data() as Record<string, unknown>;
          return {
            id: doc.id,
            providerName: String(data.providerName || ""),
            providerLogo: String(data.providerLogo || ""),
            status: String(data.status || ""),
            accounts: Array.isArray(data.accounts) ? (data.accounts as BankAccountInfo[]) : [],
            lastSyncedAt: toDate(data.lastSyncedAt)
          };
        }));
      }
    );
    const unsubTransactions = onSnapshot(
      query(collection(db, "companies", companyId, "bankTransactions"), orderBy("bookingDate", "desc")),
      snap => {
        setTransactions(snap.docs.map(doc => {
          const data = doc.data() as Record<string, unknown>;
          return {
            id: doc.id,
            amount: Number(data.amount) || 0,
            currency: String(data.currency || "GBP"),
            bookingDate: String(data.bookingDate || ""),
            description: String(data.description || ""),
            counterparty: String(data.counterparty || ""),
            status: String(data.status || "booked"),
            receiptPath: String(data.receiptPath || ""),
            receiptName: String(data.receiptName || ""),
            linkedOrderId: String(data.linkedOrderId || ""),
            linkedOrderLabel: String(data.linkedOrderLabel || ""),
            category: String(data.category || ""),
            categoryAuto: String(data.categoryAuto || ""),
            txType: String(data.txType || "")
          };
        }));
      }
    );
    const unsubRules = onSnapshot(
      collection(db, "companies", companyId, "bankRules"),
      snap => {
        setRules(snap.docs.map(doc => {
          const data = doc.data() as Record<string, unknown>;
          return { id: doc.id, keyword: String(data.keyword || ""), category: String(data.category || "") };
        }));
      },
      () => setRules([])
    );
    return () => { unsubConnections(); unsubTransactions(); unsubRules(); };
  }, [companyId, isOwner]);

  const call = useCallback(async <T,>(name: string, payload: Record<string, unknown>): Promise<T> => {
    const callable = httpsCallable<Record<string, unknown>, T>(functions, name);
    const result = await callable({ companyId, ...payload });
    return result.data;
  }, [companyId]);

  // Returning from the bank's consent screen: TrueLayer redirects back with
  // ?code=...&state=... — exchange the code for tokens, then clean the URL.
  useEffect(() => {
    if (!companyId || !isOwner) return;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) return;
    let cancelled = false;
    (async () => {
      setBusy("finalize");
      setStatus(t("Finishing the bank connection…"));
      try {
        const result = await call<{ status: string; imported?: number }>("bankFinalizeRequisition", { requisitionId: state, code });
        if (!cancelled) {
          setStatus(result.status === "linked" ? t("Bank connected.") : t("The bank connection is not complete yet."));
        }
      } catch (finalizeError) {
        if (!cancelled) setError(finalizeError instanceof Error ? finalizeError.message : "Could not finish the bank connection.");
      } finally {
        if (!cancelled) {
          setBusy(null);
          router.replace("/bank");
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, isOwner, searchParams]);

  async function connectBank() {
    setBusy("connect");
    setError(null);
    try {
      const result = await call<{ link: string }>("bankCreateRequisition", {});
      window.location.href = result.link;
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Could not start the bank connection.");
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy("sync");
    setError(null);
    setStatus(null);
    try {
      const result = await call<{ synced: number; skipped: number; imported: number }>("bankSyncTransactions", { force: true });
      setStatus(
        result.skipped > 0 && result.synced === 0
          ? t("Already up to date — banks limit how often transactions can be fetched.")
          : t("Transactions refreshed.")
      );
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Could not refresh transactions.");
    } finally {
      setBusy(null);
    }
  }

  async function removeConnection(connection: BankConnection) {
    if (!window.confirm(t("Disconnect this bank and remove its imported transactions?"))) return;
    setBusy(`delete-${connection.id}`);
    setError(null);
    try {
      await call("bankDeleteConnection", { requisitionId: connection.id });
      setStatus(t("Bank disconnected."));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not disconnect the bank.");
    } finally {
      setBusy(null);
    }
  }

  // ---- Receipt attach / view / remove -------------------------------------

  async function attachReceipt(transaction: BankTransaction, file: File) {
    setBusy(`receipt-${transaction.id}`);
    setError(null);
    try {
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "receipt";
      const path = `companies/${companyId}/bank_receipts/${transaction.id}/${Date.now()}_${safeName}`;
      await uploadBytes(storageRef(storage, path), file);
      await call("bankSetTransactionReceipt", { transactionId: transaction.id, storagePath: path, fileName: file.name });
      setStatus(t("Invoice attached."));
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : "Could not attach the invoice.");
    } finally {
      setBusy(null);
    }
  }

  async function openReceipt(transaction: BankTransaction) {
    try {
      const url = await getDownloadURL(storageRef(storage, transaction.receiptPath));
      window.open(url, "_blank", "noopener");
    } catch {
      setError(t("Could not open the invoice."));
    }
  }

  async function removeReceipt(transaction: BankTransaction) {
    if (!window.confirm(t("Remove this invoice?"))) return;
    setBusy(`receipt-${transaction.id}`);
    try {
      await call("bankSetTransactionReceipt", { transactionId: transaction.id, storagePath: "", fileName: "" });
      setStatus(t("Invoice removed."));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove the invoice.");
    } finally {
      setBusy(null);
    }
  }

  // ---- Link a spending transaction to an order's expenses -----------------

  async function openLinkPicker(transactionId: string) {
    setLinkPickerTxId(transactionId);
    setOrderSearch("");
    if (orderOptions === null && workspace) {
      try {
        setOrderOptions(await loadWorkspaceOrderOptions(companyId, workspace, user?.uid ?? ""));
      } catch {
        setOrderOptions([]);
      }
    }
  }

  async function linkToOrder(transaction: BankTransaction, orderId: string) {
    setBusy(`link-${transaction.id}`);
    setError(null);
    setLinkPickerTxId(null);
    try {
      await call("bankLinkTransactionToOrder", { transactionId: transaction.id, orderId });
      setStatus(t("Added to the order's expenses."));
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Could not link the transaction.");
    } finally {
      setBusy(null);
    }
  }

  async function unlinkFromOrder(transaction: BankTransaction) {
    if (!window.confirm(t("Remove this amount from the order's expenses?"))) return;
    setBusy(`link-${transaction.id}`);
    setError(null);
    try {
      await call("bankLinkTransactionToOrder", { transactionId: transaction.id });
      setStatus(t("Removed from the order's expenses."));
    } catch (unlinkError) {
      setError(unlinkError instanceof Error ? unlinkError.message : "Could not unlink the transaction.");
    } finally {
      setBusy(null);
    }
  }

  // ---- Receipt OCR matching ----------------------------------------------

  async function startReceiptMatch(file: File) {
    setBusy("ocr");
    setError(null);
    setStatus(t("Reading the receipt…"));
    setOcrCandidates(null);
    try {
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "receipt.jpg";
      const path = `companies/${companyId}/bank_receipts/_inbox/${Date.now()}_${safeName}`;
      await uploadBytes(storageRef(storage, path), file);
      const result = await call<{ parsed: { amount: number; date: string }; candidates: NonNullable<typeof ocrCandidates> }>("bankMatchReceipt", { storagePath: path });
      setOcrInboxPath(path);
      setOcrFileName(file.name);
      setOcrParsed(result.parsed);
      setOcrCandidates(result.candidates);
      setStatus(null);
    } catch (ocrError) {
      setError(ocrError instanceof Error ? ocrError.message : "Could not read the receipt.");
      setStatus(null);
    } finally {
      setBusy(null);
    }
  }

  async function confirmReceiptMatch(transactionId: string) {
    if (!ocrInboxPath) return;
    setBusy("ocr-assign");
    setError(null);
    try {
      await call("bankAssignInboxReceipt", { storagePath: ocrInboxPath, transactionId, fileName: ocrFileName });
      setStatus(t("Invoice attached."));
      setOcrInboxPath(null);
      setOcrCandidates(null);
      setOcrParsed(null);
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Could not attach the invoice.");
    } finally {
      setBusy(null);
    }
  }

  async function cancelReceiptMatch() {
    if (ocrInboxPath) {
      try { await deleteObject(storageRef(storage, ocrInboxPath)); } catch { /* already gone */ }
    }
    setOcrInboxPath(null);
    setOcrCandidates(null);
    setOcrParsed(null);
  }

  // ---- Categories & rules -------------------------------------------------

  async function applyCategory(transaction: BankTransaction, category: string) {
    setBusy(`cat-${transaction.id}`);
    setError(null);
    setCategoryPickerTxId(null);
    const keyword = categoryRuleKeyword.trim().toLowerCase().slice(0, 120);
    try {
      await call("bankSetTransactionCategory", { transactionId: transaction.id, category });
      if (categoryMakeRule && category && keyword.length >= 2) {
        await call("bankSaveRule", { keyword, category });
        setStatus(t("Category saved and rule created."));
      } else {
        setStatus(category ? t("Category saved.") : t("Category cleared."));
      }
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : "Could not save the category.");
    } finally {
      setBusy(null);
      setCategoryMakeRule(false);
      setCategoryCustomText("");
    }
  }

  async function deleteRule(rule: BankRule) {
    if (!window.confirm(`${t("Delete this rule?")} (${rule.keyword} → ${t(rule.category)})`)) return;
    setBusy(`rule-${rule.id}`);
    try {
      await call("bankDeleteRule", { ruleId: rule.id });
      setStatus(t("Rule deleted."));
    } catch (ruleError) {
      setError(ruleError instanceof Error ? ruleError.message : "Could not delete the rule.");
    } finally {
      setBusy(null);
    }
  }

  const filteredOrderOptions = useMemo(() => {
    if (!orderOptions) return [];
    const term = orderSearch.trim().toLowerCase();
    const list = term
      ? orderOptions.filter(order => `${order.customerName} ${order.designName}`.toLowerCase().includes(term))
      : orderOptions;
    return list.slice(0, 25);
  }, [orderOptions, orderSearch]);

  const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;
  const isCurrentPeriod = view === "month"
    ? selectedYear === now.getFullYear() && selectedMonth === now.getMonth()
    : selectedYear === now.getFullYear();

  function stepPeriod(direction: -1 | 1) {
    if (view === "year") {
      setSelectedYear(year => Math.min(now.getFullYear(), year + direction));
      return;
    }
    const next = new Date(selectedYear, selectedMonth + direction, 1);
    if (next > now) return;
    setSelectedYear(next.getFullYear());
    setSelectedMonth(next.getMonth());
  }

  const monthTotal = useMemo(() => transactions
    .filter(item => item.bookingDate.startsWith(monthPrefix) && item.amount < 0)
    .reduce((acc, item) => acc + Math.abs(item.amount), 0), [transactions, monthPrefix]);

  // Spending per month of the selected year (outgoing only), for the Year view.
  const yearSeries = useMemo(() => {
    const totals = Array.from({ length: 12 }, () => 0);
    for (const item of transactions) {
      if (item.amount >= 0 || !item.bookingDate.startsWith(String(selectedYear))) continue;
      const month = Number(item.bookingDate.slice(5, 7)) - 1;
      if (month >= 0 && month < 12) totals[month] += Math.abs(item.amount);
    }
    return { year: selectedYear, totals, total: totals.reduce((acc, value) => acc + value, 0) };
  }, [transactions, selectedYear]);

  // The list follows the selected period; anything older stays reachable by
  // switching the tab back.
  const visibleTransactions = useMemo(() => {
    const prefix = view === "month" ? monthPrefix : String(selectedYear);
    return transactions.filter(item => item.bookingDate.startsWith(prefix));
  }, [transactions, view, monthPrefix, selectedYear]);

  // Spending per effective category for the selected period (Year/Month tab).
  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    let total = 0;
    for (const item of visibleTransactions) {
      if (item.amount >= 0) continue;
      const key = effectiveCategory(item) || "__uncategorized__";
      totals.set(key, (totals.get(key) || 0) + Math.abs(item.amount));
      total += Math.abs(item.amount);
    }
    const rows = Array.from(totals.entries())
      .map(([name, amount]) => ({ name, amount, share: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
    return { rows, total };
  }, [visibleTransactions]);

  // Subscriptions & other recurring charges detected from the feed.
  const recurring = useMemo<RecurringSpend[]>(() => detectRecurringSpends(transactions), [transactions]);
  const recurringKeys = useMemo(() => new Set(recurring.filter(item => item.active).map(item => item.key)), [recurring]);
  const fixedMonthly = useMemo(() => monthlyFixedTotal(recurring), [recurring]);

  const money = (value: number, currency: string) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "GBP" }).format(value);

  if (loading || workspaceLoading) return <LoadingScreen />;
  if (!user) return null;

  return (
    <AppShell>
      <section className="app-card" style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>🏦 {t("Bank Spending")}</h1>
          <span style={{ fontSize: 11, opacity: 0.65 }}>
            {t("Read-only Open Banking feed — NivaDesk can never move money.")}
          </span>
          <span style={{ flex: 1 }} />
          {isOwner && connections.some(item => item.status === "linked") ? (
            <>
              <input type="file" accept="image/*" id="bank-ocr-input" style={{ display: "none" }}
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void startReceiptMatch(file);
                }} />
              <button type="button" className="finance-payments-add" disabled={busy === "ocr"}
                onClick={() => document.getElementById("bank-ocr-input")?.click()}>
                {busy === "ocr" ? t("Reading the receipt…") : `📷 ${t("Match a receipt")}`}
              </button>
              <button type="button" className="finance-payments-add" disabled={busy === "sync"} onClick={() => void refresh()}>
                {busy === "sync" ? t("Refreshing…") : t("Refresh")}
              </button>
            </>
          ) : null}
          {isOwner ? (
            <button type="button" className="finance-payments-add" disabled={busy === "connect"} onClick={() => void connectBank()}>
              {busy === "connect" ? t("Opening your bank…") : `+ ${t("Connect bank")}`}
            </button>
          ) : null}
        </div>

        {!isOwner ? (
          <p style={{ marginTop: 16, fontSize: 13, opacity: 0.75 }}>
            {t("Bank connections are managed by the workspace owner.")}
          </p>
        ) : null}

        {status ? <p style={{ marginTop: 10, fontSize: 12, color: "#16a34a", fontWeight: 600 }}>{status}</p> : null}
        {error ? <p style={{ marginTop: 10, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>{error}</p> : null}

        {ocrCandidates !== null ? (
          <div style={{ marginTop: 14, border: "1px solid rgba(120,120,140,0.25)", borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 13 }}>📷 {ocrFileName}</strong>
              {ocrParsed && ocrParsed.amount > 0 ? (
                <span style={{ fontSize: 12, opacity: 0.75 }}>
                  {t("Detected")}: <strong>{money(ocrParsed.amount, transactions[0]?.currency || "GBP")}</strong>
                  {ocrParsed.date ? ` · ${ocrParsed.date}` : ""}
                </span>
              ) : <span style={{ fontSize: 12, opacity: 0.75 }}>{t("No amount detected on the receipt.")}</span>}
              <span style={{ flex: 1 }} />
              <button type="button" className="finance-payments-delete" onClick={() => void cancelReceiptMatch()} aria-label={t("Close")}>✕</button>
            </div>
            {ocrCandidates.length === 0 ? (
              <p style={{ fontSize: 12.5, opacity: 0.75, margin: "10px 0 0" }}>{t("No matching transaction found — you can attach it manually with the 📎 button on a row.")}</p>
            ) : (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {ocrCandidates.map(candidate => (
                  <div key={candidate.transactionId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", border: "1px solid rgba(120,120,140,0.18)", borderRadius: 9 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {candidate.counterparty || candidate.description || "—"}
                        {candidate.hasReceipt ? <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.6 }}>📎</span> : null}
                      </div>
                      <div style={{ fontSize: 10.5, opacity: 0.6 }}>{candidate.bookingDate}</div>
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: "#dc2626", fontVariantNumeric: "tabular-nums" }}>
                      −{money(Math.abs(candidate.amount), candidate.currency)}
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.6, minWidth: 34, textAlign: "right" }}>{Math.min(99, candidate.score)}%</span>
                    <button type="button" className="finance-payments-add" disabled={busy === "ocr-assign"}
                      onClick={() => void confirmReceiptMatch(candidate.transactionId)}>
                      {t("Attach")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {isOwner && connections.length > 0 ? (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {connections.map(connection => (
              <div key={connection.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(120,120,140,0.2)" }}>
                {connection.providerLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={connection.providerLogo} alt="" width={24} height={24} style={{ borderRadius: 6 }} />
                ) : <span aria-hidden="true">🏦</span>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{connection.providerName || t("Bank")}</div>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>
                    {connection.status === "linked"
                      ? `${connection.accounts.length} ${t("account(s)")}${connection.lastSyncedAt ? ` · ${t("Last sync")}: ${connection.lastSyncedAt.toLocaleString()}` : ""}`
                      : t("Waiting for bank consent…")}
                  </div>
                </div>
                <button
                  type="button"
                  className="finance-payments-delete"
                  disabled={busy === `delete-${connection.id}`}
                  onClick={() => void removeConnection(connection)}
                  aria-label={t("Disconnect")}
                  title={t("Disconnect")}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {isOwner && recurring.length > 0 ? (
          <div style={{ marginTop: 16, border: "1px solid rgba(120,120,140,0.2)", borderRadius: 12, padding: "12px 14px" }}>
            <button type="button" onClick={() => setShowRecurring(value => !value)}
              style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13, fontWeight: 800, padding: 0, display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
              <span aria-hidden="true">{showRecurring ? "▾" : "▸"}</span>
              ↻ {t("Recurring spending")}
              <span style={{ fontSize: 12, fontWeight: 700, color: "#b45309", marginLeft: 4 }}>
                ≈ {money(fixedMonthly, transactions[0]?.currency || "GBP")} / {t("month")}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 600 }}>{recurring.length}</span>
            </button>
            {showRecurring ? (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column" }}>
                {recurring.map(item => (
                  <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 2px", borderBottom: "1px solid rgba(120,120,140,0.12)", opacity: item.active ? 1 : 0.5 }}>
                    <span aria-hidden="true" style={{ fontSize: 13 }}>↻</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.merchant}
                        {!item.active ? <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, opacity: 0.8 }}>({t("possibly cancelled")})</span> : null}
                      </div>
                      <div style={{ fontSize: 10.5, opacity: 0.6 }}>
                        {t(item.cadence === "weekly" ? "Weekly" : item.cadence === "yearly" ? "Yearly" : "Monthly")}
                        {" · "}{item.occurrences}× · {t("Next expected")}: {item.nextExpected}
                      </div>
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {money(item.typicalAmount, item.currency)}
                      <span style={{ fontSize: 10, opacity: 0.55, fontWeight: 600 }}> /{t(item.cadence === "weekly" ? "week" : item.cadence === "yearly" ? "year" : "month")}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {isOwner && rules.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={() => setShowRules(value => !value)}
              style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12, fontWeight: 700, opacity: 0.75, padding: 0 }}>
              {showRules ? "▾" : "▸"} {t("Rules")} ({rules.length})
            </button>
            {showRules ? (
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                {rules.map(rule => (
                  <div key={rule.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "4px 8px", border: "1px solid rgba(120,120,140,0.18)", borderRadius: 8 }}>
                    <span style={{ opacity: 0.7 }}>"{rule.keyword}"</span>
                    <span aria-hidden="true">→</span>
                    <span style={{ fontWeight: 700, color: categoryColor(rule.category) }}>{t(rule.category)}</span>
                    <span style={{ flex: 1 }} />
                    <button type="button" className="finance-payments-delete" disabled={busy === `rule-${rule.id}`}
                      onClick={() => void deleteRule(rule)} aria-label={t("Delete this rule?")}>✕</button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {isOwner ? (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>{t("Transactions")}</h2>
              <div role="tablist" aria-label={t("Spending period")} style={{ display: "inline-flex", gap: 2, background: "rgba(120,120,140,0.12)", borderRadius: 8, padding: 2 }}>
                {(["month", "year"] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={view === option}
                    onClick={() => setView(option)}
                    style={{
                      border: 0, cursor: "pointer", fontSize: 11.5, fontWeight: 700,
                      padding: "4px 12px", borderRadius: 6,
                      background: view === option ? "#2563eb" : "transparent",
                      color: view === option ? "#fff" : "inherit"
                    }}
                  >
                    {option === "month" ? t("Monthly") : t("Yearly")}
                  </button>
                ))}
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <button type="button" className="finance-payments-delete" onClick={() => stepPeriod(-1)} aria-label={t("Previous period")}>‹</button>
                <strong style={{ fontSize: 12.5, minWidth: 92, textAlign: "center" }}>
                  {view === "month"
                    ? new Date(selectedYear, selectedMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })
                    : selectedYear}
                </strong>
                <button type="button" className="finance-payments-delete" onClick={() => stepPeriod(1)} disabled={isCurrentPeriod} aria-label={t("Next period")} style={{ opacity: isCurrentPeriod ? 0.3 : 1 }}>›</button>
              </span>
              {transactions.length > 0 ? (
                <span style={{ fontSize: 11.5, opacity: 0.75 }}>
                  {view === "month"
                    ? <>{t("spending")}: <strong>{money(monthTotal, transactions[0]?.currency || "GBP")}</strong></>
                    : <>{t("spending")}: <strong>{money(yearSeries.total, transactions[0]?.currency || "GBP")}</strong></>}
                </span>
              ) : null}
            </div>

            {view === "year" && transactions.length > 0 ? (
              <div style={{ marginTop: 14, border: "1px solid rgba(120,120,140,0.2)", borderRadius: 10, padding: "14px 14px 8px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
                  {yearSeries.totals.map((value, index) => {
                    const max = Math.max(...yearSeries.totals, 1);
                    const height = Math.max(value > 0 ? 4 : 0, Math.round((value / max) * 100));
                    const isCurrent = selectedYear === new Date().getFullYear() && index === new Date().getMonth();
                    return (
                      <div key={index} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}
                        title={`${new Date(yearSeries.year, index, 1).toLocaleDateString(undefined, { month: "long" })}: ${money(value, transactions[0]?.currency || "GBP")}`}>
                        <div style={{
                          width: "100%", maxWidth: 34, height, borderRadius: "4px 4px 0 0",
                          background: isCurrent ? "#2563eb" : "rgba(37,99,235,0.35)",
                          transition: "height 0.2s ease"
                        }} />
                        <span style={{ fontSize: 9.5, opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
                          {new Date(yearSeries.year, index, 1).toLocaleDateString(undefined, { month: "narrow" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {categoryBreakdown.rows.length > 0 ? (
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {categoryBreakdown.rows.map(row => {
                  const isUncategorized = row.name === "__uncategorized__";
                  const label = isUncategorized ? t("Uncategorised") : t(row.name);
                  const color = isUncategorized ? "#9ca3af" : categoryColor(row.name);
                  return (
                    <span key={row.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 650, border: "1px solid rgba(120,120,140,0.2)", borderRadius: 999, padding: "4px 10px" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />
                      {label}
                      <strong style={{ fontVariantNumeric: "tabular-nums" }}>{money(row.amount, transactions[0]?.currency || "GBP")}</strong>
                      <span style={{ opacity: 0.55 }}>{row.share.toFixed(0)}%</span>
                    </span>
                  );
                })}
              </div>
            ) : null}

                        {transactions.length === 0 ? (
              <p style={{ fontSize: 12.5, opacity: 0.7, marginTop: 10 }}>
                {connections.length === 0
                  ? t("Connect your business bank to see spending here as it happens.")
                  : t("No transactions imported yet. Try Refresh.")}
              </p>
            ) : (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column" }}>
                {visibleTransactions.length === 0 ? (
                  <p style={{ fontSize: 12.5, opacity: 0.7 }}>{t("No transactions in this period yet.")}</p>
                ) : null}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  style={{ display: "none" }}
                  id="bank-receipt-input"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    const target = visibleTransactions.find(item => item.id === pendingAttachTxId);
                    event.target.value = "";
                    setPendingAttachTxId(null);
                    if (file && target) void attachReceipt(target, file);
                  }}
                />
                {visibleTransactions.slice(0, 300).map(transaction => (
                  <div key={transaction.id} style={{ borderBottom: "1px solid rgba(120,120,140,0.14)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {transaction.amount < 0 && recurringKeys.has(recurringMerchantKey(transaction)) ? (
                            <span aria-hidden="true" title={t("Recurring spending")} style={{ marginRight: 5, fontSize: 11, opacity: 0.7 }}>↻</span>
                          ) : null}
                          {transaction.counterparty || transaction.description || "—"}
                          {transaction.linkedOrderId ? (
                            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#2563eb", background: "rgba(37,99,235,0.1)", borderRadius: 999, padding: "1px 8px" }}>
                              ⛓ {transaction.linkedOrderLabel || t("Order")}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 10.5, opacity: 0.6 }}>
                          {transaction.bookingDate}
                          {transaction.counterparty && transaction.description ? ` · ${transaction.description}` : ""}
                          {transaction.status === "pending" ? ` · ${t("pending")}` : ""}
                        </div>
                      </div>
                      {transaction.amount < 0 ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {(() => {
                            const category = effectiveCategory(transaction);
                            const color = category ? categoryColor(category) : "";
                            return (
                              <button type="button"
                                title={t("Set category")}
                                aria-label={t("Set category")}
                                disabled={busy === `cat-${transaction.id}`}
                                onClick={() => {
                                  setCategoryPickerTxId(current => current === transaction.id ? null : transaction.id);
                                  setCategoryMakeRule(false);
                                  setCategoryCustomText("");
                                  setCategoryRuleKeyword(suggestRuleKeyword(transaction));
                                }}
                                style={category ? {
                                  border: 0, cursor: "pointer", fontSize: 10, fontWeight: 700, borderRadius: 999,
                                  padding: "2px 9px", background: `${color}1a`, color
                                } : {
                                  border: "1px dashed rgba(120,120,140,0.45)", cursor: "pointer", fontSize: 10, fontWeight: 700,
                                  borderRadius: 999, padding: "2px 9px", background: "transparent", color: "inherit", opacity: 0.6
                                }}>
                                {category ? t(category) : `+ ${t("Category")}`}
                              </button>
                            );
                          })()}
                          {transaction.receiptPath ? (
                            <>
                              <button type="button" className="finance-payments-delete" title={transaction.receiptName || t("View invoice")}
                                onClick={() => void openReceipt(transaction)} aria-label={t("View invoice")}>📎</button>
                              <button type="button" className="finance-payments-delete" title={t("Remove invoice")}
                                disabled={busy === `receipt-${transaction.id}`}
                                onClick={() => void removeReceipt(transaction)} aria-label={t("Remove invoice")}
                                style={{ fontSize: 10 }}>✕</button>
                            </>
                          ) : (
                            <button type="button" className="finance-payments-delete"
                              title={t("Attach invoice")} aria-label={t("Attach invoice")}
                              disabled={busy === `receipt-${transaction.id}`}
                              onClick={() => {
                                setPendingAttachTxId(transaction.id);
                                document.getElementById("bank-receipt-input")?.click();
                              }}
                              style={{ opacity: 0.55 }}>📎</button>
                          )}
                          <button type="button" className="finance-payments-delete"
                            title={transaction.linkedOrderId ? t("Remove this amount from the order's expenses?") : t("Add to an order's expenses")}
                            aria-label={t("Add to an order's expenses")}
                            disabled={busy === `link-${transaction.id}`}
                            onClick={() => transaction.linkedOrderId
                              ? void unlinkFromOrder(transaction)
                              : void openLinkPicker(transaction.id)}
                            style={{ opacity: transaction.linkedOrderId ? 1 : 0.55 }}>⛓</button>
                          {!transaction.receiptPath && !transaction.linkedOrderId ? (
                            <span title={t("No document")} aria-label={t("No document")}
                              style={{ width: 6, height: 6, borderRadius: 999, background: "#f59e0b", display: "inline-block" }} />
                          ) : null}
                        </span>
                      ) : null}
                      {TX_TYPE_META[transaction.txType] ? (() => {
                        const meta = TX_TYPE_META[transaction.txType];
                        return (
                          <span title={transaction.txType} style={{
                            fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase",
                            padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap",
                            background: `${meta.color}1c`, color: meta.color
                          }}>
                            {meta.translate ? t(meta.label) : meta.label}
                          </span>
                        );
                      })() : null}
                      <span style={{ fontSize: 13, fontWeight: 800, color: transaction.amount < 0 ? "#dc2626" : "#16a34a", whiteSpace: "nowrap", minWidth: 86, textAlign: "right" }}>
                        {transaction.amount < 0 ? "−" : "+"}{money(Math.abs(transaction.amount), transaction.currency)}
                      </span>
                    </div>
                    {categoryPickerTxId === transaction.id ? (
                      <div style={{ margin: "0 4px 10px", padding: 10, border: "1px solid rgba(120,120,140,0.25)", borderRadius: 10 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {BANK_CATEGORIES.map(option => (
                            <button key={option} type="button"
                              onClick={() => void applyCategory(transaction, option)}
                              style={{ border: 0, cursor: "pointer", fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "4px 11px", background: `${categoryColor(option)}1a`, color: categoryColor(option) }}>
                              {t(option)}
                            </button>
                          ))}
                          {effectiveCategory(transaction) ? (
                            <button type="button" onClick={() => void applyCategory(transaction, "")}
                              style={{ border: "1px solid rgba(120,120,140,0.35)", cursor: "pointer", fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "4px 11px", background: "transparent", color: "inherit", opacity: 0.7 }}>
                              {t("Clear category")}
                            </button>
                          ) : null}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                          <input type="text" value={categoryCustomText}
                            placeholder={t("Custom category")}
                            onChange={event => setCategoryCustomText(event.target.value)}
                            onKeyDown={event => {
                              if (event.key === "Enter" && categoryCustomText.trim()) void applyCategory(transaction, categoryCustomText.trim().slice(0, 60));
                              if (event.key === "Escape") setCategoryPickerTxId(null);
                            }}
                            style={{ flex: "1 1 140px", fontSize: 12, padding: "5px 9px", borderRadius: 7, border: "1px solid rgba(120,120,140,0.35)", background: "transparent", color: "inherit" }} />
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, cursor: "pointer", flexWrap: "wrap" }}>
                            <input type="checkbox" checked={categoryMakeRule} onChange={event => setCategoryMakeRule(event.target.checked)} />
                            {t("Rule: whenever it contains")}
                            <input type="text" value={categoryRuleKeyword}
                              onChange={event => { setCategoryRuleKeyword(event.target.value); if (event.target.value.trim().length >= 2) setCategoryMakeRule(true); }}
                              onClick={event => event.stopPropagation()}
                              placeholder={t("keyword")}
                              style={{ width: 110, fontSize: 11.5, fontWeight: 700, padding: "3px 7px", borderRadius: 6, border: "1px solid rgba(120,120,140,0.35)", background: "transparent", color: "inherit" }} />
                          </label>
                          <button type="button" className="finance-payments-delete" onClick={() => setCategoryPickerTxId(null)} aria-label={t("Close")}>✕</button>
                        </div>
                      </div>
                    ) : null}
                                        {linkPickerTxId === transaction.id ? (
                      <div style={{ margin: "0 4px 10px", padding: 10, border: "1px solid rgba(120,120,140,0.25)", borderRadius: 10 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="text"
                            value={orderSearch}
                            autoFocus
                            placeholder={t("Search orders")}
                            onChange={event => setOrderSearch(event.target.value)}
                            style={{ flex: 1, fontSize: 12.5, padding: "6px 9px", borderRadius: 7, border: "1px solid rgba(120,120,140,0.35)", background: "transparent", color: "inherit" }}
                          />
                          <button type="button" className="finance-payments-delete" onClick={() => setLinkPickerTxId(null)} aria-label={t("Close")}>✕</button>
                        </div>
                        <div style={{ marginTop: 8, maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                          {orderOptions === null ? (
                            <span style={{ fontSize: 12, opacity: 0.7 }}>{t("Loading…")}</span>
                          ) : filteredOrderOptions.length === 0 ? (
                            <span style={{ fontSize: 12, opacity: 0.7 }}>{t("No orders found.")}</span>
                          ) : filteredOrderOptions.map(order => (
                            <button
                              key={order.id}
                              type="button"
                              onClick={() => void linkToOrder(transaction, order.id)}
                              style={{ textAlign: "left", border: 0, background: "transparent", color: "inherit", cursor: "pointer", padding: "6px 4px", borderRadius: 6, fontSize: 12.5 }}
                            >
                              <strong>{order.customerName}</strong>
                              {order.designName ? <span style={{ opacity: 0.65 }}> · {order.designName}</span> : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

export default function BankPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <BankPageContent />
    </Suspense>
  );
}

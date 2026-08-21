"use client";

// Bank spending feed (Open Banking via TrueLayer).
// Owner-only: connect a business bank account, see the live transaction feed.
// Read-only account information — the app can never move money.

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  const [txPage, setTxPage] = useState(1);
  const [sortAsc, setSortAsc] = useState(false);
  const [showAllCats, setShowAllCats] = useState(false);
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

  const currency0 = transactions[0]?.currency || "GBP";
  const incomingTotal = useMemo(() => visibleTransactions
    .filter(item => item.amount > 0)
    .reduce((acc, item) => acc + item.amount, 0), [visibleTransactions]);

  const lastMonthTotal = useMemo(() => {
    const previous = new Date(selectedYear, selectedMonth - 1, 1);
    const prefix = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
    return transactions
      .filter(item => item.bookingDate.startsWith(prefix) && item.amount < 0)
      .reduce((acc, item) => acc + Math.abs(item.amount), 0);
  }, [transactions, selectedYear, selectedMonth]);

  // Sparkline for the "Total spent" tile: daily in month view, monthly in year view.
  const spentSeries = useMemo(() => {
    if (view === "year") return yearSeries.totals;
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const limit = isCurrentPeriod ? now.getDate() : daysInMonth;
    const daily = Array.from({ length: limit }, () => 0);
    for (const item of visibleTransactions) {
      if (item.amount >= 0) continue;
      const day = Number(item.bookingDate.slice(8, 10)) - 1;
      if (day >= 0 && day < limit) daily[day] += Math.abs(item.amount);
    }
    // cumulative curve reads better than spiky dailies
    let running = 0;
    return daily.map(value => (running += value));
  }, [view, yearSeries.totals, selectedYear, selectedMonth, visibleTransactions, isCurrentPeriod, now]);

  const accountsCount = useMemo(() => connections
    .filter(item => item.status === "linked")
    .reduce((acc, item) => acc + item.accounts.length, 0), [connections]);
  const linkedBanks = connections.filter(item => item.status === "linked");
  const lastSync = linkedBanks.reduce<Date | null>((latest, item) =>
    item.lastSyncedAt && (!latest || item.lastSyncedAt > latest) ? item.lastSyncedAt : latest, null);

  const sortedTransactions = useMemo(() => {
    const list = [...visibleTransactions];
    list.sort((a, b) => sortAsc ? a.bookingDate.localeCompare(b.bookingDate) : b.bookingDate.localeCompare(a.bookingDate));
    return list;
  }, [visibleTransactions, sortAsc]);

  const TX_PAGE_SIZE = 8;
  const txPageCount = Math.max(1, Math.ceil(sortedTransactions.length / TX_PAGE_SIZE));
  const pagedTransactions = sortedTransactions.slice((txPage - 1) * TX_PAGE_SIZE, txPage * TX_PAGE_SIZE);
  useEffect(() => { setTxPage(1); }, [view, selectedYear, selectedMonth]);

  const activeRecurring = recurring.filter(item => item.active);
  const cancelledRecurring = recurring.filter(item => !item.active);
  const periodLabel = view === "month"
    ? new Date(selectedYear, selectedMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : String(selectedYear);
  const spentTotal = view === "month" ? monthTotal : yearSeries.total;
  const spentDelta = view === "month" && lastMonthTotal > 0
    ? ((monthTotal - lastMonthTotal) / lastMonthTotal) * 100
    : null;

  const avatarColor = (name: string) => CATEGORY_PALETTE[(name.length * 31 + (name.charCodeAt(0) || 7)) % CATEGORY_PALETTE.length];
  const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => word[0] ?? "").join("").toUpperCase() || "•";

  const money = (value: number, currency: string) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "GBP" }).format(value);

  if (loading || workspaceLoading) return <LoadingScreen />;
  if (!user) return null;

  return (
    <AppShell>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ---- Header ------------------------------------------------------ */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span aria-hidden="true" style={{ width: 46, height: 46, borderRadius: 12, border: "1.5px solid rgba(120,120,140,0.3)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🏛</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{t("Bank Spending")}</h1>
            <p style={{ margin: 0, fontSize: 12.5, opacity: 0.65 }}>{t("Read-only Open Banking feed — NivaDesk can never move money.")}</p>
          </div>
          {isOwner && linkedBanks.length > 0 ? (
            <>
              <input type="file" accept="image/*" id="bank-ocr-input" style={{ display: "none" }}
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void startReceiptMatch(file);
                }} />
              <button type="button" disabled={busy === "ocr"}
                onClick={() => document.getElementById("bank-ocr-input")?.click()}
                style={bankBtn}>
                📷 {busy === "ocr" ? t("Reading the receipt…") : t("Match a receipt")}
              </button>
              <button type="button" disabled={busy === "sync"} onClick={() => void refresh()} style={bankBtn}>
                ⟳ {busy === "sync" ? t("Refreshing…") : t("Refresh")}
              </button>
            </>
          ) : null}
          {isOwner && linkedBanks.length === 0 ? (
            <button type="button" disabled={busy === "connect"} onClick={() => void connectBank()} style={{ ...bankBtn, background: "#2563eb", color: "#fff", borderColor: "#2563eb" }}>
              {busy === "connect" ? t("Opening your bank…") : `+ ${t("Connect bank")}`}
            </button>
          ) : null}
        </div>

        {!isOwner ? (
          <p style={{ fontSize: 13, opacity: 0.75 }}>{t("Bank connections are managed by the workspace owner.")}</p>
        ) : null}
        {status ? <p style={{ margin: 0, fontSize: 12, color: "#16a34a", fontWeight: 600 }}>{status}</p> : null}
        {error ? <p style={{ margin: 0, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>{error}</p> : null}

        {/* ---- OCR candidates --------------------------------------------- */}
        {ocrCandidates !== null ? (
          <div style={bankCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 13 }}>📷 {ocrFileName}</strong>
              {ocrParsed && ocrParsed.amount > 0 ? (
                <span style={{ fontSize: 12, opacity: 0.75 }}>
                  {t("Detected")}: <strong>{money(ocrParsed.amount, currency0)}</strong>
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
                    <button type="button" style={bankBtnSm} disabled={busy === "ocr-assign"} onClick={() => void confirmReceiptMatch(candidate.transactionId)}>
                      {t("Attach")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {isOwner ? (
          <>
            {/* ---- Connection pill + period control ------------------------ */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {connections.map(connection => (
                <div key={connection.id} style={{ ...bankCard, padding: "10px 16px", display: "inline-flex", alignItems: "center", gap: 12, opacity: connection.status === "linked" ? 1 : 0.75 }}>
                  {connection.providerLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={connection.providerLogo} alt="" width={34} height={34} style={{ borderRadius: 999, border: "1px solid rgba(120,120,140,0.25)" }} />
                  ) : <span aria-hidden="true" style={{ fontSize: 20 }}>🏛</span>}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 13.5, textTransform: "uppercase", letterSpacing: 0.3 }}>{connection.providerName || t("Bank")}</strong>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: connection.status === "linked" ? "#16a34a" : "#b45309" }}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: connection.status === "linked" ? "#16a34a" : "#f59e0b", display: "inline-block" }} />
                        {connection.status === "linked" ? t("Connected") : t("Waiting for bank consent…")}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>
                      {connection.lastSyncedAt ? `${t("Last sync")} ${connection.lastSyncedAt.toLocaleString()}` : ""}
                    </div>
                  </div>
                  <button type="button" className="finance-payments-delete" disabled={busy === `delete-${connection.id}`}
                    onClick={() => void removeConnection(connection)} aria-label={t("Disconnect")} title={t("Disconnect")}
                    style={{ opacity: 0.5 }}>✕</button>
                </div>
              ))}
              {linkedBanks.length > 0 ? (
                <button type="button" style={{ ...bankBtnSm, opacity: 0.7 }} disabled={busy === "connect"} onClick={() => void connectBank()} title={t("Connect bank")}>＋</button>
              ) : null}
              <span style={{ flex: 1 }} />
              <div role="tablist" aria-label={t("Spending period")} style={{ display: "inline-flex", gap: 2, background: "rgba(120,120,140,0.12)", borderRadius: 9, padding: 3 }}>
                {(["month", "year"] as const).map(option => (
                  <button key={option} type="button" role="tab" aria-selected={view === option}
                    onClick={() => setView(option)}
                    style={{ border: 0, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "5px 14px", borderRadius: 7, background: view === option ? "#2563eb" : "transparent", color: view === option ? "#fff" : "inherit" }}>
                    {option === "month" ? t("Monthly") : t("Yearly")}
                  </button>
                ))}
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <button type="button" className="finance-payments-delete" onClick={() => stepPeriod(-1)} aria-label={t("Previous period")}>‹</button>
                <strong style={{ fontSize: 13, minWidth: 104, textAlign: "center" }}>{periodLabel}</strong>
                <button type="button" className="finance-payments-delete" onClick={() => stepPeriod(1)} disabled={isCurrentPeriod} aria-label={t("Next period")} style={{ opacity: isCurrentPeriod ? 0.3 : 1 }}>›</button>
              </span>
            </div>

            {transactions.length === 0 ? (
              <div style={{ ...bankCard, textAlign: "center", padding: 40 }}>
                <p style={{ fontSize: 13.5, opacity: 0.75, margin: 0 }}>
                  {linkedBanks.length === 0
                    ? t("Connect your business bank to see spending here as it happens.")
                    : t("No transactions imported yet. Try Refresh.")}
                </p>
              </div>
            ) : (
              <>
                {/* ---- Stat tiles ------------------------------------------ */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))", gap: 14 }}>
                  <div style={bankCard}>
                    <p style={tileLabel}>{t("Total spent")} — {periodLabel}</p>
                    <strong style={tileValue}>{money(spentTotal, currency0)}</strong>
                    {spentDelta !== null ? (
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: spentDelta <= 0 ? "#16a34a" : "#dc2626" }}>
                        {spentDelta <= 0 ? "↓" : "↑"}{Math.abs(spentDelta).toFixed(0)}% {t("vs last month")}
                      </span>
                    ) : null}
                    <div style={{ marginTop: 8 }}>
                      <BankMiniSpark values={spentSeries} color="#16a34a" />
                    </div>
                  </div>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#ea770b" }}>{t("Recurring spending")}</p>
                    <strong style={tileValue}>≈ {money(fixedMonthly, currency0)} <span style={tileUnit}>/ {t("month")}</span></strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>↻ {activeRecurring.length} {t("recurring items")}</span>
                    <TileIcon bg="rgba(234,119,11,0.12)">↻</TileIcon>
                  </div>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#16a34a" }}>{t("Incoming")} — {periodLabel}</p>
                    <strong style={{ ...tileValue, color: "#16a34a" }}>+{money(incomingTotal, currency0)}</strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>↗ {t("Total inflow this period")}</span>
                    <TileIcon bg="rgba(22,163,74,0.12)">↗</TileIcon>
                  </div>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#7c3aed" }}>{t("Connected accounts")}</p>
                    <strong style={tileValue}>{accountsCount}</strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>{linkedBanks.length} {t("bank(s)")}{lastSync ? ` · ${t("Last sync")} ${lastSync.toLocaleTimeString()}` : ""}</span>
                    <TileIcon bg="rgba(124,58,237,0.12)">🏛</TileIcon>
                  </div>
                </div>

                {/* ---- Recurring + spending mix ---------------------------- */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14, alignItems: "start" }}>
                  {recurring.length > 0 ? (
                    <div style={bankCard}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <TileBadge bg="rgba(234,119,11,0.12)">↻</TileBadge>
                        <strong style={{ fontSize: 14.5 }}>{t("Recurring spending")}</strong>
                        <span style={{ flex: 1 }} />
                        <span style={countBadge}>{recurring.length}</span>
                      </div>
                      {activeRecurring.map(item => (
                        <div key={item.key} style={recurringRow}>
                          <span aria-hidden="true" style={{ ...avatarStyle, background: `${avatarColor(item.merchant)}22`, color: avatarColor(item.merchant) }}>{initials(item.merchant)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.merchant}</div>
                            <div style={{ fontSize: 10.5, opacity: 0.6 }}>
                              {t(item.cadence === "weekly" ? "Weekly" : item.cadence === "yearly" ? "Yearly" : "Monthly")} · {item.occurrences}×
                            </div>
                          </div>
                          <span style={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                            {money(item.typicalAmount, item.currency)}
                            <span style={{ fontSize: 9.5, opacity: 0.55, fontWeight: 600 }}> /{t(item.cadence === "weekly" ? "week" : item.cadence === "yearly" ? "year" : "month")}</span>
                          </span>
                        </div>
                      ))}
                      {cancelledRecurring.length > 0 ? (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 4px" }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.6 }}>{t("Possible cancellations")}</span>
                            <span style={{ flex: 1 }} />
                            <span style={countBadge}>{cancelledRecurring.length}</span>
                          </div>
                          {cancelledRecurring.map(item => (
                            <div key={item.key} style={{ ...recurringRow, opacity: 0.5 }}>
                              <span aria-hidden="true" style={{ ...avatarStyle, background: "rgba(120,120,140,0.15)" }}>{initials(item.merchant)}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.merchant}</div>
                                <div style={{ fontSize: 10.5, opacity: 0.6 }}>{t(item.cadence === "weekly" ? "Weekly" : item.cadence === "yearly" ? "Yearly" : "Monthly")} · {item.occurrences}×</div>
                              </div>
                              <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(item.typicalAmount, item.currency)} <span style={{ fontSize: 9.5, opacity: 0.55 }}>/{t("month")}</span></span>
                            </div>
                          ))}
                        </>
                      ) : null}
                      <button type="button" onClick={() => setShowRules(value => !value)} style={cardFootLink}>
                        {t("Manage recurring rules")} →
                      </button>
                      {showRules ? (
                        rules.length === 0 ? (
                          <p style={{ fontSize: 12, opacity: 0.65, margin: "8px 0 0" }}>{t("No rules yet — set a category on a transaction and tick the rule box.")}</p>
                        ) : (
                          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                            {rules.map(rule => (
                              <div key={rule.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 8px", border: "1px solid rgba(120,120,140,0.18)", borderRadius: 8 }}>
                                <span style={{ opacity: 0.7 }}>"{rule.keyword}"</span>
                                <span aria-hidden="true">→</span>
                                <span style={{ fontWeight: 700, color: categoryColor(rule.category) }}>{t(rule.category)}</span>
                                <span style={{ flex: 1 }} />
                                <button type="button" className="finance-payments-delete" disabled={busy === `rule-${rule.id}`}
                                  onClick={() => void deleteRule(rule)} aria-label={t("Delete this rule?")}>✕</button>
                              </div>
                            ))}
                          </div>
                        )
                      ) : null}
                    </div>
                  ) : null}

                  <div style={bankCard}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <TileBadge bg="rgba(37,99,235,0.1)">◔</TileBadge>
                      <strong style={{ fontSize: 14.5 }}>{periodLabel} {t("spending mix")}</strong>
                    </div>
                    <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                      <BankDonut rows={categoryBreakdown.rows} total={categoryBreakdown.total}
                        centerLabel={t("Total spent")} centerValue={money(categoryBreakdown.total, currency0)}
                        uncategorisedLabel={t("Uncategorised")} translate={t} />
                      <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 6 }}>
                        {(showAllCats ? categoryBreakdown.rows : categoryBreakdown.rows.slice(0, 4)).map(row => {
                          const isUn = row.name === "__uncategorized__";
                          const color = isUn ? "#5b6ee8" : categoryColor(row.name);
                          return (
                            <div key={row.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, border: "1px solid rgba(120,120,140,0.16)", borderRadius: 9, padding: "7px 11px" }}>
                              <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />
                              <span style={{ flex: 1, fontWeight: 650 }}>{isUn ? t("Uncategorised") : t(row.name)}</span>
                              <strong style={{ fontVariantNumeric: "tabular-nums" }}>{money(row.amount, currency0)}</strong>
                              <span style={{ opacity: 0.5, minWidth: 32, textAlign: "right" }}>{row.share.toFixed(0)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {categoryBreakdown.rows.length > 4 ? (
                      <button type="button" onClick={() => setShowAllCats(value => !value)} style={cardFootLink}>
                        {showAllCats ? `${t("Show less")} ←` : `${t("View category breakdown")} →`}
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* ---- Transactions table ---------------------------------- */}
                <div style={{ ...bankCard, padding: 0, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 18px 10px" }}>
                    <TileBadge bg="rgba(120,120,140,0.12)">🧾</TileBadge>
                    <strong style={{ fontSize: 14.5 }}>{t("Recent transactions")}</strong>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, opacity: 0.6 }}>{sortedTransactions.length} {t("Transactions").toLowerCase()}</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700, fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ borderTop: "1px solid rgba(120,120,140,0.14)", borderBottom: "1px solid rgba(120,120,140,0.14)" }}>
                          <th style={thStyle}>{t("Merchant")}</th>
                          <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => setSortAsc(value => !value)}>
                            {t("Date")} {sortAsc ? "↑" : "↓"}
                          </th>
                          <th style={thStyle}>{t("Category")}</th>
                          <th style={thStyle}>{t("Method")}</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>{t("Amount")}</th>
                          <th style={thStyle} aria-label={t("Actions")} />
                        </tr>
                      </thead>
                      <tbody>
                        {pagedTransactions.map(transaction => {
                          const category = effectiveCategory(transaction);
                          const catColor = category ? categoryColor(category) : "";
                          const meta = TX_TYPE_META[transaction.txType];
                          return (
                            <React.Fragment key={transaction.id}>
                              <tr style={{ borderBottom: "1px solid rgba(120,120,140,0.1)" }}>
                                <td style={tdStyle}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10, maxWidth: 280 }}>
                                    <span aria-hidden="true" style={{ ...avatarStyle, background: `${avatarColor(transaction.counterparty || transaction.description || "x")}22`, color: avatarColor(transaction.counterparty || transaction.description || "x"), flexShrink: 0 }}>
                                      {initials(transaction.counterparty || transaction.description)}
                                    </span>
                                    <span style={{ minWidth: 0 }}>
                                      <span style={{ display: "block", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {transaction.amount < 0 && recurringKeys.has(recurringMerchantKey(transaction)) ? <span aria-hidden="true" title={t("Recurring spending")} style={{ marginRight: 4, opacity: 0.6, fontSize: 11 }}>↻</span> : null}
                                        {transaction.counterparty || transaction.description || "—"}
                                      </span>
                                      {transaction.linkedOrderId ? (
                                        <span style={{ fontSize: 10, fontWeight: 700, color: "#2563eb" }}>⛓ {transaction.linkedOrderLabel || t("Order")}</span>
                                      ) : null}
                                    </span>
                                  </span>
                                </td>
                                <td style={{ ...tdStyle, whiteSpace: "nowrap", opacity: 0.75 }}>
                                  {new Date(transaction.bookingDate).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                                  {transaction.status === "pending" ? <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.6 }}>· {t("pending")}</span> : null}
                                </td>
                                <td style={tdStyle}>
                                  {transaction.amount < 0 ? (
                                    <button type="button" disabled={busy === `cat-${transaction.id}`}
                                      onClick={() => {
                                        setCategoryPickerTxId(current => current === transaction.id ? null : transaction.id);
                                        setCategoryMakeRule(false);
                                        setCategoryCustomText("");
                                        setCategoryRuleKeyword(suggestRuleKeyword(transaction));
                                      }}
                                      style={category
                                        ? { border: 0, cursor: "pointer", fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: `${catColor}1a`, color: catColor }
                                        : { border: 0, cursor: "pointer", fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: "rgba(120,120,140,0.13)", color: "inherit", opacity: 0.75 }}>
                                      {category ? t(category) : t("Uncategorised")}
                                    </button>
                                  ) : (
                                    <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: "rgba(120,120,140,0.1)", opacity: 0.55 }}>—</span>
                                  )}
                                </td>
                                <td style={tdStyle}>
                                  {meta ? (
                                    <span title={transaction.txType} style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", padding: "3px 8px", borderRadius: 6, background: `${meta.color}1a`, color: meta.color }}>
                                      {meta.translate ? t(meta.label) : meta.label}
                                    </span>
                                  ) : null}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: transaction.amount < 0 ? "#dc2626" : "#16a34a" }}>
                                  {transaction.amount < 0 ? "−" : "+"}{money(Math.abs(transaction.amount), transaction.currency)}
                                </td>
                                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                                  {transaction.amount < 0 ? (
                                    <span style={{ display: "inline-flex", gap: 2 }}>
                                      {transaction.receiptPath ? (
                                        <>
                                          <button type="button" className="finance-payments-delete" title={transaction.receiptName || t("View invoice")} onClick={() => void openReceipt(transaction)} aria-label={t("View invoice")}>📎</button>
                                          <button type="button" className="finance-payments-delete" title={t("Remove invoice")} disabled={busy === `receipt-${transaction.id}`} onClick={() => void removeReceipt(transaction)} aria-label={t("Remove invoice")} style={{ fontSize: 10 }}>✕</button>
                                        </>
                                      ) : (
                                        <button type="button" className="finance-payments-delete" title={t("Attach invoice")} aria-label={t("Attach invoice")} disabled={busy === `receipt-${transaction.id}`}
                                          onClick={() => {
                                            setPendingAttachTxId(transaction.id);
                                            document.getElementById("bank-receipt-input")?.click();
                                          }}
                                          style={{ opacity: 0.45 }}>📎</button>
                                      )}
                                      <button type="button" className="finance-payments-delete"
                                        title={transaction.linkedOrderId ? t("Remove this amount from the order's expenses?") : t("Add to an order's expenses")}
                                        aria-label={t("Add to an order's expenses")}
                                        disabled={busy === `link-${transaction.id}`}
                                        onClick={() => transaction.linkedOrderId ? void unlinkFromOrder(transaction) : void openLinkPicker(transaction.id)}
                                        style={{ opacity: transaction.linkedOrderId ? 1 : 0.45 }}>⛓</button>
                                      {!transaction.receiptPath && !transaction.linkedOrderId ? (
                                        <span title={t("No document")} aria-label={t("No document")} style={{ width: 6, height: 6, borderRadius: 999, background: "#f59e0b", display: "inline-block", alignSelf: "center" }} />
                                      ) : null}
                                    </span>
                                  ) : null}
                                </td>
                              </tr>
                              {categoryPickerTxId === transaction.id || linkPickerTxId === transaction.id ? (
                                <tr>
                                  <td colSpan={6} style={{ padding: "0 18px 12px" }}>
                                    {categoryPickerTxId === transaction.id ? (
                                      <div style={{ padding: 10, border: "1px solid rgba(120,120,140,0.25)", borderRadius: 10 }}>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                          {BANK_CATEGORIES.map(option => (
                                            <button key={option} type="button" onClick={() => void applyCategory(transaction, option)}
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
                                            style={pickerInput} />
                                          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, cursor: "pointer", flexWrap: "wrap" }}>
                                            <input type="checkbox" checked={categoryMakeRule} onChange={event => setCategoryMakeRule(event.target.checked)} />
                                            {t("Rule: whenever it contains")}
                                            <input type="text" value={categoryRuleKeyword}
                                              onChange={event => { setCategoryRuleKeyword(event.target.value); if (event.target.value.trim().length >= 2) setCategoryMakeRule(true); }}
                                              onClick={event => event.stopPropagation()}
                                              placeholder={t("keyword")}
                                              style={{ ...pickerInput, width: 110, flex: "none", fontWeight: 700 }} />
                                          </label>
                                          <button type="button" className="finance-payments-delete" onClick={() => setCategoryPickerTxId(null)} aria-label={t("Close")}>✕</button>
                                        </div>
                                      </div>
                                    ) : null}
                                    {linkPickerTxId === transaction.id ? (
                                      <div style={{ padding: 10, border: "1px solid rgba(120,120,140,0.25)", borderRadius: 10 }}>
                                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                          <input type="text" value={orderSearch} autoFocus placeholder={t("Search orders")}
                                            onChange={event => setOrderSearch(event.target.value)} style={pickerInput} />
                                          <button type="button" className="finance-payments-delete" onClick={() => setLinkPickerTxId(null)} aria-label={t("Close")}>✕</button>
                                        </div>
                                        <div style={{ marginTop: 8, maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                                          {orderOptions === null ? (
                                            <span style={{ fontSize: 12, opacity: 0.7 }}>{t("Loading…")}</span>
                                          ) : filteredOrderOptions.length === 0 ? (
                                            <span style={{ fontSize: 12, opacity: 0.7 }}>{t("No orders found.")}</span>
                                          ) : filteredOrderOptions.map(order => (
                                            <button key={order.id} type="button" onClick={() => void linkToOrder(transaction, order.id)}
                                              style={{ textAlign: "left", border: 0, background: "transparent", color: "inherit", cursor: "pointer", padding: "6px 4px", borderRadius: 6, fontSize: 12.5 }}>
                                              <strong>{order.customerName}</strong>
                                              {order.designName ? <span style={{ opacity: 0.65 }}> · {order.designName}</span> : null}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </td>
                                </tr>
                              ) : null}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <input type="file" accept="image/*,.pdf" style={{ display: "none" }} id="bank-receipt-input"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      const target = transactions.find(item => item.id === pendingAttachTxId);
                      event.target.value = "";
                      setPendingAttachTxId(null);
                      if (file && target) void attachReceipt(target, file);
                    }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px 14px", justifyContent: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11.5, opacity: 0.6, marginRight: "auto" }}>
                      {t("Showing")} {pagedTransactions.length} / {sortedTransactions.length}
                    </span>
                    <button type="button" className="finance-payments-delete" disabled={txPage <= 1} onClick={() => setTxPage(page => Math.max(1, page - 1))} aria-label={t("Previous period")}>‹</button>
                    {Array.from({ length: Math.min(5, txPageCount) }, (_, index) => {
                      const base = Math.min(Math.max(1, txPage - 2), Math.max(1, txPageCount - 4));
                      const pageNumber = base + index;
                      if (pageNumber > txPageCount) return null;
                      return (
                        <button key={pageNumber} type="button" onClick={() => setTxPage(pageNumber)}
                          style={{ border: pageNumber === txPage ? "1.5px solid #2563eb" : "1px solid rgba(120,120,140,0.25)", background: "transparent", color: pageNumber === txPage ? "#2563eb" : "inherit", fontWeight: 700, fontSize: 12, borderRadius: 8, width: 30, height: 30, cursor: "pointer" }}>
                          {pageNumber}
                        </button>
                      );
                    })}
                    <button type="button" className="finance-payments-delete" disabled={txPage >= txPageCount} onClick={() => setTxPage(page => Math.min(txPageCount, page + 1))} aria-label={t("Next period")}>›</button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

// ---- Shared styles & tiny presentational pieces ---------------------------

const bankCard: React.CSSProperties = {
  background: "var(--surface, rgba(255,255,255,0.6))",
  border: "1px solid rgba(120,120,140,0.18)",
  borderRadius: 14,
  padding: "16px 18px",
  position: "relative"
};
const bankBtn: React.CSSProperties = {
  border: "1px solid rgba(120,120,140,0.3)", background: "transparent", color: "inherit",
  borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer"
};
const bankBtnSm: React.CSSProperties = { ...bankBtn, padding: "5px 12px", fontSize: 12 };
const tileLabel: React.CSSProperties = { margin: 0, fontSize: 12, fontWeight: 700, opacity: 0.75 };
const tileValue: React.CSSProperties = { fontSize: 25, fontWeight: 800, fontVariantNumeric: "tabular-nums", display: "block", margin: "3px 0 2px" };
const tileUnit: React.CSSProperties = { fontSize: 12, fontWeight: 600, opacity: 0.55 };
const countBadge: React.CSSProperties = { fontSize: 11, fontWeight: 800, background: "rgba(120,120,140,0.14)", borderRadius: 7, padding: "2px 8px" };
const recurringRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(120,120,140,0.1)" };
const avatarStyle: React.CSSProperties = { width: 30, height: 30, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 };
const cardFootLink: React.CSSProperties = { border: 0, background: "transparent", color: "#2563eb", fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: "10px 0 0", textAlign: "left" };
const thStyle: React.CSSProperties = { textAlign: "left", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.55, padding: "9px 18px" };
const tdStyle: React.CSSProperties = { padding: "9px 18px", verticalAlign: "middle" };
const pickerInput: React.CSSProperties = { flex: 1, minWidth: 120, fontSize: 12.5, padding: "6px 9px", borderRadius: 7, border: "1px solid rgba(120,120,140,0.35)", background: "transparent", color: "inherit" };

function TileIcon({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <span aria-hidden="true" style={{ position: "absolute", top: 14, right: 14, width: 36, height: 36, borderRadius: 999, background: bg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
      {children}
    </span>
  );
}

function TileBadge({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
      {children}
    </span>
  );
}

function BankMiniSpark({ values, color }: { values: number[]; color: string }) {
  const W = 240;
  const H = 44;
  const safe = values.length > 1 ? values : [0, ...values, 0];
  const max = Math.max(...safe, 1);
  const points = safe.map((value, index) => `${(index / (safe.length - 1)) * W},${H - 3 - (value / max) * (H - 8)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} aria-hidden="true">
      <polygon points={`0,${H} ${points.join(" ")} ${W},${H}`} fill={color} opacity={0.12} />
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BankDonut({ rows, total, centerLabel, centerValue, uncategorisedLabel, translate }: {
  rows: Array<{ name: string; amount: number; share: number }>;
  total: number;
  centerLabel: string;
  centerValue: string;
  uncategorisedLabel: string;
  translate: (text: string) => string;
}) {
  const size = 190;
  const stroke = 26;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, flexShrink: 0 }} role="img" aria-label={centerLabel}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(120,120,140,0.12)" strokeWidth={stroke} />
      {total > 0 ? rows.map(row => {
        const isUn = row.name === "__uncategorized__";
        const color = isUn ? "#5b6ee8" : categoryColor(row.name);
        const fraction = row.amount / total;
        const dash = Math.max(0.5, fraction * circumference - 2);
        const element = (
          <circle key={row.name}
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={color} strokeWidth={stroke} strokeLinecap="butt"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <title>{`${isUn ? uncategorisedLabel : translate(row.name)}: ${row.share.toFixed(0)}%`}</title>
          </circle>
        );
        offset += fraction * circumference;
        return element;
      }) : null}
      <text x="50%" y="47%" textAnchor="middle" fontSize="19" fontWeight="800" fill="currentColor">{centerValue}</text>
      <text x="50%" y="58%" textAnchor="middle" fontSize="10.5" fill="currentColor" opacity="0.55">{centerLabel}</text>
    </svg>
  );
}

export default function BankPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <BankPageContent />
    </Suspense>
  );
}

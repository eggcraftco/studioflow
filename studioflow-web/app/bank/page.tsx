"use client";

// Bank spending feed (Open Banking via TrueLayer).
// Owner-only: connect a business bank account, see the live transaction feed.
// Read-only account information — the app can never move money.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { db, functions, storage } from "@/lib/firebase/client";
import { loadWorkspaceContext, loadWorkspaceOrderOptions, workspaceAccessAllows, type OrderOptionItem, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { detectPossibleDuplicates, detectRecurringSpends, monthlyFixedTotal, recurringMerchantKey, rankOrdersForTransaction, suggestCategory, suggestOrderLink, type RecurringSpend } from "@/lib/studioflow/bankInsights";
import { studioT } from "@/lib/studioflow/language";
import { PandleCard, PANDLE_DEFAULT_MAPPINGS } from "@/components/PandleCard";

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
  vatCode: string;
  note: string;
  receiptNotNeeded: boolean;
  pandleStatus: string;
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

// Pandle's UK tax codes; the label is what the owner sees on a transaction.
const VAT_CODES: Array<{ code: string; label: string }> = [
  { code: "ST", label: "VAT 20%" },
  { code: "RR", label: "VAT 5%" },
  { code: "RC", label: "Reverse charge" },
  { code: "NV", label: "No VAT" },
  { code: "EX", label: "Exempt / 0%" }
];
const vatLabel = (code: string) => VAT_CODES.find(item => item.code === code)?.label || code;

const BANK_CATEGORIES = [
  "Materials", "Equipment", "Shipping", "Software", "Subscriptions", "Fees",
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
  // Skip card-network prefixes ("INT'L", "POS", "CARD") that every foreign
  // payment carries — they would match everything.
  const noise = new Set(["int'l", "intl", "pos", "card", "crd", "payment", "paypal"]);
  const word = base.split(/[\s*,/]+/).find(part => part.replace(/[^a-zç-ü]/gi, "").length >= 3 && !noise.has(part));
  return (word || base).replace(/[^\p{L}\p{N}. -]/gu, "").slice(0, 60);
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (copy.getDay() + 6) % 7; // Monday = 0
  copy.setDate(copy.getDate() - day);
  return copy;
}
function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
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
  const [view, setView] = useState<"week" | "month" | "year">("month");
  // Week view: Monday of the selected week (local time).
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  // Transactions table direction filter: everything, spending only, or incoming only.
  const [txFlow, setTxFlow] = useState<"all" | "out" | "in">(() => {
    if (typeof window === "undefined") return "all";
    const flow = new URLSearchParams(window.location.search).get("flow");
    return flow === "in" || flow === "out" ? flow : "all";
  });
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
  const [txPageSize, setTxPageSize] = useState<10 | 20 | 30>(10);
  const [sortAsc, setSortAsc] = useState(false);
  const [showAllCats, setShowAllCats] = useState(false);
  // "Needs attention" queue filter for the transactions table.
  const [txAttention, setTxAttention] = useState<"none" | "uncategorised" | "noReceipt" | "duplicate">("none");
  // Bulk review: selected spending rows + the category to apply to all of them.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  // After accepting a suggestion: offer to turn it into a rule for that merchant.
  const [rulePrompt, setRulePrompt] = useState<{ keyword: string; category: string } | null>(null);
  // Category → default VAT code (from the Pandle mapping, falls back to defaults).
  const [categoryTax, setCategoryTax] = useState<Record<string, string>>({});
  const [bulkVat, setBulkVat] = useState("");
  const [vatPickerTxId, setVatPickerTxId] = useState<string | null>(null);
  // Banking tabs + the transaction drawer.
  type BankTab = "overview" | "transactions" | "recurring" | "receipts" | "rules";
  const [tab, setTab] = useState<BankTab>(() => {
    if (typeof window === "undefined") return "overview";
    const value = new URLSearchParams(window.location.search).get("tab");
    return (["overview", "transactions", "recurring", "receipts", "rules"] as const).includes(value as BankTab) ? (value as BankTab) : (new URLSearchParams(window.location.search).get("flow") ? "transactions" : "overview");
  });
  const [drawerTxId, setDrawerTxId] = useState<string | null>(null);
  const [drawerCategory, setDrawerCategory] = useState("");
  const [drawerVat, setDrawerVat] = useState("");
  const [drawerNote, setDrawerNote] = useState("");
  const [drawerOrderId, setDrawerOrderId] = useState("");
  const [drawerRuleKeyword, setDrawerRuleKeyword] = useState("");
  const [receiptFilter, setReceiptFilter] = useState<"all" | "missing" | "matched">("all");
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
  // Members the owner granted "Bank Spending" get a read-only view; every
  // mutation (connect, categorise, receipts, Pandle) stays with the owner.
  const canViewBank = isOwner || workspaceAccessAllows(workspace?.memberAccess, "bankFeed");
  const companyId = workspace?.id ?? "";

  // Live views over the server-written feed (owner-only per Firestore rules).
  useEffect(() => {
    if (!companyId || !canViewBank) return;
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
            txType: String(data.txType || ""),
            vatCode: String(data.vatCode || ""),
            note: String(data.note || ""),
            receiptNotNeeded: data.receiptNotNeeded === true,
            pandleStatus: String((data.pandle as { status?: string } | undefined)?.status || "")
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
    const unsubPandle = onSnapshot(doc(db, "companies", companyId, "pandleConnection", "main"), snap => {
      const mappings = (snap.data()?.mappings as Array<{ category: string; taxCode: string }> | undefined) ?? [];
      const source = mappings.length ? mappings : PANDLE_DEFAULT_MAPPINGS;
      setCategoryTax(Object.fromEntries(source.map(item => [item.category, item.taxCode])));
    }, () => setCategoryTax(Object.fromEntries(PANDLE_DEFAULT_MAPPINGS.map(item => [item.category, item.taxCode]))));
    return () => { unsubConnections(); unsubTransactions(); unsubRules(); unsubPandle(); };
  }, [companyId, canViewBank]);

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

  useEffect(() => {
    if (!isOwner || !workspace || orderOptions !== null || transactions.length === 0) return;
    let cancelled = false;
    loadWorkspaceOrderOptions(companyId, workspace, user?.uid ?? "")
      .then(options => { if (!cancelled) setOrderOptions(options); })
      .catch(() => { if (!cancelled) setOrderOptions([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, workspace, companyId, transactions.length]);

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

  function toggleSelected(id: string) {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function togglePageSelection() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) pageSpendingIds.forEach(id => next.delete(id)); else pageSpendingIds.forEach(id => next.add(id));
      return next;
    });
  }
  async function applyBulkCategory(category: string) {
    if (selectedIds.size === 0) return;
    setBusy("bulk");
    setError(null);
    try {
      const result = await call<{ updated: number }>("bankSetTransactionCategoryBulk", { transactionIds: Array.from(selectedIds), category });
      setStatus(`${result.updated} ${t("transactions updated")}`);
      setSelectedIds(new Set());
      setBulkCategory("");
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Could not update the transactions.");
    } finally {
      setBusy(null);
    }
  }

  const effectiveVat = (tx: BankTransaction) => tx.vatCode || categoryTax[effectiveCategory(tx)] || "";
  async function applyVat(ids: string[], vatCode: string) {
    if (ids.length === 0) return;
    setBusy("vat");
    setError(null);
    try {
      const result = await call<{ updated: number }>("bankSetTransactionVatBulk", { transactionIds: ids, vatCode });
      setStatus(`${result.updated} ${t("transactions updated")}`);
      setVatPickerTxId(null);
      if (ids.length > 1) { setSelectedIds(new Set()); setBulkVat(""); }
    } catch (vatError) {
      setError(vatError instanceof Error ? vatError.message : "Could not update the VAT treatment.");
    } finally {
      setBusy(null);
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
    // Orders open around the transaction's date float to the top of the picker.
    const target = linkPickerTxId ? transactions.find(item => item.id === linkPickerTxId) : null;
    const ordered = target ? rankOrdersForTransaction(target, list).map(item => item.order) : list;
    return ordered.slice(0, 25);
  }, [orderOptions, orderSearch, linkPickerTxId, transactions]);

  const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;
  const weekStartIso = isoDay(weekStart);
  const weekEndIso = isoDay(addDays(weekStart, 6));
  const isCurrentPeriod = view === "month"
    ? selectedYear === now.getFullYear() && selectedMonth === now.getMonth()
    : view === "week"
      ? weekStartIso >= isoDay(startOfWeek(now))
      : selectedYear === now.getFullYear();

  function stepPeriod(direction: -1 | 1) {
    if (view === "year") {
      setSelectedYear(year => Math.min(now.getFullYear(), year + direction));
      return;
    }
    if (view === "week") {
      const nextWeek = addDays(weekStart, direction * 7);
      if (nextWeek > now) return;
      setWeekStart(nextWeek);
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
    if (view === "week") {
      return transactions.filter(item => item.bookingDate >= weekStartIso && item.bookingDate <= weekEndIso);
    }
    const prefix = view === "month" ? monthPrefix : String(selectedYear);
    return transactions.filter(item => item.bookingDate.startsWith(prefix));
  }, [transactions, view, monthPrefix, selectedYear, weekStartIso, weekEndIso]);

  // Previous period spend (week/month/year) for the "vs last …" delta.
  const previousPeriodSpent = useMemo(() => {
    let inRange: (date: string) => boolean;
    if (view === "week") {
      const start = isoDay(addDays(weekStart, -7));
      const end = isoDay(addDays(weekStart, -1));
      inRange = date => date >= start && date <= end;
    } else if (view === "month") {
      const previous = new Date(selectedYear, selectedMonth - 1, 1);
      const prefix = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
      inRange = date => date.startsWith(prefix);
    } else {
      inRange = date => date.startsWith(String(selectedYear - 1));
    }
    return transactions.filter(item => item.amount < 0 && inRange(item.bookingDate)).reduce((acc, item) => acc + Math.abs(item.amount), 0);
  }, [transactions, view, weekStart, selectedYear, selectedMonth]);

  // Spending per effective category for the selected period (Year/Month tab).
  // Every category name present in the feed (presets + custom), for the
  // Pandle mapping editor.
  const categoriesInUse = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(tx => { const name = effectiveCategory(tx); if (name) set.add(name); });
    rules.forEach(rule => { if (rule.category) set.add(rule.category); });
    return Array.from(set);
  }, [transactions, rules]);

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
  const duplicateIds = useMemo(() => detectPossibleDuplicates(visibleTransactions), [visibleTransactions]);
  // What the owner should act on in this period — drives the Needs Attention tile.
  const attention = useMemo(() => {
    const spending = visibleTransactions.filter(item => item.amount < 0);
    const uncategorised = spending.filter(item => !effectiveCategory(item));
    const noReceipt = spending.filter(item => !item.receiptPath);
    const priceChanged = recurring.filter(item => item.active && item.priceChange);
    const cancelled = recurring.filter(item => !item.active);
    return {
      uncategorised: uncategorised.length,
      uncategorisedAmount: uncategorised.reduce((acc, item) => acc + Math.abs(item.amount), 0),
      noReceipt: noReceipt.length,
      duplicates: duplicateIds.size,
      priceChanged: priceChanged.length,
      cancelled: cancelled.length,
      total: uncategorised.length + noReceipt.length + duplicateIds.size + priceChanged.length + cancelled.length
    };
  }, [visibleTransactions, recurring, duplicateIds]);
  // Heuristic category suggestions for uncategorised spending on the page.
  const suggestions = useMemo(() => {
    const map = new Map<string, ReturnType<typeof suggestCategory>>();
    for (const tx of transactions) {
      if (tx.amount >= 0 || effectiveCategory(tx)) continue;
      map.set(tx.id, suggestCategory(tx, transactions));
    }
    return map;
  }, [transactions]);
  async function acceptSuggestion(transaction: BankTransaction, category: string, source: "history" | "keyword") {
    setBusy(`cat-${transaction.id}`);
    setError(null);
    try {
      await call("bankSetTransactionCategory", { transactionId: transaction.id, category });
      setStatus(`${t("Category saved.")} ${t(category)}`);
      // History-based picks already come from this merchant's past; keyword
      // picks are worth turning into a rule so next time it's automatic.
      const keyword = (suggestions.get(transaction.id)?.keyword || suggestRuleKeyword(transaction)).toLowerCase();
      if (source === "keyword" && keyword.length >= 2 && !rules.some(rule => rule.keyword === keyword)) setRulePrompt({ keyword, category });
    } catch (suggestError) {
      setError(suggestError instanceof Error ? suggestError.message : "Could not save the category.");
    } finally {
      setBusy(null);
    }
  }
  async function acceptRulePrompt() {
    if (!rulePrompt) return;
    setBusy("rule-prompt");
    try {
      await call("bankSaveRule", { keyword: rulePrompt.keyword, category: rulePrompt.category });
      setStatus(t("Category saved and rule created."));
    } catch (ruleError) {
      setError(ruleError instanceof Error ? ruleError.message : "Could not create the rule.");
    } finally {
      setBusy(null);
      setRulePrompt(null);
    }
  }
  function showAttention(kind: "uncategorised" | "noReceipt" | "duplicate") {
    setTab("transactions");
    setTxAttention(kind);
    setTxFlow("out");
    setTxPage(1);
    document.getElementById("bank-transactions")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const recurringKeys = useMemo(() => new Set(recurring.filter(item => item.active).map(item => item.key)), [recurring]);
  const fixedMonthly = useMemo(() => monthlyFixedTotal(recurring), [recurring]);
  // Order link suggestions for unlinked spending (skips subscriptions & overheads).
  const orderSuggestions = useMemo(() => {
    const map = new Map<string, ReturnType<typeof suggestOrderLink>>();
    if (!orderOptions || orderOptions.length === 0) return map;
    for (const tx of transactions) {
      if (tx.amount >= 0 || tx.linkedOrderId || recurringKeys.has(recurringMerchantKey(tx))) continue;
      map.set(tx.id, suggestOrderLink(tx, orderOptions));
    }
    return map;
  }, [transactions, orderOptions, recurringKeys]);

  // Receipts tab numbers (spending only; incoming never needs a receipt).
  const receiptStats = useMemo(() => {
    const spending = visibleTransactions.filter(item => item.amount < 0);
    const matched = spending.filter(item => item.receiptPath).length;
    const notNeeded = spending.filter(item => !item.receiptPath && item.receiptNotNeeded).length;
    const missing = spending.length - matched - notNeeded;
    return { total: spending.length, matched, missing, notNeeded, incoming: visibleTransactions.length - spending.length };
  }, [visibleTransactions]);
  // Next 30 days of expected recurring charges.
  const upcomingRenewals = useMemo(() => {
    const today = isoDay(new Date());
    const horizon = isoDay(addDays(new Date(), 30));
    return recurring.filter(item => item.active && item.nextExpected >= today && item.nextExpected <= horizon)
      .sort((a, b) => a.nextExpected.localeCompare(b.nextExpected));
  }, [recurring]);
  // Rules tab: how many transactions each rule catches, and rules worth creating.
  const ruleStats = useMemo(() => {
    const stats = new Map<string, { count: number; total: number; lastDate: string }>();
    for (const rule of rules) {
      let count = 0, total = 0, lastDate = "";
      for (const tx of transactions) {
        if (tx.amount >= 0) continue;
        if (`${tx.counterparty} ${tx.description}`.toLowerCase().includes(rule.keyword)) {
          count += 1; total += Math.abs(tx.amount); if (tx.bookingDate > lastDate) lastDate = tx.bookingDate;
        }
      }
      stats.set(rule.id, { count, total, lastDate });
    }
    return stats;
  }, [rules, transactions]);
  const suggestedRules = useMemo(() => {
    // Merchants the owner categorised by hand at least twice, with no rule yet.
    const byKey = new Map<string, { keyword: string; merchant: string; category: string; count: number; total: number }>();
    for (const tx of transactions) {
      if (tx.amount >= 0) continue;
      const keyword = suggestRuleKeyword(tx).toLowerCase();
      if (keyword.length < 3 || rules.some(rule => rule.keyword === keyword || keyword.includes(rule.keyword))) continue;
      const category = tx.category || suggestCategory(tx, transactions)?.category || "";
      if (!category) continue;
      const entry = byKey.get(keyword) ?? { keyword, merchant: tx.counterparty || tx.description, category, count: 0, total: 0 };
      if (entry.category !== category) continue;
      entry.count += 1; entry.total += Math.abs(tx.amount);
      byKey.set(keyword, entry);
    }
    return Array.from(byKey.values()).filter(item => item.count >= 2).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [transactions, rules]);
  const autoAppliedCount = useMemo(() => visibleTransactions.filter(item => item.amount < 0 && !item.category && item.categoryAuto).length, [visibleTransactions]);

  // ---- Transaction drawer ---------------------------------------------------
  const drawerTx = drawerTxId ? transactions.find(item => item.id === drawerTxId) ?? null : null;
  function openDrawer(tx: BankTransaction) {
    setDrawerTxId(tx.id);
    setDrawerCategory(tx.category || tx.categoryAuto || "");
    setDrawerVat(tx.vatCode);
    setDrawerNote(tx.note);
    setDrawerOrderId(tx.linkedOrderId);
    setDrawerRuleKeyword(suggestions.get(tx.id)?.keyword || suggestRuleKeyword(tx));
    setCategoryPickerTxId(null);
    setLinkPickerTxId(null);
  }
  function drawerStep(direction: -1 | 1) {
    if (!drawerTx) return;
    const index = sortedTransactions.findIndex(item => item.id === drawerTx.id);
    const next = sortedTransactions[index + direction];
    if (next) openDrawer(next);
  }
  async function saveDrawer(createRule = false) {
    if (!drawerTx) return;
    setBusy("drawer");
    setError(null);
    try {
      await call("bankUpdateTransaction", { transactionId: drawerTx.id, category: drawerCategory, vatCode: drawerVat, note: drawerNote });
      if (drawerOrderId !== drawerTx.linkedOrderId) {
        if (drawerTx.linkedOrderId) await call("bankLinkTransactionToOrder", { transactionId: drawerTx.id, orderId: drawerTx.linkedOrderId });
        if (drawerOrderId) await call("bankLinkTransactionToOrder", { transactionId: drawerTx.id, orderId: drawerOrderId });
      }
      const keyword = drawerRuleKeyword.trim().toLowerCase();
      if (createRule && drawerCategory && keyword.length >= 2) {
        await call("bankSaveRule", { keyword, category: drawerCategory });
        setStatus(t("Category saved and rule created."));
      } else {
        setStatus(t("Transaction saved."));
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the transaction.");
    } finally {
      setBusy(null);
    }
  }
  async function setReceiptNotNeeded(tx: BankTransaction, value: boolean) {
    setBusy(`receipt-${tx.id}`);
    try {
      await call("bankUpdateTransaction", { transactionId: tx.id, receiptNotNeeded: value });
    } catch (flagError) {
      setError(flagError instanceof Error ? flagError.message : "Could not update the transaction.");
    } finally {
      setBusy(null);
    }
  }
  async function createSuggestedRule(item: { keyword: string; category: string }) {
    setBusy(`rule-${item.keyword}`);
    try {
      await call("bankSaveRule", { keyword: item.keyword, category: item.category });
      setStatus(t("Rule created."));
    } catch (ruleError) {
      setError(ruleError instanceof Error ? ruleError.message : "Could not create the rule.");
    } finally {
      setBusy(null);
    }
  }

  const currency0 = transactions[0]?.currency || "GBP";
  const incomingTotal = useMemo(() => visibleTransactions
    .filter(item => item.amount > 0)
    .reduce((acc, item) => acc + item.amount, 0), [visibleTransactions]);

  // Sparkline for the "Total spent" tile: daily in month view, monthly in year view.
  const spentSeries = useMemo(() => {
    if (view === "year") return yearSeries.totals;
    if (view === "week") {
      const daily = Array.from({ length: 7 }, () => 0);
      for (const item of visibleTransactions) {
        if (item.amount >= 0) continue;
        const index = Math.round((new Date(item.bookingDate).getTime() - new Date(weekStartIso).getTime()) / 86400000);
        if (index >= 0 && index < 7) daily[index] += Math.abs(item.amount);
      }
      let runningWeek = 0;
      return daily.map(value => (runningWeek += value));
    }
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
  }, [view, yearSeries.totals, selectedYear, selectedMonth, visibleTransactions, isCurrentPeriod, now, weekStartIso]);

  const accountsCount = useMemo(() => connections
    .filter(item => item.status === "linked")
    .reduce((acc, item) => acc + item.accounts.length, 0), [connections]);
  const linkedBanks = connections.filter(item => item.status === "linked");
  const lastSync = linkedBanks.reduce<Date | null>((latest, item) =>
    item.lastSyncedAt && (!latest || item.lastSyncedAt > latest) ? item.lastSyncedAt : latest, null);

  const sortedTransactions = useMemo(() => {
    const list = visibleTransactions.filter(item => {
      if (txFlow === "in" && item.amount <= 0) return false;
      if (txFlow === "out" && item.amount >= 0) return false;
      if (txAttention === "uncategorised") return item.amount < 0 && !effectiveCategory(item);
      if (txAttention === "noReceipt") return item.amount < 0 && !item.receiptPath;
      if (txAttention === "duplicate") return duplicateIds.has(item.id);
      return true;
    });
    list.sort((a, b) => sortAsc ? a.bookingDate.localeCompare(b.bookingDate) : b.bookingDate.localeCompare(a.bookingDate));
    return list;
  }, [visibleTransactions, sortAsc, txFlow, txAttention, duplicateIds]);

  const txPageCount = Math.max(1, Math.ceil(sortedTransactions.length / txPageSize));
  const pagedTransactions = sortedTransactions.slice((txPage - 1) * txPageSize, txPage * txPageSize);
  const pageSpendingIds = pagedTransactions.filter(item => item.amount < 0).map(item => item.id);
  const allPageSelected = pageSpendingIds.length > 0 && pageSpendingIds.every(id => selectedIds.has(id));
  useEffect(() => { setTxPage(1); setSelectedIds(new Set()); }, [view, selectedYear, selectedMonth, weekStart, txFlow, txAttention]);

  const activeRecurring = recurring.filter(item => item.active);
  const cancelledRecurring = recurring.filter(item => !item.active);
  const periodLabel = view === "month"
    ? new Date(selectedYear, selectedMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : view === "week"
      ? `${weekStart.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${addDays(weekStart, 6).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
      : String(selectedYear);
  const weekTotal = view === "week" ? visibleTransactions.filter(item => item.amount < 0).reduce((acc, item) => acc + Math.abs(item.amount), 0) : 0;
  const spentTotal = view === "month" ? monthTotal : view === "week" ? weekTotal : yearSeries.total;
  const spentDelta = previousPeriodSpent > 0 ? ((spentTotal - previousPeriodSpent) / previousPeriodSpent) * 100 : null;
  const deltaLabel = view === "week" ? t("vs last week") : view === "month" ? t("vs last month") : t("vs last year");
  const incomingCount = visibleTransactions.filter(item => item.amount > 0).length;
  function showIncoming() {
    setTab("transactions");
    setTxFlow("in");
    setTxPage(1);
    document.getElementById("bank-transactions")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const avatarColor = (name: string) => CATEGORY_PALETTE[(name.length * 31 + (name.charCodeAt(0) || 7)) % CATEGORY_PALETTE.length];
  const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => word[0] ?? "").join("").toUpperCase() || "•";

  const money = (value: number, currency: string) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "GBP" }).format(value);

  if (loading || workspaceLoading) return <LoadingScreen />;
  if (!user) return null;

  return (
    <AppShell>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, paddingRight: drawerTx ? 440 : 0, transition: "padding-right 160ms" }}>

        {/* ---- Header ------------------------------------------------------ */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span aria-hidden="true" style={{ width: 46, height: 46, borderRadius: 12, border: "1.5px solid rgba(120,120,140,0.3)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🏛</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{t("Banking")}</h1>
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

        {!canViewBank ? (
          <p style={{ fontSize: 13, opacity: 0.75 }}>{t("Bank connections are managed by the workspace owner.")}</p>
        ) : null}
        {status ? <p style={{ margin: 0, fontSize: 12, color: "#16a34a", fontWeight: 600 }}>{status}</p> : null}
        {error ? <p style={{ margin: 0, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>{error}</p> : null}
        {rulePrompt ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12.5, padding: "8px 12px", borderRadius: 10, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)" }}>
            <span>{t("Always categorise")} <strong>"{rulePrompt.keyword}"</strong> {t("as")} <strong>{t(rulePrompt.category)}</strong>?</span>
            <button type="button" style={{ ...bankBtnSm, background: "#2563eb", color: "#fff", borderColor: "#2563eb" }} disabled={busy === "rule-prompt"} onClick={() => void acceptRulePrompt()}>{t("Yes, create rule")}</button>
            <button type="button" style={bankBtnSm} onClick={() => setRulePrompt(null)}>{t("Not now")}</button>
          </div>
        ) : null}

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

        {canViewBank ? (
          <>
            {/* ---- Connection pills --------------------------------------- */}
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
            </div>

            {/* ---- Tabs + period control ---------------------------------- */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderBottom: "1px solid rgba(120,120,140,0.18)" }}>
              <div role="tablist" aria-label={t("Banking sections")} style={{ display: "flex", gap: 2 }}>
                {([
                  ["overview", t("Overview"), 0],
                  ["transactions", t("Transactions"), attention.uncategorised],
                  ["recurring", t("Recurring"), cancelledRecurring.length],
                  ["receipts", t("Receipts"), receiptStats.missing],
                  ["rules", t("Rules"), suggestedRules.length]
                ] as const).map(([key, label, badge]) => (
                  <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setDrawerTxId(null); }}
                    style={{ border: 0, borderBottom: tab === key ? "2px solid #2563eb" : "2px solid transparent", background: "transparent", color: tab === key ? "#2563eb" : "inherit", fontWeight: 700, fontSize: 13, padding: "8px 12px", cursor: "pointer", marginBottom: -1, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {label}
                    {badge ? <span style={{ fontSize: 10, fontWeight: 800, background: tab === key ? "rgba(37,99,235,0.14)" : "rgba(120,120,140,0.16)", borderRadius: 999, padding: "1px 6px" }}>{badge}</span> : null}
                  </button>
                ))}
              </div>
              <span style={{ flex: 1 }} />
              <div role="tablist" aria-label={t("Spending period")} style={{ display: "inline-flex", gap: 2, background: "rgba(120,120,140,0.12)", borderRadius: 9, padding: 3 }}>
                {(["week", "month", "year"] as const).map(option => (
                  <button key={option} type="button" role="tab" aria-selected={view === option}
                    onClick={() => setView(option)}
                    style={{ border: 0, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "5px 14px", borderRadius: 7, background: view === option ? "#2563eb" : "transparent", color: view === option ? "#fff" : "inherit" }}>
                    {option === "week" ? t("Weekly") : option === "month" ? t("Monthly") : t("Yearly")}
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
            ) : null}

            {/* ================= OVERVIEW ================= */}
            {transactions.length > 0 && tab === "overview" ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))", gap: 14 }}>
                  <div style={bankCard}>
                    <p style={tileLabel}>{t("Total spent")} — {periodLabel}</p>
                    <strong style={tileValue}>{money(spentTotal, currency0)}</strong>
                    {spentDelta !== null ? (
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: spentDelta <= 0 ? "#16a34a" : "#6b7280" }}>
                        {spentDelta <= 0 ? "↓" : "↑"}{Math.abs(spentDelta).toFixed(0)}% {deltaLabel}
                      </span>
                    ) : null}
                    <div style={{ marginTop: 8 }}>
                      <BankMiniSpark values={spentSeries} color="#16a34a" />
                    </div>
                  </div>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#ea770b" }}>{t("Recurring spending")}</p>
                    <strong style={tileValue}>≈ {money(fixedMonthly, currency0)} <span style={tileUnit}>/ {t("month")}</span></strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>↻ {activeRecurring.length} {t("active")}{cancelledRecurring.length ? ` · ${cancelledRecurring.length} ${t("possibly cancelled")}` : ""}</span>
                    <TileIcon bg="rgba(234,119,11,0.12)">↻</TileIcon>
                  </div>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#16a34a" }}>{t("Incoming")} — {periodLabel}</p>
                    <strong style={{ ...tileValue, color: "#16a34a" }}>+{money(incomingTotal, currency0)}</strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>↗ {incomingCount} {t("payments received")}</span>
                    <button type="button" onClick={showIncoming} style={{ ...cardFootLink, display: "block", padding: "6px 0 0", fontSize: 12 }}>{t("View all incoming")} →</button>
                    <TileIcon bg="rgba(22,163,74,0.12)">↗</TileIcon>
                  </div>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: attention.total ? "#b45309" : "#16a34a" }}>{t("Needs attention")}</p>
                    <strong style={tileValue}>{attention.total}</strong>
                    {attention.total === 0 ? (
                      <span style={{ fontSize: 11.5, opacity: 0.65 }}>✓ {t("All clear for this period")}</span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11.5 }}>
                        {attention.uncategorised ? <button type="button" onClick={() => showAttention("uncategorised")} style={attentionLink}>{attention.uncategorised} {t("uncategorised")} →</button> : null}
                        {attention.noReceipt ? <button type="button" onClick={() => showAttention("noReceipt")} style={attentionLink}>{attention.noReceipt} {t("missing receipts")} →</button> : null}
                        {attention.duplicates ? <button type="button" onClick={() => showAttention("duplicate")} style={attentionLink}>{attention.duplicates} {t("possible duplicates")} →</button> : null}
                        {attention.priceChanged ? <span style={{ opacity: 0.8 }}>{attention.priceChanged} {t("price changed")}</span> : null}
                        {attention.cancelled ? <span style={{ opacity: 0.8 }}>{attention.cancelled} {t("possibly cancelled")}</span> : null}
                      </div>
                    )}
                    <TileIcon bg={attention.total ? "rgba(245,158,11,0.14)" : "rgba(22,163,74,0.12)"}>{attention.total ? "!" : "✓"}</TileIcon>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, alignItems: "start" }}>
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
                    {(() => {
                      const shownRows = showAllCats ? categoryBreakdown.rows : categoryBreakdown.rows.slice(0, 4);
                      const shownTotal = shownRows.reduce((acc, row) => acc + row.amount, 0);
                      const hidden = Math.max(0, categoryBreakdown.total - shownTotal);
                      const unRow = categoryBreakdown.rows.find(row => row.name === "__uncategorized__");
                      const unShare = unRow && categoryBreakdown.total > 0 ? (unRow.amount / categoryBreakdown.total) * 100 : 0;
                      return (
                        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, opacity: 0.8 }}>
                          <span>
                            {hidden > 0.005
                              ? `${money(hidden, currency0)} ${t("in")} ${categoryBreakdown.rows.length - shownRows.length} ${t("more categories")}`
                              : `${money(categoryBreakdown.total, currency0)} ${t("of")} ${money(categoryBreakdown.total, currency0)} ${t("accounted for")}`}
                          </span>
                          {unRow ? (
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ flex: 1, height: 5, borderRadius: 999, background: "rgba(120,120,140,0.15)", overflow: "hidden" }}>
                                <span style={{ display: "block", height: "100%", width: `${Math.max(2, 100 - unShare)}%`, background: "#16a34a" }} />
                              </span>
                              <span>{Math.round(100 - unShare)}% {t("categorised")}</span>
                              <button type="button" onClick={() => showAttention("uncategorised")} style={{ ...attentionLink, fontSize: 11.5 }}>{t("Categorise")} {attention.uncategorised} →</button>
                            </span>
                          ) : null}
                        </div>
                      );
                    })()}
                    {categoryBreakdown.rows.length > 4 ? (
                      <button type="button" onClick={() => setShowAllCats(value => !value)} style={cardFootLink}>
                        {showAllCats ? `${t("Show less")} ←` : `${t("View category breakdown")} →`}
                      </button>
                    ) : null}
                  </div>
                  <div style={bankCard}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <TileBadge bg="rgba(234,119,11,0.12)">↻</TileBadge>
                      <strong style={{ fontSize: 14.5 }}>{t("Top recurring vendors")}</strong>
                      <span style={{ flex: 1 }} />
                      <button type="button" onClick={() => setTab("recurring")} style={{ ...attentionLink, fontSize: 12 }}>{t("View recurring")} →</button>
                    </div>
                    {activeRecurring.slice(0, 5).map(item => (
                      <div key={item.key} style={recurringRow}>
                        <span aria-hidden="true" style={{ ...avatarStyle, background: `${avatarColor(item.merchant)}22`, color: avatarColor(item.merchant) }}>{initials(item.merchant)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.merchant}</div>
                          <div style={{ fontSize: 10.5, opacity: 0.6 }}>{t(item.cadence === "weekly" ? "Weekly" : item.cadence === "yearly" ? "Yearly" : "Monthly")} · {item.occurrences}×</div>
                        </div>
                        <span style={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(item.typicalAmount, item.currency)} <span style={{ fontSize: 9.5, opacity: 0.55, fontWeight: 600 }}>/{t("month")}</span></span>
                      </div>
                    ))}
                    {activeRecurring.length === 0 ? <p style={{ fontSize: 12, opacity: 0.65, margin: 0 }}>{t("No recurring payments detected yet.")}</p> : null}
                    <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 12 }}>
                      <span><strong style={{ color: "#16a34a", fontSize: 16 }}>{activeRecurring.length}</strong> {t("active")}</span>
                      <span><strong style={{ color: "#b45309", fontSize: 16 }}>{cancelledRecurring.length}</strong> {t("possibly cancelled")}</span>
                    </div>
                  </div>
                  <div style={bankCard}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <TileBadge bg="rgba(37,99,235,0.1)">📎</TileBadge>
                      <strong style={{ fontSize: 14.5 }}>{t("Receipts summary")}</strong>
                      <span style={{ flex: 1 }} />
                      <button type="button" onClick={() => setTab("receipts")} style={{ ...attentionLink, fontSize: 12 }}>{t("Review receipts")} →</button>
                    </div>
                    <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                      <div><strong style={{ fontSize: 24, color: "#16a34a" }}>{receiptStats.matched}</strong><div style={{ fontSize: 11, opacity: 0.65 }}>{t("Receipts matched")}</div></div>
                      <div><strong style={{ fontSize: 24, color: receiptStats.missing ? "#dc2626" : "inherit" }}>{receiptStats.missing}</strong><div style={{ fontSize: 11, opacity: 0.65 }}>{t("Missing receipts")}</div></div>
                      <div><strong style={{ fontSize: 24, opacity: 0.7 }}>{receiptStats.notNeeded}</strong><div style={{ fontSize: 11, opacity: 0.65 }}>{t("No receipt needed")}</div></div>
                    </div>
                    <p style={{ fontSize: 12, opacity: 0.7, margin: "12px 0 0" }}>{t("Keep your records complete — match missing receipts to stay audit-ready.")}</p>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14, alignItems: "start" }}>
                  <div style={bankCard}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <TileBadge bg="rgba(120,120,140,0.12)">🧾</TileBadge>
                      <strong style={{ fontSize: 14.5 }}>{t("Recent transactions")}</strong>
                      <span style={{ flex: 1 }} />
                      <button type="button" onClick={() => setTab("transactions")} style={{ ...attentionLink, fontSize: 12 }}>{t("View all transactions")} →</button>
                    </div>
                    {visibleTransactions.slice(0, 6).map(tx => (
                      <div key={tx.id} style={{ ...recurringRow, cursor: "pointer" }} onClick={() => { setTab("transactions"); openDrawer(tx); }}>
                        <span style={{ fontSize: 11, opacity: 0.6, minWidth: 74 }}>{new Date(tx.bookingDate).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.counterparty || tx.description}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, opacity: effectiveCategory(tx) ? 0.9 : 0.5, color: effectiveCategory(tx) ? categoryColor(effectiveCategory(tx)) : "inherit" }}>{tx.amount < 0 ? (effectiveCategory(tx) ? t(effectiveCategory(tx)) : t("Uncategorised")) : t("Incoming")}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: tx.amount < 0 ? "#dc2626" : "#16a34a" }}>{tx.amount < 0 ? "−" : "+"}{money(Math.abs(tx.amount), tx.currency)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={bankCard}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <TileBadge bg="rgba(124,58,237,0.12)">📅</TileBadge>
                      <strong style={{ fontSize: 14.5 }}>{t("Upcoming payments & renewals")}</strong>
                      <span style={{ flex: 1 }} />
                      <span style={countBadge}>{upcomingRenewals.length}</span>
                    </div>
                    {upcomingRenewals.length === 0 ? <p style={{ fontSize: 12, opacity: 0.65, margin: 0 }}>{t("Nothing expected in the next 30 days.")}</p> : null}
                    {upcomingRenewals.slice(0, 8).map(item => (
                      <div key={item.key} style={recurringRow}>
                        <span style={{ fontSize: 11, opacity: 0.6, minWidth: 74 }}>{new Date(item.nextExpected).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.merchant}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(item.typicalAmount, item.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {/* ================= TRANSACTIONS ================= */}
            {transactions.length > 0 && tab === "transactions" ? (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {categoryBreakdown.rows.slice(0, 6).map(row => {
                    const isUn = row.name === "__uncategorized__";
                    return (
                      <span key={row.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, border: "1px solid rgba(120,120,140,0.16)", borderRadius: 9, padding: "5px 10px" }}>
                        <span style={{ width: 7, height: 7, borderRadius: 999, background: isUn ? "#5b6ee8" : categoryColor(row.name), display: "inline-block" }} />
                        <span style={{ fontWeight: 650 }}>{isUn ? t("Uncategorised") : t(row.name)}</span>
                        <strong style={{ fontVariantNumeric: "tabular-nums" }}>{money(row.amount, currency0)}</strong>
                      </span>
                    );
                  })}
                </div>
                <div id="bank-transactions" style={{ ...bankCard, padding: 0, overflow: "hidden", scrollMarginTop: 90 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 18px 10px", flexWrap: "wrap" }}>
                    <TileBadge bg="rgba(120,120,140,0.12)">🧾</TileBadge>
                    <strong style={{ fontSize: 14.5 }}>{t("Transactions")}</strong>
                    <span role="group" aria-label={t("Direction")} style={{ display: "inline-flex", gap: 2, marginLeft: 6, background: "rgba(120,120,140,0.12)", borderRadius: 7, padding: 2 }}>
                      {(["all", "out", "in"] as const).map(flow => (
                        <button key={flow} type="button" onClick={() => setTxFlow(flow)}
                          style={{ border: 0, cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 5, background: txFlow === flow ? (flow === "in" ? "#16a34a" : flow === "out" ? "#dc2626" : "#2563eb") : "transparent", color: txFlow === flow ? "#fff" : "inherit" }}>
                          {flow === "all" ? t("All") : flow === "out" ? t("Spending") : t("Incoming")}
                        </button>
                      ))}
                    </span>
                    {txAttention !== "none" ? (
                      <button type="button" onClick={() => setTxAttention("none")}
                        style={{ border: 0, cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(245,158,11,0.16)", color: "#b45309" }}>
                        ! {txAttention === "uncategorised" ? t("Uncategorised") : txAttention === "noReceipt" ? t("No receipt") : t("Possible duplicates")} ✕
                      </button>
                    ) : null}
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, opacity: 0.6 }}>{sortedTransactions.length} {t("Transactions").toLowerCase()}</span>
                  </div>
                  {isOwner && selectedIds.size > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 18px 12px", background: "rgba(37,99,235,0.06)", borderTop: "1px solid rgba(37,99,235,0.18)" }}>
                      <strong style={{ fontSize: 12.5 }}>{selectedIds.size} {t("selected")}</strong>
                      <select value={bulkCategory} onChange={event => setBulkCategory(event.target.value)} style={{ ...pickerInput, flex: "0 1 220px" }} aria-label={t("Set category")}>
                        <option value="">{t("Set category")}…</option>
                        {Array.from(new Set([...BANK_CATEGORIES, ...categoriesInUse])).map(name => <option key={name} value={name}>{t(name)}</option>)}
                      </select>
                      <button type="button" style={{ ...bankBtnSm, background: "#2563eb", color: "#fff", borderColor: "#2563eb" }} disabled={busy === "bulk" || !bulkCategory} onClick={() => void applyBulkCategory(bulkCategory)}>
                        {busy === "bulk" ? t("Saving…") : t("Apply")}
                      </button>
                      <button type="button" style={bankBtnSm} disabled={busy === "bulk"} onClick={() => void applyBulkCategory("")}>{t("Clear category")}</button>
                      <select value={bulkVat} onChange={event => setBulkVat(event.target.value)} style={{ ...pickerInput, flex: "0 1 160px" }} aria-label={t("Set VAT")}>
                        <option value="">{t("Set VAT")}…</option>
                        {VAT_CODES.map(item => <option key={item.code} value={item.code}>{t(item.label)}</option>)}
                        <option value="__clear">{t("Use category default")}</option>
                      </select>
                      <button type="button" style={bankBtnSm} disabled={busy === "vat" || !bulkVat} onClick={() => void applyVat(Array.from(selectedIds), bulkVat === "__clear" ? "" : bulkVat)}>
                        {busy === "vat" ? t("Saving…") : t("Apply VAT")}
                      </button>
                      <span style={{ flex: 1 }} />
                      <button type="button" style={{ ...bankBtnSm, opacity: 0.7 }} onClick={() => setSelectedIds(new Set())}>{t("Clear selection")}</button>
                    </div>
                  ) : null}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700, fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ borderTop: "1px solid rgba(120,120,140,0.14)", borderBottom: "1px solid rgba(120,120,140,0.14)" }}>
                          {isOwner ? (
                            <th style={{ ...thStyle, width: 34, paddingRight: 0 }}>
                              <input type="checkbox" aria-label={t("Select all on page")} checked={allPageSelected} disabled={pageSpendingIds.length === 0} onChange={togglePageSelection} />
                            </th>
                          ) : null}
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
                              <tr style={{ borderBottom: "1px solid rgba(120,120,140,0.1)", background: drawerTxId === transaction.id ? "rgba(37,99,235,0.1)" : selectedIds.has(transaction.id) ? "rgba(37,99,235,0.06)" : undefined, boxShadow: drawerTxId === transaction.id ? "inset 3px 0 0 #2563eb" : undefined }}>
                                {isOwner ? (
                                  <td style={{ ...tdStyle, paddingRight: 0 }}>
                                    {transaction.amount < 0 ? <input type="checkbox" aria-label={t("Select")} checked={selectedIds.has(transaction.id)} onChange={() => toggleSelected(transaction.id)} /> : null}
                                  </td>
                                ) : null}
                                <td style={{ ...tdStyle, cursor: "pointer" }} onClick={() => openDrawer(transaction)} title={t("Open details")}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10, maxWidth: 280 }}>
                                    <span aria-hidden="true" style={{ ...avatarStyle, background: `${avatarColor(transaction.counterparty || transaction.description || "x")}22`, color: avatarColor(transaction.counterparty || transaction.description || "x"), flexShrink: 0 }}>
                                      {initials(transaction.counterparty || transaction.description)}
                                    </span>
                                    <span style={{ minWidth: 0 }}>
                                      <span style={{ display: "block", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {transaction.amount < 0 && recurringKeys.has(recurringMerchantKey(transaction)) ? <span aria-hidden="true" title={t("Recurring spending")} style={{ marginRight: 4, opacity: 0.6, fontSize: 11 }}>↻</span> : null}
                                        {duplicateIds.has(transaction.id) ? <span title={t("Possible duplicates")} style={{ marginRight: 4, fontSize: 9.5, fontWeight: 800, padding: "1px 6px", borderRadius: 999, background: "rgba(245,158,11,0.16)", color: "#b45309" }}>{t("Duplicate?")}</span> : null}
                                        {transaction.counterparty || transaction.description || "—"}
                                      </span>
                                      {transaction.linkedOrderId ? (
                                        <span style={{ fontSize: 10, fontWeight: 700, color: "#2563eb" }}>⛓ {transaction.linkedOrderLabel || t("Order")}</span>
                                      ) : isOwner && orderSuggestions.get(transaction.id) ? (() => {
                                        const hint = orderSuggestions.get(transaction.id)!;
                                        return (
                                          <button type="button" disabled={busy === `link-${transaction.id}`} onClick={event => { event.stopPropagation(); void linkToOrder(transaction, hint.orderId); }}
                                            title={`${t("Likely related to this order")} · ${Math.round(hint.confidence * 100)}%`}
                                            style={{ border: "1px dashed #2563eb", cursor: "pointer", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "1px 8px", background: "transparent", color: "#2563eb", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>
                                            ⛓ {hint.label}? ✓
                                          </button>
                                        );
                                      })() : null}
                                    </span>
                                  </span>
                                </td>
                                <td style={{ ...tdStyle, whiteSpace: "nowrap", opacity: 0.75 }}>
                                  {new Date(transaction.bookingDate).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                                  {transaction.status === "pending" ? <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.6 }}>· {t("pending")}</span> : null}
                                </td>
                                <td style={tdStyle}>
                                  {transaction.amount < 0 && !isOwner ? (
                                    <span style={category
                                      ? { fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: `${catColor}1a`, color: catColor }
                                      : { fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: "rgba(120,120,140,0.13)", opacity: 0.75 }}>
                                      {category ? t(category) : t("Uncategorised")}
                                    </span>
                                  ) : transaction.amount < 0 ? (
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
                                  ) : null}
                                  {transaction.amount < 0 && isOwner && !category && suggestions.get(transaction.id) ? (() => {
                                    const suggestion = suggestions.get(transaction.id)!;
                                    return (
                                      <button type="button" disabled={busy === `cat-${transaction.id}`}
                                        onClick={() => void acceptSuggestion(transaction, suggestion.category, suggestion.source)}
                                        title={`${suggestion.source === "history" ? t("Used before for this merchant") : t("Suggested from the merchant name")} · ${Math.round(suggestion.confidence * 100)}%`}
                                        style={{ marginLeft: 4, border: `1px dashed ${categoryColor(suggestion.category)}`, cursor: "pointer", fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 9px", background: "transparent", color: categoryColor(suggestion.category) }}>
                                        {t(suggestion.category)}? ✓
                                      </button>
                                    );
                                  })() : null}
                                  {transaction.amount < 0 && category && effectiveVat(transaction) ? (
                                    <button type="button" disabled={!isOwner || busy === "vat"}
                                      title={transaction.vatCode ? t("VAT set on this transaction") : t("Category default VAT")}
                                      onClick={() => isOwner && setVatPickerTxId(current => current === transaction.id ? null : transaction.id)}
                                      style={{ marginLeft: 4, border: 0, cursor: isOwner ? "pointer" : "default", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px", background: "rgba(120,120,140,0.12)", color: "inherit", opacity: transaction.vatCode ? 0.95 : 0.6 }}>
                                      {t(vatLabel(effectiveVat(transaction)))}
                                    </button>
                                  ) : null}
                                  {vatPickerTxId === transaction.id ? (
                                    <select autoFocus value={transaction.vatCode} onChange={event => void applyVat([transaction.id], event.target.value)} onBlur={() => setVatPickerTxId(null)}
                                      style={{ ...pickerInput, marginLeft: 4, flex: "0 1 140px", fontSize: 11, padding: "3px 6px" }} aria-label={t("Set VAT")}>
                                      <option value="">{t("Use category default")}</option>
                                      {VAT_CODES.map(item => <option key={item.code} value={item.code}>{t(item.label)}</option>)}
                                    </select>
                                  ) : null}
                                  {transaction.amount >= 0 ? (
                                    <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: "rgba(120,120,140,0.1)", opacity: 0.55 }}>—</span>
                                  ) : null}
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
                                  {transaction.amount < 0 && !isOwner ? (
                                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                      {transaction.receiptPath ? (
                                        <button type="button" className="finance-payments-delete" title={transaction.receiptName || t("View invoice")} onClick={() => void openReceipt(transaction)} aria-label={t("View invoice")}>📎</button>
                                      ) : null}
                                      {transaction.linkedOrderId ? <span title={transaction.linkedOrderLabel} style={{ fontSize: 11, color: "#2563eb" }}>⛓</span> : null}
                                    </span>
                                  ) : transaction.amount < 0 ? (
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
                                  <td colSpan={isOwner ? 7 : 6} style={{ padding: "0 18px 12px" }}>
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
                      <span role="group" aria-label={t("Rows per page")} style={{ display: "inline-flex", gap: 2, marginLeft: 10, background: "rgba(120,120,140,0.12)", borderRadius: 7, padding: 2 }}>
                        {([10, 20, 30] as const).map(size => (
                          <button key={size} type="button" onClick={() => { setTxPageSize(size); setTxPage(1); }}
                            style={{ border: 0, cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: txPageSize === size ? "#2563eb" : "transparent", color: txPageSize === size ? "#fff" : "inherit" }}>
                            {size}
                          </button>
                        ))}
                      </span>
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
            ) : null}

            {/* ================= RECURRING ================= */}
            {transactions.length > 0 && tab === "recurring" ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))", gap: 14 }}>
                  <div style={bankCard}>
                    <p style={tileLabel}>{t("Monthly recurring spend")}</p>
                    <strong style={tileValue}>{money(fixedMonthly, currency0)} <span style={tileUnit}>/ {t("month")}</span></strong>
                    <TileIcon bg="rgba(234,119,11,0.12)">↻</TileIcon>
                  </div>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#16a34a" }}>{t("Active recurring")}</p>
                    <strong style={tileValue}>{activeRecurring.length}</strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>{t("Regular payments we expect to continue")}</span>
                    <TileIcon bg="rgba(22,163,74,0.12)">✓</TileIcon>
                  </div>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#b45309" }}>{t("Possibly cancelled")}</p>
                    <strong style={tileValue}>{cancelledRecurring.length}</strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>{t("We haven't seen recent payments")}</span>
                    <TileIcon bg="rgba(245,158,11,0.14)">!</TileIcon>
                  </div>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#7c3aed" }}>{t("Upcoming renewals")}</p>
                    <strong style={tileValue}>{upcomingRenewals.length}</strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>{t("Next 30 days")}</span>
                    <TileIcon bg="rgba(124,58,237,0.12)">📅</TileIcon>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)", gap: 14, alignItems: "start" }}>
                  <div style={{ ...bankCard, padding: 0, overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px 10px" }}>
                      <strong style={{ fontSize: 14.5 }}>{t("Active recurring")}</strong>
                      <div style={{ fontSize: 12, opacity: 0.65 }}>{t("Regular payments we expect to continue")}</div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
                        <thead>
                          <tr style={{ borderTop: "1px solid rgba(120,120,140,0.14)", borderBottom: "1px solid rgba(120,120,140,0.14)" }}>
                            <th style={thStyle}>{t("Merchant")}</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>{t("Amount")}</th>
                            <th style={thStyle}>{t("Cadence")}</th>
                            <th style={thStyle}>{t("Next expected")}</th>
                            <th style={thStyle}>{t("Rule")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeRecurring.map(item => {
                            const rule = rules.find(candidate => item.merchant.toLowerCase().includes(candidate.keyword));
                            return (
                              <tr key={item.key} style={{ borderBottom: "1px solid rgba(120,120,140,0.1)" }}>
                                <td style={tdStyle}>
                                  <div style={{ fontWeight: 700 }}>{item.merchant}</div>
                                  {item.priceChange ? (
                                    <div style={{ fontSize: 10.5, fontWeight: 700, color: item.priceChange.current > item.priceChange.previous ? "#b45309" : "#16a34a" }}>
                                      {item.priceChange.current > item.priceChange.previous ? "↑" : "↓"} {money(item.priceChange.previous, item.currency)} → {money(item.priceChange.current, item.currency)}
                                    </div>
                                  ) : null}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(item.typicalAmount, item.currency)} <span style={{ fontSize: 9.5, opacity: 0.55, fontWeight: 600 }}>/{t(item.cadence === "weekly" ? "week" : item.cadence === "yearly" ? "year" : "month")}</span></td>
                                <td style={{ ...tdStyle, opacity: 0.75 }}>{t(item.cadence === "weekly" ? "Weekly" : item.cadence === "yearly" ? "Yearly" : "Monthly")} · {item.occurrences}×</td>
                                <td style={{ ...tdStyle, whiteSpace: "nowrap", opacity: 0.75 }}>{new Date(item.nextExpected).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</td>
                                <td style={tdStyle}>
                                  {rule ? <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a" }}>✓ {t(rule.category)}</span>
                                    : isOwner ? <button type="button" style={{ ...attentionLink, fontSize: 11.5 }} onClick={() => { setTab("rules"); }}>{t("Create rule")} →</button> : <span style={{ opacity: 0.5 }}>—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={bankCard}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <strong style={{ fontSize: 14.5 }}>{t("Possibly cancelled")}</strong>
                        <span style={{ flex: 1 }} />
                        <span style={countBadge}>{cancelledRecurring.length}</span>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6 }}>{t("We haven't seen recent payments")}</div>
                      {cancelledRecurring.map(item => (
                        <div key={item.key} style={recurringRow}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.merchant}</div>
                            <div style={{ fontSize: 10.5, opacity: 0.6 }}>{t("Last seen")} {new Date(item.lastDate).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</div>
                          </div>
                          <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(item.typicalAmount, item.currency)}</span>
                        </div>
                      ))}
                      {cancelledRecurring.length === 0 ? <p style={{ fontSize: 12, opacity: 0.65, margin: 0 }}>{t("Nothing looks cancelled.")}</p> : null}
                    </div>
                    <div style={bankCard}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <strong style={{ fontSize: 14.5 }}>{t("Upcoming payments & renewals")}</strong>
                        <span style={{ flex: 1 }} />
                        <span style={countBadge}>{upcomingRenewals.length}</span>
                      </div>
                      {upcomingRenewals.map(item => (
                        <div key={item.key} style={recurringRow}>
                          <span style={{ fontSize: 11, opacity: 0.6, minWidth: 74 }}>{new Date(item.nextExpected).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.merchant}</span>
                          <span style={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(item.typicalAmount, item.currency)}</span>
                        </div>
                      ))}
                      {upcomingRenewals.length === 0 ? <p style={{ fontSize: 12, opacity: 0.65, margin: 0 }}>{t("Nothing expected in the next 30 days.")}</p> : null}
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {/* ================= RECEIPTS ================= */}
            {transactions.length > 0 && tab === "receipts" ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))", gap: 14 }}>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#16a34a" }}>{t("Receipts matched")}</p>
                    <strong style={tileValue}>{receiptStats.matched}</strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>{receiptStats.total ? Math.round((receiptStats.matched / receiptStats.total) * 100) : 0}% {t("of")} {receiptStats.total} {t("transactions").toLowerCase()}</span>
                    <TileIcon bg="rgba(22,163,74,0.12)">✓</TileIcon>
                  </div>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#dc2626" }}>{t("Missing receipts")}</p>
                    <strong style={tileValue}>{receiptStats.missing}</strong>
                    <button type="button" onClick={() => setReceiptFilter("missing")} style={{ ...attentionLink, fontSize: 11.5 }}>{t("View missing")} →</button>
                    <TileIcon bg="rgba(220,38,38,0.12)">!</TileIcon>
                  </div>
                  <div style={bankCard}>
                    <p style={tileLabel}>{t("No receipt needed")}</p>
                    <strong style={tileValue}>{receiptStats.notNeeded + receiptStats.incoming}</strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>{receiptStats.incoming} {t("incoming")} · {receiptStats.notNeeded} {t("marked")}</span>
                    <TileIcon bg="rgba(120,120,140,0.12)">—</TileIcon>
                  </div>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#7c3aed" }}>{t("Match a receipt")}</p>
                    <span style={{ fontSize: 12, opacity: 0.7, display: "block", margin: "6px 0 10px" }}>{t("Upload a photo or scan — NivaDesk reads the total and date and finds the transaction.")}</span>
                    {isOwner ? (
                      <button type="button" disabled={busy === "ocr"} onClick={() => document.getElementById("bank-ocr-input")?.click()} style={{ ...bankBtnSm, background: "#2563eb", color: "#fff", borderColor: "#2563eb" }}>
                        📷 {busy === "ocr" ? t("Reading the receipt…") : t("Upload receipt")}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div style={{ ...bankCard, padding: 0, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 18px 10px", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 14.5 }}>{t("Receipts")}</strong>
                    <span role="group" style={{ display: "inline-flex", gap: 2, marginLeft: 6, background: "rgba(120,120,140,0.12)", borderRadius: 7, padding: 2 }}>
                      {(["all", "missing", "matched"] as const).map(key => (
                        <button key={key} type="button" onClick={() => setReceiptFilter(key)}
                          style={{ border: 0, cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 5, background: receiptFilter === key ? (key === "missing" ? "#dc2626" : key === "matched" ? "#16a34a" : "#2563eb") : "transparent", color: receiptFilter === key ? "#fff" : "inherit" }}>
                          {key === "all" ? t("All") : key === "missing" ? t("Missing") : t("Matched")}
                        </button>
                      ))}
                    </span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640, fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ borderTop: "1px solid rgba(120,120,140,0.14)", borderBottom: "1px solid rgba(120,120,140,0.14)" }}>
                          <th style={thStyle}>{t("Merchant")}</th>
                          <th style={thStyle}>{t("Date")}</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>{t("Amount")}</th>
                          <th style={thStyle}>{t("Category")}</th>
                          <th style={thStyle}>{t("Receipt status")}</th>
                          <th style={thStyle} aria-label={t("Actions")} />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTransactions.filter(tx => tx.amount < 0).filter(tx => receiptFilter === "all" ? true : receiptFilter === "matched" ? Boolean(tx.receiptPath) : !tx.receiptPath && !tx.receiptNotNeeded).map(tx => {
                          const category = effectiveCategory(tx);
                          return (
                            <tr key={tx.id} style={{ borderBottom: "1px solid rgba(120,120,140,0.1)" }}>
                              <td style={{ ...tdStyle, fontWeight: 700, cursor: "pointer" }} onClick={() => { setTab("transactions"); openDrawer(tx); }}>{tx.counterparty || tx.description}</td>
                              <td style={{ ...tdStyle, whiteSpace: "nowrap", opacity: 0.75 }}>{new Date(tx.bookingDate).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</td>
                              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "#dc2626" }}>−{money(Math.abs(tx.amount), tx.currency)}</td>
                              <td style={tdStyle}>{category ? <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: `${categoryColor(category)}1a`, color: categoryColor(category) }}>{t(category)}</span> : <span style={{ opacity: 0.5 }}>{t("Uncategorised")}</span>}</td>
                              <td style={tdStyle}>
                                {tx.receiptPath ? <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ {t("Matched")}<div style={{ fontSize: 10.5, opacity: 0.65, fontWeight: 500 }}>{tx.receiptName}</div></span>
                                  : tx.receiptNotNeeded ? <span style={{ opacity: 0.6 }}>{t("No receipt needed")}</span>
                                  : <span style={{ color: "#dc2626", fontWeight: 700 }}>! {t("Missing receipt")}</span>}
                              </td>
                              <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                                {tx.receiptPath ? (
                                  <button type="button" className="finance-payments-delete" onClick={() => void openReceipt(tx)} aria-label={t("View invoice")}>📎</button>
                                ) : isOwner ? (
                                  <span style={{ display: "inline-flex", gap: 6 }}>
                                    <button type="button" style={bankBtnSm} disabled={busy === `receipt-${tx.id}`} onClick={() => { setPendingAttachTxId(tx.id); document.getElementById("bank-receipt-input")?.click(); }}>{t("Attach")}</button>
                                    <button type="button" style={{ ...bankBtnSm, opacity: 0.7 }} disabled={busy === `receipt-${tx.id}`} onClick={() => void setReceiptNotNeeded(tx, !tx.receiptNotNeeded)}>{tx.receiptNotNeeded ? t("Needs receipt") : t("No receipt needed")}</button>
                                  </span>
                                ) : null}
                              </td>
                            </tr>
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
                </div>
              </>
            ) : null}

            {/* ================= RULES ================= */}
            {transactions.length > 0 && tab === "rules" ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))", gap: 14 }}>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#16a34a" }}>{t("Active rules")}</p>
                    <strong style={tileValue}>{rules.length}</strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>{t("Rules running")}</span>
                    <TileIcon bg="rgba(22,163,74,0.12)">✓</TileIcon>
                  </div>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#7c3aed" }}>{t("Suggested rules")}</p>
                    <strong style={tileValue}>{suggestedRules.length}</strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>{t("Ready to review")}</span>
                    <TileIcon bg="rgba(124,58,237,0.12)">✦</TileIcon>
                  </div>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#2563eb" }}>{t("Auto-applied")} — {periodLabel}</p>
                    <strong style={tileValue}>{autoAppliedCount}</strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>{t("Transactions auto-categorised")}</span>
                    <TileIcon bg="rgba(37,99,235,0.12)">⚡</TileIcon>
                  </div>
                  <div style={bankCard}>
                    <p style={{ ...tileLabel, color: "#b45309" }}>{t("Needs review")}</p>
                    <strong style={tileValue}>{attention.uncategorised}</strong>
                    <button type="button" onClick={() => showAttention("uncategorised")} style={{ ...attentionLink, fontSize: 11.5 }}>{t("View transactions")} →</button>
                    <TileIcon bg="rgba(245,158,11,0.14)">!</TileIcon>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)", gap: 14, alignItems: "start" }}>
                  <div style={{ ...bankCard, padding: 0, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 18px 10px" }}>
                      <strong style={{ fontSize: 14.5 }}>{t("Rules")} ({rules.length})</strong>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 12, opacity: 0.65 }}>{t("Create rules from a transaction's category picker or the suggestions on the right.")}</span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
                        <thead>
                          <tr style={{ borderTop: "1px solid rgba(120,120,140,0.14)", borderBottom: "1px solid rgba(120,120,140,0.14)" }}>
                            <th style={thStyle}>{t("Condition")}</th>
                            <th style={thStyle}>{t("Category")}</th>
                            <th style={thStyle}>{t("VAT / Tax code")}</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>{t("Matches")}</th>
                            <th style={thStyle}>{t("Last used")}</th>
                            <th style={thStyle} aria-label={t("Actions")} />
                          </tr>
                        </thead>
                        <tbody>
                          {rules.length === 0 ? (
                            <tr><td colSpan={6} style={{ ...tdStyle, opacity: 0.65 }}>{t("No rules yet — set a category on a transaction and tick the rule box.")}</td></tr>
                          ) : rules.map(rule => {
                            const stat = ruleStats.get(rule.id);
                            return (
                              <tr key={rule.id} style={{ borderBottom: "1px solid rgba(120,120,140,0.1)" }}>
                                <td style={tdStyle}><span style={{ opacity: 0.65 }}>{t("If merchant contains")}</span> <strong>"{rule.keyword}"</strong></td>
                                <td style={tdStyle}><span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: `${categoryColor(rule.category)}1a`, color: categoryColor(rule.category) }}>{t(rule.category)}</span></td>
                                <td style={{ ...tdStyle, opacity: 0.75 }}>{categoryTax[rule.category] ? t(vatLabel(categoryTax[rule.category])) : "—"}</td>
                                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}><strong>{stat?.count ?? 0}</strong> <span style={{ opacity: 0.6 }}>· {money(stat?.total ?? 0, currency0)}</span></td>
                                <td style={{ ...tdStyle, whiteSpace: "nowrap", opacity: 0.75 }}>{stat?.lastDate ? new Date(stat.lastDate).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                                  {isOwner ? <button type="button" className="finance-payments-delete" disabled={busy === `rule-${rule.id}`} onClick={() => void deleteRule(rule)} aria-label={t("Delete this rule?")}>✕</button> : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div style={bankCard}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <strong style={{ fontSize: 14.5 }}>{t("Suggested rules")}</strong>
                      <span style={{ flex: 1 }} />
                      <span style={countBadge}>{suggestedRules.length}</span>
                    </div>
                    {suggestedRules.length === 0 ? <p style={{ fontSize: 12, opacity: 0.65, margin: 0 }}>{t("No suggestions right now — categorise a few more transactions.")}</p> : null}
                    {suggestedRules.map(item => (
                      <div key={item.keyword} style={{ padding: "8px 0", borderBottom: "1px solid rgba(120,120,140,0.1)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.merchant}</div>
                            <div style={{ fontSize: 11, opacity: 0.65 }}>{t("If merchant contains")} "{item.keyword}" → <span style={{ color: categoryColor(item.category), fontWeight: 700 }}>{t(item.category)}</span> · {item.count} {t("matches").toLowerCase()}</div>
                          </div>
                          {isOwner ? <button type="button" style={{ ...attentionLink, fontSize: 12 }} disabled={busy === `rule-${item.keyword}`} onClick={() => void createSuggestedRule(item)}>{t("Create rule")}</button> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {/* Pandle bridge ships dark until Pandle issues the OAuth app credentials
                 (NEXT_PUBLIC_PANDLE_ENABLED=1 turns the card on). */}
            {isOwner && tab === "overview" && process.env.NEXT_PUBLIC_PANDLE_ENABLED === "1" ? <PandleCard companyId={companyId} categoriesInUse={categoriesInUse} t={t} money={money} /> : null}
          </>
        ) : null}
      </div>

      {/* ================= TRANSACTION DRAWER ================= */}
      {drawerTx ? (
        <aside style={drawerStyle} aria-label={t("Transaction details")}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 18px", borderBottom: "1px solid rgba(120,120,140,0.16)" }}>
            <button type="button" className="finance-payments-delete" onClick={() => setDrawerTxId(null)} aria-label={t("Close")}>✕</button>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 14.5 }}>{t("Transaction details")}</strong>
              <div style={{ fontSize: 11, opacity: 0.6 }}>{new Date(drawerTx.bookingDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}{drawerTx.status === "pending" ? ` · ${t("pending")}` : ""}</div>
            </div>
            <button type="button" className="finance-payments-delete" onClick={() => drawerStep(-1)} aria-label={t("Previous")}>↑</button>
            <button type="button" className="finance-payments-delete" onClick={() => drawerStep(1)} aria-label={t("Next")}>↓</button>
          </div>
          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span aria-hidden="true" style={{ ...avatarStyle, width: 38, height: 38, background: `${avatarColor(drawerTx.counterparty || drawerTx.description || "x")}22`, color: avatarColor(drawerTx.counterparty || drawerTx.description || "x") }}>{initials(drawerTx.counterparty || drawerTx.description)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{drawerTx.counterparty || drawerTx.description}</div>
                <div style={{ fontSize: 11, opacity: 0.65 }}>{TX_TYPE_META[drawerTx.txType] ? (TX_TYPE_META[drawerTx.txType].translate ? t(TX_TYPE_META[drawerTx.txType].label) : TX_TYPE_META[drawerTx.txType].label) : drawerTx.txType}{lastSync ? ` · ${t("Last sync")} ${lastSync.toLocaleString()}` : ""}</div>
              </div>
              <strong style={{ fontSize: 16, fontVariantNumeric: "tabular-nums", color: drawerTx.amount < 0 ? "#dc2626" : "#16a34a", whiteSpace: "nowrap" }}>{drawerTx.amount < 0 ? "−" : "+"}{money(Math.abs(drawerTx.amount), drawerTx.currency)}</strong>
            </div>
            <div>
              <div style={drawerLabel}>{t("Raw bank description")}</div>
              <div style={{ fontSize: 12, padding: "8px 10px", borderRadius: 8, background: "rgba(120,120,140,0.1)", wordBreak: "break-word" }}>{drawerTx.description || "—"}</div>
            </div>
            {drawerTx.amount < 0 ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label>
                    <div style={drawerLabel}>{t("Category")}</div>
                    <select value={drawerCategory} disabled={!isOwner} onChange={event => setDrawerCategory(event.target.value)} style={{ ...pickerInput, width: "100%" }}>
                      <option value="">{t("Uncategorised")}</option>
                      {Array.from(new Set([...BANK_CATEGORIES, ...categoriesInUse, ...(drawerCategory ? [drawerCategory] : [])])).map(name => <option key={name} value={name}>{t(name)}</option>)}
                    </select>
                    {!drawerTx.category && drawerTx.categoryAuto ? <div style={{ fontSize: 10.5, opacity: 0.6, marginTop: 3 }}>⚡ {t("Auto-applied")}: {t(drawerTx.categoryAuto)}</div> : null}
                  </label>
                  <label>
                    <div style={drawerLabel}>{t("VAT / Tax code")}</div>
                    <select value={drawerVat} disabled={!isOwner} onChange={event => setDrawerVat(event.target.value)} style={{ ...pickerInput, width: "100%" }}>
                      <option value="">{t("Use category default")}{drawerCategory && categoryTax[drawerCategory] ? ` (${t(vatLabel(categoryTax[drawerCategory]))})` : ""}</option>
                      {VAT_CODES.map(item => <option key={item.code} value={item.code}>{t(item.label)}</option>)}
                    </select>
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label>
                    <div style={drawerLabel}>{t("Linked order or project")}</div>
                    <select value={drawerOrderId} disabled={!isOwner} onChange={event => setDrawerOrderId(event.target.value)} style={{ ...pickerInput, width: "100%" }}>
                      <option value="">{t("Not linked")}</option>
                      {(orderOptions ? rankOrdersForTransaction(drawerTx, orderOptions).slice(0, 40).map(item => item.order) : []).map(order => (
                        <option key={order.id} value={order.id}>{order.customerName}{order.designName && order.designName !== "Untitled design" ? ` · ${order.designName}` : ""}</option>
                      ))}
                      {drawerOrderId && orderOptions && !orderOptions.some(order => order.id === drawerOrderId) ? <option value={drawerOrderId}>{drawerTx.linkedOrderLabel || t("Order")}</option> : null}
                    </select>
                    {orderSuggestions.get(drawerTx.id) && !drawerOrderId ? (
                      <button type="button" onClick={() => setDrawerOrderId(orderSuggestions.get(drawerTx.id)!.orderId)} style={{ ...attentionLink, fontSize: 11, marginTop: 3 }}>
                        ⛓ {t("Likely related to this order")}: {orderSuggestions.get(drawerTx.id)!.label} ({Math.round(orderSuggestions.get(drawerTx.id)!.confidence * 100)}%)
                      </button>
                    ) : null}
                  </label>
                  <div>
                    <div style={drawerLabel}>{t("Receipt / attachment")}</div>
                    <div style={{ fontSize: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(120,120,140,0.25)" }}>
                      {drawerTx.receiptPath ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ {t("Matched")}</span>
                          <button type="button" onClick={() => void openReceipt(drawerTx)} style={{ ...attentionLink, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{drawerTx.receiptName || t("View invoice")}</button>
                          {isOwner ? <button type="button" className="finance-payments-delete" onClick={() => void removeReceipt(drawerTx)} aria-label={t("Remove invoice")} style={{ fontSize: 10 }}>✕</button> : null}
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ color: drawerTx.receiptNotNeeded ? "inherit" : "#dc2626", fontWeight: 700, opacity: drawerTx.receiptNotNeeded ? 0.6 : 1 }}>{drawerTx.receiptNotNeeded ? t("No receipt needed") : `! ${t("Missing receipt")}`}</span>
                          {isOwner ? <button type="button" style={{ ...attentionLink, fontSize: 11.5 }} onClick={() => { setPendingAttachTxId(drawerTx.id); document.getElementById("bank-receipt-input")?.click(); }}>{t("Attach")}</button> : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
            <label>
              <div style={drawerLabel}>{t("Notes")}</div>
              <textarea value={drawerNote} disabled={!isOwner} onChange={event => setDrawerNote(event.target.value)} rows={3} placeholder={t("Internal note for this transaction")} style={{ ...pickerInput, width: "100%", resize: "vertical", fontFamily: "inherit" }} />
            </label>
            {drawerTx.amount < 0 && isOwner && drawerCategory && !rules.some(rule => `${drawerTx.counterparty} ${drawerTx.description}`.toLowerCase().includes(rule.keyword)) ? (
              <div style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(37,99,235,0.25)", background: "rgba(37,99,235,0.06)", fontSize: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>✦ {t("Rule suggestion")}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {t("If merchant contains")}
                  <input type="text" value={drawerRuleKeyword} onChange={event => setDrawerRuleKeyword(event.target.value)} style={{ ...pickerInput, width: 120, flex: "none", fontWeight: 700, padding: "3px 6px", fontSize: 11.5 }} />
                  → <strong style={{ color: categoryColor(drawerCategory) }}>{t(drawerCategory)}</strong>
                </div>
              </div>
            ) : null}
            {drawerTx.amount < 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
                <div style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(120,120,140,0.2)" }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>↻ {t("Recurring")}</div>
                  {recurringKeys.has(recurringMerchantKey(drawerTx)) ? <span style={{ color: "#16a34a" }}>{t("Part of a recurring payment")}</span> : <span style={{ opacity: 0.65 }}>{t("This transaction doesn't appear to repeat.")}</span>}
                </div>
                <div style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(120,120,140,0.2)" }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>⇄ {t("Activity & sync")}</div>
                  {drawerTx.pandleStatus === "confirmed" ? <span style={{ color: "#16a34a" }}>✓ {t("Confirmed in Pandle")}</span> : <span style={{ opacity: 0.65 }}>{t("Not synced to Pandle yet")}</span>}
                </div>
              </div>
            ) : null}
          </div>
          {isOwner ? (
            <div style={{ display: "flex", gap: 8, padding: "12px 18px", borderTop: "1px solid rgba(120,120,140,0.16)" }}>
              <button type="button" style={{ ...bankBtn, flex: 1, background: "#2563eb", color: "#fff", borderColor: "#2563eb" }} disabled={busy === "drawer"} onClick={() => void saveDrawer(false)}>{busy === "drawer" ? t("Saving…") : t("Save")}</button>
              {drawerTx.amount < 0 && drawerCategory ? <button type="button" style={{ ...bankBtn, flex: 1 }} disabled={busy === "drawer"} onClick={() => void saveDrawer(true)}>{t("Save & create rule")}</button> : null}
            </div>
          ) : null}
        </aside>
      ) : null}
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
const attentionLink: React.CSSProperties = { border: 0, background: "transparent", color: "#2563eb", fontWeight: 700, fontSize: 11.5, cursor: "pointer", padding: 0, textAlign: "left" };
const drawerStyle: React.CSSProperties = { position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "100vw", background: "var(--surface, #fff)", borderLeft: "1px solid rgba(120,120,140,0.2)", boxShadow: "-12px 0 30px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", zIndex: 60 };
const drawerLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.65, marginBottom: 4 };
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

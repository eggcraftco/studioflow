"use client";

// Bank spending feed (Open Banking via TrueLayer).
// Owner-only: connect a business bank account, see the live transaction feed.
// Read-only account information — the app can never move money.

import React, { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
import { detectPossibleDuplicates, detectRecurringSpends, monthlyFixedTotal, recurringMerchantKey, rankOrdersForTransaction, suggestCategory, suggestOrderLink, vendorKeyMap, type BankVendor, type RecurringSpend } from "@/lib/studioflow/bankInsights";
import { listLibraryFiles } from "@/lib/studioflow/filesLibrary";
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
  // Server-written health of the consent: "ok" | "needs_reconsent" | "error".
  syncState: string;
  consentExpiresAt: Date | null;
  lastSyncError: string;
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
  purchaseNumber: string;
  category: string;
  categoryAuto: string;
  txType: string;
  vatCode: string;
  vatCodeAuto: string;
  note: string;
  receiptNotNeeded: boolean;
  pandleStatus: string;
  // Permanent identities + the read-only bank layer shown in the drawer.
  accountId: string;
  provider: string;
  providerTransactionId: string;
  providerReference: string;
  reviewStatus: string;
  incomingKind: string;
  linkedPaymentId: string;
  receiptFileRecordId: string;
  splits: Array<{ amount: number; category: string; vatCode?: string; note?: string; orderId?: string; orderLabel?: string }>;
  pandleBankTransactionId: string;
  pandleLastError: string;
  firstImportedAt: Date | null;
  importedAt: Date | null;
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
type BankRule = { id: string; keyword: string; category: string; vatCode: string; appliesTo: "out" | "in" | "both" };
// A receipt uploaded before its payment reached the bank feed; the server
// re-scores it after every sync and attaches it when a confident match lands.
type WaitingReceipt = { id: string; storagePath: string; fileName: string; amount: number; date: string; source: string; createdAt: Date | null; attempts: number };

// NivaDesk's own VAT treatments — the accounting connector translates them
// per provider at push time, nothing here is a Pandle code. Zero-rated and
// exempt are different VAT-return boxes, so they are separate on purpose.
const VAT_CODES: Array<{ code: string; label: string }> = [
  { code: "ST", label: "Standard rate (20%)" },
  { code: "RR", label: "Reduced rate (5%)" },
  { code: "ZR", label: "Zero-rated (0%)" },
  { code: "EX", label: "Exempt" },
  { code: "OS", label: "Outside scope" },
  { code: "NR", label: "No VAT receipt" },
  { code: "RC", label: "Reverse charge" },
  { code: "IM", label: "Import VAT" },
  { code: "MX", label: "Mixed / split VAT" },
  { code: "NV", label: "No VAT" }
];
const vatLabel = (code: string) => VAT_CODES.find(item => item.code === code)?.label || code;

// Where a transaction stands on its way to the accountant. The colour keys
// the chip in the table and the drawer; "unreviewed" is the absent default.
const REVIEW_STATUSES: Array<{ code: string; label: string; color: string }> = [
  { code: "unreviewed", label: "Unreviewed", color: "#6b7280" },
  { code: "needs_info", label: "Needs information", color: "#b45309" },
  { code: "ready", label: "Ready for accounting", color: "#2563eb" },
  { code: "synced", label: "Synced", color: "#0e7a55" },
  { code: "confirmed", label: "Confirmed in accounting", color: "#16a34a" },
  { code: "sync_error", label: "Sync error", color: "#dc2626" },
  { code: "ignored", label: "Ignored", color: "#9ca3af" }
];
const reviewStatusMeta = (code: string) => REVIEW_STATUSES.find(item => item.code === code) || REVIEW_STATUSES[0];
// The field is enrichment; a confirmed Pandle push implies "confirmed" even
// on rows saved before review statuses existed.
function effectiveReviewStatus(tx: { reviewStatus: string; pandleStatus: string }) {
  if (tx.reviewStatus) return tx.reviewStatus;
  return tx.pandleStatus === "confirmed" ? "confirmed" : "unreviewed";
}

const BANK_CATEGORIES = [
  "Materials", "Equipment", "Shipping", "Software", "Subscriptions", "Fees",
  "Marketing", "Travel", "Utilities", "Rent", "Staff", "Tax", "Other"
] as const;

// A workspace-defined category record: rename/deactivate/default VAT +
// per-provider mapping. Server-written (bankSaveCategory), owner-readable.
type BankCategoryRecord = {
  id: string;
  name: string;
  type: "expense" | "income" | "transfer";
  defaultVatCode: string;
  reportingGroup: string;
  active: boolean;
  pandleNominalCode: string;
  pandleTaxCode: string;
  quickbooksAccountId: string;
  xeroAccountCode: string;
};

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
  const [customCategories, setCustomCategories] = useState<BankCategoryRecord[]>([]);
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
  const [orderOptions, setOrderOptions] = useState<OrderOptionItem[] | null>(null);
  const [pendingAttachTxId, setPendingAttachTxId] = useState<string | null>(null);
  const [rules, setRules] = useState<BankRule[]>([]);
  const [waitingReceipts, setWaitingReceipts] = useState<WaitingReceipt[]>([]);
  const [vendors, setVendors] = useState<BankVendor[]>([]);
  // Waiting receipt being assigned by hand → shows a transaction picker.
  const [assignWaitingId, setAssignWaitingId] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showRecurring, setShowRecurring] = useState(true);
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState<10 | 20 | 30>(10);
  const [sortAsc, setSortAsc] = useState(false);
  const [showAllCats, setShowAllCats] = useState(false);
  // "Needs attention" queue filter for the transactions table.
  const [txAttention, setTxAttention] = useState<"none" | "any" | "uncategorised" | "noReceipt" | "duplicate">("none");
  // Free-text search over merchant / raw description, and the opt-in bulk-select mode
  // that reveals the row checkboxes (kept out of the way until it is asked for).
  const [txSearch, setTxSearch] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  // Rules tab: search box, the rule shown in the preview bar, and the inline "New rule" form.
  const [ruleSearch, setRuleSearch] = useState("");
  const [previewRuleId, setPreviewRuleId] = useState<string | null>(null);
  const [newRuleOpen, setNewRuleOpen] = useState(false);
  const [newRuleKeyword, setNewRuleKeyword] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState("");
  const [newRuleVat, setNewRuleVat] = useState("");
  const [newRuleAppliesTo, setNewRuleAppliesTo] = useState<BankRule["appliesTo"]>("out");
  // Category manager (Rules tab): one shared form for add + edit.
  const [catFormOpen, setCatFormOpen] = useState(false);
  const [catFormId, setCatFormId] = useState("");
  const [catFormName, setCatFormName] = useState("");
  const [catFormType, setCatFormType] = useState<BankCategoryRecord["type"]>("expense");
  const [catFormVat, setCatFormVat] = useState("");
  const [catFormPandleNominal, setCatFormPandleNominal] = useState("");
  const [catFormXero, setCatFormXero] = useState("");
  const [catFormQuickbooks, setCatFormQuickbooks] = useState("");
  const [catFormActive, setCatFormActive] = useState(true);
  // Bulk review: selected spending rows + the category to apply to all of them.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  // After accepting a suggestion: offer to turn it into a rule for that merchant.
  const [rulePrompt, setRulePrompt] = useState<{ keyword: string; category: string } | null>(null);
  // Category → default VAT code (from the Pandle mapping, falls back to defaults).
  const [categoryTax, setCategoryTax] = useState<Record<string, string>>({});
  const [bulkVat, setBulkVat] = useState("");
  const [bulkReview, setBulkReview] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [txReview, setTxReview] = useState("");
  const [drawerOrderSearch, setDrawerOrderSearch] = useState("");
  const [drawerSplits, setDrawerSplits] = useState<Array<{ amount: string; category: string; vatCode: string; note: string; orderId: string }> | null>(null);
  const [incomingSuggest, setIncomingSuggest] = useState<{ orderLabel: string; candidates: Array<{ id: string; amount: number; method: string; note: string; dateMs: number }> } | null>(null);
  const [incomingOrderId, setIncomingOrderId] = useState("");
  const [filesPicker, setFilesPicker] = useState<{ open: boolean; loading: boolean; files: Array<{ id: string; displayName: string; fileName: string; fileType: string }>; search: string }>({ open: false, loading: false, files: [], search: "" });
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
  const [drawerReview, setDrawerReview] = useState("unreviewed");
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
            lastSyncedAt: toDate(data.lastSyncedAt),
            consentExpiresAt: toDate(data.consentExpiresAt),
            syncState: String(data.syncState || "ok"),
            lastSyncError: String(data.lastSyncError || "")
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
            purchaseNumber: String(data.purchaseNumber || ""),
            category: String(data.category || ""),
            categoryAuto: String(data.categoryAuto || ""),
            txType: String(data.txType || ""),
            vatCode: String(data.vatCode || ""),
            vatCodeAuto: String(data.vatCodeAuto || ""),
            note: String(data.note || ""),
            receiptNotNeeded: data.receiptNotNeeded === true,
            pandleStatus: String((data.pandle as { status?: string } | undefined)?.status || ""),
            accountId: String(data.accountId || ""),
            provider: String(data.provider || ""),
            providerTransactionId: String(data.providerTransactionId || ""),
            providerReference: String(data.providerReference || ""),
            reviewStatus: String(data.reviewStatus || ""),
            incomingKind: String(data.incomingKind || ""),
            linkedPaymentId: String(data.linkedPaymentId || ""),
            receiptFileRecordId: String(data.receiptFileRecordId || ""),
            splits: Array.isArray(data.splits) ? (data.splits as BankTransaction["splits"]) : [],
            pandleBankTransactionId: String((data.pandle as { bankTransactionId?: string } | undefined)?.bankTransactionId || ""),
            pandleLastError: String((data.pandle as { lastError?: string } | undefined)?.lastError || ""),
            firstImportedAt: toDate(data.firstImportedAt),
            importedAt: toDate(data.importedAt)
          };
        }));
      }
    );
    const unsubCategories = onSnapshot(
      collection(db, "companies", companyId, "bankCategories"),
      snap => {
        setCustomCategories(snap.docs.map(docSnap => {
          const data = docSnap.data() as Record<string, unknown>;
          const mappings = (data.mappings || {}) as { pandle?: { nominalCode?: string; taxCode?: string }; quickbooks?: { accountId?: string }; xero?: { accountCode?: string } };
          return {
            id: docSnap.id,
            name: String(data.name || ""),
            type: (["expense", "income", "transfer"].includes(String(data.type)) ? String(data.type) : "expense") as BankCategoryRecord["type"],
            defaultVatCode: String(data.defaultVatCode || ""),
            reportingGroup: String(data.reportingGroup || ""),
            active: data.active !== false,
            pandleNominalCode: String(mappings.pandle?.nominalCode || ""),
            pandleTaxCode: String(mappings.pandle?.taxCode || ""),
            quickbooksAccountId: String(mappings.quickbooks?.accountId || ""),
            xeroAccountCode: String(mappings.xero?.accountCode || "")
          };
        }).filter(item => item.name).sort((a, b) => a.name.localeCompare(b.name)));
      },
      () => setCustomCategories([])
    );
    const unsubRules = onSnapshot(
      collection(db, "companies", companyId, "bankRules"),
      snap => {
        setRules(snap.docs.map(doc => {
          const data = doc.data() as Record<string, unknown>;
          return {
            id: doc.id,
            keyword: String(data.keyword || ""),
            category: String(data.category || ""),
            vatCode: String(data.vatCode || ""),
            appliesTo: (["out", "in", "both"].includes(String(data.appliesTo)) ? String(data.appliesTo) : "out") as BankRule["appliesTo"]
          };
        }));
      },
      () => setRules([])
    );
    const unsubVendors = onSnapshot(
      collection(db, "companies", companyId, "bankVendors"),
      snap => {
        setVendors(snap.docs.map(docSnap => {
          const data = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            name: String(data.name || ""),
            keys: Array.isArray(data.keys) ? (data.keys as string[]) : [],
            cadence: (["weekly", "monthly", "yearly"].includes(String(data.cadence)) ? String(data.cadence) : "monthly") as BankVendor["cadence"]
          };
        }));
      },
      () => setVendors([])
    );
    const unsubWaiting = onSnapshot(
      collection(db, "companies", companyId, "bankReceiptInbox"),
      snap => {
        setWaitingReceipts(snap.docs
          .map(docSnap => {
            const data = docSnap.data() as Record<string, unknown>;
            const created = data.createdAt as { toDate?: () => Date } | undefined;
            return {
              id: docSnap.id,
              storagePath: String(data.storagePath || ""),
              fileName: String(data.fileName || "receipt"),
              amount: Number(data.amount) || 0,
              date: String(data.date || ""),
              source: String(data.source || "web"),
              createdAt: created?.toDate ? created.toDate() : null,
              attempts: Number(data.attempts) || 0
            };
          })
          .filter(item => item.storagePath)
          .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)));
      },
      () => setWaitingReceipts([])
    );
    const unsubPandle = onSnapshot(doc(db, "companies", companyId, "pandleConnection", "main"), snap => {
      const mappings = (snap.data()?.mappings as Array<{ category: string; taxCode: string }> | undefined) ?? [];
      const source = mappings.length ? mappings : PANDLE_DEFAULT_MAPPINGS;
      setCategoryTax(Object.fromEntries(source.map(item => [item.category, item.taxCode])));
    }, () => setCategoryTax(Object.fromEntries(PANDLE_DEFAULT_MAPPINGS.map(item => [item.category, item.taxCode]))));
    return () => { unsubConnections(); unsubTransactions(); unsubCategories(); unsubRules(); unsubVendors(); unsubWaiting(); unsubPandle(); };
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

  // Disconnect and delete are different decisions, kept apart on purpose:
  // disconnecting only revokes the bank consent and KEEPS everything already
  // imported (and changes nothing in Pandle); purging the data is a second,
  // explicit step offered on an already-disconnected connection.
  async function removeConnection(connection: BankConnection, mode: "disconnect" | "purge" = "disconnect") {
    const message = mode === "purge"
      ? t("Delete every imported transaction of this connection? This cannot be undone.")
      : t("Disconnect this bank account? Everything already imported stays in NivaDesk, and nothing in Pandle changes. You can reconnect any time.");
    if (!window.confirm(message)) return;
    setBusy(`delete-${connection.id}`);
    setError(null);
    try {
      await call("bankDeleteConnection", { requisitionId: connection.id, mode });
      setStatus(mode === "purge" ? t("Connection and its imported data removed.") : t("Bank disconnected — your imported transactions were kept."));
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

  async function linkToOrder(transaction: BankTransaction, orderId: string) {
    setBusy(`link-${transaction.id}`);
    setError(null);
    try {
      await call("bankLinkTransactionToOrder", { transactionId: transaction.id, orderId });
      setStatus(t("Added to the order's expenses."));
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Could not link the transaction.");
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

  // "Keep waiting": the receipt stays in the inbox and the server attaches it
  // once the payment shows up in the feed.
  async function keepReceiptWaiting() {
    if (!ocrInboxPath) return;
    setBusy("ocr-queue");
    setError(null);
    try {
      await call("bankQueueInboxReceipt", { storagePath: ocrInboxPath, fileName: ocrFileName, amount: ocrParsed?.amount ?? 0, date: ocrParsed?.date ?? "" });
      setStatus(t("Receipt saved — it will be attached when the payment reaches the bank."));
      setOcrInboxPath(null);
      setOcrCandidates(null);
      setOcrParsed(null);
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Could not save the receipt.");
    } finally {
      setBusy(null);
    }
  }
  async function assignWaitingReceipt(item: WaitingReceipt, transactionId: string) {
    setBusy(`waiting-${item.id}`);
    setError(null);
    try {
      await call("bankAssignInboxReceipt", { storagePath: item.storagePath, transactionId, fileName: item.fileName });
      setStatus(t("Invoice attached."));
      setAssignWaitingId(null);
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Could not attach the invoice.");
    } finally {
      setBusy(null);
    }
  }
  async function matchWaitingNow() {
    setBusy("waiting-match");
    setError(null);
    try {
      const result = await call<{ matched: number }>("bankMatchWaitingReceipts", {});
      setStatus(result.matched ? `${result.matched} ${t("receipts attached.")}` : t("No confident match yet — the payment may not have reached the bank."));
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : "Could not match the receipts.");
    } finally {
      setBusy(null);
    }
  }
  async function deleteWaitingReceipt(item: WaitingReceipt) {
    if (!window.confirm(t("Remove this waiting receipt?"))) return;
    setBusy(`waiting-${item.id}`);
    try {
      await call("bankDeleteInboxReceipt", { id: item.id });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not remove the receipt.");
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

  async function applyBulkReview(reviewStatus: string) {
    if (selectedIds.size === 0) return;
    setBusy("review");
    setError(null);
    try {
      const result = await call<{ updated: number }>("bankSetReviewStatusBulk", { transactionIds: Array.from(selectedIds), reviewStatus });
      setStatus(`${result.updated} ${t("transactions updated")}`);
      setSelectedIds(new Set());
      setBulkReview("");
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Could not update the transactions.");
    } finally {
      setBusy(null);
    }
  }

  // ---- Split transaction ----------------------------------------------------
  function startSplitEditor(tx: BankTransaction) {
    const abs = Math.abs(tx.amount);
    setDrawerSplits(tx.splits.length
      ? tx.splits.map(row => ({ amount: String(row.amount), category: row.category, vatCode: row.vatCode || "", note: row.note || "", orderId: row.orderId || "" }))
      : [
        { amount: abs.toFixed(2), category: effectiveCategory(tx) || "", vatCode: tx.vatCode || "", note: "", orderId: "" },
        { amount: "0.00", category: "", vatCode: "", note: "", orderId: "" }
      ]);
  }
  async function saveSplits() {
    if (!drawerTx || !drawerSplits) return;
    setBusy("splits");
    setError(null);
    try {
      const splits = drawerSplits
        .filter(row => Number(row.amount) > 0 || row.category)
        .map(row => ({ amount: Number(row.amount) || 0, category: row.category, vatCode: row.vatCode, note: row.note, orderId: row.orderId }));
      const result = await call<{ lines?: number; cleared?: boolean }>("bankSetTransactionSplits", { transactionId: drawerTx.id, splits });
      setDrawerSplits(null);
      setStatus(result.cleared ? t("Split removed.") : t("Split saved."));
    } catch (splitError) {
      setError(splitError instanceof Error ? splitError.message : "Could not save the split.");
    } finally {
      setBusy(null);
    }
  }
  async function removeSplits() {
    if (!drawerTx) return;
    setBusy("splits");
    try {
      await call("bankSetTransactionSplits", { transactionId: drawerTx.id, splits: [] });
      setDrawerSplits(null);
      setStatus(t("Split removed."));
    } catch (splitError) {
      setError(splitError instanceof Error ? splitError.message : "Could not save the split.");
    } finally {
      setBusy(null);
    }
  }

  // ---- Receipt from the central Files library --------------------------------
  async function openFilesPicker() {
    if (!workspace) return;
    setFilesPicker({ open: true, loading: true, files: [], search: "" });
    try {
      const result = await listLibraryFiles(workspace);
      setFilesPicker({
        open: true, loading: false, search: "",
        files: (result.files || [])
          .filter(file => !file.trashedAtMs)
          .map(file => ({ id: file.id, displayName: file.displayName || file.fileName, fileName: file.fileName, fileType: file.fileType }))
      });
    } catch (pickError) {
      setFilesPicker(prev => ({ ...prev, open: false, loading: false }));
      setError(pickError instanceof Error ? pickError.message : "The file library could not be loaded.");
    }
  }
  async function chooseLibraryReceipt(fileId: string) {
    if (!drawerTx) return;
    setBusy("receipt-pick");
    setError(null);
    try {
      await call("bankSetTransactionReceipt", { transactionId: drawerTx.id, fileRecordId: fileId });
      setFilesPicker(prev => ({ ...prev, open: false }));
      setStatus(t("Receipt attached from Files."));
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : "Could not attach the file.");
    } finally {
      setBusy(null);
    }
  }

  // ---- Incoming ↔ order payment ----------------------------------------------
  async function incomingCall(mode: "suggest" | "link" | "create" | "unlink", paymentId?: string) {
    if (!drawerTx) return;
    setBusy("incoming");
    setError(null);
    try {
      const payload: Record<string, unknown> = { transactionId: drawerTx.id, mode };
      if (mode !== "unlink") payload.orderId = incomingOrderId;
      if (paymentId) payload.paymentId = paymentId;
      const result = await call<{ ok: boolean; orderLabel?: string; candidates?: Array<{ id: string; amount: number; method: string; note: string; dateMs: number }>; needsChoice?: boolean; linked?: boolean; created?: boolean; unlinked?: boolean; already?: boolean }>("bankMatchIncomingToOrder", payload);
      if (mode === "suggest" || result.needsChoice) {
        setIncomingSuggest({ orderLabel: result.orderLabel || "", candidates: result.candidates || [] });
      } else if (result.linked || result.created) {
        setIncomingSuggest(null);
        setStatus(result.created ? t("Payment recorded on the order.") : t("Matched to the order's existing payment — nothing was recorded twice."));
      } else if (result.unlinked) {
        setIncomingSuggest(null);
        setStatus(t("Match removed — the payment entry stays on the order."));
      }
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : "Could not match the payment.");
    } finally {
      setBusy(null);
    }
  }

  const effectiveVat = (tx: BankTransaction) => tx.vatCode || tx.vatCodeAuto || categoryTax[effectiveCategory(tx)] || "";
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
  const allAccounts = useMemo(() => connections.flatMap(item => item.accounts), [connections]);
  // Every pickable category: presets + the workspace's own active records +
  // whatever the feed already uses. A deactivated record drops out of the
  // pickers but keeps colouring existing rows.
  const categoryOptions = useMemo(() => {
    const set = new Set<string>(BANK_CATEGORIES);
    customCategories.forEach(item => { if (item.active) set.add(item.name); else set.delete(item.name); });
    categoriesInUse.forEach(name => set.add(name));
    return Array.from(set);
  }, [customCategories, categoriesInUse]);

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
  const recurring = useMemo<RecurringSpend[]>(() => detectRecurringSpends(transactions, vendors), [transactions, vendors]);
  const vendorByKey = useMemo(() => vendorKeyMap(vendors), [vendors]);
  const duplicateIds = useMemo(() => detectPossibleDuplicates(visibleTransactions), [visibleTransactions]);
  // What the owner should act on in this period — drives the Needs Attention tile.
  const attention = useMemo(() => {
    const spending = visibleTransactions.filter(item => item.amount < 0);
    const uncategorised = spending.filter(item => !effectiveCategory(item));
    // "Marked no receipt needed" is a resolved state, not an open action.
    const noReceipt = spending.filter(item => !item.receiptPath && !item.receiptNotNeeded);
    const priceChanged = recurring.filter(item => item.active && item.priceChange);
    const cancelled = recurring.filter(item => !item.active);
    return {
      uncategorised: uncategorised.length,
      uncategorisedAmount: uncategorised.reduce((acc, item) => acc + Math.abs(item.amount), 0),
      noReceipt: noReceipt.length,
      duplicates: duplicateIds.size,
      priceChanged: priceChanged.length,
      cancelled: cancelled.length,
      waitingReceipts: waitingReceipts.length,
      brokenConnections: connections.filter(item => item.status === "linked" && item.syncState !== "ok").length,
      total: uncategorised.length + noReceipt.length + duplicateIds.size + priceChanged.length + cancelled.length + waitingReceipts.length
        + connections.filter(item => item.status === "linked" && item.syncState !== "ok").length
    };
  }, [visibleTransactions, recurring, duplicateIds, waitingReceipts, connections]);
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
    const stats = new Map<string, { count: number; total: number; lastDate: string; txType: string }>();
    for (const rule of rules) {
      let count = 0, total = 0, lastDate = "";
      const types = new Map<string, number>();
      for (const tx of transactions) {
        if (tx.amount >= 0) continue;
        if (`${tx.counterparty} ${tx.description}`.toLowerCase().includes(rule.keyword)) {
          count += 1; total += Math.abs(tx.amount); if (tx.bookingDate > lastDate) lastDate = tx.bookingDate;
          types.set(tx.txType, (types.get(tx.txType) ?? 0) + 1);
        }
      }
      const txType = Array.from(types.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      stats.set(rule.id, { count, total, lastDate, txType });
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
    setDrawerReview(effectiveReviewStatus(tx));
    setDrawerNote(tx.note);
    setDrawerOrderId(tx.linkedOrderId);
    setDrawerRuleKeyword(suggestions.get(tx.id)?.keyword || suggestRuleKeyword(tx));
    setCategoryPickerTxId(null);
    setDrawerOrderSearch("");
    setDrawerSplits(null);
    setIncomingSuggest(null);
    setIncomingOrderId(tx.linkedOrderId || "");
    setFilesPicker(prev => ({ ...prev, open: false, search: "" }));
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
      await call("bankUpdateTransaction", { transactionId: drawerTx.id, category: drawerCategory, vatCode: drawerVat, note: drawerNote, reviewStatus: drawerReview });
      if (drawerOrderId !== drawerTx.linkedOrderId) {
        if (drawerTx.linkedOrderId) await call("bankLinkTransactionToOrder", { transactionId: drawerTx.id, orderId: drawerTx.linkedOrderId });
        if (drawerOrderId) await call("bankLinkTransactionToOrder", { transactionId: drawerTx.id, orderId: drawerOrderId });
      }
      const keyword = drawerRuleKeyword.trim().toLowerCase();
      if (createRule && drawerCategory && keyword.length >= 2) {
        await call("bankSaveRule", { keyword, category: drawerCategory, vatCode: drawerVat, appliesTo: "out" });
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
  // Vendors: merge the bank names that mean one payee, and let the owner say
  // "this repeats" for payments the detector cannot recognise (payroll, rent).
  async function markRecurring(tx: BankTransaction, cadence: "weekly" | "monthly" | "yearly", vendorId?: string) {
    setBusy(`vendor-${tx.id}`);
    setError(null);
    try {
      await call("bankSaveVendor", {
        vendorId: vendorId ?? "",
        name: vendorId ? "" : (tx.counterparty || tx.description).slice(0, 120),
        keys: [recurringMerchantKey(tx)],
        cadence
      });
      setStatus(vendorId ? t("Merged with the other payments.") : t("Marked as recurring."));
    } catch (vendorError) {
      setError(vendorError instanceof Error ? vendorError.message : "Could not save the vendor.");
    } finally {
      setBusy(null);
    }
  }
  async function unmarkRecurring(tx: BankTransaction, vendorId: string) {
    setBusy(`vendor-${tx.id}`);
    try {
      await call("bankDeleteVendor", { vendorId, key: recurringMerchantKey(tx) });
      setStatus(t("No longer treated as recurring."));
    } catch (vendorError) {
      setError(vendorError instanceof Error ? vendorError.message : "Could not update the vendor.");
    } finally {
      setBusy(null);
    }
  }
  async function createAllSuggestedRules() {
    if (!suggestedRules.length || !window.confirm(`${t("Create")} ${suggestedRules.length} ${t("suggested rules")}?`)) return;
    setBusy("rule-bulk");
    try {
      for (const item of suggestedRules) await call("bankSaveRule", { keyword: item.keyword, category: item.category });
      setStatus(t("Rules created."));
    } catch (ruleError) {
      setError(ruleError instanceof Error ? ruleError.message : "Could not create the rules.");
    } finally {
      setBusy(null);
    }
  }
  function openCategoryForm(record: BankCategoryRecord | null) {
    setCatFormOpen(true);
    setCatFormId(record?.id || "");
    setCatFormName(record?.name || "");
    setCatFormType(record?.type || "expense");
    setCatFormVat(record?.defaultVatCode || "");
    setCatFormPandleNominal(record?.pandleNominalCode || "");
    setCatFormXero(record?.xeroAccountCode || "");
    setCatFormQuickbooks(record?.quickbooksAccountId || "");
    setCatFormActive(record ? record.active : true);
  }
  async function saveCategoryRecord() {
    const name = catFormName.trim();
    if (!name) return;
    setBusy("category-form");
    setError(null);
    try {
      const result = await call<{ renamed: number }>("bankSaveCategory", {
        categoryId: catFormId,
        name,
        type: catFormType,
        defaultVatCode: catFormVat,
        active: catFormActive,
        mappings: {
          pandle: { nominalCode: catFormPandleNominal.trim(), taxCode: "" },
          quickbooks: { accountId: catFormQuickbooks.trim() },
          xero: { accountCode: catFormXero.trim() }
        }
      });
      setStatus(result.renamed > 0 ? `${t("Category saved.")} ${result.renamed} ${t("transactions updated")}` : t("Category saved."));
      setCatFormOpen(false);
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : "Could not save the category.");
    } finally {
      setBusy(null);
    }
  }
  async function deleteCategoryRecord(record: BankCategoryRecord) {
    if (!window.confirm(`${t("Delete this category record?")} (${record.name})`)) return;
    setBusy(`category-${record.id}`);
    try {
      await call("bankDeleteCategory", { categoryId: record.id });
      setStatus(t("Category deleted."));
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : "Could not delete the category.");
    } finally {
      setBusy(null);
    }
  }
  async function createRuleFromForm() {
    const keyword = newRuleKeyword.trim().toLowerCase();
    if (keyword.length < 2 || !newRuleCategory) return;
    setBusy("rule-new");
    try {
      await call("bankSaveRule", { keyword, category: newRuleCategory, vatCode: newRuleVat, appliesTo: newRuleAppliesTo });
      setStatus(t("Rule created."));
      setNewRuleKeyword(""); setNewRuleCategory(""); setNewRuleOpen(false);
    } catch (ruleError) {
      setError(ruleError instanceof Error ? ruleError.message : "Could not create the rule.");
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
  // Transfers between the owner's own accounts, owner contributions and loans
  // are money in, but not revenue — once marked, they leave this tile.
  const incomingTotal = useMemo(() => visibleTransactions
    .filter(item => item.amount > 0 && !["transfer", "owner_contribution", "loan"].includes(item.incomingKind))
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
      if (accountFilter && item.accountId !== accountFilter) return false;
      if (txReview === "missing_vat") {
        if (!(item.amount < 0 && effectiveCategory(item) && !effectiveVat(item))) return false;
      } else if (txReview === "missing_receipt") {
        if (!(item.amount < 0 && !item.receiptPath && !item.receiptNotNeeded)) return false;
      } else if (txReview && effectiveReviewStatus(item) !== txReview) return false;
      if (txFlow === "in" && item.amount <= 0) return false;
      if (txFlow === "out" && item.amount >= 0) return false;
      if (txAttention === "uncategorised" && !(item.amount < 0 && !effectiveCategory(item))) return false;
      if (txAttention === "noReceipt" && !(item.amount < 0 && !item.receiptPath)) return false;
      if (txAttention === "duplicate" && !duplicateIds.has(item.id)) return false;
      if (txAttention === "any" && !(item.amount < 0 && (!effectiveCategory(item) || (!item.receiptPath && !item.receiptNotNeeded) || duplicateIds.has(item.id)))) return false;
      const needle = txSearch.trim().toLowerCase();
      if (needle && !`${item.counterparty} ${item.description}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    list.sort((a, b) => sortAsc ? a.bookingDate.localeCompare(b.bookingDate) : b.bookingDate.localeCompare(a.bookingDate));
    return list;
  }, [visibleTransactions, sortAsc, txFlow, txAttention, txSearch, duplicateIds, accountFilter, txReview]);

  const txPageCount = Math.max(1, Math.ceil(sortedTransactions.length / txPageSize));
  const pagedTransactions = sortedTransactions.slice((txPage - 1) * txPageSize, txPage * txPageSize);
  const pageSpendingIds = pagedTransactions.filter(item => item.amount < 0).map(item => item.id);
  const allPageSelected = pageSpendingIds.length > 0 && pageSpendingIds.every(id => selectedIds.has(id));
  useEffect(() => { setTxPage(1); setSelectedIds(new Set()); }, [view, selectedYear, selectedMonth, weekStart, txFlow, txAttention, txSearch, txReview]);

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
      {/* With a transaction open the page becomes two columns: the list keeps a
          comfortable width on the left and the details panel sits beside it,
          starting under the app header instead of covering it. */}
      <div className={drawerTx ? "bank-layout bank-layout--drawer" : "bank-layout"} style={{ maxWidth: drawerTx ? 1320 : 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 18, alignItems: "start", transition: "max-width 160ms" }}>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ---- Header ------------------------------------------------------ */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
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
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <p style={{ fontSize: 12.5, opacity: 0.75, margin: 0, flex: 1, minWidth: 240 }}>{t("No matching transaction yet — card payments usually reach the bank feed 1–3 days later.")}</p>
                {isOwner && (ocrParsed?.amount ?? 0) > 0 ? (
                  <button type="button" style={{ ...bankBtnSm, background: "#2563eb", color: "#fff", borderColor: "#2563eb" }} disabled={busy === "ocr-queue"} onClick={() => void keepReceiptWaiting()}>
                    ⏳ {busy === "ocr-queue" ? t("Saving…") : t("Keep waiting for the bank")}
                  </button>
                ) : null}
              </div>
            ) : (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {ocrCandidates.map(candidate => (
                  <div key={candidate.transactionId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", border: "1px solid rgba(120,120,140,0.18)", borderRadius: 9 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {candidate.counterparty || candidate.description || "—"}
                        {candidate.hasReceipt ? <span style={{ marginLeft: 6, opacity: 0.6, verticalAlign: "middle" }}><AttachIcon size={11} /></span> : null}
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
                {isOwner && (ocrParsed?.amount ?? 0) > 0 ? (
                  <button type="button" style={{ ...attentionLink, fontSize: 12, alignSelf: "flex-start", marginTop: 2 }} disabled={busy === "ocr-queue"} onClick={() => void keepReceiptWaiting()}>
                    ⏳ {t("None of these — keep waiting for the bank")}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {canViewBank ? (
          <>
            {/* ---- Tabs + period control ---------------------------------- */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderBottom: "1px solid rgba(120,120,140,0.18)" }}>
              <div role="tablist" aria-label={t("Banking sections")} style={{ display: "flex", gap: 2 }}>
                {([
                  ["overview", t("Overview")],
                  ["transactions", t("Transactions")],
                  ["recurring", t("Recurring")],
                  ["receipts", t("Receipts")],
                  ["rules", t("Rules")]
                ] as const).map(([key, label]) => (
                  <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setDrawerTxId(null); }}
                    style={{ border: 0, borderBottom: tab === key ? "2px solid #2563eb" : "2px solid transparent", background: "transparent", color: tab === key ? "#2563eb" : "inherit", fontWeight: 700, fontSize: 13, padding: "9px 14px", cursor: "pointer", marginBottom: -1 }}>
                    {label}
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, paddingBottom: 2 }}>
                <button type="button" className="finance-payments-delete" onClick={() => stepPeriod(-1)} aria-label={t("Previous period")}>‹</button>
                <strong style={{ fontSize: 13, minWidth: 104, textAlign: "center" }}>{periodLabel}</strong>
                <button type="button" className="finance-payments-delete" onClick={() => stepPeriod(1)} disabled={isCurrentPeriod} aria-label={t("Next period")} style={{ opacity: isCurrentPeriod ? 0.3 : 1 }}>›</button>
              </span>
            </div>

            {/* ---- Connected account bar ---------------------------------- */}
            {connections.length > 0 ? (
              <div style={{ ...bankCard, padding: "12px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                {connections.map((connection, index) => (
                  <div key={connection.id} style={{ display: "flex", alignItems: "center", gap: 12, opacity: connection.status === "linked" ? 1 : 0.75, paddingLeft: index > 0 ? 14 : 0, borderLeft: index > 0 ? "1px solid rgba(120,120,140,0.18)" : undefined }}>
                    {connection.providerLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={connection.providerLogo} alt="" width={34} height={34} style={{ borderRadius: 999, border: "1px solid rgba(120,120,140,0.25)" }} />
                    ) : <span aria-hidden="true" style={{ fontSize: 20 }}>🏛</span>}
                    {(() => {
                      const disconnected = connection.status === "disconnected";
                      const unhealthy = connection.status === "linked" && connection.syncState !== "ok";
                      const reconsent = connection.syncState === "needs_reconsent";
                      const color = disconnected ? "#6b7280" : connection.status !== "linked" ? "#b45309" : reconsent ? "#dc2626" : unhealthy ? "#b45309" : "#16a34a";
                      const label = disconnected ? t("Disconnected — data kept") : connection.status !== "linked" ? t("Waiting for bank consent…") : reconsent ? t("Reconnect needed") : unhealthy ? t("Sync failing") : t("Connected");
                      const consentDaysLeft = connection.consentExpiresAt ? Math.ceil((connection.consentExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
                      return (
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <strong style={{ fontSize: 13.5, textTransform: "uppercase", letterSpacing: 0.3 }}>{connection.providerName || t("Bank")}</strong>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color }}>
                              <span style={{ width: 6, height: 6, borderRadius: 999, background: color, display: "inline-block" }} />
                              {label}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.6 }}>
                            {connection.lastSyncedAt ? `${t("Last sync")} ${connection.lastSyncedAt.toLocaleString()}` : ""}
                            {connection.status === "linked" && consentDaysLeft !== null ? (
                              <span style={consentDaysLeft <= 14 ? { color: "#b45309", fontWeight: 700 } : undefined}> · {t("Consent renews by")} {connection.consentExpiresAt!.toLocaleDateString()}</span>
                            ) : null}
                            {unhealthy && connection.lastSyncError ? <span title={connection.lastSyncError}> · {reconsent ? t("The bank stopped sharing data — reconnect to resume the feed.") : connection.lastSyncError.slice(0, 80)}</span> : null}
                          </div>
                        </div>
                      );
                    })()}
                    {isOwner && connection.status === "linked" && connection.syncState === "needs_reconsent" ? (
                      <button type="button" disabled={busy === "connect"} onClick={() => void connectBank()} style={{ ...bankBtnSm, background: "#dc2626", color: "#fff", borderColor: "#dc2626" }}>
                        ⟳ {busy === "connect" ? t("Opening your bank…") : t("Reconnect")}
                      </button>
                    ) : null}
                    {isOwner && connection.status === "disconnected" ? (
                      <>
                        <button type="button" disabled={busy === "connect"} onClick={() => void connectBank()} style={bankBtnSm}>⟳ {t("Reconnect")}</button>
                        <button type="button" className="finance-payments-delete" disabled={busy === `delete-${connection.id}`}
                          onClick={() => void removeConnection(connection, "purge")} aria-label={t("Delete imported data")} title={t("Delete imported data")}
                          style={{ opacity: 0.5 }}>🗑</button>
                      </>
                    ) : isOwner ? (
                      <button type="button" disabled={busy === `delete-${connection.id}`}
                        onClick={() => void removeConnection(connection)}
                        style={{ ...bankBtnSm, opacity: 0.7, fontSize: 11 }}>{t("Disconnect account")}</button>
                    ) : null}
                  </div>
                ))}
                <span style={{ flex: 1 }} />
                {isOwner && linkedBanks.length > 0 ? (
                  <button type="button" style={bankBtnSm} disabled={busy === "connect"} onClick={() => void connectBank()}>＋ {t("Add account")}</button>
                ) : null}
              </div>
            ) : null}

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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
                  <div style={statTile}>
                    <p style={tileLabel}>{t("Total spent")}</p>
                    <strong style={tileValue}>{money(spentTotal, currency0)}</strong>
                    {spentDelta !== null ? (
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: spentDelta <= 0 ? "#16a34a" : "#6b7280" }}>
                        {spentDelta <= 0 ? "↓" : "↑"}{Math.abs(spentDelta).toFixed(0)}% {deltaLabel}
                      </span>
                    ) : <span style={{ fontSize: 11.5, opacity: 0.6 }}>{t("First month of data")}</span>}
                    <div style={{ marginTop: "auto", paddingTop: 10 }}>
                      <BankMiniSpark values={spentSeries} color="#16a34a" />
                    </div>
                    <TileIcon bg="rgba(22,163,74,0.12)">📈</TileIcon>
                  </div>
                  <div style={statTile}>
                    <p style={{ ...tileLabel, color: "#16a34a" }}>{t("Incoming")}</p>
                    <strong style={{ ...tileValue, color: "#16a34a" }}>+{money(incomingTotal, currency0)}</strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>↗ {incomingCount} {t("payments received")}</span>
                    <button type="button" onClick={showIncoming} style={{ ...attentionLink, marginTop: "auto", paddingTop: 10, fontSize: 12 }}>{t("View all incoming")} →</button>
                    <TileIcon bg="rgba(22,163,74,0.12)">↗</TileIcon>
                  </div>
                  <div style={statTile}>
                    <p style={{ ...tileLabel, color: "#ea770b" }}>{t("Recurring spend")}</p>
                    <strong style={tileValue}>{money(fixedMonthly, currency0)} <span style={tileUnit}>/ {t("month")}</span></strong>
                    <span style={{ fontSize: 11.5, opacity: 0.65 }}>↻ {activeRecurring.length} {t("recurring items")}</span>
                    <button type="button" onClick={() => setTab("recurring")} style={{ ...attentionLink, marginTop: "auto", paddingTop: 10, fontSize: 12 }}>{t("View recurring")} →</button>
                    <TileIcon bg="rgba(234,119,11,0.12)">📅</TileIcon>
                  </div>
                  <div style={statTile}>
                    <p style={{ ...tileLabel, color: attention.total ? "#b45309" : "#16a34a" }}>{t("Needs attention")}</p>
                    <strong style={tileValue}>{attention.total} <span style={tileUnit}>{t("items")}</span></strong>
                    {attention.total === 0 ? (
                      <span style={{ fontSize: 11.5, opacity: 0.65 }}>✓ {t("All clear for this period")}</span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 1, fontSize: 11.5, opacity: 0.85 }}>
                        {attention.uncategorised ? <span>• {attention.uncategorised} {t("uncategorised")}</span> : null}
                        {attention.noReceipt ? <span>• {attention.noReceipt} {t("missing receipts")}</span> : null}
                        {attention.brokenConnections ? <span style={{ color: "#dc2626", fontWeight: 700 }}>• {attention.brokenConnections} {t("bank connection needs reconnecting")}</span> : null}
                        {attention.waitingReceipts ? <button type="button" onClick={() => setTab("receipts")} style={{ ...attentionLink, fontSize: 12 }}>• {attention.waitingReceipts} {t("receipts waiting for the bank")} →</button> : null}
                        {attention.duplicates ? <span>• {attention.duplicates} {t("possible duplicates")}</span> : null}
                        {suggestedRules.length ? <span>• {suggestedRules.length} {t("rule suggestions")}</span> : null}
                      </div>
                    )}
                    {attention.total ? (
                      <button type="button" onClick={() => showAttention(attention.uncategorised ? "uncategorised" : "noReceipt")}
                        style={{ ...attentionLink, marginTop: "auto", paddingTop: 10, fontSize: 12, color: "#dc2626" }}>{t("Review now")} →</button>
                    ) : null}
                    <TileIcon bg={attention.total ? "rgba(245,158,11,0.14)" : "rgba(22,163,74,0.12)"}>{attention.total ? "⚠" : "✓"}</TileIcon>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
                  <div style={{ ...bankCard, display: "flex", flexDirection: "column" }}>
                    <div style={cardHead}>
                      <TileBadge bg="rgba(37,99,235,0.1)">◔</TileBadge>
                      <strong style={cardTitle}>{t("Spending mix")}</strong>
                    </div>
                    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                      <BankDonut rows={categoryBreakdown.rows} total={categoryBreakdown.total}
                        centerLabel={t("Total spent")} centerValue={money(categoryBreakdown.total, currency0)}
                        uncategorisedLabel={t("Uncategorised")} translate={t} />
                      <div style={{ flex: 1, minWidth: 190, display: "flex", flexDirection: "column" }}>
                        {(showAllCats ? categoryBreakdown.rows : categoryBreakdown.rows.slice(0, 5)).map(row => {
                          const isUn = row.name === "__uncategorized__";
                          const color = isUn ? "#5b6ee8" : categoryColor(row.name);
                          return (
                            <div key={row.name} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, padding: "5px 0" }}>
                              <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block", flexShrink: 0 }} />
                              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isUn ? t("Uncategorised") : t(row.name)}</span>
                              <strong style={{ fontVariantNumeric: "tabular-nums" }}>{money(row.amount, currency0)}</strong>
                              <span style={{ opacity: 0.5, minWidth: 30, textAlign: "right" }}>{row.share.toFixed(0)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {(() => {
                      const shownRows = showAllCats ? categoryBreakdown.rows : categoryBreakdown.rows.slice(0, 5);
                      const hidden = Math.max(0, categoryBreakdown.total - shownRows.reduce((acc, row) => acc + row.amount, 0));
                      const unRow = categoryBreakdown.rows.find(row => row.name === "__uncategorized__");
                      const unShare = unRow && categoryBreakdown.total > 0 ? (unRow.amount / categoryBreakdown.total) * 100 : 0;
                      return (
                        <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid rgba(120,120,140,0.14)", display: "flex", flexDirection: "column", gap: 7, fontSize: 11.5 }}>
                          {hidden > 0.005 ? (
                            <span style={{ opacity: 0.7 }}>
                              {`${money(hidden, currency0)} ${t("in")} ${categoryBreakdown.rows.length - shownRows.length} ${t("more categories")}`}
                            </span>
                          ) : null}
                          {unRow ? (
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ flex: 1, height: 5, borderRadius: 999, background: "rgba(120,120,140,0.15)", overflow: "hidden" }}>
                                <span style={{ display: "block", height: "100%", width: `${Math.max(2, 100 - unShare)}%`, background: "#16a34a" }} />
                              </span>
                              <span style={{ opacity: 0.7 }}>{Math.round(100 - unShare)}% {t("categorised")}</span>
                              <button type="button" onClick={() => showAttention("uncategorised")} style={{ ...attentionLink, fontSize: 11.5 }}>{t("Categorise")} {attention.uncategorised} →</button>
                            </span>
                          ) : null}
                          {categoryBreakdown.rows.length > 5 ? (
                            <button type="button" onClick={() => setShowAllCats(value => !value)} style={{ ...attentionLink, fontSize: 12 }}>
                              {showAllCats ? `${t("Show less")} ←` : `${t("View category breakdown")} →`}
                            </button>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>

                  <div style={{ ...bankCard, display: "flex", flexDirection: "column" }}>
                    <div style={cardHead}>
                      <TileBadge bg="rgba(234,119,11,0.12)">↻</TileBadge>
                      <strong style={cardTitle}>{t("Top recurring vendors")}</strong>
                      <span style={{ flex: 1 }} />
                      <button type="button" onClick={() => setTab("recurring")} style={{ ...attentionLink, fontSize: 12 }}>{t("View recurring")} →</button>
                    </div>
                    {activeRecurring.slice(0, 5).map(item => (
                      <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                        <span aria-hidden="true" style={{ ...avatarStyle, width: 26, height: 26, fontSize: 10, background: `${avatarColor(item.merchant)}22`, color: avatarColor(item.merchant), flexShrink: 0 }}>{initials(item.merchant)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.merchant}</div>
                          <div style={{ fontSize: 10.5, opacity: 0.55 }}>{t(item.cadence === "weekly" ? "Weekly" : item.cadence === "yearly" ? "Yearly" : "Monthly")} · {item.occurrences}×</div>
                        </div>
                        <span style={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(item.typicalAmount, item.currency)} <span style={{ fontSize: 9.5, opacity: 0.5, fontWeight: 600 }}>/ {t("month")}</span></span>
                      </div>
                    ))}
                    {activeRecurring.length === 0 ? <p style={{ fontSize: 12, opacity: 0.65, margin: 0 }}>{t("No recurring payments detected yet.")}</p> : null}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", padding: "9px 12px", borderRadius: 10, background: "rgba(120,120,140,0.08)", fontSize: 12 }}>
                      <strong style={{ color: "#16a34a", fontSize: 15 }}>{activeRecurring.length}</strong>
                      <span style={{ opacity: 0.75 }}>{t("Active recurring")}</span>
                      <span style={{ flex: 1 }} />
                      <strong style={{ color: "#b45309", fontSize: 15 }}>{cancelledRecurring.length}</strong>
                      <span style={{ opacity: 0.75 }}>{t("Possibly cancelled")}</span>
                    </div>
                  </div>

                  <div style={{ ...bankCard, display: "flex", flexDirection: "column" }}>
                    <div style={cardHead}>
                      <TileBadge bg="rgba(37,99,235,0.1)"><ReceiptGlyph size={15} color="#2563eb" /></TileBadge>
                      <strong style={cardTitle}>{t("Receipts summary")}</strong>
                    </div>
                    <div style={{ display: "flex", alignItems: "stretch", textAlign: "center", padding: "10px 0" }}>
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: 26, fontWeight: 800, color: "#16a34a", display: "block" }}>{receiptStats.matched}</strong>
                        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>{t("Receipts matched")}</div>
                      </div>
                      <div style={{ flex: 1, borderLeft: "1px solid rgba(120,120,140,0.14)", borderRight: "1px solid rgba(120,120,140,0.14)" }}>
                        <strong style={{ fontSize: 26, fontWeight: 800, color: receiptStats.missing ? "#dc2626" : "inherit", display: "block" }}>{receiptStats.missing}</strong>
                        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>{t("Missing receipts")}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: 26, fontWeight: 800, opacity: 0.7, display: "block" }}>{receiptStats.notNeeded}</strong>
                        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>{t("No receipt needed")}</div>
                      </div>
                    </div>
                    {waitingReceipts.length ? (
                      <button type="button" onClick={() => setTab("receipts")} style={{ ...attentionLink, fontSize: 12, color: "#b45309", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        ⏳ {waitingReceipts.length} {t("receipts waiting for the bank")} →
                      </button>
                    ) : null}
                    <div style={{ marginTop: "auto", paddingTop: 14 }}>
                    <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(37,99,235,0.06)" }}>
                      <strong style={{ fontSize: 12.5, display: "block" }}>{t("Keep your records complete.")}</strong>
                      <span style={{ fontSize: 12, opacity: 0.7 }}>{t("Match missing receipts to stay audit-ready.")}</span>
                      <button type="button" onClick={() => setTab("receipts")} style={{ ...bankBtnSm, display: "block", marginTop: 10, background: "var(--surface, #fff)" }}>{t("Review receipts")} →</button>
                    </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
                  <div style={{ ...bankCard, padding: 0, overflow: "hidden" }}>
                    <div style={{ ...cardHead, padding: "14px 18px 10px", marginBottom: 0 }}>
                      <TileBadge bg="rgba(120,120,140,0.12)">🧾</TileBadge>
                      <strong style={cardTitle}>{t("Recent transactions")}</strong>
                      <span style={{ flex: 1 }} />
                      <button type="button" onClick={() => setTab("transactions")} style={{ ...attentionLink, fontSize: 12 }}>{t("View all transactions")} →</button>
                    </div>
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, tableLayout: "fixed" }}>
                      <thead>
                        <tr style={{ borderTop: "1px solid rgba(120,120,140,0.14)", borderBottom: "1px solid rgba(120,120,140,0.14)" }}>
                          <th style={{ ...miniTh, width: 78 }}>{t("Date")}</th>
                          <th style={miniTh}>{t("Merchant")}</th>
                          <th style={{ ...miniTh, width: 104, paddingLeft: 4 }}>{t("Category")}</th>
                          <th style={{ ...miniTh, width: 104, textAlign: "right", paddingRight: 18 }}>{t("Amount")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTransactions.slice(0, 6).map(tx => {
                          const rowCategory = effectiveCategory(tx);
                          return (
                            <tr key={tx.id} style={{ borderBottom: "1px solid rgba(120,120,140,0.1)", cursor: "pointer" }} onClick={() => { setTab("transactions"); openDrawer(tx); }}>
                              <td style={{ ...miniTd, opacity: 0.6, whiteSpace: "nowrap" }}>{new Date(tx.bookingDate).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</td>
                              <td style={{ ...miniTd, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.counterparty || tx.description}</td>
                              <td style={{ ...miniTd, paddingLeft: 4 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px", display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: tx.amount >= 0 ? "rgba(22,163,74,0.12)" : rowCategory ? `${categoryColor(rowCategory)}1a` : "rgba(120,120,140,0.13)", color: tx.amount >= 0 ? "#16a34a" : rowCategory ? categoryColor(rowCategory) : "inherit" }}>
                                  {tx.amount >= 0 ? t("Incoming") : rowCategory ? t(rowCategory) : t("Uncategorised")}
                                </span>
                              </td>
                              <td style={{ ...miniTd, paddingLeft: 4, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: tx.amount < 0 ? "#dc2626" : "#16a34a" }}>{tx.amount < 0 ? "−" : "+"}{money(Math.abs(tx.amount), tx.currency)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ ...bankCard, padding: 0, overflow: "hidden" }}>
                    <div style={{ ...cardHead, padding: "14px 18px 10px", marginBottom: 0 }}>
                      <TileBadge bg="rgba(124,58,237,0.12)">📅</TileBadge>
                      <strong style={cardTitle}>{t("Upcoming payments & renewals")}</strong>
                      <span style={{ flex: 1 }} />
                      <span style={countBadge}>{upcomingRenewals.length}</span>
                    </div>
                    {upcomingRenewals.length === 0 ? (
                      <p style={{ fontSize: 12, opacity: 0.65, margin: 0, padding: "0 18px 16px" }}>{t("Nothing expected in the next 30 days.")}</p>
                    ) : (
                      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, tableLayout: "fixed" }}>
                        <thead>
                          <tr style={{ borderTop: "1px solid rgba(120,120,140,0.14)", borderBottom: "1px solid rgba(120,120,140,0.14)" }}>
                            <th style={{ ...miniTh, width: 78 }}>{t("Date")}</th>
                            <th style={miniTh}>{t("Merchant")}</th>
                            <th style={{ ...miniTh, width: 132, textAlign: "right", paddingRight: 18 }}>{t("Amount")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {upcomingRenewals.slice(0, 6).map(item => (
                            <tr key={item.key} style={{ borderBottom: "1px solid rgba(120,120,140,0.1)" }}>
                              <td style={{ ...miniTd, opacity: 0.6, whiteSpace: "nowrap" }}>{new Date(item.nextExpected).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</td>
                              <td style={{ ...miniTd, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.merchant}</td>
                              <td style={{ ...miniTd, paddingLeft: 4, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(item.typicalAmount, item.currency)} <span style={{ fontSize: 9.5, opacity: 0.5, fontWeight: 600 }}>/ {t("month")}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {upcomingRenewals.length > 0 ? (
                      <p style={{ fontSize: 10.5, opacity: 0.55, margin: 0, padding: "8px 18px 14px" }}>{t("These are estimates, not booked payments.")}</p>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}

            {/* ================= TRANSACTIONS ================= */}
            {transactions.length > 0 && tab === "transactions" ? (
              <>
                {/* Filter bar: period, queue chips, search — then the category totals
                    for whatever the filters currently leave on screen. */}
                <div style={{ ...bankCard, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {([
                      ["all", t("All"), ""],
                      ["attention", t("Needs attention"), "#f59e0b"],
                      ["in", t("Incoming"), "#16a34a"],
                      ["out", t("Spending"), "#dc2626"]
                    ] as const).map(([key, label, dot]) => {
                      const active = key === "attention" ? txAttention !== "none" : txAttention === "none" && txFlow === (key === "all" ? "all" : key);
                      return (
                        <button key={key} type="button"
                          onClick={() => {
                            if (key === "attention") { setTxAttention(txAttention === "none" ? "any" : "none"); return; }
                            setTxAttention("none");
                            setTxFlow(key as "all" | "in" | "out");
                          }}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "5px 10px", whiteSpace: "nowrap",
                            border: active ? "1px solid transparent" : "1px solid rgba(120,120,140,0.22)",
                            background: active ? (dot || "#2563eb") : "transparent",
                            color: active ? "#fff" : "inherit" }}>
                          {dot ? <span style={{ width: 7, height: 7, borderRadius: 999, background: active ? "rgba(255,255,255,0.9)" : dot, display: "inline-block" }} /> : null}
                          {label}
                        </button>
                      );
                    })}
                    <span style={{ flex: 1 }} />
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid rgba(120,120,140,0.22)", borderRadius: 10, padding: "5px 10px", flex: "1 1 96px", minWidth: 96, maxWidth: 230 }}>
                      <span aria-hidden="true" style={{ opacity: 0.5, fontSize: 12 }}>🔍</span>
                      <input type="search" value={txSearch} onChange={event => setTxSearch(event.target.value)} placeholder={t("Search transactions")}
                        aria-label={t("Search transactions")}
                        style={{ border: 0, outline: "none", background: "transparent", color: "inherit", fontSize: 12.5, width: "100%" }} />
                    </span>
                    {allAccounts.length > 1 ? (
                      <select value={accountFilter} onChange={event => setAccountFilter(event.target.value)} style={{ ...pickerInput, flex: "0 1 170px", fontSize: 12 }} aria-label={t("Accounts")}>
                        <option value="">{t("All accounts")}</option>
                        {allAccounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.currency ? ` · ${account.currency}` : ""}</option>)}
                      </select>
                    ) : null}
                    {isOwner ? (
                      <button type="button" onClick={() => { setSelectMode(value => !value); setSelectedIds(new Set()); }}
                        title={t("Bulk review")}
                        style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, borderRadius: 10, padding: "5px 12px", border: "1px solid rgba(120,120,140,0.22)", background: selectMode ? "rgba(37,99,235,0.12)" : "transparent", color: selectMode ? "#2563eb" : "inherit" }}>
                        ☑ {t("Select")}
                      </button>
                    ) : null}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 10 }}>
                    {categoryBreakdown.rows.slice(0, 5).map(row => {
                      const isUn = row.name === "__uncategorized__";
                      return (
                        <div key={row.name} style={{ border: "1px solid rgba(120,120,140,0.18)", borderRadius: 11, padding: "9px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, opacity: 0.75 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 999, background: isUn ? "#5b6ee8" : categoryColor(row.name), display: "inline-block", flexShrink: 0 }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isUn ? t("Uncategorised") : t(row.name)}</span>
                          </div>
                          <strong style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(row.amount, currency0)}</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div id="bank-transactions" style={{ ...bankCard, padding: 0, overflow: "hidden", scrollMarginTop: 90 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 18px 11px", flexWrap: "wrap", borderBottom: "1px solid rgba(120,120,140,0.14)" }}>
                    <strong style={{ fontSize: 14.5 }}>{t("Transactions")}</strong>
                    {txAttention !== "none" ? (
                      <button type="button" onClick={() => setTxAttention("none")}
                        style={{ border: 0, cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(245,158,11,0.16)", color: "#b45309" }}>
                        ! {txAttention === "any" ? t("Needs attention") : txAttention === "uncategorised" ? t("Uncategorised") : txAttention === "noReceipt" ? t("No receipt") : t("Possible duplicates")} ✕
                      </button>
                    ) : null}
                    {txReview ? (
                      <button type="button" onClick={() => setTxReview("")}
                        style={{ border: 0, cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(37,99,235,0.12)", color: "#2563eb" }}>
                        ⚑ {txReview === "missing_vat" ? t("Missing VAT code") : txReview === "missing_receipt" ? t("Missing receipt") : t(reviewStatusMeta(txReview).label)} ✕
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
                        {categoryOptions.map(name => <option key={name} value={name}>{t(name)}</option>)}
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
                      <select value={bulkReview} onChange={event => setBulkReview(event.target.value)} style={{ ...pickerInput, flex: "0 1 190px" }} aria-label={t("Review status")}>
                        <option value="">{t("Review status")}…</option>
                        {REVIEW_STATUSES.map(item => <option key={item.code} value={item.code}>{t(item.label)}</option>)}
                      </select>
                      <button type="button" style={bankBtnSm} disabled={busy === "review" || !bulkReview} onClick={() => void applyBulkReview(bulkReview)}>
                        {busy === "review" ? t("Saving…") : t("Apply status")}
                      </button>
                      <span style={{ flex: 1 }} />
                      <button type="button" style={{ ...bankBtnSm, opacity: 0.7 }} onClick={() => setSelectedIds(new Set())}>{t("Clear selection")}</button>
                    </div>
                  ) : null}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: drawerTx ? 640 : 700, fontSize: 12.5, tableLayout: "fixed" }}>
                      <thead>
                        <tr style={{ borderTop: "1px solid rgba(120,120,140,0.14)", borderBottom: "1px solid rgba(120,120,140,0.14)" }}>
                          {isOwner && selectMode ? (
                            <th style={{ ...thStyle, width: 34, paddingRight: 0 }}>
                              <input type="checkbox" aria-label={t("Select all on page")} checked={allPageSelected} disabled={pageSpendingIds.length === 0} onChange={togglePageSelection} />
                            </th>
                          ) : null}
                          <th style={thStyle}>{t("Merchant")}</th>
                          <th style={{ ...thStyle, cursor: "pointer", width: drawerTx ? 108 : 128 }} onClick={() => setSortAsc(value => !value)}>
                            {t("Date")} {sortAsc ? "↑" : "↓"}
                          </th>
                          <th style={{ ...thStyle, width: drawerTx ? 132 : 150 }}>{t("Category")}</th>
                          <th style={{ ...thStyle, width: drawerTx ? 78 : 88 }}>{t("Method")}</th>
                          <th style={{ ...thStyle, width: drawerTx ? 100 : 120 }}>{t("Receipt")}</th>
                          <th style={{ ...thStyle, textAlign: "right", width: drawerTx ? 104 : 118 }}>{t("Amount")}</th>
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
                                {isOwner && selectMode ? (
                                  <td style={{ ...tdStyle, paddingRight: 0 }}>
                                    {transaction.amount < 0 ? <input type="checkbox" aria-label={t("Select")} checked={selectedIds.has(transaction.id)} onChange={() => toggleSelected(transaction.id)} /> : null}
                                  </td>
                                ) : null}
                                <td style={{ ...tdStyle, cursor: "pointer" }} onClick={() => openDrawer(transaction)} title={t("Open details")}>
                                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                    <span aria-hidden="true" style={{ ...avatarStyle, background: `${avatarColor(transaction.counterparty || transaction.description || "x")}22`, color: avatarColor(transaction.counterparty || transaction.description || "x"), flexShrink: 0 }}>
                                      {initials(transaction.counterparty || transaction.description)}
                                    </span>
                                    <span style={{ minWidth: 0 }}>
                                      <span style={{ display: "block", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {(() => {
                                          const rs = effectiveReviewStatus(transaction);
                                          if (rs === "unreviewed") return null;
                                          const meta = reviewStatusMeta(rs);
                                          return <span title={t(meta.label)} aria-label={t(meta.label)} style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: meta.color, marginRight: 5, verticalAlign: "middle" }} />;
                                        })()}
                                        {transaction.amount < 0 && recurringKeys.has(recurringMerchantKey(transaction)) ? <span aria-hidden="true" title={t("Recurring spending")} style={{ marginRight: 4, opacity: 0.6, fontSize: 11 }}>↻</span> : null}
                                        {duplicateIds.has(transaction.id) ? <span title={t("Possible duplicates")} style={{ marginRight: 4, fontSize: 9.5, fontWeight: 800, padding: "1px 6px", borderRadius: 999, background: "rgba(245,158,11,0.16)", color: "#b45309" }}>{t("Duplicate?")}</span> : null}
                                        {transaction.counterparty || transaction.description || "—"}
                                      </span>
                                      {transaction.purchaseNumber ? (
                                        <span style={{ fontSize: 10, fontWeight: 700, color: "#16a34a" }}>▣ {transaction.purchaseNumber}</span>
                                      ) : null}
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
                                <td style={{ ...tdStyle, whiteSpace: "nowrap", opacity: 0.75, cursor: "pointer" }} onClick={() => openDrawer(transaction)}>
                                  {new Date(transaction.bookingDate).toLocaleDateString(undefined, drawerTx ? { day: "2-digit", month: "short" } : { day: "2-digit", month: "short", year: "numeric" })}
                                  {transaction.status === "pending" ? <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.6 }}>· {t("pending")}</span> : null}
                                </td>
                                <td style={tdStyle}>
                                  {transaction.amount < 0 && transaction.splits.length ? (
                                    <span title={transaction.splits.map(row => `${row.category}: ${row.amount.toFixed(2)}`).join(" · ")}
                                      style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: "rgba(37,99,235,0.12)", color: "#2563eb", cursor: "pointer" }}
                                      onClick={() => openDrawer(transaction)}>
                                      ⑃ {t("Split")} ({transaction.splits.length})
                                    </span>
                                  ) : transaction.amount < 0 && !isOwner ? (
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
                                  {transaction.amount < 0 && category && transaction.vatCode ? (
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
                                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                                  {transaction.amount >= 0 ? (
                                    <span style={{ opacity: 0.4 }}>—</span>
                                  ) : transaction.receiptPath ? (
                                    <button type="button" onClick={() => void openReceipt(transaction)} title={transaction.receiptName || t("View invoice")}
                                      style={{ ...attentionLink, color: "#16a34a", display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                                      <FileBadge name={transaction.receiptName} size={24} /> {t("Matched")}
                                    </button>
                                  ) : transaction.receiptNotNeeded ? (
                                    <span style={{ opacity: 0.55, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}><ReceiptGlyph size={15} /> {t("Not needed")}</span>
                                  ) : isOwner ? (
                                    <button type="button" disabled={busy === `receipt-${transaction.id}`} title={t("Attach invoice")}
                                      onClick={() => { setPendingAttachTxId(transaction.id); document.getElementById("bank-receipt-input")?.click(); }}
                                      style={{ ...attentionLink, color: "#dc2626", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                      <span style={{ width: 24, height: 24, borderRadius: 7, border: "1.5px dashed rgba(220,38,38,0.55)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><AttachIcon size={13} color="#dc2626" /></span>
                                      {t("Missing")}
                                    </button>
                                  ) : (
                                    <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}><AttachIcon size={14} color="#dc2626" /> {t("Missing")}</span>
                                  )}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: transaction.amount < 0 ? "#dc2626" : "#16a34a" }}>
                                  {transaction.amount < 0 ? "−" : "+"}{money(Math.abs(transaction.amount), transaction.currency)}
                                </td>
                              </tr>
                              {categoryPickerTxId === transaction.id ? (
                                <tr>
                                  <td colSpan={isOwner && selectMode ? 7 : 6} style={{ padding: "0 18px 12px" }}>
                                    {categoryPickerTxId === transaction.id ? (
                                      <div style={{ padding: 10, border: "1px solid rgba(120,120,140,0.25)", borderRadius: 10 }}>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                          {categoryOptions.map(option => (
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
                                <td style={{ ...tdStyle, opacity: 0.75 }}>
                                  <div>
                                    {t(item.cadence === "weekly" ? "Weekly" : item.cadence === "yearly" ? "Yearly" : "Monthly")}
                                    {item.expectedDayOfMonth ? ` · ${t("around the")} ${item.expectedDayOfMonth}.` : ""}
                                    {item.manual ? <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, padding: "1px 6px", borderRadius: 999, background: "rgba(37,99,235,0.12)", color: "#2563eb" }}>{t("Marked by you")}</span> : null}
                                  </div>
                                  <div style={{ fontSize: 10.5, opacity: 0.75 }}>
                                    {t("Detected from")} {item.occurrences} {t("payments").toLowerCase()}
                                    {item.amountMax - item.amountMin > 0.01 ? ` · ${money(item.amountMin, item.currency)}–${money(item.amountMax, item.currency)}` : ""}
                                    {" · "}
                                    <span style={{ fontWeight: 700, color: item.confidence === "high" ? "#16a34a" : item.confidence === "medium" ? "#2563eb" : "#b45309" }}>
                                      {t("Confidence")}: {t(item.confidence === "high" ? "High" : item.confidence === "medium" ? "Medium" : "Low")}
                                    </span>
                                  </div>
                                </td>
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
                        <div key={item.key} style={recurringRow} title={`${t("These are estimates, not booked payments.")}`}>
                          <span style={{ fontSize: 11, opacity: 0.6, minWidth: 74 }}>{t("around")} {new Date(item.nextExpected).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.merchant}</span>
                            <span style={{ display: "block", fontSize: 10, opacity: 0.55 }}>{t("Based on the last")} {item.occurrences} {t(item.cadence === "weekly" ? "weekly" : item.cadence === "yearly" ? "yearly" : "monthly")} {t("payments").toLowerCase()}</span>
                          </span>
                          <span style={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(item.typicalAmount, item.currency)}</span>
                        </div>
                      ))}
                      {upcomingRenewals.length > 0 ? <p style={{ fontSize: 10.5, opacity: 0.55, margin: "6px 0 0" }}>{t("These are estimates, not booked payments.")}</p> : null}
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
                {waitingReceipts.length ? (
                  <div style={{ ...bankCard, borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.05)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <TileBadge bg="rgba(245,158,11,0.16)">⏳</TileBadge>
                      <strong style={{ fontSize: 14.5 }}>{t("Waiting for the bank")} ({waitingReceipts.length})</strong>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 11.5, opacity: 0.65 }}>{t("Attached automatically when the payment arrives in the feed.")}</span>
                      {isOwner ? <button type="button" style={bankBtnSm} disabled={busy === "waiting-match"} onClick={() => void matchWaitingNow()}>⟳ {busy === "waiting-match" ? t("Matching…") : t("Match now")}</button> : null}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {waitingReceipts.map(item => {
                        const ageDays = item.createdAt ? Math.floor((Date.now() - item.createdAt.getTime()) / 86400000) : 0;
                        const stale = ageDays >= 14;
                        const picking = assignWaitingId === item.id;
                        return (
                          <div key={item.id} style={{ border: `1px solid ${stale ? "rgba(220,38,38,0.35)" : "rgba(120,120,140,0.18)"}`, borderRadius: 10, padding: "8px 12px", background: "var(--surface, #fff)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <FileBadge name={item.fileName} size={28} />
                              <div style={{ flex: 1, minWidth: 180 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.fileName}</div>
                                <div style={{ fontSize: 11, opacity: 0.65 }}>
                                  {item.amount ? money(item.amount, currency0) : t("Amount unknown")}{item.date ? ` · ${item.date}` : ""} · {item.source === "chatgpt" ? "ChatGPT" : t("Web")} · {ageDays === 0 ? t("today") : `${ageDays} ${t("days waiting")}`}
                                  {stale ? <span style={{ color: "#dc2626", fontWeight: 700 }}> · {t("Still no payment — check the amount or assign it by hand")}</span> : null}
                                </div>
                              </div>
                              {isOwner ? (
                                <span style={{ display: "inline-flex", gap: 6 }}>
                                  <button type="button" style={bankBtnSm} disabled={busy === `waiting-${item.id}`} onClick={() => setAssignWaitingId(picking ? null : item.id)}>{picking ? t("Cancel") : t("Assign to a transaction")}</button>
                                  <button type="button" style={{ ...bankBtnSm, opacity: 0.7 }} disabled={busy === `waiting-${item.id}`} onClick={() => void deleteWaitingReceipt(item)}>{t("Remove")}</button>
                                </span>
                              ) : null}
                            </div>
                            {picking ? (
                              <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", borderTop: "1px solid rgba(120,120,140,0.14)", paddingTop: 6 }}>
                                {sortedTransactions.filter(tx => tx.amount < 0).slice(0, 40).map(tx => (
                                  <button key={tx.id} type="button" disabled={busy === `waiting-${item.id}`} onClick={() => void assignWaitingReceipt(item, tx.id)}
                                    style={{ textAlign: "left", border: 0, background: "transparent", color: "inherit", cursor: "pointer", padding: "6px 4px", borderRadius: 6, fontSize: 12.5, display: "flex", gap: 10, alignItems: "center" }}>
                                    <span style={{ opacity: 0.6, minWidth: 62 }}>{new Date(tx.bookingDate).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</span>
                                    <strong style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.counterparty || tx.description}</strong>
                                    <span style={{ fontVariantNumeric: "tabular-nums", color: Math.abs(Math.abs(tx.amount) - item.amount) < 0.015 ? "#16a34a" : "inherit", fontWeight: 700 }}>−{money(Math.abs(tx.amount), tx.currency)}</span>
                                    {tx.receiptPath ? <FileBadge name={tx.receiptName} size={16} /> : null}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
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
                              <td style={{ ...tdStyle, fontWeight: 700, cursor: "pointer" }} onClick={() => openDrawer(tx)}>{tx.counterparty || tx.description}</td>
                              <td style={{ ...tdStyle, whiteSpace: "nowrap", opacity: 0.75 }}>{new Date(tx.bookingDate).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</td>
                              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "#dc2626" }}>−{money(Math.abs(tx.amount), tx.currency)}</td>
                              <td style={tdStyle}>{category ? <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: `${categoryColor(category)}1a`, color: categoryColor(category) }}>{t(category)}</span> : <span style={{ opacity: 0.5 }}>{t("Uncategorised")}</span>}</td>
                              <td style={tdStyle}>
                                {tx.receiptPath ? (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                    <FileBadge name={tx.receiptName} size={28} />
                                    <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ {t("Matched")}<div style={{ fontSize: 10.5, opacity: 0.65, fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.receiptName}</div></span>
                                  </span>
                                )
                                  : tx.receiptNotNeeded ? <span style={{ opacity: 0.6 }}>{t("No receipt needed")}</span>
                                  : <span style={{ color: "#dc2626", fontWeight: 700 }}>! {t("Missing receipt")}</span>}
                              </td>
                              <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                                {tx.receiptPath ? (
                                  <button type="button" style={{ ...bankBtnSm, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => void openReceipt(tx)} aria-label={t("View invoice")}><ReceiptGlyph size={14} /> {t("View")} ↗</button>
                                ) : isOwner ? (
                                  <span style={{ display: "inline-flex", gap: 6 }}>
                                    <button type="button" style={{ ...bankBtnSm, display: "inline-flex", alignItems: "center", gap: 6, color: "#2563eb", borderColor: "rgba(37,99,235,0.35)" }} disabled={busy === `receipt-${tx.id}`} onClick={() => { setPendingAttachTxId(tx.id); document.getElementById("bank-receipt-input")?.click(); }}><AttachIcon size={14} color="#2563eb" /> {t("Attach")}</button>
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
                {(() => {
                  const ruleName = (rule: BankRule) => `${rule.keyword.charAt(0).toUpperCase()}${rule.keyword.slice(1)} ${t(rule.category)} ${t("Rule")}`;
                  const appliesTo = (txType: string) => {
                    const meta = TX_TYPE_META[txType];
                    if (!meta) return "—";
                    const label = meta.translate ? t(meta.label) : meta.label;
                    return txType === "PURCHASE" || txType === "POS" ? t("Card spending") : txType === "DIRECT_DEBIT" ? `${t("Direct Debit")} (DD)` : label;
                  };
                  const needle = ruleSearch.trim().toLowerCase();
                  const shownRules = needle ? rules.filter(rule => `${rule.keyword} ${rule.category} ${ruleName(rule)}`.toLowerCase().includes(needle)) : rules;
                  const previewRule = rules.find(rule => rule.id === previewRuleId) ?? null;
                  const previewStat = previewRule ? ruleStats.get(previewRule.id) : undefined;
                  const ruleChip = (category: string) => (
                    <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: `${categoryColor(category)}1a`, color: categoryColor(category), whiteSpace: "nowrap" }}>{t(category)}</span>
                  );
                  return (
                    <>
                      {/* ---- stat tiles + actions ---- */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr)) 248px", gap: 14, alignItems: "stretch" }}>
                        <div style={{ ...statTile, minHeight: 128 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <TileBadge bg="rgba(22,163,74,0.12)">✓</TileBadge>
                            <div><p style={tileLabel}>{t("Active rules")}</p><strong style={{ ...tileValue, margin: "1px 0" }}>{rules.length}</strong><span style={{ fontSize: 11.5, opacity: 0.65 }}>{t("Rules running")}</span></div>
                          </div>
                        </div>
                        <div style={{ ...statTile, minHeight: 128 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <TileBadge bg="rgba(124,58,237,0.12)">✦</TileBadge>
                            <div><p style={tileLabel}>{t("Suggested rules")}</p><strong style={{ ...tileValue, margin: "1px 0" }}>{suggestedRules.length}</strong><span style={{ fontSize: 11.5, opacity: 0.65 }}>{t("Ready to review")}</span></div>
                          </div>
                          {suggestedRules.length ? <a href="#bank-suggested-rules" style={{ ...attentionLink, marginTop: "auto", paddingTop: 8, fontSize: 12, textDecoration: "none" }}>{t("Review")} {suggestedRules.length} {t("suggestions")} →</a> : null}
                        </div>
                        <div style={{ ...statTile, minHeight: 128 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <TileBadge bg="rgba(37,99,235,0.12)">⚡</TileBadge>
                            <div><p style={tileLabel}>{t("Auto-applied")}</p><strong style={{ ...tileValue, margin: "1px 0" }}>{autoAppliedCount}</strong><span style={{ fontSize: 11.5, opacity: 0.65 }}>{t("Transactions auto-categorised")} · {periodLabel}</span></div>
                          </div>
                          <button type="button" onClick={() => setTab("transactions")} style={{ ...attentionLink, marginTop: "auto", paddingTop: 8, fontSize: 12 }}>{t("View activity")} →</button>
                        </div>
                        <div style={{ ...statTile, minHeight: 128 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <TileBadge bg="rgba(245,158,11,0.14)">!</TileBadge>
                            <div><p style={tileLabel}>{t("Needs review")}</p><strong style={{ ...tileValue, margin: "1px 0" }}>{attention.uncategorised}</strong><span style={{ fontSize: 11.5, opacity: 0.65 }}>{t("Recent transactions")}</span></div>
                          </div>
                          <button type="button" onClick={() => showAttention("uncategorised")} style={{ ...attentionLink, marginTop: "auto", paddingTop: 8, fontSize: 12 }}>{t("View transactions")} →</button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
                          <button type="button" disabled={!isOwner} onClick={() => setNewRuleOpen(value => !value)} style={{ ...bankBtn, background: "#2563eb", color: "#fff", borderColor: "#2563eb", padding: "9px 14px" }}>＋ {t("New rule")}</button>
                          <button type="button" disabled={!isOwner || !suggestedRules.length || busy === "rule-bulk"} onClick={() => void createAllSuggestedRules()} style={{ ...bankBtn, padding: "8px 14px", fontSize: 12.5, opacity: suggestedRules.length ? 1 : 0.5 }}>✦ {t("Bulk create suggested rules")}</button>
                          <a href="#bank-suggested-rules" style={{ ...bankBtn, padding: "8px 14px", fontSize: 12.5, textDecoration: "none", textAlign: "center", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{t("Review")} <span style={{ ...countBadge, background: "rgba(245,158,11,0.18)", color: "#b45309" }}>{suggestedRules.length}</span> {t("suggestions")}</a>
                        </div>
                      </div>

                      {newRuleOpen && isOwner ? (
                        <div style={{ ...bankCard, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 18px", borderColor: "rgba(37,99,235,0.3)", background: "rgba(37,99,235,0.05)" }}>
                          <strong style={{ fontSize: 13 }}>{t("New rule")}</strong>
                          <span style={{ fontSize: 12.5, opacity: 0.75 }}>{t("If merchant contains")}</span>
                          <input type="text" value={newRuleKeyword} autoFocus placeholder={t("keyword")} onChange={event => setNewRuleKeyword(event.target.value)}
                            onKeyDown={event => { if (event.key === "Enter") void createRuleFromForm(); if (event.key === "Escape") setNewRuleOpen(false); }}
                            style={{ ...pickerInput, flex: "0 1 200px", fontWeight: 700 }} />
                          <span style={{ fontSize: 12.5, opacity: 0.75 }}>→</span>
                          <select value={newRuleCategory} onChange={event => setNewRuleCategory(event.target.value)} style={{ ...pickerInput, flex: "0 1 200px" }} aria-label={t("Category")}>
                            <option value="">{t("Category")}…</option>
                            {categoryOptions.map(name => <option key={name} value={name}>{t(name)}</option>)}
                          </select>
                          <select value={newRuleVat} onChange={event => setNewRuleVat(event.target.value)} style={{ ...pickerInput, flex: "0 1 190px" }} aria-label={t("VAT / Tax code")}>
                            <option value="">{t("VAT")}: {newRuleCategory && categoryTax[newRuleCategory] ? `${t(vatLabel(categoryTax[newRuleCategory]))} (${t("category default")})` : t("Use category default")}</option>
                            {VAT_CODES.map(item => <option key={item.code} value={item.code}>{t(item.label)}</option>)}
                          </select>
                          <select value={newRuleAppliesTo} onChange={event => setNewRuleAppliesTo(event.target.value as BankRule["appliesTo"])} style={{ ...pickerInput, flex: "0 1 150px" }} aria-label={t("Applies to")}>
                            <option value="out">{t("Money out")}</option>
                            <option value="in">{t("Money in")}</option>
                            <option value="both">{t("Money in & out")}</option>
                          </select>
                          <span style={{ flex: 1 }} />
                          <button type="button" style={bankBtnSm} onClick={() => setNewRuleOpen(false)}>{t("Cancel")}</button>
                          <button type="button" style={{ ...bankBtnSm, background: "#2563eb", color: "#fff", borderColor: "#2563eb" }} disabled={busy === "rule-new" || newRuleKeyword.trim().length < 2 || !newRuleCategory} onClick={() => void createRuleFromForm()}>{busy === "rule-new" ? t("Saving…") : t("Create rule")}</button>
                        </div>
                      ) : null}

                      {/* ---- rules table + suggestions ---- */}
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 312px", gap: 14, alignItems: "start" }}>
                        <div style={{ ...bankCard, padding: 0, overflow: "hidden" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", flexWrap: "wrap" }}>
                            <strong style={{ fontSize: 14.5 }}>{t("Rules")} ({rules.length})</strong>
                            <span style={{ flex: 1 }} />
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid rgba(120,120,140,0.22)", borderRadius: 10, padding: "5px 10px", flex: "0 1 200px", minWidth: 120 }}>
                              <span aria-hidden="true" style={{ opacity: 0.5, fontSize: 12 }}>🔍</span>
                              <input type="search" value={ruleSearch} onChange={event => setRuleSearch(event.target.value)} placeholder={t("Search rules")} aria-label={t("Search rules")}
                                style={{ border: 0, outline: "none", background: "transparent", color: "inherit", fontSize: 12.5, width: "100%" }} />
                            </span>
                          </div>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, tableLayout: "fixed", minWidth: 720 }}>
                              <thead>
                                <tr style={{ borderTop: "1px solid rgba(120,120,140,0.14)", borderBottom: "1px solid rgba(120,120,140,0.14)" }}>
                                  <th style={{ ...rulesTh, width: 154, paddingLeft: 18 }}>{t("Rule name")}</th>
                                  <th style={rulesTh}>{t("Condition")}</th>
                                  <th style={{ ...rulesTh, width: 108 }}>{t("Category")}</th>
                                  <th style={{ ...rulesTh, width: 124 }}>{t("VAT / Tax code")}</th>
                                  <th style={{ ...rulesTh, width: 112 }}>{t("Applies to")}</th>
                                  <th style={{ ...rulesTh, width: 74 }}>{t("Status")}</th>
                                  <th style={{ ...rulesTh, width: 94 }}>{t("Last used")}</th>
                                  <th style={{ ...rulesTh, width: 34 }} aria-label={t("Actions")} />
                                </tr>
                              </thead>
                              <tbody>
                                {shownRules.length === 0 ? (
                                  <tr><td colSpan={8} style={{ ...rulesTd, opacity: 0.65 }}>{rules.length === 0 ? t("No rules yet — set a category on a transaction and tick the rule box.") : t("No rules match your search.")}</td></tr>
                                ) : shownRules.map(rule => {
                                  const stat = ruleStats.get(rule.id);
                                  const active = previewRuleId === rule.id;
                                  return (
                                    <tr key={rule.id} onClick={() => setPreviewRuleId(active ? null : rule.id)}
                                      style={{ borderBottom: "1px solid rgba(120,120,140,0.1)", cursor: "pointer", background: active ? "rgba(37,99,235,0.08)" : undefined, boxShadow: active ? "inset 3px 0 0 #2563eb" : undefined }}>
                                      <td style={{ ...rulesTd, paddingLeft: 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ruleName(rule)}>{ruleName(rule)}</td>
                                      <td style={{ ...rulesTd, lineHeight: 1.3, overflow: "hidden" }}>
                                        <span style={{ opacity: 0.65, display: "block", fontSize: 11.5, whiteSpace: "nowrap" }}>{t("If merchant contains")}</span>
                                        <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.keyword.toUpperCase()}</strong>
                                      </td>
                                      <td style={rulesTd}>{ruleChip(rule.category)}</td>
                                      <td style={{ ...rulesTd, opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rule.vatCode ? t(vatLabel(rule.vatCode)) : categoryTax[rule.category] ? `${t(vatLabel(categoryTax[rule.category]))} · ${t("category default")}` : `— (${t("No VAT")})`}</td>
                                      <td style={{ ...rulesTd, opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rule.appliesTo === "in" ? t("Money in") : rule.appliesTo === "both" ? t("Money in & out") : appliesTo(stat?.txType ?? "") !== "—" ? appliesTo(stat?.txType ?? "") : t("Money out")}</td>
                                      <td style={rulesTd}><span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 9px", background: "rgba(22,163,74,0.12)", color: "#16a34a" }}>{t("Active")}</span></td>
                                      <td style={{ ...rulesTd, whiteSpace: "nowrap", opacity: 0.75 }}>{stat?.lastDate ? new Date(stat.lastDate).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                                      <td style={{ ...rulesTd, whiteSpace: "nowrap", textAlign: "right", paddingLeft: 0 }}>
                                        {isOwner ? <button type="button" className="finance-payments-delete" disabled={busy === `rule-${rule.id}`} onClick={event => { event.stopPropagation(); void deleteRule(rule); }} aria-label={t("Delete this rule?")} title={t("Delete this rule?")}>✕</button> : null}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <div style={{ padding: "10px 18px", fontSize: 11.5, opacity: 0.6, borderTop: "1px solid rgba(120,120,140,0.1)" }}>
                            {t("Showing")} {shownRules.length} / {rules.length} · {t("Click a rule to preview what it matches.")}
                          </div>
                        </div>

                        <div id="bank-suggested-rules" style={{ ...bankCard, padding: "14px 16px", scrollMarginTop: 90 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                            <strong style={{ fontSize: 14.5 }}>{t("Suggested rules")} ({suggestedRules.length})</strong>
                          </div>
                          {suggestedRules.length === 0 ? <p style={{ fontSize: 12, opacity: 0.65, margin: 0 }}>{t("No suggestions right now — categorise a few more transactions.")}</p> : null}
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {suggestedRules.map(item => (
                              <div key={item.keyword} style={{ border: "1px solid rgba(120,120,140,0.16)", borderRadius: 12, padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                                <span aria-hidden="true" style={{ ...avatarStyle, width: 30, height: 30, fontSize: 10.5, background: `${avatarColor(item.merchant)}22`, color: avatarColor(item.merchant), flexShrink: 0 }}>{initials(item.merchant)}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <strong style={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.merchant} {t("Rule")}</strong>
                                    {ruleChip(item.category)}
                                  </div>
                                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{t("If merchant contains")} "{item.keyword}"</div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                                    <span style={{ fontSize: 11, opacity: 0.6 }}>{item.count} {t("matches").toLowerCase()} · {money(item.total, currency0)}</span>
                                    <span style={{ flex: 1 }} />
                                    {isOwner ? <button type="button" style={{ ...attentionLink, fontSize: 12 }} disabled={busy === `rule-${item.keyword}`} onClick={() => void createSuggestedRule(item)}>{t("Create rule")}</button> : null}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          {isOwner && suggestedRules.length > 1 ? (
                            <button type="button" disabled={busy === "rule-bulk"} onClick={() => void createAllSuggestedRules()} style={{ ...bankBtn, width: "100%", marginTop: 10, padding: "9px 12px", fontSize: 12.5, color: "#7c3aed", borderColor: "rgba(124,58,237,0.3)" }}>
                              ✦ {busy === "rule-bulk" ? t("Saving…") : `${t("Bulk create")} ${suggestedRules.length} ${t("suggested rules")}`} ›
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {/* ---- category records ---- */}
                      <div style={{ ...bankCard, padding: "14px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ flex: 1, minWidth: 220 }}>
                            <strong style={{ fontSize: 14.5 }}>{t("Categories")}</strong>
                            <div style={{ fontSize: 11.5, opacity: 0.65, marginTop: 2 }}>{t("Your own category records — renameable, with a default VAT treatment and a mapping per accounting provider. Nothing is hard-coded to Pandle, QuickBooks or Xero.")}</div>
                          </div>
                          {isOwner ? <button type="button" style={bankBtnSm} onClick={() => openCategoryForm(null)}>＋ {t("New category")}</button> : null}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                          {BANK_CATEGORIES.filter(name => !customCategories.some(item => item.name === name)).map(name => (
                            <span key={name} title={t("Built-in category")} style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: `${categoryColor(name)}12`, color: categoryColor(name), opacity: 0.75 }}>{t(name)}</span>
                          ))}
                        </div>
                        {customCategories.length ? (
                          <div style={{ overflowX: "auto", marginTop: 10 }}>
                            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, minWidth: 640 }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid rgba(120,120,140,0.14)" }}>
                                  <th style={rulesTh}>{t("Category")}</th>
                                  <th style={rulesTh}>{t("Type")}</th>
                                  <th style={rulesTh}>{t("Default VAT")}</th>
                                  <th style={rulesTh}>Pandle</th>
                                  <th style={rulesTh}>Xero</th>
                                  <th style={rulesTh}>QuickBooks</th>
                                  <th style={{ ...rulesTh, width: 74 }}>{t("Status")}</th>
                                  <th style={{ ...rulesTh, width: 90 }} aria-label={t("Actions")} />
                                </tr>
                              </thead>
                              <tbody>
                                {customCategories.map(record => (
                                  <tr key={record.id} style={{ borderBottom: "1px solid rgba(120,120,140,0.08)", opacity: record.active ? 1 : 0.55 }}>
                                    <td style={rulesTd}><span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: `${categoryColor(record.name)}1a`, color: categoryColor(record.name) }}>{record.name}</span></td>
                                    <td style={{ ...rulesTd, opacity: 0.8 }}>{record.type === "income" ? t("Money in") : record.type === "transfer" ? t("Transfer") : t("Money out")}</td>
                                    <td style={{ ...rulesTd, opacity: 0.8, whiteSpace: "nowrap" }}>{record.defaultVatCode ? t(vatLabel(record.defaultVatCode)) : "—"}</td>
                                    <td style={{ ...rulesTd, fontVariantNumeric: "tabular-nums" }}>{record.pandleNominalCode || "—"}</td>
                                    <td style={{ ...rulesTd, fontVariantNumeric: "tabular-nums" }}>{record.xeroAccountCode || "—"}</td>
                                    <td style={{ ...rulesTd, fontVariantNumeric: "tabular-nums" }}>{record.quickbooksAccountId || "—"}</td>
                                    <td style={rulesTd}><span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 9px", background: record.active ? "rgba(22,163,74,0.12)" : "rgba(120,120,140,0.14)", color: record.active ? "#16a34a" : "inherit" }}>{record.active ? t("Active") : t("Inactive")}</span></td>
                                    <td style={{ ...rulesTd, whiteSpace: "nowrap", textAlign: "right" }}>
                                      {isOwner ? (
                                        <>
                                          <button type="button" style={{ ...attentionLink, fontSize: 11.5, marginRight: 8 }} onClick={() => openCategoryForm(record)}>{t("Edit")}</button>
                                          <button type="button" className="finance-payments-delete" disabled={busy === `category-${record.id}`} onClick={() => void deleteCategoryRecord(record)} aria-label={t("Delete this category record?")} title={t("Delete this category record?")}>✕</button>
                                        </>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                        {catFormOpen && isOwner ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12, padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(37,99,235,0.3)", background: "rgba(37,99,235,0.05)" }}>
                            <strong style={{ fontSize: 13 }}>{catFormId ? t("Edit category") : t("New category")}</strong>
                            <input type="text" value={catFormName} autoFocus placeholder={t("Category")} onChange={event => setCatFormName(event.target.value)} style={{ ...pickerInput, flex: "0 1 170px", fontWeight: 700 }} />
                            <select value={catFormType} onChange={event => setCatFormType(event.target.value as BankCategoryRecord["type"])} style={{ ...pickerInput, flex: "0 1 130px" }} aria-label={t("Type")}>
                              <option value="expense">{t("Money out")}</option>
                              <option value="income">{t("Money in")}</option>
                              <option value="transfer">{t("Transfer")}</option>
                            </select>
                            <select value={catFormVat} onChange={event => setCatFormVat(event.target.value)} style={{ ...pickerInput, flex: "0 1 180px" }} aria-label={t("Default VAT")}>
                              <option value="">{t("Default VAT")}…</option>
                              {VAT_CODES.map(item => <option key={item.code} value={item.code}>{t(item.label)}</option>)}
                            </select>
                            <input type="text" value={catFormPandleNominal} placeholder={`Pandle ${t("code")}`} onChange={event => setCatFormPandleNominal(event.target.value)} style={{ ...pickerInput, flex: "0 1 120px" }} />
                            <input type="text" value={catFormXero} placeholder={`Xero ${t("code")}`} onChange={event => setCatFormXero(event.target.value)} style={{ ...pickerInput, flex: "0 1 110px" }} />
                            <input type="text" value={catFormQuickbooks} placeholder={`QuickBooks ${t("code")}`} onChange={event => setCatFormQuickbooks(event.target.value)} style={{ ...pickerInput, flex: "0 1 140px" }} />
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                              <input type="checkbox" checked={catFormActive} onChange={event => setCatFormActive(event.target.checked)} /> {t("Active")}
                            </label>
                            <span style={{ flex: 1 }} />
                            <button type="button" style={bankBtnSm} onClick={() => setCatFormOpen(false)}>{t("Cancel")}</button>
                            <button type="button" style={{ ...bankBtnSm, background: "#2563eb", color: "#fff", borderColor: "#2563eb" }} disabled={busy === "category-form" || !catFormName.trim()} onClick={() => void saveCategoryRecord()}>
                              {busy === "category-form" ? t("Saving…") : t("Save")}
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {/* ---- rule preview bar ---- */}
                      {previewRule ? (
                        <div style={{ ...bankCard, display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", overflowX: "auto" }}>
                          <span aria-hidden="true" style={{ ...avatarStyle, width: 40, height: 40, fontSize: 13, background: `${avatarColor(previewRule.keyword)}22`, color: avatarColor(previewRule.keyword) }}>{initials(previewRule.keyword)}</span>
                          <div style={{ minWidth: 160, whiteSpace: "nowrap" }}>
                            <div style={{ fontSize: 11.5, opacity: 0.6 }}>{t("Rule preview")}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <strong style={{ fontSize: 13.5 }}>{ruleName(previewRule)}</strong>
                              <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px", background: "rgba(22,163,74,0.12)", color: "#16a34a" }}>{t("Active")}</span>
                            </div>
                          </div>
                          <span style={{ width: 1, alignSelf: "stretch", background: "rgba(120,120,140,0.18)" }} />
                          <span style={{ fontSize: 12.5, opacity: 0.8, whiteSpace: "nowrap" }}>{t("If merchant contains")} <strong>{previewRule.keyword.toUpperCase()}</strong></span>
                          <span style={{ width: 1, alignSelf: "stretch", background: "rgba(120,120,140,0.18)" }} />
                          <div><strong style={{ fontSize: 17, display: "block" }}>{previewStat?.count ?? 0}</strong><span style={{ fontSize: 11, opacity: 0.6 }}>{t("Matching transactions")}</span></div>
                          <span style={{ width: 1, alignSelf: "stretch", background: "rgba(120,120,140,0.18)" }} />
                          <div><strong style={{ fontSize: 17, display: "block" }}>{money(previewStat?.total ?? 0, currency0)}</strong><span style={{ fontSize: 11, opacity: 0.6 }}>{t("Total amount")}</span></div>
                          <span style={{ width: 1, alignSelf: "stretch", background: "rgba(120,120,140,0.18)" }} />
                          <div><strong style={{ fontSize: 14, display: "block" }}>{appliesTo(previewStat?.txType ?? "")}</strong><span style={{ fontSize: 11, opacity: 0.6 }}>{t("Applies to")}</span></div>
                          <span style={{ flex: 1 }} />
                          <button type="button" onClick={() => { setTxSearch(previewRule.keyword); setTxAttention("none"); setTxFlow("out"); setTab("transactions"); }} style={{ ...attentionLink, fontSize: 12.5, whiteSpace: "nowrap" }}>{t("View matching transactions")} →</button>
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </>
            ) : null}

            {/* Pandle bridge ships dark until Pandle issues the OAuth app credentials
                 (NEXT_PUBLIC_PANDLE_ENABLED=1 turns the card on). */}
            {isOwner && tab === "overview" ? (() => {
              // The accountant's worklist for the selected period: how ready
              // this period is to hand over, with one click into each pile.
              const spending = visibleTransactions.filter(item => item.amount < 0);
              const counts = {
                ready: visibleTransactions.filter(item => effectiveReviewStatus(item) === "ready").length,
                needsInfo: visibleTransactions.filter(item => effectiveReviewStatus(item) === "needs_info").length,
                missingReceipt: spending.filter(item => !item.receiptPath && !item.receiptNotNeeded).length,
                missingVat: spending.filter(item => effectiveCategory(item) && !effectiveVat(item)).length,
                syncErrors: visibleTransactions.filter(item => effectiveReviewStatus(item) === "sync_error").length,
                confirmed: visibleTransactions.filter(item => effectiveReviewStatus(item) === "confirmed").length
              };
              const openPile = (filter: string) => {
                setTxReview(filter);
                setTxAttention("none");
                setTab("transactions");
              };
              const pile = (label: string, value: number, filter: string, color: string) => (
                <button key={filter} type="button" onClick={() => openPile(filter)}
                  style={{ flex: "1 1 130px", minWidth: 120, border: "1px solid rgba(120,120,140,0.16)", borderRadius: 12, padding: "10px 12px", background: "transparent", cursor: "pointer", textAlign: "left", color: "inherit" }}>
                  <strong style={{ fontSize: 20, display: "block", color: value > 0 ? color : undefined, fontVariantNumeric: "tabular-nums" }}>{value}</strong>
                  <span style={{ fontSize: 11.5, opacity: 0.7 }}>{label}</span>
                </button>
              );
              return (
                <div style={{ ...bankCard, padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: 14.5 }}>{t("Accounting review")}</strong>
                    <span style={{ fontSize: 11.5, opacity: 0.6 }}>· {periodLabel}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                    {pile(t("Ready for accounting"), counts.ready, "ready", "#2563eb")}
                    {pile(t("Needs information"), counts.needsInfo, "needs_info", "#b45309")}
                    {pile(t("Missing receipt"), counts.missingReceipt, "missing_receipt", "#dc2626")}
                    {pile(t("Missing VAT code"), counts.missingVat, "missing_vat", "#b45309")}
                    {pile(t("Sync error"), counts.syncErrors, "sync_error", "#dc2626")}
                    {pile(t("Confirmed in accounting"), counts.confirmed, "confirmed", "#16a34a")}
                  </div>
                </div>
              );
            })() : null}
            {isOwner && tab === "overview" && process.env.NEXT_PUBLIC_PANDLE_ENABLED === "1" ? <PandleCard companyId={companyId} categoriesInUse={categoriesInUse} t={t} money={money} /> : null}
          </>
        ) : null}
      </div>

      {/* ================= TRANSACTION DRAWER ================= */}
      {drawerTx ? (
        <aside className="bank-drawer" style={drawerStyle} aria-label={t("Transaction details")}>
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
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3 }}>
                  {TX_TYPE_META[drawerTx.txType] ? (
                    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", padding: "3px 8px", borderRadius: 6, background: `${TX_TYPE_META[drawerTx.txType].color}1a`, color: TX_TYPE_META[drawerTx.txType].color }}>
                      {TX_TYPE_META[drawerTx.txType].translate ? t(TX_TYPE_META[drawerTx.txType].label) : TX_TYPE_META[drawerTx.txType].label}
                    </span>
                  ) : null}
                  <span style={{ fontSize: 11, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastSync ? `${t("Last sync")} ${lastSync.toLocaleString()}` : ""}</span>
                </div>
              </div>
              <strong style={{ fontSize: 16, fontVariantNumeric: "tabular-nums", color: drawerTx.amount < 0 ? "#dc2626" : "#16a34a", whiteSpace: "nowrap" }}>{drawerTx.amount < 0 ? "−" : "+"}{money(Math.abs(drawerTx.amount), drawerTx.currency)}</strong>
            </div>
            <div>
              <div style={drawerLabel}>{t("Raw bank description")}</div>
              <div style={{ fontSize: 12, padding: "8px 10px", borderRadius: 8, background: "rgba(120,120,140,0.1)", wordBreak: "break-word" }}>{drawerTx.description || "—"}</div>
            </div>
            {(() => {
              // The read-only bank layer, kept visibly apart from NivaDesk's
              // own enrichment: what the bank said never changes here.
              const account = connections.flatMap(item => item.accounts).find(item => item.id === drawerTx.accountId);
              const rows: Array<[string, string]> = [
                [t("Bank transaction ID"), drawerTx.providerTransactionId || drawerTx.id],
                [t("Bank account"), account ? `${account.name}${account.currency ? ` · ${account.currency}` : ""}` : (drawerTx.accountId || "—")],
                [t("Status"), drawerTx.status === "pending" ? t("pending") : t("Booked")],
                [t("Bank reference"), drawerTx.providerReference || "—"],
                [t("Open Banking provider"), drawerTx.provider === "truelayer" ? "TrueLayer" : (drawerTx.provider || "—")],
                [t("First imported"), drawerTx.firstImportedAt ? drawerTx.firstImportedAt.toLocaleDateString() : "—"],
                [t("Last updated"), drawerTx.importedAt ? drawerTx.importedAt.toLocaleString() : "—"]
              ];
              return (
                <details style={{ fontSize: 12, border: "1px solid rgba(120,120,140,0.2)", borderRadius: 10, padding: "8px 10px" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.7 }}>
                    {t("Bank data")} · {t("Read-only")}
                  </summary>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "5px 12px", marginTop: 8 }}>
                    {rows.map(([label, value]) => (
                      <Fragment key={label}>
                        <span style={{ opacity: 0.6, whiteSpace: "nowrap" }}>{label}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums", wordBreak: "break-all" }}>{value}</span>
                      </Fragment>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, opacity: 0.55 }}>{t("Bank data can never be edited — everything below is NivaDesk's own enrichment.")}</div>
                </details>
              );
            })()}
            {drawerTx.amount < 0 ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label>
                    <div style={drawerLabel}>{t("Category")}</div>
                    <select value={drawerCategory} disabled={!isOwner} onChange={event => setDrawerCategory(event.target.value)} style={{ ...pickerInput, width: "100%" }}>
                      <option value="">{t("Uncategorised")}</option>
                      {Array.from(new Set([...categoryOptions, ...(drawerCategory ? [drawerCategory] : [])])).map(name => <option key={name} value={name}>{t(name)}</option>)}
                    </select>
                    {!drawerTx.category && drawerTx.categoryAuto ? <div style={{ fontSize: 10.5, opacity: 0.6, marginTop: 3 }}>⚡ {t("Auto-applied")}: {t(drawerTx.categoryAuto)}</div> : null}
                  </label>
                  <label>
                    <div style={drawerLabel}>{t("VAT / Tax code")}</div>
                    <select value={drawerVat} disabled={!isOwner} onChange={event => setDrawerVat(event.target.value)} style={{ ...pickerInput, width: "100%" }}>
                      <option value="">{t("Use category default")}{drawerCategory && categoryTax[drawerCategory] ? ` (${t(vatLabel(categoryTax[drawerCategory]))})` : ""}</option>
                      {VAT_CODES.map(item => <option key={item.code} value={item.code}>{t(item.label)}</option>)}
                    </select>
                    {!drawerTx.vatCode && drawerTx.vatCodeAuto ? <div style={{ fontSize: 10.5, opacity: 0.6, marginTop: 3 }}>⚡ {t("Auto-applied")}: {t(vatLabel(drawerTx.vatCodeAuto))}</div> : null}
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label>
                    <div style={drawerLabel}>{t("Linked order or project")}</div>
                    <input type="search" value={drawerOrderSearch} disabled={!isOwner} onChange={event => setDrawerOrderSearch(event.target.value)} placeholder={t("Search orders")}
                      style={{ ...pickerInput, width: "100%", marginBottom: 4, fontSize: 11.5, padding: "4px 8px" }} aria-label={t("Search orders")} />
                    <select value={drawerOrderId} disabled={!isOwner} onChange={event => setDrawerOrderId(event.target.value)} style={{ ...pickerInput, width: "100%" }}>
                      <option value="">{t("Not linked")}</option>
                      {(orderOptions
                        ? rankOrdersForTransaction(drawerTx, orderOptions).map(item => item.order)
                          .filter(order => !drawerOrderSearch.trim() || `${order.customerName} ${order.designName}`.toLowerCase().includes(drawerOrderSearch.trim().toLowerCase()))
                          .slice(0, 40)
                        : []).map(order => (
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
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <FileBadge name={drawerTx.receiptName} size={30} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: "#16a34a", fontWeight: 700, fontSize: 11.5 }}>✓ {t("Receipt matched")}</div>
                            <button type="button" onClick={() => void openReceipt(drawerTx)} style={{ ...attentionLink, fontSize: 11.5, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{drawerTx.receiptName || t("View invoice")} ↗</button>
                          </div>
                          {isOwner ? <button type="button" className="finance-payments-delete" onClick={() => void removeReceipt(drawerTx)} aria-label={t("Remove invoice")} style={{ fontSize: 10 }}>✕</button> : null}
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ color: drawerTx.receiptNotNeeded ? "inherit" : "#dc2626", fontWeight: 700, opacity: drawerTx.receiptNotNeeded ? 0.6 : 1 }}>{drawerTx.receiptNotNeeded ? t("No receipt needed") : `! ${t("Missing receipt")}`}</span>
                          {isOwner ? <button type="button" style={{ ...attentionLink, fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 4 }} onClick={() => { setPendingAttachTxId(drawerTx.id); document.getElementById("bank-receipt-input")?.click(); }}><AttachIcon size={13} color="#2563eb" /> {t("Upload new")}</button> : null}
                          {isOwner ? <button type="button" style={{ ...attentionLink, fontSize: 11.5 }} disabled={filesPicker.loading} onClick={() => void openFilesPicker()}>{filesPicker.loading ? t("Loading…") : `▤ ${t("Choose from Files")}`}</button> : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {filesPicker.open ? (
                  <div style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(37,99,235,0.3)", background: "rgba(37,99,235,0.05)", fontSize: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <strong>{t("Choose from Files")}</strong>
                      <span style={{ flex: 1 }} />
                      <button type="button" className="finance-payments-delete" onClick={() => setFilesPicker(prev => ({ ...prev, open: false }))} aria-label={t("Close")}>✕</button>
                    </div>
                    <input type="search" value={filesPicker.search} onChange={event => setFilesPicker(prev => ({ ...prev, search: event.target.value }))} placeholder={t("Search files")}
                      style={{ ...pickerInput, width: "100%", marginBottom: 6, fontSize: 11.5, padding: "4px 8px" }} aria-label={t("Search files")} />
                    <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                      {filesPicker.files
                        .filter(file => !filesPicker.search.trim() || `${file.displayName} ${file.fileName}`.toLowerCase().includes(filesPicker.search.trim().toLowerCase()))
                        .slice(0, 40)
                        .map(file => (
                          <button key={file.id} type="button" disabled={busy === "receipt-pick"} onClick={() => void chooseLibraryReceipt(file.id)}
                            style={{ display: "flex", alignItems: "center", gap: 8, border: 0, background: "transparent", cursor: "pointer", textAlign: "left", padding: "4px 6px", borderRadius: 7, color: "inherit" }}>
                            <FileBadge name={file.fileName} size={24} />
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{file.displayName}</span>
                          </button>
                        ))}
                      {!filesPicker.loading && filesPicker.files.length === 0 ? <span style={{ opacity: 0.6 }}>{t("The library is empty.")}</span> : null}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10.5, opacity: 0.55 }}>{t("The file is referenced, not copied — an invoice already on a purchase is never uploaded twice.")}</div>
                  </div>
                ) : null}
                {(() => {
                  // Split transaction: one payment, several categories/orders.
                  const abs = Math.abs(drawerTx.amount);
                  if (drawerSplits) {
                    const total = drawerSplits.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
                    const balanced = Math.abs(total - abs) <= 0.005;
                    return (
                      <div style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(37,99,235,0.3)", background: "rgba(37,99,235,0.05)", fontSize: 12 }}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>⑃ {t("Split transaction")}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {drawerSplits.map((row, index) => (
                            <div key={index} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                              <input type="number" step="0.01" min="0" value={row.amount} onChange={event => setDrawerSplits(rows => rows ? rows.map((r, i) => i === index ? { ...r, amount: event.target.value } : r) : rows)}
                                style={{ ...pickerInput, flex: "0 1 90px", fontVariantNumeric: "tabular-nums" }} aria-label={t("Amount")} />
                              <select value={row.category} onChange={event => setDrawerSplits(rows => rows ? rows.map((r, i) => i === index ? { ...r, category: event.target.value } : r) : rows)} style={{ ...pickerInput, flex: "1 1 120px" }} aria-label={t("Category")}>
                                <option value="">{t("Category")}…</option>
                                {categoryOptions.map(name => <option key={name} value={name}>{t(name)}</option>)}
                              </select>
                              <select value={row.vatCode} onChange={event => setDrawerSplits(rows => rows ? rows.map((r, i) => i === index ? { ...r, vatCode: event.target.value } : r) : rows)} style={{ ...pickerInput, flex: "0 1 120px" }} aria-label={t("VAT / Tax code")}>
                                <option value="">{t("VAT")}…</option>
                                {VAT_CODES.map(item => <option key={item.code} value={item.code}>{t(item.label)}</option>)}
                              </select>
                              <select value={row.orderId} onChange={event => setDrawerSplits(rows => rows ? rows.map((r, i) => i === index ? { ...r, orderId: event.target.value } : r) : rows)} style={{ ...pickerInput, flex: "1 1 130px" }} aria-label={t("Linked order or project")}>
                                <option value="">{t("Not linked")}</option>
                                {(orderOptions ?? []).slice(0, 60).map(order => <option key={order.id} value={order.id}>{order.customerName}{order.designName && order.designName !== "Untitled design" ? ` · ${order.designName}` : ""}</option>)}
                              </select>
                              <input type="text" value={row.note} onChange={event => setDrawerSplits(rows => rows ? rows.map((r, i) => i === index ? { ...r, note: event.target.value } : r) : rows)} placeholder={t("Note")}
                                style={{ ...pickerInput, flex: "1 1 110px" }} aria-label={t("Note")} />
                              <button type="button" className="finance-payments-delete" onClick={() => setDrawerSplits(rows => rows && rows.length > 2 ? rows.filter((_, i) => i !== index) : rows)} aria-label={t("Remove")} style={{ fontSize: 10 }}>✕</button>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          <button type="button" style={{ ...attentionLink, fontSize: 11.5 }} onClick={() => setDrawerSplits(rows => rows ? [...rows, { amount: "0.00", category: "", vatCode: "", note: "", orderId: "" }] : rows)}>＋ {t("Add line")}</button>
                          <span style={{ flex: 1 }} />
                          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: balanced ? "#16a34a" : "#dc2626" }}>
                            {money(total, drawerTx.currency)} / {money(abs, drawerTx.currency)}
                          </span>
                          <button type="button" style={bankBtnSm} onClick={() => setDrawerSplits(null)}>{t("Cancel")}</button>
                          <button type="button" style={{ ...bankBtnSm, background: "#2563eb", color: "#fff", borderColor: "#2563eb" }} disabled={busy === "splits" || !balanced} onClick={() => void saveSplits()}>
                            {busy === "splits" ? t("Saving…") : t("Save split")}
                          </button>
                        </div>
                        {!balanced ? <div style={{ marginTop: 4, fontSize: 10.5, color: "#dc2626" }}>{t("Split lines must add up to the exact transaction amount.")}</div> : null}
                      </div>
                    );
                  }
                  if (drawerTx.splits.length) {
                    return (
                      <div style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(120,120,140,0.2)", fontSize: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <strong>⑃ {t("Split transaction")} ({drawerTx.splits.length})</strong>
                          <span style={{ flex: 1 }} />
                          {isOwner ? <button type="button" style={{ ...attentionLink, fontSize: 11.5 }} onClick={() => startSplitEditor(drawerTx)}>{t("Edit")}</button> : null}
                          {isOwner ? <button type="button" style={{ ...attentionLink, fontSize: 11.5, color: "#dc2626" }} disabled={busy === "splits"} onClick={() => void removeSplits()}>{t("Remove")}</button> : null}
                        </div>
                        {drawerTx.splits.map((row, index) => (
                          <div key={index} style={{ display: "flex", gap: 8, alignItems: "center", padding: "2px 0" }}>
                            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, minWidth: 70 }}>{money(row.amount, drawerTx.currency)}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 9px", background: `${categoryColor(row.category)}1a`, color: categoryColor(row.category) }}>{t(row.category)}</span>
                            {row.vatCode ? <span style={{ opacity: 0.65 }}>{t(vatLabel(row.vatCode))}</span> : null}
                            {row.orderLabel ? <span style={{ color: "#2563eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>⛓ {row.orderLabel}</span> : null}
                            {row.note ? <span style={{ opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.note}</span> : null}
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return isOwner ? (
                    <button type="button" style={{ ...attentionLink, fontSize: 12, textAlign: "left" }} onClick={() => startSplitEditor(drawerTx)}>
                      ⑃ {t("Split this transaction into several categories or orders")}
                    </button>
                  ) : null;
                })()}
              </>
            ) : null}
            {drawerTx.amount > 0 ? (
              <div style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(120,120,140,0.2)", fontSize: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>⇥ {t("Match to")}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select value={drawerTx.incomingKind || ""} disabled={!isOwner || busy === "incoming"}
                    onChange={event => {
                      const kind = event.target.value;
                      if (kind === "order_payment") return; // chosen through the order flow below
                      void call("bankUpdateTransaction", { transactionId: drawerTx.id, incomingKind: kind }).then(() => setStatus(t("Transaction saved."))).catch(err => setError(err instanceof Error ? err.message : "Could not save the transaction."));
                    }}
                    style={{ ...pickerInput, flex: "0 1 210px" }} aria-label={t("Match to")}>
                    <option value="">{t("Unclassified income")}</option>
                    <option value="order_payment">{t("Order payment")}</option>
                    <option value="invoice">{t("Invoice")}</option>
                    <option value="deposit">{t("Deposit")}</option>
                    <option value="refund_received">{t("Refund received")}</option>
                    <option value="owner_contribution">{t("Owner contribution")}</option>
                    <option value="loan">{t("Loan")}</option>
                    <option value="transfer">{t("Transfer between own accounts")}</option>
                    <option value="other_income">{t("Other income")}</option>
                  </select>
                  {["transfer", "owner_contribution", "loan"].includes(drawerTx.incomingKind) ? (
                    <span style={{ fontSize: 11, opacity: 0.65 }}>{t("Not counted as revenue.")}</span>
                  ) : null}
                </div>
                {drawerTx.incomingKind === "order_payment" && drawerTx.linkedPaymentId ? (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ {t("Matched to the order's existing payment — nothing was recorded twice.")}</span>
                    <span style={{ color: "#2563eb" }}>⛓ {drawerTx.linkedOrderLabel}</span>
                    {isOwner ? <button type="button" style={{ ...attentionLink, fontSize: 11.5 }} disabled={busy === "incoming"} onClick={() => void incomingCall("unlink")}>{t("Unlink")}</button> : null}
                  </div>
                ) : isOwner ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <select value={incomingOrderId} onChange={event => { setIncomingOrderId(event.target.value); setIncomingSuggest(null); }} style={{ ...pickerInput, flex: "1 1 220px" }} aria-label={t("Order")}>
                        <option value="">{t("Order")}…</option>
                        {(orderOptions ? rankOrdersForTransaction(drawerTx, orderOptions).map(item => item.order).slice(0, 40) : []).map(order => (
                          <option key={order.id} value={order.id}>{order.customerName}{order.designName && order.designName !== "Untitled design" ? ` · ${order.designName}` : ""}</option>
                        ))}
                      </select>
                      <button type="button" style={bankBtnSm} disabled={!incomingOrderId || busy === "incoming"} onClick={() => void incomingCall("suggest")}>
                        {busy === "incoming" ? t("Loading…") : t("Find matching payment")}
                      </button>
                    </div>
                    {incomingSuggest ? (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                        {incomingSuggest.candidates.map(candidate => (
                          <div key={candidate.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(120,120,140,0.18)" }}>
                            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{money(candidate.amount, drawerTx.currency)}</span>
                            <span style={{ opacity: 0.7 }}>{candidate.method}{candidate.dateMs ? ` · ${new Date(candidate.dateMs).toLocaleDateString()}` : ""}</span>
                            <span style={{ flex: 1 }} />
                            <button type="button" style={{ ...bankBtnSm, color: "#16a34a", borderColor: "rgba(22,163,74,0.4)" }} disabled={busy === "incoming"} onClick={() => void incomingCall("link", candidate.id)}>✓ {t("Match this payment")}</button>
                          </div>
                        ))}
                        {incomingSuggest.candidates.length === 0 ? <span style={{ fontSize: 11.5, opacity: 0.7 }}>{t("No unmatched payment with this amount on the order.")}</span> : null}
                        <button type="button" style={{ ...attentionLink, fontSize: 11.5, textAlign: "left" }} disabled={busy === "incoming"}
                          onClick={() => { if (window.confirm(`${t("Record a NEW payment on this order?")} (${money(drawerTx.amount, drawerTx.currency)})`)) void incomingCall("create"); }}>
                          ＋ {t("Record as a new payment on this order")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label>
                <div style={drawerLabel}>{t("Review status")}</div>
                <select value={drawerReview} disabled={!isOwner} onChange={event => setDrawerReview(event.target.value)} style={{ ...pickerInput, width: "100%" }}>
                  {REVIEW_STATUSES.map(item => <option key={item.code} value={item.code}>{t(item.label)}</option>)}
                </select>
              </label>
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
                {(() => {
                  const meta = reviewStatusMeta(drawerReview);
                  return (
                    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", padding: "4px 10px", borderRadius: 999, background: `${meta.color}1a`, color: meta.color }}>
                      {t(meta.label)}
                    </span>
                  );
                })()}
              </div>
            </div>
            <label>
              <div style={drawerLabel}>{t("Notes")}</div>
              <textarea value={drawerNote} disabled={!isOwner} onChange={event => setDrawerNote(event.target.value)} rows={3} placeholder={t("Internal note for this transaction")} style={{ ...pickerInput, width: "100%", resize: "vertical", fontFamily: "inherit" }} />
            </label>
            {drawerTx.amount < 0 && isOwner && drawerCategory && !rules.some(rule => `${drawerTx.counterparty} ${drawerTx.description}`.toLowerCase().includes(rule.keyword)) ? (
              <div style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(37,99,235,0.25)", background: "rgba(37,99,235,0.06)", fontSize: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <strong style={{ fontWeight: 800 }}>✦ {t("Rule suggestion")}</strong>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, padding: "2px 7px", borderRadius: 999, background: "rgba(124,58,237,0.14)", color: "#7c3aed" }}>{t("Suggested rule")}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ flex: 1, minWidth: 180 }}>
                    {t("If merchant contains")}{" "}
                    <input type="text" value={drawerRuleKeyword} onChange={event => setDrawerRuleKeyword(event.target.value)} style={{ ...pickerInput, width: 120, flex: "none", fontWeight: 700, padding: "3px 6px", fontSize: 11.5 }} />
                    {" → "}<strong style={{ color: categoryColor(drawerCategory) }}>{t(drawerCategory)}</strong>
                    {drawerVat ? <span style={{ opacity: 0.7 }}>, {t("VAT")}: {t(vatLabel(drawerVat))}</span> : null}
                  </span>
                  <button type="button" style={{ ...bankBtnSm, background: "var(--surface, #fff)" }} disabled={busy === "drawer"} onClick={() => void saveDrawer(true)}>{t("Create rule")}</button>
                </div>
              </div>
            ) : null}
            {drawerTx.amount < 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
                {(() => {
                  const key = recurringMerchantKey(drawerTx);
                  const vendor = vendorByKey.get(key);
                  const detected = recurringKeys.has(key) || recurring.some(item => item.vendorId && item.vendorId === vendor?.id);
                  return (
                    <div style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(120,120,140,0.2)" }}>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>↻ {t("Recurring")}</div>
                      {vendor ? (
                        <div>
                          <span style={{ color: "#16a34a" }}>{t("Marked as recurring")} · {t(vendor.cadence === "weekly" ? "Weekly" : vendor.cadence === "yearly" ? "Yearly" : "Monthly")}</span>
                          <div style={{ fontSize: 11, opacity: 0.65 }}>{t("Grouped as")} “{vendor.name}”</div>
                          {isOwner ? <button type="button" style={{ ...attentionLink, fontSize: 11.5, marginTop: 4 }} disabled={busy === `vendor-${drawerTx.id}`} onClick={() => void unmarkRecurring(drawerTx, vendor.id)}>{t("Stop treating as recurring")}</button> : null}
                        </div>
                      ) : detected ? (
                        <span style={{ color: "#16a34a" }}>{t("Part of a recurring payment")}</span>
                      ) : (
                        <div>
                          <span style={{ opacity: 0.65 }}>{t("This transaction doesn't appear to repeat.")}</span>
                          {isOwner ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                              <select value="" disabled={busy === `vendor-${drawerTx.id}`}
                                onChange={event => { if (event.target.value) void markRecurring(drawerTx, event.target.value as "weekly" | "monthly" | "yearly"); }}
                                style={{ ...pickerInput, flex: "0 1 190px", fontSize: 11.5, padding: "4px 6px" }} aria-label={t("Mark as recurring")}>
                                <option value="">↻ {t("Mark as recurring")}…</option>
                                <option value="weekly">{t("Weekly")}</option>
                                <option value="monthly">{t("Monthly")}</option>
                                <option value="yearly">{t("Yearly")}</option>
                              </select>
                              {vendors.length ? (
                                <select value="" disabled={busy === `vendor-${drawerTx.id}`}
                                  onChange={event => { const target = vendors.find(item => item.id === event.target.value); if (target) void markRecurring(drawerTx, target.cadence, target.id); }}
                                  style={{ ...pickerInput, flex: "0 1 190px", fontSize: 11.5, padding: "4px 6px" }} aria-label={t("Same payee as")}>
                                  <option value="">{t("Same payee as")}…</option>
                                  {vendors.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                                </select>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(120,120,140,0.2)" }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>⇄ {t("Activity & sync")}</div>
                  {drawerTx.pandleStatus === "confirmed" ? (
                    <div>
                      <span style={{ color: "#16a34a" }}>✓ {t("Confirmed in Pandle")}</span>
                      {drawerTx.pandleBankTransactionId ? <div style={{ fontSize: 11, opacity: 0.65, fontVariantNumeric: "tabular-nums" }}>{t("Pandle transaction ID")}: {drawerTx.pandleBankTransactionId}</div> : null}
                    </div>
                  ) : drawerTx.pandleStatus === "error" ? (
                    <div>
                      <span style={{ color: "#dc2626" }}>! {t("Sync error")}</span>
                      {drawerTx.pandleLastError ? <div style={{ fontSize: 11, opacity: 0.7, wordBreak: "break-word" }}>{drawerTx.pandleLastError}</div> : null}
                      <div style={{ fontSize: 11, opacity: 0.55 }}>{t("Nothing was lost — fix the issue and sync again.")}</div>
                    </div>
                  ) : drawerTx.pandleStatus === "matched" ? (
                    <span style={{ color: "#2563eb" }}>{t("Matched to an existing Pandle transaction")}</span>
                  ) : (
                    <span style={{ opacity: 0.65 }}>{t("Not synced to Pandle yet")}</span>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          {isOwner ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 18px", borderTop: "1px solid rgba(120,120,140,0.16)" }}>
              <button type="button" style={{ ...bankBtnSm, opacity: 0.75 }} onClick={() => setDrawerTxId(null)}>{t("Close")}</button>
              <span style={{ flex: 1 }} />
              {drawerTx.amount < 0 && drawerCategory ? <button type="button" style={bankBtn} disabled={busy === "drawer"} onClick={() => void saveDrawer(true)}>{t("Save & create rule")}</button> : null}
              <button type="button" style={{ ...bankBtn, background: "#2563eb", color: "#fff", borderColor: "#2563eb" }} disabled={busy === "drawer"} onClick={() => void saveDrawer(false)}>{busy === "drawer" ? t("Saving…") : t("Save")}</button>
            </div>
          ) : null}
        </aside>
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
// Stat tiles share a min height and push their footer link to the bottom so a
// row of them lines up however much text each one carries.
const statTile: React.CSSProperties = { background: "var(--surface, rgba(255,255,255,0.6))", border: "1px solid rgba(120,120,140,0.18)", borderRadius: 14, padding: "16px 18px", position: "relative", display: "flex", flexDirection: "column", minHeight: 148 };
const cardHead: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 };
const cardTitle: React.CSSProperties = { fontSize: 14.5, fontWeight: 800 };
const miniTh: React.CSSProperties = { textAlign: "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.5, padding: "7px 18px" };
const miniTd: React.CSSProperties = { padding: "9px 18px", verticalAlign: "middle" };
const tileLabel: React.CSSProperties = { margin: 0, fontSize: 12, fontWeight: 700, opacity: 0.75 };
const tileValue: React.CSSProperties = { fontSize: 25, fontWeight: 800, fontVariantNumeric: "tabular-nums", display: "block", margin: "3px 0 2px" };
const tileUnit: React.CSSProperties = { fontSize: 12, fontWeight: 600, opacity: 0.55 };
const countBadge: React.CSSProperties = { fontSize: 11, fontWeight: 800, background: "rgba(120,120,140,0.14)", borderRadius: 7, padding: "2px 8px" };
const recurringRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(120,120,140,0.1)" };
const avatarStyle: React.CSSProperties = { width: 30, height: 30, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 };
const attentionLink: React.CSSProperties = { border: 0, background: "transparent", color: "#2563eb", fontWeight: 700, fontSize: 11.5, cursor: "pointer", padding: 0, textAlign: "left" };
const drawerStyle: React.CSSProperties = { position: "sticky", top: 12, alignSelf: "start", maxHeight: "calc(100vh - 24px)", minWidth: 0, background: "var(--surface, #fff)", border: "1px solid rgba(120,120,140,0.18)", borderRadius: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", overflow: "hidden" };
const drawerLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.65, marginBottom: 4 };
const cardFootLink: React.CSSProperties = { border: 0, background: "transparent", color: "#2563eb", fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: "10px 0 0", textAlign: "left" };
const rulesTh: React.CSSProperties = { textAlign: "left", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.55, padding: "9px 12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const rulesTd: React.CSSProperties = { padding: "10px 12px", verticalAlign: "middle" };
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

// Receipt attachments: the file type decides the badge (PDF / image / document /
// generic file) so a row shows at a glance what is attached; "attach" is the
// empty state — an outlined paperclip that invites an upload.
type ReceiptKind = "pdf" | "image" | "doc" | "file";
function receiptKind(name: string): ReceiptKind {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "bmp", "tif", "tiff"].includes(ext)) return "image";
  if (["doc", "docx", "xls", "xlsx", "csv", "txt", "rtf", "odt", "pages", "numbers"].includes(ext)) return "doc";
  return "file";
}
const RECEIPT_KIND_META: Record<ReceiptKind, { label: string; color: string; bg: string }> = {
  pdf: { label: "PDF", color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
  image: { label: "IMG", color: "#2563eb", bg: "rgba(37,99,235,0.12)" },
  doc: { label: "DOC", color: "#0e7a55", bg: "rgba(14,122,85,0.12)" },
  file: { label: "FILE", color: "#6b7280", bg: "rgba(107,114,128,0.14)" }
};
function FileBadge({ name, size = 26 }: { name: string; size?: number }) {
  const kind = receiptKind(name);
  const meta = RECEIPT_KIND_META[kind];
  const s = size;
  return (
    <span aria-hidden="true" title={name} style={{ position: "relative", width: s, height: s, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" fill={meta.bg} />
        <path d="M14 2v5h5" />
        {kind === "image" ? <><circle cx="9.5" cy="12" r="1.3" fill={meta.color} stroke="none" /><path d="M7.5 18l3-3.5 2 2.2 2-2.7 2.5 4z" fill={meta.color} stroke="none" /></> : null}
        {kind === "doc" ? <><path d="M8.5 12.5h7" /><path d="M8.5 15.5h7" /><path d="M8.5 18.5h4" /></> : null}
      </svg>
      {kind === "pdf" || kind === "file" ? (
        <span style={{ position: "absolute", left: "50%", bottom: Math.round(s * 0.1), transform: "translateX(-50%)", fontSize: Math.max(6, Math.round(s * 0.27)), fontWeight: 800, letterSpacing: 0.3, color: "#fff", background: meta.color, borderRadius: 3, padding: "0 3px", lineHeight: 1.4 }}>{meta.label}</span>
      ) : null}
    </span>
  );
}
function AttachIcon({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9-9a3.5 3.5 0 0 1 5 5l-9 9a1.5 1.5 0 0 1-2.1-2.1l8.3-8.3" />
    </svg>
  );
}
function ReceiptGlyph({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z" />
      <path d="M9 8h6M9 11.5h6M9 15h4" />
    </svg>
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
  const size = 152;
  const stroke = 22;
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
      <text x="50%" y="47%" textAnchor="middle" fontSize="17" fontWeight="800" fill="currentColor">{centerValue}</text>
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

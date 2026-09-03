// The accounting connector as the web sees it — QuickBooks Online and Xero.
// Everything goes through the owner-only callables; the two Firestore reads
// (connections, catalogue) are the owner-readable projections the rules allow.
import { httpsCallable } from "firebase/functions";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db, functions } from "@/lib/firebase/client";

export type AccountingMode = "primary_write" | "shadow_read" | "migration_read" | "disabled";
export type AccountingProvider = "quickbooks_online" | "xero";
export type QuickBooksEnvironment = "production" | "sandbox";
export type XeroScopeLevel = "read" | "write";
export type XeroTenant = { tenantId: string; tenantName: string; tenantType: string };

export type AccountingCompanyProfile = {
  externalCompanyId: string;
  companyName: string;
  legalName: string;
  country: string;
  homeCurrency: string;
  multiCurrencyEnabled: boolean;
  fiscalYearStartMonth: string;
  bookCloseDate: string;
  taxTrackingEnabled: boolean;
  email: string;
};

export type AccountingConnection = {
  connectionId: string;
  provider: AccountingProvider | "pandle" | string;
  implicit?: boolean;
  /** Xero: the consent (grant) document the tokens live under; several organisations may share it. */
  tokenDocId?: string;
  tenantName?: string;
  scopeLevel?: XeroScopeLevel | string;
  scopes?: string[];
  externalCompanyId: string;
  companyName: string;
  environment?: QuickBooksEnvironment | string;
  status: "linked" | "reconnect_required" | "disconnected" | "none" | string;
  syncState?: string;
  lastError?: string;
  mode: AccountingMode | string;
  writeBoundaryDate?: string;
  writeUntilDate?: string;
  homeCurrency?: string;
  countryCode?: string;
  capabilities?: Record<string, unknown>;
  profile?: AccountingCompanyProfile | null;
  setupState?: "importing" | "ready" | string;
  counts?: Record<string, number>;
  linkedAtMs?: number;
  lastWebhookAtMs?: number;
  lastReconciliationAtMs?: number;
  lastCatalogAtMs?: number;
  lastReconciliation?: { scanned?: number; created?: number; updated?: number; changed?: number; deleted?: number; failed?: number; changedSince?: string; error?: string };
  bankAccountName?: string;
  lastPushAtMs?: number;
};

export type AccountingAttentionItem = {
  id: string;
  connectionId: string;
  provider: string;
  kind: string;
  severity: string;
  message: string;
  entityRefs: string[];
  options: string[];
  status: string;
  occurrences?: number;
  lastSeenAtMs?: number;
};

export type AccountingAuditRow = {
  id: string;
  connectionId?: string;
  provider?: string;
  action: string;
  actorUid?: string;
  actorEmail?: string;
  summary: string;
  createdAtMs: number;
};

export type MappingChoice = { externalId: string; name: string; accountType?: string; rate?: number; confirmedAtMs?: number };

export type AccountingMappings = {
  connectionId: string;
  accounts?: Record<string, MappingChoice>;
  taxes?: Record<string, MappingChoice>;
  policies?: {
    sources?: Record<string, string>;
    bespoke?: string;
    inventory?: string;
    estimatesToQuickBooks?: boolean;
    effectiveFrom?: string;
  };
  checklist?: Record<string, boolean | number | string>;
  updatedAtMs?: number;
};

export type AccountingOverview = {
  ok: boolean;
  connections: AccountingConnection[];
  attention: AccountingAttentionItem[];
  mappings: Record<string, AccountingMappings | null>;
  audit: AccountingAuditRow[];
  postings: { readyToPost: number; awaitingReview: number; awaitingBankMatch: number; syncedToday: number; phase: string };
};

export type MappingSuggestion = { externalId: string; name: string; reason: string; confidence: number; accountType?: string; rate?: number };
export type MappingSuggestions = {
  ok: boolean;
  provider?: string;
  accounts: Record<string, MappingSuggestion>;
  taxes: Record<string, MappingSuggestion>;
  duplicates: { localId: string; localName: string; localEmail: string; candidates: { externalId: string; displayName: string; reason: string; score: number }[] }[];
  localCustomerCount: number;
  remoteCustomerCount: number;
};

export type AccountingCatalog = {
  connectionId: string;
  importedAtMs: number;
  counts: Record<string, number>;
  accounts: { externalId: string; name: string; fullyQualifiedName: string; accountType: string; accountSubType: string; classification: string; currency: string; active: boolean }[];
  taxCodes: { externalId: string; name: string; description: string; active: boolean; hidden: boolean; effectiveSalesRate: number; effectivePurchaseRate: number }[];
  taxRates: { externalId: string; name: string; rateValue: number; active: boolean }[];
  items: { externalId: string; name: string; sku: string; type: string; active: boolean }[];
};

export type SyncActivity = {
  ok: boolean;
  inbox: { id: string; entityType: string; externalId: string; operation: string; status: string; outcome: string; error: string; occurredAt: string; receivedAtMs: number; format: string }[];
  audit: AccountingAuditRow[];
};

const call = <TIn, TOut>(name: string) => httpsCallable<TIn, TOut>(functions, name);

export async function getQuickBooksConnections(companyId: string): Promise<AccountingConnection[]> {
  const snap = await getDocs(collection(db, "companies", companyId, "accountingConnections"));
  return snap.docs
    .map((row) => ({ connectionId: row.id, ...(row.data() as Omit<AccountingConnection, "connectionId">) }))
    .filter((row) => row.provider === "quickbooks_online");
}

export async function getAccountingCatalog(companyId: string, connectionId: string): Promise<AccountingCatalog | null> {
  const snap = await getDoc(doc(db, "companies", companyId, "accountingCatalog", connectionId));
  return snap.exists() ? (snap.data() as AccountingCatalog) : null;
}

export async function quickbooksConnectStart(companyId: string, environment: QuickBooksEnvironment) {
  return (await call<{ companyId: string; environment: QuickBooksEnvironment }, { ok: boolean; state: string; environment: string; authorizeUrl: string }>("quickbooksConnectStart")({ companyId, environment })).data;
}

export async function quickbooksSyncNow(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, { ok: boolean; counts: Record<string, number>; reconcile: Record<string, number | string> }>("quickbooksSyncNow")({ companyId, connectionId })).data;
}

export async function quickbooksDisconnect(companyId: string, connectionId: string, purge = false) {
  return (await call<{ companyId: string; connectionId: string; purge: boolean }, { ok: boolean; revoked: boolean }>("quickbooksDisconnect")({ companyId, connectionId, purge })).data;
}

export async function accountingSetMode(companyId: string, connectionId: string, mode: AccountingMode, writeBoundaryDate = "", writeUntilDate = "") {
  return (await call<{ companyId: string; connectionId: string; mode: AccountingMode; writeBoundaryDate: string; writeUntilDate: string }, { ok: boolean; connections: AccountingConnection[] }>("accountingSetMode")({ companyId, connectionId, mode, writeBoundaryDate, writeUntilDate })).data;
}

export async function accountingPlanMigration(companyId: string, connectionId: string, boundaryDate: string) {
  return (await call<{ companyId: string; connectionId: string; boundaryDate: string }, { ok: boolean; boundaryDate: string; pandleUntil: string; connections: AccountingConnection[] }>("accountingPlanMigration")({ companyId, connectionId, boundaryDate })).data;
}

export type MappingsPatch = {
  accounts?: Record<string, string>;
  taxes?: Record<string, string>;
  policies?: { sources?: Record<string, string>; bespoke?: string; inventory?: string; estimatesToQuickBooks?: boolean; estimatesToProvider?: boolean; effectiveFrom?: string };
  checklist?: Record<string, boolean>;
};

export async function accountingSaveMappings(companyId: string, connectionId: string, patch: MappingsPatch) {
  return (await call<{ companyId: string; connectionId: string } & MappingsPatch, { ok: boolean; mappings: AccountingMappings | null }>("accountingSaveMappings")({ companyId, connectionId, ...patch })).data;
}

export async function accountingMappingSuggestions(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, MappingSuggestions>("accountingMappingSuggestions")({ companyId, connectionId })).data;
}

export async function accountingOverview(companyId: string) {
  return (await call<{ companyId: string }, AccountingOverview>("accountingOverview")({ companyId })).data;
}

export async function accountingAttentionResolve(companyId: string, id: string, action: "resolve" | "ignore", reason = "") {
  return (await call<{ companyId: string; id: string; action: string; reason: string }, { ok: boolean }>("accountingAttentionResolve")({ companyId, id, action, reason })).data;
}

export async function accountingSyncActivity(companyId: string, limit = 60, connectionId = "") {
  return (await call<{ companyId: string; limit: number; connectionId: string }, SyncActivity>("accountingSyncActivity")({ companyId, limit, connectionId })).data;
}

// ---- Xero -------------------------------------------------------------------
export async function getAccountingConnections(companyId: string, provider: AccountingProvider): Promise<AccountingConnection[]> {
  const snap = await getDocs(collection(db, "companies", companyId, "accountingConnections"));
  return snap.docs
    .map((row) => ({ connectionId: row.id, ...(row.data() as Omit<AccountingConnection, "connectionId">) }))
    .filter((row) => row.provider === provider);
}

export async function xeroConnectStart(companyId: string, scopeLevel: XeroScopeLevel = "read") {
  return (await call<{ companyId: string; scopeLevel: XeroScopeLevel }, { ok: boolean; state: string; scopeLevel: string; scopes: string[]; authorizeUrl: string }>("xeroConnectStart")({ companyId, scopeLevel })).data;
}

/** After a consent that covered several organisations: the names to choose from (tokens stay on the server). */
export async function xeroListTenants(companyId: string, state: string) {
  return (await call<{ companyId: string; state: string }, { ok: boolean; tenants: XeroTenant[]; expiresAtMs: number }>("xeroListTenants")({ companyId, state })).data;
}

export async function xeroSelectTenant(companyId: string, state: string, tenantId: string) {
  return (await call<{ companyId: string; state: string; tenantId: string }, { ok: boolean; connectionId: string }>("xeroSelectTenant")({ companyId, state, tenantId })).data;
}

export async function xeroSyncNow(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, { ok: boolean; counts: Record<string, number>; reconcile: Record<string, number | string> }>("xeroSyncNow")({ companyId, connectionId })).data;
}

export async function xeroDisconnect(companyId: string, connectionId: string, purge = false) {
  return (await call<{ companyId: string; connectionId: string; purge: boolean }, { ok: boolean; revoked: boolean; removed: boolean }>("xeroDisconnect")({ companyId, connectionId, purge })).data;
}

/** The NivaDesk events an accountant maps to provider accounts (mirror of functions/accounting/core/adapter.js). */
export const ACCOUNT_MAPPING_KEYS: { key: string; label: string; kind: string }[] = [
  { key: "product_sales", label: "Product sales", kind: "income" },
  { key: "bespoke_service", label: "Bespoke service", kind: "income" },
  { key: "shipping_income", label: "Shipping charged", kind: "income" },
  { key: "discounts", label: "Discounts", kind: "income" },
  { key: "refunds", label: "Refunds", kind: "income" },
  { key: "paypal_fees", label: "PayPal fees", kind: "expense" },
  { key: "square_fees", label: "Square fees", kind: "expense" },
  { key: "etsy_fees", label: "Etsy fees", kind: "expense" },
  { key: "shopify_fees", label: "Shopify fees", kind: "expense" },
  { key: "materials_purchase", label: "Materials purchase", kind: "expense_or_asset" },
  { key: "inventory_asset", label: "Inventory value", kind: "asset" },
  { key: "cogs", label: "Cost of goods sold", kind: "cogs" },
  { key: "clearing_paypal", label: "PayPal clearing", kind: "clearing" },
  { key: "clearing_square", label: "Square clearing", kind: "clearing" },
  { key: "clearing_shopify_payments", label: "Shopify Payments clearing", kind: "clearing" },
  { key: "clearing_etsy_payments", label: "Etsy Payments clearing", kind: "clearing" },
];

export const TAX_MAPPING_KEYS: { key: string; label: string }[] = [
  { key: "ST", label: "Standard rate" },
  { key: "RR", label: "Reduced rate" },
  { key: "ZR", label: "Zero rated" },
  { key: "EX", label: "Exempt" },
  { key: "OS", label: "Out of scope" },
  { key: "NR", label: "Not registered" },
  { key: "RC", label: "Reverse charge" },
  { key: "NV", label: "No VAT" },
];

export const SALES_SOURCES: { key: string; label: string }[] = [
  { key: "manual", label: "NivaDesk orders (manual, Instagram, bespoke)" },
  { key: "shopify", label: "Shopify" },
  { key: "etsy", label: "Etsy" },
  { key: "woocommerce", label: "WooCommerce" },
  { key: "square", label: "Square" },
  { key: "inbound", label: "Inbound webhook orders" },
];

export const POSTING_MODES: { key: string; label: string }[] = [
  { key: "detailed", label: "Detailed — one document per order" },
  { key: "daily_summary", label: "Daily summary — one per channel and day" },
  { key: "payout_summary", label: "Payout summary — one per settlement" },
  { key: "disabled", label: "Disabled — tracked in NivaDesk only" },
];

"use strict";

// The accounting connector contract (REQ-ARCH-001). Everything an accounting
// provider can be asked to do is declared here once, so the engine, the
// callables and the UI never branch on "if provider === quickbooks". A provider
// is an accounting writer, not a sales channel: it never appears in
// functions/commerce/envelope.js PROVIDERS.

const PROVIDERS = Object.freeze({
  quickbooks_online: { displayName: "QuickBooks Online", connectionModel: "oauth", conflictStrategy: "sync_token" },
  xero: { displayName: "Xero", connectionModel: "oauth", conflictStrategy: "updated_date_and_hash" },
  pandle: { displayName: "Pandle", connectionModel: "oauth", conflictStrategy: "none" }
});

// REQ-ARCH-002 — one primary writer per company and period.
const CONNECTION_MODES = Object.freeze(["primary_write", "shadow_read", "migration_read", "disabled"]);

// §16 — the posting state machine. UI labels live with the clients.
const POSTING_STATES = Object.freeze([
  "draft", "ready", "approved", "queued", "synced", "retry", "needs_attention", "reconciled", "conflict", "ignored"
]);
const POSTING_TRANSITIONS = Object.freeze({
  draft: ["ready", "ignored"],
  ready: ["approved", "draft", "ignored"],
  approved: ["queued", "ready", "ignored"],
  queued: ["synced", "retry", "needs_attention"],
  retry: ["queued", "needs_attention", "ignored"],
  synced: ["reconciled", "conflict"],
  conflict: ["reconciled", "needs_attention"],
  needs_attention: ["queued", "ready", "ignored"],
  reconciled: ["conflict"],
  ignored: []
});
function canTransition(from, to) {
  return Array.isArray(POSTING_TRANSITIONS[from]) && POSTING_TRANSITIONS[from].includes(to);
}

// §8 — how a posted document stands against the provider's own bank feed.
const BANK_MATCH_STATUSES = Object.freeze([
  "not_applicable", "awaiting_bank_transaction", "awaiting_match_in_quickbooks", "awaiting_reconciliation_in_provider", "matched", "mismatch", "unknown_api_limitation"
]);

// §4.2 step 5 — how each sales source reaches the ledger.
const POSTING_MODES = Object.freeze(["detailed", "daily_summary", "payout_summary", "disabled"]);
const SALES_SOURCES = Object.freeze(["manual", "shopify", "etsy", "woocommerce", "square", "inbound"]);
const BESPOKE_POLICIES = Object.freeze(["milestone_invoices", "single_invoice_partial_payments"]);
const INVENTORY_POLICIES = Object.freeze(["purchases_expensed", "inventory_asset_cogs"]);

// §4.2 step 6 — the NivaDesk events an accountant maps to accounts. Keys are
// NivaDesk's; the provider's account id is only ever looked up at posting time.
const ACCOUNT_MAPPING_KEYS = Object.freeze([
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
  { key: "clearing_etsy_payments", label: "Etsy Payments clearing", kind: "clearing" }
]);

// The VAT behaviours NivaDesk stores on a transaction (bankFeed BANK_VAT_CODES),
// each of which must resolve to one provider tax code before anything posts.
const TAX_MAPPING_KEYS = Object.freeze([
  { key: "ST", label: "Standard rate" },
  { key: "RR", label: "Reduced rate" },
  { key: "ZR", label: "Zero rated" },
  { key: "EX", label: "Exempt" },
  { key: "OS", label: "Out of scope" },
  { key: "NR", label: "Not registered" },
  { key: "RC", label: "Reverse charge" },
  { key: "NV", label: "No VAT" }
]);

// §17 — the capability registry. Recomputed on connect from the company's own
// answers; the UI hides or explains what a connection cannot do.
function defaultCapabilities(provider) {
  if (provider === "quickbooks_online") {
    return {
      provider,
      invoices: { read: true, write: true },
      payments: { read: true, write: true },
      estimates: { read: true, write: true },
      salesReceipts: { read: true, write: true },
      creditMemos: { read: true, write: true },
      bills: { read: true, write: true },
      purchases: { read: true, write: true },
      purchaseOrders: { read: true, write: "verify_plan_and_company" },
      vendorCredits: { read: true, write: true },
      attachments: { write: true },
      journals: { read: true, write: true },
      transfers: { read: true, write: true },
      taxCodes: { read: true },
      accounts: { read: true },
      customers: { read: true, write: true },
      vendors: { read: true, write: true },
      items: { read: true, write: "mapping_only" },
      multiCurrency: { enabled: false },
      webhooks: true,
      cdc: true,
      // §8: the public Accounting API does not hand third parties the Banking
      // screen's For Review rows. Never assumed, never faked.
      bankFeedPendingRows: { read: false, write: false },
      bankFeedMatchWrite: false
    };
  }
  if (provider === "xero") {
    // Xero spec §20 / §4 / §14.1: no unreconciled bank lines through the public
    // API, webhooks only for contacts, invoices, credit notes, overpayments and
    // prepayments, the full Journals feed a premium tier NivaDesk does not hold,
    // ManualJournals a scope and plan question answered per organisation.
    return {
      provider,
      invoices: { read: true, write: true },
      payments: { read: true, write: true },
      estimates: { read: true, write: true },
      salesReceipts: { read: false, write: false },
      creditMemos: { read: true, write: true },
      bills: { read: true, write: true },
      purchases: { read: true, write: true },
      purchaseOrders: { read: true, write: true },
      vendorCredits: { read: true, write: true },
      attachments: { write: true },
      journals: { read: false, write: "verify_scope_and_plan", manualWrite: "verify", fullJournalRead: false },
      transfers: { read: true, write: true },
      taxCodes: { read: true },
      accounts: { read: true },
      customers: { read: true, write: true },
      vendors: { read: true, write: true },
      items: { read: true, write: "mapping_only" },
      multiCurrency: { enabled: false },
      webhooks: { contacts: true, invoices: true, creditNotes: true, overpayments: true, prepayments: true, payments: false, bankTransactions: false, items: false, accounts: false },
      cdc: false,
      incrementalSync: "if_modified_since",
      bankFeedPendingRows: { read: false, write: false },
      bankFeedMatchWrite: false,
      reconciledBankTransactionsRead: true,
      bankTransactionsWrite: true,
      bankTransfersWrite: true,
      scopes: { granted: [], level: "read" }
    };
  }
  if (provider === "pandle") {
    return {
      provider,
      invoices: { read: false, write: false },
      payments: { read: false, write: false },
      estimates: { read: false, write: false },
      salesReceipts: { read: false, write: false },
      creditMemos: { read: false, write: false },
      bills: { read: false, write: false },
      purchases: { read: false, write: false },
      purchaseOrders: { read: false, write: false },
      vendorCredits: { read: false, write: false },
      attachments: { write: false },
      journals: { read: false, write: false },
      transfers: { read: false, write: false },
      taxCodes: { read: true },
      accounts: { read: true },
      customers: { read: false, write: false },
      vendors: { read: false, write: false },
      items: { read: false, write: false },
      multiCurrency: { enabled: false },
      webhooks: false,
      cdc: false,
      // Pandle's bridge confirms rows already waiting in its own bank feed —
      // a capability QuickBooks does not offer, and one that must not be
      // copied across (§8 "Pandle ile fark").
      bankFeedPendingRows: { read: true, write: true },
      bankFeedMatchWrite: true
    };
  }
  return { provider, webhooks: false, cdc: false, bankFeedPendingRows: { read: false, write: false }, bankFeedMatchWrite: false };
}

const ADAPTER_METHODS = Object.freeze([
  "connect", "disconnect", "getCapabilities", "getCompanyProfile", "getAccounts", "getTaxCodes",
  "getCustomers", "getVendors", "getItems", "previewPosting", "postDocument", "fetchEntity", "reconcile"
]);

function assertAdapter(adapter, provider = "") {
  const missing = ADAPTER_METHODS.filter((name) => typeof adapter?.[name] !== "function");
  if (missing.length) throw new Error(`accounting adapter ${provider || "?"} is missing: ${missing.join(", ")}`);
  return adapter;
}

module.exports = {
  PROVIDERS, CONNECTION_MODES, POSTING_STATES, POSTING_TRANSITIONS, canTransition, BANK_MATCH_STATUSES,
  POSTING_MODES, SALES_SOURCES, BESPOKE_POLICIES, INVENTORY_POLICIES, ACCOUNT_MAPPING_KEYS, TAX_MAPPING_KEYS,
  defaultCapabilities, ADAPTER_METHODS, assertAdapter
};

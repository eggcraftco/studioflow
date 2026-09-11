// §3.5 / ARCH-004 — what each provider can do, declared once, read by the UI
// and the engine instead of scattered `if (provider === "shopify")` branches.
// "coverage" on webhooks is the honest word for a provider that only tells us
// some of what changed (Etsy), which is why reconciliation is not optional.
// Two different questions live here, and confusing them is what made Sync Health
// claim products and stock were merely "never synced" for every provider:
//
//   * the entity blocks below say what the PROVIDER'S API offers — a protocol
//     fact the design documents rely on, true whether or not we use it;
//   * `implemented` says what THIS CODEBASE reads today. Nothing syncs a product
//     or a stock level for any provider (functions/orchestrator/inventory.js:6-17
//     says the same), so those entities are unsupported, not merely stale.
//
// Whether a connector is switched on (functions/commerce/flags.js), whether the
// seller granted the scope (connectionCapabilities.js, proven per connection)
// and whether the connection is healthy (health.js) stay separate questions.
const REGISTRY = Object.freeze({
  shopify: {
    display_name: "Shopify",
    // What this codebase reads today (see the note above the registry).
    implemented: Object.freeze({ orders: true, products: false, inventory: false, finance: false }),
    connection_model: "official_app",
    orders: { read: true, write: false, reconcile: true },
    products: { read: true, write: false },
    inventory: { read: true, write: false },
    customers: { read: true, write: false },
    payments: { read: true },
    refunds: { read: true, write: false },
    shipments: { read: true, write: false },
    financial_ledger: { read: false },
    webhooks: { supported: true, coverage: "full", signature: "hmac_sha256_raw_body" }
  },
  etsy: {
    display_name: "Etsy",
    // What this codebase reads today (see the note above the registry).
    implemented: Object.freeze({ orders: true, products: false, inventory: false, finance: false }),
    connection_model: "oauth",
    orders: { read: true, write: false, reconcile: true },
    products: { read: true, write: false },
    inventory: { read: true, write: false },
    customers: { read: "partial", write: false },
    payments: { read: true },
    refunds: { read: true, write: false },
    shipments: { read: true, write: false },
    financial_ledger: { read: false },
    webhooks: { supported: true, coverage: "partial", signature: "standard_webhooks" }
  },
  woocommerce: {
    display_name: "WooCommerce",
    // What this codebase reads today (see the note above the registry).
    implemented: Object.freeze({ orders: true, products: false, inventory: false, finance: false }),
    connection_model: "wc_auth",
    orders: { read: true, write: false, reconcile: true },
    products: { read: true, write: false },
    inventory: { read: true, write: false },
    customers: { read: "partial", write: false },
    payments: { read: "partial" },
    refunds: { read: true, write: false },
    shipments: { read: "partial", write: false },
    financial_ledger: { read: false },
    webhooks: { supported: true, coverage: "full", signature: "hmac_sha256_raw_body" }
  },
  square: {
    display_name: "Square",
    // What this codebase reads today (see the note above the registry).
    implemented: Object.freeze({ orders: true, products: false, inventory: false, finance: true }),
    connection_model: "oauth",
    orders: { read: true, write: false, reconcile: true },
    products: { read: true, write: false },
    inventory: { read: true, write: false },
    customers: { read: true, write: false },
    payments: { read: true },
    refunds: { read: true, write: false },
    shipments: { read: true, write: false },
    financial_ledger: { read: true },
    payouts: { read: true, reconcile: true },
    locations: { read: true },
    webhooks: { supported: true, coverage: "full", signature: "hmac_sha256_url_and_raw_body" },
    events_api_recovery: { supported: true, window_days: 28 }
  },
  // The two marketplaces. Both are declared before either can be connected,
  // because the difference between a marketplace and a shop is not a detail
  // the rest of the system can discover for itself: the seller does not own
  // the buyer relationship, the tax may not be the seller's to declare, and
  // some of the stock is not on the seller's own shelf.
  amazon: {
    display_name: "Amazon",
    // What this codebase reads today (see the note above the registry).
    implemented: Object.freeze({ orders: true, products: false, inventory: false, finance: false }),
    connection_model: "sp_api_oauth",
    marketplace: true,
    orders: { read: true, write: false, reconcile: true },
    products: { read: true, write: "role_dependent" },
    // FBA stock is Amazon's and is never written; the merchant's own shelf is.
    inventory: { read: true, write: "merchant_fulfilled_only" },
    // Buyer name and address exist only with restricted-data approval, and may
    // be redacted per order even then.
    customers: { read: "restricted", write: false },
    payments: { read: false },
    refunds: { read: "partial", write: false },
    shipments: { read: true, write: "validate_contract" },
    financial_ledger: { read: true },
    payouts: { read: true, reconcile: true },
    // Amazon's tax may be collected and remitted by Amazon itself, per order.
    tax_responsibility: { read: true, per_order: true },
    webhooks: { supported: true, coverage: "subscription_defined", signature: "sns_message_signature" }
  },
  ebay: {
    display_name: "eBay",
    // What this codebase reads today (see the note above the registry).
    implemented: Object.freeze({ orders: true, products: false, inventory: false, finance: false }),
    connection_model: "oauth",
    marketplace: true,
    orders: { read: true, write: false, reconcile: true },
    products: { read: true, write: "managed_listing_only" },
    inventory: { read: true, write: "managed_listing_only" },
    // eBay gives a username and a masked relay address, not a durable customer.
    customers: { read: "partial", write: false },
    payments: { read: true },
    refunds: { read: true, write: "permission_dependent" },
    shipments: { read: true, write: true },
    financial_ledger: { read: true },
    payouts: { read: true, reconcile: true },
    // eBay states per tax line whether it collected and remits the tax itself.
    tax_responsibility: { read: true, per_order: true },
    webhooks: { supported: true, coverage: "subscription_defined", signature: "ebay_notification_signature" }
  },
  inbound: {
    display_name: "Website",
    // What this codebase reads today (see the note above the registry).
    implemented: Object.freeze({ orders: true, products: false, inventory: false, finance: false }),
    connection_model: "token",
    orders: { read: true, write: false, reconcile: false },
    products: { read: false, write: false },
    inventory: { read: false, write: false },
    customers: { read: "partial", write: false },
    payments: { read: false },
    refunds: { read: false, write: false },
    shipments: { read: false, write: false },
    financial_ledger: { read: false },
    webhooks: { supported: true, coverage: "sender_defined", signature: "token_in_url" }
  }
});

function getCapabilities(provider) {
  const entry = REGISTRY[String(provider || "")];
  return entry ? { provider, ...JSON.parse(JSON.stringify(entry)) } : null;
}

function listProviders() { return Object.keys(REGISTRY); }

module.exports = { getCapabilities, listProviders, CAPABILITY_REGISTRY: REGISTRY };

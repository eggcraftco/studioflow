// §3.5 / ARCH-004 — what each provider can do, declared once, read by the UI
// and the engine instead of scattered `if (provider === "shopify")` branches.
// "coverage" on webhooks is the honest word for a provider that only tells us
// some of what changed (Etsy), which is why reconciliation is not optional.
const REGISTRY = Object.freeze({
  shopify: {
    display_name: "Shopify",
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
    connection_model: "planned",
    orders: { read: false, write: false, reconcile: false },
    products: { read: false, write: false },
    inventory: { read: false, write: false },
    customers: { read: false, write: false },
    payments: { read: false },
    refunds: { read: false, write: false },
    shipments: { read: false, write: false },
    financial_ledger: { read: false },
    webhooks: { supported: false, coverage: "none", signature: null }
  },
  inbound: {
    display_name: "Website",
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

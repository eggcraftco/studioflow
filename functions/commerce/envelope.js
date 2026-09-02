// §4.1 — the canonical order envelope every mapper produces (schema_version 1).
//
// Identity is `provider + connection_id + entity_type + external_id`
// (DATA-001/002): the same Shopify order id from two stores is two entities.
// The envelope is what the engine applies, what shadow mode compares, and
// what a retry or reconciliation re-derives — MERGE-006 says all four paths
// must agree, and they can only agree on something this explicit.
const crypto = require("crypto");
const { toDecimalString, normalizeCurrency } = require("./money");

const SCHEMA_VERSION = 1;
const PROVIDERS = new Set(["shopify", "etsy", "woocommerce", "inbound"]);
const ENTITY_TYPES = new Set(["order"]);
const EVENT_ORIGINS = new Set(["provider", "import", "reconcile", "retry", "manual"]);
const PAYMENT_STATUSES = new Set(["unpaid", "pending", "authorized", "paid", "partially_paid", "partially_refunded", "refunded", "voided", "unknown"]);
const FULFILLMENT_STATUSES = new Set(["unfulfilled", "partial", "fulfilled", "unknown"]);

function safeIdPart(value) {
  return String(value || "").trim().replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 200);
}

function identityKey(identity) {
  return [identity.provider, identity.connection_id, identity.entity_type, identity.external_id].map((v) => String(v || "")).join("|");
}

/** A Firestore-safe document id for the identity — the unique constraint DATA-001 asks for. */
function identityDocId(identity) {
  return [identity.provider, identity.connection_id, identity.entity_type, identity.external_id].map(safeIdPart).join("__");
}

function isoOrNull(value) {
  if (!value) return null;
  const ms = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function lineItem(raw) {
  const quantity = Math.max(1, Math.round(Number(raw?.quantity) || 1));
  return {
    external_line_id: raw?.external_line_id ? String(raw.external_line_id) : null,
    sku: raw?.sku ? String(raw.sku).slice(0, 120) : null,
    title: String(raw?.title || "").slice(0, 300),
    quantity,
    unit_price: toDecimalString(raw?.unit_price),
    line_total: toDecimalString(raw?.line_total),
    product_external_id: raw?.product_external_id ? String(raw.product_external_id) : null,
    properties: Array.isArray(raw?.properties) ? raw.properties.map((p) => ({ name: String(p?.name || "").slice(0, 120), value: String(p?.value || "").slice(0, 500) })) : []
  };
}

function buildEnvelope(input) {
  const identity = {
    provider: String(input.identity?.provider || ""),
    connection_id: String(input.identity?.connection_id || ""),
    marketplace_id: input.identity?.marketplace_id ? String(input.identity.marketplace_id) : null,
    entity_type: String(input.identity?.entity_type || "order"),
    external_id: String(input.identity?.external_id || ""),
    external_updated_at: isoOrNull(input.identity?.external_updated_at),
    event_origin: String(input.identity?.event_origin || "provider")
  };
  const order = input.order || {};
  const customer = input.customer || {};
  return {
    schema_version: SCHEMA_VERSION,
    identity,
    order: {
      order_source: String(order.order_source || identity.provider),
      sales_channel: String(order.sales_channel || identity.provider),
      currency: normalizeCurrency(order.currency),
      subtotal: toDecimalString(order.subtotal),
      discount_total: toDecimalString(order.discount_total),
      tax_total: toDecimalString(order.tax_total),
      shipping_total: toDecimalString(order.shipping_total),
      grand_total: toDecimalString(order.grand_total),
      platform_status: order.platform_status ? String(order.platform_status) : null,
      payment_status: PAYMENT_STATUSES.has(order.payment_status) ? order.payment_status : "unknown",
      fulfillment_status: FULFILLMENT_STATUSES.has(order.fulfillment_status) ? order.fulfillment_status : "unknown",
      cancelled_at: isoOrNull(order.cancelled_at),
      placed_at: isoOrNull(order.placed_at),
      buyer_note: order.buyer_note ? String(order.buyer_note).slice(0, 4000) : null,
      is_test: order.is_test === true,
      line_items: (order.line_items || []).map(lineItem)
    },
    customer: {
      external_customer_id: customer.external_customer_id ? String(customer.external_customer_id) : null,
      name: customer.name ? String(customer.name).slice(0, 200) : null,
      email: customer.email ? String(customer.email).trim().toLowerCase().slice(0, 200) : null,
      phone: customer.phone ? String(customer.phone).slice(0, 40) : null,
      identity_confidence: customer.external_customer_id ? "external_id" : (customer.email ? "email" : (customer.name ? "name" : "none")),
      billing_address: customer.billing_address || null,
      shipping_address: customer.shipping_address || null
    },
    payments: (input.payments || []).map((p) => ({ external_id: p.external_id ? String(p.external_id) : null, provider: p.provider ? String(p.provider) : null, amount: toDecimalString(p.amount), currency: normalizeCurrency(p.currency || order.currency), status: String(p.status || "unknown"), at: isoOrNull(p.at) })),
    refunds: (input.refunds || []).map((r) => ({ external_id: r.external_id ? String(r.external_id) : null, amount: toDecimalString(r.amount), currency: normalizeCurrency(r.currency || order.currency), reason: r.reason ? String(r.reason).slice(0, 300) : null, at: isoOrNull(r.at) })),
    shipments: (input.shipments || []).map((s) => ({ external_id: s.external_id ? String(s.external_id) : null, carrier: s.carrier ? String(s.carrier).slice(0, 120) : null, tracking_number: s.tracking_number ? String(s.tracking_number).slice(0, 120) : null, tracking_url: s.tracking_url ? String(s.tracking_url).slice(0, 500) : null, status: String(s.status || "unknown"), at: isoOrNull(s.at) })),
    source: {
      provider_display_name: String(input.source?.provider_display_name || ""),
      connection_display_name: String(input.source?.connection_display_name || ""),
      external_admin_url: input.source?.external_admin_url ? String(input.source.external_admin_url) : null,
      // DATA-009: provider-specific detail stays here, versioned, never in the canonical columns.
      provider_metadata: input.source?.provider_metadata && typeof input.source.provider_metadata === "object" ? input.source.provider_metadata : {}
    },
    review: {
      required: Boolean(input.review?.required) || (input.review?.reasons || []).length > 0,
      reasons: Array.from(new Set((input.review?.reasons || []).map((r) => String(r))))
    },
    raw_snapshot_ref: input.raw_snapshot_ref ? String(input.raw_snapshot_ref) : null
  };
}

/** Problems that make an envelope unusable; an empty list means "apply it". */
function validateEnvelope(envelope) {
  const problems = [];
  const id = envelope?.identity || {};
  if (envelope?.schema_version !== SCHEMA_VERSION) problems.push("schema_version");
  if (!PROVIDERS.has(id.provider)) problems.push("identity.provider");
  if (!id.connection_id) problems.push("identity.connection_id");
  if (!ENTITY_TYPES.has(id.entity_type)) problems.push("identity.entity_type");
  if (!id.external_id) problems.push("identity.external_id");
  if (!EVENT_ORIGINS.has(id.event_origin)) problems.push("identity.event_origin");
  if (!envelope?.order) problems.push("order");
  else {
    if (envelope.order.currency === null && envelope.order.grand_total !== null) problems.push("order.currency");
    if (!Array.isArray(envelope.order.line_items)) problems.push("order.line_items");
  }
  return problems;
}

/** SYNC-016 — a stable hash of what the provider said, so a resend with nothing new is a no-op. */
function contentHash(envelope) {
  const material = {
    order: envelope.order, customer: envelope.customer, payments: envelope.payments,
    refunds: envelope.refunds, shipments: envelope.shipments,
    external_updated_at: envelope.identity?.external_updated_at || null
  };
  return crypto.createHash("sha256").update(stableStringify(material)).digest("hex").slice(0, 32);
}

function stableStringify(value) {
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
  }
  return JSON.stringify(value === undefined ? null : value);
}

module.exports = { SCHEMA_VERSION, PROVIDERS, buildEnvelope, validateEnvelope, identityKey, identityDocId, contentHash, stableStringify, safeIdPart, isoOrNull };

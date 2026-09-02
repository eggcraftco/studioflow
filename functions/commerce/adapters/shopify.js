// The Shopify adapter: a REST-shaped order (a webhook payload, or a GraphQL
// node put through shopifyGraphQLOrderToRest) → the canonical envelope.
// ARCH-003: everything Shopify-specific about reading an order lives here;
// the engine never sees a `financial_status`.
const { buildEnvelope, isoOrNull } = require("../envelope");
const { toDecimalString, sumDecimal } = require("../money");

const PAYMENT_STATUS = {
  paid: "paid", pending: "pending", authorized: "authorized", partially_paid: "partially_paid",
  partially_refunded: "partially_refunded", refunded: "refunded", voided: "voided", unpaid: "unpaid"
};
const FULFILLMENT_STATUS = { fulfilled: "fulfilled", partial: "partial", unfulfilled: "unfulfilled", restocked: "unknown" };

const text = (value) => (value === undefined || value === null ? "" : String(value).trim());

function phoneOf(order) {
  return text(order?.phone || order?.customer?.phone || order?.billing_address?.phone || order?.shipping_address?.phone || "").replace(/\s+/g, " ");
}

function addressParts(addr) {
  if (!addr) return null;
  const a = addr;
  return {
    name: text(a.name) || [text(a.first_name), text(a.last_name)].filter(Boolean).join(" "),
    street: [text(a.address1), text(a.address2)].filter(Boolean).join(", "),
    city: text(a.city),
    state: text(a.province),
    postalCode: text(a.zip),
    country: text(a.country) || text(a.country_code),
    phone: text(a.phone)
  };
}

function customerName(order) {
  const customer = order?.customer || {};
  const fromCustomer = [text(customer.first_name), text(customer.last_name)].filter(Boolean).join(" ");
  if (fromCustomer) return fromCustomer;
  const billing = order?.billing_address || {};
  return text(billing.name) || [text(billing.first_name), text(billing.last_name)].filter(Boolean).join(" ") || text(billing.company) || null;
}

function shippingTotal(order) {
  const fromSet = order?.total_shipping_price_set?.shop_money?.amount;
  if (fromSet !== undefined && fromSet !== null) return fromSet;
  const lines = Array.isArray(order?.shipping_lines) ? order.shipping_lines : [];
  return lines.length ? sumDecimal(lines.map((line) => line?.price)) : null;
}

function refundAmount(refund) {
  const transactions = Array.isArray(refund?.transactions) ? refund.transactions : [];
  if (transactions.length) return sumDecimal(transactions.map((t) => t?.amount));
  const lines = Array.isArray(refund?.refund_line_items) ? refund.refund_line_items : [];
  return lines.length ? sumDecimal(lines.map((li) => li?.subtotal)) : null;
}

/**
 * @param order  REST-shaped Shopify order
 * @param ctx    { shop, shopName, eventOrigin, rawSnapshotRef }
 */
function normalizeShopifyOrder(order, ctx = {}) {
  const shop = text(ctx.shop);
  const externalId = text(order?.id || order?.order_number || order?.name);
  const financial = text(order?.financial_status).toLowerCase();
  const fulfillment = text(order?.fulfillment_status).toLowerCase();
  const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];
  const gateways = Array.isArray(order?.payment_gateway_names) ? order.payment_gateway_names.map(text).filter(Boolean) : [];
  const reasons = [];
  if (order?.test === true) reasons.push("test_order");
  if (!lineItems.length) reasons.push("no_line_items");
  if (toDecimalString(order?.total_price) === null) reasons.push("missing_total");
  if (!externalId) reasons.push("missing_external_id");

  return buildEnvelope({
    identity: {
      provider: "shopify",
      connection_id: shop,
      entity_type: "order",
      external_id: externalId,
      external_updated_at: order?.updated_at || order?.processed_at || order?.created_at || null,
      event_origin: ctx.eventOrigin || "provider"
    },
    order: {
      order_source: "shopify",
      sales_channel: text(order?.source_name) || "shopify",
      currency: order?.currency || order?.presentment_currency,
      subtotal: order?.subtotal_price,
      discount_total: order?.total_discounts,
      tax_total: order?.total_tax,
      shipping_total: shippingTotal(order),
      grand_total: order?.total_price,
      platform_status: order?.cancelled_at ? "cancelled" : (financial || null),
      payment_status: PAYMENT_STATUS[financial] || "unknown",
      fulfillment_status: fulfillment ? (FULFILLMENT_STATUS[fulfillment] || "unknown") : "unfulfilled",
      cancelled_at: order?.cancelled_at || null,
      placed_at: order?.created_at || order?.processed_at || null,
      buyer_note: text(order?.note) || null,
      is_test: order?.test === true,
      line_items: lineItems.map((item) => ({
        external_line_id: item?.id ? String(item.id) : null,
        sku: text(item?.sku) || null,
        title: text(item?.title || item?.name) || "Product",
        quantity: item?.quantity,
        unit_price: item?.price,
        line_total: item?.price !== undefined && item?.price !== null ? Number(item.price) * Math.max(1, Math.round(Number(item?.quantity) || 1)) : null,
        product_external_id: item?.product_id ? String(item.product_id) : null,
        properties: Array.isArray(item?.properties) ? item.properties : []
      }))
    },
    customer: {
      external_customer_id: order?.customer?.id ? String(order.customer.id) : null,
      name: customerName(order),
      email: text(order?.email || order?.customer?.email || order?.contact_email) || null,
      phone: phoneOf(order) || null,
      billing_address: addressParts(order?.billing_address),
      shipping_address: addressParts(order?.shipping_address)
    },
    payments: [],   // a Shopify order payload carries gateway names, not transactions; MERGE-004 says do not invent them
    refunds: (Array.isArray(order?.refunds) ? order.refunds : []).map((refund) => ({
      external_id: refund?.id ? String(refund.id) : null, amount: refundAmount(refund), currency: order?.currency, reason: text(refund?.note) || null, at: refund?.created_at || refund?.processed_at || null
    })),
    shipments: (Array.isArray(order?.fulfillments) ? order.fulfillments : []).map((f) => ({
      external_id: f?.id ? String(f.id) : null, carrier: text(f?.tracking_company) || null,
      tracking_number: text(f?.tracking_number || (Array.isArray(f?.tracking_numbers) ? f.tracking_numbers[0] : "")) || null,
      tracking_url: text(f?.tracking_url || (Array.isArray(f?.tracking_urls) ? f.tracking_urls[0] : "")) || null,
      status: text(f?.status || f?.shipment_status) || "unknown", at: f?.created_at || f?.updated_at || null
    })),
    source: {
      provider_display_name: "Shopify",
      connection_display_name: text(ctx.shopName) || shop,
      external_admin_url: shop && externalId ? `https://${shop}/admin/orders/${externalId}` : null,
      provider_metadata: {
        version: 1,
        order_number: text(order?.name || order?.order_number || order?.number) || externalId,
        payment_method: gateways.join(", ") || text(order?.gateway),
        order_status_url: text(order?.order_status_url),
        created_at_raw: text(order?.created_at),
        tags: text(order?.tags),
        custom_fields: { "Shopify Store": text(ctx.shopName) || shop, "Shopify Domain": shop }
      }
    },
    review: { reasons },
    raw_snapshot_ref: ctx.rawSnapshotRef || null
  });
}

module.exports = { normalizeShopifyOrder, addressParts, customerName, isoOrNull };

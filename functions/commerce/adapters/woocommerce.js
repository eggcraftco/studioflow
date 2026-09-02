// The WooCommerce adapter: a wc/v3 REST order → the canonical envelope.
// Woo's money is a decimal string, its GMT dates carry no "Z", its paid-ness
// is a status word, and its custom fields live in meta_data — all of that is
// resolved here (ARCH-003) and nowhere else. The document formats the legacy
// mapper wrote (custom field keys, "Name xN" summaries, meta-driven design
// name and delivery days) are handed over through provider_metadata so the
// projection writes the same order four clients already render.
const { buildEnvelope } = require("../envelope");
const { toDecimalString, sumDecimal } = require("../money");

const text = (v, max = 500) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));
const PAID_STATUSES = new Set(["processing", "completed"]);
const PAYMENT_STATUS = { pending: "pending", "on-hold": "pending", processing: "paid", completed: "paid", cancelled: "voided", refunded: "refunded", failed: "unpaid", draft: "unpaid", "checkout-draft": "unpaid" };

/** Woo's GMT timestamps come without a zone; the local ones carry the store's offset only implicitly. */
function wooGmtIso(gmt, local) {
  const raw = text(gmt) || text(local);
  if (!raw) return null;
  const withZone = /[Zz]|[+-]\d\d:\d\d$/.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(withZone);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function metaValue(order, keys) {
  const meta = Array.isArray(order?.meta_data) ? order.meta_data : [];
  for (const key of keys) {
    const found = meta.find((item) => text(item?.key).toLowerCase() === String(key).toLowerCase());
    const value = text(found?.value, 1000);
    if (value) return value;
  }
  return "";
}

function addressParts(addr) {
  if (!addr || typeof addr !== "object") return null;
  const a = addr;
  const name = [text(a.first_name), text(a.last_name)].filter(Boolean).join(" ");
  return {
    name: name || text(a.company),
    street: [text(a.address_1), text(a.address_2)].filter(Boolean).join(", "),
    city: text(a.city), state: text(a.state), postalCode: text(a.postcode), country: text(a.country),
    phone: text(a.phone).replace(/\s+/g, " ")
  };
}

function addressLine(p) {
  if (!p) return "";
  const cityLine = [p.city, p.state].filter(Boolean).join(", ");
  return [p.street, cityLine, p.postalCode, p.country].filter(Boolean).join(", ");
}

function billingFullName(order) {
  const billing = order?.billing || {};
  const name = [text(billing.first_name), text(billing.last_name)].filter(Boolean).join(" ");
  return name || text(billing.company) || text(order?.customer_name) || null;
}

/** WooCommerce Shipment Tracking (and compatible plugins) keep tracking in meta. */
function shipmentsOf(order) {
  const meta = Array.isArray(order?.meta_data) ? order.meta_data : [];
  const items = meta.find((m) => text(m?.key) === "_wc_shipment_tracking_items");
  const rows = Array.isArray(items?.value) ? items.value : [];
  return rows.map((row) => ({
    external_id: text(row?.tracking_id) || null, carrier: text(row?.tracking_provider || row?.custom_tracking_provider) || null,
    tracking_number: text(row?.tracking_number) || null, tracking_url: text(row?.custom_tracking_link) || null,
    status: "shipped", at: row?.date_shipped ? new Date(Number(row.date_shipped) * 1000).toISOString() : null
  }));
}

/**
 * @param order  wc/v3 order
 * @param ctx    { connectionId, siteUrl, storeName, eventOrigin, rawSnapshotRef }
 */
function normalizeWooOrder(order, ctx = {}) {
  const externalId = text(order?.id || order?.number);
  const orderNumber = text(order?.number || order?.id) || externalId;
  const status = text(order?.status).toLowerCase();
  const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];
  const reasons = [];
  if (!lineItems.length) reasons.push("no_line_items");
  if (toDecimalString(order?.total) === null) reasons.push("missing_total");
  if (!externalId) reasons.push("missing_external_id");
  const billing = addressParts(order?.billing);
  const shipping = addressParts(order?.shipping);
  const paymentMethod = text(order?.payment_method_title || order?.payment_method, 120);
  const lineSummary = lineItems.map((item) => `${text(item?.name) || "Product"}${item?.quantity ? ` x${item.quantity}` : ""}`).filter(Boolean).join(", ");
  const designMeta = metaValue(order, ["designName", "design_name", "Design Name"]);
  const deliveryDays = Number(metaValue(order, ["studioflow_delivery_days"]));
  const shipments = shipmentsOf(order);
  const refunds = (Array.isArray(order?.refunds) ? order.refunds : []).map((r) => ({
    external_id: r?.id ? String(r.id) : null, amount: toDecimalString(Math.abs(Number(r?.total) || 0)), currency: order?.currency, reason: text(r?.reason, 300) || null, at: null
  }));
  const phone = text(order?.billing?.phone || order?.shipping?.phone || metaValue(order, ["phone", "telephone", "whatsapp", "WhatsApp"])).replace(/\s+/g, " ");

  return buildEnvelope({
    identity: {
      provider: "woocommerce", connection_id: text(ctx.connectionId, 200), entity_type: "order", external_id: externalId,
      external_updated_at: wooGmtIso(order?.date_modified_gmt, order?.date_modified) || wooGmtIso(order?.date_created_gmt, order?.date_created),
      event_origin: ctx.eventOrigin || "provider"
    },
    order: {
      order_source: "woocommerce", sales_channel: text(order?.created_via) || "woocommerce",
      currency: order?.currency,
      subtotal: sumDecimal(lineItems.map((li) => li?.subtotal)),
      discount_total: order?.discount_total, tax_total: order?.total_tax, shipping_total: order?.shipping_total, grand_total: order?.total,
      platform_status: status || null,
      payment_status: PAYMENT_STATUS[status] || (order?.date_paid ? "paid" : "unknown"),
      fulfillment_status: shipments.length ? "fulfilled" : (status === "completed" ? "fulfilled" : "unfulfilled"),
      cancelled_at: status === "cancelled" ? wooGmtIso(order?.date_modified_gmt, order?.date_modified) : null,
      placed_at: wooGmtIso(order?.date_paid_gmt, order?.date_paid) || wooGmtIso(order?.date_created_gmt, order?.date_created),
      buyer_note: text(order?.customer_note, 4000) || null,
      is_test: false,
      line_items: lineItems.map((item) => {
        const quantity = Math.max(1, Math.round(Number(item?.quantity) || 1));
        const lineTotal = sumDecimal([item?.total, item?.total_tax]);
        return {
          external_line_id: item?.id ? String(item.id) : null, sku: text(item?.sku, 120) || null, title: text(item?.name, 300) || "Product",
          quantity, unit_price: lineTotal === null ? null : (Number(lineTotal) / quantity), line_total: lineTotal,
          product_external_id: item?.variation_id ? `${item.product_id}:${item.variation_id}` : (item?.product_id ? String(item.product_id) : null),
          properties: (Array.isArray(item?.meta_data) ? item.meta_data : []).filter((m) => m && !String(m.key || "").startsWith("_")).map((m) => ({ name: text(m.display_key || m.key, 120), value: text(m.display_value || m.value, 500) }))
        };
      })
    },
    customer: {
      external_customer_id: Number(order?.customer_id) > 0 ? String(order.customer_id) : null,
      name: billingFullName(order),
      email: text(order?.billing?.email || order?.shipping?.email, 200).toLowerCase() || null,
      phone: phone || null,
      billing_address: billing, shipping_address: shipping
    },
    payments: order?.transaction_id ? [{ external_id: text(order.transaction_id), provider: paymentMethod || null, amount: PAID_STATUSES.has(status) ? order?.total : null, currency: order?.currency, status: PAID_STATUSES.has(status) ? "paid" : "unknown", at: wooGmtIso(order?.date_paid_gmt, order?.date_paid) }] : [],
    refunds,
    shipments,
    source: {
      provider_display_name: "WooCommerce",
      connection_display_name: text(ctx.storeName) || text(ctx.siteUrl),
      external_admin_url: ctx.siteUrl && externalId ? `${String(ctx.siteUrl).replace(/\/+$/, "")}/wp-admin/post.php?post=${externalId}&action=edit` : null,
      provider_metadata: {
        version: 1, order_number: orderNumber, payment_method: paymentMethod, created_at_raw: text(order?.date_created || order?.date_created_gmt),
        design_name: designMeta || lineSummary || text(lineItems[0]?.name) || `WooCommerce #${orderNumber}`,
        watch_ref: metaValue(order, ["watchRef", "watch_ref", "Watch Ref", "watch model"]) || text(lineItems[0]?.sku) || "",
        delivery_days: Number.isFinite(deliveryDays) && deliveryDays > 0 ? Math.min(Math.max(Math.round(deliveryDays), 1), 730) : null,
        order_status_url: text(order?.permalink || order?.url),
        custom_fields: {
          Source: "WooCommerce",
          "WooCommerce Order ID": externalId,
          "WooCommerce Order Number": orderNumber,
          "WooCommerce Status": status || "new",
          "WooCommerce Payment Method": paymentMethod,
          "WooCommerce Currency": text(order?.currency),
          "WooCommerce Total": text(order?.total),
          "WooCommerce Created At": text(order?.date_created || order?.date_created_gmt),
          "WooCommerce Products": lineSummary,
          communicationAddress: addressLine(billing)
        }
      }
    },
    review: { reasons },
    raw_snapshot_ref: ctx.rawSnapshotRef || null
  });
}

module.exports = { normalizeWooOrder, wooGmtIso, metaValue, addressParts, PAID_STATUSES, PAYMENT_STATUS };

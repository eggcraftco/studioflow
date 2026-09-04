// The Square adapter: a v2 Order → the canonical envelope (SQ-ORD-*).
// Square's money is minor-unit integers beside a currency (SQ-PAY-003), its
// timestamps are RFC 3339, its paid-ness is a set of tenders against a total,
// its buyer lives in a fulfillment recipient or a separate Customer record,
// and its sales come from POS, Online, Invoices or the API under one order
// shape (SQ-ORD-005). All of that is resolved here (ARCH-003) and nowhere
// else. Taxes, discounts, tips and service charges stay separate financial
// components (SQ-ORD-008); an ad-hoc line item is a line item (SQ-ORD-006).
const { buildEnvelope } = require("../envelope");
const { sumDecimal } = require("../money");
const { squareOrderAdminUrl } = require("../square/oauth");

const text = (v, max = 500) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD", "UGX", "XAF", "XOF", "XPF", "BIF", "DJF", "GNF", "KMF", "MGA", "PYG", "RWF", "VUV"]);
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

/** Square money → decimal string, by the currency's own exponent; null when absent (MERGE-004). */
function squareMoneyToDecimal(money) {
  if (!money || typeof money !== "object") return null;
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return null;
  const currency = text(money.currency).toUpperCase();
  const exponent = ZERO_DECIMAL.has(currency) ? 0 : (THREE_DECIMAL.has(currency) ? 3 : 2);
  const major = amount / 10 ** exponent;
  return (Math.round(major * 100) / 100).toFixed(2);
}

/** The Square product a sale came through, from the order's source name (SQ-ORD-005). */
function squareProductOf(order) {
  const name = text(order?.source?.name, 120);
  const lower = name.toLowerCase();
  if (!name) return { code: "API", name: "Square API" };
  if (lower.includes("point of sale") || lower.includes("pos") || lower.includes("register") || lower.includes("terminal")) return { code: "SQUARE_POS", name };
  if (lower.includes("online") || lower.includes("ecom") || lower.includes("weebly")) return { code: "SQUARE_ONLINE", name };
  if (lower.includes("invoice")) return { code: "INVOICE", name };
  if (lower.includes("appointments") || lower.includes("booking")) return { code: "APPOINTMENTS", name };
  if (lower.includes("virtual terminal")) return { code: "VIRTUAL_TERMINAL", name };
  return { code: "OTHER", name };
}

function addressParts(recipient) {
  if (!recipient || typeof recipient !== "object") return null;
  const a = recipient.address || {};
  const parts = {
    name: text(recipient.display_name) || null,
    street: [text(a.address_line_1), text(a.address_line_2), text(a.address_line_3)].filter(Boolean).join(", "),
    city: text(a.locality), state: text(a.administrative_district_level_1), postalCode: text(a.postal_code), country: text(a.country),
    phone: text(recipient.phone_number).replace(/\s+/g, " ")
  };
  if (!parts.street && !parts.city && !parts.postalCode && !parts.name && !parts.phone) return null;
  return parts;
}

const FULFILLMENT_STATE = { PROPOSED: "unfulfilled", RESERVED: "unfulfilled", PREPARED: "partial", COMPLETED: "fulfilled", CANCELED: "unfulfilled", FAILED: "unfulfilled" };

function fulfillmentsOf(order) {
  return (Array.isArray(order?.fulfillments) ? order.fulfillments : []).map((f) => {
    const type = text(f?.type).toUpperCase();
    const details = f?.shipment_details || f?.pickup_details || f?.delivery_details || {};
    return { uid: text(f?.uid), type, state: text(f?.state).toUpperCase(), details, recipient: details.recipient || null };
  });
}

function shipmentsOf(fulfillments) {
  return fulfillments.filter((f) => f.type === "SHIPMENT" && (f.details.tracking_number || f.state === "COMPLETED")).map((f) => ({
    external_id: f.uid || null, carrier: text(f.details.carrier) || null, tracking_number: text(f.details.tracking_number) || null,
    tracking_url: text(f.details.tracking_url) || null, status: f.state === "COMPLETED" ? "shipped" : "pending",
    at: text(f.details.shipped_at) || null
  }));
}

/** Tenders are what was actually taken; the payment ids are the bridge to the Payments entity (SQ-PAY-005). */
function tendersOf(order) {
  return (Array.isArray(order?.tenders) ? order.tenders : []).map((t) => ({
    external_id: text(t?.payment_id) || text(t?.id) || null,
    provider: text(t?.type, 60) || "SQUARE",
    amount: squareMoneyToDecimal(t?.amount_money), currency: text(t?.amount_money?.currency) || text(order?.total_money?.currency) || null,
    status: "paid", at: text(t?.created_at) || null
  }));
}

/**
 * SQ-REF — a refund in Square lives on its own "return order": a second Order
 * with `returns[].source_order_id` pointing at the sale, no line items and no
 * total. It is never a sale and must never become a NivaDesk order.
 */
function isSquareReturnOrder(order) {
  const returns = Array.isArray(order?.returns) ? order.returns : [];
  const lines = Array.isArray(order?.line_items) ? order.line_items : [];
  return returns.length > 0 && lines.length === 0;
}
function returnSourceOrderId(order) {
  const returns = Array.isArray(order?.returns) ? order.returns : [];
  return text(returns.find((r) => r?.source_order_id)?.source_order_id) || null;
}

/** The refunds of a sale: what the order object carries, plus what the connector already recorded for it (`ctx.refunds`), deduplicated by id. */
function refundsOf(order, ctx = {}) {
  const rows = [];
  const seen = new Set();
  const push = (row) => { if (row.external_id && seen.has(row.external_id)) return; if (row.external_id) seen.add(row.external_id); rows.push(row); };
  for (const r of Array.isArray(order?.refunds) ? order.refunds : []) {
    push({ external_id: text(r?.id) || null, amount: squareMoneyToDecimal(r?.amount_money), currency: text(r?.amount_money?.currency) || null, reason: text(r?.reason, 300) || null, at: text(r?.created_at) || null });
  }
  for (const ret of Array.isArray(order?.returns) ? order.returns : []) {
    const money = ret?.return_amounts?.total_money;
    if (money) push({ external_id: text(ret?.uid) || null, amount: squareMoneyToDecimal(money), currency: text(money.currency) || null, reason: null, at: null });
  }
  for (const r of Array.isArray(ctx.refunds) ? ctx.refunds : []) {
    if (String(r?.status || "COMPLETED").toUpperCase() !== "COMPLETED" && String(r?.status || "").toUpperCase() !== "PENDING") continue;
    push({ external_id: text(r?.externalId || r?.id) || null, amount: r?.amount === undefined ? null : String(r.amount), currency: text(r?.currency) || null, reason: text(r?.reason, 300) || null, at: text(r?.externalCreatedAt || r?.at) || null });
  }
  return rows;
}

function paymentStatusOf(order, tenders, refunds) {
  const state = text(order?.state).toUpperCase();
  const total = Number(squareMoneyToDecimal(order?.total_money) ?? NaN);
  const tendered = Number(sumDecimal(tenders.map((t) => t.amount)) ?? 0);
  const refunded = Number(sumDecimal(refunds.map((r) => r.amount)) ?? 0);
  if (state === "CANCELED") return tendered > 0 && refunded >= tendered ? "refunded" : "voided";
  if (refunded > 0 && total > 0) return refunded >= total ? "refunded" : "partially_refunded";
  if (Number.isFinite(total) && total > 0 && tendered >= total) return "paid";
  if (tendered > 0) return "partially_paid";
  const due = squareMoneyToDecimal(order?.net_amount_due_money);
  if (due !== null && Number(due) === 0 && state === "COMPLETED") return "paid";
  if (state === "DRAFT") return "unpaid";
  return state === "OPEN" ? "pending" : "unknown";
}

function lineItemsOf(order) {
  return (Array.isArray(order?.line_items) ? order.line_items : []).map((item) => {
    const quantity = Math.max(1, Math.round(Number(item?.quantity) || 1));
    const lineTotal = squareMoneyToDecimal(item?.total_money);
    const modifiers = (Array.isArray(item?.modifiers) ? item.modifiers : []).map((m) => ({ name: text(m?.name, 120) || "Modifier", value: squareMoneyToDecimal(m?.total_price_money) || "" }));
    const properties = [
      ...(text(item?.variation_name) ? [{ name: "Variation", value: text(item.variation_name, 200) }] : []),
      ...modifiers,
      ...(text(item?.note) ? [{ name: "Note", value: text(item.note, 500) }] : [])
    ];
    return {
      external_line_id: text(item?.uid) || null,
      sku: null,   // SQ-CAT-003: a SKU is a suggestion, and the order object does not carry it
      title: text(item?.name, 300) || "Item",
      quantity, unit_price: lineTotal === null ? null : Number(lineTotal) / quantity, line_total: lineTotal,
      product_external_id: text(item?.catalog_object_id) || null,   // the VARIATION id (SQ-CAT-002)
      properties
    };
  });
}

/**
 * @param order  Square v2 Order
 * @param ctx    { connectionId, environment, merchantName, locationName, customer (Square Customer, optional), eventOrigin, rawSnapshotRef }
 */
function normalizeSquareOrder(order, ctx = {}) {
  const externalId = text(order?.id);
  const fulfillments = fulfillmentsOf(order);
  const tenders = tendersOf(order);
  const refunds = refundsOf(order, ctx);
  const lineItems = lineItemsOf(order);
  const product = squareProductOf(order);
  const reasons = [];
  if (!lineItems.length) reasons.push("no_line_items");
  if (squareMoneyToDecimal(order?.total_money) === null) reasons.push("missing_total");
  if (!externalId) reasons.push("missing_external_id");
  if (lineItems.some((li) => !li.product_external_id)) reasons.push("ad_hoc_line_item");   // SQ-ORD-007: review, never reject

  const recipient = fulfillments.map((f) => f.recipient).find(Boolean) || null;
  const shipping = addressParts(recipient);
  const customer = ctx.customer && typeof ctx.customer === "object" ? ctx.customer : null;
  const customerName = [text(customer?.given_name), text(customer?.family_name)].filter(Boolean).join(" ") || text(customer?.company_name) || text(recipient?.display_name) || null;
  const customerAddress = customer?.address ? addressParts({ display_name: customerName, address: customer.address, phone_number: customer.phone_number }) : null;
  const email = (text(recipient?.email_address, 200) || text(customer?.email_address, 200)).toLowerCase() || null;
  const phone = (text(recipient?.phone_number) || text(customer?.phone_number)).replace(/\s+/g, " ") || null;
  const hasFulfillment = fulfillments.length > 0;
  const shipments = shipmentsOf(fulfillments);
  const fulfillmentStatus = !hasFulfillment ? "unknown" : (fulfillments.every((f) => f.state === "COMPLETED") ? "fulfilled" : (fulfillments.some((f) => f.state === "COMPLETED" || f.state === "PREPARED") ? "partial" : "unfulfilled"));
  const state = text(order?.state).toLowerCase();
  const platformStatus = state === "canceled" ? "cancelled" : (state || null);
  const lineSummary = lineItems.map((li) => `${li.title} x${li.quantity}`).join(", ");
  const tip = squareMoneyToDecimal(order?.total_tip_money);
  const serviceCharge = squareMoneyToDecimal(order?.total_service_charge_money);
  const locationId = text(order?.location_id);
  const orderNumber = text(order?.reference_id) || externalId.slice(-8).toUpperCase();
  const refundedTotal = sumDecimal(refunds.map((r) => r.amount));

  return buildEnvelope({
    identity: {
      provider: "square", connection_id: text(ctx.connectionId, 200), entity_type: "order", external_id: externalId,
      external_updated_at: text(order?.updated_at) || text(order?.created_at) || null,
      event_origin: ctx.eventOrigin || "provider"
    },
    order: {
      order_source: "square", sales_channel: product.code.toLowerCase(),
      currency: order?.total_money?.currency || null,
      subtotal: sumDecimal(lineItems.map((li) => li.line_total)),
      discount_total: squareMoneyToDecimal(order?.total_discount_money), tax_total: squareMoneyToDecimal(order?.total_tax_money),
      // Square is the studio's own till and payment rail, not a marketplace —
      // the tax it works out is the studio's to declare. total_money, which
      // becomes grand_total below, already has the tax in it.
      tax_responsibility: "merchant", tax_included_in_price: true,
      shipping_total: serviceCharge, grand_total: squareMoneyToDecimal(order?.total_money),
      platform_status: platformStatus,
      payment_status: paymentStatusOf(order, tenders, refunds),
      fulfillment_status: hasFulfillment ? fulfillmentStatus : "unknown",
      cancelled_at: state === "canceled" ? (text(order?.closed_at) || text(order?.updated_at) || null) : null,
      placed_at: text(order?.created_at) || null,
      buyer_note: fulfillments.map((f) => text(f.details?.note, 2000)).filter(Boolean).join("\n") || null,
      is_test: false,
      line_items: lineItems
    },
    customer: {
      external_customer_id: text(order?.customer_id) || text(recipient?.customer_id) || null,
      name: customerName, email, phone,
      billing_address: customerAddress || shipping, shipping_address: shipping || customerAddress
    },
    payments: tenders,
    refunds,
    shipments,
    source: {
      provider_display_name: "Square",
      connection_display_name: text(ctx.merchantName) || "Square",
      external_admin_url: squareOrderAdminUrl(ctx.environment, externalId),
      provider_metadata: {
        version: 1, schema_version: 1,
        order_number: orderNumber, payment_method: tenders.length ? tenders.map((t) => t.provider).filter(Boolean).join(", ") : "Square",
        created_at_raw: text(order?.created_at),
        merchant_id: text(ctx.merchantId), location_id: locationId, location_name: text(ctx.locationName, 200),
        order_version: Number(order?.version) || 0, square_source: product.code, square_source_name: product.name,
        last_square_updated_at: text(order?.updated_at),
        has_fulfillment: hasFulfillment, fulfillment_types: fulfillments.map((f) => f.type).filter(Boolean),
        tip_total: tip, service_charge_total: serviceCharge,
        design_name: lineSummary || `Square ${orderNumber}`,
        order_status_url: squareOrderAdminUrl(ctx.environment, externalId) || "",
        custom_fields: {
          Source: "Square",
          "Square Order ID": externalId,
          "Square Order Number": orderNumber,
          "Square Status": text(order?.state) || "OPEN",
          "Square Source": product.name,
          "Square Location": text(ctx.locationName, 200) || locationId,
          "Square Payment Method": tenders.length ? tenders.map((t) => t.provider).filter(Boolean).join(", ") : "",
          "Square Currency": text(order?.total_money?.currency),
          "Square Total": squareMoneyToDecimal(order?.total_money) || "",
          "Square Created At": text(order?.created_at),
          "Square Products": lineSummary,
          ...(refundedTotal && Number(refundedTotal) > 0 ? { "Square Refunded": refundedTotal } : {})
        }
      }
    },
    review: { reasons },
    raw_snapshot_ref: ctx.rawSnapshotRef || null
  });
}

/** A Square Payment → the compact financial record NivaDesk keeps beside the order (SQ-PAY-002). */
function normalizeSquarePayment(payment, ctx = {}) {
  return {
    provider: "square", connectionId: text(ctx.connectionId, 200), companyId: text(ctx.companyId, 200),
    externalId: text(payment?.id), orderExternalId: text(payment?.order_id) || null, locationId: text(payment?.location_id) || null,
    status: text(payment?.status).toUpperCase() || "UNKNOWN",   // APPROVED | PENDING | COMPLETED | CANCELED | FAILED (SQ-PAY-007)
    amount: squareMoneyToDecimal(payment?.amount_money), tip: squareMoneyToDecimal(payment?.tip_money), total: squareMoneyToDecimal(payment?.total_money),
    approved: squareMoneyToDecimal(payment?.approved_money), refunded: squareMoneyToDecimal(payment?.refunded_money),
    processingFee: sumDecimal((Array.isArray(payment?.processing_fee) ? payment.processing_fee : []).map((f) => squareMoneyToDecimal(f?.amount_money))),
    currency: text(payment?.amount_money?.currency) || null,
    sourceType: text(payment?.source_type, 40) || null, cardBrand: text(payment?.card_details?.card?.card_brand, 40) || null, last4: text(payment?.card_details?.card?.last_4, 4) || null,
    customerExternalId: text(payment?.customer_id) || null, receiptUrl: text(payment?.receipt_url, 500) || null,
    externalCreatedAt: text(payment?.created_at) || null, externalUpdatedAt: text(payment?.updated_at) || text(payment?.created_at) || null,
    version: Number(payment?.version_token ? 0 : 0)
  };
}

/** A Square PaymentRefund → the compact refund record (SQ-REF-001..003). */
function normalizeSquareRefund(refund, ctx = {}) {
  return {
    provider: "square", connectionId: text(ctx.connectionId, 200), companyId: text(ctx.companyId, 200),
    externalId: text(refund?.id), paymentExternalId: text(refund?.payment_id) || null, orderExternalId: text(refund?.order_id) || null, locationId: text(refund?.location_id) || null,
    status: text(refund?.status).toUpperCase() || "UNKNOWN",   // PENDING | COMPLETED | REJECTED | FAILED
    amount: squareMoneyToDecimal(refund?.amount_money), currency: text(refund?.amount_money?.currency) || null,
    processingFee: sumDecimal((Array.isArray(refund?.processing_fee) ? refund.processing_fee : []).map((f) => squareMoneyToDecimal(f?.amount_money))),
    reason: text(refund?.reason, 300) || null,
    externalCreatedAt: text(refund?.created_at) || null, externalUpdatedAt: text(refund?.updated_at) || text(refund?.created_at) || null
  };
}

module.exports = { normalizeSquareOrder, normalizeSquarePayment, normalizeSquareRefund, squareMoneyToDecimal, squareProductOf, paymentStatusOf, addressParts, isSquareReturnOrder, returnSourceOrderId, refundsOf };

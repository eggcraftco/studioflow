// The envelope → the order document the clients already read.
//
// The canonical layer is what the engine reasons about; the `siparisler`
// document is what four clients render. This is the one place the two meet,
// and it is deliberately dumb: shop-owned fields come from the envelope, the
// studio's fields get their new-order defaults ONLY when the order is being
// created, and money becomes a number here and nowhere else (DATA-006 at the
// edge). Anything provider-specific arrives through source.provider_metadata,
// so this file never says "shopify".
const { toLegacyNumber } = require("./money");

const PAID_STATUSES = new Set(["paid", "partially_refunded", "refunded"]);

function addressText(parts) {
  const p = parts || {};
  const cityLine = [p.city, p.state].filter(Boolean).join(", ");
  return [p.street, cityLine, p.postalCode, p.country].filter(Boolean).join(", ");
}

// The line item the clients read. Only the keys the live mappers wrote: a
// provider that carries SKUs says so in its metadata (Etsy), the rest get
// the five fields every client already renders.
function legacyLineItems(envelope) {
  const style = (envelope.source.provider_metadata || {}).legacy_line_items || {};
  return (envelope.order.line_items || []).map((item, index) => {
    const row = {
      id: item.external_line_id || `${envelope.identity.external_id}_${index}`,
      name: item.title || "",
      quantity: item.quantity,
      unitPrice: toLegacyNumber(item.unit_price) ?? 0,
      lineTotal: toLegacyNumber(item.line_total) ?? (toLegacyNumber(item.unit_price) ?? 0) * item.quantity
    };
    if (style.include_sku) row.sku = item.sku || "";
    return row;
  });
}

// "Signet ring x1, Band x2" — the live mappers' format, kept so a shadow
// comparison of designName says something about data, not about punctuation.
function lineSummary(envelope) {
  return (envelope.order.line_items || [])
    .map((item) => `${item.title || "Product"} x${item.quantity}`)
    .join(", ");
}

/** The custom fields a provider's orders carry, keyed by its display name — "Shopify Order ID" and friends. */
function providerCustomFields(envelope) {
  const display = envelope.source.provider_display_name || envelope.identity.provider;
  const meta = envelope.source.provider_metadata || {};
  // An adapter that hands over the provider's own key set (the keys the live
  // mapper wrote, that four clients already display) is taken as complete.
  if (meta.custom_fields && Object.keys(meta.custom_fields).length > 2) {
    const own = {};
    for (const [key, value] of Object.entries(meta.custom_fields)) own[key] = String(value ?? "");
    if (own.communicationAddress === undefined) own.communicationAddress = addressText(envelope.customer.billing_address);
    return own;
  }
  const fields = {
    Source: display,
    [`${display} Order ID`]: envelope.identity.external_id,
    [`${display} Order Number`]: String(meta.order_number || envelope.identity.external_id),
    [`${display} Status`]: String(envelope.order.platform_status || ""),
    [`${display} Payment Method`]: String(meta.payment_method || ""),
    [`${display} Currency`]: String(envelope.order.currency || ""),
    [`${display} Total`]: String(envelope.order.grand_total || ""),
    [`${display} Created At`]: String(meta.created_at_raw || envelope.order.placed_at || ""),
    [`${display} Products`]: lineSummary(envelope),
    communicationAddress: addressText(envelope.customer.billing_address)
  };
  for (const [key, value] of Object.entries(meta.custom_fields || {})) fields[key] = String(value ?? "");
  return fields;
}

/**
 * Shop-owned fields for this order, from the envelope alone. `ctx.reconcileLineItems`
 * is the live path's line-total reconciler, passed in so parity does not depend
 * on this module importing the monolith.
 */
function round2(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

/** Everything refunded on this order, from the envelope's own refund list. */
function refundedTotal(envelope) {
  const refunds = Array.isArray(envelope.refunds) ? envelope.refunds : [];
  let sum = 0;
  for (const refund of refunds) {
    const amount = Math.abs(Number(refund && refund.amount));
    if (Number.isFinite(amount)) sum += amount;
  }
  return round2(sum);
}

function shopOwnedFields(envelope, ctx = {}) {
  const meta = envelope.source.provider_metadata || {};
  const display = envelope.source.provider_display_name || envelope.identity.provider;
  const total = toLegacyNumber(envelope.order.grand_total);
  const paid = PAID_STATUSES.has(envelope.order.payment_status) ? total : 0;
  // Money that went back to the customer. The envelope has carried this all
  // along; nothing read it, so a fully refunded sale kept its whole revenue AND
  // its whole profit. The bank side has always done this arithmetic — see
  // bankLinkRefundToOrder — and this is the same shape: the refund comes off
  // what was paid and is recorded on its own, which is what the finance engine
  // subtracts from net profit.
  const refunded = refundedTotal(envelope);
  const shipping = envelope.customer.shipping_address || envelope.customer.billing_address || {};
  const billing = envelope.customer.billing_address || {};
  const shippingHasAddress = Boolean(shipping.street || shipping.city || shipping.postalCode);
  const ship = shippingHasAddress ? shipping : billing;
  const items = legacyLineItems(envelope);
  const lineItems = typeof ctx.reconcileLineItems === "function" && total !== null ? ctx.reconcileLineItems(items, total) : items;
  const phone = envelope.customer.phone || "";
  const fields = {
    companyId: String(ctx.companyId || ""),
    paymentMethod: String(meta.payment_method || ""),
    customerName: envelope.customer.name || `${display} Customer`,
    paymentDate: envelope.order.placed_at ? new Date(envelope.order.placed_at) : (ctx.now ? new Date(ctx.now) : new Date()),
    paidAmount: Math.max(0, round2((paid ?? 0) - refunded)),
    // Deliberately measured against what was PAID, not against what is left
    // after the refund: a refunded sale is settled, not outstanding. Reading it
    // the other way round would put the refunded amount back on the customer's
    // balance as money they still owe.
    remainingAmount: total === null || paid === null ? 0 : Math.max(0, round2(total - paid)),
    refundedAmount: refunded,
    orderValue: total ?? 0,
    watchRef: String(lineItems[0]?.sku || ""),
    designName: String(meta.design_name || "") || lineSummary(envelope) || lineItems[0]?.name || `${display} ${meta.order_number || envelope.identity.external_id}`,
    lineItems,
    designLink: String(meta.order_status_url || ""),
    communication: [display],
    emailAddress: envelope.customer.email || "",
    instagramUsername: "",
    whatsappNumber: phone,
    notes: envelope.order.buyer_note || "",
    shippingName: ship.name || envelope.customer.name || `${display} Customer`,
    shippingStreetAddress: ship.street || "",
    shippingCity: ship.city || "",
    shippingPostalCode: ship.postalCode || "",
    shippingCountry: ship.country || "",
    shippingPhone: ship.phone || phone,
    deliveryCost: toLegacyNumber(envelope.order.shipping_total) ?? 0,
    taxAmount: toLegacyNumber(envelope.order.tax_total) ?? 0,
    // The shop's own tax figure, and whose it is.
    //
    // Every channel writes `taxRate: 0` below because no shop API returns a
    // rate, and the Finance Engine gated VAT on the rate — so a sale that
    // charged £120 of tax reported no VAT at all while this number sat beside
    // it. `taxAmountKnown` is what lets the engine use the amount instead, and
    // what tells a shop that charged nothing apart from a field nobody filled
    // in. `taxResponsibility` decides whether it joins the studio's VAT due or
    // is shown as tax the marketplace collected; `unknown` asks rather than
    // guesses. See functions/finance/engine.js.
    // Known when the provider actually told us, not merely because the field
    // exists. Amazon phase A1 does not request the TAX dataset, so its orders
    // arrive with no tax figure at all — and `taxAmount: 0, taxAmountKnown:
    // true` would tell the Finance Engine that the tax on a £120 sale is zero,
    // which is the same shape as the bug that had channel orders reporting no
    // VAT. Every other adapter fills tax_total in (a real "0.00" included), so
    // for them this stays true and nothing changes.
    taxAmountKnown: envelope.order.tax_total !== null && envelope.order.tax_total !== undefined,
    taxResponsibility: envelope.order.tax_responsibility || "unknown",
    taxIncludedInPrice: envelope.order.tax_included_in_price !== false,
    customFields: providerCustomFields(envelope)
    // No top-level `source`/`orderSource`: neither live mapper writes them; the
    // order's provider identity lives in its `commerce` map.
  };
  return fields;
}

/** What a brand-new order starts with on the studio's side — never applied to an existing one. */
function newOrderDefaults(ctx = {}) {
  return {
    deliveryTime: Number(ctx.defaultDeliveryTime) || 45,
    watchPurchasePrice: 0,
    designStatus: String(ctx.defaultStatus || "Not Yet"),
    status: String(ctx.defaultStatus || "Not Yet"),
    isDispatched: false,
    trackingNumber: "",
    courier: "Auto Detect",
    isDelivered: false,
    // No paymentFee here on purpose. This channel is not told what the sale
    // cost to take, and writing a zero says it cost nothing — which the finance
    // engine used to believe, and which now, with paymentFee shop-owned, would
    // also wipe a fee the studio typed in by hand on every resync. A connector
    // writes the fee only when the platform actually told it one, together with
    // platformFeeKnown. See functions/finance/engine.js.
    taxType: "",
    extraStatuses: {},
    taxRate: 0,
    invBool1: false, invBool2: false, invBool3: false, invBool4: false, invNotes: "",
    priority: "Normal",
    risk: "None",
    riskReason: "-",
    customToggles: {},
    clientFiles: [],
    todoItems: [],
    workSessions: [],
    assignedToUid: "",
    assignedToEmail: ""
  };
}

module.exports = { shopOwnedFields, newOrderDefaults, providerCustomFields, legacyLineItems, lineSummary, addressText, PAID_STATUSES };

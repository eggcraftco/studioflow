// The Amazon adapter: an SP-API order → the canonical envelope.
//
// Amazon is a marketplace, and three of its habits decide this mapping:
//
//   1. It usually collects the tax itself. Every order carries a
//      `TaxCollection` block saying whether the marketplace facilitator
//      collected and remits it — so whose tax it is comes out of the payload
//      (§44), not out of an assumption about the channel. Where Amazon does not
//      say, the envelope says `unknown` and the order asks rather than the
//      engine moving somebody's VAT return (functions/finance/engine.js).
//   2. It fulfils some orders itself. `FulfillmentChannel: AMAZON` is FBA — the
//      stock left the studio's warehouse long ago and NivaDesk must not reserve
//      it again (§28). MERCHANT is the studio's own shelf.
//   3. Its order totals arrive at two different levels. `OrderTotal` is on the
//      order; the per-item money — price, tax, promotion, shipping — is only on
//      the ITEMS, which come from a second call. This adapter takes both and
//      never invents the half it was not given (MERGE-004).
//
// Amazon buyer data is restricted: a name and address are only present when the
// application holds PII approval, and the address may be redacted per order.
// Nothing is fabricated to fill the gap.
//
// Pure: no network, no clock, no Firestore. Spec: NivaDesk_Amazon_eBay
// _Integration_AI_Spec.md §12-§18, §28, §36, §38, §44.
const { buildEnvelope } = require("../envelope");
const { toDecimalString, sumDecimal } = require("../money");

const text = (v, max = 500) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));

/** A charge less the reversal Amazon states beside it; null when neither is given. */
function netOf(charge, reversal) {
  const gross = amazonMoney(charge);
  const back = amazonMoney(reversal);
  if (gross === null) return back === null ? null : toDecimalString(-Number(back));
  if (back === null) return gross;
  return toDecimalString(Number(gross) - Number(back));
}

/** Amazon money — `{CurrencyCode, Amount: "40.00"}` — as a canonical decimal. */
function amazonMoney(money) {
  if (!money || typeof money !== "object") return null;
  return toDecimalString(money.Amount ?? money.amount);
}

/**
 * Whose tax it is, from Amazon's own words.
 *
 * `TaxCollection.Model` is "MarketplaceFacilitator" when Amazon collected the
 * tax and remits it — the studio never sees that money and must not declare it.
 * `ResponsibleParty` names who remits. Anything else, including the block being
 * absent, is `unknown`: a large share of Amazon's tax IS facilitator-collected,
 * so defaulting to the merchant would invent a VAT liability on most orders,
 * and defaulting to the platform would erase a real one on the rest.
 */
function taxResponsibilityOf(order, items) {
  const modelOf = (collection) => {
    if (!collection || typeof collection !== "object") return "";
    return text(collection.Model).toLowerCase();
  };
  const models = [];
  const orderModel = modelOf(order?.TaxCollection);
  const list = Array.isArray(items) ? items : [];
  // Every ITEM is counted, including one that carries no TaxCollection at all —
  // skipping those let a mixed order pass as facilitator-collected on the
  // strength of the items that were tagged, and the untagged half's VAT
  // disappeared from the studio's return. An item with no block has not been
  // answered, and one unanswered item makes the whole order unanswered.
  for (const item of list) models.push(modelOf(item?.TaxCollection) || orderModel);
  if (!list.length && orderModel) models.push(orderModel);
  if (!models.length || models.some((m) => !m)) return "unknown";
  if (models.every((m) => m === "marketplacefacilitator")) return "platform";
  if (models.every((m) => m === "standard")) return "merchant";
  return "unknown";
}

/**
 * The tax block Amazon actually sent, kept beside the verdict so a studio being
 * asked "whose tax is this?" can see what the marketplace said.
 */
function taxEvidenceOf(order, items) {
  const sources = [order?.TaxCollection, ...(Array.isArray(items) ? items : []).map((i) => i?.TaxCollection)];
  const found = sources.find((c) => c && typeof c === "object" && text(c.Model));
  return {
    model: found ? text(found.Model, 80) : null,
    responsibleParty: found ? (text(found.ResponsibleParty, 120) || null) : null
  };
}

/** FBA or the studio's own shelf (§28) — the distinction inventory depends on. */
function fulfilmentSourceOf(order) {
  const channel = text(order?.FulfillmentChannel).toUpperCase();
  if (channel === "AFN" || channel === "AMAZON") return "marketplace_fulfilled";
  if (channel === "MFN" || channel === "MERCHANT") return "merchant";
  return "unknown";
}

/**
 * An extended amount divided by its quantity, but only when the answer is exact
 * to the penny. Anything else is a number the provider never stated.
 */
function unitPriceOf(extended, quantity) {
  const total = Number(extended);
  const count = Number(quantity);
  if (!Number.isFinite(total) || !Number.isFinite(count) || count <= 0) return null;
  const per = toDecimalString(total / count);
  if (per === null) return null;
  return Math.abs(Number(per) * count - total) < 0.005 ? per : null;
}

function lineItemsOf(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const quantity = Number(item?.QuantityOrdered);
    const price = amazonMoney(item?.ItemPrice);
    // Amazon states each charge and its reversal side by side, and only the
    // pair is the truth: a free-postage promotion sends ShippingPrice 4.99 AND
    // ShippingDiscount 4.99. Reading the charge alone overstated the shipping
    // and the tax on every discounted order.
    const shipping = netOf(item?.ShippingPrice, item?.ShippingDiscount);
    const itemTax = amazonMoney(item?.ItemTax);
    const shippingTax = netOf(item?.ShippingTax, item?.ShippingDiscountTax);
    const promotionTax = amazonMoney(item?.PromotionDiscountTax);
    const taxes = [itemTax, shippingTax].filter((v) => v !== null);
    // A promotion's tax is tax that was not charged.
    if (promotionTax !== null && taxes.length) taxes.push(toDecimalString(-Number(promotionTax)));
    return {
      external_line_id: text(item?.OrderItemId, 120) || null,
      product_external_id: text(item?.ASIN, 120) || null,
      variant_external_id: null,
      sku: text(item?.SellerSKU, 120) || null,
      title: text(item?.Title, 400) || "Item",
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      // ItemPrice is the extended price for the whole QUANTITY, not the unit
      // price — so it is divided, but only when it divides into whole pennies.
      // Three items for £10 must not become an invented £3.33 the buyer never
      // saw; and a null here becomes a £0 unit price by the time the legacy
      // order document is written, so "say nothing" is not available either.
      unit_price: unitPriceOf(price, quantity),
      line_total: price,
      tax_total: taxes.length ? sumDecimal(taxes) : null,
      properties: [
        shipping !== null ? { name: "Shipping", value: shipping } : null,
        amazonMoney(item?.PromotionDiscount) !== null ? { name: "Promotion", value: amazonMoney(item.PromotionDiscount) } : null,
        text(item?.ConditionId) ? { name: "Condition", value: text(item.ConditionId, 80) } : null
      ].filter(Boolean)
    };
  });
}

/**
 * Amazon does not report a payment the way a shop does: it reports a payment
 * METHOD and an order status. Money actually moves at settlement, in the
 * finances feed, so a payment entry here would be an assertion NivaDesk cannot
 * support — Xero's XR-MAP-004 rule exactly. The order's paid-ness is carried by
 * `payment_status` instead, and the settlement lands separately.
 */
function paymentsOf() {
  return [];
}

function shippingAddressOf(order) {
  const address = order?.ShippingAddress;
  if (!address || typeof address !== "object") return null;
  return {
    name: text(address.Name, 200) || null,
    street: [text(address.AddressLine1, 200), text(address.AddressLine2, 200), text(address.AddressLine3, 200)].filter(Boolean).join(", ") || null,
    city: text(address.City, 120) || null,
    // `state` and `postalCode` — the shape every consumer reads (addressText
    // and shippingPostalCode in envelopeToOrder). snake_case here meant the
    // county and the postcode silently vanished from the order.
    state: text(address.StateOrRegion, 120) || null,
    postalCode: text(address.PostalCode, 40) || null,
    country: text(address.CountryCode, 8) || null,
    phone: text(address.Phone, 60) || null
  };
}

/**
 * Amazon's OrderStatus is a lifecycle, not a payment state, and the two do not
 * line up: Unshipped means paid and waiting to go out; PendingAvailability and
 * Pending mean the buyer's payment has not cleared.
 */
function paymentStatusOf(order) {
  const status = text(order?.OrderStatus);
  if (status === "Pending" || status === "PendingAvailability") return "unpaid";
  // "voided" is the envelope's word for a sale that will never be paid, and it
  // is what a cancellation means for the money. "unknown" would be a worse
  // answer, not a safer one: it says nobody told us, and Amazon did.
  if (status === "Canceled" || status === "Cancelled") return "voided";
  if (status === "Unshipped" || status === "PartiallyShipped" || status === "Shipped" || status === "InvoiceUnconfirmed") return "paid";
  return "unknown";
}

function fulfillmentStatusOf(order) {
  const status = text(order?.OrderStatus);
  if (status === "Shipped") return "fulfilled";
  if (status === "PartiallyShipped") return "partial";
  if (status === "Unshipped" || status === "Pending" || status === "PendingAvailability") return "unfulfilled";
  return "unknown";
}

/** The Amazon seller-central host for the marketplace the order came from. */
const SELLER_CENTRAL_HOSTS = {
  A1F83G8C2ARO7P: "sellercentral.amazon.co.uk",
  A1PA6795UKMFR9: "sellercentral.amazon.de",
  A13V1IB3VIYZZH: "sellercentral.amazon.fr",
  APJ6JRA9NG5V4: "sellercentral.amazon.it",
  A1RKKUPIHCS9HS: "sellercentral.amazon.es",
  ATVPDKIKX0DER: "sellercentral.amazon.com",
  A2EUQ1WTGCTBG2: "sellercentral.amazon.ca"
};

/**
 * @param {object} order  an SP-API Order
 * @param {object} ctx    { connectionId, marketplaceId, sellerId, accountName,
 *                          items: OrderItem[], eventOrigin }
 */
function normalizeAmazonOrder(order, ctx = {}) {
  const externalId = text(order?.AmazonOrderId, 200);
  const items = Array.isArray(ctx.items) ? ctx.items : [];
  const lineItems = lineItemsOf(items);
  const marketplaceId = text(order?.MarketplaceId, 40) || text(ctx.marketplaceId, 40) || null;
  const cancelled = text(order?.OrderStatus) === "Canceled" || text(order?.OrderStatus) === "Cancelled";
  const shipping = shippingAddressOf(order);
  const grandTotal = amazonMoney(order?.OrderTotal);
  const taxResponsibility = taxResponsibilityOf(order, items);
  const taxTotal = lineItems.length
    ? (lineItems.map((li) => li.tax_total).filter((v) => v !== null).length
        ? sumDecimal(lineItems.map((li) => li.tax_total).filter((v) => v !== null))
        : null)
    : null;
  const shippingTotal = items.length
    ? (items.map((i) => netOf(i?.ShippingPrice, i?.ShippingDiscount)).filter((v) => v !== null).length
        ? sumDecimal(items.map((i) => netOf(i?.ShippingPrice, i?.ShippingDiscount)).filter((v) => v !== null))
        : null)
    : null;
  const discountTotal = items.length
    ? (items.map((i) => amazonMoney(i?.PromotionDiscount)).filter((v) => v !== null).length
        ? sumDecimal(items.map((i) => amazonMoney(i?.PromotionDiscount)).filter((v) => v !== null))
        : null)
    : null;

  const reasons = [];
  if (!externalId) reasons.push("missing_external_id");
  // The items come from a second SP-API call. Without them the order has no
  // lines, no ASINs and no per-item tax, and posting it would be a total with
  // nothing under it — so it arrives and waits rather than being rejected.
  if (!lineItems.length) reasons.push("no_line_items");
  if (grandTotal === null) reasons.push("missing_total");
  if (taxResponsibility === "unknown" && taxTotal !== null) reasons.push("tax_responsibility_unknown");
  // PII approval decides whether a buyer name and address exist at all. Their
  // absence is a fact about the application's scope, not a fault in the order.
  if (order?.BuyerInfo === undefined && !shipping) reasons.push("buyer_data_restricted");

  return buildEnvelope({
    identity: {
      provider: "amazon",
      connection_id: text(ctx.connectionId, 200),
      marketplace_id: marketplaceId,
      entity_type: "order",
      external_id: externalId,
      external_updated_at: text(order?.LastUpdateDate) || text(order?.PurchaseDate) || null,
      event_origin: ctx.eventOrigin || "provider"
    },
    order: {
      order_source: "amazon", sales_channel: "amazon",
      currency: text(order?.OrderTotal?.CurrencyCode, 8) || null,
      // The order-level total is the only figure Amazon states for the sale;
      // the subtotal is rebuilt from the items, and stays null when they have
      // not arrived rather than being guessed from the total.
      subtotal: lineItems.length ? sumDecimal(lineItems.map((li) => li.line_total).filter((v) => v !== null)) : null,
      discount_total: discountTotal,
      tax_total: taxTotal,
      tax_responsibility: taxResponsibility,
      // OrderTotal is what the buyer was charged, tax inside it.
      tax_included_in_price: true,
      shipping_total: shippingTotal,
      grand_total: grandTotal,
      platform_status: cancelled ? "cancelled" : (text(order?.OrderStatus).toLowerCase() || null),
      // A cancellation is not a payment state, and "cancelled" is not one of the
      // envelope's — buildEnvelope would coerce it to "unknown", and a
      // cancelled order the buyer has already paid for would then look the same
      // as one that was never paid. The cancellation is carried by
      // platform_status and cancelled_at; this stays the money.
      payment_status: paymentStatusOf(order),
      fulfillment_status: fulfillmentStatusOf(order),
      cancelled_at: cancelled ? (text(order?.LastUpdateDate) || null) : null,
      placed_at: text(order?.PurchaseDate) || null,
      buyer_note: null,
      is_test: false,
      line_items: lineItems
    },
    customer: {
      // Amazon's buyer identity is an anonymised address only the seller may
      // use for fulfilment. There is no durable customer id to key on, and the
      // masked relay email is not one.
      external_customer_id: null,
      name: text(order?.BuyerInfo?.BuyerName, 200) || text(order?.ShippingAddress?.Name, 200) || null,
      email: text(order?.BuyerInfo?.BuyerEmail, 200).toLowerCase() || null,
      phone: text(order?.ShippingAddress?.Phone, 60) || null,
      billing_address: shipping,
      shipping_address: shipping
    },
    payments: paymentsOf(),
    refunds: [],
    shipments: [],
    source: {
      provider_display_name: "Amazon",
      connection_display_name: text(ctx.accountName, 200) || "Amazon",
      external_admin_url: externalId && marketplaceId && SELLER_CENTRAL_HOSTS[marketplaceId]
        ? `https://${SELLER_CENTRAL_HOSTS[marketplaceId]}/orders-v3/order/${encodeURIComponent(externalId)}`
        : null,
      provider_metadata: {
        version: 1, schema_version: 1,
        order_number: text(order?.SellerOrderId, 200) || externalId,
        seller_id: text(ctx.sellerId, 120) || null,
        marketplace_id: marketplaceId,
        // What inventory has to know before it reserves anything (§28).
        fulfilment_source: fulfilmentSourceOf(order),
        fulfillment_channel_raw: text(order?.FulfillmentChannel, 40) || null,
        order_status_raw: text(order?.OrderStatus, 40) || null,
        payment_method: text(order?.PaymentMethod, 80) || "Amazon",
        payment_method_details: (Array.isArray(order?.PaymentMethodDetails) ? order.PaymentMethodDetails : []).map((d) => text(d, 80)).filter(Boolean),
        // SP-API puts TaxCollection on the ORDER ITEM, not on the order — which
        // is why taxResponsibilityOf walks the items for it. Reading it off the
        // order stored null on every real payload and left the verdict with no
        // evidence behind it. Both levels are consulted, items first.
        tax_collection_model: taxEvidenceOf(order, items).model,
        tax_responsible_party: taxEvidenceOf(order, items).responsibleParty,
        is_business_order: order?.IsBusinessOrder === true,
        is_prime: order?.IsPrime === true,
        is_replacement_order: order?.IsReplacementOrder === true,
        programs: [
          order?.IsPrime === true ? "PRIME" : null,
          order?.IsBusinessOrder === true ? "BUSINESS" : null,
          order?.IsPremiumOrder === true ? "PREMIUM" : null
        ].filter(Boolean),
        earliest_ship_date: text(order?.EarliestShipDate) || null,
        latest_ship_date: text(order?.LatestShipDate) || null,
        items_seen: lineItems.length,
        // The order's own fields, in the shape every connector uses: the
        // dashboard files a sale under `Source` and reads its currency from
        // "<Source> Currency", so a connector that skips these is counted as a
        // manual order in the studio's own currency.
        design_name: lineItems.map((li) => `${li.title} x${li.quantity}`).join(", ") || `Amazon ${externalId}`,
        custom_fields: {
          Source: "Amazon",
          "Amazon Order ID": externalId,
          "Amazon Order Number": text(order?.SellerOrderId, 200) || externalId,
          "Amazon Status": text(order?.OrderStatus, 40),
          "Amazon Payment Method": text(order?.PaymentMethod, 80),
          "Amazon Currency": text(order?.OrderTotal?.CurrencyCode, 8),
          "Amazon Total": grandTotal || "",
          "Amazon Created At": text(order?.PurchaseDate),
          "Amazon Marketplace": marketplaceId || "",
          "Amazon Fulfilment": fulfilmentSourceOf(order),
          "Amazon Products": lineItems.map((li) => `${li.title} x${li.quantity}`).join(", ")
        }
      }
    },
    review: { required: reasons.length > 0, reasons },
    raw_snapshot_ref: ctx.rawSnapshotRef || null
  });
}

module.exports = { normalizeAmazonOrder, amazonMoney, taxResponsibilityOf, fulfilmentSourceOf, SELLER_CENTRAL_HOSTS };

// The eBay adapter: a Sell Fulfillment API order → the canonical envelope.
//
// eBay differs from the shops NivaDesk already speaks to in three ways that
// decide the whole mapping:
//
//   1. It is a MARKETPLACE, not the studio's own storefront. On most sales eBay
//      collects the tax and remits it itself, and it says so per tax line
//      in its own array — so whose tax it is comes out of the payload rather
//      than out of an assumption about the channel. Where it does not say,
//      the envelope says `unknown` and the order asks, which is the rule the
//      Finance Engine enforces (functions/finance/engine.js).
//   2. Its money is `{value, currency}` with the value as a STRING, and the
//      totals are quoted several ways at once — the order total, the seller's
//      earnings, the buyer's payment. Only `pricingSummary.total` is the sale.
//   3. A single order can be paid, part-shipped and part-refunded at the same
//      time, and eBay reports each of those in its own list rather than as one
//      status. The envelope keeps them separate: payments, refunds, shipments.
//
// Pure: no network, no clock, no Firestore. Spec: NivaDesk_Amazon_eBay
// _Integration_AI_Spec.md §19-§24, §36, §39, §44.
const { buildEnvelope } = require("../envelope");
const { toDecimalString, sumDecimal } = require("../money");
const { ebayMarketplace } = require("../marketplaces");

const text = (v, max = 500) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));

/** eBay money — `{value: "40.00", currency: "GBP"}` — as a canonical decimal. */
function ebayMoney(money) {
  if (!money || typeof money !== "object") return null;
  return toDecimalString(money.value);
}

/** A charge less the discount eBay states beside it; null when neither is given. */
function netOf(charge, discount) {
  const gross = ebayMoney(charge);
  const back = ebayMoney(discount);
  if (gross === null) return back === null ? null : toDecimalString(-Number(back));
  if (back === null) return gross;
  return toDecimalString(Number(gross) - Number(back));
}

/**
 * Whose tax it is, from what eBay actually said.
 *
 * There is no `collectedBy` on a tax line. eBay says it structurally instead,
 * with two separate arrays on each line item:
 *
 *   taxes[]                   the SELLER's own tax table — the studio charged
 *                             it and the studio declares it
 *   ebayCollectAndRemitTaxes[] tax eBay collected and remits itself, which the
 *                             studio never sees and must not declare
 *
 * The presence of the second array IS the marketplace-collected signal. A line
 * can carry both — the seller's VAT beside a sales tax eBay remits — and one
 * order cannot then have one answer, so it is reported as unknown and the
 * studio is asked once rather than the engine picking a side and moving
 * somebody's VAT return.
 */
function taxLinesOf(order) {
  const seller = [];
  const marketplace = [];
  for (const item of Array.isArray(order?.lineItems) ? order.lineItems : []) {
    for (const tax of Array.isArray(item?.taxes) ? item.taxes : []) {
      const amount = ebayMoney(tax?.amount);
      if (amount !== null && Number(amount) !== 0) seller.push({ amount, taxType: text(tax?.taxType, 80) });
    }
    for (const tax of Array.isArray(item?.ebayCollectAndRemitTaxes) ? item.ebayCollectAndRemitTaxes : []) {
      const amount = ebayMoney(tax?.amount);
      if (amount === null || Number(amount) === 0) continue;
      marketplace.push({
        amount,
        taxType: text(tax?.taxType, 80),
        // NET means eBay collected it from the buyer SEPARATELY, so it is not
        // inside the order total; GROSS means it is.
        collectionMethod: text(tax?.collectionMethod, 20).toUpperCase() || "GROSS",
        reference: text(tax?.ebayReference?.value, 120)
      });
    }
  }
  return { seller, marketplace };
}

function taxResponsibilityOf(order) {
  const { seller, marketplace } = taxLinesOf(order);
  if (seller.length && marketplace.length) return "unknown";
  if (marketplace.length) return "platform";
  if (seller.length) return "merchant";
  return "unknown";
}

/**
 * The tax charged on this order, wherever eBay stated it.
 *
 * `pricingSummary.tax` is the authority for what is INSIDE the order total, and
 * some orders state the tax only there. A NET collect-and-remit tax is not in
 * that figure at all — eBay took it from the buyer separately — so it is added,
 * or it disappears from an order the buyer plainly paid it on.
 */
function taxTotalOf(order) {
  const { seller, marketplace } = taxLinesOf(order);
  const inTotal = ebayMoney(order?.pricingSummary?.tax);
  const insideParts = inTotal !== null
    ? [inTotal]
    : [...seller.map((t) => t.amount), ...marketplace.filter((t) => t.collectionMethod === "GROSS").map((t) => t.amount)];
  const outsideParts = inTotal !== null
    ? marketplace.filter((t) => t.collectionMethod === "NET").map((t) => t.amount)
    : marketplace.filter((t) => t.collectionMethod === "NET").map((t) => t.amount);
  const parts = [...insideParts, ...outsideParts];
  return parts.length ? sumDecimal(parts) : null;
}

/**
 * An extended amount divided by its quantity, but only when the answer is exact
 * to the penny. Anything else is a number the provider never stated.
 *
 * The first version compared the UNROUNDED quotient with itself — `perUnit *
 * count` against `extended` where `perUnit = extended / count` — so it was true
 * for every input and guarded nothing.
 */
function unitPriceOf(extended, quantity) {
  const total = Number(extended);
  const count = Number(quantity);
  if (!Number.isFinite(total) || !Number.isFinite(count) || count <= 0) return null;
  const per = toDecimalString(total / count);
  if (per === null) return null;
  return Math.abs(Number(per) * count - total) < 0.005 ? per : null;
}

function lineItemsOf(order) {
  return (Array.isArray(order?.lineItems) ? order.lineItems : []).map((item) => {
    const quantity = Number(item?.quantity);
    // `lineItemCost` is the extended GOODS amount for the whole quantity —
    // priceSubtotal is documented as the sum of these. `total` is that plus the
    // line's delivery and its tax, so reading it as the goods total puts
    // shipping and VAT into revenue a second time, where the envelope already
    // carries them as their own components.
    const lineTotal = ebayMoney(item?.lineItemCost);
    const count = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    // And the unit price is that divided by the quantity — but only when it
    // divides cleanly. Two bands at £5 must not become two at £10; three items
    // for £10 must not become an invented £3.33 the buyer never saw.
    const unit = unitPriceOf(lineTotal, count);
    return {
      external_line_id: text(item?.lineItemId, 120) || null,
      // `legacyItemId` or nothing. `listingMarketplaceId` is the SITE the
      // listing is on ("EBAY_GB"), so using it as a fallback gave every line of
      // every order on that site the same product identity.
      product_external_id: text(item?.legacyItemId, 120) || null,
      variant_external_id: text(item?.legacyVariationId, 120) || null,
      sku: text(item?.sku, 120) || null,
      title: text(item?.title, 400) || "Item",
      quantity: count,
      unit_price: unit,
      line_total: lineTotal,
      // eBay's per-line tax stays on the line: an accounting posting needs the
      // treatment per line, and rebuilding it from an order total cannot be done.
      tax_total: (Array.isArray(item?.taxes) && item.taxes.length)
        ? sumDecimal(item.taxes.map((t) => ebayMoney(t?.amount)).filter((v) => v !== null))
        : null,
      properties: (Array.isArray(item?.variationAspects) ? item.variationAspects : [])
        .map((aspect) => ({ name: text(aspect?.name, 120), value: text(aspect?.value, 400) }))
        .filter((p) => p.name && p.value)
    };
  });
}

/**
 * eBay reports the buyer's money as payments and the seller's returns as
 * refunds, each with its own status. A payment that is not FAILED is money the
 * studio has been credited with; a pending one is not yet.
 */
/** The processor's own reference for a payment, from eBay's array of them. */
function paymentReferenceOf(payment) {
  const list = Array.isArray(payment?.paymentReferenceId) ? payment.paymentReferenceId : [];
  for (const entry of list) {
    const id = text(entry?.referenceId, 200);
    if (id) return id;
  }
  // Some responses carry a bare string; take it rather than losing the id.
  const bare = typeof payment?.paymentReferenceId === "string" ? text(payment.paymentReferenceId, 200) : "";
  return bare || null;
}

function paymentsOf(order) {
  const summary = order?.paymentSummary || {};
  return (Array.isArray(summary.payments) ? summary.payments : [])
    .filter((payment) => text(payment?.paymentStatus).toUpperCase() !== "FAILED")
    .map((payment) => ({
      // An ARRAY of {referenceId, referenceType}, not a string. Stringifying it
      // gave every payment on every order the id "[object Object]" — and that
      // id is what bank and payout matching keys on.
      external_id: paymentReferenceOf(payment),
      provider: text(payment?.paymentMethod, 80) || "eBay",
      method: text(payment?.paymentMethod, 80) || null,
      amount: ebayMoney(payment?.amount),
      currency: text(payment?.amount?.currency, 8) || null,
      status: text(payment?.paymentStatus, 40).toLowerCase() || null,
      at: text(payment?.paymentDate) || null,
      // eBay does not report the seller's fee on the payment; it arrives in the
      // finances feed, and inventing a zero here would tell the Finance Engine
      // the sale cost nothing to take. See platformFeeKnown in
      // functions/finance/engine.js.
      fee: null
    }));
}

function refundsOf(order) {
  const summary = order?.paymentSummary || {};
  return (Array.isArray(summary.refunds) ? summary.refunds : [])
    // A FAILED refund is money that never left. Payments are already filtered
    // this way, and counting a failed one would show a sale as refunded and
    // take it back out of the studio's revenue.
    .filter((refund) => text(refund?.refundStatus).toUpperCase() !== "FAILED")
    .map((refund) => ({
    // eBay's own refundId first: refundReferenceId is the payment processor's,
    // and a refund that carries only the former had no id at all, so a resync
    // could not recognise it as one it had already seen.
    external_id: text(refund?.refundId, 200) || text(refund?.refundReferenceId, 200) || null,
    amount: ebayMoney(refund?.amount),
    currency: text(refund?.amount?.currency, 8) || null,
    reason: text(refund?.refundStatus, 200) || null,
    at: text(refund?.refundDate) || null
    }));
}

/**
 * A shipment is something that has actually gone out.
 *
 * `fulfillmentStartInstructions` is not that: it is eBay telling the seller
 * where and how to ship, and it is present from the moment the order is
 * created. Building shipments from it made an untouched order report a parcel
 * with a carrier and no tracking number. Real shipments come from eBay's
 * shipping-fulfillment resource, which the caller fetches separately and hands
 * in — so until it does, an order reports no shipments rather than a fiction.
 */
function shipmentsOf(order, ctx) {
  const fulfillments = Array.isArray(ctx?.fulfillments) ? ctx.fulfillments : [];
  return fulfillments.map((fulfillment) => ({
    external_id: text(fulfillment?.fulfillmentId, 200) || null,
    carrier: text(fulfillment?.shipmentTrackingNumber ? fulfillment?.shippingCarrierCode : fulfillment?.shippingCarrierCode, 120) || null,
    tracking_number: text(fulfillment?.shipmentTrackingNumber, 120) || null,
    tracking_url: null,
    status: text(order?.orderFulfillmentStatus, 40).toLowerCase() || "unknown",
    at: text(fulfillment?.shippedDate) || null
  }));
}

function addressOf(instruction) {
  const to = instruction?.shippingStep?.shipTo;
  if (!to) return null;
  const address = to.contactAddress || {};
  return {
    name: text(to?.fullName, 200) || null,
    street: [text(address.addressLine1, 200), text(address.addressLine2, 200)].filter(Boolean).join(", ") || null,
    city: text(address.city, 120) || null,
    // `state` and `postalCode` — the shape every consumer reads (addressText
    // and shippingPostalCode in envelopeToOrder). snake_case here meant the
    // county and the postcode silently vanished from the order.
    state: text(address.stateOrProvince, 120) || null,
    postalCode: text(address.postalCode, 40) || null,
    country: text(address.countryCode, 8) || null,
    phone: text(to?.primaryPhone?.phoneNumber, 60) || null
  };
}

/** Paid, part-paid or unpaid, from the payment list rather than a single flag. */
function paymentStatusOf(order, payments, refunds) {
  const total = Number(ebayMoney(order?.pricingSummary?.total));
  const cancelState = text(order?.cancelStatus?.cancelState).toUpperCase();
  const cancelled = cancelState === "CANCELED" || cancelState === "CANCELLED";
  const paid = Number(sumDecimal(payments.filter((p) => (p.status || "").toUpperCase() !== "PENDING").map((p) => p.amount)) || "0");
  const refunded = Number(sumDecimal(refunds.map((r) => r.amount)) || "0");
  if (refunded > 0 && refunded + 0.005 >= paid && paid > 0) return "refunded";
  if (refunded > 0) return "partially_refunded";
  // A cancellation the buyer has NOT been refunded for is a sale that will
  // never be paid, which is what the envelope calls "voided". A cancellation
  // they have been refunded for is a refund, and is answered above — the order
  // of these two lines is the whole distinction.
  if (cancelled) return "voided";
  if (!Number.isFinite(total) || total <= 0) return payments.length ? "paid" : "unknown";
  if (paid + 0.005 >= total) return "paid";
  if (paid > 0) return "partially_paid";
  return "unpaid";
}

function fulfillmentStatusOf(order) {
  const status = text(order?.orderFulfillmentStatus).toUpperCase();
  if (status === "FULFILLED") return "fulfilled";
  if (status === "IN_PROGRESS") return "partial";
  if (status === "NOT_STARTED") return "unfulfilled";
  return "unknown";
}

/**
 * @param {object} order  an eBay Sell Fulfillment API order
 * @param {object} ctx    { connectionId, marketplaceId, accountName, eventOrigin }
 */
function normalizeEbayOrder(order, ctx = {}) {
  const externalId = text(order?.orderId, 200);
  const lineItems = lineItemsOf(order);
  const payments = paymentsOf(order);
  const refunds = refundsOf(order);
  const instruction = (Array.isArray(order?.fulfillmentStartInstructions) ? order.fulfillmentStartInstructions : [])[0] || null;
  const shipping = addressOf(instruction);
  const cancelState = text(order?.cancelStatus?.cancelState).toUpperCase();
  const cancelled = cancelState === "CANCELED" || cancelState === "CANCELLED";
  const buyer = order?.buyer || {};
  const currency = text(order?.pricingSummary?.total?.currency, 8) || null;

  const reasons = [];
  if (!externalId) reasons.push("missing_external_id");
  if (!lineItems.length) reasons.push("no_line_items");
  if (ebayMoney(order?.pricingSummary?.total) === null) reasons.push("missing_total");
  // Not a rejection: a mixed or unstated tax liability is a question for the
  // studio, and the order still has to arrive so it can be asked.
  const taxResponsibility = taxResponsibilityOf(order);
  if (taxResponsibility === "unknown" && taxTotalOf(order) !== null) reasons.push("tax_responsibility_unknown");

  return buildEnvelope({
    identity: {
      provider: "ebay",
      connection_id: text(ctx.connectionId, 200),
      // The eBay site the sale happened on: the connection knows it, and each
      // line repeats it. `sellerId` is NOT a marketplace and must never stand
      // in for one — two sellers on the same site would look like two sites.
      marketplace_id: text(ctx.marketplaceId, 40)
        || text(order?.lineItems?.[0]?.listingMarketplaceId, 40)
        || null,
      entity_type: "order",
      external_id: externalId,
      external_updated_at: text(order?.lastModifiedDate) || text(order?.creationDate) || null,
      event_origin: ctx.eventOrigin || "provider"
    },
    order: {
      order_source: "ebay", sales_channel: "ebay", currency,
      subtotal: ebayMoney(order?.pricingSummary?.priceSubtotal),
      discount_total: ebayMoney(order?.pricingSummary?.priceDiscount),
      tax_total: taxTotalOf(order),
      // From eBay's own two tax arrays, never from the fact that it is eBay.
      tax_responsibility: taxResponsibility,
      // pricingSummary.total is what the buyer paid, tax inside it.
      tax_included_in_price: true,
      // Net of the discount, because eBay's own `total` is: a free-postage
      // promotion sends deliveryCost 4.99 AND deliveryDiscount 4.99, and
      // reading the charge alone made the components overshoot the total.
      shipping_total: netOf(order?.pricingSummary?.deliveryCost, order?.pricingSummary?.deliveryDiscount),
      grand_total: ebayMoney(order?.pricingSummary?.total),
      platform_status: cancelled ? "cancelled" : (text(order?.orderPaymentStatus).toLowerCase() || null),
      // A cancellation is not a payment state, and "cancelled" is not one of
      // the envelope's — buildEnvelope would coerce it to "unknown" and a
      // cancelled-and-refunded order would become indistinguishable from a
      // cancelled one the buyer is still owed. The cancellation is already
      // carried by platform_status and cancelled_at; this stays the money.
      payment_status: paymentStatusOf(order, payments, refunds),
      fulfillment_status: fulfillmentStatusOf(order),
      // When the cancellation COMPLETED. A request that sat pending for days
      // was being stamped with the day it was asked for, which can put the
      // cancellation in a period the order was still live in.
      cancelled_at: cancelled
        ? (text(order?.cancelStatus?.cancelledDate)
          || text(order?.cancelStatus?.cancelRequests?.[0]?.cancelCompletedDate)
          || text(order?.cancelStatus?.cancelRequests?.[0]?.cancelRequestedDate)
          || text(order?.lastModifiedDate) || null)
        : null,
      placed_at: text(order?.creationDate) || null,
      buyer_note: text(order?.buyerCheckoutNotes, 2000) || null,
      is_test: false,
      line_items: lineItems
    },
    customer: {
      // eBay gives a username, and an email only through its own masked relay.
      // The username is the stable identity; nothing else is invented.
      external_customer_id: text(buyer?.username, 120) || null,
      name: text(instruction?.shippingStep?.shipTo?.fullName, 200) || text(buyer?.username, 120) || null,
      email: text(buyer?.buyerRegistrationAddress?.email, 200).toLowerCase() || null,
      phone: text(instruction?.shippingStep?.shipTo?.primaryPhone?.phoneNumber, 60) || null,
      billing_address: shipping,
      shipping_address: shipping
    },
    payments,
    refunds,
    shipments: shipmentsOf(order, ctx),
    source: {
      provider_display_name: "eBay",
      connection_display_name: text(ctx.accountName, 200) || "eBay",
      // The seller's own site, not always ebay.co.uk: a German seller opening
      // a UK link lands on a page that cannot find their order. Resolved from
      // the same chain identity.marketplace_id uses — the connection's word,
      // then the line's own site — so a caller that passes no marketplaceId
      // does not send every order to the UK.
      external_admin_url: externalId
        ? `https://${(ebayMarketplace(ctx.marketplaceId || order?.lineItems?.[0]?.listingMarketplaceId) || { host: "www.ebay.co.uk" }).host}/mesh/ord/details?orderid=${encodeURIComponent(externalId)}`
        : null,
      provider_metadata: {
        version: 1, schema_version: 1,
        order_number: externalId,
        legacy_order_id: text(order?.legacyOrderId, 200) || null,
        seller_id: text(order?.sellerId, 120) || null,
        buyer_username: text(buyer?.username, 120) || null,
        payment_method: payments.map((p) => p.method).filter(Boolean).join(", ") || "eBay",
        // Kept because the studio's earnings are NOT the sale: eBay quotes the
        // seller's take after fees, and reading it as revenue would understate
        // the sale and hide the fee. It is recorded and used nowhere else.
        seller_earnings: ebayMoney(order?.paymentSummary?.totalDueSeller),
        fulfillment_status_raw: text(order?.orderFulfillmentStatus, 40) || null,
        payment_status_raw: text(order?.orderPaymentStatus, 40) || null,
        cancel_state: cancelState || null,
        // The seller's own charge or credit on the order. It is inside `total`,
        // so leaving it unrecorded made the components stop reconciling to the
        // figure eBay states, with nothing on the order to explain the gap.
        adjustment: ebayMoney(order?.pricingSummary?.adjustment),
        // The order's own fields, in the shape every connector uses: the
        // dashboard files a sale under `Source` and reads its currency from
        // "<Source> Currency", so a connector that skips these is counted as a
        // manual order in the studio's own currency.
        design_name: lineItems.map((li) => `${li.title} x${li.quantity}`).join(", ") || `eBay ${externalId}`,
        custom_fields: {
          Source: "eBay",
          "eBay Order ID": externalId,
          "eBay Order Number": text(order?.legacyOrderId, 200) || externalId,
          "eBay Status": text(order?.orderPaymentStatus, 40),
          "eBay Payment Method": payments.map((p) => p.method).filter(Boolean).join(", "),
          "eBay Currency": currency || "",
          "eBay Total": ebayMoney(order?.pricingSummary?.total) || "",
          "eBay Created At": text(order?.creationDate),
          "eBay Buyer": text(buyer?.username, 120),
          "eBay Products": lineItems.map((li) => `${li.title} x${li.quantity}`).join(", ")
        }
      }
    },
    review: { required: reasons.length > 0, reasons },
    raw_snapshot_ref: ctx.rawSnapshotRef || null
  });
}

module.exports = { normalizeEbayOrder, ebayMoney, taxResponsibilityOf, taxTotalOf, taxLinesOf, paymentReferenceOf, unitPriceOf };

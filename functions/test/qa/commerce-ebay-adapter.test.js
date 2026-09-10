// The eBay adapter, pure: a Sell Fulfillment API order → the same envelope the
// other connectors fill. Written from the specification
// (NivaDesk_Amazon_eBay_Integration_AI_Spec.md §19-§24, §35, §36, §39, §44,
// §58, §63, §79/§81) and from real getOrder payload shapes — never by reading
// back what the adapter happens to do.
//
// The rule that runs through all of it: whose tax a marketplace charged is a
// question eBay answers per line with a separate array, and one order cannot have two
// answers. merchant / platform / unknown — see functions/finance/engine.js.
const assert = require("assert");
const { normalizeEbayOrder, taxResponsibilityOf, taxTotalOf, ebayMoney } = require("../../commerce/adapters/ebay");
const { validateEnvelope, contentHash, identityDocId } = require("../../commerce/envelope");
let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 240)); } }

// eBay money is {value: "<decimal string>", currency: "<ISO>"} everywhere.
const money = (value, currency = "GBP") => ({ value, currency });

// A £90 signet ring, one of them. Line tax £19 collected by eBay, £5 delivery.
// eBay's line `total` is lineItemCost + deliveryCost + taxes (90 + 5 + 19).
const ring = (extra = {}) => ({
  lineItemId: "10001", legacyItemId: "110419977151", legacyVariationId: "660001",
  sku: "RING-1", title: "Signet ring", quantity: 1, soldFormat: "FIXED_PRICE",
  listingMarketplaceId: "EBAY_GB", purchaseMarketplaceId: "EBAY_GB", lineItemFulfillmentStatus: "NOT_STARTED",
  lineItemCost: money("90.00"), deliveryCost: { shippingCost: money("5.00") },
  // eBay does NOT have a `collectedBy` field on a tax line. It says whose tax
  // it is structurally: `taxes[]` is the SELLER's own tax table, and
  // `ebayCollectAndRemitTaxes[]` is tax eBay collected and remits itself. This
  // fixture was written against a field that does not exist, which made the
  // check green while the adapter read something else entirely.
  ebayCollectAndRemitTaxes: [{ taxType: "VAT", amount: money("19.00"), collectionMethod: "GROSS", ebayReference: { name: "VAT", value: "GB123456789" } }],
  total: money("114.00"),
  variationAspects: [{ name: "Size", value: "M" }],
  ...extra
});
// TWO wedding bands at £5 each: lineItemCost is the LINE (5 × 2 = 10.00), which
// is why pricingSummary.priceSubtotal is the sum of the lineItemCost values.
const band = (extra = {}) => ({
  lineItemId: "10002", legacyItemId: "110419977152", sku: "BAND-2", title: "Wedding band",
  quantity: 2, soldFormat: "FIXED_PRICE", listingMarketplaceId: "EBAY_GB", purchaseMarketplaceId: "EBAY_GB",
  lineItemFulfillmentStatus: "NOT_STARTED",
  lineItemCost: money("10.00"), deliveryCost: { shippingCost: money("0.00") },
  ebayCollectAndRemitTaxes: [{ taxType: "VAT", amount: money("2.00"), collectionMethod: "GROSS", ebayReference: { name: "VAT", value: "GB123456789" } }],
  total: money("12.00"), variationAspects: [],
  ...extra
});

const paidPayment = (extra = {}) => ({
  paymentMethod: "PAYPAL", paymentReferenceId: "PAY-9F2", paymentStatus: "PAID",
  paymentDate: "2026-09-02T09:02:00.000Z", amount: money("116.00"), ...extra
});
const shipTo = () => ({
  fulfillmentInstructionsType: "SHIP_TO", ebaySupportedFulfillment: false,
  minEstimatedDeliveryDate: "2026-09-08T09:00:00.000Z", maxEstimatedDeliveryDate: "2026-09-11T09:00:00.000Z",
  shippingStep: {
    shipTo: {
      fullName: "Ada Lovelace", email: "Ada@Example.com",
      contactAddress: { addressLine1: "10 Analytical Way", addressLine2: "Flat 3", city: "London", stateOrProvince: "Greater London", postalCode: "N1 1AA", countryCode: "GB" },
      primaryPhone: { phoneNumber: "+44 7700 900000" }
    },
    shippingCarrierCode: "Royal Mail", shippingServiceCode: "UK_RoyalMailSecondClassStandard"
  }
});

// 100.00 goods − 10.00 discount + 5.00 delivery + 21.00 tax = 116.00 the buyer paid.
// totalDueSeller (101.20) is that minus eBay's 14.80 fee: the seller's take, NOT the sale.
const order = (extra = {}) => ({
  orderId: "12-09113-42375",
  legacyOrderId: "170009134375-2314958900123",
  creationDate: "2026-09-02T09:00:00.000Z",
  lastModifiedDate: "2026-09-02T10:30:00.000Z",
  orderFulfillmentStatus: "NOT_STARTED",
  orderPaymentStatus: "PAID",
  sellerId: "eggcraft_uk",
  salesRecordReference: "1042",
  buyerCheckoutNotes: "please engrave AL",
  buyer: { username: "ada_l", buyerRegistrationAddress: { fullName: "Ada Lovelace", email: "Ada@Example.com", contactAddress: { addressLine1: "10 Analytical Way", city: "London", postalCode: "N1 1AA", countryCode: "GB" } } },
  pricingSummary: { priceSubtotal: money("100.00"), priceDiscount: money("10.00"), deliveryCost: money("5.00"), deliveryDiscount: money("0.00"), tax: money("21.00"), total: money("116.00") },
  cancelStatus: { cancelState: "NONE_REQUESTED", cancelRequests: [] },
  paymentSummary: { totalDueSeller: money("101.20"), payments: [paidPayment()], refunds: [] },
  fulfillmentStartInstructions: [shipTo()],
  lineItems: [ring(), band()],
  totalFeeBasisAmount: money("116.00"), totalMarketplaceFee: money("14.80"),
  ...extra
});
const ctx = { connectionId: "con_ebay_1", marketplaceId: "EBAY_GB", accountName: "EGGcraft", eventOrigin: "provider" };

// § 20/§65 — identity is provider + connection_id + entity_type + external_id.
check("identity, dates and the pricing summary come across (§20, §23)", () => {
  const env = normalizeEbayOrder(order(), ctx);
  assert.deepStrictEqual(validateEnvelope(env), []);
  assert.strictEqual(env.identity.provider, "ebay");
  assert.strictEqual(env.identity.connection_id, "con_ebay_1");
  assert.strictEqual(env.identity.marketplace_id, "EBAY_GB", "the eBay site, never the sellerId");
  assert.strictEqual(env.identity.entity_type, "order");
  assert.strictEqual(env.identity.external_id, "12-09113-42375");
  assert.strictEqual(env.identity.external_updated_at, "2026-09-02T10:30:00.000Z");
  assert.strictEqual(env.identity.event_origin, "provider");
  assert.strictEqual(env.order.placed_at, "2026-09-02T09:00:00.000Z");
  assert.strictEqual(env.order.order_source, "ebay"); assert.strictEqual(env.order.sales_channel, "ebay");
  assert.strictEqual(env.order.currency, "GBP");
  assert.strictEqual(env.order.subtotal, "100.00"); assert.strictEqual(env.order.discount_total, "10.00");
  assert.strictEqual(env.order.shipping_total, "5.00"); assert.strictEqual(env.order.tax_total, "21.00");
  assert.strictEqual(env.order.grand_total, "116.00");
  assert.strictEqual(env.order.payment_status, "paid");
  assert.strictEqual(env.order.fulfillment_status, "unfulfilled", "orderFulfillmentStatus NOT_STARTED");
  assert.strictEqual(env.order.platform_status, "paid");
  assert.strictEqual(env.order.is_test, false);
  assert.strictEqual(env.review.required, false); assert.deepStrictEqual(env.review.reasons, []);
});

// §39/§40 — order total and order earnings have different authoritative sources.
check("the sale is pricingSummary.total; totalDueSeller is the take after fees, not revenue (§39)", () => {
  const env = normalizeEbayOrder(order(), ctx);
  assert.strictEqual(env.order.grand_total, "116.00", "what the buyer paid");
  assert.notStrictEqual(env.order.grand_total, "101.20", "totalDueSeller would understate the sale and hide the £14.80 fee");
  assert.strictEqual(env.source.provider_metadata.seller_earnings, "101.20", "kept, but only as provider metadata");
  assert.strictEqual(env.source.provider_display_name, "eBay");
  assert.strictEqual(env.source.provider_metadata.legacy_order_id, "170009134375-2314958900123");
  assert.strictEqual(env.source.provider_metadata.seller_id, "eggcraft_uk");
  assert.strictEqual(env.source.provider_metadata.buyer_username, "ada_l");
  // §63 — the raw payload is preserved out of band, never re-shaped into columns.
  assert.strictEqual(env.raw_snapshot_ref, null);
  assert.strictEqual(env.schema_version, 1);
});

check("a line carries the goods it sold: per-unit price and extended goods total, tax and delivery excluded", () => {
  const env = normalizeEbayOrder(order(), ctx);
  assert.strictEqual(env.order.line_items.length, 2);
  const line = env.order.line_items[0];
  assert.strictEqual(line.external_line_id, "10001");
  assert.strictEqual(line.sku, "RING-1");
  assert.strictEqual(line.title, "Signet ring");
  assert.strictEqual(line.product_external_id, "110419977151", "the eBay listing id (§21)");
  assert.strictEqual(line.quantity, 1);
  assert.strictEqual(line.unit_price, "90.00");
  assert.strictEqual(line.line_total, "90.00", "eBay's line `total` is 114.00 = goods + delivery + tax; that is not the goods line");
  assert.deepStrictEqual(line.properties, [{ name: "Size", value: "M" }]);
});

check("multi-quantity: lineItemCost is the LINE, so the unit price is that divided by quantity", () => {
  const env = normalizeEbayOrder(order(), ctx);
  const line = env.order.line_items[1];
  assert.strictEqual(line.quantity, 2);
  assert.strictEqual(line.line_total, "10.00", "two bands at £5 = lineItemCost");
  assert.strictEqual(line.unit_price, "5.00", "one band");
  const goods = env.order.line_items.reduce((sum, li) => sum + Number(li.line_total), 0).toFixed(2);
  assert.strictEqual(goods, env.order.subtotal, "the goods lines must add up to priceSubtotal");
  assert.strictEqual((Number(env.order.subtotal) - Number(env.order.discount_total) + Number(env.order.shipping_total) + Number(env.order.tax_total)).toFixed(2), env.order.grand_total);
});

check("buyer, checkout note and shipping address (§23, §25)", () => {
  const env = normalizeEbayOrder(order(), ctx);
  assert.strictEqual(env.customer.external_customer_id, "ada_l", "the username is the stable eBay identity");
  assert.strictEqual(env.customer.name, "Ada Lovelace");
  assert.strictEqual(env.customer.email, "ada@example.com");
  assert.strictEqual(env.customer.phone, "+44 7700 900000");
  assert.strictEqual(env.customer.identity_confidence, "external_id");
  assert.strictEqual(env.customer.shipping_address.street, "10 Analytical Way, Flat 3");
  assert.strictEqual(env.customer.shipping_address.city, "London");
  assert.strictEqual(env.customer.shipping_address.postalCode, "N1 1AA");
  assert.strictEqual(env.customer.shipping_address.country, "GB");
  assert.strictEqual(env.order.buyer_note, "please engrave AL", "buyerCheckoutNotes is where an engraving instruction arrives");
});

// §44 — TaxResponsibility: seller | marketplace | unknown. The engine spells the
// first two merchant | platform and normalises both spellings.
check("tax in ebayCollectAndRemitTaxes is the platform's, because eBay remits it (§44)", () => {
  const env = normalizeEbayOrder(order(), ctx);
  assert.strictEqual(env.order.tax_responsibility, "platform");
  assert.strictEqual(env.order.tax_total, "21.00");
  assert.strictEqual(env.order.tax_included_in_price, true, "pricingSummary.total already contains the tax");
  assert.ok(!env.review.reasons.includes("tax_responsibility_unknown"), "eBay answered, so nothing to ask");
  assert.strictEqual(taxResponsibilityOf(order()), "platform");
  // A zero-amount tax line states no liability and must not drag the answer to unknown.
  const withZero = order({ lineItems: [ring(), band({ ebayCollectAndRemitTaxes: [], taxes: [{ taxType: "VAT", amount: money("0.00") }], total: money("10.00") })] });
  assert.strictEqual(normalizeEbayOrder(withZero, ctx).order.tax_responsibility, "platform");
});

check("tax in the seller's own taxes[] table is the merchant's (§44)", () => {
  const sellerTax = order({
    lineItems: [
      ring({ ebayCollectAndRemitTaxes: [], taxes: [{ taxType: "VAT", amount: money("19.00") }] }),
      band({ ebayCollectAndRemitTaxes: [], taxes: [{ taxType: "VAT", amount: money("2.00") }] })
    ]
  });
  const env = normalizeEbayOrder(sellerTax, ctx);
  assert.deepStrictEqual(validateEnvelope(env), []);
  assert.strictEqual(env.order.tax_responsibility, "merchant", "the studio declares this VAT");
  assert.strictEqual(env.order.tax_total, "21.00");
  assert.ok(!env.review.reasons.includes("tax_responsibility_unknown"));
  assert.strictEqual(taxResponsibilityOf(sellerTax), "merchant");
});

check("a MIXED order has no single answer: unknown, and it asks (§44)", () => {
  const mixed = order({
    lineItems: [
      ring(),                                                                                  // eBay collects and remits
      band({ ebayCollectAndRemitTaxes: [], taxes: [{ taxType: "VAT", amount: money("2.00") }] }) // the studio's own tax table
    ]
  });
  const env = normalizeEbayOrder(mixed, ctx);
  assert.deepStrictEqual(validateEnvelope(env), []);
  assert.strictEqual(env.order.tax_responsibility, "unknown", "guessing here moves a real VAT return");
  assert.strictEqual(env.order.tax_total, "21.00", "the money is still shown");
  assert.strictEqual(env.review.required, true);
  assert.ok(env.review.reasons.includes("tax_responsibility_unknown"), env.review.reasons.join(","));
  assert.strictEqual(taxResponsibilityOf(mixed), "unknown");
});

check("an order with no tax at all states none and asks nothing", () => {
  const noTax = order({
    // BOTH tax arrays cleared, and no summary tax: eBay charged nothing.
    lineItems: [ring({ taxes: [], ebayCollectAndRemitTaxes: [], total: money("95.00") }), band({ taxes: [], ebayCollectAndRemitTaxes: [], total: money("10.00") })],
    pricingSummary: { priceSubtotal: money("100.00"), priceDiscount: money("10.00"), deliveryCost: money("5.00"), total: money("95.00") },
    paymentSummary: { totalDueSeller: money("83.00"), payments: [paidPayment({ amount: money("95.00") })], refunds: [] }
  });
  const env = normalizeEbayOrder(noTax, ctx);
  assert.deepStrictEqual(validateEnvelope(env), []);
  assert.strictEqual(env.order.tax_total, null, "MERGE-004: never invent a zero the provider did not state");
  assert.strictEqual(env.order.grand_total, "95.00");
  assert.strictEqual(env.order.payment_status, "paid");
  assert.strictEqual(env.order.tax_responsibility, "unknown");
  assert.ok(!env.review.reasons.includes("tax_responsibility_unknown"), "there is no tax to ask about");
  assert.strictEqual(taxTotalOf(noTax), null);
});

check("tax eBay states only at order level is still tax, and still has to be asked about (§44)", () => {
  const orderLevel = order({
    // Neither array on any line, so no line says who collected it, while
    // pricingSummary.tax stays "21.00": eBay said £21 was charged and not by whom.
    lineItems: [ring({ taxes: [], ebayCollectAndRemitTaxes: [], total: money("95.00") }), band({ taxes: [], ebayCollectAndRemitTaxes: [], total: money("10.00") })]
  });
  const env = normalizeEbayOrder(orderLevel, ctx);
  assert.deepStrictEqual(validateEnvelope(env), []);
  assert.strictEqual(env.order.tax_total, "21.00", "pricingSummary.tax is eBay's own total and must not be dropped");
  assert.strictEqual(env.order.grand_total, "116.00");
  assert.strictEqual(env.order.tax_responsibility, "unknown");
  assert.ok(env.review.reasons.includes("tax_responsibility_unknown"), env.review.reasons.join(","));
});

check("a partially paid order: pending money is not money, failed money never was (§23)", () => {
  const partly = order({
    orderPaymentStatus: "PENDING",
    paymentSummary: {
      totalDueSeller: money("101.20"),
      payments: [
        paidPayment({ paymentReferenceId: "PAY-A", amount: money("50.00") }),
        paidPayment({ paymentReferenceId: "PAY-B", paymentStatus: "PENDING", amount: money("66.00") }),
        paidPayment({ paymentReferenceId: "PAY-C", paymentStatus: "FAILED", amount: money("116.00") })
      ],
      refunds: []
    }
  });
  const env = normalizeEbayOrder(partly, ctx);
  assert.deepStrictEqual(validateEnvelope(env), []);
  assert.strictEqual(env.order.payment_status, "partially_paid");
  assert.strictEqual(env.order.platform_status, "pending");
  assert.strictEqual(env.order.grand_total, "116.00", "what is owed does not change with what has landed");
  assert.strictEqual(env.payments.length, 2, "the FAILED attempt is not a payment");
  assert.ok(!env.payments.some((p) => String(p.status).toLowerCase() === "failed"));
  assert.strictEqual(env.payments[0].amount, "50.00"); assert.strictEqual(env.payments[0].currency, "GBP");
});

check("refunds are their own record and never overwrite the sale (§36)", () => {
  const refund = (extra = {}) => ({ refundId: "REF-1", refundReferenceId: "REF-1", refundStatus: "REFUNDED", refundDate: "2026-09-03T08:00:00.000Z", amount: money("116.00"), ...extra });
  const full = normalizeEbayOrder(order({
    orderPaymentStatus: "FULLY_REFUNDED",
    paymentSummary: { totalDueSeller: money("0.00"), payments: [paidPayment()], refunds: [refund()] }
  }), ctx);
  assert.deepStrictEqual(validateEnvelope(full), []);
  assert.strictEqual(full.order.payment_status, "refunded");
  assert.strictEqual(full.order.grand_total, "116.00", "the original order keeps its total; the refund is a separate adjustment");
  assert.strictEqual(full.refunds.length, 1); assert.strictEqual(full.refunds[0].amount, "116.00"); assert.strictEqual(full.refunds[0].currency, "GBP");

  const partial = normalizeEbayOrder(order({
    orderPaymentStatus: "PARTIALLY_REFUNDED",
    paymentSummary: { totalDueSeller: money("81.20"), payments: [paidPayment()], refunds: [refund({ refundId: "REF-2", refundReferenceId: "REF-2", amount: money("20.00") })] }
  }), ctx);
  assert.deepStrictEqual(validateEnvelope(partial), []);
  assert.strictEqual(partial.order.payment_status, "partially_refunded");
  assert.strictEqual(partial.order.grand_total, "116.00");
  assert.strictEqual(partial.refunds[0].amount, "20.00");
  assert.strictEqual(partial.order.tax_total, "21.00", "a refund does not silently re-cut the tax either");
});

check("a cancelled order says cancelled without forgetting what the buyer paid (§79 cancel)", () => {
  const env = normalizeEbayOrder(order({
    orderPaymentStatus: "FULLY_REFUNDED",
    cancelStatus: { cancelState: "CANCELED", cancelledDate: "2026-09-02T12:05:00.000Z", cancelRequests: [{ cancelRequestedDate: "2026-09-02T12:00:00.000Z", cancelState: "CANCELED", cancelCompletedDate: "2026-09-02T12:05:00.000Z" }] },
    paymentSummary: { totalDueSeller: money("0.00"), payments: [paidPayment()], refunds: [{ refundId: "REF-9", refundReferenceId: "REF-9", refundStatus: "REFUNDED", refundDate: "2026-09-02T12:05:00.000Z", amount: money("116.00") }] }
  }), ctx);
  assert.deepStrictEqual(validateEnvelope(env), []);
  assert.strictEqual(env.order.platform_status, "cancelled");
  // The date the cancellation COMPLETED, not the date it was asked for: a
  // request that sits pending for days would otherwise stamp the cancellation
  // into a period the order was still live in.
  assert.strictEqual(env.order.cancelled_at, "2026-09-02T12:05:00.000Z");
  assert.strictEqual(env.order.grand_total, "116.00");
  assert.strictEqual(env.source.provider_metadata.cancel_state, "CANCELED");
  // "cancelled" is not a payment status, and losing the real one to "unknown"
  // leaves the Finance Engine unable to tell a refunded cancellation from an
  // unrefunded one. The money story is: it was paid, then it came back.
  assert.strictEqual(env.order.payment_status, "refunded");
});

// §36 refund model and §58 idempotency both hang on the provider's own ids;
// §81 lists "refund idempotency" as a required test.
check("payments and refunds keep their external ids and timestamps (§36, §58)", () => {
  const env = normalizeEbayOrder(order({
    paymentSummary: {
      totalDueSeller: money("81.20"),
      payments: [paidPayment()],
      refunds: [{ refundId: "REF-1", refundReferenceId: "REF-1", refundStatus: "REFUNDED", refundDate: "2026-09-03T08:00:00.000Z", amount: money("20.00") }]
    }
  }), ctx);
  assert.strictEqual(env.payments[0].external_id, "PAY-9F2", "without it a resent payment cannot be recognised");
  assert.strictEqual(env.payments[0].at, "2026-09-02T09:02:00.000Z");
  assert.strictEqual(env.payments[0].status, "paid");
  assert.strictEqual(env.refunds[0].external_id, "REF-1", "refund idempotency needs the eBay refund id");
  assert.strictEqual(env.refunds[0].at, "2026-09-03T08:00:00.000Z");
});

// §35 — a shipment is read from getShippingFulfillments and carries line item,
// quantity, tracking, carrier and an external fulfilment id.
// fulfillmentStartInstructions is the instruction to ship, and carries none of that.
check("a shipping instruction is not a shipment (§35)", () => {
  const env = normalizeEbayOrder(order(), ctx);
  assert.strictEqual(env.order.fulfillment_status, "unfulfilled");
  assert.deepStrictEqual(env.shipments, [], "nothing has been shipped, so there is no shipment and no shipped date");
});

check("partial fulfilment is reported as partial (§24, §35)", () => {
  const env = normalizeEbayOrder(order({ orderFulfillmentStatus: "IN_PROGRESS" }), ctx);
  assert.strictEqual(env.order.fulfillment_status, "partial");
  assert.strictEqual(normalizeEbayOrder(order({ orderFulfillmentStatus: "FULFILLED" }), ctx).order.fulfillment_status, "fulfilled");
  assert.strictEqual(normalizeEbayOrder(order({ orderFulfillmentStatus: "SOMETHING_NEW" }), ctx).order.fulfillment_status, "unknown", "§63: an unknown status is unknown, not a guess");
});

check("the same order delivered twice is the same envelope (§58, §79 duplicate ×10)", () => {
  const webhook = normalizeEbayOrder(order(), ctx);
  const reconciled = normalizeEbayOrder(order(), { ...ctx, eventOrigin: "reconcile" });
  assert.strictEqual(contentHash(webhook), contentHash(reconciled), "the same state must not look like a change");
  assert.strictEqual(identityDocId(webhook.identity), identityDocId(reconciled.identity));
  assert.strictEqual(identityDocId(webhook.identity), "ebay__con_ebay_1__order__12-09113-42375");
  const changed = normalizeEbayOrder(order({ orderFulfillmentStatus: "FULFILLED", lastModifiedDate: "2026-09-04T10:00:00.000Z" }), ctx);
  assert.notStrictEqual(contentHash(webhook), contentHash(changed), "a real change must hash differently");
  assert.strictEqual(ebayMoney(money("7.5")), "7.50");
  assert.strictEqual(ebayMoney(null), null);
});

check("a malformed order is flagged for review rather than dropped (§63)", () => {
  const broken = normalizeEbayOrder(order({ orderId: "", lineItems: [], pricingSummary: {} }), ctx);
  for (const reason of ["missing_external_id", "no_line_items", "missing_total"]) assert.ok(broken.review.reasons.includes(reason), reason);
  assert.strictEqual(broken.review.required, true);
  assert.deepStrictEqual(validateEnvelope(broken), ["identity.external_id"], "no id means it cannot be applied");
});

check("every fixture in this file produces an applicable envelope", () => {
  const cases = {
    normal: order(),
    sellerTax: order({ lineItems: [ring({ taxes: [{ taxType: "VAT", amount: money("19.00"), collectedBy: "Seller" }] }), band({ taxes: [{ taxType: "VAT", amount: money("2.00"), collectedBy: "Seller" }] })] }),
    mixedTax: order({ lineItems: [ring(), band({ taxes: [{ taxType: "VAT", amount: money("2.00"), collectedBy: "Seller" }] })] }),
    noTax: order({ lineItems: [ring({ taxes: [], total: money("95.00") }), band({ taxes: [], total: money("10.00") })], pricingSummary: { priceSubtotal: money("100.00"), priceDiscount: money("10.00"), deliveryCost: money("5.00"), total: money("95.00") } }),
    partiallyPaid: order({ orderPaymentStatus: "PENDING", paymentSummary: { totalDueSeller: money("101.20"), payments: [paidPayment({ amount: money("50.00") })], refunds: [] } }),
    refunded: order({ orderPaymentStatus: "FULLY_REFUNDED", paymentSummary: { totalDueSeller: money("0.00"), payments: [paidPayment()], refunds: [{ refundReferenceId: "REF-1", refundStatus: "REFUNDED", refundDate: "2026-09-03T08:00:00.000Z", amount: money("116.00") }] } }),
    cancelled: order({ cancelStatus: { cancelState: "CANCELED", cancelledDate: "2026-09-02T12:05:00.000Z", cancelRequests: [{ cancelRequestedDate: "2026-09-02T12:00:00.000Z" }] } }),
    noBuyerAddress: order({ fulfillmentStartInstructions: [], buyer: { username: "ada_l" } })
  };
  for (const [name, raw] of Object.entries(cases)) {
    const env = normalizeEbayOrder(raw, ctx);
    assert.deepStrictEqual(validateEnvelope(env), [], name);
    assert.ok(["merchant", "platform", "unknown"].includes(env.order.tax_responsibility), `${name} tax_responsibility`);
    assert.ok(env.order.currency === "GBP", `${name} currency`);
  }
});

// §8.3 — the admin link is the order's OWN site. With no ctx.marketplaceId the
// first version fell back to ebay.co.uk for every order, the exact bug the
// adapter's own comment warned about, while identity.marketplace_id read the
// line's listingMarketplaceId correctly. Both layers must use the same chain.
check("a DE order with no ctx.marketplaceId links to ebay.de, not ebay.co.uk", () => {
  const german = order({ lineItems: [ring({ listingMarketplaceId: "EBAY_DE", purchaseMarketplaceId: "EBAY_DE" }), band({ listingMarketplaceId: "EBAY_DE", purchaseMarketplaceId: "EBAY_DE" })] });
  const env = normalizeEbayOrder(german, { connectionId: "con_ebay_1", accountName: "EGGcraft", eventOrigin: "provider" });
  assert.strictEqual(env.identity.marketplace_id, "EBAY_DE");
  assert.ok(env.source.external_admin_url.startsWith("https://www.ebay.de/"), env.source.external_admin_url);
  assert.ok(env.source.external_admin_url.includes("orderid=12-09113-42375"));
  // The connection's word still wins when it is given.
  assert.ok(normalizeEbayOrder(german, { ...ctx, marketplaceId: "EBAY_US" }).source.external_admin_url.startsWith("https://www.ebay.com/"));
  // An unknown site falls back to the UK host rather than producing a broken link.
  assert.ok(normalizeEbayOrder(order({ lineItems: [ring({ listingMarketplaceId: "EBAY_XX" })] }), { connectionId: "c" }).source.external_admin_url.startsWith("https://www.ebay.co.uk/"));
});

console.log(failures === 0 ? "\n✅ COMMERCE EBAY ADAPTER GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);

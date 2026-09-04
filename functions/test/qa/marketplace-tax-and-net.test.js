// The five ways a marketplace order can quietly report the wrong money.
//
// Each of these was real in the first version of the Amazon and eBay adapters,
// and each survived a suite of thirty-two other checks, because they all look
// right until the exact payload arrives:
//
//   1. An Amazon item with no TaxCollection block was invisible to the verdict,
//      so a mixed order was declared marketplace-collected on the strength of
//      the items that WERE tagged — and the untagged half's VAT disappeared
//      from the studio's return.
//   2. Amazon states a charge and its reversal side by side. Reading
//      ShippingPrice without ShippingDiscount overstated the shipping on every
//      discounted order; the same for the two tax reversals.
//   3. eBay does the same with deliveryCost and deliveryDiscount.
//   4. A FAILED eBay refund is money that never left, and counting it took a
//      real sale back out of revenue.
//   5. A guard against inventing a unit price compared the unrounded quotient
//      with itself, so it was true for every input and guarded nothing.
const assert = require("assert");
const { normalizeAmazonOrder, taxResponsibilityOf } = require("../../commerce/adapters/amazon");
const { normalizeEbayOrder } = require("../../commerce/adapters/ebay");
const { validateEnvelope } = require("../../commerce/envelope");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const gbp = (amount) => ({ CurrencyCode: "GBP", Amount: String(amount) });
const amazonCtx = (items) => ({ connectionId: "con_amz_1", sellerId: "S1", accountName: "Ada", items });
const amazonOrder = (extra = {}) => ({
  AmazonOrderId: "206-1234567-7654321", MarketplaceId: "A1F83G8C2ARO7P",
  PurchaseDate: "2026-08-30T10:00:00Z", LastUpdateDate: "2026-08-31T11:02:00Z",
  OrderStatus: "Unshipped", FulfillmentChannel: "MFN", OrderTotal: gbp("125.99"),
  ShippingAddress: { Name: "Ada Lovelace", AddressLine1: "10 Analytical Way", City: "London", StateOrRegion: "Greater London", PostalCode: "N1 1AA", CountryCode: "GB" },
  ...extra
});
const amazonItem = (extra = {}) => ({
  OrderItemId: "1", ASIN: "B000000001", SellerSKU: "RING-1", Title: "Signet ring",
  QuantityOrdered: 1, ItemPrice: gbp("100.00"), ItemTax: gbp("20.00"),
  TaxCollection: { Model: "MarketplaceFacilitator", ResponsibleParty: "Amazon Services Europe S.a.r.L." },
  ...extra
});

const money = (value) => ({ value: String(value), currency: "GBP" });
const ebayOrder = (extra = {}) => ({
  orderId: "12-34567-89012", legacyOrderId: "123456789012-0",
  creationDate: "2026-09-01T09:00:00.000Z", lastModifiedDate: "2026-09-01T09:30:00.000Z",
  orderPaymentStatus: "PAID", orderFulfillmentStatus: "NOT_STARTED",
  buyer: { username: "ada_l" },
  pricingSummary: { priceSubtotal: money("100.00"), deliveryCost: money("4.99"), total: money("120.00") },
  lineItems: [{ lineItemId: "L1", legacyItemId: "111", sku: "RING-1", title: "Signet ring", quantity: 1, lineItemCost: money("100.00"), total: money("120.00"), taxes: [{ amount: money("20.00"), collectedBy: "ebay" }] }],
  paymentSummary: { payments: [{ paymentMethod: "PAYPAL", paymentStatus: "PAID", amount: money("120.00"), paymentDate: "2026-09-01T09:05:00.000Z", paymentReferenceId: "P1" }], refunds: [] },
  ...extra
});

// ---- 1. an untagged item is unanswered, not absent ---------------------------

check("an Amazon item with no tax block makes the whole order unanswered", () => {
  const mixed = [amazonItem(), amazonItem({ OrderItemId: "2", TaxCollection: undefined, ItemTax: gbp("4.00") })];
  assert.strictEqual(
    taxResponsibilityOf(amazonOrder(), mixed),
    "unknown",
    "the tagged items carried the verdict and the untagged item's VAT left the studio's return"
  );
  const env = normalizeAmazonOrder(amazonOrder(), amazonCtx(mixed));
  assert.deepStrictEqual(validateEnvelope(env), []);
  assert.strictEqual(env.order.tax_responsibility, "unknown");
  assert.ok(env.review.reasons.includes("tax_responsibility_unknown"), "and it has to be asked about");
});

check("an order where every item agrees still gets a confident answer", () => {
  const all = [amazonItem(), amazonItem({ OrderItemId: "2" })];
  assert.strictEqual(taxResponsibilityOf(amazonOrder(), all), "platform");
  const standard = [
    amazonItem({ TaxCollection: { Model: "Standard" } }),
    amazonItem({ OrderItemId: "2", TaxCollection: { Model: "Standard" } })
  ];
  assert.strictEqual(taxResponsibilityOf(amazonOrder(), standard), "merchant");
});

check("an order-level tax block covers items that carry none of their own", () => {
  // Amazon states it per item, but where the order says it and the items do not
  // contradict it, the order has been answered.
  const items = [amazonItem({ TaxCollection: undefined }), amazonItem({ OrderItemId: "2", TaxCollection: undefined })];
  const order = amazonOrder({ TaxCollection: { Model: "MarketplaceFacilitator" } });
  assert.strictEqual(taxResponsibilityOf(order, items), "platform");
});

// ---- 2 and 3. a charge is only true with its reversal ------------------------

check("Amazon's shipping is net of the discount stated beside it", () => {
  const items = [amazonItem({ ShippingPrice: gbp("4.99"), ShippingDiscount: gbp("4.99") })];
  const env = normalizeAmazonOrder(amazonOrder(), amazonCtx(items));
  assert.strictEqual(env.order.shipping_total, "0.00", "free postage reported as a £4.99 charge");
  // The order total and the line's own figure are computed by two separate
  // expressions, and the first version of this check only exercised one of
  // them — so breaking the line arithmetic left the test green.
  const shippingProperty = env.order.line_items[0].properties.find((p) => p.name === "Shipping");
  assert.ok(shippingProperty, "the line no longer reports its shipping at all");
  assert.strictEqual(shippingProperty.value, "0.00", "the line kept the gross charge while the order total netted it");
});

check("and so is Amazon's tax, both of the reversals it can carry", () => {
  const items = [amazonItem({
    ItemTax: gbp("20.00"),
    ShippingPrice: gbp("4.99"), ShippingTax: gbp("1.00"), ShippingDiscountTax: gbp("1.00"),
    PromotionDiscountTax: gbp("2.00")
  })];
  const env = normalizeAmazonOrder(amazonOrder(), amazonCtx(items));
  // 20.00 item tax + (1.00 - 1.00) shipping tax - 2.00 promotion tax
  assert.strictEqual(env.order.tax_total, "18.00");
});

check("eBay's delivery is net of its discount, the way eBay's own total is", () => {
  const env = normalizeEbayOrder(ebayOrder({
    pricingSummary: { priceSubtotal: money("100.00"), deliveryCost: money("4.99"), deliveryDiscount: money("4.99"), total: money("120.00") }
  }), { connectionId: "con_ebay_1" });
  assert.strictEqual(env.order.shipping_total, "0.00", "a free-postage promotion reported the full charge");
  assert.strictEqual(env.order.grand_total, "120.00", "and the provider's own total is never rebuilt");
});

// ---- 4. a refund that failed is not a refund --------------------------------

check("a FAILED eBay refund does not take the sale back out of revenue", () => {
  const env = normalizeEbayOrder(ebayOrder({
    paymentSummary: {
      payments: [{ paymentMethod: "PAYPAL", paymentStatus: "PAID", amount: money("120.00"), paymentReferenceId: "P1" }],
      refunds: [{ refundStatus: "FAILED", amount: money("120.00"), refundReferenceId: "R1" }]
    }
  }), { connectionId: "con_ebay_1" });
  assert.deepStrictEqual(env.refunds, [], "money that never left was recorded as returned");
  assert.strictEqual(env.order.payment_status, "paid");
});

check("a refund that went through is still a refund", () => {
  const env = normalizeEbayOrder(ebayOrder({
    paymentSummary: {
      payments: [{ paymentMethod: "PAYPAL", paymentStatus: "PAID", amount: money("120.00"), paymentReferenceId: "P1" }],
      refunds: [{ refundStatus: "REFUNDED", amount: money("120.00"), refundReferenceId: "R1", refundDate: "2026-09-02T10:00:00.000Z" }]
    }
  }), { connectionId: "con_ebay_1" });
  assert.strictEqual(env.refunds.length, 1);
  assert.strictEqual(env.refunds[0].external_id, "R1", "the id the idempotency key needs");
  assert.strictEqual(env.refunds[0].at, "2026-09-02T10:00:00.000Z");
  assert.strictEqual(env.order.payment_status, "refunded");
});

// ---- 5. a unit price is stated, never invented -------------------------------

check("a line that divides into whole pennies gets its unit price", () => {
  const env = normalizeEbayOrder(ebayOrder({
    lineItems: [{ lineItemId: "L1", title: "Band", quantity: 2, lineItemCost: money("10.00"), taxes: [] }]
  }), { connectionId: "con_ebay_1" });
  assert.strictEqual(env.order.line_items[0].unit_price, "5.00", "the extended amount was reported as the unit price");
  assert.strictEqual(env.order.line_items[0].line_total, "10.00");
});

check("a line that does not divide cleanly says nothing rather than inventing a penny", () => {
  const env = normalizeEbayOrder(ebayOrder({
    lineItems: [{ lineItemId: "L1", title: "Charm", quantity: 3, lineItemCost: money("10.00"), taxes: [] }]
  }), { connectionId: "con_ebay_1" });
  assert.strictEqual(env.order.line_items[0].unit_price, null, "£3.33 x 3 is £9.99, which is not what the buyer paid");
  assert.strictEqual(env.order.line_items[0].line_total, "10.00");
});

check("Amazon divides its extended ItemPrice the same way", () => {
  const clean = normalizeAmazonOrder(amazonOrder(), amazonCtx([amazonItem({ QuantityOrdered: 4, ItemPrice: gbp("100.00") })]));
  assert.strictEqual(clean.order.line_items[0].unit_price, "25.00");
  const ragged = normalizeAmazonOrder(amazonOrder(), amazonCtx([amazonItem({ QuantityOrdered: 3, ItemPrice: gbp("100.00") })]));
  assert.strictEqual(ragged.order.line_items[0].unit_price, null);
  assert.strictEqual(ragged.order.line_items[0].line_total, "100.00", "the extended amount is always kept");
});

// ---- the address every consumer reads ---------------------------------------

check("both adapters write the address keys the order document reads", () => {
  // envelopeToOrder's addressText reads `state`, and shippingPostalCode reads
  // `postalCode`. snake_case here meant the county and the postcode vanished.
  const amazon = normalizeAmazonOrder(amazonOrder(), amazonCtx([amazonItem()]));
  assert.strictEqual(amazon.customer.shipping_address.postalCode, "N1 1AA");
  assert.strictEqual(amazon.customer.shipping_address.state, "Greater London");
  const ebay = normalizeEbayOrder(ebayOrder({
    fulfillmentStartInstructions: [{ shippingStep: { shipTo: { fullName: "Ada", contactAddress: { addressLine1: "10 Analytical Way", city: "London", stateOrProvince: "Greater London", postalCode: "N1 1AA", countryCode: "GB" } } } }]
  }), { connectionId: "con_ebay_1" });
  assert.strictEqual(ebay.customer.shipping_address.postalCode, "N1 1AA");
  assert.strictEqual(ebay.customer.shipping_address.state, "Greater London");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ MARKETPLACE TAX + NET GEÇTİ");
})();

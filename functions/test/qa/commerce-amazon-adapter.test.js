// Amazon Faz 1, pure: the SP-API order adapter against MFN / FBA / Pending /
// Canceled / items-not-yet-fetched fixtures, the tax-responsibility decision the
// finance engine depends on (§44), the fulfilment source inventory depends on
// (§28), Amazon's EXTENDED ItemPrice (§15), multi-currency (§43, §79) and the
// identity + content-hash contract a duplicate or replayed event must not break
// (§58, §63).
//
// Written from NivaDesk_Amazon_eBay_Integration_AI_Spec.md and from real SP-API
// payload shapes, NOT from what the adapter happens to do. Where the two
// disagree the assertion states what SHOULD happen and the failure is the
// finding.
const assert = require("assert");
const { normalizeAmazonOrder, amazonMoney, taxResponsibilityOf, fulfilmentSourceOf } = require("../../commerce/adapters/amazon");
const { validateEnvelope, contentHash, identityDocId } = require("../../commerce/envelope");
const { normalizeTaxResponsibility, TAX_MERCHANT, TAX_PLATFORM, TAX_UNKNOWN } = require("../../finance/engine");
let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name), (error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 260)); }); }

// SP-API money is { CurrencyCode, Amount: "40.00" } — a decimal STRING, never minor units.
const money = (amount, currency = "GBP") => ({ CurrencyCode: currency, Amount: amount });
// SP-API puts TaxCollection on the ORDER ITEM, not on the order (§44 evidence).
const FACILITATOR = { Model: "MarketplaceFacilitator", ResponsibleParty: "Amazon Services Europe S.a.r.L." };
const STANDARD = { Model: "Standard", ResponsibleParty: "EGGcraft Ltd" };
const UK = "A1F83G8C2ARO7P";
const DE = "A1PA6795UKMFR9";

const mfnOrder = (extra = {}) => ({
  AmazonOrderId: "206-1234567-7654321", SellerOrderId: "1042",
  PurchaseDate: "2026-08-30T09:15:22Z", LastUpdateDate: "2026-08-31T11:02:00Z",
  OrderStatus: "Unshipped", FulfillmentChannel: "MFN", SalesChannel: "Amazon.co.uk",
  MarketplaceId: UK, OrderTotal: money("125.99"),
  NumberOfItemsShipped: 0, NumberOfItemsUnshipped: 2,
  PaymentMethod: "Other", PaymentMethodDetails: ["CreditCard"],
  IsPrime: false, IsBusinessOrder: false, IsReplacementOrder: false, IsPremiumOrder: false,
  EarliestShipDate: "2026-08-31T00:00:00Z", LatestShipDate: "2026-09-02T23:59:59Z",
  ShippingAddress: { Name: "Ada Lovelace", AddressLine1: "10 Analytical Way", AddressLine2: "Flat 3", City: "London", StateOrRegion: "Greater London", PostalCode: "N1 1AA", CountryCode: "GB", Phone: "+44 7700 900000" },
  BuyerInfo: { BuyerEmail: "k3j4h5x@marketplace.amazon.co.uk", BuyerName: "Ada Lovelace" },
  ...extra
});
// Sum check: 80.00 + 20.00 items + 21.00 tax + 4.99 shipping = 125.99 OrderTotal.
const mfnItems = (tax = FACILITATOR) => ([
  { OrderItemId: "51234567890123", ASIN: "B08N5WRWNW", SellerSKU: "RING-SIG-01", Title: "Handmade signet ring, 9ct gold", QuantityOrdered: 1, QuantityShipped: 0, ItemPrice: money("80.00"), ItemTax: money("16.00"), ShippingPrice: money("4.99"), ShippingTax: money("1.00"), ConditionId: "New", TaxCollection: tax },
  { OrderItemId: "51234567890124", ASIN: "B07XYZ1234", SellerSKU: "BAND-02", Title: "Plain wedding band", QuantityOrdered: 1, QuantityShipped: 0, ItemPrice: money("20.00"), ItemTax: money("4.00"), TaxCollection: tax }
]);
const ctx = (extra = {}) => ({ connectionId: "c1__A2SELLERUK", marketplaceId: UK, sellerId: "A2SELLERUK", accountName: "EGGcraft Amazon UK", items: mfnItems(), eventOrigin: "provider", ...extra });

(async () => {
  await check("a merchant-fulfilled order with two items becomes a valid envelope: totals rebuilt from the items, nothing invented (§15, §79 new order)", () => {
    const env = normalizeAmazonOrder(mfnOrder(), ctx());
    assert.deepStrictEqual(validateEnvelope(env), []);
    assert.strictEqual(env.identity.provider, "amazon");
    assert.strictEqual(env.identity.external_id, "206-1234567-7654321");
    assert.strictEqual(env.identity.marketplace_id, UK, "§13 — the marketplace is part of the order's identity and is always kept");
    assert.strictEqual(env.identity.external_updated_at, "2026-08-31T11:02:00.000Z");
    assert.strictEqual(env.identity.event_origin, "provider");
    assert.strictEqual(env.order.currency, "GBP");
    assert.strictEqual(env.order.grand_total, "125.99", "OrderTotal is what the buyer was charged");
    assert.strictEqual(env.order.subtotal, "100.00", "subtotal is the sum of the item ItemPrice values, which exclude tax");
    assert.strictEqual(env.order.tax_total, "21.00", "ItemTax + ShippingTax across the items");
    assert.strictEqual(env.order.shipping_total, "4.99");
    assert.strictEqual(env.order.discount_total, null, "no PromotionDiscount was sent, so none is invented (MERGE-004)");
    assert.strictEqual(Number(env.order.subtotal) + Number(env.order.tax_total) + Number(env.order.shipping_total), Number(env.order.grand_total), "the rebuilt components must reconcile to Amazon's own total");
    assert.strictEqual(env.order.platform_status, "unshipped");
    assert.strictEqual(env.order.payment_status, "paid", "Unshipped means the money cleared and the parcel has not gone out");
    assert.strictEqual(env.order.fulfillment_status, "unfulfilled");
    assert.strictEqual(env.order.placed_at, "2026-08-30T09:15:22.000Z");
    assert.strictEqual(env.order.cancelled_at, null);
    assert.strictEqual(env.order.line_items.length, 2);
    const [first, second] = env.order.line_items;
    assert.strictEqual(first.external_line_id, "51234567890123");
    assert.strictEqual(first.sku, "RING-SIG-01", "§17 — the seller SKU is the mapping signal");
    assert.strictEqual(first.product_external_id, "B08N5WRWNW", "§17 — the ASIN is the external catalog identity");
    assert.strictEqual(first.quantity, 1);
    assert.strictEqual(first.line_total, "80.00");
    assert.strictEqual(first.unit_price, "80.00", "at quantity one the extended price IS the unit price");
    assert.deepStrictEqual(first.properties, [{ name: "Shipping", value: "4.99" }, { name: "Condition", value: "New" }]);
    assert.strictEqual(second.sku, "BAND-02");
    assert.strictEqual(env.customer.name, "Ada Lovelace");
    assert.strictEqual(env.customer.email, "k3j4h5x@marketplace.amazon.co.uk", "the masked relay address is the only one Amazon gives");
    assert.strictEqual(env.customer.shipping_address.street, "10 Analytical Way, Flat 3");
    assert.strictEqual(env.customer.shipping_address.postalCode, "N1 1AA");
    assert.strictEqual(env.customer.shipping_address.country, "GB");
    assert.deepStrictEqual(env.payments, [], "§38/§40 — Amazon money moves at settlement, so an order-time payment record would be an assertion NivaDesk cannot support");
    assert.strictEqual(env.source.provider_display_name, "Amazon");
    assert.strictEqual(env.source.provider_metadata.order_number, "1042", "§15 — the seller order alias is kept when present");
    assert.strictEqual(env.source.external_admin_url, "https://sellercentral.amazon.co.uk/orders-v3/order/206-1234567-7654321");
    assert.deepStrictEqual(env.review.reasons, []);
    assert.strictEqual(env.review.required, false);
  });

  await check("an FBA order is marked marketplace-fulfilled so merchant stock is never reserved; AFN and AMAZON mean the same thing (§28)", () => {
    const SOURCES = new Set(["merchant", "marketplace_fulfilled", "third_party", "pickup", "unknown"]);
    for (const channel of ["AFN", "AMAZON"]) {
      const env = normalizeAmazonOrder(mfnOrder({ FulfillmentChannel: channel, OrderStatus: "Shipped", NumberOfItemsShipped: 2, NumberOfItemsUnshipped: 0 }), ctx());
      assert.deepStrictEqual(validateEnvelope(env), []);
      const meta = env.source.provider_metadata;
      assert.ok(SOURCES.has(meta.fulfilment_source), `${channel}: fulfilment_source must be one of the canonical five (§15)`);
      assert.strictEqual(meta.fulfilment_source, "marketplace_fulfilled", `${channel} is Amazon-fulfilled: the goods left the studio long ago (§28 rule 2)`);
      assert.notStrictEqual(meta.fulfilment_source, "merchant", `${channel} must never read as merchant stock`);
      assert.strictEqual(meta.fulfillment_channel_raw, channel, "§63 — the provider's own word is preserved, not just our translation");
      assert.strictEqual(env.order.fulfillment_status, "fulfilled");
    }
    for (const channel of ["MFN", "MERCHANT"]) {
      assert.strictEqual(normalizeAmazonOrder(mfnOrder({ FulfillmentChannel: channel }), ctx()).source.provider_metadata.fulfilment_source, "merchant", `${channel} is the studio's own shelf`);
    }
    assert.strictEqual(fulfilmentSourceOf({}), "unknown", "a missing channel is unknown, never assumed to be merchant stock");
    assert.strictEqual(normalizeAmazonOrder(mfnOrder({ FulfillmentChannel: undefined }), ctx()).source.provider_metadata.fulfilment_source, "unknown");
  });

  await check("marketplace-facilitator tax is the platform's, standard tax is the merchant's, and the two spellings agree with the finance engine (§44)", () => {
    const platform = normalizeAmazonOrder(mfnOrder(), ctx({ items: mfnItems(FACILITATOR) }));
    assert.deepStrictEqual(validateEnvelope(platform), []);
    assert.strictEqual(platform.order.tax_responsibility, "platform", "Amazon collected and remits it; the studio never sees that money");
    assert.strictEqual(platform.order.tax_total, "21.00", "the amount is still recorded — it is kept out of the VAT total, not thrown away");
    assert.ok(!platform.review.reasons.includes("tax_responsibility_unknown"), "Amazon said who remits, so there is nothing to ask");

    const merchant = normalizeAmazonOrder(mfnOrder(), ctx({ items: mfnItems(STANDARD) }));
    assert.deepStrictEqual(validateEnvelope(merchant), []);
    assert.strictEqual(merchant.order.tax_responsibility, "merchant", "Standard means the seller declares it");
    assert.ok(!merchant.review.reasons.includes("tax_responsibility_unknown"));

    // The spec calls these seller/marketplace/unknown; the engine normaliser takes both spellings.
    assert.strictEqual(normalizeTaxResponsibility(platform.order.tax_responsibility), TAX_PLATFORM);
    assert.strictEqual(normalizeTaxResponsibility(merchant.order.tax_responsibility), TAX_MERCHANT);
    assert.strictEqual(normalizeTaxResponsibility("marketplace"), TAX_PLATFORM);
    assert.strictEqual(normalizeTaxResponsibility("seller"), TAX_MERCHANT);
    assert.strictEqual(taxResponsibilityOf({}, mfnItems(FACILITATOR)), "platform");
    assert.strictEqual(taxResponsibilityOf({}, mfnItems(STANDARD)), "merchant");
  });

  await check("no TaxCollection at all is unknown and the order asks — never a silent merchant or platform default (§44)", () => {
    const items = mfnItems().map(({ TaxCollection, ...rest }) => rest);
    const env = normalizeAmazonOrder(mfnOrder(), ctx({ items }));
    assert.deepStrictEqual(validateEnvelope(env), []);
    assert.strictEqual(env.order.tax_responsibility, "unknown", "nobody said whose tax it is");
    assert.strictEqual(env.order.tax_total, "21.00", "the tax Amazon charged is still shown");
    assert.ok(env.review.reasons.includes("tax_responsibility_unknown"), "there is tax on the order and no answer about it, so a human must decide");
    assert.strictEqual(env.review.required, true);
    assert.strictEqual(normalizeTaxResponsibility(env.order.tax_responsibility), TAX_UNKNOWN);
    // Items disagreeing with each other is also not an answer.
    const mixed = normalizeAmazonOrder(mfnOrder(), ctx({ items: [{ ...mfnItems()[0], TaxCollection: FACILITATOR }, { ...mfnItems()[1], TaxCollection: STANDARD }] }));
    assert.strictEqual(mixed.order.tax_responsibility, "unknown", "one facilitator item and one standard item cannot be collapsed into a single answer");
    assert.ok(mixed.review.reasons.includes("tax_responsibility_unknown"));
  });

  await check("the tax evidence Amazon sent is preserved, and SP-API sends it on the ITEM (§15 tax, §44 provider evidence)", () => {
    const env = normalizeAmazonOrder(mfnOrder(), ctx({ items: mfnItems(FACILITATOR) }));
    const meta = env.source.provider_metadata;
    assert.strictEqual(meta.tax_collection_model, "MarketplaceFacilitator", "the model behind the platform verdict must survive; SP-API puts TaxCollection on OrderItem, not on Order");
    assert.strictEqual(meta.tax_responsible_party, "Amazon Services Europe S.a.r.L.", "§44 — accounting export is decided on provider evidence, so the named remitter cannot be dropped");
  });

  await check("a Pending order has not been paid for and must not read as paid (§79 unknown/new status)", () => {
    for (const status of ["Pending", "PendingAvailability"]) {
      const env = normalizeAmazonOrder(mfnOrder({ OrderStatus: status, NumberOfItemsUnshipped: 2 }), ctx());
      assert.deepStrictEqual(validateEnvelope(env), []);
      assert.notStrictEqual(env.order.payment_status, "paid", `${status}: the buyer's payment has not cleared`);
      assert.notStrictEqual(env.order.payment_status, "partially_paid");
      assert.ok(["unpaid", "pending"].includes(env.order.payment_status), `${status}: the money is outstanding, and that is a state the envelope has a word for — got ${env.order.payment_status}`);
      assert.strictEqual(env.order.fulfillment_status, "unfulfilled");
      assert.strictEqual(env.order.platform_status, status.toLowerCase());
      assert.strictEqual(env.order.cancelled_at, null);
    }
    // An Unfulfillable order is neither paid nor shipped, and must not be guessed either way.
    const odd = normalizeAmazonOrder(mfnOrder({ OrderStatus: "Unfulfillable" }), ctx());
    assert.deepStrictEqual(validateEnvelope(odd), []);
    assert.notStrictEqual(odd.order.payment_status, "paid");
    assert.strictEqual(odd.source.provider_metadata.order_status_raw, "Unfulfillable", "§63 — an unfamiliar status is preserved, not dropped");
  });

  await check("a Canceled order is cancelled, carries the moment it happened, and owes nothing (§79 cancel)", () => {
    const env = normalizeAmazonOrder(mfnOrder({ OrderStatus: "Canceled", NumberOfItemsUnshipped: 0 }), ctx());
    assert.deepStrictEqual(validateEnvelope(env), []);
    assert.strictEqual(env.order.platform_status, "cancelled");
    assert.strictEqual(env.order.cancelled_at, "2026-08-31T11:02:00.000Z");
    assert.strictEqual(env.order.fulfillment_status, "unknown", "a cancelled order was never fulfilled and is not pending fulfilment either");
    assert.notStrictEqual(env.order.payment_status, "paid", "a cancelled order is not a sale");
    assert.notStrictEqual(env.order.payment_status, "unknown", "Amazon told us plainly that it was cancelled — 'unknown' means nobody said, and somebody did");
    assert.strictEqual(env.order.payment_status, "voided", "'voided' is the envelope's word for a sale that will never be paid (PAYMENT_STATUSES in commerce/envelope.js)");
  });

  await check("an order whose OrderItems have not been fetched yet waits for review instead of posting a total with nothing under it (§16)", () => {
    const env = normalizeAmazonOrder(mfnOrder(), ctx({ items: undefined }));
    assert.deepStrictEqual(validateEnvelope(env), [], "an incomplete order is still a valid envelope — it waits, it is not rejected");
    assert.deepStrictEqual(env.order.line_items, []);
    assert.strictEqual(env.order.grand_total, "125.99", "the order-level total Amazon did state is kept");
    assert.strictEqual(env.order.subtotal, null, "the subtotal is not back-solved from the total (MERGE-004)");
    assert.strictEqual(env.order.tax_total, null);
    assert.strictEqual(env.order.shipping_total, null);
    assert.strictEqual(env.order.tax_responsibility, "unknown", "with no items there is no TaxCollection, so no liability may be assumed");
    assert.ok(env.review.reasons.includes("no_line_items"));
    assert.strictEqual(env.review.required, true);
    assert.strictEqual(env.source.provider_metadata.items_seen, 0);
    // And once the second call lands, the same order fills in.
    const complete = normalizeAmazonOrder(mfnOrder(), ctx());
    assert.strictEqual(complete.order.subtotal, "100.00");
    assert.ok(!complete.review.reasons.includes("no_line_items"));
  });

  await check("Amazon's ItemPrice is the EXTENDED price for the whole quantity, so no unit price is invented (§15)", () => {
    const items = [{ OrderItemId: "5199", ASIN: "B0CHARM01", SellerSKU: "CHARM-03", Title: "Silver charm", QuantityOrdered: 3, ItemPrice: money("50.00"), ItemTax: money("10.00"), PromotionDiscount: money("5.00"), PromotionIds: ["SUMMER25"], TaxCollection: FACILITATOR }];
    const env = normalizeAmazonOrder(mfnOrder({ OrderTotal: money("55.00"), NumberOfItemsUnshipped: 3 }), ctx({ items }));
    assert.deepStrictEqual(validateEnvelope(env), []);
    const line = env.order.line_items[0];
    assert.strictEqual(line.quantity, 3);
    assert.strictEqual(line.line_total, "50.00", "ItemPrice covers all three charms");
    assert.notStrictEqual(line.line_total, "150.00", "the extended price must not be multiplied by the quantity a second time");
    assert.notStrictEqual(line.unit_price, "16.67", "50.00/3 is precision Amazon never sent");
    assert.strictEqual(line.unit_price, null, "no unit price is stated when Amazon only gave an extended one");
    assert.strictEqual(env.order.subtotal, "50.00");
    assert.strictEqual(env.order.discount_total, "5.00", "§79 promotion — PromotionDiscount is the discount, kept as its own component");
    assert.strictEqual(env.order.tax_total, "10.00");
    assert.deepStrictEqual(line.properties.find((p) => p.name === "Promotion"), { name: "Promotion", value: "5.00" });
  });

  await check("a non-GBP marketplace keeps its own currency and its own Seller Central host (§43 multi-currency, §13)", () => {
    const items = [{ OrderItemId: "77001", ASIN: "B08N5WRWNW", SellerSKU: "RING-SIG-01", Title: "Siegelring", QuantityOrdered: 1, ItemPrice: money("49.92", "EUR"), ItemTax: money("9.98", "EUR"), TaxCollection: FACILITATOR }];
    const env = normalizeAmazonOrder(mfnOrder({ AmazonOrderId: "305-7654321-1234567", MarketplaceId: DE, OrderTotal: money("59.90", "EUR"), SalesChannel: "Amazon.de" }), ctx({ marketplaceId: DE, items, accountName: "EGGcraft Amazon DE" }));
    assert.deepStrictEqual(validateEnvelope(env), []);
    assert.strictEqual(env.order.currency, "EUR", "the marketplace's currency, never the workspace's");
    assert.strictEqual(env.order.grand_total, "59.90");
    assert.strictEqual(env.order.subtotal, "49.92");
    assert.strictEqual(env.order.tax_total, "9.98");
    assert.strictEqual(env.identity.marketplace_id, DE);
    assert.strictEqual(env.source.external_admin_url, "https://sellercentral.amazon.de/orders-v3/order/305-7654321-1234567");
    assert.strictEqual(amazonMoney(money("1234.5", "JPY")), "1234.50", "SP-API amounts are decimal strings, whatever the currency");
    assert.strictEqual(amazonMoney(null), null);
    assert.strictEqual(amazonMoney({ CurrencyCode: "GBP" }), null, "a currency with no amount is not zero");
  });

  await check("the same order is the same entity however it arrived, and a new marketplace or connection is a new entity (§13, §58)", () => {
    const live = normalizeAmazonOrder(mfnOrder(), ctx({ eventOrigin: "provider" }));
    const replay = normalizeAmazonOrder(mfnOrder(), ctx({ eventOrigin: "reconcile" }));
    assert.strictEqual(contentHash(live), contentHash(replay), "a duplicate notification and a reconciliation sweep must agree, or every sweep rewrites the order");
    for (let i = 0; i < 10; i += 1) assert.strictEqual(contentHash(normalizeAmazonOrder(mfnOrder(), ctx())), contentHash(live), "§79 duplicate event x10");
    const shipped = normalizeAmazonOrder(mfnOrder({ OrderStatus: "Shipped", LastUpdateDate: "2026-09-01T08:00:00Z" }), ctx());
    assert.notStrictEqual(contentHash(shipped), contentHash(live), "a real change must change the hash");
    assert.ok(Date.parse(shipped.identity.external_updated_at) > Date.parse(live.identity.external_updated_at), "§57 — the stale guard needs the provider's own update time");
    assert.notStrictEqual(identityDocId(live.identity), identityDocId(normalizeAmazonOrder(mfnOrder(), ctx({ connectionId: "c2__OTHERSELLER" })).identity), "the same Amazon order id under two connections is two entities (DATA-001)");
    const noUpdate = normalizeAmazonOrder(mfnOrder({ LastUpdateDate: undefined }), ctx());
    assert.strictEqual(noUpdate.identity.external_updated_at, "2026-08-30T09:15:22.000Z", "with no LastUpdateDate the purchase date is the best the provider gave");
  });

  await check("the raw snapshot the caller stored is referenced from the envelope (§63)", () => {
    const ref = "companies/c1/external_raw_snapshots/amazon__206-1234567-7654321__2026-08-31T11:02:00Z";
    const env = normalizeAmazonOrder(mfnOrder(), ctx({ rawSnapshotRef: ref }));
    assert.strictEqual(env.raw_snapshot_ref, ref, "§63 — an audit trail nobody can find is not an audit trail; the envelope has the field and the caller supplied it");
  });

  await check("a missing order id and a missing total are flagged rather than swallowed (§16, §79)", () => {
    const noId = normalizeAmazonOrder(mfnOrder({ AmazonOrderId: "" }), ctx());
    assert.ok(noId.review.reasons.includes("missing_external_id"));
    assert.deepStrictEqual(validateEnvelope(noId), ["identity.external_id"], "an order with no id cannot be applied");
    const noTotal = normalizeAmazonOrder(mfnOrder({ OrderTotal: undefined }), ctx());
    assert.deepStrictEqual(validateEnvelope(noTotal), [], "a Pending order with no total yet is still valid — it just has no money on it");
    assert.strictEqual(noTotal.order.grand_total, null);
    assert.strictEqual(noTotal.order.currency, null);
    assert.ok(noTotal.review.reasons.includes("missing_total"));
    const noPii = normalizeAmazonOrder({ AmazonOrderId: "206-0000001-0000001", MarketplaceId: UK, OrderStatus: "Unshipped", FulfillmentChannel: "MFN", PurchaseDate: "2026-08-30T09:15:22Z", LastUpdateDate: "2026-08-30T09:15:22Z", OrderTotal: money("10.00") }, ctx({ items: [] }));
    assert.deepStrictEqual(validateEnvelope(noPii), [], "an application without PII approval still gets a usable order");
    assert.strictEqual(noPii.customer.name, null, "no buyer name is fabricated to fill the gap");
    assert.strictEqual(noPii.customer.shipping_address, null);
    assert.ok(noPii.review.reasons.includes("buyer_data_restricted"));
  });

  if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
  console.log("\n✅ AMAZON ADAPTER (SP-API → ENVELOPE) GEÇTİ");
})();

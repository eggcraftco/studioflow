// The boundary contract: what may leave the Amazon project.
//
// Two things are tested. That the allowlist refuses what it has never heard
// of — the whole point of an allowlist — and that the copy on the main side
// is byte-for-byte this one. A contract that drifts between its two ends is
// worse than none: each side would pass its own tests and the boundary would
// let through whatever the two disagreed about.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const envelope = require("../src/envelope");
const { splitAmazonOrder, scanForPii } = require("../src/amazon/sanitize");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const clean = () => ({
  version: 1, connectionId: "conn-1", companyId: "co-1", marketplaceId: "A1F83G8C2ARO7P",
  syncedAtMs: 1_700_000_000_000, taxKnown: false, removedPaths: [],
  order: {
    AmazonOrderId: "202-1234567-1234567", PurchaseDate: "2026-09-01T10:00:00Z", LastUpdateDate: "2026-09-02T10:00:00Z",
    OrderStatus: "Shipped", FulfillmentChannel: "MFN", MarketplaceId: "A1F83G8C2ARO7P",
    OrderTotal: { CurrencyCode: "GBP", Amount: "42.00" }, IsPrime: false,
    TaxCollection: { Model: "MarketplaceFacilitator", ResponsibleParty: "Amazon Services, Inc." },
    PaymentMethodDetails: ["Standard"]
  },
  items: [{
    OrderItemId: "1", ASIN: "B0EXAMPLE", SellerSKU: "RING-1", Title: "Silver ring", QuantityOrdered: 1,
    ItemPrice: { CurrencyCode: "GBP", Amount: "42.00" }, PromotionIds: ["PROMO"], IsGift: "false",
    ProductInfo: { NumberOfItems: 1 }
  }]
});

check("the two copies of the contract are identical", () => {
  const here = fs.readFileSync(path.join(__dirname, "..", "src", "envelope.js"), "utf8");
  const there = fs.readFileSync(path.join(__dirname, "..", "..", "functions", "commerce", "amazon", "envelope.js"), "utf8");
  assert.strictEqual(here, there, "functions/commerce/amazon/envelope.js differs from functions-amazon/src/envelope.js — copy it, do not edit one side");
});

check("a clean envelope passes", () => {
  const r = envelope.validateSafeEnvelope(clean());
  assert.deepStrictEqual(r, { ok: true, violations: [] });
});

check("a field the allowlist has never heard of is refused, at every level", () => {
  const cases = [
    (e) => { e.order.BuyerInfo = { BuyerEmail: "x" }; },
    (e) => { e.order.ShippingAddress = { Name: "J" }; },
    (e) => { e.order.SellerDisplayName = "shop"; },
    (e) => { e.order.SomethingAmazonAddedIn2027 = "x"; },
    (e) => { e.items[0].GiftMessageText = "love"; },
    (e) => { e.items[0].BuyerInfo = { BuyerCustomizedInfo: {} }; },
    (e) => { e.items[0].ProductInfo.Weight = 1; },
    (e) => { e.order.OrderTotal.Note = "x"; },
    (e) => { e.order.TaxCollection.Amount = "1"; },
    (e) => { e.extra = 1; }
  ];
  for (const mutate of cases) {
    const e = clean(); mutate(e);
    const r = envelope.validateSafeEnvelope(e);
    assert.strictEqual(r.ok, false, `passed: ${JSON.stringify(e).slice(0, 120)}`);
  }
});

check("anything shaped like an email address is refused wherever it hides", () => {
  const e = clean(); e.items[0].Title = "ask jane@example.com";
  assert.strictEqual(envelope.validateSafeEnvelope(e).ok, false);
  const e2 = clean(); e2.order.SellerOrderId = "ref a@b.co";
  assert.strictEqual(envelope.validateSafeEnvelope(e2).ok, false);
});

check("removedPaths carries paths, never values", () => {
  const e = clean(); e.removedPaths = ["order.BuyerInfo", "items[0].GiftMessageText"];
  assert.strictEqual(envelope.validateSafeEnvelope(e).ok, true);
  const bad = clean(); bad.removedPaths = ["order.BuyerInfo = jane@example.com"];
  assert.strictEqual(envelope.validateSafeEnvelope(bad).ok, false);
});

check("shape and type mistakes are refused", () => {
  for (const mutate of [
    (e) => { e.version = 2; },
    (e) => { delete e.companyId; },
    (e) => { e.syncedAtMs = "now"; },
    (e) => { e.taxKnown = "false"; },
    (e) => { e.items = {}; },
    (e) => { e.order = null; },
    (e) => { delete e.order.AmazonOrderId; },
    (e) => { e.order.OrderTotal = "42"; },
    (e) => { e.order.PaymentMethodDetails = "Standard"; },
    (e) => { e.items[0].Title = "x".repeat(600); }
  ]) {
    const e = clean(); mutate(e);
    assert.strictEqual(envelope.validateSafeEnvelope(e).ok, false, JSON.stringify(e).slice(0, 120));
  }
  assert.strictEqual(envelope.validateSafeEnvelope(null).ok, false);
  assert.strictEqual(envelope.validateSafeEnvelope("x").ok, false);
});

check("buildSafeEnvelope from the sanitizer's output passes, and never emits what the allowlist refuses", () => {
  const raw = {
    AmazonOrderId: "1", PurchaseDate: "2026-09-01T10:00:00Z", OrderStatus: "Unshipped", MarketplaceId: "A1F83G8C2ARO7P",
    OrderTotal: { CurrencyCode: "GBP", Amount: "10.00" },
    BuyerInfo: { BuyerEmail: "jane@example.com", BuyerName: "Jane" },
    ShippingAddress: { Name: "Jane Doe", AddressLine1: "1 Road", PostalCode: "N1 1AA", CountryCode: "GB" },
    SellerDisplayName: "EGGcraft", MarketplaceTaxInfo: { TaxClassifications: [] }
  };
  const items = [{ OrderItemId: "i1", ASIN: "B0", SellerSKU: "S", Title: "Ring", QuantityOrdered: 1,
    ItemPrice: { CurrencyCode: "GBP", Amount: "10.00" }, GiftMessageText: "with love", BuyerInfo: { GiftMessageText: "x" } }];
  const { safe, removed } = splitAmazonOrder(raw, items);
  const e = envelope.buildSafeEnvelope({ connectionId: "c", companyId: "co", syncedAtMs: 1, safe, removed });
  assert.strictEqual(envelope.validateSafeEnvelope(e).ok, true);
  assert.deepStrictEqual(scanForPii(e.order), [], "personal data survived into the envelope");
  assert.deepStrictEqual(scanForPii(e.items), []);
  assert.ok(!("SellerDisplayName" in e.order), "a field outside the allowlist was carried");
  assert.ok(!("MarketplaceTaxInfo" in e.order));
  assert.ok(e.removedPaths.includes("order.BuyerInfo"));
  assert.ok(!JSON.stringify(e).includes("jane"), "a removed value leaked into the envelope");
});

check("buildSafeEnvelope throws rather than emit an envelope the other side would refuse", () => {
  const safe = { order: { AmazonOrderId: "1", MarketplaceId: "m", SellerOrderId: "ref jane@example.com" }, items: [] };
  assert.throws(() => envelope.buildSafeEnvelope({ connectionId: "c", companyId: "co", syncedAtMs: 1, safe }), /unsafe_envelope/);
});

check("the allowlist contains no field the sanitizer removes", () => {
  const { ORDER_PII_FIELDS, ITEM_PII_FIELDS } = require("../src/amazon/sanitize");
  for (const f of ORDER_PII_FIELDS) assert.ok(!envelope.ORDER_KEYS.includes(f), `${f} is both removed and allowed`);
  for (const f of ITEM_PII_FIELDS) assert.ok(!envelope.ITEM_KEYS.includes(f), `${f} is both removed and allowed`);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log(`PASS  ${name}`); }
    catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ ENVELOPE GEÇTİ");
})();

// Whose tax is it.
//
// A shop tells NivaDesk what tax it charged. It does not tell NivaDesk whether
// the studio declares that tax, and those are two different questions. Every
// channel mapper writes `taxRate: 0` because no shop API returns a rate, and
// the Finance Engine used to gate VAT on the rate — so a Shopify, WooCommerce,
// Etsy, Square or website sale that charged £120 of tax reported no VAT at all,
// while the real figure sat on the same document in `taxAmount`.
//
// Fixing that by simply believing the amount would be wrong in the other
// direction: a marketplace that collects and remits the tax itself is not
// giving the studio VAT to declare. Etsy does that in some jurisdictions and
// not in others, so "it is an Etsy order" is not an answer either.
//
// Hence three states, per order and not per channel: merchant, platform,
// unknown. This file holds all three, and holds the connectors to declaring
// one.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const engine = require("../../finance/engine");
const { newOrderDefaults, shopOwnedFields } = require("../../commerce/envelopeToOrder");
const { validateEnvelope } = require("../../commerce/envelope");
const { INTEGRATION_SHOP_OWNED_FIELDS } = require("../../integrationOrderFields");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const REGISTERED = { vatRegistered: true, pricesIncludeVat: true, defaultTaxRate: 20, feePercentage: 0 };
const sale = (extra = {}) => ({ paidAmount: 1000, remainingAmount: 0, taxRate: 0, ...extra });

// ---- the three states -------------------------------------------------------

check("the shop's own tax figure is the VAT due, with no rate anywhere in it", () => {
  const block = engine.computeOrderFinance(
    sale({ taxAmount: 120, taxAmountKnown: true, taxResponsibility: "merchant", taxIncludedInPrice: true }),
    REGISTERED
  );
  assert.strictEqual(block.vatDue, 120, "the shop said 120 and the engine derived something else");
  assert.strictEqual(block.platformCollectedTax, 0);
  assert.strictEqual(block.taxNeedsReview, false);
  // And the rate is genuinely not consulted: the same order at a different
  // workspace rate produces the same VAT.
  const other = engine.computeOrderFinance(
    sale({ taxAmount: 120, taxAmountKnown: true, taxResponsibility: "merchant", taxIncludedInPrice: true }),
    { ...REGISTERED, defaultTaxRate: 5 }
  );
  assert.strictEqual(other.vatDue, 120);
});

check("tax a marketplace collects and remits stays out of the studio's VAT", () => {
  const block = engine.computeOrderFinance(
    sale({ taxAmount: 120, taxAmountKnown: true, taxResponsibility: "platform" }),
    REGISTERED
  );
  assert.strictEqual(block.vatDue, 0, "a marketplace's tax was added to the studio's VAT return");
  assert.strictEqual(block.platformCollectedTax, 120, "and then it vanished entirely, so the order no longer adds up");
  assert.strictEqual(block.taxNeedsReview, false);
});

check("a tax nobody has claimed is shown, withheld from VAT, and flagged", () => {
  const block = engine.computeOrderFinance(sale({ taxAmount: 120, taxAmountKnown: true }), REGISTERED);
  assert.strictEqual(block.vatDue, 0);
  assert.strictEqual(block.platformCollectedTax, 120);
  assert.strictEqual(block.taxNeedsReview, true, "an unclaimed tax must ask, not settle silently");
  assert.strictEqual(block.taxResponsibility, "unknown");
});

check("a shop that charged nothing is believed, and the workspace rate does not fill in behind it", () => {
  const block = engine.computeOrderFinance(
    sale({ taxAmount: 0, taxAmountKnown: true, taxResponsibility: "merchant" }),
    REGISTERED
  );
  assert.strictEqual(block.vatDue, 0, "a real zero was overwritten by the workspace's default rate");
  assert.strictEqual(block.taxNeedsReview, false);
});

// ---- what must NOT change ---------------------------------------------------

check("without the flag the rate still rules, so no manual order moves", () => {
  // A manual order's `taxAmount` is NivaDesk's own computed VAT. Reading it as
  // a shop's figure would replace the engine with a stale copy of itself.
  const block = engine.computeOrderFinance(sale({ taxAmount: 999, taxRate: 20 }), REGISTERED);
  assert.strictEqual(block.vatDue, 166.67);
  assert.strictEqual(block.taxAmountKnown, false);
  assert.strictEqual(block.platformCollectedTax, 0);
});

check("registration is the workspace's own fact and outranks anything a shop says", () => {
  const block = engine.computeOrderFinance(
    sale({ taxAmount: 120, taxAmountKnown: true, taxResponsibility: "merchant" }),
    { ...REGISTERED, vatRegistered: false }
  );
  assert.strictEqual(block.vatDue, 0);
  assert.strictEqual(block.platformCollectedTax, 0, "a workspace that is not registered has no tax story at all");
});

check("the margin scheme does not take a shop's figure", () => {
  // Margin VAT is computed from the buying and selling price, which no shop
  // knows. Its answer would be the wrong scheme's.
  const block = engine.computeOrderFinance(
    sale({ watchPurchasePrice: 400, taxAmount: 120, taxAmountKnown: true, taxResponsibility: "merchant" }),
    { ...REGISTERED, vatMethod: "margin" }
  );
  assert.strictEqual(block.vatBase, 600);
  assert.strictEqual(block.vatDue, 100);
});

check("tax added on top raises what the customer paid; tax inside the price does not", () => {
  const onTop = engine.computeOrderFinance(
    sale({ taxAmount: 200, taxAmountKnown: true, taxResponsibility: "merchant", taxIncludedInPrice: false }),
    REGISTERED
  );
  assert.strictEqual(onTop.customerTotal, 1200);
  const inside = engine.computeOrderFinance(
    sale({ taxAmount: 200, taxAmountKnown: true, taxResponsibility: "merchant", taxIncludedInPrice: true }),
    REGISTERED
  );
  assert.strictEqual(inside.customerTotal, 1000);
});

// ---- the vocabulary ---------------------------------------------------------

check("the responsibility is read forgivingly and never guessed into a liability", () => {
  const n = engine.normalizeTaxResponsibility;
  assert.strictEqual(n("merchant"), "merchant");
  assert.strictEqual(n("  SELLER "), "merchant");
  assert.strictEqual(n("marketplace"), "platform");
  assert.strictEqual(n("facilitator"), "platform");
  // Anything unrecognised must land on unknown, never on merchant: a typo that
  // read as "merchant" would put a marketplace's tax into a VAT return.
  assert.strictEqual(n("mercant"), "unknown");
  assert.strictEqual(n(null), "unknown");
  assert.strictEqual(n(""), "unknown");
  assert.strictEqual(n("", "merchant"), "merchant", "an explicit fallback is still honoured");
});

// ---- the connectors ---------------------------------------------------------

const ADAPTERS = [
  { file: "shopify.js", expect: "merchant" },
  { file: "woocommerce.js", expect: "merchant" },
  { file: "square.js", expect: "merchant" },
  { file: "etsy.js", expect: "unknown" },
];

check("every channel adapter states whose tax it is, and Etsy refuses to guess", () => {
  for (const { file, expect } of ADAPTERS) {
    const source = fs.readFileSync(path.join(__dirname, "..", "..", "commerce", "adapters", file), "utf8");
    const stated = source.match(/tax_responsibility:\s*"([a-z]+)"/);
    assert.ok(stated, `${file} does not say whose tax it is`);
    assert.strictEqual(stated[1], expect, `${file} claims ${stated[1]}`);
  }
});

check("the Etsy adapter really produces an unknown responsibility, not just a comment about one", () => {
  const { normalizeEtsyReceipt } = require("../../commerce/adapters/etsy");
  const money = (n) => ({ amount: Math.round(n * 100), divisor: 100, currency_code: "GBP" });
  const env = normalizeEtsyReceipt({
    receipt_id: 1, status: "Paid", is_paid: true, name: "A", country_iso: "GB",
    create_timestamp: 1788307200, update_timestamp: 1788307200,
    grandtotal: money(120), subtotal: money(100), total_vat_cost: money(20),
    transactions: [{ transaction_id: 1, title: "Ring", quantity: 1, price: money(100), variations: [] }],
    shipments: [], refunds: []
  }, { connectionId: "c1", shopId: "9", shopCurrency: "GBP", eventOrigin: "provider" });
  assert.deepStrictEqual(validateEnvelope(env), []);
  assert.strictEqual(env.order.tax_responsibility, "unknown");
  assert.strictEqual(env.order.tax_total, "20.00");

  // And it survives the projection onto the order document with the flag set,
  // so the engine reads an amount it is allowed to use.
  const fields = shopOwnedFields(env, { companyId: "co1" });
  assert.strictEqual(fields.taxAmountKnown, true);
  assert.strictEqual(fields.taxResponsibility, "unknown");
  assert.strictEqual(fields.taxAmount, 20);

  // Which the engine then holds back from VAT and flags.
  const block = engine.computeOrderFinance({ ...fields, paidAmount: 120, remainingAmount: 0 }, REGISTERED);
  assert.strictEqual(block.vatDue, 0);
  assert.strictEqual(block.taxNeedsReview, true);
});

check("all four fields are shop-owned, so a resync cannot split them apart", () => {
  // Carrying the amount without the flag leaves the engine on a stale rate;
  // carrying it without the responsibility puts a marketplace's tax into the
  // studio's VAT return. They travel together or not at all.
  for (const field of ["taxAmount", "taxAmountKnown", "taxResponsibility", "taxIncludedInPrice"]) {
    assert.ok(INTEGRATION_SHOP_OWNED_FIELDS.has(field), `${field} is not shop-owned, so a resync would strip it`);
  }
});

// ---- the refund that was counted twice --------------------------------------

check("a refund on an order with no invoice lines comes off the profit exactly once", () => {
  // Every writer of refundedAmount — the bank link and all four channel
  // mappers — also lowers paidAmount by the same money. The engine measured a
  // lineless order from paidAmount, so the sale had already shrunk by the
  // refund and the profit line then subtracted it again.
  const block = engine.computeOrderFinance(
    { paidAmount: 800, remainingAmount: 0, refundedAmount: 200 },
    { vatRegistered: false, feePercentage: 0 }
  );
  assert.strictEqual(block.revenue, 1000, "the sale was worth 1000 before the refund");
  assert.strictEqual(block.refunded, 200);
  assert.strictEqual(block.netProfit, 800, "the refund was taken off twice");
});

check("and an order that carries lines is untouched by the fix", () => {
  const block = engine.computeOrderFinance(
    { lineItems: [{ id: "1", name: "Ring", quantity: 1, unitPrice: 1000, lineTotal: 1000 }],
      paidAmount: 800, remainingAmount: 0, refundedAmount: 200 },
    { vatRegistered: false, feePercentage: 0 }
  );
  assert.strictEqual(block.revenue, 1000);
  assert.strictEqual(block.netProfit, 800);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ SHOP TAX GEÇTİ");
})();

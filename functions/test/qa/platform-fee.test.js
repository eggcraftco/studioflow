// What a sale actually cost to take.
//
// The workspace types a percentage — 3% by default — and every profit line in
// the product deducted that, on every order, including ones from shops that had
// told us exactly what they charged. An Etsy sale of £125 with a real £8.25
// commission was costed at £3.75, so the workshop's profit read £4.50 higher
// than it was, on every single sale, for ever.
//
// The percentage is not wrong; it is a stand-in for a number only the platform
// knows. What was wrong is that there was no way to say "we know this one", so
// a real figure written into paymentFee changed nothing at all: the engine did
// not read the field, and four other writers overwrote it with the estimate.
const assert = require("assert");
const engine = require("../../finance/engine");
const { INTEGRATION_SHOP_OWNED_FIELDS } = require("../../integrationOrderFields");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

const SETTINGS = { feePercentage: 3, vatRegistered: false, defaultTaxRate: 0 };
const sale = (extra) => ({ paidAmount: 125, remainingAmount: 0, ...extra });

check("a shop's own figure is used, not the workspace's percentage", () => {
  const block = engine.computeOrderFinance(sale({ paymentFee: 8.25, platformFeeKnown: true }), SETTINGS);
  assert.strictEqual(block.platformFee, 8.25);
  assert.strictEqual(block.netProfit, 116.75);
  assert.strictEqual(block.platformFeeKnown, true);
});

check("without the flag, the estimate still applies", () => {
  // Every existing writer puts the percentage into paymentFee, so a number
  // alone proves nothing. If the engine trusted it, an order edited on any
  // screen would take that screen's estimate as the platform's own figure.
  const block = engine.computeOrderFinance(sale({ paymentFee: 999 }), SETTINGS);
  assert.strictEqual(block.platformFee, 3.75);
  assert.strictEqual(block.platformFeeKnown, false);
});

check("a shop that really charged nothing is not quietly given the percentage", () => {
  // The whole reason the flag exists: telling a real zero apart from a field
  // nobody filled in.
  const block = engine.computeOrderFinance(sale({ paymentFee: 0, platformFeeKnown: true }), SETTINGS);
  assert.strictEqual(block.platformFee, 0);
  assert.strictEqual(block.netProfit, 125);
});

check("a fee reported as money out is still a cost", () => {
  // Etsy and PayPal report fees negative. Subtracting a negative would ADD it
  // to the profit — the error would be double the fee, in the wrong direction.
  const block = engine.computeOrderFinance(sale({ paymentFee: -8.25, platformFeeKnown: true }), SETTINGS);
  assert.strictEqual(block.platformFee, 8.25);
  assert.strictEqual(block.netProfit, 116.75);
});

check("nonsense in the field cannot move the profit", () => {
  for (const bad of ["", "abc", null, undefined, {}, NaN]) {
    const block = engine.computeOrderFinance(sale({ paymentFee: bad, platformFeeKnown: true }), SETTINGS);
    assert.strictEqual(block.platformFee, 0, JSON.stringify(bad));
  }
});

// ---- the field has to survive, and has to not be overwritten ---------------
check("the fee and its flag survive a resync", () => {
  // Without this the first delivery would carry the real fee and the second
  // would strip it, and the profit would move on its own.
  assert.ok(INTEGRATION_SHOP_OWNED_FIELDS.has("paymentFee"));
  assert.ok(INTEGRATION_SHOP_OWNED_FIELDS.has("platformFeeKnown"));
});

check("no connector claims a fee it was never told", () => {
  // `paymentFee: 0` was written unconditionally by five mappers. Now that the
  // field is shop-owned that zero would also wipe a fee the studio typed by
  // hand, on every resync — the exact hazard the allowlist exists to name.
  const fs = require("fs");
  const path = require("path");
  const root = path.join(__dirname, "..", "..");
  for (const file of ["index.js", "etsy.js", "commerce/envelopeToOrder.js"]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.ok(!/paymentFee: 0,/.test(source), `${file} still claims a fee of zero`);
  }
});

check("the workspace's percentage does not creep back over a real fee", () => {
  const fs = require("fs");
  const path = require("path");
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");

  // The bulk recalculation, and the per-order money patch. Both used to
  // recompute the fee from the percentage whenever anything about the money
  // changed, so a real figure survived exactly until the first edit.
  const bulk = source.slice(source.indexOf("const orderValue = paidAmount + remainingAmount + customRemainingTotal;"));
  assert.ok(/const platformFeeKnown = orderData\.platformFeeKnown === true;/.test(bulk.slice(0, 900)));
  assert.ok(/platformFeeKnown\n\s*\? Math\.abs\(roundMoneyValue\(orderData\.paymentFee\)\)/.test(bulk.slice(0, 900)));

  const patch = source.slice(source.indexOf('if (entitlements?.advancedFinanceEnabled === true'));
  assert.ok(/orderData\.platformFeeKnown !== true/.test(patch.slice(0, 500)), "the money patch must not overwrite it either");
});

check("a person who types a fee by hand still wins", () => {
  // The guard is about the automatic recompute, not about the owner. An
  // explicit paymentFee in the patch is still honoured.
  const fs = require("fs");
  const path = require("path");
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
  assert.ok(/if \(hasOwnField\(patch, "paymentFee"\)\) paymentFee = roundMoneyValue\(patch\.paymentFee\);/.test(source));
});

check("the engine version moved, so the sweep re-stamps every order", () => {
  // The stored finance block on every existing order was computed by the old
  // rule. Raising the version is what makes the sweep walk them again, so the
  // number is pinned here: changing the arithmetic without changing it leaves
  // every existing order carrying the old answer for ever, and this test is
  // the thing that makes that an edit somebody had to mean.
  //
  // 3 added the platform's own commission. 4 added the shop's own tax figure,
  // whose tax it is, and the refund that was subtracted twice.
  assert.strictEqual(engine.ENGINE_VERSION, 4);
  // And the vectors must be describing the same engine, or four platforms are
  // being held to a version that no longer exists.
  const vectors = require("../../finance/vectors.json");
  assert.strictEqual(vectors.engineVersion, engine.ENGINE_VERSION);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ PLATFORM FEE GEÇTİ");
})();

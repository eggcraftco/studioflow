// The Finance Engine against its golden vectors.
//
// Five implementations used to answer "what did this order earn" and they
// disagreed by hundreds of pounds. This file is what stops that returning: the
// vectors are the contract, and every platform's mirror is held to the same
// file (functions/finance/vectors.json), so a platform that drifts breaks a
// test rather than a customer's accounts.
//
// Spec: docs/finance-engine.md.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const engine = require("../../finance/engine");
const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "finance", "vectors.json"), "utf8"));

let failures = 0;
function check(name, run) {
  try {
    run();
    console.log("PASS ", name);
  } catch (error) {
    failures += 1;
    console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200));
  }
}

assert.strictEqual(vectors.engineVersion, engine.ENGINE_VERSION,
  "the vector file and the engine must agree on the version");

// ---- the vectors themselves ------------------------------------------------
for (const testCase of vectors.cases) {
  check(testCase.name, () => {
    const result = engine.computeOrderFinance(testCase.order, testCase.settings, testCase.options || {});
    for (const [field, expected] of Object.entries(testCase.expect)) {
      const actual = result[field];
      if (Array.isArray(expected)) {
        assert.deepStrictEqual(actual, expected, `${field}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
      } else if (typeof expected === "number") {
        assert.ok(Math.abs(Number(actual) - expected) < 0.005,
          `${field}: got ${actual}, expected ${expected}`);
      } else {
        assert.strictEqual(actual, expected, `${field}: got ${actual}, expected ${expected}`);
      }
    }
  });
}

// ---- the rules the vectors imply, stated outright --------------------------

check("net profit is exactly revenue less the six deductions the decision names", () => {
  const order = {
    paidAmount: 1500, remainingAmount: 500, watchPurchasePrice: 1200,
    deliveryCost: 20, refundedAmount: 30, taxRate: 20,
    customFields: { "financialExpense::Stones": "150" }
  };
  const r = engine.computeOrderFinance(order, { feePercentage: 3, taxCalculationType: "Profit" });
  const rebuilt = r.revenue - r.vatDue - r.directCost - r.platformFee - r.deliveryCost - r.otherExpenses - r.refunded;
  assert.ok(Math.abs(rebuilt - r.netProfit) < 0.005, `${rebuilt} != ${r.netProfit}`);
});

check("gross margin never looks at the fee or the shipping", () => {
  const base = { paidAmount: 1000, remainingAmount: 0, watchPurchasePrice: 400, taxRate: 0 };
  const cheap = engine.computeOrderFinance({ ...base, deliveryCost: 0 }, { feePercentage: 0 });
  const dear = engine.computeOrderFinance({ ...base, deliveryCost: 250 }, { feePercentage: 9 });
  assert.strictEqual(cheap.grossMargin, dear.grossMargin);
  assert.strictEqual(cheap.grossMargin, 600);
});

check("the card's base-cost visibility setting is invisible to the engine", () => {
  const order = { paidAmount: 1000, remainingAmount: 0, watchPurchasePrice: 400, taxRate: 20 };
  const shown = engine.computeOrderFinance(order, { financialShowBaseCost: true, taxCalculationType: "Profit", feePercentage: 3 });
  const hidden = engine.computeOrderFinance(order, { financialShowBaseCost: false, taxCalculationType: "Profit", feePercentage: 3 });
  assert.deepStrictEqual(shown, hidden);
});

check("the margin scheme's base is the purchase price alone, not the old Profit base", () => {
  const order = {
    paidAmount: 2000, remainingAmount: 0, watchPurchasePrice: 1500,
    deliveryCost: 20, taxRate: 20,
    customFields: { "financialExpense::Polish": "100" }
  };
  const r = engine.computeOrderFinance(order, { feePercentage: 3, taxCalculationType: "Profit" });
  assert.strictEqual(r.vatBase, 500, "only the purchase price comes off the margin");
  assert.strictEqual(r.vatDue, 83.33);
  // What the old server would have produced: 2000 - 1500 - 100 - 60 - 20 = 320
  // at 20/120 = 53.33, a third less VAT than the scheme allows.
  assert.ok(r.vatDue > 53.34, "the engine no longer under-declares the margin VAT");
});

check("standard VAT and margin VAT agree when there is no purchase price", () => {
  const order = { paidAmount: 600, remainingAmount: 0, taxRate: 20 };
  const standard = engine.computeOrderFinance(order, { feePercentage: 0, taxCalculationType: "Revenue" });
  const margin = engine.computeOrderFinance(order, { feePercentage: 0, taxCalculationType: "Profit" });
  assert.strictEqual(standard.vatDue, margin.vatDue);
  assert.strictEqual(standard.vatDue, 100);
});

check("subtotal plus VAT equals the customer total on an inclusive price", () => {
  const r = engine.computeOrderFinance({ paidAmount: 1450, remainingAmount: 0, taxRate: 20 }, { feePercentage: 0 });
  assert.strictEqual(r.vatDue, 241.67);
  assert.ok(Math.abs((r.revenue - r.vatDue) + r.vatDue - r.customerTotal) < 0.005);
  assert.strictEqual(r.customerTotal, 1450, "an inclusive price is what the customer pays");
});

check("every custom line is counted and every unlabelled one is named", () => {
  const { total, lines, orphans } = engine.customLineTotal(
    {
      orderExpenseItemsJSON: "[{\"id\":\"e1\",\"title\":\"Stones\"}]",
      "financialExpense::Stones": "150",
      "financialExpense::Wax": "25",
      notAnExpense: "999"
    },
    engine.EXPENSE_PREFIX,
    "orderExpenseItemsJSON"
  );
  assert.strictEqual(total, 175);
  assert.strictEqual(lines.length, 2);
  assert.deepStrictEqual(orphans, ["Wax"]);
});

check("an amount is read at full precision and rounded once at the output", () => {
  assert.strictEqual(engine.readAmount("0.005"), 0.005);
  assert.strictEqual(engine.readAmount("12.345"), 12.345);
  assert.strictEqual(engine.readAmount("-50"), -50);
  assert.strictEqual(engine.readAmount(""), 0);
  assert.strictEqual(engine.readAmount("abc"), 0);
  assert.strictEqual(engine.round2(2.345), 2.35);
  assert.strictEqual(engine.round2(-2.345), -2.35);
});

check("the two names a workspace has always stored map onto the three methods", () => {
  assert.strictEqual(engine.normalizeVatMethod("Revenue"), "standard");
  assert.strictEqual(engine.normalizeVatMethod("Profit"), "margin");
  assert.strictEqual(engine.normalizeVatMethod("Standard VAT"), "standard");
  assert.strictEqual(engine.normalizeVatMethod("Margin Scheme"), "margin");
  assert.strictEqual(engine.normalizeVatMethod("No VAT"), "none");
  assert.strictEqual(engine.normalizeVatMethod(""), "standard");
});

check("the new settings default to exactly today's behaviour", () => {
  const s = engine.normalizeFinanceSettings({});
  assert.strictEqual(s.vatRegistered, true);
  assert.strictEqual(s.pricesIncludeVat, true);
  assert.strictEqual(s.defaultVatMethod, "standard");
  assert.strictEqual(s.feePercentage, 3);
  assert.strictEqual(s.defaultTaxRate, 20);
});

check("the engine is pure: the same input twice gives the same answer", () => {
  const order = {
    paidAmount: 1500, remainingAmount: 500, watchPurchasePrice: 1200, taxRate: 20,
    customFields: { "financialExpense::Stones": "150" }
  };
  const settings = { feePercentage: 3, taxCalculationType: "Profit" };
  assert.deepStrictEqual(
    engine.computeOrderFinance(order, settings, { paymentDateMs: 1_700_000_000_000 }),
    engine.computeOrderFinance(order, settings, { paymentDateMs: 1_700_000_000_000 })
  );
});

check("computing does not mutate the order or the settings it was given", () => {
  const order = { paidAmount: 100, customFields: { "financialExpense::A": "5" } };
  const settings = { feePercentage: 3 };
  const orderBefore = JSON.stringify(order);
  const settingsBefore = JSON.stringify(settings);
  engine.computeOrderFinance(order, settings);
  assert.strictEqual(JSON.stringify(order), orderBefore);
  assert.strictEqual(JSON.stringify(settings), settingsBefore);
});

if (failures) {
  console.log(`\n❌ ${failures} failing`);
  process.exit(1);
}
console.log(`\n✅ FINANCE ENGINE GEÇTİ (${vectors.cases.length} vektör + 12 kural)`);

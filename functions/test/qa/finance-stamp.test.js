// The trigger that puts the Finance Engine's answer on the order.
//
// The property this file exists for is the loop guard. The trigger writes to
// the document it was triggered by, so if the block it computes is ever seen as
// different from the block it just wrote, it fires again, for ever, on every
// order in every workspace. `sameFinance(freshlyStampedBlock, computed)` must
// be true — that single assertion is the difference between a stamp and a
// runaway bill.
const assert = require("assert");
const { createFinanceStamp } = require("../../finance/stamp");
const { computeOrderFinance } = require("../../finance/engine");

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

// A Firestore stand-in: enough to construct the factory and, further down, to
// walk a workspace of orders through the backfill and see what it wrote.
function fakeFirestore(orders = []) {
  const writes = [];
  const commits = [];
  const docs = orders.map((order, index) => {
    const id = order.id || `o${index + 1}`;
    return { id, data: () => ({ ...order.data }), ref: { id } };
  });
  return {
    writes,
    commits,
    db: {
      collection: (name) => ({
        doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }),
        where: () => ({ get: async () => ({ docs: name === "siparisler" ? docs : [], size: docs.length }) })
      }),
      batch: () => {
        const staged = [];
        return {
          update: (ref, value) => staged.push({ id: ref.id, value }),
          commit: async () => { writes.push(...staged); commits.push(staged.length); }
        };
      }
    }
  };
}

function buildStamp(store) {
  return createFinanceStamp({
    admin: { firestore: () => store.db },
    onDocumentWritten: (_options, handler) => handler,
    onCall: (_options, handler) => handler,
    onSchedule: (_options, handler) => handler,
    HttpsError: class extends Error {},
    requireFinanceBackfill: async () => ({ uid: "u1", companyId: "c1", email: "a@b.c" }),
    region: "europe-west2"
  });
}

const { _internal } = buildStamp(fakeFirestore());
const { financeBlockFor, sameFinance, COMPARED } = _internal;

const ORDER = {
  companyId: "c1",
  paidAmount: 1500,
  remainingAmount: 500,
  watchPurchasePrice: 1200,
  deliveryCost: 20,
  refundedAmount: 30,
  taxRate: 20,
  customFields: {
    orderRemainingItemsJSON: "[{\"id\":\"r1\",\"title\":\"Balance\"}]",
    "financialRemaining::Balance": "200",
    "financialRemaining::Deposit": "100",
    "financialExpense::Stones": "150",
    "financialExpense::Credit": "-50"
  }
};
const SETTINGS = { feePercentage: 3, taxCalculationType: "Profit" };

check("a freshly stamped block is seen as unchanged, so the trigger cannot loop", () => {
  const first = financeBlockFor(ORDER, SETTINGS, 1_700_000_000_000);
  // Second pass: the trigger fires on its own write and recomputes.
  const second = financeBlockFor({ ...ORDER, finance: first.block }, SETTINGS, 1_700_000_000_500);
  assert.strictEqual(sameFinance(first.block, second.computed), true,
    "the block just written must compare equal to the next computation");
});

check("stamping is idempotent across many passes", () => {
  let stored = null;
  for (let pass = 0; pass < 5; pass += 1) {
    const { computed, block } = financeBlockFor({ ...ORDER, finance: stored }, SETTINGS, 1_700_000_000_000 + pass);
    if (stored && sameFinance(stored, computed)) return; // settled, as it must by pass two
    stored = block;
  }
  assert.fail("the block never settled — the trigger would keep writing");
});

check("an order with no finance block yet is seen as changed", () => {
  const { computed } = financeBlockFor(ORDER, SETTINGS, 1);
  assert.strictEqual(sameFinance(undefined, computed), false);
  assert.strictEqual(sameFinance(null, computed), false);
  assert.strictEqual(sameFinance("not an object", computed), false);
  assert.strictEqual(sameFinance({}, computed), false);
});

check("a real change of a penny or more is seen", () => {
  const { block, computed } = financeBlockFor(ORDER, SETTINGS, 1);
  assert.strictEqual(sameFinance({ ...block, netProfit: block.netProfit - 0.01 }, computed), false);
  assert.strictEqual(sameFinance({ ...block, vatDue: block.vatDue + 1 }, computed), false);
  assert.strictEqual(sameFinance({ ...block, method: "standard" }, computed), false);
  assert.strictEqual(sameFinance({ ...block, engineVersion: 0 }, computed), false);
});

check("float noise below half a penny is not a change, or the trigger would loop on it", () => {
  const { block, computed } = financeBlockFor(ORDER, SETTINGS, 1);
  assert.strictEqual(sameFinance({ ...block, netProfit: block.netProfit + 0.001 }, computed), true);
});

check("a missing number where one is expected is a change, not a match", () => {
  const { block, computed } = financeBlockFor(ORDER, SETTINGS, 1);
  const withoutProfit = { ...block };
  delete withoutProfit.netProfit;
  assert.strictEqual(sameFinance(withoutProfit, computed), false);
});

check("the unlabelled amounts are part of the comparison", () => {
  const { block, computed } = financeBlockFor(ORDER, SETTINGS, 1);
  assert.deepStrictEqual(block.orphanKeys, ["financialRemaining::Deposit"]);
  assert.strictEqual(sameFinance({ ...block, orphanKeys: [] }, computed), false);
  assert.strictEqual(sameFinance({ ...block, orphanKeys: ["financialExpense::Other"] }, computed), false);
});

check("the stamped block carries the figures and the version, and no per-line detail", () => {
  const { block } = financeBlockFor(ORDER, SETTINGS, 1_700_000_000_000);
  for (const field of COMPARED) {
    assert.ok(Object.prototype.hasOwnProperty.call(block, field), `${field} is missing from the block`);
  }
  assert.strictEqual(block.computedAtMs, 1_700_000_000_000);
  assert.ok(!("receivableLines" in block), "the lines stay in customFields, not duplicated onto the order");
  assert.ok(!("expenseLines" in block));
});

check("the block agrees with the engine, figure for figure", () => {
  const { block } = financeBlockFor(ORDER, SETTINGS, 1);
  const direct = computeOrderFinance(ORDER, SETTINGS, { paymentDateMs: NaN });
  for (const field of COMPARED) {
    assert.deepStrictEqual(block[field], direct[field], `${field} differs from the engine`);
  }
});

check("the order's own payment date drives the tax milestone", () => {
  const milestone = { feePercentage: 0, taxMilestoneEnabled: true, taxMilestoneDate: 1_750_000_000 };
  const order = { companyId: "c1", paidAmount: 2000, remainingAmount: 0, watchPurchasePrice: 1500, taxRate: 20 };
  const before = financeBlockFor({ ...order, paymentDate: new Date(1_740_000_000_000) }, milestone, 1);
  const after = financeBlockFor({ ...order, paymentDate: new Date(1_760_000_000_000) }, milestone, 1);
  assert.strictEqual(before.block.method, "margin");
  assert.strictEqual(after.block.method, "standard");
});

check("a Firestore Timestamp payment date is read as well as a Date", () => {
  const milestone = { feePercentage: 0, taxMilestoneEnabled: true, taxMilestoneDate: 1_750_000_000 };
  const order = { companyId: "c1", paidAmount: 2000, remainingAmount: 0, watchPurchasePrice: 1500, taxRate: 20 };
  const asTimestamp = { toMillis: () => 1_740_000_000_000 };
  const { block } = financeBlockFor({ ...order, paymentDate: asTimestamp }, milestone, 1);
  assert.strictEqual(block.method, "margin");
});

check("the block does not change the order's own fields", () => {
  const order = JSON.parse(JSON.stringify(ORDER));
  const before = JSON.stringify(order);
  financeBlockFor(order, SETTINGS, 1);
  assert.strictEqual(JSON.stringify(order), before);
});

// ---- the backfill --------------------------------------------------------

const asyncChecks = [];
function checkAsync(name, run) { asyncChecks.push({ name, run }); }

checkAsync("the backfill stamps an order with no block and leaves a settled one alone", async () => {
  const settled = financeBlockFor(ORDER, {}, 1).block;
  const store = fakeFirestore([
    { id: "needs", data: { ...ORDER } },
    { id: "settled", data: { ...ORDER, finance: settled } }
  ]);
  const { backfillWorkspaceFinance } = buildStamp(store);
  const result = await backfillWorkspaceFinance({ data: {}, auth: { token: { email: "a@b.c" } } });
  assert.strictEqual(result.total, 2);
  assert.strictEqual(result.stamped, 1);
  assert.strictEqual(result.unchanged, 1);
  assert.strictEqual(store.writes.length, 1);
  assert.strictEqual(store.writes[0].id, "needs");
  assert.deepStrictEqual(Object.keys(store.writes[0].value), ["finance"],
    "the backfill touches nothing but the block");
});

checkAsync("a dry run reports what would change and writes nothing", async () => {
  const store = fakeFirestore([{ id: "a", data: { ...ORDER } }, { id: "b", data: { ...ORDER } }]);
  const { backfillWorkspaceFinance } = buildStamp(store);
  const result = await backfillWorkspaceFinance({ data: { dryRun: true }, auth: { token: {} } });
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.stamped, 2);
  assert.strictEqual(store.writes.length, 0);
  assert.strictEqual(store.commits.length, 0);
});

checkAsync("the dry run shows the old figure beside the new one", async () => {
  const store = fakeFirestore([{ id: "a", data: { ...ORDER, taxAmount: 53.33, paymentFee: 60 } }]);
  const { backfillWorkspaceFinance } = buildStamp(store);
  const result = await backfillWorkspaceFinance({ data: { dryRun: true }, auth: { token: {} } });
  const sample = result.samples[0];
  assert.strictEqual(sample.wasTaxAmount, 53.33);
  assert.strictEqual(sample.wasPaymentFee, 60);
  assert.ok(sample.nowVatDue > sample.wasTaxAmount,
    "the engine owes more VAT than the old Profit base produced");
});

checkAsync("running the backfill twice writes nothing the second time", async () => {
  const store = fakeFirestore([{ id: "a", data: { ...ORDER } }]);
  const { backfillWorkspaceFinance } = buildStamp(store);
  await backfillWorkspaceFinance({ data: {}, auth: { token: {} } });
  const written = store.writes[0].value.finance;
  const settledStore = fakeFirestore([{ id: "a", data: { ...ORDER, finance: written } }]);
  const result = await buildStamp(settledStore).backfillWorkspaceFinance({ data: {}, auth: { token: {} } });
  assert.strictEqual(result.stamped, 0);
  assert.strictEqual(settledStore.writes.length, 0);
});

(async () => {
  for (const { name, run } of asyncChecks) {
    try {
      await run();
      console.log("PASS ", name);
    } catch (error) {
      failures += 1;
      console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200));
    }
  }
  if (failures) {
    console.log(`\n❌ ${failures} failing`);
    process.exit(1);
  }
  console.log("\n✅ FINANCE STAMP GEÇTİ");
})();

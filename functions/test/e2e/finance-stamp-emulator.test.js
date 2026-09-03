// The finance stamp against a real Firestore.
//
// The unit test proves the arithmetic and the loop guard against a hand-built
// fake. What it cannot prove is the round trip: Firestore stores every number
// as a double and hands it back its own way, so a block that compares equal in
// memory could compare different after a save — and a trigger that sees its own
// write as a change fires for ever, on every order in every workspace.
//
// This writes an order, runs the trigger's own handler against the real
// snapshot, reads the document back, and runs the handler again on what
// Firestore actually returned. The second pass must write nothing.
//
//   firebase emulators:exec --only firestore "node functions/test/e2e/finance-stamp-emulator.test.js"
const assert = require("assert");
process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = admin.firestore();

const { createFinanceStamp } = require("../../finance/stamp");

let failures = 0;
async function check(name, run) {
  try {
    await run();
    console.log("PASS ", name);
  } catch (error) {
    failures += 1;
    console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220));
  }
}

// The handler the deployed trigger runs, plus a counter so a write that should
// not happen is visible rather than merely harmless.
let handler = null;
const { _internal } = createFinanceStamp({
  admin,
  onDocumentWritten: (_options, fn) => { handler = fn; return fn; },
  onCall: (_options, fn) => fn,
  HttpsError: class extends Error {},
  requireFinanceBackfill: async () => ({ uid: "u-e2e", companyId: COMPANY, email: "e2e@nivadesk.test" }),
  region: "europe-west2"
});
assert.ok(typeof handler === "function", "the trigger handler was captured");

const COMPANY = "finance-stamp-e2e";
const ORDER_ID = "order-1";

async function fire(orderId) {
  const snap = await db.collection("siparisler").doc(orderId).get();
  await handler({ params: { orderId }, data: { after: snap } });
}

async function main() {
  await db.collection("companySettings").doc(COMPANY).set({
    companyId: COMPANY,
    feePercentage: 3,
    defaultTaxRate: 20,
    taxCalculationType: "Profit"
  });

  await db.collection("siparisler").doc(ORDER_ID).set({
    companyId: COMPANY,
    customerName: "E2E Customer",
    paymentDate: admin.firestore.Timestamp.fromMillis(1_740_000_000_000),
    paidAmount: 1500,
    remainingAmount: 500,
    watchPurchasePrice: 1200,
    deliveryCost: 20,
    refundedAmount: 30,
    taxRate: 20,
    customFields: {
      orderRemainingItemsJSON: JSON.stringify([{ id: "r1", title: "Balance" }]),
      "financialRemaining::Balance": "200",
      "financialRemaining::Deposit": "100",
      "financialExpense::Stones": "150",
      "financialExpense::Credit": "-50"
    }
  });

  await check("the trigger stamps the block on a real document", async () => {
    await fire(ORDER_ID);
    const stored = (await db.collection("siparisler").doc(ORDER_ID).get()).data() || {};
    const finance = stored.finance;
    assert.ok(finance, "no finance block was written");
    // The same order the golden vectors use: revenue 2300, margin 1100,
    // VAT 183.33 under the margin scheme, net profit 697.67 after a 30 refund.
    assert.strictEqual(finance.revenue, 2300);
    assert.strictEqual(finance.directCost, 1200);
    assert.strictEqual(finance.grossMargin, 1100);
    assert.strictEqual(finance.otherExpenses, 100);
    assert.strictEqual(finance.platformFee, 69);
    assert.strictEqual(finance.method, "margin");
    assert.strictEqual(finance.vatBase, 1100);
    assert.strictEqual(finance.vatDue, 183.33);
    assert.strictEqual(finance.refunded, 30);
    assert.strictEqual(finance.netProfit, 697.67);
    assert.deepStrictEqual(finance.orphanKeys, ["financialRemaining::Deposit"]);
  });

  await check("firing again on what Firestore returned writes nothing", async () => {
    const before = (await db.collection("siparisler").doc(ORDER_ID).get()).data().finance;
    await fire(ORDER_ID);
    const after = (await db.collection("siparisler").doc(ORDER_ID).get()).data().finance;
    assert.strictEqual(after.computedAtMs, before.computedAtMs,
      "the block was rewritten, so the trigger would keep firing on its own write");
  });

  await check("ten more passes still write nothing", async () => {
    const before = (await db.collection("siparisler").doc(ORDER_ID).get()).data().finance.computedAtMs;
    for (let i = 0; i < 10; i += 1) await fire(ORDER_ID);
    const after = (await db.collection("siparisler").doc(ORDER_ID).get()).data().finance.computedAtMs;
    assert.strictEqual(after, before);
  });

  await check("a real edit moves the figures and settles again", async () => {
    await db.collection("siparisler").doc(ORDER_ID).update({ paidAmount: 1600 });
    await fire(ORDER_ID);
    const first = (await db.collection("siparisler").doc(ORDER_ID).get()).data().finance;
    assert.strictEqual(first.revenue, 2400, "the extra 100 reached the revenue");
    assert.strictEqual(first.grossMargin, 1200);
    assert.strictEqual(first.vatDue, 200);
    await fire(ORDER_ID);
    const second = (await db.collection("siparisler").doc(ORDER_ID).get()).data().finance;
    assert.strictEqual(second.computedAtMs, first.computedAtMs, "it settled on the first pass");
  });

  await check("an order with no companyId is left alone", async () => {
    await db.collection("siparisler").doc("order-orphan").set({ paidAmount: 100, remainingAmount: 0 });
    await fire("order-orphan");
    const stored = (await db.collection("siparisler").doc("order-orphan").get()).data() || {};
    assert.strictEqual(stored.finance, undefined);
  });

  await check("a deleted order does not throw", async () => {
    await db.collection("siparisler").doc("order-gone").set({ companyId: COMPANY, paidAmount: 1 });
    await db.collection("siparisler").doc("order-gone").delete();
    await fire("order-gone");
  });

  await check("the backfill stamps a workspace and is a no-op the second time", async () => {
    const { backfillWorkspaceFinance } = createFinanceStamp({
      admin,
      onDocumentWritten: (_o, fn) => fn,
      onCall: (_o, fn) => fn,
      HttpsError: class extends Error {},
      requireFinanceBackfill: async () => ({ uid: "u-e2e", companyId: COMPANY, email: "e2e@nivadesk.test" }),
      region: "europe-west2"
    });
    // A second order nothing has stamped yet.
    await db.collection("siparisler").doc("order-2").set({
      companyId: COMPANY, paidAmount: 600, remainingAmount: 0, taxRate: 20
    });
    const dry = await backfillWorkspaceFinance({ data: { dryRun: true }, auth: { token: {} } });
    assert.ok(dry.stamped >= 1, `dry run found nothing to do: ${JSON.stringify(dry)}`);
    const applied = await backfillWorkspaceFinance({ data: {}, auth: { token: {} } });
    assert.ok(applied.stamped >= 1);
    const again = await backfillWorkspaceFinance({ data: {}, auth: { token: {} } });
    assert.strictEqual(again.stamped, 0, "the second run should find every order settled");
    const second = (await db.collection("siparisler").doc("order-2").get()).data().finance;
    assert.strictEqual(second.revenue, 600);
    assert.strictEqual(second.method, "margin", "the workspace default is the margin scheme here");
    // No purchase price, so the margin IS the whole revenue and the margin
    // scheme owes exactly what the standard scheme would: 600 x 20/120.
    assert.strictEqual(second.grossMargin, 600);
    assert.strictEqual(second.vatDue, 100);
  });

  // Leave the emulator as we found it.
  for (const id of [ORDER_ID, "order-2", "order-orphan"]) {
    await db.collection("siparisler").doc(id).delete().catch(() => undefined);
  }
  await db.collection("companySettings").doc(COMPANY).delete().catch(() => undefined);

  if (failures) {
    console.log(`\n❌ ${failures} failing`);
    process.exit(1);
  }
  console.log("\n✅ FINANCE STAMP E2E GEÇTİ");
}

main().catch((error) => {
  console.error("e2e crashed:", error);
  process.exit(1);
});

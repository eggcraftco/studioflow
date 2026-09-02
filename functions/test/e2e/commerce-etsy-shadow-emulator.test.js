// Faz 2/3 — the common engine shadowing Etsy's applyReceipt on a real
// Firestore: same order id, a recorded verdict per receipt, and the live
// order untouched by the shadow. The diffs it records are the parity list
// Faz 3 works through before the engine may become primary for Etsy.
//   firebase emulators:exec --only firestore "node functions/test/e2e/commerce-etsy-shadow-emulator.test.js"
const assert = require("assert");
process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const admin = require("firebase-admin");
const etsy = require("../../etsy");
const index = require("../../index.js");
const flags = require("../../commerce/flags");
const db = admin.firestore();
const applyReceipt = index._e2e.applyReceipt;

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; console.log("FAIL ", name, "-", String(error && error.message || error).replace(/\s+/g, " ").slice(0, 300)); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }

const CID = "e2e-etsy-shadow-company"; const SHOP = "5100"; const CONN = "e2e_shadow_conn";
const receipt = (over = {}) => ({
  receipt_id: 910001, status: "paid", is_paid: true, create_timestamp: 1788307200, update_timestamp: 1788310800,
  buyer_user_id: 4242, buyer_email: "shadow@example.com", name: "Sha Dow", first_line: "1 Shadow St", city: "York", zip: "YO1", country_iso: "GB",
  grandtotal: { amount: 4000, divisor: 100, currency_code: "GBP" }, subtotal: { amount: 4000, divisor: 100, currency_code: "GBP" },
  transactions: [{ transaction_id: 6001, title: "Repair", quantity: 1, price: { amount: 4000, divisor: 100, currency_code: "GBP" }, expected_ship_date: 1788912000 }],
  ...over
});
async function wipe() {
  for (const name of ["siparisler", "musteriler", etsy.EXTERNAL_ORDER_COLLECTION, etsy.CUSTOMER_LINK_COLLECTION, "commerceShadow"]) {
    const snap = await db.collection(name).where("companyId", "==", CID).get();
    await Promise.all(snap.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  await db.collection(etsy.CONNECTION_COLLECTION).doc(CONN).delete();
  await db.collection("companies").doc(CID).delete(); await db.collection("companySettings").doc(CID).delete();
  await db.collection("appConfig").doc("commerce").delete(); flags.resetCommerceFlagCache();
}
(async () => {
  await wipe();
  await db.collection("companies").doc(CID).set({ name: "Shadow Studio", billingPlan: "pro_monthly", billingStatus: "active", billingProvider: "stripe", ownerUid: "e2e_owner" });
  await db.collection("companySettings").doc(CID).set({ defaultDeliveryTime: 21 });
  const connRef = db.collection(etsy.CONNECTION_COLLECTION).doc(CONN);
  await connRef.set({ companyId: CID, provider: "etsy", externalShopId: SHOP, externalShopName: "Shadow Shop", shopCurrency: "GBP", status: "connected", importState: "done" });
  const connData = (await connRef.get()).data();
  const call = (r) => applyReceipt({ companyId: CID, connectionRef: connRef, connectionData: connData, receipt: r, defaultDeliveryTime: 21 });

  await check("with the flag off, a receipt lands as before and no shadow row is written", async () => {
    const out = await call(receipt());
    assert.strictEqual(out.status, "created");
    assert.strictEqual((await db.collection("commerceShadow").where("companyId", "==", CID).get()).size, 0);
  });

  await check("with the flag on for this connection, the engine's verdict is recorded beside the live one, on the same order id", async () => {
    await db.collection("appConfig").doc("commerce").set({ shadow: { enabled: false, connections: { [`etsy:${CONN}`]: true } } });
    flags.resetCommerceFlagCache();
    const out = await call(receipt({ update_timestamp: 1788314400, status: "completed" }));
    assert.strictEqual(out.status, "updated");
    const rows = await db.collection("commerceShadow").where("companyId", "==", CID).get();
    assert.strictEqual(rows.size, 1);
    const row = rows.docs[0].data();
    assert.strictEqual(row.provider, "etsy"); assert.strictEqual(row.connectionId, CONN); assert.strictEqual(row.externalId, "910001");
    assert.strictEqual(row.live.orderId, etsy.nivadeskOrderIdFor(CID, SHOP, "910001"));
    assert.strictEqual(row.sameOrderId, true, "the engine derives the very same NivaDesk order id");
    assert.strictEqual(row.engine.result, "would_update");
    console.log("   parity diffs (Etsy live vs engine):", row.diffCount);
    for (const d of row.diffs) console.log(`     · ${d.field}\n       engine: ${String(d.engine).slice(0, 220)}\n       live:   ${String(d.live).slice(0, 220)}`);
    const live = (await db.collection("siparisler").doc(row.live.orderId).get()).data();
    assert.strictEqual(live.commerce, undefined, "shadow wrote nothing on the order");
    assert.strictEqual(live.customFields["Etsy Status"], "completed", "the live path did its normal work");
  });

  await check("a receipt the live path holds or skips is shadowed with that verdict too, never a write", async () => {
    await db.collection("companies").doc(CID).set({ billingPlan: "demo", billingPlanName: "Free", billingStatus: "free", billingProvider: admin.firestore.FieldValue.delete() }, { merge: true });
    for (let i = 0; i < 10; i += 1) await db.collection("siparisler").doc(`${CID}-live-${i}`).set({ companyId: CID, status: "In Progress", isDelivered: false, customerName: `L${i}` });
    const out = await call(receipt({ receipt_id: 910002, update_timestamp: 1788318000 }));
    assert.strictEqual(out.status, "held");
    const row = (await db.collection("commerceShadow").where("companyId", "==", CID).where("externalId", "==", "910002").get()).docs[0].data();
    assert.strictEqual(row.live.status, "held");
    assert.ok(["would_create", "held"].includes(row.engine.result), row.engine.result);
    assert.strictEqual((await db.collection("siparisler").doc(etsy.nivadeskOrderIdFor(CID, SHOP, "910002")).get()).exists, false);
  });

  await wipe();
  console.log(failures === 0 ? "\n✅ ETSY SHADOW GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });

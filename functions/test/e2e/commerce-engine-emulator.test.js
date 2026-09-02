// Faz 2 — the common engine against a real Firestore: one envelope in, one
// transactional decision out, the same on every path; shadow mode that never
// writes; the worker's attempt record; the flags that open the door per
// connection. AC-001/002/004/005 and TEST-003..007 live here.
//
//   firebase emulators:exec --only firestore "node functions/test/e2e/commerce-engine-emulator.test.js"

const assert = require("assert");
process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = admin.firestore();

const { applyEnvelope } = require("../../commerce/engine");
const { recordShadow, SHADOW_COLLECTION } = require("../../commerce/shadow");
const { processCommerceEvent, recordReceived, EVENT_COLLECTION } = require("../../commerce/worker");
const { readCommerceFlags, flagEnabled, resetCommerceFlagCache } = require("../../commerce/flags");
const { normalizeShopifyOrder } = require("../../commerce/adapters/shopify");
const { identityDocId } = require("../../commerce/envelope");

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; console.log("FAIL ", name, "-", String(error && error.message || error).replace(/\s+/g, " ").slice(0, 300)); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }

const COMPANY = "e2e-engine-company";
const SHOP_A = "e2e-engine-a.myshopify.com";
const SHOP_B = "e2e-engine-b.myshopify.com";
const orderIdFor = (env) => `shopify_${COMPANY}_${env.identity.external_id}`;
const orderRef = (id) => db.collection("siparisler").doc(id);
const ctxFor = (extra = {}) => ({ companyId: COMPANY, mode: "apply", source: "shopify", orderIdFor, defaultDeliveryTime: 9, ...extra });

function restOrder(extra = {}) {
  return {
    id: 2001, name: "#2001", financial_status: "paid", currency: "GBP", total_price: "50.00", total_tax: "8.33", subtotal_price: "50.00",
    created_at: "2026-09-02T01:00:00Z", updated_at: "2026-09-02T01:05:00Z", note: "engrave AL", email: "eng@example.com",
    customer: { id: 31, first_name: "Eng", last_name: "Ine", phone: "+44 7000 000000" },
    billing_address: { address1: "5 Engine Rd", city: "Leeds", zip: "LS5", country: "United Kingdom" },
    line_items: [{ id: 1, sku: "ENG-1", title: "Signet ring", quantity: 1, price: "50.00" }],
    ...extra
  };
}
const env = (extra = {}, shop = SHOP_A, eventOrigin = "provider") => normalizeShopifyOrder(restOrder(extra), { shop, shopName: "Engine Shop", eventOrigin });

async function wipe() {
  for (const col of ["siparisler", "externalEntities", SHADOW_COLLECTION, EVENT_COLLECTION]) {
    const snap = await db.collection(col).where("companyId", "==", COMPANY).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.collection("appConfig").doc("commerce").delete().catch(() => undefined);
  resetCommerceFlagCache();
}

(async () => {
  await wipe();

  await check("a first envelope creates the order with the shop's fields, the studio's defaults and the identity row", async () => {
    const out = await applyEnvelope(db, env(), ctxFor({ eventKey: "shopify|a|evt-1" }));
    assert.strictEqual(out.result, "created");
    const doc = (await orderRef(out.orderId).get()).data();
    assert.strictEqual(doc.customerName, "Eng Ine");
    assert.strictEqual(doc.paidAmount, 50); assert.strictEqual(doc.taxAmount, 8.33);
    assert.strictEqual(doc.status, "Not Yet"); assert.strictEqual(doc.deliveryTime, 9); assert.strictEqual(doc.courier, "Auto Detect");
    assert.strictEqual(doc.customFields["Shopify Order ID"], "2001");
    assert.strictEqual(doc.notes, "engrave AL");
    assert.strictEqual(doc.commerce.provider, "shopify"); assert.strictEqual(doc.commerce.externalUpdatedAt, "2026-09-02T01:05:00.000Z");
    assert.strictEqual(doc.commerce.lastEventKey, "shopify|a|evt-1");
    const identity = (await db.collection("externalEntities").doc(identityDocId(env().identity)).get()).data();
    assert.strictEqual(identity.nivadeskOrderId, out.orderId); assert.strictEqual(identity.companyId, COMPANY);
  });

  await check("the same event again is a duplicate, the same facts again are a no-op, and 100 deliveries leave one order (AC-001)", async () => {
    const dup = await applyEnvelope(db, env(), ctxFor({ eventKey: "shopify|a|evt-1" }));
    assert.strictEqual(dup.result, "duplicate");
    const noop = await applyEnvelope(db, env(), ctxFor({ eventKey: "shopify|a|evt-2" }));
    assert.strictEqual(noop.result, "noop");
    for (let i = 0; i < 100; i += 1) await applyEnvelope(db, env(), ctxFor({ eventKey: `shopify|a|flood-${i}` }));
    const count = await db.collection("siparisler").where("companyId", "==", COMPANY).get();
    assert.strictEqual(count.size, 1);
  });

  await check("the studio's work survives a resync: status, todo, manual tracking, manual tax rate, stored phone (TEST-005/006/007, AC-005)", async () => {
    const id = orderIdFor(env());
    await orderRef(id).set({ status: "In Progress", designStatus: "Approved", todoItems: [{ title: "polish" }], trackingNumber: "MANUAL-1", courier: "DPD", taxRate: 20, whatsappNumber: "+44 1", notes: "bench: resize to M\n\nengrave AL" }, { merge: true });
    const out = await applyEnvelope(db, env({ financial_status: "partially_refunded", updated_at: "2026-09-02T01:10:00Z", customer: { id: 31, first_name: "Eng", last_name: "Ine" }, fulfillments: [{ id: 9, tracking_number: "RM-NEW", tracking_company: "Royal Mail" }] }), ctxFor({ eventKey: "shopify|a|evt-3" }));
    assert.strictEqual(out.result, "updated");
    const doc = (await orderRef(id).get()).data();
    assert.strictEqual(doc.status, "In Progress"); assert.strictEqual(doc.designStatus, "Approved");
    assert.deepStrictEqual(doc.todoItems, [{ title: "polish" }]);
    assert.strictEqual(doc.trackingNumber, "MANUAL-1", "manual tracking wins over the provider's"); assert.strictEqual(doc.courier, "DPD");
    assert.strictEqual(doc.taxRate, 20, "the channel's taxRate constant did not zero the manual rate");
    assert.strictEqual(doc.whatsappNumber, "+44 1", "a phone the provider stopped sending is not blanked");
    assert.strictEqual(doc.notes, "bench: resize to M\n\nengrave AL", "the note was already delivered; nothing appended twice");
    assert.strictEqual(doc.customFields["Shopify Status"], "partially_refunded", "the shop's own status moved");
    assert.strictEqual(doc.paidAmount, 50);
  });

  await check("an older update never overwrites a newer record (SYNC-013, AC-002)", async () => {
    const stale = await applyEnvelope(db, env({ financial_status: "paid", updated_at: "2026-09-02T00:30:00Z" }), ctxFor({ eventKey: "shopify|a|evt-old" }));
    assert.strictEqual(stale.result, "stale");
    assert.strictEqual((await orderRef(orderIdFor(env())).get()).data().customFields["Shopify Status"], "partially_refunded");
  });

  await check("the same external id in another connection is another order (TEST-004, DATA-002)", async () => {
    const out = await applyEnvelope(db, env({}, SHOP_B), ctxFor({ eventKey: "shopify|b|evt-1", orderIdFor: (e) => `shopify_${COMPANY}_${e.identity.connection_id}_${e.identity.external_id}` }));
    assert.strictEqual(out.result, "created");
    assert.notStrictEqual(out.orderId, orderIdFor(env()));
    assert.strictEqual((await db.collection("siparisler").where("companyId", "==", COMPANY).get()).size, 2);
  });

  await check("a cancellation reaches the workflow status only as the merchant's rule, with a history entry", async () => {
    const out = await applyEnvelope(db, env({ cancelled_at: "2026-09-02T01:20:00Z", updated_at: "2026-09-02T01:20:00Z" }), ctxFor({ eventKey: "shopify|a|evt-cancel" }));
    assert.strictEqual(out.result, "updated");
    const doc = (await orderRef(orderIdFor(env())).get()).data();
    assert.strictEqual(doc.status, "Cancelled");
    assert.strictEqual(doc.historyLog[0].title, "Order cancelled");
    const off = await applyEnvelope(db, env({ cancelled_at: "2026-09-02T01:21:00Z", updated_at: "2026-09-02T01:21:00Z", id: 2002, name: "#2002" }), ctxFor({ eventKey: "shopify|a|evt-c2", syncCancellations: false }));
    assert.strictEqual(off.result, "created");
    assert.strictEqual((await orderRef(orderIdFor(env({ id: 2002 }))).get()).data().status, "Not Yet", "with the rule off, the platform's cancellation stays a platform status");
  });

  await check("a test order never becomes an order, and the plan's capacity parks a new one (SYNC-006, INB-006)", async () => {
    const test = await applyEnvelope(db, env({ id: 2003, test: true }), ctxFor({ eventKey: "shopify|a|evt-test" }));
    assert.strictEqual(test.result, "skipped");
    assert.strictEqual((await orderRef(orderIdFor(env({ id: 2003 }))).get()).exists, false);
    let held = null;
    const out = await applyEnvelope(db, env({ id: 2004 }), ctxFor({ eventKey: "shopify|a|evt-cap", capacity: async () => ({ allowed: false, limit: 10, active: 10 }), hold: async (e) => { held = e.identity.external_id; } }));
    assert.strictEqual(out.result, "held"); assert.strictEqual(held, "2004");
    assert.strictEqual((await orderRef(orderIdFor(env({ id: 2004 }))).get()).exists, false);
  });

  await check("shadow mode decides exactly like apply mode and writes nothing (MIG-002)", async () => {
    const before = (await db.collection("siparisler").where("companyId", "==", COMPANY).get()).size;
    const statusBefore = (await orderRef(orderIdFor(env())).get()).data().customFields["Shopify Status"];
    const create = await applyEnvelope(db, env({ id: 2005 }), ctxFor({ mode: "shadow", eventKey: "shopify|a|shadow-1" }));
    assert.strictEqual(create.result, "would_create"); assert.ok(create.patch.customerName);
    const update = await applyEnvelope(db, env({ financial_status: "refunded", updated_at: "2026-09-02T02:00:00Z" }), ctxFor({ mode: "shadow", eventKey: "shopify|a|shadow-2" }));
    assert.strictEqual(update.result, "would_update"); assert.strictEqual(update.patch.customFields["Shopify Status"], "refunded");
    assert.strictEqual((await db.collection("siparisler").where("companyId", "==", COMPANY).get()).size, before, "no order written");
    assert.strictEqual((await orderRef(orderIdFor(env())).get()).data().customFields["Shopify Status"], statusBefore, "no field touched");
    const record = await recordShadow(db, { companyId: COMPANY, envelope: env(), eventKey: "shopify|a|shadow-2", eventType: "orders/updated", liveOutcome: { status: "ok", created: false, nivadeskOrderId: orderIdFor(env()) }, engineOutcome: update, liveDoc: (await orderRef(orderIdFor(env())).get()).data() });
    assert.strictEqual(record.sameOrderId, true);
    assert.strictEqual(record.agree, false, `the live doc still says ${statusBefore}; the engine would write refunded`);
    assert.ok(record.diffs.some((d) => d.field === "customFields"));
    const stored = await db.collection(SHADOW_COLLECTION).where("companyId", "==", COMPANY).get();
    assert.strictEqual(stored.size, 1); assert.ok(stored.docs[0].data().expireAt, "shadow rows expire");
  });

  await check("the worker records every attempt: applied, then not-found dead, transient retrying, validation dead (TEST-009, RETRY-003)", async () => {
    const base = { provider: "shopify", connectionId: SHOP_A, companyId: COMPANY, externalId: "2006", eventType: "orders/create", attempt: 1, eventOrigin: "provider" };
    const apply = (e, task) => applyEnvelope(db, e, ctxFor({ eventKey: task.key }));
    const normalize = (raw) => env({ id: Number(raw.id) });
    await recordReceived(db, { ...base, key: "shopify|a|w-ok" });
    const ok = await processCommerceEvent(db, { ...base, key: "shopify|a|w-ok" }, { fetchLatest: async () => ({ id: 2006 }), normalize, apply });
    assert.strictEqual(ok.status, "applied"); assert.strictEqual(ok.outcome.result, "created");
    let rec = (await db.collection(EVENT_COLLECTION).where("idempotency_key", "==", "shopify|a|w-ok").get()).docs[0].data();
    assert.strictEqual(rec.status, "applied"); assert.ok(rec.correlation_id && rec.finished_at && rec.expireAt);
    const gone = await processCommerceEvent(db, { ...base, key: "shopify|a|w-gone", externalId: "2007" }, { fetchLatest: async () => null, normalize, apply });
    assert.strictEqual(gone.status, "dead"); assert.strictEqual(gone.errorClass, "not_found");
    const flaky = await processCommerceEvent(db, { ...base, key: "shopify|a|w-429" }, { fetchLatest: async () => { const e = new Error("shopify_rate_limited"); e.status = 429; throw e; }, normalize, apply, retryAfterOf: () => 45 });
    assert.strictEqual(flaky.status, "retrying"); assert.strictEqual(flaky.nextRetryInMs, 45000);
    rec = (await db.collection(EVENT_COLLECTION).where("idempotency_key", "==", "shopify|a|w-429").get()).docs[0]?.data() || (await db.collection(EVENT_COLLECTION).doc("shopify_a_w-429".replace("a_", `${SHOP_A}_`)).get()).data();
    const bad = await processCommerceEvent(db, { ...base, key: "shopify|a|w-bad" }, { fetchLatest: async () => ({ id: 0 }), normalize: () => normalizeShopifyOrder({ line_items: [] }, { shop: "" }), apply });
    assert.strictEqual(bad.status, "dead");
    const exhausted = await processCommerceEvent(db, { ...base, key: "shopify|a|w-exhausted", attempt: 6 }, { fetchLatest: async () => { throw new Error("shopify_graphql_http_503"); }, normalize, apply });
    assert.strictEqual(exhausted.status, "dead", "the sixth transient failure goes to the DLQ instead of vanishing");
  });

  await check("flags open the engine per connection, then per provider, then globally — and default to off", async () => {
    resetCommerceFlagCache();
    let flags = await readCommerceFlags(db, { force: true });
    assert.strictEqual(flagEnabled(flags, "shadow", "shopify", SHOP_A), false);
    await db.collection("appConfig").doc("commerce").set({ shadow: { enabled: false, providers: { shopify: true }, connections: { [`shopify:${SHOP_B}`]: false } } });
    flags = await readCommerceFlags(db, { force: true });
    assert.strictEqual(flagEnabled(flags, "shadow", "shopify", SHOP_A), true, "provider switch");
    assert.strictEqual(flagEnabled(flags, "shadow", "shopify", SHOP_B), false, "connection override wins");
    assert.strictEqual(flagEnabled(flags, "shadow", "etsy", "x"), false, "other providers stay off");
    assert.strictEqual(flagEnabled(flags, "queue", "shopify", SHOP_A), false, "the queue is a separate switch");
    await db.collection("appConfig").doc("commerce").set({ queue: { enabled: true } }, { merge: true });
    const cached = await readCommerceFlags(db);
    assert.strictEqual(flagEnabled(cached, "queue", "shopify", SHOP_A), false, "cached for a minute");
    assert.strictEqual(flagEnabled(await readCommerceFlags(db, { force: true }), "queue", "shopify", SHOP_A), true);
  });

  await wipe();
  console.log(failures === 0 ? "\n✅ FAZ 2 COMMERCE ENGINE GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });

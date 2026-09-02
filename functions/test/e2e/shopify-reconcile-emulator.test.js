// SHOP-013 — reconciliation and the Missing Order Audit, against a real
// Firestore, with Shopify itself replaced by an injected fetcher: what the pass
// does with what Shopify says is the thing under test, not the wire.
//
//   firebase emulators:exec --only firestore "node functions/test/e2e/shopify-reconcile-emulator.test.js"

const assert = require("assert");

process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.SHOPIFY_BRIDGE_SECRET = "e2e-bridge-secret";

const admin = require("firebase-admin");
const index = require("../../index.js");

const db = admin.firestore();
const e2e = index._e2e;

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; console.log("FAIL ", name, "-", String(error && error.message || error).replace(/\s+/g, " ").slice(0, 300)); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }

const COMPANY = "e2e-recon-company";
const SHOP = "e2e-recon.myshopify.com";
const PAID = { billingPlan: "pro_monthly", billingPlanName: "NivaDesk Pro", billingStatus: "active", billingProvider: "stripe" };
const HOUR = 60 * 60 * 1000;
const T0 = Date.parse("2026-09-02T09:00:00Z");

const storeRef = () => db.collection("shopifyStores").doc(SHOP);
const storeData = async () => (await storeRef().get()).data();
const orderRef = (id) => e2e.orderDocRef(e2e.shopifyOrderDocId(COMPANY, String(id)));
const rows = async () => (await storeRef().collection("syncLog").get()).docs.map((d) => d.data());
const reconcileRows = async () => (await rows()).filter((r) => r.topic === "reconcile");

function order(id, extra = {}) {
  return {
    id: String(id), name: `#${id}`, order_number: id, financial_status: "paid", total_price: "40.00", currency: "GBP",
    email: "recon@example.com", customer: { id: 9, first_name: "Re", last_name: "Con", email: "recon@example.com" },
    billing_address: { address1: "1 Recon Way", city: "Leeds", zip: "LS1", country: "United Kingdom" },
    line_items: [{ id: 1, title: "Band ring", quantity: 1, price: "40.00", sku: "BAND-1" }],
    updated_at: new Date(T0).toISOString(), cancelled_at: null, fulfillment_status: null, fulfillments: [],
    ...extra
  };
}

/** One pass with Shopify answering `orders`; records the window it was asked for. */
async function pass_(orders, options = {}) {
  const seen = {};
  const audit = await e2e.reconcileShopifyStore(SHOP, await storeData(), {
    now: options.now || T0,
    force: options.force, lookbackMs: options.lookbackMs, maxPages: options.maxPages,
    fetchOrders: async (shop, store, fromMs, opts) => { seen.fromMs = fromMs; seen.maxPages = opts.maxPages; return { orders, truncated: Boolean(options.truncated) }; }
  });
  return { audit, seen };
}

async function wipe() {
  for (const col of ["siparisler", "musteriler"]) {
    const snap = await db.collection(col).where("companyId", "==", COMPANY).get();
    await Promise.all(snap.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  await db.recursiveDelete(storeRef());
  await db.recursiveDelete(db.collection("companies").doc(COMPANY));
  await db.collection("commerceCursors").doc(`shopify__${SHOP}__order`).delete();
  await db.collection("commerceHealth").doc(`shopify__${SHOP}`).delete();
}
async function seed() {
  await db.collection("companies").doc(COMPANY).set({ companyName: "Recon Co", ownerUid: COMPANY, ...PAID });
  await storeRef().set({ shop: SHOP, companyId: COMPANY, linkedUid: COMPANY, status: "active", shopName: "Recon Shop", settings: {}, stats: { syncedOrders: 0, failedCount: 0 } });
}

(async () => {
  await wipe();
  await seed();

  await check("the converter carries the reconciliation fields into the REST shape the appliers read", async () => {
    const rest = e2e.shopifyGraphQLOrderToRest({
      legacyResourceId: "1", name: "#1", displayFinancialStatus: "PAID", updatedAt: "2026-09-02T00:00:00Z", cancelledAt: null,
      displayFulfillmentStatus: "FULFILLED", fulfillments: [{ trackingInfo: [{ number: "RM1", company: "Royal Mail" }] }], lineItems: { nodes: [] }
    });
    assert.strictEqual(rest.updated_at, "2026-09-02T00:00:00Z");
    assert.strictEqual(rest.cancelled_at, null);
    assert.strictEqual(rest.fulfillment_status, "fulfilled");
    assert.deepStrictEqual(rest.fulfillments, [{ tracking_number: "RM1", tracking_company: "Royal Mail" }]);
    const partial = e2e.shopifyGraphQLOrderToRest({ legacyResourceId: "2", displayFulfillmentStatus: "PARTIALLY_FULFILLED", cancelledAt: "2026-09-01T00:00:00Z", lineItems: { nodes: [] } });
    assert.strictEqual(partial.fulfillment_status, "partial");
    assert.strictEqual(partial.cancelled_at, "2026-09-01T00:00:00Z");
    const plain = e2e.shopifyGraphQLOrderToRest({ legacyResourceId: "3", lineItems: { nodes: [] } });
    assert.strictEqual(plain.fulfillment_status, null, "an import node without the fields stays quiet");
    assert.deepStrictEqual(plain.fulfillments, []);
  });

  await check("a store never looked at is asked for the last 24 hours, and a missing order is created", async () => {
    const { audit, seen } = await pass_([order(101)]);
    assert.strictEqual(seen.fromMs, T0 - 24 * HOUR, "first window = 24h lookback");
    assert.strictEqual(audit.scanned, 1);
    assert.strictEqual(audit.created, 1);
    const doc = (await orderRef(101).get()).data();
    assert.ok(doc, "the order the webhook missed now exists");
    assert.strictEqual(doc.customFields["Shopify Store"], "Recon Shop");
    assert.strictEqual(doc.status, "Not Yet");
  });

  await check("what was caught up is on the record: a reconcile row per order and the pass on the store", async () => {
    const found = await reconcileRows();
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].reconcileAction, "created");
    assert.strictEqual(found[0].shopifyOrderId, "101");
    assert.ok(found[0].nivadeskOrderId, "names the NivaDesk order");
    const store = await storeData();
    assert.strictEqual(store.reconcile.windowToMs, T0);
    assert.strictEqual(store.reconcile.created, 1);
    assert.strictEqual(store.reconcile.missedTotal, 1);
    assert.strictEqual(store.reconcile.runs, 1);
    assert.ok(store.reconcile.lastRunAt, "stamped");
    assert.ok(Number(store.stats.syncedOrders) >= 1, "counted as a synced order");
  });

  await check("the next pass starts ten minutes before the last one ended, and an unchanged order is left alone", async () => {
    const now = T0 + 15 * 60 * 1000;
    const { audit, seen } = await pass_([order(101)], { now });
    assert.strictEqual(seen.fromMs, T0 - 10 * 60 * 1000, "overlap, not a gap");
    assert.strictEqual(audit.created + audit.updated + audit.cancelled + audit.dispatched, 0);
    assert.strictEqual(audit.scanned, 1);
    assert.strictEqual((await reconcileRows()).length, 1, "no new row for nothing");
    const store = await storeData();
    assert.strictEqual(store.reconcile.missedTotal, 1);
    assert.strictEqual(store.reconcile.runs, 2);
    assert.strictEqual(store.reconcile.windowToMs, now);
  });

  await check("a payment status that changed while no webhook arrived is applied as an update", async () => {
    const { audit } = await pass_([order(101, { financial_status: "partially_refunded", total_price: "30.00" })], { now: T0 + 30 * 60 * 1000 });
    assert.strictEqual(audit.updated, 1);
    const doc = (await orderRef(101).get()).data();
    assert.strictEqual(doc.customFields["Shopify Status"], "partially_refunded");
    assert.strictEqual(doc.customFields["Shopify Total"], "30.00");
    assert.strictEqual((await reconcileRows()).length, 1, "an update is not a missed order");
  });

  await check("a cancellation we never saw cancels the order, once", async () => {
    const { audit } = await pass_([order(101, { cancelled_at: "2026-09-02T09:20:00Z", financial_status: "refunded" })], { now: T0 + 45 * 60 * 1000 });
    assert.strictEqual(audit.cancelled, 1);
    const doc = (await orderRef(101).get()).data();
    assert.strictEqual(doc.status, "Cancelled");
    const found = await reconcileRows();
    assert.ok(found.some((r) => r.reconcileAction === "cancelled" && r.shopifyOrderId === "101"));
    const again = await pass_([order(101, { cancelled_at: "2026-09-02T09:20:00Z", financial_status: "refunded" })], { now: T0 + 60 * 60 * 1000 });
    assert.strictEqual(again.audit.cancelled, 0, "already cancelled → nothing to catch up");
  });

  await check("a fulfilment we never saw dispatches the order with its tracking", async () => {
    await pass_([order(202)], { now: T0 + 70 * 60 * 1000 });
    const { audit } = await pass_([order(202, { fulfillment_status: "fulfilled", fulfillments: [{ tracking_number: "RM202", tracking_company: "Royal Mail" }] })], { now: T0 + 85 * 60 * 1000 });
    assert.strictEqual(audit.dispatched, 1);
    const doc = (await orderRef(202).get()).data();
    assert.strictEqual(doc.isDispatched, true);
    assert.strictEqual(doc.trackingNumber, "RM202");
    assert.strictEqual(doc.courier, "Royal Mail");
    assert.ok((await reconcileRows()).some((r) => r.reconcileAction === "dispatched" && r.shopifyOrderId === "202"));
    assert.strictEqual((await storeData()).reconcile.missedTotal, 4, "created 101, cancelled 101, created 202, dispatched 202");
  });

  await check("a missing order in Shopify is created with tracking when it arrives already fulfilled", async () => {
    const { audit } = await pass_([order(303, { fulfillment_status: "fulfilled", fulfillments: [{ tracking_number: "RM303", tracking_company: "DPD" }] })], { now: T0 + 100 * 60 * 1000 });
    assert.strictEqual(audit.created, 1);
    assert.strictEqual(audit.dispatched, 0, "creation is the catch-up; a second pass would dispatch it");
    const second = await pass_([order(303, { fulfillment_status: "fulfilled", fulfillments: [{ tracking_number: "RM303", tracking_company: "DPD" }] })], { now: T0 + 115 * 60 * 1000 });
    assert.strictEqual(second.audit.dispatched, 1);
    assert.strictEqual((await orderRef(303).get()).data().trackingNumber, "RM303");
  });

  await check("the store's own rules still apply: an unpaid order is not created, auto-sync off creates nothing", async () => {
    const unpaid = await pass_([order(404, { financial_status: "pending" })], { now: T0 + 130 * 60 * 1000 });
    assert.strictEqual(unpaid.audit.created, 0);
    assert.strictEqual(unpaid.audit.skipped, 1);
    assert.strictEqual((await orderRef(404).get()).exists, false);
    await storeRef().set({ settings: { autoSync: false } }, { merge: true });
    const off = await pass_([order(405)], { now: T0 + 145 * 60 * 1000 });
    assert.strictEqual(off.audit.created, 0);
    assert.strictEqual((await orderRef(405).get()).exists, false);
    await storeRef().set({ settings: { autoSync: true } }, { merge: true });
  });

  await check("a page limit is reported as truncated so the next pass, with its overlap, finishes the job", async () => {
    const cursorBefore = (await db.collection("commerceCursors").doc(`shopify__${SHOP}__order`).get()).data();
    assert.ok(cursorBefore && cursorBefore.watermarkMs, "the common cursor was written by the complete passes above");
    const { audit } = await pass_([order(506)], { now: T0 + 160 * 60 * 1000, truncated: true });
    assert.strictEqual(audit.truncated, true);
    assert.strictEqual((await storeData()).reconcile.truncated, true);
    const cursorAfter = (await db.collection("commerceCursors").doc(`shopify__${SHOP}__order`).get()).data();
    assert.strictEqual(cursorAfter.watermarkMs, cursorBefore.watermarkMs, "a truncated pass does not move the common cursor (REC-003)");
    assert.strictEqual(cursorAfter.lastPassTruncated, true);
    const healthDoc = (await db.collection("commerceHealth").doc(`shopify__${SHOP}`).get()).data();
    assert.ok(healthDoc && healthDoc.orders && healthDoc.orders.lastSuccessAtMs, "order freshness recorded by the complete passes");
  });

  await check("the merchant's hand-run audit looks back seven days with a wider page budget", async () => {
    const { audit, seen } = await pass_([], { now: T0 + 175 * 60 * 1000, force: true, lookbackMs: 7 * 24 * HOUR, maxPages: 20 });
    assert.strictEqual(seen.fromMs, T0 + 175 * 60 * 1000 - 7 * 24 * HOUR);
    assert.strictEqual(seen.maxPages, 20);
    assert.strictEqual(audit.manual, true);
  });

  await check("a store that is not linked, or not active, is not reconciled and nothing is written", async () => {
    const pending = await e2e.reconcileShopifyStore("nobody.myshopify.com", { shop: "nobody.myshopify.com", status: "pending", companyId: "" }, { fetchOrders: async () => { throw new Error("must not fetch"); } });
    assert.strictEqual(pending.skippedStore, "store_not_connected");
    const uninstalled = await e2e.reconcileShopifyStore(SHOP, { ...(await storeData()), status: "uninstalled" }, { fetchOrders: async () => { throw new Error("must not fetch"); } });
    assert.strictEqual(uninstalled.skippedStore, "store_uninstalled");
  });

  await check("a fetch that fails propagates, so the sweep can log the store as failed instead of marking a window it never saw", async () => {
    const before = (await storeData()).reconcile.windowToMs;
    await assert.rejects(e2e.reconcileShopifyStore(SHOP, await storeData(), { now: T0 + 190 * 60 * 1000, fetchOrders: async () => { throw new Error("shopify_rate_limited"); } }), /shopify_rate_limited/);
    assert.strictEqual((await storeData()).reconcile.windowToMs, before, "the watermark did not move");
  });

  await check("the bridge's reconcileNow refuses a store that is not linked", async () => {
    await storeRef().set({ companyId: "", status: "pending" }, { merge: true });
    const req = { method: "POST", query: {}, body: { action: "reconcileNow", shop: SHOP }, headers: { "x-nivadesk-bridge-secret": "e2e-bridge-secret" }, rawBody: Buffer.from("{}"), ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } };
    const res = { statusCode: 200, payload: null, status(c) { this.statusCode = c; return this; }, json(p) { this.payload = p; return this; }, send(p) { this.payload = p; return this; }, set() { return this; }, setHeader() { return this; }, end() { return this; } };
    await index.shopifyAppBridge(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.payload.error, "store_not_connected");
  });

  await wipe();
  console.log(failures === 0 ? "\n✅ SHOP-013 RECONCILIATION GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });

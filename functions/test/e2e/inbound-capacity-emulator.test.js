// Faz 1 of the Commerce Integration Spec, against a real Firestore.
//
//   INB-002 / INB-003  a sender cannot claim a real provider's identity
//   INB-006            inbound and the official Shopify app respect the plan
//   TEST-016           releasing held orders never deletes one it cannot replay
//   WOO-011            a Shopify order takes the workspace's delivery default
//
// These are the guards the spec's Phase 1 exists for, and every one of them is
// a write path — which is why this runs against the emulator rather than the
// hand-built fake (see test/qa/README.md: the fake has no where() and no
// undefined rejection, and a guard that "passes" there proves nothing).
//
//   firebase emulators:exec --only firestore "node functions/test/e2e/inbound-capacity-emulator.test.js"

const assert = require("assert");

process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const admin = require("firebase-admin");
const index = require("../../index.js");

const db = admin.firestore();
const e2e = index._e2e;

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; console.log("FAIL ", name, "-", String(error && error.message || error).slice(0, 160)); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }

/** The smallest req/res pair an onRequest handler will accept. */
function fakeRequest({ query = {}, body = {}, headers = {} } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  return { method: "POST", query, body, headers, rawBody: raw, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } };
}
function fakeResponse() {
  const res = { statusCode: 200, payload: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.payload = payload; return res; };
  res.send = (payload) => { res.payload = payload; return res; };
  res.set = () => res;
  res.setHeader = () => res;
  return res;
}

const OWNER = "owner-faz1";
const COMPANY = "co-faz1";
const TOKEN = "tok-faz1";
const SHOP = "faz1-test.myshopify.com";

async function seedWorkspace(plan) {
  await db.collection("companies").doc(COMPANY).set({
    companyId: COMPANY, ownerUid: OWNER, name: "Faz 1 Co",
    memberUids: [OWNER], memberRoles: { [OWNER]: "owner" }, members: { [OWNER]: { role: "owner" } },
    ...plan
  });
  await db.doc(`companies/${COMPANY}/integrationSecrets/inbound`).set({ token: TOKEN });
  await db.collection("shopifyStores").doc(SHOP).set({
    shop: SHOP, companyId: COMPANY, status: "active", shopName: "Faz 1 Store", accessToken: "x",
    settings: { autoSync: true }
  });
}

/** Ten live orders: the free plan's limit, exactly full. */
async function fillToLimit() {
  const batch = db.batch();
  for (let i = 0; i < 10; i += 1) {
    batch.set(db.collection("siparisler").doc(`${COMPANY}-fill-${i}`), {
      companyId: COMPANY, customerName: `Fill ${i}`, designName: "x", isDeleted: false, isDelivered: false
    });
  }
  await batch.commit();
}

async function wipe() {
  for (const col of ["siparisler", "shopifyStores"]) {
    const snap = await db.collection(col).where("companyId", "==", COMPANY).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  const held = await e2e.heldIntegrationOrdersRef(COMPANY).get();
  await Promise.all(held.docs.map((d) => d.ref.delete()));
}

async function postInbound(body) {
  const req = fakeRequest({ query: { companyId: COMPANY, token: TOKEN }, body });
  const res = fakeResponse();
  await index.inboundOrderWebhook(req, res);
  return res;
}

const FREE = { billingPlan: "demo", billingPlanName: "Free", billingStatus: "free" };
const PAID = { billingPlan: "pro_monthly", billingPlanName: "NivaDesk Pro", billingStatus: "active", billingProvider: "stripe" };

(async () => {
  await wipe();
  await seedWorkspace(FREE);

  // ---- INB-002 / INB-003 ----------------------------------------------------
  await check("the label allowlist maps the four real senders and nothing else", () => {
    assert.deepStrictEqual(e2e.inboundSourceLabel("Wix"), { key: "wix", label: "Wix" });
    assert.deepStrictEqual(e2e.inboundSourceLabel("zapier"), { key: "zapier", label: "Zapier" });
    assert.deepStrictEqual(e2e.inboundSourceLabel("shopify"), { key: "website", label: "Website" });
    assert.deepStrictEqual(e2e.inboundSourceLabel("Etsy"), { key: "website", label: "Website" });
    assert.deepStrictEqual(e2e.inboundSourceLabel("WooCommerce"), { key: "website", label: "Website" });
    assert.deepStrictEqual(e2e.inboundSourceLabel(""), { key: "website", label: "Website" });
  });

  await check("a sender claiming to be Shopify lands as a Website order, not a Shopify one", async () => {
    const res = await postInbound({ orderId: "SPOOF-1", source: "shopify", customerName: "Ada", total: 12, currency: "GBP", email: "ada@example.com" });
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.payload));
    const order = (await e2e.orderDocRef(e2e.inboundOrderDocId(COMPANY, "SPOOF-1")).get()).data();
    assert(order, "order was written");
    assert.strictEqual(order.customFields.Source, "Website");
    assert.strictEqual(order.orderSource, "inbound");
    assert.strictEqual(order.inboundChannel, "website");
  });

  await check("the mirrored customer is filed under inbound, never under the claimed provider", async () => {
    const snap = await db.collection("musteriler").where("companyId", "==", COMPANY).where("source", "==", "shopify").get();
    assert.strictEqual(snap.size, 0, "no customer in the Shopify pool");
    const mine = await db.collection("musteriler").where("companyId", "==", COMPANY).where("source", "==", "inbound").get();
    assert(mine.size >= 1, "customer filed under inbound");
  });

  await check("an allowlisted sender keeps its own name", async () => {
    const res = await postInbound({ orderId: "WIX-1", source: "Wix", customerName: "Bo", total: 5 });
    assert.strictEqual(res.statusCode, 200);
    const order = (await e2e.orderDocRef(e2e.inboundOrderDocId(COMPANY, "WIX-1")).get()).data();
    assert.strictEqual(order.customFields.Source, "Wix");
    assert.strictEqual(order.inboundChannel, "wix");
  });

  // ---- INB-006, inbound ------------------------------------------------------
  await wipe();
  await seedWorkspace(FREE);
  await fillToLimit();

  await check("a free workspace at its limit parks a new inbound order instead of writing it", async () => {
    const res = await postInbound({ orderId: "OVER-1", customerName: "Cy", total: 9 });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.payload.held, true, JSON.stringify(res.payload));
    const order = await e2e.orderDocRef(e2e.inboundOrderDocId(COMPANY, "OVER-1")).get();
    assert.strictEqual(order.exists, false, "no order doc");
    const held = await e2e.heldIntegrationOrdersRef(COMPANY).doc("inbound_OVER-1").get();
    assert.strictEqual(held.exists, true, "held doc exists");
    assert.strictEqual(held.data().provider, "inbound");
  });

  await check("an update to an order already here still goes through at the limit", async () => {
    await e2e.orderDocRef(e2e.inboundOrderDocId(COMPANY, "OVER-1")).set({ companyId: COMPANY, customerName: "Cy", designName: "old", isDeleted: false, isDelivered: false });
    const res = await postInbound({ orderId: "OVER-1", customerName: "Cy", designName: "new", total: 9 });
    assert.strictEqual(res.statusCode, 200);
    assert.notStrictEqual(res.payload.held, true, "not held");
  });

  // ---- INB-006, official Shopify --------------------------------------------
  const shopifyOrder = {
    id: 5001, name: "#5001", order_number: 5001, financial_status: "paid", fulfillment_status: null,
    currency: "GBP", total_price: "40.00", subtotal_price: "40.00", total_tax: "0.00",
    created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z",
    customer: { id: 77, first_name: "Dee", last_name: "Faz", email: "dee@example.com" },
    line_items: [{ id: 1, title: "Signet ring", quantity: 1, price: "40.00", sku: "RING-1" }],
    billing_address: { first_name: "Dee", last_name: "Faz", address1: "1 Test St", city: "Leeds", zip: "LS1", country: "United Kingdom" },
    shipping_address: null, note: "", tags: ""
  };
  const store = (await db.collection("shopifyStores").doc(SHOP).get()).data();

  await check("the official Shopify app parks a new order at the limit, live and on import alike", async () => {
    const live = await e2e.applyShopifyOrderEvent(SHOP, store, "orders/create", shopifyOrder, {});
    assert.strictEqual(live.status, "held", JSON.stringify(live));
    const imported = await e2e.applyShopifyOrderEvent(SHOP, store, "orders/create", shopifyOrder, { manualImport: true });
    assert.strictEqual(imported.status, "held", JSON.stringify(imported));
    const order = await e2e.orderDocRef(e2e.shopifyOrderDocId(COMPANY, "5001")).get();
    assert.strictEqual(order.exists, false, "no order doc");
    const held = await e2e.heldIntegrationOrdersRef(COMPANY).doc("shopify_5001").get();
    assert.strictEqual(held.exists, true);
    assert.strictEqual(held.data().shop, SHOP, "release needs the shop");
  });

  // ---- TEST-016 + release ---------------------------------------------------
  await check("a held order from a provider this build cannot replay is left in place", async () => {
    await e2e.heldIntegrationOrdersRef(COMPANY).doc("mystery_1").set({ provider: "mystery", externalId: "1", payload: { id: "1" }, heldAtMs: Date.now() });
    await db.collection("companies").doc(COMPANY).set(PAID, { merge: true });
    const result = await index.releaseHeldIntegrationOrders.run({ auth: { uid: OWNER, token: { email: "owner@example.com" } }, data: { companyId: COMPANY }, rawRequest: {} });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.unknown, 1, JSON.stringify(result));
    const still = await e2e.heldIntegrationOrdersRef(COMPANY).doc("mystery_1").get();
    assert.strictEqual(still.exists, true, "mystery order not deleted");
  });

  await check("once the plan allows it, the inbound and official Shopify orders are released and written", async () => {
    const inbound = await e2e.orderDocRef(e2e.inboundOrderDocId(COMPANY, "OVER-1")).get();
    const shopify = await e2e.orderDocRef(e2e.shopifyOrderDocId(COMPANY, "5001")).get();
    assert.strictEqual(shopify.exists, true, "official Shopify order written by release");
    assert.strictEqual(shopify.data().customFields["Shopify Store"], "Faz 1 Store", "replayed through the app path, not the bare mapper");
    assert.strictEqual(inbound.exists, true);
    const held = await e2e.heldIntegrationOrdersRef(COMPANY).get();
    assert.deepStrictEqual(held.docs.map((d) => d.id), ["mystery_1"], "only the unknown one remains");
  });

  // ---- WOO-011 for Shopify --------------------------------------------------
  await check("a Shopify order takes the workspace's delivery default, not 45", async () => {
    await e2e.companySettingsDocRef(COMPANY).set({ defaultDeliveryTime: 12 }, { merge: true });
    const fresh = { ...shopifyOrder, id: 5002, name: "#5002", order_number: 5002 };
    const outcome = await e2e.applyShopifyOrderEvent(SHOP, store, "orders/create", fresh, {});
    assert.strictEqual(outcome.status, "ok", JSON.stringify(outcome));
    const order = (await e2e.orderDocRef(e2e.shopifyOrderDocId(COMPANY, "5002")).get()).data();
    assert.strictEqual(order.deliveryTime, 12);
  });

  // ---- RET-001: the row carries the field the TTL policy purges by ----------
  await check("a Shopify sync-log row carries a fourteen-day expireAt", async () => {
    await e2e.writeShopifySyncRow(SHOP, { status: "failed", error: "faz1_test", shopifyOrderId: "1" });
    const rows = await e2e.shopifyStoreRef(SHOP).collection("syncLog").orderBy("ts", "desc").limit(1).get();
    const row = rows.docs[0].data();
    assert(row.expireAt && typeof row.expireAt.toMillis === "function", "expireAt is a Timestamp");
    const days = (row.expireAt.toMillis() - Date.now()) / 86400000;
    assert(days > 13.9 && days < 14.1, `expires in ${days.toFixed(2)} days`);
    await Promise.all(rows.docs.map((d) => d.ref.delete()));
  });

  // ---- RET-002 / OBS-002: what a failed delivery's stored copy may hold ----
  await check("a stored payload keeps what a retry needs and nothing about who the buyer is", () => {
    const raw = {
      id: 9001, name: "#9001", financial_status: "paid", total_price: "40.00", tags: "rush",
      customer: { id: 7, first_name: "Dee", email: "dee@example.com" },
      billing_address: { address1: "1 Test St" }, shipping_address: { address1: "1 Test St" },
      email: "dee@example.com", phone: "+44", note: "gift for my mother", note_attributes: [{ name: "x", value: "y" }],
      client_details: { browser_ip: "1.2.3.4" },
      line_items: [{ id: 1, sku: "RING-1", quantity: 1, title: "Signet ring", properties: [{ name: "engraving", value: "DF" }] }],
      fulfillments: [{ id: 5, tracking_number: "T1", email: "carrier@example.com" }]
    };
    const kept = JSON.parse(e2e.shopifyRedactedPayloadJson(raw));
    for (const gone of ["customer", "billing_address", "shipping_address", "email", "phone", "note", "note_attributes", "client_details"]) {
      assert.strictEqual(kept[gone], undefined, `${gone} stripped`);
    }
    assert.strictEqual(kept.fulfillments[0].email, undefined, "stripped at depth too");
    assert.strictEqual(kept.id, 9001); assert.strictEqual(kept.financial_status, "paid");
    assert.strictEqual(kept.line_items[0].sku, "RING-1"); assert.strictEqual(kept.fulfillments[0].tracking_number, "T1");
    const huge = { id: 1, line_items: Array.from({ length: 4000 }, (_, i) => ({ id: i, title: "x".repeat(40) })) };
    assert(e2e.shopifyRedactedPayloadJson(huge).length <= 32000, "capped at 32 KB");
  });

  await wipe();
  console.log(failures === 0 ? "\n✅ FAZ 1 INBOUND/KAPASITE GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });

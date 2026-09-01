// CI-002 / SHOP-002 — the official Shopify webhook, end to end against a real
// Firestore: the HMAC over the RAW body, the delivery-id claim, and each topic's
// effect on the order it names. Until this file, applyShopifyOrderEvent,
// the fulfilment and refund appliers and the HMAC check had no test at all.
//
//   firebase emulators:exec --only firestore "node functions/test/e2e/shopify-webhook-emulator.test.js"

const assert = require("assert");
const crypto = require("crypto");

process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const APP_SECRET = "e2e-app-secret";
process.env.SHOPIFY_APP_SECRET = APP_SECRET;

const admin = require("firebase-admin");
const index = require("../../index.js");

const db = admin.firestore();
const e2e = index._e2e;

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; console.log("FAIL ", name, "-", String(error && error.message || error).replace(/\s+/g, " ").slice(0, 300)); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }

function fakeResponse() {
  const res = { statusCode: 200, payload: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.payload = payload; return res; };
  res.send = (payload) => { res.payload = payload; return res; };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.setHeader = res.set;
  res.end = () => res;
  return res;
}
const sign = (raw, secret = APP_SECRET) => crypto.createHmac("sha256", secret).update(raw).digest("base64");

const COMPANY = "e2e-hook-company";
const SHOP = "e2e-hook.myshopify.com";
const NOBODY = "e2e-nobody.myshopify.com";
const PAID = { billingPlan: "pro_monthly", billingPlanName: "NivaDesk Pro", billingStatus: "active", billingProvider: "stripe" };
let eventSeq = 0;

/** One delivery, signed like Shopify signs it: over the exact bytes sent. */
async function deliver({ topic, shop = SHOP, body = {}, raw = null, signature = undefined, eventId = `evt-${++eventSeq}`, headers = {} }) {
  const rawBody = raw || Buffer.from(JSON.stringify(body));
  const req = {
    method: "POST", query: {}, body, rawBody,
    headers: {
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": shop,
      "x-shopify-event-id": eventId,
      "x-shopify-hmac-sha256": signature === undefined ? sign(rawBody) : signature,
      ...headers
    },
    ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" }
  };
  const res = fakeResponse();
  await index.shopifyAppWebhook(req, res);
  return res;
}

const storeRef = () => db.collection("shopifyStores").doc(SHOP);
const orderRef = (id) => e2e.orderDocRef(e2e.shopifyOrderDocId(COMPANY, String(id)));
const syncRows = async () => (await storeRef().collection("syncLog").get()).docs.map((d) => d.data());
/** The newest sync row naming a Shopify order id — where a skip says why. */
async function lastRowFor(id) {
  const rows = (await syncRows()).filter((r) => r.shopifyOrderId === String(id));
  rows.sort((a, b) => Number(b.ts?.toMillis?.() || 0) - Number(a.ts?.toMillis?.() || 0));   // rows carry `ts`
  return rows[0] || {};
}
const history = (doc, title) => (doc.historyLog || []).filter((h) => h.title === title);

function order(id, extra = {}) {
  return {
    id, name: `#${id}`, order_number: id, financial_status: "paid", total_price: "40.00", currency: "GBP",
    email: "hook@example.com",
    customer: { id: 501, first_name: "Hook", last_name: "Buyer", email: "hook@example.com" },
    billing_address: { first_name: "Hook", last_name: "Buyer", address1: "2 Hook St", city: "Leeds", zip: "LS2", country: "United Kingdom" },
    shipping_address: { address1: "2 Hook St", city: "Leeds", zip: "LS2", country: "United Kingdom" },
    line_items: [{ id: 1, title: "Signet ring", quantity: 1, price: "40.00", sku: "RING-7" }],
    ...extra
  };
}

async function wipe() {
  for (const col of ["siparisler", "musteriler"]) {
    const snap = await db.collection(col).where("companyId", "==", COMPANY).get();
    await Promise.all(snap.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  await db.recursiveDelete(storeRef());
  await db.recursiveDelete(db.collection("shopifyStores").doc(NOBODY));
  await db.recursiveDelete(db.collection("companies").doc(COMPANY));
}

async function seed() {
  await db.collection("companies").doc(COMPANY).set({ companyName: "Hook Co", ownerUid: COMPANY, ...PAID });
  await storeRef().set({ shop: SHOP, companyId: COMPANY, linkedUid: COMPANY, status: "active", shopName: "Hook Shop", settings: {}, stats: { syncedOrders: 0, failedCount: 0 } });
}

(async () => {
  await wipe();
  await seed();

  await check("a delivery without a valid HMAC is refused with 401 and touches nothing", async () => {
    const bad = await deliver({ topic: "orders/create", body: order(7000), signature: sign(Buffer.from("other bytes")) });
    assert.strictEqual(bad.statusCode, 401);
    assert.strictEqual(bad.payload.error, "invalid_hmac");
    const none = await deliver({ topic: "orders/create", body: order(7000), signature: "" });
    assert.strictEqual(none.statusCode, 401);
    const wrongSecret = await deliver({ topic: "orders/create", body: order(7000), signature: sign(Buffer.from(JSON.stringify(order(7000))), "not-the-secret") });
    assert.strictEqual(wrongSecret.statusCode, 401);
    assert.strictEqual((await orderRef(7000).get()).exists, false);
    assert.strictEqual((await syncRows()).length, 0);
  });

  await check("the HMAC is checked over the raw bytes, not over a re-serialisation of the parsed body", async () => {
    const body = order(7001);
    const pretty = Buffer.from(JSON.stringify(body, null, 2));   // same JSON, different bytes
    assert.notStrictEqual(pretty.toString(), JSON.stringify(body));
    const res = await deliver({ topic: "orders/create", body, raw: pretty });
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.payload));
    assert.strictEqual(res.payload.result, "ok");
  });

  await check("a signed delivery missing its topic or shop header is a 400", async () => {
    const res = await deliver({ topic: "", body: {} });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.payload.error, "missing_headers");
  });

  await check("a store we have never seen is acknowledged and ignored, never retried", async () => {
    const res = await deliver({ topic: "orders/create", shop: NOBODY, body: order(1) });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.payload.ignored, "unknown_store");
  });

  await check("the three mandatory privacy topics answer 200 for any shop, and 401 when unsigned", async () => {
    for (const topic of ["customers/data_request", "customers/redact", "shop/redact"]) {
      const ok = await deliver({ topic, shop: NOBODY, body: { shop_domain: NOBODY } });
      assert.strictEqual(ok.statusCode, 200, topic);
      const unsigned = await deliver({ topic, shop: NOBODY, body: { shop_domain: NOBODY }, signature: "" });
      assert.strictEqual(unsigned.statusCode, 401, `${topic} unsigned`);
    }
  });

  await check("orders/create writes the order under the workspace, files the buyer, logs the sync and claims the delivery id", async () => {
    const doc = (await orderRef(7001).get()).data();
    assert.ok(doc, "order written by the raw-bytes delivery above");
    assert.strictEqual(doc.companyId, COMPANY);
    assert.strictEqual(doc.status, "Not Yet", "the store's default status");
    assert.strictEqual(doc.customFields["Shopify Store"], "Hook Shop");
    assert.strictEqual(doc.customFields["Shopify Domain"], SHOP);
    assert.strictEqual(doc.customFields["Shopify Status"], "paid");
    assert.ok(String(doc.customerName || "").includes("Hook"), "buyer named");
    const buyers = await db.collection("musteriler").where("companyId", "==", COMPANY).where("source", "==", "shopify").get();
    assert.ok(buyers.docs.some((d) => String(d.data().name || d.data().customerName || "").includes("Hook")), "customer mirrored under shopify");
    const rows = await syncRows();
    const created = rows.find((r) => r.shopifyOrderId === "7001");
    assert.ok(created && created.status === "ok" && created.expireAt, "sync row ok with its retention stamp");
    const claims = await storeRef().collection("webhookEvents").get();
    assert.ok(claims.size >= 1 && claims.docs.every((d) => d.data().expireAt), "delivery ids claimed with expireAt");
    const stats = (await storeRef().get()).data().stats || {};
    assert.ok(Number(stats.syncedOrders) >= 1, "store counter moved");
  });

  await check("the same delivery id twice is acknowledged as a duplicate and applied once", async () => {
    const before = (await syncRows()).length;
    const first = await deliver({ topic: "orders/create", body: order(7002), eventId: "evt-dup" });
    assert.strictEqual(first.payload.result, "ok");
    const again = await deliver({ topic: "orders/create", body: order(7002), eventId: "evt-dup" });
    assert.strictEqual(again.statusCode, 200);
    assert.strictEqual(again.payload.duplicate, true);
    assert.strictEqual((await syncRows()).length, before + 1, "one sync row, not two");
  });

  await check("an unpaid order is skipped while importUnpaid is off, with the reason in the sync log", async () => {
    const res = await deliver({ topic: "orders/create", body: order(7003, { financial_status: "pending" }) });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.payload.result, "skipped");
    assert.strictEqual((await orderRef(7003).get()).exists, false);
    const row = (await syncRows()).find((r) => r.shopifyOrderId === "7003");
    assert.strictEqual(row.error, "unpaid_pending");
  });

  await check("orders/updated moves the payment status and total onto the order with a history entry", async () => {
    const res = await deliver({ topic: "orders/updated", body: order(7001, { financial_status: "partially_refunded", total_price: "30.00" }) });
    assert.strictEqual(res.payload.result, "ok");
    const doc = (await orderRef(7001).get()).data();
    assert.strictEqual(doc.customFields["Shopify Status"], "partially_refunded");
    assert.strictEqual(doc.customFields["Shopify Total"], "30.00");
    const entry = history(doc, "Shopify payment status")[0];
    assert.ok(entry && entry.oldValue === "paid" && entry.newValue === "partially_refunded", "who changed what is on the record");
    const same = await deliver({ topic: "orders/updated", body: order(7001, { financial_status: "partially_refunded", total_price: "30.00" }) });
    assert.strictEqual(same.payload.result, "skipped", "nothing new → no write");
  });

  await check("fulfillments/create dispatches the order with its tracking, and a repeat is already_dispatched", async () => {
    const res = await deliver({ topic: "fulfillments/create", body: { id: 91, order_id: 7001, tracking_number: "RM123456789GB", tracking_company: "Royal Mail" } });
    assert.strictEqual(res.payload.result, "ok");
    const doc = (await orderRef(7001).get()).data();
    assert.strictEqual(doc.isDispatched, true);
    assert.strictEqual(doc.trackingNumber, "RM123456789GB");
    assert.strictEqual(doc.courier, "Royal Mail");
    assert.strictEqual(history(doc, "Dispatched (Shopify)").length, 1);
    const repeat = await deliver({ topic: "fulfillments/create", body: { id: 91, order_id: 7001, tracking_number: "RM123456789GB" } });
    assert.strictEqual(repeat.payload.result, "skipped");
    assert.strictEqual((await lastRowFor(7001)).error, "already_dispatched", "the reason is in the sync log, the webhook itself only acknowledges");
  });

  await check("orders/fulfilled carries the same effect through the order-shaped payload", async () => {
    await deliver({ topic: "orders/create", body: order(7004) });
    const res = await deliver({ topic: "orders/fulfilled", body: order(7004, { fulfillments: [{ tracking_number: "T-7004", tracking_company: "DPD" }] }) });
    assert.strictEqual(res.payload.result, "ok");
    const doc = (await orderRef(7004).get()).data();
    assert.strictEqual(doc.isDispatched, true);
    assert.strictEqual(doc.trackingNumber, "T-7004");
  });

  await check("refunds/create marks the order refunded and records the amount", async () => {
    const res = await deliver({ topic: "refunds/create", body: { id: 55, order_id: 7001, transactions: [{ amount: "12.50", kind: "refund" }] } });
    assert.strictEqual(res.payload.result, "ok");
    const doc = (await orderRef(7001).get()).data();
    assert.strictEqual(doc.customFields["Shopify Status"], "refunded");
    const entry = history(doc, "Refund (Shopify)")[0];
    assert.ok(entry && /12[.,]5/.test(entry.newValue), `amount on the record: ${entry && entry.newValue}`);
  });

  await check("orders/cancelled cancels a synced order, and is skipped for one we never imported", async () => {
    const res = await deliver({ topic: "orders/cancelled", body: order(7002, { cancelled_at: "2026-09-02T00:00:00Z" }) });
    assert.strictEqual(res.payload.result, "ok");
    const doc = (await orderRef(7002).get()).data();
    assert.strictEqual(doc.status, "Cancelled");
    assert.strictEqual(history(doc, "Order cancelled").length, 1);
    const unknown = await deliver({ topic: "orders/cancelled", body: order(7999) });
    assert.strictEqual(unknown.payload.result, "skipped");
    assert.strictEqual((await lastRowFor(7999)).error, "order_not_synced");
    assert.strictEqual((await orderRef(7999).get()).exists, false, "a cancellation never creates an order");
  });

  await check("customers/create mirrors the person into the workspace's customers", async () => {
    const res = await deliver({ topic: "customers/create", body: { id: 777, first_name: "Cus", last_name: "Tomer", email: "cus@example.com", default_address: { address1: "9 Mirror Rd", city: "York", zip: "YO1", country: "United Kingdom" } } });
    assert.strictEqual(res.payload.result, "ok");
    const found = await db.collection("musteriler").where("companyId", "==", COMPANY).where("source", "==", "shopify").get();
    assert.ok(found.docs.some((d) => JSON.stringify(d.data()).includes("cus@example.com")), "mirrored with the email");
  });

  await check("a topic this build does not handle is acknowledged as skipped, never failed", async () => {
    const res = await deliver({ topic: "products/create", body: { id: 1 } });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.payload.result, "skipped");
  });

  await check("a store that is installed but not linked to a workspace is skipped with 200", async () => {
    await storeRef().set({ companyId: "", status: "pending" }, { merge: true });
    const res = await deliver({ topic: "orders/create", body: order(7005) });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.payload.result, "skipped");
    assert.strictEqual((await orderRef(7005).get()).exists, false);
  });

  await wipe();
  console.log(failures === 0 ? "\n✅ SHOPIFY WEBHOOK UÇTAN UCA GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });

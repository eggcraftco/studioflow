// Faz 4 — the WooCommerce connector end to end on a real Firestore, with the
// store itself replaced by a fake REST client: the wc-auth handshake, the
// webhooks we create, a signed delivery that becomes an order through the
// common engine, the duplicate that does not, the installment rule kept from
// the legacy path (WOO-010), reconciliation on the common cursor (WOO-008),
// a webhook WooCommerce switched off (WOO-009), and disconnect.
//   firebase emulators:exec --only firestore "node functions/test/e2e/commerce-woo-connector-emulator.test.js"
const assert = require("assert");
const crypto = require("crypto");
process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.WOO_TOKEN_KEY = crypto.randomBytes(32).toString("hex");

// ---- the fake store ---------------------------------------------------------
const store = { orders: new Map(), webhooks: [], nextHookId: 100, calls: [], probeFails: null, name: "Ada's Woo" };
const money = (n) => n.toFixed(2);
function wooOrder(id, extra = {}) {
  return {
    id, number: String(id), status: "processing", currency: "GBP", total: money(40), total_tax: money(6.67), shipping_total: money(0), discount_total: money(0),
    date_created_gmt: "2026-09-02T09:00:00", date_modified_gmt: "2026-09-02T09:05:00", date_paid_gmt: "2026-09-02T09:01:00", customer_id: 7, customer_note: "",
    payment_method: "stripe", payment_method_title: "Card", transaction_id: `pi_${id}`,
    billing: { first_name: "Ada", last_name: "Lovelace", address_1: "10 Analytical Way", city: "London", postcode: "N1 1AA", country: "GB", email: "ada@example.com", phone: "+44 7700 900000" },
    shipping: { first_name: "Ada", last_name: "Lovelace", address_1: "10 Analytical Way", city: "London", postcode: "N1 1AA", country: "GB" },
    line_items: [{ id: id * 10, name: "Signet ring", product_id: 55, quantity: 1, sku: "RING-1", subtotal: money(33.33), total: money(33.33), total_tax: money(6.67), meta_data: [] }],
    meta_data: [], refunds: [], ...extra
  };
}
global.__nivadeskWooFakeClient = (options) => {
  store.calls.push({ type: "client", siteUrl: options.siteUrl, consumerKey: options.consumerKey });
  return {
    async probe() { if (store.probeFails) throw store.probeFails; return { ok: true }; },
    async getOrder(id) { return store.orders.get(Number(id)) || null; },
    async listOrders({ page = 1, perPage = 50 } = {}) {
      const all = [...store.orders.values()].sort((a, b) => a.id - b.id);
      const pages = Math.max(1, Math.ceil(all.length / perPage));
      return { orders: all.slice((page - 1) * perPage, page * perPage), totalPages: pages, page };
    },
    async listWebhooks() { return store.webhooks.map((h) => ({ ...h })); },
    async createWebhook({ name, topic, deliveryUrl, secret }) { const hook = { id: store.nextHookId++, name, topic, delivery_url: deliveryUrl, secret, status: "active" }; store.webhooks.push(hook); return { ...hook }; },
    async deleteWebhook(id) { store.calls.push({ type: "deleteWebhook", id }); store.webhooks = store.webhooks.filter((h) => String(h.id) !== String(id)); return { deleted: true }; },
    async updateWebhook() { return {}; }
  };
};
global.__nivadeskWooFakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ name: store.name }) });
global.__nivadeskWooFakeLookup = async (host) => (host === "intranet.example.com" ? [{ address: "10.0.0.5", family: 4 }] : [{ address: "93.184.216.34", family: 4 }]);

const admin = require("firebase-admin");
const index = require("../../index.js");
const db = admin.firestore();
const woo = index._e2e.woo;

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; console.log("FAIL ", name, "-", String(error && error.message || error).replace(/\s+/g, " ").slice(0, 320)); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }
function fakeResponse() { const res = { statusCode: 200, payload: null, headers: {} }; res.status = (c) => { res.statusCode = c; return res; }; res.json = (p) => { res.payload = p; return res; }; res.send = res.json; res.set = () => res; res.setHeader = res.set; res.end = () => res; return res; }

const COMPANY = "e2e-woo-company"; const OWNER = COMPANY;
const auth = { uid: OWNER, token: { email: "owner@example.com" } };
const PAID = { billingPlan: "pro_monthly", billingPlanName: "NivaDesk Pro", billingStatus: "active", billingProvider: "stripe" };
const SITE = "https://shop.example.com";
const connId = woo.connectionDocId(COMPANY, "shop.example.com");
const connRef = () => db.collection(woo.CONNECTION_COLLECTION).doc(connId);

async function wipe() {
  for (const col of ["siparisler", "musteriler", "commerceEvents", "commerceHealth", "commerceCursors", "externalEntities"]) {
    const snap = await db.collection(col).where("companyId", "==", COMPANY).get(); await Promise.all(snap.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  const states = await db.collection(woo.STATE_COLLECTION).where("companyId", "==", COMPANY).get(); await Promise.all(states.docs.map((d) => d.ref.delete()));
  await db.recursiveDelete(connRef()); await db.recursiveDelete(db.collection("companies").doc(COMPANY)); await db.collection("companySettings").doc(COMPANY).delete();
}
async function deliver({ topic, body, secret, deliveryId, token = null, rawOverride = null }) {
  const raw = rawOverride || Buffer.from(JSON.stringify(body));
  const signature = crypto.createHmac("sha256", secret).update(raw).digest("base64");
  const conn = (await connRef().get()).data();
  const req = { method: "POST", query: { c: connId, t: token ?? conn.deliveryToken }, body, rawBody: raw,
    headers: { "x-wc-webhook-topic": topic, "x-wc-webhook-delivery-id": deliveryId, "x-wc-webhook-signature": signature, "x-wc-webhook-resource": topic.split(".")[0], "x-wc-webhook-event": topic.split(".")[1] }, ip: "127.0.0.1", socket: {} };
  const res = fakeResponse(); await index.wooConnectorWebhook(req, res); return res;
}
const etsy = require("../../etsy");
const secretOf = (conn) => etsy.decryptToken(conn.webhookSecretEncrypted, process.env.WOO_TOKEN_KEY);

(async () => {
  await wipe();
  await db.collection("companies").doc(COMPANY).set({ companyName: "Woo Co", ownerUid: OWNER, ...PAID });
  await db.collection("companySettings").doc(COMPANY).set({ defaultDeliveryTime: 14 });
  let state = "";

  await check("begin refuses a private or plain-http store and hands the owner the store's own authorize URL (WOO-001/003)", async () => {
    await assert.rejects(index.beginWooConnect.run({ auth, data: { companyId: COMPANY, siteUrl: "http://shop.example.com" }, rawRequest: {} }), /https/);
    await assert.rejects(index.beginWooConnect.run({ auth, data: { companyId: COMPANY, siteUrl: "https://intranet.example.com" }, rawRequest: {} }), /public/);
    const out = await index.beginWooConnect.run({ auth, data: { companyId: COMPANY, siteUrl: "Shop.Example.com/" }, rawRequest: {} });
    assert.strictEqual(out.siteUrl, SITE);
    const url = new URL(out.authorizeUrl);
    assert.strictEqual(url.origin + url.pathname, `${SITE}/wc-auth/v1/authorize`);
    assert.strictEqual(url.searchParams.get("scope"), "read_write"); assert.strictEqual(url.searchParams.get("user_id"), out.state);
    assert.ok(url.searchParams.get("callback_url").endsWith("/wooAuthCallback")); assert.ok(url.searchParams.get("return_url").includes("section=woocommerce"));
    state = out.state;
    const row = (await db.collection(woo.STATE_COLLECTION).doc(state).get()).data();
    assert.strictEqual(row.companyId, COMPANY); assert.ok(row.expireAt, "the state expires by TTL");
  });

  await check("the store's callback lands the consumer pair boxed at rest, and a replay finds the state gone (WOO-002)", async () => {
    const res = fakeResponse();
    await index.wooAuthCallback({ method: "POST", body: { key_id: 5, user_id: state, consumer_key: "ck_live_abc", consumer_secret: "cs_live_xyz", key_permissions: "read_write" }, headers: {}, query: {} }, res);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.payload));
    const conn = (await connRef().get()).data();
    assert.strictEqual(conn.status, "authorized"); assert.strictEqual(conn.permissions, "read_write");
    assert.strictEqual(conn.consumerKey, undefined); assert.ok(conn.consumerKeyEncrypted?.data && !JSON.stringify(conn).includes("ck_live_abc"), "nothing in plaintext");
    assert.strictEqual(etsy.decryptToken(conn.consumerSecretEncrypted, process.env.WOO_TOKEN_KEY), "cs_live_xyz");
    const replay = fakeResponse();
    await index.wooAuthCallback({ method: "POST", body: { user_id: state, consumer_key: "ck_other", consumer_secret: "cs_other" }, headers: {}, query: {} }, replay);
    assert.strictEqual(replay.statusCode, 400, "a replayed callback is refused");
    assert.strictEqual(etsy.decryptToken((await connRef().get()).data().consumerSecretEncrypted, process.env.WOO_TOKEN_KEY), "cs_live_xyz", "and changes nothing");
  });

  await check("finish probes the store, names it, creates our five webhooks and hands back a view with no secrets (WOO-004)", async () => {
    const out = await index.finishWooConnect.run({ auth, data: { companyId: COMPANY, state }, rawRequest: {} });
    assert.strictEqual(out.status, "connected");
    assert.strictEqual(out.connection.storeName, "Ada's Woo"); assert.strictEqual(out.connection.webhooksHealthy, true);
    assert.deepStrictEqual(out.connection.webhooks.map((h) => h.topic).sort(), [...woo.WEBHOOK_TOPICS].sort());
    assert.ok(!JSON.stringify(out).includes("Encrypted") && !JSON.stringify(out).includes("deliveryToken"), "the view carries no secret");
    assert.strictEqual(store.webhooks.length, 5);
    assert.ok(store.webhooks.every((h) => h.delivery_url.includes(`/wooConnectorWebhook?c=${encodeURIComponent(connId)}&t=`) && h.secret), "each webhook points at us with the connection's secret");
    const again = await index.finishWooConnect.run({ auth, data: { companyId: COMPANY, state }, rawRequest: {} });
    assert.strictEqual(store.webhooks.length, 5, "finishing twice does not double the webhooks");
    assert.strictEqual(again.status, "connected");
    const listed = await index.getWooConnections.run({ auth, data: { companyId: COMPANY }, rawRequest: {} });
    assert.strictEqual(listed.connections.length, 1); assert.strictEqual(listed.connections[0].id, connId);
  });

  await check("a delivery with a bad signature or a wrong URL token is refused and writes nothing (WOO-005/006)", async () => {
    const conn = (await connRef().get()).data();
    store.orders.set(9001, wooOrder(9001));
    const bad = await deliver({ topic: "order.created", body: { id: 9001 }, secret: "not-the-secret", deliveryId: "d-bad" });
    assert.strictEqual(bad.statusCode, 401); assert.strictEqual(bad.payload.error, "invalid_signature");
    const wrongToken = await deliver({ topic: "order.created", body: { id: 9001 }, secret: secretOf(conn), deliveryId: "d-tok", token: "nope" });
    assert.strictEqual(wrongToken.statusCode, 401);
    const pretty = await deliver({ topic: "order.created", body: { id: 9001 }, secret: secretOf(conn), deliveryId: "d-raw", rawOverride: Buffer.from(JSON.stringify({ id: 9001 }, null, 2)) });
    assert.strictEqual(pretty.statusCode, 200, "signed over the pretty bytes, verified over the pretty bytes");
    assert.strictEqual((await db.collection("siparisler").where("companyId", "==", COMPANY).get()).size, 1, "only the correctly signed delivery created the order");
  });

  await check("a signed order.created fetches the order again and applies it through the engine with the legacy id (WOO-007)", async () => {
    const conn = (await connRef().get()).data();
    store.orders.set(9002, wooOrder(9002, { billing: { ...wooOrder(9002).billing, email: "bo@example.com" }, meta_data: [{ key: "studioflow_delivery_days", value: "5" }] }));
    const res = await deliver({ topic: "order.created", body: { id: 9002, status: "stale-in-payload", total: "1.00" }, secret: secretOf(conn), deliveryId: "d-9002" });
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.payload.result, "created");
    const doc = (await db.collection("siparisler").doc(`woo_${COMPANY}_9002`).get()).data();
    assert.ok(doc, "legacy woo_<company>_<id> id kept");
    assert.strictEqual(doc.paidAmount, 40, "the fetched order, not the doorbell's payload"); assert.strictEqual(doc.customFields["WooCommerce Order ID"], "9002");
    assert.strictEqual(doc.deliveryTime, 5, "delivery days from meta (WOO-011 fallback is the workspace default)");
    assert.strictEqual(doc.commerce.provider, "woocommerce"); assert.strictEqual(doc.status, "Not Yet");
    const dup = await deliver({ topic: "order.created", body: { id: 9002 }, secret: secretOf(conn), deliveryId: "d-9002" });
    assert.strictEqual(dup.payload.duplicate, true, "the same delivery id is acknowledged, not applied");
    const events = await db.collection("commerceEvents").where("company_id", "==", COMPANY).get();
    assert.ok(events.docs.some((d) => d.data().status === "applied" && d.data().provider === "woocommerce"), "recorded as applied");
    const customers = await db.collection("musteriler").where("companyId", "==", COMPANY).where("source", "==", "woocommerce").get();
    assert.ok(customers.size >= 1, "the buyer is filed under woocommerce");
  });

  await check("an unpaid order is skipped, an update moves the shop's status, and a cancellation cancels (engine rules)", async () => {
    const conn = (await connRef().get()).data();
    store.orders.set(9003, wooOrder(9003, { status: "pending", date_paid_gmt: null, transaction_id: "", billing: { ...wooOrder(9003).billing, email: "pending@example.com" } }));
    const unpaid = await deliver({ topic: "order.created", body: { id: 9003 }, secret: secretOf(conn), deliveryId: "d-9003" });
    assert.strictEqual(unpaid.payload.result, "skipped");
    store.orders.set(9002, wooOrder(9002, { status: "completed", date_modified_gmt: "2026-09-02T10:00:00", billing: { ...wooOrder(9002).billing, email: "bo@example.com" } }));
    const upd = await deliver({ topic: "order.updated", body: { id: 9002 }, secret: secretOf(conn), deliveryId: "d-9002-u" });
    assert.strictEqual(upd.payload.result, "updated");
    assert.strictEqual((await db.collection("siparisler").doc(`woo_${COMPANY}_9002`).get()).data().customFields["WooCommerce Status"], "completed");
    store.orders.set(9002, wooOrder(9002, { status: "cancelled", date_modified_gmt: "2026-09-02T11:00:00", billing: { ...wooOrder(9002).billing, email: "bo@example.com" } }));
    await deliver({ topic: "order.updated", body: { id: 9002 }, secret: secretOf(conn), deliveryId: "d-9002-c" });
    assert.strictEqual((await db.collection("siparisler").doc(`woo_${COMPANY}_9002`).get()).data().status, "Cancelled");
  });

  await check("the installment rule survives: a second paid order from the same buyer within sixty days is a payment, not an order (WOO-010)", async () => {
    const conn = (await connRef().get()).data();
    // 9001 is Ada's open order (paid, not delivered). A second paid order from ada@ becomes an installment on it.
    store.orders.set(9004, wooOrder(9004, { total: money(25), date_modified_gmt: "2026-09-02T12:00:00" }));
    const res = await deliver({ topic: "order.created", body: { id: 9004 }, secret: secretOf(conn), deliveryId: "d-9004" });
    assert.strictEqual(res.payload.result, "merged", JSON.stringify(res.payload));
    assert.strictEqual((await db.collection("siparisler").doc(`woo_${COMPANY}_9004`).get()).exists, false, "no second order");
    const first = (await db.collection("siparisler").doc(`woo_${COMPANY}_9001`).get()).data();
    assert.strictEqual(first.paidAmount, 65, "40 + 25"); assert.strictEqual(first.payments.length, 1); assert.ok(/installment \(order #9004\)/.test(first.payments[0].note));
    assert.ok((await db.collection("companies").doc(COMPANY).collection("wooMergedPayments").doc("9004").get()).exists, "the marker stops a replay from paying twice");
    const replay = await deliver({ topic: "order.created", body: { id: 9004 }, secret: secretOf(conn), deliveryId: "d-9004-again" });
    assert.strictEqual(replay.payload.result, "duplicate");
    assert.strictEqual((await db.collection("siparisler").doc(`woo_${COMPANY}_9001`).get()).data().paidAmount, 65, "paid once");
    await connRef().set({ combineInstallments: false }, { merge: true });
    store.orders.set(9005, wooOrder(9005, { total: money(30) }));
    const off = await deliver({ topic: "order.created", body: { id: 9005 }, secret: secretOf((await connRef().get()).data()), deliveryId: "d-9005" });
    assert.strictEqual(off.payload.result, "created", "with the rule off, a second order is an order");
    await connRef().set({ combineInstallments: true }, { merge: true });
  });

  await check("reconciliation pages through the store on the common cursor, and the cursor moves only when the pass was complete (WOO-008)", async () => {
    for (let i = 0; i < 60; i += 1) store.orders.set(20000 + i, wooOrder(20000 + i, { billing: { ...wooOrder(1).billing, email: `r${i}@example.com` } }));
    const { ref, data } = { ref: connRef(), data: (await connRef().get()).data() };
    const first = await woo.reconcileConnection(ref, data, { maxPages: 1 });
    assert.strictEqual(first.truncated, true, "one page of fifty is not the whole store"); assert.strictEqual(first.complete, false);
    const c1 = (await db.collection("commerceCursors").doc(`woocommerce__${connId}__order`).get()).data();
    assert.strictEqual(c1.watermarkMs, undefined, "cursor did not move on a truncated pass");
    const second = await woo.reconcileConnection(ref, data, { maxPages: 4 });
    assert.strictEqual(second.complete, true); assert.ok(second.created >= 10, `created ${second.created}`);
    const c2 = (await db.collection("commerceCursors").doc(`woocommerce__${connId}__order`).get()).data();
    assert.strictEqual(c2.watermarkMs, second.toMs, "a complete pass moves the cursor");
    const third = await woo.reconcileConnection(ref, (await connRef().get()).data(), { maxPages: 4 });
    assert.strictEqual(third.created, 0, "nothing new: everything is a no-op");
    const view = (await index.getWooConnections.run({ auth, data: { companyId: COMPANY }, rawRequest: {} })).connections[0];
    assert.ok(view.lastSuccessAtMs > 0 && view.webhooksHealthy === true);
  });

  await check("a webhook WooCommerce switched off shows as unhealthy, and recreate brings it back (WOO-009)", async () => {
    store.webhooks[1].status = "disabled";
    const audit = await woo.reconcileConnection(connRef(), (await connRef().get()).data());
    assert.strictEqual(audit.webhooksHealthy, false);
    const conn = (await connRef().get()).data();
    assert.strictEqual(conn.lastErrorCode, "webhook_disabled"); assert.strictEqual(conn.webhooks.find((h) => h.status === "disabled").topic, store.webhooks[1].topic);
    const out = await index.recreateWooWebhooks.run({ auth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} });
    assert.strictEqual(out.webhooks.length, 5); assert.ok(store.webhooks.every((h) => h.status === "active"));
    assert.strictEqual((await connRef().get()).data().webhooksHealthy, true);
  });

  await check("the missing-order audit tells imported, merged, unpaid and truly missing orders apart (§10.5)", async () => {
    const stamp = new Date(Date.now() - 86400000).toISOString().slice(0, 19);
    const ghost = wooOrder(9901, { date_created_gmt: stamp, date_modified_gmt: stamp, date_paid_gmt: stamp });
    ghost.billing = { ...ghost.billing, email: "ghost@example.com" };
    store.orders.set(9901, ghost);
    store.orders.set(9902, wooOrder(9902, { status: "pending", date_paid_gmt: null, transaction_id: "", date_created_gmt: stamp, date_modified_gmt: stamp }));
    const report = await index.auditWooOrders.run({ auth, data: { companyId: COMPANY, connectionId: connId, days: 30 }, rawRequest: {} });
    assert.ok(report.atStore >= 2, JSON.stringify(report));
    assert.ok(report.missingIds.includes("9901"), "an order the store has and NivaDesk never saw is missing");
    assert.ok(!report.missingIds.includes("9902") && report.unpaidSkipped >= 1, "an unpaid order is skipped by policy, not missing");
    assert.ok(report.asOrders >= 1);
    store.orders.delete(9901); store.orders.delete(9902);
  });

  await check("sync now is locked per connection, preview writes nothing, and disconnect removes our webhooks and the keys", async () => {
    await connRef().set({ syncLockUntilMs: Date.now() + 60000 }, { merge: true });
    await assert.rejects(index.syncWooNow.run({ auth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} }), /already running/);
    await connRef().set({ syncLockUntilMs: 0 }, { merge: true });
    const sync = await index.syncWooNow.run({ auth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} });
    assert.strictEqual(sync.ok, true);
    const before = (await db.collection("siparisler").where("companyId", "==", COMPANY).get()).size;
    const preview = await index.previewWooImport.run({ auth, data: { companyId: COMPANY, connectionId: connId, days: 30 }, rawRequest: {} });
    assert.ok(preview.summary.total >= 60 && preview.summary.alreadyHere >= 60 && preview.sample.length === 10, JSON.stringify(preview.summary));
    assert.strictEqual((await db.collection("siparisler").where("companyId", "==", COMPANY).get()).size, before, "preview wrote nothing");
    const deletes = store.calls.filter((c) => c.type === "deleteWebhook").length;
    const out = await index.disconnectWooShop.run({ auth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} });
    assert.strictEqual(out.ok, true); assert.strictEqual(out.webhooksRemoved, 5); assert.strictEqual(store.webhooks.length, 0);
    assert.ok(store.calls.filter((c) => c.type === "deleteWebhook").length >= deletes + 5);
    const conn = (await connRef().get()).data();
    assert.strictEqual(conn.status, "disconnected"); assert.strictEqual(conn.consumerKeyEncrypted, undefined); assert.strictEqual(conn.webhookSecretEncrypted, undefined);
    assert.strictEqual((await db.collection("siparisler").where("companyId", "==", COMPANY).get()).size, before, "orders kept (RET-003)");
    const report = await index._e2e.purgeProviderDataForWorkspace(COMPANY);
    assert.strictEqual(report.wooConnections, 1); assert.strictEqual((await connRef().get()).exists, false, "account deletion takes the connection tree (RET-004)");
  });

  await wipe();
  console.log(failures === 0 ? "\n✅ FAZ 4 WOOCOMMERCE CONNECTOR GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });

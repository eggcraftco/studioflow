// SHOP-001 / WOO-014 — the paste-a-delivery-URL paths are retired: 410 and no
// write from the two legacy webhooks, no token minted or rotated for the two
// retired kinds, while the inbound channel (Zapier, Make, Wix, Squarespace, a
// website) carries on untouched.
//
//   firebase emulators:exec --only firestore "node functions/test/e2e/legacy-paths-retired-emulator.test.js"

const assert = require("assert");

process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const admin = require("firebase-admin");
const index = require("../../index.js");

const db = admin.firestore();

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; console.log("FAIL ", name, "-", String(error && error.message || error).replace(/\s+/g, " ").slice(0, 300)); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }

function fakeRequest({ method = "POST", query = {}, body = {}, headers = {} } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  return { method, query, body, headers, rawBody: raw, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } };
}
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

const COMPANY = "e2e-retired-company";
const OWNER = COMPANY;
const TOKEN = "e2e-retired-token";
const PAID = { billingPlan: "pro_monthly", billingPlanName: "NivaDesk Pro", billingStatus: "active", billingProvider: "stripe" };
const auth = { uid: OWNER, token: { email: "owner@example.com" } };
const secretRef = (kind) => db.doc(`companies/${COMPANY}/integrationSecrets/${kind}`);

async function wipe() {
  const snap = await db.collection("siparisler").where("companyId", "==", COMPANY).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  await db.recursiveDelete(db.collection("companies").doc(COMPANY));
}
async function seed() {
  await db.collection("companies").doc(COMPANY).set({ companyName: "Retired Co", ownerUid: OWNER, ...PAID });
  for (const kind of ["woocommerce", "shopify", "inbound"]) await secretRef(kind).set({ token: TOKEN, createdAt: admin.firestore.Timestamp.now() });
}
async function expectRetired(promise, label) {
  await assert.rejects(promise, (error) => {
    // .run() hands back the server-side HttpsError; a client would see it prefixed.
    assert.ok(["failed-precondition", "functions/failed-precondition"].includes(error.code), `${label}: ${error.code} ${error.message}`);
    assert.strictEqual(error.details?.code, "integration_retired", `${label}: names the reason`);
    return true;
  });
}

(async () => {
  await wipe();
  await seed();

  const wooOrder = { id: 5551, number: "5551", status: "processing", total: "40.00", currency: "GBP", billing: { first_name: "Old", last_name: "Woo", email: "woo@example.com" }, line_items: [{ name: "Ring", quantity: 1, total: "40.00" }] };
  const shopOrder = { id: 5552, name: "#5552", financial_status: "paid", total_price: "40.00", currency: "GBP", customer: { first_name: "Old", last_name: "Shop" }, line_items: [{ title: "Ring", quantity: 1, price: "40.00" }] };

  await check("a WooCommerce delivery with a valid token is answered 410 and writes nothing", async () => {
    const res = fakeResponse();
    await index.woocommerceOrderWebhook(fakeRequest({ query: { companyId: COMPANY, token: TOKEN }, body: wooOrder }), res);
    assert.strictEqual(res.statusCode, 410);
    assert.strictEqual(res.payload.error, "integration_retired");
    assert.strictEqual(res.payload.kind, "woocommerce");
    assert.strictEqual((await db.collection("siparisler").where("companyId", "==", COMPANY).get()).size, 0);
    assert.strictEqual((await secretRef("woocommerce").get()).data().lastDeliveryAt, undefined, "no delivery recorded");
  });

  await check("a legacy Shopify delivery is answered 410 and writes nothing", async () => {
    const res = fakeResponse();
    await index.shopifyOrderWebhook(fakeRequest({ query: { companyId: COMPANY, token: TOKEN }, body: shopOrder }), res);
    assert.strictEqual(res.statusCode, 410);
    assert.strictEqual(res.payload.kind, "shopify");
    assert.strictEqual((await db.collection("siparisler").where("companyId", "==", COMPANY).get()).size, 0);
  });

  await check("even the liveness GET is gone, so a merchant probing the URL learns it is retired", async () => {
    for (const handler of [index.woocommerceOrderWebhook, index.shopifyOrderWebhook]) {
      const res = fakeResponse();
      await handler(fakeRequest({ method: "GET" }), res);
      assert.strictEqual(res.statusCode, 410);
      assert.ok(/retired/i.test(res.payload.message));
    }
  });

  await check("the retired token callables refuse before touching the workspace, and mint nothing", async () => {
    await secretRef("woocommerce").delete();
    await secretRef("shopify").delete();
    await expectRetired(index.getWooCommerceWebhookToken.run({ auth, data: { companyId: COMPANY }, rawRequest: {} }), "woo token");
    await expectRetired(index.getShopifyWebhookToken.run({ auth, data: { companyId: COMPANY }, rawRequest: {} }), "shopify token");
    assert.strictEqual((await secretRef("woocommerce").get()).exists, false, "no token minted");
    assert.strictEqual((await secretRef("shopify").get()).exists, false, "no token minted");
  });

  await check("rotate, test and the Woo signature secret refuse the retired kinds", async () => {
    await expectRetired(index.rotateIntegrationWebhookToken.run({ auth, data: { companyId: COMPANY, integration: "shopify" }, rawRequest: {} }), "rotate shopify");
    await expectRetired(index.rotateIntegrationWebhookToken.run({ auth, data: { companyId: COMPANY, integration: "woocommerce" }, rawRequest: {} }), "rotate woo");
    await expectRetired(index.sendTestIntegrationWebhook.run({ auth, data: { companyId: COMPANY, kind: "woocommerce" }, rawRequest: {} }), "test woo");
    await expectRetired(index.saveWooSignatureSecret.run({ auth, data: { companyId: COMPANY, secret: "x" }, rawRequest: {} }), "woo signature");
  });

  await check("the inbound channel is untouched: its token still reads, rotates and answers", async () => {
    const info = await index.getInboundWebhookToken.run({ auth, data: { companyId: COMPANY }, rawRequest: {} });
    assert.strictEqual(info.ok, true);
    assert.ok(info.deliveryUrl.includes("companyId="), "still hands out a delivery URL");
    const rotated = await index.rotateIntegrationWebhookToken.run({ auth, data: { companyId: COMPANY, integration: "inbound" }, rawRequest: {} });
    assert.strictEqual(rotated.ok, true);
    assert.notStrictEqual(rotated.deliveryUrl, info.deliveryUrl, "a new token");
    const fresh = (await secretRef("inbound").get()).data().token;
    const res = fakeResponse();
    await index.inboundOrderWebhook(fakeRequest({ query: { companyId: COMPANY, token: fresh }, body: { orderId: "INB-1", customerName: "Still Here", total: 5, source: "Wix" } }), res);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.payload));
    assert.strictEqual((await db.collection("siparisler").where("companyId", "==", COMPANY).get()).size, 1, "the live channel still creates orders");
  });

  await wipe();
  console.log(failures === 0 ? "\n✅ LEGACY YOLLAR 410 GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });

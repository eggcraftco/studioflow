// SHOP-004 — the Shopify offline token at rest, against a real Firestore.
//
// The bridge's upsertStore is what the app server calls after OAuth; from here
// on it stores an AES-256-GCM box under SHOPIFY_TOKEN_KEY and no plaintext
// beside it (Phase B — the plaintext copy is written only when there is no key
// to box with). Every reader goes through shopifyStoreAccessToken, the box is
// read first, and a store that only ever had the plaintext gets its box the
// first time its token is read, the plaintext being cleared once that box has
// read back. What must NOT happen is a store that stops syncing because a box
// will not open — the fallback is the plaintext, with a warning, never an error.
//
//   firebase emulators:exec --only firestore "node functions/test/e2e/shopify-token-emulator.test.js"

const assert = require("assert");
const crypto = require("crypto");

process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const KEY = crypto.randomBytes(32).toString("hex");
process.env.SHOPIFY_TOKEN_KEY = KEY;
process.env.SHOPIFY_BRIDGE_SECRET = "e2e-bridge-secret";

const admin = require("firebase-admin");
const index = require("../../index.js");

const db = admin.firestore();
const e2e = index._e2e;

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; console.log("FAIL ", name, "-", String(error && error.message || error).slice(0, 160)); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }

function fakeRequest({ query = {}, body = {}, headers = {} } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  return { method: "POST", query, body, headers, rawBody: raw, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } };
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SHOP = "e2e-token.myshopify.com";
const LEGACY = "e2e-token-legacy.myshopify.com";
const TOKEN = "shpat_e2e_0123456789abcdef";
const storeRef = (shop) => db.collection("shopifyStores").doc(shop);

async function bridge(body) {
  const req = fakeRequest({ body, headers: { "x-nivadesk-bridge-secret": "e2e-bridge-secret" } });
  const res = fakeResponse();
  await index.shopifyAppBridge(req, res);
  return res;
}
async function wipe() { for (const shop of [SHOP, LEGACY]) await storeRef(shop).delete(); }

(async () => {
  await wipe();

  await check("upsertStore writes the box and no plaintext, and the box opens to the token", async () => {
    const res = await bridge({ action: "upsertStore", shop: SHOP, accessToken: TOKEN, shopName: "E2E Token", scopes: "read_orders" });
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.payload));
    const doc = (await storeRef(SHOP).get()).data();
    assert.strictEqual(doc.accessToken, "", "Phase B: no plaintext beside the box");
    const box = doc.accessTokenEncrypted;
    assert.ok(box && box.v === 1 && box.iv && box.tag && box.data, "an AES-GCM box");
    assert.notStrictEqual(box.data, TOKEN, "the box is not the token");
    assert.ok(!JSON.stringify(doc).includes(TOKEN), "the token appears nowhere in the stored document");
    assert.ok(doc.tokenEncryptedAt, "stamped");
    assert.strictEqual(e2e.shopifyStoreAccessToken(doc), TOKEN, "read back through the helper");
  });

  await check("the box is read first: a stale plaintext beside a good box loses", async () => {
    await storeRef(SHOP).set({ accessToken: "shpat_stale" }, { merge: true });
    const doc = (await storeRef(SHOP).get()).data();
    assert.strictEqual(e2e.shopifyStoreAccessToken(doc), TOKEN);
    await storeRef(SHOP).set({ accessToken: TOKEN }, { merge: true });
  });

  await check("a box that will not open falls back to the plaintext instead of throwing", async () => {
    const doc = (await storeRef(SHOP).get()).data();
    const tampered = { ...doc, accessTokenEncrypted: { ...doc.accessTokenEncrypted, data: Buffer.from("garbage").toString("base64") } };
    assert.strictEqual(e2e.shopifyStoreAccessToken(tampered), TOKEN, "plaintext fallback");
  });

  await check("without the key in this function the plaintext still serves, and nothing is written", async () => {
    const saved = process.env.SHOPIFY_TOKEN_KEY;
    delete process.env.SHOPIFY_TOKEN_KEY;
    try {
      const doc = (await storeRef(SHOP).get()).data();
      assert.strictEqual(e2e.shopifyStoreAccessToken(doc), TOKEN, "box unreadable without key → plaintext");
      assert.strictEqual(e2e.shopifyEncryptToken(TOKEN), null, "no key, no box");
      await storeRef(LEGACY).set({ shop: LEGACY, status: "active", accessToken: "shpat_legacy" });
      assert.strictEqual(e2e.shopifyStoreAccessToken((await storeRef(LEGACY).get()).data()), "shpat_legacy");
      await sleep(300);
      assert.strictEqual((await storeRef(LEGACY).get()).data().accessTokenEncrypted, undefined, "no migration without a key");
    } finally {
      process.env.SHOPIFY_TOKEN_KEY = saved;
    }
  });

  await check("a plaintext-only store is boxed in place the first time its token is read", async () => {
    const before = (await storeRef(LEGACY).get()).data();
    assert.strictEqual(before.accessTokenEncrypted, undefined, "starts without a box");
    assert.strictEqual(e2e.shopifyStoreAccessToken(before), "shpat_legacy", "the read itself is served from the plaintext");
    let after = null;
    for (let i = 0; i < 20; i += 1) {
      await sleep(100);
      after = (await storeRef(LEGACY).get()).data();
      if (after.accessTokenEncrypted) break;
    }
    assert.ok(after.accessTokenEncrypted && after.accessTokenEncrypted.data, "box written by the fire-and-forget migration");
    assert.strictEqual(after.accessToken, undefined, "Phase B: the plaintext is cleared once the box has read back");
    assert.strictEqual(e2e.shopifyStoreAccessToken(after), "shpat_legacy", "and the box opens to the same token");
  });

  await check("a box is never the same twice, so two stores with one token cannot be matched by their boxes", async () => {
    const a = e2e.shopifyEncryptToken(TOKEN);
    const b = e2e.shopifyEncryptToken(TOKEN);
    assert.notStrictEqual(a.iv, b.iv);
    assert.notStrictEqual(a.data, b.data);
  });

  await check("the client-safe store view carries neither the plaintext nor the box", async () => {
    const doc = (await storeRef(SHOP).get()).data();
    const view = e2e.shopifyPublicStoreView(SHOP, doc);
    assert.strictEqual(view.accessToken, undefined);
    assert.strictEqual(view.accessTokenEncrypted, undefined);
    assert.ok(!JSON.stringify(view).includes(TOKEN));
  });

  await check("markUninstalled blanks the plaintext AND removes the box", async () => {
    const res = await bridge({ action: "markUninstalled", shop: SHOP });
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.payload));
    const doc = (await storeRef(SHOP).get()).data();
    assert.strictEqual(doc.status, "uninstalled");
    assert.strictEqual(doc.accessToken, "");
    assert.strictEqual(doc.accessTokenEncrypted, undefined, "no box left for a token Shopify has revoked");
    assert.strictEqual(e2e.shopifyStoreAccessToken(doc), "", "nothing to read");
  });

  await check("a reinstall boxes the new token again, still with no plaintext", async () => {
    const res = await bridge({ action: "upsertStore", shop: SHOP, accessToken: "shpat_reinstalled" });
    assert.strictEqual(res.statusCode, 200);
    const doc = (await storeRef(SHOP).get()).data();
    assert.ok(doc.accessTokenEncrypted && doc.accessTokenEncrypted.data, "a fresh box");
    assert.strictEqual(doc.accessToken, "", "no plaintext");
    assert.strictEqual(e2e.shopifyStoreAccessToken(doc), "shpat_reinstalled");
  });

  await wipe();
  console.log(failures === 0 ? "\n✅ SHOP-004 TOKEN AT REST GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });

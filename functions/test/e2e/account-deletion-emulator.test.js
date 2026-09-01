// RET-004 / ETSY-012 / TEST-013 — what an account deletion takes from the
// provider root collections, against a real Firestore.
//
// The workspace tree (companies/{id}) has always gone with recursiveDelete.
// What used to stay behind, with nobody left to disconnect it: the Etsy OAuth
// tokens, buyer-id links, receipt mappings and connect attempts keyed by
// companyId, the dedup markers of that workspace's shops, and the Shopify
// store still pointing at a workspace that no longer existed.
//
// Two neighbours are seeded on purpose — another workspace with its own Etsy
// shop and store, and an Etsy shop connected to BOTH workspaces — because the
// guard that matters is not "was ours deleted" but "was only ours deleted".
//
//   firebase emulators:exec --only firestore "node functions/test/e2e/account-deletion-emulator.test.js"

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

const COMPANY = "e2e-del-company";
const OTHER = "e2e-del-other";
const OWN_SHOP = "5001";        // Etsy shop only this workspace has
const OTHER_SHOP = "5002";      // Etsy shop only the neighbour has
const SHARED_SHOP = "5003";     // Etsy shop connected to both
const OWN_STORE = "e2e-del-own.myshopify.com";
const OTHER_STORE = "e2e-del-other.myshopify.com";
const ETSY_COLLECTIONS = ["etsyConnections", "etsyOAuthStates", "etsyExternalOrders", "etsyCustomerLinks"];

async function countWhere(collection, field, value) {
  const snap = await db.collection(collection).where(field, "==", value).get();
  return snap.size;
}

async function wipe() {
  for (const col of ETSY_COLLECTIONS) {
    for (const company of [COMPANY, OTHER]) {
      const snap = await db.collection(col).where("companyId", "==", company).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  }
  for (const shopId of [OWN_SHOP, OTHER_SHOP, SHARED_SHOP]) {
    const snap = await db.collection("etsyWebhookEvents").where("shopId", "==", shopId).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  for (const store of [OWN_STORE, OTHER_STORE]) {
    const ref = db.collection("shopifyStores").doc(store);
    const log = await ref.collection("syncLog").get();
    await Promise.all(log.docs.map((d) => d.ref.delete()));
    await ref.delete();
  }
}

async function seed() {
  const connection = (company, shopId) => ({
    companyId: company, provider: "etsy", externalShopId: shopId, status: "connected",
    accessTokenEncrypted: "enc:" + shopId, refreshTokenEncrypted: "enc:r:" + shopId
  });
  await db.collection("etsyConnections").doc(`${COMPANY}_${OWN_SHOP}`).set(connection(COMPANY, OWN_SHOP));
  await db.collection("etsyConnections").doc(`${COMPANY}_${SHARED_SHOP}`).set(connection(COMPANY, SHARED_SHOP));
  await db.collection("etsyConnections").doc(`${OTHER}_${OTHER_SHOP}`).set(connection(OTHER, OTHER_SHOP));
  await db.collection("etsyConnections").doc(`${OTHER}_${SHARED_SHOP}`).set(connection(OTHER, SHARED_SHOP));

  for (const [company, shopId] of [[COMPANY, OWN_SHOP], [OTHER, OTHER_SHOP]]) {
    await db.collection("etsyOAuthStates").doc(`state-${company}`).set({ companyId: company, uid: company, used: false });
    for (let i = 0; i < 3; i += 1) {
      await db.collection("etsyExternalOrders").doc(`${company}_${shopId}_${i}`).set({
        companyId: company, externalShopId: shopId, externalOrderId: String(i), nivadeskOrderId: `${company}-order-${i}`
      });
      await db.collection("etsyCustomerLinks").doc(`${company}_${shopId}_buyer${i}`).set({
        companyId: company, externalShopId: shopId, externalBuyerId: `buyer${i}`, customerId: `${company}-cust-${i}`
      });
    }
  }
  for (const shopId of [OWN_SHOP, OTHER_SHOP, SHARED_SHOP]) {
    for (let i = 0; i < 2; i += 1) {
      await db.collection("etsyWebhookEvents").doc(`evt-${shopId}-${i}`).set({ eventType: "receipt.created", shopId, receivedAt: Date.now() });
    }
  }
  const store = (company) => ({
    shop: "", companyId: company, linkedUid: company, linkedEmail: `${company}@example.com`,
    status: "active", accessToken: "shpat_install_owned_" + company, syncEnabled: true
  });
  await db.collection("shopifyStores").doc(OWN_STORE).set({ ...store(COMPANY), shop: OWN_STORE });
  await db.collection("shopifyStores").doc(OTHER_STORE).set({ ...store(OTHER), shop: OTHER_STORE });
  for (const storeId of [OWN_STORE, OTHER_STORE]) {
    for (let i = 0; i < 2; i += 1) {
      await db.collection("shopifyStores").doc(storeId).collection("syncLog").doc(`row-${i}`).set({ topic: "orders/create", status: "ok", nivadeskOrderId: `${storeId}-${i}` });
    }
  }
}

(async () => {
  await wipe();
  await seed();

  let report = null;
  await check("purge runs to completion and reports what it took", async () => {
    report = await e2e.purgeProviderDataForWorkspace(COMPANY);
    assert.deepStrictEqual(report.errors, [], "no collection failed");
    assert.strictEqual(report.etsyConnections, 2, "own + shared connection");
    assert.strictEqual(report.etsyOAuthStates, 1);
    assert.strictEqual(report.etsyExternalOrders, 3);
    assert.strictEqual(report.etsyCustomerLinks, 3);
    assert.strictEqual(report.shopifyStoresUnlinked, 1);
    assert.strictEqual(report.shopifySyncLogRows, 2);
  });

  await check("every Etsy root row keyed by the deleted workspace is gone", async () => {
    for (const col of ETSY_COLLECTIONS) {
      assert.strictEqual(await countWhere(col, "companyId", COMPANY), 0, `${col} emptied for the workspace`);
    }
    const tokens = await db.collection("etsyConnections").doc(`${COMPANY}_${OWN_SHOP}`).get();
    assert.strictEqual(tokens.exists, false, "the doc holding the encrypted tokens is deleted, not just blanked");
  });

  await check("the neighbour workspace keeps every one of its rows", async () => {
    assert.strictEqual(await countWhere("etsyConnections", "companyId", OTHER), 2);
    assert.strictEqual(await countWhere("etsyOAuthStates", "companyId", OTHER), 1);
    assert.strictEqual(await countWhere("etsyExternalOrders", "companyId", OTHER), 3);
    assert.strictEqual(await countWhere("etsyCustomerLinks", "companyId", OTHER), 3);
  });

  await check("dedup markers go only for the shop nobody else is connected to", async () => {
    assert.strictEqual(report.etsyWebhookEvents, 2, "the two markers of the workspace's own shop");
    assert.strictEqual(await countWhere("etsyWebhookEvents", "shopId", OWN_SHOP), 0, "own shop cleared");
    assert.strictEqual(await countWhere("etsyWebhookEvents", "shopId", SHARED_SHOP), 2, "shared shop kept — the neighbour still needs them");
    assert.strictEqual(await countWhere("etsyWebhookEvents", "shopId", OTHER_SHOP), 2, "neighbour's shop untouched");
  });

  await check("the Shopify store is unlinked the way the bridge's disconnect does it, token kept for the install", async () => {
    const own = (await db.collection("shopifyStores").doc(OWN_STORE).get()).data();
    assert.strictEqual(own.companyId, "", "no longer points at the deleted workspace");
    assert.strictEqual(own.linkedUid, "");
    assert.strictEqual(own.linkedEmail, "", "owner email gone");
    assert.strictEqual(own.status, "pending", "embedded app offers Connect a workspace again");
    assert.strictEqual(own.unlinkReason, "account_deleted");
    assert.ok(own.unlinkedAt, "stamped");
    // The offline token belongs to the merchant's still-installed app, not to
    // the NivaDesk account; app/uninstalled is what blanks it.
    assert.strictEqual(own.accessToken, "shpat_install_owned_" + COMPANY, "token kept");
    const log = await db.collection("shopifyStores").doc(OWN_STORE).collection("syncLog").get();
    assert.strictEqual(log.size, 0, "sync log naming this workspace's orders is gone");
  });

  await check("the neighbour's store and its sync log are untouched", async () => {
    const other = (await db.collection("shopifyStores").doc(OTHER_STORE).get()).data();
    assert.strictEqual(other.companyId, OTHER);
    assert.strictEqual(other.status, "active");
    const log = await db.collection("shopifyStores").doc(OTHER_STORE).collection("syncLog").get();
    assert.strictEqual(log.size, 2);
  });

  await check("an already-uninstalled store stays uninstalled rather than resurrecting to pending", async () => {
    await db.collection("shopifyStores").doc(OWN_STORE).set({ companyId: COMPANY, status: "uninstalled", accessToken: "" }, { merge: true });
    const again = await e2e.purgeProviderDataForWorkspace(COMPANY);
    assert.strictEqual(again.shopifyStoresUnlinked, 1);
    const own = (await db.collection("shopifyStores").doc(OWN_STORE).get()).data();
    assert.strictEqual(own.status, "uninstalled");
    assert.strictEqual(own.companyId, "");
  });

  await check("a second run over an empty workspace is a no-op, not an error", async () => {
    const again = await e2e.purgeProviderDataForWorkspace(COMPANY);
    assert.deepStrictEqual(again.errors, []);
    assert.strictEqual(again.etsyConnections + again.etsyOAuthStates + again.etsyExternalOrders + again.etsyCustomerLinks + again.etsyWebhookEvents + again.shopifyStoresUnlinked, 0);
  });

  await check("an empty workspace id touches nothing", async () => {
    const before = await countWhere("etsyConnections", "companyId", OTHER);
    const report0 = await e2e.purgeProviderDataForWorkspace("");
    assert.strictEqual(report0.etsyConnections, 0);
    assert.strictEqual(await countWhere("etsyConnections", "companyId", OTHER), before);
  });

  await wipe();
  console.log(failures === 0 ? "\n✅ RET-004 HESAP SİLME KAPSAMI GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });

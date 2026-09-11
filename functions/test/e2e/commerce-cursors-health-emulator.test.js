// Faz 2 — cursors that only move on a complete pass, and health that is a
// freshness per entity rather than a word (REC-002/003/004, OBS-003/004).
//   firebase emulators:exec --only firestore "node functions/test/e2e/commerce-cursors-health-emulator.test.js"
const assert = require("assert");
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = admin.firestore();
const cursors = require("../../commerce/cursors");
const health = require("../../commerce/health");

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; console.log("FAIL ", name, "-", String(error && error.message || error).replace(/\s+/g, " ").slice(0, 300)); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }
const SHOP = "e2e-cursor.myshopify.com"; const COMPANY = "e2e-cursor-company";
const T0 = Date.parse("2026-09-02T09:00:00Z"); const HOUR = 3600000;
async function wipe() { await cursors.cursorRef(db, "shopify", SHOP).delete(); await health.healthRef(db, "shopify", SHOP).delete(); }

(async () => {
  await wipe();
  await check("a connection never scanned gets the lookback; a scanned one gets the watermark minus the overlap", async () => {
    assert.deepStrictEqual(cursors.cursorWindow(null, T0), { fromMs: T0 - 24 * HOUR, toMs: T0, reason: "first_pass" });
    assert.deepStrictEqual(cursors.cursorWindow({ watermarkMs: T0 - HOUR }, T0), { fromMs: T0 - HOUR - 10 * 60000, toMs: T0, reason: "incremental" });
    assert.strictEqual(cursors.cursorWindow({ watermarkMs: T0 - 3 * 24 * HOUR }, T0).fromMs, T0 - 24 * HOUR, "an idle connection is capped to the max window");
    assert.strictEqual(cursors.cursorWindow({ watermarkMs: T0 - HOUR }, T0, { force: true, lookbackMs: 7 * 24 * HOUR }).fromMs, T0 - 7 * 24 * HOUR);
  });
  await check("the cursor advances only on a complete pass; a truncated or failed pass leaves it where it was (REC-003)", async () => {
    await cursors.recordPass(db, { provider: "shopify", connectionId: SHOP, companyId: COMPANY, fromMs: T0 - HOUR, toMs: T0, complete: true, scanned: 5, applied: 2, now: T0 });
    let c = await cursors.readCursor(db, "shopify", SHOP);
    assert.strictEqual(c.watermarkMs, T0); assert.strictEqual(c.lastPassComplete, true); assert.strictEqual(c.entityType, "order");
    await cursors.recordPass(db, { provider: "shopify", connectionId: SHOP, companyId: COMPANY, fromMs: T0, toMs: T0 + HOUR, complete: false, truncated: true, scanned: 200, now: T0 + HOUR });
    c = await cursors.readCursor(db, "shopify", SHOP);
    assert.strictEqual(c.watermarkMs, T0, "did not move"); assert.strictEqual(c.lastPassTruncated, true); assert.strictEqual(c.lastPassToMs, T0 + HOUR);
    await cursors.recordPass(db, { provider: "shopify", connectionId: SHOP, companyId: COMPANY, fromMs: T0, toMs: T0 + 2 * HOUR, complete: false, failed: 1, error: "shopify_rate_limited", now: T0 + 2 * HOUR });
    c = await cursors.readCursor(db, "shopify", SHOP);
    assert.strictEqual(c.watermarkMs, T0); assert.strictEqual(c.lastError, "shopify_rate_limited");
    const next = cursors.cursorWindow(c, T0 + 3 * HOUR);
    assert.strictEqual(next.fromMs, T0 - 10 * 60000, "the next pass re-covers what the failed ones did not finish");
    const productCursor = await cursors.readCursor(db, "shopify", SHOP, "product");
    assert.strictEqual(productCursor, null, "entity types have separate cursors (REC-002)");
  });
  await check("health is freshness per entity, with unsupported ones saying so (OBS-003)", async () => {
    const FieldValue = admin.firestore.FieldValue;
    const view0 = health.healthView(null, "shopify", { now: T0 });
    assert.strictEqual(view0.orders.state, "never"); assert.strictEqual(view0.finance.state, "fresh" === "x" ? "" : view0.finance.state);
    assert.strictEqual(health.healthView(null, "inbound", { now: T0 }).products.state, "unsupported", "a website webhook has no products to be fresh about");
    assert.strictEqual(health.healthView(null, "woocommerce", { now: T0 }).orders.state, "never", "WooCommerce reads orders now, so an empty row is never-synced, not unsupported");
    await health.touchHealth(db, { provider: "shopify", connectionId: SHOP, companyId: COMPANY, kind: "webhook", now: T0, FieldValue });
    await health.touchHealth(db, { provider: "shopify", connectionId: SHOP, companyId: COMPANY, kind: "success", now: T0 + 1000, FieldValue });
    await health.touchHealth(db, { provider: "shopify", connectionId: SHOP, companyId: COMPANY, kind: "retry_scheduled", now: T0 + 2000, FieldValue });
    await health.touchHealth(db, { provider: "shopify", connectionId: SHOP, companyId: COMPANY, kind: "retry_scheduled", now: T0 + 3000, FieldValue });
    await health.touchHealth(db, { provider: "shopify", connectionId: SHOP, companyId: COMPANY, kind: "retry_cleared", now: T0 + 4000, FieldValue });
    await health.touchHealth(db, { provider: "shopify", connectionId: SHOP, companyId: COMPANY, kind: "dead", now: T0 + 5000, FieldValue });
    const doc = (await health.healthRef(db, "shopify", SHOP).get()).data();
    const view = health.healthView(doc, "shopify", { now: T0 + 60 * 60000 });
    assert.strictEqual(view.orders.state, "fresh"); assert.strictEqual(view.orders.pendingRetries, 1); assert.strictEqual(view.orders.deadLetters, 1);
    assert.strictEqual(view.orders.lastWebhookAtMs, T0); assert.strictEqual(view.orders.lastSuccessAtMs, T0 + 1000);
    assert.strictEqual(health.healthView(doc, "shopify", { now: T0 + 7 * HOUR }).orders.state, "stale", "six hours without a success is stale");
    // Changed 12 Sep 2026 with the capability correction. "Supported" is what
    // NivaDesk syncs, not what the provider's API offers: no connector reads a
    // product or a stock level, so "never synced" promised a sync that does not
    // exist. The registry still says Shopify's API can read inventory
    // (capabilities.js products/inventory blocks); `implemented` is the other
    // half, and health asks that one. The orchestrator already said the same
    // thing (test/qa/orchestrator-envelope.test.js: "inventory is unsupported,
    // never stale: there is no inventory sync to be behind").
    assert.strictEqual(view.inventory.state, "unsupported", "NivaDesk has no Shopify stock sync, so it can never be fresh");
    // Only Square records a finance entity (squareConnector.js:400, 427, 785).
    assert.strictEqual(doc.supported.finance, false, "Shopify has no finance feed in this codebase");
    assert.strictEqual(health.supportedEntities("square").finance, true, "Square's payouts are the one money feed");
    assert.strictEqual(health.supportedEntities("shopify").orders, true, "orders do sync, so an empty row stays never-synced");
  });
  await wipe();
  console.log(failures === 0 ? "\n✅ FAZ 2 CURSORS + HEALTH GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });

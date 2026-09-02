// SHOP-013. The pass itself is proven live in test/e2e/shopify-reconcile-emulator.test.js;
// pinned here is the wiring the emulator cannot exercise: the schedule, the key
// the sweep needs to read tokens, which stores it picks, and the fields the
// GraphQL query must ask for so a missed cancellation or fulfilment is visible.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
function pass(name) { console.log("PASS ", name); }

{
  const at = source.indexOf("exports.shopifyReconcileOrders = onSchedule({");
  assert(at > 0, "the sweep exists");
  const options = source.slice(at, source.indexOf("}, async () => {", at));
  assert(/schedule: "every 15 minutes"/.test(options), "every fifteen minutes");
  assert(/secrets: \[SHOPIFY_TOKEN_KEY\]/.test(options), "declares the token key — an undeclared secret reads as \"\"");
  assert(/timeoutSeconds: 540/.test(options), "cannot overlap its own next run");
  const body = source.slice(at, source.indexOf("\n});", at));
  assert(body.includes('.where("status", "==", "active")'), "active stores only");
  assert(body.includes("autoSync !== false"), "a store that switched auto-sync off is not reconciled behind its back");
  assert(body.includes("shopifyStoreAccessToken(row.data)"), "a store without a token is not attempted");
  assert(body.includes("SHOPIFY_RECONCILE_MAX_STORES"), "bounded per sweep");
  pass("the sweep runs every fifteen minutes over linked, auto-syncing stores with a token, and declares the key");
}
{
  const at = source.indexOf("const SHOPIFY_ORDER_RECONCILE_FIELDS = `");
  const fields = source.slice(at, source.indexOf("`;", at));
  for (const f of ["updatedAt", "cancelledAt", "displayFulfillmentStatus", "fulfillments(first: 5) { trackingInfo { number company } }"]) {
    assert(fields.includes(f), `asks Shopify for ${f}`);
  }
  assert(fields.includes("${SHOPIFY_ORDER_IMPORT_FIELDS}"), "and everything the import asks for, so a created order is the same order");
  const q = source.slice(source.indexOf("async function fetchShopifyOrdersUpdatedSince("), source.indexOf("async function fetchShopifyOrdersUpdatedSince(") + 900);
  assert(q.includes("sortKey: UPDATED_AT") && q.includes("updated_at:>="), "the window is by update time, not creation");
  pass("the reconciliation query asks for what a missed event would have carried");
}
{
  const at = source.indexOf('if (action === "reconcileNow")');
  assert(at > 0, "the merchant can ask by hand");
  const block = source.slice(at, at + 700);
  assert(block.includes("force: true") && block.includes("SHOPIFY_RECONCILE_MANUAL_LOOKBACK_MS"), "seven days, ignoring the watermark");
  assert(block.includes('"store_not_connected"'), "refused for an unlinked store");
  pass("reconcileNow is a forced seven-day pass on a linked store");
}
{
  const at = source.indexOf("async function reconcileShopifyStore(");
  const body = source.slice(at, source.indexOf("\n}\n", at));
  for (const call of ['applyShopifyOrderEvent(shop, store, "orders/create"', 'applyShopifyOrderEvent(shop, store, "orders/cancelled"', 'applyShopifyOrderEvent(shop, store, "orders/updated"', 'applyShopifyFulfilmentEvent(shop, store, "orders/fulfilled"']) {
    assert(body.includes(call), `goes through the live applier: ${call}`);
  }
  assert(body.includes('topic: "reconcile"'), "writes reconcile rows the merchant can read");
  assert(body.includes("missedTotal: admin.firestore.FieldValue.increment(missed)"), "keeps a running count of what the webhooks missed");
  pass("reconciliation is the live path re-run, and it writes its audit down");
}

{
  const at = source.indexOf("async function fetchShopifyOrderById(");
  const body = source.slice(at, source.indexOf("\n}\n", at));
  assert(body.includes("SHOPIFY_ORDER_RECONCILE_FIELDS") && !body.includes("SHOPIFY_ORDER_IMPORT_FIELDS"), "a fetched order carries the reconcile fields (updatedAt, cancelledAt, fulfilments)");
  pass("fetch-latest asks for the same fields as reconciliation, so a retry sees the cancellation and the tracking");
}

console.log("\n✅ SHOPIFY RECONCILE WIRING GEÇTİ");

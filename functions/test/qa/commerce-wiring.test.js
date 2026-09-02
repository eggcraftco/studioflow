// Faz 2 wiring pins — what the emulator cannot see: the worker declares the
// token key, the shadow wrapper sits around the live Shopify applier, the
// gateway records every delivery and only queues when the flag says so, and
// the flag document defaults to everything off.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
function pass(name) { console.log("PASS ", name); }
{
  const at = source.indexOf("exports.commerceEventWorker = onTaskDispatched({");
  assert(at > 0, "the worker exists");
  const options = source.slice(at, source.indexOf("}, async (request) => {", at));
  assert(/secrets: \[[^\]]*SHOPIFY_TOKEN_KEY[^\]]*\]/.test(options), "the worker reads tokens, so it declares the key");
  assert(/maxAttempts: 1/.test(options), "Cloud Tasks does not retry blindly; the policy does");
  pass("the queue worker declares the key and owns its own retries");
}
{
  assert(source.includes("async function applyShopifyOrderEvent(shop, store, topic, order, options = {}) {\n  const outcome = await applyShopifyOrderEventLive(shop, store, topic, order, options);"), "the wrapper calls the live path first and returns its outcome");
  assert(source.includes('commerce.flags.flagEnabled(flags, "shadow", "shopify", shop)'), "shadow runs only under its flag");
  const callers = (source.match(/(?<!function )applyShopifyOrderEventLive\(/g) || []).length;
  assert.strictEqual(callers, 1, "the wrapper is the only caller of the live applier");
  pass("every Shopify order event goes through the wrapper, and shadow never changes the live outcome");
}
{
  const at = source.indexOf("exports.shopifyAppWebhook = onRequest(");
  const body = source.slice(at, source.indexOf("\n});", at));
  assert(body.includes("commerce.worker.recordReceived("), "every delivery past the claim is recorded");
  assert(body.includes('commerce.flags.flagEnabled(flags, "queue", "shopify", shop)'), "queuing is behind the queue flag");
  assert(body.indexOf("commerce.worker.recordReceived(") < body.indexOf("await routeShopifyAppTopic("), "recorded before it is applied");
  pass("the gateway records first, queues only by flag, and otherwise applies inline as before");
}
{
  const flags = fs.readFileSync(path.join(__dirname, "..", "..", "commerce", "flags.js"), "utf8");
  assert(/shadow: \{ enabled: false/.test(flags) && /queue: \{ enabled: false/.test(flags), "both switches default to off");
  pass("with no flag document, production behaves exactly as before Faz 2");
}
{
  const at = source.indexOf("exports.retryCommerceEvent = onCall(");
  assert(at > 0, "a dead event can be retried by hand");
  const body = source.slice(at, source.indexOf("\n});", at));
  assert(body.includes("requireWorkspaceForBilling(request, true)"), "owner only");
  assert(body.includes('["dead", "retrying", "failed"].includes'), "only a dead or waiting event");
  assert(body.includes("eventOrigin: \"retry\""), "the retry says it is one");
  assert(/secrets: \[[^\]]*SHOPIFY_TOKEN_KEY[^\]]*\]/.test(source.slice(at, at + 200)), "it fetches from Shopify, so it declares the key");
  console.log("PASS  a dead-letter event is retried by the owner under its own key, never by anyone else");
}
{
  const at = source.indexOf("async function reconcileShopifyStore(");
  const body = source.slice(at, source.indexOf("\n}\n", at));
  assert(body.includes("commerce.cursors.recordPass(") && body.includes("complete = !audit.truncated && audit.failed === 0"), "the common cursor moves only on a complete pass");
  console.log("PASS  reconciliation writes the common cursor and moves it only when the pass was complete");
}
console.log("\n✅ COMMERCE WIRING GEÇTİ");

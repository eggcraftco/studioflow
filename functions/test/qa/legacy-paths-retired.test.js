// SHOP-001 / WOO-014. The behaviour is proven live in
// test/e2e/legacy-paths-retired-emulator.test.js; pinned here is that the
// retirement is structural — the exports ARE the 410 stubs, not a flag inside
// the old handlers that a later edit could route around — and that inbound is
// not on the retired list.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
function pass(name) { console.log("PASS ", name); }

{
  const m = /const RETIRED_INTEGRATION_KINDS = new Set\(\[([^\]]+)\]\);/.exec(source);
  assert(m, "the retired set is a literal");
  const kinds = m[1].split(",").map((s) => s.trim().replace(/"/g, ""));
  assert.deepStrictEqual(kinds.sort(), ["shopify", "woocommerce"]);
  pass("woocommerce and shopify are retired; inbound is not");
}
for (const name of ["woocommerceOrderWebhook", "shopifyOrderWebhook"]) {
  const at = source.indexOf(`exports.${name} = onRequest(`);
  assert(at > 0, `${name} exists`);
  const body = source.slice(at, source.indexOf("\n});", at));
  assert(body.includes("retiredWebhookResponse(res,"), `${name} is the 410 stub`);
  assert(!body.includes("req.body"), `${name} never reads the body`);
  assert(source.includes(`async function ${name}Retired(req, res) {`), `${name}'s old handler is unexported`);
  pass(`${name} answers 410 without reading the request`);
}
for (const [name, first] of [["getWooCommerceWebhookToken", 'assertIntegrationKindLive("woocommerce")'], ["getShopifyWebhookToken", 'assertIntegrationKindLive("shopify")'], ["saveWooSignatureSecret", 'assertIntegrationKindLive("woocommerce")'], ["rotateIntegrationWebhookToken", "assertIntegrationKindLive(kind)"], ["sendTestIntegrationWebhook", "assertIntegrationKindLive(kind)"]]) {
  const at = source.indexOf(`exports.${name} = onCall(`);
  assert(at > 0, `${name} exists`);
  assert(source.slice(at, at + 600).includes(first), `${name} refuses the retired kinds before doing anything else`);
}
pass("every callable that could mint or use a retired token refuses first");
{
  const at = source.indexOf("exports.getInboundWebhookToken = onCall(");
  assert(at > 0 && !source.slice(at, at + 400).includes("assertIntegrationKindLive"), "inbound token callable is not gated");
  pass("the inbound channel keeps its callable");
}
console.log("\n✅ LEGACY PATHS RETIRED GEÇTİ");

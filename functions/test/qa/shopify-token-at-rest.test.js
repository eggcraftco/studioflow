// SHOP-004. The box itself is proven live in test/e2e/shopify-token-emulator.test.js;
// what is pinned here is the wiring that the emulator cannot see: every function
// that can reach the token declares the key (an undeclared secret reads as "",
// and "" means silent plaintext fallback forever), no reader bypasses the
// helper, and the two uninstall writers remove the box along with the plaintext.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
function pass(name) { console.log("PASS ", name); }
function exportOptions(name) {
  const at = source.indexOf(`exports.${name} = on`);
  assert(at > 0, `${name} exists`);
  return source.slice(at, source.indexOf("async (", at));
}

{
  for (const name of ["shopifyAppBridge", "shopifyAppWebhook", "shopifyImportOrders", "releaseHeldIntegrationOrders"]) {
    assert(/SHOPIFY_TOKEN_KEY/.test(exportOptions(name)), `${name} declares SHOPIFY_TOKEN_KEY`);
  }
  pass("every function that reaches the Shopify token declares the key");
}
{
  assert.strictEqual((source.match(/String\(store\.accessToken \|\| ""\)/g) || []).length, 0, "no reader takes store.accessToken directly");
  for (const fn of ["shopifyAdminGraphQL", "shopifyOrderCollectionIds"]) {
    const at = source.indexOf(`async function ${fn}(`);
    assert(at > 0, `${fn} exists`);
    assert(source.slice(at, at + 400).includes("shopifyStoreAccessToken(store)"), `${fn} reads through the helper`);
  }
  pass("both token readers go through shopifyStoreAccessToken");
}
{
  const sites = source.match(/status: "uninstalled",\n\s+accessToken: "",\n\s+accessTokenEncrypted: admin\.firestore\.FieldValue\.delete\(\)/g) || [];
  assert.strictEqual(sites.length, 2, "bridge markUninstalled and the app/uninstalled webhook both drop the box");
  pass("an uninstall removes the box, not only the plaintext");
}
{
  const at = source.indexOf("function shopifyPublicStoreView(");
  const body = source.slice(at, source.indexOf("\n}\n", at));
  assert(!/accessToken/.test(body), "the client view names no token field");
  pass("the client-safe store view cannot carry a token in either form");
}
{
  assert(/const SHOPIFY_TOKEN_DUAL_WRITE = (true|false);/.test(source), "the phase flag is a literal, flipped by hand in Phase B");
  pass("Phase A/B is one literal flag");
}

console.log("\n✅ SHOPIFY TOKEN AT REST GEÇTİ");

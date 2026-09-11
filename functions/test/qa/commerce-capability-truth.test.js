// What a connector can do, said honestly in one place.
//
// The registry describes each provider's API, and Sync Health used to read it as
// "NivaDesk syncs this", so products and stock came back as "never" — a sync
// that had not run yet — for six providers that have no product or stock sync at
// all. `implemented` separates the two, and these checks keep them apart.
const assert = require("assert");
const { getCapabilities, listProviders } = require("../../commerce/capabilities");
const health = require("../../commerce/health");
const fs = require("fs");
const path = require("path");

let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); } }

check("every provider says what this codebase reads today, in booleans", () => {
  for (const provider of listProviders()) {
    const caps = getCapabilities(provider);
    assert.ok(caps.implemented, `${provider} has no implemented map`);
    for (const entity of ["orders", "products", "inventory", "finance"]) {
      assert.strictEqual(typeof caps.implemented[entity], "boolean", `${provider}.${entity} is not a boolean`);
    }
  }
});

check("orders are read everywhere; products and stock are read nowhere", () => {
  for (const provider of listProviders()) {
    const { implemented } = getCapabilities(provider);
    assert.strictEqual(implemented.orders, true, `${provider} should read orders`);
    assert.strictEqual(implemented.products, false, `${provider} claims a product sync that does not exist`);
    assert.strictEqual(implemented.inventory, false, `${provider} claims a stock sync that does not exist`);
  }
});

check("Square is the one connector with a money feed", () => {
  assert.strictEqual(getCapabilities("square").implemented.finance, true);
  for (const provider of ["shopify", "etsy", "woocommerce", "amazon", "ebay", "inbound"]) {
    assert.strictEqual(getCapabilities(provider).implemented.finance, false, `${provider} claims a finance feed`);
  }
});

check("the protocol statement is untouched: the provider's API still offers what it offers", () => {
  // This is the pair the fix keeps apart. eBay's API can read listings; NivaDesk
  // does not. Both sentences stay true, in different fields.
  assert.strictEqual(getCapabilities("ebay").products.read, true);
  assert.strictEqual(getCapabilities("ebay").implemented.products, false);
});

check("Sync Health itself now answers unsupported where nothing syncs", () => {
  for (const provider of listProviders()) {
    const supported = health.supportedEntities(provider);
    assert.strictEqual(supported.products, false, `${provider} products must be unsupported`);
    assert.strictEqual(supported.inventory, false, `${provider} inventory must be unsupported`);
    assert.strictEqual(supported.orders, true, `${provider} orders must be supported`);
  }
  assert.strictEqual(health.supportedEntities("square").finance, true);
  assert.strictEqual(health.supportedEntities("shopify").finance, false);
});

check("the regression it fixes: a protocol-level read no longer makes Health claim support", () => {
  // Before the change this was Boolean(caps.products.read) — true for six
  // providers — so Sync Health showed "never synced" for a sync that does not
  // exist. The registry still says the API can read products; Health does not.
  assert.strictEqual(getCapabilities("shopify").products.read, true);
  assert.strictEqual(health.supportedEntities("shopify").products, false);
});

check("the hub card no longer offers eBay payments and refunds, and Square's payouts are named", () => {
  const file = path.join(__dirname, "..", "..", "..", "studioflow-web", "lib", "studioflow", "integrations.ts");
  const source = fs.readFileSync(file, "utf8");
  const ebayLine = source.split("\n").find((line) => line.includes('manage: "ebay"'));
  const squareLine = source.split("\n").find((line) => line.includes('manage: "square"'));
  assert.ok(ebayLine, "the eBay card is gone");
  assert.ok(!/Payments|Refunds/.test(ebayLine), `the eBay card still claims: ${ebayLine.trim()}`);
  assert.ok(/Payouts/.test(squareLine), "Square's payouts are still missing from its card");
});

console.log(failures === 0 ? "\n✅ COMMERCE CAPABILITY TRUTH GEÇTİ" : `\n❌ ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);

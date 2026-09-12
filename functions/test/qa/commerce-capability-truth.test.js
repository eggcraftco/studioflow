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

check("Etsy and Amazon: products, stock and finance read as not supported, never as 'never synced'", () => {
  for (const provider of ["etsy", "amazon"]) {
    const caps = getCapabilities(provider);
    for (const entity of ["products", "inventory", "finance"]) {
      assert.strictEqual(caps.implemented[entity], false, `${provider}.${entity} claims an implementation`);
      assert.strictEqual(health.supportedEntities(provider)[entity], false, `${provider}.${entity} is still marked supported`);
      const cell = health.healthView(null, provider, { now: Date.now() })[entity];
      assert.strictEqual(cell.state, "unsupported", `${provider}.${entity} shows ${cell.state} instead of unsupported`);
    }
  }
});

check("a recorded sync does not turn an unimplemented entity back into 'never'", () => {
  // A health document exists for the connection because orders sync; the other
  // entities must still read unsupported rather than never-synced.
  const doc = { orders: { lastSuccessAtMs: Date.now() - 1000 }, products: {}, inventory: {} };
  const view = health.healthView(doc, "etsy", { now: Date.now() });
  assert.strictEqual(view.orders.state, "fresh");
  assert.strictEqual(view.products.state, "unsupported");
  assert.strictEqual(view.inventory.state, "unsupported");
});

check("the web card turns that state into 'Not supported' for the person reading it", () => {
  const file = path.join(__dirname, "..", "..", "..", "studioflow-web", "lib", "..", "app", "settings", "CommerceSyncHealthCard.tsx");
  const source = fs.readFileSync(file, "utf8");
  assert.match(source, /unsupported:\s*"Not supported"/, "the card no longer labels unsupported");
  assert.match(source, /never:\s*"Never synced"/, "the card no longer labels never-synced");
  // An unknown state must fall back to the cautious label, never to "Never synced".
  assert.match(source, /stateLabel\[cell\.state\] \|\| "Not supported"/, "the card's fallback label changed");
});

check("the gap this does not close: Etsy and Amazon record no sync health at all", () => {
  // Their orders do sync, but no code calls touchHealth for them, so no row
  // appears in Sync Health for a workspace whose only connector is one of these.
  // Pinned so the day somebody adds the call, this test says so.
  const root = path.join(__dirname, "..", "..");
  const sources = ["etsy.js", "etsySync.js", "commerce/amazon/ingest.js"].map((file) => fs.readFileSync(path.join(root, file), "utf8"));
  for (const source of sources) assert.ok(!/touchHealth\(/.test(source), "a connector started recording health: update this pin and the record");
  for (const source of [fs.readFileSync(path.join(root, "wooConnector.js"), "utf8"), fs.readFileSync(path.join(root, "squareConnector.js"), "utf8")]) {
    assert.ok(/touchHealth\(/.test(source), "the control: Woo and Square do record health");
  }
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

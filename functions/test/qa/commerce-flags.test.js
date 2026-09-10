// The commerce flag document (MIG-001 and design §2 layer 3): three areas,
// connection beats provider beats global, everything off by default — and the
// `connectors` area is MERGED FROM THE DOCUMENT, because a field that is read
// but never merged drives nothing and would leave the rollback plan a fiction.
const assert = require("assert");
const flags = require("../../commerce/flags");
let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name)).catch((error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); }); }

function fakeDb(data) { return { collection: () => ({ doc: () => ({ get: async () => ({ exists: data !== null, data: () => data }) }) }) }; }

(async () => {
  await check("with no document every area is off, including connectors", async () => {
    flags.resetCommerceFlagCache();
    const out = await flags.readCommerceFlags(fakeDb(null), { force: true });
    assert.deepStrictEqual(out.connectors, { enabled: false, providers: {}, connections: {} });
    assert.strictEqual(flags.flagEnabled(out, "connectors", "ebay", "acme__seller"), false);
    assert.strictEqual(flags.flagEnabled(out, "shadow", "shopify", "x"), false);
    assert.strictEqual(flags.flagEnabled(out, "queue", "shopify", "x"), false);
    assert.deepStrictEqual(Object.keys(flags.EMPTY_COMMERCE_FLAGS).sort(), ["connectors", "queue", "shadow"]);
  });

  await check("readCommerceFlags merges the connectors area from the document — the field drives the sweep", async () => {
    flags.resetCommerceFlagCache();
    const out = await flags.readCommerceFlags(fakeDb({ connectors: { providers: { ebay: true } } }), { force: true });
    assert.strictEqual(out.connectors.enabled, false, "the global switch keeps its default");
    assert.strictEqual(flags.flagEnabled(out, "connectors", "ebay", "acme__seller"), true, "the provider entry from the document is read");
    assert.strictEqual(flags.flagEnabled(out, "connectors", "amazon", "x"), false, "another provider is not switched on by eBay's entry");
  });

  await check("precedence: connection > provider > global, in the connectors area", async () => {
    const doc = { connectors: { enabled: true, providers: { ebay: false }, connections: { "ebay:acme__seller": true } } };
    flags.resetCommerceFlagCache();
    const out = await flags.readCommerceFlags(fakeDb(doc), { force: true });
    assert.strictEqual(flags.flagEnabled(out, "connectors", "ebay", "acme__seller"), true, "the connection entry wins");
    assert.strictEqual(flags.flagEnabled(out, "connectors", "ebay", "other__seller"), false, "the provider entry beats the global switch");
    assert.strictEqual(flags.flagEnabled(out, "connectors", "square", "any"), true, "no entry: the global switch");
    const paused = { connectors: { enabled: false, providers: { ebay: true }, connections: { "ebay:acme__seller": false } } };
    flags.resetCommerceFlagCache();
    const out2 = await flags.readCommerceFlags(fakeDb(paused), { force: true });
    assert.strictEqual(flags.flagEnabled(out2, "connectors", "ebay", "acme__seller"), false, "one connection paused while the provider is on");
    assert.strictEqual(flags.flagEnabled(out2, "connectors", "ebay", "other__seller"), true);
  });

  await check("only an explicit true switches anything on", async () => {
    flags.resetCommerceFlagCache();
    const out = await flags.readCommerceFlags(fakeDb({ connectors: { enabled: "yes", providers: { ebay: 1 }, connections: { "ebay:x": "true" } } }), { force: true });
    assert.strictEqual(flags.flagEnabled(out, "connectors", "ebay", "x"), false);
    assert.strictEqual(flags.flagEnabled(out, "connectors", "ebay", "y"), false);
  });

  await check("the cache serves for a minute and reset clears it", async () => {
    flags.resetCommerceFlagCache();
    const first = await flags.readCommerceFlags(fakeDb({ connectors: { enabled: true } }), { now: 1000, force: true });
    assert.strictEqual(flags.flagEnabled(first, "connectors", "ebay", "x"), true);
    const cached = await flags.readCommerceFlags(fakeDb({ connectors: { enabled: false } }), { now: 2000 });
    assert.strictEqual(flags.flagEnabled(cached, "connectors", "ebay", "x"), true, "still the cached answer");
    flags.resetCommerceFlagCache();
    const fresh = await flags.readCommerceFlags(fakeDb({ connectors: { enabled: false } }), { now: 3000 });
    assert.strictEqual(flags.flagEnabled(fresh, "connectors", "ebay", "x"), false);
    flags.resetCommerceFlagCache();
  });

  if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
  console.log("\n✅ COMMERCE FLAGS GEÇTİ");
})();

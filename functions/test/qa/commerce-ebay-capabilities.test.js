// The truthful registry for an eBay connection (design §4.1): only what the
// shipped half has proved is `true`; every default `true` it has not proved
// reads "not_in_this_release", so a screen offers nothing that would 403.
const assert = require("assert");
const { EBAY_DEFAULTS, proveEbay, capabilityAllowed, capabilityReason, NOT_IN_THIS_RELEASE } = require("../../commerce/connectionCapabilities");
let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); } }

check("the account half proves orders.read and nothing else", () => {
  const caps = proveEbay(EBAY_DEFAULTS, { "orders.read": true });
  assert.strictEqual(caps["orders.read"], true);
  for (const name of ["shipment.write", "finance.read", "inventory.read"]) {
    assert.strictEqual(caps[name], NOT_IN_THIS_RELEASE, name);
    assert.strictEqual(capabilityAllowed(caps, name), false, `${name} must not be offered`);
    assert.strictEqual(capabilityReason(caps, name), "not_in_this_release");
  }
  // The reason strings stay as the specification wrote them.
  assert.strictEqual(caps["listing.create"], "business_policy_and_management_mode");
  assert.strictEqual(caps["price.write"], "managed_listing_only");
  assert.strictEqual(caps.notifications, "subscription_dependent");
  assert.deepStrictEqual(Object.keys(caps).sort(), Object.keys(EBAY_DEFAULTS).sort(), "no capability is dropped or invented");
});

check("with every default proved, the specification's own map comes back", () => {
  const proofs = {};
  for (const [name, value] of Object.entries(EBAY_DEFAULTS)) if (value === true) proofs[name] = true;
  assert.deepStrictEqual(proveEbay(EBAY_DEFAULTS, proofs), { ...EBAY_DEFAULTS });
});

check("a proof may also be false or a new reason; junk is ignored; the defaults are never mutated", () => {
  const before = JSON.stringify(EBAY_DEFAULTS);
  const caps = proveEbay(EBAY_DEFAULTS, { "orders.read": true, "shipment.write": false, "finance.read": "awaiting_finances_api", "made.up": 42 });
  assert.strictEqual(caps["shipment.write"], false); assert.strictEqual(capabilityReason(caps, "shipment.write"), "unsupported");
  assert.strictEqual(caps["finance.read"], "awaiting_finances_api");
  assert.strictEqual(caps["made.up"], undefined);
  assert.strictEqual(JSON.stringify(EBAY_DEFAULTS), before);
  assert.strictEqual(proveEbay(null, { "orders.read": true })["orders.read"], true, "a missing base starts from the defaults");
});

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\n✅ COMMERCE EBAY CAPABILITIES GEÇTİ");

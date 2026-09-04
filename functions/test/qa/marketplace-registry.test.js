// The two tables a marketplace connector cannot work without, and the rule that
// decides what a screen is allowed to offer.
//
// A marketplace id is not a country code and cannot be guessed from one. Amazon
// serves every European marketplace from ONE endpoint and North America from
// another, and calling the wrong one is a 403, not a slow answer — which looks
// exactly like a shop with no orders. eBay's sites differ per country too, and
// a link to the wrong one lands a seller on a page that cannot find their order.
//
// And a capability is three-valued on purpose: a feature in the provider's
// public docs is not a guarantee for one seller's account, so "not yet proved"
// has to be its own answer and must never read as permission.
const assert = require("assert");
const {
  AMAZON_MARKETPLACES, AMAZON_ENDPOINTS, EBAY_MARKETPLACES,
  amazonMarketplace, ebayMarketplace, amazonEndpointFor, amazonRegionsFor
} = require("../../commerce/marketplaces");
const { defaultCapabilities, capabilityAllowed, capabilityReason, AMAZON_DEFAULTS, EBAY_DEFAULTS } = require("../../commerce/connectionCapabilities");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

check("every Amazon marketplace names a region that has an endpoint", () => {
  for (const [id, market] of Object.entries(AMAZON_MARKETPLACES)) {
    assert.ok(AMAZON_ENDPOINTS[market.region], `${id} (${market.name}) claims region ${market.region}, which has no endpoint`);
    assert.ok(/^https:\/\//.test(AMAZON_ENDPOINTS[market.region]));
  }
});

check("every marketplace row is complete, on both providers", () => {
  for (const [id, market] of Object.entries(AMAZON_MARKETPLACES)) {
    for (const field of ["country", "currency", "region", "host", "name"]) {
      assert.ok(market[field], `Amazon ${id} has no ${field}`);
    }
    assert.match(market.currency, /^[A-Z]{3}$/, `Amazon ${id} currency is not an ISO code`);
    assert.match(market.country, /^[A-Z]{2}$/, `Amazon ${id} country is not an ISO code`);
  }
  for (const [id, market] of Object.entries(EBAY_MARKETPLACES)) {
    for (const field of ["country", "currency", "host", "name"]) {
      assert.ok(market[field], `eBay ${id} has no ${field}`);
    }
    assert.match(market.currency, /^[A-Z]{3}$/, `eBay ${id} currency is not an ISO code`);
  }
});

check("the UK rows are the ones this workshop will actually use", () => {
  assert.deepStrictEqual(amazonMarketplace("A1F83G8C2ARO7P"), { country: "GB", currency: "GBP", region: "eu", host: "sellercentral.amazon.co.uk", name: "Amazon UK" });
  assert.strictEqual(amazonEndpointFor("A1F83G8C2ARO7P"), "https://sellingpartnerapi-eu.amazon.com");
  assert.strictEqual(ebayMarketplace("EBAY_GB").host, "www.ebay.co.uk");
  assert.strictEqual(ebayMarketplace("ebay_gb").currency, "GBP", "the id is read case-insensitively");
});

check("an unknown marketplace is null, never a default", () => {
  // Defaulting to GB would send a German seller's calls to the wrong endpoint
  // and quote their money in the wrong currency, and both failures look like
  // an empty shop rather than a misconfiguration.
  assert.strictEqual(amazonMarketplace("NOT_A_MARKETPLACE"), null);
  assert.strictEqual(amazonMarketplace(""), null);
  assert.strictEqual(amazonMarketplace(null), null);
  assert.strictEqual(amazonEndpointFor("NOT_A_MARKETPLACE"), null);
  assert.strictEqual(ebayMarketplace("EBAY_NOWHERE"), null);
  // And a prototype key is not a marketplace.
  assert.strictEqual(amazonMarketplace("constructor"), null);
  assert.strictEqual(amazonMarketplace("toString"), null);
});

check("a connection covering two regions is refused before it becomes a 403", () => {
  const european = amazonRegionsFor(["A1F83G8C2ARO7P", "A1PA6795UKMFR9", "A13V1IB3VIYZZH"]);
  assert.deepStrictEqual(european.regions, ["eu"]);
  assert.strictEqual(european.single, true);
  assert.deepStrictEqual(european.unknown, []);

  const split = amazonRegionsFor(["A1F83G8C2ARO7P", "ATVPDKIKX0DER"]);
  assert.deepStrictEqual(split.regions, ["eu", "na"]);
  assert.strictEqual(split.single, false, "one connection holds one endpoint's credentials; two regions need two connections");

  const partly = amazonRegionsFor(["A1F83G8C2ARO7P", "NOPE"]);
  assert.deepStrictEqual(partly.unknown, ["NOPE"], "an unrecognised id is named rather than dropped");
});

// ---- capabilities -----------------------------------------------------------

check("a capability that has not been proved is not permission", () => {
  const amazon = defaultCapabilities("amazon");
  // A truthy string is the trap: "role_dependent" is a question, not a yes.
  assert.strictEqual(capabilityAllowed(amazon, "orders.pii"), false);
  assert.strictEqual(capabilityReason(amazon, "orders.pii"), "role_dependent");
  assert.strictEqual(capabilityAllowed(amazon, "listings.write"), false);
  assert.strictEqual(capabilityAllowed(amazon, "mfn_inventory.write"), false);
});

check("a proved capability is offered, and a refused one says so", () => {
  const amazon = defaultCapabilities("amazon");
  assert.strictEqual(capabilityAllowed(amazon, "orders.read"), true);
  assert.strictEqual(capabilityReason(amazon, "orders.read"), "");
  // FBA stock is Amazon's: NivaDesk never writes it, and that is a decision
  // rather than something waiting to be proved (§28).
  assert.strictEqual(amazon["fba_inventory.write"], false);
  assert.strictEqual(capabilityReason(amazon, "fba_inventory.write"), "unsupported");
});

check("a capability nobody has heard of is refused, not assumed", () => {
  const amazon = defaultCapabilities("amazon");
  assert.strictEqual(capabilityAllowed(amazon, "listing.delete"), false);
  assert.strictEqual(capabilityReason(amazon, "listing.delete"), "unsupported");
  assert.strictEqual(capabilityAllowed(null, "orders.read"), false);
  assert.strictEqual(capabilityAllowed({}, "orders.read"), false);
});

check("eBay's writes are gated on the listing being ours to manage", () => {
  const ebay = defaultCapabilities("ebay");
  // A listing the seller runs from eBay's own tools is theirs; writing a price
  // or a quantity into it is the ownership problem §22 exists to prevent.
  assert.strictEqual(ebay["price.write"], "managed_listing_only");
  assert.strictEqual(ebay["quantity.write"], "managed_listing_only");
  assert.strictEqual(capabilityAllowed(ebay, "price.write"), false);
  assert.strictEqual(capabilityAllowed(ebay, "orders.read"), true);
});

check("an unmodelled provider gets nothing rather than someone else's answers", () => {
  assert.deepStrictEqual(defaultCapabilities("etsy"), {});
  assert.deepStrictEqual(defaultCapabilities(""), {});
  assert.deepStrictEqual(defaultCapabilities(null), {});
});

check("each connection gets its own registry, not a share of everyone else's", () => {
  // Two defences, and the test needs both: the table is frozen, AND the caller
  // is handed a copy. Asserting only that a mutation "did not take" proves
  // nothing here — assigning to a frozen object silently does nothing in a
  // non-strict module, so that check stayed green when the copy was removed.
  assert.ok(Object.isFrozen(AMAZON_DEFAULTS));
  assert.ok(Object.isFrozen(EBAY_DEFAULTS));
  const mine = defaultCapabilities("amazon");
  assert.notStrictEqual(mine, AMAZON_DEFAULTS, "the shared table itself was handed out; one connection proving PII would prove it for every workspace");
  // And the copy is writable, because a connection has to record what it proved.
  mine["orders.pii"] = true;
  assert.strictEqual(mine["orders.pii"], true);
  assert.strictEqual(defaultCapabilities("amazon")["orders.pii"], "role_dependent", "and the edit stayed local");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ MARKETPLACE REGISTRY GEÇTİ");
})();

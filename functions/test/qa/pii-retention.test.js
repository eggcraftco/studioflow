// When a buyer's personal details stop being ours to keep.
//
// A marketplace lends the seller a buyer's name and address so the seller can
// make the thing and post it. Amazon's Data Protection Policy ends that loan
// thirty days after fulfilment. That is a condition of holding the data at all,
// not a preference.
//
// The danger in implementing it is doing too much. A jeweller who takes a
// commission directly owns that relationship — the customer comes back for a
// resize, a repair, a second piece — and scrubbing their address after a month
// would be the software deleting the business's own records to satisfy a policy
// that was never about them. Almost every check below is about that line.
const assert = require("assert");
const {
  scrubDecision, scrubPatch, retentionRuleFor, providerOf,
  PROVIDER_RETENTION, PII_FIELDS, KEPT_ON_PURPOSE
} = require("../../privacy/retention");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 6, 1, 12, 0, 0);
const buyer = () => ({
  customerName: "Ada Lovelace", shippingName: "Ada Lovelace",
  emailAddress: "ada@example.com", shippingPhone: "+44 7700 900000",
  shippingStreetAddress: "10 Analytical Way", shippingCity: "London",
  shippingPostalCode: "N1 1AA", shippingCountry: "GB",
  orderValue: 120, paidAmount: 120, taxAmount: 20
});
const amazonOrder = (extra = {}) => ({
  ...buyer(), commerce: { provider: "amazon", externalId: "206-1" },
  isDelivered: true, deliveredAtMs: T0, ...extra
});

// ---- whose data is it -------------------------------------------------------

check("an Amazon order is scrubbed thirty days after it was delivered", () => {
  assert.strictEqual(scrubDecision(amazonOrder(), T0 + 29 * DAY).scrub, false, "scrubbed early");
  assert.strictEqual(scrubDecision(amazonOrder(), T0 + 29 * DAY).reason, "not_due");
  const due = scrubDecision(amazonOrder(), T0 + 31 * DAY);
  assert.strictEqual(due.scrub, true);
  assert.strictEqual(due.reason, "amazon_dpp");
});

check("a workshop's own customer is never scrubbed, whatever the shop", () => {
  // The line this whole file exists to hold. These are the workshop's own
  // relationships and its own records.
  for (const provider of ["shopify", "woocommerce", "etsy", "square", "ebay", "inbound"]) {
    const order = amazonOrder({ commerce: { provider }, deliveredAtMs: T0 });
    const decision = scrubDecision(order, T0 + 400 * DAY);
    assert.strictEqual(decision.scrub, false, `${provider} order was scrubbed`);
    assert.strictEqual(decision.reason, "no_retention_rule", provider);
  }
});

check("an order the workshop typed itself has no provider and no rule", () => {
  const manual = { ...buyer(), isDelivered: true, deliveredAtMs: T0 };
  const decision = scrubDecision(manual, T0 + 400 * DAY);
  assert.strictEqual(decision.scrub, false);
  assert.strictEqual(decision.reason, "no_retention_rule");
  assert.strictEqual(providerOf(manual), "");
});

check("a provider nobody has described imposes nothing", () => {
  // We do not invent an obligation on somebody else's behalf.
  const order = amazonOrder({ commerce: { provider: "some_new_marketplace" } });
  assert.strictEqual(scrubDecision(order, T0 + 400 * DAY).scrub, false);
  assert.strictEqual(retentionRuleFor(order), null);
  // And a prototype key is not a provider.
  assert.strictEqual(retentionRuleFor({ commerce: { provider: "constructor" } }), null);
});

check("provenance is read from the commerce stamp or the legacy Source field", () => {
  assert.strictEqual(providerOf({ commerce: { provider: "Amazon" } }), "amazon");
  assert.strictEqual(providerOf({ customFields: { Source: "Amazon" } }), "amazon");
  const legacy = { ...buyer(), customFields: { Source: "Amazon" }, isDelivered: true, deliveredAtMs: T0 };
  assert.strictEqual(scrubDecision(legacy, T0 + 31 * DAY).scrub, true, "a legacy Amazon order was missed");
});

// ---- when the clock starts ---------------------------------------------------

check("an order still being made is never touched", () => {
  const live = amazonOrder({ isDelivered: false });
  const decision = scrubDecision(live, T0 + 400 * DAY);
  assert.strictEqual(decision.scrub, false);
  assert.strictEqual(decision.reason, "not_delivered", "a live order's buyer was deleted mid-job");
});

check("a delivered order with no delivery date is left alone rather than guessed at", () => {
  // Every order delivered before NivaDesk started recording when. Guessing a
  // date here would delete buyers by the thousand on the first sweep.
  const decision = scrubDecision(amazonOrder({ deliveredAtMs: 0 }), T0 + 400 * DAY);
  assert.strictEqual(decision.scrub, false);
  assert.strictEqual(decision.reason, "no_delivery_date");
  for (const bad of [null, undefined, "yesterday", -5, NaN]) {
    assert.strictEqual(scrubDecision(amazonOrder({ deliveredAtMs: bad }), T0 + 400 * DAY).scrub, false, String(bad));
  }
});

check("without a clock nothing is deleted", () => {
  for (const now of [0, NaN, undefined, null]) {
    assert.strictEqual(scrubDecision(amazonOrder(), now).scrub, false, String(now));
  }
});

check("an order already scrubbed is not visited again", () => {
  const done = amazonOrder({ piiScrubbedAtMs: T0 + 31 * DAY });
  assert.strictEqual(scrubDecision(done, T0 + 400 * DAY).reason, "already_scrubbed");
});

// ---- what goes and what stays -------------------------------------------------

check("the person goes and the sale stays", () => {
  const { patch } = scrubPatch(amazonOrder(), T0 + 31 * DAY);
  assert.strictEqual(patch.customerName, "Buyer details removed", "an empty name reads like data loss, not a policy");
  for (const field of ["emailAddress", "shippingPhone", "shippingStreetAddress", "shippingCity", "shippingPostalCode", "shippingName"]) {
    assert.strictEqual(patch[field], "", `${field} survived`);
  }
  // The financial record has to reconcile afterwards.
  for (const field of KEPT_ON_PURPOSE) {
    assert.strictEqual(patch[field], undefined, `${field} was destroyed; the order can no longer be reconciled`);
  }
  assert.strictEqual(patch.shippingCountry, undefined, "the country stays: it is a tax fact, not a person");
  assert.strictEqual(patch.commerce, undefined, "the marketplace order id stays");
});

check("the scrub is stamped even when there was nothing left to remove", () => {
  // Otherwise the sweep revisits a bare order every night for ever.
  const bare = { commerce: { provider: "amazon" }, isDelivered: true, deliveredAtMs: T0 };
  const { patch } = scrubPatch(bare, T0 + 31 * DAY);
  assert.strictEqual(Object.keys(patch).length, 2);
  assert.ok(patch.piiScrubbedAtMs > 0);
  assert.strictEqual(patch.piiScrubbedReason, "amazon_dpp");
});

check("an order that is not due produces no patch at all", () => {
  const { patch, decision } = scrubPatch(amazonOrder(), T0 + 10 * DAY);
  assert.deepStrictEqual(patch, {});
  assert.strictEqual(decision.scrub, false);
});

check("every field named for removal is a field an order really has", () => {
  // A misspelled key would silently leave the real one in place.
  const order = amazonOrder();
  const known = new Set(Object.keys(order));
  for (const field of ["customerName", "shippingName", "emailAddress", "shippingPhone", "shippingStreetAddress", "shippingCity", "shippingPostalCode"]) {
    assert.ok(known.has(field), `${field} is not a field on an order`);
    assert.ok(Object.prototype.hasOwnProperty.call(PII_FIELDS, field), `${field} is not on the removal list`);
  }
});

check("the retention table says which providers impose a deadline and which do not", () => {
  assert.strictEqual(PROVIDER_RETENTION.amazon.days, 30);
  for (const provider of ["shopify", "woocommerce", "etsy", "square", "ebay", "inbound"]) {
    assert.strictEqual(PROVIDER_RETENTION[provider].days, 0, `${provider} imposes a deadline it did not ask for`);
  }
});

check("a workspace can be given a stricter rule, but the default is the provider's", () => {
  // An override exists so a workshop with its own policy can go further; it
  // cannot be used to quietly relax Amazon's.
  const stricter = scrubDecision(amazonOrder(), T0 + 8 * DAY, { amazon: { days: 7, reason: "workspace_policy" } });
  assert.strictEqual(stricter.scrub, true);
  assert.strictEqual(stricter.reason, "workspace_policy");
});

// ---- the clock has to be started somewhere ----------------------------------

check("every place an order becomes delivered stamps when", () => {
  // Without this the rule above can never fire: `isDelivered` is a boolean and
  // nothing recorded the moment. There are three places an order becomes
  // delivered — a person ticking it, the hourly tracking refresh, and the
  // per-order registration — and all three have to stamp, or a whole route to
  // delivery silently produces orders that can never be scrubbed.
  const fs = require("fs");
  const path = require("path");
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");

  const sites = [
    { what: "a person ticking Delivered", near: 'updates.isDelivered = next;' },
    { what: "the hourly tracking refresh", near: 'orderTrackingUpdate.isDelivered = true;' },
    { what: "tracking registration", near: '          isDelivered: true,\n          isDispatched: true,' }
  ];
  for (const { what, near } of sites) {
    const at = source.indexOf(near);
    assert.ok(at > 0, `${what}: the site is gone, so this check is no longer looking at anything`);
    const window = source.slice(at, at + 700);
    assert.ok(/deliveredAtMs/.test(window), `${what} marks an order delivered without recording when`);
  }
});

check("a repeated 'delivered' does not push the clock forward", () => {
  // A courier that reports delivered on every poll would otherwise keep moving
  // the deadline and the order would never be due.
  const fs = require("fs");
  const path = require("path");
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
  const at = source.indexOf("orderTrackingUpdate.isDelivered = true;");
  const window = source.slice(at, at + 500);
  assert.ok(/isDelivered !== true/.test(window), "the refresh re-stamps an order that was already delivered");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ PII RETENTION GEÇTİ");
})();

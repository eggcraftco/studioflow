// Where a marketplace's data is allowed to go, decided in one place.
//
// An Amazon order lands in the same `siparisler` collection as everything else,
// and the assistant's own query filters on companyId and nothing more. Without
// this layer, connecting Amazon would make Amazon buyer data reachable by an
// OpenAI-hosted assistant, and no line of code would look wrong.
//
// The layer exists before the connector does, deliberately: the Amazon
// connector arrives on top of it rather than beside it.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const outbound = require("../../privacy/outbound");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const order = (provider, extra = {}) => ({
  ...(provider ? { commerce: { provider, externalId: "x1" } } : {}),
  customerName: "Ada Lovelace", shippingName: "Ada Lovelace",
  emailAddress: "ada@example.com", shippingPhone: "+44 7700 900000",
  shippingStreetAddress: "10 Analytical Way", shippingCity: "London",
  shippingPostalCode: "N1 1AA", orderValue: 120, designName: "Signet ring",
  ...extra
});

// ---- the rule that the whole layer exists for --------------------------------

check("Amazon buyer data cannot reach the assistant", () => {
  const verdict = outbound.mayReleasePii(order("amazon"), "assistant");
  assert.strictEqual(verdict.allow, false, "Amazon buyer data would go to an OpenAI-hosted assistant");
  assert.strictEqual(verdict.reason, "denied_by_policy");
});

check("Amazon is denied on every channel, with no exception for fulfilment", () => {
  // Even messaging. A dispatch notice would be defensible in principle, but the
  // first application asks for neither Buyer Communication nor
  // Direct-to-Consumer Shipping, so there is no role under which an Amazon
  // buyer's details should be reaching Twilio or an email provider.
  for (const channel of outbound.OUTBOUND_CHANNELS) {
    const verdict = outbound.mayReleasePii(order("amazon"), channel);
    assert.strictEqual(verdict.allow, false, `${channel} is open`);
    assert.strictEqual(verdict.minimal, false, `${channel} leaks a minimal release`);
  }
});

check("a marketplace nobody has described is denied everywhere", () => {
  // The safe default for somebody else's data is not to move it. A provider
  // added to the connectors without a policy entry must not quietly inherit
  // permission.
  for (const channel of outbound.OUTBOUND_CHANNELS) {
    const verdict = outbound.mayReleasePii(order("some_new_marketplace"), channel);
    assert.strictEqual(verdict.allow, false, `${channel} allowed an undescribed provider`);
    assert.strictEqual(verdict.reason, "provider_policy_undefined");
  }
});

check("the workshop's own customer is not a marketplace's data", () => {
  // The relationship is theirs; nothing about this layer changes what a
  // workshop may do with its own records, or the assistant stops working for
  // every workspace that never connected anything.
  for (const channel of ["assistant", "ai_reply", "messaging", "export"]) {
    const verdict = outbound.mayReleasePii(order(""), channel);
    assert.strictEqual(verdict.allow, true, `${channel} blocked a workshop's own record`);
    assert.strictEqual(verdict.reason, "workspace_own_record");
  }
});

check("a channel nobody has heard of is refused, not assumed", () => {
  assert.strictEqual(outbound.mayReleasePii(order("shopify"), "carrier_pigeon").allow, false);
  assert.strictEqual(outbound.mayReleasePii(order("shopify"), "").reason, "unknown_channel");
});

check("a provider entry that forgets a channel denies it", () => {
  // Adding a channel to OUTBOUND_CHANNELS without adding it to every provider
  // must fail closed rather than open.
  const partial = { ...outbound.PROVIDER_PII_POLICY };
  assert.ok(Object.keys(partial).length > 0);
  for (const [provider, policy] of Object.entries(outbound.PROVIDER_PII_POLICY)) {
    for (const channel of outbound.OUTBOUND_CHANNELS) {
      const stated = policy[channel];
      if (stated === undefined) {
        assert.strictEqual(outbound.mayReleasePii(order(provider), channel).allow, false, `${provider}/${channel}`);
      }
    }
  }
});

// ---- what a block actually does ---------------------------------------------

check("a blocked record loses the person and keeps the work", () => {
  // Refusing the whole record would break the feature. The assistant can still
  // say a workshop has four orders due on Friday — that is the workshop's own
  // fact — without naming a single buyer.
  const { record, removed } = outbound.redactForChannel(order("amazon"), "assistant");
  for (const field of ["customerName", "emailAddress", "shippingPhone", "shippingStreetAddress", "shippingCity", "shippingPostalCode"]) {
    assert.strictEqual(record[field], "", `${field} survived a block`);
    assert.ok(removed.includes(field));
  }
  assert.strictEqual(record.orderValue, 120, "the money went with the person");
  assert.strictEqual(record.designName, "Signet ring", "the work went with the person");
  assert.deepStrictEqual(record.commerce, { provider: "amazon", externalId: "x1" });
});

check("a minimal release keeps only what the channel cannot do without", () => {
  // eBay is the live example of a minimal release: a marketplace whose buyer
  // may still be told their parcel has left, by name and nothing else.
  assert.strictEqual(outbound.PROVIDER_PII_POLICY.ebay.messaging, outbound.MINIMAL);
  const { record } = outbound.redactForChannel(order("ebay"), "messaging");
  assert.strictEqual(record.customerName, "Ada Lovelace", "a parcel notice with no name is not a notice");
  assert.strictEqual(record.emailAddress, "", "the address list travelled to a third party anyway");
  assert.strictEqual(record.shippingStreetAddress, "");
});

check("an allowed release is handed over untouched", () => {
  const { record, removed } = outbound.redactForChannel(order("shopify"), "assistant");
  assert.strictEqual(record.customerName, "Ada Lovelace");
  assert.deepStrictEqual(removed, []);
});

// ---- every outbound path really asks ------------------------------------------

check("the four server paths consult the policy rather than each having their own", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
  const sites = [
    { what: "the assistant", near: 'outbound.redactForChannel(raw, "assistant")' },
    { what: "customer messaging", near: 'mayReleasePii(after, "messaging")' },
    { what: "data export", near: 'redactForChannel(order.data, "export")' }
  ];
  for (const { what, near } of sites) {
    assert.ok(source.includes(near), `${what} does not consult the outbound policy`);
  }
  // And nothing reimplements the decision.
  assert.ok(!/provider === "amazon"/.test(source), "a provider check was hard-coded outside the policy table");
});

check("the assistant's gate sits on the one function every order path goes through", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
  const at = source.indexOf("function nvSafeOrderForChatGPT(");
  const body = source.slice(at, source.indexOf("\n}", at));
  const gate = body.indexOf("redactForChannel");
  const ret = body.indexOf("return {");
  assert.ok(gate > 0 && gate < ret, "the redaction happens after the record is built, or not at all");
});

check("a block is recorded, not silent", () => {
  // A block nobody can see is indistinguishable from a feature that quietly
  // does not work.
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
  assert.ok(source.includes("`blocked:${verdict.reason}"), "the assistant does not record what it refused");
  assert.ok(source.includes("messaging blocked:"), "messaging does not record what it refused");
  assert.ok(source.includes("redacted=${redactedForExport}"), "the export does not record what it redacted");
});

check("every provider the commerce layer knows has a policy, or is denied on purpose", () => {
  // A connector shipped without a policy entry is denied — but silently, which
  // is safe and confusing. This check makes the omission visible here instead.
  const { PROVIDERS } = require("../../commerce/envelope");
  const described = new Set(Object.keys(outbound.PROVIDER_PII_POLICY));
  const missing = [...PROVIDERS].filter((p) => !described.has(p));
  assert.deepStrictEqual(missing, [], `these connectors exist with no outbound policy: ${missing.join(", ")}`);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 240)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ OUTBOUND PII POLICY GEÇTİ");
})();

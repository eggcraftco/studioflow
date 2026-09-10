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

check("no assistant tool returns a buyer's name without asking the policy", () => {
  // The check that was missing, and its absence let three live tools ship.
  // nvSafeOrderForChatGPT gated the two tools that return an ORDER, and that
  // looked like the whole story — but get_dashboard_summary,
  // get_financial_overview, get_extra_spending_overview and
  // get_order_financials build their own summaries, and every one of them
  // carried customerName straight out of the document.
  //
  // Naming those four would only pin those four. This follows the data
  // instead: a function that emits a personal field is acceptable only if the
  // policy runs somewhere on every path that reaches it.
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
  const PII = /(customerName|emailAddress|shippingPhone|shippingStreetAddress|whatsappNumber|instagramUsername)\s*:/;
  const GATE = /redactForChannel|nvChatGPTLoadWorkspaceOrders|nvSafeOrderForChatGPT/;

  const fns = new Map();
  for (const m of source.matchAll(/\n(?:async )?function (nvChatGPT[A-Za-z0-9_]+)\s*\(([\s\S]*?)\n\}/g)) {
    fns.set(m[1], m[2]);
  }
  assert.ok(fns.size > 10, `only found ${fns.size} assistant functions — has the naming changed?`);

  // A function is safe if the policy runs inside it, or if it is only ever
  // called by safe functions. Iterated to a fixed point, so a pure shaper three
  // calls below a gated loader is safe and an orphan is not.
  const safe = new Set([...fns].filter(([, body]) => GATE.test(body)).map(([name]) => name));
  const callersOf = (name) => [...fns].filter(([other, body]) =>
    other !== name && new RegExp(`\\b${name}\\s*\\(`).test(body)).map(([other]) => other);

  for (let pass = 0; pass < fns.size; pass += 1) {
    let grew = false;
    for (const [name] of fns) {
      if (safe.has(name)) continue;
      const callers = callersOf(name);
      if (callers.length && callers.every((c) => safe.has(c))) { safe.add(name); grew = true; }
    }
    if (!grew) break;
  }

  const leaking = [...fns]
    .filter(([name, body]) => PII.test(body) && !safe.has(name))
    .map(([name]) => name);
  assert.ok([...fns].some(([, body]) => PII.test(body)),
    "no assistant function emits a personal field — check this test, not the code");
  assert.deepStrictEqual(leaking, [],
    "these assistant functions put a buyer's name in front of ChatGPT with no path through the outbound " +
    `policy: ${leaking.join(", ")}. Gate them, or feed them from nvChatGPTLoadWorkspaceOrders.`);
});

check("a tool that asks the policy then ignores the answer is not gated", () => {
  // Mentioning redactForChannel is not the same as using what it returned.
  // get_order_financials calls the policy to record the access and could still
  // hand the RAW document to the shaper that emits customerName — a hole the
  // reachability check above cannot see, because the policy really is called.
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
  const start = source.indexOf("async function nvChatGPTGetOrderFinancials(");
  assert.ok(start > 0, "get_order_financials is gone");
  const body = source.slice(start, source.indexOf("\nfunction nvChatGPTDashboardBuckets(", start));
  const redacted = body.match(/const \{ record: (\w+)[^}]*\} = \w+\.redactForChannel\(/);
  assert.ok(redacted, "get_order_financials no longer redacts its document");
  const safeName = redacted[1];
  for (const shaper of ["nvChatGPTOrderFinancialsFromData", "nvChatGPTBasicOrderFinancialsFromData"]) {
    const call = body.match(new RegExp(`${shaper}\\(\\s*(\\w+)`));
    assert.ok(call, `${shaper} is no longer called here`);
    assert.strictEqual(call[1], safeName,
      `${shaper} is given "${call[1]}" — the raw document — while the redacted copy sits unused in "${safeName}"`);
  }
});

check("the loader every overview tool reads through is the gate", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
  const loader = source.slice(
    source.indexOf("async function nvChatGPTLoadWorkspaceOrders("),
    source.indexOf("async function nvChatGPTGetDashboardSummary(")
  );
  assert.ok(/redactForChannel\(doc\.data\(\) \|\| \{\}, "assistant"\)/.test(loader),
    "the shared assistant loader hands out raw documents again");
  assert.ok(!/\.\.\.\(doc\.data\(\) \|\| \{\}\)/.test(loader),
    "the loader spreads the raw document beside the redacted one");
});

check("a marketplace read is auditable even when it is allowed", () => {
  // Logging every allow would be an audit trail nobody reads. Logging none of
  // them would make an opened channel the one access nobody can show. The rule
  // is: blocks and minimal releases always, plus any decision about a provider
  // whose buyer belongs to somebody else.
  const deny = outbound.mayReleasePii(order("amazon"), "assistant");
  assert.strictEqual(outbound.decisionNeedsAudit(deny), true);
  const minimal = outbound.mayReleasePii(order("ebay"), "messaging");
  assert.strictEqual(minimal.minimal, true);
  assert.strictEqual(outbound.decisionNeedsAudit(minimal), true);
  // A shop the workshop runs itself, and a workshop's own record: not audited.
  assert.strictEqual(outbound.decisionNeedsAudit(outbound.mayReleasePii(order("shopify"), "assistant")), false);
  assert.strictEqual(outbound.decisionNeedsAudit(outbound.mayReleasePii(order(""), "assistant")), false);
  // The case the rule exists for: if Amazon messaging is ever opened, that
  // release must still be recorded.
  assert.strictEqual(
    outbound.decisionNeedsAudit({ allow: true, minimal: false, provider: "amazon", channel: "messaging", reason: "allowed_by_policy" }),
    true,
    "an allow granted to Amazon later would go unrecorded"
  );
  assert.strictEqual(outbound.PROVIDER_PII_POLICY.amazon.restricted, true);
  assert.strictEqual(outbound.PROVIDER_PII_POLICY.ebay.restricted, true);
});

check("a workshop's own lead-source label is not mistaken for a marketplace", () => {
  // providerOf falls back to customFields.Source for orders written before the
  // commerce stamp existed. That field is one a workshop creates and types
  // into, and honouring whatever it said blanked a workshop's OWN customers
  // from exports, the assistant, quick replies and dispatch messages the
  // moment somebody used a custom field called "Source" to record where a
  // commission came from.
  for (const label of ["Instagram", "Word of mouth", "Craft fair", "Referral"]) {
    const verdict = outbound.mayReleasePii(order("", { customFields: { Source: label } }), "export");
    assert.strictEqual(verdict.allow, true, `a workshop's own customer was blocked by Source="${label}"`);
    assert.strictEqual(verdict.reason, "workspace_own_record");
  }
  // A legacy stamp that DOES name a marketplace still counts.
  assert.strictEqual(outbound.mayReleasePii(order("", { customFields: { Source: "Amazon" } }), "export").allow, false);
  assert.strictEqual(outbound.mayReleasePii(order("", { customFields: { Source: "Etsy" } }), "export").allow, true);
  // And a provider the SERVER stamped is still taken at face value, so an
  // undescribed one fails closed.
  assert.strictEqual(outbound.mayReleasePii(order("brand_new_marketplace"), "export").reason, "provider_policy_undefined");
});

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

// ---- the same rule on the orchestrator's read capabilities ------------------

/** A Firestore handle that serves seeded rows and holds nothing else. */
function seededDb(seed = {}) {
  const query = (path) => ({
    where: () => query(path),
    orderBy: () => query(path),
    limit: () => query(path),
    get: async () => {
      const docs = (seed[path] || []).map((data, index) => ({ id: String(data.id || `d${index}`), data: () => data }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    }
  });
  const doc = (path) => ({
    collection: (name) => collection(`${path}/${name}`),
    get: async () => ({ exists: Boolean(seed[path]), data: () => seed[path] || {} })
  });
  const collection = (path) => ({ ...query(path), doc: (id) => doc(`${path}/${id}`) });
  return () => ({ collection: (name) => collection(name) });
}

check("a block made by an orchestrator capability is recorded too", async () => {
  // loaders.projectOrderForAssistant applies the same redactForChannel the live
  // path applies and dropped the audit half — correctly, since the module is
  // pure — while nothing else on that path wrote it. So once an Amazon or eBay
  // connector lands, a block made by one of the orchestrator read capabilities would
  // have left no trace at all, and the same block made by search_orders would
  // have left one.
  const { createOrchestrator } = require("../../orchestrator");
  const fixtures = require("../fixtures/orchestrator");
  const filed = [];
  const orchestrator = createOrchestrator({
    db: seededDb({
      siparisler: [
        { id: "o_amz1", companyId: "co_1", ...order("amazon"), createdAt: "2026-09-01" },
        { id: "o_amz2", companyId: "co_1", ...order("amazon"), createdAt: "2026-09-02" },
        { id: "o_own", companyId: "co_1", ...order(""), createdAt: "2026-09-03" }
      ]
    }),
    now: () => fixtures.NOW,
    flags: { orchestrator: true },
    recordPiiBlock: async (entry) => { filed.push(entry); }
  });
  const ctx = fixtures.ownerContext({ companyId: "co_1" });
  await orchestrator.run({ capability: "search_commerce_orders", args: {}, ctx });

  assert.strictEqual(filed.length, 1, "one row per provider and reason: not one per order, and not none");
  const row = filed[0];
  assert.strictEqual(row.subject.provider, "amazon");
  assert.strictEqual(row.recordCount, 2, "two blocked orders are not the same event as one");
  assert.ok(/^blocked:denied_by_policy capability=search_commerce_orders/.test(row.note), row.note);
  assert.strictEqual(row.actorRole, "chatgpt_connection");
  // The log must not become a copy of the data it is logging.
  const serialised = JSON.stringify(row);
  for (const value of ["Ada Lovelace", "ada@example.com", "7700 900000", "Analytical Way"]) {
    assert.ok(!serialised.includes(value), `the block row copied ${value}`);
  }
  // And it survives the access log's own rules rather than being dropped.
  const accessLog = require("../../privacy/accessLog");
  assert.strictEqual(accessLog.worthLogging(accessLog.accessEntry({ ...row, atMs: Date.now() })), true);

  // A workspace with nothing but its own customers files nothing at all.
  const quiet = [];
  const clean = createOrchestrator({
    db: seededDb({ siparisler: [{ id: "o_own", companyId: "co_1", ...order(""), createdAt: "2026-09-03" }] }),
    now: () => fixtures.NOW,
    flags: { orchestrator: true },
    recordPiiBlock: async (entry) => { quiet.push(entry); }
  });
  await clean.run({ capability: "search_commerce_orders", args: {}, ctx });
  assert.deepStrictEqual(quiet, [], "a workshop's own customer is not a marketplace decision");
});

check("the deployment actually injects the block recorder", () => {
  // orchestrator/index.js's PII hook was dead on this surface for exactly this
  // reason: a sink nobody injects is a control that quietly does not work.
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
  assert.ok(/createOrchestrator\(\{[\s\S]{0,600}recordPiiBlock:/.test(source),
    "the MCP orchestrator is built without recordPiiBlock, so its marketplace blocks go unrecorded");
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

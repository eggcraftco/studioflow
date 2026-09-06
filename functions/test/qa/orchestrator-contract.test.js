// The reuse contract: what a second channel is promised, and what it may not have.
//
// The WhatsApp gateway (WA spec §7) is a function nobody has written yet. It
// will be written against docs/orchestrator-contract.md, so the risk this file
// exists for is not a broken capability — the other orchestrator tests cover
// those — it is a promise going stale: a signature that changed, a projection
// that quietly stopped narrowing, a state the document never learned about, or
// a reserved interface that got implemented while the page still calls it
// reserved. A contract nobody checks is a comment.
//
// It asserts the CONTRACT, not the implementation: the rules come from the
// document and from the WhatsApp spec, never from re-running the code's own
// arithmetic beside it.
//
// Run: node test/qa/orchestrator-contract.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const registry = require("../../orchestrator/registry");
const contextModule = require("../../orchestrator/context");
const envelope = require("../../orchestrator/envelope");
const render = require("../../orchestrator/render");
const loaders = require("../../orchestrator/loaders");
const { createOrchestrator, CAPABILITY_NAMES, HANDLERS } = require("../../orchestrator");
const accessLog = require("../../privacy/accessLog");
const fixtures = require("../fixtures/orchestrator");

const DOC = fs.readFileSync(path.join(__dirname, "..", "..", "..", "docs", "orchestrator-contract.md"), "utf8");
const ALL_FLAGS = { emailReceipts: true, inventory: true, orchestrator: true };

let failures = 0;
const check = (name, run) => {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
};
const asyncChecks = [];
const checkAsync = (name, run) => { asyncChecks.push([name, run]); };

/** An instance whose reads come from a fixture, the way a gateway's would from Firestore. */
function orchestratorOver(snapshot, extra = {}) {
  return createOrchestrator({
    flags: { orchestrator: true, inventory: true },
    now: () => snapshot.nowMs,
    loaders: {
      loadCompany: async () => ({ companyData: { ownerUid: "u_owner" }, settings: fixtures.settings }),
      snapshotFor: async () => snapshot
    },
    ...extra
  });
}

const waContext = (overrides = {}) => fixtures.ownerContext({
  channel: { type: "whatsapp", bindingId: "cb_1", isGroup: false, profile: null },
  ...overrides
});

/* -------------------------------------------------------------- *
 * 1. One table, two projections (WA §81)
 * -------------------------------------------------------------- */

check("with no channel profile the projection is the one tools/list serves", () => {
  // MCP has no second policy layer: consent screen plus workspace role IS its
  // policy. If this ever narrows, the deployed listing silently loses a tool.
  const names = registry.publishedForChannel({ flags: ALL_FLAGS }).map((entry) => entry.name);
  assert.deepStrictEqual(names, registry.publishedNames(ALL_FLAGS));
});

check("a read-only binding gets every read and not one write", () => {
  const profile = { capabilities: ["read"], security: { assurance_level: 1 } };
  const names = registry.publishedForChannel({ flags: ALL_FLAGS, channelProfile: profile }).map((e) => e.name);
  for (const write of ["create_order", "update_order_status", "add_order_note", "create_note", "append_note",
    "update_note", "pin_note", "archive_note", "attach_bank_receipt", "create_inventory_item"]) {
    assert(!names.includes(write), `${write} reached a read-only binding`);
  }
  for (const read of ["search_orders", "get_order_detail", "get_financial_overview", ...CAPABILITY_NAMES]) {
    assert(names.includes(read), `${read} is a read and should be callable from a read-only binding`);
  }
});

check("every permission.area a row names is an area a context can actually hold", () => {
  // `assertCapability` does `if (permission.area && !ctx.areas[permission.area])`,
  // so an area `resolveContext` does not build reads `undefined` and refuses
  // UNCONDITIONALLY, the owner included. Ten rows named one that was not there:
  // seven notes tools on `area: "notes"` and the three finance tools on
  // `area: "financialInfo"`, against an `areas` object with four keys.
  //
  // It failed closed, and it was harmless only by accident — none of the ten has
  // a HANDLERS entry, so the gate is never reached for them today. This table
  // exists so a second channel can route the SAME rows through the SAME gate,
  // and the first time the WhatsApp gateway does, every notes tool is denied to
  // everyone with "Your workspace access does not include notes."
  const declared = [...new Set(registry.TOOL_REGISTRY
    .map((entry) => (entry.permission || {}).area)
    .filter((area) => typeof area === "string" && area.length > 0))].sort();
  assert.ok(declared.length > 0, "no row names an area — this check has stopped testing anything");
  for (const area of declared) {
    assert.ok(contextModule.AREA_KEYS.includes(area),
      `a registry row asks for the "${area}" area, which context.AREA_KEYS does not build — assertCapability would refuse every caller`);
  }

  // And a context really carries them, key for key — a constant list nothing
  // reads would satisfy the loop above. `resolveContext` building them out of
  // the app's own predicate is pinned in orchestrator-context.test.js; this is
  // the fixture every other test in this suite is written against.
  const owner = fixtures.ownerContext();
  assert.deepStrictEqual(Object.keys(owner.areas).sort(), [...contextModule.AREA_KEYS].sort(),
    "the context's areas and the areas a row may name are two different lists again");
  // The key is load-bearing rather than merely present: the row passes when the
  // area is held and is refused BY NAME when it is not.
  const notesRow = registry.TOOL_REGISTRY.find((entry) => (entry.permission || {}).area === "notes");
  assert.ok(notesRow, "no row carries the notes area any more");
  assert.doesNotThrow(() => contextModule.assertCapability(owner, notesRow));
  const withheld = fixtures.ownerContext({ isOwner: false, areas: { ...owner.areas, notes: false } });
  assert.throws(() => contextModule.assertCapability(withheld, notesRow), /does not include notes/);
});

check("assurance gates a tool even when the binding allows its kind (WA §15)", () => {
  const everyKind = registry.CAPABILITY_KINDS;
  const atLevel = (level) => registry
    .publishedForChannel({ flags: ALL_FLAGS, channelProfile: { capabilities: everyKind, security: { assurance_level: level } } })
    .map((entry) => entry.name);

  const level1 = atLevel(1);
  for (const consequential of ["attach_bank_receipt", "create_inventory_item", "create_order", "update_order_status"]) {
    assert(!level1.includes(consequential), `${consequential} is callable at assurance 1`);
  }
  const level2 = atLevel(2);
  assert(level2.includes("attach_bank_receipt"), "a level-2 binding may attach a receipt");
  assert(!level2.includes("update_order_status"), "a status change needs level 3: it can reach the customer");
  assert(atLevel(3).includes("update_order_status"), "a level-3 binding may change a status");
});

check("a tool that can put a message in a customer's inbox needs external_write", () => {
  // The kind comes from the same fact as the openWorldHint, so the channel
  // policy and the reviewer's annotation cannot disagree about one tool.
  const profile = { capabilities: ["read", "internal_write", "file_upload"], security: { assurance_level: 3 } };
  const names = registry.publishedForChannel({ flags: ALL_FLAGS, channelProfile: profile }).map((e) => e.name);
  assert(!names.includes("create_order"), "create_order can e-mail the buyer; it is an external write");
  assert(!names.includes("update_order_status"), "a status change can e-mail the buyer; it is an external write");
  assert(names.includes("attach_bank_receipt"), "attaching a receipt changes nothing outside the workspace");
  assert(names.includes("add_order_note"), "a note is an internal write");

  for (const name of ["create_order", "update_order_status"]) {
    assert(registry.kindsFor(registry.entryFor(name)).includes("external_write"));
    assert.strictEqual(registry.annotationsFor(name, ALL_FLAGS).openWorldHint, true,
      "the same fact must show up as openWorldHint on the wire");
  }
});

check("a tool that takes a document off the caller needs file_upload", () => {
  const noFiles = { capabilities: ["read", "internal_write", "external_write"], security: { assurance_level: 3 } };
  const names = registry.publishedForChannel({ flags: ALL_FLAGS, channelProfile: noFiles }).map((e) => e.name);
  assert(!names.includes("attach_bank_receipt"), "a binding with files switched off cannot upload a receipt");
  assert(!names.includes("create_inventory_item"), "nor a photo of an item");
  assert(names.includes("create_order"), "the rest of its allowance is untouched");
});

check("an incomplete binding profile fails closed, never open", () => {
  const readNames = registry
    .publishedForChannel({ flags: ALL_FLAGS, channelProfile: { capabilities: ["read"], security: { assurance_level: 1 } } })
    .map((entry) => entry.name);

  const noCapabilities = registry.publishedForChannel({ flags: ALL_FLAGS, channelProfile: { security: { assurance_level: 3 } } });
  assert.deepStrictEqual(noCapabilities.map((e) => e.name), readNames, "a profile that names no capability gets reads only");

  const noAssurance = registry.publishedForChannel({ flags: ALL_FLAGS, channelProfile: { capabilities: registry.CAPABILITY_KINDS } });
  const atLevelOne = registry.publishedForChannel({
    flags: ALL_FLAGS,
    channelProfile: { capabilities: registry.CAPABILITY_KINDS, security: { assurance_level: 1 } }
  });
  assert.deepStrictEqual(noAssurance.map((e) => e.name), atLevelOne.map((e) => e.name),
    "a profile with no assurance level must be treated as level 1, the lowest a live binding can be");
  assert(!noAssurance.some((entry) => entry.minAssurance > 1), "it was treated as something higher");

  const typo = registry.publishedForChannel({ flags: ALL_FLAGS, channelProfile: { capabilities: ["read", "internalwrite"], security: { assurance_level: 3 } } });
  assert.deepStrictEqual(typo.map((e) => e.name), readNames, "an unknown capability name is dropped, not honoured");

  const nothing = registry.publishedForChannel({ flags: ALL_FLAGS, channelProfile: { capabilities: [], security: { assurance_level: 3 } } });
  assert.deepStrictEqual(nothing, [], "a binding that allows nothing may call nothing");
});

check("the binding's aliases from the WhatsApp binding model are read too", () => {
  // WA §11 stores allowedCapabilities[] and securityLevel on the binding; a
  // gateway that hands the binding straight over must not accidentally get the
  // fail-closed default.
  const names = registry
    .publishedForChannel({ flags: ALL_FLAGS, channelProfile: { allowedCapabilities: ["read", "internal_write"], securityLevel: 2 } })
    .map((entry) => entry.name);
  assert(names.includes("add_order_note"), "allowedCapabilities is the binding's own spelling of capabilities");
  assert(!names.includes("update_order_status"), "securityLevel 2 is below a status change's assurance");
});

check("the flags still come first: a channel cannot reach an unpublished tool", () => {
  const wideOpen = { capabilities: registry.CAPABILITY_KINDS, security: { assurance_level: 3 } };
  const names = registry.publishedForChannel({ flags: {}, channelProfile: wideOpen }).map((entry) => entry.name);
  for (const flagged of [...CAPABILITY_NAMES, "search_inventory", "create_inventory_item"]) {
    assert(!names.includes(flagged), `${flagged} is behind a flag that is off`);
  }
});

/* -------------------------------------------------------------- *
 * 2. What run() serves today
 * -------------------------------------------------------------- */

check("every capability run() serves is a read, at the lowest assurance", () => {
  // The promise the WhatsApp read beta is built on (WA §75 W2): a level-1,
  // read-only binding can answer every question the orchestrator can answer.
  for (const name of CAPABILITY_NAMES) {
    const entry = registry.entryFor(name);
    assert(entry, `${name} has no registry entry`);
    assert.strictEqual(entry.permission.write, false, `${name} writes`);
    assert.deepStrictEqual(entry.effects, [], `${name} reaches outside NivaDesk`);
    assert.strictEqual(entry.annotations.readOnlyHint, true, `${name} is not annotated read-only`);
    assert.strictEqual(entry.minAssurance, 1, `${name} needs more than a linked binding`);
    assert.deepStrictEqual(registry.kindsFor(entry), ["read"], `${name} needs more than read`);
  }
});

check("listCapabilities is the flag projection for MCP and the binding projection for a channel", () => {
  const instance = orchestratorOver(fixtures.mixedSnapshot());
  assert.deepStrictEqual(instance.listCapabilities(), CAPABILITY_NAMES.slice(), "MCP gets what tools/list serves");
  assert.deepStrictEqual(
    instance.listCapabilities({ channelProfile: { capabilities: ["read"], security: { assurance_level: 1 } } }),
    CAPABILITY_NAMES.slice(),
    "a read-only binding gets all ten"
  );
  assert.deepStrictEqual(
    instance.listCapabilities({ channelProfile: { capabilities: [], security: { assurance_level: 3 } } }),
    [],
    "a binding that allows nothing gets nothing, whatever its assurance"
  );
});

/* -------------------------------------------------------------- *
 * 3. Same handler, same semantics (WA §69–§70)
 * -------------------------------------------------------------- */

checkAsync("two channels get the same figures, and only the presentation differs", async () => {
  const snapshot = fixtures.mixedSnapshot();
  const instance = orchestratorOver(snapshot);
  const args = { fromDate: "2026-09-01", toDate: "2026-09-30" };

  const fromMcp = await instance.run({ capability: "get_commerce_overview", args, ctx: fixtures.ownerContext() });
  const fromWhatsApp = await instance.run({ capability: "get_commerce_overview", args, ctx: waContext() });

  assert.deepStrictEqual(fromWhatsApp.data, fromMcp.data, "the money differs between channels");
  assert.deepStrictEqual(fromWhatsApp.warnings, fromMcp.warnings, "one channel is told less than the other");
  assert.strictEqual(fromWhatsApp.partial, fromMcp.partial);
  assert.deepStrictEqual(
    fromWhatsApp.summary.lines.map((row) => row.text),
    fromMcp.summary.lines.map((row) => row.text),
    "the sentences differ, so the two channels are answering differently"
  );

  const compact = render.toText(fromWhatsApp.summary.lines, { style: "compact" });
  const chat = render.toText(fromMcp.summary.lines, { style: "chat" });
  assert(/^1\. /.test(compact), "WhatsApp gets the numbered list of WA §38");
  assert(!/^1\. /.test(chat), "ChatGPT does not");
});

checkAsync("a group thread sees the answer without the person and without the money", async () => {
  const snapshot = fixtures.mixedSnapshot();
  const instance = orchestratorOver(snapshot);
  const group = waContext({
    channel: {
      type: "whatsapp", bindingId: "cb_1", isGroup: true,
      profile: { capabilities: ["read"], security: { assurance_level: 1, pii_level: "none", financial_data_allowed: false } }
    }
  });
  const result = await instance.run({ capability: "get_commerce_overview", args: {}, ctx: group });
  assert.strictEqual(result.data.sales.restricted, true, "a shared thread was shown the takings");
  assert.strictEqual(result.data.sales.reason, "channel_financial_policy");
});

/** Any amount written the way a person writes one. */
const MONEY_IN = (text) => /(?:[£$€¥₺]\s?\d)|(?:\d[\d,]*(?:\.\d+)?\s?(?:GBP|USD|EUR|TRY))/i.test(text);

const groupContext = () => waContext({
  channel: {
    type: "whatsapp", bindingId: "cb_1", isGroup: true,
    profile: { capabilities: ["read"], security: { assurance_level: 1, pii_level: "none", financial_data_allowed: false } }
  }
});

checkAsync("a group thread gets no money in a SENTENCE either, and keeps the counts it may see", async () => {
  // §6.4 promises the money is gone "whatever the capability wrote". A rule
  // that only replaces fields called `totals` or `sales` misses the detector
  // that formatted the same figure into free text — "420 GBP still
  // outstanding" — and the entityRef whose label is a counterparty's name.
  const snapshot = fixtures.attentionSnapshot();
  const instance = orchestratorOver(snapshot);
  const result = await instance.run({ capability: "get_business_attention_summary", args: {}, ctx: groupContext() });

  const everything = JSON.stringify({ data: result.data, entityRefs: result.entityRefs, summary: result.summary });
  assert.ok(!MONEY_IN(everything), `an amount reached a shared thread: ${everything.slice(0, 300)}`);

  const late = result.data.items.find((item) => item.reasons.includes("payment_outstanding"));
  assert.ok(late, "the finding itself must survive: the thread is told to look, not told how much");
  assert.ok(/withheld/.test(late.reason), `the sentence must say the figure was withheld, got: ${late.reason}`);

  // The other direction: a shared thread may see how MANY, and losing that
  // would be the redaction destroying what it is allowed to show.
  const counted = result.data.items.find((item) => item.facts.some((fact) => fact.key === "count"));
  assert.ok(counted, "no grouped item survived at all");
  assert.strictEqual(typeof counted.facts.find((fact) => fact.key === "count").value, "number",
    "the count was redacted because its field is called `value`");
  const amountFact = result.data.items.flatMap((item) => item.facts).find((fact) => fact.key === "amount");
  if (amountFact) assert.strictEqual(amountFact.value.restricted, true, "an amount fact survived as a number");
});

checkAsync("a group thread is told which bank row, never who was paid", async () => {
  const snapshot = fixtures.attentionSnapshot();
  snapshot.bankRows = [
    { id: "t_1", amount: -400, currency: "GBP", bookingDate: "2026-06-01", counterparty: "Margaret Ellison", description: "STANDING ORDER", hasReceipt: true, category: "Rent" },
    { id: "t_2", amount: -400, currency: "GBP", bookingDate: "2026-07-01", counterparty: "Margaret Ellison", description: "STANDING ORDER", hasReceipt: true, category: "Rent" },
    { id: "t_3", amount: -400, currency: "GBP", bookingDate: "2026-08-01", counterparty: "Margaret Ellison", description: "STANDING ORDER", hasReceipt: true, category: "Rent" },
    { id: "t_4", amount: -450, currency: "GBP", bookingDate: "2026-09-01", counterparty: "Margaret Ellison", description: "STANDING ORDER", hasReceipt: true, category: "Rent" }
  ];
  const instance = orchestratorOver(snapshot);
  const result = await instance.run({ capability: "get_banking_attention_summary", args: {}, ctx: groupContext() });
  const everything = JSON.stringify({ data: result.data, entityRefs: result.entityRefs });
  assert.ok(!everything.includes("Margaret Ellison"), "a counterparty's name reached a shared thread");
  const ref = result.data.items.flatMap((item) => item.entityRefs).find((row) => row.id === "t_4");
  assert.ok(ref, "the row itself must still be identified");
  assert.strictEqual(ref.labelRestricted, true, "the label has to say it was withheld, not merely be empty");
});

checkAsync("a one-to-one thread that allows both still gets both", async () => {
  const snapshot = fixtures.attentionSnapshot();
  const instance = orchestratorOver(snapshot);
  const result = await instance.run({ capability: "get_business_attention_summary", args: {}, ctx: waContext() });
  const late = result.data.items.find((item) => item.reasons.includes("payment_outstanding"));
  assert.ok(MONEY_IN(late.reason), "the redaction is following the channel, not the capability");
});

checkAsync("an unknown capability and a capability behind an off flag are both refused, by code", async () => {
  const snapshot = fixtures.mixedSnapshot();
  const instance = orchestratorOver(snapshot);
  await assert.rejects(
    () => instance.run({ capability: "send_customer_whatsapp", args: {}, ctx: waContext() }),
    (error) => error.name === "OrchestratorError" && error.code === "invalid-argument",
    "a channel that invents a tool name must get a refusal it can map"
  );

  const off = createOrchestrator({
    flags: {},
    now: () => snapshot.nowMs,
    loaders: { loadCompany: async () => ({ companyData: {}, settings: {} }), snapshotFor: async () => snapshot }
  });
  await assert.rejects(
    () => off.run({ capability: "get_commerce_overview", args: {}, ctx: waContext() }),
    (error) => error.code === "failed-precondition"
  );
});

/* -------------------------------------------------------------- *
 * 4. The hooks a channel has to bring with it
 * -------------------------------------------------------------- */

checkAsync("the audit record and the PII row carry the channel that asked", async () => {
  const snapshot = fixtures.mixedSnapshot();
  const audits = [];
  const piiRows = [];
  const instance = orchestratorOver(snapshot, {
    audit: async (row) => { audits.push(row); },
    recordPiiAccess: async (row) => { piiRows.push(row); }
  });

  await instance.run({ capability: "search_commerce_orders", args: {}, ctx: waContext(), request: { requestId: "wa_1" } });

  assert.strictEqual(audits.length, 1, "one run, one audit record");
  assert.strictEqual(audits[0].channelType, "whatsapp");
  assert.strictEqual(audits[0].capability, "search_commerce_orders");
  assert.strictEqual(audits[0].requestId, "wa_1");
  assert.strictEqual(audits[0].resultState, "completed");

  assert.strictEqual(piiRows.length, 1, "a search that names buyers is an access to log");
  assert.strictEqual(piiRows[0].source, "whatsapp", "the row must say which channel saw the customer");
  assert.deepStrictEqual(piiRows[0].categories, registry.entryFor("search_commerce_orders").pii);

  // The row AS WRITTEN, not as handed over. `accessLog.accessEntry` normalises
  // `source` against ACCESS_SOURCES, which has no `whatsapp`, so asserting the
  // pre-normalisation value passed over a row that lands as "unknown". The
  // channel has to survive somewhere, and the note is where.
  const written = accessLog.accessEntry(piiRows[0]);
  assert.strictEqual(written.source, "unknown",
    "whatsapp is in ACCESS_SOURCES now: say so in the contract §5.4 and §9 and drop this assertion");
  assert.ok(/channel=whatsapp/.test(written.note), `the channel is not recoverable from the row: ${written.note}`);
  // A read of a SET says so, the way the MCP dispatcher's row does.
  assert.ok(/subject=set/.test(written.note), `a set read must say it read a set: ${written.note}`);
  assert.strictEqual(written.actorRole, "whatsapp_binding",
    "a WhatsApp read filed a row saying a ChatGPT connection made it");
  // And the count is not a measurement: the row is written before dispatch.
  assert.strictEqual(written.recordCount, 1);
});

checkAsync("both channels decide 'does this read log?' from the same registry field", async () => {
  // docs/orchestrator-contract.md §5.4: "the registry is the only list, so a
  // channel cannot describe a read differently from the way the MCP dispatcher
  // describes it." `run()` keyed on `entry.pii.length > 0` while the dispatcher
  // keyed on `piiAccessLogged` — two predicates over one table, agreeing on the
  // ten orchestrator entries and disagreeing on the two bank tools.
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "orchestrator", "index.js"), "utf8");
  assert.ok(/entry\.piiAccessLogged === true && typeof deps\.recordPiiAccess/.test(source),
    "run() no longer keys its PII row on the registry's piiAccessLogged");

  // And a capability that declares a category without declaring the row files
  // nothing — proved, not assumed, by running one.
  const snapshot = fixtures.mixedSnapshot();
  const rows = [];
  const instance = orchestratorOver(snapshot, { recordPiiAccess: async (row) => { rows.push(row); } });
  const quiet = registry.publishedNames({ orchestrator: true })
    .filter((name) => CAPABILITY_NAMES.includes(name))
    .filter((name) => registry.entryFor(name).piiAccessLogged !== true);
  for (const name of quiet) {
    assert.deepStrictEqual(registry.entryFor(name).pii, [],
      `${name} declares pii categories and no access-log row: the two predicates disagree again`);
  }
  await instance.run({ capability: "get_commerce_overview", args: {}, ctx: waContext() });
  assert.deepStrictEqual(rows, []);
});

checkAsync("a capability that names nobody files no PII row", async () => {
  const snapshot = fixtures.mixedSnapshot();
  const piiRows = [];
  const instance = orchestratorOver(snapshot, { recordPiiAccess: async (row) => { piiRows.push(row); } });
  await instance.run({ capability: "get_commerce_overview", args: {}, ctx: waContext() });
  assert.deepStrictEqual(piiRows, [], "a totals answer logged an access to a person");
});

checkAsync("a channel that injects no hooks still gets an answer (this is MCP)", async () => {
  // MCP does not inject recordPiiAccess: its dispatcher already writes exactly
  // one row per call, and two rows for one read is a worse audit than none.
  const snapshot = fixtures.mixedSnapshot();
  const instance = orchestratorOver(snapshot);
  const result = await instance.run({ capability: "search_commerce_orders", args: {}, ctx: fixtures.ownerContext() });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.action, "search_commerce_orders");
});

/* -------------------------------------------------------------- *
 * 5. The document is part of the contract
 * -------------------------------------------------------------- */

check("every function the document tells a channel to call exists", () => {
  const surface = [
    ["orchestrator/index", require("../../orchestrator"), ["createOrchestrator"]],
    ["registry", registry, ["flagsFromEnv", "normalizeFlags", "publishedEntries", "publishedNames",
      "publishedForChannel", "kindsFor", "entryFor", "annotationsFor", "justificationFor", "scopesFor",
      "effectsFor", "correctionsPending"]],
    ["context", contextModule, ["resolveContext", "assertCapability", "sectionAccess"]],
    ["envelope", envelope, ["finish", "warning", "entityRef", "applyChannelProfile"]],
    ["render", render, ["summaryFor", "toText"]],
    ["loaders", loaders, ["createLoaders", "projectOrderForAssistant"]]
  ];
  for (const [label, module, names] of surface) {
    for (const name of names) {
      assert.strictEqual(typeof module[name], "function", `${label}.${name} is not a function`);
      assert(DOC.includes(name), `docs/orchestrator-contract.md never mentions ${label}.${name}`);
    }
  }
  const instance = orchestratorOver(fixtures.mixedSnapshot());
  for (const name of ["resolveContext", "listCapabilities", "run"]) {
    assert.strictEqual(typeof instance[name], "function", `the instance has no ${name}`);
  }
  assert(typeof contextModule.OrchestratorError === "function" && DOC.includes("OrchestratorError"));
});

check("every capability that pages says so — four out of four, not whichever author remembered", () => {
  // §6.3 defines `result_truncated` as "the caller asked for a page and got
  // one". Two capabilities raised it and two did not: both attention summaries
  // did `items.slice(0, limit)` and returned the page in silence. `totalItems`
  // sat beside the list, so nothing was fabricated — but a warning code that
  // only some of its cases raise means "whichever author remembered", which is
  // the shape the code was introduced to remove.
  //
  // Derived from the source rather than from a list here: a capability that
  // reads `args.limit` pages, and every one of them must reach
  // `envelope.pageWarning`. A fifth paging capability fails this without anyone
  // adding a row.
  const ORCH_DIR = path.join(__dirname, "..", "..", "orchestrator");
  let pagingSites = 0;
  for (const file of fs.readdirSync(ORCH_DIR).filter((name) => name.endsWith(".js"))) {
    if (["envelope.js", "index.js"].includes(file)) continue;
    const source = fs.readFileSync(path.join(ORCH_DIR, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const reads = (source.match(/Number\(args\.limit\)/g) || []).length;
    const says = (source.match(/envelope\.pageWarning\(/g) || []).length;
    assert.strictEqual(says, reads,
      `orchestrator/${file}: ${reads} capabilit(ies) take a limit and ${says} raise result_truncated`);
    pagingSites += reads;
  }
  assert.strictEqual(pagingSites, 4, `expected four paging capabilities, found ${pagingSites}`);

  // And behaviourally, over real snapshots, with a page of one out of many.
  const inventoryShelf = {
    companyId: "co_1", nowMs: fixtures.NOW, settings: fixtures.settings,
    inventoryItems: [
      { id: "a", name: "A", trackingType: "quantity", status: "available", quantity: { onHand: 5, reserved: 0 } },
      { id: "b", name: "B", trackingType: "quantity", status: "available", quantity: { onHand: 5, reserved: 0 } }
    ]
  };
  const cases = [
    ["get_business_attention_summary", fixtures.attentionSnapshot()],
    ["get_banking_attention_summary", fixtures.attentionSnapshot()],
    ["search_commerce_orders", fixtures.mixedSnapshot()],
    ["search_inventory", inventoryShelf]
  ];
  const ctx = fixtures.ownerContext();
  for (const [name, snapshot] of cases) {
    const paged = HANDLERS[name](snapshot, { limit: 1 }, ctx, { nowMs: fixtures.NOW });
    const list = paged.data.items || paged.data.orders || [];
    const total = paged.data.totalItems !== undefined ? paged.data.totalItems : paged.data.matched;
    assert.ok(total > list.length, `${name}: this fixture does not truncate, so the check proves nothing`);
    assert.ok(paged.warnings.some((row) => row.code === "result_truncated"),
      `${name} returned ${list.length} of ${total} and said nothing`);
    // And a page that fits raises nothing: a warning always present says as
    // little as one never present.
    const whole = HANDLERS[name](snapshot, { limit: 50 }, ctx, { nowMs: fixtures.NOW });
    assert.ok(!whole.warnings.some((row) => row.code === "result_truncated"),
      `${name} reports a truncation over a list that fitted`);
  }
});

check("a capability, a state or a warning code that the document never learned about fails here", () => {
  for (const name of CAPABILITY_NAMES) {
    assert(DOC.includes(name), `docs/orchestrator-contract.md does not describe ${name}`);
  }
  for (const state of envelope.STATES) {
    assert(DOC.includes(`\`${state}\``), `the document does not list the state ${state}`);
  }
  for (const code of envelope.WARNING_CODES) {
    assert(DOC.includes(`\`${code}\``), `the document does not list the warning code ${code}`);
  }
  for (const kind of registry.CAPABILITY_KINDS) {
    assert(DOC.includes(`\`${kind}\``), `the document does not list the capability kind ${kind}`);
  }
});

// §8.1's table is the page a channel author reads to find out what a capability
// costs and what it may touch, and nothing checked it: `search_commerce_orders`
// gained the `connections` domain (Etsy has no health document, so the search
// has to read the connection) and the table kept the old three for a fortnight.
check("§8.1's scopes and domains are the registry's, capability by capability", () => {
  const rows = DOC.split("\n")
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 6 && /^`[a-z_]+`$/.test(cells[1]))
    .map((cells) => ({ name: cells[1].slice(1, -1), scopes: cells[2], domains: cells[5] }))
    .filter((row) => CAPABILITY_NAMES.includes(row.name));
  assert.strictEqual(rows.length, CAPABILITY_NAMES.length,
    `§8.1 describes ${rows.length} of the ${CAPABILITY_NAMES.length} capabilities run() serves`);
  for (const row of rows) {
    const entry = registry.entryFor(row.name);
    assert.strictEqual(row.scopes, entry.scopes.join(" "), `§8.1 has the wrong scopes for ${row.name}`);
    assert.strictEqual(row.domains, (entry.domainNeeds || []).join(" "),
      `§8.1 says ${row.name} reads "${row.domains}"; it declares "${(entry.domainNeeds || []).join(" ")}"`);
  }
});

// §2 is the wiring instruction. A dep that appears in run() and not in the
// table is a hook a channel silently does not inject — which is how marketplace
// PII blocks came to be unrecorded on ten capabilities.
check("§2 names every dep the orchestrator reads", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "orchestrator", "index.js"), "utf8");
  const used = new Set([...source.matchAll(/\bdeps\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]));
  assert(used.size >= 10, "the dep scan found almost nothing; the pattern has stopped matching");
  const table = DOC.slice(DOC.indexOf("## 2. Building an instance"), DOC.indexOf("## 3. Who is asking"));
  for (const dep of [...used].sort()) {
    assert(table.includes(`\`${dep}\``), `§2's dependency table never mentions ${dep}`);
  }
});

check("the loader caps a channel is told about are the caps it will hit", () => {
  for (const key of ["orders", "bank", "inventory", "payouts", "review", "inbox"]) {
    assert(DOC.includes(`${key} ${loaders.CAPS[key]}`), `the documented ${key} cap is not ${loaders.CAPS[key]}`);
  }
});

// The document told the WhatsApp gateway to send `scope: ""` and said it meant
// "not scope-limited". Since the scope rule became real that is exactly
// backwards — an empty grant is a caller that was granted nothing — so a
// gateway built from §3 was refused on all ten capabilities, with a message
// telling a WhatsApp user to reconnect in ChatGPT.
//
// The behaviour is pinned in mcp-scope-enforcement; the document is the thing
// that can go stale. So these read the CODE's answer and require the page to be
// telling the truth about it, in both directions: if somebody adds an auth type
// to the first-party list, the second check fails until §3.1 and §9 are
// rewritten.
check("§3.1 names the first-party auth types the code actually exempts", () => {
  const first = [...contextModule.FIRST_PARTY_AUTH_TYPES];
  assert(first.length > 0, "there is no first-party auth type list to describe");
  for (const authType of first) {
    assert(DOC.includes(`\`${authType}\``), `§3.1 does not name the first-party auth type ${authType}`);
    assert.deepStrictEqual(contextModule.missingScopes({ authType, scope: "" }, ["finance.read"]), [],
      `${authType} is documented as first party but is scope-checked`);
  }
  assert(DOC.includes("FIRST_PARTY_AUTH_TYPES"),
    "the document never names the list a channel's auth type has to be in");
  assert(!/means "not scope-limited"/.test(DOC),
    'the document still tells a channel that an empty scope means "not scope-limited"');
});

check("a channel the code has not been told about is refused, and the document says so", () => {
  const entry = registry.entryFor("get_business_attention_summary");
  const ctx = fixtures.ownerContext({ authType: "whatsapp_binding", scope: [] });
  assert(!contextModule.FIRST_PARTY_AUTH_TYPES.includes("whatsapp_binding"),
    "whatsapp_binding is first party now — rewrite §3.1 and move it out of the §9 reserved list");
  assert.throws(() => contextModule.assertCapability(ctx, entry), (error) => error.code === "permission-denied",
    "an undeclared auth type with no grant is no longer refused");
  const reserved = DOC.indexOf("## 9. Reserved interfaces — not implemented");
  assert(DOC.indexOf("FIRST_PARTY_AUTH_TYPES` gaining `whatsapp_binding", reserved) > reserved,
    "the one-line change that unblocks a second channel is not in the reserved list");
});

check("the reserved interfaces are still reserved, and still labelled as such", () => {
  const heading = DOC.indexOf("## 9. Reserved interfaces — not implemented");
  assert(heading > 0, "the document has no reserved-interfaces section");
  const instance = orchestratorOver(fixtures.mixedSnapshot());
  for (const name of ["continuation", "pendingFileMatch", "proposals"]) {
    assert(DOC.indexOf(name, heading) > heading, `${name} is not named among the reserved interfaces`);
    assert(!(name in instance),
      `${name} exists now: implement it in the contract document too, and take it out of the reserved list`);
  }
});

check("the two things §5.4 promises about a PII row are written where the code is too", () => {
  // §5.4 tells a second channel that `recordCount` is always 1 on a read row
  // and that `actorRole` is derived from the channel. Both are properties of
  // code an auditor reads elsewhere — `privacy/accessLog.js` normalises the
  // field and has no vocabulary behind `actorRole` — so the caveat belongs
  // beside them, not only in this document and the operator's submission page.
  const accessLogSource = fs.readFileSync(path.join(__dirname, "..", "..", "privacy", "accessLog.js"), "utf8");
  assert(/before dispatch/i.test(accessLogSource) && /not measured/i.test(accessLogSource),
    "accessLog.js does not say that a 1 on an assistant read row means \"not measured\"");
  assert(DOC.includes("`recordCount` is always 1 on a read row"),
    "§5.4 no longer tells a second channel what the count on its own rows means");
  assert(DOC.includes("`actorRole` is derived from the channel type"),
    "§5.4 no longer tells a second channel where actorRole comes from");
  // And the vocabulary the document points at exists.
  const { ACTOR_ROLES } = require("../../orchestrator");
  assert.deepStrictEqual(Object.keys(ACTOR_ROLES).sort(), [...contextModule.CHANNEL_TYPES].sort(),
    "a channel type with no actorRole would file a row naming another channel's client");
});

check("the ACCESS_SOURCES the page prints is the one the code has", () => {
  // The reserved-interface check above iterates three named objects, so the one
  // reserved item that MOVED was not covered by it: `rest` shipped inside the
  // 1.2.0 audit corrections and §5.4 went on printing the pre-`rest` array and
  // calling it a "known gap, not yet fixed", on the page the WhatsApp gateway is
  // written from. Pinned to the constant now, in both directions.
  const printed = JSON.stringify(accessLog.ACCESS_SOURCES);
  assert(DOC.includes(printed), `§5.4 does not print the ACCESS_SOURCES the code has: ${printed}`);
  for (const value of accessLog.ACCESS_SOURCES) {
    assert(!DOC.includes(`Adding \`${value}\``) && !DOC.includes(`gaining \`${value}\` and`),
      `the document still asks for "${value}" to be added to ACCESS_SOURCES, and it is already there`);
  }
  const reserved = DOC.indexOf("## 9. Reserved interfaces — not implemented");
  assert(DOC.indexOf("`ACCESS_SOURCES` gaining `whatsapp`", reserved) > reserved,
    "the one half of this that is genuinely still reserved is not in the reserved list");
  assert(!accessLog.ACCESS_SOURCES.includes("whatsapp"),
    "whatsapp is in ACCESS_SOURCES now: rewrite §5.4 and §9, and drop it from the reserved list");
});

(async () => {
  for (const [name, run] of asyncChecks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
  }
  console.log(failures === 0 ? "\nThe reuse contract holds." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();

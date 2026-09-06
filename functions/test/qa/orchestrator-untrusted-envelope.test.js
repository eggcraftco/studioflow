// The sanitisation invariant, over every capability and every field of an
// envelope, from the registry rather than from a list somebody maintains.
//
// The invariant is one sentence: nothing a provider, a bank, a ledger or a
// buyer wrote leaves this server unbounded, spanning two lines, or carrying a
// character that can move a cursor, reverse a rendered sentence or hide a
// payload inside a label.
//
// It was kept, until now, by each capability remembering to call
// `untrusted.safeText` at each of its own call sites. A reviewer poisoned every
// string source in a workspace with one 330-character payload — a newline, a
// right-to-left override, a zero-width space — and found EIGHT of the ten
// capabilities of the day repeating it back, plus two leaks that were in no capability at
// all: `envelope.warning` bounded nothing, and `freshness.build` interpolates a
// bank connection's own provider key into four sentences, one of which was
// quoted into a rendered summary line. The lesson the reviewer named is the
// reason this file exists: THE TEST'S COVERAGE WAS THE FIX'S COVERAGE. The
// check that was meant to hold the line named three capabilities, because three
// were what that commit had touched.
//
// So there are two structural changes and this is the second of them:
//
//  - `envelope.finish` walks the whole finished envelope and bounds every
//    string in it, keys included, at whatever depth. A capability written next
//    year cannot opt out by not knowing the rule exists.
//  - this test enumerates the capabilities from the REGISTRY — through
//    `listCapabilities()`, the same projection `tools/list` serves — so a new
//    capability is covered the day its registry row is written, without anybody
//    adding it here.
//
// What the invariant is not: a defence against a SHORT injection. A bounded,
// single-line, control-free string can still read "ignore previous
// instructions", and no character class fixes that (untrusted.js says so in as
// many words). This is the shape rule. The content rule is that the assistant
// is read-only and every write goes through a confirmation.
//
// Run: node test/qa/orchestrator-untrusted-envelope.test.js
const assert = require("assert");
const orchestratorModule = require("../../orchestrator");
const registry = require("../../orchestrator/registry");
const envelope = require("../../orchestrator/envelope");
const freshness = require("../../orchestrator/freshness");
const untrusted = require("../../orchestrator/untrusted");
const fixtures = require("../fixtures/orchestrator");

let failures = 0;
const asyncChecks = [];
const check = (name, run) => { asyncChecks.push([name, run]); };

const POISON = fixtures.POISON;

/**
 * The widest bound anything in an envelope is given: `render.LINE_MAX` and
 * `envelope.WARNING_MESSAGE_MAX` are both 300, and a warning message is the one
 * string quoted whole into a summary line. Written as a literal rather than
 * read from the module under test — a bound imported from the code it is
 * checking rises with the code.
 */
const ENVELOPE_STRING_MAX = 300;

/** Control characters, bidi overrides and zero-width joiners, spelled out here. */
const UNSAFE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/;

/**
 * Every string in a value, with the path that carried it — and the KEYS as well
 * as the values.
 *
 * A field name is read by a model exactly the way a field value is, and it can
 * be somebody else's: `attention.amountsByCurrency` keys a block by a currency
 * code taken off a payout, which is the provider's own string. A walker that
 * collects values only cannot see a poisoned key, which is how the previous
 * version of this check would have passed one.
 */
function stringsIn(value, path, out = []) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((row, index) => stringsIn(row, `${path}[${index}]`, out));
  else if (value && typeof value === "object") {
    for (const [key, row] of Object.entries(value)) {
      out.push([`${path}.{key:${key.slice(0, 20)}}`, key]);
      stringsIn(row, `${path}.${key}`, out);
    }
  }
  return out;
}

/**
 * Every field of an envelope, named one by one rather than by walking the
 * object, so a field that stops being produced fails the emptiness check below
 * instead of quietly dropping out of the coverage.
 */
function stringsInEnvelope(built) {
  const out = [["action", String(built.action || "")]];
  for (const field of ["data", "warnings", "freshness", "entityRefs", "suggestedActions"]) {
    stringsIn(built[field], field, out);
  }
  for (const [index, row] of ((built.summary || {}).lines || []).entries()) {
    out.push([`summary.lines[${index}]`, row.text]);
  }
  return out;
}

/** Every way one string can break the invariant, with the sentence to print. */
function violationsIn(built, label) {
  const bad = [];
  for (const [path, value] of stringsInEnvelope(built)) {
    if (UNSAFE.test(value)) bad.push(`${label}: ${path} carries a control, bidi or zero-width character`);
    if (/[\n\r]/.test(value)) bad.push(`${label}: ${path} spans two lines`);
    if (value.length > ENVELOPE_STRING_MAX) bad.push(`${label}: ${path} is ${value.length} characters of somebody else's text`);
    if (value.includes(POISON)) bad.push(`${label}: ${path} is the payload verbatim`);
  }
  return bad;
}

/** How many strings this answer had to clip — proof the payload reached it. */
const clipped = (built) => stringsInEnvelope(built).filter(([, value]) => value.endsWith("…")).length;

/**
 * The orchestrator, with the loader replaced by the poisoned workspace.
 *
 * `run()` rather than the handlers directly, because run() is where the
 * envelope is finished, the channel profile applied and the summary rendered —
 * the three things the leak was found in.
 */
const orchestratorFor = (channelProfile = null) => orchestratorModule.createOrchestrator({
  flags: { orchestrator: true, inventory: true },
  now: () => fixtures.NOW,
  loaders: {
    snapshotFor: async () => fixtures.poisonedSnapshot(),
    loadCompany: async () => ({})
  },
  uidHasCompanyAccess: async () => true
});

const contextFor = (channelProfile = null) => fixtures.ownerContext({
  channel: { type: channelProfile ? "whatsapp" : "mcp", bindingId: null, isGroup: Boolean(channelProfile), profile: channelProfile }
});

/**
 * The args a caller supplies are a string source too — a model relays what it
 * was told, and `search_inventory`'s `query` is echoed back in the answer. Every
 * capability gets the superset; the ones that do not declare a field ignore it.
 */
const POISONED_ARGS = {
  query: POISON, provider: POISON, channel: POISON, status: POISON, statuses: [POISON],
  orderId: POISON, category: POISON, location: POISON, section: POISON, sections: [POISON],
  fromDate: POISON, toDate: POISON, sortBy: POISON, groupBy: POISON, limit: 5
};

/** A group thread: the profile that rewrites strings on the way out. */
const GROUP = { capabilities: ["read"], security: { assurance_level: 1, pii_level: "none", financial_data_allowed: false } };

/**
 * The capability list, from the registry.
 *
 * `listCapabilities()` is `registry.publishedForChannel` projected through the
 * flags this deployment was built with — the same call `tools/list` is served
 * from. A hand-written list here would be the defect this file exists for,
 * one level up.
 */
const CAPABILITIES = orchestratorFor().listCapabilities();

check("the capabilities under test come from the registry, and there is at least one", () => {
  assert.deepStrictEqual([...CAPABILITIES].sort(), [...orchestratorModule.CAPABILITY_NAMES].sort(),
    "the registry projection and the handler table disagree about what this deployment publishes");
  // A count, not a number: the 6 September 2026 reduction cut this surface from
  // ten capabilities to two, and a literal "10" here would have been exactly
  // the hand-maintained list the header refuses. What must hold is that the
  // enumeration is not EMPTY — an empty list would let every assertion below
  // pass over nothing.
  assert.ok(CAPABILITIES.length > 0, "the registry publishes no orchestrator capability at all, so nothing below is under test");
  // And the enumeration is live: every name has a registry row that this
  // deployment's flags publish.
  for (const name of CAPABILITIES) {
    assert.ok(registry.entryFor(name), `${name} answers but has no registry row`);
  }
});

check("the checker can see a violation when there is one", () => {
  // A check that cannot fail is a check that proves nothing, and this one is
  // asserting an ABSENCE — so it says out loud that it recognises the payload
  // before it is used to claim the payload is gone.
  assert.ok(untrusted.hasUnsafeCharacters(POISON), "the fixture's payload no longer carries anything unsafe");
  const raw = {
    action: "x",
    data: { note: POISON, rows: [{ [POISON]: POISON }] },
    warnings: [{ code: "estimated", message: POISON, channel: POISON }],
    freshness: { sources: [{ provider: POISON, entity: "orders" }] },
    entityRefs: [{ type: "order", id: POISON, label: POISON }],
    suggestedActions: [{ capability: "x", label: POISON, args: { query: POISON } }],
    summary: { lines: [{ slot: "result", text: POISON }] }
  };
  const seen = violationsIn(raw, "an envelope nobody sanitised");
  assert.ok(seen.length >= 8, `the checker found only ${seen.length} violations in an entirely poisoned object`);
  // One per kind, so a checker that has lost one of its four rules is caught.
  for (const kind of ["control", "two lines", "characters of somebody", "verbatim"]) {
    assert.ok(seen.some((row) => row.includes(kind)), `the checker no longer reports "${kind}"`);
  }
});

check("every capability, every field of the envelope, over a workspace where every string is poisoned", async () => {
  // The whole point of this file. Every capability from the registry, each run
  // twice — with no arguments and with poisoned ones — over a snapshot whose
  // every provider-, bank-, ledger- and buyer-authored string is the payload.
  const orchestrator = orchestratorFor();
  const ctx = contextFor();
  let totalClipped = 0;
  for (const capability of CAPABILITIES) {
    for (const [label, args] of [["no args", {}], ["poisoned args", POISONED_ARGS]]) {
      const built = await orchestrator.run({ capability, args, ctx });
      const strings = stringsInEnvelope(built);
      assert.ok(strings.length > 0, `${capability} (${label}): nothing to check — the fixture no longer reaches it`);
      assert.ok(built.summary.lines.length > 0, `${capability} (${label}): rendered no summary line, so the line rule went unchecked`);
      const bad = violationsIn(built, `${capability} (${label})`);
      assert.deepStrictEqual(bad, [], bad.join("\n       "));
      totalClipped += clipped(built);
    }
  }
  // A vacuity guard: if the poisoned fixture stopped reaching the capabilities,
  // every answer would be short, clean and meaningless as evidence.
  assert.ok(totalClipped > 0, "no answer had to clip anything, so the hostile fixture is no longer hostile");
});

check("the same holds on the channel that rewrites the answer on its way out", async () => {
  // A group thread's profile replaces money with a sentence of its own and
  // blanks a label, both AFTER the capability has written its data. The order
  // inside `finish` is profile first, bound second, so a string the profile
  // wrote is bounded too.
  const orchestrator = orchestratorFor();
  const ctx = contextFor(GROUP);
  for (const capability of CAPABILITIES) {
    const built = await orchestrator.run({ capability, args: POISONED_ARGS, ctx });
    const bad = violationsIn(built, `${capability} (group thread)`);
    assert.deepStrictEqual(bad, [], bad.join("\n       "));
  }
});

check("a capability written next year is bounded whether or not its author knew the rule", () => {
  // The structural half. Nothing below goes through `entityRef`, `warning`,
  // `sourceRow` or any of the call sites that bound a string today: it is what
  // an eleventh capability would hand `finish` if its author had never read
  // untrusted.js — a field name no capability uses (`note`), an entity ref
  // built as an object literal, a suggested action, and a POISONED KEY.
  const built = envelope.finish({
    capability: `get_something_new${POISON}`,
    data: {
      note: POISON,
      nested: [{ [POISON]: POISON }],
      rows: [{ label: POISON, deeper: { andDeeper: [POISON] } }]
    },
    warnings: [{ code: "estimated", message: POISON, channel: POISON, connectionId: POISON, section: POISON }],
    sources: [{ provider: POISON, entity: "orders", state: "never", contributed: true, lastSuccessAt: null, lagMs: null }],
    entityRefs: [{ type: "order", id: POISON, label: POISON, url: null }],
    suggestedActions: [{ capability: "search_commerce_orders", label: POISON, args: { query: POISON } }],
    nowMs: fixtures.NOW
  });
  const bad = violationsIn(built, "a capability that never called safeText");
  assert.deepStrictEqual(bad, [], bad.join("\n       "));
  // And the bound is real, not an artefact of the payload being dropped: the
  // field is still there, still says what it was about, and is simply shorter.
  assert.ok(built.data.note.length > 0 && built.data.note.length <= 200,
    `data.note came out ${built.data.note.length} characters long`);
  assert.strictEqual(Object.keys(built.data.nested[0])[0].length <= envelope.KEY_MAX, true,
    "a poisoned field NAME survived at full length");
});

check("a poisoned key cannot overwrite the field beside it", () => {
  // Two keys that sanitise to the same thing: the first wins and the second is
  // dropped, because the alternative is a hostile string choosing what a real
  // field's value is.
  const built = envelope.finish({
    capability: "get_commerce_overview",
    data: { totalItems: 4, ["totalItems\u200B"]: 999 },
    nowMs: fixtures.NOW
  });
  assert.strictEqual(built.data.totalItems, 4, "a zero-width character in a key overwrote the real field");
});

check("a field named __proto__ or constructor stays a field", () => {
  // The two names that make a plain `out[key] = …` walk misbehave. `JSON.parse`
  // produces `__proto__` as an OWN property — a caller's arguments arrive that
  // way — and assigning it sets the output's prototype instead of writing a
  // field. `constructor` reads a function out of the bounds table, which
  // `safeText` then ignores in favour of its own shorter default.
  const built = envelope.finish({
    capability: "get_commerce_overview",
    data: JSON.parse(`{"__proto__": {"polluted": true}, "constructor": "${"x".repeat(250)}"}`),
    nowMs: fixtures.NOW
  });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(built.data, "__proto__"), true,
    "a field named __proto__ became a prototype rather than a field");
  assert.strictEqual({}.polluted, undefined, "walking the envelope polluted Object.prototype");
  assert.strictEqual(built.data.constructor.length, 200,
    `a field named constructor came out ${built.data.constructor.length} characters long`);
});

check("the workspace these answers are built from is hostile in every domain", async () => {
  // What the clean envelopes above are evidence OF depends on the input, so the
  // input is checked too: the snapshot itself breaks the invariant hundreds of
  // times over, in orders, inventory, bank rows, payouts, connections, the
  // review queue and the ledger's own attention rows.
  const snapshot = fixtures.poisonedSnapshot();
  const bad = violationsIn({ action: "", data: snapshot, warnings: [], freshness: {}, entityRefs: [], suggestedActions: [], summary: { lines: [] } }, "the snapshot");
  assert.ok(bad.length >= 50, `the fixture only breaks the invariant ${bad.length} times — it has stopped being hostile`);

  // And a fact worth recording rather than asserting: today's handlers
  // ALSO bind their own strings, so their raw output is already clean before
  // `finish` sees it. That is belt and braces, not the reason the envelopes are
  // clean — it is what a reviewer had to fix capability by capability, and it
  // is exactly what an eleventh capability would not know to do. The check
  // above ("a capability written next year") is the one that proves the door
  // holds without it, over fields no capability writes at all.
  const ctx = contextFor();
  const rawStrings = CAPABILITIES.reduce((total, capability) => {
    const raw = orchestratorModule.HANDLERS[capability](snapshot, {}, ctx, { nowMs: fixtures.NOW }) || {};
    return total + stringsIn(raw.data || {}, "data").length;
  }, 0);
  assert.ok(rawStrings > 0, "the handlers produced no strings at all over a poisoned workspace");
});

check("the freshness block a bank connection can write into is bounded too", () => {
  // The leak that was in no capability: `freshness.build` writes the provider
  // key into four sentences, and the provider key on a bank row is whatever the
  // connection document says.
  const row = freshness.sourceRow({
    provider: POISON, connectionId: POISON, entity: "orders", kind: "bank",
    lastSuccessAtMs: 0, contributed: true, nowMs: fixtures.NOW
  });
  const built = envelope.finish({ capability: "get_banking_attention_summary", sources: [row], nowMs: fixtures.NOW });
  const bad = violationsIn(built, "freshness");
  assert.deepStrictEqual(bad, [], bad.join("\n       "));
  assert.ok(built.warnings.some((warning) => warning.code === "channel_not_connected"),
    "the sentence this check is about is no longer written");
  assert.strictEqual(built.partial, true, "a contributing source that never synced must make the answer partial");
});

(async () => {
  for (const [name, run] of asyncChecks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
  }
  console.log(failures === 0 ? "\nThe sanitisation invariant holds." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();

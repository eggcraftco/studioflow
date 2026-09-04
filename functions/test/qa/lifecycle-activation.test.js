// When has NivaDesk actually started working for somebody.
//
// This is the measurement nobody was making, and it is the reason it matters:
// thirty-seven workspaces outside this studio have signed up and not one has
// ever created a customer record. "Signed up" and "using it" were the only two
// states the product could tell apart, and they are the two least useful.
//
// Two rules the tests below exist to hold:
//   - activation is not one event, because a jeweller connecting Etsy and a
//     studio typing its first commission are both activated by different
//     evidence, and one definition would mark most of them as failures;
//   - activation is not connecting something, because plumbing that works is
//     not a product that works.
const assert = require("assert");
const { describeEvent, isMeaningful, meaningfulEventNames, eventKey, EVENT_REGISTRY } = require("../../lifecycle/events");
const {
  activationPathFor, activationProgress, lifecycleState, meaningfulEvents,
  ACTIVATION_PATHS, ACTIVATION_REQUIREMENTS, DEFAULT_TIMINGS
} = require("../../lifecycle/activation");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 7, 1, 9, 0, 0);
const at = (days, name, subject) => ({ name, atMs: T0 + days * DAY, subjectId: subject });

// ---- the registry -----------------------------------------------------------

check("an event nobody has declared counts for nothing, and says it was never declared", () => {
  // The default matters: a telemetry line added elsewhere for debugging must
  // not quietly start counting as engagement or activating anybody.
  const unknown = describeEvent("some_new_debug_event");
  assert.strictEqual(unknown.meaningful, false);
  assert.strictEqual(unknown.declared, false);
  assert.strictEqual(unknown.activationWeight, 0);
  assert.strictEqual(describeEvent("").declared, false);
  assert.strictEqual(describeEvent(null).declared, false);
  // And a prototype key is not an event.
  assert.strictEqual(describeEvent("constructor").declared, false);
  assert.strictEqual(describeEvent("toString").declared, false);
});

check("looking at a screen is not evidence that the product is working", () => {
  for (const name of ["page_viewed", "session_started", "ai_screen_opened", "welcome_screen_seen", "help_opened"]) {
    assert.strictEqual(isMeaningful(name), false, `${name} counts as meaningful activity`);
    assert.strictEqual(describeEvent(name).declared, true, `${name} should be declared, just not meaningful`);
  }
  // Opening the AI screen is the one most likely to be mistaken for use (§11).
  assert.strictEqual(describeEvent("ai_screen_opened").activationWeight, 0);
  assert.ok(describeEvent("grounded_ai_answer").activationWeight > 0, "an answer grounded in the workspace's own data is the real event");
});

check("the same happening arriving twice is one event", () => {
  // A webhook retried, a screen re-rendered, a sweep re-running. Counting it
  // twice inflates engagement and can activate a workspace that did nothing.
  assert.strictEqual(eventKey("ws1", "external_order_imported", "1042"), eventKey("ws1", "external_order_imported", "1042"));
  assert.notStrictEqual(eventKey("ws1", "external_order_imported", "1042"), eventKey("ws1", "external_order_imported", "1043"));
  assert.notStrictEqual(eventKey("ws1", "external_order_imported", "1042"), eventKey("ws2", "external_order_imported", "1042"));
  assert.notStrictEqual(eventKey("ws1", "order_created", "1042"), eventKey("ws1", "external_order_imported", "1042"));
});

check("every declared event has both weights, and no weight without meaning", () => {
  for (const [name, entry] of Object.entries(EVENT_REGISTRY)) {
    assert.strictEqual(typeof entry.meaningful, "boolean", name);
    assert.ok(Number.isFinite(entry.activationWeight), name);
    assert.ok(Number.isFinite(entry.engagementWeight), name);
    if (!entry.meaningful) {
      assert.strictEqual(entry.activationWeight, 0, `${name} is not meaningful but carries activation weight`);
      assert.strictEqual(entry.engagementWeight, 0, `${name} is not meaningful but carries engagement weight`);
    }
  }
  assert.ok(meaningfulEventNames().length >= 20);
});

// ---- activation is not connecting something ---------------------------------

check("connecting a shop and importing its products is not activation", () => {
  const events = [at(0, "integration_connect_started"), at(0, "integration_connected"), at(0, "products_imported")];
  const progress = activationProgress(events, "commerce");
  assert.strictEqual(progress.activated, false, "plumbing that works is not a product that works");
  assert.strictEqual(progress.steps.external_order_imported, false);
});

check("the shop's first real order is", () => {
  const events = [at(0, "integration_connected"), at(2, "external_order_imported", "1042")];
  const progress = activationProgress(events, "commerce");
  assert.strictEqual(progress.activated, true);
  assert.strictEqual(progress.activatedAtMs, T0 + 2 * DAY, "activation is dated to the moment the value arrived");
});

check("a bespoke studio needs both halves: a customer and a job", () => {
  const half = activationProgress([at(0, "customer_created", "c1")], "bespoke_studio");
  assert.strictEqual(half.activated, false);
  assert.strictEqual(half.completed, 1);
  assert.strictEqual(half.required, 2);
  const both = activationProgress([at(0, "customer_created", "c1"), at(1, "order_created", "o1")], "bespoke_studio");
  assert.strictEqual(both.activated, true);
  assert.strictEqual(both.activatedAtMs, T0 + DAY, "dated to the LAST step, not the first");
});

check("a finance workspace is served when money meets work, not when a bank connects", () => {
  const connected = activationProgress([at(0, "bank_connected"), at(0, "bank_transactions_imported")], "finance");
  assert.strictEqual(connected.activated, false, "a feed of transactions nobody has reconciled is not value");
  const matched = activationProgress([at(0, "bank_connected"), at(3, "bank_match_completed", "tx1")], "finance");
  assert.strictEqual(matched.activated, true);
});

check("an inventory workspace is served when stock is consumed by real work", () => {
  const stocked = activationProgress([at(0, "inventory_item_created", "i1"), at(0, "inventory_quantity_set", "i1")], "inventory");
  assert.strictEqual(stocked.activated, false, "a stocked shelf nobody has drawn from is a spreadsheet");
  const used = activationProgress([at(0, "inventory_item_created", "i1"), at(5, "inventory_consumed_by_order", "o1")], "inventory");
  assert.strictEqual(used.activated, true);
});

check("a workspace that told us nothing is served by any real work", () => {
  // Holding somebody to a path they never chose manufactures a failure out of
  // a success, so "general" accepts whichever kind of value they found.
  for (const name of ["external_order_imported", "order_created", "bank_match_completed", "inventory_consumed_by_order", "grounded_ai_answer"]) {
    const progress = activationProgress([at(0, name, "x")], "general");
    assert.strictEqual(progress.activated, true, `${name} did not activate a general workspace`);
  }
  assert.strictEqual(activationProgress([at(0, "integration_connected")], "general").activated, false);
});

check("an undeclared event cannot activate anybody", () => {
  const progress = activationProgress([{ name: "external_order_imported_v2", atMs: T0 }], "commerce");
  assert.strictEqual(progress.activated, false, "a name nobody declared moved a workspace's lifecycle");
});

check("an event with no usable time is ignored rather than dated to now", () => {
  for (const bad of [undefined, null, "yesterday", NaN]) {
    const progress = activationProgress([{ name: "external_order_imported", atMs: bad }], "commerce");
    assert.strictEqual(progress.activated, false, `atMs ${String(bad)} activated a workspace`);
  }
});

// ---- the path -----------------------------------------------------------------

check("the path comes from what the workspace said, and defaults to general", () => {
  assert.strictEqual(activationPathFor({ activationPath: "finance" }), "finance");
  assert.strictEqual(activationPathFor({ activation_path: "COMMERCE" }), "commerce");
  assert.strictEqual(activationPathFor({ businessType: "bespoke" }), "bespoke_studio");
  assert.strictEqual(activationPathFor({ businessType: "online_shop" }), "commerce");
  assert.strictEqual(activationPathFor({}), "general", "a workspace that answered nothing is not put on a path it never chose");
  assert.strictEqual(activationPathFor({ activationPath: "nonsense" }), "general");
  assert.ok(ACTIVATION_PATHS.includes("general"));
  for (const path of ACTIVATION_PATHS) assert.ok(ACTIVATION_REQUIREMENTS[path], `${path} has no requirement`);
});

// ---- lifecycle ------------------------------------------------------------------

const state = (events, extra = {}) => lifecycleState({ events, path: "commerce", nowMs: T0 + 30 * DAY, ...extra });

check("a workspace that has done nothing is new, not onboarding", () => {
  assert.strictEqual(state([]).state, "new");
  assert.strictEqual(state([at(0, "page_viewed"), at(0, "session_started")]).state, "new", "clicking around is not starting");
});

check("a workspace part-way through onboarding says so", () => {
  assert.strictEqual(state([at(0, "onboarding_started")]).state, "onboarding");
  // And one that finished onboarding without doing anything is not still in it.
  assert.strictEqual(state([at(0, "onboarding_started"), at(0, "onboarding_completed")]).state, "new");
});

check("a setup action without value is its own state, and the most important one", () => {
  // This is where the thirty-seven workspaces are, and a product that cannot
  // see this state cannot see its own problem.
  const s = state([at(0, "onboarding_started"), at(0, "integration_connect_started")]);
  assert.strictEqual(s.state, "setup_started");
  assert.strictEqual(s.reason, "setup_action_without_activation");
  assert.strictEqual(s.progress.activated, false);
});

check("value delivered, and then a rhythm, are two different states", () => {
  const once = state([at(28, "external_order_imported", "1")], { nowMs: T0 + 30 * DAY });
  assert.strictEqual(once.state, "activated", "one order is value, not yet a habit");
  const twice = state([at(28, "external_order_imported", "1"), at(29, "external_order_imported", "2")], { nowMs: T0 + 30 * DAY });
  assert.strictEqual(twice.state, "engaged");
  assert.strictEqual(twice.reason, "regular_meaningful_activity");
});

check("a burst on day one does not read as a habit a month later", () => {
  const events = [at(0, "external_order_imported", "1"), at(0, "external_order_imported", "2"), at(0, "order_status_changed", "1")];
  assert.strictEqual(state(events, { nowMs: T0 + 30 * DAY }).state, "dormant", "the window is recent activity, not activity ever");
});

check("a workspace that has gone quiet is at risk, then dormant, and the days are configuration", () => {
  const events = [at(0, "external_order_imported", "1")];
  assert.strictEqual(lifecycleState({ events, path: "commerce", nowMs: T0 + 3 * DAY }).state, "activated");
  assert.strictEqual(lifecycleState({ events, path: "commerce", nowMs: T0 + 15 * DAY }).state, "at_risk");
  assert.strictEqual(lifecycleState({ events, path: "commerce", nowMs: T0 + 31 * DAY }).state, "dormant");
  // Not hardcoded: a workspace whose rhythm is monthly is not at risk at 15 days.
  const patient = lifecycleState({ events, path: "commerce", nowMs: T0 + 15 * DAY, timings: { activatedLowFrequencyDays: 45, dormantDays: 90 } });
  assert.strictEqual(patient.state, "activated");
  assert.ok(DEFAULT_TIMINGS.activatedLowFrequencyDays > 0);
});

check("a cancelled plan is churned whatever the events say", () => {
  const s = state([at(29, "external_order_imported", "1")], { cancelledAtMs: T0 + 29 * DAY });
  assert.strictEqual(s.state, "churned");
  assert.strictEqual(s.reason, "plan_cancelled");
});

check("every state carries the reason a message would need to explain itself", () => {
  for (const events of [[], [at(0, "onboarding_started")], [at(0, "integration_connected")], [at(29, "external_order_imported", "1")]]) {
    const s = state(events, { nowMs: T0 + 30 * DAY });
    assert.ok(s.reason && typeof s.reason === "string", `${s.state} has no reason`);
    assert.ok(s.progress, `${s.state} has no progress`);
  }
});

check("only meaningful events count towards a rhythm", () => {
  const busy = [at(29, "external_order_imported", "1"), at(29, "page_viewed"), at(29, "session_started"), at(29, "help_opened")];
  assert.strictEqual(state(busy, { nowMs: T0 + 30 * DAY }).state, "activated", "three page views made a habit out of one order");
  assert.strictEqual(meaningfulEvents(busy).length, 1);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ LIFECYCLE + ACTIVATION GEÇTİ");
})();

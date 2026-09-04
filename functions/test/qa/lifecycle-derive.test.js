// The events a workspace has already produced, read out of what it already has.
//
// The alternative was to start recording events and then wait weeks, while the
// question everybody is asking — are the workspaces that signed up getting any
// value? — stayed unanswered for the ones that signed up months ago. Most of the
// answer is already on disk: an order with a commerce stamp IS an external order
// that was imported, and it is dated.
//
// The other half of this file's job is to be honest about what cannot be
// derived, because a derivation that quietly covers eight of ten events and
// calls itself complete turns a measurement nobody took into a workspace that
// did nothing.
const assert = require("assert");
const { deriveEvents, UNDERIVABLE_EVENTS, millisOf } = require("../../lifecycle/derive");
const { describeEvent } = require("../../lifecycle/events");
const { activationProgress, lifecycleState } = require("../../lifecycle/activation");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 6, 1, 9, 0, 0);
const names = (result) => result.events.map((e) => e.name);

check("dates are read in every shape the database stores them in", () => {
  const stamp = { toMillis: () => T0 };
  const seconds = { seconds: T0 / 1000 };
  const result = deriveEvents({
    customers: [
      { id: "c1", createdAtMs: T0 },
      { id: "c2", createdAt: stamp },
      { id: "c3", createdAt: seconds },
      { id: "c4", createdAt: "2026-07-01T09:00:00.000Z" }
    ]
  });
  assert.strictEqual(result.events.length, 4, "a customer with a Timestamp, a seconds map or an ISO string was dropped");
  for (const event of result.events) assert.strictEqual(event.atMs, T0);
  // And a date that is not a date produces nothing rather than 1970.
  assert.strictEqual(millisOf(null), null);
  assert.strictEqual(millisOf(0), null);
  assert.strictEqual(millisOf("not a date"), null);
  assert.strictEqual(deriveEvents({ customers: [{ id: "c5" }] }).events.length, 0);
});

check("an order that came from a shop is an import; one somebody typed is not", () => {
  const result = deriveEvents({
    orders: [
      { id: "o1", createdAtMs: T0, commerce: { provider: "etsy", externalId: "1042" } },
      { id: "o2", createdAtMs: T0 + DAY, customFields: { Source: "Shopify" } },
      { id: "o3", createdAtMs: T0 + 2 * DAY }
    ]
  });
  assert.deepStrictEqual(names(result), ["external_order_imported", "external_order_imported", "order_created"]);
  // Which is the difference between a commerce workspace being activated and not.
  assert.strictEqual(activationProgress(result.events, "commerce").activated, true);
});

check("a workspace that has only typed its own orders has not imported anything", () => {
  const result = deriveEvents({ orders: [{ id: "o1", createdAtMs: T0 }] });
  assert.strictEqual(activationProgress(result.events, "commerce").activated, false);
  assert.strictEqual(activationProgress(result.events, "general").activated, true, "typing a real order is still real work");
});

check("a bank transaction linked to an order is the match that activates a finance workspace", () => {
  const unlinked = deriveEvents({ bankTransactions: [{ id: "t1", date: T0, linkedOrderId: "" }] });
  assert.deepStrictEqual(names(unlinked), [], "an unreconciled transaction is not a match");
  const linked = deriveEvents({ bankTransactions: [{ id: "t1", reviewedAt: T0, linkedOrderId: "o1" }] });
  assert.deepStrictEqual(names(linked), ["bank_match_completed"]);
  assert.strictEqual(activationProgress(linked.events, "finance").activated, true);
});

check("stock that has been drawn down is stock consumed; a full shelf is not", () => {
  const shelf = deriveEvents({ inventoryItems: [{ id: "i1", createdAtMs: T0 }] });
  assert.deepStrictEqual(names(shelf), ["inventory_item_created"]);
  assert.strictEqual(activationProgress(shelf.events, "inventory").activated, false);
  const used = deriveEvents({ inventoryItems: [{ id: "i1", createdAtMs: T0, consumedQuantity: 3, lastConsumedAtMs: T0 + DAY }] });
  assert.strictEqual(activationProgress(used.events, "inventory").activated, true);
});

check("an unlinked shop is not a connection", () => {
  const result = deriveEvents({
    shopifyStores: [
      { id: "s1", shop: "live.myshopify.com", status: "active", linkedAt: T0 },
      { id: "s2", shop: "gone.myshopify.com", status: "unlinked", linkedAt: T0 }
    ]
  });
  assert.strictEqual(result.events.length, 1, "a store that was unlinked still counted as connected");
  assert.strictEqual(result.events[0].subjectId, "s1");
});

check("finishing the wizard is recorded as both starting and finishing it", () => {
  // Not a guess: you cannot finish something you did not begin, and the wizard
  // does not stamp when it was opened.
  const result = deriveEvents({ settings: { businessOnboardingCompletedAt: { toMillis: () => T0 } } });
  assert.deepStrictEqual(names(result), ["onboarding_completed", "onboarding_started"].sort());
});

check("the events come back in the order they happened", () => {
  const result = deriveEvents({
    orders: [{ id: "o2", createdAtMs: T0 + 5 * DAY }, { id: "o1", createdAtMs: T0 }],
    customers: [{ id: "c1", createdAtMs: T0 + 2 * DAY }]
  });
  const times = result.events.map((e) => e.atMs);
  assert.deepStrictEqual(times, [...times].sort((a, b) => a - b), "a lifecycle read from unsorted events dates activation wrongly");
});

check("every derived name is one the registry declares", () => {
  // A derivation emitting a name nobody declared would be silently ignored by
  // the engine, and the workspace would look inactive for no visible reason.
  const result = deriveEvents({
    orders: [{ id: "o1", createdAtMs: T0, commerce: { provider: "etsy" } }, { id: "o2", createdAtMs: T0, isDelivered: true }],
    customers: [{ id: "c1", createdAtMs: T0 }],
    bankConnections: [{ id: "b1", linkedAt: T0 }],
    bankTransactions: [{ id: "t1", reviewedAt: T0, linkedOrderId: "o1" }],
    inventoryItems: [{ id: "i1", createdAtMs: T0, consumedQuantity: 1, lastConsumedAtMs: T0 }],
    accountingConnections: [{ id: "a1", linkedAtMs: T0, provider: "xero" }],
    shopifyStores: [{ id: "s1", status: "active", linkedAt: T0 }],
    etsyConnections: [{ id: "e1", status: "connected", connectedAtMs: T0 }],
    settings: { businessOnboardingCompletedAt: T0 }
  });
  assert.ok(result.events.length >= 9);
  for (const event of result.events) {
    assert.strictEqual(describeEvent(event.name).declared, true, `${event.name} is not in the registry`);
  }
});

check("what cannot be derived is named, not quietly missing", () => {
  const result = deriveEvents({});
  assert.ok(Array.isArray(result.missing) && result.missing.length > 0);
  // The population this whole system exists to find: somebody who opened a
  // connect screen and gave up. No document records that.
  assert.ok(result.missing.includes("integration_connect_started"));
  // And AI activation cannot be derived at all, so a workspace on that path
  // must never be reported as failed on derived data alone.
  assert.ok(result.missing.includes("grounded_ai_answer"));
  for (const name of UNDERIVABLE_EVENTS) {
    assert.strictEqual(describeEvent(name).declared, true, `${name} is named as underivable but is not a real event`);
  }
});

check("an empty workspace derives nothing and claims nothing", () => {
  const result = deriveEvents({});
  assert.deepStrictEqual(result.events, []);
  assert.strictEqual(lifecycleState({ events: result.events, path: "commerce", nowMs: T0 }).state, "new");
  assert.deepStrictEqual(deriveEvents().events, []);
  assert.deepStrictEqual(deriveEvents({ orders: null, customers: "nonsense" }).events, []);
});

check("the whole path: documents in, a lifecycle state out", () => {
  // A workspace that connected Etsy in July, took one order, and has done
  // nothing since — which is the shape the funnel audit found.
  const derived = deriveEvents({
    settings: { businessOnboardingCompletedAt: T0 },
    etsyConnections: [{ id: "e1", status: "connected", connectedAtMs: T0 }],
    orders: [{ id: "o1", createdAtMs: T0 + DAY, commerce: { provider: "etsy", externalId: "1" } }]
  });
  const state = lifecycleState({ events: derived.events, path: "commerce", nowMs: T0 + 60 * DAY });
  assert.strictEqual(state.progress.activated, true, "the order did arrive; they were served once");
  assert.strictEqual(state.state, "dormant");
  assert.strictEqual(state.reason, "no_meaningful_activity");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ LIFECYCLE DERIVE GEÇTİ");
})();

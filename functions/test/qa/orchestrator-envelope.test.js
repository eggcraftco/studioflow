// The response standard (§13) and the freshness rules (§14), asserted as a
// contract rather than as a description of the code.
//
// The two failures this is here to prevent are both quiet ones: a stale figure
// presented as live, and an answer that left something out without saying so.
// Neither shows up as an error — they show up as a confident wrong number in
// front of a business owner.
//
// Run: node test/qa/orchestrator-envelope.test.js
const assert = require("assert");
const envelope = require("../../orchestrator/envelope");
const freshness = require("../../orchestrator/freshness");
const untrusted = require("../../orchestrator/untrusted");
const fixtures = require("../fixtures/orchestrator");

let failures = 0;
const check = (name, run) => {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
};

const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

check("every envelope carries the keys a channel is allowed to rely on", () => {
  const built = envelope.finish({ capability: "get_commerce_overview", data: { orders: { count: 0 } }, nowMs: NOW });
  for (const key of ["ok", "action", "state", "data", "freshness", "partial", "warnings", "entityRefs", "suggestedActions", "summary"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(built, key), `missing ${key}`);
  }
  assert.strictEqual(built.freshness.generatedAt, new Date(NOW).toISOString());
});

check("the state vocabulary is closed, and queued is not completed", () => {
  assert.ok(envelope.STATES.includes("queued") && envelope.STATES.includes("completed"));
  assert.notStrictEqual("queued", "completed");
  assert.throws(() => envelope.finish({ capability: "x", state: "done", nowMs: NOW }), /not in the closed vocabulary/);
  // §25: a queued request must be able to say so and must not read as finished.
  const queued = envelope.finish({ capability: "x", state: "queued", nowMs: NOW });
  assert.strictEqual(queued.state, "queued");
});

check("a warning code that is not in the closed list is refused", () => {
  assert.throws(() => envelope.warning("amazon_probably_fine", "..."), /closed list/);
  for (const code of ["mixed_currency", "tax_needs_review", "needs_review_truncated", "source_state_unknown", "plan_limited", "estimated"]) {
    assert.ok(envelope.WARNING_CODES.includes(code), `${code} must be a known warning code`);
  }
});

check("a warning is bounded, single-line and control-free, message and fields alike", () => {
  // `envelope.warning` applied `String(message)` and `String(extra.channel)`
  // with no bound at all, and `freshness.build` interpolates a bank
  // connection's own provider key into four warning sentences — so a
  // never-synced connection produced a 323-character multi-line message, a
  // 242-character channel, and 227 characters of injected prose quoted into
  // "This answer is incomplete: …". A warning leaves the server beside the data
  // and the renderer quotes one of them, so it gets the same treatment as a
  // label.
  const poison = fixtures.POISON;
  const row = envelope.warning("estimated", `sync failed for ${poison}`, { channel: poison, connectionId: poison, section: poison });
  assert.ok(row.message.length <= envelope.WARNING_MESSAGE_MAX, `a warning message is ${row.message.length} characters`);
  assert.ok(row.channel.length <= envelope.WARNING_FIELD_MAX);
  assert.ok(row.connectionId.length <= envelope.WARNING_FIELD_MAX);
  assert.ok(row.section.length <= envelope.WARNING_FIELD_MAX);
  for (const value of [row.message, row.channel, row.connectionId, row.section]) {
    assert.ok(!untrusted.hasUnsafeCharacters(value), "a warning field still carries a control or bidi character");
    assert.ok(!/[\n\r]/.test(value), "a warning field spans two lines");
  }
  // And an honest sentence this module's own capabilities write is not clipped:
  // the longest is 215 characters.
  const long = "x".repeat(215);
  assert.strictEqual(envelope.warning("estimated", long).message, long);
});

check("staleness is per source: a bank feed and a shop age at different rates", () => {
  // scheduledBankSync runs every 8 hours with a 6-hour minimum interval, so a
  // 7-hour-old bank sync is ON TIME. A 7-hour-old shop sync is not.
  const bank = freshness.sourceRow({ provider: "truelayer", kind: "bank", entity: "finance", lastSuccessAtMs: NOW - 7 * HOUR, nowMs: NOW, contributed: true });
  const shop = freshness.sourceRow({ provider: "shopify", kind: "commerce", entity: "orders", lastSuccessAtMs: NOW - 7 * HOUR, nowMs: NOW, contributed: true });
  assert.strictEqual(bank.state, "fresh", "a 7-hour-old bank sync is on schedule");
  assert.strictEqual(shop.state, "stale", "a 7-hour-old shop sync is behind");
  assert.strictEqual(bank.staleAfterMs, 10 * HOUR);
  assert.strictEqual(shop.staleAfterMs, 6 * HOUR);
});

check("inventory is unsupported, never stale: there is no inventory sync to be behind", () => {
  const row = freshness.inventorySourceRow({ nowMs: NOW });
  assert.strictEqual(row.state, "unsupported");
  assert.strictEqual(row.staleAfterMs, null);
  const built = freshness.build([row], { nowMs: NOW });
  assert.strictEqual(built.freshness.inventoryLastSync, null);
  assert.strictEqual(built.partial, false, "an unsupported source is not an incomplete answer");
});

check("a contributing source with no readable sync time makes the answer partial and says which", () => {
  // The dangerous case: Amazon orders ARE in the answer, but this surface
  // cannot read Amazon's connection status. Reporting ordersLastSync: null
  // without saying so reads exactly like "live data".
  const rows = [
    freshness.sourceRow({ provider: "shopify", kind: "commerce", entity: "orders", lastSuccessAtMs: NOW - HOUR, contributed: true, nowMs: NOW }),
    freshness.sourceRow({ provider: "amazon", kind: "commerce", entity: "orders", state: "not_visible", contributed: true, nowMs: NOW })
  ];
  const built = freshness.build(rows, { nowMs: NOW });
  assert.strictEqual(built.partial, true);
  assert.strictEqual(built.freshness.ordersLastSync, null);
  const codes = built.warnings.map((row) => row.code);
  assert.ok(codes.includes("status_not_visible_from_this_surface"), `expected the Amazon warning, got ${codes.join(",")}`);
  assert.ok(built.warnings.some((row) => row.channel === "amazon"), "the warning must name the channel");
});

check("null ordersLastSync is allowed only when nothing that syncs contributed", () => {
  const built = freshness.build([], { nowMs: NOW });
  assert.strictEqual(built.freshness.ordersLastSync, null);
  assert.strictEqual(built.partial, false, "a NivaDesk-only answer is complete, not partial");
});

check("the top-level sync time is the OLDEST contributing source, not the newest", () => {
  const rows = [
    freshness.sourceRow({ provider: "shopify", kind: "commerce", entity: "orders", lastSuccessAtMs: NOW - HOUR, contributed: true, nowMs: NOW }),
    freshness.sourceRow({ provider: "etsy", kind: "commerce", entity: "orders", lastSuccessAtMs: NOW - 4 * HOUR, contributed: true, nowMs: NOW })
  ];
  const built = freshness.build(rows, { nowMs: NOW });
  assert.strictEqual(built.freshness.ordersLastSync, new Date(NOW - 4 * HOUR).toISOString(),
    "an answer is only as fresh as the source that lags most");
});

check("a stale source that contributed nothing is reported but does not make the answer partial", () => {
  const rows = [freshness.sourceRow({ provider: "woocommerce", kind: "commerce", entity: "orders", lastSuccessAtMs: NOW - 40 * HOUR, contributed: false, nowMs: NOW })];
  const built = freshness.build(rows, { nowMs: NOW });
  assert.strictEqual(built.partial, false);
  assert.ok(built.warnings.some((row) => row.code === "channel_stale"));
});

check("a group channel gets the same answer with the person and the money removed", () => {
  // WA §93: a shared thread defaults to no PII and no financial data, and the
  // capability must not have to remember that.
  const profile = { security: { pii_level: "none", financial_data_allowed: false } };
  const built = envelope.finish({
    capability: "search_commerce_orders",
    data: { orders: [{ orderId: "o1", customer: { name: "Jane" }, totals: { grandTotal: 100 } }] },
    nowMs: NOW,
    channelProfile: profile
  });
  const row = built.data.orders[0];
  assert.deepStrictEqual(row.customer, { restricted: true, reason: "channel_pii_policy" });
  assert.deepStrictEqual(row.totals, { restricted: true, reason: "channel_financial_policy" });
  assert.strictEqual(row.orderId, "o1", "the non-sensitive fields survive");
});

check("the group redaction reads the value, not the field name", () => {
  // Both directions are failures, and the ambiguous key is `value`: it is money
  // in an inventory valuation and a count in a fact row.
  const profile = { security: { pii_level: "none", financial_data_allowed: false } };
  const data = envelope.applyChannelProfile({
    counts: { critical: 1 },
    value: { cost: 1200, retail: 3000, currency: "GBP" },
    items: [{
      title: "3 transaction(s) have no receipt attached",
      reason: "420 GBP still outstanding. Dispatched with no tracking number recorded.",
      facts: [{ key: "count", value: 2 }, { key: "amount", value: 120.5, currency: "GBP" }]
    }]
  }, profile);

  assert.deepStrictEqual(data.value, { restricted: true, reason: "channel_financial_policy" }, "a stock valuation is money");
  assert.strictEqual(data.items[0].facts[0].value, 2, "a count is not money and must survive");
  assert.strictEqual(data.items[0].facts[1].value.restricted, true, "an amount fact is money whatever its field is called");
  assert.ok(!/420/.test(data.items[0].reason), "the amount was written into a sentence and survived");
  assert.ok(/withheld/.test(data.items[0].reason), "and the sentence has to say so, not silently lose a number");
  assert.strictEqual(data.items[0].title, "3 transaction(s) have no receipt attached", "a plain count in a title is not an amount");
  assert.strictEqual(data.counts.critical, 1, "severity counts are not money");
});

check("a channel that allows money and people is handed the answer untouched", () => {
  const data = { totals: { grandTotal: 100 }, customer: { name: "Jane" } };
  assert.strictEqual(envelope.applyChannelProfile(data, { security: { pii_level: "full", financial_data_allowed: true } }), data);
  assert.strictEqual(envelope.applyChannelProfile(data, null), data);
});

check("duplicate warnings collapse: one problem is reported once", () => {
  const built = envelope.finish({
    capability: "x",
    warnings: [envelope.warning("estimated", "same"), envelope.warning("estimated", "same")],
    nowMs: NOW
  });
  assert.strictEqual(built.warnings.length, 1);
});

console.log(failures === 0 ? "\nAll envelope checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

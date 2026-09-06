// Connection health and accounting status: the two capabilities whose wrong
// answers look most like right ones (§11).
//
// "Etsy: never synced" about a healthy Etsy connection, "Amazon: disconnected"
// about a connection this project simply cannot see, and "0 failed postings"
// about a ledger nothing has ever been posted to are all fluent, confident and
// false.
//
// Run: node test/qa/orchestrator-integrations.test.js
const assert = require("assert");
const health = require("../../orchestrator/integrationHealth");
const accounting = require("../../orchestrator/accountingStatus");
const fixtures = require("../fixtures/orchestrator");

let failures = 0;
const check = (name, run) => {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
};

const NOW = fixtures.NOW;
const HOUR = 60 * 60 * 1000;
const ctx = fixtures.ownerContext();
const rowFor = (result, provider) => result.data.connections.find((row) => row.provider === provider);

check("Etsy's freshness comes from its connection, because Etsy writes no health document", () => {
  const snapshot = fixtures.mixedSnapshot();
  const result = health.integrationHealth(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  const etsy = rowFor(result, "etsy");
  assert.strictEqual(etsy.authStatus, "ok");
  assert.strictEqual(etsy.ordersFreshness.state, "fresh",
    "pairing healthView with the connection document is mandatory, or a working Etsy sync reports \"never\"");
  assert.ok(etsy.lastSuccessfulSync, "and it must be able to say when");
});

check("Amazon is not visible, not broken — and its orders are still counted elsewhere", () => {
  const snapshot = fixtures.mixedSnapshot();
  const result = health.integrationHealth(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  const amazon = rowFor(result, "amazon");
  assert.strictEqual(amazon.authStatus, "not_visible");
  assert.notStrictEqual(amazon.authStatus, "disconnected", "a status nobody can read is not a status of broken");
  assert.strictEqual(amazon.availability, "data_only", "the workspace has Amazon orders, so the channel carries figures");
  assert.ok(result.warnings.some((row) => row.code === "status_not_visible_from_this_surface"));
});

check("eBay is adapter-only while no eBay order exists, and data_only the moment one does", () => {
  const snapshot = fixtures.mixedSnapshot();
  assert.strictEqual(rowFor(health.integrationHealth(snapshot, {}, ctx, { nowMs: snapshot.nowMs }), "ebay").availability, "adapter_only");

  const withEbay = fixtures.mixedSnapshot();
  withEbay.orders = [...withEbay.orders, { id: "o_ebay", commerce: { provider: "ebay", currency: "GBP" }, paidAmount: 10, createdAt: "2026-09-08" }];
  assert.strictEqual(rowFor(health.integrationHealth(withEbay, {}, ctx, { nowMs: withEbay.nowMs }), "ebay").availability, "data_only");
});

check("a connection that needs reconnecting says so, and the answer warns about it", () => {
  const snapshot = fixtures.mixedSnapshot();
  snapshot.connections.shopify[0].status = "reconnect_required";
  const result = health.integrationHealth(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  const shopify = rowFor(result, "shopify");
  assert.strictEqual(shopify.authStatus, "reconnect_required");
  assert.strictEqual(shopify.reconnectRequired, true);
  assert.strictEqual(shopify.availability, "connected_needs_reconnect");
  assert.ok(result.warnings.some((row) => row.code === "channel_excluded_auth" && row.channel === "shopify"));
});

check("orders held for review are counted per connection, without the customer's name", () => {
  const snapshot = fixtures.mixedSnapshot();
  // The engine's review documents carry customerName; the loader projects it
  // away, and nothing here may put it back.
  snapshot.reviewQueue = [{ id: "r1", provider: "shopify", connectionId: "shop_1", reason: "ambiguous_customer" }];
  snapshot.heldOrders = [{ id: "h1", reason: "no_secret" }];
  const result = health.integrationHealth(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  assert.deepStrictEqual(rowFor(result, "shopify").reviewCount, { queue: 1, held: 0 });
  assert.ok(!/customerName/.test(JSON.stringify(result.data)));
});

check("a stale sync is reported against the commerce threshold, not the bank's", () => {
  const snapshot = fixtures.mixedSnapshot();
  snapshot.commerceHealth[0].doc.orders.lastSuccessAtMs = NOW - 8 * HOUR;
  const result = health.integrationHealth(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  const shopify = rowFor(result, "shopify");
  assert.strictEqual(shopify.ordersFreshness.state, "stale", "8 hours is behind for a shop");
  assert.strictEqual(shopify.ordersFreshness.staleAfterMs, 6 * HOUR);
});

check("no row carries anything that looks like a credential", () => {
  const snapshot = fixtures.mixedSnapshot();
  snapshot.connections.shopify[0] = { ...snapshot.connections.shopify[0], accessToken: "shpat_secret", refreshToken: "r_secret" };
  const result = health.integrationHealth(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  const serialised = JSON.stringify(result.data);
  assert.ok(!/shpat_secret|r_secret/.test(serialised), "a token reached the assistant");
  assert.ok(!/token|secret|password/i.test(Object.keys(rowFor(result, "shopify")).join(" ")));
});

check("banking and accounting rows are gated separately, and the withheld section is named", () => {
  const snapshot = fixtures.mixedSnapshot();
  const limited = fixtures.ownerContext({ isOwner: false, areas: { orders: true, bankFeed: false }, accountingReader: false });
  const result = health.integrationHealth(snapshot, {}, limited, { nowMs: snapshot.nowMs });
  const sections = result.warnings.filter((row) => row.code === "section_not_permitted").map((row) => row.section);
  assert.deepStrictEqual(sections.sort(), ["accounting", "banking"]);
});

/* ------------------------------------------------------------- accounting */

const accountingSnapshot = () => ({
  companyId: "co_1",
  nowMs: NOW,
  settings: fixtures.settings,
  connections: {
    accounting: [
      { id: "qbo_1", provider: "quickbooks", companyName: "Test Studio Ltd", mode: "read_only", status: "connected", lastSyncAtMs: NOW - 2 * HOUR }
    ]
  },
  accountingAttention: [
    { id: "a1", provider: "quickbooks", kind: "duplicate_contact", severity: "error", message: "Two contacts share a name", firstSeenAtMs: NOW - 3 * 24 * HOUR }
  ],
  bankRows: [
    { id: "b1", amount: -50, currency: "GBP", bookingDate: "2026-09-01", category: "Materials", reviewStatus: "reviewed", splits: 0, categoryAuto: false },
    { id: "b2", amount: -20, currency: "GBP", bookingDate: "2026-09-02", category: "", reviewStatus: "", splits: 0, categoryAuto: false },
    { id: "b3", amount: -30, currency: "GBP", bookingDate: "2026-09-03", category: "Software", reviewStatus: "needs_info", splits: 0, categoryAuto: false }
  ]
});

check("the posting counters are unavailable, because nothing has ever been posted", () => {
  const result = accounting.accountingSyncStatus(accountingSnapshot(), {}, ctx, { nowMs: NOW });
  assert.strictEqual(result.data.phase, "read_only");
  for (const key of accounting.POSTING_PHASES) {
    assert.strictEqual(result.data.postings[key].available, false, `${key} must not be published as a count`);
    assert.strictEqual(result.data.postings[key].reason, "postings_not_implemented");
  }
});

check("attention rows are read, and reading them writes nothing", () => {
  // store.openAttention CREATES or bumps a document. A readOnlyHint:true tool
  // that called it would be exactly the mismatch 1.1.1 was rejected over.
  const source = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "orchestrator", "accountingStatus.js"), "utf8");
  const calls = source.match(/\b(openAttention|resolveAttention|recordAudit)\s*\(/g) || [];
  assert.deepStrictEqual(calls, [], `accountingStatus.js calls a writer: ${calls.join(", ")}`);
  const requires = [...source.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.ok(!requires.some((name) => /accounting\/core\/store/.test(name)), "the writing store module must not be imported at all");
  const result = accounting.accountingSyncStatus(accountingSnapshot(), {}, ctx, { nowMs: NOW });
  assert.strictEqual(result.data.attention.length, 1);
  assert.strictEqual(result.data.attention[0].severity, "high", "a stored error maps to high");
});

check("readiness counts what is not ready, and why", () => {
  const result = accounting.accountingSyncStatus(accountingSnapshot(), {}, ctx, { nowMs: NOW });
  assert.strictEqual(result.data.readiness.ready, 1);
  assert.strictEqual(result.data.readiness.notReady.uncategorised, 1);
  assert.strictEqual(result.data.readiness.notReady.needsInfo, 1);
});

check("two primary writers is a conflict, and it is reported as one", () => {
  const snapshot = accountingSnapshot();
  snapshot.connections.accounting = [
    { id: "qbo_1", provider: "quickbooks", mode: "primary_write", status: "connected" },
    { id: "xero_1", provider: "xero", mode: "primary_write", status: "connected" }
  ];
  const result = accounting.accountingSyncStatus(snapshot, {}, ctx, { nowMs: NOW });
  assert.strictEqual(result.data.conflict, true);
  assert.strictEqual(result.data.primaryWriter.provider, "quickbooks");
});

check("the accounting source ages on its own 24-hour clock", () => {
  const snapshot = accountingSnapshot();
  snapshot.connections.accounting[0].lastSyncAtMs = NOW - 12 * HOUR;
  const result = accounting.accountingSyncStatus(snapshot, {}, ctx, { nowMs: NOW });
  assert.strictEqual(result.sources[0].state, "fresh", "12 hours is on time for a ledger-day cadence");
  assert.strictEqual(result.sources[0].staleAfterMs, 24 * HOUR);
});

console.log(failures === 0 ? "\nAll integration checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

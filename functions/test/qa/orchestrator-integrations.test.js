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
const { projectBankRow } = require("../../orchestrator/loaders");
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

check("orders held for review are reported, not read and thrown away", () => {
  // The loader reads up to 200 heldIntegrationOrders for this capability, and
  // reviewCountsFor only ever returned a non-zero `held` for providers
  // "manual" and "inbound" — which it is never called with. So the collection
  // was read, paid for and dropped, while the tool description promises
  // "orders held for review".
  const snapshot = fixtures.mixedSnapshot();
  snapshot.heldOrders = [
    { id: "shopify_5001", provider: "shopify", reason: "plan_limit_reached" },
    { id: "inbound_OVER-1", provider: "inbound", reason: "plan_limit_reached" }
  ];
  const result = health.integrationHealth(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  assert.strictEqual(rowFor(result, "shopify").reviewCount.held, 1,
    "a held order carries its own provider, so the row for that provider can show it");
  assert.strictEqual(result.data.heldForReview.total, 2);
  assert.strictEqual(result.data.heldForReview.unattributed, 1,
    "the generic inbound path has no connection row, and its held orders are real sales all the same");

  const render = require("../../orchestrator/render");
  const lines = render.summaryFor({ action: "get_integration_health", data: result.data, warnings: [], freshness: {} }, {});
  assert.ok(lines.some((row) => /2 order\(s\) from your shops are held for review/.test(row.text)),
    lines.map((row) => row.text).join(" | "));
});

check("a held order is shown by a row for every provider that has one, eBay included", () => {
  // The eBay row hardcoded `reviewCount: { queue: 0, held: 0 }` while every
  // other provider went through reviewCountsFor. `heldForReview.total` counts
  // every held row and `unattributed` counts only the ones whose provider has
  // no row — and "ebay" HAS a row — so a held eBay order would have been
  // counted at the top, reported as attributed, and shown by nothing:
  // total 1, unattributed 0, every row 0. That is finding 8's defect, one
  // provider along.
  const snapshot = fixtures.mixedSnapshot();
  snapshot.heldOrders = [{ id: "ebay_1", provider: "ebay", reason: "plan_limit_reached" }];
  const result = health.integrationHealth(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  assert.strictEqual(rowFor(result, "ebay").reviewCount.held, 1, "the held eBay order is counted at the top and shown by no row");
  assert.strictEqual(result.data.heldForReview.total, 1);
  assert.strictEqual(result.data.heldForReview.unattributed, 0, "eBay has a row, so its held orders are attributed to it");

  // Every held row must be visible somewhere: on a provider's row, or in
  // `unattributed`. This is the invariant, not the eBay case.
  const shown = result.data.connections.reduce((sum, row) => sum + row.reviewCount.held, 0);
  assert.strictEqual(shown + result.data.heldForReview.unattributed, result.data.heldForReview.total,
    "a held order counted at the top must be reported by a row or declared unattributed");
});

check("an empty workspace is not told it has six connections", () => {
  // The tool answers "is anything wrong with my connections?". Its headline
  // number counted placeholder rows — four unconnected commerce providers plus
  // the Amazon and eBay rows — so a workspace that had connected nothing was
  // told "6 connection(s) checked; 0 need reconnecting".
  const empty = { companyId: "co_1", nowMs: NOW, settings: fixtures.settings, orders: [], connections: {}, commerceHealth: [] };
  const result = health.integrationHealth(empty, {}, ctx, { nowMs: NOW });
  assert.strictEqual(result.data.count, 0, "there are no connections; the count must not be the number of rows");
  assert.strictEqual(result.data.considered, result.data.connections.length,
    "what the old number measured — channels looked at — is still reported, under its own name");
  assert.ok(result.data.considered > 0, "and the rows themselves still say each channel was considered");

  const render = require("../../orchestrator/render");
  const lines = render.summaryFor({ action: "get_integration_health", data: result.data, warnings: [], freshness: {} }, {});
  const text = lines.map((row) => row.text).join("\n");
  assert.ok(!/6 connection/.test(text), text);
  assert.ok(/0 connection\(s\) set up/.test(lines[0].text), lines[0].text);
});

check("a connection Amazon's own project hides is counted only when its orders prove it exists", () => {
  const withOrders = fixtures.mixedSnapshot();   // carries one Amazon order
  const amazon = rowFor(health.integrationHealth(withOrders, {}, ctx, { nowMs: withOrders.nowMs }), "amazon");
  assert.strictEqual(amazon.connectionKnown, true, "the orders are the only evidence this surface can have");

  const withoutOrders = fixtures.mixedSnapshot();
  withoutOrders.orders = withoutOrders.orders.filter((order) => String((order.commerce || {}).provider || "") !== "amazon");
  const blind = rowFor(health.integrationHealth(withoutOrders, {}, ctx, { nowMs: withoutOrders.nowMs }), "amazon");
  assert.strictEqual(blind.connectionKnown, false, "no orders is no evidence; an assumed connection is an invented one");
  assert.strictEqual(blind.authStatus, "not_visible", "and it is still not called disconnected");
});

check("the counts a health answer states are counts of its own rows", () => {
  const snapshot = fixtures.mixedSnapshot();
  snapshot.connections.shopify[0].status = "reconnect_required";
  const result = health.integrationHealth(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  assert.strictEqual(result.data.count, result.data.connections.filter((row) => row.connectionKnown).length);
  assert.strictEqual(result.data.needsReconnect, result.data.connections.filter((row) => row.reconnectRequired).length);
  assert.strictEqual(result.data.needsReconnect, 1);
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

check("a split transaction is not ready, and the row is built the way the loader builds one", () => {
  // The hand-built fixture was the reason this passed while production was
  // wrong. `loadBank` projects `splits` to its LENGTH, and readinessOf tested
  // `Array.isArray(row.splits)` — false for a number — so the split branch
  // could never fire, `notReady.split` was 0 on every workspace, and every
  // split transaction was counted as "ready to be prepared". The rows here go
  // through the loader's own projection, so a fixture cannot disagree with
  // the shape a capability actually receives again.
  const snapshot = accountingSnapshot();
  snapshot.categoryMappings = [{ category: "Materials", nominalCode: "500", taxCode: "ST" }];
  snapshot.bankRows = [
    projectBankRow("b_split", {
      amount: -50, currency: "GBP", bookingDate: "2026-09-01", category: "Materials", reviewStatus: "reviewed",
      // What the document holds: the array. What a capability sees: its length.
      splits: [{ amount: -30, category: "Materials" }, { amount: -20, category: "Software" }]
    }),
    projectBankRow("b_plain", {
      amount: -10, currency: "GBP", bookingDate: "2026-09-02", category: "Materials", reviewStatus: "reviewed"
    })
  ];
  assert.strictEqual(snapshot.bankRows[0].splits, 2, "the loader hands over a count, not an array");

  const result = accounting.accountingSyncStatus(snapshot, {}, ctx, { nowMs: NOW });
  assert.strictEqual(result.data.readiness.notReady.split, 1, "a split transaction was counted as ready to be prepared");
  assert.strictEqual(result.data.readiness.ready, 1, "only the unsplit row is ready");

  // And the pure function agrees whichever shape it is handed, which is what
  // makes the hand-built fixtures elsewhere in this file honest rather than
  // lucky.
  const asArray = [{ category: "Materials", reviewStatus: "reviewed", splits: [{ amount: -30 }, { amount: -20 }] }];
  assert.strictEqual(accounting.readinessOf(asArray, snapshot.categoryMappings).notReady.split, 1);
  assert.strictEqual(accounting.splitCount({ splits: 2 }), 2);
  assert.strictEqual(accounting.splitCount({ splits: [] }), 0);
  assert.strictEqual(accounting.splitCount({}), 0);
});

check("readiness is measured against the workspace's own category map, and says which one", () => {
  // readinessOf branched on `connection.mappings`, which can never exist: the
  // loader projects an accountingConnections document to seven fields, none of
  // them mappings, and the category map lives on pandleConnection/main. So
  // every workspace was scored against the built-in map while the answer said
  // "ready to be prepared" as a flat fact.
  const workspaceMap = [{ category: "Materials", nominalCode: "500", taxCode: "ST" }];

  const own = accountingSnapshot();
  own.categoryMappings = workspaceMap;
  const honoured = accounting.accountingSyncStatus(own, {}, ctx, { nowMs: NOW });
  assert.strictEqual(honoured.data.readiness.mappingSource, "workspace");
  assert.strictEqual(honoured.data.readiness.ready, 1, "the Materials row is mapped in this workspace's own map");

  // "Software" is in the default map and NOT in this workspace's, so a reviewed
  // Software row is unmapped here — the case the old code could never reach.
  const narrow = accountingSnapshot();
  narrow.bankRows = [{ id: "b4", amount: -30, currency: "GBP", bookingDate: "2026-09-03", category: "Software", reviewStatus: "reviewed", splits: 0, categoryAuto: false }];
  narrow.categoryMappings = workspaceMap;
  const scored = accounting.accountingSyncStatus(narrow, {}, ctx, { nowMs: NOW });
  assert.strictEqual(scored.data.readiness.ready, 0, "a category the workspace has not mapped is not ready");
  assert.strictEqual(scored.data.readiness.notReady.unmapped, 1);

  // And a workspace with no map of its own is told which map answered.
  const fallback = accounting.accountingSyncStatus(accountingSnapshot(), {}, ctx, { nowMs: NOW });
  assert.strictEqual(fallback.data.readiness.mappingSource, "default");
  const render = require("../../orchestrator/render");
  const lines = render.summaryFor({ action: "get_accounting_sync_status", data: fallback.data, warnings: [], freshness: {} }, {});
  assert.ok(lines.some((row) => /default category map/.test(row.text)),
    "the sentence states the figure as fact; it has to name the map behind it");
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

// The sync: what leaves the zone, what is stored, what is logged, and what
// happens to each failure on its own.
const assert = require("assert");
const { createSync } = require("../src/sync");
const { validateSafeEnvelope } = require("../src/envelope");
const { scanForPii } = require("../src/amazon/sanitize");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const T0 = 1_700_000_000_000;

const rawOrder = (id, extra = {}) => ({
  AmazonOrderId: id, PurchaseDate: "2026-09-01T10:00:00Z", LastUpdateDate: "2026-09-02T10:00:00Z", OrderStatus: "Shipped",
  FulfillmentChannel: "MFN", MarketplaceId: "A1F83G8C2ARO7P", OrderTotal: { CurrencyCode: "GBP", Amount: "42.00" }, ...extra
});
const rawItem = (extra = {}) => ({ OrderItemId: "i1", ASIN: "B0", SellerSKU: "S", Title: "Ring", QuantityOrdered: 1, ItemPrice: { CurrencyCode: "GBP", Amount: "42.00" }, ...extra });

function harness({ orders = [rawOrder("111-1")], items = [rawItem()], bridgeOk = true, tokenError = null, ordersError = null } = {}) {
  const config = { lwaClientId: "cid", lwaClientSecret: "cs", syncOverlapMinutes: 15, syncMaxOrdersPerRun: 500, orderRetentionDays: 90 };
  const stored = [];
  const synced = [];
  const reauth = [];
  const sent = [];
  const logs = [];
  const connection = { id: "conn-1", companyId: "co-1", status: "active", cursorMs: T0 - 3600_000,
    marketplaces: [{ marketplaceId: "A1F83G8C2ARO7P", participating: true }, { marketplaceId: "A13V1IB3VIYZZH", participating: false }] };
  const connections = {
    async listActive() { return [connection]; },
    async refreshTokenFor() { if (tokenError) throw tokenError; return "Atzr|refresh"; },
    async markNeedsReauth(id, reason) { reauth.push({ id, reason }); },
    async markSynced(id, patch) { synced.push({ id, ...patch }); },
    async saveSafeOrder(id, order, its) { stored.push({ id, order, items: its }); },
    async sweepOrders() { return { deleted: 0 }; }
  };
  const egress = { fetch: async (url) => {
    if (/api\.amazon\.com/.test(url)) return { ok: true, status: 200, json: async () => ({ access_token: "Atza|access", expires_in: 3600 }) };
    throw new Error(`unexpected ${url}`);
  } };
  const clientFactory = () => ({
    async searchOrders() { if (ordersError) throw ordersError; return { orders, nextToken: null }; },
    async getOrderItems() { return { items, nextToken: null }; }
  });
  const bridge = async (envelope) => { sent.push(envelope); return bridgeOk ? { ok: true, status: 200 } : { ok: false, status: 0, reason: "http_500" }; };
  const sync = createSync({ config, connections, egress, bridge, now: () => T0, clientFactory,
    logger: { log: (l) => logs.push(l), warn: (l) => logs.push(l), error: (l) => logs.push(l) } });
  return { sync, stored, synced, reauth, sent, logs, connection };
}

check("a clean order becomes a valid envelope, is sent, stored as its safe half, and moves the cursor", () => {
  const h = harness();
  return h.sync.runOnce().then((t) => {
    assert.strictEqual(t.sent, 1, JSON.stringify(t));
    assert.strictEqual(validateSafeEnvelope(h.sent[0]).ok, true);
    assert.strictEqual(h.sent[0].companyId, "co-1");
    assert.strictEqual(h.sent[0].taxKnown, false, "tax reported as known while TAX is withheld");
    assert.strictEqual(h.stored.length, 1);
    assert.strictEqual(h.synced[0].cursorMs, Date.parse("2026-09-02T10:00:00Z"));
  });
});

check("a response carrying a person is an anomaly: the values are stripped, only paths are logged, nothing personal is stored or sent", () => {
  const h = harness({
    orders: [rawOrder("111-2", { BuyerInfo: { BuyerEmail: "jane@example.com", BuyerName: "Jane" }, ShippingAddress: { Name: "Jane Doe", PostalCode: "N1" } })],
    items: [rawItem({ GiftMessageText: "with love from Jane" })]
  });
  return h.sync.runOnce().then((t) => {
    assert.strictEqual(t.anomalies, 1);
    assert.strictEqual(t.sent, 1, "the sanitized order should still travel");
    const everything = JSON.stringify({ sent: h.sent, stored: h.stored, logs: h.logs });
    assert.ok(!/jane|Jane|N1|with love/.test(everything), "a personal value leaked into the envelope, the store, or the log");
    assert.ok(h.logs.some((l) => /anomaly/.test(l) && /order\.BuyerInfo/.test(l)), "the anomaly log does not name the path");
    assert.deepStrictEqual(scanForPii(h.sent[0]), []);
  });
});

check("a personal field the sanitizer did not know about is caught by the scan: the order is neither sent nor stored", () => {
  // The denylist protects against the fields we have thought of. When the
  // scan finds a person under a field it has never heard of, the sanitizer's
  // model of the payload is wrong — the right response is to hold that order
  // for review, not to trust the second layer alone and send.
  const h = harness({ orders: [rawOrder("111-3", { SomethingNew: { Name: "Jane Doe", AddressLine1: "1 Road" } })] });
  return h.sync.runOnce().then((t) => {
    assert.strictEqual(t.anomalies, 1, JSON.stringify(t));
    assert.strictEqual(t.sent, 0, "an order with an unrecognised personal field was sent");
    assert.strictEqual(h.stored.length, 0, "an order with an unrecognised personal field was stored");
    assert.ok(!/Jane|1 Road/.test(JSON.stringify(h.logs)), "a value leaked into the log");
  });
});

check("when one order is refused, the cursor stays behind it even if a newer one was delivered", () => {
  // Two orders: the older is refused by the bridge, the newer delivered. The
  // cursor must not move to the newer one's date, or the refused order is
  // never seen again.
  const older = rawOrder("111-4", { LastUpdateDate: "2026-09-02T09:00:00Z" });
  const newer = rawOrder("111-5", { LastUpdateDate: "2026-09-02T11:00:00Z" });
  const h = harness({ orders: [older, newer] });
  let n = 0;
  const bridge = async (envelope) => { n += 1; h.sent.push(envelope); return envelope.order.AmazonOrderId === "111-4" ? { ok: false, status: 0, reason: "http_500" } : { ok: true, status: 200 }; };
  const sync = createSync({ config: { lwaClientId: "c", lwaClientSecret: "s", syncOverlapMinutes: 15, syncMaxOrdersPerRun: 500, orderRetentionDays: 90 },
    connections: { async listActive() { return [h.connection]; }, async refreshTokenFor() { return "r"; }, async markSynced(id, patch) { h.synced.push(patch); }, async markNeedsReauth() {}, async saveSafeOrder() {}, async sweepOrders() { return { deleted: 0 }; } },
    egress: { fetch: async () => ({ ok: true, status: 200, json: async () => ({ access_token: "a", expires_in: 3600 }) }) },
    bridge, now: () => T0, clientFactory: () => ({ async searchOrders() { return { orders: [older, newer], nextToken: null }; }, async getOrderItems() { return { items: [rawItem()], nextToken: null }; } }),
    logger: { log() {}, warn() {}, error() {} } });
  return sync.runOnce().then((t) => {
    assert.strictEqual(t.sent, 1); assert.strictEqual(t.refused, 1); assert.strictEqual(n, 2);
    assert.strictEqual(h.synced[0].cursorMs, h.connection.cursorMs, `the cursor moved to ${h.synced[0].cursorMs} past a refused order`);
  });
});

check("an order the bridge refuses is not stored and the cursor does not move past it", () => {
  const h = harness({ bridgeOk: false });
  return h.sync.runOnce().then((t) => {
    assert.strictEqual(t.refused, 1);
    assert.strictEqual(h.stored.length, 0);
    assert.strictEqual(h.synced[0].cursorMs, h.connection.cursorMs, "the cursor moved past an undelivered order");
  });
});

check("a revoked consent marks the connection for re-authorisation and stops there", () => {
  const h = harness({ tokenError: Object.assign(new Error("amazon_lwa_http_400: invalid_grant"), { errorClass: "auth", code: "invalid_grant" }) });
  return h.sync.runOnce().then((t) => {
    assert.strictEqual(t.errors, 1);
    assert.strictEqual(h.reauth.length, 1);
    assert.strictEqual(h.sent.length, 0);
  });
});

check("a transient token failure is an error for this run, not a re-authorisation", () => {
  const h = harness({ tokenError: Object.assign(new Error("amazon_lwa_http_503"), { errorClass: "transient" }) });
  return h.sync.runOnce().then((t) => {
    assert.strictEqual(t.errors, 1);
    assert.strictEqual(h.reauth.length, 0);
  });
});

check("the access token is never logged", () => {
  const h = harness();
  return h.sync.runOnce().then(() => {
    assert.ok(h.logs.every((l) => !/Atza|Atzr/.test(l)), h.logs.join("\n"));
  });
});

check("only participating marketplaces are asked for, with the A1 datasets", () => {
  let seen = null;
  const h = harness();
  const factory = () => ({
    async searchOrders(args) { seen = args; return { orders: [], nextToken: null }; },
    async getOrderItems() { return { items: [], nextToken: null }; }
  });
  const sync = createSync({ config: { lwaClientId: "c", lwaClientSecret: "s", syncOverlapMinutes: 15, syncMaxOrdersPerRun: 500, orderRetentionDays: 90 },
    connections: { async listActive() { return [h.connection]; }, async refreshTokenFor() { return "r"; }, async markSynced() {}, async markNeedsReauth() {}, async saveSafeOrder() {}, async sweepOrders() { return { deleted: 0 }; } },
    egress: { fetch: async () => ({ ok: true, status: 200, json: async () => ({ access_token: "a", expires_in: 3600 }) }) },
    bridge: async () => ({ ok: true }), now: () => T0, clientFactory: factory, logger: { log() {}, warn() {}, error() {} } });
  return sync.runOnce().then(() => {
    assert.deepStrictEqual(seen.marketplaceIds, ["A1F83G8C2ARO7P"]);
    assert.ok(!seen.includedData.includes("BUYER") && !seen.includedData.includes("RECIPIENT") && !seen.includedData.includes("TAX"), seen.includedData.join(","));
  });
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log(`PASS  ${name}`); }
    catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ SYNC GEÇTİ");
})();

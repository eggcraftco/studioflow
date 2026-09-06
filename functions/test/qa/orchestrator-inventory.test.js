// Inventory, and the four things NivaDesk cannot answer about it (§11).
//
// The dangerous answer here is a zero. "Oversell risk: 0" is a claim that
// somebody checked; NivaDesk has no product-to-listing mapping at all, so the
// honest answer is that the question cannot be answered yet.
//
// The other half is parity: the numbers the assistant reports have to be the
// numbers the Inventory screen reports, which is why both call one module.
//
// Run: node test/qa/orchestrator-inventory.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const inventory = require("../../orchestrator/inventory");
const metrics = require("../../orchestrator/inventoryMetrics");
const fixtures = require("../fixtures/orchestrator");

let failures = 0;
const check = (name, run) => {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
};

const ctx = fixtures.ownerContext();

/** A shelf that exercises every rule the summary has. */
const items = [
  { id: "u1", name: "Rolex bracelet", trackingType: "unique", valuationCost: 400, status: "available", sku: "SHARED" },
  { id: "u2", name: "Spare bracelet", trackingType: "unique", valuationCost: 100, status: "reserved", sku: "SHARED", reservations: [{ orderId: "o_late" }] },
  { id: "q1", name: "Spring bars 20mm", trackingType: "quantity", quantity: { onHand: 2, reserved: 0 }, lowStockAt: 5, valuationCost: 1, status: "available", location: "Drawer 3" },
  { id: "q2", name: "Boxes", trackingType: "quantity", quantity: { onHand: 10, reserved: 3 }, lowStockAt: 2, valuationCost: 2, status: "partiallyReserved" },
  { id: "c1", name: "Customer's watch", trackingType: "unique", valuationCost: 5000, status: "available", ownership: "customer" },
  { id: "s1", name: "Sold movement", trackingType: "unique", valuationCost: 300, status: "sold" },
  { id: "a1", name: "Archived dial", trackingType: "unique", valuationCost: 50, status: "archived" },
  { id: "i1", name: "Incoming strap", trackingType: "unique", valuationCost: 60, status: "incoming" }
];

const snapshot = () => ({ companyId: "co_1", nowMs: fixtures.NOW, settings: fixtures.settings, inventoryItems: items });

check("a customer's own item is never valued as the workshop's asset", () => {
  const summary = metrics.summarize(items);
  assert.strictEqual(summary.customerOwnedCount, 1);
  assert.ok(summary.totalValue < 5000, "the customer's £5,000 watch must not be in the workshop's stock value");
  assert.strictEqual(summary.totalValue, 400 + 100 + 2 + 20);
});

check("sold, used, removed and archived items are off the shelf", () => {
  const summary = metrics.summarize(items);
  assert.strictEqual(summary.uniqueCount + summary.quantityCount, 4, "the sold and archived items are not on the shelf");
  assert.strictEqual(summary.incomingCount, 1);
  assert.strictEqual(summary.incomingValue, 60, "incoming stock is counted apart from what is on the shelf");
});

check("reserved value is what is promised, not what is on the shelf", () => {
  const summary = metrics.summarize(items);
  // 3 of 10 boxes at £2 = £6, plus the reserved unique bracelet at £100.
  assert.strictEqual(summary.reservedValue, 106, "holding 3 of 10 must not read as holding all 10");
});

check("the Inventory screen and the assistant compute these numbers in the same place", () => {
  // Parity by construction: if the callable ever grows its own copy of the loop
  // again, this fails.
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "inventory.js"), "utf8");
  assert.ok(/inventoryMetrics\.summarize\(/.test(source), "getInventorySummary no longer calls the shared module");
  assert.ok(
    !/summary\.customerOwnedCount \+= 1/.test(source),
    "the callable has its own copy of the summary loop again; two copies drift"
  );
});

check("the four channel metrics are unavailable with a reason, never zero", () => {
  const result = inventory.inventoryOverview(snapshot(), {}, ctx, { nowMs: fixtures.NOW });
  for (const key of ["channelAllocation", "syncMismatch", "oversellRisk", "multiChannelListings"]) {
    assert.deepStrictEqual(result.data[key], { supported: false, reason: "no_listing_mapping" }, `${key} must not be reported as a number`);
  }
  assert.ok(result.warnings.some((row) => row.code === "unsupported_metric"));
  assert.strictEqual(result.data.sourceOfTruth, "nivadesk");
});

check("inventory freshness is unsupported, because there is no inventory sync at all", () => {
  const result = inventory.inventoryOverview(snapshot(), {}, ctx, { nowMs: fixtures.NOW });
  assert.strictEqual(result.sources.length, 1);
  assert.strictEqual(result.sources[0].state, "unsupported", "\"never synced\" would read as a broken connector");
});

check("low stock is the workspace's own threshold, worst first", () => {
  const result = inventory.inventoryOverview(snapshot(), {}, ctx, { nowMs: fixtures.NOW });
  assert.deepStrictEqual(result.data.lowStock.map((row) => row.itemId), ["q1"]);
  assert.strictEqual(result.data.lowStock[0].lowStockAt, 5);
  assert.strictEqual(result.data.counts.lowStock, 1);
});

check("the status filter uses the runtime's own statuses, not a paraphrase", () => {
  assert.deepStrictEqual(
    inventory.ITEM_STATUSES,
    ["available", "partiallyReserved", "reserved", "incoming", "used", "sold", "removed", "archived"]
  );
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "inventory.js"), "utf8");
  const match = source.match(/const ITEM_STATUSES = \[([^\]]+)\]/);
  assert.ok(match, "could not read ITEM_STATUSES from inventory.js");
  const runtime = match[1].split(",").map((value) => value.trim().replace(/"/g, ""));
  assert.deepStrictEqual(inventory.ITEM_STATUSES.slice(), runtime, "the tool's enum drifted from the runtime's");
});

check("a SKU is a search key, never an identity: two items sharing one are both returned", () => {
  const result = inventory.searchInventoryItems(snapshot(), { query: "SHARED" }, ctx, { nowMs: fixtures.NOW });
  assert.deepStrictEqual(result.data.items.map((row) => row.itemId).sort(), ["u1", "u2"]);
});

check("filtering by a channel returns nothing and says why, rather than guessing", () => {
  const result = inventory.searchInventoryItems(snapshot(), { channel: "etsy" }, ctx, { nowMs: fixtures.NOW });
  assert.strictEqual(result.data.items.length, 0);
  assert.ok(result.warnings.some((row) => row.code === "unsupported_metric"));
});

check("the reserved and low-stock filters select what they say", () => {
  const reserved = inventory.searchInventoryItems(snapshot(), { reserved: true }, ctx, { nowMs: fixtures.NOW });
  assert.deepStrictEqual(reserved.data.items.map((row) => row.itemId).sort(), ["q2", "u2"]);
  const low = inventory.searchInventoryItems(snapshot(), { lowStock: true }, ctx, { nowMs: fixtures.NOW });
  assert.deepStrictEqual(low.data.items.map((row) => row.itemId), ["q1"]);
  const drawer = inventory.searchInventoryItems(snapshot(), { location: "Drawer 3" }, ctx, { nowMs: fixtures.NOW });
  assert.deepStrictEqual(drawer.data.items.map((row) => row.itemId), ["q1"]);
});

console.log(failures === 0 ? "\nAll inventory checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

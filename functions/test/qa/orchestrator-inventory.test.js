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

check("the headline count and the low-stock list describe the same shelf", () => {
  // counts.items was the raw row count while everything beside it came from
  // summarize(), which skips archived, sold, used, removed and customer-owned
  // rows — and the low-stock LIST skipped neither the customer's items nor the
  // incoming ones. So the answer read "N inventory item(s), 1 at or below their
  // low-stock level" beside a list of two, one of them a customer's own.
  const shelf = [
    ...items,
    { id: "c2", name: "Customer's spring bars", trackingType: "quantity", quantity: { onHand: 1, reserved: 0 }, lowStockAt: 5, valuationCost: 1, status: "available", ownership: "customer" },
    { id: "i2", name: "Incoming beads", trackingType: "quantity", quantity: { onHand: 0, reserved: 0 }, lowStockAt: 5, valuationCost: 1, status: "incoming" }
  ];
  const result = inventory.inventoryOverview({ ...snapshot(), inventoryItems: shelf }, {}, ctx, { nowMs: fixtures.NOW });
  const counts = result.data.counts;

  assert.strictEqual(result.data.lowStock.length, counts.lowStock,
    "a list of two beside a count of one means one of them is wrong");
  assert.deepStrictEqual(result.data.lowStock.map((row) => row.itemId), ["q1"],
    "a customer's own item is not the workshop's to reorder, and incoming stock is not on the shelf yet");

  assert.strictEqual(counts.items, 6, "the workshop's own stock: four on the shelf, two incoming");
  assert.strictEqual(counts.matched, shelf.length, "the raw row count is still reported, under a name that says what it is");
  assert.strictEqual(counts.items + counts.offShelf + counts.customerOwned, counts.matched,
    "every row belongs to exactly one population, or the counts are describing two shelves");
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

check("the two capabilities report the SAME reserved figure for the same document", () => {
  // search_inventory read `quantity.reserved` and hardcoded 0 for a one-off;
  // get_inventory_overview's reservedItems hardcoded 1. Same branch of the same
  // ternary over the same document, opposite constants — and the runtime is on
  // the overview's side: inventory.js reserves a unique item by writing
  // `status: "reserved"` and `reservedOrderIds` and never touching
  // `quantity.reserved`, which was created 0 and stays 0. This is the one thing
  // orchestrator-contract §0 exists to prevent, with one channel contradicting
  // itself rather than two channels contradicting each other.
  const overview = inventory.inventoryOverview(snapshot(), {}, ctx, { nowMs: fixtures.NOW });
  const search = inventory.searchInventoryItems(snapshot(), {}, ctx, { nowMs: fixtures.NOW });
  const bySearch = new Map(search.data.items.map((row) => [row.itemId, row.reserved]));
  for (const row of overview.data.reservedForOpenOrders) {
    assert.strictEqual(bySearch.get(row.itemId), row.reserved,
      `${row.itemId}: search_inventory says ${bySearch.get(row.itemId)} held, get_inventory_overview says ${row.reserved}`);
  }
  // Named, so the check is about the one-off and not only about the boxes.
  assert.strictEqual(bySearch.get("u2"), 1, "a reserved one-off reports nothing held");
  assert.strictEqual(bySearch.get("q2"), 3, "3 of 10 boxes are held");

  // And the filter does not contradict its own result: `reserved: true` is
  // documented as "only items being held for an order", so every row it returns
  // must report something held.
  const held = inventory.searchInventoryItems(snapshot(), { reserved: true }, ctx, { nowMs: fixtures.NOW });
  for (const row of held.data.items) {
    assert.ok(row.reserved > 0, `${row.itemId} was selected because it is held and reports reserved: ${row.reserved}`);
  }
  // A one-off that is NOT held still reports zero — the fix is a definition,
  // not a constant moved from one branch of the ternary to the other.
  assert.strictEqual(bySearch.get("u1"), 0, "an available one-off was reported as held");
});

check("available counts what is free, not rows minus rows", () => {
  // `uniqueCount + quantityCount - reservedCount` subtracts a partially
  // reserved row WHOLE, so a shelf with seven free boxes on it answered
  // `available: 0`. `partiallyReserved` exists precisely to mean partly
  // available, and `data` is read by a model the way a summary line is.
  const shelf = [
    { id: "u1", name: "Ring", trackingType: "unique", status: "reserved", quantity: { onHand: 1, reserved: 0 }, reservations: [{ orderId: "o1" }], valuationCost: 100 },
    { id: "q1", name: "Clasp", trackingType: "quantity", status: "partiallyReserved", quantity: { onHand: 10, reserved: 3 }, lowStockAt: 0, valuationCost: 2 }
  ];
  const counts = inventory.inventoryOverview({ ...snapshot(), inventoryItems: shelf }, {}, ctx, { nowMs: fixtures.NOW }).data.counts;
  assert.strictEqual(counts.reserved, 2, "both rows are holding something");
  assert.strictEqual(counts.available, 1, "seven clasps are free, so the shelf is not empty of available stock");

  // The whole shelf, where the two counts overlap on exactly the partially
  // reserved row: reserved is u2 and q2, available is u1, q1 and q2.
  const full = inventory.inventoryOverview(snapshot(), {}, ctx, { nowMs: fixtures.NOW }).data.counts;
  assert.strictEqual(full.reserved, 2);
  assert.strictEqual(full.available, 3, "a partially reserved row is in both populations, and neither is a subtraction");

  // Nothing free at all is still zero — the count did not simply stop being
  // able to say no.
  const allHeld = [{ id: "q9", name: "Beads", trackingType: "quantity", status: "reserved", quantity: { onHand: 4, reserved: 4 }, valuationCost: 1 }];
  assert.strictEqual(
    inventory.inventoryOverview({ ...snapshot(), inventoryItems: allHeld }, {}, ctx, { nowMs: fixtures.NOW }).data.counts.available,
    0,
    "a fully promised row must not be counted as available"
  );
  // And incoming stock is not on the shelf, so it is not free either.
  const incoming = [{ id: "i9", name: "Strap", trackingType: "unique", status: "incoming", quantity: { onHand: 1, reserved: 0 }, valuationCost: 60 }];
  assert.strictEqual(
    inventory.inventoryOverview({ ...snapshot(), inventoryItems: incoming }, {}, ctx, { nowMs: fixtures.NOW }).data.counts.available,
    0,
    "stock that has not arrived was counted as available"
  );
});

console.log(failures === 0 ? "\nAll inventory checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

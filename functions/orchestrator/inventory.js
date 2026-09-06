"use strict";

/**
 * get_inventory_overview (§11).
 *
 * §11 asks for nine things. NivaDesk holds five of them (low stock, reserved,
 * available, incoming, source-of-truth) and has no data model at all for the
 * other four: there is no product↔listing mapping collection anywhere, so
 * channel allocation, sync mismatch, oversell risk and multi-channel listings
 * cannot be computed. They are reported as `supported: false` with a reason.
 *
 * Reporting them as zero would be worse than not reporting them: "oversell risk:
 * 0" is a claim that somebody checked.
 *
 * Inventory also has no sync of any kind — no connector writes stock levels — so
 * its freshness row is `unsupported` rather than `never`, and
 * `inventoryLastSync` is null for a reason the envelope states.
 */

const envelope = require("./envelope");
const freshness = require("./freshness");
const metrics = require("./inventoryMetrics");
const money = require("./money");
const untrusted = require("./untrusted");

/**
 * A shelf row's strings, bounded. Same reason and same bound as
 * `inventoryMetrics.label` and `envelope.entityRef`: a product title is typed
 * by somebody, `data` is read by a model the way a summary line is, and this
 * file put the identical `row.name` through `entityRef` two lines below the raw
 * copy of it.
 */
const label = (value, max = 80) => untrusted.safeText(value, { max });

/** The runtime's own item statuses (inventory.js ITEM_STATUSES), not a paraphrase. */
const ITEM_STATUSES = Object.freeze([
  "available", "partiallyReserved", "reserved", "incoming", "used", "sold", "removed", "archived"
]);

const UNSUPPORTED_CHANNEL_KEYS = Object.freeze({
  channelAllocation: "no_listing_mapping",
  syncMismatch: "no_listing_mapping",
  oversellRisk: "no_listing_mapping",
  multiChannelListings: "no_listing_mapping"
});

function filterItems(items, { location = "", category = "" } = {}) {
  const wantLocation = String(location || "").trim().toLowerCase();
  const wantCategory = String(category || "").trim().toLowerCase();
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (wantLocation && String(item.location || "").toLowerCase() !== wantLocation) return false;
    if (wantCategory && String(item.category || "").toLowerCase() !== wantCategory) return false;
    return true;
  });
}

function inventoryOverview(snapshot, args = {}, ctx = {}, { nowMs = Date.now() } = {}) {
  const items = filterItems(snapshot.inventoryItems || [], args);
  const summary = metrics.summarize(items);
  const warnings = [envelope.warning(
    "unsupported_metric",
    "Channel allocation, stock sync mismatch, oversell risk and multi-channel listings need a product-to-listing mapping, which NivaDesk does not store yet. They are reported as unavailable, not as zero."
  )];
  warnings.push(...envelope.capWarnings(snapshot));

  const currency = money.workspaceCurrency(snapshot.settings || {});
  // `items` used to be the raw row count while every other figure came from
  // summarize(), which skips archived, sold, used, removed and customer-owned
  // rows: two populations under one heading, so a workshop with one item on the
  // shelf was told "5 inventory item(s), 1 at or below their low-stock level".
  //
  // `items` is now the workshop's own stock — on the shelf or on its way — and
  // the other populations are named beside it, the way the valuation already
  // named them. `matched` keeps the raw number under a heading that says what it
  // is: rows this answer's filters selected, whatever their status. The four add
  // up: matched = items + offShelf + customerOwned.
  const data = {
    counts: {
      items: summary.uniqueCount + summary.quantityCount + summary.incomingCount,
      matched: items.length,
      offShelf: summary.offShelfCount,
      lowStock: summary.lowStockCount,
      reserved: summary.reservedCount,
      incoming: summary.incomingCount,
      available: Math.max(0, summary.uniqueCount + summary.quantityCount - summary.reservedCount),
      customerOwned: summary.customerOwnedCount
    },
    value: { cost: summary.totalValue, incoming: summary.incomingValue, reserved: summary.reservedValue, currency },
    lowStock: metrics.lowStockItems(items),
    reservedForOpenOrders: metrics.reservedItems(items),
    sourceOfTruth: "nivadesk"
  };
  for (const [key, reason] of Object.entries(UNSUPPORTED_CHANNEL_KEYS)) {
    data[key] = { supported: false, reason };
  }

  return {
    data,
    warnings,
    sources: [freshness.inventorySourceRow({ contributed: true, nowMs })],
    entityRefs: data.lowStock.slice(0, 20).map((row) => envelope.entityRef("inventoryItem", row.itemId, row.name))
  };
}

/**
 * search_inventory (§11) — the workspace's ONE inventory search.
 *
 * The function keeps the name it was written under; the capability it serves is
 * `search_inventory`, and `search_inventory_items` is an alias
 * (orchestrator/index.js) for callers that learned the older name.
 *
 * SKU is a search field, never an identity (§27): two items may legitimately
 * carry the same SKU and both are returned.
 *
 * `number` and `unit` come from the MCP handler this replaced. They are the
 * only two fields it returned that this one did not, and neither is cosmetic: a
 * workshop reads the item NUMBER off a label or a QR code, and an `onHand` of
 * 12 with no unit is twelve grams or twelve clasps depending on the row.
 */
function searchInventoryItems(snapshot, args = {}, ctx = {}, { nowMs = Date.now() } = {}) {
  const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
  const needle = String(args.query || "").trim().toLowerCase();
  // A search over a shelf that was read only in part is a search that can miss
  // the item somebody asked about.
  const warnings = [...envelope.capWarnings(snapshot)];
  let items = filterItems(snapshot.inventoryItems || [], args);

  if (args.status) {
    const wanted = String(args.status);
    if (!ITEM_STATUSES.includes(wanted)) {
      warnings.push(envelope.warning("unsupported_metric", `"${wanted}" is not one of the inventory statuses this workspace uses.`));
      items = [];
    } else {
      items = items.filter((item) => String(item.status || "available") === wanted);
    }
  }
  if (args.lowStock === true) {
    const lowIds = new Set(metrics.lowStockItems(items, { limit: 10000 }).map((row) => row.itemId));
    items = items.filter((item) => lowIds.has(String(item.id || "")));
  }
  if (args.reserved === true) {
    items = items.filter((item) => ["reserved", "partiallyReserved"].includes(String(item.status || "")));
  }
  if (args.channel || args.mappingIssue === true) {
    warnings.push(envelope.warning("unsupported_metric", "Inventory is not mapped to channel listings, so filtering by channel or by mapping issue returns nothing rather than a guess."));
    items = [];
  }
  if (needle) {
    items = items.filter((item) => [item.name, item.sku, item.serialNumber, item.brand, item.model, item.category, item.location]
      .map((value) => String(value || "").toLowerCase()).join(" ").includes(needle));
  }

  const rows = items.slice(0, limit).map((item) => ({
    itemId: label(item.id, 200),
    // The workshop's own item number, the one printed on the label and encoded
    // in the QR. `safeReference` rather than `safeText` for the reason the
    // module header gives: a reference that does not look like a reference is
    // refused outright, never truncated into a shorter injection.
    number: untrusted.safeReference(item.number, { max: 64 }),
    name: label(item.name),
    sku: label(item.sku, 64),
    serialNumber: label(item.serialNumber, 64),
    category: label(item.category, 64),
    status: String(item.status || "available"),
    trackingType: String(item.trackingType || "unique"),
    onHand: String(item.trackingType) === "unique" ? 1 : Number((item.quantity || {}).onHand) || 0,
    // What `onHand` counts. Without it 12 is twelve grams or twelve clasps and
    // the model has to guess, which is how a quantity becomes a wrong sentence.
    unit: label((item.quantity || {}).unit, 24),
    reserved: String(item.trackingType) === "unique" ? 0 : Number((item.quantity || {}).reserved) || 0,
    lowStockAt: Number(item.lowStockAt) || 0,
    location: label(item.location, 64),
    supplierName: label(item.supplierName),
    customerOwned: String(item.ownership) === "customer"
  }));

  // A page, said out loud. This capability truncated at `limit` and warned
  // about nothing, while `search_commerce_orders` warned about the same thing
  // under a code that means a truncated READ — two paging capabilities behaving
  // in opposite directions over one question. One code for both.
  if (items.length > rows.length) {
    warnings.push(envelope.warning("result_truncated", `${items.length} items match; the first ${rows.length} are listed.`));
  }

  return {
    data: { count: rows.length, matched: items.length, statuses: ITEM_STATUSES, items: rows },
    warnings,
    sources: [freshness.inventorySourceRow({ contributed: true, nowMs })],
    entityRefs: rows.slice(0, 20).map((row) => envelope.entityRef("inventoryItem", row.itemId, row.name))
  };
}

module.exports = { ITEM_STATUSES, UNSUPPORTED_CHANNEL_KEYS, inventoryOverview, searchInventoryItems };

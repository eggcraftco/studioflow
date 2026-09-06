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
  if (snapshot.inventoryCapped) {
    warnings.push(envelope.warning("loader_cap_reached", "The inventory read hit its cap, so these figures may cover only part of the shelf."));
  }

  const currency = money.workspaceCurrency(snapshot.settings || {});
  const data = {
    counts: {
      items: items.length,
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
 * search_inventory_items (§11).
 *
 * SKU is a search field, never an identity (§27): two items may legitimately
 * carry the same SKU and both are returned.
 */
function searchInventoryItems(snapshot, args = {}, ctx = {}, { nowMs = Date.now() } = {}) {
  const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
  const needle = String(args.query || "").trim().toLowerCase();
  const warnings = [];
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
    itemId: String(item.id || ""),
    name: String(item.name || ""),
    sku: String(item.sku || ""),
    serialNumber: String(item.serialNumber || ""),
    category: String(item.category || ""),
    status: String(item.status || "available"),
    trackingType: String(item.trackingType || "unique"),
    onHand: String(item.trackingType) === "unique" ? 1 : Number((item.quantity || {}).onHand) || 0,
    reserved: String(item.trackingType) === "unique" ? 0 : Number((item.quantity || {}).reserved) || 0,
    lowStockAt: Number(item.lowStockAt) || 0,
    location: String(item.location || ""),
    supplierName: String(item.supplierName || ""),
    customerOwned: String(item.ownership) === "customer"
  }));

  return {
    data: { count: rows.length, matched: items.length, statuses: ITEM_STATUSES, items: rows },
    warnings,
    sources: [freshness.inventorySourceRow({ contributed: true, nowMs })],
    entityRefs: rows.slice(0, 20).map((row) => envelope.entityRef("inventoryItem", row.itemId, row.name))
  };
}

module.exports = { ITEM_STATUSES, UNSUPPORTED_CHANNEL_KEYS, inventoryOverview, searchInventoryItems };

"use strict";

/**
 * The inventory header figures, as one pure function.
 *
 * These numbers were computed inside the `getInventorySummary` callable's
 * closure, which meant the assistant could only get them by re-implementing the
 * loop — and a re-implementation drifts. The rules are subtle enough that
 * drifting matters: a customer's own item is never an asset of this business,
 * an archived item is not on the shelf, sold/used/removed leave the count, and
 * "reserved value" is what is actually promised (3 of 10 held must not read as
 * all 10).
 *
 * `inventory.js` now calls this module, so the app screen and the assistant
 * cannot disagree.
 */

const untrusted = require("./untrusted");

const round = (value) => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;

/**
 * A product title, a SKU, a supplier and a shelf name are all typed by somebody
 * — a member, a supplier's import file, a connector — and the rows below leave
 * the server inside `data`, which a model reads exactly the way it reads a
 * summary line. So they get the same bound `envelope.entityRef` puts on a
 * label, which is what `item.name` becomes one line later in `inventory.js`.
 * An unbounded `String(item.name || "")` in the row beside a bounded
 * `entityRef(…, row.name)` is one string cleaned on one path and not the other.
 *
 * `cleanOrderText` on the write side is not a substitute: it collapses `\s+`
 * and leaves U+202E, U+200B and U+0007 standing, which is precisely what
 * `untrusted.safeText` removes.
 */
const label = (value, max = 80) => untrusted.safeText(value, { max });

const OFF_SHELF_STATUSES = Object.freeze(["sold", "used", "removed"]);

/** The two statuses that mean something on this row is promised to an order. */
const HOLDING_STATUSES = Object.freeze(["reserved", "partiallyReserved"]);

const isHolding = (item) => HOLDING_STATUSES.includes(String((item || {}).status || ""));

/**
 * How much of one row is promised to an order — the ONE definition, because
 * there were two and they answered the same document differently.
 *
 * A one-off does not record its reservation as a quantity. `inventory.js`
 * reserves it by writing `status: "reserved"` plus `reservedOrderIds`, and
 * never touches `quantity.reserved`, which was created as 0 and stays 0. So
 * `Number(quantity.reserved) || 0` on a unique row reads the absence of a field
 * as a measurement of zero: `search_inventory` reported `reserved: 0` on an
 * item it had just returned BECAUSE it is reserved, while
 * `get_inventory_overview` reported 1 for the same document out of
 * `reservedItems`. One channel, two answers to itself.
 *
 * The status is the reservation for a one-off, so it is what is read — and it
 * is read for the unreserved case too: `reservedItems` could hardcode 1 only
 * because its caller had already filtered to the two holding statuses, and
 * `search_inventory` has no such filter.
 */
function reservedUnits(item) {
  const data = item || {};
  if (String(data.trackingType) === "unique") return isHolding(data) ? 1 : 0;
  return Number((data.quantity || {}).reserved) || 0;
}

/** How much of one row is still free — what "available" has to mean to be worth the word. */
function availableUnits(item) {
  const data = item || {};
  const onHand = String(data.trackingType) === "unique" ? 1 : Number((data.quantity || {}).onHand) || 0;
  return Math.max(0, onHand - reservedUnits(data));
}

/**
 * One definition of "low stock", for the count AND for the list.
 *
 * There were two, and they disagreed. `summarize()` skips a customer's own item
 * before it counts anything, and skips incoming stock before it reaches the
 * threshold test; `lowStockItems()` did neither. So a customer's own item at one
 * of five was in the reorder list, absent from the count printed beside it, and
 * driving the `stock_low` attention item too — a suggestion to reorder
 * something that is not the workshop's to reorder. Two implementations of one
 * rule always end like this, so there is one.
 */
function isLowStock(item) {
  const data = item || {};
  const status = String(data.status || "available");
  if (status === "archived") return false;
  if (String(data.ownership) === "customer") return false;
  if (OFF_SHELF_STATUSES.includes(status)) return false;
  if (status === "incoming") return false;
  // A one-off has no threshold to be below: there is one of it, or there is not.
  if (String(data.trackingType) === "unique") return false;
  const lowAt = Number(data.lowStockAt) || 0;
  if (lowAt <= 0) return false;
  return (Number((data.quantity || {}).onHand) || 0) <= lowAt;
}

/**
 * @param items  raw inventory item documents (with `id`)
 * @returns the same shape `getInventorySummary` returned, minus `monthlyChange`
 *          (which needs the movement ledger and therefore a read).
 */
function summarize(items = []) {
  const summary = {
    totalValue: 0, uniqueCount: 0, uniqueValue: 0,
    quantityCount: 0, quantityValue: 0,
    reservedValue: 0, reservedCount: 0,
    incomingCount: 0, incomingValue: 0,
    // Rows that are not stock any more: archived, sold, used, removed. Counted
    // rather than merely skipped, so every row the caller passed in lands in
    // exactly one population and the shelf adds up.
    offShelfCount: 0,
    // Rows on the shelf with something still FREE. Not `uniqueCount +
    // quantityCount - reservedCount`, which is what get_inventory_overview
    // computed: that subtracts a whole row for a partial hold, so a clasp row
    // with ten on hand and three promised vanished entirely and a shelf with
    // seven free clasps on it answered `available: 0`. `partiallyReserved`
    // exists precisely to mean partly available, so the free part is measured
    // rather than assumed away. This count and `reservedCount` OVERLAP on a
    // partially reserved row, deliberately: a row can be both.
    availableCount: 0,
    lowStockCount: 0, customerOwnedCount: 0
  };

  for (const item of Array.isArray(items) ? items : []) {
    const data = item || {};
    const status = String(data.status || "available");
    // Archived is tested first, as it always was: an archived row is out of
    // every population, the customer's-own one included.
    if (status === "archived") { summary.offShelfCount += 1; continue; }
    if (String(data.ownership) === "customer") { summary.customerOwnedCount += 1; continue; }

    const value = Number(data.valuationCost) || 0;
    const isUnique = String(data.trackingType) === "unique";
    const onHand = isUnique ? 1 : Number((data.quantity || {}).onHand) || 0;
    const lineValue = isUnique ? value : round(value * onHand);

    if (OFF_SHELF_STATUSES.includes(status)) { summary.offShelfCount += 1; continue; }

    if (status === "incoming") {
      summary.incomingCount += 1;
      summary.incomingValue = round(summary.incomingValue + lineValue);
      continue;
    }

    summary.totalValue = round(summary.totalValue + lineValue);
    if (isUnique) {
      summary.uniqueCount += 1;
      summary.uniqueValue = round(summary.uniqueValue + lineValue);
    } else {
      summary.quantityCount += 1;
      summary.quantityValue = round(summary.quantityValue + lineValue);
      if (isLowStock(data)) summary.lowStockCount += 1;
    }
    if (isHolding(data)) {
      summary.reservedCount += 1;
      const reservedQty = reservedUnits(data);
      summary.reservedValue = round(summary.reservedValue + (isUnique ? lineValue : round(value * reservedQty)));
    }
    if (availableUnits(data) > 0) summary.availableCount += 1;
  }

  return summary;
}

/** The items that are at or below their own low-stock threshold, worst first. */
function lowStockItems(items = [], { limit = 25 } = {}) {
  return (Array.isArray(items) ? items : [])
    .filter(isLowStock)
    .map((item) => ({
      itemId: label(item.id, 200),
      name: label(item.name),
      sku: label(item.sku, 64),
      onHand: Number((item.quantity || {}).onHand) || 0,
      lowStockAt: Number(item.lowStockAt) || 0,
      supplierName: label(item.supplierName),
      location: label(item.location, 64)
    }))
    .sort((lhs, rhs) => (lhs.onHand - lhs.lowStockAt) - (rhs.onHand - rhs.lowStockAt))
    .slice(0, limit);
}

/** Items holding stock for an order, with the order they are held for. */
function reservedItems(items = [], { limit = 25 } = {}) {
  return (Array.isArray(items) ? items : [])
    .filter(isHolding)
    .map((item) => {
      const reservations = Array.isArray(item.reservations) ? item.reservations : [];
      return {
        itemId: label(item.id, 200),
        name: label(item.name),
        onHand: String(item.trackingType) === "unique" ? 1 : Number((item.quantity || {}).onHand) || 0,
        reserved: reservedUnits(item),
        orderIds: reservations.map((row) => label((row || {}).orderId, 200)).filter(Boolean).slice(0, 5)
      };
    })
    .slice(0, limit);
}

module.exports = {
  summarize, isLowStock, lowStockItems, reservedItems,
  reservedUnits, availableUnits, isHolding,
  OFF_SHELF_STATUSES, HOLDING_STATUSES
};

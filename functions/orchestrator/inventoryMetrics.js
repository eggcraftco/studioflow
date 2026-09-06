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

const round = (value) => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;

const OFF_SHELF_STATUSES = Object.freeze(["sold", "used", "removed"]);

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
    lowStockCount: 0, customerOwnedCount: 0
  };

  for (const item of Array.isArray(items) ? items : []) {
    const data = item || {};
    const status = String(data.status || "available");
    if (status === "archived") continue;
    if (String(data.ownership) === "customer") { summary.customerOwnedCount += 1; continue; }

    const value = Number(data.valuationCost) || 0;
    const isUnique = String(data.trackingType) === "unique";
    const onHand = isUnique ? 1 : Number((data.quantity || {}).onHand) || 0;
    const lineValue = isUnique ? value : round(value * onHand);

    if (OFF_SHELF_STATUSES.includes(status)) continue;

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
      const lowAt = Number(data.lowStockAt) || 0;
      if (lowAt > 0 && onHand <= lowAt) summary.lowStockCount += 1;
    }
    if (status === "reserved" || status === "partiallyReserved") {
      summary.reservedCount += 1;
      const reservedQty = isUnique ? 1 : Number((data.quantity || {}).reserved) || 0;
      summary.reservedValue = round(summary.reservedValue + (isUnique ? lineValue : round(value * reservedQty)));
    }
  }

  return summary;
}

/** The items that are at or below their own low-stock threshold, worst first. */
function lowStockItems(items = [], { limit = 25 } = {}) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => {
      const data = item || {};
      if (String(data.status || "") === "archived") return false;
      if (OFF_SHELF_STATUSES.includes(String(data.status || ""))) return false;
      if (String(data.trackingType) === "unique") return false;
      const lowAt = Number(data.lowStockAt) || 0;
      if (lowAt <= 0) return false;
      const onHand = Number((data.quantity || {}).onHand) || 0;
      return onHand <= lowAt;
    })
    .map((item) => ({
      itemId: String(item.id || ""),
      name: String(item.name || ""),
      sku: String(item.sku || ""),
      onHand: Number((item.quantity || {}).onHand) || 0,
      lowStockAt: Number(item.lowStockAt) || 0,
      supplierName: String(item.supplierName || ""),
      location: String(item.location || "")
    }))
    .sort((lhs, rhs) => (lhs.onHand - lhs.lowStockAt) - (rhs.onHand - rhs.lowStockAt))
    .slice(0, limit);
}

/** Items holding stock for an order, with the order they are held for. */
function reservedItems(items = [], { limit = 25 } = {}) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => ["reserved", "partiallyReserved"].includes(String((item || {}).status || "")))
    .map((item) => {
      const reservations = Array.isArray(item.reservations) ? item.reservations : [];
      return {
        itemId: String(item.id || ""),
        name: String(item.name || ""),
        onHand: String(item.trackingType) === "unique" ? 1 : Number((item.quantity || {}).onHand) || 0,
        reserved: String(item.trackingType) === "unique" ? 1 : Number((item.quantity || {}).reserved) || 0,
        orderIds: reservations.map((row) => String((row || {}).orderId || "")).filter(Boolean).slice(0, 5)
      };
    })
    .slice(0, limit);
}

module.exports = { summarize, lowStockItems, reservedItems, OFF_SHELF_STATUSES };

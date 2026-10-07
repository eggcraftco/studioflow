// Plan order usage — the two numbers Settings › Plan & Access and /plan show.
//
// ACTIVE orders are what a limited plan is measured against, and the rule here
// is the server's, word for word (functions/index.js countActiveOrders, read by
// createWebOrder / createSwiftOrder's assertOrderSlotInTransaction): an order is
// active unless `isDeleted === true` (in Trash) or `isDelivered === true`.
// Status is NOT read — a Cancelled order that is neither delivered nor deleted
// still takes a slot. Restoring an order from Trash sets isDeleted back to false,
// so it counts again.
//
// TOTAL orders are every order outside Trash, delivered ones included.
//
// This file has no Firebase import so the rule can be unit-tested on its own
// (scripts/check-plan-order-usage.mjs).

export type PlanOrderUsage = {
  /** Orders the plan limit counts (server rule). */
  active: number;
  /** Every order not in Trash. */
  total: number;
  /** The plan's active-order limit; null = no limit. */
  limit: number | null;
  /** "server" = getWorkspacePlanUsage's activeOrderCount; "client" = the same rule counted here. */
  source: "server" | "client";
};

export const PLAN_ORDER_RULE_HINT =
  "Delivered and deleted orders don't count toward the limit; cancelled orders still count until you mark them delivered or delete them.";

/** The server's predicate (countActiveOrders). Strict `=== true`, like the server. */
export function isPlanActiveOrder(data: { isDeleted?: unknown; isDelivered?: unknown } | null | undefined): boolean {
  const row = data || {};
  if (row.isDeleted === true) return false;
  if (row.isDelivered === true) return false;
  return true;
}

/** Counts a list of order documents with the server's rule. */
export function tallyPlanOrders(rows: ReadonlyArray<{ isDeleted?: unknown; isDelivered?: unknown } | null | undefined>) {
  let active = 0;
  let total = 0;
  for (const row of rows) {
    if (row?.isDeleted === true) continue;
    total += 1;
    if (isPlanActiveOrder(row)) active += 1;
  }
  return { active, total };
}

/**
 * The same rule from four exact count aggregates, so it holds for any workspace
 * size without reading the orders:
 *   active = all − deleted − delivered + (deleted ∧ delivered)
 *   total  = all − deleted
 * Each count is of `=== true` (Firestore equality on boolean true), exactly the
 * values the server skips.
 */
export function combinePlanOrderCounts(counts: { all: number; deleted: number; delivered: number; deletedAndDelivered: number }) {
  const n = (value: number) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  const all = n(counts.all);
  const deleted = n(counts.deleted);
  const delivered = n(counts.delivered);
  const both = Math.min(n(counts.deletedAndDelivered), deleted, delivered);
  return {
    active: Math.max(0, all - deleted - delivered + both),
    total: Math.max(0, all - deleted)
  };
}

// "7 / 10" is one numeric unit. In an RTL paragraph (Arabic) the spaces and the
// slash are neutral and the pair would be drawn "10 / 7"; a left-to-right
// isolate keeps it reading 7 of 10 in every language. Invisible elsewhere.
const LRI = "\u2066";
const PDI = "\u2069";

/** "Active orders: 7 / 10" or "Active orders: 7 (no limit)". `t` translates each fixed part. */
export function formatActiveOrdersLine(active: number, limit: number | null, t: (text: string) => string = (text) => text) {
  const count = Math.max(0, Math.floor(active || 0));
  return limit == null
    ? `${t("Active orders")}: ${count} (${t("no limit")})`
    : `${t("Active orders")}: ${formatActiveOfLimit(count, limit)}`;
}

/** "7 / 10" as a left-to-right unit (see LRI above). */
export function formatActiveOfLimit(active: number, limit: number) {
  return `${LRI}${Math.max(0, Math.floor(active || 0))} / ${limit}${PDI}`;
}

/** "Total orders: 12". */
export function formatTotalOrdersLine(total: number, t: (text: string) => string = (text) => text) {
  return `${t("Total orders")}: ${Math.max(0, Math.floor(total || 0))}`;
}

/** Share of the limit used, 0–100; 0 when there is no limit. */
export function planOrderUsagePercent(active: number, limit: number | null) {
  if (limit == null || limit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((active / limit) * 100)));
}

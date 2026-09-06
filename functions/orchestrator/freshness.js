"use strict";

/**
 * How old the answer is, per source — never as one number (§14).
 *
 * A single threshold would report an on-schedule bank feed as behind:
 * `scheduledBankSync` runs every 8 hours with a 6-hour minimum interval, so a
 * 9-hour-old bank sync is on time while a 9-hour-old Shopify sync is not.
 * Each source therefore carries its own `staleAfterMs`, and the value is the
 * one the subsystem itself uses.
 *
 * The other half of §14 is the honest null. `ordersLastSync: null` may only
 * mean "nothing that syncs contributed to this answer" — i.e. every contributing
 * source is NivaDesk-native. A source that DID contribute rows but cannot report
 * a sync time (never synced, invisible from this surface, unreadable status) is
 * not allowed to hide behind that null: it sets `partial: true` and names itself
 * in a warning, because otherwise "no sync time" and "live data" render
 * identically to a reader.
 */

/** Per-source staleness thresholds, with the reason each one is what it is. */
const STALE_AFTER_MS = Object.freeze({
  // commerce/health.js healthView's own default.
  commerce: 6 * 60 * 60 * 1000,
  // bankFeed.js: an 8-hour schedule with a 6-hour minimum interval.
  bank: 10 * 60 * 60 * 1000,
  // Provider payouts ride the bank sync.
  payouts: 10 * 60 * 60 * 1000,
  // Accounting connectors run on their own cadence at ledger-day granularity.
  accounting: 24 * 60 * 60 * 1000
});

/** The states a source row can be in. Closed list. */
const SOURCE_STATES = Object.freeze(["fresh", "stale", "never", "unsupported", "not_visible"]);

/** Entities a source can be fresh about. */
const ENTITIES = Object.freeze(["orders", "inventory", "finance"]);

const isoOrNull = (ms) => (Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null);

/**
 * One `sources[]` row.
 *
 * `contributed` is the field that decides whether this row can make the whole
 * answer partial. A stale connection that put no rows in the answer is worth
 * reporting; it is not worth flagging the answer as incomplete.
 */
function sourceRow({
  provider,
  connectionId = null,
  entity = "orders",
  kind = "commerce",
  lastSuccessAtMs = 0,
  state = null,
  contributed = false,
  nowMs = Date.now()
} = {}) {
  const staleAfterMs = STALE_AFTER_MS[kind] || STALE_AFTER_MS.commerce;
  const last = Number(lastSuccessAtMs) || 0;
  let resolved = state;
  if (!resolved) {
    if (!last) resolved = "never";
    else resolved = (nowMs - last) > staleAfterMs ? "stale" : "fresh";
  }
  if (!SOURCE_STATES.includes(resolved)) resolved = "never";
  return {
    provider: String(provider || ""),
    connectionId: connectionId ? String(connectionId) : null,
    entity: ENTITIES.includes(entity) ? entity : "orders",
    lastSuccessAt: isoOrNull(last),
    lagMs: last ? Math.max(0, nowMs - last) : null,
    staleAfterMs: resolved === "unsupported" ? null : staleAfterMs,
    state: resolved,
    contributed: contributed === true
  };
}

/**
 * The freshness block, plus the warnings the rules above force.
 *
 * Returns `{ freshness, warnings, partial }` — the caller merges them into the
 * envelope rather than this module reaching into it.
 */
function build(sources = [], { nowMs = Date.now() } = {}) {
  const rows = Array.isArray(sources) ? sources.filter(Boolean) : [];
  const warnings = [];
  let partial = false;

  const lastFor = (entity) => {
    const contributing = rows.filter((row) => row.entity === entity && row.contributed);
    if (contributing.length === 0) return null;
    const times = contributing.map((row) => (row.lastSuccessAt ? Date.parse(row.lastSuccessAt) : null));
    // A contributing source with no readable time cannot be averaged away.
    if (times.some((value) => !Number.isFinite(value))) return null;
    return new Date(Math.min(...times)).toISOString();
  };

  for (const row of rows) {
    if (row.state === "stale") {
      warnings.push({
        code: "channel_stale",
        message: `${row.provider} ${row.entity} sync last succeeded ${Math.round((row.lagMs || 0) / 3600000)} hours ago, so ${row.entity} figures may be incomplete.`,
        channel: row.provider,
        connectionId: row.connectionId
      });
    }
    if (!row.contributed) continue;
    if (row.state === "not_visible") {
      partial = true;
      warnings.push({
        code: "status_not_visible_from_this_surface",
        message: `${row.provider} rows are included, but its connection status is not readable from this surface.`,
        channel: row.provider,
        connectionId: row.connectionId
      });
    } else if (row.state === "never") {
      partial = true;
      warnings.push({
        code: "channel_not_connected",
        message: `${row.provider} rows are included, but no successful ${row.entity} sync has ever been recorded for it.`,
        channel: row.provider,
        connectionId: row.connectionId
      });
    }
  }

  return {
    freshness: {
      generatedAt: new Date(nowMs).toISOString(),
      ordersLastSync: lastFor("orders"),
      inventoryLastSync: lastFor("inventory"),
      financeLastSync: lastFor("finance"),
      sources: rows
    },
    warnings,
    partial
  };
}

/**
 * Inventory has no sync of any kind today. Saying "never" would read as a
 * broken connector; the honest word is that the concept does not apply.
 */
function inventorySourceRow({ contributed = true, nowMs = Date.now() } = {}) {
  return sourceRow({ provider: "nivadesk", entity: "inventory", state: "unsupported", contributed, nowMs });
}

module.exports = { STALE_AFTER_MS, SOURCE_STATES, ENTITIES, sourceRow, inventorySourceRow, build };

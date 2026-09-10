"use strict";

// One table for what an eBay connection's state means (design §2.1, §10).
//
// The stored `status` keeps the codebase's three values — connected,
// reconnect_required, disconnected — because the sweep, the purge, the
// lifecycle derivation and the pins all query it. The specification's richer
// enum (connecting, connected_read_only, degraded, suspended,
// reauthorization_required, disconnected) is DERIVED here for the public view,
// and the three clients copy the card mapping line for line rather than
// re-deriving anything from error codes. Pure.

/** Codes a healthy connection may carry: the pass advanced through what it read. */
const BENIGN_ERROR_CODES = Object.freeze(["", "truncated", "paused_by_owner"]);
/** Codes that mean "needs a look" without asking the seller to reconnect. */
const TRANSIENT_ERROR_CODES = Object.freeze(["rate_limited", "partial_pass", "provider_unavailable", "permission_missing", "token_request_invalid", "app_credentials_invalid"]);
/** Connected, auto-sync on, imported — and no successful pass for this long → degraded, whatever the code says. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

const SPEC_STATUSES = Object.freeze(["connecting", "connected_read_only", "connected", "degraded", "suspended", "reauthorization_required", "disconnected"]);
const ATTENTION_STATUSES = Object.freeze(["reauthorization_required", "suspended", "degraded"]);

/**
 * @param doc    the ebayConnections row (may be partial)
 * @param opts   { flagOn: boolean (connector flag for this connection), now: ms }
 */
function specStatusOf(doc, { flagOn = true, now = Date.now() } = {}) {
  const row = doc || {};
  const status = String(row.status || "");
  if (status === "disconnected") return "disconnected";
  if (status === "reconnect_required") return "reauthorization_required";
  if (!status) return "connecting";
  const code = String(row.lastErrorCode || "");
  if (flagOn === false || code === "environment_mismatch") return "suspended";
  if (TRANSIENT_ERROR_CODES.includes(code)) return "degraded";
  const settings = row.settings || {};
  const autoSync = settings.autoSync !== false;
  const imported = String(row.importState || "none") === "done";
  const lastSuccess = Number(row.lastSuccessAtMs || 0);
  if (autoSync && imported && (Number(now) - lastSuccess) > STALE_AFTER_MS) return "degraded";
  return "connected_read_only";   // this half proves no write capability, so never plain "connected"
}

function needsAttention(specStatus) { return ATTENTION_STATUSES.includes(String(specStatus || "")); }

/**
 * What the Integrations card shows for a workspace's rows.
 *   no rows          → "connect" (or "coming_soon" when the server is not configured)
 *   every live row needs attention → "attention"
 *   otherwise        → "connected"
 */
function cardStateOf(rows, { configured = true } = {}) {
  const live = (Array.isArray(rows) ? rows : []).filter((r) => String(r?.status || "") !== "disconnected");
  if (!live.length) return configured ? "connect" : "coming_soon";
  return live.every((r) => needsAttention(r.specStatus)) ? "attention" : "connected";
}

module.exports = { BENIGN_ERROR_CODES, TRANSIENT_ERROR_CODES, STALE_AFTER_MS, SPEC_STATUSES, ATTENTION_STATUSES, specStatusOf, needsAttention, cardStateOf };

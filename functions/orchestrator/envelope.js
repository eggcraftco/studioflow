"use strict";

/**
 * The one shape every capability answers in, whichever channel asked (§13, §14, §25).
 *
 * Two things are load-bearing here and both come straight out of the spec:
 *
 *  - `state` is a CLOSED vocabulary, and `queued` is not `completed` (§25). A
 *    request that has been accepted for later work must never render as done;
 *    the renderer reads this field rather than guessing from the presence of
 *    data.
 *  - `warnings` is a CLOSED list of codes. An open-ended string bag lets a
 *    capability invent "amazon_probably_fine" and nobody notices; a closed list
 *    means a new kind of incompleteness has to be named here, next to the others,
 *    and the renderer can be taught to say it.
 *
 * `summary.lines` is the §13 answer order — result, breakdown, finance,
 * attention, next — built by render.js from `data`. Nothing in a line may
 * contain a number that is not in `data`, and no line may carry provider- or
 * buyer-authored free text; render.js enforces the first and the loaders enforce
 * the second.
 */

const freshnessModule = require("./freshness");

/** Lifecycle states. `queued` ≠ `completed` (§25). */
const STATES = Object.freeze([
  "prepared", "awaiting_approval", "approved", "queued", "executing",
  "completed", "partially_completed", "failed", "invalidated", "needs_attention"
]);

/** Every way an answer can be less than the whole truth. Closed on purpose. */
const WARNING_CODES = Object.freeze([
  "channel_not_connected",
  "channel_adapter_only",
  "channel_not_supported",
  "channel_excluded_auth",
  "channel_stale",
  "status_not_visible_from_this_surface",
  "loader_cap_reached",
  "plan_limited",
  "section_not_permitted",
  "unsupported_metric",
  "estimated",
  "mixed_currency",
  "tax_needs_review",
  "needs_review_truncated",
  "source_state_unknown"
]);

const ENTITY_TYPES = Object.freeze([
  "order", "bankTransaction", "payout", "inventoryItem", "connection", "note", "attention"
]);

function warning(code, message, extra = {}) {
  if (!WARNING_CODES.includes(code)) {
    throw new TypeError(`Orchestrator warning code "${code}" is not in the closed list; add it to envelope.WARNING_CODES with the rule that raises it.`);
  }
  const row = { code, message: String(message || "") };
  if (extra.channel) row.channel = String(extra.channel);
  if (extra.connectionId) row.connectionId = String(extra.connectionId);
  if (extra.section) row.section = String(extra.section);
  return row;
}

function entityRef(type, id, label = "", url = null) {
  if (!ENTITY_TYPES.includes(type)) {
    throw new TypeError(`Orchestrator entityRef type "${type}" is unknown.`);
  }
  return { type, id: String(id || ""), label: String(label || ""), url: url ? String(url) : null };
}

/**
 * Assemble the answer.
 *
 * The channel profile is applied HERE rather than in each capability, so a
 * channel cannot forget it: a group WhatsApp thread with `pii_level: "none"` and
 * `financial_data_allowed: false` gets the same answer with the person and the
 * money taken out, whatever the capability wrote.
 */
function finish({
  capability,
  state = "completed",
  data = {},
  sources = [],
  warnings = [],
  partial = false,
  entityRefs = [],
  suggestedActions = [],
  nowMs = Date.now(),
  channelProfile = null
} = {}) {
  if (!STATES.includes(state)) {
    throw new TypeError(`Orchestrator state "${state}" is not in the closed vocabulary.`);
  }

  const built = freshnessModule.build(sources, { nowMs });
  const allWarnings = [...built.warnings, ...(Array.isArray(warnings) ? warnings : [])]
    .filter(Boolean)
    .map((row) => warning(row.code, row.message, row));

  const seen = new Set();
  const deduped = allWarnings.filter((row) => {
    const key = `${row.code}|${row.channel || ""}|${row.connectionId || ""}|${row.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const envelope = {
    ok: true,
    action: String(capability || ""),
    state,
    data: applyChannelProfile(data, channelProfile),
    freshness: built.freshness,
    partial: partial === true || built.partial === true,
    warnings: deduped,
    entityRefs: (Array.isArray(entityRefs) ? entityRefs : []).filter(Boolean),
    suggestedActions: (Array.isArray(suggestedActions) ? suggestedActions : []).filter(Boolean),
    summary: { lines: [] }
  };
  return envelope;
}

/**
 * A channel's own limits, applied once. §65/§72 and the WhatsApp spec's group
 * defaults: a shared thread sees neither people nor money.
 */
function applyChannelProfile(data, profile) {
  if (!profile || typeof profile !== "object") return data;
  const security = profile.security || {};
  const stripPii = security.pii_level === "none";
  const stripMoney = security.financial_data_allowed === false;
  if (!stripPii && !stripMoney) return data;

  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== "object") return value;
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (stripPii && key === "customer") { out[key] = { restricted: true, reason: "channel_pii_policy" }; continue; }
      if (stripMoney && ["totals", "sales", "fees", "tax", "settlements", "value", "amounts"].includes(key)) {
        out[key] = { restricted: true, reason: "channel_financial_policy" };
        continue;
      }
      out[key] = walk(inner);
    }
    return out;
  };
  return walk(data);
}

module.exports = { STATES, WARNING_CODES, ENTITY_TYPES, warning, entityRef, finish, applyChannelProfile };

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
const untrusted = require("./untrusted");

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

/**
 * Every loader cap, and the sentence it produces when it is hit.
 *
 * loaders.js has always said "Hitting one sets `partial: true` with a
 * `loader_cap_reached` warning", and docs/orchestrator-contract.md repeats it —
 * "a truncated answer says it is truncated". Two of the six caps did that.
 * `snapshot.bankCapped` was computed and read by nobody; the payout, review,
 * attention and inbox reads carried no flag at all. So
 * get_integration_health published `heldForReview.total` as a headline number
 * over a 200-document read that could have been cut off, and
 * get_accounting_sync_status counted readiness over up to 3000 bank rows on a
 * workspace whose two-year PSD2 backfill makes that reachable — both stated as
 * fact, neither able to say it was truncated.
 *
 * The flag name is the cap's own name plus "Capped", so the loader cannot add a
 * cap this list does not know about: orchestrator-loaders.test.js asserts the
 * two sets are equal.
 *
 * No numerals in these sentences. When an answer is partial the renderer quotes
 * the first one into a summary line, and every numeral in a line has to exist
 * in `data`.
 */
const CAP_WARNINGS = Object.freeze({
  ordersCapped: "The order read hit its cap, so this range may be missing older orders.",
  bankCapped: "The bank transaction read hit its cap, so these figures may cover only part of the statement.",
  inventoryCapped: "The inventory read hit its cap, so these figures may cover only part of the shelf.",
  payoutsCapped: "The payout read hit its cap, so some payouts in this range are not counted here.",
  reviewCapped: "The read of orders held or queued for review hit its cap, so more may be waiting than are counted here.",
  attentionCapped: "The accounting attention read hit its cap, so more items may be open than are listed here.",
  inboxCapped: "The waiting-receipt read hit its cap, so more receipts may be waiting than are counted here."
});

/**
 * The cap warnings for one snapshot: one per read that was truncated.
 *
 * A capability passes the whole snapshot rather than a list, because a flag is
 * only ever set for a domain this capability declared AND was permitted — the
 * loader sets nothing else — so "every cap this snapshot hit" is exactly "every
 * cap this answer was built on".
 */
function capWarnings(snapshot = {}) {
  return Object.keys(CAP_WARNINGS)
    .filter((flag) => snapshot && snapshot[flag] === true)
    .map((flag) => warning("loader_cap_reached", CAP_WARNINGS[flag]));
}

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

/**
 * A reference to one row, with its label bounded.
 *
 * The label is the most consistently untrusted string in an answer: a bank
 * row's label is the counterparty's own name, an inventory row's is a product
 * title somebody typed, and an order's is whatever the shop called it. It is
 * shown to a model, so it is put through `untrusted.safeText` HERE rather than
 * at each of the fifteen call sites — one place to read, and a new capability
 * gets the bound without knowing it exists. The id keeps its value (it is a
 * lookup key, and a ref whose id was filtered away cannot be opened) and loses
 * only characters no identifier can carry.
 */
function entityRef(type, id, label = "", url = null) {
  if (!ENTITY_TYPES.includes(type)) {
    throw new TypeError(`Orchestrator entityRef type "${type}" is unknown.`);
  }
  return {
    type,
    id: untrusted.safeText(id, { max: 200 }),
    label: untrusted.safeText(label, { max: 80 }),
    url: url ? String(url) : null
  };
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
    // A truncated answer says it is truncated. `loader_cap_reached` and
    // `partial` were two separate things a capability had to remember to do
    // together, and the ones that raised the warning did not set the flag — so
    // the renderer, which only speaks when `partial` is true, stayed silent
    // about a cap that had been hit. One of them now implies the other, here,
    // where no capability can forget it.
    partial: partial === true || built.partial === true || deduped.some((row) => row.code === "loader_cap_reached"),
    warnings: deduped,
    // The refs go through the same policy: they leave the server beside the
    // data, and a bank row's label is the counterparty's own name.
    entityRefs: applyChannelProfile((Array.isArray(entityRefs) ? entityRefs : []).filter(Boolean), channelProfile),
    suggestedActions: (Array.isArray(suggestedActions) ? suggestedActions : []).filter(Boolean),
    summary: { lines: [] }
  };
  return envelope;
}

/** Blocks whose whole value is money, whatever shape the capability gave them. */
const MONEY_BLOCK_KEYS = Object.freeze([
  "totals", "sales", "fees", "tax", "settlements", "settlement", "amounts",
  "amountsByCurrency", "profit", "payouts"
]);

/**
 * Does this field NAME money? Used for the `{ key, value }` fact rows, where
 * the key is data rather than a field name: `{ key: "count", value: 2 }` and
 * `{ key: "amount", value: 12.5, currency: "GBP" }` are the same shape, and a
 * rule that reads the literal field name `value` destroys the first while it
 * hides the second — so a group thread loses the counts it is allowed to see
 * and keeps the amounts it is not.
 */
const MONEY_NAME = /(amount|total|gross|net\b|fee|refund|discount|cost|profit|vat|tax|price|balance|revenue|paid|outstanding|payout|value)/i;

/** A person can hide in these field names; a product name is not one of them. */
const PII_KEYS = Object.freeze(["customer", "customerName", "customerEmail", "buyerName", "contactName", "contactEmail", "email", "phone"]);

/** Entity references whose label can be a person rather than a number or a product. */
const PII_LABEL_TYPES = Object.freeze(["bankTransaction", "note"]);

/**
 * Money written into a sentence. `"420 GBP still outstanding"` and `"£420 still
 * outstanding"` are the figure, not a description of it, and a redaction that
 * only looks at field names lets both through verbatim.
 */
const MONEY_IN_TEXT = new RegExp(
  "(?:[£$€¥₺]\\s?\\d[\\d,]*(?:\\.\\d+)?)" +
  "|(?:\\d[\\d,]*(?:\\.\\d+)?\\s?(?:[£$€¥₺]|(?:GBP|USD|EUR|TRY|JPY|CAD|AUD|CHF|SEK|NOK|DKK|PLN|NZD)\\b))",
  "gi"
);

const WITHHELD_AMOUNT = "[amount withheld]";

const restrictedMoney = () => ({ restricted: true, reason: "channel_financial_policy" });
const restrictedPerson = () => ({ restricted: true, reason: "channel_pii_policy" });

/** Is this object one of the `{ key, value }` fact rows? */
const isFactRow = (row) => Boolean(row) && typeof row === "object" && !Array.isArray(row) && typeof row.key === "string" && "value" in row;

/** Is this object an entityRef? */
const isEntityRef = (row) => Boolean(row) && typeof row === "object" && !Array.isArray(row) && ENTITY_TYPES.includes(row.type) && "id" in row;

/**
 * A channel's own limits, applied once. §65/§72 and the WhatsApp spec's group
 * defaults: a shared thread sees neither people nor money.
 *
 * Two rules, both learned from getting it wrong:
 *
 *  - **Redaction follows the VALUE, not the field name.** Money reaches a
 *    reader in three shapes — a block (`totals`), a fact row keyed at runtime
 *    (`{ key: "amount", value, currency }`), and a sentence a detector wrote
 *    (`"420 GBP still outstanding"`). A key list catches the first only, so a
 *    group thread was refused `sales` and handed the same money back inside
 *    `reason`.
 *  - **It must not destroy what the channel IS allowed to see.** The generic
 *    key `value` is money in `{ value: { cost, currency } }` and a count in
 *    `{ key: "count", value: 2 }`. Both directions are failures.
 */
function applyChannelProfile(data, profile) {
  if (!profile || typeof profile !== "object") return data;
  const security = profile.security || {};
  const stripPii = security.pii_level === "none";
  const stripMoney = security.financial_data_allowed === false;
  if (!stripPii && !stripMoney) return data;

  const scrubText = (text) => (stripMoney ? String(text).replace(MONEY_IN_TEXT, WITHHELD_AMOUNT) : String(text));

  const walk = (value) => {
    if (typeof value === "string") return scrubText(value);
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== "object") return value;

    // A fact row is read by its own `key`, because that is where its meaning is.
    if (isFactRow(value)) {
      const money = MONEY_NAME.test(value.key) || "currency" in value;
      if (stripMoney && money) return { ...value, value: restrictedMoney() };
      return { ...value, value: walk(value.value) };
    }

    if (isEntityRef(value) && stripPii && PII_LABEL_TYPES.includes(value.type)) {
      // The id stays: the thread can still say WHICH row, and a member with the
      // grant can look up who.
      return { ...value, label: "", labelRestricted: true };
    }

    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (stripPii && PII_KEYS.includes(key)) { out[key] = restrictedPerson(); continue; }
      if (stripMoney && MONEY_BLOCK_KEYS.includes(key)) { out[key] = restrictedMoney(); continue; }
      // `value` alone is ambiguous: a money block when it holds one, a plain
      // figure otherwise.
      if (stripMoney && key === "value" && inner && typeof inner === "object" && !Array.isArray(inner)) {
        out[key] = restrictedMoney();
        continue;
      }
      out[key] = walk(inner);
    }
    return out;
  };
  return walk(data);
}

module.exports = {
  STATES, WARNING_CODES, ENTITY_TYPES, MONEY_BLOCK_KEYS, PII_KEYS, PII_LABEL_TYPES, CAP_WARNINGS,
  warning, capWarnings, entityRef, finish, applyChannelProfile
};

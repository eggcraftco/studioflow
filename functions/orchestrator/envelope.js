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

/**
 * How much of a warning may be somebody else's text.
 *
 * 300 is `render.LINE_MAX`: the renderer quotes one warning message into a
 * summary line, so a message that cannot be a line is not a message. 60 is
 * `render.VALUE_MAX`, the bound on a value quoted inside a sentence — a
 * `channel` is a provider key, not a paragraph. The longest sentence this
 * module's own capabilities write is 215 characters, so no honest warning is
 * clipped by either.
 */
const WARNING_MESSAGE_MAX = 300;
const WARNING_FIELD_MAX = 60;

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
  // A PAGE, not a truncated read. `search_commerce_orders` raised
  // `loader_cap_reached` for its ordinary `limit` truncation, so every paged
  // search reported `partial: true` and rendered "This answer is incomplete:
  // 30 orders match; the first 5 are listed." — an honest sentence under a
  // heading that means something else. Worse, when a real cap HAD been hit the
  // renderer quoted whichever `loader_cap_reached` row came first, so a read
  // that stopped at 1000 documents hid behind the paging message. `partial` is
  // for "a read was truncated"; asking for a page is not that.
  "result_truncated",
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
  inboxCapped: "The waiting-receipt read hit its cap, so more receipts may be waiting than are counted here.",
  // Three reads that carried a hard limit written as a literal and no flag at
  // all, so the list above described seven of the ten places this loader can
  // truncate. The vendor one is the one with a consequence:
  // `insights.detectRecurringSpends` matches bank rows against the vendor list,
  // so "N recurring payment(s) changed price" and "N recurring payment(s) have
  // stopped arriving" were counted over a list that could have been cut off.
  vendorsCapped: "The saved-vendor read hit its cap, so recurring-payment items may be counted over part of the vendor list.",
  connectionsCapped: "A connection read hit its cap, so this workspace may have more connections than are listed here.",
  commerceHealthCapped: "The connection-health read hit its cap, so some connections may be reported without their sync history."
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
  // A warning leaves the server beside the data and the renderer quotes one of
  // them into a line, so its fields are bounded HERE for the same reason
  // entityRef bounds a label. `String(message)` was the whole of it, and
  // `freshness.build` interpolates a bank connection's own `provider` into four
  // of these sentences — so an unbounded, multi-line, control-carrying provider
  // key produced a 323-character `message` and a 242-character `channel`, and
  // 227 characters of it were quoted into "This answer is incomplete: …".
  const row = { code, message: untrusted.safeText(message, { max: WARNING_MESSAGE_MAX }) };
  if (extra.channel) row.channel = untrusted.safeText(extra.channel, { max: WARNING_FIELD_MAX });
  if (extra.connectionId) row.connectionId = untrusted.safeText(extra.connectionId, { max: WARNING_FIELD_MAX });
  if (extra.section) row.section = untrusted.safeText(extra.section, { max: WARNING_FIELD_MAX });
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
 * The bound a string gets when this module walks a finished envelope, by the
 * field name it is stored under.
 *
 * Anything not named here gets `DEFAULT_STRING_MAX`. 200 is the widest bound
 * any capability gives a field it fills from somebody else's text (a ledger's
 * error message), and the longest honest string the ten capabilities produce
 * outside `message` is 132 characters, so nothing true is clipped. `message`
 * keeps `WARNING_MESSAGE_MAX` because a warning is quoted into a summary line
 * and this module's own longest sentence is 215.
 */
const STRING_MAX = Object.freeze({
  message: WARNING_MESSAGE_MAX,
  // A rendered line, if one is ever carried inside `data` rather than beside it.
  text: WARNING_MESSAGE_MAX
});
const DEFAULT_STRING_MAX = 200;

/**
 * A field NAME is a string a reader sees too, and it can be somebody else's:
 * `attention.amountsByCurrency` keys a block by a currency code off a payout,
 * which is the provider's own string. 60 is `WARNING_FIELD_MAX` — a key is a
 * word, never a sentence.
 */
const KEY_MAX = WARNING_FIELD_MAX;

/**
 * Every string a finished envelope carries, bounded and stripped, once, here.
 *
 * The invariant is one sentence — nothing a provider, a bank, a ledger or a
 * buyer wrote leaves this server unbounded, multi-line, or carrying a
 * character that can move a cursor, reverse a sentence or hide a payload — and
 * until now it was kept by each capability remembering to call
 * `untrusted.safeText` at each of its own call sites. A reviewer poisoned every
 * string source in a workspace with one 330-character payload and eight of the
 * ten capabilities repeated it back — and two of the leaks were in no
 * capability at all: `warning()` bounded nothing, and `freshness.build`
 * interpolates a bank connection's own provider key into four sentences, one of
 * which reached a rendered summary line. A rule kept by remembering is a rule
 * the eleventh capability opts out of by being written next year.
 *
 * So it is kept HERE instead, at the one door every answer leaves through,
 * over `data`, `warnings`, `freshness`, `entityRefs`, `suggestedActions` and
 * the envelope's own `action` — the whole object, values AND keys, at whatever
 * depth. The per-field bounds at the call sites stay: `entityRef` still caps a
 * label at 80 and `freshness.sourceRow` still caps a provider key at 40,
 * because a tighter bound where the meaning is known is better than a loose one
 * here. This is the floor underneath them, not their replacement.
 *
 * Two deliberate details:
 *
 *  - a key that sanitises into one that is already present is DROPPED rather
 *    than allowed to overwrite it (first wins), because a poisoned key must not
 *    be able to replace a real field's value; and
 *  - `Date` survives untouched. Nothing puts one in an envelope today (every
 *    time is an ISO string) but walking one as a plain object would silently
 *    turn it into `{}`.
 *
 * Numbers, booleans and null are returned as they are: this bounds text, and a
 * figure that has been through `render`'s numeral check must not change here.
 *
 * The two `Object.prototype` dances are not decoration. A field named
 * `constructor` would otherwise read a function out of the bounds table and
 * lose its 200-character budget to `safeText`'s own default, and a field named
 * `__proto__` — which `JSON.parse` produces as an OWN property — would set the
 * output object's prototype instead of becoming a field on it.
 */
const maxFor = (key) => (Object.prototype.hasOwnProperty.call(STRING_MAX, key) ? STRING_MAX[key] : DEFAULT_STRING_MAX);

function boundStrings(value, key = "") {
  if (typeof value === "string") return untrusted.safeText(value, { max: maxFor(key) });
  if (Array.isArray(value)) return value.map((row) => boundStrings(row, key));
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const out = {};
  for (const [name, inner] of Object.entries(value)) {
    const safeKey = untrusted.safeText(name, { max: KEY_MAX }) || "unnamed";
    if (Object.prototype.hasOwnProperty.call(out, safeKey)) continue;
    Object.defineProperty(out, safeKey, {
      value: boundStrings(inner, safeKey), enumerable: true, writable: true, configurable: true
    });
  }
  return out;
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
  // Last, over everything: after the channel profile, so the text it writes is
  // bounded too, and after the warnings are merged, so a freshness sentence
  // built out of a bank connection's own provider key is bounded whether or not
  // `warning()` was the function that built it. `summary.lines` is empty here —
  // render.js writes them afterwards and bounds each one through `line()`,
  // which is the same rule at the other door.
  return boundStrings(envelope);
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
 *
 * It is also read for the FOURTH shape (see `applyChannelProfile`): an ordinary
 * money-named number on a plain object that carries a currency of its own.
 */
const MONEY_NAME = /(amount|total|gross|net\b|fee|refund|discount|cost|profit|vat|tax|price|balance|revenue|paid|outstanding|payout|value|aov)/i;

/** A person can hide in these field names; a product name is not one of them. */
const PII_KEYS = Object.freeze(["customer", "customerName", "customerEmail", "buyerName", "contactName", "contactEmail", "email", "phone"]);

/** Entity references whose label can be a person rather than a number or a product. */
const PII_LABEL_TYPES = Object.freeze(["bankTransaction", "note"]);

/**
 * The letter-shaped currency markers a workspace can choose that are not
 * Unicode currency symbols, straight out of `money.SYMBOL_TO_ISO`. The
 * multi-character ones come FIRST in the alternation: JavaScript alternation is
 * ordered, and `\p{Sc}` would otherwise match the `$` of `R$` on its own and
 * leave the "R" standing beside a withheld amount.
 */
const CURRENCY_MARK = "R\\$|C\\$|A\\$|د\\.إ|CHF|zł|TL|kr|\\p{Sc}";

/**
 * Money written into a sentence. `"420 GBP still outstanding"` and `"£420 still
 * outstanding"` are the figure, not a description of it, and a redaction that
 * only looks at field names lets both through verbatim.
 *
 * This used to be a hand-maintained list of five symbols and thirteen ISO
 * codes. `money.SYMBOL_TO_ISO` lists seventeen currencies a workspace can pick
 * — ₹ INR, R$ BRL, ₽ RUB, ₴ UAH, ₪ ILS, د.إ AED were all missing — and
 * `money.currencyOf` accepts ANY `/^[A-Z]{3}$/` an order or a provider supplies,
 * so the list could never be complete. So the rule is the SHAPE instead: a
 * number next to any Unicode currency symbol, or next to any three-letter
 * uppercase token. `attention.js` writes `${round2(amount)} ${currency}` into
 * `data.items[].reason`, which is the one shape §6.4 calls out by name, and an
 * INR or AED workspace was handing a group thread the outstanding balance
 * verbatim.
 *
 * The ISO half is deliberately case-SENSITIVE. With `i`, `\d+\s?[A-Za-z]{3}\b`
 * eats "12 day(s)" and "5 min" out of sentences a channel is allowed to read.
 *
 * A shape rule does over-match sometimes — "DEPOSIT 12 ABC" in a bank
 * description loses its "12 ABC" — and that is the direction to err in on a
 * channel that has been told it may not see money at all.
 */
const MONEY_IN_TEXT = new RegExp(
  `(?:(?:${CURRENCY_MARK})\\s?\\d[\\d,]*(?:\\.\\d+)?)` +
  `|(?:\\d[\\d,]*(?:\\.\\d+)?\\s?(?:${CURRENCY_MARK}|[A-Z]{3}\\b))`,
  "gu"
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
 *    reader in FOUR shapes — a block (`totals`), a fact row keyed at runtime
 *    (`{ key: "amount", value, currency }`), a sentence a detector wrote
 *    (`"420 GBP still outstanding"`), and an ordinary money-named number on a
 *    plain object that carries a currency of its own
 *    (`{ payoutId, amount, currency }`). A key list catches the first only, so a
 *    group thread was refused `sales` and handed the same money back inside
 *    `reason`; the fourth shape was missed for a whole capability, and
 *    get_payout_reconciliation_overview said "Payout matching figures are not
 *    shown in this channel" in the line while `data.providers[].unmatchedAmount`
 *    and `data.unmatched[].amount` carried the figure into the payload a model
 *    reads.
 *  - **It must not destroy what the channel IS allowed to see.** The generic
 *    key `value` is money in `{ value: { cost, currency } }` and a count in
 *    `{ key: "count", value: 2 }`. Both directions are failures. That is why the
 *    fourth shape is keyed on the object declaring a `currency` rather than on
 *    the name alone: `heldForReview.total` and `data.totalItems` are counts with
 *    money-shaped names and no currency, and a group thread keeps them.
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

    // An object that names its own currency is holding money, whether or not
    // the block it sits in is one of the named ones.
    const carriesCurrency = Object.prototype.hasOwnProperty.call(value, "currency");

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
      // The fourth shape: a figure on a row that says which currency it is in.
      if (stripMoney && carriesCurrency && typeof inner === "number" && MONEY_NAME.test(key)) {
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
  STATES, WARNING_CODES, ENTITY_TYPES, MONEY_BLOCK_KEYS, MONEY_NAME, MONEY_IN_TEXT, PII_KEYS, PII_LABEL_TYPES, CAP_WARNINGS,
  WARNING_MESSAGE_MAX, WARNING_FIELD_MAX, STRING_MAX, DEFAULT_STRING_MAX, KEY_MAX,
  warning, capWarnings, entityRef, finish, applyChannelProfile, boundStrings
};

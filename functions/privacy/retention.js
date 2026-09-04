"use strict";

// When a buyer's personal details stop being ours to keep.
//
// A marketplace lends the seller a buyer's name and address so the seller can
// make the thing and post it. Amazon's Data Protection Policy says that loan
// ends thirty days after the order is fulfilled, and the details have to go.
// That is not a preference; it is a condition of holding the data at all.
//
// Two rules shape this file, and both are about not destroying somebody's
// business while satisfying a policy:
//
//   The scope is the MARKETPLACE'S data, not the workshop's. A jeweller who
//   takes a commission directly owns that relationship: the customer comes back
//   for a resize, a repair, a second piece, and scrubbing their address after a
//   month would be the software deleting the business's own records. So a
//   retention rule applies to an order only when it came from a provider that
//   imposes one.
//
//   The financial record stays. Amazon's own policy carves out what a seller
//   must keep for tax and legal purposes, and a scrubbed order still has to
//   reconcile: totals, VAT, fees, dates, line items and the marketplace's own
//   order id all survive. What goes is the person — name, email, phone, and the
//   address the parcel went to.
//
// Pure: no Firestore, no clock, no network. The caller supplies the order, the
// policy and the moment.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What each provider requires of us.
 *
 * `days: 0` means the provider imposes nothing, and NivaDesk keeps the data for
 * as long as the workshop wants it — which is the right answer for a shop the
 * workshop owns. A provider absent from this table is treated the same way: we
 * do not invent an obligation on somebody else's behalf.
 */
const PROVIDER_RETENTION = Object.freeze({
  // Amazon Data Protection Policy: PII deleted within 30 days of fulfilment,
  // beyond what tax and legal record-keeping requires.
  amazon: { days: 30, reason: "amazon_dpp" },
  // eBay, and the shops a workshop runs itself, impose no deletion deadline on
  // the seller's own copy of an order they fulfilled.
  ebay: { days: 0, reason: "" },
  shopify: { days: 0, reason: "" },
  woocommerce: { days: 0, reason: "" },
  etsy: { days: 0, reason: "" },
  square: { days: 0, reason: "" },
  inbound: { days: 0, reason: "" }
});

/**
 * The fields that carry a person, and what each becomes.
 *
 * Blanked rather than deleted: every client reads these keys, and a missing key
 * and an empty one are different bugs. The name is replaced with a marker so a
 * screen shows "Buyer details removed" instead of an empty row that reads like
 * data loss.
 */
const PII_FIELDS = Object.freeze({
  customerName: "Buyer details removed",
  shippingName: "",
  emailAddress: "",
  shippingPhone: "",
  shippingStreetAddress: "",
  shippingCity: "",
  shippingPostalCode: "",
  communication: "",
  instagramUsername: "",
  whatsappNumber: ""
});

/** Kept on purpose, and named here so the intent is auditable. */
const KEPT_ON_PURPOSE = Object.freeze([
  "orderValue", "paidAmount", "remainingAmount", "refundedAmount", "taxAmount",
  "paymentFee", "paymentDate", "lineItems", "commerce", "shippingCountry", "finance"
]);

function providerOf(order) {
  const stamped = order && order.commerce && order.commerce.provider;
  if (stamped) return String(stamped).toLowerCase();
  const source = order && order.customFields && order.customFields.Source;
  return String(source || "").trim().toLowerCase();
}

/** The rule for one order, or null when nobody imposes one. */
function retentionRuleFor(order, overrides = {}) {
  const provider = providerOf(order);
  if (!provider) return null;
  const table = { ...PROVIDER_RETENTION, ...(overrides || {}) };
  const rule = table[provider];
  if (!rule || !(Number(rule.days) > 0)) return null;
  return { provider, days: Number(rule.days), reason: String(rule.reason || provider) };
}

function deliveredAtOf(order) {
  const at = Number(order && order.deliveredAtMs);
  return Number.isFinite(at) && at > 0 ? at : 0;
}

/**
 * Whether this order's buyer details are due to be removed, and why not if not.
 *
 * The reason is returned in both directions because a sweep that cannot explain
 * itself cannot be trusted with deletion, and because "not yet" and "never" are
 * different answers that an operator needs to be able to tell apart.
 */
function scrubDecision(order = {}, nowMs = 0, overrides = {}) {
  if (order.piiScrubbedAtMs) return { scrub: false, reason: "already_scrubbed" };

  const rule = retentionRuleFor(order, overrides);
  if (!rule) return { scrub: false, reason: "no_retention_rule" };

  // Delivery is the event the clock hangs on. An order still being made, or one
  // delivered before NivaDesk started recording when, is left alone: guessing a
  // delivery date would delete a live order's buyer halfway through the job.
  if (order.isDelivered !== true) return { scrub: false, reason: "not_delivered", rule };
  const deliveredAtMs = deliveredAtOf(order);
  if (!deliveredAtMs) return { scrub: false, reason: "no_delivery_date", rule };

  const now = Number(nowMs);
  if (!Number.isFinite(now) || now <= 0) return { scrub: false, reason: "no_clock", rule };

  const dueAtMs = deliveredAtMs + rule.days * DAY_MS;
  if (now < dueAtMs) return { scrub: false, reason: "not_due", rule, dueAtMs };

  return { scrub: true, reason: rule.reason, rule, dueAtMs };
}

/**
 * The patch that removes the person and leaves the sale.
 *
 * Only fields the order actually has are touched, so the patch is empty for an
 * order that was already bare — and an empty patch is how the caller knows
 * there is nothing to write.
 */
function scrubPatch(order = {}, nowMs = 0, overrides = {}) {
  const decision = scrubDecision(order, nowMs, overrides);
  if (!decision.scrub) return { patch: {}, decision };

  const patch = {};
  for (const [field, replacement] of Object.entries(PII_FIELDS)) {
    const current = order[field];
    if (current === undefined || current === null || current === "") continue;
    if (current === replacement) continue;
    patch[field] = replacement;
  }
  // Stamped even when nothing else changed, so the sweep does not revisit this
  // order every night for the rest of its life.
  patch.piiScrubbedAtMs = Number(nowMs);
  patch.piiScrubbedReason = decision.reason;
  return { patch, decision };
}

/**
 * The distinct retention periods anybody imposes, shortest first.
 *
 * The sweep runs one pass per period rather than one pass over everything, and
 * that is not tidiness. A single pass has to bound its query by the SHORTEST
 * period, which means it sees orders belonging to longer ones — and an order
 * that is not yet due holds the cursor. One eBay order with a sixty-day rule
 * would sit in a thirty-day pass and stall deletion for every workspace behind
 * it, quietly, while the job reported success. Inside a pass for period D,
 * every order that matters is due, so nothing can hold the cursor.
 */
function retentionPeriodsInDays(overrides = {}) {
  const table = { ...PROVIDER_RETENTION, ...(overrides || {}) };
  const days = new Set();
  for (const rule of Object.values(table)) {
    const n = Number(rule && rule.days);
    if (Number.isFinite(n) && n > 0) days.add(n);
  }
  return [...days].sort((a, b) => a - b);
}

/**
 * The decision for one order inside the pass for `days`.
 *
 * An order belonging to a different period is finished with AS FAR AS THIS PASS
 * IS CONCERNED — its own pass will handle it — so it does not hold this pass's
 * cursor. That distinction is the whole reason the passes are separate.
 */
function sweepDecision(order = {}, nowMs = 0, days = 0, overrides = {}) {
  const rule = retentionRuleFor(order, overrides);
  if (rule && Number(days) > 0 && rule.days !== Number(days)) {
    return { scrub: false, reason: "other_retention_period", rule };
  }
  return scrubDecision(order, nowMs, overrides);
}

/**
 * Whether a decision is one the sweep is finished with.
 *
 * Finished means: this pass will never need to look at this order again.
 * Scrubbed, already scrubbed, nobody imposes a rule, or somebody else's pass
 * owns it. "Not due" and "not delivered" are the opposite — they are answers
 * that change with time.
 */
function decisionIsFinal(decision) {
  if (!decision) return false;
  if (decision.scrub) return true;
  return decision.reason === "already_scrubbed"
    || decision.reason === "no_retention_rule"
    || decision.reason === "other_retention_period";
}

/**
 * Where the sweep's cursor should sit after a pass.
 *
 * The cursor is what stops the sweep re-reading every delivered order it has
 * ever seen, every night, forever. It may only move past orders the sweep has
 * finished with: one order that is not yet due holds it, so the next pass finds
 * that order again instead of stepping over it and never returning.
 *
 * Items arrive in delivery order, which is the order the query returns them in.
 * A gap — a finished order after an unfinished one — does not move the cursor,
 * because moving it would skip the unfinished one in between.
 */
function cursorAfterSweep(previousCursor = 0, items = []) {
  let cursor = Number(previousCursor) || 0;
  for (const item of Array.isArray(items) ? items : []) {
    const at = Number(item && item.deliveredAtMs) || 0;
    if (!decisionIsFinal(item && item.decision)) break;
    if (at > cursor) cursor = at;
  }
  return cursor;
}

module.exports = {
  PROVIDER_RETENTION, PII_FIELDS, KEPT_ON_PURPOSE,
  providerOf, retentionRuleFor, scrubDecision, scrubPatch,
  retentionPeriodsInDays, sweepDecision, decisionIsFinal, cursorAfterSweep
};

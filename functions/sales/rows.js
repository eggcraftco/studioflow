// One Sales row, built from the order that already exists.
//
// Faz 1 reads and never writes: the row is derived from `siparisler` at read
// time, so Sales and Orders can never disagree and no back-fill is needed to
// see the list. What the row may carry is deliberately narrow:
//
//   * money only from the finance stamp, only when the stamp is current, and
//     only for a member the workspace lets see money. Sales never recomputes a
//     total and never re-stamps on read (finance/engine.js owns that);
//   * no customer contact detail, no notes, no custom fields, no payment rows,
//     no cost or profit figure;
//   * for a restricted marketplace the customer label is withheld entirely, and
//     `restrictedCustomer` is never read.
//
// The classification is honest about what it cannot know. Without a product
// link there is no evidence that an order is a product sale, so it stays
// "needs_review" rather than being guessed from a name or a SKU.

// Which marketplaces' buyer data belongs to the marketplace rather than to us.
// Taken from the privacy policy table itself, so this list cannot drift from the
// one the outbound channels enforce; the fallback only covers a shape change.
const { PROVIDER_PII_POLICY } = require("../privacy/outbound");
const RESTRICTED_PROVIDERS = Object.freeze(
  Object.entries(PROVIDER_PII_POLICY || {})
    .filter(([, policy]) => policy && policy.restricted === true)
    .map(([provider]) => String(provider))
    .sort()
);

const KINDS = Object.freeze({ PRODUCT_SALE: "product_sale", BESPOKE: "bespoke_work", HYBRID: "hybrid", REVIEW: "needs_review" });

const text = (value, max = 200) => String(value == null ? "" : value).trim().slice(0, max);
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

function millisOf(value) {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value.toMillis === "function") { try { return value.toMillis(); } catch { return 0; } }
  if (typeof value === "object" && typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Which shop an order came from, from the stamps the existing paths already write. */
function channelOf(order = {}) {
  const provider = text(order.commerce && order.commerce.provider, 40).toLowerCase();
  if (provider) return provider;
  if (order.etsySource && typeof order.etsySource === "object") return "etsy";
  if (text(order.orderSource, 40).toLowerCase() === "inbound") return "inbound";
  return "manual";
}

function isRestrictedChannel(channel) { return RESTRICTED_PROVIDERS.includes(String(channel || "")); }

/**
 * What kind of sale this is, and on what evidence. A repair intake marks the
 * customer's own property, which is never stock; everything else waits for a
 * product link, which Faz 1 does not have.
 */
function classifyOrder(order = {}) {
  const repairIntake = order.repairIntake && typeof order.repairIntake === "object" ? order.repairIntake : null;
  if (text(order.orderType, 40).toLowerCase() === "repair" || (repairIntake && repairIntake.customerOwned === true)) {
    return { kind: KINDS.BESPOKE, source: "repair_intake", customerOwnedItem: Boolean(repairIntake && repairIntake.customerOwned === true) };
  }
  return { kind: KINDS.REVIEW, source: "unclassified", customerOwnedItem: false };
}

/** Is the stamped finance block the one this server would compute today? */
function financeStateOf(order = {}, engineVersion = 0) {
  const finance = order.finance && typeof order.finance === "object" ? order.finance : null;
  if (!finance) return "missing";
  if (Number(finance.engineVersion) !== Number(engineVersion)) return "stale";
  return "current";
}

function paymentStateOf(order = {}) {
  const paid = Number(order.paidAmount) || 0;
  const remaining = Number(order.remainingAmount) || 0;
  const refunded = Number(order.refundedAmount) || 0;
  if (refunded > 0.005 && paid <= 0.005) return "refunded";
  if (paid > 0.005 && remaining <= 0.005) return "paid";
  if (paid > 0.005) return "partially_paid";
  return "unpaid";
}

function deliveryStateOf(order = {}) {
  if (order.isDelivered === true) return "delivered";
  if (order.isDispatched === true) return "dispatched";
  return "in_progress";
}

function isCancelled(order = {}) { return /cancel/i.test(text(order.status, 60)); }

/**
 * The demo quota direction: a confirmed, not cancelled, not fully delivered
 * product sale occupies an active-order slot.
 *
 * NOT wired into the limit engine here. Today `countActiveOrders`
 * (functions/index.js) counts every order that is neither deleted nor
 * delivered, so a cancelled order still holds a slot. This helper states the
 * intended rule so the difference is visible and testable before anyone
 * changes the engine.
 */
function salesCountsAsActiveOrder(order = {}) {
  if (order.isDeleted === true) return false;
  if (order.isDelivered === true) return false;
  if (isCancelled(order)) return false;
  if (text(order.salesCommercialState, 20).toLowerCase() === "draft") return false;
  return true;
}

/**
 * @param {object} order the order document plus its id
 * @param {object} options { financeVisible, currency, engineVersion }
 */
function salesRowFromOrder(order = {}, { financeVisible = false, currency = "", engineVersion = 0 } = {}) {
  const channel = channelOf(order);
  const restricted = isRestrictedChannel(channel);
  const classification = classifyOrder(order);
  const financeState = financeStateOf(order, engineVersion);
  const lines = Array.isArray(order.lineItems) ? order.lineItems : [];
  const finance = order.finance && typeof order.finance === "object" ? order.finance : {};

  const attentionReasons = [];
  if (classification.kind === KINDS.REVIEW) attentionReasons.push("classify");
  if (financeState === "missing") attentionReasons.push("finance_missing");
  if (financeState === "stale") attentionReasons.push("finance_stale");

  const showMoney = financeVisible === true && financeState === "current";
  return {
    orderId: text(order.id, 128),
    kind: classification.kind,
    classificationSource: classification.source,
    channel,
    externalOrderId: text(order.commerce && order.commerce.externalId, 64),
    customerLabel: restricted ? "" : text(order.customerName, 120),
    customerLabelWithheld: restricted,
    summary: lines.slice(0, 2).map((line) => text(line && line.name, 80)).filter(Boolean).join(" + "),
    itemCount: lines.length,
    paymentState: paymentStateOf(order),
    deliveryState: deliveryStateOf(order),
    workRequired: classification.kind === KINDS.BESPOKE,
    customerOwnedItem: classification.customerOwnedItem,
    cancelled: isCancelled(order),
    countsAsActiveOrder: salesCountsAsActiveOrder(order),
    needsAttention: attentionReasons.length > 0,
    attentionReasons,
    orderDateMs: millisOf(order.paymentDate),
    createdAtMs: Number(order.createdAtMs) || 0,
    financeState,
    revenue: showMoney ? money(finance.revenue) : null,
    currency: showMoney ? text(currency, 8) : null
  };
}

module.exports = {
  salesRowFromOrder, classifyOrder, channelOf, isRestrictedChannel, financeStateOf,
  paymentStateOf, deliveryStateOf, salesCountsAsActiveOrder, millisOf,
  SALES_KINDS: KINDS, SALES_RESTRICTED_PROVIDERS: RESTRICTED_PROVIDERS
};

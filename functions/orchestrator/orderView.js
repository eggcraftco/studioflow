"use strict";

/**
 * One order, read once, the same way by every capability.
 *
 * Two capabilities deriving "is this paid" separately is how a dashboard and an
 * assistant end up disagreeing about the same order, so the derivation lives
 * here and the capabilities read the result.
 *
 * Money always comes from `finance/engine.js` — recomputed, never taken from
 * the `order.finance` stamp. The stamp is rewritten only by the order-write
 * trigger, and `financeSweep` refuses to re-run for an unchanged engine
 * version, so after the owner changes `feePercentage` or a VAT setting every
 * order not written since carries the old platform fee, VAT and profit. Trusting
 * the stamp would serve those old figures with a fresh timestamp on them. The
 * stamp is kept as a cross-check (`stampAgrees`), which is what it is good for.
 */

const engine = require("../finance/engine");
const productionModule = require("../production");
const channelModule = require("./channel");
const money = require("./money");

const PAYMENT_STATUSES = require("../commerce/envelope").PAYMENT_STATUSES;
const FULFILLMENT_STATUSES = require("../commerce/envelope").FULFILLMENT_STATUSES;

const DAY_MS = 24 * 60 * 60 * 1000;
const clean = (value) => String(value === undefined || value === null ? "" : value).trim();

/** A date on an order, as UTC milliseconds, or null. */
function dateMs(value) {
  if (!value) return null;
  if (typeof value === "object") {
    if (typeof value.toMillis === "function") return value.toMillis();
    if (Number.isFinite(Number(value._seconds))) return Number(value._seconds) * 1000;
    if (Number.isFinite(Number(value.seconds))) return Number(value.seconds) * 1000;
  }
  if (Number.isFinite(Number(value)) && Number(value) > 1000000000) {
    const num = Number(value);
    return num > 1e12 ? num : num * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The due date, exactly as `nvChatGPTDueDateMillis` computes it — including the
 * rule that `deliveryTime: 0` means NO date. Without that rule every dateless
 * order becomes overdue the moment it is created.
 */
function dueDateMs(order = {}) {
  const explicit = dateMs(order.dueDate) || dateMs(order.deliveryDueDate) || dateMs(order.deliveryDate);
  if (explicit) return explicit;
  const start = dateMs(order.paymentDate) || dateMs(order.createdAt);
  const days = Number(order.deliveryTime || order.deliveryDays || 0);
  if (start && Number.isFinite(days) && days > 0) return start + days * DAY_MS;
  return null;
}

function isCompletedStatus(value = "") {
  const status = clean(value).toLowerCase();
  return ["completed", "complete", "done", "delivered", "finished", "tamamlandı", "tamamlandi"].includes(status);
}

function isCancelledStatus(value = "") {
  const status = clean(value).toLowerCase();
  return ["cancelled", "canceled", "cancel", "iptal", "cancelled order"].includes(status);
}

/**
 * Provider-shaped statuses for an order that has no provider.
 *
 * A manual order is not "unknown" — its money says whether it is paid, and
 * dispatch says whether it went out. What it genuinely does not have is a
 * PLATFORM status, because there is no platform: that stays `null`, and the row
 * says so with `platformStatusSource: "none"` rather than filing it as
 * "unknown" beside real unknowns.
 */
function derivedPaymentStatus(finance, order) {
  const paid = Number(order.paidAmount) || 0;
  const remaining = Number(order.remainingAmount) || 0;
  const refunded = Number(finance.refunded) || 0;
  if (refunded > 0 && paid > 0 && refunded >= paid) return "refunded";
  if (paid > 0 && remaining <= 0) return "paid";
  if (paid > 0 && remaining > 0) return "partially_paid";
  if (paid === 0) return "unpaid";
  return "unknown";
}

function derivedFulfillmentStatus(order) {
  if (order.isDelivered === true || order.isDispatched === true) return "fulfilled";
  return "unfulfilled";
}

/**
 * Everything a capability needs about one order, computed once.
 *
 * `order` must already have been through `redactForChannel` in loaders.js;
 * nothing here un-redacts anything.
 */
function buildOrderView(order = {}, { settings = {}, workspace = "GBP", nowMs = Date.now(), production = null } = {}) {
  const identity = channelModule.channelOf(order);
  const currency = money.currencyOf(order, { workspace });
  const paymentMs = dateMs(order.paymentDate);
  const createdMs = dateMs(order.createdAt);
  const finance = engine.computeOrderFinance(order, settings, { paymentDateMs: paymentMs || createdMs || NaN });

  const commerce = (order.commerce && typeof order.commerce === "object") ? order.commerce : {};
  const platformPayment = clean(commerce.paymentStatus).toLowerCase();
  const platformFulfilment = clean(commerce.fulfillmentStatus).toLowerCase();
  const hasCommerce = Boolean(commerce.provider);

  const stamp = (order.finance && typeof order.finance === "object") ? order.finance : null;
  const stampAgrees = stamp
    ? Math.abs((Number(stamp.netProfit) || 0) - finance.netProfit) < 0.01
      && Math.abs((Number(stamp.platformFee) || 0) - finance.platformFee) < 0.01
    : null;

  // The production stage is COMPUTED, never stored (memory rule: an order's
  // stage is derived from its steps). The stages and steps come from the
  // workspace's own settings, so the assistant sees the board the owner sees.
  let stage = null;
  if (production && Array.isArray(production.stages) && production.stages.length) {
    const resolved = productionModule.resolveProductionStage(order, production.stages, production.steps || []);
    const stageRow = production.stages.find((row) => row.id === resolved.stageId) || null;
    stage = { id: resolved.stageId, kind: stageRow ? stageRow.kind : null, blocker: resolved.blocker || null, doneCount: resolved.doneCount, total: resolved.total };
  }

  // An estimate that was sent and has had no answer. `estimates[]` is the small
  // index the order card reads; the record itself lives in a subcollection and
  // is not needed to know that somebody is waiting.
  const estimates = Array.isArray(order.estimates) ? order.estimates : [];
  const awaitingEstimate = estimates
    .filter((row) => ["sent", "viewed"].includes(clean((row || {}).status).toLowerCase()) && !Number((row || {}).decidedAtMs))
    .map((row) => Number(row.sentAtMs) || Number(row.createdAtMs) || 0)
    .filter((value) => value > 0)
    .sort((lhs, rhs) => lhs - rhs);

  return {
    id: String(order.id || ""),
    orderNumber: clean(order.orderNumber || order.siparisNo || ""),
    stage,
    estimateWaitingSinceMs: awaitingEstimate.length ? awaitingEstimate[0] : null,
    projectNumber: clean(order.projectNumber || ""),
    identity,
    channel: identity.channel,
    manualSource: identity.manualSource,
    currency: currency.currency,
    currencyAssumed: currency.assumed,
    dateMs: paymentMs || createdMs || null,
    dateBasis: paymentMs ? "paymentDate" : (createdMs ? "createdAt" : "none"),
    createdAtMs: createdMs,
    updatedAtMs: dateMs(order.updatedAt),
    dueDateMs: dueDateMs(order),
    status: clean(order.status),
    designStatus: clean(order.designStatus),
    completed: isCompletedStatus(order.status),
    cancelled: isCancelledStatus(order.status),
    isDispatched: order.isDispatched === true,
    isDelivered: order.isDelivered === true,
    trackingNumber: clean(order.trackingNumber),
    assignedToUid: clean(order.assignedToUid),
    finance,
    stampAgrees,
    paidAmount: Number(order.paidAmount) || 0,
    remainingAmount: Number(order.remainingAmount) || 0,
    platformStatus: hasCommerce ? (clean(commerce.platformStatus) || null) : null,
    platformStatusSource: hasCommerce ? "provider" : "none",
    paymentStatus: PAYMENT_STATUSES.has(platformPayment) ? platformPayment : derivedPaymentStatus(finance, order),
    fulfillmentStatus: FULFILLMENT_STATUSES.has(platformFulfilment) ? platformFulfilment : derivedFulfillmentStatus(order),
    reviewRequired: commerce.reviewRequired === true,
    lastSyncAtMs: dateMs(commerce.lastSyncAt),
    restricted: order.__piiRestricted === true,
    customerName: clean(order.customerName),
    customerEmail: clean(order.emailAddress)
  };
}

/** UTC calendar-day bounds for an inclusive `YYYY-MM-DD` range. */
function rangeBounds(fromDate = "", toDate = "") {
  const parseDay = (value) => {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  };
  const from = parseDay(fromDate);
  const to = parseDay(toDate);
  return {
    fromMs: from,
    toMs: to === null ? null : to + DAY_MS - 1,
    fromDate: from === null ? null : String(fromDate),
    toDate: to === null ? null : String(toDate)
  };
}

function inRange(view, bounds) {
  if (!bounds || (bounds.fromMs === null && bounds.toMs === null)) return true;
  const at = view.dateMs;
  if (at === null) return false;
  if (bounds.fromMs !== null && at < bounds.fromMs) return false;
  if (bounds.toMs !== null && at > bounds.toMs) return false;
  return true;
}

module.exports = {
  DAY_MS,
  dateMs,
  dueDateMs,
  isCompletedStatus,
  isCancelledStatus,
  buildOrderView,
  rangeBounds,
  inRange,
  derivedPaymentStatus,
  derivedFulfillmentStatus
};

"use strict";

// The events a workspace has already produced, read out of what it already has.
//
// The activation engine wants a list of things that happened. The obvious way
// to get one is to start recording them — and then wait weeks, while the
// question everybody is asking ("are the workspaces that signed up getting any
// value?") stays unanswered for the workspaces that signed up MONTHS ago.
//
// Most of the answer is already on disk. An order with a `commerce` stamp IS an
// external order that was imported, and it is dated. A customer document IS a
// customer that was created. A bank transaction carrying a linkedOrderId IS a
// match somebody made. Deriving those costs nothing and works retroactively,
// which is the whole point: the thirty-seven workspaces that have signed up can
// be measured tonight rather than from tonight.
//
// What CANNOT be derived is named at the bottom, honestly, because a derivation
// that quietly covers eight of ten events and calls itself complete is worse
// than one that says which two are missing.
//
// Pure: the caller does the reading and hands over plain documents. No
// Firestore, no clock, no network.

const { describeEvent } = require("./events");

function millisOf(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === "object" && typeof value.toMillis === "function") {
    const ms = value.toMillis();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  if (typeof value === "object" && Number.isFinite(Number(value.seconds))) {
    const ms = Number(value.seconds) * 1000;
    return ms > 0 ? ms : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** The first usable date among several candidates — documents disagree about which field they carry. */
function firstTime(...candidates) {
  for (const candidate of candidates) {
    const ms = millisOf(candidate);
    if (ms !== null) return ms;
  }
  return null;
}

/**
 * @param {object} snapshot {
 *   orders: [], customers: [], bankConnections: [], bankTransactions: [],
 *   inventoryItems: [], accountingConnections: [], shopifyStores: [],
 *   etsyConnections: [], wooConnections: [], squareConnections: [], ebayConnections: [],
 *   settings: {}
 * }
 * @returns {{events: [], missing: []}} events are {name, atMs, subjectId}
 */
function deriveEvents(snapshot = {}) {
  const events = [];
  const list = (value) => (Array.isArray(value) ? value : []);
  const push = (name, atMs, subjectId) => {
    if (atMs === null || !describeEvent(name).declared) return;
    events.push({ name, atMs, subjectId: String(subjectId || "") });
  };

  // ---- onboarding, from the wizard's own stamp
  const settings = snapshot.settings && typeof snapshot.settings === "object" ? snapshot.settings : {};
  const onboardedAt = firstTime(settings.businessOnboardingCompletedAt);
  if (onboardedAt !== null) {
    // The wizard does not record when it was STARTED, so completion stands for
    // both. Saying "started" here from a completion stamp is not a guess: you
    // cannot finish something you did not begin.
    push("onboarding_started", onboardedAt, "wizard");
    push("onboarding_completed", onboardedAt, "wizard");
  }

  // ---- orders: the shape of the document says how it arrived
  for (const order of list(snapshot.orders)) {
    const id = order.id || order.orderId || "";
    const createdAt = firstTime(order.createdAtMs, order.createdAt, order.paymentDate);
    const fromShop = Boolean(order.commerce && order.commerce.provider) ||
      Boolean(order.customFields && order.customFields.Source);
    if (fromShop) push("external_order_imported", createdAt, id);
    else push("order_created", createdAt, id);
    if (order.isDelivered === true) push("order_delivered", firstTime(order.deliveredAtMs, order.updatedAt, createdAt), id);
  }

  for (const customer of list(snapshot.customers)) {
    push("customer_created", firstTime(customer.createdAtMs, customer.createdAt), customer.id || "");
  }

  // ---- integrations: one connected event per live connection
  const connectionGroups = [
    { rows: snapshot.shopifyStores, at: (row) => firstTime(row.linkedAt, row.createdAt, row.updatedAt), live: (row) => row.status !== "unlinked" },
    { rows: snapshot.etsyConnections, at: (row) => firstTime(row.connectedAtMs, row.createdAt), live: (row) => row.status !== "disconnected" },
    { rows: snapshot.wooConnections, at: (row) => firstTime(row.connectedAtMs, row.createdAt), live: (row) => row.status !== "disconnected" },
    { rows: snapshot.squareConnections, at: (row) => firstTime(row.connectedAtMs, row.createdAt), live: (row) => row.status !== "disconnected" },
    { rows: snapshot.ebayConnections, at: (row) => firstTime(row.connectedAtMs, row.createdAt), live: (row) => row.status !== "disconnected" }
  ];
  for (const group of connectionGroups) {
    for (const row of list(group.rows)) {
      if (!group.live(row)) continue;
      push("integration_connected", group.at(row), row.id || row.shop || row.host || row.merchantId || "");
    }
  }

  for (const connection of list(snapshot.bankConnections)) {
    push("bank_connected", firstTime(connection.linkedAt, connection.createdAt), connection.id || "");
  }
  for (const connection of list(snapshot.accountingConnections)) {
    push("accounting_connected", firstTime(connection.linkedAtMs, connection.createdAt), connection.id || connection.provider || "");
  }

  // ---- the moment money meets work
  for (const transaction of list(snapshot.bankTransactions)) {
    if (!transaction.linkedOrderId) continue;
    push("bank_match_completed", firstTime(transaction.reviewedAt, transaction.updatedAt, transaction.date), transaction.id || "");
  }

  for (const item of list(snapshot.inventoryItems)) {
    push("inventory_item_created", firstTime(item.createdAtMs, item.createdAt), item.id || "");
    // A quantity that has been drawn down is stock consumed by real work.
    if (Number(item.consumedQuantity) > 0 || item.lastConsumedAtMs) {
      push("inventory_consumed_by_order", firstTime(item.lastConsumedAtMs, item.updatedAt), item.id || "");
    }
  }

  events.sort((a, b) => a.atMs - b.atMs || a.name.localeCompare(b.name));

  return { events, missing: [...UNDERIVABLE] };
}

/**
 * The events no document can stand in for, and why.
 *
 * Naming them is the honest half of this file: a derivation that covers most of
 * the registry and says nothing about the rest reads as complete, and the gaps
 * then look like workspaces that did nothing rather than like measurements
 * nobody took.
 */
const UNDERIVABLE = Object.freeze([
  // Nothing records that somebody opened a connect screen and gave up, which is
  // exactly the population this whole system exists to find.
  "integration_connect_started",
  "bank_connect_started",
  "accounting_connect_started",
  // An assistant answer grounded in the workspace's own data leaves no trace on
  // any document, so AI activation cannot be derived at all.
  "ai_business_data_connected",
  "grounded_ai_answer",
  // Feedback and dismissals are the system's own records and start empty.
  "feedback_submitted",
  "feedback_prompt_dismissed"
]);

module.exports = { deriveEvents, UNDERIVABLE_EVENTS: UNDERIVABLE, millisOf, firstTime };

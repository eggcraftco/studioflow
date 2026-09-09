"use strict";

// SUBSTANTIVE_ORDER v2.1 — the one test of whether an order is work or a shell.
//
// Every order NivaDesk creates starts as a document that is already "an order"
// to anything that counts documents: it has a status, a placeholder name, a
// delivery window and twenty-odd server stamps before a person has typed a
// thing. Thirty-three such shells in eleven dead workspaces were counting as
// activation, and the dashboard checklist ticked "Create your first project"
// the moment one existed. This predicate is what those two readers — the
// funnel (lifecycle/derive.js) and the checklist (getSetupChecklist) — were
// each approximating by hand, and had already drifted apart on.
//
// Every clause tests a field that NO creation path writes a non-default value
// into: the web/Android/Quick Create path, the Swift save path, the MCP path
// and the shop importers were each checked field by field
// (docs/onboarding/activation-definition-v2.md §A.7). A document that was
// created and abandoned fails all six.
//
// It is a DISJUNCTION and has to stay one: a workflow-only member cannot write
// money at all (every creation path zeroes the money fields for that role), so
// a money-only test would deny activation, by design, to any workspace whose
// work is done by workflow-only members. Clauses 2–6 are what keep the
// unpriced-but-real job visible.
//
// Deliberately NOT here, with the numbers that rejected them (§A.8): `notes`,
// `communication`, `customFields`, `clientFiles` (each re-admits one of the
// dead workspaces), `designName` (the one clause already caught counting a
// generated label as work), `status`/`historyLog` (fire on exploration),
// `deliveryTime` (a client-version marker), `taxRate`/`finance.*` (server
// stamps).
//
// Pure: no Firestore, no clock, no network. Both readers must import THIS
// function; a copy of it in either would be the drift this file exists to end.
// Spec: docs/onboarding/activation-definition-v2.md §A.6, §A.10.

/**
 * The customer names every creation path writes when nobody typed one, in
 * every language the clients ship, lower-cased and trimmed.
 *
 * Closed by construction (§A.3.2): the server's four literals, the `New Project`
 * row of the four translation tables, the `New Order` row (no writer produces
 * it today; included because no real customer is plausibly named "Neue
 * Bestellung"), and the two client-local spellings that are in no server list.
 *
 * This list is the predicate's only maintenance liability, and a list cannot
 * defend itself: a thirteenth language, a reworded key or a second
 * `t()`-writing create button reopens it silently, in the direction of FALSE
 * activation. lifecycle-substantive-order.test.js reads the four translation
 * tables and fails the build when a value is missing here.
 */
const PLACEHOLDER_NAMES = Object.freeze([
  // the server's own four (orders/projectNumber.js; index.js:13955 tests the same literals)
  "new order", "new project", "yeni sipariş", "yeni proje",
  // the `New Project` row
  "neues projekt", "nouveau projet", "nuovo progetto", "nuevo proyecto", "novo projeto",
  "новый проект", "新規プロジェクト", "新项目", "مشروع جديد", "नया प्रोजेक्ट",
  // the `New Order` row
  "neue bestellung", "nouvelle commande", "nuovo ordine", "nuevo pedido", "novo pedido",
  "новый заказ", "新規注文", "新订单", "طلب جديد", "नया ऑर्डर",
  // client-local spellings in no server list
  "新建项目", "yeni siparis"
]);

const PLACEHOLDER_SET = new Set(PLACEHOLDER_NAMES);

/** The clause names, in the order §A.6 states them. */
const CLAUSES = Object.freeze(["money", "named_customer", "line_items", "fulfilment", "contact_channel", "payment_recorded"]);

const text = (value) => (typeof value === "string" ? value : value == null ? "" : String(value)).trim();
const positive = (value) => Number(value) > 0;
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;

/** Normalises a name the way the placeholder set is written: trimmed, lower-cased, inner whitespace collapsed. */
function normalizeName(value) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

/** True when the name is one nobody typed. */
function isPlaceholderName(value) {
  const name = normalizeName(value);
  return name === "" || PLACEHOLDER_SET.has(name);
}

/**
 * Which of the six clauses hold for an order. The empty object for a deleted
 * document: a deleted order is not evidence of anything, whatever it carries.
 *
 * Returned as a map rather than a boolean so a checklist can say WHY a shell is
 * still a shell ("no customer, no amount, no items") without a second
 * implementation of the rule.
 */
function substantiveClauses(order) {
  const o = order && typeof order === "object" ? order : {};
  if (o.isDeleted === true) return {};
  const held = {};
  if (positive(o.orderValue) || positive(o.paidAmount) || positive(o.remainingAmount) || positive(o.watchPurchasePrice)) held.money = true;
  if (!isPlaceholderName(o.customerName)) held.named_customer = true;
  if (nonEmptyArray(o.lineItems)) held.line_items = true;
  if (o.isDispatched === true || o.isDelivered === true || text(o.trackingNumber) !== "") held.fulfilment = true;
  if (text(o.emailAddress) !== "" || text(o.whatsappNumber) !== "" || text(o.instagramUsername) !== "") held.contact_channel = true;
  if (nonEmptyArray(o.payments)) held.payment_recorded = true;
  return held;
}

/** SUBSTANTIVE_ORDER(o): any clause holds. */
function isSubstantiveOrder(order) {
  return Object.keys(substantiveClauses(order)).length > 0;
}

/** True for a live order that is still only a shell — the state the checklist has to name. */
function isShellOrder(order) {
  const o = order && typeof order === "object" ? order : {};
  return o.isDeleted !== true && !isSubstantiveOrder(o);
}

/**
 * The first substantive order of a list, or null. "First" is list order: the
 * caller decides the sort (the checklist wants any; the funnel wants the
 * earliest and already sorts by creation time).
 */
function firstSubstantiveOrder(orders) {
  for (const order of Array.isArray(orders) ? orders : []) {
    if (isSubstantiveOrder(order)) return order;
  }
  return null;
}

/**
 * What a workspace's orders say about its first real job, in one object the
 * checklist can render from without re-deriving anything:
 *
 *   { state: "none" }                        — no live order at all
 *   { state: "shell", shellId, shellCount }  — orders exist, none substantive
 *   { state: "substantive", orderId }        — at least one real order
 *
 * `shellId` is the shell the checklist should deep-link to — the most recently
 * created one, because that is the one the person was last looking at; ties
 * and undated documents fall back to list order.
 */
function firstOrderProgress(orders) {
  const live = (Array.isArray(orders) ? orders : []).filter((order) => order && typeof order === "object" && order.isDeleted !== true);
  if (live.length === 0) return { state: "none" };
  const substantive = firstSubstantiveOrder(live);
  if (substantive) return { state: "substantive", orderId: text(substantive.id || substantive.orderId) };
  const stamp = (order) => {
    for (const candidate of [order.createdAtMs, order.createdAt]) {
      if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
      if (candidate && typeof candidate.toMillis === "function") return candidate.toMillis();
      if (typeof candidate === "string" && candidate) { const ms = Date.parse(candidate); if (Number.isFinite(ms)) return ms; }
    }
    return -Infinity;
  };
  let newest = live[0];
  for (const order of live) if (stamp(order) > stamp(newest)) newest = order;
  return { state: "shell", shellId: text(newest.id || newest.orderId), shellCount: live.length };
}

module.exports = {
  PLACEHOLDER_NAMES,
  CLAUSES,
  normalizeName,
  isPlaceholderName,
  substantiveClauses,
  isSubstantiveOrder,
  isShellOrder,
  firstSubstantiveOrder,
  firstOrderProgress
};

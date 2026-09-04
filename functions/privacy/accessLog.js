"use strict";

// Who looked at whose personal data, and how.
//
// NivaDesk records what CHANGED — settings, bank connections, who disconnected
// an integration — and nothing at all about what was READ. "Which operator
// opened which customer's record, and when" had no answer. Amazon's Data
// Protection Policy asks for exactly that, and it is the control its developer
// review scores most directly.
//
// Two rules shape this module, and the first one is easy to get wrong:
//
//   THE LOG MUST NOT CONTAIN THE DATA IT IS LOGGING. An access record that
//   carries the buyer's name and address is a second copy of the problem, in a
//   collection that by design is never deleted. So an entry names the SUBJECT
//   (an order id, a customer id) and the CATEGORIES touched (name, email,
//   phone, address) and never a value.
//
//   AN ENTRY IS A FACT, NOT A DOCUMENT. Nothing edits or removes one. The
//   security rules deny every client write, and the only writer is the server.
//
// What it can and cannot see is stated honestly in CANNOT_OBSERVE at the
// bottom: NivaDesk's own clients read orders straight from Firestore, so those
// reads never reach a server that could record them.
//
// Pure: no Firestore, no clock, no network. Spec: Amazon DPP; the shape was set
// by the product decision of 4 September 2026.

/** The kinds of personal data an entry can say were touched. */
const PII_CATEGORIES = Object.freeze(["name", "email", "phone", "address", "financial", "note"]);

/**
 * What was done. Deliberately coarse — an audit trail that distinguishes forty
 * kinds of read is one nobody reads.
 */
const ACCESS_ACTIONS = Object.freeze([
  "view",       // one record opened through the server
  "list",       // a set returned through the server
  "export",     // taken out of NivaDesk entirely
  "assistant",  // answered by the AI assistant from workspace data
  "api",        // read through a connector or an external caller
  "support",    // read by NivaDesk staff across tenants
  // Amazon's restricted-data flow. An RDT is short-lived and is requested
  // before restricted fields can be read, so the request and the read are two
  // separate facts and both belong here.
  "rdt_requested",
  "restricted_resource_accessed",
  // The other end of the obligation. Deleting somebody's details on time is
  // only demonstrable if the deletion left a record, and that record is the one
  // thing a scrub cannot leave in the order itself.
  "erased"
]);

/** Where the request came from. */
const ACCESS_SOURCES = Object.freeze(["web", "ios", "android", "mcp", "portal", "server", "unknown"]);

const SUBJECT_KINDS = Object.freeze(["order", "customer", "estimate", "file", "bank_transaction", "amazon_order"]);

function pick(value, allowed, fallback) {
  const text = String(value == null ? "" : value).trim().toLowerCase();
  return allowed.includes(text) ? text : fallback;
}

function text(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

/**
 * Which categories of personal data a record would expose.
 *
 * Derived from the record rather than declared by the caller, so a new field
 * that carries a person cannot be read without the log noticing — a caller
 * that had to remember to declare "this one has a phone number" would forget.
 */
function categoriesOf(record = {}) {
  const found = new Set();
  const has = (...fields) => fields.some((f) => {
    const value = record[f];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
  if (has("customerName", "shippingName", "name")) found.add("name");
  if (has("emailAddress", "email")) found.add("email");
  if (has("shippingPhone", "phone", "whatsappNumber")) found.add("phone");
  if (has("shippingStreetAddress", "shippingCity", "shippingPostalCode", "address", "communicationAddress")) found.add("address");
  if (has("paidAmount", "remainingAmount", "orderValue", "watchPurchasePrice")) found.add("financial");
  if (has("notes", "buyerNote")) found.add("note");
  return [...found].sort();
}

/**
 * One entry, ready to be written.
 *
 * Every field is normalised here rather than at the call sites, so an entry
 * cannot be shaped differently by whichever function happened to write it —
 * an audit trail whose rows disagree about their own format cannot be queried,
 * and a query nobody can run is not a control.
 */
function accessEntry(input = {}) {
  const subject = input.subject || {};
  const categories = Array.isArray(input.categories)
    ? input.categories.filter((c) => PII_CATEGORIES.includes(String(c)))
    : categoriesOf(input.record || {});

  return {
    atMs: Number.isFinite(Number(input.atMs)) && Number(input.atMs) > 0 ? Number(input.atMs) : 0,
    companyId: text(input.companyId, 200),
    // Who. An unauthenticated visitor reading a portal link is a real actor
    // with no uid, and saying "" is more honest than attributing it to nobody.
    actorUid: text(input.actorUid, 200),
    actorEmail: text(input.actorEmail, 200).toLowerCase(),
    actorRole: text(input.actorRole, 60),
    action: pick(input.action, ACCESS_ACTIONS, "view"),
    source: pick(input.source, ACCESS_SOURCES, "unknown"),
    subject: {
      kind: pick(subject.kind, SUBJECT_KINDS, "order"),
      id: text(subject.id, 200),
      // Which marketplace the record came from, when it came from one. This is
      // what makes "show me every access to Amazon buyer data" answerable.
      provider: text(subject.provider, 40).toLowerCase(),
      externalId: text(subject.externalId, 200)
    },
    categories,
    // How many records, for a list or an export. One access to four hundred
    // customers and one access to a single customer are not the same event.
    recordCount: Math.max(1, Math.min(Number(input.recordCount) || 1, 1000000)),
    requestId: text(input.requestId, 120),
    note: text(input.note, 300)
  };
}

/**
 * Whether an entry is worth writing.
 *
 * An access that touched no personal data is not a privacy event, and logging
 * every read of an order with no buyer on it would bury the ones that matter.
 * The restricted-data actions are always kept, because Amazon asks for the RDT
 * request itself and not only what was done with it.
 */
function worthLogging(entry) {
  if (!entry || !entry.companyId || !entry.atMs) return false;
  if (entry.action === "rdt_requested" || entry.action === "restricted_resource_accessed") return true;
  // An erasure is worth recording even when the order had nothing left to
  // remove: "we looked and there was nothing" is a different fact from "we
  // never looked", and only one of them is defensible.
  if (entry.action === "erased") return true;
  return entry.categories.length > 0;
}

/**
 * What this log cannot see, said out loud.
 *
 * NivaDesk's own web and native clients read orders and customers straight from
 * Firestore under security rules, so those reads never reach a server that
 * could record them. Claiming the log is complete would be the kind of
 * overstatement that turns a control into a liability, and the honest sentence
 * is short: it covers every path where the SERVER hands out personal data.
 */
const CANNOT_OBSERVE = Object.freeze([
  "in-app reads by a workspace's own members, which go directly to Firestore under security rules"
]);

module.exports = {
  PII_CATEGORIES, ACCESS_ACTIONS, ACCESS_SOURCES, SUBJECT_KINDS, CANNOT_OBSERVE,
  categoriesOf, accessEntry, worthLogging
};

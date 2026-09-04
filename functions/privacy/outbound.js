"use strict";

// Where a marketplace's data is allowed to go, decided in one place.
//
// NivaDesk has several ways for an order to leave the server: the assistant
// answers questions from it, AI quick replies draft messages from it, SMS and
// email carry it to the customer, an export puts it in a file, and one day the
// accounting connectors will post it to a ledger. Every one of those was
// written before any marketplace imposed conditions on the data it lends us,
// and every one of them reads orders by workspace alone.
//
// That is the gap this file closes. An Amazon order will land in the same
// `siparisler` collection as everything else, and the assistant's own query
// filters on `companyId` and nothing more — so without this, connecting Amazon
// would silently make Amazon buyer data reachable by an OpenAI-hosted
// assistant, and no line of code would look wrong.
//
// Three rules, and the second one is the one that has to be right:
//
//   ONE TABLE. Every outbound path asks the same question of the same table.
//   A policy that lives in six places is six policies.
//
//   FAIL CLOSED ON A PROVIDER NOBODY HAS DESCRIBED. A marketplace that appears
//   in the data without an entry here is denied everywhere, because the safe
//   default for somebody else's data is not to move it. An order with NO
//   provider is a different thing entirely — it is the workshop's own customer,
//   the workshop owns that relationship, and it keeps working as it always has.
//
//   THE DECISION IS RECORDED. An allow and a block are both facts worth
//   keeping; a block nobody can see is indistinguishable from a feature that
//   quietly does not work.
//
// Pure: no Firestore, no clock, no network. Spec: Amazon Data Protection
// Policy; product decision of 4 September 2026.

/** Every way personal data can leave the server. */
const OUTBOUND_CHANNELS = Object.freeze([
  "assistant",   // ChatGPT / MCP tools, answered from workspace data
  "ai_reply",    // AI-drafted customer replies
  "messaging",   // SMS and email to the customer
  "analytics",   // any aggregate or product-analytics sink
  "accounting",  // QuickBooks, Xero, Pandle — not built yet, declared here first
  "export"       // CSV and anything else that leaves as a file
]);

const ALLOW = "allow";
const DENY = "deny";
/** Only what the channel cannot do its job without. */
const MINIMAL = "minimal";

/**
 * What each marketplace permits, per channel.
 *
 * `null` for a channel means "not stated", which is read as DENY — writing the
 * word out for every cell would hide the ones that were actually decided.
 */
const PROVIDER_PII_POLICY = Object.freeze({
  // Amazon: default-deny everywhere. Its Data Protection Policy restricts what
  // buyer information may be used for and where it may go, and NivaDesk has no
  // Amazon connector yet — so this layer exists before the data does, and the
  // connector arrives on top of it rather than beside it.
  amazon: {
    assistant: DENY,
    ai_reply: DENY,
    // Fulfilment is the one purpose the data was lent for. Even then, only what
    // is needed to tell a buyer their parcel has gone.
    messaging: MINIMAL,
    analytics: DENY,
    // Reopened deliberately when the accounting phase is built with the
    // controls that phase needs, and not before.
    accounting: DENY,
    export: DENY
  },
  // eBay is a marketplace too, and its user-data rules are their own. Denied
  // until somebody has actually read them and decided, rather than allowed
  // because nobody has objected yet.
  ebay: {
    assistant: DENY,
    ai_reply: DENY,
    messaging: MINIMAL,
    analytics: DENY,
    accounting: DENY,
    export: DENY
  },
  // The shops a workshop runs itself. The customer is the workshop's own, the
  // relationship is theirs, and nothing about connecting a till changes who the
  // data belongs to. These behave exactly as they did before this file existed.
  shopify: { assistant: ALLOW, ai_reply: ALLOW, messaging: ALLOW, analytics: DENY, accounting: ALLOW, export: ALLOW },
  woocommerce: { assistant: ALLOW, ai_reply: ALLOW, messaging: ALLOW, analytics: DENY, accounting: ALLOW, export: ALLOW },
  square: { assistant: ALLOW, ai_reply: ALLOW, messaging: ALLOW, analytics: DENY, accounting: ALLOW, export: ALLOW },
  inbound: { assistant: ALLOW, ai_reply: ALLOW, messaging: ALLOW, analytics: DENY, accounting: ALLOW, export: ALLOW },
  // Etsy sits in between: the seller owns the customer relationship, but Etsy's
  // API terms restrict onward use, and its buyer data reaches us through a
  // marketplace rather than from the buyer. Denied to the two channels that
  // hand data to a third party, allowed for the seller's own work.
  etsy: { assistant: ALLOW, ai_reply: ALLOW, messaging: ALLOW, analytics: DENY, accounting: ALLOW, export: ALLOW }
});

/** The fields a "minimal" release may carry: enough to tell somebody about their parcel. */
const MINIMAL_CATEGORIES = Object.freeze(["name"]);

function normalizeChannel(raw) {
  const text = String(raw == null ? "" : raw).trim().toLowerCase();
  return OUTBOUND_CHANNELS.includes(text) ? text : "";
}

/** The provider stamped on an order, or "" when the workshop typed it itself. */
function providerOf(order) {
  const stamped = order && order.commerce && order.commerce.provider;
  if (stamped) return String(stamped).trim().toLowerCase();
  const source = order && order.customFields && order.customFields.Source;
  return String(source || "").trim().toLowerCase();
}

/**
 * May this record's personal data go out through this channel?
 *
 * @returns {{allow: boolean, minimal: boolean, provider: string, channel: string, reason: string}}
 */
function mayReleasePii(order, channel) {
  const wanted = normalizeChannel(channel);
  if (!wanted) return { allow: false, minimal: false, provider: providerOf(order), channel: String(channel || ""), reason: "unknown_channel" };

  const provider = providerOf(order);
  // The workshop's own record. Not a marketplace's data, not this file's business.
  if (!provider) return { allow: true, minimal: false, provider: "", channel: wanted, reason: "workspace_own_record" };

  const policy = Object.prototype.hasOwnProperty.call(PROVIDER_PII_POLICY, provider)
    ? PROVIDER_PII_POLICY[provider]
    : null;
  // A marketplace nobody has described. Denied everywhere: the safe default for
  // somebody else's data is not to move it.
  if (!policy) return { allow: false, minimal: false, provider, channel: wanted, reason: "provider_policy_undefined" };

  const decision = policy[wanted];
  if (decision === ALLOW) return { allow: true, minimal: false, provider, channel: wanted, reason: "allowed_by_policy" };
  if (decision === MINIMAL) return { allow: true, minimal: true, provider, channel: wanted, reason: "minimal_by_policy" };
  // Includes a channel the provider's entry does not mention at all.
  return { allow: false, minimal: false, provider, channel: wanted, reason: decision === DENY ? "denied_by_policy" : "channel_not_stated" };
}

/** The personal fields on an order, and which category each belongs to. */
const PII_FIELD_CATEGORIES = Object.freeze({
  customerName: "name",
  shippingName: "name",
  emailAddress: "email",
  shippingPhone: "phone",
  whatsappNumber: "phone",
  instagramUsername: "name",
  shippingStreetAddress: "address",
  shippingCity: "address",
  shippingPostalCode: "address",
  communication: "address",
  communicationAddress: "address"
});

/**
 * The record as this channel is allowed to see it.
 *
 * A denied release returns the record with every personal field removed rather
 * than nothing at all: the assistant can still say a workshop has four orders
 * due on Friday, which is the workshop's own fact, without naming the buyers.
 * Refusing the whole record would break the feature; refusing the person is the
 * point.
 */
function redactForChannel(order = {}, channel = "") {
  const verdict = mayReleasePii(order, channel);
  if (verdict.allow && !verdict.minimal) return { record: order, verdict, removed: [] };

  const keep = verdict.minimal ? new Set(MINIMAL_CATEGORIES) : new Set();
  const record = { ...order };
  const removed = [];
  for (const [field, category] of Object.entries(PII_FIELD_CATEGORIES)) {
    if (keep.has(category)) continue;
    const value = record[field];
    if (value === undefined || value === null || value === "") continue;
    record[field] = "";
    removed.push(field);
  }
  return { record, verdict, removed };
}

module.exports = {
  OUTBOUND_CHANNELS, PROVIDER_PII_POLICY, MINIMAL_CATEGORIES, PII_FIELD_CATEGORIES,
  ALLOW, DENY, MINIMAL,
  providerOf, mayReleasePii, redactForChannel
};

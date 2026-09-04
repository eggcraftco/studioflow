// What ONE CONNECTION has proved it can do.
//
// Not the same question as commerce/capabilities.js, which declares what a
// PROVIDER can do at all — that is a fact about Amazon, this is a fact about
// this seller's Amazon account, and the two disagree constantly.
//
// A feature in public documentation is not a guarantee for one seller's
// account: Amazon gates buyer data behind PII approval and listing writes
// behind a role, and eBay gates listing creation behind business policies and
// a management mode the seller may not be in. A screen that offers a button
// the account cannot use is worse than one that says the account cannot use it.
//
// So a capability is one of three things, never just true or false:
//   true          proved available for this connection
//   false         proved unavailable
//   a string      not yet proved, naming what has to be checked before it is
//                 offered — the UI shows nothing rather than a button that 403s
//
// The values below are the DEFAULTS a connection starts with, before anything
// has been proved. Nothing here is a promise; §62 of the specification is
// explicit that the registry is recomputed at connect and whenever the answer
// could have changed.
//
// Pure: no network, no clock, no Firestore.

const AMAZON_DEFAULTS = Object.freeze({
  "orders.read": true,
  // Restricted data. Without PII approval the buyer's name and address are
  // absent or redacted, and the adapter says so rather than inventing them.
  "orders.pii": "role_dependent",
  "listings.read": true,
  "listings.write": "role_and_schema_dependent",
  // The studio's own shelf. Writing a quantity Amazon disagrees with oversells.
  "mfn_inventory.write": "validate",
  // FBA stock is Amazon's, and NivaDesk never reserves or writes it (§28).
  "fba_inventory.read": true,
  "fba_inventory.write": false,
  "shipment.write": "validate_current_contract",
  "finance.read": true,
  "notifications.orders": "validate_subscription"
});

const EBAY_DEFAULTS = Object.freeze({
  "orders.read": true,
  "inventory.read": true,
  "listing.create": "business_policy_and_management_mode",
  "listing.migrate": "eligible_only",
  // Only a listing NivaDesk manages may have its price or quantity written;
  // a listing the seller runs from eBay's own tools is theirs (§22, §30).
  "price.write": "managed_listing_only",
  "quantity.write": "managed_listing_only",
  "shipment.write": true,
  "refund.write": "permission_dependent",
  "dispute.read": "permission_dependent",
  "finance.read": true,
  notifications: "subscription_dependent"
});

const DEFAULTS_BY_PROVIDER = Object.freeze({ amazon: AMAZON_DEFAULTS, ebay: EBAY_DEFAULTS });

/** The starting registry for a new connection; an empty object for a provider we do not model. */
function defaultCapabilities(provider) {
  const key = String(provider || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DEFAULTS_BY_PROVIDER, key) ? { ...DEFAULTS_BY_PROVIDER[key] } : {};
}

/**
 * Whether a connection may be offered a capability RIGHT NOW.
 *
 * Only an explicit `true` counts. A capability that has never been proved
 * carries the reason it has not, and the answer is no — a string is a question,
 * not a yes, and treating a truthy string as permission is exactly the bug this
 * three-state design exists to prevent.
 */
function capabilityAllowed(capabilities, name) {
  const map = capabilities && typeof capabilities === "object" ? capabilities : {};
  return map[name] === true;
}

/** Why a capability is not on offer: "" when it IS, otherwise the check or "unsupported". */
function capabilityReason(capabilities, name) {
  const map = capabilities && typeof capabilities === "object" ? capabilities : {};
  const value = map[name];
  if (value === true) return "";
  if (value === false) return "unsupported";
  if (typeof value === "string" && value) return value;
  return "unsupported";
}

module.exports = { AMAZON_DEFAULTS, EBAY_DEFAULTS, defaultCapabilities, capabilityAllowed, capabilityReason };

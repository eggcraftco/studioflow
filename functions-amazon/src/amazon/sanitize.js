"use strict";

// What may leave Amazon's response and reach the rest of NivaDesk.
//
// Every other connector hands its provider payload straight to an adapter and
// the adapter hands an envelope to the shared engine. Amazon does not, and this
// file is why.
//
// The shared engine writes the envelope's customer block onto the order
// document — name, email, phone, both addresses (commerce/envelopeToOrder.js).
// That is correct for a shop the workshop runs itself and forbidden for a
// marketplace buyer, whose details must live only in the server-only
// `restrictedCustomer` collection (docs/security/access-control-policy.md §5).
// An Amazon path that copied the Square connector faithfully would break that on
// its very first order, and neither the adapter nor the engine would complain.
//
// So the raw response is split before anything else sees it: a SAFE half that
// carries the sale, and a RESTRICTED half that carries the person. Only the safe
// half is turned into an envelope.
//
// In phase A1 the restricted half must always be EMPTY. The application does not
// request the BUYER or RECIPIENT datasets, does not hold the roles that would
// return them, and has nowhere to put them — so anything personal arriving in a
// response is not data to file away, it is a signal that something is wrong. It
// is removed either way, and reported.
//
// Pure: no network, no clock, no Firestore.

/**
 * Order-level fields that carry, or can carry, a person.
 *
 * Listed by name rather than detected by shape. A heuristic that looks for
 * things resembling an email would keep whatever it failed to recognise, and
 * the cost of failing to recognise a field here is a buyer's address written
 * into a document eleven people can read.
 */
const ORDER_PII_FIELDS = Object.freeze([
  // The RECIPIENT dataset.
  "ShippingAddress",
  "DefaultShipFromLocationAddress",
  // The BUYER dataset.
  "BuyerInfo",
  "BuyerEmail",
  "BuyerName",
  "BuyerCounty",
  "BuyerTaxInfo",
  "BuyerTaxInformation",
  "BuyerInvoicePreference",
  // Gift messages are written by one person to another.
  "GiftMessageText",
  "GiftWrapLevel",
  // Delivery instructions are an address in prose.
  "ShipmentServiceLevelCategory_DeliveryInstructions",
  "DeliveryPreferences",
  "AutomatedShippingSettings"
]);

/** Item-level fields that carry a person. Gift messages ride on the item. */
const ITEM_PII_FIELDS = Object.freeze([
  "BuyerInfo",
  "BuyerRequestedCancel",
  "GiftMessageText",
  "GiftWrapLevel",
  "GiftWrapPrice",
  "GiftWrapTax",
  "BuyerCustomizedInfo",
  "DeliveryInfo",
  "ScheduledDeliveryStartDate",
  "ScheduledDeliveryEndDate"
]);

/**
 * The datasets phase A1 asks Amazon for.
 *
 * BUYER and RECIPIENT are absent because A1 does not need a person to do its
 * job: it reads orders so a workshop can see them, and a name it must not show
 * anybody is not worth the role that would fetch it.
 *
 * TAX is absent too, and that one is a judgement rather than an obvious
 * omission. The dataset is about the sale, but Amazon returns buyer tax
 * registration details inside it in some marketplaces, and "probably no
 * personal data" is not the standard this connector is held to. It is added
 * once somebody has read a real response from each marketplace we support and
 * confirmed what is in it. Until then the envelope says the tax is unknown
 * rather than saying it is zero — see taxIsKnown below.
 */
const INCLUDED_DATA_A1 = Object.freeze([
  "FULFILLMENT",
  "PROCEEDS",
  "EXPENSE",
  "PROMOTION",
  "CANCELLATION",
  "PACKAGES",
  "PAYMENT"
]);

/** Datasets that are deliberately not requested yet, and why. */
const WITHHELD_DATA = Object.freeze({
  BUYER: "a1_no_pii_role",
  RECIPIENT: "a1_no_pii_role",
  TAX: "pending_buyer_tax_pii_review"
});

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Remove the named keys from a shallow copy, recording which were present. */
function stripFields(source, fields, prefix, removed) {
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (fields.includes(key)) {
      // Only count it as removed if it actually held something. An empty
      // BuyerInfo is Amazon saying "you are not authorised", not a leak.
      if (value !== null && value !== undefined && !(isObject(value) && Object.keys(value).length === 0)) {
        removed.push(`${prefix}${key}`);
      }
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Splits one SP-API order into the half that may travel and the half that may
 * not.
 *
 * Returns:
 *   safe       — the order and its items with every personal field gone.
 *                This is what the adapter is given.
 *   restricted — the personal fields, keyed by path. In A1 this is always
 *                empty, and a non-empty one is a fault, not a feature.
 *   removed    — the paths that were stripped. Paths only: a list of what was
 *                removed must never contain what was removed.
 */
function splitAmazonOrder(rawOrder = {}, rawItems = []) {
  const removed = [];
  const restricted = {};

  const order = isObject(rawOrder) ? rawOrder : {};
  const items = Array.isArray(rawItems) ? rawItems : [];

  for (const field of ORDER_PII_FIELDS) {
    const value = order[field];
    if (value === undefined || value === null) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;
    restricted[`order.${field}`] = value;
  }
  const safeOrder = stripFields(order, ORDER_PII_FIELDS, "order.", removed);

  const safeItems = items.map((item, index) => {
    if (!isObject(item)) return item;
    for (const field of ITEM_PII_FIELDS) {
      const value = item[field];
      if (value === undefined || value === null) continue;
      if (isObject(value) && Object.keys(value).length === 0) continue;
      restricted[`items[${index}].${field}`] = value;
    }
    return stripFields(item, ITEM_PII_FIELDS, `items[${index}].`, removed);
  });

  return { safe: { order: safeOrder, items: safeItems }, restricted, removed };
}

/**
 * Whether anything personal survived the split.
 *
 * The split works by name, so this is the check that the list of names is still
 * complete: it looks at what is actually in the payload rather than at what we
 * remembered to list. A new SP-API field carrying a buyer's name fails here
 * before it reaches a document.
 */
function scanForPii(value, path = "") {
  const found = [];
  const walk = (node, at) => {
    if (Array.isArray(node)) {
      node.forEach((entry, i) => walk(entry, `${at}[${i}]`));
      return;
    }
    if (!isObject(node)) {
      if (typeof node === "string" && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(node)) found.push(`${at} (looks like an email address)`);
      return;
    }
    for (const [key, entry] of Object.entries(node)) {
      const here = at ? `${at}.${key}` : key;
      if (ORDER_PII_FIELDS.includes(key) || ITEM_PII_FIELDS.includes(key)) {
        if (entry !== null && entry !== undefined && !(isObject(entry) && Object.keys(entry).length === 0)) {
          found.push(here);
          continue;
        }
      }
      // Named on sight wherever they appear, however deeply.
      if (/^(Name|AddressLine[123]|Email|Phone|PostalCode|County|BuyerEmail|BuyerName)$/.test(key)
        && typeof entry === "string" && entry.trim()) {
        found.push(here);
        continue;
      }
      walk(entry, here);
    }
  };
  walk(value, path);
  return found;
}

/**
 * Whether the tax figure in this payload is a fact or an absence.
 *
 * With the TAX dataset withheld there is no tax in the response at all, and an
 * order that reports zero tax as if it were known is a lie the Finance Engine
 * believes: it would file a VAT return with the marketplace's tax missing
 * rather than flagged. Better to say we do not know.
 */
function taxIsKnown(includedData = INCLUDED_DATA_A1) {
  return (Array.isArray(includedData) ? includedData : []).includes("TAX");
}

module.exports = {
  ORDER_PII_FIELDS, ITEM_PII_FIELDS, INCLUDED_DATA_A1, WITHHELD_DATA,
  splitAmazonOrder, scanForPii, taxIsKnown
};

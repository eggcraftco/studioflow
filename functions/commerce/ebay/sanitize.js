"use strict";

// What may leave an eBay order and reach the rest of NivaDesk (design §8.1).
//
// The shared engine writes the envelope's customer block onto the order
// document — name, email, phone, both addresses. That is right for a shop the
// workshop runs and wrong for a marketplace buyer, whose details live only in
// the server-only `restrictedCustomer` collection (access-control policy §5).
// So the raw order is split BEFORE the adapter sees it: a SAFE half that
// carries the sale, and a RESTRICTED half that carries the person.
//
// This is NOT the Amazon sanitizer: that one recognises SP-API's PascalCase
// names (Name, AddressLine1, BuyerEmail) and would let every camelCase eBay
// field through untouched. eBay has its own list, its own scanner, and its own
// captured fixture.
//
// Removal is by PATH first (structured, exact: the places eBay documents a
// person), and by KEY NAME second (defence for fields the list does not know).
// The one deliberate exception is the delivery country: a country is not a
// person, and VAT and delivery logic need it. `scanForPii` is the trip-wire
// that runs on the safe half afterwards — anything personal still there turns
// the order into a loud `pii_in_safe_half` instead of a document eleven people
// can read. Pure: no network, no clock, no Firestore.

const PII_KEY_NAMES = /^(fullName|firstName|lastName|companyName|email|recipientEmail|phoneNumber|primaryPhone|secondaryPhone|addressLine1|addressLine2|city|stateOrProvince|county|postalCode|contactAddress|shipTo|buyerRegistrationAddress|taxAddress|taxIdentifier|taxpayerId|finalDestinationAddress|buyerCheckoutNotes|giftDetails|senderName|recipientName|message)$/;

const ORDER_PII_PATHS = Object.freeze([
  "buyer.buyerRegistrationAddress",
  "buyer.taxAddress",
  "buyer.taxIdentifier",
  "buyerCheckoutNotes",
  "fulfillmentStartInstructions[].shippingStep.shipTo",
  "fulfillmentStartInstructions[].pickupStep",
  "fulfillmentStartInstructions[].finalDestinationAddress"
]);
const LINE_ITEM_PII_PATHS = Object.freeze(["lineItems[].giftDetails", "lineItems[].title (when personalised)", "lineItems[].variationAspects[].value (when personalised)"]);
const FULFILLMENT_PII_PATHS = Object.freeze(["fulfillments[].shipTo", "fulfillments[].contact*"]);

const PERSONALISED_TITLE = "[personalised item]";
const PERSONALISED_VALUE = "[personalised]";

// Keys whose string values are identifiers, money or dates — never scanned for
// a phone or a postcode, because "170009134375-2314958900123" and "12345.00"
// and "2026-09-02" all look like one. Keys on the PII list are checked BEFORE
// this exclusion, so `taxpayerId` still trips.
const ID_KEY = /(id|number|reference|code|sku|token|date|time|value|amount|quantity|version|currency|status|type|format)$/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /(?:\+|00)?\d[\d\s().-]{7,}\d/;
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/;
// A US ZIP is only a postcode when its state stands beside it. Five digits on
// their own are not: eBay titles carry manufacturer part numbers ("Bosch 12345
// Brake Pad Set") and variation aspects carry numeric size and part codes
// ("55010"), and a bare \d{5} rule read those as the buyer's personalisation —
// it redacted the product title into "[personalised item]", filed the real
// title as buyer PII (deleted by the 90-day sweep), and, in a field the split
// does not rewrite, made the whole order `pii_in_safe_half` and unimportable.
// A US address is written "City, ST 90210", so the state token is the context
// that separates an address from a part number.
const US_STATE = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC|AS|GU|MP|PR|VI";
const US_ZIP = new RegExp(`\\b(?:${US_STATE})\\b[.,]?\\s{0,3}\\d{5}(?:-\\d{4})?\\b`);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T|$)/;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const hasContent = (v) => !(v === null || v === undefined || v === "" || (isObject(v) && Object.keys(v).length === 0) || (Array.isArray(v) && v.length === 0));

/** True for `{ countryCode: "GB" }` and `{ contactAddress: { countryCode: "GB" } }` — the kept exception. */
function onlyCountryCode(value) {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  if (!keys.length) return false;
  return keys.every((key) => (key === "countryCode" && typeof value[key] === "string") || (key === "contactAddress" && onlyCountryCode(value[key])));
}

function looksPersonal(str) {
  const text = String(str);
  if (EMAIL.test(text)) return "email";
  if (!ISO_DATE.test(text)) {
    const phone = PHONE.exec(text);
    if (phone && (phone[0].match(/\d/g) || []).length >= 8) return "phone";
    if (UK_POSTCODE.test(text) || US_ZIP.test(text)) return "postcode";
  }
  return "";
}

/** The person inside a shipTo / registration block, in the shape the reveal returns. */
function personOf(block) {
  const b = isObject(block) ? block : {};
  const a = isObject(b.contactAddress) ? b.contactAddress : {};
  const text = (v, max = 200) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));
  const person = {
    fullName: text(b.fullName), companyName: text(b.companyName), email: text(b.email).toLowerCase(),
    phone: text(b.primaryPhone && b.primaryPhone.phoneNumber, 60) || text(b.secondaryPhone && b.secondaryPhone.phoneNumber, 60),
    address: {
      line1: text(a.addressLine1), line2: text(a.addressLine2), city: text(a.city, 120), stateOrProvince: text(a.stateOrProvince, 120),
      county: text(a.county, 120), postalCode: text(a.postalCode, 40), countryCode: text(a.countryCode, 8)
    }
  };
  return person;
}

/** Whether a person block carries anything beyond the country. */
function personHasContent(person) {
  const p = person || {};
  const a = p.address || {};
  return Boolean(p.fullName || p.companyName || p.email || p.phone || a.line1 || a.line2 || a.city || a.stateOrProvince || a.county || a.postalCode);
}

/** Remove every key matching PII_KEY_NAMES anywhere under `node`, recording paths and values. */
function stripByKeyName(node, at, removed, diverted) {
  if (Array.isArray(node)) return node.map((entry, i) => stripByKeyName(entry, `${at}[${i}]`, removed, diverted));
  if (!isObject(node)) return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    const here = at ? `${at}.${key}` : key;
    if (PII_KEY_NAMES.test(key) && !onlyCountryCode(value)) {
      if (hasContent(value)) {
        removed.push(here);
        diverted[here] = clone(value);
        // A contact block loses everything but the country it is in.
        if (key === "contactAddress" && isObject(value) && typeof value.countryCode === "string" && value.countryCode) out[key] = { countryCode: value.countryCode };
      }
      continue;
    }
    out[key] = stripByKeyName(value, here, removed, diverted);
  }
  return out;
}

/**
 * @param order         one Sell Fulfillment API order (raw)
 * @param fulfillments  the order's shipping fulfilments (raw), fetched separately
 * @returns {{ safe: object, restricted: object, removed: string[] }}
 *   safe        the order with every personal field gone, plus `fulfillments` (safe half) for the adapter
 *   restricted  what `restrictedCustomer.fields` holds; `{}` when the order carried nobody
 *   removed     the paths that were stripped — paths only, never values
 */
function splitEbayOrder(rawOrder, rawFulfillments = []) {
  const removed = [];
  const restricted = {};
  const order = isObject(rawOrder) ? clone(rawOrder) : {};
  const fulfillments = Array.isArray(rawFulfillments) ? clone(rawFulfillments) : [];
  const take = (path, value) => { if (hasContent(value)) removed.push(path); return hasContent(value) ? clone(value) : undefined; };

  // ---- the buyer block: the handle stays, the registration identity goes
  if (isObject(order.buyer)) {
    const reg = take("buyer.buyerRegistrationAddress", order.buyer.buyerRegistrationAddress);
    if (reg) restricted.registration = personOf(reg);
    const taxAddress = take("buyer.taxAddress", order.buyer.taxAddress);
    if (taxAddress) restricted.taxAddress = taxAddress;
    const taxIdentifier = take("buyer.taxIdentifier", order.buyer.taxIdentifier);
    if (taxIdentifier) restricted.taxIdentifier = taxIdentifier;
    delete order.buyer.buyerRegistrationAddress; delete order.buyer.taxAddress; delete order.buyer.taxIdentifier;
  }
  const notes = take("buyerCheckoutNotes", order.buyerCheckoutNotes);
  if (notes !== undefined) restricted.buyerCheckoutNotes = String(notes).slice(0, 4000);
  delete order.buyerCheckoutNotes;

  // ---- where to ship: the person goes, the country stays
  if (Array.isArray(order.fulfillmentStartInstructions)) {
    order.fulfillmentStartInstructions = order.fulfillmentStartInstructions.map((instruction, i) => {
      if (!isObject(instruction)) return instruction;
      const out = { ...instruction };
      const step = isObject(out.shippingStep) ? { ...out.shippingStep } : null;
      if (step) {
        if (isObject(step.shipTo) && !onlyCountryCode(step.shipTo)) {
          const shipTo = step.shipTo;
          const person = personOf(shipTo);
          if (personHasContent(person)) {
            removed.push(`fulfillmentStartInstructions[${i}].shippingStep.shipTo`);
            if (i === 0 || !restricted.fullName) Object.assign(restricted, person);
            else { restricted.shipTo = restricted.shipTo || {}; restricted.shipTo[String(i)] = person; }
          }
          const countryCode = String((shipTo.contactAddress || {}).countryCode || "").trim();
          step.shipTo = countryCode ? { contactAddress: { countryCode } } : {};
        }
        out.shippingStep = step;
      }
      const pickup = take(`fulfillmentStartInstructions[${i}].pickupStep`, out.pickupStep);
      if (pickup) { restricted.pickup = restricted.pickup || {}; restricted.pickup[String(i)] = pickup; }
      delete out.pickupStep;
      const finalDestination = take(`fulfillmentStartInstructions[${i}].finalDestinationAddress`, out.finalDestinationAddress);
      if (finalDestination) restricted.finalDestinationAddress = finalDestination;
      delete out.finalDestinationAddress;
      return out;
    });
  }

  // ---- line items: gift messages and personalisation typed by the buyer
  if (Array.isArray(order.lineItems)) {
    order.lineItems = order.lineItems.map((item, i) => {
      if (!isObject(item)) return item;
      const out = { ...item };
      const gift = take(`lineItems[${i}].giftDetails`, out.giftDetails);
      if (gift) { restricted.giftDetails = restricted.giftDetails || []; restricted.giftDetails.push({ lineItemId: String(out.lineItemId || ""), ...gift }); }
      delete out.giftDetails;
      let personalised = false;
      const kept = {};
      if (Array.isArray(out.variationAspects)) {
        out.variationAspects = out.variationAspects.map((aspect, j) => {
          if (!isObject(aspect)) return aspect;
          const flagged = PII_KEY_NAMES.test(String(aspect.name || "")) || looksPersonal(String(aspect.value || ""));
          if (!flagged) return aspect;
          personalised = true;
          removed.push(`lineItems[${i}].variationAspects[${j}].value`);
          kept.variationAspects = kept.variationAspects || [];
          kept.variationAspects.push({ index: j, name: String(aspect.name || ""), value: String(aspect.value || "") });
          return { ...aspect, value: PERSONALISED_VALUE };
        });
      }
      if (personalised || looksPersonal(String(out.title || ""))) {
        if (hasContent(out.title)) { removed.push(`lineItems[${i}].title`); kept.title = String(out.title); }
        out.title = PERSONALISED_TITLE;
      }
      if (Object.keys(kept).length) { restricted.lineItems = restricted.lineItems || {}; restricted.lineItems[String(i)] = kept; }
      return out;
    });
  }

  // ---- fulfilments: tracking stays, the contact goes
  const safeFulfillments = fulfillments.map((fulfillment, i) => {
    if (!isObject(fulfillment)) return fulfillment;
    const out = { ...fulfillment };
    if (isObject(out.shipTo) && !onlyCountryCode(out.shipTo)) {
      const person = personOf(out.shipTo);
      if (personHasContent(person)) { removed.push(`fulfillments[${i}].shipTo`); restricted.fulfillments = restricted.fulfillments || {}; restricted.fulfillments[String(i)] = { ...(restricted.fulfillments[String(i)] || {}), shipTo: person }; }
    }
    delete out.shipTo;
    for (const key of Object.keys(out)) {
      if (!/^contact/i.test(key)) continue;
      const value = take(`fulfillments[${i}].${key}`, out[key]);
      if (value !== undefined) { restricted.fulfillments = restricted.fulfillments || {}; restricted.fulfillments[String(i)] = { ...(restricted.fulfillments[String(i)] || {}), [key]: value }; }
      delete out[key];
    }
    return out;
  });

  // ---- defence: any key on the list, anywhere, that the paths above did not name
  const diverted = {};
  const safeOrder = stripByKeyName(order, "", removed, diverted);
  const safeFulfillmentsChecked = stripByKeyName(safeFulfillments, "fulfillments", removed, diverted);
  if (Object.keys(diverted).length) restricted.other = diverted;

  return { safe: { ...safeOrder, fulfillments: safeFulfillmentsChecked }, restricted, removed };
}

/**
 * Anything personal still in `value`, as paths. Empty means the split held.
 * A `countryCode` with a two-letter value is never found (the exception).
 */
function scanForPii(value, path = "") {
  const found = [];
  const walk = (node, at, key) => {
    if (Array.isArray(node)) { node.forEach((entry, i) => walk(entry, `${at}[${i}]`, key)); return; }
    if (isObject(node)) {
      for (const [k, entry] of Object.entries(node)) {
        const here = at ? `${at}.${k}` : k;
        if (PII_KEY_NAMES.test(k) && hasContent(entry) && !onlyCountryCode(entry)) { found.push(here); continue; }
        walk(entry, here, k);
      }
      return;
    }
    if (typeof node !== "string" || !node.trim()) return;
    if (key === "countryCode" && /^[A-Za-z]{2}$/.test(node.trim())) return;
    if (node === PERSONALISED_TITLE || node === PERSONALISED_VALUE) return;
    if (EMAIL.test(node)) { found.push(`${at} (looks like an email address)`); return; }
    if (ID_KEY.test(String(key || ""))) return;
    const kind = looksPersonal(node);
    if (kind === "phone") found.push(`${at} (looks like a phone number)`);
    else if (kind === "postcode") found.push(`${at} (looks like a postcode)`);
  };
  walk(value, path, "");
  return found;
}

module.exports = {
  PII_KEY_NAMES, ORDER_PII_PATHS, LINE_ITEM_PII_PATHS, FULFILLMENT_PII_PATHS, PERSONALISED_TITLE, PERSONALISED_VALUE,
  splitEbayOrder, scanForPii, personOf, personHasContent, onlyCountryCode, looksPersonal
};

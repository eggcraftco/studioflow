"use strict";

// The contract at the boundary: what an Amazon order may look like when it
// leaves the Amazon project for the main one.
//
// This file exists in two places — functions-amazon/src/envelope.js and
// functions/commerce/amazon/envelope.js — and a test in each codebase fails if
// the two copies differ by a byte. The Amazon side validates before sending;
// the main side validates before believing. Neither trusts the other.
//
// It is an ALLOWLIST, by field name, at every level. The sanitizer
// (sanitize.js) is a denylist of the fields known to carry a person; this is
// the other half of that argument. A denylist protects against the fields we
// have thought of; an allowlist protects against the ones we have not — a new
// SP-API field carrying a buyer's name is refused here without anyone having
// heard of it. Money is a two-key object and nothing else. Free text is capped.
// Anything shaped like an email address, anywhere, is a violation.
//
// Pure. No network, no clock, no I/O.

const ENVELOPE_VERSION = 1;

/** Top-level keys of a safe envelope. */
const ENVELOPE_KEYS = Object.freeze([
  "version", "connectionId", "companyId", "marketplaceId", "syncedAtMs",
  "order", "items", "removedPaths", "taxKnown"
]);

/** A Money object: exactly these two keys. */
const MONEY_KEYS = Object.freeze(["CurrencyCode", "Amount"]);

/** TaxCollection: who collected, under which model. No amounts, no ids. */
const TAX_COLLECTION_KEYS = Object.freeze(["Model", "ResponsibleParty"]);

/**
 * Order-level fields that may travel. Everything the adapter reads, plus
 * flags and dates that describe the sale rather than the buyer. Not here, and
 * therefore refused: anything under BUYER, RECIPIENT or TAX, the seller's own
 * display name and tax registration, delivery preferences, and every field
 * this list has never heard of.
 */
const ORDER_KEYS = Object.freeze([
  "AmazonOrderId", "SellerOrderId", "PurchaseDate", "LastUpdateDate", "OrderStatus",
  "FulfillmentChannel", "SalesChannel", "OrderChannel", "ShipServiceLevel",
  "OrderTotal", "NumberOfItemsShipped", "NumberOfItemsUnshipped",
  "PaymentMethod", "PaymentMethodDetails", "MarketplaceId",
  "ShipmentServiceLevelCategory", "OrderType",
  "EarliestShipDate", "LatestShipDate", "EarliestDeliveryDate", "LatestDeliveryDate",
  "IsBusinessOrder", "IsPrime", "IsPremiumOrder", "IsGlobalExpressEnabled",
  "IsReplacementOrder", "ReplacedOrderId", "IsSoldByAB", "IsIBA", "IsISPU",
  "IsAccessPointOrder", "HasRegulatedItems", "EasyShipShipmentStatus",
  "ElectronicInvoiceStatus", "TaxCollection"
]);

/** Item-level fields that may travel. */
const ITEM_KEYS = Object.freeze([
  "OrderItemId", "ASIN", "SellerSKU", "Title", "QuantityOrdered", "QuantityShipped",
  "ProductInfo", "ItemPrice", "ShippingPrice", "ItemTax", "ShippingTax",
  "ShippingDiscount", "ShippingDiscountTax", "PromotionDiscount", "PromotionDiscountTax",
  "PromotionIds", "CODFee", "CODFeeDiscount", "ConditionId", "ConditionSubtypeId",
  "ConditionNote", "IsGift", "SerialNumberRequired", "IsTransparency", "IossNumber",
  "StoreChainStoreId", "DeemedResellerCategory", "TaxCollection"
]);

/** Fields whose value is a Money object. */
const MONEY_FIELDS = Object.freeze([
  "OrderTotal", "ItemPrice", "ShippingPrice", "ItemTax", "ShippingTax",
  "ShippingDiscount", "ShippingDiscountTax", "PromotionDiscount", "PromotionDiscountTax",
  "CODFee", "CODFeeDiscount"
]);

const PRODUCT_INFO_KEYS = Object.freeze(["NumberOfItems"]);

const MAX_TEXT = 500;
const MAX_ITEMS = 500;
const MAX_REMOVED_PATHS = 200;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function checkScalar(value, at, violations) {
  if (value === null || value === undefined) return;
  const type = typeof value;
  if (type === "string") {
    if (value.length > MAX_TEXT) violations.push(`${at}: text longer than ${MAX_TEXT}`);
    if (EMAIL_LIKE.test(value)) violations.push(`${at}: looks like an email address`);
    return;
  }
  if (type === "number" || type === "boolean") return;
  violations.push(`${at}: unsupported type ${type}`);
}

function checkMoney(value, at, violations) {
  if (!isObject(value)) { violations.push(`${at}: money is not an object`); return; }
  for (const key of Object.keys(value)) {
    if (!MONEY_KEYS.includes(key)) violations.push(`${at}.${key}: not allowed in a money value`);
  }
  checkScalar(value.CurrencyCode, `${at}.CurrencyCode`, violations);
  checkScalar(value.Amount, `${at}.Amount`, violations);
}

function checkTaxCollection(value, at, violations) {
  if (!isObject(value)) { violations.push(`${at}: not an object`); return; }
  for (const key of Object.keys(value)) {
    if (!TAX_COLLECTION_KEYS.includes(key)) violations.push(`${at}.${key}: not allowed`);
    else checkScalar(value[key], `${at}.${key}`, violations);
  }
}

function checkStringArray(value, at, violations) {
  if (!Array.isArray(value)) { violations.push(`${at}: not an array`); return; }
  value.forEach((entry, i) => {
    if (typeof entry !== "string") violations.push(`${at}[${i}]: not a string`);
    else checkScalar(entry, `${at}[${i}]`, violations);
  });
}

function checkRecord(record, allowed, at, violations) {
  if (!isObject(record)) { violations.push(`${at}: not an object`); return; }
  for (const [key, value] of Object.entries(record)) {
    const here = `${at}.${key}`;
    if (!allowed.includes(key)) { violations.push(`${here}: not in the allowlist`); continue; }
    if (MONEY_FIELDS.includes(key)) { checkMoney(value, here, violations); continue; }
    if (key === "TaxCollection") { checkTaxCollection(value, here, violations); continue; }
    if (key === "PaymentMethodDetails" || key === "PromotionIds") { checkStringArray(value, here, violations); continue; }
    if (key === "ProductInfo") {
      if (!isObject(value)) { violations.push(`${here}: not an object`); continue; }
      for (const k of Object.keys(value)) {
        if (!PRODUCT_INFO_KEYS.includes(k)) violations.push(`${here}.${k}: not allowed`);
        else checkScalar(value[k], `${here}.${k}`, violations);
      }
      continue;
    }
    checkScalar(value, here, violations);
  }
}

/**
 * Validates a safe envelope. Returns { ok, violations }.
 *
 * Used on both sides of the boundary. A single violation is a refusal — the
 * envelope is not "mostly fine", it is evidence that something upstream is
 * sending what it should not, and the right response is to stop and say so.
 */
function validateSafeEnvelope(envelope) {
  const violations = [];
  if (!isObject(envelope)) return { ok: false, violations: ["envelope: not an object"] };

  for (const key of Object.keys(envelope)) {
    if (!ENVELOPE_KEYS.includes(key)) violations.push(`${key}: not in the allowlist`);
  }
  if (envelope.version !== ENVELOPE_VERSION) violations.push(`version: expected ${ENVELOPE_VERSION}`);
  for (const key of ["connectionId", "companyId", "marketplaceId"]) {
    if (typeof envelope[key] !== "string" || !envelope[key].trim()) violations.push(`${key}: required string`);
    else checkScalar(envelope[key], key, violations);
  }
  if (!Number.isFinite(envelope.syncedAtMs) || envelope.syncedAtMs <= 0) violations.push("syncedAtMs: required positive number");
  if (typeof envelope.taxKnown !== "boolean") violations.push("taxKnown: required boolean");

  checkRecord(envelope.order, ORDER_KEYS, "order", violations);
  if (isObject(envelope.order) && typeof envelope.order.AmazonOrderId !== "string") violations.push("order.AmazonOrderId: required string");

  if (!Array.isArray(envelope.items)) violations.push("items: not an array");
  else {
    if (envelope.items.length > MAX_ITEMS) violations.push(`items: more than ${MAX_ITEMS}`);
    envelope.items.forEach((item, i) => checkRecord(item, ITEM_KEYS, `items[${i}]`, violations));
  }

  if (!Array.isArray(envelope.removedPaths)) violations.push("removedPaths: not an array");
  else {
    if (envelope.removedPaths.length > MAX_REMOVED_PATHS) violations.push(`removedPaths: more than ${MAX_REMOVED_PATHS}`);
    envelope.removedPaths.forEach((p, i) => {
      // Paths only — a list of what was removed must never contain what was removed.
      if (typeof p !== "string" || p.length > 200 || /[\s@]/.test(p)) violations.push(`removedPaths[${i}]: not a path`);
    });
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Builds a safe envelope from the sanitizer's output. Validates before
 * returning; throws on a violation, because the Amazon side must never emit
 * something the main side would refuse.
 */
function buildSafeEnvelope({ connectionId, companyId, marketplaceId, syncedAtMs, safe, removed = [], taxKnown = false }) {
  const envelope = {
    version: ENVELOPE_VERSION,
    connectionId: String(connectionId || ""),
    companyId: String(companyId || ""),
    marketplaceId: String(marketplaceId || (safe && safe.order && safe.order.MarketplaceId) || ""),
    syncedAtMs: Number(syncedAtMs) || 0,
    order: pick(safe && safe.order, ORDER_KEYS),
    items: (Array.isArray(safe && safe.items) ? safe.items : []).map((item) => pick(item, ITEM_KEYS)),
    removedPaths: Array.isArray(removed) ? removed.slice(0, MAX_REMOVED_PATHS) : [],
    taxKnown: Boolean(taxKnown)
  };
  const { ok, violations } = validateSafeEnvelope(envelope);
  if (!ok) {
    const error = new Error(`unsafe_envelope: ${violations.slice(0, 5).join("; ")}`);
    error.violations = violations;
    throw error;
  }
  return envelope;
}

/** A copy of `source` holding only the allowed keys. Values are copied as-is. */
function pick(source, allowed) {
  const out = {};
  if (!isObject(source)) return out;
  for (const key of allowed) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

module.exports = {
  ENVELOPE_VERSION, ENVELOPE_KEYS, ORDER_KEYS, ITEM_KEYS, MONEY_KEYS, MONEY_FIELDS, TAX_COLLECTION_KEYS,
  validateSafeEnvelope, buildSafeEnvelope, pick
};

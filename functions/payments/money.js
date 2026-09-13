// PR-P0 — money for the Stripe rail, in minor units, as integers.
//
// Why this is NOT commerce/money.js.
//
// commerce/money.js fixes SCALE = 2 on purpose: the commerce envelope has to
// hash byte-identically across Shopify, Etsy and Woo, so every amount in it is
// a two-decimal string regardless of currency. That is correct for a hash and
// wrong for a charge. Stripe's `amount` is the currency's OWN minor unit, so
// putting a JPY amount through commerce's toMinorUnits() multiplies it by 100
// and charges the customer a hundred times the price. The two modules answer
// different questions and must not be shared.
//
// Why the currency table is a closed allowlist.
//
// Stripe's own currency documentation carries cases that contradict the folk
// rule "zero-decimal means exponent 0": ISK and UGX transitioned to zero-decimal
// but the API still requires a two-decimal representation whose decimals are
// always 00; HUF and TWD are two-decimal to charge and zero-decimal to pay out.
// A table written from memory gets those wrong in the direction that costs
// money. So this module ships only the currencies NivaDesk actually offers, and
// refuses everything else until someone reads the current Stripe page for it.
//
// Why a symbol is not a currency.
//
// A NivaDesk workspace stores its currency as a SYMBOL in
// companySettings.seciliParaBirimi — the nine in FINANCIAL_CURRENCY_SYMBOLS
// (functions/index.js). Stripe needs an ISO-4217 code. Two of the nine do not
// determine one: "$" is USD or any other dollar, and "¥" is JPY (zero-decimal)
// or CNY (two-decimal) — the exact pair where guessing wrong is the 100x error.
// So symbolToCurrency() returns an ambiguity instead of a guess, and the caller
// has to make the workspace state a code. This is a fail-closed answer, not a
// missing feature.

/**
 * The only currencies this rail will price in.
 *
 * `exponent` is what Stripe's `amount` is expressed in, NOT what the currency
 * has in ISO-4217 — for ISK and UGX those differ and Stripe's number wins.
 * `multipleOf` is the extra constraint Stripe imposes on top of the exponent
 * (1 = none). Both are properties of the Stripe API, so both belong here rather
 * than in a general-purpose currency helper.
 */
const CURRENCIES = Object.freeze({
  GBP: { exponent: 2, multipleOf: 1 },
  USD: { exponent: 2, multipleOf: 1 },
  EUR: { exponent: 2, multipleOf: 1 },
  TRY: { exponent: 2, multipleOf: 1 },
  AUD: { exponent: 2, multipleOf: 1 },
  CAD: { exponent: 2, multipleOf: 1 },
  CHF: { exponent: 2, multipleOf: 1 },
  AED: { exponent: 2, multipleOf: 1 },
  JPY: { exponent: 0, multipleOf: 1 }
});

/**
 * Workspace currency symbol -> ISO code.
 *
 * A symbol mapping to more than one code is listed with all of them and is
 * never resolved silently. The keys are exactly FINANCIAL_CURRENCY_SYMBOLS.
 */
const SYMBOL_TO_CURRENCIES = Object.freeze({
  "£": ["GBP"],
  "€": ["EUR"],
  "₺": ["TRY"],
  "A$": ["AUD"],
  "C$": ["CAD"],
  "CHF": ["CHF"],
  "د.إ": ["AED"],
  // Ambiguous on purpose. See the header.
  "$": ["USD", "AUD", "CAD"],
  "¥": ["JPY", "CNY"]
});

function normalizeCurrency(value) {
  const code = String(value == null ? "" : value).trim().toUpperCase().replace(/[^A-Z]/g, "");
  return code.length === 3 ? code : "";
}

/** True only for a currency this rail is allowed to charge in. */
function isSupportedCurrency(value) {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, normalizeCurrency(value));
}

/**
 * Resolve a workspace currency symbol.
 *
 * Returns { ok, currency, candidates, reason }. `ok` is false when the symbol
 * is unknown OR when it maps to more than one code — the caller must then ask
 * for an explicit ISO code rather than pick one.
 */
function symbolToCurrency(symbol) {
  const key = String(symbol == null ? "" : symbol).trim();
  const candidates = SYMBOL_TO_CURRENCIES[key];
  if (!candidates) return { ok: false, currency: "", candidates: [], reason: "unknown_symbol" };
  if (candidates.length !== 1) return { ok: false, currency: "", candidates: candidates.slice(), reason: "ambiguous_symbol" };
  const currency = candidates[0];
  if (!isSupportedCurrency(currency)) return { ok: false, currency: "", candidates: [currency], reason: "unsupported_currency" };
  return { ok: true, currency, candidates: [currency], reason: "" };
}

/**
 * A decimal amount ("10.50", 10.5, " 1,099.00 ") -> Stripe minor units.
 *
 * Returns { ok, amountMinor, reason }. The parse is done on the TEXT, digit by
 * digit, and never by multiplying a JavaScript number by 100: 19.99 * 100 is
 * 1998.9999999999998, and Math.round hides that until the day it doesn't.
 */
function toMinorUnits(value, currency) {
  const code = normalizeCurrency(currency);
  const spec = CURRENCIES[code];
  if (!spec) return { ok: false, amountMinor: 0, reason: "unsupported_currency" };

  let text = String(value == null ? "" : value).trim().replace(/,/g, "");
  if (!text) return { ok: false, amountMinor: 0, reason: "empty" };
  let sign = 1;
  if (text.startsWith("-")) { sign = -1; text = text.slice(1); }
  else if (text.startsWith("+")) text = text.slice(1);
  if (!/^\d*(\.\d*)?$/.test(text) || text === "." || text === "") {
    return { ok: false, amountMinor: 0, reason: "not_a_number" };
  }

  const [wholeRaw, fractionRaw = ""] = text.split(".");
  const whole = wholeRaw || "0";
  // More decimals than the currency has is a caller bug, not something to round
  // away: 10.999 in GBP is either 10.99 or 11.00 and only the caller knows.
  if (fractionRaw.replace(/0+$/, "").length > spec.exponent) {
    return { ok: false, amountMinor: 0, reason: "too_many_decimals" };
  }
  const fraction = (fractionRaw + "0".repeat(spec.exponent)).slice(0, spec.exponent);
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  if (digits.length > 15) return { ok: false, amountMinor: 0, reason: "too_large" };

  const amountMinor = sign * Number(digits);
  if (!Number.isSafeInteger(amountMinor)) return { ok: false, amountMinor: 0, reason: "too_large" };
  if (spec.multipleOf > 1 && amountMinor % spec.multipleOf !== 0) {
    return { ok: false, amountMinor: 0, reason: "not_a_permitted_multiple" };
  }
  return { ok: true, amountMinor, reason: "" };
}

/** Minor units back to a display decimal string. Inverse of toMinorUnits. */
function fromMinorUnits(amountMinor, currency) {
  const code = normalizeCurrency(currency);
  const spec = CURRENCIES[code];
  if (!spec) return "";
  if (!Number.isSafeInteger(Number(amountMinor))) return "";
  const n = Number(amountMinor);
  const sign = n < 0 ? "-" : "";
  const digits = String(Math.abs(n)).padStart(spec.exponent + 1, "0");
  if (spec.exponent === 0) return `${sign}${digits}`;
  return `${sign}${digits.slice(0, -spec.exponent)}.${digits.slice(-spec.exponent)}`;
}

/**
 * Is this amount chargeable at all?
 *
 * Only the structural rules live here. Stripe's per-currency minimum (0.30 GBP,
 * 50 JPY, ...) is a live account/settlement property, so it is checked by the
 * server against the provider, never asserted from a table copied into the repo.
 */
function isChargeableAmount(amountMinor, currency) {
  const code = normalizeCurrency(currency);
  const spec = CURRENCIES[code];
  if (!spec) return { ok: false, reason: "unsupported_currency" };
  if (!Number.isSafeInteger(Number(amountMinor))) return { ok: false, reason: "not_an_integer" };
  const n = Number(amountMinor);
  if (n <= 0) return { ok: false, reason: "not_positive" };
  if (spec.multipleOf > 1 && n % spec.multipleOf !== 0) return { ok: false, reason: "not_a_permitted_multiple" };
  return { ok: true, reason: "" };
}

module.exports = {
  CURRENCIES,
  SYMBOL_TO_CURRENCIES,
  normalizeCurrency,
  isSupportedCurrency,
  symbolToCurrency,
  toMinorUnits,
  fromMinorUnits,
  isChargeableAmount
};

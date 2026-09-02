// DATA-006 — money is never a float in the canonical layer.
//
// Provider APIs disagree about numbers: Shopify sends "40.00" as a string,
// Etsy sends {amount: 4000, divisor: 100}, WooCommerce sends "40" or "40.5",
// a Zapier sender may post 40.5 as a JSON number. The envelope carries every
// amount as a decimal STRING with a fixed scale beside its currency, so two
// mappers that saw the same money produce byte-identical envelopes and a
// content hash that means something. The legacy order document still stores
// numbers (the clients read them); that conversion happens at the very edge,
// in envelopeToOrder, and nowhere else.
const SCALE = 2;

function parseDecimal(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && value.amount !== undefined && value.divisor) {
    // Etsy money: { amount: 4000, divisor: 100, currency_code }
    const amount = Number(value.amount); const divisor = Number(value.divisor);
    if (!Number.isFinite(amount) || !Number.isFinite(divisor) || divisor <= 0) return null;
    return amount / divisor;
  }
  if (typeof value === "object" && value.shop_money) return parseDecimal(value.shop_money.amount);
  const text = String(value).trim().replace(/,/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

/** "40.00" for anything money-like; null when the provider said nothing (MERGE-004: never invent). */
function toDecimalString(value) {
  const number = parseDecimal(value);
  if (number === null) return null;
  return (Math.round(number * 10 ** SCALE) / 10 ** SCALE).toFixed(SCALE);
}

/** Minor units as an integer ("40.05" → 4005); null when absent. */
function toMinorUnits(value) {
  const text = toDecimalString(value);
  if (text === null) return null;
  return Math.round(Number(text) * 10 ** SCALE);
}

/** Sum of decimal strings, ignoring nulls; null when every input was null. */
function sumDecimal(values) {
  let total = 0; let any = false;
  for (const value of values || []) {
    const minor = toMinorUnits(value);
    if (minor === null) continue;
    total += minor; any = true;
  }
  return any ? (total / 10 ** SCALE).toFixed(SCALE) : null;
}

/** The legacy order document keeps numbers; this is the only place a string becomes one. */
function toLegacyNumber(decimalString) {
  if (decimalString === null || decimalString === undefined || decimalString === "") return null;
  const number = Number(decimalString);
  return Number.isFinite(number) ? number : null;
}

function normalizeCurrency(value) {
  const code = String(value || "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  return code.length === 3 ? code : null;
}

module.exports = { SCALE, parseDecimal, toDecimalString, toMinorUnits, sumDecimal, toLegacyNumber, normalizeCurrency };

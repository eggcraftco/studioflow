// Money on a DHL customs declaration (DHL-10, 4 Nov 2026): what a person types in a value field, and
// how a value is shown back — with the reader's grouping and the declaration's currency.
//
// Reading is money.ts parseRequestAmount's, the payment-link reader: the same keys mean the same
// amount in every locale, and "1,750" (a thousand times apart between London and Istanbul) is refused
// as two readings rather than guessed. Writing groups thousands in threes in every locale (Hindi's
// lakh grouping would not read back) with the locale's own marks and Latin digits, so a field always
// reads back what it shows.
import { currencyFractionDigits, parseRequestAmount, requestAmountMessage } from "./money";

/** The locale's thousands and decimal marks, in Latin digits. */
function amountMarks(locale: string): { group: string; decimal: string } {
  try {
    const parts = new Intl.NumberFormat(locale, { numberingSystem: "latn" }).formatToParts(1234567.5);
    return { group: parts.find(p => p.type === "group")?.value ?? ",", decimal: parts.find(p => p.type === "decimal")?.value ?? "." };
  } catch {
    return { group: ",", decimal: "." };
  }
}

/** A value as a money field shows it: "1,750.00" in London, "1.750,00" in Istanbul, "1750" in yen. */
export function amountText(value: number | null | undefined, currency: string, locale: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const digits = currencyFractionDigits(currency);
  const { group, decimal } = amountMarks(locale);
  const [whole, fraction] = Math.abs(value).toFixed(digits).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${value < 0 ? "-" : ""}${grouped}${fraction ? `${decimal}${fraction}` : ""}`;
}

/**
 * What a person typed in a money field: { value } in the currency's units, or { error } — a sentence
 * the translation tables hold. Zero is a value here: a customs line may be worth nothing.
 */
export function readAmount(raw: string, currency: string, locale: string): { value: number | null; error: string } {
  const typed = String(raw ?? "").trim();
  if (!typed) return { value: null, error: "" };
  if (/^0+(?:[.,]0+)?$/.test(typed)) return { value: 0, error: "" };
  const read = parseRequestAmount(typed, currency, locale);
  if (read.ok) return { value: read.amountMinor / 10 ** currencyFractionDigits(currency), error: "" };
  return { value: null, error: read.reason === "wrong_currency" ? "This amount names a different currency from the one chosen for the declaration." : requestAmountMessage(read.reason) };
}

/** An amount with its currency, in the reader's own format ("£1,750.00"). */
export function formatMoney(value: number, currency: string, locale: string): string {
  if (!currency) return amountText(value, "", locale);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    return `${amountText(value, currency, locale)} ${currency}`;
  }
}

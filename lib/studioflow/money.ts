export type StudioMoneySettings = {
  selectedCurrency?: string;
  selectedDecimalSeparator?: string;
} | null | undefined;

export function moneySymbol(settings: StudioMoneySettings) {
  return settings?.selectedCurrency?.trim() || "£";
}

export function formatStudioMoney(
  value: number,
  settings: StudioMoneySettings,
  options: { maximumFractionDigits?: number; minimumFractionDigits?: number } = {}
) {
  const amount = Number.isFinite(value) ? value : 0;
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  const minimumFractionDigits = options.minimumFractionDigits ?? maximumFractionDigits;
  const base = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits,
    maximumFractionDigits
  }).format(amount);

  const decimalSeparator = settings?.selectedDecimalSeparator === "," ? "," : ".";
  const formatted = decimalSeparator === ","
    ? base.replaceAll(",", "__GROUP__").replaceAll(".", ",").replaceAll("__GROUP__", ".")
    : base;

  return `${moneySymbol(settings)}${formatted}`;
}

/** The characters a locale uses to group thousands and to mark decimals. */
function localeSeparators(locale: string): { group: string; decimal: string } {
  try {
    // Seven digits, because several locales (Spanish, Italian) do not group a
    // four-digit number at all — asking 1234.5 returned no group part and the
    // fallback "," then inverted their decimal comma.
    const parts = new Intl.NumberFormat(locale || undefined).formatToParts(1234567.5);
    const group = parts.find(part => part.type === "group")?.value ?? ",";
    const decimal = parts.find(part => part.type === "decimal")?.value ?? ".";
    return { group, decimal };
  } catch {
    return { group: ",", decimal: "." };
  }
}

/**
 * Reads what a person typed into a money field: "1,250.50", "1.250,50",
 * "£1 250", "12,5" and "-3" all come out as the number they meant.
 *
 * Whitespace, currency symbols and letters are dropped. When both "," and "."
 * appear, the LAST one is the decimal separator and the other groups
 * thousands. With only one kind: once, followed by one or two digits — a
 * decimal; once, followed by exactly three digits — grouping only if it is the
 * locale's grouping character AND the digits before it could be a leading
 * group; more than once — grouping.
 * Returns null when nothing numeric is left.
 */
export function parseAmountInput(raw: string, locale: string): number | null {
  const kept = String(raw ?? "").replace(/[^\d,.\-]/g, "");
  if (!/\d/.test(kept)) return null;
  const negative = kept.startsWith("-");
  let digits = kept.replace(/-/g, "");

  const hasComma = digits.includes(",");
  const hasDot = digits.includes(".");
  if (hasComma && hasDot) {
    const decimal = digits.lastIndexOf(",") > digits.lastIndexOf(".") ? "," : ".";
    const grouping = decimal === "," ? "." : ",";
    digits = digits.split(grouping).join("");
    if (decimal === ",") digits = digits.replace(",", ".");
  } else if (hasComma || hasDot) {
    const separator = hasComma ? "," : ".";
    const occurrences = digits.split(separator).length - 1;
    if (occurrences > 1) {
      digits = digits.split(separator).join("");
    } else {
      const cut = digits.indexOf(separator);
      const before = digits.slice(0, cut);
      const after = digits.slice(cut + 1);
      const { group, decimal } = localeSeparators(locale);
      // A thousands group is exactly three digits, is preceded by one to three
      // digits, and never follows a lone leading zero — nobody writes 750 as
      // "0,750", so "0.750" on a Turkish keyboard is three-quarters of a gram.
      const looksGrouped = after.length === 3
        && before.length > 0
        && before.length <= 3
        && !/^0/.test(before);
      const isGrouping = looksGrouped && separator === group && separator !== decimal;
      if (isGrouping) digits = before + after;
      else if (separator === ",") digits = `${before}.${after}`;
    }
  }

  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

/** Currencies whose minor unit IS the unit. Mirrors functions/payments/money.js. */
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY"]);

/** How many decimals an amount in this currency may carry: 0 for JPY, otherwise 2. */
export function currencyFractionDigits(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(String(currency || "").toUpperCase()) ? 0 : 2;
}

/**
 * Minor units as text a person can edit and `parseRequestAmount` reads back
 * exactly: no grouping, and the locale's decimal mark when it is a comma
 * ("1234,50" in Istanbul, "1234.50" in London, "1250" for JPY). Never the
 * browser's currency formatting — "1.234,50 £" is not an input.
 */
export function minorToInputText(amountMinor: number, currency: string, locale: string): string {
  const digits = currencyFractionDigits(currency);
  const minor = Math.max(0, Math.trunc(Number(amountMinor) || 0));
  if (digits <= 0) return String(minor);
  const scale = 10 ** digits;
  const mark = localeSeparators(locale).decimal === "," ? "," : ".";
  return `${Math.trunc(minor / scale)}${mark}${String(minor % scale).padStart(digits, "0")}`;
}

export type RequestAmountRefusal =
  | "empty" | "not_positive" | "unreadable" | "wrong_currency"
  | "ambiguous" | "too_many_decimals" | "no_decimals" | "misplaced_grouping";

export type RequestAmountResult =
  | { ok: true; amountMinor: number }
  | { ok: false; reason: RequestAmountRefusal };

/** The sentence for a refused amount. Every one is a key in the translation tables. */
export function requestAmountMessage(reason: RequestAmountRefusal): string {
  switch (reason) {
    case "ambiguous": return "This amount can be read two ways. Type it without a thousands separator, or with two decimals.";
    case "too_many_decimals": return "An amount can have at most two decimals.";
    case "no_decimals": return "This currency does not use decimals.";
    case "misplaced_grouping": return "The thousands separators in this amount are not in the right place.";
    case "unreadable": return "This amount could not be read. Type digits, with a comma or a dot before the decimals.";
    case "wrong_currency": return "This amount names a different currency from the one this payment link will use.";
    default: return "Enter an amount above zero.";
  }
}

/**
 * Currency marks a pasted amount may carry, and the ISO codes each can mean.
 * The workspace symbols are functions/payments/money.js SYMBOL_TO_CURRENCIES;
 * "TL" is how Turkish writes the lira. Any three letters are read as an ISO code.
 */
const MARK_CURRENCIES: Record<string, string[]> = {
  "£": ["GBP"], "€": ["EUR"], "₺": ["TRY"], "TL": ["TRY"], "A$": ["AUD"], "C$": ["CAD"],
  "د.إ": ["AED"], "$": ["USD", "AUD", "CAD"], "¥": ["JPY", "CNY"],
};

/**
 * Unicode White_Space plus U+FEFF, spelled out: JavaScript's \s, Swift's and
 * the JVM's whitespace tables each differ by a character or two, and the three
 * readers must agree character for character.
 */
function isSpaceCode(code: number): boolean {
  return (code >= 0x09 && code <= 0x0d) || code === 0x20 || code === 0x85 || code === 0xa0 || code === 0x1680
    || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f
    || code === 0x205f || code === 0x3000 || code === 0xfeff;
}

/** Marks that can only ever group thousands: spaces (after NFKC), apostrophes, the Arabic thousands mark. */
function groupingKind(char: string): string {
  if (char === " ") return "space";
  if (char === "'" || char === "\u2019") return "apostrophe";
  if (char === "\u066C") return "arabic";
  return "";
}

/**
 * An amount a customer will be ASKED TO PAY, in minor units of `currency`.
 *
 * Stricter than `parseAmountInput`, which settles "1,250" by the locale — 1250
 * in London, 1.25 in Istanbul. That is fine for a note and wrong for a payment
 * link: the same keys would ask two customers for amounts a thousand times
 * apart. So the answer here is the SAME IN EVERY LOCALE, and it is either the
 * amount that was meant or a refusal the screen can say — never a re-reading:
 * - one comma or dot followed by exactly three digits, after one to three
 *   digits ("1,250", "1.250"), is refused as ambiguous — unless the currency
 *   has no decimals, where it can only be grouping;
 * - grouping must be real grouping (1–3 digits, then groups of exactly 3);
 *   spaces, apostrophes and the Arabic thousands mark are grouping and nothing
 *   else ("1 250,50", "1'250.50");
 * - more decimals than the currency has are refused, never rounded;
 * - a character that is not a digit, a separator or a currency mark at either
 *   end is refused, never dropped ("12a50" is not 1250);
 * - a currency mark must name the link's currency ("€12" is not £12);
 * - Arabic-Indic, Devanagari and full-width digits read as the digits they are.
 * Minor units come from the TEXT, never from multiplying a float (19.99 * 100
 * is 1998.9999999999998). The shared `parseAmountInput` must read the same
 * amount, or the input is refused. scripts/request-amount/vectors.json is the
 * contract; Apple and Android implement the same rules against it.
 */
export function parseRequestAmount(raw: string, currency: string, locale: string): RequestAmountResult {
  const fractionDigits = currencyFractionDigits(currency);
  let text = "";
  for (const char of String(raw ?? "").normalize("NFKC")) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x0660 && code <= 0x0669) text += String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) text += String(code - 0x06f0);
    else if (code >= 0x0966 && code <= 0x096f) text += String(code - 0x0966);
    else if (code === 0x066b) text += ".";
    else if (isSpaceCode(code)) text += " ";
    else text += char;
  }
  if (text.includes("-") || text.includes("\u2212")) return { ok: false, reason: "not_positive" };

  // Currency marks at either end, each with the spaces beside it.
  const isMarkChar = (char: string) => /[\p{L}\p{Sc}]/u.test(char);
  const marks: string[] = [];
  let core = text.replace(/^ +| +$/g, "");
  for (;;) {
    if (core.startsWith("د.إ")) { marks.push("د.إ"); core = core.slice(3).replace(/^ +/, ""); continue; }
    const chars = Array.from(core);
    let n = 0;
    while (n < chars.length && isMarkChar(chars[n])) n += 1;
    if (n === 0) break;
    marks.push(chars.slice(0, n).join(""));
    core = chars.slice(n).join("").replace(/^ +/, "");
  }
  for (;;) {
    if (core.endsWith("د.إ")) { marks.push("د.إ"); core = core.slice(0, -3).replace(/ +$/, ""); continue; }
    const chars = Array.from(core);
    let n = chars.length;
    while (n > 0 && isMarkChar(chars[n - 1])) n -= 1;
    if (n === chars.length) break;
    marks.push(chars.slice(n).join(""));
    core = chars.slice(0, n).join("").replace(/ +$/, "");
  }
  if (!/[0-9]/.test(core)) return { ok: false, reason: "empty" };
  for (const mark of marks) {
    const upper = mark.toUpperCase();
    const candidates = MARK_CURRENCIES[mark] ?? MARK_CURRENCIES[upper] ?? (/^[A-Z]{3}$/.test(upper) ? [upper] : null);
    if (!candidates) return { ok: false, reason: "unreadable" };
    if (currency && !candidates.includes(currency.toUpperCase())) return { ok: false, reason: "wrong_currency" };
  }
  const kinds = new Set<string>();
  for (const char of core) {
    if (/[0-9.,]/.test(char)) continue;
    const kind = groupingKind(char);
    if (!kind) return { ok: false, reason: "unreadable" };
    kinds.add(kind);
  }

  const groupsValid = (groups: string[]) =>
    groups.length > 0 && /^[0-9]{1,3}$/.test(groups[0]) && groups.slice(1).every((group) => /^[0-9]{3}$/.test(group));
  let integer = "";
  let fraction = "";
  if (kinds.size > 1) return { ok: false, reason: "misplaced_grouping" };
  if (kinds.size === 1) {
    // Explicit grouping, so a comma or dot after it can only be the decimal.
    const cut = core.search(/[.,]/);
    const head = cut < 0 ? core : core.slice(0, cut);
    const tail = cut < 0 ? "" : core.slice(cut + 1);
    if (!groupsValid(Array.from(head).reduce<string[]>((groups, char) => {
      if (groupingKind(char)) groups.push(""); else groups[groups.length - 1] += char;
      return groups;
    }, [""])) || !/^[0-9]*$/.test(tail)) return { ok: false, reason: "misplaced_grouping" };
    integer = head.replace(/[^0-9]/g, "");
    fraction = tail;
  } else {
    const hasComma = core.includes(",");
    const hasDot = core.includes(".");
    if (hasComma && hasDot) {
      const decimal = core.lastIndexOf(",") > core.lastIndexOf(".") ? "," : ".";
      const grouping = decimal === "," ? "." : ",";
      const parts = core.split(decimal);
      if (parts.length !== 2 || !groupsValid(parts[0].split(grouping))) return { ok: false, reason: "misplaced_grouping" };
      integer = parts[0].split(grouping).join("");
      fraction = parts[1];
    } else if (hasComma || hasDot) {
      const parts = core.split(hasComma ? "," : ".");
      if (parts.length > 2) {
        if (!groupsValid(parts)) return { ok: false, reason: "misplaced_grouping" };
        integer = parts.join("");
      } else {
        const [head, tail] = parts;
        const couldGroup = tail.length === 3 && head.length >= 1 && head.length <= 3 && !head.startsWith("0");
        if (couldGroup && fractionDigits > 0) return { ok: false, reason: "ambiguous" };
        if (couldGroup) integer = head + tail;
        else { integer = head; fraction = tail; }
      }
    } else {
      integer = core;
    }
  }
  if (fraction.length > fractionDigits) return { ok: false, reason: fractionDigits === 0 ? "no_decimals" : "too_many_decimals" };
  const minorText = `${integer || "0"}${fraction.padEnd(fractionDigits, "0")}`.replace(/^0+(?=[0-9])/, "");
  // Beyond fifteen digits it is a pasted card or order number, not an amount.
  if (minorText.length > 15) return { ok: false, reason: "unreadable" };
  const amountMinor = Number(minorText);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return { ok: false, reason: "not_positive" };
  if (fractionDigits > 0) {
    // The shared reader must see the same amount; if it does not, the two
    // readings ARE the ambiguity.
    const shared = parseAmountInput(core, locale);
    if (shared === null || Math.round(shared * 10 ** fractionDigits) !== amountMinor) return { ok: false, reason: "ambiguous" };
  }
  return { ok: true, amountMinor };
}

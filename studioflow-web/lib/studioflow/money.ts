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
    const parts = new Intl.NumberFormat(locale || undefined).formatToParts(1234.5);
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
 * decimal; once, followed by exactly three digits — grouping if it is the
 * locale's grouping character, otherwise a decimal; more than once — grouping.
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
      const after = digits.slice(digits.indexOf(separator) + 1);
      const isGrouping = after.length === 3 && localeSeparators(locale).group === separator;
      if (isGrouping) digits = digits.replace(separator, "");
      else if (separator === ",") digits = digits.replace(",", ".");
    }
  }

  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

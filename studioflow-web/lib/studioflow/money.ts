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

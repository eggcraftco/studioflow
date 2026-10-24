import { currencyFractionDigits, formatStudioMoney, moneySymbol, type StudioMoneySettings } from "./money";
import { studioT } from "./language";

/**
 * ETSY-E2E r2 (24 Oct 2026): the order's own currency.
 *
 * An Etsy order paid in USD showed "£12.50": order documents have no top-level
 * currency, and every money figure on the order screen, the order list and the
 * totals used the workspace symbol. The order's ISO code lives in the field its
 * connector writes — customFields["<Source> Currency"] (e.g. "Etsy Currency",
 * which survives an Etsy disconnect), the generic webhook's customFields
 * ["Currency"], or etsySource.currency (deleted on disconnect).
 *
 * The workspace currency is a SYMBOL (seciliParaBirimi). An order is "foreign"
 * only when it carries an ISO code the workspace symbol cannot mean. "$" is the
 * Settings option "USD ($)", so it means USD only — a CAD or AUD order in a "$"
 * workspace is shown and counted apart, never silently added. Nothing is ever
 * converted: there is no exchange-rate decision in the app.
 */
export type OrderCurrencySource = {
  customFields?: Record<string, string> | null;
  etsySource?: { currency?: unknown } | null;
} | null | undefined;

// Same table and the same case-folding as the dashboard's channel filter.
const KNOWN_SOURCES = ["Shopify", "WooCommerce", "Etsy", "Square", "Amazon", "eBay"];

function isoCode(value: unknown): string {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

/** The order's ISO currency code, or "" when the order does not say. */
export function orderCurrencyCode(order: OrderCurrencySource): string {
  const fields = order?.customFields || {};
  const raw = String(fields["Source"] || "").trim();
  const known = KNOWN_SOURCES.find(source => source.toLowerCase() === raw.toLowerCase());
  const source = known ?? raw;
  return isoCode(source ? fields[`${source} Currency`] : "")
    || isoCode(fields["Currency"])
    || isoCode(order?.etsySource?.currency)
    || "";
}

/**
 * The ISO codes each workspace symbol can stand for. The Settings options
 * (£ $ € ₺ ¥ A$ C$ CHF د.إ) plus the symbols the onboarding wizard can write.
 */
const SYMBOL_CODES: Record<string, string[]> = {
  "£": ["GBP"], "$": ["USD"], "€": ["EUR"], "₺": ["TRY"], "TL": ["TRY"],
  "¥": ["JPY", "CNY"], "A$": ["AUD"], "C$": ["CAD"], "CHF": ["CHF"], "د.إ": ["AED"],
  "₹": ["INR"], "₽": ["RUB"], "R$": ["BRL"], "NZ$": ["NZD"], "kr": ["SEK", "NOK", "DKK"],
  "zł": ["PLN"], "﷼": ["SAR"]
};

/** The codes the workspace's symbol can mean ([] when the symbol is unknown). */
export function workspaceCurrencyCodes(settings: StudioMoneySettings): string[] {
  const symbol = moneySymbol(settings);
  if (SYMBOL_CODES[symbol]) return SYMBOL_CODES[symbol];
  const asCode = isoCode(symbol);
  return asCode ? [asCode] : [];
}

/** True only when the order names a currency the workspace symbol does not mean. */
export function isForeignToWorkspace(order: OrderCurrencySource, settings: StudioMoneySettings): boolean {
  const code = orderCurrencyCode(order);
  if (!code) return false;
  return !workspaceCurrencyCodes(settings).includes(code);
}

/** "USD 12.50": the ISO code, then the amount with the workspace's decimal separator. */
export function formatCurrencyCodeAmount(value: number, code: string, settings: StudioMoneySettings): string {
  const amount = Number.isFinite(value) ? value : 0;
  const digits = currencyFractionDigits(code);
  const base = new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
  const formatted = settings?.selectedDecimalSeparator === ","
    ? base.replaceAll(",", "__GROUP__").replaceAll(".", ",").replaceAll("__GROUP__", ".")
    : base;
  return `${code} ${formatted}`;
}

/**
 * One order's money. Same-currency (or unknown-currency) orders keep the
 * workspace format exactly ("£12.50"); a foreign order reads "USD 12.50".
 */
export function formatOrderMoney(value: number, order: OrderCurrencySource, settings: StudioMoneySettings): string {
  if (!isForeignToWorkspace(order, settings)) return formatStudioMoney(value, settings);
  return formatCurrencyCodeAmount(value, orderCurrencyCode(order), settings);
}

/** An amount whose ISO code is known on its own (a Sales row): the workspace format when it is the workspace's currency. */
export function formatAmountInCurrency(value: number, code: string, settings: StudioMoneySettings): string {
  return formatOrderMoney(value, { customFields: { Currency: code } }, settings);
}

/** What a hidden amount is prefixed with: the workspace symbol, or the order's ISO code. */
export function orderMoneySymbol(order: OrderCurrencySource, settings: StudioMoneySettings): string {
  return isForeignToWorkspace(order, settings) ? orderCurrencyCode(order) : moneySymbol(settings);
}

/** The glyph inside the money icon: the workspace symbol, or the order currency's own sign ("$" for USD). */
export function orderIconSymbol(order: OrderCurrencySource, settings: StudioMoneySettings): string {
  if (!isForeignToWorkspace(order, settings)) return moneySymbol(settings);
  const code = orderCurrencyCode(order);
  try {
    const part = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
      .formatToParts(0).find(p => p.type === "currency")?.value;
    return part || code;
  } catch {
    return code;
  }
}

/** Splits orders into the ones a workspace-currency total may add, and the rest. */
export function splitOrdersByWorkspaceCurrency<T extends OrderCurrencySource>(orders: T[], settings: StudioMoneySettings): { workspace: T[]; foreign: T[] } {
  const workspace: T[] = [];
  const foreign: T[] = [];
  for (const order of orders) (isForeignToWorkspace(order, settings) ? foreign : workspace).push(order);
  return { workspace, foreign };
}

export type ForeignCurrencyTotal = { code: string; amount: number; count: number };

/** Per-currency totals of the foreign orders only, largest first. Never converted. */
export function foreignCurrencyTotals<T extends OrderCurrencySource>(
  orders: T[],
  settings: StudioMoneySettings,
  amountOf: (order: T) => number
): ForeignCurrencyTotal[] {
  const map = new Map<string, ForeignCurrencyTotal>();
  for (const order of orders) {
    if (!isForeignToWorkspace(order, settings)) continue;
    const code = orderCurrencyCode(order);
    const row = map.get(code) ?? { code, amount: 0, count: 0 };
    row.amount += amountOf(order);
    row.count += 1;
    map.set(code, row);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount || a.code.localeCompare(b.code));
}

export const OTHER_CURRENCIES_LABEL = "Other currencies (not converted, not in totals):";

/** "Other currencies (not converted, not in totals): USD 54.00 · EUR 20.00", or "" when there are none. */
export function foreignCurrenciesLine(
  rows: ForeignCurrencyTotal[],
  settings: StudioMoneySettings,
  language: string | null | undefined,
  hidden = false
): string {
  if (!rows.length) return "";
  const amounts = rows.map(row => (hidden ? `${row.code} ••••` : formatCurrencyCodeAmount(row.amount, row.code, settings)));
  return `${studioT(OTHER_CURRENCIES_LABEL, language)} ${amounts.join(" · ")}`;
}

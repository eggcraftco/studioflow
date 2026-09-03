// The web's mirror of the Finance Engine.
//
// The server stamps every order with `finance`, and that block is what the web
// SHOWS. This exists for the one thing a stamped block cannot do: while
// somebody is typing into the finance card, the figures have to move before the
// write has been made, and a preview computed by a different rule than the
// engine's makes the number visibly jump when the server's answer arrives.
//
// So this is a faithful port of functions/finance/engine.js, held to the same
// golden vectors — `npm run test:finance` compiles this file and runs
// functions/finance/vectors.json through it. If the two ever drift, that fails.
//
// Do not "improve" a formula here. Change functions/finance/engine.js, add a
// vector, then port it across. Spec: docs/finance-engine.md.

export const FINANCE_ENGINE_VERSION = 2;

export const REMAINING_PREFIX = "financialRemaining::";
export const EXPENSE_PREFIX = "financialExpense::";

export type VatMethod = "standard" | "margin" | "none";

export type FinanceBlock = {
  engineVersion: number;
  method: VatMethod;
  taxRate: number;
  pricesIncludeVat: boolean;
  vatRegistered: boolean;
  revenue: number;
  receivablesTotal: number;
  directCost: number;
  grossMargin: number;
  platformFee: number;
  deliveryCost: number;
  otherExpenses: number;
  refunded: number;
  vatBase: number;
  vatDue: number;
  netProfit: number;
  customerTotal: number;
  fromLineItems: boolean;
  orphanKeys: string[];
  computedAtMs?: number;
};

export type FinanceLine = { title: string; amount: number };

export type FinanceResult = FinanceBlock & {
  receivableLines: FinanceLine[];
  expenseLines: FinanceLine[];
};

/** The shape the engine reads off an order. Everything is optional. */
export type FinanceEngineOrder = {
  paidAmount?: unknown;
  remainingAmount?: unknown;
  watchPurchasePrice?: unknown;
  deliveryCost?: unknown;
  refundedAmount?: unknown;
  taxRate?: unknown;
  taxType?: unknown;
  lineItems?: Array<{ lineTotal?: unknown } | null | undefined> | null;
  customFields?: Record<string, unknown> | null;
};

export type FinanceEngineSettings = {
  feePercentage?: unknown;
  defaultTaxRate?: unknown;
  vatRegistered?: unknown;
  pricesIncludeVat?: unknown;
  vatMethod?: unknown;
  taxCalculationType?: unknown;
  taxMilestoneEnabled?: unknown;
  taxMilestoneDate?: unknown;
};

/**
 * Reads a money value at full precision, keeping its sign. Our own clients
 * write a plain dot decimal, so that shape is taken at face value; anything
 * else came from a text field on some platform and gets the same
 * last-separator-wins reading the input fields use.
 */
export function readAmount(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return 0;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);

  let kept = "";
  for (const character of text) {
    if (character >= "0" && character <= "9") kept += character;
    else if (character === "," || character === ".") kept += character;
    else if (character === "-" && kept === "") kept += character;
  }
  if (!/\d/.test(kept)) return 0;

  const negative = kept.startsWith("-");
  let body = kept.replace(/-/g, "");
  const hasComma = body.includes(",");
  const hasDot = body.includes(".");

  if (hasComma && hasDot) {
    const decimal = body.lastIndexOf(",") > body.lastIndexOf(".") ? "," : ".";
    const grouping = decimal === "," ? "." : ",";
    body = body.split(grouping).join("");
    if (decimal === ",") body = body.replace(",", ".");
  } else if (hasComma || hasDot) {
    const separator = hasComma ? "," : ".";
    const occurrences = body.split(separator).length - 1;
    if (occurrences > 1) {
      body = body.split(separator).join("");
    } else {
      const cut = body.indexOf(separator);
      const before = body.slice(0, cut);
      const after = body.slice(cut + 1);
      const grouped = after.length === 3 && before.length > 0 && before.length <= 3 && !before.startsWith("0");
      body = grouped ? before + after : `${before}.${after}`;
    }
  }

  const value = Number(body);
  if (!Number.isFinite(value)) return 0;
  return negative ? -value : value;
}

/** Two decimal places, away from zero, applied once at the output. */
export function round2(value: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const rounded = Math.round(Math.abs(number) * 100) / 100;
  return number < 0 ? -rounded : rounded;
}

function readPercentage(raw: unknown, fallback: number): number {
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(Math.round(number * 100) / 100, 100);
}

function readBoolean(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

/** `Revenue` is the standard scheme and `Profit` is the margin scheme. */
export function normalizeVatMethod(raw: unknown, fallback: VatMethod | "" = "standard"): VatMethod | "" {
  const text = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!text) return fallback;
  if (text === "standard" || text === "revenue" || text.includes("standard")) return "standard";
  if (text === "margin" || text === "profit" || text.includes("margin")) return "margin";
  if (text === "none" || text.includes("no vat") || text === "novat" || text === "exempt") return "none";
  return fallback;
}

type NormalizedSettings = {
  feePercentage: number;
  defaultTaxRate: number;
  vatRegistered: boolean;
  pricesIncludeVat: boolean;
  defaultVatMethod: VatMethod;
  taxMilestoneEnabled: boolean;
  taxMilestoneDateSeconds: number;
};

export function normalizeFinanceSettings(raw: FinanceEngineSettings | null | undefined): NormalizedSettings {
  const settings = raw && typeof raw === "object" ? raw : {};
  return {
    feePercentage: readPercentage(settings.feePercentage, 3),
    defaultTaxRate: readPercentage(settings.defaultTaxRate, 20),
    vatRegistered: readBoolean(settings.vatRegistered, true),
    pricesIncludeVat: readBoolean(settings.pricesIncludeVat, true),
    defaultVatMethod: (normalizeVatMethod(settings.vatMethod || settings.taxCalculationType, "standard") || "standard") as VatMethod,
    taxMilestoneEnabled: readBoolean(settings.taxMilestoneEnabled, false),
    taxMilestoneDateSeconds: Number.isFinite(Number(settings.taxMilestoneDate)) ? Number(settings.taxMilestoneDate) : 0
  };
}

function resolveVatMethod(order: FinanceEngineOrder, settings: NormalizedSettings, paymentDateMs: number): VatMethod {
  const own = normalizeVatMethod(order?.taxType, "");
  if (own) return own;
  if (settings.taxMilestoneEnabled && Number.isFinite(paymentDateMs)) {
    return paymentDateMs / 1000 >= settings.taxMilestoneDateSeconds ? "standard" : "margin";
  }
  return settings.defaultVatMethod;
}

function headingTitles(raw: unknown): string[] {
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: unknown) => (item && typeof item === "object" ? String((item as { title?: unknown }).title || "").trim() : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Every stored key counts. The heading list decides the order and the label a
 * screen shows, never whether an amount is money — dropping an amount whose
 * heading was renamed made a total quietly smaller than its own rows.
 */
export function customLineTotal(
  customFields: Record<string, unknown> | null | undefined,
  prefix: string,
  headingKey: string
): { total: number; lines: FinanceLine[]; orphans: string[] } {
  const fields = customFields && typeof customFields === "object" && !Array.isArray(customFields) ? customFields : {};
  const allowed = new Set(headingTitles(fields[headingKey]));
  const lines: FinanceLine[] = [];
  const orphans: string[] = [];
  let total = 0;

  for (const [key, raw] of Object.entries(fields)) {
    if (typeof key !== "string" || !key.startsWith(prefix)) continue;
    const title = key.slice(prefix.length);
    if (!title) continue;
    const amount = readAmount(raw);
    total += amount;
    lines.push({ title, amount });
    if (allowed.size > 0 && !allowed.has(title)) orphans.push(title);
  }

  lines.sort((a, b) => a.title.localeCompare(b.title));
  orphans.sort();
  return { total, lines, orphans };
}

function lineItemsTotal(order: FinanceEngineOrder): { total: number; count: number } {
  const items = Array.isArray(order?.lineItems) ? order.lineItems : [];
  let total = 0;
  let count = 0;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    count += 1;
    total += readAmount(item.lineTotal);
  }
  return { total, count };
}

/** Computes every money figure for one order. A port; do not diverge. */
export function computeOrderFinance(
  order: FinanceEngineOrder | null | undefined,
  rawSettings: FinanceEngineSettings | null | undefined,
  options: { paymentDateMs?: number } = {}
): FinanceResult {
  const source = order && typeof order === "object" ? order : {};
  const settings = normalizeFinanceSettings(rawSettings);
  const paymentDateMs = Number.isFinite(Number(options.paymentDateMs)) ? Number(options.paymentDateMs) : NaN;

  const customFields = source.customFields && typeof source.customFields === "object" && !Array.isArray(source.customFields)
    ? source.customFields
    : {};

  const receivables = customLineTotal(customFields, REMAINING_PREFIX, "orderRemainingItemsJSON");
  const expenses = customLineTotal(customFields, EXPENSE_PREFIX, "orderExpenseItemsJSON");
  const items = lineItemsTotal(source);

  const revenue = items.count > 0
    ? items.total
    : readAmount(source.paidAmount) + readAmount(source.remainingAmount) + receivables.total;

  const directCost = readAmount(source.watchPurchasePrice);
  const otherExpenses = expenses.total;
  const deliveryCost = readAmount(source.deliveryCost);
  const refunded = readAmount(source.refundedAmount);

  const grossMargin = revenue - directCost;
  const platformFee = round2((revenue * settings.feePercentage) / 100);

  const method = resolveVatMethod(source, settings, paymentDateMs);
  const rate = Object.prototype.hasOwnProperty.call(source, "taxRate") && source.taxRate !== null && source.taxRate !== ""
    ? readPercentage(source.taxRate, settings.defaultTaxRate)
    : settings.defaultTaxRate;

  let vatBase = 0;
  if (method === "standard") vatBase = revenue;
  else if (method === "margin") vatBase = Math.max(grossMargin, 0);

  let vatDue = 0;
  if (settings.vatRegistered && method !== "none" && rate > 0 && vatBase > 0) {
    vatDue = settings.pricesIncludeVat
      ? round2((vatBase * rate) / (100 + rate))
      : round2((vatBase * rate) / 100);
  }

  const netProfit = revenue - vatDue - directCost - platformFee - deliveryCost - otherExpenses - refunded;

  return {
    engineVersion: FINANCE_ENGINE_VERSION,
    method,
    taxRate: rate,
    pricesIncludeVat: settings.pricesIncludeVat,
    vatRegistered: settings.vatRegistered,

    revenue: round2(revenue),
    receivablesTotal: round2(receivables.total),
    directCost: round2(directCost),
    grossMargin: round2(grossMargin),
    platformFee,
    deliveryCost: round2(deliveryCost),
    otherExpenses: round2(otherExpenses),
    refunded: round2(refunded),
    vatBase: round2(vatBase),
    vatDue,
    netProfit: round2(netProfit),
    customerTotal: round2(settings.pricesIncludeVat ? revenue : revenue + vatDue),

    fromLineItems: items.count > 0,
    receivableLines: receivables.lines,
    expenseLines: expenses.lines,
    orphanKeys: [
      ...receivables.orphans.map((title) => REMAINING_PREFIX + title),
      ...expenses.orphans.map((title) => EXPENSE_PREFIX + title)
    ]
  };
}

/**
 * What a screen should show for an order: the block the server stamped, or —
 * for an order the trigger has not reached yet, or one being edited right now —
 * the same numbers computed here.
 */
export function financeFor(
  order: (FinanceEngineOrder & { finance?: Partial<FinanceBlock> | null }) | null | undefined,
  settings: FinanceEngineSettings | null | undefined,
  options: { paymentDateMs?: number; preferLocal?: boolean } = {}
): FinanceBlock {
  const stamped = order?.finance;
  if (!options.preferLocal && stamped && Number(stamped.engineVersion) === FINANCE_ENGINE_VERSION) {
    return stamped as FinanceBlock;
  }
  return computeOrderFinance(order, settings, options);
}

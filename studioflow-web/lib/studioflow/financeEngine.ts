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

export const FINANCE_ENGINE_VERSION = 4;

export const REMAINING_PREFIX = "financialRemaining::";
export const EXPENSE_PREFIX = "financialExpense::";

export type VatMethod = "standard" | "margin" | "none";

/**
 * Whose tax is it. A shop tells us what tax it charged; it does not tell us
 * whether that tax is the studio's to declare, and conflating the two gets the
 * VAT return wrong in one direction or the other.
 *
 *   merchant  the studio charged it and the studio declares it — a Shopify,
 *             WooCommerce or Square sale is normally this.
 *   platform  the marketplace collected it and remits it itself, so it belongs
 *             on the order but NOT in the studio's VAT due.
 *   unknown   nobody has said, and the engine refuses to guess: the amount is
 *             shown, left out of VAT due, and the order is marked for review.
 *
 * Per order, not per channel — Etsy remits in some jurisdictions and leaves the
 * seller responsible in others, so "it is an Etsy order" is not an answer.
 */
export type TaxResponsibility = "merchant" | "platform" | "unknown";

export const TAX_MERCHANT = "merchant";
export const TAX_PLATFORM = "platform";
export const TAX_UNKNOWN = "unknown";

export type FinanceBlock = {
  engineVersion: number;
  method: VatMethod;
  taxRate: number;
  pricesIncludeVat: boolean;
  vatRegistered: boolean;
  /** Whether the shop told us the tax it charged, rather than a rate to derive it from. */
  taxAmountKnown: boolean;
  /** Whose tax it is. Only consulted when `taxAmountKnown`; otherwise "merchant". */
  taxResponsibility: TaxResponsibility;
  /** Whether that tax sits inside the price or is added on top of it. */
  taxIncludedInPrice: boolean;
  /** Tax a marketplace collected and remits itself — real money, never the studio's VAT. */
  platformCollectedTax: number;
  /** A known tax amount nobody has claimed. Shown, left out of VAT due, flagged for a human. */
  taxNeedsReview: boolean;
  revenue: number;
  receivablesTotal: number;
  directCost: number;
  grossMargin: number;
  platformFee: number;
  /** Whether platformFee is the shop's own figure or the workspace's percentage. */
  platformFeeKnown: boolean;
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
  paymentFee?: unknown;
  /** Set only by a connector that was told the platform's real commission. */
  platformFeeKnown?: unknown;
  /** Set only by a connector that was told the tax the shop actually charged. */
  taxAmountKnown?: unknown;
  /** The shop's own tax figure. Read only when `taxAmountKnown`. */
  taxAmount?: unknown;
  /** merchant | platform | unknown — only consulted when `taxAmountKnown`. */
  taxResponsibility?: unknown;
  /** Whether that tax sits inside the price. Falls back to the workspace setting. */
  taxIncludedInPrice?: unknown;
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

/**
 * `seller` and `self` are the merchant; `marketplace` and `facilitator` are the
 * platform. An empty value is the caller's fallback — nobody has said — and
 * anything we do not recognise is `unknown` rather than a guess.
 */
export function normalizeTaxResponsibility(
  raw: unknown,
  fallback: TaxResponsibility = "unknown"
): TaxResponsibility {
  const text = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!text) return fallback;
  if (text === "merchant" || text === "seller" || text === "self") return "merchant";
  if (text === "platform" || text === "marketplace" || text === "facilitator") return "platform";
  return "unknown";
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

  const refunded = readAmount(source.refundedAmount);

  // An order with invoice lines is worth what its lines say. Without lines the
  // sale is measured from the money, and that is where a refund used to be
  // counted twice: every writer of `refundedAmount` also lowers `paidAmount` by
  // the same money, so the sale shrank by the refund and then the profit line
  // subtracted it again — a £1,000 sale refunded £200 came out £200 short.
  // Adding it back restores what the sale was WORTH, which is what a line-item
  // order already reports and what the single subtraction below then takes off
  // exactly once.
  const revenue = items.count > 0
    ? items.total
    : readAmount(source.paidAmount) + readAmount(source.remainingAmount) + receivables.total + refunded;

  const directCost = readAmount(source.watchPurchasePrice);
  const otherExpenses = expenses.total;
  const deliveryCost = readAmount(source.deliveryCost);

  const grossMargin = revenue - directCost;
  // What the sale actually cost to take, when the shop told us. The percentage
  // is a stand-in for a number only the platform knows; where a connector has
  // the real figure, using the estimate is a second, disagreeing definition of
  // the same cost. `platformFeeKnown` is what tells a real fee of zero apart
  // from a field nobody filled in — every existing writer of `paymentFee` puts
  // the estimate there, so a number alone proves nothing.
  const platformFee = source.platformFeeKnown === true
    ? round2(Math.abs(readAmount(source.paymentFee)))
    : round2((revenue * settings.feePercentage) / 100);

  const method = resolveVatMethod(source, settings, paymentDateMs);
  const storedRate = Object.prototype.hasOwnProperty.call(source, "taxRate") && source.taxRate !== null && source.taxRate !== ""
    ? readPercentage(source.taxRate, settings.defaultTaxRate)
    : settings.defaultTaxRate;
  // A channel order carries `taxRate: 0` as a placeholder, not as an answer:
  // no shop API returns a rate, so the mappers write zero and send the real
  // figure in `taxAmount` instead. Once the amount is known that zero holds no
  // information, and reading it as "zero-rated" would zero the margin scheme's
  // VAT too — a calculation no shop can do for us.
  const rate = source.taxAmountKnown === true && storedRate === 0 ? settings.defaultTaxRate : storedRate;

  let vatBase = 0;
  if (method === "standard") vatBase = revenue;
  else if (method === "margin") vatBase = Math.max(grossMargin, 0);

  // The tax the shop itself charged, when it told us. Every channel mapper
  // writes `taxRate: 0` because no shop API returns a rate, and the gate below
  // is on the rate — so a Shopify, WooCommerce, Etsy, Square or website sale
  // reported no VAT at all while `taxAmount` held the real figure the customer
  // paid. Re-deriving a rate from the amount would be worse than useless on a
  // mixed basket, so a known amount is simply used as the amount.
  // `taxAmountKnown` tells a shop that said "no tax" apart from a field nobody
  // filled in — the same distinction `platformFeeKnown` makes for the fee.
  const taxAmountKnown = source.taxAmountKnown === true;
  const knownTaxAmount = taxAmountKnown ? Math.abs(readAmount(source.taxAmount)) : 0;
  const taxResponsibility: TaxResponsibility = taxAmountKnown
    ? normalizeTaxResponsibility(source.taxResponsibility)
    : "merchant";

  // Whether the tax sits inside the price or is added to it. A shop knows this
  // per order and says so; without a shop's answer the workspace's own setting
  // stands, which is how every order behaved before.
  const taxInsidePrice = taxAmountKnown && typeof source.taxIncludedInPrice === "boolean"
    ? source.taxIncludedInPrice
    : settings.pricesIncludeVat;

  // Tax a marketplace collected and remits itself is real money the customer
  // paid, so it belongs on the order — but it is not the studio's to declare,
  // so it is reported beside VAT due rather than inside it. An unknown
  // responsibility is treated the same way and flagged, because guessing wrong
  // overstates a VAT return in one direction or understates it in the other and
  // neither is recoverable from the number alone.
  const merchantOwnsTax = taxResponsibility === "merchant";
  const platformCollectedTax = taxAmountKnown && !merchantOwnsTax ? round2(knownTaxAmount) : 0;
  const taxNeedsReview = taxAmountKnown && taxResponsibility === "unknown";

  let vatDue = 0;
  if (settings.vatRegistered && method !== "none") {
    if (taxAmountKnown) {
      // The shop's own figure, never re-derived. Only the studio's own share of
      // it reaches VAT due; the margin scheme is a NivaDesk-side calculation
      // that a shop knows nothing about, so a known amount does not apply there.
      if (merchantOwnsTax && method === "standard") vatDue = round2(knownTaxAmount);
      else if (merchantOwnsTax && vatBase > 0 && rate > 0) {
        vatDue = taxInsidePrice
          ? round2((vatBase * rate) / (100 + rate))
          : round2((vatBase * rate) / 100);
      }
    } else if (rate > 0 && vatBase > 0) {
      vatDue = settings.pricesIncludeVat
        ? round2((vatBase * rate) / (100 + rate))
        : round2((vatBase * rate) / 100);
    }
  }

  const netProfit = revenue - vatDue - directCost - platformFee - deliveryCost - otherExpenses - refunded;

  return {
    engineVersion: FINANCE_ENGINE_VERSION,
    method,
    taxRate: rate,
    pricesIncludeVat: settings.pricesIncludeVat,
    vatRegistered: settings.vatRegistered,
    // Where the tax figure came from and whose it is, so a screen can say
    // "Platform collected tax" rather than showing a VAT total that quietly
    // disagrees with what the customer paid.
    taxAmountKnown,
    taxResponsibility,
    taxIncludedInPrice: taxInsidePrice,
    platformCollectedTax,
    taxNeedsReview,

    revenue: round2(revenue),
    receivablesTotal: round2(receivables.total),
    directCost: round2(directCost),
    grossMargin: round2(grossMargin),
    platformFee,
    platformFeeKnown: source.platformFeeKnown === true,
    deliveryCost: round2(deliveryCost),
    otherExpenses: round2(otherExpenses),
    refunded: round2(refunded),
    vatBase: round2(vatBase),
    vatDue,
    netProfit: round2(netProfit),
    // What the customer is asked to pay. Identical to revenue when the price
    // already includes the tax. Tax the marketplace collected is money the
    // customer paid too, so it counts here even though it never reaches the
    // studio's VAT return.
    customerTotal: round2(taxInsidePrice ? revenue : revenue + vatDue + platformCollectedTax),

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

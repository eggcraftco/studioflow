"use strict";

// The one definition of what an order is worth.
//
// Before this module there were five: the web toolbar's margin, the web
// Dashboard's net profit, Swift's `netKar`, Swift's `OrderProfit`, and Android's
// `StudioModels.netProfit` — and they disagreed by hundreds of pounds on the
// same order. Custom receivables were totalled by four different rules, the
// server clamped negative amounts to zero where every client kept them, and
// hiding the Base Cost in the card settings quietly removed it from the profit.
//
// Specification: docs/finance-engine.md. Product decision:
// NivaDesk_Urun_Kararlari_20260903.md §2. Survey of what the old code did:
// docs/finance-engine-findings.md.
//
// Pure by design: no Firestore, no clock, no locale. Everything it needs
// arrives as an argument, so the golden vectors in test/finance/vectors.json
// pin it exactly and each platform's mirror can be held to the same numbers.

const ENGINE_VERSION = 1;

const REMAINING_PREFIX = "financialRemaining::";
const EXPENSE_PREFIX = "financialExpense::";

// --------------------------------------------------------------------------
// Reading a stored amount
// --------------------------------------------------------------------------

/**
 * Reads a money value at full precision, keeping its sign.
 *
 * Our own clients write `String(someDouble)` — a dot decimal, never grouped —
 * so that shape is taken at face value. Anything else came from a text field on
 * a platform we no longer control the history of, and gets the same
 * last-separator-wins reading the clients use: "1,234.56" and "1.234,56" are
 * both 1234.56, and "12,50" is 12.5.
 *
 * A negative value stays negative. The old server helper turned every value at
 * or below zero into zero, so a credit line typed as -50 counted as 0 on the
 * server and as -50 on every client.
 */
function readAmount(raw) {
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
      // A thousands group is exactly three digits behind one to three that do
      // not start with a zero, so "0.750" is three quarters and "1,500" is
      // fifteen hundred.
      const grouped = after.length === 3 && before.length > 0 && before.length <= 3 && !before.startsWith("0");
      body = grouped ? before + after : `${before}.${after}`;
    }
  }

  const value = Number(body);
  if (!Number.isFinite(value)) return 0;
  return negative ? -value : value;
}

/** Two decimal places, away from zero, applied once at the output. */
function round2(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const rounded = Math.round(Math.abs(number) * 100) / 100;
  return number < 0 ? -rounded : rounded;
}

function readPercentage(raw, fallback) {
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(Math.round(number * 100) / 100, 100);
}

function readBoolean(raw, fallback) {
  return typeof raw === "boolean" ? raw : fallback;
}

// --------------------------------------------------------------------------
// The VAT method
// --------------------------------------------------------------------------

const METHOD_STANDARD = "standard";
const METHOD_MARGIN = "margin";
const METHOD_NONE = "none";

/**
 * Accepts both the new names and the two the workspace has always stored —
 * `Revenue` is the standard scheme, `Profit` is the margin scheme.
 */
function normalizeVatMethod(raw, fallback = METHOD_STANDARD) {
  const text = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!text) return fallback;
  if (text === METHOD_STANDARD || text === "revenue" || text.includes("standard")) return METHOD_STANDARD;
  if (text === METHOD_MARGIN || text === "profit" || text.includes("margin")) return METHOD_MARGIN;
  if (text === METHOD_NONE || text.includes("no vat") || text === "novat" || text === "exempt") return METHOD_NONE;
  return fallback;
}

/**
 * Normalises a workspace's financial settings into what the engine reads.
 *
 * The three settings the product decision adds — is the workspace VAT
 * registered, are its prices quoted inclusive of VAT, and which VAT method it
 * uses by default — do not exist in any workspace document yet, so each
 * defaults to today's behaviour: registered, inclusive, and whatever
 * `taxCalculationType` already said.
 */
function normalizeFinanceSettings(raw = {}) {
  const settings = raw && typeof raw === "object" ? raw : {};
  return {
    feePercentage: readPercentage(settings.feePercentage, 3),
    defaultTaxRate: readPercentage(settings.defaultTaxRate, 20),
    vatRegistered: readBoolean(settings.vatRegistered, true),
    pricesIncludeVat: readBoolean(settings.pricesIncludeVat, true),
    defaultVatMethod: normalizeVatMethod(
      settings.vatMethod || settings.taxCalculationType,
      METHOD_STANDARD
    ),
    taxMilestoneEnabled: readBoolean(settings.taxMilestoneEnabled, false),
    taxMilestoneDateSeconds: Number.isFinite(Number(settings.taxMilestoneDate))
      ? Number(settings.taxMilestoneDate)
      : 0
  };
}

/**
 * The method for one order: its own override wins; otherwise the workspace
 * default, except that a workspace with a tax milestone switches method on that
 * date — before it the margin scheme, on and after it the standard one. That is
 * the rule `financialTaxTypeForPaymentDate` has always applied, kept as it was.
 */
function resolveVatMethod(order, settings, paymentDateMs) {
  const own = normalizeVatMethod(order && order.taxType, "");
  if (own) return own;
  if (settings.taxMilestoneEnabled && Number.isFinite(paymentDateMs)) {
    return paymentDateMs / 1000 >= settings.taxMilestoneDateSeconds ? METHOD_STANDARD : METHOD_MARGIN;
  }
  return settings.defaultVatMethod;
}

// --------------------------------------------------------------------------
// Custom amount lines
// --------------------------------------------------------------------------

function headingTitles(raw) {
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (item && typeof item === "object" ? String(item.title || "").trim() : ""))
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Totals the custom lines stored under a prefix.
 *
 * **Every stored key counts.** The heading list decides the order and the label
 * a screen shows, never whether an amount is money. Dropping an amount whose
 * heading has since been renamed or removed would make a total quietly smaller
 * than the figures it is built from, which is how the old rules disagreed: the
 * server and Android counted every key, the web counted every key in one place
 * and only the template's titles in another, and Swift counted only the
 * template's titles. Keys with no heading are reported in `orphans` so a screen
 * can show them as unlabelled rather than lose them.
 */
function customLineTotal(customFields, prefix, headingKey) {
  const fields = customFields && typeof customFields === "object" && !Array.isArray(customFields) ? customFields : {};
  const allowed = new Set(headingTitles(fields[headingKey]));
  const lines = [];
  const orphans = [];
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

// --------------------------------------------------------------------------
// The engine
// --------------------------------------------------------------------------

function lineItemsTotal(order) {
  const items = Array.isArray(order && order.lineItems) ? order.lineItems : [];
  let total = 0;
  let count = 0;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    count += 1;
    total += readAmount(item.lineTotal);
  }
  return { total, count };
}

/**
 * Computes every money figure for one order.
 *
 * @param {object} order    the order document's fields
 * @param {object} rawSettings the workspace's financial settings
 * @param {object} [options] `paymentDateMs` for the milestone comparison and
 *                           `computedAtMs` for the stamp — passed in rather than
 *                           read from a clock so the vectors are exact.
 */
function computeOrderFinance(order = {}, rawSettings = {}, options = {}) {
  const settings = normalizeFinanceSettings(rawSettings);
  const paymentDateMs = Number.isFinite(Number(options.paymentDateMs)) ? Number(options.paymentDateMs) : NaN;

  const customFields = order.customFields && typeof order.customFields === "object" && !Array.isArray(order.customFields)
    ? order.customFields
    : {};

  const receivables = customLineTotal(customFields, REMAINING_PREFIX, "orderRemainingItemsJSON");
  const expenses = customLineTotal(customFields, EXPENSE_PREFIX, "orderExpenseItemsJSON");
  const items = lineItemsTotal(order);

  // An order that carries invoice lines is worth what its lines say — the rule
  // the invoice renderers on every platform already follow.
  const revenue = items.count > 0
    ? items.total
    : readAmount(order.paidAmount) + readAmount(order.remainingAmount) + receivables.total;

  const directCost = readAmount(order.watchPurchasePrice);
  const otherExpenses = expenses.total;
  const deliveryCost = readAmount(order.deliveryCost);
  const refunded = readAmount(order.refundedAmount);

  const grossMargin = revenue - directCost;
  const platformFee = round2((revenue * settings.feePercentage) / 100);

  const method = resolveVatMethod(order, settings, paymentDateMs);
  const rate = Object.prototype.hasOwnProperty.call(order, "taxRate") && order.taxRate !== null && order.taxRate !== ""
    ? readPercentage(order.taxRate, settings.defaultTaxRate)
    : settings.defaultTaxRate;

  // The margin scheme's base is the selling price less the purchase price and
  // nothing else. The old `Profit` type also deducted the platform fee, the
  // shipping and every custom expense, which made the VAT smaller than the
  // scheme allows.
  let vatBase = 0;
  if (method === METHOD_STANDARD) vatBase = revenue;
  else if (method === METHOD_MARGIN) vatBase = Math.max(grossMargin, 0);

  let vatDue = 0;
  if (settings.vatRegistered && method !== METHOD_NONE && rate > 0 && vatBase > 0) {
    vatDue = settings.pricesIncludeVat
      // VAT sits inside the price the customer pays: £120 at 20% is £20.
      ? round2((vatBase * rate) / (100 + rate))
      // Quoted without VAT, so it is added on top and the customer pays more.
      : round2((vatBase * rate) / 100);
  }

  const netProfit = revenue - vatDue - directCost - platformFee - deliveryCost - otherExpenses - refunded;

  return {
    engineVersion: ENGINE_VERSION,
    method,
    taxRate: rate,
    pricesIncludeVat: settings.pricesIncludeVat,
    vatRegistered: settings.vatRegistered,

    revenue: round2(revenue),
    // The receivables on their own, because a screen shows them as their own
    // row and would otherwise have to re-derive them from customFields — which
    // is how four different totalling rules grew in the first place.
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

    // What the customer is asked to pay. Identical to revenue when prices
    // already include VAT, which is every workspace today.
    customerTotal: round2(settings.pricesIncludeVat ? revenue : revenue + vatDue),

    fromLineItems: items.count > 0,
    receivableLines: receivables.lines,
    expenseLines: expenses.lines,
    // Amounts whose heading is gone. Counted in the totals, reported so a
    // screen can label them rather than a total silently disagreeing.
    orphanKeys: [...receivables.orphans.map((t) => REMAINING_PREFIX + t), ...expenses.orphans.map((t) => EXPENSE_PREFIX + t)]
  };
}

module.exports = {
  ENGINE_VERSION,
  METHOD_STANDARD,
  METHOD_MARGIN,
  METHOD_NONE,
  REMAINING_PREFIX,
  EXPENSE_PREFIX,
  readAmount,
  round2,
  normalizeVatMethod,
  normalizeFinanceSettings,
  resolveVatMethod,
  customLineTotal,
  computeOrderFinance
};

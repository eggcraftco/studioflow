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

// 2: the block gained `receivablesTotal`, so every order stamped under 1 is
// re-stamped by the sweep rather than left with a field the clients now read.
// 3: the platform's own commission beats the workspace's percentage estimate.
// 4: the tax a shop actually charged, and whose tax it is — plus the refund on
//    an order with no invoice lines stops being subtracted twice.
const ENGINE_VERSION = 4;

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

// --------------------------------------------------------------------------
// Whose tax is it
// --------------------------------------------------------------------------
//
// A shop tells us what tax it charged. It does not tell us whether that tax is
// the studio's to declare. Those are two different questions and conflating
// them gets the VAT return wrong in one direction or the other:
//
//   merchant  the studio charged it and the studio declares it. A Shopify,
//             WooCommerce or Square sale is normally this — those platforms
//             help calculate the tax, they do not remit it for you.
//   platform  the marketplace collected it and remits it itself. It belongs on
//             the order so the totals add up, and NOT in the studio's VAT due.
//   unknown   nobody has said. The engine refuses to guess in either
//             direction: the amount is shown, it is left out of VAT due, and
//             the order is marked for review.
//
// Deliberately per order, not per channel. Etsy collects and remits in some
// jurisdictions and leaves the seller responsible in others, so "it is an Etsy
// order" is not an answer. Amazon and eBay will arrive with the same split.
const TAX_MERCHANT = "merchant";
const TAX_PLATFORM = "platform";
const TAX_UNKNOWN = "unknown";

function normalizeTaxResponsibility(raw, fallback = TAX_UNKNOWN) {
  const text = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!text) return fallback;
  if (text === TAX_MERCHANT || text === "seller" || text === "self") return TAX_MERCHANT;
  if (text === TAX_PLATFORM || text === "marketplace" || text === "facilitator") return TAX_PLATFORM;
  return TAX_UNKNOWN;
}

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

  const refunded = readAmount(order.refundedAmount);

  // An order that carries invoice lines is worth what its lines say — the rule
  // the invoice renderers on every platform already follow.
  //
  // Without lines the sale is measured from the money instead, and that is
  // where a refund used to be counted twice. Linking a bank refund to an order
  // lowers `paidAmount` AND raises `refundedAmount` (functions/bankFeed.js), so
  // the sale shrank by the refund and then the profit line subtracted it again.
  // A £1,000 sale refunded £200 came out £200 short. Adding the refund back
  // here restores what the sale was WORTH — which is what an invoice-line order
  // reports, and what the single subtraction below then reduces exactly once.
  const revenue = items.count > 0
    ? items.total
    : readAmount(order.paidAmount) + readAmount(order.remainingAmount) + receivables.total + refunded;

  const directCost = readAmount(order.watchPurchasePrice);
  const otherExpenses = expenses.total;
  const deliveryCost = readAmount(order.deliveryCost);

  const grossMargin = revenue - directCost;

  // What the sale actually cost to take, when the shop told us.
  //
  // The percentage below is an estimate the workspace types in — a stand-in for
  // a number only the platform knows. Where a connector has been told the real
  // figure, the estimate is worse than useless: it is a second, disagreeing
  // definition of the same cost, and the profit lines quietly follow whichever
  // one their rail happens to read.
  //
  // `platformFeeKnown` is what separates the two. Without it there is no way to
  // tell a real fee of zero from a field nobody has filled in — and every
  // existing writer of `paymentFee` writes the percentage estimate into it, so
  // the presence of a number proves nothing.
  const platformFee = order.platformFeeKnown === true
    // Rounded here, not at the output: netProfit subtracts this number, so a
    // fee of 8.255 left at full precision here and rounded on two platforms but
    // not the other two put the four implementations a penny apart on the
    // profit — which is exactly the disagreement this module exists to end.
    ? round2(Math.abs(readAmount(order.paymentFee)))
    : round2((revenue * settings.feePercentage) / 100);

  const method = resolveVatMethod(order, settings, paymentDateMs);
  const storedRate = Object.prototype.hasOwnProperty.call(order, "taxRate") && order.taxRate !== null && order.taxRate !== ""
    ? readPercentage(order.taxRate, settings.defaultTaxRate)
    : settings.defaultTaxRate;
  // A channel order carries `taxRate: 0` as a placeholder, not as an answer:
  // no shop API returns a rate, so the mappers write zero and send the real
  // figure in `taxAmount` instead. Once the amount is known that zero has no
  // information in it, and reading it as "this sale is zero-rated" would zero
  // the margin scheme's VAT too — a calculation the shop cannot do for us and
  // which needs the workspace's own rate. So a known amount plus a zero rate
  // means the rate was never stated.
  const rate = order.taxAmountKnown === true && storedRate === 0 ? settings.defaultTaxRate : storedRate;

  // The margin scheme's base is the selling price less the purchase price and
  // nothing else. The old `Profit` type also deducted the platform fee, the
  // shipping and every custom expense, which made the VAT smaller than the
  // scheme allows.
  let vatBase = 0;
  if (method === METHOD_STANDARD) vatBase = revenue;
  else if (method === METHOD_MARGIN) vatBase = Math.max(grossMargin, 0);

  // The tax the shop itself charged, when it told us.
  //
  // Every channel mapper writes `taxRate: 0` because no shop API returns a
  // rate, and the gate below is on the rate — so a Shopify, WooCommerce, Etsy,
  // Square or website sale reported no VAT at all while `taxAmount` held the
  // real figure the customer paid. Re-deriving a rate from the amount would be
  // worse than useless on a mixed basket, so a known amount is simply used as
  // the amount. `taxAmountKnown` is what separates a shop that said "no tax"
  // from a field nobody filled in — the same distinction `platformFeeKnown`
  // makes for the commission.
  const taxAmountKnown = order.taxAmountKnown === true;
  const knownTaxAmount = taxAmountKnown ? Math.abs(readAmount(order.taxAmount)) : 0;
  const taxResponsibility = taxAmountKnown
    ? normalizeTaxResponsibility(order.taxResponsibility)
    : TAX_MERCHANT;

  // Tax a marketplace collected and remits itself. It is real money the
  // customer paid and it belongs on the order, but it is not the studio's to
  // declare, so it is reported beside VAT due rather than inside it. An
  // unknown responsibility is treated the same way and flagged, because
  // guessing wrong overstates a VAT return in one direction or understates it
  // in the other and neither is recoverable from the number alone.
  // Whether the tax sits inside the price or is added to it. A shop knows this
  // per order and says so; without a shop's answer the workspace's own setting
  // stands, which is how every order behaved before.
  const taxInsidePrice = taxAmountKnown && typeof order.taxIncludedInPrice === "boolean"
    ? order.taxIncludedInPrice
    : settings.pricesIncludeVat;

  const merchantOwnsTax = taxResponsibility === TAX_MERCHANT;
  const platformCollectedTax = taxAmountKnown && !merchantOwnsTax ? round2(knownTaxAmount) : 0;
  const taxNeedsReview = taxAmountKnown && taxResponsibility === TAX_UNKNOWN;

  let vatDue = 0;
  if (settings.vatRegistered && method !== METHOD_NONE) {
    if (taxAmountKnown) {
      // The shop's own figure, never re-derived. Only the studio's own share of
      // it reaches VAT due; the margin scheme is a NivaDesk-side calculation
      // that a shop knows nothing about, so a known amount does not apply there.
      if (merchantOwnsTax && method === METHOD_STANDARD) vatDue = round2(knownTaxAmount);
      else if (merchantOwnsTax && vatBase > 0 && rate > 0) {
        vatDue = taxInsidePrice
          ? round2((vatBase * rate) / (100 + rate))
          : round2((vatBase * rate) / 100);
      }
    } else if (rate > 0 && vatBase > 0) {
      vatDue = settings.pricesIncludeVat
        // VAT sits inside the price the customer pays: £120 at 20% is £20.
        ? round2((vatBase * rate) / (100 + rate))
        // Quoted without VAT, so it is added on top and the customer pays more.
        : round2((vatBase * rate) / 100);
    }
  }

  const netProfit = revenue - vatDue - directCost - platformFee - deliveryCost - otherExpenses - refunded;

  return {
    engineVersion: ENGINE_VERSION,
    method,
    // Whether the fee above is the platform's own figure or the workspace's
    // percentage. A screen that shows "Platform fee" needs to be able to say.
    platformFeeKnown: order.platformFeeKnown === true,
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
    // already include VAT, which is every workspace today. Tax the marketplace
    // collected is money the customer paid too, so it counts here even though
    // it never reaches the studio's VAT return.
    customerTotal: round2(taxInsidePrice ? revenue : revenue + vatDue + platformCollectedTax),

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
  TAX_MERCHANT,
  TAX_PLATFORM,
  TAX_UNKNOWN,
  normalizeTaxResponsibility,
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

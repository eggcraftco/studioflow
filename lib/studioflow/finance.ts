import type { DashboardFinanceOrder, OrderDetail, WorkspaceSettingsOverview } from "@/lib/studioflow/firestore";
import { computeOrderFinance, financeFor, type FinanceBlock } from "@/lib/studioflow/financeEngine";

// Every figure below now comes from ONE definition: the Finance Engine, which
// the server stamps onto each order as `finance`. These functions kept their
// names so the thirty-six places that call them did not have to change, but
// what they return is the engine's answer, not a local formula.
//
// Two of the definitions moved, deliberately, because the product decision
// says so (NivaDesk_Urun_Kararlari_20260903.md §2):
//
//   orderGrossMargin  is now revenue less the purchase price. It used to take
//                     the platform fee and the shipping off as well, which is
//                     not what a gross margin is.
//   baseCostTotal     is now the purchase price whatever the card settings say.
//                     It used to return zero when Base Cost was hidden, so
//                     hiding a figure quietly raised the profit.
//
// `financeFor` prefers the stamped block and falls back to the mirror for an
// order the stamping trigger has not reached yet — the sweep clears those
// within the hour, and the mirror gives the same numbers meanwhile.

/** What the engine needs from the workspace settings, from what the web has. */
function engineSettings(settings: WorkspaceSettingsOverview | null | undefined) {
  if (!settings) return {};
  return {
    feePercentage: settings.feePercentage,
    defaultTaxRate: settings.defaultTaxRate,
    taxCalculationType: settings.taxCalculationType,
    vatRegistered: settings.vatRegistered,
    pricesIncludeVat: settings.pricesIncludeVat,
    vatMethod: settings.vatMethod,
    taxMilestoneEnabled: settings.taxMilestoneEnabled,
    taxMilestoneDate: settings.taxMilestoneDate
  };
}

function blockFor(order: DashboardFinanceOrder, settings?: WorkspaceSettingsOverview | null): FinanceBlock {
  return financeFor(order, engineSettings(settings), {
    paymentDateMs: order.paymentDate instanceof Date ? order.paymentDate.getTime() : undefined
  });
}

type FinancialItem = {
  title: string;
};

export type FinancialItemWithId = {
  id: string;
  title: string;
};

type DashboardCostOptions = {
  showFee?: boolean;
  showShipping?: boolean;
  showTax?: boolean;
};

// What the toolbar strip shows. Deliberately NOT net profit: extra spending and
// tax stay in, which is why the strip says "Margin". The Dashboard's
// adjustedDashboardNetProfit is the figure that deducts them.
export function orderGrossMargin(order: DashboardFinanceOrder) {
  return blockFor(order).grossMargin;
}

// Total of the order's custom "Remaining" receivables (customFields keyed
// financialRemaining::<title>). Settings-free: when the order carries its own
// heading list only those titles count; otherwise every stored key under the
// prefix counts (covers workspace-template titles). Matches the Mac model and
// the backend calculation.
export function orderCustomRemainingTotal(order: DashboardFinanceOrder) {
  return blockFor(order).receivablesTotal;
}

// Order value: classic paid+remaining plus custom receivables — same on every platform.
// GN-12: pass the workspace settings wherever a profit from the same block sits
// beside it. Version 5 decides lines-vs-money by whether tax is inside the
// price, so without the settings the mirror's revenue (default: inside) could
// disagree with the profit under it for a workspace that adds VAT on top.
export function orderSalesTotal(order: DashboardFinanceOrder, settings?: WorkspaceSettingsOverview | null) {
  return blockFor(order, settings).revenue;
}

// Settings-free counterpart of customExpenseTotal, mirroring orderCustomRemainingTotal.
export function orderCustomExpenseTotalLocal(order: DashboardFinanceOrder) {
  return blockFor(order).otherExpenses;
}

export function decodeFinancialItems(json: string): FinancialItem[] {
  if (!json.trim()) return [];

  try {
    const decoded = JSON.parse(json) as unknown;
    if (!Array.isArray(decoded)) return [];
    return decoded
      .map(item => {
        if (!item || typeof item !== "object") return null;
        const title = (item as Record<string, unknown>).title;
        return typeof title === "string" ? { title: title.trim() } : null;
      })
      .filter((item): item is FinancialItem => item !== null && Boolean(item.title) && !isAutoFinancialPlaceholder(item.title));
  } catch {
    return [];
  }
}

// Same as decodeFinancialItems but keeps the stable id, needed so a per-order rename
// can be matched by id on the backend (which moves the keyed amount to the new title).
export function decodeFinancialItemsWithId(json: string): FinancialItemWithId[] {
  if (!json.trim()) return [];
  try {
    const decoded = JSON.parse(json) as unknown;
    if (!Array.isArray(decoded)) return [];
    return decoded
      .map(item => {
        if (!item || typeof item !== "object") return null;
        const rec = item as Record<string, unknown>;
        const title = typeof rec.title === "string" ? rec.title.trim() : "";
        if (!title || isAutoFinancialPlaceholder(title)) return null;
        const id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : title;
        return { id, title };
      })
      .filter((item): item is FinancialItemWithId => item !== null);
  } catch {
    return [];
  }
}

// Per-order spending / remaining headings: the order's own list (customFields key)
// when present, otherwise the workspace template. An explicit empty list ("[]") on the
// order means "no headings" and does NOT fall back to the template.
export function decodeOrderFinancialItems(
  order: DashboardFinanceOrder,
  key: "orderExpenseItemsJSON" | "orderRemainingItemsJSON",
  workspaceJSON: string
): FinancialItemWithId[] {
  const raw = (order.customFields[key] ?? "").trim();
  if (!raw) return decodeFinancialItemsWithId(workspaceJSON);
  return decodeFinancialItemsWithId(raw);
}

export function orderBaseCostLabel(order: DashboardFinanceOrder, workspaceLabel: string): string {
  const own = (order.customFields.orderBaseCostLabel ?? "").trim();
  return own || workspaceLabel.trim() || "Cost (Base)";
}

// String-based variant (stable primitives), for components that receive the raw
// per-order list JSON + the workspace template JSON as props.
export function decodeOrderFinancialItemsFromRaw(orderRaw: string, workspaceJSON: string): FinancialItemWithId[] {
  const raw = (orderRaw ?? "").trim();
  if (!raw) return decodeFinancialItemsWithId(workspaceJSON);
  return decodeFinancialItemsWithId(raw);
}

function isAutoFinancialPlaceholder(title: string) {
  if (title.startsWith("Cost ")) {
    const numberPart = title.slice("Cost ".length);
    return numberPart.length > 0 && /^\d+$/.test(numberPart);
  }

  if (title.startsWith("Pending ")) {
    const numberPart = title.slice("Pending ".length);
    return numberPart.length > 0 && /^\d+$/.test(numberPart);
  }

  return false;
}

function parseFinancialAmount(raw: string, selectedCurrency: string) {
  const cleaned = raw
    .replaceAll(",", "")
    .replaceAll(selectedCurrency, "")
    .trim();

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

export function customFinancialAmount(
  order: DashboardFinanceOrder,
  prefix: "financialExpense::" | "financialRemaining::",
  items: FinancialItem[],
  selectedCurrency: string
) {
  return items.reduce((total, item) => {
    const raw = order.customFields[`${prefix}${item.title}`] ?? "";
    return total + parseFinancialAmount(raw, selectedCurrency);
  }, 0);
}

export function customExpenseTotal(order: DashboardFinanceOrder, settings: WorkspaceSettingsOverview | null) {
  return blockFor(order, settings).otherExpenses;
}

export function customPendingTotal(order: DashboardFinanceOrder, settings: WorkspaceSettingsOverview | null) {
  return blockFor(order, settings).receivablesTotal;
}

export function baseCostTotal(order: DashboardFinanceOrder, settings: WorkspaceSettingsOverview | null) {
  return blockFor(order, settings).directCost;
}

export function adjustedDashboardNetProfit(order: DashboardFinanceOrder, settings: WorkspaceSettingsOverview | null) {
  return blockFor(order, settings).netProfit;
}

/**
 * The whole engine block for one order — what a screen should add up when it
 * shows the parts of Net Profit next to Net Profit.
 *
 * The Dashboard used to take the profit from the engine and its Platform Fee,
 * Shipping and VAT cards from the order's stored `paymentFee`, `deliveryCost`
 * and `taxAmount`. Those stored fields are whatever a client wrote at the time
 * (a fee worked out on a deposit, VAT on the full price of a margin-scheme sale,
 * a shop's tax that is not the studio's to declare), and refunds were deducted
 * from the profit without a row of their own. So "Revenue − the rows" did not
 * come to the profit printed under it (review N02). Every row now comes from
 * the same block the profit does.
 */
export function orderFinanceBlock(order: DashboardFinanceOrder, settings: WorkspaceSettingsOverview | null) {
  return blockFor(order, settings);
}

type OrderDetailFinanceInput = Pick<OrderDetail,
  | "paidAmount" | "remainingAmount" | "refundedAmount" | "watchPurchasePrice" | "paymentFee" | "deliveryCost"
  | "taxAmount" | "taxRate" | "taxType" | "lineItems" | "customFields" | "paymentDate"
  | "platformFeeKnown" | "taxAmountKnown" | "taxResponsibility" | "taxIncludedInPrice" | "taxRateStated">;

/**
 * GN-12 (22 Oct 2026): the order card's and the order PDF's figures, from the
 * Finance Engine — the same definition the Dashboard, the stamp, the export and
 * the Mac, iPhone and Android cards use.
 *
 * The card used to compute its own profit (paid + remaining − the stored fee −
 * the stored VAT …, no invoice lines, no refund), so one order showed +2,369.94
 * here while the Mac, reading the engine, showed −1,495.06. Computed locally
 * rather than taken from the stamp because the card is edited in place: an
 * optimistic change has to move the profit before the server's block arrives,
 * and the mirror gives the server's numbers for the same document.
 */
export function orderDetailFinance(order: OrderDetailFinanceInput, settings: WorkspaceSettingsOverview | null | undefined): FinanceBlock {
  return computeOrderFinance({
    paidAmount: order.paidAmount,
    remainingAmount: order.remainingAmount,
    refundedAmount: order.refundedAmount,
    watchPurchasePrice: order.watchPurchasePrice,
    paymentFee: order.paymentFee,
    deliveryCost: order.deliveryCost,
    platformFeeKnown: order.platformFeeKnown,
    taxAmountKnown: order.taxAmountKnown,
    taxAmount: order.taxAmount,
    taxResponsibility: order.taxResponsibility,
    taxIncludedInPrice: order.taxIncludedInPrice ?? undefined,
    // An absent rate is the workspace's default to the engine, on every platform.
    taxRate: order.taxRateStated ? order.taxRate : undefined,
    taxType: order.taxType,
    lineItems: order.lineItems,
    customFields: order.customFields
  }, engineSettings(settings), {
    paymentDateMs: order.paymentDate instanceof Date ? order.paymentDate.getTime() : undefined
  });
}

export function dashboardCostTotal(
  order: DashboardFinanceOrder,
  settings: WorkspaceSettingsOverview | null,
  options: DashboardCostOptions = {}
) {
  const { showFee = true, showShipping = true, showTax = true } = options;
  const finance = blockFor(order, settings);
  // The cost row the Dashboard draws: the purchase price and the other
  // expenses always, plus whichever of the fee, the shipping and the VAT are
  // not already shown as rows of their own.
  let total = finance.directCost + finance.otherExpenses;
  if (!showFee) total += finance.platformFee;
  if (!showShipping) total += finance.deliveryCost;
  if (!showTax) total += finance.vatDue;
  return total;
}

// ---------------------------------------------------------------------------
// GN-12 release gate (22 Oct 2026): an estimated platform fee says so.
//
// When the shop did not report its commission the engine takes the
// workspace's percentage of the revenue (`commissionEstimated`, with the rate
// in `commissionRatePercent`). Every surface that prints that fee, or a profit
// with it inside, labels it — "Platform Fee (estimate, 3%)" on one order, the
// footnote "Includes estimated platform fees" on a total.
//
// A block stamped before the two fields existed (engine 4, or an early 5
// stamp) carries only `platformFeeKnown`; the fee is the estimate exactly when
// that is not true, which is the rule the engine itself applies.

type CommissionBlock = Partial<Pick<FinanceBlock, "commissionEstimated" | "commissionRatePercent" | "platformFeeKnown" | "platformFee">>;

export const ESTIMATED_PLATFORM_FEES_FOOTNOTE = "Includes estimated platform fees";

/** Whether this block's platform fee is the workspace percentage rather than the shop's figure. */
export function commissionIsEstimated(block: CommissionBlock | null | undefined): boolean {
  if (!block) return false;
  if (typeof block.commissionEstimated === "boolean") return block.commissionEstimated;
  return block.platformFeeKnown !== true;
}

/** The percentage behind an estimated fee (the workspace's when an old stamp lacks it). */
export function commissionEstimateRate(block: CommissionBlock | null | undefined, settings?: WorkspaceSettingsOverview | null): number {
  const stamped = Number(block?.commissionRatePercent);
  if (block && typeof block.commissionRatePercent === "number" && Number.isFinite(stamped)) return stamped;
  const workspace = Number(settings?.feePercentage);
  return Number.isFinite(workspace) ? workspace : 0;
}

function formatRate(rate: number) {
  return `${Number(rate.toFixed(2))}%`;
}

/**
 * The label for one order's platform fee: `t("Platform Fee")`, followed by
 * " (estimate, 3%)" when the fee is the workspace's estimate. `t` defaults to
 * the identity so the English-only order PDF can use the same words.
 */
export function platformFeeLabel(
  block: CommissionBlock | null | undefined,
  t: (text: string) => string = (text) => text,
  settings?: WorkspaceSettingsOverview | null,
  base = "Platform Fee"
): string {
  if (!commissionIsEstimated(block)) return t(base);
  return `${t(base)} (${t("estimate")}, ${formatRate(commissionEstimateRate(block, settings))})`;
}

/**
 * What a total over many orders says about its platform fees. `footnote` is
 * true when any order in scope contributes an estimated fee above zero. The
 * total's own label carries "(estimate, 3%)" only when every fee in it is an
 * estimate at the same rate — otherwise the footnote alone tells the truth.
 */
export function estimatedFeeSummary(blocks: Array<CommissionBlock | null | undefined>, settings?: WorkspaceSettingsOverview | null) {
  let estimated = 0;
  let reported = 0;
  const rates = new Set<number>();
  for (const block of blocks) {
    if (!block || !(Number(block.platformFee) > 0)) continue;
    if (commissionIsEstimated(block)) {
      estimated += 1;
      rates.add(commissionEstimateRate(block, settings));
    } else {
      reported += 1;
    }
  }
  const uniformRate = estimated > 0 && reported === 0 && rates.size === 1 ? [...rates][0] : null;
  return { footnote: estimated > 0, estimatedCount: estimated, uniformRate };
}

/**
 * ETSY-E2E r3 (finance acceptance): orders whose profit has no cost under it — no direct cost and no other expense on
 * the engine's block (the order screen's "Estimated profit" rule). A total that holds one is an estimate too.
 */
export const COSTS_MISSING_FOOTNOTE = "Some orders have no cost entered — profit is an estimate";
export function costsMissingCount(blocks: Array<{ directCost?: number; otherExpenses?: number } | null | undefined>): number {
  let n = 0;
  for (const block of blocks) {
    if (!block) continue;
    if (!(Number(block.directCost) > 0) && !(Number(block.otherExpenses) > 0)) n += 1;
  }
  return n;
}

/** A total's fee label: "(estimate, 3%)" only when all of it is one estimate. */
export function platformFeeTotalLabel(
  summary: ReturnType<typeof estimatedFeeSummary>,
  t: (text: string) => string,
  base = "Platform Fee"
): string {
  if (summary.uniformRate === null) return t(base);
  return `${t(base)} (${t("estimate")}, ${formatRate(summary.uniformRate)})`;
}

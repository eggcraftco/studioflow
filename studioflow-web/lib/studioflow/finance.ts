import type { DashboardFinanceOrder, WorkspaceSettingsOverview } from "@/lib/studioflow/firestore";
import { financeFor, type FinanceBlock } from "@/lib/studioflow/financeEngine";

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
export function orderSalesTotal(order: DashboardFinanceOrder) {
  return blockFor(order).revenue;
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

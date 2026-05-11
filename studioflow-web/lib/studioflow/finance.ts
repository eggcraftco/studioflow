import type { DashboardFinanceOrder, WorkspaceSettingsOverview } from "@/lib/studioflow/firestore";

type FinancialItem = {
  title: string;
};

type DashboardCostOptions = {
  showFee?: boolean;
  showShipping?: boolean;
  showTax?: boolean;
};

export function swiftOrderNetProfit(order: DashboardFinanceOrder) {
  return order.paidAmount + order.remainingAmount - order.watchPurchasePrice - order.paymentFee - order.deliveryCost;
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
  if (!settings) return 0;
  return customFinancialAmount(
    order,
    "financialExpense::",
    decodeFinancialItems(settings.financialExpenseItemsJSON),
    settings.selectedCurrency
  );
}

export function customPendingTotal(order: DashboardFinanceOrder, settings: WorkspaceSettingsOverview | null) {
  if (!settings) return 0;
  return customFinancialAmount(
    order,
    "financialRemaining::",
    decodeFinancialItems(settings.financialRemainingItemsJSON),
    settings.selectedCurrency
  );
}

export function baseCostTotal(order: DashboardFinanceOrder, settings: WorkspaceSettingsOverview | null) {
  return settings?.financialShowBaseCost ?? true ? order.watchPurchasePrice : 0;
}

export function adjustedDashboardNetProfit(order: DashboardFinanceOrder, settings: WorkspaceSettingsOverview | null) {
  const salesTotal = order.paidAmount + order.remainingAmount;
  return salesTotal
    - baseCostTotal(order, settings)
    - customExpenseTotal(order, settings)
    - order.paymentFee
    - order.deliveryCost
    - order.taxAmount;
}

export function dashboardCostTotal(
  order: DashboardFinanceOrder,
  settings: WorkspaceSettingsOverview | null,
  options: DashboardCostOptions = {}
) {
  const { showFee = true, showShipping = true, showTax = true } = options;
  let total = baseCostTotal(order, settings) + customExpenseTotal(order, settings);

  if (!showFee) total += order.paymentFee;
  if (!showShipping) total += order.deliveryCost;
  if (!showTax) total += order.taxAmount;

  return total;
}

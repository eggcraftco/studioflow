import type { DashboardFinanceOrder, WorkspaceSettingsOverview } from "@/lib/studioflow/firestore";

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
  if (!settings) return 0;
  return customFinancialAmount(
    order,
    "financialExpense::",
    decodeOrderFinancialItems(order, "orderExpenseItemsJSON", settings.financialExpenseItemsJSON),
    settings.selectedCurrency
  );
}

export function customPendingTotal(order: DashboardFinanceOrder, settings: WorkspaceSettingsOverview | null) {
  if (!settings) return 0;
  return customFinancialAmount(
    order,
    "financialRemaining::",
    decodeOrderFinancialItems(order, "orderRemainingItemsJSON", settings.financialRemainingItemsJSON),
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

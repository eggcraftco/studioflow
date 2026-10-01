export type OrderSortMode = "smart" | "recent";

export type OrderQuickFilterId =
  | "all"
  | "active"
  | "waitingCustomer"
  | "inProduction"
  | "thisWeek"
  | "lateOrders"
  | "unpaidBalance"
  | "readyToShip"
  | "completed"
  | "trash";

export type FilterableOrder = {
  customerName: string;
  designName: string;
  watchRef?: string;
  status: string;
  designStatus?: string;
  priority?: string;
  risk?: string;
  riskReason?: string;
  notes?: string;
  emailAddress?: string;
  instagramUsername?: string;
  whatsappNumber?: string;
  remainingAmount?: number;
  paymentDate: Date | null;
  dueDate: Date | null;
  isDispatched?: boolean;
  isDelivered?: boolean;
  customFields?: Record<string, string>;
  extraStatuses?: Record<string, string>;
  /** The common engine's provider on an order it applied (`commerce.provider`), when the row carries it. */
  commerceProvider?: string;
  /** "inbound" on an order the public order form created (`orderSource`). */
  orderSource?: string;
};

// ---- where an order came from (1 Oct 2026, package E3) ----------------------
// Read from what the server writes, in this order: the engine's `commerce.provider`
// (eBay, Square, WooCommerce, Shopify, Etsy, Amazon once applied by it), the
// adapter's `customFields.Source` display word (the same providers, including the
// orders written before the engine stamped them), the public order form's
// `orderSource`. Anything else was added by hand.
export type OrderSourceId = "all" | "ebay" | "shopify" | "woocommerce" | "etsy" | "square" | "amazon" | "inbound" | "manual";

export const ORDER_SOURCE_FILTERS: Array<{ id: OrderSourceId; label: string }> = [
  { id: "all", label: "All sources" },
  { id: "ebay", label: "eBay" },
  { id: "shopify", label: "Shopify" },
  { id: "woocommerce", label: "WooCommerce" },
  { id: "etsy", label: "Etsy" },
  { id: "square", label: "Square" },
  { id: "amazon", label: "Amazon" },
  { id: "inbound", label: "Website" },
  { id: "manual", label: "Added by hand" }
];

const SOURCE_WORDS: Record<string, Exclude<OrderSourceId, "all">> = {
  ebay: "ebay", shopify: "shopify", woocommerce: "woocommerce", woo: "woocommerce", etsy: "etsy", square: "square", amazon: "amazon", inbound: "inbound", website: "inbound"
};

export function orderSourceOf(order: Pick<FilterableOrder, "commerceProvider" | "orderSource" | "customFields">): Exclude<OrderSourceId, "all"> {
  const candidates = [order.commerceProvider, order.customFields?.["Source"], order.orderSource];
  for (const candidate of candidates) {
    const word = String(candidate ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (word && Object.prototype.hasOwnProperty.call(SOURCE_WORDS, word)) return SOURCE_WORDS[word];
  }
  return "manual";
}

export function orderMatchesSource(order: FilterableOrder, source: OrderSourceId) {
  return source === "all" || orderSourceOf(order) === source;
}

/** The sources present in a list, in the menu's order, so the menu offers only real choices. */
export function orderSourcesPresent(orders: FilterableOrder[]): OrderSourceId[] {
  const present = new Set(orders.map(orderSourceOf));
  return ORDER_SOURCE_FILTERS.map(item => item.id).filter(id => id !== "all" && present.has(id as Exclude<OrderSourceId, "all">));
}

export function sourceFilterCount(orders: FilterableOrder[], source: OrderSourceId) {
  return orders.filter(order => orderMatchesSource(order, source)).length;
}

export const ORDER_QUICK_FILTERS: Array<{ id: OrderQuickFilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "waitingCustomer", label: "Waiting Customer" },
  { id: "inProduction", label: "In Production" },
  { id: "thisWeek", label: "This Week" },
  { id: "lateOrders", label: "Late Orders" },
  { id: "unpaidBalance", label: "Unpaid Balance" },
  { id: "readyToShip", label: "Ready to Ship" },
  { id: "completed", label: "Completed" },
  { id: "trash", label: "Trash" }
];

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  const mondayOffset = (start.getDay() + 6) % 7;
  return new Date(start.getTime() - mondayOffset * DAY_MS);
}

function orderTexts(order: FilterableOrder) {
  return [
    order.status,
    order.designStatus,
    order.priority,
    order.risk,
    order.riskReason,
    order.notes,
    order.designName,
    order.watchRef,
    order.emailAddress,
    order.instagramUsername,
    order.whatsappNumber,
    ...Object.keys(order.extraStatuses ?? {}),
    ...Object.values(order.extraStatuses ?? {}),
    ...Object.keys(order.customFields ?? {}),
    ...Object.values(order.customFields ?? {})
  ].map(value => String(value ?? "").trim().toLowerCase()).filter(Boolean);
}

function primaryStatus(order: FilterableOrder) {
  return order.status.trim().toLowerCase();
}

export function orderIsCancelled(order: FilterableOrder) {
  const status = primaryStatus(order);
  return status === "cancel" ||
    status === "cancelled" ||
    status === "canceled" ||
    status === "refunded" ||
    status.includes("cancelled") ||
    status.includes("canceled") ||
    status.includes("cancel order") ||
    status.includes("order cancelled") ||
    status.includes("order canceled") ||
    status.includes("refunded");
}

export function orderIsCompleted(order: FilterableOrder) {
  if (order.isDelivered) return true;
  const status = primaryStatus(order);
  return status === "done" ||
    status === "completed" ||
    status === "delivered" ||
    status.includes("complete") ||
    status.includes("delivered");
}

export function orderIsClosed(order: FilterableOrder) {
  return orderIsCompleted(order) || orderIsCancelled(order);
}

export function orderDaysUntilDue(order: FilterableOrder) {
  if (!order.dueDate) return 0;
  return Math.round((startOfDay(order.dueDate).getTime() - startOfDay(new Date()).getTime()) / DAY_MS);
}

export function orderIsLate(order: FilterableOrder) {
  return !orderIsClosed(order) && !order.isDispatched && orderDaysUntilDue(order) < 0;
}

function orderIsDueThisWeek(order: FilterableOrder) {
  if (orderIsClosed(order) || !order.dueDate) return false;
  const start = startOfWeek(new Date());
  const end = new Date(start.getTime() + 7 * DAY_MS);
  const due = startOfDay(order.dueDate);
  return due.getTime() >= start.getTime() && due.getTime() < end.getTime();
}

function orderNeedsCustomerReply(order: FilterableOrder) {
  return orderTexts(order).some(text =>
    text.includes("waiting for customer") ||
    text.includes("customer waiting") ||
    text.includes("needs reply") ||
    text.includes("reply needed") ||
    text.includes("waiting for approval") ||
    text.includes("client approval") ||
    text.includes("customer approval")
  );
}

function orderIsReadyToShip(order: FilterableOrder) {
  if (orderIsClosed(order) || order.isDispatched) return false;
  const readyTerms = [
    "ready to ship",
    "ready for shipping",
    "ready for pickup",
    "ready for collection",
    "delivery ready",
    "packed",
    "packaging ready",
    "box ready"
  ];
  return orderTexts(order).some(text => readyTerms.some(term => text.includes(term)));
}

function orderIsInProduction(order: FilterableOrder) {
  if (orderIsClosed(order) || orderNeedsCustomerReply(order) || orderIsReadyToShip(order)) return false;
  const productionTerms = [
    "in progress",
    "painting",
    "production",
    "making",
    "sourcing",
    "quality check",
    "ready for review",
    "revision needed",
    "repair",
    "testing",
    "preparation",
    "draft",
    "revision",
    "editing",
    "sewing",
    "casting",
    "polishing"
  ];
  return orderTexts(order).some(text => productionTerms.some(term => text.includes(term)));
}

function orderIsActiveForSmartSorting(order: FilterableOrder) {
  return !orderIsClosed(order) && !order.isDispatched;
}

export function orderMatchesQuickFilter(order: FilterableOrder, filter: OrderQuickFilterId) {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return !orderIsClosed(order);
    case "waitingCustomer":
      return orderNeedsCustomerReply(order);
    case "inProduction":
      return orderIsInProduction(order);
    case "thisWeek":
      return orderIsDueThisWeek(order);
    case "lateOrders":
      return orderIsLate(order);
    case "unpaidBalance":
      return (order.remainingAmount ?? 0) > 0.009 ||
        orderTexts(order).some(text => text.includes("waiting for payment") || text.includes("waiting for deposit") || text.includes("awaiting payment"));
    case "readyToShip":
      return orderIsReadyToShip(order);
    case "completed":
      return orderIsCompleted(order);
    case "trash":
      return true;
  }
}

export function orderMatchesSearch(order: FilterableOrder, query: string) {
  const cleaned = query.trim().toLowerCase();
  if (!cleaned) return true;
  return [
    order.customerName,
    order.designName,
    order.watchRef,
    order.emailAddress,
    order.instagramUsername,
    order.whatsappNumber,
    order.status,
    order.designStatus
  ].some(value => String(value ?? "").toLowerCase().includes(cleaned));
}

export function sortOrdersForMode<T extends FilterableOrder>(orders: T[], sortMode: OrderSortMode) {
  return [...orders].sort((left, right) => {
    if (sortMode === "smart") {
      const leftBucket = orderIsActiveForSmartSorting(left) ? 0 : 1;
      const rightBucket = orderIsActiveForSmartSorting(right) ? 0 : 1;
      if (leftBucket !== rightBucket) return leftBucket - rightBucket;
      if (leftBucket === 0) {
        const leftDays = orderDaysUntilDue(left);
        const rightDays = orderDaysUntilDue(right);
        if (leftDays !== rightDays) return leftDays - rightDays;
      }
    }

    return (right.paymentDate?.getTime() ?? 0) - (left.paymentDate?.getTime() ?? 0);
  });
}

export function filterAndSortOrders<T extends FilterableOrder>(
  orders: T[],
  query: string,
  filter: OrderQuickFilterId,
  sortMode: OrderSortMode,
  source: OrderSourceId = "all"
) {
  return sortOrdersForMode(
    orders.filter(order => orderMatchesSearch(order, query)).filter(order => orderMatchesQuickFilter(order, filter)).filter(order => orderMatchesSource(order, source)),
    sortMode
  );
}

export function quickFilterCount(orders: FilterableOrder[], filter: OrderQuickFilterId) {
  return orders.filter(order => orderMatchesQuickFilter(order, filter)).length;
}

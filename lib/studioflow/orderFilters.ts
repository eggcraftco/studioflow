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
  /** The document id and project number break ties on equal dates (GN-11, orderListView.ts). */
  id?: string;
  projectNumber?: number;
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
  /** True when the order carries Etsy's own copy (`etsySource`); a list row keeps only whether it is there. */
  hasEtsySource?: boolean;
  /** The WooCommerce store the order came from (wooStoreFieldsFrom): its host, "" when the order records none. */
  wooStoreKey?: string;
  /** The name the server gave that store on this order (`commerce.connectionDisplayName`, `wooStore.name`). */
  wooStoreName?: string;
};

// ---- where an order came from (1 Oct 2026, package E3) ----------------------
// Read from what the server writes, in this order: the engine's `commerce.provider`
// (eBay, Square, WooCommerce, Shopify, Etsy, Amazon once applied by it), the
// adapter's `customFields.Source` display word (the same providers, including the
// orders written before the engine stamped them), the public order form's
// `orderSource`. Anything else was added by hand.
//
// UX-010 / UX-006 (27 Oct 2026): the same resolver now also decides the platform
// chip on every order row, so two more rungs catch the orders the first three miss:
// Etsy's own copy on the order (`etsySource` — the Etsy importer writes no stamp)
// and the importers' deterministic document ids (`shopify_…`, `woo_…`, `etsy_…`,
// `ebay_…`, `square_…`, `amazon_…`, `inbound_…`), which survive a cleared Source
// field. A random id (manual, assistant, repair, backup restore) matches none.
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

/** The importers' document-id prefixes (server: orderDocRef / etsy.js / wooConnector / …), checked last. */
const ORDER_ID_PREFIXES: ReadonlyArray<readonly [string, Exclude<OrderSourceId, "all" | "manual">]> = [
  ["shopify_", "shopify"],
  ["woo_", "woocommerce"],
  ["etsy_", "etsy"],
  ["ebay_", "ebay"],
  ["square_", "square"],
  ["amazon_", "amazon"],
  ["inbound_", "inbound"]
];

/** What the resolver reads: a list row, an order detail or a raw document all fit (every field optional). */
export type OrderSourceInput = Pick<FilterableOrder, "id" | "commerceProvider" | "orderSource" | "customFields" | "hasEtsySource"> & {
  /** Etsy's own copy, when the caller holds the document; only its presence is read. */
  etsySource?: unknown;
};

export function orderSourceOf(order: OrderSourceInput): Exclude<OrderSourceId, "all"> {
  const candidates = [order.commerceProvider, order.customFields?.["Source"], order.orderSource];
  for (const candidate of candidates) {
    const word = String(candidate ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (word && Object.prototype.hasOwnProperty.call(SOURCE_WORDS, word)) return SOURCE_WORDS[word];
  }
  if (order.hasEtsySource === true || (order.etsySource !== null && typeof order.etsySource === "object" && !Array.isArray(order.etsySource))) {
    return "etsy";
  }
  const id = String(order.id ?? "");
  for (const [prefix, source] of ORDER_ID_PREFIXES) {
    if (id.startsWith(prefix)) return source;
  }
  return "manual";
}

/**
 * A platform's full name, or "" for an order added by hand (no monogram): the monogram's tooltip and
 * accessible name, and the order page's channel strip. Provider names are proper nouns and stay as
 * written in every language; "Website" goes through the same table the Source filter uses (`t` is the
 * caller's studioT).
 */
export function orderSourceChipLabel(source: OrderSourceId, t: (text: string) => string = text => text): string {
  if (source === "all" || source === "manual") return "";
  const label = ORDER_SOURCE_FILTERS.find(item => item.id === source)?.label ?? "";
  return source === "inbound" ? t(label) : label;
}

/** A platform the order can come from (every source but "all" and "manual"): the ones that get a monogram. */
export type OrderPlatformId = Exclude<OrderSourceId, "all" | "manual">;

// ---- one choice per WooCommerce store (WOO-STORES, 2 Nov 2026) ---------------
// Owner: TickToon's and EGGcraft's orders should be told apart from the button at the top of the list. One
// workspace can hold several WooCommerce stores (EGGcraft: eggcraft.co.uk and ticktoon.co.uk), and every Woo
// order fell under the one "WooCommerce" choice. The store is read from what the server writes: the engine's
// `commerce.connectionId` (`<companyId>__<host>`, wooConnector.js connectionDocId), else the `wooStore` map the
// locked backfill tool writes on an order the retired legacy webhook wrote without a stamp, else nothing — the
// store is unknown. The list splits only when it holds two or more stores; one store stays the one WooCommerce
// choice it always was, and no other source changes. Mirrored in EGGcraft/EbayScreens.swift and Android
// OrderSource.kt (the spec: side-session notes woo-store-chips-SPEC-2026-11-02.md).

/** One WooCommerce store as a Source choice: `woocommerce:<host>`; `woocommerce:` is "store unknown". */
export type WooStoreSourceId = `woocommerce:${string}`;
/** What the Source filter holds: a platform (or all), or one WooCommerce store. */
export type OrderSourceChoiceId = OrderSourceId | WooStoreSourceId;

const WOO_STORE_PREFIX = "woocommerce:";
/** The "store unknown" row's full name; "Store unknown" is its bar word (platformBarTranslations.ts). */
export const WOO_STORE_UNKNOWN_LABEL = "WooCommerce (store unknown)";

export function isWooStoreSourceId(value: unknown): value is WooStoreSourceId {
  return typeof value === "string" && value.startsWith(WOO_STORE_PREFIX);
}

/** The store key a choice id names, or null for a platform choice. */
export function wooStoreKeyOfChoice(choice: OrderSourceChoiceId): string | null {
  return isWooStoreSourceId(choice) ? normalizeWooStoreKey(choice.slice(WOO_STORE_PREFIX.length)) : null;
}

function normalizeWooStoreKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/^www\./, "");
}

/** The host a connection id ends in: the text after its last "__" (the whole id when it has none). */
export function wooStoreKeyFromConnectionId(connectionId: unknown): string {
  const id = String(connectionId ?? "").trim();
  const at = id.lastIndexOf("__");
  return normalizeWooStoreKey(at >= 0 ? id.slice(at + 2) : id);
}

const asMap = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/**
 * The store fields of a list row, read from the order document already in hand: the engine's stamp first (a
 * WooCommerce stamp's connection), then the backfill's `wooStore`. Empty for every other provider's order.
 */
export function wooStoreFieldsFrom(data: { commerce?: unknown; wooStore?: unknown }): { wooStoreKey: string; wooStoreName: string } {
  const stamp = asMap(data.commerce);
  if (stamp && String(stamp.provider ?? "").trim().toLowerCase() === "woocommerce") {
    const key = wooStoreKeyFromConnectionId(stamp.connectionId);
    if (key) return { wooStoreKey: key, wooStoreName: String(stamp.connectionDisplayName ?? "").trim() };
  }
  const backfill = asMap(data.wooStore);
  const key = backfill ? normalizeWooStoreKey(backfill.host) : "";
  return key ? { wooStoreKey: key, wooStoreName: String(backfill?.name ?? "").trim() } : { wooStoreKey: "", wooStoreName: "" };
}

/** The store of a WooCommerce order ("" = unknown); null for an order from anywhere else. */
export function wooStoreKeyOf(order: FilterableOrder): string | null {
  return orderSourceOf(order) === "woocommerce" ? normalizeWooStoreKey(order.wooStoreKey) : null;
}

/** A store name the server gave, unless it is only an address (the server falls back to the site URL). */
function usableWooStoreName(name: unknown, key: string): string {
  const text = String(name ?? "").trim();
  if (!text || text.includes("://") || text.includes("/") || normalizeWooStoreKey(text) === key) return "";
  return text;
}

const compareLabels = (left: string, right: string) => {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a < b ? -1 : a > b ? 1 : left < right ? -1 : left > right ? 1 : 0;
};

/**
 * Each recorded store's label in this list: the name its orders carry most often (a tie: the one that sorts
 * first), else its host. Two stores with the same label each get their host after it.
 */
export function wooStoreLabels(orders: FilterableOrder[]): Map<string, string> {
  const tallies = new Map<string, Map<string, number>>();
  for (const order of orders) {
    const key = wooStoreKeyOf(order);
    if (!key) continue;
    const names = tallies.get(key) ?? new Map<string, number>();
    tallies.set(key, names);
    const name = usableWooStoreName(order.wooStoreName, key);
    if (name) names.set(name, (names.get(name) ?? 0) + 1);
  }
  const labels = new Map<string, string>();
  for (const [key, names] of tallies) {
    const best = [...names.entries()].sort((left, right) => right[1] - left[1] || compareLabels(left[0], right[0]))[0];
    labels.set(key, best ? best[0] : key);
  }
  const taken = new Map<string, number>();
  for (const label of labels.values()) taken.set(label.toLowerCase(), (taken.get(label.toLowerCase()) ?? 0) + 1);
  for (const [key, label] of labels) if ((taken.get(label.toLowerCase()) ?? 0) > 1) labels.set(key, `${label} (${key})`);
  return labels;
}

/**
 * The store rows that replace the one WooCommerce row: every recorded store by label, then "store unknown" when
 * some Woo order records none. Empty — WooCommerce stays one choice — while the list holds fewer than two stores.
 */
export function wooStoresPresent(orders: FilterableOrder[]): Array<{ key: string; label: string }> {
  const labels = wooStoreLabels(orders);
  if (labels.size < 2) return [];
  const stores = [...labels.entries()].map(([key, label]) => ({ key, label })).sort((left, right) => compareLabels(left.label, right.label) || compareLabels(left.key, right.key));
  return orders.some(order => wooStoreKeyOf(order) === "") ? [...stores, { key: "", label: WOO_STORE_UNKNOWN_LABEL }] : stores;
}

/**
 * UX-010 / UX-006 (28 Oct 2026): each platform's monogram — OUR OWN letters in the platform's palette
 * colour (app/globals.css --order-source-<token>-rgb), never a third-party logo (eBay and Amazon license
 * logo use in writing, Shopify only under strict rules, Etsy asks for a trademark notice). The public order
 * form gets a globe we draw (components/OrderSourceMonogram.tsx), not a brand mark; "WEB" is its letters
 * where a glyph cannot be drawn. An order added by hand has no monogram. The full name (orderSourceChipLabel)
 * always rides along as the tooltip and the accessible name. One table, read by the order row, the Production
 * board card and the quick platform bar.
 */
export const ORDER_SOURCE_MONOGRAMS: Readonly<Record<OrderPlatformId, { letters: string; glyph?: "globe" }>> = {
  shopify: { letters: "SH" },
  woocommerce: { letters: "WC" },
  etsy: { letters: "ET" },
  ebay: { letters: "EB" },
  square: { letters: "SQ" },
  amazon: { letters: "AM" },
  inbound: { letters: "WEB", glyph: "globe" }
};

export function isOrderPlatform(source: OrderSourceChoiceId): source is OrderPlatformId {
  return Object.prototype.hasOwnProperty.call(ORDER_SOURCE_MONOGRAMS, source);
}

export function orderMatchesSource(order: FilterableOrder, source: OrderSourceChoiceId) {
  if (source === "all") return true;
  const store = wooStoreKeyOfChoice(source);
  return store === null ? orderSourceOf(order) === source : wooStoreKeyOf(order) === store;
}

/**
 * One row of the Source choice. A WooCommerce store's row carries `wooStoreKey` ("" for "store unknown"): its
 * label is the store's own name, never translated — every other label is an English key the screen translates.
 */
export type OrderSourceChoice = { id: OrderSourceChoiceId; label: string; count: number; wooStoreKey?: string };

/**
 * The source choices of one order list, read by BOTH the quick platform bar at the top of the list and the
 * Source rows inside Order Filters: the two always offer the same sources with the same counts and act on the
 * page's one `source` state. "All sources" first, then every source the list really has (in the menu's order),
 * plus the chosen one even when the list no longer has it (so it can be cleared). Each count is what picking it
 * would show within the chosen quick filter. Empty when the list has one source and none is chosen: a workspace
 * that only ever adds orders by hand sees no source choice at all. WOO-STORES: a list holding two or more
 * WooCommerce stores offers one row per store (and "store unknown") where the WooCommerce row was.
 */
export function orderSourceChoices(orders: FilterableOrder[], filter: OrderQuickFilterId, source: OrderSourceChoiceId): OrderSourceChoice[] {
  const present = orderSourcesPresent(orders);
  const stores = wooStoresPresent(orders);
  if (present.length + Math.max(stores.length - 1, 0) <= 1 && source === "all") return [];
  const inFilter = filter === "trash" ? orders : orders.filter(order => orderMatchesQuickFilter(order, filter));
  const row = (id: OrderSourceChoiceId, label: string, wooStoreKey?: string): OrderSourceChoice =>
    ({ id, label, count: sourceFilterCount(inFilter, id), ...(wooStoreKey === undefined ? {} : { wooStoreKey }) });
  const rows: OrderSourceChoice[] = [];
  for (const item of ORDER_SOURCE_FILTERS) {
    if (item.id !== "woocommerce") {
      if (item.id === "all" || present.includes(item.id) || item.id === source) rows.push(row(item.id, item.label));
      continue;
    }
    if (stores.length > 0) {
      for (const store of stores) rows.push(row(`woocommerce:${store.key}`, store.label, store.key));
      if (source === "woocommerce") rows.push(row(item.id, item.label));
    } else if (present.includes(item.id) || item.id === source) {
      rows.push(row(item.id, item.label));
    }
    const chosenStore = wooStoreKeyOfChoice(source);
    if (chosenStore !== null && !rows.some(choice => choice.wooStoreKey === chosenStore)) {
      rows.push(row(`woocommerce:${chosenStore}`, chosenStore ? wooStoreLabels(orders).get(chosenStore) ?? chosenStore : WOO_STORE_UNKNOWN_LABEL, chosenStore));
    }
  }
  return rows;
}

/** The chosen choice's name for a summary line, translated where it is an English key (a store's name is not). */
export function orderSourceChoiceName(orders: FilterableOrder[], source: OrderSourceChoiceId, t: (text: string) => string = text => text): string {
  const store = wooStoreKeyOfChoice(source);
  if (store === null) return t(ORDER_SOURCE_FILTERS.find(item => item.id === source)?.label ?? ORDER_SOURCE_FILTERS[0].label);
  return store ? wooStoreLabels(orders).get(store) ?? store : t(WOO_STORE_UNKNOWN_LABEL);
}

/** The sources present in a list, in the menu's order, so the menu offers only real choices. */
export function orderSourcesPresent(orders: FilterableOrder[]): OrderSourceId[] {
  const present = new Set(orders.map(orderSourceOf));
  return ORDER_SOURCE_FILTERS.map(item => item.id).filter(id => id !== "all" && present.has(id as Exclude<OrderSourceId, "all">));
}

export function sourceFilterCount(orders: FilterableOrder[], source: OrderSourceChoiceId) {
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
    order.designStatus,
    // ETSY-E2E (24 Oct 2026): the shop's own order number. A seller looking up Etsy receipt 3200000203 typed it
    // and got "No orders"; the number lives only in customFields ("Etsy Receipt ID", "Shopify Order Number", …).
    ...Object.entries(order.customFields || {})
      .filter(([key]) => /(receipt id|order id|order number)$/i.test(key))
      .map(([, value]) => value)
  ].some(value => String(value ?? "").toLowerCase().includes(cleaned));
}

/**
 * The tie-break every order sort ends with (GN-11): a higher project number first (the
 * newer job), then the document id. Equal dates (imports stamped in the same second,
 * orders with no date at all) used to keep whatever order the query returned them in, so
 * a reload or a live update could swap two rows and a page boundary could show one of
 * them twice and drop the other. Mirrored in EGGcraft/OrderListView.swift and Android
 * OrderListView.kt.
 */
export function compareOrdersTieBreak(
  left: { id?: string; projectNumber?: number },
  right: { id?: string; projectNumber?: number }
): number {
  const leftNumber = Number(left.projectNumber ?? 0) || 0;
  const rightNumber = Number(right.projectNumber ?? 0) || 0;
  if (leftNumber !== rightNumber) return rightNumber - leftNumber;
  const leftId = String(left.id ?? "");
  const rightId = String(right.id ?? "");
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
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

    const byDate = (right.paymentDate?.getTime() ?? 0) - (left.paymentDate?.getTime() ?? 0);
    return byDate !== 0 ? byDate : compareOrdersTieBreak(left, right);
  });
}

export function filterAndSortOrders<T extends FilterableOrder>(
  orders: T[],
  query: string,
  filter: OrderQuickFilterId,
  sortMode: OrderSortMode,
  source: OrderSourceChoiceId = "all"
) {
  return sortOrdersForMode(
    orders.filter(order => orderMatchesSearch(order, query)).filter(order => orderMatchesQuickFilter(order, filter)).filter(order => orderMatchesSource(order, source)),
    sortMode
  );
}

export function quickFilterCount(orders: FilterableOrder[], filter: OrderQuickFilterId) {
  return orders.filter(order => orderMatchesQuickFilter(order, filter)).length;
}

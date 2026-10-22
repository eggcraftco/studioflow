// Sales, Faz 1 — the client half of three read-only callables.
//
// Everything here is a read. There is no create-sale, no product write, no
// stock, payment or listing call, and none is imported from anywhere else:
// what the screen can do is what this file exposes.
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export type SalesCapability = {
  ok: boolean;
  companyId: string;
  pilotEnabled: boolean;
  visibility: string;
  canOpenSales: boolean;
  showInMenu: boolean;
  canSeeMoney: boolean;
  scope: "assigned" | "workspace";
  reason: "flag_off" | "no_access" | "workspace_off" | "ok";
  // Owner or admin (functions/sales/capability.js) — the only people
  // setSalesVisibility accepts. Optional so an older answer still type-checks.
  canManageVisibility?: boolean;
};

export type SalesRow = {
  orderId: string;
  kind: string;
  classificationSource: string;
  channel: string;
  externalOrderId: string;
  customerLabel: string;
  customerLabelWithheld: boolean;
  summary: string;
  itemCount: number;
  paymentState: string;
  deliveryState: string;
  workRequired: boolean;
  customerOwnedItem: boolean;
  cancelled: boolean;
  countsAsActiveOrder: boolean;
  needsAttention: boolean;
  attentionReasons: string[];
  orderDateMs: number;
  createdAtMs: number;
  financeState: "missing" | "stale" | "current";
  revenue: number | null;
  currency: string | null;
  // MC-2 — present on servers from 22 Oct 2026; optional so an older server still type-checks.
  storeKey?: string;
  storeName?: string;
  storeOrdinal?: number;
  brandId?: string;
  brandName?: string;
  brandState?: "none" | "store" | "override" | "ambiguous";
};

export type SalesCursor = { ms: number; id: string } | null;

export type SalesRowsPage = {
  ok: boolean;
  companyId: string;
  enabled: boolean;
  reason: string;
  rows: SalesRow[];
  nextCursor: SalesCursor;
  hasMore: boolean;
  financeVisible: boolean;
  scope: "assigned" | "workspace";
  scanned: number;
  queryPath: "workspace" | "assigned_indexed" | "assigned_fallback" | "none";
  brandsExist?: boolean;
};

export type SalesProduct = { productId: string; name: string; sku: string; linkedItemId: string; channel: string };
export type SalesProductsPage = { ok: boolean; companyId: string; enabled: boolean; reason: string; products: SalesProduct[]; catalogExists: boolean };

export type SalesChannel = { id: string; connected: boolean; connectionCount: number; unavailable: boolean };
export type SalesStore = {
  storeKey: string;
  provider: string;
  nickname: string;
  name: string;
  address: string;          // owner/admin only; empty for everybody else
  status: "connected" | "needs_attention" | "disconnected";
  errorCode: string;
  lastSyncAtMs: number;
  ordinal: number;
};
export type SalesBrand = { brandId: string; name: string; color: string; storeKeys: string[] };
export type SalesChannelsPage = {
  ok: boolean; companyId: string; enabled: boolean; reason: string; channels: SalesChannel[];
  stores?: SalesStore[]; brands?: SalesBrand[]; canManage?: boolean;
};

export type SalesRowsRequest = {
  companyId: string;
  limit?: number;
  cursor?: SalesCursor;
  channel?: string;
  includeBespoke?: boolean;
  needsAttentionOnly?: boolean;
  storeKey?: string;
  brandId?: string;          // a brand id, or "unassigned"
};

export async function fetchSalesCapability(companyId: string): Promise<SalesCapability> {
  const call = httpsCallable<{ companyId: string }, SalesCapability>(functions, "getSalesCapability");
  return (await call({ companyId })).data;
}

/**
 * S-2 (23 Oct 2026): the workspace's menu preference. The live callable
 * (setSalesVisibility, functions/sales/index.js) takes `{ companyId, visible }`
 * with `visible` a real boolean and answers `{ ok, companyId, visibility }`
 * ("on" | "off"). It refuses with failed-precondition when the workspace is not
 * in the Sales pilot and permission-denied for anybody but the owner or an
 * admin. Hiding the menu entry is not a lock: the page keeps its own check.
 */
export async function setSalesVisibility(companyId: string, visible: boolean) {
  const call = httpsCallable<{ companyId: string; visible: boolean }, { ok: boolean; companyId: string; visibility: string }>(functions, "setSalesVisibility");
  return (await call({ companyId, visible })).data;
}

/** Raised after the preference changes, so the menu asks the server again without a reload. */
export const SALES_VISIBILITY_CHANGED_EVENT = "studioflow-sales-visibility-changed";

export async function fetchSalesRows(request: SalesRowsRequest): Promise<SalesRowsPage> {
  const call = httpsCallable<SalesRowsRequest, SalesRowsPage>(functions, "listSalesRows");
  return (await call(request)).data;
}

export async function fetchSalesProducts(companyId: string): Promise<SalesProductsPage> {
  const call = httpsCallable<{ companyId: string }, SalesProductsPage>(functions, "listSalesProducts");
  return (await call({ companyId })).data;
}

export async function fetchSalesChannels(companyId: string): Promise<SalesChannelsPage> {
  const call = httpsCallable<{ companyId: string }, SalesChannelsPage>(functions, "listSalesChannels");
  return (await call({ companyId })).data;
}

// MC-2 writes — owner/admin only; the server refuses everybody else. They touch
// brand documents, store nicknames and the Sales side document, never an order.
export async function saveSalesBrand(input: { companyId: string; brandId?: string; name: string; color?: string; storeKeys: string[] }) {
  const call = httpsCallable<typeof input, { ok: boolean; brand: SalesBrand }>(functions, "saveSalesBrand");
  return (await call(input)).data;
}

export async function deleteSalesBrand(input: { companyId: string; brandId: string }) {
  const call = httpsCallable<typeof input, { ok: boolean }>(functions, "deleteSalesBrand");
  return (await call(input)).data;
}

export async function setSalesOrderBrand(input: { companyId: string; orderId: string; brandId: string }) {
  const call = httpsCallable<typeof input, { ok: boolean }>(functions, "setSalesOrderBrand");
  return (await call(input)).data;
}

export async function setSalesStoreNickname(input: { companyId: string; storeKey: string; nickname: string }) {
  const call = httpsCallable<typeof input, { ok: boolean }>(functions, "setSalesStoreNickname");
  return (await call(input)).data;
}

/**
 * How a store is named on screen: the server's name (nickname or the shop's own),
 * else "<Provider> · Store N". `t` is the caller's translator — every word that is
 * not a proper name goes through it (the "Added by hand" lesson).
 */
export function salesStoreLabel(store: { provider: string; name?: string; ordinal?: number }, t: (text: string) => string) {
  const provider = t(salesChannelName(store.provider));
  if (store.name) return `${provider} · ${store.name}`;
  return store.ordinal ? `${provider} · ${t("Store")} ${store.ordinal}` : provider;
}

/** The order this row came from, opened where Orders opens it — the same id, the same screen. */
export const salesOrderHref = (orderId: string) => `/orders?selectedOrderId=${encodeURIComponent(orderId)}`;

export const SALES_CHANNEL_NAMES: Record<string, string> = {
  shopify: "Shopify", etsy: "Etsy", woocommerce: "WooCommerce", square: "Square", ebay: "eBay",
  inbound: "Website", manual: "Added by hand", amazon: "Amazon"
};

export const salesChannelName = (id: string) => SALES_CHANNEL_NAMES[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : "Unknown");

/** A date the server could not resolve is 0, and 0 is not a date. */
export const salesDateLabel = (ms: number, locale: string) =>
  (Number(ms) > 0 ? new Date(Number(ms)).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "");

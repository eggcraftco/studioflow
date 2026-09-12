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
};

export type SalesProduct = { productId: string; name: string; sku: string; linkedItemId: string; channel: string };
export type SalesProductsPage = { ok: boolean; companyId: string; enabled: boolean; reason: string; products: SalesProduct[]; catalogExists: boolean };

export type SalesChannel = { id: string; connected: boolean; connectionCount: number; unavailable: boolean };
export type SalesChannelsPage = { ok: boolean; companyId: string; enabled: boolean; reason: string; channels: SalesChannel[] };

export type SalesRowsRequest = {
  companyId: string;
  limit?: number;
  cursor?: SalesCursor;
  channel?: string;
  includeBespoke?: boolean;
  needsAttentionOnly?: boolean;
};

export async function fetchSalesCapability(companyId: string): Promise<SalesCapability> {
  const call = httpsCallable<{ companyId: string }, SalesCapability>(functions, "getSalesCapability");
  return (await call({ companyId })).data;
}

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

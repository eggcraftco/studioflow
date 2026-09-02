// The WooCommerce connector's callables, typed for the settings screens.
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export type WooConnection = {
  id: string; provider: "woocommerce"; siteUrl: string; host: string; storeName: string;
  status: "pending" | "authorized" | "connected" | "needs_reconnect" | "disconnected" | string;
  permissions: string; connectedAtMs: number; lastSyncAtMs: number; lastSuccessAtMs: number; lastErrorCode: string;
  webhooks: { topic: string; status: string }[]; webhooksHealthy: boolean; importState: string; combineInstallments: boolean;
  settings: { autoSync: boolean; importUnpaid: boolean };
};
export type WooImportPreview = {
  ok: boolean; days: number;
  summary: { total: number; paid: number; unpaid: number; cancelled: number; alreadyHere: number; truncated: boolean };
  sample: { id: string; number: string; status: string | null; total: string | null; currency: string | null; customer: string; placedAt: string | null }[];
};
export type WooImportResult = { ok: boolean; days: number; scanned: number; created: number; updated: number; merged: number; skipped: number; held: number; failed: number; truncated: boolean };
export type WooSyncResult = { ok: boolean; scanned: number; created: number; updated: number; merged: number; skipped: number; failed: number; truncated: boolean; complete: boolean; webhooksHealthy: boolean };

const call = <TIn, TOut>(name: string) => httpsCallable<TIn, TOut>(functions, name);

export async function beginWooConnect(companyId: string, siteUrl: string) {
  return (await call<{ companyId: string; siteUrl: string }, { ok: boolean; state: string; siteUrl: string; authorizeUrl: string }>("beginWooConnect")({ companyId, siteUrl })).data;
}
export async function finishWooConnect(companyId: string, state: string) {
  return (await call<{ companyId: string; state: string }, { ok: boolean; status: string; message?: string; connection?: WooConnection }>("finishWooConnect")({ companyId, state })).data;
}
export async function getWooConnections(companyId: string): Promise<WooConnection[]> {
  return (await call<{ companyId: string }, { ok: boolean; connections: WooConnection[] }>("getWooConnections")({ companyId })).data.connections ?? [];
}
export async function disconnectWooShop(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, { ok: boolean; webhooksRemoved: number }>("disconnectWooShop")({ companyId, connectionId })).data;
}
export async function syncWooNow(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, WooSyncResult>("syncWooNow")({ companyId, connectionId })).data;
}
export async function recreateWooWebhooks(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, { ok: boolean; webhooks: { topic: string; status: string }[] }>("recreateWooWebhooks")({ companyId, connectionId })).data;
}
export async function previewWooImport(companyId: string, connectionId: string, days: number) {
  return (await call<{ companyId: string; connectionId: string; days: number }, WooImportPreview>("previewWooImport")({ companyId, connectionId, days })).data;
}
export async function runWooImport(companyId: string, connectionId: string, days: number) {
  return (await call<{ companyId: string; connectionId: string; days: number }, WooImportResult>("runWooImport")({ companyId, connectionId, days })).data;
}
export type WooAuditReport = { ok: boolean; days: number; atStore: number; asOrders: number; mergedAsPayments: number; unpaidSkipped: number; cancelled: number; missing: number; truncated: boolean; missingIds: string[] };
export async function auditWooOrders(companyId: string, connectionId: string, days: number) {
  return (await call<{ companyId: string; connectionId: string; days: number }, WooAuditReport>("auditWooOrders")({ companyId, connectionId, days })).data;
}

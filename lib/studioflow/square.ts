// The Square connector's callables, typed for the settings screens. Nothing
// here ever sees a token: the browser gets an authorize URL and a state, and
// the merchant, locations and sales are read back through owner/member calls.
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export type SquareImportPolicy = "all" | "fulfillment_only" | "none";
export type SquareLocation = { id: string; name: string; status: string; selected: boolean };
export type SquareConnection = {
  id: string; provider: "square"; merchantId: string; merchantName: string; environment: string;
  status: "connected" | "reconnect_required" | "disconnected" | "pending" | string;
  scopes: string[]; locations: SquareLocation[]; selectedLocationIds: string[];
  settings: { autoSync: boolean; importPolicy: SquareImportPolicy; importSources: string[]; recordAllSales: boolean };
  connectedAtMs: number; lastSyncAtMs: number; lastSuccessAtMs: number; lastErrorCode: string; importState: string;
  apiVersion: string; tokenExpiresAtMs: number; eventsRecovery: boolean; capabilityProfile: string; unmatchedPayments?: number;
};
export type SquareImportPreview = {
  ok: boolean; days: number; importPolicy: SquareImportPolicy;
  summary: { total: number; withFulfillment: number; posOnly: number; wouldCreate: number; financeOnly: number; cancelled: number; alreadyHere: number; truncated: boolean };
  sample: { id: string; number: string; source: string; location: string; status: string | null; total: string | null; currency: string | null; customer: string; placedAt: string | null; wouldCreate: boolean }[];
};
export type SquareImportResult = { ok: boolean; days: number; scanned: number; created: number; updated: number; skipped: number; held: number; failed: number; truncated: boolean };
export type SquareSyncResult = {
  ok: boolean; scanned: number; created: number; updated: number; skipped: number; failed: number; truncated: boolean; complete: boolean; locationsHealthy: boolean;
  payments: { scanned: number; recorded: number; unmatched: number; failed: number; complete: boolean };
  events: { configured: boolean; scanned: number; applied: number; complete: boolean };
};
export type SquarePayoutRow = { id: string; externalId: string; status: string; amount: string | null; currency: string | null; locationId: string | null; arrivalDate: string | null; endToEndId: string | null; entryCount: number; totals: { gross?: string | null; fee?: string | null; net?: string | null; charges?: string | null; refunds?: string | null; adjustments?: string | null }; reconciled: boolean; bankMatch: { transactionId?: string; confidence?: string } | null; createdAt: string | null };
export type SquareAuditReport = { ok: boolean; days: number; atSquare: number; asOrders: number; financeOnly: number; missing: number; notSelected: number; truncated: boolean; missingIds: string[]; financeOnlyIds: string[] };
export type SquareUnmatchedRow = { id: string; externalId: string; orderExternalId: string | null; paymentExternalId: string | null; status: string; amount: string | null; total: string | null; currency: string | null; sourceType: string | null; cardBrand: string | null; last4: string | null; locationId: string | null; receiptUrl: string | null; at: string | null };

const call = <TIn, TOut>(name: string) => httpsCallable<TIn, TOut>(functions, name);

export async function beginSquareConnect(companyId: string) {
  return (await call<{ companyId: string }, { ok: boolean; state: string; environment: string; scopes: string[]; authorizeUrl: string }>("beginSquareConnect")({ companyId })).data;
}
export async function getSquareConnections(companyId: string): Promise<SquareConnection[]> {
  return (await call<{ companyId: string }, { ok: boolean; connections: SquareConnection[] }>("getSquareConnections")({ companyId })).data.connections ?? [];
}
export async function updateSquareConnectionSettings(companyId: string, connectionId: string, patch: { selectedLocationIds?: string[]; importPolicy?: SquareImportPolicy; importSources?: string[]; autoSync?: boolean; recordAllSales?: boolean }) {
  return (await call<{ companyId: string; connectionId: string } & typeof patch, { ok: boolean; connection: SquareConnection }>("updateSquareConnectionSettings")({ companyId, connectionId, ...patch })).data;
}
export async function disconnectSquare(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, { ok: boolean; revoked: boolean }>("disconnectSquare")({ companyId, connectionId })).data;
}
export async function syncSquareNow(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, SquareSyncResult>("syncSquareNow")({ companyId, connectionId })).data;
}
export async function previewSquareImport(companyId: string, connectionId: string, days: number) {
  return (await call<{ companyId: string; connectionId: string; days: number }, SquareImportPreview>("previewSquareImport")({ companyId, connectionId, days })).data;
}
export async function runSquareImport(companyId: string, connectionId: string, days: number) {
  return (await call<{ companyId: string; connectionId: string; days: number }, SquareImportResult>("runSquareImport")({ companyId, connectionId, days })).data;
}
export async function listSquareUnmatched(companyId: string) {
  return (await call<{ companyId: string }, { ok: boolean; payments: SquareUnmatchedRow[]; refunds: SquareUnmatchedRow[] }>("listSquareUnmatched")({ companyId })).data;
}
export async function listSquarePayouts(companyId: string, limit = 50) {
  return (await call<{ companyId: string; limit: number }, { ok: boolean; payouts: SquarePayoutRow[] }>("listSquarePayouts")({ companyId, limit })).data;
}
export async function auditSquareOrders(companyId: string, connectionId: string, days: number) {
  return (await call<{ companyId: string; connectionId: string; days: number }, SquareAuditReport>("auditSquareOrders")({ companyId, connectionId, days })).data;
}

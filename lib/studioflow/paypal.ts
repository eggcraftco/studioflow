import { collection, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase/client";

// PayPal money feed — the workspace's own PayPal app read through the bank module.
export type PayPalEnvironment = "live" | "sandbox";
export type PayPalConnection = { id: string; status: string; syncState: string; environment: PayPalEnvironment; providerName: string; clientIdHint: string; lastSyncedAt: Date | null; lastSyncError: string; accountNumber: string };
export type PayPalPayoutRow = { id: string; externalId: string; status: string | null; amount: string | null; currency: string | null; arrivalDate: string | null; payoutType: string | null; totals: { gross?: string | null; fee?: string | null; net?: string | null; refunds?: string | null }; bankMatch: { transactionId?: string; bookingDate?: string | null; method?: string; confidence?: string } | null; createdAt: string | null };
export type PayoutMatchCandidate = { transactionId: string; accountId: string | null; bookingDate: string | null; amount: number; currency: string | null; description: string; counterparty: string; score: number; reasons: string[]; free: boolean };
export type PayoutMatchSuggestion = { ok: boolean; payout: { id: string; externalId: string; amount: string | null; currency: string | null; arrivalDate: string | null; status: string | null }; window: { from: string; to: string } | null; candidates: PayoutMatchCandidate[]; near: PayoutMatchCandidate[] };

const call = <TIn, TOut>(name: string) => httpsCallable<TIn, TOut>(functions, name);

export async function getPayPalConnections(companyId: string): Promise<PayPalConnection[]> {
  const snap = await getDocs(query(collection(db, "companies", companyId, "bankConnections"), where("provider", "==", "paypal")));
  return snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const accounts = Array.isArray(data.accounts) ? (data.accounts as Array<Record<string, unknown>>) : [];
    const last = data.lastSyncedAt as { toDate?: () => Date } | undefined;
    return {
      id: doc.id, status: String(data.status || ""), syncState: String(data.syncState || ""), environment: data.environment === "sandbox" ? "sandbox" : "live",
      providerName: String(data.providerName || "PayPal"), clientIdHint: String(data.clientIdHint || ""),
      lastSyncedAt: last && typeof last.toDate === "function" ? last.toDate() : null, lastSyncError: String(data.lastSyncError || ""),
      accountNumber: String(accounts[0]?.accountNumber || ""),
    };
  });
}
export async function paypalConnect(companyId: string, clientId: string, clientSecret: string, environment: PayPalEnvironment) {
  return (await call<{ companyId: string; clientId: string; clientSecret: string; environment: string }, { status: string; connectionId: string; imported: number; payouts: number; reconnected: boolean }>("paypalConnect")({ companyId, clientId, clientSecret, environment })).data;
}
export async function bankSyncNow(companyId: string) {
  return (await call<{ companyId: string; force: boolean }, { synced: number; skipped: number; imported: number }>("bankSyncTransactions")({ companyId, force: true })).data;
}
export async function bankDisconnect(companyId: string, connectionId: string, mode: "disconnect" | "purge") {
  return (await call<{ companyId: string; requisitionId: string; mode: string }, { disconnected?: boolean; deleted?: boolean }>("bankDeleteConnection")({ companyId, requisitionId: connectionId, mode })).data;
}
export async function listProviderPayouts(companyId: string, provider: "paypal" | "square", limit = 50) {
  return (await call<{ companyId: string; provider: string; limit: number }, { ok: boolean; payouts: PayPalPayoutRow[] }>("bankListPayouts")({ companyId, provider, limit })).data;
}
export async function matchPayoutToBank(companyId: string, provider: "paypal" | "square", payoutId: string, mode: "suggest"): Promise<PayoutMatchSuggestion>;
export async function matchPayoutToBank(companyId: string, provider: "paypal" | "square", payoutId: string, mode: "confirm", transactionId: string): Promise<{ ok: boolean }>;
export async function matchPayoutToBank(companyId: string, provider: "paypal" | "square", payoutId: string, mode: "unlink"): Promise<{ ok: boolean; unlinked: boolean }>;
export async function matchPayoutToBank(companyId: string, provider: "paypal" | "square", payoutId: string, mode: "suggest" | "confirm" | "unlink", transactionId?: string) {
  return (await call<{ companyId: string; provider: string; payoutId: string; mode: string; transactionId?: string }, PayoutMatchSuggestion | { ok: boolean; unlinked?: boolean }>("matchPayoutToBank")({ companyId, provider, payoutId, mode, ...(transactionId ? { transactionId } : {}) })).data;
}

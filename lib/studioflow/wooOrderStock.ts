import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { studioT } from "@/lib/studioflow/language";
import { wooOrderStockText } from "@/lib/studioflow/wooOrderStockRules";

// The calls behind a WooCommerce order's "Stock" line (MC-4, 27 Oct 2026). Every call is a Cloud Function; nothing
// here writes to the store, and the order document itself is never written by MC-4.

const call = <TIn, TOut>(name: string) => httpsCallable<TIn, TOut>(functions, name);

export type WooStockActionRow = { lineId: string; result: string; reason?: string; inventoryItemId?: string; plan?: { reserve: number; sell: number; release: number; state: string } };

/** What this order's linked lines did to stock (reserved / taken / given back / oversold / did it come back?). */
export async function getWooOrderStock(companyId: string, orderId: string) {
  return (await call<{ companyId: string; orderId: string }, unknown>("getWooOrderStock")({ companyId, orderId })).data;
}

/** "Reserve stock" (op reserve, with a dry run first) and "Return to stock" (op returned, owner/admin). */
export async function updateWooOrderStock(companyId: string, input: { orderId: string; op: "reserve" | "returned"; lineId?: string; quantity?: number; dryRun?: boolean }) {
  return (await call<Record<string, unknown>, { ok: boolean; dryRun?: boolean; results?: WooStockActionRow[]; returned?: number; state?: string }>(
    "updateWooOrderStock")({ companyId, ...input })).data;
}

/** This feature's sentences: its own table first, then the app's. */
export function wooOrderStockT(sentence: string, language: string): string {
  return wooOrderStockText(sentence, language) || studioT(sentence, language);
}

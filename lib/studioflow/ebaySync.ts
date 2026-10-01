import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { studioT } from "@/lib/studioflow/language";
import { chunkIds, ebaySyncText, mergeChosenResults, type EbayChosenImportResult } from "@/lib/studioflow/ebaySyncRules";

// The two calls behind the Preview list and the order page's Refresh (1 Oct 2026).
// Like lib/studioflow/ebay.ts, nothing here holds an eBay token: both are Cloud
// Functions, and what comes back carries order numbers and states, never a buyer.

const call = <TIn, TOut>(name: string) => httpsCallable<TIn, TOut>(functions, name);

/**
 * The owner's chosen orders, by eBay order id. The server takes at most 500 ids a
 * call, so a longer choice is imported in turns and the answers are added up.
 */
export async function importChosenEbayOrders(
  companyId: string, connectionId: string, orderIds: string[],
  options: { includeUnpaid?: boolean; includeCancelled?: boolean } = {}
): Promise<EbayChosenImportResult> {
  const results: EbayChosenImportResult[] = [];
  for (const batch of chunkIds(orderIds)) {
    results.push((await call<{ companyId: string; connectionId: string; orderIds: string[]; includeUnpaid?: boolean; includeCancelled?: boolean }, EbayChosenImportResult>(
      "runEbayImport")({ companyId, connectionId, orderIds: batch, ...options })).data);
  }
  return mergeChosenResults(results);
}

/** One eBay order fetched fresh and applied. Never creates; an older copy at eBay changes nothing. */
export async function refreshEbayOrder(companyId: string, orderId: string) {
  return (await call<{ companyId: string; orderId: string }, { ok: boolean; result: string; orderId: string; reason: string; problems: string[] }>(
    "refreshEbayOrder")({ companyId, orderId })).data;
}

/** The same Refresh asked for by the connection and the eBay order id (a Preview row already in NivaDesk). */
export async function refreshEbayOrderByEbayId(companyId: string, connectionId: string, ebayOrderId: string) {
  return (await call<{ companyId: string; connectionId: string; ebayOrderId: string }, { ok: boolean; result: string; orderId: string; reason: string; problems: string[] }>(
    "refreshEbayOrder")({ companyId, connectionId, ebayOrderId })).data;
}

/** This feature's sentences: its own table first (ebaySyncRules), then the app's. */
export function ebaySyncT(sentence: string, language: string): string {
  return ebaySyncText(sentence, language) || studioT(sentence, language);
}

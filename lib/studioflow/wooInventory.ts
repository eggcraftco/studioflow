import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { studioT } from "@/lib/studioflow/language";
import { ebayInventoryText } from "@/lib/studioflow/ebayInventoryRules";
import { chunk, importRowsOf, wooInventoryText, type WooImportRow } from "@/lib/studioflow/wooInventoryRules";

// The calls behind WooCommerce products → Inventory (MC-3, 22 Oct 2026). Nothing here holds a store key: every call
// is a Cloud Function, and nothing writes to the store — the server reads products/variations and writes only NivaDesk.

const call = <TIn, TOut>(name: string) => httpsCallable<TIn, TOut>(functions, name);

export type WooProductConnection = { connectionId: string; storeName: string; host: string; status: string };
export type WooLinksAnswer = { ok: boolean; enabled: boolean; canEdit: boolean; money: boolean; connections: WooProductConnection[]; links: Array<Record<string, unknown>> };

/** Whether the switch is on, the workspace's stores, and what is linked (all, one store's, or one card's). */
export async function getWooProductLinks(companyId: string, input: { inventoryItemId?: string; connectionId?: string } = {}) {
  return (await call<Record<string, unknown>, WooLinksAnswer>("getWooProductLinks")({ companyId, ...input })).data;
}

/** Read the store's products and match them. Writes nothing in the store; the rows are kept a day for the import. */
export async function previewWooProducts(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, Record<string, unknown>>("previewWooProducts")({ companyId, connectionId })).data;
}

/** The chosen rows, each with its own decision; at most 200 a call, so a longer choice goes in turns. */
export async function importWooProducts(companyId: string, connectionId: string, decisions: Array<Record<string, unknown>>): Promise<WooImportRow[]> {
  const rows: WooImportRow[] = [];
  for (const batch of chunk(decisions)) {
    rows.push(...importRowsOf((await call<{ companyId: string; connectionId: string; decisions: Array<Record<string, unknown>> }, unknown>("importWooProducts")({ companyId, connectionId, decisions: batch })).data));
  }
  return rows;
}

/** This feature's sentences: its own table, then E4's shared sentences, then the app's. */
export function wooInventoryT(sentence: string, language: string): string {
  return wooInventoryText(sentence, language) || ebayInventoryText(sentence, language) || studioT(sentence, language);
}

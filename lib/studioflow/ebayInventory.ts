import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { studioT } from "@/lib/studioflow/language";
import { chunk, ebayInventoryText, importRowsOf, type EbayImportRow } from "@/lib/studioflow/ebayInventoryRules";

// The six calls behind eBay listings → Inventory and the order page's stock (package E4, 1 Oct 2026). Like the rest
// of lib/studioflow/ebay*.ts, nothing here holds an eBay token: every call is a Cloud Function, and nothing here
// writes to eBay — the server reads the seller's active listings (GetMyeBaySelling) and writes only NivaDesk.

const call = <TIn, TOut>(name: string) => httpsCallable<TIn, TOut>(functions, name);

export type EbayListingConnection = { connectionId: string; sellerUsername: string; status: string; environment: string; listingReadGranted: boolean };
export type EbayLinksAnswer = { ok: boolean; enabled: boolean; canEdit: boolean; money: boolean; connections: EbayListingConnection[]; links: EbayLinkView[] };
export type EbayLinkView = {
  linkId: string; connectionId: string; itemId: string; variationKey: string; sku: string; title: string; variationTitle: string;
  inventoryItemId: string; inventoryItemNumber: string; inventoryItemName: string; linked: boolean; effectiveFromMs: number; linkedAtMs: number; createdCard: boolean;
  listedQuantity: number | null; listingType: string; priceKind: string; price: { value: string; currency: string } | null; currentBid: { value: string; currency: string } | null;
  pictureUrl: string; seenAtMs: number; history: Array<{ atMs: number; action: string; from: string; to: string }>
};

/** What is linked (all, or one card's), whether the switch is on, and whether each connection's consent includes the listing read. */
export async function getEbayListingLinks(companyId: string, inventoryItemId = "") {
  return (await call<{ companyId: string; inventoryItemId?: string }, EbayLinksAnswer>("getEbayListingLinks")({ companyId, ...(inventoryItemId ? { inventoryItemId } : {}) })).data;
}

/** Read the seller's active listings and match them. Writes nothing in eBay; the rows are kept a day for the import. */
export async function previewEbayListings(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, Record<string, unknown>>("previewEbayListings")({ companyId, connectionId })).data;
}

/** The chosen rows, each with its own decision; at most 200 a call, so a longer choice goes in turns. */
export async function importEbayListings(companyId: string, connectionId: string, decisions: Array<Record<string, unknown>>): Promise<EbayImportRow[]> {
  const rows: EbayImportRow[] = [];
  for (const batch of chunk(decisions)) {
    rows.push(...importRowsOf((await call<{ companyId: string; connectionId: string; decisions: Array<Record<string, unknown>> }, unknown>("importEbayListings")({ companyId, connectionId, decisions: batch })).data));
  }
  return rows;
}

/** Point a listing at another card (`inventoryItemId`) or unlink it (empty). */
export async function changeEbayListingLink(companyId: string, linkId: string, inventoryItemId: string) {
  return (await call<{ companyId: string; linkId: string; inventoryItemId: string }, { ok: boolean; reason?: string; changed?: boolean; from?: string; to?: string; openOrderLinesOnPreviousCard?: number }>(
    "changeEbayListingLink")({ companyId, linkId, inventoryItemId })).data;
}

export async function getEbayOrderStock(companyId: string, orderId: string) {
  return (await call<{ companyId: string; orderId: string }, unknown>("getEbayOrderStock")({ companyId, orderId })).data;
}

/** "Reserve stock" (op apply, with a dry run first) and "Item returned" (op returned). */
export async function updateEbayOrderStock(companyId: string, input: { orderId: string; op: "apply" | "returned"; lineItemId?: string; quantity?: number; dryRun?: boolean }) {
  return (await call<Record<string, unknown>, { ok: boolean; results?: Array<{ lineItemId: string; result: string; reason?: string; inventoryItemNumber?: string; plan?: { reserve: number; sell: number; release: number; state: string } }>; returned?: number; state?: string }>(
    "updateEbayOrderStock")({ companyId, ...input })).data;
}

/** This feature's sentences: its own table first (ebayInventoryRules), then the app's. */
export function ebayInventoryT(sentence: string, language: string): string {
  return ebayInventoryText(sentence, language) || studioT(sentence, language);
}

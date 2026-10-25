// MC-3 cost (25 Oct 2026): a card's purchase price is one of three things, and they must never read as each other.
//
//   notEntered  nobody has said what it cost. A card brought in from a store (WooCommerce, eBay) starts here: the store's
//               price is a SALE price, never a cost, so nothing is written into the cost and the card says so.
//   zero        the person entered 0 (costEntered: true) — a real zero, shown as £0.00.
//   positive    a price above zero. A positive price can only have been typed, so it is always "entered".
//   hidden      FIN-01: the caller has no Financial Info; the server zeroed the figures. Nothing is shown.
//
// The marker is `costEntered` on the card (server: saveInventoryItem / importWooProducts, MC-3 cost package).
// A card saved before the marker existed has no field. Its 0 is NOT guessed into a meaning:
//   - imported from a store (source woocommerce / ebay): no import ever wrote a cost, so it reads "not entered";
//   - anything else (typed by hand, opening stock, a purchase): it keeps the reading it always had (£0.00 as stored).
// This module imports nothing, so scripts/check-inventory-cost.mjs can compile and run it as it is.

export type InventoryCostKind = "hidden" | "notEntered" | "zero" | "positive";

export type InventoryCostCard = {
  costHidden?: boolean;
  costEntered?: boolean;
  purchasePrice?: number | null;
  source?: string;
  ownership?: string;
  status?: string;
};

/** Sources whose cards are made by a store import that never writes a cost. */
export const STORE_IMPORT_SOURCES: readonly string[] = ["woocommerce", "ebay"];

const ON_SHELF_GONE = ["archived", "sold", "used", "removed", "incoming"];

export function inventoryCostKind(item: InventoryCostCard | null | undefined): InventoryCostKind {
  if (!item) return "notEntered";
  if (item.costHidden === true) return "hidden";
  const price = Number(item.purchasePrice);
  if (Number.isFinite(price) && price > 0) return "positive";
  if (item.costEntered === true) return "zero";
  if (item.costEntered === false) return "notEntered";
  return STORE_IMPORT_SOURCES.includes(String(item.source || "")) ? "notEntered" : "zero";
}

export const inventoryCostNotEntered = (item: InventoryCostCard | null | undefined) => inventoryCostKind(item) === "notEntered";

/**
 * How many business-owned cards on the shelf carry no cost. The inventory value adds them as nothing; the screens say
 * so next to the figure instead of letting it read as a complete valuation (or as money spent).
 */
export function inventoryCostMissingCount(items: readonly InventoryCostCard[]): number {
  return items.filter((item) => item && item.ownership !== "customer"
    && !ON_SHELF_GONE.includes(String(item.status || "available"))
    && inventoryCostKind(item) === "notEntered").length;
}

/** What the purchase-price box starts with: empty when not entered (and for an old 0, as before), "0" for a real zero. */
export function inventoryCostFieldText(item: InventoryCostCard | null | undefined): string {
  const kind = inventoryCostKind(item);
  if (kind === "positive") return String(Number(item?.purchasePrice));
  if (kind === "zero" && item?.costEntered === true) return "0";
  return "";
}

/**
 * What a save sends for the purchase price, from the box's text. Typed (0 included) → costEntered: true. Empty →
 * purchasePrice 0 and, only when the card HAD a cost, costEntered: false (the person removed it); otherwise the marker
 * is not sent and the server keeps what the card had — an empty box is never turned into a known £0.
 */
export function inventoryCostSaveFields(text: string, item: InventoryCostCard | null | undefined): { purchasePrice: number; costEntered?: boolean } {
  const raw = String(text ?? "").trim().replace(",", ".");
  const value = raw === "" ? NaN : Number(raw);
  if (Number.isFinite(value) && value >= 0) return { purchasePrice: Math.round(value * 10000) / 10000, costEntered: true };
  const hadCost = Boolean(item) && (item?.costEntered === true || Number(item?.purchasePrice) > 0);
  return hadCost ? { purchasePrice: 0, costEntered: false } : { purchasePrice: 0 };
}

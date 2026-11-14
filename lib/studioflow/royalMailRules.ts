// Royal Mail Click & Drop — the rules of the order panel that need no server and no browser:
// what a customs declaration is made of, what its lines add up to, and when the open order asks
// Royal Mail again on its own. No imports, so scripts/check-royal-mail-web.mts drives them as they
// are. Re-exported by lib/studioflow/royalMail.ts.

/** As much of a shipment as these rules read (the full type is RoyalMailShipment in royalMail.ts). */
type ShipmentFacts = { id: string; state: string; trackingNumber: string; printedOn?: string; shippedOn?: string; hasLabel?: boolean };

// ---- abroad (14 Nov 2026) -------------------------------------------------------------------
// Where the order goes is the server's reading of its delivery address
// (functions/shipping/royalmail/contract.js destinationFor): it comes back with the services, and
// says what the form must ask for that country. Nothing here decides which country an address is in.
// Absent from a server from before 14 Nov 2026, which sends UK parcels only.
export type RoyalMailDestination = {
  countryCode: string;
  international: boolean;
  eu: boolean;
  /** A customs declaration (what is inside, line by line) goes with the order. */
  needsCustoms: boolean;
  /** Goods sold to the European Union: the seller's own product code per line. */
  needsProductCodes: boolean;
  /** The USA: the sender's own phone or e-mail. */
  needsSenderContact: boolean;
  /** What this workspace sent last time. */
  senderContact: { phone: string; email: string };
};

/** CreateOrderRequest.customsDeclarationCategory, in Royal Mail's own spelling. */
export type RoyalMailCustomsCategory = "eCommerceSaleOfGoods" | "commercialSaleOfGoods" | "gift" | "commercialSample" | "returnedGoods" | "documents" | "other";

export const ROYAL_MAIL_CUSTOMS_CATEGORIES: { id: RoyalMailCustomsCategory; label: string }[] = [
  { id: "eCommerceSaleOfGoods", label: "Goods sold online" },
  { id: "commercialSaleOfGoods", label: "Goods sold to a business" },
  { id: "gift", label: "Gift" },
  { id: "commercialSample", label: "Commercial sample" },
  { id: "returnedGoods", label: "Returned goods" },
  { id: "documents", label: "Documents" },
  { id: "other", label: "Other" }
];

/** Goods that were sold: to the EU these need the seller's product code on every line. */
export function royalMailSaleCategory(category: string): boolean {
  return category === "eCommerceSaleOfGoods" || category === "commercialSaleOfGoods";
}

/**
 * One customs line, under the names DHL's customs lines have (lib/studioflow/shipping.ts
 * CustomsItem): description, quantity, unitValue, hsCode, manufacturerCountry, merchantProductId.
 * The weight of ONE item is in grams, as everything Royal Mail weighs is.
 */
export type RoyalMailCustomsItem = {
  description: string;
  quantity: number | null;
  /** The value of ONE item, in pounds. */
  unitValue: number | null;
  unitWeightGrams: number | null;
  hsCode: string;
  /** Two-letter code of the country the item was made in. */
  manufacturerCountry: string;
  /** The seller's own product code (SKU). */
  merchantProductId: string;
};

export type RoyalMailCustoms = { category: RoyalMailCustomsCategory | ""; items: RoyalMailCustomsItem[]; iossNumber?: string };

/** A customs line as the form holds it: what the person typed, untouched. */
export type RoyalMailCustomsLineDraft = { description: string; quantity: string; unitValue: string; unitWeightGrams: string; hsCode: string; manufacturerCountry: string; merchantProductId: string };

export function emptyCustomsLine(description = ""): RoyalMailCustomsLineDraft {
  // Nothing is guessed: no weight, no value, no country. The quantity starts at one.
  return { description, quantity: "1", unitValue: "", unitWeightGrams: "", hsCode: "", manufacturerCountry: "", merchantProductId: "" };
}

const numberOrNull = (value: string): number | null => {
  const cleaned = value.trim().replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/** The form's lines as the server takes them. An empty number stays empty (the server asks for it). */
export function customsItemsFromDrafts(lines: RoyalMailCustomsLineDraft[]): RoyalMailCustomsItem[] {
  return lines.map(line => ({
    description: line.description.trim(),
    quantity: numberOrNull(line.quantity),
    unitValue: numberOrNull(line.unitValue),
    unitWeightGrams: numberOrNull(line.unitWeightGrams),
    hsCode: line.hsCode.replace(/[\s.]/g, ""),
    manufacturerCountry: line.manufacturerCountry.trim(),
    merchantProductId: line.merchantProductId.trim()
  }));
}

/** What the lines add up to: the declared value in pounds and the items' weight in grams. */
export function customsTotals(lines: RoyalMailCustomsLineDraft[]): { value: number; grams: number } {
  let value = 0; let grams = 0;
  for (const item of customsItemsFromDrafts(lines)) {
    const quantity = item.quantity != null && item.quantity > 0 ? item.quantity : 0;
    if (item.unitValue != null && item.unitValue > 0) value += quantity * item.unitValue;
    if (item.unitWeightGrams != null && item.unitWeightGrams > 0) grams += quantity * item.unitWeightGrams;
  }
  return { value: Math.round(value * 100) / 100, grams: Math.round(grams) };
}

/** The one field the USA form has, read as a phone number or an e-mail. */
export function senderContactFrom(typed: string): { phone: string; email: string } {
  const value = typed.trim();
  return value.includes("@") ? { phone: "", email: value } : { phone: value, email: "" };
}

// ---- the tracking number's own way back (14 Nov 2026) -----------------------------------------
// A pay-as-you-go label is paid for and printed in Click & Drop, in another tab; its tracking
// number exists only after that. The server asks Royal Mail every ten minutes; the open order asks
// too, on its own, so the number is on the Shipping card when the person comes back to it:
// once when the card opens, each time the tab is looked at again, and every half minute for ten
// minutes after an order was sent or the Click & Drop link was pressed. Never more often than
// once in twenty seconds, and not at all once nothing is waiting.
export const ROYAL_MAIL_AUTO_CHECK = { minGapMs: 20_000, pollEveryMs: 30_000, pollForMs: 10 * 60_000 } as const;

/** A shipment Royal Mail may still say something new about. */
export function royalMailShipmentWaiting(s: Pick<ShipmentFacts, "state">): boolean {
  return s.state === "sending" || s.state === "sent" || s.state === "unknown" || s.state === "label";
}

/** A shipment whose tracking number has not arrived yet: worth asking about every half minute for a while. */
export function royalMailAwaitingNumber(s: Pick<ShipmentFacts, "state" | "trackingNumber">): boolean {
  return royalMailShipmentWaiting(s) && !String(s.trackingNumber || "").trim();
}

/** Whether the quiet check may run now. */
export function royalMailAutoCheckDue(nowMs: number, lastCheckMs: number, anyWaiting: boolean, visible: boolean): boolean {
  return anyWaiting && visible && nowMs - lastCheckMs >= ROYAL_MAIL_AUTO_CHECK.minGapMs;
}

/** The tracking numbers that are in `after` and were not in `before` (a number that has just arrived). */
export function royalMailArrivedNumbers(before: Pick<ShipmentFacts, "id" | "trackingNumber">[], after: Pick<ShipmentFacts, "id" | "trackingNumber">[]): string[] {
  const had = new Map(before.map(s => [s.id, String(s.trackingNumber || "").trim()]));
  return after.map(s => ({ id: s.id, n: String(s.trackingNumber || "").trim() })).filter(s => s.n && had.get(s.id) !== s.n).map(s => s.n);
}

/** Whether anything a person would see changed between two reads of the order's shipments. */
export function royalMailShipmentsChanged(before: ShipmentFacts[], after: ShipmentFacts[]): boolean {
  const key = (list: ShipmentFacts[]) => list.map(s => `${s.id}:${s.state}:${s.trackingNumber}:${s.printedOn}:${s.shippedOn}:${s.hasLabel}`).sort().join("|");
  return key(before) !== key(after);
}

/** "customs.items[2].hsCode" → { line: 3, field: "hsCode" }; null for any other field. */
export function customsLineField(field: string): { line: number; field: string } | null {
  const match = /^customs\.items\[(\d+)\]\.([A-Za-z]+)$/.exec(field);
  return match ? { line: Number(match[1]) + 1, field: match[2] } : null;
}


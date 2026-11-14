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
export type RoyalMailCustomsLineDraft = {
  description: string; quantity: string; unitValue: string; unitWeightGrams: string; hsCode: string; manufacturerCountry: string; merchantProductId: string;
  /** The value is still the one the form took from the order's total (an order made by hand): it follows the shipping field until the person types their own. */
  valueFromOrderTotal?: boolean;
};

// ---- the order's own money (14 Nov 2026, third package) ------------------------------------------
// The server reads the order (functions/shipping/royalmail/contract.js orderAmounts / prefillLines) and answers, with
// the services, what the form starts from: the order's total, what the customer paid for shipping where the order says
// it (a shop order; an order made by hand holds one figure only), and — abroad — the customs lines. Nothing here reads
// the order. `amounts` is null for a member without financial access and absent from an older server.
export type RoyalMailAmounts = { orderTotal: number | null; shippingCharged: number | null; goodsValue: number | null };
export type RoyalMailPrefillLine = { description: string; quantity: number; unitValue: number | null; merchantProductId: string };

const plain = (n: number): string => (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");

/** The shipping field as it starts: the order's own figure where it has one, else empty. */
export function shippingDraftFrom(amounts: RoyalMailAmounts | null | undefined): string {
  return amounts && amounts.shippingCharged != null && amounts.shippingCharged >= 0 ? plain(amounts.shippingCharged) : "";
}

/** What was typed in the shipping field, as the server takes it: a number, or nothing (the server then uses the order's own figure). */
export function shippingChargedFrom(typed: string): number | undefined {
  const cleaned = typed.trim().replace(",", ".");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  // Not a number: sent as typed-and-wrong so the server names the problem, never silently dropped.
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * The customs lines the form starts from. The shop's lines carry their own prices; a single line made from an order's
 * total (an order made by hand) is marked, so it can follow the shipping field. Weight, customs code and origin stay empty.
 */
export function customsLinesFromPrefill(prefill: RoyalMailPrefillLine[] | null | undefined, fallbackDescription: string, amounts: RoyalMailAmounts | null | undefined): RoyalMailCustomsLineDraft[] {
  const rows = Array.isArray(prefill) ? prefill : [];
  if (!rows.length) return [emptyCustomsLine(fallbackDescription)];
  return rows.map(row => ({
    ...emptyCustomsLine(String(row.description || "").slice(0, 255)),
    quantity: String(row.quantity > 0 ? Math.round(row.quantity) : 1),
    unitValue: row.unitValue != null && row.unitValue > 0 ? plain(row.unitValue) : "",
    merchantProductId: String(row.merchantProductId || ""),
    valueFromOrderTotal: rows.length === 1 && row.quantity === 1 && row.unitValue != null && amounts != null && amounts.goodsValue != null && row.unitValue === amounts.goodsValue && !row.merchantProductId
  }));
}

/**
 * The one line whose value came from the order's total follows the shipping field: the order's total less the shipping
 * the person typed, so goods plus shipping stays the order's total. Any other line is left exactly as it is.
 */
export function linesAfterShippingChange(lines: RoyalMailCustomsLineDraft[], amounts: RoyalMailAmounts | null | undefined, typedShipping: string): RoyalMailCustomsLineDraft[] {
  if (lines.length !== 1 || !lines[0].valueFromOrderTotal || !amounts || amounts.orderTotal == null) return lines;
  const shipping = shippingChargedFrom(typedShipping);
  const taken = shipping === undefined || !Number.isFinite(shipping) || shipping < 0 ? 0 : shipping;
  const goods = Math.round((amounts.orderTotal - taken) * 100) / 100;
  return goods > 0 ? [{ ...lines[0], unitValue: plain(goods) }] : lines;
}

/**
 * What Royal Mail is told the order is worth: abroad the declared goods plus shipping; in the UK the order's own total,
 * of which the shipping is a part. Null when it cannot be said (no figures, or a shipping field that is not a number).
 */
export function royalMailMoneySummary(input: { international: boolean; amounts: RoyalMailAmounts | null | undefined; declaredValue: number; typedShipping: string }): { goods: number; shipping: number; total: number } | null {
  const typed = shippingChargedFrom(input.typedShipping);
  if (typed !== undefined && (!Number.isFinite(typed) || typed < 0)) return null;
  const shipping = typed !== undefined ? typed : input.amounts?.shippingCharged ?? 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  if (input.international) return { goods: round(input.declaredValue), shipping: round(shipping), total: round(input.declaredValue + shipping) };
  if (!input.amounts || input.amounts.orderTotal == null) return null;
  const capped = Math.min(shipping, input.amounts.orderTotal);
  return { goods: round(input.amounts.orderTotal - capped), shipping: round(capped), total: input.amounts.orderTotal };
}

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


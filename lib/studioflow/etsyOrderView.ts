/**
 * ETSY-UI-1 (27 Oct 2026, owner-approved design): the pure rules behind the Etsy order block and the
 * order page's jump bar. No React, no Firebase: the check scripts call these directly.
 *
 * Nothing here writes anything. In particular the jump bar is DERIVED from the card layout the page already
 * renders (the visible cards, in their saved order, under their own titles) — it never builds, normalises or
 * saves a layout, so opening an order cannot change anyone's cards.
 */

// ---------------------------------------------------------------------------------------------------------------
// Totals: is Etsy's tax inside the total or on top of it? Computed from the stored figures, never assumed.
// ---------------------------------------------------------------------------------------------------------------

export type EtsyTaxMode = "none" | "included" | "added" | "unclaimed";

export type EtsyTotalsInput = {
  subtotal?: unknown; discount?: unknown; shipping?: unknown; tax?: unknown; grandTotal?: unknown;
};

const cents = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/**
 * How the stored tax relates to the stored total.
 *
 *  - "none":      no tax figure (absent or 0) — no tax line at all.
 *  - "included":  items + shipping already equal the total, so the tax is INSIDE it ("VAT included £x").
 *  - "added":     items + shipping + tax equal the total, so the tax is ON TOP ("Tax £x" above the total).
 *  - "unclaimed": neither adds up (gift wrap, a partial figure, a missing one…): the stored tax is shown as Etsy
 *                 reported it, with no claim either way.
 *
 * "Items" is tried two ways. Etsy documents `subtotal` as already net of the coupon discount (total_price −
 * discount), so items = subtotal; the brief's reading, items = subtotal − discount, is tried second. The
 * documented reading is decided first, so a coincidence (tax equal to the discount) cannot flip the answer.
 * A 1-cent tolerance absorbs Etsy's own rounding.
 */
export function etsyTaxMode(input: EtsyTotalsInput | null | undefined): EtsyTaxMode {
  if (!input) return "none";
  const tax = cents(input.tax);
  if (tax === null || tax <= 0) return "none";
  const subtotal = cents(input.subtotal);
  const shipping = cents(input.shipping) ?? 0;
  const grand = cents(input.grandTotal);
  if (subtotal === null || grand === null) return "unclaimed";
  const discount = Math.max(0, cents(input.discount) ?? 0);
  const close = (a: number, b: number) => Math.abs(a - b) <= 1;
  const bases = discount > 0 ? [subtotal + shipping, subtotal - discount + shipping] : [subtotal + shipping];
  for (const base of bases) {
    if (close(base, grand)) return "included";
    if (close(base + tax, grand)) return "added";
  }
  return "unclaimed";
}

// ---------------------------------------------------------------------------------------------------------------
// Header chips: Etsy's own statuses from the stored snapshot. Untranslated keys; the screen passes them to t().
// ---------------------------------------------------------------------------------------------------------------

export type EtsyStatusChip = { key: string; tone: "good" | "neutral" | "warning" | "danger" };

export function etsyStatusChips(source: {
  isPaid?: unknown; isShipped?: unknown; isCancelled?: unknown; isRefunded?: unknown;
} | null | undefined): EtsyStatusChip[] {
  if (!source || typeof source !== "object") return [];
  const chips: EtsyStatusChip[] = [];
  const cancelled = source.isCancelled === true;
  if (cancelled) chips.push({ key: "Cancelled on Etsy", tone: "danger" });
  if (source.isRefunded === true) chips.push({ key: "Refunded on Etsy", tone: "danger" });
  chips.push(source.isPaid === true ? { key: "Paid on Etsy", tone: "good" } : { key: "Not paid on Etsy", tone: "warning" });
  // A cancelled order is not waiting to be dispatched; saying "Not dispatched" there is noise.
  if (source.isShipped === true) chips.push({ key: "Dispatched on Etsy", tone: "neutral" });
  else if (!cancelled) chips.push({ key: "Not dispatched on Etsy", tone: "neutral" });
  return chips;
}

/**
 * ETSY-UI-1 follow-up (27 Oct 2026, owner): on an Etsy order the old channel strip ("Etsy · #receipt · Platform status ·
 * total · Open in Etsy") is replaced by this block. Etsy's own status word was the one thing on it the chips do not
 * already say: "paid", "open", "completed", "canceled" and "fully refunded" are the chips; anything else ("partially
 * refunded", "processing", a word Etsy adds later) is shown as Etsy wrote it. "" = nothing extra to show.
 */
const STATUS_SAID_BY_CHIPS = new Set(["", "paid", "open", "completed", "canceled", "cancelled", "fully refunded"]);
export function etsyStatusNotInChips(status: unknown): string {
  const text = String(status ?? "").trim();
  return STATUS_SAID_BY_CHIPS.has(text.toLowerCase()) ? "" : text;
}

/**
 * Whether the Etsy block takes the old channel strip's place on this order. Etsy orders only (the "Source" field, the
 * page's own test for drawing the block): while Etsy's copy is still being read (so the strip does not flash and vanish) and once it
 * is there with its lines. A settled order WITHOUT Etsy's copy (disconnected, removed) keeps the strip — then it is the
 * only Etsy information on the page. Every other channel keeps its strip exactly as before.
 */
export function etsyBlockReplacesStrip(
  order: { customFields?: Record<string, string | undefined> | null } | null | undefined,
  snapshot: { source: { items?: unknown } | null; settled: boolean }
): boolean {
  if (!order) return false;
  // The same test the page uses to draw the block (and to read Etsy's copy at all): the "Source" field.
  if (String(order.customFields?.["Source"] ?? "").trim() !== "Etsy") return false;
  if (!snapshot.settled) return true;
  return Boolean(snapshot.source) && Array.isArray(snapshot.source?.items);
}

/**
 * ETSY-UI-1 asks for a "Ship by <date> (Etsy)" chip only when the stored data carries Etsy's own expected ship
 * date. It does not: the importer reads `expected_ship_date` only to set the order's due date (a whole number
 * of days from the order date, which the seller can then change), and `etsySource` keeps no ship-by field. The
 * order's due date is therefore NOT Etsy's date, and no chip is drawn from it. This stays false until the server
 * stores Etsy's date in the snapshot (a server change, outside this package).
 */
export const ETSY_SHIP_BY_STORED = false;

// ---------------------------------------------------------------------------------------------------------------
// Links and photos
// ---------------------------------------------------------------------------------------------------------------

/**
 * The seller's Sold Orders page, filtered to this receipt: etsySource.viewOnEtsyUrl, else built from the receipt id
 * (the rule the old channel strip used — lib/studioflow/orderSourceLink.ts: digits only, fixed host). "" when neither.
 */
export function etsyOrderLink(source: { viewOnEtsyUrl?: unknown; receiptId?: unknown } | null | undefined): string {
  const url = String(source?.viewOnEtsyUrl ?? "").trim();
  if (/^https:\/\/www\.etsy\.com\/your\/orders\/sold(?:[/?#]|$)/i.test(url)) return url;
  const receipt = String(source?.receiptId ?? "").trim();
  return /^\d+$/.test(receipt) ? `https://www.etsy.com/your/orders/sold?order_id=${receipt}` : "";
}

/** Where to add tracking on Etsy: this receipt's page when known, else the Sold Orders page. */
export function etsyAddTrackingLink(source: { viewOnEtsyUrl?: unknown } | null | undefined): string {
  return etsyOrderLink(source) || "https://www.etsy.com/your/orders/sold";
}

/**
 * The photo row for one Etsy line: the same transaction first (two lines of one listing can carry two variation
 * images), then the same listing. undefined when Etsy named none.
 */
export function etsyPhotoForItem<P extends { transactionId?: string; listingId?: string }>(
  photos: P[] | null | undefined,
  item: { transactionId?: unknown; listingId?: unknown } | null | undefined
): P | undefined {
  const rows = Array.isArray(photos) ? photos : [];
  const transactionId = String(item?.transactionId ?? "").trim();
  const listingId = String(item?.listingId ?? "").trim();
  if (transactionId) {
    const exact = rows.find((row) => row && String(row.transactionId ?? "") === transactionId);
    if (exact) return exact;
  }
  return listingId ? rows.find((row) => row && String(row.listingId ?? "") === listingId) : undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Jump bar: one link per VISIBLE card, in the order the page shows them, under the user's own titles.
// ---------------------------------------------------------------------------------------------------------------

export const ETSY_BLOCK_JUMP_ID = "etsy";

export type JumpTarget = { id: string; label: string };

/**
 * The jump bar's links. `visibleCards` is exactly what the page renders, in its order (desktop: column by column;
 * phone: the stack, folded cards last) — hidden cards and cards the member may not see are already absent there.
 * `labelOf` is the page's own card title (the workshop's renamed heading, translated). Read-only: it copies
 * nothing back and never touches the layout object.
 */
export function orderJumpTargets(
  visibleCards: readonly string[],
  labelOf: (cardId: string) => string,
  options: { etsyBlock: boolean; etsyLabel: string }
): JumpTarget[] {
  const seen = new Set<string>();
  const targets: JumpTarget[] = [];
  if (options.etsyBlock) targets.push({ id: ETSY_BLOCK_JUMP_ID, label: options.etsyLabel });
  for (const cardId of visibleCards) {
    if (!cardId || seen.has(cardId)) continue;
    seen.add(cardId);
    targets.push({ id: cardId, label: labelOf(cardId) });
  }
  return targets;
}

/** Cards this person could show but has hidden (the count next to Customize cards). */
export function hiddenCardCount(
  showableCards: readonly string[],
  visibility: Readonly<Record<string, boolean>>
): number {
  return showableCards.filter((cardId) => visibility[cardId] === false).length;
}

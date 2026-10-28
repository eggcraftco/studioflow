// The commerce review list (Settings ▸ Integrations ▸ a channel ▸ Needs review), in words.
//
// listCommerceReviewQueue returns two kinds of item:
//   - the engine's rows: an order the sync applied but could not vouch for (an item not in the
//     catalogue, a missing total…). The owner checks the order and resolves it, as before.
//   - S-B (CUST-005 / CUST-006, server package commerce-sb-server-2026-10-27): "possible duplicate
//     customer". A store buyer had the same name as an existing customer but did not prove to be the
//     same person, so the server kept the existing card untouched, opened a NEW card for the buyer and
//     asks the owner: the same person (merge the new card into the existing one) or different people
//     (keep both). resolveCommerceReview takes `decision: "same" | "different"`; without one it
//     records "different" (that is what today's plain Resolve means for such an item).
//
// This file is the pure part (no React, no Firebase), so scripts/check-commerce-review-ui.mjs can
// drive it. Every string here is an English source text that the screen passes through studioT —
// never a raw code (a code the table does not know reads "Needs a check").

export type CommerceReviewMatch = {
  reason?: string | null;
  conflicts?: string[] | null;
  agrees?: string[] | null;
  incomingHasSignal?: boolean;
  existingHasSignal?: boolean;
};

export type CommerceReviewRow = {
  orderId: string;
  provider: string;
  providerDisplayName: string;
  connectionId: string;
  externalId: string;
  orderNumber: string;
  customerName: string | null;
  grandTotal: string | null;
  currency: string | null;
  reasons: string[];
  resolved: boolean;
  updatedAtMs: number;
  // S-B customer rows only (the engine's rows carry none of these).
  kind?: string | null;
  reviewId?: string | null;
  sourceOrderId?: string | null;
  newCustomerId?: string | null;
  existingCustomerId?: string | null;
  candidateCustomerIds?: string[] | null;
  match?: CommerceReviewMatch | null;
  resolution?: string | null;
};

export type ReviewDecision = "same" | "different";

/** commerce/customerMatch.js REVIEW_KIND and REVIEW_REASON. */
export const DUPLICATE_CUSTOMER_KIND = "customer_duplicate";
export const DUPLICATE_CUSTOMER_REASON = "possible_duplicate_customer";
/** The row id prefix the server gives a customer row (custdup_<new customer id>). */
export const DUPLICATE_CUSTOMER_ID_PREFIX = "custdup_";

/**
 * Every reason the server writes into commerceReviewQueue (functions/commerce/adapters/*.js `reasons.push`,
 * commerce/customerMatch.js), in the merchant's words. Keep in step with the adapters: a code missing here
 * reads "Needs a check", never the code itself.
 */
export const REVIEW_REASON_LABELS: Record<string, string> = {
  ad_hoc_line_item: "Item not in the catalogue",
  no_line_items: "No line items",
  missing_total: "Missing total",
  unresolved_variation: "Unresolved variation",
  // eBay and Amazon write this one for every order whose tax side they cannot tell.
  tax_responsibility_unknown: "Who collects the tax is unknown",
  missing_external_id: "No order number from the store",
  currency_mismatch: "Order currency differs from the shop's",
  no_buyer_id: "Buyer not identified by the store",
  test_order: "Test order from the store",
  buyer_data_restricted: "Buyer details not shared by the marketplace",
  [DUPLICATE_CUSTOMER_REASON]: "Possible duplicate customer"
};
export const UNKNOWN_REVIEW_REASON_LABEL = "Needs a check";

/** A reason code in words. Unknown or empty codes read "Needs a check" — never the raw code. */
export function reviewReasonLabel(code: string | null | undefined): string {
  const key = String(code ?? "").trim();
  return Object.prototype.hasOwnProperty.call(REVIEW_REASON_LABELS, key) ? REVIEW_REASON_LABELS[key] : UNKNOWN_REVIEW_REASON_LABEL;
}

/** The row's reasons in words, without repeats (two unknown codes are one "Needs a check"). */
export function reviewReasonLabels(row: Pick<CommerceReviewRow, "reasons">): string[] {
  const out: string[] = [];
  for (const code of Array.isArray(row.reasons) ? row.reasons : []) {
    const label = reviewReasonLabel(code);
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

/** A "possible duplicate customer" item — by its kind, or (a server rolled back to the list without `kind`) by its reason. */
export function isDuplicateCustomerRow(row: Pick<CommerceReviewRow, "kind" | "reasons">): boolean {
  return row.kind === DUPLICATE_CUSTOMER_KIND || (Array.isArray(row.reasons) && row.reasons.includes(DUPLICATE_CUSTOMER_REASON));
}

/**
 * Whether the screen may offer "Same person" / "Different people". Only a row in the S-B list shape
 * (kind + review id): an older server ignores `decision` and would record every answer as "different".
 */
export function canDecideDuplicate(row: CommerceReviewRow): boolean {
  return row.kind === DUPLICATE_CUSTOMER_KIND && Boolean(String(row.reviewId ?? "").trim());
}

/** A stable key per row: a customer row by its own review id (its orderId may be the buying order's), an engine row by order. */
export function reviewRowKey(row: CommerceReviewRow): string {
  if (isDuplicateCustomerRow(row)) return `customer:${String(row.reviewId || row.orderId || "").trim()}`;
  return `order:${String(row.orderId || "").trim()}`;
}

/** The new customer's id: the server names it, or (older list shape) the row id custdup_<id> carries it. */
export function duplicateNewCustomerId(row: CommerceReviewRow): string {
  const named = String(row.newCustomerId ?? "").trim();
  if (named) return named;
  for (const candidate of [row.reviewId, row.orderId]) {
    const id = String(candidate ?? "").trim();
    if (id.startsWith(DUPLICATE_CUSTOMER_ID_PREFIX) && id.length > DUPLICATE_CUSTOMER_ID_PREFIX.length) return id.slice(DUPLICATE_CUSTOMER_ID_PREFIX.length);
  }
  return "";
}

/**
 * The payload for resolveCommerceReview. An engine row resolves exactly as before ({ companyId, orderId });
 * a customer row names itself (reviewId — unambiguous even when its orderId is the order that brought the
 * buyer) and the owner's decision.
 */
export function resolveReviewPayload(companyId: string, row: CommerceReviewRow, decision?: ReviewDecision):
  { companyId: string; orderId: string; reviewId?: string; decision?: ReviewDecision } {
  const orderId = String(row.orderId || "").trim();
  if (!isDuplicateCustomerRow(row) || !canDecideDuplicate(row)) return { companyId, orderId };
  return { companyId, orderId, reviewId: String(row.reviewId).trim(), decision: decision === "same" ? "same" : "different" };
}

export type ReviewRowLink = { kind: "order" | "customer"; href: string; label: string };

/**
 * Where the row's link goes. "Open order" only when the item carries a real order id: an engine row's
 * orderId, a customer row's sourceOrderId (the order that brought the buyer). A customer row without
 * one opens the new customer instead ("Open Customer"); with neither, no link — never an empty order page.
 */
export function reviewRowLink(row: CommerceReviewRow, { canSeeOrders = true, canSeeCustomers = true }: { canSeeOrders?: boolean; canSeeCustomers?: boolean } = {}): ReviewRowLink | null {
  if (isDuplicateCustomerRow(row)) {
    const sourceOrderId = String(row.sourceOrderId ?? "").trim();
    if (sourceOrderId && canSeeOrders) return { kind: "order", href: `/orders/${encodeURIComponent(sourceOrderId)}`, label: "Open order" };
    const customerId = duplicateNewCustomerId(row);
    if (customerId && canSeeCustomers) return { kind: "customer", href: `/customers?customerId=${encodeURIComponent(customerId)}`, label: "Open Customer" };
    return null;
  }
  const orderId = String(row.orderId || "").trim();
  if (orderId && !orderId.startsWith(DUPLICATE_CUSTOMER_ID_PREFIX) && canSeeOrders) return { kind: "order", href: `/orders/${encodeURIComponent(orderId)}`, label: "Open order" };
  return null;
}

/**
 * The channel's name on the row's pill. Store names are names; the inbound channel's display name from the
 * server ("Inbound webhook") is a phrase, so it reads "Website" (the Sales list's word for the same channel)
 * and goes through studioT like every other text here.
 */
export function reviewProviderLabel(row: Pick<CommerceReviewRow, "provider" | "providerDisplayName">): string {
  const provider = String(row.provider || "").trim().toLowerCase();
  if (provider === "inbound") return "Website";
  return String(row.providerDisplayName || "").trim() || String(row.provider || "").trim();
}

/** The rows one channel's card shows (the server's provider ids: woocommerce, shopify, square, ebay, inbound…). */
export function reviewRowsForProvider(rows: CommerceReviewRow[] | null | undefined, provider: string): CommerceReviewRow[] {
  const wanted = String(provider || "").trim().toLowerCase();
  return (Array.isArray(rows) ? rows : []).filter((row) => String(row.provider || "").trim().toLowerCase() === wanted && row.resolved !== true);
}

const CONFLICT_LABELS: Record<string, string> = { email: "Email differs", phone: "Phone differs", external_id: "Store customer ID differs" };
const AGREE_LABELS: Record<string, string> = { email: "Same email", phone: "Same phone", external_id: "Same store customer ID" };

/** What conflicts between the buyer and the existing card (the server's signal types; no values travel). */
export function duplicateConflictLabels(match: CommerceReviewMatch | null | undefined): string[] {
  return (Array.isArray(match?.conflicts) ? match!.conflicts! : []).map((code) => CONFLICT_LABELS[code] ?? UNKNOWN_REVIEW_REASON_LABEL)
    .filter((label, index, all) => all.indexOf(label) === index);
}

/** What agrees (only shown next to the conflicts, so the owner sees the whole comparison). */
export function duplicateAgreementLabels(match: CommerceReviewMatch | null | undefined): string[] {
  return (Array.isArray(match?.agrees) ? match!.agrees! : []).map((code) => AGREE_LABELS[code] ?? UNKNOWN_REVIEW_REASON_LABEL)
    .filter((label, index, all) => all.indexOf(label) === index);
}

/** One sentence: why the server asked (commerce/customerMatch.js decideByName `match.reason`). */
export function duplicateMatchSummary(match: CommerceReviewMatch | null | undefined): string {
  switch (String(match?.reason ?? "")) {
    case "conflict": return "Same name, but their details differ.";
    case "unconfirmed_signal": return "Same name and phone, but this order brings new details.";
    case "cannot_compare": return "Same name, but one of them has no email or phone to compare.";
    default: return "Same name as an existing customer.";
  }
}

export type ReviewCustomerCard = { id: string; exists: boolean; name: string; email: string; phone: string; city: string };

const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");

/**
 * The four facts a card shows, from a `musteriler` document as the customer page has it — nothing masked,
 * nothing the customer page would not show the same person. A missing or unreadable card is `exists: false`.
 */
export function reviewCustomerCard(id: string, data: Record<string, unknown> | null | undefined): ReviewCustomerCard {
  if (!data) return { id, exists: false, name: "", email: "", phone: "", city: "" };
  return {
    id,
    exists: true,
    name: clean(data.name),
    email: clean(data.email),
    phone: clean(data.phone) || clean(data.primaryPhone) || clean(data.whatsappNumber) || clean(data.shippingPhone),
    city: clean(data.city) || clean(data.shippingCity)
  };
}

const phoneKey = (value: string): string => {
  const digits = value.replace(/\D/g, "");
  return digits.length > 9 ? digits.slice(-9) : digits;
};

/** The shown fields whose values differ between the two cards (both filled, not equal) — highlighted on screen. */
export function differingCardFields(a: ReviewCustomerCard | null | undefined, b: ReviewCustomerCard | null | undefined): Array<"email" | "phone" | "city"> {
  if (!a?.exists || !b?.exists) return [];
  const out: Array<"email" | "phone" | "city"> = [];
  if (a.email && b.email && a.email.toLowerCase() !== b.email.toLowerCase()) out.push("email");
  if (a.phone && b.phone && phoneKey(a.phone) !== phoneKey(b.phone)) out.push("phone");
  if (a.city && b.city && a.city.toLowerCase().replace(/\s+/g, " ") !== b.city.toLowerCase().replace(/\s+/g, " ")) out.push("city");
  return out;
}

/** Customer ids the screen reads for the open duplicate rows (existing + new), without repeats. */
export function duplicateCustomerIdsToLoad(rows: CommerceReviewRow[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (!isDuplicateCustomerRow(row)) continue;
    for (const id of [String(row.existingCustomerId ?? "").trim(), duplicateNewCustomerId(row)]) if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** "#1043" for a store's order number, without doubling a "#" the store already sent ("#IN-7104" stays one "#"). */
export function reviewOrderNumberText(orderNumber: string | null | undefined): string {
  const bare = String(orderNumber ?? "").trim().replace(/^#+\s*/, "");
  return bare ? `#${bare}` : "";
}

/** The sentence after a decision. */
export function decisionNotice(decision: ReviewDecision): string {
  return decision === "same" ? "Merged into the existing card." : "Kept as two customers.";
}

/** Every English source text this list can put on screen (scripts/check-commerce-review-ui.mjs checks all twelve languages). */
export const COMMERCE_REVIEW_SCREEN_TEXTS: string[] = [
  ...Object.values(REVIEW_REASON_LABELS), UNKNOWN_REVIEW_REASON_LABEL,
  ...Object.values(CONFLICT_LABELS), ...Object.values(AGREE_LABELS),
  "Same name, but their details differ.", "Same name and phone, but this order brings new details.",
  "Same name, but one of them has no email or phone to compare.", "Same name as an existing customer.",
  "Existing card", "New card", "This card is no longer there.", "Same person", "Different people",
  "Same person merges the new card into the existing one. Different people keeps both.",
  "Merge the new card into the existing card? The existing card keeps its details, its empty fields are filled from the new card, and the new card is removed. Orders are not changed. This cannot be undone with a click.",
  "Yes, merge", "Merged into the existing card.", "Kept as two customers.", "Only the workspace owner can decide.",
  "Website orders", "Orders posted to your Delivery URL whose buyer may already be one of your customers.",
  "Open order", "Open Customer", "Resolve", "Cancel", "Name", "Email", "Phone", "City", "Needs review", "Nothing needs review.", "Website"
];

/**
 * One bank feed row as Home's Banking card reads it. Pure (no Firebase import)
 * so the check script can run it.
 *
 * Review N22 (11 Oct 2026): Home decided "has a receipt" from receiptUrl /
 * receiptFileId, fields the server never writes — attaching a receipt writes
 * `receiptPath`. Every matched row, every row marked "no receipt needed" and
 * every refund counted as missing, so Home said 64 where Banking said 31. The
 * row now carries the same three fields Banking reads, and both screens ask
 * `bankRowMissingReceipt` the same question.
 */
export type HomeBankTx = {
  id: string;
  /** Who the money moved to or from, as the feed named it. */
  name: string;
  /** The raw pair the recurring detector groups on. */
  counterparty: string;
  description: string;
  currency: string;
  /** "YYYY-MM-DD", the shape the shared bank helpers read. */
  bookingDay: string;
  amount: number;
  bookingDate: Date | null;
  categoryId: string;
  /** Storage path of the attached receipt — the field the server writes. */
  receiptPath: string;
  hasReceipt: boolean;
  receiptNotNeeded: boolean;
  /** Set on an outgoing row marked as a customer refund or chargeback. */
  outgoingKind: string;
  reviewed: boolean;
};

export function homeBankTxFromDoc(id: string, data: Record<string, unknown>): HomeBankTx {
  const raw = data.bookingDate;
  const bookingDate =
    raw && typeof (raw as { toDate?: () => Date }).toDate === "function"
      ? (raw as { toDate: () => Date }).toDate()
      : typeof raw === "string" && raw
        ? new Date(raw)
        : null;
  const receiptPath = typeof data.receiptPath === "string" ? data.receiptPath : "";
  return {
    id,
    name: String(data.counterparty || data.description || ""),
    counterparty: String(data.counterparty || ""),
    description: String(data.description || ""),
    currency: String(data.currency || ""),
    bookingDay: typeof raw === "string" ? raw : (bookingDate ? bookingDate.toISOString().slice(0, 10) : ""),
    amount: Number(data.amount ?? 0),
    bookingDate,
    categoryId: String(data.categoryId ?? ""),
    receiptPath,
    hasReceipt: Boolean(receiptPath),
    receiptNotNeeded: data.receiptNotNeeded === true,
    outgoingKind: typeof data.outgoingKind === "string" ? data.outgoingKind : "",
    reviewed: data.reviewed === true || Boolean(data.categoryId),
  };
}

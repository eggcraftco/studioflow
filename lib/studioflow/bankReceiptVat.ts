// VAT-DOC (28 Oct 2026): what the server read off a bank row's attached receipt about VAT
// (functions/bankFeed.js bankReadReceiptVat → `receiptVat` on the row). The row's automatic VAT
// (vatCodeAuto) already carries the result for every client; this is the detail the bank drawer
// shows next to it, and a mixed receipt's per-rate lines as a ready split.

export type ReceiptVat = {
  code: string | null;
  basis: string;
  rates: number[];
  lines: Array<{ rate: number; code?: string; net: number | null; vat: number | null; gross: number | null }>;
  vatAmount: number | null;
  foreign: boolean;
};

/** The reading, only when it belongs to the row's CURRENT receipt (a replaced file's reading is not shown). */
export function receiptVatFromDoc(data: Record<string, unknown>): ReceiptVat | null {
  const read = data.receiptVat as (Partial<ReceiptVat> & { path?: unknown }) | undefined;
  if (!read || typeof read !== "object" || !data.receiptPath || read.path !== data.receiptPath) return null;
  return {
    code: typeof read.code === "string" && read.code ? read.code : null,
    basis: String(read.basis || ""),
    rates: Array.isArray(read.rates) ? read.rates.filter((rate): rate is number => typeof rate === "number") : [],
    lines: Array.isArray(read.lines) ? read.lines.filter(line => line && typeof line.rate === "number") : [],
    vatAmount: typeof read.vatAmount === "number" ? read.vatAmount : null,
    foreign: read.foreign === true
  };
}

/** A mixed receipt's lines as a split of the payment: one line per rate, adding up exactly to the bank amount. */
export function receiptVatSplit(tx: { amount: number; receiptVat: ReceiptVat | null }): Array<{ amount: number; vatCode: string }> | null {
  const read = tx.receiptVat;
  if (!read || read.code !== "MX" || read.lines.length < 2 || read.lines.some(line => line.gross == null || !(line.gross > 0) || !line.code)) return null;
  const total = Math.round(Math.abs(tx.amount) * 100);
  const cents = read.lines.map(line => Math.round((line.gross as number) * 100));
  const gap = total - cents.reduce((acc, value) => acc + value, 0);
  if (Math.abs(gap) > 2) return null;   // another currency, a tip, a misread: the person splits it by hand
  cents[cents.length - 1] += gap;
  return read.lines.map((line, index) => ({ amount: cents[index] / 100, vatCode: line.code as string }));
}

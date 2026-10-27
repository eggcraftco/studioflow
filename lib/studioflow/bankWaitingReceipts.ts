// Waiting receipts ("Waiting for the bank") next to the transactions that are
// already matched — review N23. Display only: nothing here matches, attaches,
// moves or deletes anything, and nothing is written.
//
// What the review saw, and what the code says about it:
//   * The waiting item's amount was drawn as "£838.80". The document was in
//     dollars. The receipt reader (functions/bankFeed.js parseReceiptText, and
//     the ChatGPT path that shares it) reads digits, a date and some words — it
//     does not read a currency, and the waiting record has no currency field.
//     So the number is shown as the bare number on the document, and the screen
//     says the currency was not read, instead of borrowing the bank's.
//   * A matched transaction already carried a receipt for the same payment
//     (its bank text said "USD 838,80"), while the waiting copy sat in the
//     queue. The server's matcher skips transactions that already have a
//     receipt, so that waiting item can never clear itself; it just turns red
//     after 14 days. These helpers find such lookalikes so the row can say so.
//   * "Assign to a transaction" closes the waiting item (the server moves the
//     file and deletes the waiting record). Attaching a file straight onto a
//     transaction does not touch the waiting list.
//
// N23 server part (functions/bankFeed.js, 17 Oct): the reader now reads the
// document's own currency when the document states it, and the waiting
// record carries it as `documentCurrency` (null = not read; rows queued
// before that have no such field and read as unknown — never as the bank's
// GBP). A direct attach of the same file (byte-identical) now closes its
// waiting copy too. These helpers take the currency when it is known.

export type WaitingReceiptLike = { amount: number; date: string; currency?: string | null };

export type BankRowLike = {
  id: string;
  amount: number;
  currency: string;
  bookingDate: string;
  description: string;
  counterparty: string;
  receiptPath: string;
  receiptName: string;
};

export type ForeignAmount = { currency: string; amount: number };

export type WaitingReceiptLookalike<T extends BankRowLike = BankRowLike> = {
  transaction: T;
  /** "amount": the bank amount equals the document's number.
   *  "foreign": the bank's own text names that number in another currency. */
  via: "amount" | "foreign";
  foreign: ForeignAmount | null;
  /** Days between the document's date and the booking; null when the document has no date. */
  daysApart: number | null;
};

// Half a penny: two-decimal amounts that differ by a cent are different amounts.
const HALF_CENT = 0.005;

function parseLooseAmount(text: string): number {
  // "838,80" · "838.80" · "1,234.56" · "1.234,56" · "1 234,56"
  const compact = text.replace(/\s/g, "");
  const lastSep = Math.max(compact.lastIndexOf(","), compact.lastIndexOf("."));
  if (lastSep < 0) return Number(compact);
  const whole = compact.slice(0, lastSep).replace(/[.,]/g, "");
  const fraction = compact.slice(lastSep + 1);
  return Number(`${whole}.${fraction}`);
}

/**
 * The first amount in a bank's own text that equals `amount` and is written
 * next to a currency code other than the row's — "USD 838,80", "838.80 USD",
 * "EUR1.234,56". Null when the text carries no such figure.
 */
export function foreignAmountInBankText(text: string, amount: number, bankCurrency: string): ForeignAmount | null {
  if (!(amount > 0)) return null;
  const bank = String(bankCurrency || "").toUpperCase();
  const source = String(text || "");
  const number = "(\\d{1,3}(?:[ .,]\\d{3})*[.,]\\d{2}|\\d+[.,]\\d{2})";
  const patterns = [
    new RegExp(`(?<![A-Za-z])([A-Z]{3})\\s?${number}(?!\\d)`, "g"),
    new RegExp(`(?<![\\d.,])${number}\\s?([A-Z]{3})(?![A-Za-z])`, "g"),
  ];
  for (const [index, pattern] of patterns.entries()) {
    for (const match of source.matchAll(pattern)) {
      const currency = index === 0 ? match[1] : match[2];
      const value = parseLooseAmount(index === 0 ? match[2] : match[1]);
      if (!currency || currency === bank || !Number.isFinite(value)) continue;
      if (Math.abs(value - amount) < HALF_CENT) return { currency, amount: value };
    }
  }
  return null;
}

function dayNumber(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ""));
  if (!match) return null;
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

/**
 * Spending rows that already carry a receipt and could be this waiting
 * document: the same number either as the bank amount or in the bank's own
 * text under another currency, and — when the document has a date — booked
 * within `windowDays` of it. Closest first. A hint for a person to look at,
 * never a match: two purchases can legitimately cost the same.
 */
export function waitingReceiptLookalikes<T extends BankRowLike>(
  item: WaitingReceiptLike,
  transactions: readonly T[],
  windowDays = 7,
): WaitingReceiptLookalike<T>[] {
  if (!(item.amount > 0)) return [];
  const documentCurrency = documentReceiptCurrency(item.currency);
  const documentDay = dayNumber(item.date);
  const found: WaitingReceiptLookalike<T>[] = [];
  for (const transaction of transactions) {
    if (!(transaction.amount < 0) || !transaction.receiptPath) continue;
    const bookingDay = dayNumber(transaction.bookingDate);
    const daysApart = documentDay !== null && bookingDay !== null ? Math.abs(bookingDay - documentDay) : null;
    if (daysApart !== null && daysApart > windowDays) continue;
    const bankCurrency = documentReceiptCurrency(transaction.currency);
    // A known document currency that differs from the bank's: the same number is not the same amount.
    const crossCurrency = Boolean(documentCurrency && bankCurrency && documentCurrency !== bankCurrency);
    if (!crossCurrency && Math.abs(Math.abs(transaction.amount) - item.amount) < HALF_CENT) {
      found.push({ transaction, via: "amount", foreign: null, daysApart });
      continue;
    }
    const foreign = foreignAmountInBankText(`${transaction.description} ${transaction.counterparty}`, item.amount, transaction.currency);
    if (foreign && (!documentCurrency || foreign.currency === documentCurrency)) found.push({ transaction, via: "foreign", foreign, daysApart });
  }
  return found.sort((a, b) => (a.daysApart ?? 99) - (b.daysApart ?? 99));
}

/** The document's number as written, two decimals, no currency (none was read). */
export function documentAmountText(amount: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

/** The document currency the server read ("USD"), or null when it was not read / the row predates it. */
export function documentReceiptCurrency(value: unknown): string | null {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** "USD 838.80" when the document's currency was read; null otherwise (show the bare number + "currency not read"). */
export function documentAmountWithCurrency(amount: number, currency: unknown, locale?: string): string | null {
  const code = documentReceiptCurrency(currency);
  return code ? `${code} ${documentAmountText(amount, locale)}` : null;
}

// RCPT-1 (27 Oct): the payment the server's matcher (functions/bankFeed.js
// matchWaitingReceipts) thinks a waiting receipt belongs to, when its evidence
// is short of N23's attach-alone rule — the document's currency was not read,
// no merchant word is in the bank text, or the payment was booked 5-7 days
// after the receipt. The server sets and clears `suggestion` on the waiting
// row and tells the owner once; the screen shows it and offers the one-tap
// attach (the existing bankAssignInboxReceipt). Display only, like the rest here.
export type WaitingSuggestion = { transactionId: string; bookingDate: string; amount: number; currency: string; merchant: string; reason: string };

export function waitingSuggestionFrom(value: unknown): WaitingSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const transactionId = typeof data.transactionId === "string" ? data.transactionId.trim() : "";
  if (!transactionId) return null;
  return {
    transactionId,
    bookingDate: String(data.bookingDate || ""),
    amount: Number(data.amount) || 0,
    currency: String(data.currency || ""),
    merchant: String(data.merchant || ""),
    reason: String(data.reason || "")
  };
}

const WAITING_SUGGESTION_REASONS: Record<string, string> = {
  currency_not_read: "Not attached on its own: the receipt's currency could not be read.",
  no_merchant_word: "Not attached on its own: the merchant name on the receipt does not appear in the bank text.",
  booked_later: "Not attached on its own: the payment was booked more than 4 days after the receipt's date.",
  needs_confirmation: "Not attached on its own: please confirm it is this payment."
};

/** The English sentence (a translation key) for why the server stopped short. */
export function waitingSuggestionReason(reason: string): string {
  return WAITING_SUGGESTION_REASONS[reason] || WAITING_SUGGESTION_REASONS.needs_confirmation;
}

/** The suggested payment, only while it is in the feed and still has no receipt. */
export function suggestedPaymentFor<T extends { id: string; receiptPath: string }>(suggestion: WaitingSuggestion | null, transactions: readonly T[]): T | null {
  if (!suggestion) return null;
  const found = transactions.find((tx) => tx.id === suggestion.transactionId) ?? null;
  return found && !found.receiptPath ? found : null;
}

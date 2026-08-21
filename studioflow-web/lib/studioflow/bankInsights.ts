// Recurring-spend detection over the imported bank feed. Pure computation —
// runs on the client from the transactions the page already subscribes to,
// shared by /bank and the dashboard Bank Activity card.

export type BankInsightTx = {
  amount: number;
  currency: string;
  bookingDate: string; // YYYY-MM-DD
  counterparty: string;
  description: string;
};

export type RecurringCadence = "weekly" | "monthly" | "yearly";

export type RecurringSpend = {
  key: string;
  merchant: string;
  cadence: RecurringCadence;
  typicalAmount: number;
  currency: string;
  occurrences: number;
  lastDate: string;
  nextExpected: string;
  // True while payments keep arriving on schedule; false once one looks missed
  // (possibly cancelled) — shown dimmed instead of dropped, so cancellations
  // are visible too.
  active: boolean;
  monthlyEquivalent: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function recurringMerchantKey(tx: BankInsightTx): string {
  const base = (tx.counterparty || tx.description).trim().toLowerCase();
  if (!base) return "";
  // Strip trailing reference-looking noise so "ADOBE *8123" and "ADOBE *9911"
  // group together: keep the first three words, drop digit-heavy tokens.
  const words = base.split(/\s+/).filter(word => !/\d{3,}/.test(word)).slice(0, 3);
  return words.join(" ");
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function parseDay(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}

function cadenceForInterval(days: number): RecurringCadence | null {
  if (days >= 5.5 && days <= 8.5) return "weekly";
  if (days >= 24 && days <= 38) return "monthly";
  if (days >= 330 && days <= 400) return "yearly";
  return null;
}

const CADENCE_DAYS: Record<RecurringCadence, number> = { weekly: 7, monthly: 30.44, yearly: 365.25 };
const MONTHLY_FACTOR: Record<RecurringCadence, number> = { weekly: 4.345, monthly: 1, yearly: 1 / 12 };

export function detectRecurringSpends(transactions: BankInsightTx[]): RecurringSpend[] {
  const groups = new Map<string, { tx: BankInsightTx; time: number }[]>();
  for (const tx of transactions) {
    if (tx.amount >= 0 || !tx.bookingDate) continue;
    const key = recurringMerchantKey(tx);
    if (!key || key.length < 3) continue;
    const list = groups.get(key) ?? [];
    list.push({ tx, time: parseDay(tx.bookingDate) });
    groups.set(key, list);
  }

  const results: RecurringSpend[] = [];
  for (const [key, entries] of groups) {
    if (entries.length < 3) continue;
    entries.sort((a, b) => a.time - b.time);

    // De-duplicate same-day pairs (split payments) before measuring intervals.
    const unique = entries.filter((entry, index) => index === 0 || entry.time !== entries[index - 1].time);
    if (unique.length < 3) continue;

    const intervals = unique.slice(1).map((entry, index) => (entry.time - unique[index].time) / DAY_MS);
    const cadence = cadenceForInterval(median(intervals));
    if (!cadence) continue;

    // A subscription keeps its cadence: most gaps must agree with the median.
    const expected = CADENCE_DAYS[cadence];
    const agreeing = intervals.filter(days => cadenceForInterval(days) === cadence).length;
    if (agreeing / intervals.length < 0.6) continue;

    const amounts = unique.map(entry => Math.abs(entry.tx.amount));
    const typicalAmount = median(amounts);
    // Amounts should be stable-ish (±30% of median for most charges) — this
    // keeps a weekly grocery run out while letting utilities vary a little.
    const stable = amounts.filter(value => Math.abs(value - typicalAmount) <= typicalAmount * 0.3).length;
    if (stable / amounts.length < 0.6) continue;

    const last = unique[unique.length - 1];
    const nextTime = last.time + expected * DAY_MS;
    const active = Date.now() - last.time <= expected * DAY_MS * 1.6;

    results.push({
      key,
      merchant: last.tx.counterparty || last.tx.description,
      cadence,
      typicalAmount,
      currency: last.tx.currency || "GBP",
      occurrences: unique.length,
      lastDate: last.tx.bookingDate,
      nextExpected: new Date(nextTime).toISOString().slice(0, 10),
      active,
      monthlyEquivalent: typicalAmount * MONTHLY_FACTOR[cadence]
    });
  }

  return results.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
}

export function monthlyFixedTotal(recurring: RecurringSpend[]): number {
  return recurring.filter(item => item.active).reduce((acc, item) => acc + item.monthlyEquivalent, 0);
}

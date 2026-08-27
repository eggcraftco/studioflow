// Recurring-spend detection over the imported bank feed. Pure computation —
// runs on the client from the transactions the page already subscribes to,
// shared by /bank and the dashboard Bank Activity card.

export type BankInsightTx = {
  id?: string;
  amount: number;
  currency: string;
  bookingDate: string; // YYYY-MM-DD
  counterparty: string;
  description: string;
};

export type RecurringCadence = "weekly" | "monthly" | "yearly";

/**
 * Owner-defined vendor: merges the bank names that mean the same payee and can
 * mark the payment as repeating even when the dates wander (payroll, rent paid
 * by hand). Automatic detection never sees either of those on its own.
 */
export type BankVendor = { id: string; name: string; keys: string[]; cadence: RecurringCadence };

export type RecurringSpend = {
  key: string;
  merchant: string;
  /** Set when the group comes from an owner-defined vendor rather than detection. */
  vendorId?: string;
  manual?: boolean;
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
  // Set when the latest charge differs noticeably from what this merchant
  // usually costs (price increase/decrease on a subscription).
  priceChange: { previous: number; current: number } | null;
  // Report §23 fields: when the pattern was first/last seen, how much the
  // amount wanders, roughly which day it lands on, and how sure we are.
  firstDate: string;
  amountMin: number;
  amountMax: number;
  /** For monthly patterns: the typical day-of-month payments land on (1-31). */
  expectedDayOfMonth: number | null;
  /** high = 4+ agreeing payments with stable amounts; medium = detected; low = owner-marked with little history. */
  confidence: "high" | "medium" | "low";
};

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- Input VAT (reclaimable VAT inside bank spending) -----------------------
// VAT sits INSIDE a UK price, so it is extracted from the gross rather than
// added on top: £120 at 20% carries £20 of VAT, not £24. Mirrors
// vatFromGrossAmount() on the server (the "VAT inclusive fix") — same formula,
// same 2-decimal rounding, so dashboard figures agree with invoices.
export function vatFromGross(grossAmount: number, ratePercent: number): number {
  if (!(ratePercent > 0)) return 0;
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) return 0;
  return Math.round(((grossAmount * ratePercent) / (100 + ratePercent)) * 100) / 100;
}

/**
 * The VAT treatments from the bank page's VAT_CODES that carry a percentage a
 * business can reclaim from the gross paid: Standard rate (ST, 20%) and
 * Reduced rate (RR, 5%). ZR/EX/OS/NV have no VAT inside the price, NR has no
 * VAT receipt to reclaim against, RC nets out on the return, IM and MX are not
 * derivable from the gross alone (MX resolves through its split lines).
 */
export const RECLAIMABLE_VAT_RATES: Record<string, number> = { ST: 20, RR: 5 };

export type VatCodedBankTx = {
  amount: number;
  vatCode?: string;
  vatCodeAuto?: string;
  splits?: Array<{ amount: number; vatCode?: string }>;
};

/**
 * Reclaimable input VAT contained in one outgoing bank transaction. Split
 * transactions resolve per line (each split carries its own vatCode, amounts
 * stored positive); otherwise the owner's vatCode wins over the auto one —
 * the same precedence the bank page uses.
 */
export function reclaimableVatForTx(tx: VatCodedBankTx): number {
  if (tx.amount >= 0) return 0;
  if (tx.splits && tx.splits.length > 0) {
    return tx.splits.reduce((total, split) => {
      const rate = RECLAIMABLE_VAT_RATES[split.vatCode || ""] ?? 0;
      return total + vatFromGross(Math.abs(split.amount), rate);
    }, 0);
  }
  const rate = RECLAIMABLE_VAT_RATES[tx.vatCode || tx.vatCodeAuto || ""] ?? 0;
  return vatFromGross(Math.abs(tx.amount), rate);
}

/** merchant key → vendor, so aliases collapse into one group everywhere. */
export function vendorKeyMap(vendors: BankVendor[]): Map<string, BankVendor> {
  const map = new Map<string, BankVendor>();
  for (const vendor of vendors) for (const key of vendor.keys) map.set(key, vendor);
  return map;
}

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

export function detectRecurringSpends(transactions: BankInsightTx[], vendors: BankVendor[] = []): RecurringSpend[] {
  const byKey = vendorKeyMap(vendors);
  const groups = new Map<string, { tx: BankInsightTx; time: number }[]>();
  for (const tx of transactions) {
    if (tx.amount >= 0 || !tx.bookingDate) continue;
    const rawKey = recurringMerchantKey(tx);
    if (!rawKey || rawKey.length < 3) continue;
    // Aliases collapse: every bank name the owner grouped shares one bucket.
    const key = byKey.get(rawKey)?.id ?? rawKey;
    const list = groups.get(key) ?? [];
    list.push({ tx, time: parseDay(tx.bookingDate) });
    groups.set(key, list);
  }

  const results: RecurringSpend[] = [];
  for (const [key, entries] of groups) {
    const vendor = vendors.find(item => item.id === key);
    // An owner-marked vendor is taken at its word: one payment is enough and the
    // gap/amount tests are skipped, because payroll and rent are paid by hand.
    if (entries.length < (vendor ? 1 : 3)) continue;
    entries.sort((a, b) => a.time - b.time);

    // De-duplicate same-day pairs (split payments) before measuring intervals.
    const unique = entries.filter((entry, index) => index === 0 || entry.time !== entries[index - 1].time);
    if (unique.length < (vendor ? 1 : 3)) continue;

    const intervals = unique.slice(1).map((entry, index) => (entry.time - unique[index].time) / DAY_MS);
    const cadence = vendor?.cadence ?? cadenceForInterval(median(intervals));
    if (!cadence) continue;

    const expected = CADENCE_DAYS[cadence];
    if (!vendor) {
      // A subscription keeps its cadence: most gaps must agree with the median.
      const agreeing = intervals.filter(days => cadenceForInterval(days) === cadence).length;
      if (agreeing / intervals.length < 0.6) continue;
    }

    const amounts = unique.map(entry => Math.abs(entry.tx.amount));
    const typicalAmount = median(amounts);
    if (!vendor) {
      // Amounts should be stable-ish (±30% of median for most charges) — this
      // keeps a weekly grocery run out while letting utilities vary a little.
      const stable = amounts.filter(value => Math.abs(value - typicalAmount) <= typicalAmount * 0.3).length;
      if (stable / amounts.length < 0.6) continue;
    }

    const last = unique[unique.length - 1];
    const nextTime = last.time + expected * DAY_MS;
    // Hand-paid vendors get a longer grace period before they read as stopped.
    const active = Date.now() - last.time <= expected * DAY_MS * (vendor ? 2.4 : 1.6);
    // Price change: the latest charge vs the median of the earlier ones.
    const previousTypical = median(amounts.slice(0, -1));
    const lastAmount = amounts[amounts.length - 1];
    const priceChange = previousTypical > 0 && Math.abs(lastAmount - previousTypical) >= Math.max(0.5, previousTypical * 0.05)
      ? { previous: previousTypical, current: lastAmount }
      : null;

    const stableCount = amounts.filter(value => Math.abs(value - typicalAmount) <= typicalAmount * 0.3).length;
    const confidence: RecurringSpend["confidence"] = vendor && unique.length < 3
      ? "low"
      : unique.length >= 4 && stableCount / amounts.length >= 0.8
        ? "high"
        : "medium";
    const dayCounts = new Map<number, number>();
    if (cadence === "monthly") {
      for (const entry of unique) {
        const day = new Date(entry.time).getDate();
        dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
      }
    }
    const expectedDayOfMonth = cadence === "monthly"
      ? [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      : null;

    results.push({
      key,
      merchant: vendor?.name || last.tx.counterparty || last.tx.description,
      vendorId: vendor?.id,
      manual: Boolean(vendor),
      cadence,
      typicalAmount,
      currency: last.tx.currency || "GBP",
      occurrences: unique.length,
      lastDate: last.tx.bookingDate,
      nextExpected: new Date(nextTime).toISOString().slice(0, 10),
      active,
      monthlyEquivalent: typicalAmount * MONTHLY_FACTOR[cadence],
      priceChange,
      firstDate: unique[0].tx.bookingDate,
      amountMin: Math.min(...amounts),
      amountMax: Math.max(...amounts),
      expectedDayOfMonth,
      confidence
    });
  }

  return results.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
}

export function monthlyFixedTotal(recurring: RecurringSpend[]): number {
  return recurring.filter(item => item.active).reduce((acc, item) => acc + item.monthlyEquivalent, 0);
}

// Possible duplicates: same merchant, same amount, booked within two days of
// each other. Returns the ids involved (both sides of every pair).
export function detectPossibleDuplicates(transactions: BankInsightTx[]): Set<string> {
  const flagged = new Set<string>();
  const byKey = new Map<string, BankInsightTx[]>();
  for (const tx of transactions) {
    if (!tx.id || tx.amount >= 0 || !tx.bookingDate) continue;
    const key = `${recurringMerchantKey(tx)}|${Math.abs(tx.amount).toFixed(2)}`;
    const list = byKey.get(key) ?? [];
    list.push(tx);
    byKey.set(key, list);
  }
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));
    for (let index = 1; index < sorted.length; index += 1) {
      const gap = (parseDay(sorted[index].bookingDate) - parseDay(sorted[index - 1].bookingDate)) / DAY_MS;
      if (gap <= 2) {
        flagged.add(sorted[index - 1].id as string);
        flagged.add(sorted[index].id as string);
      }
    }
  }
  return flagged;
}

// ---- Category suggestions ---------------------------------------------------
// Heuristic, no AI cost: (1) what the owner chose for the same merchant before,
// (2) a small keyword library for common UK business merchants.

export type CategorySuggestion = { category: string; confidence: number; source: "history" | "keyword"; keyword: string };

const CATEGORY_KEYWORDS: Array<{ category: string; words: string[] }> = [
  { category: "Software", words: ["adobe", "openai", "anthropic", "google*gsuite", "gsuite", "google workspace", "microsoft", "eset", "akismet", "github", "notion", "figma", "canva", "dropbox", "icloud", "apple.com/bill", "zoom", "slack", "1password", "cloudflare", "godaddy", "hostinger", "ionos"] },
  { category: "Subscriptions", words: ["shopify", "squarespace", "wix", "spotify", "netflix", "cookieyes", "creem.io", "patreon", "membership", "subscription"] },
  { category: "Shipping", words: ["royal mail", "dhl", "ups", "fedex", "evri", "hermes", "parcelforce", "parcel2go", "dpd", "click and drop", "postage"] },
  { category: "Fees", words: ["stripe", "paypal", "non-sterling", "transaction fee", "bank charge", "sumup", "square", "klarna", "wise"] },
  { category: "Marketing", words: ["facebk", "facebook", "meta ads", "google ads", "adwords", "instagram", "mailchimp", "linkedin", "etsy ads", "tiktok"] },
  { category: "Travel", words: ["uber", "trainline", "tfl", "national rail", "easyjet", "ryanair", "british airways", "bp ", "shell ", "esso", "texaco", "parking", "ringgo", "just park"] },
  { category: "Utilities", words: ["octopus", "edf", "british gas", "eon", "ovo", "thames water", "vodafone", "ee ltd", "o2 ", "three", "bt group", "virgin media", "sky "] },
  { category: "Tax", words: ["hmrc"] },
  { category: "Rent", words: ["rent", "lovespace", "storage", "wework", "regus"] },
  { category: "Materials", words: ["cousinsuk", "cousins uk", "amazon", "amzn", "ebay", "screwfix", "toolstation", "hobbycraft", "b&q", "wickes", "ikea"] },
  { category: "Equipment", words: ["apple store", "currys", "argos"] }
];

export function suggestCategory(
  tx: BankInsightTx & { category?: string; categoryAuto?: string },
  history: Array<BankInsightTx & { category?: string }>
): CategorySuggestion | null {
  if (tx.amount >= 0) return null;
  const key = recurringMerchantKey(tx);
  if (key) {
    // Same merchant, manually categorised before → strongest signal.
    const counts = new Map<string, number>();
    for (const other of history) {
      if (!other.category || other === tx) continue;
      if (recurringMerchantKey(other) !== key) continue;
      counts.set(other.category, (counts.get(other.category) ?? 0) + 1);
    }
    let best: [string, number] | null = null;
    for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
    if (best) return { category: best[0], confidence: Math.min(0.97, 0.8 + best[1] * 0.05), source: "history", keyword: key.split(" ")[0] || key };
  }
  const haystack = `${tx.counterparty} ${tx.description}`.toLowerCase();
  for (const group of CATEGORY_KEYWORDS) {
    const hit = group.words.find(word => haystack.includes(word));
    if (hit) return { category: group.category, confidence: 0.7, source: "keyword", keyword: hit.trim() };
  }
  return null;
}

// ---- Order link suggestions -------------------------------------------------
// Which order a spend probably belongs to: orders that were open around the
// booking date, boosted by name/customer words appearing in the bank line.

export type OrderCandidate = { id: string; customerName: string; designName: string; status: string; paymentDate: Date | null };
export type OrderLinkSuggestion = { orderId: string; label: string; confidence: number };

const ORDER_UNRELATED_CATEGORIES = new Set(["Subscriptions", "Software", "Fees", "Rent", "Utilities", "Tax", "Staff", "Marketing"]);

export function rankOrdersForTransaction(
  tx: BankInsightTx & { category?: string; categoryAuto?: string },
  orders: OrderCandidate[]
): Array<{ order: OrderCandidate; score: number }> {
  if (!tx.bookingDate) return orders.map(order => ({ order, score: 0 }));
  const txTime = parseDay(tx.bookingDate);
  const words = new Set(`${tx.counterparty} ${tx.description}`.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 4));
  const open = orders.filter(order => {
    if (/cancel/i.test(order.status) || !order.paymentDate) return false;
    const days = (txTime - order.paymentDate.getTime()) / DAY_MS;
    return days >= -7 && days <= 60; // created up to 60 days before the spend (or a week after)
  });
  const openIds = new Set(open.map(order => order.id));
  const ranked = orders.map(order => {
    let score = 0;
    if (openIds.has(order.id) && order.paymentDate) {
      const days = Math.abs((txTime - order.paymentDate.getTime()) / DAY_MS);
      score = days <= 7 ? 30 : days <= 14 ? 20 : days <= 30 ? 10 : 5;
      // Few orders open at the time → the spend is probably for one of them.
      if (open.length === 1) score += 25; else if (open.length <= 3) score += 15;
    }
    const orderWords = `${order.customerName} ${order.designName}`.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 4);
    const overlap = orderWords.filter(word => words.has(word)).length;
    score += Math.min(2, overlap) * 30;
    return { order, score };
  });
  return ranked.sort((a, b) => b.score - a.score || (b.order.paymentDate?.getTime() ?? 0) - (a.order.paymentDate?.getTime() ?? 0));
}

export function suggestOrderLink(
  tx: BankInsightTx & { category?: string; categoryAuto?: string },
  orders: OrderCandidate[]
): OrderLinkSuggestion | null {
  if (tx.amount >= 0 || !tx.bookingDate) return null;
  const category = tx.category || tx.categoryAuto || "";
  if (ORDER_UNRELATED_CATEGORIES.has(category)) return null;
  const best = rankOrdersForTransaction(tx, orders)[0];
  if (!best || best.score < 40) return null;
  const label = best.order.designName && best.order.designName !== "Untitled design"
    ? `${best.order.customerName} · ${best.order.designName}`
    : best.order.customerName;
  return { orderId: best.order.id, label, confidence: Math.min(0.95, best.score / 100) };
}

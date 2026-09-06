"use strict";

/**
 * The bank-row rules that were only ever in the browser.
 *
 * `studioflow-web/lib/studioflow/bankInsights.ts` decides what counts as a
 * duplicate charge, what counts as a recurring spend, and when a recurring
 * spend's price has changed. The Banking screens have shown those for months;
 * the assistant could not, because the rules lived in a React bundle. This is a
 * port of the three that §12 asks for, kept deliberately close to the original
 * so the two can be compared line by line — the way `bank/classification.js`
 * mirrors its client copies.
 *
 * Two differences from the browser copy, both deliberate:
 *
 *  - days are parsed as UTC here (the browser parses them in the viewer's local
 *    zone). Every rule below measures DIFFERENCES between days, so the offset
 *    cancels; using local time on a server would instead make the answer depend
 *    on which region the function happened to run in.
 *  - `now` is passed in rather than read from the clock, so a test can pin
 *    "is this subscription still active" instead of racing it.
 *
 * Pure: no Firestore, no admin, no config.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const CADENCE_DAYS = Object.freeze({ weekly: 7, monthly: 30.44, yearly: 365.25 });
const MONTHLY_FACTOR = Object.freeze({ weekly: 4.345, monthly: 1, yearly: 1 / 12 });

/** A merchant key that survives the reference noise banks append. */
function recurringMerchantKey(tx = {}) {
  const base = String(tx.counterparty || tx.description || "").trim().toLowerCase();
  if (!base) return "";
  return base.split(/\s+/).filter((word) => !/\d{3,}/.test(word)).slice(0, 3).join(" ");
}

function median(values = []) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((lhs, rhs) => lhs - rhs);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function parseDay(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN;
}

function cadenceForInterval(days) {
  if (days >= 5.5 && days <= 8.5) return "weekly";
  if (days >= 24 && days <= 38) return "monthly";
  if (days >= 330 && days <= 400) return "yearly";
  return null;
}

/** Same merchant, same amount, within two days: both sides of every pair. */
function detectPossibleDuplicates(transactions = []) {
  const flagged = new Set();
  const byKey = new Map();
  for (const tx of transactions) {
    if (!tx || !tx.id || Number(tx.amount) >= 0 || !tx.bookingDate) continue;
    const key = `${recurringMerchantKey(tx)}|${Math.abs(Number(tx.amount)).toFixed(2)}|${String(tx.currency || "").toUpperCase()}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(tx);
  }
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((lhs, rhs) => String(lhs.bookingDate).localeCompare(String(rhs.bookingDate)));
    for (let index = 1; index < sorted.length; index += 1) {
      const gap = (parseDay(sorted[index].bookingDate) - parseDay(sorted[index - 1].bookingDate)) / DAY_MS;
      if (gap <= 2) {
        flagged.add(String(sorted[index - 1].id));
        flagged.add(String(sorted[index].id));
      }
    }
  }
  return flagged;
}

/**
 * Recurring spends, with whether the price moved and whether the charge has
 * stopped arriving. An owner-marked vendor is taken at its word (payroll and
 * rent are paid by hand and do not keep a machine's cadence).
 */
function detectRecurringSpends(transactions = [], vendors = [], { now = Date.now() } = {}) {
  const byKey = new Map();
  for (const vendor of vendors) {
    for (const key of (Array.isArray(vendor.keys) ? vendor.keys : [])) byKey.set(key, vendor);
  }

  const groups = new Map();
  for (const tx of transactions) {
    if (!tx || Number(tx.amount) >= 0 || !tx.bookingDate) continue;
    const rawKey = recurringMerchantKey(tx);
    if (!rawKey || rawKey.length < 3) continue;
    const key = byKey.has(rawKey) ? byKey.get(rawKey).id : rawKey;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ tx, time: parseDay(tx.bookingDate) });
  }

  const results = [];
  for (const [key, entries] of groups) {
    const vendor = vendors.find((item) => item && item.id === key) || null;
    if (entries.length < (vendor ? 1 : 3)) continue;
    entries.sort((lhs, rhs) => lhs.time - rhs.time);

    const unique = entries.filter((entry, index) => index === 0 || entry.time !== entries[index - 1].time);
    if (unique.length < (vendor ? 1 : 3)) continue;

    const intervals = unique.slice(1).map((entry, index) => (entry.time - unique[index].time) / DAY_MS);
    const cadence = (vendor && vendor.cadence) || cadenceForInterval(median(intervals));
    if (!cadence || !CADENCE_DAYS[cadence]) continue;

    const expected = CADENCE_DAYS[cadence];
    if (!vendor) {
      const agreeing = intervals.filter((days) => cadenceForInterval(days) === cadence).length;
      if (intervals.length === 0 || agreeing / intervals.length < 0.6) continue;
    }

    const amounts = unique.map((entry) => Math.abs(Number(entry.tx.amount) || 0));
    const typicalAmount = median(amounts);
    if (!vendor) {
      const stable = amounts.filter((value) => Math.abs(value - typicalAmount) <= typicalAmount * 0.3).length;
      if (stable / amounts.length < 0.6) continue;
    }

    const last = unique[unique.length - 1];
    const active = now - last.time <= expected * DAY_MS * (vendor ? 2.4 : 1.6);
    const previousTypical = median(amounts.slice(0, -1));
    const lastAmount = amounts[amounts.length - 1];
    const priceChange = previousTypical > 0 && Math.abs(lastAmount - previousTypical) >= Math.max(0.5, previousTypical * 0.05)
      ? { previous: previousTypical, current: lastAmount }
      : null;

    results.push({
      key,
      merchant: (vendor && vendor.name) || String(last.tx.counterparty || last.tx.description || ""),
      vendorId: vendor ? vendor.id : null,
      manual: Boolean(vendor),
      cadence,
      typicalAmount,
      currency: String(last.tx.currency || "GBP").toUpperCase(),
      occurrences: unique.length,
      lastDate: String(last.tx.bookingDate || ""),
      nextExpected: new Date(last.time + expected * DAY_MS).toISOString().slice(0, 10),
      active,
      monthlyEquivalent: typicalAmount * MONTHLY_FACTOR[cadence],
      priceChange,
      transactionIds: unique.map((entry) => String(entry.tx.id || "")).filter(Boolean)
    });
  }

  return results.sort((lhs, rhs) => rhs.monthlyEquivalent - lhs.monthlyEquivalent);
}

/**
 * An unusually large charge for this vendor. There is no rule for this anywhere
 * in the product, so it is defined here rather than guessed at call time:
 * more than three times the vendor's median over its last twelve rows, AND over
 * 100 units — compared strictly WITHIN one currency, because a 3× test across a
 * £/$ mix measures the exchange rate rather than the charge.
 */
function detectUnusualCharges(transactions = [], { multiple = 3, floor = 100 } = {}) {
  const groups = new Map();
  for (const tx of transactions) {
    if (!tx || Number(tx.amount) >= 0 || !tx.bookingDate) continue;
    const merchant = recurringMerchantKey(tx);
    if (!merchant) continue;
    const key = `${merchant}|${String(tx.currency || "GBP").toUpperCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }
  const unusual = [];
  for (const [, list] of groups) {
    if (list.length < 4) continue;
    const sorted = [...list].sort((lhs, rhs) => String(rhs.bookingDate).localeCompare(String(lhs.bookingDate)));
    const window = sorted.slice(0, 12);
    const amounts = window.map((tx) => Math.abs(Number(tx.amount) || 0));
    const typical = median(amounts);
    if (typical <= 0) continue;
    for (const tx of window) {
      const amount = Math.abs(Number(tx.amount) || 0);
      if (amount >= typical * multiple && amount > floor) {
        unusual.push({
          id: String(tx.id || ""),
          merchant: recurringMerchantKey(tx),
          amount,
          currency: String(tx.currency || "GBP").toUpperCase(),
          typical,
          bookingDate: String(tx.bookingDate || "")
        });
      }
    }
  }
  return unusual;
}

/**
 * A pair of rows that is probably the owner moving their own money: equal
 * absolute amounts, opposite signs, within two days, on different accounts, and
 * not already labelled as a transfer.
 */
function detectPossibleTransfers(transactions = [], { withinDays = 2 } = {}) {
  const pairs = [];
  const outgoing = transactions.filter((tx) => tx && Number(tx.amount) < 0 && tx.bookingDate);
  const incoming = transactions.filter((tx) => tx && Number(tx.amount) > 0 && tx.bookingDate);
  const used = new Set();
  for (const out of outgoing) {
    if (String(out.outgoingKind || "") === "transfer") continue;
    const outDay = parseDay(out.bookingDate);
    const match = incoming.find((into) => {
      if (used.has(String(into.id))) return false;
      if (String(into.incomingKind || "") === "transfer") return false;
      if (String(into.accountId || "") === String(out.accountId || "")) return false;
      if (String(into.currency || "").toUpperCase() !== String(out.currency || "").toUpperCase()) return false;
      if (Math.abs(Math.abs(Number(into.amount)) - Math.abs(Number(out.amount))) > 0.005) return false;
      return Math.abs(parseDay(into.bookingDate) - outDay) <= withinDays * DAY_MS;
    });
    if (!match) continue;
    used.add(String(match.id));
    pairs.push({
      outId: String(out.id || ""),
      inId: String(match.id || ""),
      amount: Math.abs(Number(out.amount) || 0),
      currency: String(out.currency || "GBP").toUpperCase(),
      bookingDate: String(out.bookingDate || "")
    });
  }
  return pairs;
}

module.exports = {
  DAY_MS,
  CADENCE_DAYS,
  MONTHLY_FACTOR,
  recurringMerchantKey,
  median,
  parseDay,
  cadenceForInterval,
  detectPossibleDuplicates,
  detectRecurringSpends,
  detectUnusualCharges,
  detectPossibleTransfers
};

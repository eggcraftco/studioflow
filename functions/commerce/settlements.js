"use strict";
// Settlements — a processor payout (Square today, PayPal/Stripe tomorrow) landing
// on the bank feed is not revenue: the sales behind it were counted when they
// happened. Matching the payout to the bank row is what stops the money being
// counted twice, and it is the one place the two feeds meet.
//
// Pure: scoring and picking only. Reading and writing is the orchestrator's job.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Words a provider's bank credit carries in its description or counterparty. */
const PROVIDER_KEYWORDS = Object.freeze({
  square: ["SQUAREUP", "SQUARE", "SQ *", "SQ*"],
  paypal: ["PAYPAL", "PP*"],
  stripe: ["STRIPE"]
});

/** How far apart the bank's booking date and the processor's arrival date may be. */
const MAX_DATE_SHIFT_DAYS = 3;
/** An automatic match needs this much, and this much daylight over the runner-up. */
const AUTO_MATCH_SCORE = 85;
const AUTO_MATCH_MARGIN = 15;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const dayOf = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
const upper = (value) => String(value || "").toUpperCase();

/** The bank window a payout may land in: the arrival date and a few days either side (posting lags, weekends). */
function settlementWindow(payout) {
  const arrival = dayOf(payout?.arrivalDate) ?? dayOf(payout?.externalCreatedAt);
  if (arrival === null) return null;
  const from = new Date(arrival - MAX_DATE_SHIFT_DAYS * DAY_MS).toISOString().slice(0, 10);
  const to = new Date(arrival + MAX_DATE_SHIFT_DAYS * DAY_MS).toISOString().slice(0, 10);
  return { from, to };
}

/**
 * Score one bank row against one payout. Hard gates first (money in, exact
 * amount, same currency, inside the window); then the date shift and the
 * provider's own words decide between rows of the same amount.
 */
function scoreSettlementCandidate(payout, tx, { provider = "square" } = {}) {
  const reasons = [];
  const txAmount = round2(tx?.amount);
  const payoutAmount = round2(payout?.amount);
  if (!(txAmount > 0)) return { ok: false, score: 0, reasons: ["money_out"] };
  if (!(payoutAmount > 0)) return { ok: false, score: 0, reasons: ["payout_amount_missing"] };
  if (Math.abs(txAmount - payoutAmount) > 0.005) return { ok: false, score: 0, reasons: ["amount_differs"] };
  const txCurrency = upper(tx?.currency); const payoutCurrency = upper(payout?.currency);
  if (txCurrency && payoutCurrency && txCurrency !== payoutCurrency) return { ok: false, score: 0, reasons: ["currency_differs"] };
  const arrival = dayOf(payout?.arrivalDate) ?? dayOf(payout?.externalCreatedAt);
  const booked = dayOf(tx?.bookingDate);
  if (arrival === null || booked === null) return { ok: false, score: 0, reasons: ["date_missing"] };
  const shift = Math.round(Math.abs(booked - arrival) / DAY_MS);
  if (shift > MAX_DATE_SHIFT_DAYS) return { ok: false, score: 0, reasons: ["outside_window"] };
  let score = 100 - shift * 15;
  reasons.push(shift === 0 ? "same_day" : `shift_${shift}d`);
  const text = `${upper(tx?.description)} ${upper(tx?.counterparty)} ${upper(tx?.providerReference)}`;
  const words = PROVIDER_KEYWORDS[provider] || [];
  if (words.some((w) => text.includes(w))) { score += 20; reasons.push("provider_keyword"); }
  const refs = [payout?.endToEndId, payout?.externalId].map(upper).filter((r) => r.length >= 6);
  if (refs.some((r) => text.includes(r))) { score += 25; reasons.push("reference"); }
  return { ok: true, score: Math.min(150, score), reasons };
}

/**
 * Pick the row a payout settled into, or say why not: no candidate, or two
 * that cannot be told apart (same amount, same days — the owner decides).
 */
function pickSettlementMatch(payout, transactions, options = {}) {
  const scored = (Array.isArray(transactions) ? transactions : [])
    .map((tx) => ({ tx, ...scoreSettlementCandidate(payout, tx, options) }))
    .filter((c) => c.ok)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { match: null, candidates: [], reason: "no_candidate" };
  const [best, second] = scored;
  if (best.score < AUTO_MATCH_SCORE) return { match: null, candidates: scored, reason: "low_score" };
  if (second && best.score - second.score < AUTO_MATCH_MARGIN) return { match: null, candidates: scored, reason: "ambiguous" };
  return { match: best, candidates: scored, reason: "auto" };
}

module.exports = { scoreSettlementCandidate, pickSettlementMatch, settlementWindow, PROVIDER_KEYWORDS, MAX_DATE_SHIFT_DAYS, AUTO_MATCH_SCORE, AUTO_MATCH_MARGIN };

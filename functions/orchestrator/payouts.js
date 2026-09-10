"use strict";

/**
 * get_payout_reconciliation_overview (§11).
 *
 * Whether the money a marketplace says it sent has been found on the bank
 * statement. This is the join that stops a payout being counted as income a
 * second time when it lands (§26), so "unmatched" is an operational fact worth
 * reporting on its own.
 *
 * Two deliberate constraints:
 *
 * 1. **Pure.** `settlementMatch.suggestForPayout` reads Firestore once per
 *    payout, so calling it here would put 25 queries inside a module this design
 *    declares pure — from a tool annotated readOnlyHint:true. The loader instead
 *    fetches the bank rows covering the union of the payout windows, and this
 *    module scores them with `commerce/settlements.scoreSettlementCandidate` —
 *    the same scorer the writer uses, so the two agree by construction.
 * 2. **`needsReview` means ambiguity, precisely.** More than one row scores as
 *    an exact candidate for the same payout: that is what `matchProviderPayouts`
 *    itself refuses to auto-match. ONE exact candidate is a match waiting to be
 *    confirmed, not a review — calling it a review would put an item in front of
 *    the owner that needs no decision.
 *
 * An operational match is never described as an accounting reconciliation
 * (§6.2): the wording is "matched with a bank line".
 */

const envelope = require("./envelope");
const freshness = require("./freshness");
const untrusted = require("./untrusted");
const settlements = require("../commerce/settlements");

/**
 * Everything on a payout document that the PROVIDER wrote.
 *
 * `externalId`, `currency` and `arrivalDate` are stored verbatim by the
 * connectors (squareConnector.js `set`s the provider's own fields), and all
 * three land in `data.unmatched[]` and `data.providers[]`, which a model reads
 * exactly the way it reads a summary line. There is no bound to lose here: a
 * payout id is an identifier, a currency is three letters and an arrival date
 * is a day.
 */
const providerString = (value, max = 64) => untrusted.safeText(value, { max });

/** Payouts that have left the processor and can be on a statement. */
const MATCHABLE_STATUSES = new Set(["PAID", "SENT"]);
/** How many unmatched payouts get candidate scoring before the answer says it stopped. */
const REVIEW_SCAN_CAP = 25;

const round2 = (value) => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;
const dayMs = (iso) => {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};

function inRange(payout, { fromMs, toMs }) {
  if (fromMs === null && toMs === null) return true;
  const at = dayMs(payout.arrivalDate || payout.externalCreatedAt);
  if (at === null) return false;
  if (fromMs !== null && at < fromMs) return false;
  if (toMs !== null && at > toMs) return false;
  return true;
}

/**
 * Whether there is a payout feed for `provider` at all — asked of the
 * CONNECTION, never of the collection.
 *
 * "Connected, no payouts yet" and "not connected" are different answers, and
 * both readers were giving them the same word. `loadPayouts` wrote a provider's
 * array only when it found rows, so a Square account linked an hour ago whose
 * first payout has not arrived came back as `provider_not_connected` from both
 * get_payout_reconciliation_overview and get_commerce_overview. That is the
 * §8/§14 degradation rule inverted: the spec warns against calling something
 * available when it is not, and the same honesty forbids calling a connected
 * processor disconnected.
 *
 * Visibility is asked FIRST, and of both providers, because a payout feed
 * nobody may read has no state this answer is entitled to describe. Payouts are
 * gated on Banking — firestore.rules gates `squarePayouts` and `paypalPayouts`
 * alike on `canReadBankFeed`, and `loaders.DOMAIN_GATES.payouts` asks the same
 * question — so without that area neither collection is on the snapshot.
 *
 * The visibility question used to be asked of PayPal alone, on the argument
 * that PayPal's rows come off a `bankConnections` document while Square's come
 * off a commerce connection. That is where a document is WRITTEN, not who may
 * read it, and the asymmetry had a consequence: a caller without Banking fell
 * through to the Square commerce connection — which they can see — and
 * `settlementTotals` answered `available: true` and totalled a collection the
 * rules file refuses them.
 *
 * Order matters as much as symmetry. Asking "is the collection empty?" before
 * "may this caller see it?" turns a refusal into `count: 0`, and a zero is a
 * claim that somebody looked.
 */
function payoutFeedState(snapshot, provider, ctx = {}) {
  if (!(ctx && ctx.areas && ctx.areas.bankFeed === true)) {
    return { available: false, reason: "connection_not_visible" };
  }

  const rows = (snapshot.payouts || {})[provider];
  if (Array.isArray(rows) && rows.length > 0) return { available: true };

  const connections = snapshot.connections || {};
  const connected = provider === "paypal"
    ? (connections.bank || []).some((row) => String((row || {}).provider || "").toLowerCase() === "paypal")
    : (connections[provider] || []).length > 0;
  if (connected) return { available: true };

  return { available: false, reason: "provider_not_connected" };
}

/** The state one payout is in. Matched-with-a-difference is its own answer. */
function matchState(payout) {
  const match = payout && payout.bankMatch;
  if (match && match.transactionId) {
    return Math.abs(Number(match.amountDelta) || 0) > 0.005 ? "partial" : "matched";
  }
  if (!MATCHABLE_STATUSES.has(String((payout || {}).status || "").toUpperCase())) return "not_matchable";
  return "unmatched";
}

function payoutReconciliation(snapshot, args = {}, ctx = {}, { nowMs = Date.now() } = {}) {
  const wanted = String(args.provider || "all").toLowerCase();
  const bounds = (() => {
    const parse = (value) => dayMs(value);
    return { fromMs: parse(args.fromDate) ?? null, toMs: parse(args.toDate) ?? null };
  })();

  // A payout read that was cut off means `inRange` is not the number of
  // payouts in the range, and "is any money missing?" cannot be answered over a
  // list nobody said was truncated.
  const warnings = [...envelope.capWarnings(snapshot)];
  const totals = { matched: 0, partial: 0, unmatched: 0, notMatchable: 0, needsReview: 0 };
  const providers = [];
  const unmatchedRows = [];
  let scanned = 0;
  let truncated = false;

  const bankRows = Array.isArray(snapshot.payoutBankRows) ? snapshot.payoutBankRows : [];

  for (const provider of ["square", "paypal"]) {
    if (wanted !== "all" && wanted !== provider) continue;
    const feed = payoutFeedState(snapshot, provider, ctx);
    if (!feed.available) {
      providers.push({ provider, available: false, reason: feed.reason });
      continue;
    }
    const list = (snapshot.payouts || {})[provider];
    const rows = (Array.isArray(list) ? list : []).filter((payout) => inRange(payout, bounds));
    const row = {
      provider, available: true,
      // Every payout in the range, so a reader can check that the states below
      // account for all of them: inRange = matched + partial + unmatched +
      // notMatchable.
      inRange: rows.length,
      matched: 0, partial: 0, unmatched: 0, notMatchable: 0, needsReview: 0,
      unmatchedAmount: 0, currency: null, oldestUnmatchedAt: null
    };

    for (const payout of rows) {
      const state = matchState(payout);
      if (state === "matched") { row.matched += 1; totals.matched += 1; continue; }
      if (state === "partial") { row.partial += 1; totals.partial += 1; continue; }
      // Neither PAID nor SENT: the money has not left the processor, so it
      // genuinely cannot be on a statement and does not belong in the match
      // counts. It was also not counted ANYWHERE, so matched + partial +
      // unmatched did not add up to the payouts in range and nothing said why.
      // "Is any money missing?" deserves "three payouts have not been sent yet"
      // as an answer, and silence is not one.
      if (state === "not_matchable") { row.notMatchable += 1; totals.notMatchable += 1; continue; }
      if (state !== "unmatched") continue;

      row.unmatched += 1;
      totals.unmatched += 1;
      row.unmatchedAmount += Number(payout.amount) || 0;
      row.currency = row.currency || (payout.currency ? providerString(payout.currency, 12).toUpperCase() : null);
      const arrival = providerString(payout.arrivalDate || payout.externalCreatedAt, 32) || null;
      if (arrival && (!row.oldestUnmatchedAt || arrival < row.oldestUnmatchedAt)) row.oldestUnmatchedAt = arrival;

      let candidateCount = null;
      if (scanned < REVIEW_SCAN_CAP) {
        scanned += 1;
        const window = settlements.settlementWindow(payout);
        const inWindow = window
          ? bankRows.filter((tx) => String(tx.bookingDate || "") >= window.from && String(tx.bookingDate || "") <= window.to)
          : [];
        const scored = inWindow
          .map((tx) => settlements.scoreSettlementCandidate(payout, tx, { provider }))
          .filter((result) => result.ok);
        candidateCount = scored.length;
        // Ambiguity, not "has a candidate": two rows that cannot be told apart.
        if (scored.length > 1) { row.needsReview += 1; totals.needsReview += 1; }
      } else {
        truncated = true;
      }

      if (unmatchedRows.length < 25) {
        unmatchedRows.push({
          payoutId: providerString(payout.id || payout.externalId, 200),
          provider,
          amount: round2(payout.amount),
          currency: payout.currency ? providerString(payout.currency, 12).toUpperCase() : null,
          arrivalDate: arrival,
          candidateCount
        });
      }
    }

    row.unmatchedAmount = round2(row.unmatchedAmount);
    row.freshness = null;
    providers.push(row);
  }

  for (const provider of ["amazon", "ebay", "faire", "shopify", "etsy"]) {
    if (wanted !== "all" && wanted !== provider) continue;
    providers.push({
      provider,
      available: false,
      reason: provider === "etsy" ? "etsy_financial_ledger_not_readable" : "no_payout_feed_for_this_provider"
    });
  }

  if (truncated) {
    totals.needsReview = null;
    warnings.push(envelope.warning("needs_review_truncated", `Candidate scoring stopped after ${REVIEW_SCAN_CAP} unmatched payouts, so the review count is not reported for this range.`));
  }

  const sources = [];
  const bankConnection = snapshot.bankConnection || null;
  sources.push(freshness.sourceRow({
    provider: "bank",
    entity: "finance",
    kind: "payouts",
    lastSuccessAtMs: Number((bankConnection || {}).lastSyncedAtMs || 0),
    state: bankConnection ? null : "never",
    contributed: true,
    nowMs
  }));

  return {
    data: {
      totals,
      settlementBasis: "arrivalDate",
      matchWording: "matched_with_a_bank_line",
      providers,
      unmatched: unmatchedRows
    },
    warnings,
    sources,
    entityRefs: unmatchedRows.slice(0, 20).map((row) => envelope.entityRef("payout", row.payoutId, `${row.provider} payout`))
  };
}

module.exports = { MATCHABLE_STATUSES, REVIEW_SCAN_CAP, payoutFeedState, matchState, payoutReconciliation };

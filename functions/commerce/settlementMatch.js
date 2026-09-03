"use strict";
// The settlement orchestrator: which payouts still need a bank row, which bank
// rows could be that payout, and the two-sided write that ties them together.
// Provider-agnostic on purpose — Square is the first, PayPal and Stripe reuse
// it unchanged (each keeps its own `<provider>Payouts` subcollection).
const { pickSettlementMatch, scoreSettlementCandidate, settlementWindow } = require("./settlements");

const PROVIDERS = Object.freeze({ square: { collection: "squarePayouts", label: "Square" }, paypal: { collection: "paypalPayouts", label: "PayPal" } });
/** Payouts that have left the processor and can be on a statement. */
const MATCHABLE_STATUSES = new Set(["PAID", "SENT"]);
/** How far back an automatic pass looks for still-unmatched payouts. */
const AUTO_LOOKBACK_MS = 120 * 24 * 60 * 60 * 1000;

function createSettlementMatcher({ admin, db, now = () => Date.now(), notifyCompany = null }) {
  const FieldValue = admin.firestore.FieldValue;
  const company = (companyId) => db().collection("companies").doc(String(companyId));
  const payoutsRef = (companyId, provider) => company(companyId).collection(PROVIDERS[provider].collection);
  const txRef = (companyId) => company(companyId).collection("bankTransactions");
  const providerOf = (value) => { const p = String(value || "").toLowerCase(); if (!PROVIDERS[p]) throw new Error(`unknown settlement provider: ${p}`); return p; };

  /** A bank row is free for a payout when nobody has said what it is yet — or it already belongs to this payout. */
  function rowIsFree(tx, payoutId) {
    if (tx.linkedOrderId || tx.linkedPaymentId) return false;
    if (tx.settlement && tx.settlement.payoutId && tx.settlement.payoutId !== payoutId) return false;
    const kind = String(tx.incomingKind || "");
    return kind === "" || kind === "payout";
  }

  /** The rows in a payout's window, newest first, with their ids. */
  async function rowsInWindow(companyId, payout) {
    const window = settlementWindow(payout);
    if (!window) return [];
    const snap = await txRef(companyId).where("bookingDate", ">=", window.from).where("bookingDate", "<=", window.to).limit(400).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  }

  function candidateView(c) {
    return { transactionId: c.tx.id, accountId: c.tx.accountId || null, bookingDate: c.tx.bookingDate || null, amount: c.tx.amount, currency: c.tx.currency || null, description: c.tx.description || "", counterparty: c.tx.counterparty || "", score: c.score, reasons: c.reasons, free: rowIsFree(c.tx, null) };
  }

  /** Tie a payout and a bank row together, both sides in one batch. */
  async function writeMatch(companyId, provider, payoutDoc, tx, { score = null, reasons = [], method = "auto", amountDelta = 0 }) {
    const payout = payoutDoc.data() || {};
    const totals = payout.totals || {};
    const batch = db().batch();
    batch.set(payoutDoc.ref, { bankMatch: { transactionId: tx.id, accountId: tx.accountId || null, bookingDate: tx.bookingDate || null, amount: tx.amount ?? null, currency: tx.currency || null, confidence: method === "manual" ? "confirmed" : (Number(score) >= 100 ? "high" : "medium"), score: score ?? null, reasons, method, amountDelta: Number(amountDelta) || 0, matchedAtMs: now() }, updatedAtMs: now() }, { merge: true });
    batch.set(txRef(companyId).doc(tx.id), { incomingKind: "payout", settlement: { provider, providerLabel: PROVIDERS[provider].label, payoutId: payoutDoc.id, payoutExternalId: payout.externalId || payoutDoc.id, connectionId: payout.connectionId || null, arrivalDate: payout.arrivalDate || null, gross: totals.gross ?? null, fee: totals.fee ?? null, refunds: totals.refunds ?? null, net: payout.amount ?? totals.net ?? null, currency: payout.currency || null, entryCount: Number(payout.entryCount) || 0, method, amountDelta: Number(amountDelta) || 0, matchedAtMs: now() } }, { merge: true });
    await batch.commit();
  }

  /** Undo a match on both sides; the row's kind is cleared only if it was ours. */
  async function clearMatch(companyId, provider, payoutId, transactionId) {
    const batch = db().batch();
    if (payoutId) batch.set(payoutsRef(companyId, provider).doc(payoutId), { bankMatch: null, updatedAtMs: now() }, { merge: true });
    if (transactionId) {
      const doc = await txRef(companyId).doc(transactionId).get();
      const tx = doc.data() || {};
      const patch = { settlement: FieldValue.delete() };
      if (String(tx.incomingKind || "") === "payout") patch.incomingKind = FieldValue.delete();
      batch.set(doc.ref, patch, { merge: true });
    }
    await batch.commit();
  }

  /** The automatic pass: every unmatched, paid payout of the last months against the rows in its window. */
  async function matchProviderPayouts(companyId, providerValue) {
    const provider = providerOf(providerValue);
    const since = new Date(now() - AUTO_LOOKBACK_MS).toISOString();
    const snap = await payoutsRef(companyId, provider).where("externalCreatedAt", ">=", since).limit(300).get();
    const audit = { provider, scanned: 0, matched: 0, ambiguous: 0, unmatched: 0 };
    for (const doc of snap.docs) {
      const payout = doc.data() || {};
      if (payout.bankMatch && payout.bankMatch.transactionId) continue;
      if (!MATCHABLE_STATUSES.has(String(payout.status || "").toUpperCase())) continue;
      audit.scanned += 1;
      const rows = (await rowsInWindow(companyId, payout)).filter((tx) => rowIsFree(tx, doc.id));
      const picked = pickSettlementMatch(payout, rows, { provider });
      if (picked.match) { await writeMatch(companyId, provider, doc, picked.match.tx, { score: picked.match.score, reasons: picked.match.reasons, method: "auto" }); audit.matched += 1; }
      else if (picked.reason === "ambiguous") audit.ambiguous += 1;
      else audit.unmatched += 1;
    }

    // Say so when a payout could not be placed.
    //
    // This silence is what makes the double-count possible. A PayPal sale is a
    // positive row, and the withdrawal that moves that money to the real bank
    // arrives a second time through the bank feed; the ONLY thing that stops
    // the second arrival being counted as income again is this match. When it
    // fails — a fee or an exchange rate moved the amount, the transfer landed
    // outside the three-day window, two rows looked equally likely — the row
    // stays ordinary income and the workshop's turnover quietly includes the
    // same money twice.
    //
    // The counters were being incremented and then thrown away by the caller,
    // the matcher had no notification channel at all, and even the console line
    // was skipped when nothing matched. An owner had no way to find out.
    const unplaced = audit.ambiguous + audit.unmatched;
    if (unplaced > 0 && typeof notifyCompany === "function") {
      try {
        await notifyCompany(companyId, {
          id: `settlement_unmatched_${provider}`,
          type: "settlement_unmatched",
          title: `${PROVIDERS[provider].label} payouts need a look`,
          message: unplaced === 1
            ? `One ${PROVIDERS[provider].label} payout could not be matched to a bank deposit. Until it is, that money may be counted twice in your income.`
            : `${unplaced} ${PROVIDERS[provider].label} payouts could not be matched to bank deposits. Until they are, that money may be counted twice in your income.`,
          route: "bank"
        });
      } catch (error) {
        console.warn("settlement unmatched notice failed:", companyId, provider, error?.message || error);
      }
    }
    return audit;
  }

  /** Every provider's pass — what a bank sync calls once new rows are in. */
  async function matchAll(companyId) {
    const out = {};
    for (const provider of Object.keys(PROVIDERS)) {
      try { out[provider] = await matchProviderPayouts(companyId, provider); }
      catch (error) { console.warn("settlement match failed:", companyId, provider, error?.message || error); out[provider] = { provider, error: String(error?.message || error).slice(0, 120) }; }
    }
    return out;
  }

  /** What the owner sees when a payout has no match: the window's rows, scored, free or taken. */
  async function suggestForPayout(companyId, providerValue, payoutId) {
    const provider = providerOf(providerValue);
    const doc = await payoutsRef(companyId, provider).doc(String(payoutId)).get();
    if (!doc.exists) { const err = new Error("payout_not_found"); err.code = "not-found"; throw err; }
    const payout = doc.data() || {};
    const rows = await rowsInWindow(companyId, payout);
    const scored = rows.map((tx) => ({ tx, ...scoreSettlementCandidate(payout, tx, { provider }) }));
    const exact = scored.filter((c) => c.ok).sort((a, b) => b.score - a.score);
    // Near misses help the owner see a fee or an FX leg: money in, same currency, within 2% — never auto-matched.
    const near = scored.filter((c) => !c.ok && c.reasons[0] === "amount_differs" && Number(c.tx.amount) > 0 && Math.abs(Number(c.tx.amount) - Number(payout.amount)) <= Math.max(0.5, Number(payout.amount) * 0.02))
      .map((c) => ({ ...c, score: 0, reasons: ["near_amount"] }));
    return { payout: { id: doc.id, externalId: payout.externalId || doc.id, amount: payout.amount ?? null, currency: payout.currency || null, arrivalDate: payout.arrivalDate || null, status: payout.status || null, bankMatch: payout.bankMatch || null }, window: settlementWindow(payout), candidates: exact.map(candidateView), near: near.map(candidateView) };
  }

  /**
   * The owner's word: this row is that payout.
   *
   * The amount no longer has to agree exactly. It used to, which made the
   * "near" candidates the server itself computes — and the Mac, iPhone and
   * Android screens already show a Match button for — impossible to confirm:
   * the one case a person is needed for is a fee or an FX leg, and that is
   * precisely the case that was refused. The difference is recorded on the
   * settlement block rather than swallowed, so a total that does not add up can
   * be explained afterwards.
   *
   * The currency still has to agree, and the row still has to be money in and
   * unclaimed. Those are not judgement calls.
   */
  async function confirmMatch(companyId, providerValue, payoutId, transactionId) {
    const provider = providerOf(providerValue);
    const doc = await payoutsRef(companyId, provider).doc(String(payoutId)).get();
    if (!doc.exists) { const err = new Error("payout_not_found"); err.code = "not-found"; throw err; }
    const txDoc = await txRef(companyId).doc(String(transactionId)).get();
    if (!txDoc.exists) { const err = new Error("transaction_not_found"); err.code = "not-found"; throw err; }
    const payout = doc.data() || {}; const tx = { id: txDoc.id, ...(txDoc.data() || {}) };
    if (!(Number(tx.amount) > 0)) { const err = new Error("money_out"); err.code = "failed-precondition"; throw err; }
    // A difference is allowed but not unlimited: beyond a fifth of the payout it
    // is far more likely to be the wrong row than a fee.
    const delta = Math.round((Number(tx.amount) - Number(payout.amount)) * 100) / 100;
    const tolerance = Math.max(1, Math.abs(Number(payout.amount) || 0) * 0.2);
    if (!Number.isFinite(delta) || Math.abs(delta) > tolerance) {
      const err = new Error("amount_differs"); err.code = "failed-precondition"; throw err;
    }
    if (tx.currency && payout.currency && String(tx.currency).toUpperCase() !== String(payout.currency).toUpperCase()) { const err = new Error("currency_differs"); err.code = "failed-precondition"; throw err; }
    if (!rowIsFree(tx, doc.id)) { const err = new Error("row_taken"); err.code = "failed-precondition"; throw err; }
    if (payout.bankMatch && payout.bankMatch.transactionId && payout.bankMatch.transactionId !== tx.id) await clearMatch(companyId, provider, null, payout.bankMatch.transactionId);
    const scored = scoreSettlementCandidate(payout, tx, { provider });
    await writeMatch(companyId, provider, doc, tx, {
      score: scored.ok ? scored.score : null,
      reasons: scored.ok ? scored.reasons : ["owner_confirmed"],
      method: "manual",
      // What the fee or the exchange rate took, kept so the difference can be
      // explained rather than merely tolerated.
      amountDelta: Math.abs(delta) > 0.005 ? delta : 0
    });
    return { ok: true, transactionId: tx.id, amountDelta: Math.abs(delta) > 0.005 ? delta : 0 };
  }

  async function unmatchPayout(companyId, providerValue, payoutId) {
    const provider = providerOf(providerValue);
    const doc = await payoutsRef(companyId, provider).doc(String(payoutId)).get();
    if (!doc.exists) { const err = new Error("payout_not_found"); err.code = "not-found"; throw err; }
    const current = (doc.data() || {}).bankMatch || null;
    await clearMatch(companyId, provider, doc.id, current && current.transactionId);
    return { ok: true, unlinked: Boolean(current && current.transactionId) };
  }

  /** A bank row reclassified by its owner lets go of its payout too. */
  async function unmatchTransaction(companyId, tx) {
    const settlement = tx && tx.settlement;
    if (!settlement || !settlement.payoutId || !PROVIDERS[settlement.provider]) return { ok: true, unlinked: false };
    await clearMatch(companyId, settlement.provider, settlement.payoutId, tx.id);
    return { ok: true, unlinked: true };
  }

  return { matchProviderPayouts, matchAll, suggestForPayout, confirmMatch, unmatchPayout, unmatchTransaction, PROVIDERS };
}

module.exports = { createSettlementMatcher, PROVIDERS, MATCHABLE_STATUSES, AUTO_LOOKBACK_MS };

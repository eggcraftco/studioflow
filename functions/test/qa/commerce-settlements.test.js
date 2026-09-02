"use strict";
// Settlement matching, pure: the hard gates (money in, exact amount, same
// currency, inside the window), the date shift, the provider's words, and the
// auto-match rule — a clear winner or the owner decides.
const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreSettlementCandidate, pickSettlementMatch, settlementWindow } = require("../../commerce/settlements");

const payout = { externalId: "PO_ABCDEF123", endToEndId: "E2E_987654321", amount: "56.60", currency: "GBP", arrivalDate: "2026-09-03" };
const row = (over = {}) => ({ amount: 56.6, currency: "GBP", bookingDate: "2026-09-03", description: "SQUAREUP LTD PAYOUT", counterparty: "Squareup", providerReference: "", ...over });

test("the window is the arrival date plus a few days either side", () => {
  assert.deepEqual(settlementWindow(payout), { from: "2026-08-31", to: "2026-09-06" });
  assert.equal(settlementWindow({}), null);
});

test("hard gates: money out, a different amount, a different currency and a far date never match", () => {
  assert.equal(scoreSettlementCandidate(payout, row({ amount: -56.6 })).reasons[0], "money_out");
  assert.equal(scoreSettlementCandidate(payout, row({ amount: 56.61 })).reasons[0], "amount_differs");
  assert.equal(scoreSettlementCandidate(payout, row({ currency: "EUR" })).reasons[0], "currency_differs");
  assert.equal(scoreSettlementCandidate(payout, row({ bookingDate: "2026-09-08" })).reasons[0], "outside_window");
  assert.equal(scoreSettlementCandidate({ ...payout, amount: null }, row()).reasons[0], "payout_amount_missing");
});

test("same day with the provider's name scores highest; each day of shift costs points; a reference adds more", () => {
  assert.equal(scoreSettlementCandidate(payout, row()).score, 120);
  assert.equal(scoreSettlementCandidate(payout, row({ bookingDate: "2026-09-04" })).score, 105);
  assert.equal(scoreSettlementCandidate(payout, row({ description: "FASTER PAYMENT RECEIVED", counterparty: "" })).score, 100);
  assert.equal(scoreSettlementCandidate(payout, row({ description: "SQUARE E2E_987654321" })).score, 145);
  assert.equal(scoreSettlementCandidate(payout, row({ bookingDate: "2026-08-31", description: "CREDIT", counterparty: "" })).score, 55);
});

test("a lone exact row on the day is matched automatically", () => {
  const out = pickSettlementMatch(payout, [row(), row({ amount: 12 }), row({ amount: -56.6 })]);
  assert.equal(out.reason, "auto"); assert.equal(out.match.tx.description, "SQUAREUP LTD PAYOUT"); assert.equal(out.candidates.length, 1);
});

test("two rows that cannot be told apart are left to the owner, with both offered", () => {
  const out = pickSettlementMatch(payout, [row({ description: "CREDIT A" }), row({ description: "CREDIT B" })]);
  assert.equal(out.reason, "ambiguous"); assert.equal(out.match, null); assert.equal(out.candidates.length, 2);
});

test("the provider's own words break a tie between two exact rows on the same day", () => {
  const out = pickSettlementMatch(payout, [row({ description: "CREDIT FROM J SMITH", counterparty: "" }), row()]);
  assert.equal(out.reason, "auto"); assert.equal(out.match.tx.description, "SQUAREUP LTD PAYOUT");
});

test("a row three days off with no other signal is offered but not taken", () => {
  const out = pickSettlementMatch(payout, [row({ bookingDate: "2026-08-31", description: "CREDIT", counterparty: "" })]);
  assert.equal(out.reason, "low_score"); assert.equal(out.candidates.length, 1);
});

test("nothing in the window means no candidate at all", () => {
  assert.deepEqual(pickSettlementMatch(payout, []), { match: null, candidates: [], reason: "no_candidate" });
});

// Payouts against the bank, and the two claims that are easy to get wrong:
// what "needs review" means, and whether this module can be trusted not to
// write (§11, §26, §6.2).
//
// Run: node test/qa/orchestrator-payouts.test.js
const assert = require("assert");
const payouts = require("../../orchestrator/payouts");
const settlements = require("../../commerce/settlements");
const fixtures = require("../fixtures/orchestrator");

let failures = 0;
const check = (name, run) => {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
};

const ctx = fixtures.ownerContext();
const NOW = fixtures.NOW;

const payout = (id, overrides = {}) => ({
  id, provider: "square", status: "PAID", amount: 240, currency: "GBP",
  arrivalDate: "2026-09-10", totals: { gross: 250, fee: -10, net: 240 }, bankMatch: null, ...overrides
});
const bankRow = (id, overrides = {}) => ({
  id, amount: 240, currency: "GBP", bookingDate: "2026-09-10",
  description: "SQUAREUP DEPOSIT", counterparty: "Squareup", ...overrides
});

const snapshot = (over = {}) => ({
  companyId: "co_1", nowMs: NOW, settings: fixtures.settings,
  payouts: { square: [payout("po_1")] }, payoutBankRows: [],
  bankConnection: { id: "bank_1", provider: "truelayer", lastSyncedAtMs: NOW - 3 * 60 * 60 * 1000 },
  ...over
});

check("matched, matched-with-a-difference and unmatched are three different answers", () => {
  const result = payouts.payoutReconciliation(snapshot({
    payouts: { square: [
      payout("po_matched", { bankMatch: { transactionId: "tx1", amountDelta: 0 } }),
      payout("po_partial", { bankMatch: { transactionId: "tx2", amountDelta: -1.5 } }),
      payout("po_open")
    ] }
  }), {}, ctx, { nowMs: NOW });
  assert.strictEqual(result.data.totals.matched, 1);
  assert.strictEqual(result.data.totals.partial, 1, "a match whose amount differs is not simply matched");
  assert.strictEqual(result.data.totals.unmatched, 1);
});

check("needsReview is ambiguity — two candidates — and one exact candidate is not a review", () => {
  // This is what matchProviderPayouts itself refuses to auto-match. Calling a
  // single obvious candidate a "review" would put a decision in front of the
  // owner that does not need making.
  const one = payouts.payoutReconciliation(snapshot({ payoutBankRows: [bankRow("tx1")] }), {}, ctx, { nowMs: NOW });
  assert.strictEqual(one.data.totals.needsReview, 0);
  assert.strictEqual(one.data.unmatched[0].candidateCount, 1);

  const two = payouts.payoutReconciliation(
    snapshot({ payoutBankRows: [bankRow("tx1"), bankRow("tx2")] }), {}, ctx, { nowMs: NOW }
  );
  assert.strictEqual(two.data.totals.needsReview, 1, "two rows that cannot be told apart is a decision for a person");
  assert.strictEqual(two.data.unmatched[0].candidateCount, 2);
});

check("candidate scoring uses the same scorer the matcher uses", () => {
  // Not a re-implementation: the two must agree by construction, or the tool
  // would say "one candidate" about a row the matcher would never accept.
  const scored = settlements.scoreSettlementCandidate(payout("po_1"), bankRow("tx1"), { provider: "square" });
  assert.strictEqual(scored.ok, true);
  const wrongAmount = settlements.scoreSettlementCandidate(payout("po_1"), bankRow("tx3", { amount: 100 }), { provider: "square" });
  assert.strictEqual(wrongAmount.ok, false);
  const result = payouts.payoutReconciliation(
    snapshot({ payoutBankRows: [bankRow("tx3", { amount: 100 })] }), {}, ctx, { nowMs: NOW }
  );
  assert.strictEqual(result.data.unmatched[0].candidateCount, 0, "a row of the wrong amount is not a candidate");
});

check("scoring stops at the cap and says so instead of reporting a partial count as a total", () => {
  const many = Array.from({ length: payouts.REVIEW_SCAN_CAP + 5 }, (_, index) => payout(`po_${index}`));
  const result = payouts.payoutReconciliation(snapshot({ payouts: { square: many } }), {}, ctx, { nowMs: NOW });
  assert.strictEqual(result.data.totals.needsReview, null, "an incomplete count must not be published as a number");
  assert.ok(result.warnings.some((row) => row.code === "needs_review_truncated"));
});

check("unmatched payout money never appears as revenue", () => {
  const result = payouts.payoutReconciliation(snapshot(), {}, ctx, { nowMs: NOW });
  const keys = JSON.stringify(result.data);
  assert.ok(!/revenue|gross|sales/i.test(keys), "a payout is not a sale: this capability must not talk about revenue at all");
  assert.strictEqual(result.data.settlementBasis, "arrivalDate");
});

check("a provider with no payout feed is unavailable with a reason, not zero payouts", () => {
  const result = payouts.payoutReconciliation(snapshot(), {}, ctx, { nowMs: NOW });
  const amazon = result.data.providers.find((row) => row.provider === "amazon");
  assert.strictEqual(amazon.available, false);
  assert.ok(amazon.reason, "an unavailable provider has to say why");
  const etsy = result.data.providers.find((row) => row.provider === "etsy");
  assert.strictEqual(etsy.reason, "etsy_financial_ledger_not_readable");
  const paypal = result.data.providers.find((row) => row.provider === "paypal");
  assert.strictEqual(paypal.available, false, "PayPal with no payout documents is not connected, not \"0 payouts\"");
});

check("a connected processor with no payouts yet is not reported as disconnected", () => {
  // The §8/§14 degradation rule the other way round. The loader now writes an
  // empty array for a collection it read and found empty, so "we looked, there
  // were none" is representable — and connectedness is asked of the connection.
  const connected = snapshot({
    payouts: { square: [], paypal: [] },
    connections: { square: [{ id: "sq_1", provider: "square", status: "connected", lastSuccessAtMs: NOW - 60 * 60 * 1000 }], bank: [] }
  });
  const result = payouts.payoutReconciliation(connected, {}, ctx, { nowMs: NOW });
  const square = result.data.providers.find((row) => row.provider === "square");
  assert.strictEqual(square.available, true,
    "a Square account linked an hour ago is connected; sending the owner to reconnect it is a wrong answer");
  assert.strictEqual(square.matched + square.partial + square.unmatched, 0, "and it has nothing in range to report");

  const paypal = result.data.providers.find((row) => row.provider === "paypal");
  assert.strictEqual(paypal.available, false, "a provider with no connection at all still says so");
  assert.strictEqual(paypal.reason, "provider_not_connected");
});

check("PayPal's connection is a bank connection, and a caller who cannot read it is told that", () => {
  const linked = snapshot({
    payouts: { square: [], paypal: [] },
    connections: { bank: [{ id: "bc_1", provider: "paypal", institutionName: "PayPal" }] }
  });
  assert.strictEqual(
    payouts.payoutReconciliation(linked, {}, ctx, { nowMs: NOW }).data.providers.find((row) => row.provider === "paypal").available,
    true, "bankFeed.js writes paypalPayouts from a bankConnections document, so that is where connectedness lives"
  );

  // A caller without the Banking area never had the bank connection list read
  // for them, so its emptiness proves nothing in either direction.
  const noBanking = fixtures.ownerContext({ isOwner: false, areas: { orders: true, dashboard: true, customers: true, bankFeed: false } });
  const blind = payouts.payoutFeedState({ payouts: { paypal: [] }, connections: { bank: [] } }, "paypal", noBanking);
  assert.deepStrictEqual(blind, { available: false, reason: "connection_not_visible" });
});

check("the answer never calls an operational match a reconciliation", () => {
  const result = payouts.payoutReconciliation(snapshot(), {}, ctx, { nowMs: NOW });
  assert.strictEqual(result.data.matchWording, "matched_with_a_bank_line");
  assert.ok(!/reconciled/i.test(JSON.stringify(result.data)), "§6.2: NivaDesk is not the accountant");
});

check("the module performs no Firestore access at all", () => {
  // It is handed pre-fetched bank rows precisely so it cannot; if it ever
  // reached for a database, this call would throw.
  const trap = new Proxy({}, { get() { throw new Error("payouts.js touched the database"); } });
  const withTrap = snapshot({ db: trap, admin: trap });
  assert.doesNotThrow(() => payouts.payoutReconciliation(withTrap, {}, ctx, { nowMs: NOW }));
  const source = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "orchestrator", "payouts.js"), "utf8");
  const requires = [...source.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.ok(!requires.some((name) => /firebase-admin|settlementMatch/.test(name)),
    `payouts.js must not require admin or the writing matcher; it requires ${requires.join(", ")}`);
});

console.log(failures === 0 ? "\nAll payout checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

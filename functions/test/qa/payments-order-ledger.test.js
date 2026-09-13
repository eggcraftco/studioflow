// The provider-verified payment ledger, and the rule that keeps one economic
// transaction counted once.
//
// The whole point of this file is what survives a hostile write. An old Apple
// build replaces the order document whole (firestore.rules says so, in a
// comment next to the array it had to leave unlocked), and any member with
// write access can do the same by hand. So every check below asks the same
// question: after that write, can the server still say what the customer
// actually paid?
//
// Run: node test/qa/payments-order-ledger.test.js
const assert = require("assert");
const ledger = require("../../payments/orderLedger");
const { computeOrderFinance } = require("../../finance/engine");
const boundary = require("../../payments/eventBoundary");

let checks = 0;
function pass(name) { checks += 1; console.log("PASS ", name); }

const SETTINGS = { seciliParaBirimi: "£" };
const entry = (overrides = {}) => ledger.entryFrom(Object.assign({
  externalPaymentId: "pi:pi_1", type: "payment", amountMinor: 100000,
  currency: "GBP", orderId: "o1", receivedAtMs: 1_757_000_000_000,
  paymentRequestId: "pr_1", connectedAccountId: "acct_1"
}, overrides));

// ---------------------------------------------------------------------------
// 1. Identity. One payment, two Stripe events, one ledger row.
// ---------------------------------------------------------------------------
{
  const session = { type: "checkout.session.completed", data: { object: { payment_intent: "pi_9" } } };
  const intent = { type: "payment_intent.succeeded", data: { object: { id: "pi_9" } } };
  const a = ledger.ledgerEntryId("stripe", boundary.externalPaymentId(session));
  const b = ledger.ledgerEntryId("stripe", boundary.externalPaymentId(intent));
  assert.strictEqual(a, b);
  assert.strictEqual(a, "stripe:pi:pi_9");
  pass("the two events Stripe sends for one payment produce one ledger id");
}

{
  // A row we cannot key is a row we cannot apply once, so it is not built.
  assert.strictEqual(ledger.entryFrom({ externalPaymentId: "", type: "payment", amountMinor: 1, currency: "GBP", orderId: "o1" }), null);
  assert.strictEqual(entry({ amountMinor: 0 }), null, "a zero amount is not an economic event");
  assert.strictEqual(entry({ amountMinor: -100 }), null, "a negative amount is a refund, and says so by type");
  assert.strictEqual(entry({ amountMinor: 10.5 }), null, "minor units are integers");
  assert.strictEqual(entry({ type: "chargeback" }), null);
  assert.strictEqual(entry({ currency: "POUNDS" }), null);
  assert.strictEqual(entry({ orderId: "" }), null, "evidence with no order is evidence of nothing");
  pass("an entry that cannot be keyed or applied is refused at construction");
}

// ---------------------------------------------------------------------------
// 2. The hostile write. A client replaces the order document whole.
// ---------------------------------------------------------------------------
{
  const paid = entry();
  // As the server left it: £1,000 paid, mirrored in the array for the clients.
  const healthy = {
    orderValue: 1000, paidAmount: 1000, remainingAmount: 0, refundedAmount: 0,
    payments: [ledger.mirrorRowFor(paid)]
  };
  assert.strictEqual(ledger.reconcile(healthy, [paid]).consistent, true);

  // The old Apple build saves: the whole document is re-encoded from its own
  // model, which never had the payment.
  const clobbered = { orderValue: 1000, paidAmount: 0, remainingAmount: 1000, refundedAmount: 0, payments: [] };
  const state = ledger.reconcile(clobbered, [paid]);
  assert.strictEqual(state.consistent, false);
  assert.strictEqual(state.paidDrift, 1000, "the ledger knows £1,000 is missing");
  assert.deepStrictEqual(state.missingMirrorIds, ["pi:pi_1"]);

  const patch = ledger.repairPatch(clobbered, [paid]);
  assert.strictEqual(patch.paidAmount, 1000);
  assert.strictEqual(patch.remainingAmount, 0, "the balance comes back down with it");
  assert.strictEqual(patch.payments.length, 1);
  assert.strictEqual(patch.payments[0].externalPaymentId, "pi:pi_1");
  pass("a whole-document client rewrite loses the payment, and the ledger puts it back");
}

{
  // Repairing twice must not pay the order twice.
  const paid = entry();
  const clobbered = { paidAmount: 0, remainingAmount: 1000, refundedAmount: 0, payments: [] };
  const repaired = Object.assign({}, clobbered, ledger.repairPatch(clobbered, [paid]));
  assert.strictEqual(ledger.reconcile(repaired, [paid]).consistent, true);
  assert.strictEqual(ledger.repairPatch(repaired, [paid]), null, "a healthy order is not written to");
  pass("repair is idempotent: the second run has nothing to do");
}

{
  // A client that forges a mirror row cannot conjure provider money: the row
  // has no ledger entry behind it, so it is named an orphan and does not count.
  const forged = {
    paidAmount: 5000, remainingAmount: 0, refundedAmount: 0,
    payments: [{ id: "x", amount: 5000, externalPaymentId: "pi:made_up", source: "stripe_connect" }]
  };
  const state = ledger.reconcile(forged, []);
  assert.deepStrictEqual(state.orphanMirrorIds, ["pi:made_up"]);
  assert.strictEqual(state.expected.providerPaid, 0, "a forged mirror is not provider money");
  assert.strictEqual(state.expected.manualPaid, 0, "and it is not manual money either");
  assert.strictEqual(state.consistent, false);
  pass("a mirror row with no ledger entry counts as nothing and is reported");
}

{
  // A duplicated mirror in the array does not double the total, because the
  // total comes from the ledger.
  const paid = entry();
  const mirror = ledger.mirrorRowFor(paid);
  const doubled = { paidAmount: 2000, remainingAmount: 0, refundedAmount: 0, payments: [mirror, { ...mirror }] };
  const state = ledger.reconcile(doubled, [paid]);
  assert.strictEqual(state.expected.paidAmount, 1000, "the ledger is counted once whatever the array says");
  assert.deepStrictEqual(state.duplicateMirrorIds, ["pi:pi_1"]);
  const patch = ledger.repairPatch(doubled, [paid]);
  assert.strictEqual(patch.payments.filter((row) => row.externalPaymentId === "pi:pi_1").length, 1);
  pass("a duplicated mirror row is collapsed and never doubles the money");
}

// ---------------------------------------------------------------------------
// 3. Manual and provider money stay separate sources.
// ---------------------------------------------------------------------------
{
  const paid = entry({ amountMinor: 40000 });
  const order = {
    paidAmount: 0, remainingAmount: 1000, refundedAmount: 0,
    payments: [
      { id: "m1", amount: 200, method: "Cash", date: 1_757_000_000_000 },
      ledger.mirrorRowFor(paid)
    ]
  };
  const totals = ledger.expectedTotals(order, [paid]);
  assert.strictEqual(totals.manualPaid, 200, "the cash the workspace typed");
  assert.strictEqual(totals.providerPaid, 400, "the card payment Stripe verified");
  assert.strictEqual(totals.paidAmount, 600);
  // Deleting the ledger entry leaves the manual money untouched, and vice
  // versa: two sources, neither able to erase the other.
  assert.strictEqual(ledger.expectedTotals(order, []).manualPaid, 200);
  assert.strictEqual(ledger.expectedTotals({ ...order, payments: [ledger.mirrorRowFor(paid)] }, [paid]).providerPaid, 400);
  pass("manual money and provider money are counted from different sources");
}

{
  // A manual row that looks like a provider row is NAMED, never merged: only a
  // person knows whether it is the same £400 entered twice or a deposit that
  // happens to match.
  const paid = entry({ amountMinor: 40000 });
  const order = {
    paidAmount: 800, remainingAmount: 0, refundedAmount: 0,
    payments: [{ id: "m9", amount: 400, method: "Card", date: 1_757_000_000_000 }, ledger.mirrorRowFor(paid)]
  };
  const state = ledger.reconcile(order, [paid]);
  assert.strictEqual(state.suspectedDuplicates.length, 1);
  assert.strictEqual(state.suspectedDuplicates[0].manualPaymentId, "m9");
  assert.strictEqual(state.expected.paidAmount, 800, "both are still counted — nothing was merged behind anyone's back");
  pass("a manual row that looks like a provider row is reported, not merged");
}

{
  // Far apart in time, so not a suspected duplicate.
  const paid = entry({ amountMinor: 40000 });
  const order = {
    paidAmount: 800, remainingAmount: 0, refundedAmount: 0,
    payments: [{ id: "m9", amount: 400, method: "Card", date: 1_757_000_000_000 - 10 * 24 * 3600 * 1000 }, ledger.mirrorRowFor(paid)]
  };
  assert.strictEqual(ledger.reconcile(order, [paid]).suspectedDuplicates.length, 0);
  pass("a matching amount ten days apart is not called a duplicate");
}

// ---------------------------------------------------------------------------
// 4. Finance v4 counts the same economic transaction once.
// ---------------------------------------------------------------------------
{
  // The engine reads paidAmount, remainingAmount, refundedAmount, the custom
  // receivable/expense fields and the invoice lines. It never reads payments[].
  // So the ledger is single-counted by construction — as long as the fields it
  // repairs are the fields the engine reads, which is what this proves.
  const paid = entry();
  const before = { orderValue: 1000, paidAmount: 0, remainingAmount: 1000, refundedAmount: 0, payments: [] };
  const after = Object.assign({}, before, ledger.repairPatch(before, [paid]));

  const revenueBefore = computeOrderFinance(before, SETTINGS).revenue;
  const revenueAfter = computeOrderFinance(after, SETTINGS).revenue;
  assert.strictEqual(revenueBefore, 1000, "an unpaid £1,000 order is still a £1,000 sale");
  assert.strictEqual(revenueAfter, 1000, "paying it does not make it a second sale");
  pass("recording a provider payment moves money without inventing revenue");
}

{
  // A partial refund, and the trap the engine documents: linking a refund
  // lowers paidAmount AND raises refundedAmount, so revenue must add the refund
  // back or the sale shrinks twice.
  const paid = entry();
  const refunded = entry({ externalPaymentId: "refund:re_1", type: "refund", amountMinor: 20000, receivedAtMs: 1_757_000_100_000 });
  const order = { orderValue: 1000, paidAmount: 0, remainingAmount: 1000, refundedAmount: 0, payments: [] };
  const repaired = Object.assign({}, order, ledger.repairPatch(order, [paid, refunded]));

  assert.strictEqual(repaired.paidAmount, 800, "£1,000 in, £200 back");
  assert.strictEqual(repaired.refundedAmount, 200);
  const finance = computeOrderFinance(repaired, SETTINGS);
  assert.strictEqual(finance.revenue, 1000, "the sale was worth £1,000 and the refund is subtracted once, not twice");
  pass("a provider refund is counted once, on both sides of the engine");
}

{
  // Ten deliveries of the same refund, and the total does not move.
  const paid = entry();
  const refunded = entry({ externalPaymentId: "refund:re_1", type: "refund", amountMinor: 20000 });
  const tenTimes = [paid, ...Array.from({ length: 10 }, () => refunded)];
  const totals = ledger.expectedTotals({ payments: [] }, tenTimes);
  assert.strictEqual(totals.providerRefunded, 200, "one refund, however many times it arrives");
  assert.strictEqual(totals.paidAmount, 800);
  pass("a refund delivered ten times is counted once");
}

{
  // An invoice-lined order is worth what its lines say, and the ledger must not
  // change that — the money fields move, the sale does not.
  const paid = entry({ amountMinor: 50000 });
  const lined = {
    orderValue: 1000, paidAmount: 0, remainingAmount: 1000, refundedAmount: 0, payments: [],
    invoiceItems: [{ description: "Ring", quantity: 1, unitPrice: 1200 }]
  };
  const repaired = Object.assign({}, lined, ledger.repairPatch(lined, [paid]));
  assert.strictEqual(
    computeOrderFinance(lined, SETTINGS).revenue,
    computeOrderFinance(repaired, SETTINGS).revenue,
    "an invoice-lined order's revenue is its lines, paid or not"
  );
  pass("recording a payment on an invoice-lined order does not change what it is worth");
}

console.log(`\nAll ${checks} order-ledger checks passed.`);

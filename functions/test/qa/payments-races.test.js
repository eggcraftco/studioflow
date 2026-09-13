// The payment races the flow tests do not cover.
//
// payments-request-flow.test.js already proves the ordinary paths and the
// obvious repeats. This file is the rest: what happens when two things are true
// at once, when a write fails after the provider has already taken the money,
// when a client rewrites the order underneath us, and when refunds arrive
// duplicated and out of order.
//
// Each check states the invariant it protects rather than the sequence it runs,
// because the sequences are arbitrary and the invariants are not:
//
//   the ledger holds one row per external payment identity, always;
//   the order's four money figures are derived from the ledger, never added to;
//   a retry after a partial failure converges on the same numbers;
//   nothing a client can write changes what the provider verified.
//
// Run: node test/qa/payments-races.test.js
const assert = require("assert");
const { makeFakeFirestore, FakeHttpsError } = require("./helpers/fakeFirestore");
const { createFakeConnectTransport } = require("../../payments/connectTransport");
const { createPaymentConnectFunctions } = require("../../paymentConnect");
const { computeOrderFinance } = require("../../finance/engine");

let checks = 0;
function pass(name) { checks += 1; console.log("PASS ", name); }

const CO = "c1";
const OWNER = "uid-owner";
const ORDER = "order-1";
const SETTINGS = { seciliParaBirimi: "£" };

function harness({ remainingAmount = 1000, paidAmount = 0, orderValue = 1000 } = {}) {
  const nowRef = { value: 1_757_000_000_000 };
  const store = makeFakeFirestore(nowRef);
  store.write(`companies/${CO}`, { ownerUid: OWNER, companyName: "Acme", country: "GB", ownerEmail: "o@acme.test", seciliParaBirimi: "£" });
  store.write(`siparisler/${ORDER}`, { companyId: CO, orderValue, paidAmount, remainingAmount, refundedAmount: 0, payments: [], assignedToUid: "" });
  const fake = createFakeConnectTransport();
  const passthrough = (_o, handler) => handler;
  const fns = createPaymentConnectFunctions({
    admin: store.admin, onCall: passthrough, onRequest: passthrough, HttpsError: FakeHttpsError,
    requireWorkspace: async () => ({ uid: OWNER, companyId: CO, companyRef: store.admin.firestore().collection("companies").doc(CO), companyData: store.read(`companies/${CO}`) }),
    workspaceActor: (context) => ({ uid: context.uid, role: "owner", financialInfo: true }),
    transport: () => fake, railConfigured: () => true, mode: "test"
  });
  return { store, fake, fns };
}

async function connected(h) {
  await h.fns.beginStripeConnectOnboarding({});
  const accountId = h.store.read(`companies/${CO}/paymentConnections/stripe`).stripeAccountId;
  h.fake.completeOnboarding(accountId);
  await h.fns.refreshStripePaymentConnection({});
  return accountId;
}

const fakeResponse = () => {
  const out = { code: 200, body: null, sent: null };
  return { out, status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; }, send(t) { out.sent = t; return this; } };
};
const webhook = (event) => ({ method: "POST", headers: { "stripe-signature": "valid" }, rawBody: Buffer.from(JSON.stringify(event)) });

const paid = ({ account, requestId, amountMinor, intent, id, created = 1_757_000_100 }) => ({
  id, type: "checkout.session.completed", account, created, livemode: false,
  data: { object: { id: `cs_${intent}`, payment_intent: intent, amount_total: amountMinor, currency: "gbp",
    metadata: { companyId: CO, paymentRequestId: requestId, orderId: ORDER } } }
});
const refund = ({ account, requestId, intent, refundId, refundedTotalMinor, fully, created, id }) => ({
  id, type: "charge.refunded", account, created, livemode: false,
  data: { object: { id: `ch_${intent}`, payment_intent: intent, refund_id: refundId,
    amount_refunded: refundedTotalMinor, refunded: fully === true, currency: "gbp",
    amount_total: undefined, metadata: { companyId: CO, paymentRequestId: requestId, orderId: ORDER } } }
});

const order = (h) => h.store.read(`siparisler/${ORDER}`);
const ledgerPaths = (h) => h.store.paths(`companies/${CO}/paymentLedger/`);

(async () => {
  // -------------------------------------------------------------------------
  // 1. Two links for one order, paid at the same time
  // -------------------------------------------------------------------------
  {
    const h = harness();
    const account = await connected(h);
    const a = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 30000, purpose: "deposit" } });
    const b = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 70000, purpose: "remaining_balance" } });

    // Both customers pay within the same second; the deliveries interleave.
    await Promise.all([
      h.fns.stripeConnectWebhook(webhook(paid({ account, requestId: a.request.paymentRequestId, amountMinor: 30000, intent: "pi_a", id: "evt_a" })), fakeResponse()),
      h.fns.stripeConnectWebhook(webhook(paid({ account, requestId: b.request.paymentRequestId, amountMinor: 70000, intent: "pi_b", id: "evt_b" })), fakeResponse())
    ]);

    assert.strictEqual(ledgerPaths(h).length, 2, "two payments, two ledger rows");
    const after = order(h);
    assert.strictEqual(after.paidAmount, 1000, "£300 + £700, once each");
    assert.strictEqual(after.remainingAmount, 0);
    assert.strictEqual(after.payments.length, 2, "one mirror row each");
    assert.strictEqual(new Set(after.payments.map((row) => row.externalPaymentId)).size, 2);
    // Neither is an overpayment: together they are exactly the order.
    for (const made of [a, b]) {
      const row = h.store.read(`companies/${CO}/paymentRequests/${made.request.paymentRequestId}`);
      assert.strictEqual(row.publicStatus, "paid");
      assert(!row.overpaidMinor, `${made.request.purpose} was wrongly called an overpayment`);
    }
    pass("a deposit and a balance paid at the same moment settle the order exactly once each");
  }

  {
    // The same, but the order shrank to £500 after both links went out. Both
    // payments are real and both are kept; the excess is named, not refused.
    const h = harness();
    const account = await connected(h);
    const a = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 30000, purpose: "deposit" } });
    const b = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 70000, purpose: "remaining_balance" } });
    h.store.write(`siparisler/${ORDER}`, { ...order(h), remainingAmount: 500, orderValue: 500 });

    await h.fns.stripeConnectWebhook(webhook(paid({ account, requestId: a.request.paymentRequestId, amountMinor: 30000, intent: "pi_a", id: "evt_a" })), fakeResponse());
    await h.fns.stripeConnectWebhook(webhook(paid({ account, requestId: b.request.paymentRequestId, amountMinor: 70000, intent: "pi_b", id: "evt_b", created: 1_757_000_200 })), fakeResponse());

    const after = order(h);
    assert.strictEqual(after.paidAmount, 1000, "£1,000 really was taken and is really recorded");
    assert.strictEqual(ledgerPaths(h).length, 2);
    const second = h.store.read(`companies/${CO}/paymentRequests/${b.request.paymentRequestId}`);
    assert.strictEqual(second.overpaidMinor, 50000, "the second payment overshot the £500 balance by £500");
    pass("two payments past a shrunken balance are both kept, and the excess is named");
  }

  // -------------------------------------------------------------------------
  // 2. The provider succeeded and our write did not
  // -------------------------------------------------------------------------
  {
    // The money is in the ledger; everything after it failed. The retry must
    // finish the job and must not take the money a second time.
    const h = harness();
    const account = await connected(h);
    const made = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    const id = made.request.paymentRequestId;
    const event = paid({ account, requestId: id, amountMinor: 100000, intent: "pi_1", id: "evt_1" });

    // Fail every write to the order document, from the first attempt onwards.
    h.store.refuseWrites(/^siparisler\//, "PERMISSION_DENIED: simulated");
    const first = fakeResponse();
    await h.fns.stripeConnectWebhook(webhook(event), first);
    assert.strictEqual(first.out.code, 500, "a failed write is a 500, so Stripe retries");
    assert.strictEqual(ledgerPaths(h).length, 1, "but the money was already filed");
    assert.strictEqual(order(h).paidAmount, 0, "and the order has not been touched");
    const eventRow = h.store.read(`paymentProviderEvents/stripe:${account}:evt_1`);
    assert(!eventRow.processedAt, "the event stays claimable, so the retry is not a duplicate");

    // The writes come back and Stripe redelivers.
    h.store.allowWrites();
    const retry = fakeResponse();
    await h.fns.stripeConnectWebhook(webhook(event), retry);
    assert.strictEqual(retry.out.code, 200);
    assert.strictEqual(ledgerPaths(h).length, 1, "still ONE ledger row after the retry");
    assert.strictEqual(order(h).paidAmount, 1000, "and the order is finally right");
    assert.strictEqual(order(h).payments.length, 1, "one mirror row, not two");
    pass("a write that fails after the provider took the money retries into one payment, not two");
  }

  {
    // The create path's own half: Stripe made the session, our write failed.
    // A retry with the same clientRequestId must not open a second link.
    const h = harness();
    const account = await connected(h);
    h.store.refuseWrites(/paymentRequests/, "PERMISSION_DENIED: simulated");
    await assert.rejects(() => h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 50000, clientRequestId: "attempt-1" } }));
    h.store.allowWrites();
    const retry = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 50000, clientRequestId: "attempt-1" } });
    const listed = await h.fns.listOrderPaymentRequests({ data: { orderId: ORDER } });
    assert.strictEqual(listed.requests.length, 1, "one request, not two");
    assert.strictEqual(retry.request.publicStatus, "open");
    pass("a failed write during creation leaves one request when the client retries");
  }

  {
    // The narrow window: the ledger row was written, and the work AFTER it was
    // not. The retry finds already-exists — so it must still finish the rest,
    // including naming an overpayment. Skipping that on the retry would mean a
    // customer overpaid £600 and nothing ever said so.
    const h = harness();
    const account = await connected(h);
    const made = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    const id = made.request.paymentRequestId;
    h.store.write(`siparisler/${ORDER}`, { ...order(h), paidAmount: 600, remainingAmount: 400 });
    const event = paid({ account, requestId: id, amountMinor: 100000, intent: "pi_1", id: "evt_1" });

    h.store.refuseWrites(/^siparisler\//, "PERMISSION_DENIED: simulated");
    await h.fns.stripeConnectWebhook(webhook(event), fakeResponse());
    assert.strictEqual(ledgerPaths(h).length, 1, "the money was filed before the failure");
    h.store.allowWrites();

    await h.fns.stripeConnectWebhook(webhook(event), fakeResponse());
    const request = h.store.read(`companies/${CO}/paymentRequests/${id}`);
    assert.strictEqual(request.publicStatus, "paid");
    assert.strictEqual(ledgerPaths(h).length, 1, "still one ledger row");
    assert.strictEqual(order(h).paidAmount, 1000, "and the order is right");
    assert.strictEqual(request.overpaidMinor, 60000,
      "the overpayment must be named on the retry too — it was £600 more than the order was owed");
    pass("a retry after the ledger row was already written still finishes the rest, overpayment included");
  }

  // -------------------------------------------------------------------------
  // 3. An old client rewrites the order underneath the provider's evidence
  // -------------------------------------------------------------------------
  {
    const h = harness();
    const account = await connected(h);
    const made = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    await h.fns.stripeConnectWebhook(webhook(paid({ account, requestId: made.request.paymentRequestId, amountMinor: 100000, intent: "pi_1", id: "evt_1" })), fakeResponse());
    assert.strictEqual(order(h).paidAmount, 1000);

    // The shipped iOS/Mac build saves: the whole document, re-encoded from a
    // model that never knew about the payment.
    h.store.write(`siparisler/${ORDER}`, {
      companyId: CO, orderValue: 1000, paidAmount: 0, remainingAmount: 1000, refundedAmount: 0, payments: [], assignedToUid: ""
    });
    assert.strictEqual(ledgerPaths(h).length, 1, "the ledger is in a collection that write cannot reach");

    // Any later provider event, or a reconcile, restores it from the ledger.
    await h.fns.stripeConnectWebhook(webhook({
      id: "evt_2", type: "payment_intent.succeeded", account, created: 1_757_000_200, livemode: false,
      data: { object: { id: "pi_1", amount: 100000, currency: "gbp", metadata: { companyId: CO, paymentRequestId: made.request.paymentRequestId, orderId: ORDER } } }
    }), fakeResponse());

    const after = order(h);
    assert.strictEqual(after.paidAmount, 1000, "the payment is back");
    assert.strictEqual(after.remainingAmount, 0);
    assert.strictEqual(after.payments.length, 1, "and so is its mirror row");
    assert.strictEqual(ledgerPaths(h).length, 1, "without a second ledger row for the same money");
    pass("a whole-document client rewrite cannot change the ledger, and the order is restored from it");
  }

  {
    // The other half of the same threat: the client INVENTS a payment. The
    // mirror row it forges has no ledger entry, so it counts as nothing.
    const h = harness();
    const account = await connected(h);
    h.store.write(`siparisler/${ORDER}`, {
      ...order(h), paidAmount: 5000, remainingAmount: 0,
      payments: [{ id: "forged", amount: 5000, externalPaymentId: "pi:invented", source: "stripe_connect" }]
    });
    const made = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 10000 } }).catch((error) => ({ error }));
    // The order says it is fully paid, so there is no headroom for a link —
    // which is itself the client's claim being believed about the BALANCE.
    // What must not happen is the forged row becoming provider money.
    const { reconcile } = require("../../payments/orderLedger");
    const state = reconcile(order(h), []);
    assert.deepStrictEqual(state.orphanMirrorIds, ["pi:invented"]);
    assert.strictEqual(state.expected.providerPaid, 0);
    assert.strictEqual(state.expected.manualPaid, 0, "a forged provider row is not manual money either");
    assert(made.error, "and no link can be made against a balance the client zeroed");
    pass("a forged provider row counts as neither provider nor manual money");
  }

  // -------------------------------------------------------------------------
  // 4. Refunds: duplicated, out of order, partial then full
  // -------------------------------------------------------------------------
  {
    const h = harness();
    const account = await connected(h);
    const made = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    const id = made.request.paymentRequestId;
    await h.fns.stripeConnectWebhook(webhook(paid({ account, requestId: id, amountMinor: 100000, intent: "pi_1", id: "evt_paid" })), fakeResponse());

    // A £200 refund, delivered three times, then the same refund again with a
    // stale event time.
    const partial = refund({ account, requestId: id, intent: "pi_1", refundId: "re_1", refundedTotalMinor: 20000, created: 1_757_000_300, id: "evt_r1" });
    for (let i = 0; i < 3; i += 1) await h.fns.stripeConnectWebhook(webhook(partial), fakeResponse());
    const stale = { ...partial, id: "evt_r1_late", created: 1_757_000_050 };
    await h.fns.stripeConnectWebhook(webhook(stale), fakeResponse());

    const after = order(h);
    const finance = computeOrderFinance(after, SETTINGS);
    assert.strictEqual(after.refundedAmount, 200, "one refund, whatever the delivery count");
    assert.strictEqual(after.paidAmount, 800, "collected, after the money went back");
    assert.strictEqual(after.remainingAmount, 0, "the customer is not asked for it again");
    assert.strictEqual(finance.revenue, 1000, "and the sale was still worth £1,000");
    // The four figures, separately, as the operator asked.
    assert.strictEqual(ledgerPaths(h).length, 2, "one payment row and one refund row");
    pass("gross sale, collected, refunded and remaining are each right after a duplicated and a stale refund");
  }

  {
    // Partial then full, with Stripe's cumulative total, arriving out of order:
    // the full refund first, then the partial one that preceded it.
    const h = harness();
    const account = await connected(h);
    const made = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    const id = made.request.paymentRequestId;
    await h.fns.stripeConnectWebhook(webhook(paid({ account, requestId: id, amountMinor: 100000, intent: "pi_1", id: "evt_paid" })), fakeResponse());

    await h.fns.stripeConnectWebhook(webhook(refund({ account, requestId: id, intent: "pi_1", refundId: "re_2", refundedTotalMinor: 100000, fully: true, created: 1_757_000_400, id: "evt_full" })), fakeResponse());
    await h.fns.stripeConnectWebhook(webhook(refund({ account, requestId: id, intent: "pi_1", refundId: "re_1", refundedTotalMinor: 20000, created: 1_757_000_300, id: "evt_partial" })), fakeResponse());

    const request = h.store.read(`companies/${CO}/paymentRequests/${id}`);
    assert.strictEqual(request.publicStatus, "refunded", "the later event's verdict stands");
    assert.strictEqual(request.refundedAmountMinor, 100000, "and the earlier one cannot lower it");
    const after = order(h);
    // Stripe's amount_refunded is the charge's CUMULATIVE refunded total, not
    // this refund's own amount. So the £200 event that arrives second is not
    // another £200 — it is a smaller view of a total we already hold, and
    // adding it would refund the customer £1,200 on a £1,000 charge. The total
    // is £1,000 whichever order the two arrive in.
    assert.strictEqual(after.refundedAmount, 1000, "the cumulative total, not the sum of two cumulative totals");
    assert.strictEqual(after.paidAmount, 0, "nothing is left collected");
    // One ledger row, because the second event moved the cumulative total by
    // nothing. Attribution is coarser out of order — the whole £1,000 is filed
    // under re_2 rather than £200 under re_1 and £800 under re_2 — but the
    // money is right, which is the property that matters.
    const refundRows = ledgerPaths(h).filter((path) => path.includes("refund:"));
    assert.strictEqual(refundRows.length, 1, "no second row for money already counted");

    // And the in-order delivery of the same two refunds reaches the same total.
    const g = harness();
    const account2 = await connected(g);
    const made2 = await g.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    const id2 = made2.request.paymentRequestId;
    await g.fns.stripeConnectWebhook(webhook(paid({ account: account2, requestId: id2, amountMinor: 100000, intent: "pi_1", id: "evt_paid" })), fakeResponse());
    await g.fns.stripeConnectWebhook(webhook(refund({ account: account2, requestId: id2, intent: "pi_1", refundId: "re_1", refundedTotalMinor: 20000, created: 1_757_000_300, id: "evt_partial" })), fakeResponse());
    await g.fns.stripeConnectWebhook(webhook(refund({ account: account2, requestId: id2, intent: "pi_1", refundId: "re_2", refundedTotalMinor: 100000, fully: true, created: 1_757_000_400, id: "evt_full" })), fakeResponse());
    assert.strictEqual(order(g).refundedAmount, 1000, "same money, delivered the other way round");
    assert.strictEqual(ledgerPaths(g).filter((path) => path.includes("refund:")).length, 2, "two rows in order, £200 then £800");
    pass("a cumulative refund total is not double counted, whichever order the events arrive in");
  }

  {
    // A refund that arrives before its payment: the money fact is kept, no paid
    // state is invented, and the payment settles it when it arrives.
    const h = harness();
    const account = await connected(h);
    const made = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    const id = made.request.paymentRequestId;
    await h.fns.stripeConnectWebhook(webhook(refund({ account, requestId: id, intent: "pi_1", refundId: "re_1", refundedTotalMinor: 100000, fully: true, created: 1_757_000_050, id: "evt_early" })), fakeResponse());
    const early = h.store.read(`companies/${CO}/paymentRequests/${id}`);
    assert.strictEqual(early.publicStatus, "open", "no paid state is invented to refund from");
    assert.strictEqual(early.refundedAmountMinor, 100000, "but the money fact is kept");
    pass("a refund delivered before its payment waits, and invents nothing");
  }

  console.log(`\nAll ${checks} payment race checks passed.`);
})().catch((error) => { console.error("FAILED:", (error && error.stack) || error); process.exit(1); });

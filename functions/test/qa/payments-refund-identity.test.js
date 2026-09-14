// A refund's identity, end to end, from the shape Stripe actually sends.
//
// e5d84009 fixed `externalPaymentId` so a refund is identified from
// `refunds.data[]` rather than from a top-level `refund_id` this rail invented.
// That fix was proven only against the extractor — four pure-shape assertions.
// This file is the other half: the identity driven through the real webhook,
// the real reducer, the real ledger and the real order, for the cases a live
// charge produces and the fixtures never did.
//
// EVERY fixture here carries the provider's shape and NOTHING ELSE. No
// `refund_id`, anywhere. That is the point: the legacy key is still honoured by
// the extractor for replayed payloads, so a fixture that fed it would pass
// whether or not the fix exists, and would certify the invention all over
// again. Delete the `refunds.data[]` read from eventBoundary.js and every check
// below fails.
//
// The invariants, rather than the sequences:
//
//   each refund on one charge earns its own ledger row, with its own identity;
//   the order's refundedAmount is the cumulative total, counted exactly once;
//   a redelivery moves no money, whether it repeats the event or the refund;
//   an event we cannot identify is skipped loudly, never keyed on the charge;
//   money from another connected account is refused, not applied;
//   an event from the other livemode is refused, not applied.
//
// Run: node test/qa/payments-refund-identity.test.js
const assert = require("assert");
const { makeFakeFirestore, FakeHttpsError } = require("./helpers/fakeFirestore");
const { createFakeConnectTransport } = require("../../payments/connectTransport");
const { createPaymentConnectFunctions } = require("../../paymentConnect");

let checks = 0;
function pass(name) { checks += 1; console.log("PASS ", name); }

const CO = "c1";
const OWNER = "uid-owner";
const ORDER = "order-1";

function harness({ mode = "test" } = {}) {
  const nowRef = { value: 1_757_000_000_000 };
  const store = makeFakeFirestore(nowRef);
  store.write(`companies/${CO}`, { ownerUid: OWNER, companyName: "Acme", country: "GB", ownerEmail: "o@acme.test", seciliParaBirimi: "£" });
  store.write(`siparisler/${ORDER}`, { companyId: CO, orderValue: 1000, paidAmount: 0, remainingAmount: 1000, refundedAmount: 0, payments: [], assignedToUid: "" });
  const fake = createFakeConnectTransport();
  const passthrough = (_o, handler) => handler;
  const fns = createPaymentConnectFunctions({
    admin: store.admin, onCall: passthrough, onRequest: passthrough, HttpsError: FakeHttpsError,
    requireWorkspace: async () => ({ uid: OWNER, companyId: CO, companyRef: store.admin.firestore().collection("companies").doc(CO), companyData: store.read(`companies/${CO}`) }),
    workspaceActor: (context) => ({ uid: context.uid, role: "owner", financialInfo: true }),
    transport: () => fake, railConfigured: () => true, mode
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

const paid = ({ account, requestId, amountMinor, intent = "pi_1", id = "evt_paid", created = 1_757_000_100, livemode = false }) => ({
  id, type: "checkout.session.completed", account, created, livemode,
  data: { object: { id: `cs_${intent}`, payment_intent: intent, amount_total: amountMinor, currency: "gbp",
    metadata: { companyId: CO, paymentRequestId: requestId, orderId: ORDER } } }
});

/**
 * A `charge.refunded` payload, the shape Stripe documents.
 *
 * The event delivers the CHARGE. `amount` is the charge's own amount and never
 * changes; `amount_refunded` is the charge's CUMULATIVE refunded total; and the
 * refunds themselves live in a list object under `refunds.data`, newest first,
 * each with its own id. `refundList` is passed newest-first by every caller
 * here, as Stripe orders it.
 */
const refunded = (options) => {
  const {
    account, requestId, intent = "pi_1", id, created, refundList = [],
    chargeAmountMinor = 100000, refundedTotalMinor, fully = false, livemode = false, hasMore = false
  } = options;
  // A test about a MALFORMED list hands `refunds` in raw — including as
  // `undefined`, which JSON drops on the way through the webhook body, so the
  // key is absent exactly as it is on a charge Stripe never expanded.
  // hasOwnProperty is the only way to tell "passed undefined" from "not passed".
  const overridden = Object.prototype.hasOwnProperty.call(options, "refunds");
  return {
    id, type: "charge.refunded", account, created, livemode,
    data: {
      object: {
        id: `ch_${intent}`, object: "charge", payment_intent: intent, currency: "gbp",
        amount: chargeAmountMinor,
        amount_refunded: refundedTotalMinor,
        refunded: fully === true,
        refunds: overridden ? options.refunds : {
          object: "list",
          has_more: hasMore,
          total_count: refundList.length,
          url: `/v1/charges/ch_${intent}/refunds`,
          data: refundList.map((row) => ({
            id: row.id, object: "refund", amount: row.amount, charge: `ch_${intent}`,
            created: row.created, currency: "gbp", status: "succeeded"
          }))
        },
        metadata: { companyId: CO, paymentRequestId: requestId, orderId: ORDER }
      }
    }
  };
};

const order = (h) => h.store.read(`siparisler/${ORDER}`);
const ledgerPaths = (h) => h.store.paths(`companies/${CO}/paymentLedger/`);
const refundRows = (h) => ledgerPaths(h).filter((path) => path.includes(":refund:"));
const ledgerRow = (h, identity) => h.store.read(`companies/${CO}/paymentLedger/stripe:${identity}`);

/** A connected workspace with a £1,000 order already paid in full. */
async function paidOrder(h, { id = "evt_paid" } = {}) {
  const account = await connected(h);
  const made = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
  const requestId = made.request.paymentRequestId;
  await h.fns.stripeConnectWebhook(webhook(paid({ account, requestId, amountMinor: 100000, id })), fakeResponse());
  assert.strictEqual(order(h).paidAmount, 1000, "setup: the £1,000 payment landed");
  return { account, requestId };
}

(async () => {
  // -------------------------------------------------------------------------
  // 1. Several refunds on ONE charge, each with its own identity
  // -------------------------------------------------------------------------
  {
    // £200, then £300, then £500 back on a £1,000 charge. Stripe re-delivers
    // the whole charge each time, with every refund so far listed newest first
    // and `amount_refunded` carrying the running total.
    //
    // Each refund is its own economic event and earns its own immutable ledger
    // row. The order's refundedAmount is the CUMULATIVE total and must equal it
    // exactly once — the trap being that `amount_refunded` is a total and not a
    // delta, so adding the three payloads' own figures would refund £1,700 on a
    // £1,000 charge.
    const h = harness();
    const { account, requestId } = await paidOrder(h);

    const re1 = { id: "re_1", amount: 20000, created: 1_757_000_300 };
    const re2 = { id: "re_2", amount: 30000, created: 1_757_000_400 };
    const re3 = { id: "re_3", amount: 50000, created: 1_757_000_500 };

    await h.fns.stripeConnectWebhook(webhook(refunded({
      account, requestId, id: "evt_r1", created: 1_757_000_300,
      refundList: [re1], refundedTotalMinor: 20000
    })), fakeResponse());
    assert.strictEqual(order(h).refundedAmount, 200, "the first £200 is back");
    assert.strictEqual(h.store.read(`companies/${CO}/paymentRequests/${requestId}`).publicStatus, "partially_refunded");

    await h.fns.stripeConnectWebhook(webhook(refunded({
      account, requestId, id: "evt_r2", created: 1_757_000_400,
      refundList: [re2, re1], refundedTotalMinor: 50000
    })), fakeResponse());
    assert.strictEqual(order(h).refundedAmount, 500, "£200 + £300, and not £200 + £500");

    await h.fns.stripeConnectWebhook(webhook(refunded({
      account, requestId, id: "evt_r3", created: 1_757_000_500,
      refundList: [re3, re2, re1], refundedTotalMinor: 100000, fully: true
    })), fakeResponse());

    // Three refunds, three rows, three identities — none collapsed onto another
    // and none keyed on the charge they share.
    assert.deepStrictEqual(refundRows(h), [
      `companies/${CO}/paymentLedger/stripe:refund:re_1`,
      `companies/${CO}/paymentLedger/stripe:refund:re_2`,
      `companies/${CO}/paymentLedger/stripe:refund:re_3`
    ], "each refund earns its own ledger row under its own id");
    // And each row holds THAT refund's own money, not the running total.
    assert.strictEqual(ledgerRow(h, "refund:re_1").amountMinor, 20000);
    assert.strictEqual(ledgerRow(h, "refund:re_2").amountMinor, 30000, "the delta, not the £500 cumulative total");
    assert.strictEqual(ledgerRow(h, "refund:re_3").amountMinor, 50000, "the delta, not the £1,000 cumulative total");

    const after = order(h);
    assert.strictEqual(after.refundedAmount, 1000, "the cumulative total, counted exactly once");
    assert.strictEqual(after.paidAmount, 0, "nothing is left collected");
    assert.strictEqual(after.remainingAmount, 0, "and the customer is not asked for it again");
    // One mirror row per refund, so the screen shows three refunds and not one.
    const mirrors = after.payments.filter((row) => row.refund === true);
    assert.strictEqual(mirrors.length, 3, "three refund rows on the order");
    assert.deepStrictEqual(mirrors.map((row) => row.externalPaymentId).sort(), ["refund:re_1", "refund:re_2", "refund:re_3"]);
    assert.deepStrictEqual(mirrors.map((row) => row.amount), [-200, -300, -500]);
    const request = h.store.read(`companies/${CO}/paymentRequests/${requestId}`);
    assert.strictEqual(request.publicStatus, "refunded");
    assert.strictEqual(request.refundedAmountMinor, 100000);
    pass("three refunds on one charge each earn their own ledger row, and the total is counted exactly once");
  }

  // -------------------------------------------------------------------------
  // 2. The same refund, delivered again and again
  // -------------------------------------------------------------------------
  {
    // Stripe retries until it gets a 2xx, so one refund arrives many times. The
    // rail refuses it twice over, and BOTH refusals are worth proving because
    // they catch different deliveries: the same event id is stopped at the
    // event ledger, and a NEW event id carrying the same refund is stopped by
    // the refund's own identity.
    const h = harness();
    const { account, requestId } = await paidOrder(h);
    const re1 = { id: "re_1", amount: 20000, created: 1_757_000_300 };
    const event = refunded({ account, requestId, id: "evt_r1", created: 1_757_000_300, refundList: [re1], refundedTotalMinor: 20000 });

    const responses = [];
    for (let i = 0; i < 3; i += 1) {
      const response = fakeResponse();
      await h.fns.stripeConnectWebhook(webhook(event), response);
      responses.push(response.out.body);
    }
    assert.strictEqual(responses[0].result.skipped, false, "the first delivery does the work");
    assert.strictEqual(responses[1].result.duplicate, true, "the second is refused at the event ledger");
    assert.strictEqual(responses[2].result.duplicate, true, "and so is the third");
    assert.strictEqual(refundRows(h).length, 1, "one ledger row for three deliveries");
    assert.strictEqual(order(h).refundedAmount, 200, "and refundedAmount moved exactly once");

    // The harder duplicate: a REPLAY under a new event id. The event ledger has
    // never seen it, so the only thing standing between it and a second £200 is
    // the refund's identity — which is the field e5d84009 fixed.
    for (const id of ["evt_r1_replay", "evt_r1_replay_again"]) {
      await h.fns.stripeConnectWebhook(webhook({ ...event, id }), fakeResponse());
    }
    assert.strictEqual(refundRows(h).length, 1, "still one ledger row after two replays under new event ids");
    assert.strictEqual(order(h).refundedAmount, 200, "and still one £200 movement");
    assert.strictEqual(order(h).paidAmount, 800);
    assert.strictEqual(order(h).payments.filter((row) => row.refund === true).length, 1, "one refund row on the order");
    pass("one refund delivered three times, and replayed under new event ids, moves the money once");
  }

  // -------------------------------------------------------------------------
  // 3. A later refund delivered before an earlier one
  // -------------------------------------------------------------------------
  {
    // The full refund's event arrives first; the partial one that really
    // happened before it arrives second. Both are real refunds and both are
    // recorded, but the ladder must not walk the request back from `refunded`
    // to `partially_refunded`, and the earlier event's smaller CUMULATIVE total
    // must not be mistaken for another £200 going back.
    const h = harness();
    const { account, requestId } = await paidOrder(h);
    const re1 = { id: "re_1", amount: 20000, created: 1_757_000_300 };
    const re2 = { id: "re_2", amount: 80000, created: 1_757_000_400 };

    await h.fns.stripeConnectWebhook(webhook(refunded({
      account, requestId, id: "evt_full", created: 1_757_000_400,
      refundList: [re2, re1], refundedTotalMinor: 100000, fully: true
    })), fakeResponse());
    await h.fns.stripeConnectWebhook(webhook(refunded({
      account, requestId, id: "evt_partial", created: 1_757_000_300,
      refundList: [re1], refundedTotalMinor: 20000
    })), fakeResponse());

    const request = h.store.read(`companies/${CO}/paymentRequests/${requestId}`);
    assert.strictEqual(request.publicStatus, "refunded", "the later event's verdict stands");
    assert.strictEqual(request.refundedAmountMinor, 100000, "and the earlier one cannot lower it");
    assert.strictEqual(order(h).refundedAmount, 1000, "the cumulative total, not £1,200");
    assert.strictEqual(order(h).paidAmount, 0);

    // Both events are recorded — neither is dropped — and both were identified
    // as their OWN refund, which is what the fix under test provides.
    assert.deepStrictEqual(request.appliedEventIds, ["evt_paid", "evt_full", "evt_partial"], "both refund events are on the record");
    for (const id of ["evt_full", "evt_partial"]) {
      const row = h.store.read(`paymentProviderEvents/stripe:${account}:${id}`);
      assert(row && row.processedAt, `${id} was processed, not dropped`);
    }
    assert.strictEqual(
      h.store.read(`paymentProviderEvents/stripe:${account}:evt_partial`).result.externalPaymentId,
      "refund:re_1",
      "the late event resolved to its OWN refund and not to the one already filed"
    );

    // Attribution, and the trade this used to make is gone.
    //
    // It used to read: out of order there is ONE row, filed under re_2 for the
    // whole £1,000, because a row could only be written for the refund the
    // delivery was "about", and a second row would have been money already
    // inside that £1,000. The money was exact and the attribution coarse.
    //
    // Reading `refunds.data` as a SET removes the trade rather than softening
    // it. The first delivery already carries BOTH refunds, each with its own
    // amount, so both rows are written at once — £200 and £800 — and the late
    // delivery adds nothing because `create()` already holds both ids. £1,000
    // either way, now attributed to the refunds that actually happened.
    //
    // This works because Stripe priced each entry. The bare-`refund_id` shape
    // has no per-refund figure and still uses the cumulative delta; see
    // `payments-races`, which is where pricing that shape per-delivery shows up
    // as £1,200 on a £1,000 charge.
    assert.deepStrictEqual(refundRows(h), [
      `companies/${CO}/paymentLedger/stripe:refund:re_1`,
      `companies/${CO}/paymentLedger/stripe:refund:re_2`
    ], "out of order, each refund still earns its own row");
    assert.strictEqual(ledgerRow(h, "refund:re_1").amountMinor, 20000, "its own £200, not a share of the total");
    assert.strictEqual(ledgerRow(h, "refund:re_2").amountMinor, 80000, "its own £800, not the £1,000 cumulative total");
    assert.strictEqual(
      ledgerRow(h, "refund:re_1").amountMinor + ledgerRow(h, "refund:re_2").amountMinor,
      100000,
      "and together exactly the cumulative total — never £1,200"
    );

    const g = harness();
    const inOrder = await paidOrder(g);
    await g.fns.stripeConnectWebhook(webhook(refunded({
      account: inOrder.account, requestId: inOrder.requestId, id: "evt_partial", created: 1_757_000_300,
      refundList: [re1], refundedTotalMinor: 20000
    })), fakeResponse());
    await g.fns.stripeConnectWebhook(webhook(refunded({
      account: inOrder.account, requestId: inOrder.requestId, id: "evt_full", created: 1_757_000_400,
      refundList: [re2, re1], refundedTotalMinor: 100000, fully: true
    })), fakeResponse());
    assert.strictEqual(order(g).refundedAmount, 1000, "same money, delivered the other way round");
    assert.deepStrictEqual(refundRows(g), [
      `companies/${CO}/paymentLedger/stripe:refund:re_1`,
      `companies/${CO}/paymentLedger/stripe:refund:re_2`
    ], "in order, each refund keeps its own row");
    assert.strictEqual(ledgerRow(g, "refund:re_1").amountMinor, 20000);
    assert.strictEqual(ledgerRow(g, "refund:re_2").amountMinor, 80000);
    pass("a refund delivered out of order records both refunds without moving the state backwards or double counting");
  }

  // -------------------------------------------------------------------------
  // 4. A charge whose refunds we cannot read
  // -------------------------------------------------------------------------
  {
    // `refunds` absent, the list empty, and `refunds` present but not a list
    // object. None of these can be guessed: keying the row on the charge would
    // merge every refund of that charge into one row and lose all but the
    // first. The event is skipped LOUDLY — `no_payment_identity` on the record
    // — so an operator can find it, and no money moves on a guess.
    const h = harness();
    const { account, requestId } = await paidOrder(h);

    const unreadable = [
      ["refunds absent entirely", { refunds: undefined }],
      ["refunds.data empty", { refundList: [] }],
      ["refunds is a string", { refunds: "re_1" }],
      ["refunds is an array", { refunds: ["re_1"] }],
      ["refunds.data is not an array", { refunds: { object: "list", data: "re_1" } }],
      ["refunds.data holds a hole", { refunds: { object: "list", data: [null] } }],
      ["refunds.data holds a refund with no id", { refunds: { object: "list", data: [{ object: "refund", amount: 20000 }] } }]
    ];

    let index = 0;
    for (const [name, shape] of unreadable) {
      index += 1;
      const response = fakeResponse();
      await h.fns.stripeConnectWebhook(webhook(refunded({
        account, requestId, id: `evt_bad_${index}`, created: 1_757_000_300 + index,
        refundList: [], refundedTotalMinor: 20000, ...shape
      })), response);
      assert.strictEqual(response.out.body.result.skipped, true, `${name}: must not be applied`);
      assert.strictEqual(response.out.body.result.reason, "no_payment_identity", `${name}: and must say why`);
    }

    assert.strictEqual(refundRows(h).length, 0, "no refund ledger row was written on a guess");
    assert.strictEqual(order(h).refundedAmount, 0, "and refundedAmount never moved");
    assert.strictEqual(order(h).paidAmount, 1000, "the payment is untouched");
    // The charge id is the guess that would look most reasonable and be most
    // wrong, so it is named explicitly.
    assert.strictEqual(
      ledgerPaths(h).filter((path) => path.includes("ch_")).length, 0,
      "and nothing was ever keyed on the charge id"
    );
    pass("a charge with no readable refund yields no identity and is skipped, never keyed on the charge");
  }

  // -------------------------------------------------------------------------
  // 5. Another workspace's connected account
  // -------------------------------------------------------------------------
  {
    // The refund is stamped with a DIFFERENT connected account than the one the
    // payment link was made on. Whatever put a second account in front of this
    // workspace — a stale index row, an operator repair, a second platform
    // replaying a real event — the money did not come back out of the account
    // that holds it, so applying it would tell the workspace £200 was refunded
    // when their Stripe balance never moved.
    //
    // `matchesRequest` has carried an `account_mismatch` problem since PR-P0.
    // It could never fire: the caller passed the EVENT's own account as the
    // expected value, so the check compared a value with itself. The request now
    // records the account its link was created on, and that is what is compared.
    const h = harness();
    const { account, requestId } = await paidOrder(h);
    const stranger = "acct_fake9999";
    assert.notStrictEqual(stranger, account);
    // A second account resolving to this same workspace, so the event gets past
    // the boundary and the mismatch is decided where it has to be: against the
    // request, not against the index.
    h.store.write(`paymentConnectionIndex/stripe:${stranger}`, { provider: "stripe", companyId: CO, createdAtMs: 1 });

    const response = fakeResponse();
    await h.fns.stripeConnectWebhook(webhook(refunded({
      account: stranger, requestId, id: "evt_stranger", created: 1_757_000_300,
      refundList: [{ id: "re_stranger", amount: 20000, created: 1_757_000_300 }], refundedTotalMinor: 20000
    })), response);

    assert.strictEqual(response.out.body.result.skipped, true, "a refund from another account is not applied");
    assert.strictEqual(response.out.body.result.reason, "event_does_not_match_request");
    assert.deepStrictEqual(response.out.body.result.problems, ["account_mismatch"],
      "and the account is the problem — nothing else is masking it");
    assert.strictEqual(refundRows(h).length, 0, "no ledger row");
    assert.strictEqual(order(h).refundedAmount, 0, "and refundedAmount never moved");
    assert.strictEqual(order(h).paidAmount, 1000);
    // Named on the request, because a mismatch is an operator's to look at.
    const request = h.store.read(`companies/${CO}/paymentRequests/${requestId}`);
    assert.deepStrictEqual(request.mismatchProblems, ["account_mismatch"]);
    assert(request.mismatchAtMs > 0);

    // And the account the link WAS made on still works, so the guard refuses
    // the stranger rather than refusing refunds.
    await h.fns.stripeConnectWebhook(webhook(refunded({
      account, requestId, id: "evt_own", created: 1_757_000_400,
      refundList: [{ id: "re_own", amount: 20000, created: 1_757_000_400 }], refundedTotalMinor: 20000
    })), fakeResponse());
    assert.strictEqual(order(h).refundedAmount, 200, "the workspace's own account is still honoured");
    pass("a refund stamped with another connected account is refused, and the request's own account still works");
  }

  // -------------------------------------------------------------------------
  // 6. Test money and live money
  // -------------------------------------------------------------------------
  {
    // A test-mode deployment holds test-mode keys and a test-mode workspace
    // connection. A `livemode: true` event on it is another environment's money:
    // the ids would mostly miss, but "mostly" is not a guarantee, and a refund
    // that DOES resolve would move a real workspace's numbers from a
    // reality it has no account in.
    const h = harness({ mode: "test" });
    const { account, requestId } = await paidOrder(h);
    assert.strictEqual(h.store.read(`companies/${CO}/paymentConnections/stripe`).mode, "test", "the workspace is connected in test mode");

    const response = fakeResponse();
    await h.fns.stripeConnectWebhook(webhook(refunded({
      account, requestId, id: "evt_live", created: 1_757_000_300, livemode: true,
      refundList: [{ id: "re_live", amount: 20000, created: 1_757_000_300 }], refundedTotalMinor: 20000
    })), response);

    assert.strictEqual(response.out.code, 202, "refused, and not retried forever");
    assert.strictEqual(response.out.body.ignored, "livemode_mismatch");
    assert.strictEqual(refundRows(h).length, 0, "no ledger row");
    assert.strictEqual(order(h).refundedAmount, 0, "and refundedAmount never moved");
    assert.strictEqual(
      h.store.read(`paymentProviderEvents/stripe:${account}:evt_live`), undefined,
      "the event is refused before it is even claimed"
    );

    // The same refusal the other way round: a live deployment must not apply a
    // test-mode event either, or a test card could move real money's numbers.
    const live = harness({ mode: "live" });
    const liveAccount = await connected(live);
    const madeLive = await live.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    const testResponse = fakeResponse();
    await live.fns.stripeConnectWebhook(webhook(paid({
      account: liveAccount, requestId: madeLive.request.paymentRequestId, amountMinor: 100000, id: "evt_test", livemode: false
    })), testResponse);
    assert.strictEqual(testResponse.out.body.ignored, "livemode_mismatch", "a test event on a live deployment is refused too");
    assert.strictEqual(order(live).paidAmount, 0, "and no money moved");

    // An event that does not state its livemode at all is NOT refused. Stripe
    // always sends the field; a hand-built or replayed payload may not, and
    // refusing those would drop money over a field that says nothing. This is
    // the same discipline platformEventAdmissible already applies.
    const silent = refunded({
      account, requestId, id: "evt_silent", created: 1_757_000_500,
      refundList: [{ id: "re_silent", amount: 20000, created: 1_757_000_500 }], refundedTotalMinor: 20000
    });
    delete silent.livemode;
    await h.fns.stripeConnectWebhook(webhook(silent), fakeResponse());
    assert.strictEqual(order(h).refundedAmount, 200, "an event with no livemode field is still applied");
    pass("an event from the other livemode is refused on both rails, and a payload that omits the field still lands");
  }

  // -------------------------------------------------------------------------
  // The refunds are a SET, so neither their order nor a truncated page decides
  // anything. These are the checks that fail if `refundSetFrom` is removed and
  // the reader goes back to picking one entry out of the list.
  // -------------------------------------------------------------------------
  {
    // Same two refunds, delivered to two workspaces in opposite list orders.
    // Stripe documents newest-first; nothing here relies on that being true,
    // which is the point — an assumption we cannot verify from this side must
    // not be load-bearing.
    const newestFirst = harness();
    const a = await paidOrder(newestFirst);
    await newestFirst.fns.stripeConnectWebhook(webhook(refunded({
      account: a.account, requestId: a.requestId, id: "evt_order_a", created: 1_757_000_400,
      refundList: [{ id: "re_y", amount: 30000, created: 1_757_000_400 }, { id: "re_x", amount: 20000, created: 1_757_000_300 }],
      refundedTotalMinor: 50000
    })), fakeResponse());

    const oldestFirst = harness();
    const b = await paidOrder(oldestFirst);
    await oldestFirst.fns.stripeConnectWebhook(webhook(refunded({
      account: b.account, requestId: b.requestId, id: "evt_order_b", created: 1_757_000_400,
      refundList: [{ id: "re_x", amount: 20000, created: 1_757_000_300 }, { id: "re_y", amount: 30000, created: 1_757_000_400 }],
      refundedTotalMinor: 50000
    })), fakeResponse());

    assert.deepStrictEqual(refundRows(newestFirst), refundRows(oldestFirst),
      "the order Stripe listed them in changed which rows exist");
    assert.strictEqual(ledgerRow(newestFirst, "refund:re_x").amountMinor, 20000);
    assert.strictEqual(ledgerRow(newestFirst, "refund:re_y").amountMinor, 30000);
    assert.strictEqual(ledgerRow(oldestFirst, "refund:re_x").amountMinor, 20000);
    assert.strictEqual(ledgerRow(oldestFirst, "refund:re_y").amountMinor, 30000);
    assert.strictEqual(order(newestFirst).refundedAmount, order(oldestFirst).refundedAmount,
      "and the order's total is the same either way");
    assert.strictEqual(order(newestFirst).refundedAmount, 500);
    pass("the refunds are a set: reversing the list changes neither the rows nor the money");
  }

  {
    // A page that says `has_more`. The old reader treated this as harmless on
    // the strength of a convention — lists come newest first, so the end that
    // was cut is the older one — which nothing here has ever been able to
    // confirm against a live payload. Now the truncation is completed through
    // the provider instead, so which end was cut does not matter.
    const h = harness();
    const { account, requestId } = await paidOrder(h);

    // The provider holds three refunds; the event carries one and admits it is
    // incomplete. The fake deliberately lists them OLDEST first — the opposite
    // of Stripe's own convention — so a reader that still trusted position
    // would pick the wrong one.
    h.fake.refund("ch_pi_1", { id: "re_p1", amountMinor: 20000, created: 1_757_000_300 });
    h.fake.refund("ch_pi_1", { id: "re_p2", amountMinor: 30000, created: 1_757_000_400 });
    h.fake.refund("ch_pi_1", { id: "re_p3", amountMinor: 50000, created: 1_757_000_500 });

    await h.fns.stripeConnectWebhook(webhook(refunded({
      account, requestId, id: "evt_truncated", created: 1_757_000_500,
      refundList: [{ id: "re_p3", amount: 50000, created: 1_757_000_500 }],
      refundedTotalMinor: 100000, fully: true, hasMore: true
    })), fakeResponse());

    assert.deepStrictEqual(refundRows(h), [
      `companies/${CO}/paymentLedger/stripe:refund:re_p1`,
      `companies/${CO}/paymentLedger/stripe:refund:re_p2`,
      `companies/${CO}/paymentLedger/stripe:refund:re_p3`
    ], "a truncated page must be completed through the provider, not guessed at");
    assert.strictEqual(ledgerRow(h, "refund:re_p1").amountMinor, 20000, "the refund the page had cut off still earns its own row");
    assert.strictEqual(ledgerRow(h, "refund:re_p2").amountMinor, 30000);
    assert.strictEqual(ledgerRow(h, "refund:re_p3").amountMinor, 50000);
    assert.strictEqual(order(h).refundedAmount, 1000, "the cumulative total, counted exactly once");
    assert(h.fake.calls.some((c) => c.method === "listChargeRefunds" && c.chargeId === "ch_pi_1"),
      "the provider was actually asked to complete the list");
    pass("a truncated refunds page is completed through the provider, so which end was cut decides nothing");
  }

  {
    // And a complete page does NOT ask the provider: completion is for the
    // truncated case, not a second round trip on every refund.
    const h = harness();
    const { account, requestId } = await paidOrder(h);
    await h.fns.stripeConnectWebhook(webhook(refunded({
      account, requestId, id: "evt_complete", created: 1_757_000_300,
      refundList: [{ id: "re_only", amount: 20000, created: 1_757_000_300 }], refundedTotalMinor: 20000
    })), fakeResponse());
    assert(!h.fake.calls.some((c) => c.method === "listChargeRefunds"),
      "a complete list must not cost a provider call");
    assert.strictEqual(order(h).refundedAmount, 200);
    pass("a complete refunds list is taken at face value, with no extra provider call");
  }

  console.log(`\nAll ${checks} refund identity checks passed.`);
})().catch((error) => { console.error("FAILED:", (error && error.stack) || error); process.exit(1); });

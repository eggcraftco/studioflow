// PR-P2 — payment links, end to end against a fake Stripe and a fake Firestore.
//
// The scenarios below are the ones that take a customer's money twice, and each
// is here because it is cheap to get wrong and expensive to discover:
//
//   two links open at once            prevented, by reserving headroom
//   the order shrinks under a link    cannot be prevented; named and flagged
//   money arrives another way         same shape, same answer
//   the webhook arrives ten times     one ledger row, one set of numbers
//   we crash after the Stripe call    the same key, so the same session
//
// A Stripe call and a Firestore write are two systems. Nothing here assumes
// they are one transaction; the tests exist to prove what survives the gap.
//
// Run: node test/qa/payments-request-flow.test.js
const assert = require("assert");
const { makeFakeFirestore, FakeHttpsError } = require("./helpers/fakeFirestore");
const { createFakeConnectTransport } = require("../../payments/connectTransport");
const { createPaymentConnectFunctions } = require("../../paymentConnect");

let checks = 0;
function pass(name) { checks += 1; console.log("PASS ", name); }

const CO = "c1";
const OWNER = "uid-owner";
const ORDER = "order-1";

function harness({ role = "owner", remainingAmount = 1000, paidAmount = 0, currency = "£" } = {}) {
  const nowRef = { value: 1_757_000_000_000 };
  const store = makeFakeFirestore(nowRef);
  store.write(`companies/${CO}`, { ownerUid: OWNER, companyName: "Acme", country: "GB", ownerEmail: "o@acme.test", seciliParaBirimi: currency });
  store.write(`siparisler/${ORDER}`, {
    companyId: CO, orderValue: 1000, paidAmount, remainingAmount, refundedAmount: 0, payments: [], assignedToUid: ""
  });

  const fake = createFakeConnectTransport();
  const passthrough = (_o, handler) => handler;
  const fns = createPaymentConnectFunctions({
    admin: store.admin,
    onCall: passthrough,
    onRequest: passthrough,
    HttpsError: FakeHttpsError,
    requireWorkspace: async () => ({
      uid: OWNER, companyId: CO,
      companyRef: store.admin.firestore().collection("companies").doc(CO),
      companyData: store.read(`companies/${CO}`)
    }),
    workspaceActor: (context) => ({ uid: context.uid, role, financialInfo: true }),
    transport: () => fake,
    railConfigured: () => true,
    mode: "test"
  });
  return { store, fake, fns, nowRef };
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

const paidEvent = ({ account, requestId, amountMinor, intent = "pi_1", id = "evt_paid", created = 1_757_000_100 }) => ({
  id, type: "checkout.session.completed", account, created, livemode: false,
  data: { object: { id: "cs_1", payment_intent: intent, amount_total: amountMinor, currency: "gbp",
    metadata: { companyId: CO, paymentRequestId: requestId, orderId: ORDER } } }
});

(async () => {
  // -------------------------------------------------------------------------
  // 1. Creating a link
  // -------------------------------------------------------------------------
  {
    const h = harness();
    await connected(h);
    const result = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 30000, purpose: "deposit" } });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.request.publicStatus, "open");
    assert.strictEqual(result.request.amountMinor, 30000);
    assert.strictEqual(result.request.currency, "GBP", "the workspace's £ resolved to GBP");
    assert(result.request.url.startsWith("https://checkout.stripe.test/pay/"));
    // No provider ids in what a client receives.
    const serialized = JSON.stringify(result.request);
    assert(!serialized.includes("acct_fake"), "the connected account leaked");
    assert(!/"providerSessionId"/.test(serialized), "the session id leaked");
    pass("a deposit link is created, opened, and returns only Stripe's own hosted URL");
  }

  {
    // The rail must be ready. An onboarding workspace cannot ask for money.
    const h = harness();
    await h.fns.beginStripeConnectOnboarding({});
    await assert.rejects(
      () => h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 1000 } }),
      (error) => error.code === "failed-precondition"
    );
    pass("a workspace that has not finished Stripe onboarding cannot create a link");
  }

  {
    // "¥" is JPY or CNY, and the two differ by a hundred times. Refused.
    const h = harness({ currency: "¥" });
    await connected(h);
    await assert.rejects(
      () => h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 1000 } }),
      (error) => error.code === "failed-precondition" && /currency/i.test(error.message)
    );
    pass("an ambiguous workspace currency symbol blocks the link instead of guessing");
  }

  // -------------------------------------------------------------------------
  // 2. Two links at once
  // -------------------------------------------------------------------------
  {
    const h = harness();
    await connected(h);
    await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 70000, purpose: "deposit" } });
    await assert.rejects(
      () => h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 70000, purpose: "remaining_balance" } }),
      (error) => error.code === "failed-precondition" && error.message.includes("Another payment link"),
      "a second £700 link on a £1,000 order must be refused"
    );
    // ...but a link that fits alongside it is fine: this is an instalment plan,
    // not a mistake, and refusing it would break a real way of working.
    const second = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 30000, purpose: "instalment" } });
    assert.strictEqual(second.request.publicStatus, "open");
    const listed = await h.fns.listOrderPaymentRequests({ data: { orderId: ORDER } });
    assert.strictEqual(listed.headroomMinor, 0, "£1,000 of links on a £1,000 order leaves no headroom");
    assert.strictEqual(listed.requests.length, 2);
    pass("two links that fit are allowed; one that would over-collect is refused");
  }

  {
    // Cancelling a link returns its headroom, and expires the session at Stripe.
    const h = harness();
    await connected(h);
    const first = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    await h.fns.cancelOrderPaymentRequest({ data: { paymentRequestId: first.request.paymentRequestId } });
    assert(h.fake.calls.some((call) => call.method === "expireCheckoutSession"), "the session was expired at Stripe");
    const again = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    assert.strictEqual(again.request.publicStatus, "open");
    pass("cancelling a link expires it at Stripe and returns its headroom");
  }

  // -------------------------------------------------------------------------
  // 3. The crash between the Stripe call and our write
  // -------------------------------------------------------------------------
  {
    const h = harness();
    const accountId = await connected(h);
    // Step 1 and 2 happened; step 3 did not. The document is a draft and Stripe
    // already has the session.
    const draft = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 40000, clientRequestId: "attempt-1" } });
    const id = draft.request.paymentRequestId;
    const firstSession = h.store.read(`companies/${CO}/paymentRequests/${id}`).providerSessionId;
    h.store.write(`companies/${CO}/paymentRequests/${id}`, {
      ...h.store.read(`companies/${CO}/paymentRequests/${id}`), publicStatus: "draft", providerSessionId: "", url: ""
    });

    const retried = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 40000, clientRequestId: "attempt-1" } });
    assert.strictEqual(retried.resumed, true);
    assert.strictEqual(retried.request.paymentRequestId, id, "the retry finished the same request");
    assert.strictEqual(h.store.read(`companies/${CO}/paymentRequests/${id}`).providerSessionId, firstSession,
      "the same idempotency key returned the same Stripe session");
    const sessions = h.fake.calls.filter((call) => call.method === "createCheckoutSession");
    assert.strictEqual(new Set(sessions.map((call) => call.idempotencyKey)).size, 1, "one key");
    const all = await h.fns.listOrderPaymentRequests({ data: { orderId: ORDER } });
    assert.strictEqual(all.requests.length, 1, "one request, one link — not two");
    pass("a crash after the Stripe call resumes into the SAME session, never a second link");
  }

  // -------------------------------------------------------------------------
  // 4. Paying it
  // -------------------------------------------------------------------------
  {
    const h = harness();
    const accountId = await connected(h);
    const made = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    const id = made.request.paymentRequestId;

    const response = fakeResponse();
    await h.fns.stripeConnectWebhook(webhook(paidEvent({ account: accountId, requestId: id, amountMinor: 100000 })), response);
    assert.strictEqual(response.out.code, 200);
    assert.strictEqual(response.out.body.result.publicStatus, "paid");

    const ledger = h.store.read(`companies/${CO}/paymentLedger/stripe:pi:pi_1`);
    assert(ledger, "the money is in the server-only ledger");
    assert.strictEqual(ledger.amountMinor, 100000);
    assert.strictEqual(ledger.orderId, ORDER);

    const order = h.store.read(`siparisler/${ORDER}`);
    assert.strictEqual(order.paidAmount, 1000, "the order shows the money");
    assert.strictEqual(order.remainingAmount, 0, "and the balance is cleared");
    assert.strictEqual(order.payments.length, 1, "a mirror row for the clients");
    assert.strictEqual(order.payments[0].externalPaymentId, "pi:pi_1");
    pass("a paid link writes the ledger, repairs the order and mirrors one row");
  }

  {
    // Ten deliveries. One ledger row, one set of numbers, one mirror row.
    const h = harness();
    const accountId = await connected(h);
    const made = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    const event = paidEvent({ account: accountId, requestId: made.request.paymentRequestId, amountMinor: 100000 });
    for (let i = 0; i < 10; i += 1) await h.fns.stripeConnectWebhook(webhook(event), fakeResponse());
    const order = h.store.read(`siparisler/${ORDER}`);
    assert.strictEqual(order.paidAmount, 1000, "ten deliveries, one payment");
    assert.strictEqual(order.payments.length, 1);
    assert.strictEqual(h.store.paths(`companies/${CO}/paymentLedger/`).length, 1);
    pass("ten deliveries of one payment event leave one ledger row and one payment");
  }

  {
    // The twin event Stripe sends for the same Checkout payment.
    const h = harness();
    const accountId = await connected(h);
    const made = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    const id = made.request.paymentRequestId;
    await h.fns.stripeConnectWebhook(webhook(paidEvent({ account: accountId, requestId: id, amountMinor: 100000 })), fakeResponse());
    await h.fns.stripeConnectWebhook(webhook({
      id: "evt_pi", type: "payment_intent.succeeded", account: accountId, created: 1_757_000_101, livemode: false,
      data: { object: { id: "pi_1", amount: 100000, currency: "gbp", metadata: { companyId: CO, paymentRequestId: id, orderId: ORDER } } }
    }), fakeResponse());
    assert.strictEqual(h.store.read(`siparisler/${ORDER}`).paidAmount, 1000, "one payment, not two");
    assert.strictEqual(h.store.paths(`companies/${CO}/paymentLedger/`).length, 1);
    pass("checkout.session.completed and payment_intent.succeeded are one payment");
  }

  // -------------------------------------------------------------------------
  // 5. The world moving under an open link
  // -------------------------------------------------------------------------
  {
    // The order is reduced while a £700 link is out.
    const h = harness();
    await connected(h);
    const made = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 70000 } });
    h.store.write(`siparisler/${ORDER}`, { ...h.store.read(`siparisler/${ORDER}`), remainingAmount: 500 });
    const listed = await h.fns.listOrderPaymentRequests({ data: { orderId: ORDER } });
    const row = listed.requests.find((r) => r.paymentRequestId === made.request.paymentRequestId);
    assert.strictEqual(row.stale, true);
    assert.strictEqual(row.staleReason, "order_balance_fell_below_link");
    assert.strictEqual(row.excessMinor, 20000, "£200 more than the order now owes");
    assert.strictEqual(row.url, made.request.url, "the link still works — we cannot reach into an inbox");
    pass("an order reduced under an open link flags the link and says by how much");
  }

  {
    // Money arrives another way, and the open link would now over-collect.
    const h = harness();
    await connected(h);
    await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    h.store.write(`siparisler/${ORDER}`, { ...h.store.read(`siparisler/${ORDER}`), paidAmount: 1000, remainingAmount: 0 });
    const listed = await h.fns.listOrderPaymentRequests({ data: { orderId: ORDER } });
    assert.strictEqual(listed.requests[0].stale, true);
    assert.strictEqual(listed.requests[0].staleReason, "order_fully_settled");
    pass("a bank payment settling the order flags the open card link as fully stale");
  }

  {
    // And when the stale link is paid anyway: the money is real, it is kept,
    // and it is named an overpayment rather than quietly becoming revenue.
    const h = harness();
    const accountId = await connected(h);
    const made = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    h.store.write(`siparisler/${ORDER}`, { ...h.store.read(`siparisler/${ORDER}`), paidAmount: 600, remainingAmount: 400 });
    await h.fns.stripeConnectWebhook(webhook(paidEvent({ account: accountId, requestId: made.request.paymentRequestId, amountMinor: 100000 })), fakeResponse());

    const request = h.store.read(`companies/${CO}/paymentRequests/${made.request.paymentRequestId}`);
    assert.strictEqual(request.publicStatus, "paid", "the payment is not refused — Stripe already took it");
    assert.strictEqual(request.overpaidMinor, 60000, "£600 more than the order was owed, named");
    assert(h.store.read(`companies/${CO}/paymentLedger/stripe:pi:pi_1`), "and the money is in the ledger either way");
    pass("a stale link that is paid anyway keeps the money and reports the overpayment");
  }

  // -------------------------------------------------------------------------
  // 6. The event that does not match
  // -------------------------------------------------------------------------
  {
    const h = harness();
    const accountId = await connected(h);
    const made = await h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 100000 } });
    const id = made.request.paymentRequestId;
    // Same request, a different amount. Applying either number is a guess.
    await h.fns.stripeConnectWebhook(webhook(paidEvent({ account: accountId, requestId: id, amountMinor: 5000 })), fakeResponse());
    const request = h.store.read(`companies/${CO}/paymentRequests/${id}`);
    assert.deepStrictEqual(request.mismatchProblems, ["amount_mismatch"]);
    assert.strictEqual(request.publicStatus, "open", "nothing was applied");
    assert.strictEqual(h.store.paths(`companies/${CO}/paymentLedger/`).length, 0, "and no ledger row was written");
    assert.strictEqual(h.store.read(`siparisler/${ORDER}`).paidAmount, 0);
    pass("an event whose amount disagrees with the request is reported and applied to nothing");
  }

  // -------------------------------------------------------------------------
  // 7. Permissions
  // -------------------------------------------------------------------------
  {
    const h = harness({ role: "viewOnly" });
    await assert.rejects(
      () => h.fns.createOrderPaymentRequest({ data: { orderId: ORDER, amountMinor: 1000 } }),
      (error) => error.code === "permission-denied"
    );
    pass("a read-only role cannot ask a customer for money");
  }

  console.log(`\nAll ${checks} payment request checks passed.`);
})().catch((error) => { console.error("FAILED:", (error && error.stack) || error); process.exit(1); });

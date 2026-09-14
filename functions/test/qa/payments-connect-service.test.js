// PR-P1 — the workspace's own Stripe connection, driven end to end against a
// fake Firestore and a fake Stripe. No socket is opened and no secret is read.
//
// The fake transport is a state machine, not a fixture set: an account it
// creates starts unsubmitted, completeOnboarding() moves it the way Stripe
// would, restrict() puts a requirement back. So these checks prove the service
// REACTS to the provider, not merely that it compiles against it.
//
// Run: node test/qa/payments-connect-service.test.js
const assert = require("assert");
const { makeFakeFirestore, FakeHttpsError } = require("./helpers/fakeFirestore");
const { createFakeConnectTransport } = require("../../payments/connectTransport");
const { createPaymentConnectFunctions } = require("../../paymentConnect");

let checks = 0;
function pass(name) { checks += 1; console.log("PASS ", name); }

const CO = "c1";
const OWNER = "uid-owner";
const MEMBER = "uid-member";

/** Build the real factory over fakes. `who` decides which member calls. */
function harness({ who = OWNER, role = "owner", financialInfo = true } = {}) {
  const nowRef = { now: 1_757_000_000_000 };
  const store = makeFakeFirestore(nowRef);
  store.write(`companies/${CO}`, { ownerUid: OWNER, companyName: "Acme", country: "GB", ownerEmail: "owner@acme.test" });

  const fake = createFakeConnectTransport();
  const passthrough = (_options, handler) => handler;
  const responses = [];
  const fns = createPaymentConnectFunctions({
    admin: store.admin,
    onCall: passthrough,
    onRequest: passthrough,
    HttpsError: FakeHttpsError,
    requireWorkspace: async () => ({
      uid: who, companyId: CO,
      companyRef: store.admin.firestore().collection("companies").doc(CO),
      companyData: store.read(`companies/${CO}`)
    }),
    workspaceActor: (context) => ({ uid: context.uid, role, financialInfo }),
    transport: () => fake,
    mode: "test"
  });
  return { store, fake, fns, responses };
}

/** An express-ish response the webhook can write to. */
function fakeResponse() {
  const out = { code: 200, body: null, sent: null };
  return {
    out,
    status(code) { out.code = code; return this; },
    json(body) { out.body = body; return this; },
    send(text) { out.sent = text; return this; }
  };
}

const webhookRequest = (event, signature = "valid") => ({
  method: "POST",
  headers: { "stripe-signature": signature },
  rawBody: Buffer.from(JSON.stringify(event))
});

// ---------------------------------------------------------------------------
// 1. Onboarding
// ---------------------------------------------------------------------------
(async () => {
  {
    const { store, fake, fns } = harness();
    const first = await fns.beginStripeConnectOnboarding({});
    assert.strictEqual(first.ok, true);
    assert(first.url.startsWith("https://connect.stripe.test/setup/acct_fake"));
    assert.strictEqual(first.connection.status, "onboarding");
    // The account exists, is indexed, and the workspace document knows it.
    const connection = store.read(`companies/${CO}/paymentConnections/stripe`);
    assert(connection.stripeAccountId.startsWith("acct_fake"));
    const index = store.read(`paymentConnectionIndex/stripe:${connection.stripeAccountId}`);
    assert.strictEqual(index.companyId, CO);
    pass("onboarding creates one account, indexes it, and returns a link");

    // Calling again must NOT create a second account.
    const second = await fns.beginStripeConnectOnboarding({});
    assert.strictEqual(
      store.read(`companies/${CO}/paymentConnections/stripe`).stripeAccountId,
      connection.stripeAccountId
    );
    assert.strictEqual(fake.calls.filter((c) => c.method === "createAccount").length, 1);
    assert(second.url.includes(connection.stripeAccountId));
    pass("resuming onboarding reuses the workspace's account, never opens a second");
  }

  {
    // The account id must not reach a client, from any of the four callables.
    const { fns } = harness();
    const begin = await fns.beginStripeConnectOnboarding({});
    const got = await fns.getStripePaymentConnection({});
    const refreshed = await fns.refreshStripePaymentConnection({});
    const gone = await fns.disconnectStripePaymentConnection({});
    for (const [name, payload] of [["begin", begin], ["get", got], ["refresh", refreshed], ["disconnect", gone]]) {
      const serialized = JSON.stringify(payload.connection);
      assert(!serialized.includes("acct_fake"), `${name} leaked the connected account id`);
      assert(!("stripeAccountId" in payload.connection), `${name} returned stripeAccountId`);
    }
    // The onboarding URL is the one Stripe-shaped value that does reach the
    // client, and it is Stripe's own single-use link.
    assert(begin.url.includes("acct_fake"));
    pass("no callable returns the connected account id");
  }

  // ---------------------------------------------------------------------------
  // 2. Status is derived from the provider, and only moves where it may
  // ---------------------------------------------------------------------------
  {
    const { store, fake, fns } = harness();
    await fns.beginStripeConnectOnboarding({});
    const accountId = store.read(`companies/${CO}/paymentConnections/stripe`).stripeAccountId;

    let connection = (await fns.refreshStripePaymentConnection({})).connection;
    assert.strictEqual(connection.status, "onboarding");
    assert.strictEqual(connection.canCreatePaymentRequest, false);

    fake.completeOnboarding(accountId);
    connection = (await fns.refreshStripePaymentConnection({})).connection;
    assert.strictEqual(connection.status, "ready");
    assert.strictEqual(connection.canCreatePaymentRequest, true);
    assert.strictEqual(connection.chargesEnabled, true);
    assert(store.read(`companies/${CO}/paymentConnections/stripe`).connectedAt > 0);
    pass("completing onboarding at Stripe makes the workspace ready");

    fake.restrict(accountId, { pastDue: ["individual.verification.document"] });
    connection = (await fns.refreshStripePaymentConnection({})).connection;
    assert.strictEqual(connection.status, "restricted");
    assert.strictEqual(connection.canCreatePaymentRequest, false, "no new links while restricted");
    assert.strictEqual(connection.canCollectOnExistingLink, true, "links already with customers keep working");
    assert.strictEqual(connection.requirementsSummary.pastDueCount, 1);
    assert(!JSON.stringify(connection).includes("acct_fake"));
    pass("a restriction stops new links but not links customers already hold");
  }

  {
    // An account that vanished at Stripe is a real disconnection, and the
    // service must not sit in "ready" reporting money it cannot take.
    const { store, fake, fns } = harness();
    await fns.beginStripeConnectOnboarding({});
    const accountId = store.read(`companies/${CO}/paymentConnections/stripe`).stripeAccountId;
    fake.completeOnboarding(accountId);
    await fns.refreshStripePaymentConnection({});
    fake.accounts.delete(accountId);
    const connection = (await fns.refreshStripePaymentConnection({})).connection;
    assert.strictEqual(connection.status, "disconnected");
    assert.strictEqual(connection.lastErrorCode, "account_missing");
    pass("an account deleted at Stripe reads as disconnected, not as ready");
  }

  // ---------------------------------------------------------------------------
  // 3. Disconnect
  // ---------------------------------------------------------------------------
  {
    const { store, fake, fns } = harness();
    await fns.beginStripeConnectOnboarding({});
    const accountId = store.read(`companies/${CO}/paymentConnections/stripe`).stripeAccountId;
    fake.completeOnboarding(accountId);
    await fns.refreshStripePaymentConnection({});

    const result = await fns.disconnectStripePaymentConnection({});
    assert.strictEqual(result.connection.status, "disconnected");
    assert.strictEqual(result.accountKeptAtProvider, true);
    // The account still exists at Stripe: it is the workspace's, and it holds
    // their money. Only our link is gone.
    assert(fake.accounts.has(accountId), "disconnect must not delete the workspace's Stripe account");
    assert.strictEqual(store.read(`paymentConnectionIndex/stripe:${accountId}`), undefined);
    pass("disconnect removes our link and the index, and keeps the account");
  }

  // 3b. Reconnect — the half the disconnect above used to leave broken.
  {
    const { store, fake, fns } = harness();
    await fns.beginStripeConnectOnboarding({});
    const accountId = store.read(`companies/${CO}/paymentConnections/stripe`).stripeAccountId;
    fake.completeOnboarding(accountId);
    await fns.refreshStripePaymentConnection({});
    await fns.disconnectStripePaymentConnection({});
    assert.strictEqual(store.read(`paymentConnectionIndex/stripe:${accountId}`), undefined,
      "precondition: the disconnect above really did remove the index row");

    // Reconnect. `stripeAccountId` survives a disconnect on purpose, so this
    // takes the branch that already has an account and creates no new one.
    await fns.beginStripeConnectOnboarding({});
    const again = store.read(`companies/${CO}/paymentConnections/stripe`).stripeAccountId;
    assert.strictEqual(again, accountId, "reconnect must reuse the workspace's own account, not open a second one");
    assert.strictEqual(fake.accounts.size, 1, "reconnect created a second Stripe account");

    // The row the disconnect removed is back. Without this the account charges
    // cards and every event for it is refused as unknown_connected_account.
    const row = store.read(`paymentConnectionIndex/stripe:${accountId}`);
    assert(row, "reconnect left the reverse index missing, so this workspace's events can never be resolved");
    assert.strictEqual(row.companyId, CO);

    // Proved where it actually bites: through the webhook, not the index alone.
    fake.completeOnboarding(accountId);
    const event = {
      id: "evt_reconnect_1", type: "account.updated", account: accountId,
      created: 1_757_000_500, livemode: false, data: { object: { id: accountId } }
    };
    const response = fakeResponse();
    await fns.stripeConnectWebhook(webhookRequest(event), response);
    assert.strictEqual(response.out.code, 200,
      `a reconnected workspace's event was refused: ${JSON.stringify(response.out.body)}`);
    pass("reconnecting after a disconnect restores the index, so the account's events find their workspace again");
  }

  // ---------------------------------------------------------------------------
  // 4. Permissions
  // ---------------------------------------------------------------------------
  {
    for (const role of ["admin", "member", "viewOnly", "workflowOnly"]) {
      const { fns } = harness({ who: MEMBER, role });
      for (const call of ["beginStripeConnectOnboarding", "refreshStripePaymentConnection", "disconnectStripePaymentConnection"]) {
        await assert.rejects(
          () => fns[call]({}),
          (error) => error.code === "permission-denied" && /only the workspace owner/i.test(error.message),
          `${role} must not be able to ${call}`
        );
      }
      // ...but anyone in the workspace may ask whether payments work.
      const view = await fns.getStripePaymentConnection({});
      assert.strictEqual(view.ok, true);
      assert.strictEqual(view.connection.status, "disconnected");
    }
    pass("only the owner connects, refreshes or disconnects; everyone may see the status");
  }

  // ---------------------------------------------------------------------------
  // 5. The webhook — its own endpoint, its own boundary
  // ---------------------------------------------------------------------------
  {
    const { store, fake, fns } = harness();
    await fns.beginStripeConnectOnboarding({});
    const accountId = store.read(`companies/${CO}/paymentConnections/stripe`).stripeAccountId;
    fake.completeOnboarding(accountId);

    const event = { id: "evt_1", type: "account.updated", account: accountId, created: 1_757_000_100, data: { object: { id: accountId } } };
    const response = fakeResponse();
    await fns.stripeConnectWebhook(webhookRequest(event), response);
    assert.strictEqual(response.out.code, 200);
    assert.strictEqual(response.out.body.result.status, "ready");
    assert.strictEqual(store.read(`companies/${CO}/paymentConnections/stripe`).status, "ready");
    const ledger = store.read(`paymentProviderEvents/stripe:${accountId}:evt_1`);
    assert.strictEqual(ledger.companyId, CO);
    assert(ledger.processedAt > 0);
    pass("account.updated re-derives the connection and files the event");

    // Ten deliveries, one result. The second and later find processedAt set.
    const before = fake.calls.filter((c) => c.method === "retrieveAccount").length;
    for (let i = 0; i < 9; i += 1) {
      const again = fakeResponse();
      await fns.stripeConnectWebhook(webhookRequest(event), again);
      assert.strictEqual(again.out.body.result.duplicate, true);
    }
    assert.strictEqual(
      fake.calls.filter((c) => c.method === "retrieveAccount").length, before,
      "a duplicate delivery must not re-read the account"
    );
    pass("ten deliveries of one event do the work once");
  }

  {
    // The body is used to identify the account, never to describe it.
    const { store, fake, fns } = harness();
    await fns.beginStripeConnectOnboarding({});
    const accountId = store.read(`companies/${CO}/paymentConnections/stripe`).stripeAccountId;
    // Stripe is still onboarding this account, but the event body lies.
    const liar = {
      id: "evt_liar", type: "account.updated", account: accountId, created: 1_757_000_200,
      data: { object: { id: accountId, charges_enabled: true, details_submitted: true, payouts_enabled: true } }
    };
    const response = fakeResponse();
    await fns.stripeConnectWebhook(webhookRequest(liar), response);
    assert.strictEqual(store.read(`companies/${CO}/paymentConnections/stripe`).status, "onboarding");
    pass("a webhook body claiming charges_enabled cannot make a workspace ready");
  }

  {
    // The finding PR-P0 was written for: a connected account we do not know
    // must never be handled, and must certainly never reach the subscription
    // rail.
    const { fns } = harness();
    const stray = { id: "evt_x", type: "account.updated", account: "acct_stranger", created: 1, data: { object: { id: "acct_stranger" } } };
    const response = fakeResponse();
    await fns.stripeConnectWebhook(webhookRequest(stray), response);
    assert.strictEqual(response.out.code, 202);
    assert.strictEqual(response.out.body.ignored, "unknown_connected_account");
    pass("an event for an unknown connected account is refused");
  }

  {
    // A platform event on this endpoint is misconfiguration, and handling it
    // here would be the exact merge of the two rails this endpoint prevents.
    const { fns } = harness();
    const platform = { id: "evt_p", type: "invoice.paid", created: 1, data: { object: { id: "in_1" } } };
    const response = fakeResponse();
    await fns.stripeConnectWebhook(webhookRequest(platform), response);
    assert.strictEqual(response.out.code, 202);
    assert.strictEqual(response.out.body.ignored, "platform_event_on_connect_endpoint");
    pass("a platform event reaching the connect endpoint is ignored, not handled");
  }

  {
    const { fns } = harness();
    const event = { id: "evt_s", type: "account.updated", account: "acct_fake0001", created: 1, data: { object: {} } };
    const unsigned = fakeResponse();
    await fns.stripeConnectWebhook({ method: "POST", headers: {}, rawBody: Buffer.from("{}") }, unsigned);
    assert.strictEqual(unsigned.out.code, 400);

    const forged = fakeResponse();
    await fns.stripeConnectWebhook(webhookRequest(event, "not-the-signature"), forged);
    assert.strictEqual(forged.out.code, 400);
    assert.strictEqual(forged.out.sent, "Webhook signature verification failed.");

    const wrongMethod = fakeResponse();
    await fns.stripeConnectWebhook({ method: "GET", headers: {} }, wrongMethod);
    assert.strictEqual(wrongMethod.out.code, 405);
    pass("an unsigned, forged or non-POST delivery is refused before anything is read");
  }

  {
    // A disconnected workspace's events stop being accepted, because the index
    // entry is what resolves them and disconnect deleted it.
    const { store, fake, fns } = harness();
    await fns.beginStripeConnectOnboarding({});
    const accountId = store.read(`companies/${CO}/paymentConnections/stripe`).stripeAccountId;
    await fns.disconnectStripePaymentConnection({});
    const response = fakeResponse();
    await fns.stripeConnectWebhook(webhookRequest({
      id: "evt_after", type: "account.updated", account: accountId, created: 9, data: { object: { id: accountId } }
    }), response);
    assert.strictEqual(response.out.code, 202);
    assert.strictEqual(response.out.body.ignored, "unknown_connected_account");
    assert.strictEqual(store.read(`companies/${CO}/paymentConnections/stripe`).status, "disconnected");
    pass("after a disconnect, that account's events no longer touch the workspace");
  }

  // ---------------------------------------------------------------------------
  // 6. Wiring. A factory nobody exports is a factory that does not run.
  // ---------------------------------------------------------------------------
  {
    const fs = require("fs");
    const path = require("path");
    const index = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
    assert(/createPaymentConnectFunctions\(/.test(index), "index.js builds the connect factory");
    assert(/Object\.assign\(exports, paymentConnectExports\)/.test(index), "index.js exports the connect functions");

    // The whole point of a second endpoint is a second secret. If the connect
    // webhook were ever wired to STRIPE_WEBHOOK_SECRET, a connected-account
    // event would verify on the subscription endpoint too, and the boundary
    // would be the only thing left between a customer's payment and NivaDesk's
    // entitlement rail.
    assert(/defineSecret\("STRIPE_CONNECT_WEBHOOK_SECRET"\)/.test(index), "the connect webhook has its own secret");
    const block = index.slice(index.indexOf("createPaymentConnectFunctions({"), index.indexOf("Object.assign(exports, paymentConnectExports)"));
    assert(/STRIPE_CONNECT_WEBHOOK_SECRET/.test(block), "the connect factory is given its own webhook secret");
    assert(!/STRIPE_WEBHOOK_SECRET(?!_)/.test(block.replace(/STRIPE_CONNECT_WEBHOOK_SECRET/g, "")), "the connect factory must not be given the subscription secret");
    pass("index.js wires the connect rail with its own signing secret");
  }

  {
    // The four collections must be denied to clients in the firestore rules'
    // wildcard, which is a DENY LIST — a dedicated block alone is inert,
    // because Firestore OR's rules together. Proven in the emulator by
    // test/qa/payment-collections-rules.test.mjs; asserted here so the source
    // edit cannot be reverted without a unit failure, even offline.
    const fs = require("fs");
    const path = require("path");
    const rules = fs.readFileSync(path.join(__dirname, "..", "..", "..", "firestore.rules"), "utf8");
    for (const name of ["paymentConnections", "paymentRequests", "paymentLedger"]) {
      const denials = (rules.match(new RegExp(`collectionId != '${name}'`, "g")) || []).length;
      assert.strictEqual(denials, 2, `${name} must be in BOTH the read and the write deny list, saw ${denials}`);
      assert(rules.includes(`match /companies/{companyId}/${name}/{document=**}`), `${name} needs its own block too`);
    }
    for (const name of ["paymentConnectionIndex", "paymentProviderEvents"]) {
      assert(rules.includes(`match /${name}/{document=**}`), `${name} needs its own server-only block`);
    }
    pass("the payment collections are in both wildcard deny lists and have their own blocks");
  }

  console.log(`\nAll ${checks} PR-P1 connection checks passed.`);
})().catch((error) => { console.error("FAILED:", error && error.stack || error); process.exit(1); });

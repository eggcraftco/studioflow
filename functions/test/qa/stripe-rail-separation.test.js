// The subscription rail refuses a connected-account event on its own account.
//
// Two endpoints and two signing secrets are supposed to make this impossible:
// stripeWebhook verifies with STRIPE_WEBHOOK_SECRET, stripeConnectWebhook with
// STRIPE_CONNECT_WEBHOOK_SECRET, and a connected-account event delivered to the
// wrong one fails verification before any code sees it.
//
// That is two layers of CONFIGURATION, and configuration is the layer that gets
// pasted wrong: one secret entered against the wrong Stripe endpoint and a
// workspace customer's checkout.session.completed walks into
// applyCompletedSubscriptionCheckout carrying a stranger's session. So the
// handler refuses by itself, before any applier and before any Stripe call.
//
// The half of this file that matters most is the half that proves the ORDINARY
// subscription flow still works. A guard that quietly refuses real events would
// be a worse outage than the one it prevents, and it would look like silence.
//
// Run: node test/qa/stripe-rail-separation.test.js
const assert = require("assert");
const { makeFakeFirestore, FakeHttpsError } = require("./helpers/fakeFirestore");
const { createStripeBillingFunctions } = require("../../stripeBilling");

let checks = 0;
function pass(name) { checks += 1; console.log("PASS ", name); }

const WORKSPACE = "ws-1";
const CUSTOMER = "cus_platform";
const SUB = "sub_platform";
// The price id the Pro monthly plan is sold at. The rail maps it through
// STRIPE_PRICE_PRO_MONTHLY, so the harness sets that env var rather than
// hard-coding a plan key the code would never derive.
const PRICE = "price_pro_monthly_test";

const PLAN_ENTITLEMENTS = {
  demo: { teamMemberLimit: 1, storageMB: 100 },
  pro_monthly: { teamMemberLimit: 5, storageMB: 5000 },
  pro_yearly: { teamMemberLimit: 5, storageMB: 5000 },
  lifetime_lite: { teamMemberLimit: 2, storageMB: 1000 },
  team_monthly: { teamMemberLimit: 10, storageMB: 20000 },
  team_yearly: { teamMemberLimit: 10, storageMB: 20000 }
};

/** A real platform subscription, as Stripe would hand it back. */
function platformSubscription(overrides = {}) {
  return Object.assign({
    id: SUB,
    object: "subscription",
    status: "active",
    customer: CUSTOMER,
    metadata: { workspaceId: WORKSPACE },
    cancel_at_period_end: false,
    items: { object: "list", data: [{ id: "si_1", quantity: 1, price: { id: PRICE }, current_period_end: 1_790_000_000 }] }
  }, overrides);
}

function harness({ secretKey = "sk_test_x", env = {} } = {}) {
  // The helper reads nowRef.value; passing { now } leaves every serverTimestamp
  // undefined, which silently drops processedAt and makes an idempotency check
  // look like it passed.
  const nowRef = { value: 1_757_000_000_000 };
  const store = makeFakeFirestore(nowRef);
  store.write(`companies/${WORKSPACE}`, {
    billingPlan: "demo", billingStatus: "free",
    billingCustomerId: CUSTOMER, billingSubscriptionId: SUB
  });

  const previous = {};
  const applied = { ...env, STRIPE_BILLING_ENABLED: "true", STRIPE_SECRET_KEY: secretKey, STRIPE_PRICE_PRO_MONTHLY: PRICE };
  for (const [key, value] of Object.entries(applied)) { previous[key] = process.env[key]; process.env[key] = value; }
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  };

  const retrieved = [];
  const stripe = {
    subscriptions: {
      async retrieve(id) { retrieved.push(id); return platformSubscription(); },
      async list() { return { object: "list", has_more: false, data: [] }; }
    }
  };

  const built = createStripeBillingFunctions({
    admin: store.admin,
    onCall: (_o, handler) => handler,
    onRequest: (_o, handler) => handler,
    onSchedule: (_o, handler) => handler,
    HttpsError: FakeHttpsError,
    STRIPE_SECRET_KEY: null,
    STRIPE_WEBHOOK_SECRET: null,
    APPLE_ROOT_CA_CERTS_PEM: null,
    GOOGLE_PLAY_SERVICE_ACCOUNT: null,
    PLAN_ENTITLEMENTS,
    requireWorkspaceForBilling: async () => { throw new Error("no callable is exercised here"); },
    workspaceOrderRole: () => "owner",
    normalizeWorkspaceRole: (role) => role,
    workspaceRoleLabel: (role) => role
  });
  return { store, stripe, retrieved, restore, process: built._internal.processStripeEvent };
}

const event = (overrides = {}) => Object.assign({
  id: "evt_1", type: "invoice.paid", livemode: false, created: 1_757_000_100,
  data: { object: {} }
}, overrides);

const invoicePaid = (overrides = {}) => event({
  id: "evt_inv", type: "invoice.paid",
  data: { object: { id: "in_1", customer: CUSTOMER, parent: { subscription_details: { subscription: SUB } }, metadata: { workspaceId: WORKSPACE }, ...overrides } }
});

(async () => {
  // -------------------------------------------------------------------------
  // 1. The ordinary subscription flow still works. This is the check that
  //    stops the guard from being an outage dressed as a fix.
  // -------------------------------------------------------------------------
  {
    const h = harness();
    try {
      const result = await h.process(h.stripe, invoicePaid());
      assert.notStrictEqual(result.refused, true, `a real invoice.paid was refused: ${result.reason}`);
      assert.strictEqual(h.retrieved.includes(SUB), true, "the applier still retrieved the subscription");
      // Asserted on what the entitlement resolver actually writes, not on a
      // field name guessed from the outside: billingPlan is cleared by the
      // resolver, and a test that watched it would have "passed" on a workspace
      // that was never upgraded.
      const company = h.store.read(`companies/${WORKSPACE}`);
      assert.strictEqual(company.billingStatus, "active", "the workspace was actually upgraded");
      assert.strictEqual(company.billingSubscriptionItemKey, "pro_monthly");
      assert.strictEqual(company.billingEffectivePlanTier, "pro");
      assert.strictEqual(company.billingEntitlementTriggerEvent, "invoice.paid");
      assert.strictEqual(h.store.read("stripeBillingEvents/evt_inv").processingStatus, "processed");
      pass("a genuine platform invoice.paid is still processed and still applies the plan");
    } finally { h.restore(); }
  }

  {
    const h = harness();
    try {
      const checkout = event({
        id: "evt_cs", type: "checkout.session.completed",
        data: { object: { id: "cs_1", mode: "subscription", subscription: SUB, customer: CUSTOMER, metadata: { workspaceId: WORKSPACE } } }
      });
      const result = await h.process(h.stripe, checkout);
      assert.notStrictEqual(result.refused, true, `a real checkout was refused: ${result.reason}`);
      const upgraded = h.store.read(`companies/${WORKSPACE}`);
      assert.strictEqual(upgraded.billingStatus, "active");
      assert.strictEqual(upgraded.billingSubscriptionItemKey, "pro_monthly");
      assert.strictEqual(upgraded.billingEntitlementTriggerEvent, "checkout.session.completed");
      pass("a genuine platform checkout.session.completed is still processed");
    } finally { h.restore(); }
  }

  {
    const h = harness();
    try {
      const body = event({
        id: "evt_sub", type: "customer.subscription.updated",
        data: { object: platformSubscription() }
      });
      const result = await h.process(h.stripe, body);
      assert.notStrictEqual(result.refused, true, `a real subscription event was refused: ${result.reason}`);
      pass("a genuine customer.subscription.updated is still processed");
    } finally { h.restore(); }
  }

  // -------------------------------------------------------------------------
  // 2. A connected-account event changes nothing. The plan, the status, every
  //    billing field: identical before and after.
  // -------------------------------------------------------------------------
  {
    const h = harness();
    try {
      const before = JSON.stringify(h.store.read(`companies/${WORKSPACE}`));
      const stray = invoicePaid();
      stray.id = "evt_stray";
      stray.account = "acct_someone_elses";
      const result = await h.process(h.stripe, stray);
      assert.strictEqual(result.refused, true);
      assert.strictEqual(result.reason, "connected_account_event");
      assert.strictEqual(JSON.stringify(h.store.read(`companies/${WORKSPACE}`)), before, "the workspace was touched");
      assert.strictEqual(h.retrieved.length, 0, "no Stripe call was made for a refused event");
      pass("a connected-account event on the subscription endpoint changes no plan and costs no API call");
    } finally { h.restore(); }
  }

  {
    // Every type this rail handles, refused the moment it carries an account.
    const h = harness();
    try {
      const before = JSON.stringify(h.store.read(`companies/${WORKSPACE}`));
      const types = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
        "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"];
      for (const type of types) {
        const stray = event({ id: `evt_${type}`, type, account: "acct_someone_elses", data: { object: platformSubscription() } });
        const result = await h.process(h.stripe, stray);
        assert.strictEqual(result.refused, true, `${type} was not refused`);
        assert.strictEqual(result.reason, "connected_account_event", type);
      }
      assert.strictEqual(JSON.stringify(h.store.read(`companies/${WORKSPACE}`)), before);
      pass(`all six handled event types are refused when stamped with an account`);
    } finally { h.restore(); }
  }

  // -------------------------------------------------------------------------
  // 3. Environment. A deployment on a test key must not act on live money.
  // -------------------------------------------------------------------------
  {
    const h = harness({ secretKey: "sk_test_x" });
    try {
      const before = JSON.stringify(h.store.read(`companies/${WORKSPACE}`));
      const live = invoicePaid();
      live.id = "evt_live";
      live.livemode = true;
      const result = await h.process(h.stripe, live);
      assert.strictEqual(result.refused, true);
      assert.strictEqual(result.reason, "livemode_mismatch");
      assert.strictEqual(JSON.stringify(h.store.read(`companies/${WORKSPACE}`)), before);
      pass("a live event on a test-key deployment is refused");
    } finally { h.restore(); }
  }

  {
    // ...and the mirror, so the rule is "must match", not "must be test".
    const h = harness({ secretKey: "sk_live_x", env: { STRIPE_ALLOW_LIVE_BILLING: "true" } });
    try {
      const testEvent = invoicePaid();
      testEvent.id = "evt_test_on_live";
      testEvent.livemode = false;
      const refused = await h.process(h.stripe, testEvent);
      assert.strictEqual(refused.reason, "livemode_mismatch");

      const liveEvent = invoicePaid();
      liveEvent.id = "evt_live_on_live";
      liveEvent.livemode = true;
      const accepted = await h.process(h.stripe, liveEvent);
      assert.notStrictEqual(accepted.refused, true, `a live event on a live key was refused: ${accepted.reason}`);
      pass("a live-key deployment accepts live events and refuses test ones");
    } finally { h.restore(); }
  }

  // -------------------------------------------------------------------------
  // 4. Ownership. A Connect marker on the object means the money is a
  //    workspace's, whatever the event type says.
  // -------------------------------------------------------------------------
  {
    const h = harness();
    try {
      const before = JSON.stringify(h.store.read(`companies/${WORKSPACE}`));
      for (const [marker, value] of [
        ["on_behalf_of", "acct_x"],
        ["application_fee_amount", 120],
        ["transfer_data", { destination: "acct_x" }]
      ]) {
        const tainted = invoicePaid({ [marker]: value });
        tainted.id = `evt_${marker}`;
        const result = await h.process(h.stripe, tainted);
        assert.strictEqual(result.refused, true, `${marker} was not refused`);
        assert.strictEqual(result.reason, `connect_marker_${marker}`);
      }
      assert.strictEqual(JSON.stringify(h.store.read(`companies/${WORKSPACE}`)), before);
      pass("an object carrying Connect markers is refused even without event.account");
    } finally { h.restore(); }
  }

  // -------------------------------------------------------------------------
  // 5. The refusal is FILED, so Stripe stops retrying what will never be taken.
  // -------------------------------------------------------------------------
  {
    const h = harness();
    try {
      const stray = invoicePaid();
      stray.id = "evt_filed";
      stray.account = "acct_someone_elses";
      await h.process(h.stripe, stray);
      const row = h.store.read("stripeBillingEvents/evt_filed");
      assert.strictEqual(row.processingStatus, "refused");
      assert(row.processedAt, "a refused event carries processedAt so the retry stops");
      assert.strictEqual(row.connectedAccountId, "acct_someone_elses", "the account is recorded for the incident");
      assert.strictEqual(row.result.reason, "connected_account_event");

      // ...and a redelivery of it is a duplicate, not a second refusal.
      const again = await h.process(h.stripe, stray);
      assert.strictEqual(again.duplicate, true);
      pass("a refused event is filed as processed, with the account, and redelivery is a duplicate");
    } finally { h.restore(); }
  }

  {
    // An event type this rail never handled is refused at the boundary now
    // rather than falling through the dispatcher to "unhandled_event".
    const h = harness();
    try {
      const other = event({ id: "evt_other", type: "payment_intent.succeeded", data: { object: { id: "pi_1" } } });
      const result = await h.process(h.stripe, other);
      assert.strictEqual(result.refused, true);
      assert.strictEqual(result.reason, "unhandled_platform_event");
      pass("an event type this rail never handled is refused at the boundary");
    } finally { h.restore(); }
  }

  console.log(`\nAll ${checks} rail-separation checks passed.`);
})().catch((error) => { console.error("FAILED:", (error && error.stack) || error); process.exit(1); });

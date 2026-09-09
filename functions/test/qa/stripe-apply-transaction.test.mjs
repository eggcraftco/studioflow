// The Stripe apply's write-time guard, against the REAL Firestore — the
// emulator, through firebase-admin, with the shipped createStripeBillingFunctions
// and a fake Stripe. stripe-invoice-api-drift.test.js proves the same claims
// against a fake Firestore whose transaction model is a model; this is the
// evidence that the model matches what Firestore does: a transaction whose
// reads were overtaken is re-run, a merge-set inside a transaction that is
// refused writes nothing, and three applies of one workspace that contend
// still end with every row and every add-on in place.
//
// Needs the Firestore emulator on 127.0.0.1:8080.
// Run: firebase emulators:exec --only firestore --project eggcraft-studio "node functions/test/qa/stripe-apply-transaction.test.mjs"
import assert from "node:assert";
import { createRequire } from "node:module";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const { createStripeBillingFunctions } = require("../../stripeBilling.js");

admin.initializeApp({ projectId: "stripe-apply-transaction-test" });
const db = admin.firestore();

let failures = 0;
let ran = 0;
const check = async (name, run) => {
  ran += 1;
  try { await run(); console.log("PASS ", name); }
  catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error && error.stack || error).split("\n").slice(0, 3).join(" | ").slice(0, 400)); }
};

const PLAN_ENTITLEMENTS = {
  demo: { plan: "demo", displayName: "Free", storageLimitMB: 50, teamMemberLimit: 1 },
  pro_monthly: { plan: "pro_monthly", displayName: "Pro", storageLimitMB: 5_000, teamMemberLimit: 1 },
  team_monthly: { plan: "team_monthly", displayName: "Team", storageLimitMB: 20_000, teamMemberLimit: 5 }
};
const CUSTOMER = "cus_emulator_owner";
const PERIOD_END = 1_790_000_000;
const OWNER_UID = "owner-uid";
const STRIPE_MODULE = require.resolve("stripe");
const RUN = Date.now().toString(36);

const subscription = (id, key, { status = "active", quantity = 1, workspaceId, priceId }) => ({
  id,
  object: "subscription",
  status,
  customer: CUSTOMER,
  livemode: false,
  metadata: { studioFlowBillingKey: key, workspaceId },
  items: { object: "list", has_more: false, data: [{ id: `si_${id}`, quantity, price: { id: priceId }, current_period_end: PERIOD_END }] }
});

// The shipped factory over the emulator. `admin.firestore()` is answered with
// the real database behind a proxy whose runTransaction counts callback
// attempts — the real SDK re-runs the callback when a commit is refused for
// contention, and that count is how the retry is observed — and lets a check
// hold a transaction open right after one of its reads.
function build(workspaceId, { retrieve, list, holdInTransaction } = {}) {
  const stats = { attempts: 0 };
  const retrieved = [];
  const listed = [];
  const stripe = {
    subscriptions: {
      async retrieve(id) { retrieved.push(id); return retrieve(id); },
      async list(params) { listed.push(params); return { object: "list", has_more: false, data: list ? await list(params) : [] }; }
    }
  };
  const wrappedDb = new Proxy(db, {
    get(target, property) {
      if (property === "runTransaction") {
        return (fn, options) => target.runTransaction(async (tx) => {
          stats.attempts += 1;
          const attempt = stats.attempts;
          const wrapped = {
            async get(ref) {
              const snapshot = await tx.get(ref);
              if (holdInTransaction) await holdInTransaction({ ref, attempt });
              return snapshot;
            },
            set(...args) { tx.set(...args); return wrapped; },
            update(...args) { tx.update(...args); return wrapped; },
            delete(...args) { tx.delete(...args); return wrapped; }
          };
          return fn(wrapped);
        }, options);
      }
      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const companyRef = db.collection("companies").doc(workspaceId);
  const built = createStripeBillingFunctions({
    admin: { firestore: Object.assign(() => wrappedDb, { FieldValue: admin.firestore.FieldValue, Timestamp: admin.firestore.Timestamp }) },
    onCall: (_options, handler) => handler,
    onRequest: (_options, handler) => handler,
    onSchedule: (_options, handler) => handler,
    HttpsError: class FakeHttpsError extends Error { constructor(code, message) { super(message); this.code = code; } },
    STRIPE_SECRET_KEY: null,
    STRIPE_WEBHOOK_SECRET: null,
    APPLE_ROOT_CA_CERTS_PEM: null,
    GOOGLE_PLAY_SERVICE_ACCOUNT: null,
    PLAN_ENTITLEMENTS,
    requireWorkspaceForBilling: async () => ({
      uid: OWNER_UID, companyId: workspaceId, companyRef, companyData: (await companyRef.get()).data() || {}
    }),
    workspaceOrderRole: () => "owner",
    normalizeWorkspaceRole: (role) => role,
    workspaceRoleLabel: (role) => role
  });
  return {
    ...built._internal,
    stripe,
    stats,
    retrieved,
    listed,
    companyRef,
    workspace: async () => (await companyRef.get()).data() || {},
    ledger: async (subscriptionId) => companyRef.collection("subscriptions").doc(`stripe_${subscriptionId}`).get(),
    // The callable refuses a second refresh within a minute, by real clock here;
    // a check that refreshes twice stands for the minute passing by clearing the stamp.
    async resync() {
      await companyRef.set({ billingLastEntitlementResyncRequestedAt: admin.firestore.FieldValue.delete() }, { merge: true });
      const savedEnv = { STRIPE_BILLING_ENABLED: process.env.STRIPE_BILLING_ENABLED, STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY };
      const savedModule = require.cache[STRIPE_MODULE];
      process.env.STRIPE_BILLING_ENABLED = "true";
      process.env.STRIPE_SECRET_KEY = "sk_test_stub";
      require.cache[STRIPE_MODULE] = { id: STRIPE_MODULE, filename: STRIPE_MODULE, loaded: true, exports: function FakeStripe() { return stripe; } };
      try {
        return await built.resyncStripeWorkspaceEntitlements({ auth: { uid: OWNER_UID }, data: { companyId: workspaceId } });
      } finally {
        for (const [key, value] of Object.entries(savedEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        if (savedModule) require.cache[STRIPE_MODULE] = savedModule;
        else delete require.cache[STRIPE_MODULE];
      }
    }
  };
}

async function seedWorkspace(workspaceId, fields = {}) {
  await db.collection("companies").doc(workspaceId).set({
    billingPlan: "team_monthly",
    billingStatus: "active",
    billingPlanSource: "manual_workspace",
    billingCustomerId: CUSTOMER,
    ...fields
  });
}

function silenceWarnings(run) {
  const original = console.warn;
  const lines = [];
  console.warn = (...args) => { lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")); };
  return Promise.resolve().then(run).then(
    (value) => { console.warn = original; return { value, lines }; },
    (error) => { console.warn = original; throw error; }
  );
}

const untilTrue = async (predicate, label) => {
  for (let turn = 0; turn < 2_000; turn += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`gave up waiting for ${label}`);
};

// A retrieve that can be held, as in the drift suite.
function holdableRetrieve(canonical) {
  const gates = new Map();
  const retrieves = [];
  return {
    retrieves,
    retrieve: (id) => {
      const current = canonical(id);
      retrieves.push(`${id}:${current.status}`);
      const gate = gates.get(id);
      if (gate) { gates.delete(id); gate.started(); return gate.promise; }
      return current;
    },
    hold(id) {
      let release = () => {};
      let started = () => {};
      const startedPromise = new Promise((resolve) => { started = resolve; });
      const promise = new Promise((resolve) => { release = resolve; });
      gates.set(id, { promise, started });
      return { started: startedPromise, release };
    }
  };
}

// ---------------------------------------------------------------------------

await check("L1 interleave on Firestore: an apply that read the seats alive cannot write them back after a later apply cancelled them, and writes nothing", async () => {
  const WS = `ws_l1_${RUN}`;
  const SEAT = `sub_seat_l1_${RUN}`;
  const BASE = 1_800_000;
  const status = { [SEAT]: "active" };
  const seat = (overrides = {}) => subscription(SEAT, "additional_team_seat_monthly", { status: status[SEAT], quantity: 3, workspaceId: WS, priceId: "price_seat", ...overrides });
  const stripeState = holdableRetrieve(() => seat());
  await seedWorkspace(WS);
  const h = build(WS, { retrieve: stripeState.retrieve });

  await h.processStripeEvent(h.stripe, { id: `evt_l1_0_${RUN}`, type: "customer.subscription.updated", created: BASE, data: { object: seat() } });
  assert.strictEqual((await h.workspace()).billingAdditionalTeamSeatQuantity, 3);
  assert.strictEqual((await h.workspace()).billingTeamMemberLimit, 8);
  assert.strictEqual((await h.ledger(SEAT)).data().stripeEventSequence, BASE * 1000);
  assert.strictEqual((await h.ledger(SEAT)).data().stripeApplyGeneration, 1);

  const hold = stripeState.hold(SEAT);
  const applyA = h.processStripeEvent(h.stripe, { id: `evt_l1_A_${RUN}`, type: "customer.subscription.updated", created: BASE + 100, data: { object: seat() } });
  await hold.started;

  status[SEAT] = "canceled";
  const b = await h.processStripeEvent(h.stripe, { id: `evt_l1_B_${RUN}`, type: "customer.subscription.deleted", created: BASE + 200, data: { object: seat({ status: "canceled" }) } });
  assert.strictEqual(b.updated, true, JSON.stringify(b));
  const afterB = { workspace: await h.companyRef.get(), ledger: await h.ledger(SEAT) };
  assert.strictEqual(afterB.workspace.data().billingAdditionalTeamSeatStatus, "cancelled");
  assert.strictEqual(afterB.workspace.data().billingTeamMemberLimit, 5);
  assert.strictEqual(afterB.ledger.data().stripeEventSequence, (BASE + 200) * 1000);

  hold.release(seat({ status: "active" }));
  const a = await silenceWarnings(() => applyA);
  assert.strictEqual(a.value.skipped, true, `the late apply landed: ${JSON.stringify(a.value)}`);
  assert.strictEqual(a.value.reason, "stale_subscription_event");
  assert.strictEqual(a.value.appliedEventSequence, (BASE + 200) * 1000);
  assert.ok(a.lines.some((line) => /out-ranked while being applied/i.test(line)), "the write-time drop was not logged");

  const final = { workspace: await h.companyRef.get(), ledger: await h.ledger(SEAT) };
  assert.strictEqual(final.workspace.data().billingAdditionalTeamSeatStatus, "cancelled", "seats came back");
  assert.strictEqual(final.workspace.data().billingAdditionalTeamSeatQuantity, 0);
  assert.strictEqual(final.workspace.data().billingTeamMemberLimit, 5);
  assert.strictEqual(final.ledger.data().stripeEventSequence, (BASE + 200) * 1000, "the watermark moved backwards");
  assert.strictEqual(final.ledger.data().stripeApplyGeneration, 2);
  // Firestore's own proof that the losing apply wrote nothing: neither document
  // was updated after B. Any write by A carries a serverTimestamp, so even a
  // re-write of the same add-on values would have moved these.
  assert.ok(final.workspace.updateTime.isEqual(afterB.workspace.updateTime), "the workspace document was written after B");
  assert.ok(final.ledger.updateTime.isEqual(afterB.ledger.updateTime), "the ledger row was written after B");
});

await check("the transaction itself: an apply held open after its reads, overtaken by a cancellation, is re-run by Firestore and refuses to write", async () => {
  // The claim the fake cannot make. A's transaction has read the row and the
  // workspace and is held there; B applies the cancellation and commits.
  // Firestore then refuses A's commit as overtaken (its reads are no longer
  // current) and re-runs the callback, whose second attempt reads the raised
  // watermark and returns the stale decision. Or — if the engine serialises B
  // behind A's read locks — B waits, A commits its snapshot, and B's
  // cancellation lands after it. Either way the cancellation is the last
  // word; what the count of attempts records is which of the two happened.
  const WS = `ws_tx_${RUN}`;
  const SEAT = `sub_seat_tx_${RUN}`;
  const BASE = 1_800_000;
  const status = { [SEAT]: "active" };
  const seat = (overrides = {}) => subscription(SEAT, "additional_team_seat_monthly", { status: status[SEAT], quantity: 3, workspaceId: WS, priceId: "price_seat", ...overrides });
  const ledgerPath = `companies/${WS}/subscriptions/stripe_${SEAT}`;
  let holdAttempt = 0;
  let releaseHold = () => {};
  let heldStarted = () => {};
  const held = new Promise((resolve) => { releaseHold = resolve; });
  const started = new Promise((resolve) => { heldStarted = resolve; });
  await seedWorkspace(WS);
  const h = build(WS, {
    retrieve: () => seat(),
    holdInTransaction: async ({ ref, attempt }) => {
      if (attempt === holdAttempt && ref.path === ledgerPath) { heldStarted(); await held; }
    }
  });

  await h.processStripeEvent(h.stripe, { id: `evt_tx_0_${RUN}`, type: "customer.subscription.updated", created: BASE, data: { object: seat() } });
  const attemptsBefore = h.stats.attempts;

  // A: its transaction's first read is the ledger row; hold it right there.
  holdAttempt = attemptsBefore + 1;
  const applyA = h.processStripeEvent(h.stripe, { id: `evt_tx_A_${RUN}`, type: "customer.subscription.updated", created: BASE + 100, data: { object: seat() } });
  await started;

  // B: the cancellation, started while A holds. Not awaited before the
  // release — under read locks it cannot finish until A does.
  status[SEAT] = "canceled";
  const applyB = h.processStripeEvent(h.stripe, { id: `evt_tx_B_${RUN}`, type: "customer.subscription.deleted", created: BASE + 200, data: { object: seat({ status: "canceled" }) } });
  const bFirst = await Promise.race([applyB.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 1_500))]);

  releaseHold();
  const [a, b] = await Promise.all([silenceWarnings(() => applyA), applyB]);
  assert.strictEqual(b.updated, true, JSON.stringify(b));
  const attempts = h.stats.attempts - attemptsBefore;

  const w = await h.workspace();
  const row = (await h.ledger(SEAT)).data();
  assert.strictEqual(w.billingAdditionalTeamSeatStatus, "cancelled", `the cancellation was not the last word: ${JSON.stringify({ a: a.value, b, attempts, bFirst })}`);
  assert.strictEqual(w.billingAdditionalTeamSeatQuantity, 0);
  assert.strictEqual(w.billingTeamMemberLimit, 5);
  assert.strictEqual(row.stripeEventSequence, (BASE + 200) * 1000, "the watermark moved backwards");
  if (bFirst) {
    // Optimistic: B committed under A. A's commit had to be refused and the
    // callback re-run, and the re-run took the stale decision.
    assert.ok(attempts >= 3, `B committed under A, yet A's callback was not re-run (attempts: ${attempts})`);
    assert.strictEqual(a.value.skipped, true, `A wrote its old snapshot over the cancellation: ${JSON.stringify(a.value)}`);
    assert.strictEqual(a.value.reason, "stale_subscription_event");
    assert.strictEqual(row.stripeApplyGeneration, 2, "A advanced the generation despite being stale");
  } else {
    // Pessimistic: B waited for A. A's snapshot landed first and B's
    // cancellation over it; the order is the real order.
    assert.strictEqual(a.value.updated, true, JSON.stringify(a.value));
    assert.strictEqual(row.stripeApplyGeneration, 3);
  }
  console.log(`      (engine: ${bFirst ? "B committed under A's open transaction; A re-ran" : "B waited on A's read locks; A then B"}, callback attempts ${attempts})`);
});

await check("resync on Firestore: a list snapshot taken before a webhook cancellation cannot write the seats back; the resync re-reads Stripe and applies the cancellation", async () => {
  const WS = `ws_rs_${RUN}`;
  const SEAT = `sub_seat_rs_${RUN}`;
  const BASE = 1_800_000;
  const status = { [SEAT]: "active" };
  const seat = (overrides = {}) => subscription(SEAT, "additional_team_seat_monthly", { status: status[SEAT], quantity: 3, workspaceId: WS, priceId: "price_seat", ...overrides });
  const stripeState = holdableRetrieve(() => seat());
  let listHold = null;
  await seedWorkspace(WS);
  const h = build(WS, {
    retrieve: stripeState.retrieve,
    list: async () => {
      const snapshot = [seat()];
      if (listHold) { const gate = listHold; listHold = null; await gate; }
      return snapshot;
    }
  });

  await h.processStripeEvent(h.stripe, { id: `evt_rs_0_${RUN}`, type: "customer.subscription.updated", created: BASE, data: { object: seat() } });
  assert.strictEqual((await h.ledger(SEAT)).data().stripeApplyGeneration, 1);

  let releaseList = () => {};
  listHold = new Promise((resolve) => { releaseList = resolve; });
  const resync = h.resync();
  await untilTrue(() => h.listed.length === 1, "the resync to take its list snapshot");

  status[SEAT] = "canceled";
  const cancel = await h.processStripeEvent(h.stripe, { id: `evt_rs_B_${RUN}`, type: "customer.subscription.deleted", created: BASE + 200, data: { object: seat({ status: "canceled" }) } });
  assert.strictEqual(cancel.updated, true, JSON.stringify(cancel));
  assert.strictEqual((await h.workspace()).billingAdditionalTeamSeatStatus, "cancelled");
  const retrievesBefore = stripeState.retrieves.length;

  releaseList();
  const finished = await silenceWarnings(() => resync);
  assert.strictEqual(finished.value.ok, true, JSON.stringify(finished.value));
  assert.ok(finished.lines.some((line) => /applied by another writer/i.test(line)), "the conflict was not logged");
  assert.deepStrictEqual(stripeState.retrieves.slice(retrievesBefore), [`${SEAT}:canceled`], "the resync applied its old list instead of re-reading Stripe once");

  const w = await h.workspace();
  const row = (await h.ledger(SEAT)).data();
  assert.strictEqual(w.billingAdditionalTeamSeatStatus, "cancelled", "the resync wrote its old list over the cancellation");
  assert.strictEqual(w.billingAdditionalTeamSeatQuantity, 0);
  assert.strictEqual(w.billingTeamMemberLimit, 5);
  assert.strictEqual(w.billingPlan, "team_monthly");
  assert.strictEqual(w.billingUpdatedBy, "stripe_owner_resync");
  assert.strictEqual(row.providerStatus, "canceled");
  assert.strictEqual(row.stripeEventSequence, (BASE + 200) * 1000);
  assert.strictEqual(row.stripeApplyGeneration, 3);
});

await check("resync first, then the webhook, on Firestore; then a re-subscribe and a quantity change through resync still apply", async () => {
  const WS = `ws_rw_${RUN}`;
  const SEAT = `sub_seat_rw_${RUN}`;
  const SEAT2 = `sub_seat_rw2_${RUN}`;
  const BASE = 1_800_000;
  const canonical = new Map();
  const seat = (id, quantity, status = "active") => subscription(id, "additional_team_seat_monthly", { status, quantity, workspaceId: WS, priceId: "price_seat" });
  let listing = [];
  await seedWorkspace(WS);
  const h = build(WS, { retrieve: (id) => canonical.get(id), list: async () => listing });

  canonical.set(SEAT, seat(SEAT, 3));
  listing = [seat(SEAT, 3)];
  assert.strictEqual((await h.resync()).ok, true);
  assert.strictEqual((await h.workspace()).billingAdditionalTeamSeatQuantity, 3);
  assert.strictEqual((await h.ledger(SEAT)).data().stripeEventSequence, undefined, "a resync armed the watermark");

  canonical.set(SEAT, seat(SEAT, 3, "canceled"));
  const cancel = await h.processStripeEvent(h.stripe, { id: `evt_rw_B_${RUN}`, type: "customer.subscription.deleted", created: BASE + 200, data: { object: seat(SEAT, 3, "canceled") } });
  assert.strictEqual(cancel.updated, true, JSON.stringify(cancel));
  assert.strictEqual((await h.workspace()).billingAdditionalTeamSeatStatus, "cancelled");

  canonical.set(SEAT2, seat(SEAT2, 2));
  listing = [seat(SEAT, 3, "canceled"), seat(SEAT2, 2)];
  assert.strictEqual((await h.resync()).ok, true);
  let w = await h.workspace();
  assert.strictEqual(w.billingAdditionalTeamSeatStatus, "active", "a legitimate re-subscribe was blocked");
  assert.strictEqual(w.billingAdditionalTeamSeatQuantity, 2);
  assert.strictEqual(w.billingTeamMemberLimit, 7);
  assert.strictEqual(w.billingAdditionalTeamSeatSubscriptionId, SEAT2);
  assert.strictEqual((await h.ledger(SEAT)).data().providerStatus, "canceled", "a row Stripe still lists was filed as missing at the provider");

  canonical.set(SEAT2, seat(SEAT2, 4));
  listing = [seat(SEAT, 3, "canceled"), seat(SEAT2, 4)];
  assert.strictEqual((await h.resync()).ok, true);
  w = await h.workspace();
  assert.strictEqual(w.billingAdditionalTeamSeatQuantity, 4, "a quantity increase through resync was blocked");
  assert.strictEqual(w.billingTeamMemberLimit, 9);
  assert.strictEqual((await h.ledger(SEAT2)).data().stripeApplyGeneration, 2);
});

await check("three subscriptions of one workspace applied at once on Firestore contend, and every row and add-on survives", async () => {
  const WS = `ws_cc_${RUN}`;
  const PLAN = `sub_plan_cc_${RUN}`;
  const SEAT = `sub_seat_cc_${RUN}`;
  const STORAGE = `sub_storage_cc_${RUN}`;
  const BASE = 1_800_000;
  const bodies = new Map([
    [PLAN, subscription(PLAN, "team_monthly", { workspaceId: WS, priceId: "price_team" })],
    [SEAT, subscription(SEAT, "additional_team_seat_monthly", { quantity: 3, workspaceId: WS, priceId: "price_seat" })],
    [STORAGE, subscription(STORAGE, "storage_200gb", { workspaceId: WS, priceId: "price_storage" })]
  ]);
  await seedWorkspace(WS, { billingPlan: "demo", billingStatus: "free", billingPlanSource: "" });
  const h = build(WS, { retrieve: (id) => bodies.get(id) });

  const results = await silenceWarnings(() => Promise.all([...bodies.entries()].map(([id, body], index) => h.processStripeEvent(h.stripe, {
    id: `evt_cc_${index}_${RUN}`, type: "customer.subscription.updated", created: BASE, data: { object: body }
  }))));
  for (const result of results.value) assert.strictEqual(result.updated, true, JSON.stringify(result));

  const w = await h.workspace();
  assert.strictEqual(w.billingPlan, "team_monthly");
  assert.strictEqual(w.billingStatus, "active");
  assert.strictEqual(w.billingActivePlanSubscriptionCount, 1);
  assert.strictEqual(w.billingAdditionalTeamSeatQuantity, 3, "the seats were lost");
  assert.strictEqual(w.billingAdditionalTeamSeatStatus, "active");
  assert.strictEqual(w.billingStorageAddonMB, 200 * 1024, "the storage was lost");
  assert.strictEqual(w.billingStorageAddonStatus, "active");
  const rows = await h.companyRef.collection("subscriptions").get();
  assert.strictEqual(rows.size, 3, "a ledger row was lost");
  for (const doc of rows.docs) {
    assert.strictEqual(doc.data().stripeApplyGeneration, 1, `${doc.id} was applied more than once`);
    assert.strictEqual(doc.data().stripeEventSequence, BASE * 1000);
  }
  console.log(`      (three transactions, ${h.stats.attempts} callback attempts)`);
});

if (ran !== 5) { console.log(`FAIL  expected 5 checks, ran ${ran}`); process.exit(1); }
if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
console.log("\n✅ STRIPE APPLY TRANSACTION (Firestore emulator) GEÇTİ");
process.exit(0);

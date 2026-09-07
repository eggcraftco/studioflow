// Stripe moved two fields out from under the billing handlers, and both webhook
// endpoints on this account run 2026-04-22.dahlia, where neither old field
// exists any more:
//
//   Invoice.subscription            -> invoice.parent.subscription_details.subscription
//   Subscription.current_period_end -> subscription.items.data[].current_period_end
//
// The evidence for the first was total: of every invoice.paid event that ever
// reached the handler, 7 of 7 were skipped as "invoice_without_subscription".
// The evidence for the second was the mirror image — every Stripe ledger row in
// Firestore had a null currentPeriodEnd, while the Apple and Google rows, which
// write the same field into the same collection, all had one.
//
// invoice.payment_failed fails differently and more quietly: it does not
// early-return on a missing id, so it stamps the failure, looks successful, and
// never moves the workspace to past_due.
//
// The first version of this file checked the wiring by reading stripeBilling.js
// as text, and that was worth nothing: the appliers are closures over the
// factory's injected dependencies, so nothing could call them, and
// "applyInvoicePaid contains stripeSubscriptionIdFromInvoice(invoice)" is
// equally true of code that calls the resolver and throws the answer away. That
// was demonstrated, not theorised: assigning the resolver's result to an unused
// name and restoring the old read one line later put the exact production
// defect back with the whole suite green. So the four appliers are exported
// through the factory's `_internal` bag (which index.js strips before it
// registers anything) and RUN here against a fake Firestore. The assertions are
// on what they fetch from Stripe and what they write to Firestore.
//
// Every guard below was proved by removing it. Twenty-five mutations, each an
// exact edit to functions/stripeBilling.js (T1 to this file), applied one at a
// time and reverted with `git checkout --`; on the right is the named check that
// went red first. None of them stayed green. Written down because "all N
// mutations turn a check red" in a commit message is not auditable by anyone who
// did not watch it happen — this table can be redone in an afternoon.
//
//   A1  applySubscription: timestampFromUnix(subscription.current_period_end)
//         -> a dahlia invoice.paid records the renewal, dated from the item
//   A2  applyInvoicePaid: resolver result assigned to an unused name, then
//       `const inv = invoice; subscriptionId = inv.subscription?.id || ""`
//         -> a dahlia invoice.paid records the renewal, dated from the item
//   A3  applyInvoicePaymentFailed: resolver result overwritten from invoice.subscription
//         -> a dahlia invoice.payment_failed moves the workspace to past_due
//   A4  applyInvoicePaid: the !subscriptionId skip deleted
//         -> a genuine one-off invoice is still skipped, and writes nothing
//   A5  applyInvoicePaymentFailed: status: "past_due" unconditionally
//         -> a payment_failed that applied nothing no longer claims past_due
//   A6  applyCompletedSubscriptionCheckout: reads session.parent instead
//         -> the checkout session's own subscription field is left alone
//   R1  stripeSubscriptionIdFromInvoice: legacy field tried before the new path
//         -> the new location wins over a legacy field on the same invoice
//   R2  stripeSubscriptionIdFromInvoice: `const details = parent.subscription_details;`
//         -> a legacy invoice still resolves through invoice.subscription (throws)
//   R3  stripeSubscriptionIdFromInvoice: details guard dropped before stripeReferenceId
//         -> a legacy invoice still resolves through invoice.subscription (throws)
//   R4  stripeSubscriptionIdFromInvoice: legacy fallback removed
//         -> a legacy invoice still resolves through invoice.subscription
//   R5  stripeReferenceId: `return value.id.trim();` without the typeof check
//         -> a malformed or partial parent does not throw
//   R6  stripeReferenceId: expanded-object branch returns value.id untrimmed
//         -> whitespace around an id is not passed on as an id
//   R7  stripeReferenceId: the plain-string branch removed
//         -> a dahlia invoice resolves through parent.subscription_details
//   P1  stripeCurrentPeriodEndUnix: `value > earliest` — the latest item wins
//         -> the earliest item end wins, even against the row's own plan item
//   P2  stripeCurrentPeriodEndUnix: the `value <= 0` filter dropped
//         -> one broken item does not hide a good one
//   P3  stripeCurrentPeriodEndUnix: the Number.isFinite filter dropped
//         -> an unusable period end is 0, never NaN or a negative date
//   P4  stripeCurrentPeriodEndUnix: `if (!earliest)` — the first usable item wins
//         -> the earliest item end wins, even against the row's own plan item
//   P5  stripeCurrentPeriodEndUnix: legacy fallback removed
//         -> a legacy subscription still resolves through current_period_end
//   P6  stripeCurrentPeriodEndUnix: legacy field tried before the items
//         -> a legacy subscription still resolves through current_period_end
//   P7  stripeCurrentPeriodEndUnix: `(items && items.data) || []` in place of Array.isArray
//         -> an unusable period end is 0, never NaN or a negative date (throws)
//   P8  stripeCurrentPeriodEndUnix: the has_more warning removed
//         -> a truncated item list is logged, not passed off as the whole set
//   V1  applyInvoicePaid: `const docs = "https://stripe.com/docs"; ... || invoice.subscription;`
//       — the vector that blinded the old, string-unaware comment stripper
//         -> no handler is left reading a field the pinned API no longer sends
//   V2  processStripeEvent: stops dispatching invoice.paid to the applier
//         -> the webhook still dispatches the invoice events to these handlers
//   V3  the factory's _internal bag stops exporting the appliers
//         -> a dahlia invoice.paid records the renewal, dated from the item
//   T1  any check in this file deleted
//         -> the runner's count guard, which is deliberately not a check
//
// Run: node test/qa/stripe-invoice-api-drift.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  createStripeBillingFunctions,
  stripeSubscriptionIdFromInvoice,
  stripeCurrentPeriodEndUnix
} = require("../../stripeBilling");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

const EXPECTED_CHECKS = 26;

const SUB = "sub_1PdahliaRenewal";
const CUSTOMER = "cus_1PdahliaOwner";
const WORKSPACE = "ws_drift";
const PERIOD_END = 1_790_000_000;

// ---- the invoice -> subscription link -------------------------------------

check("a dahlia invoice resolves through parent.subscription_details", () => {
  assert.strictEqual(stripeSubscriptionIdFromInvoice({
    id: "in_1",
    parent: { type: "subscription_details", quote_details: null, subscription_details: { metadata: {}, subscription: SUB } }
  }), SUB);
});

check("an expanded subscription on the new path resolves to its id", () => {
  // parent.subscription_details.subscription is typed `string | Subscription`,
  // so the union did not go away when the field moved.
  assert.strictEqual(stripeSubscriptionIdFromInvoice({
    parent: { type: "subscription_details", subscription_details: { subscription: { id: SUB, object: "subscription" } } }
  }), SUB);
});

check("a legacy invoice still resolves through invoice.subscription", () => {
  // A replayed old event, or an endpoint pinned back during a rollback.
  assert.strictEqual(stripeSubscriptionIdFromInvoice({ id: "in_2", subscription: SUB }), SUB);
  assert.strictEqual(stripeSubscriptionIdFromInvoice({ id: "in_2", subscription: { id: SUB } }), SUB);
});

check("the new location wins over a legacy field on the same invoice", () => {
  // Order is the point: the pinned SDK says the new path is the truth, so a
  // stale top-level value must never be preferred to it.
  assert.strictEqual(stripeSubscriptionIdFromInvoice({
    subscription: "sub_stale",
    parent: { type: "subscription_details", subscription_details: { subscription: SUB } }
  }), SUB);
});

check("a genuine one-off invoice has no subscription, by either shape", () => {
  // This is the outcome the skip exists for. It must survive the fix — the bug
  // was that it fired for everything, not that it existed.
  //
  // Two shapes, not one. Parent.Type is exactly
  // 'quote_details' | 'subscription_details' (Invoices.d.ts:858), with no third
  // value for "neither", so a manually issued invoice carries parent: null
  // outright (Invoices.d.ts:344) and only a QUOTE-generated invoice carries
  // parent.type === "quote_details".
  for (const invoice of [
    { id: "in_manual", parent: null },
    { id: "in_quote", parent: { type: "quote_details", quote_details: { quote: "qt_1" }, subscription_details: null } },
    { id: "in_bare" }
  ]) {
    assert.strictEqual(stripeSubscriptionIdFromInvoice(invoice), "", JSON.stringify(invoice));
  }
});

check("a malformed or partial parent does not throw", () => {
  // A handler that throws here loses the event: the webhook 500s, the row is
  // left half-written, and Stripe retries into the same crash.
  for (const invoice of [
    null, undefined, "", 0, [],
    {},
    { parent: "subscription_details" },
    { parent: 7 },
    { parent: {} },
    { parent: { subscription_details: null } },
    { parent: { subscription_details: "sub_x" } },
    { parent: { subscription_details: {} } },
    { parent: { subscription_details: { subscription: null } } },
    { parent: { subscription_details: { subscription: 42 } } },
    { parent: { subscription_details: { subscription: {} } } },
    { parent: { subscription_details: { subscription: { id: 42 } } } },
    { subscription: {} },
    { subscription: 42 }
  ]) {
    let resolved;
    assert.doesNotThrow(() => { resolved = stripeSubscriptionIdFromInvoice(invoice); }, JSON.stringify(invoice));
    assert.strictEqual(resolved, "", JSON.stringify(invoice));
  }
});

check("whitespace around an id is not passed on as an id", () => {
  // Both branches of stripeReferenceId trim, so both are exercised: a padded
  // string and a padded id on an expanded object.
  assert.strictEqual(stripeSubscriptionIdFromInvoice({
    parent: { subscription_details: { subscription: "   " } }
  }), "");
  assert.strictEqual(stripeSubscriptionIdFromInvoice({
    parent: { subscription_details: { subscription: "  " + SUB + " " } }
  }), SUB);
  assert.strictEqual(stripeSubscriptionIdFromInvoice({
    parent: { subscription_details: { subscription: { id: "  " + SUB + " ", object: "subscription" } } }
  }), SUB);
  assert.strictEqual(stripeSubscriptionIdFromInvoice({ subscription: { id: "   " } }), "");
});

// ---- the period end -------------------------------------------------------

function warningLine(args) {
  return args.map((value) => (typeof value === "string" ? value : JSON.stringify(value))).join(" ");
}

function captureWarnings(run) {
  const original = console.warn;
  const lines = [];
  console.warn = (...args) => lines.push(warningLine(args));
  try {
    return { value: run(), lines };
  } finally {
    console.warn = original;
  }
}

// The async twin. Restoring console.warn in a synchronous `finally` puts it back
// before an awaited handler has run, so its warnings escape onto the suite's own
// output and cannot be asserted on.
async function captureWarningsAsync(run) {
  const original = console.warn;
  const lines = [];
  console.warn = (...args) => lines.push(warningLine(args));
  try {
    return { value: await run(), lines };
  } finally {
    console.warn = original;
  }
}

check("a dahlia subscription takes its period end from the items", () => {
  assert.strictEqual(stripeCurrentPeriodEndUnix({
    id: SUB,
    items: { object: "list", data: [{ id: "si_1", quantity: 1, current_period_start: PERIOD_END - 2_592_000, current_period_end: PERIOD_END }] }
  }), PERIOD_END);
});

check("the earliest item end wins, even against the row's own plan item", () => {
  // Stripe defines the subscription-level value the same way (its list filter
  // is documented as "minimum item current_period_end"), and this date extends
  // paid access, so the latest end would entitle a workspace past what it paid.
  //
  // The second case is the one the resolver's comment calls out: data[0] is
  // what decides the ledger row's planTier, itemKey and quantity, and the
  // period end deliberately does NOT follow it. Under-granting is recovered by
  // the next webhook; over-granting is not recovered at all.
  assert.strictEqual(stripeCurrentPeriodEndUnix({
    items: { data: [
      { current_period_end: PERIOD_END + 86_400 },
      { current_period_end: PERIOD_END },
      { current_period_end: PERIOD_END + 1 }
    ] }
  }), PERIOD_END);
  assert.strictEqual(stripeCurrentPeriodEndUnix({
    items: { data: [
      { id: "si_plan", price: { id: "price_pro_monthly" }, quantity: 1, current_period_end: PERIOD_END + 3_600 },
      { id: "si_meter", current_period_end: PERIOD_END }
    ] }
  }), PERIOD_END);
});

check("a legacy subscription still resolves through current_period_end", () => {
  assert.strictEqual(stripeCurrentPeriodEndUnix({ id: SUB, current_period_end: PERIOD_END }), PERIOD_END);
  // And an item that carries a real end is still preferred to the old field.
  assert.strictEqual(stripeCurrentPeriodEndUnix({
    current_period_end: PERIOD_END - 999_999,
    items: { data: [{ current_period_end: PERIOD_END }] }
  }), PERIOD_END);
});

check("an unusable period end is 0, never NaN or a negative date", () => {
  // 0 is what timestampFromUnix turns into null. NaN would too, but a negative
  // or string value must not become a Timestamp in the past that back-dates a
  // workspace's access.
  //
  // items.data is typed as an ApiList's data array, but a partial or replayed
  // payload can carry anything there. A non-array, non-null value is the case
  // the Array.isArray guard exists for: without it the for..of throws, the
  // webhook 500s, and Stripe retries into the same crash.
  for (const subscription of [
    null, undefined, "", 42, [],
    {},
    { items: null },
    { items: {} },
    { items: { data: null } },
    { items: { data: {} } },
    { items: { data: 7 } },
    { items: { data: "si_1" } },
    { items: { data: [] } },
    { items: { data: [null, undefined, {}, { current_period_end: 0 }, { current_period_end: -5 }, { current_period_end: "soon" }] } },
    { items: { data: [{ current_period_end: Infinity }] } },
    { items: { data: [{ current_period_end: -Infinity }] } },
    { current_period_end: Infinity },
    { current_period_end: 0 },
    { current_period_end: -5 },
    { current_period_end: "soon" }
  ]) {
    let resolved;
    assert.doesNotThrow(() => { resolved = stripeCurrentPeriodEndUnix(subscription); }, JSON.stringify(subscription));
    assert.strictEqual(resolved, 0, JSON.stringify(subscription));
  }
});

check("one broken item does not hide a good one", () => {
  // "Earliest wins" and "ignore the unusable" have to hold together. A single
  // item carrying null, 0 or a negative end must not become the earliest and
  // swallow the real date sitting next to it — that would null the ledger row
  // just as thoroughly as the drift did.
  for (const broken of [null, undefined, {}, { current_period_end: null }, { current_period_end: 0 },
    { current_period_end: -5 }, { current_period_end: "soon" }, { current_period_end: NaN }]) {
    assert.strictEqual(stripeCurrentPeriodEndUnix({
      items: { data: [broken, { current_period_end: PERIOD_END }] }
    }), PERIOD_END, `leading ${JSON.stringify(broken)}`);
    assert.strictEqual(stripeCurrentPeriodEndUnix({
      items: { data: [{ current_period_end: PERIOD_END }, broken] }
    }), PERIOD_END, `trailing ${JSON.stringify(broken)}`);
  }
});

check("a truncated item list is logged, not passed off as the whole set", () => {
  // subscription.items is an ApiList (Subscriptions.d.ts:190) and an embedded
  // sub-list returns at most ten entries. Past ten, "earliest" is the earliest
  // of a page — later than the real one, which is the over-granting direction.
  // The resolver cannot page a list without becoming async and calling Stripe,
  // so the one thing it must not do is stay quiet about it.
  const truncated = captureWarnings(() => stripeCurrentPeriodEndUnix({
    id: SUB,
    items: { object: "list", has_more: true, data: [{ current_period_end: PERIOD_END }] }
  }));
  assert.strictEqual(truncated.value, PERIOD_END);
  assert.strictEqual(truncated.lines.length, 1, "a paginated item list was resolved silently");
  assert.ok(/paginated/i.test(truncated.lines[0]), truncated.lines[0]);
  assert.ok(truncated.lines[0].includes(SUB), "the warning names the subscription");

  const complete = captureWarnings(() => stripeCurrentPeriodEndUnix({
    id: SUB,
    items: { object: "list", has_more: false, data: [{ current_period_end: PERIOD_END }] }
  }));
  assert.strictEqual(complete.value, PERIOD_END);
  assert.strictEqual(complete.lines.length, 0, "a complete item list must not warn");
});

// ---- the handlers, actually run -------------------------------------------
// Everything above is a pure function. These run the shipped appliers — the
// same closures processStripeEvent dispatches to — against a fake Firestore, so
// a resolver that is correct but unused fails here.

const SERVER_TIMESTAMP = { __sentinel: "serverTimestamp" };
const DELETE_SENTINEL = { __sentinel: "delete" };
const WRITE_MILLIS = 1_700_000_000_000;

class FakeTimestamp {
  constructor(milliseconds) { this.milliseconds = milliseconds; }
  toMillis() { return this.milliseconds; }
  toDate() { return new Date(this.milliseconds); }
}

// Enough Firestore to run the appliers: documents by path, merge writes,
// equality queries, and one sub-collection listing. It rejects `undefined` the
// way the real client does, so a handler that writes an unset field fails here
// instead of at 3am in production.
function fakeFirestore(seed = {}) {
  const store = new Map(Object.entries(seed).map(([key, value]) => [key, { ...value }]));
  const queries = [];

  function documentRef(docPath) {
    const id = docPath.slice(docPath.lastIndexOf("/") + 1);
    return {
      id,
      path: docPath,
      collection: (name) => collectionRef(`${docPath}/${name}`),
      async get() {
        const stored = store.get(docPath);
        return {
          exists: Boolean(stored),
          id,
          ref: documentRef(docPath),
          data: () => (stored ? { ...stored } : undefined)
        };
      },
      async set(value, options = {}) {
        for (const [field, fieldValue] of Object.entries(value)) {
          if (fieldValue === undefined) throw new Error(`undefined value for ${field} at ${docPath}`);
        }
        const next = options.merge ? { ...(store.get(docPath) || {}) } : {};
        for (const [field, fieldValue] of Object.entries(value)) {
          if (fieldValue === DELETE_SENTINEL) delete next[field];
          else next[field] = fieldValue === SERVER_TIMESTAMP ? new FakeTimestamp(WRITE_MILLIS) : fieldValue;
        }
        store.set(docPath, next);
      }
    };
  }

  function collectionRef(collectionPath) {
    function query(clauses, cap) {
      return {
        where(field, operator, value) {
          assert.strictEqual(operator, "==", `the fake only implements ==, not ${operator}`);
          return query([...clauses, { field, value }], cap);
        },
        limit: (count) => query(clauses, count),
        async get() {
          if (clauses.length) queries.push(clauses.map((c) => `${c.field}==${c.value}`).join("&"));
          let docs = [...store.entries()]
            .filter(([key]) => key.startsWith(`${collectionPath}/`) && !key.slice(collectionPath.length + 1).includes("/"))
            .filter(([, data]) => clauses.every((c) => data[c.field] === c.value))
            .map(([key, data]) => ({
              id: key.slice(key.lastIndexOf("/") + 1),
              ref: documentRef(key),
              data: () => ({ ...data })
            }));
          if (cap > 0) docs = docs.slice(0, cap);
          return { empty: docs.length === 0, size: docs.length, docs };
        }
      };
    }
    return { path: collectionPath, doc: (id) => documentRef(`${collectionPath}/${id}`), ...query([], 0) };
  }

  return { db: { collection: (name) => collectionRef(name) }, store, queries };
}

// Only the fields planUpdatePayload reads. The assertions below are about which
// dates and ids the handlers write, never about what a plan is worth.
const PLAN_ENTITLEMENTS = {
  demo: { plan: "demo", displayName: "Free", storageLimitMB: 50, teamMemberLimit: 1 },
  pro_monthly: { plan: "pro_monthly", displayName: "Pro", storageLimitMB: 5_000, teamMemberLimit: 1 }
};

function dahliaSubscription(overrides = {}) {
  return {
    id: SUB,
    object: "subscription",
    status: "active",
    customer: CUSTOMER,
    livemode: false,
    metadata: { studioFlowBillingKey: "pro_monthly" },
    items: {
      object: "list",
      has_more: false,
      data: [{
        id: "si_plan",
        object: "subscription_item",
        quantity: 1,
        price: { id: "price_pro_monthly" },
        current_period_start: PERIOD_END - 2_592_000,
        current_period_end: PERIOD_END
      }]
    },
    ...overrides
  };
}

function dahliaInvoice(overrides = {}) {
  return {
    id: "in_dahlia",
    object: "invoice",
    customer: CUSTOMER,
    metadata: {},
    parent: {
      type: "subscription_details",
      quote_details: null,
      subscription_details: { metadata: {}, subscription: SUB }
    },
    ...overrides
  };
}

// The workspace is found through billingSubscriptionId, not through a
// metadata.workspaceId shortcut, so the resolved id has to be right for the
// handler to find anything at all.
function harness({ retrieve } = {}) {
  const { db, store, queries } = fakeFirestore({
    [`companies/${WORKSPACE}`]: {
      billingPlan: "demo",
      billingStatus: "free",
      billingCustomerId: CUSTOMER,
      billingSubscriptionId: SUB
    }
  });
  const retrieved = [];
  const stripe = {
    subscriptions: {
      async retrieve(id) {
        retrieved.push(id);
        return retrieve ? retrieve(id) : dahliaSubscription();
      }
    }
  };
  const { _internal } = createStripeBillingFunctions({
    admin: {
      firestore: Object.assign(() => db, {
        FieldValue: { serverTimestamp: () => SERVER_TIMESTAMP, delete: () => DELETE_SENTINEL },
        Timestamp: { fromMillis: (milliseconds) => new FakeTimestamp(milliseconds) }
      })
    },
    onCall: (_options, handler) => handler,
    onRequest: (_options, handler) => handler,
    onSchedule: (_options, handler) => handler,
    HttpsError: class FakeHttpsError extends Error {
      constructor(code, message) { super(message); this.code = code; }
    },
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

  const ledgerPrefix = `companies/${WORKSPACE}/subscriptions/`;
  return {
    ..._internal,
    stripe,
    store,
    queries,
    retrieved,
    workspace: () => store.get(`companies/${WORKSPACE}`) || null,
    ledgerRows: () => [...store.entries()].filter(([key]) => key.startsWith(ledgerPrefix)).map(([, row]) => row)
  };
}

function millisOf(value, label) {
  assert.ok(value && typeof value.toMillis === "function", `${label} is not a Timestamp: ${JSON.stringify(value)}`);
  return value.toMillis();
}

check("a dahlia invoice.paid records the renewal, dated from the item", () => {
  // The whole defect in one run: 7 of 7 real events skipped here, and every
  // ledger row that other paths did write carried a null currentPeriodEnd.
  const h = harness();
  return (async () => {
    const result = await h.applyInvoicePaid(h.stripe, dahliaInvoice());

    assert.strictEqual(result.skipped, undefined, `the renewal was skipped: ${JSON.stringify(result)}`);
    assert.strictEqual(result.updated, true);
    assert.strictEqual(result.workspaceId, WORKSPACE);
    assert.deepStrictEqual(h.retrieved, [SUB], "the subscription behind the invoice was not fetched");

    const rows = h.ledgerRows();
    assert.strictEqual(rows.length, 1, "the renewal left no ledger row");
    assert.strictEqual(millisOf(rows[0].currentPeriodEnd, "ledger currentPeriodEnd"), PERIOD_END * 1000);
    assert.strictEqual(rows[0].provider, "stripe");
    assert.strictEqual(rows[0].externalSubscriptionId, SUB);

    const workspace = h.workspace();
    assert.strictEqual(millisOf(workspace.billingCurrentPeriodEnd, "billingCurrentPeriodEnd"), PERIOD_END * 1000);
    assert.strictEqual(workspace.billingLastInvoiceId, "in_dahlia");
    assert.ok(workspace.billingLastInvoicePaidAt, "the paid stamp is missing");
  })();
});

check("a genuine one-off invoice is still skipped, and writes nothing", () => {
  const h = harness();
  return (async () => {
    for (const invoice of [
      dahliaInvoice({ id: "in_manual", parent: null }),
      dahliaInvoice({ id: "in_quote", parent: { type: "quote_details", quote_details: { quote: "qt_1" }, subscription_details: null } })
    ]) {
      const result = await h.applyInvoicePaid(h.stripe, invoice);
      assert.deepStrictEqual(result, { skipped: true, reason: "invoice_without_subscription" }, invoice.id);
    }
    assert.deepStrictEqual(h.retrieved, [], "a one-off invoice must not cost a Stripe call");
    assert.deepStrictEqual(h.ledgerRows(), [], "a one-off invoice must not create a subscription row");
    assert.strictEqual(h.workspace().billingLastInvoiceId, undefined, "a one-off invoice must not stamp the workspace");
  })();
});

check("a dahlia invoice.payment_failed moves the workspace to past_due", () => {
  // The quiet half of the drift: without the id, applySubscription is never
  // called, so the failure is stamped and dunning never starts.
  const h = harness({ retrieve: () => dahliaSubscription({ status: "past_due" }) });
  return (async () => {
    const result = await h.applyInvoicePaymentFailed(h.stripe, dahliaInvoice({ id: "in_failed" }));

    assert.deepStrictEqual(h.retrieved, [SUB]);
    assert.strictEqual(result.status, "past_due");
    assert.strictEqual(result.entitlementResolutionApplied, true, "the subscription was never re-applied");
    assert.strictEqual(result.entitlementResolutionSkippedReason, undefined);
    assert.ok(h.queries.includes(`billingSubscriptionId==${SUB}`),
      `the resolved id never reached the workspace lookup: ${JSON.stringify(h.queries)}`);

    const workspace = h.workspace();
    assert.strictEqual(workspace.billingStatus, "past_due", "the workspace never moved to past_due");
    assert.ok(workspace.billingPaymentFailedAt, "the failure stamp is missing");
    assert.strictEqual(millisOf(workspace.billingCurrentPeriodEnd, "billingCurrentPeriodEnd"), PERIOD_END * 1000);
  })();
});

check("a payment_failed that applied nothing no longer claims past_due", () => {
  // The retrieve is caught and warned on purpose, so the failure stamp lands
  // either way — but then nothing writes billingStatus, and the row this
  // handler leaves in stripeBillingEvents is marked processed. Returning
  // "past_due" there recorded a transition that had not happened.
  const h = harness({ retrieve: () => { throw new Error("stripe unavailable"); } });
  return (async () => {
    const captured = await captureWarningsAsync(() => h.applyInvoicePaymentFailed(h.stripe, dahliaInvoice({ id: "in_failed" })));
    const result = captured.value;

    assert.deepStrictEqual(h.retrieved, [SUB], "the id resolved, the call just failed");
    assert.ok(captured.lines.some((line) => /Could not retrieve failed invoice subscription/.test(line)),
      "the swallowed retrieve failure left no trace at all");
    assert.strictEqual(result.updated, true, "the failure stamp still landed");
    assert.notStrictEqual(result.status, "past_due", "the handler still claims a move it did not make");
    assert.strictEqual(result.status, "payment_failed_not_applied");
    assert.strictEqual(result.entitlementResolutionApplied, false);
    assert.strictEqual(result.entitlementResolutionSkippedReason, "subscription_retrieve_failed");

    const workspace = h.workspace();
    assert.ok(workspace.billingPaymentFailedAt, "the failure stamp is missing");
    assert.strictEqual(workspace.billingStatus, "free", "nothing on this path writes billingStatus");
  })();
});

check("the ledger row's period end is the earliest item's, not its plan item's", () => {
  // The asymmetry the resolver documents, driven end to end: planTier, itemKey
  // and quantity come from items.data[0]; the period end is the minimum across
  // items. Unreachable through checkout, which creates exactly one line item —
  // and therefore exactly the shape that would bite silently if someone added
  // an item from the Stripe Dashboard.
  const h = harness();
  return (async () => {
    await h.applySubscription(dahliaSubscription({
      items: {
        object: "list",
        has_more: false,
        data: [
          { id: "si_plan", quantity: 3, price: { id: "price_pro_monthly" }, current_period_end: PERIOD_END + 3_600 },
          { id: "si_meter", quantity: 9, price: { id: "price_metered" }, current_period_end: PERIOD_END }
        ]
      }
    }), "customer.subscription.updated");

    const rows = h.ledgerRows();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].quantity, 3, "quantity still comes from data[0]");
    assert.strictEqual(rows[0].itemKey, "pro_monthly");
    assert.strictEqual(millisOf(rows[0].currentPeriodEnd, "ledger currentPeriodEnd"), PERIOD_END * 1000,
      "the period end followed data[0] instead of the earliest item");
  })();
});

check("a subscription with no usable period end writes null, not a bogus date", () => {
  // 0 has to become null and stay null: firestore.rules and storage.rules gate
  // the 36-hour grace window on billingCurrentPeriodEnd being a timestamp, and
  // a Timestamp in 1970 would read as an expired workspace rather than an
  // unknown one.
  const h = harness();
  return (async () => {
    await h.applySubscription(dahliaSubscription({
      items: { object: "list", has_more: false, data: [{ id: "si_plan", quantity: 1, price: { id: "price_pro_monthly" } }] }
    }), "customer.subscription.updated");

    const rows = h.ledgerRows();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].currentPeriodEnd, null);
    assert.strictEqual(h.workspace().billingCurrentPeriodEnd, null);
  })();
});

check("a legacy subscription payload still lands a period end", () => {
  // A replayed pre-basil event must not regress to the null this fix removed.
  const h = harness();
  return (async () => {
    await h.applySubscription({
      id: SUB,
      object: "subscription",
      status: "active",
      customer: CUSTOMER,
      livemode: false,
      metadata: { studioFlowBillingKey: "pro_monthly" },
      current_period_end: PERIOD_END,
      items: { object: "list", data: [{ id: "si_plan", quantity: 1, price: { id: "price_pro_monthly" } }] }
    }, "customer.subscription.updated");

    assert.strictEqual(millisOf(h.ledgerRows()[0].currentPeriodEnd, "ledger currentPeriodEnd"), PERIOD_END * 1000);
  })();
});

check("the checkout session's own subscription field is left alone", () => {
  // Checkout.Session.subscription was NOT removed — Sessions.d.ts still
  // declares `subscription: string | Subscription | null`. "Fixing" it would
  // break the one invoice-adjacent read that was never broken.
  const h = harness();
  return (async () => {
    const result = await h.applyCompletedSubscriptionCheckout(h.stripe, {
      id: "cs_1",
      object: "checkout.session",
      mode: "subscription",
      subscription: SUB
    });
    assert.deepStrictEqual(h.retrieved, [SUB], "the checkout session's subscription was not read");
    assert.strictEqual(result.updated, true);
    assert.strictEqual(h.workspace().billingCheckoutSessionId, "cs_1");

    const types = path.join(__dirname, "..", "..", "node_modules", "stripe", "cjs", "resources", "Checkout", "Sessions.d.ts");
    assert.ok(fs.existsSync(types),
      "functions/node_modules/stripe is missing — this check is about the PINNED SDK, so run `npm install` in functions/ rather than skipping it");
    assert.ok(/^ {4}subscription: string \| Subscription \| null;$/m.test(fs.readFileSync(types, "utf8")),
      "the pinned SDK no longer declares Checkout.Session.subscription — this read now needs the same treatment");
  })();
});

check("the pinned SDK is still the API version this fix was written against", () => {
  const apiVersion = path.join(__dirname, "..", "..", "node_modules", "stripe", "cjs", "apiVersion.js");
  assert.ok(fs.existsSync(apiVersion), "functions/node_modules/stripe is missing — run `npm install` in functions/");
  assert.ok(/ApiVersion = '2026-04-22\.dahlia'/.test(fs.readFileSync(apiVersion, "utf8")),
    "the pinned SDK's default API version changed; re-check both field locations against the new one");
});

// ---- the backstop ---------------------------------------------------------
// A grep, kept only for the handlers the checks above do not run. It is scoped
// to the factory, because the two resolvers below it keep the legacy reads on
// purpose as their fallback.
const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "stripeBilling.js"), "utf8");

// Comments are stripped WHOLE LINES ONLY. A naive /\/\/[^\n]*/ is not string
// aware: the factory contains string literals with "//" in them, so it would
// truncate any code line that followed one — deleting a live read before the
// grep ever saw it. A trailing comment now counts as code, which fails in the
// safe direction.
function withoutFullLineComments(text) {
  return text
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
    .replace(/^[ \t]*\/\/[^\n]*$/gm, "");
}

check("the comment stripper cannot delete a line of code", () => {
  const sample = [
    'const docs = "https://stripe.com/docs"; const id = invoice.subscription;',
    "  // invoice.subscription is gone",
    "  /* invoice.subscription is gone */",
    "  const kept = 1; // trailing note"
  ].join("\n");
  const stripped = withoutFullLineComments(sample);
  assert.ok(/invoice\.subscription/.test(stripped.split("\n")[0]), "a read after a // inside a string was deleted");
  assert.ok(/const kept = 1;/.test(stripped), "a line with a trailing comment was deleted");
  assert.strictEqual((stripped.match(/invoice\.subscription/g) || []).length, 1,
    "only the code occurrence survives stripping");
});

check("no handler is left reading a field the pinned API no longer sends", () => {
  const start = SOURCE.indexOf("function createStripeBillingFunctions(");
  const end = SOURCE.indexOf("function stripeReferenceId(");
  assert.ok(start > 0 && end > start, "the file no longer has the shape this check assumes");
  const factory = withoutFullLineComments(SOURCE.slice(start, end));
  assert.ok(!/invoice\.subscription\b/.test(factory), "a handler still reads the removed invoice.subscription");
  assert.ok(!/subscription\.current_period_end\b/.test(factory), "a handler still reads the removed subscription.current_period_end");
});

check("the webhook still dispatches the invoice events to these handlers", () => {
  // The checks above run the appliers directly. This is the one link they
  // cannot cover: that processStripeEvent is what calls them.
  const start = SOURCE.indexOf("  async function processStripeEvent(");
  assert.ok(start > 0, "processStripeEvent is where it was");
  const end = SOURCE.indexOf("\n  }\n", start);
  assert.ok(end > start, "processStripeEvent still closes at factory indentation");
  const body = SOURCE.slice(start, end);
  assert.ok(!/\n  (?:async )?function /.test(body.slice(20)), "the slice ran past the end of processStripeEvent");
  for (const [eventType, handler] of [
    ["invoice.paid", "applyInvoicePaid"],
    ["invoice.payment_failed", "applyInvoicePaymentFailed"],
    ["checkout.session.completed", "applyCompletedSubscriptionCheckout"]
  ]) {
    assert.ok(body.includes(`event.type === "${eventType}"`), `${eventType} is no longer dispatched`);
    assert.ok(body.includes(`${handler}(stripe, object)`), `${eventType} no longer reaches ${handler}`);
  }
  assert.ok(/applySubscription\(object, event\.type/.test(body), "customer.subscription.* no longer reaches applySubscription");
});

check("the appliers under test are the ones the factory ships", () => {
  // They are exported through _internal for these tests. If that bag ever stops
  // carrying them, the checks above would silently be running on undefined.
  const h = harness();
  for (const name of ["applyCompletedSubscriptionCheckout", "applySubscription", "applyInvoicePaid", "applyInvoicePaymentFailed"]) {
    assert.strictEqual(typeof h[name], "function", `${name} is no longer exposed on _internal`);
  }
  assert.ok(/const \{ _internal: stripeBillingInternal, \.\.\.stripeBillingExports \}/.test(
    fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8")),
  "index.js no longer strips _internal, so these would be deployed as functions");
});

// A check that throws off the await chain — inside a setTimeout, or a promise
// nobody holds — is not seen by the try/catch below, and Node's own non-zero
// exit arrives after the banner has already printed a lie. Recording it here
// and draining a turn before the banner puts the failure in front of it. A
// rejection that fires later than that drain is still only caught by Node's
// exit code, which the runner's `|| exit 1` does honour.
let unhandledRejection = null;
process.on("unhandledRejection", (error) => { unhandledRejection = error; });

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setImmediate(resolve));
  if (unhandledRejection) {
    console.log("FAIL  a check rejected outside the await chain -",
      String(unhandledRejection && unhandledRejection.message || unhandledRejection).split("\n")[0].slice(0, 200));
    process.exit(1);
  }
  // Outside the check list on purpose: a count guard that is itself a check can
  // be deleted along with the checks it counts.
  if (checks.length !== EXPECTED_CHECKS) {
    console.log(`FAIL  the suite lost a check - expected ${EXPECTED_CHECKS}, ran ${checks.length}`);
    process.exit(1);
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log(`\n✅ STRIPE INVOICE API DRIFT GEÇTİ (${checks.length} kontrol)`);
})();

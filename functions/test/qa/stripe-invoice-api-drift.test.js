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
// A second, later round covered what the fix ARMED rather than what it read.
// Making invoice.paid reach applySubscription made it the rail that records a
// renewal, and a recorded date needs the ordering watermark that defends it.
// Same method, same table:
//
//   O1  processStripeEvent: applyInvoicePaid(stripe, object) — the event time dropped
//         -> a renewal raises the watermark that protects its own date
//   O2  processStripeEvent: applyCompletedSubscriptionCheckout(stripe, object)
//         -> every webhook rail stamps the ledger's event sequence
//   O3  processStripeEvent: applyInvoicePaymentFailed(stripe, object)
//         -> every webhook rail stamps the ledger's event sequence
//   O4  applyInvoicePaid: applySubscription(subscription, "invoice.paid") — not forwarded
//         -> a renewal raises the watermark that protects its own date
//   O5  writeStripeSubscriptionLedger: the stripeEventSequence spread removed
//         -> every webhook rail stamps the ledger's event sequence
//   H1  applyInvoicePaymentFailed: the re-throw after the failure stamp removed
//         -> a failed subscription retrieve leaves the payment_failed event retryable
//   H2  processStripeEvent: the applier dispatch wrapped in a catch that returns
//         -> a failed subscription retrieve leaves the payment_failed event retryable
//   H3  applyInvoicePaymentFailed: the re-throw on the workspace_not_found exit removed
//         -> a failed subscription retrieve leaves the payment_failed event retryable
//
// A third round, for the state corruption that the ordering watermark was
// supposed to prevent and did not. The defect was live: the ledger writer decided
// an event was stale and RETURNED that verdict, applySubscription awaited it and
// discarded the return value, and the storage and team-seat branches below then
// wrote the workspace from the stale body — re-granting a cancelled add-on and
// cancelled seats and returning before the entitlement recompute, which is the
// only thing that made the plan rail safe. Same method again; the check named is
// the first to go red, and each mutation was reverted with `git checkout --`.
//
//   S1  applySubscription: the stale early-return deleted and the ledger writer
//       returning its skip instead of throwing — the exact production shape
//         -> a renewal raises the watermark that protects its own date
//            (7 red, incl. both add-on cases and the truthfulness case)
//   S2  writeStripeSubscriptionLedger: the ordering precondition removed
//         -> the ledger write refuses to run without a fresh ordering decision
//   S3  stripeSubscriptionEventOrdering: the rethrow replaced by the old
//       swallowing catch — invariant 2 back the way it shipped
//         -> a ledger read failure fails closed and leaves the event retryable
//   S4  applySubscription: the canonical retrieve removed, delivered body applied
//         -> two conflicting events created in the same second converge on Stripe's state
//   S5  processStripeEvent: { stripe } not passed on the customer.subscription.* rail
//         -> two conflicting events created in the same second converge on Stripe's state
//   S6  applyInvoicePaymentFailed: the stale early-return removed
//         -> a skipped event is recorded as skipped, on every rail
//   S7  the ordering comparison widened to `eventSequence <= seen`
//         -> two conflicting events created in the same second converge on Stripe's state
//   S8  applySubscription: the canonical retrieve wrapped in a catch that returns
//         -> a failed canonical subscription retrieve leaves the event retryable
//   S9  processStripeEvent: processingStatus hard-coded to "processed"
//         -> a skipped event is recorded as skipped, on every rail
//  S10  S1 and S4 applied together — byte for byte the code that shipped
//         -> a cancelled storage add-on is not resurrected by a later stale event,
//            reporting {"addon":"storage_200gb","active":true} and, on the seat
//            case, {"purchasedSeatQuantity":3}: the reported defect, reproduced
//  S11  applyInvoicePaid: { stripe } forwarded, so that rail retrieves twice
//         -> a dahlia invoice.paid records the renewal, dated from the item
//
// The earlier battery was re-run over the restructured code rather than taken on
// trust; A1, A5, O4, O5, H1, V2, V3, P1 and the count guard all still go red,
// each on the check its own row above names.
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

const EXPECTED_CHECKS = 47;

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
// Every serverTimestamp resolves to a DIFFERENT value. A constant one made a
// re-write of identical fields indistinguishable from no write at all, and the
// invariant the state-corruption checks below rest on is exactly "after a stale
// decision, nothing is written anywhere" — which is a claim about the whole
// store, not about the fields one branch happens to touch.
let stampTick = 0;

class FakeTimestamp {
  constructor(milliseconds) { this.milliseconds = milliseconds; }
  toMillis() { return this.milliseconds; }
  toDate() { return new Date(this.milliseconds); }
}

// Enough Firestore to run the appliers: documents by path, merge writes,
// equality queries, and one sub-collection listing. It rejects `undefined` the
// way the real client does, so a handler that writes an unset field fails here
// instead of at 3am in production.
//
// `failGet` is how a transient Firestore read failure is injected: it is handed
// each document path as it is read and returns an Error to throw, or nothing.
// Invariant 2 is a claim about what happens when the ordering pre-read fails, so
// it cannot be checked without a read that can fail.
function fakeFirestore(seed = {}, { failGet = null } = {}) {
  const store = new Map(Object.entries(seed).map(([key, value]) => [key, { ...value }]));
  const queries = [];
  // Every write, in order, with the fields it carried — so a check can say
  // "exactly one write touched billingTrialUsedAt" instead of inferring it from
  // the end state, which two writes of the same field would leave identical.
  const writes = [];
  // A version per document, bumped on every write. This is what lets
  // runTransaction below behave like Firestore's: a transaction that read a
  // document somebody else wrote in the meantime is retried from the top, not
  // committed over them.
  const versions = new Map();

  function documentRef(docPath) {
    const id = docPath.slice(docPath.lastIndexOf("/") + 1);
    return {
      id,
      path: docPath,
      collection: (name) => collectionRef(`${docPath}/${name}`),
      async get() {
        const injected = failGet ? failGet(docPath) : null;
        if (injected) throw injected;
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
          else if (fieldValue === SERVER_TIMESTAMP) next[field] = new FakeTimestamp(WRITE_MILLIS + (stampTick += 1));
          else next[field] = fieldValue;
        }
        store.set(docPath, next);
        versions.set(docPath, (versions.get(docPath) || 0) + 1);
        writes.push({ path: docPath, fields: Object.keys(value) });
      }
    };
  }

  // Optimistic transactions, the way Firestore runs them: reads note the
  // document version they saw, writes are held until the function returns, and
  // a commit that finds one of its reads overtaken retries the whole function.
  // Each read yields a turn first, so two transactions started in the same tick
  // — two webhook deliveries of one checkout — interleave rather than run one
  // after the other, which is the only way the "written once" claim can be
  // exercised in a single process.
  async function runTransaction(fn) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const readVersions = new Map();
      const pending = [];
      const transaction = {
        async get(ref) {
          await new Promise((resolve) => setImmediate(resolve));
          readVersions.set(ref.path, versions.get(ref.path) || 0);
          return ref.get();
        },
        set(ref, value, options) { pending.push(() => ref.set(value, options)); return transaction; },
        update(ref, value) { pending.push(() => ref.set(value, { merge: true })); return transaction; }
      };
      const result = await fn(transaction);
      await new Promise((resolve) => setImmediate(resolve));
      const overtaken = [...readVersions].some(([docPath, seen]) => (versions.get(docPath) || 0) !== seen);
      if (overtaken) continue;
      for (const write of pending) await write();
      return result;
    }
    throw new Error("fake runTransaction: contention did not resolve");
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

  return { db: { collection: (name) => collectionRef(name), runTransaction }, store, queries, writes };
}

// Only the fields planUpdatePayload reads. The assertions below are about which
// dates and ids the handlers write, never about what a plan is worth.
const PLAN_ENTITLEMENTS = {
  demo: { plan: "demo", displayName: "Free", storageLimitMB: 50, teamMemberLimit: 1 },
  pro_monthly: { plan: "pro_monthly", displayName: "Pro", storageLimitMB: 5_000, teamMemberLimit: 1 },
  team_monthly: { plan: "team_monthly", displayName: "Team", storageLimitMB: 20_000, teamMemberLimit: 5 }
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
function harness({ retrieve, workspace: workspaceSeed, seed, failGet, requireWorkspaceForBilling } = {}) {
  const { db, store, queries, writes } = fakeFirestore({
    [`companies/${WORKSPACE}`]: {
      billingPlan: "demo",
      billingStatus: "free",
      billingCustomerId: CUSTOMER,
      billingSubscriptionId: SUB,
      ...(workspaceSeed || {})
    },
    ...(seed || {})
  }, { failGet });
  const retrieved = [];
  const stripe = {
    subscriptions: {
      async retrieve(id) {
        retrieved.push(id);
        return retrieve ? retrieve(id) : dahliaSubscription();
      }
    }
  };
  const built = createStripeBillingFunctions({
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
    // The webhook checks never reach a callable; the checkout-guard check below
    // does, and hands in a resolver that reads the workspace as it stands NOW.
    requireWorkspaceForBilling: requireWorkspaceForBilling || (async () => { throw new Error("no callable is exercised here"); }),
    workspaceOrderRole: () => "owner",
    normalizeWorkspaceRole: (role) => role,
    workspaceRoleLabel: (role) => role
  });
  const { _internal } = built;

  const ledgerPrefix = `companies/${WORKSPACE}/subscriptions/`;
  return {
    ..._internal,
    // The callable, unwrapped: the fake onCall above returns the handler itself.
    createStripeCheckoutSession: built.createStripeCheckoutSession,
    stripe,
    store,
    queries,
    writes,
    retrieved,
    db,
    workspace: () => store.get(`companies/${WORKSPACE}`) || null,
    ledgerRows: () => [...store.entries()].filter(([key]) => key.startsWith(ledgerPrefix)).map(([, row]) => row),
    // Everything the handlers can persist EXCEPT the event log, which is the one
    // document a skipped event is supposed to touch. This is what turns "the two
    // add-on branches were patched" into "no mutation happens anywhere": a write
    // to any workspace field, any ledger field or any document nobody thought of
    // changes the string.
    state: () => stateSnapshot(store)
  };
}

function stateSnapshot(store) {
  return JSON.stringify([...store.entries()]
    .filter(([key]) => !key.startsWith("stripeBillingEvents/"))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => [key, Object.keys(value).sort().map((field) => {
      const held = value[field];
      return [field, held instanceof FakeTimestamp ? `ts:${held.toMillis()}` : held];
    })]));
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
  // Nothing on this path writes billingStatus: past_due lands only via
  // applySubscription, which needs both a resolved id and a subscription the
  // retrieve returned. A payment_failed on a one-off invoice has neither, and
  // it still stamps the failure and is still filed as processed — so reporting
  // "past_due" there recorded a transition that had not happened.
  //
  // This deliberately uses the one-off invoice rather than a throwing retrieve:
  // a failed retrieve now re-throws (see the next check), so the not-applied
  // RETURN shape is only observable on a path that has no error to report.
  const h = harness();
  return (async () => {
    const result = await h.applyInvoicePaymentFailed(h.stripe, dahliaInvoice({ id: "in_failed", parent: null }));

    assert.deepStrictEqual(h.retrieved, [], "a one-off invoice must not cost a Stripe call");
    assert.strictEqual(result.updated, true, "the failure stamp still landed");
    assert.notStrictEqual(result.status, "past_due", "the handler still claims a move it did not make");
    assert.strictEqual(result.status, "payment_failed_not_applied");
    assert.strictEqual(result.entitlementResolutionApplied, false);
    assert.strictEqual(result.entitlementResolutionSkippedReason, "invoice_without_subscription");

    const workspace = h.workspace();
    assert.ok(workspace.billingPaymentFailedAt, "the failure stamp is missing");
    assert.strictEqual(workspace.billingStatus, "free", "nothing on this path writes billingStatus");
  })();
});

check("a failed subscription retrieve leaves the payment_failed event retryable", () => {
  // The retrieve is caught so the failure stamp still lands — that half was
  // deliberate and survives. What must not survive is RETURNING afterwards:
  // processStripeEvent files anything that returns as processingStatus
  // "processed" WITH a processedAt, and its own dedupe keys on that processedAt.
  // So a returned result answers Stripe 200 ("consumed, stop retrying") and in
  // the same breath refuses the redelivery that would have applied the
  // transition — past_due lost for good on that event id, with the workspace
  // left carrying billingPaymentFailedAt, which reads as a handled failure.
  //
  // invoice.paid never caught the retrieve at all, and that is the shape being
  // matched here: 500, row left "received", redelivery applies it.
  const h = harness({ retrieve: () => { throw new Error("stripe unavailable"); } });
  const event = {
    id: "evt_failed",
    type: "invoice.payment_failed",
    created: 1_700_000,
    data: { object: dahliaInvoice({ id: "in_failed" }) }
  };
  return (async () => {
    const captured = await captureWarningsAsync(() => assert.rejects(
      () => h.processStripeEvent(h.stripe, event),
      /stripe unavailable/,
      "the handler reported success after the retrieve failed"
    ));
    assert.deepStrictEqual(h.retrieved, [SUB], "the id resolved, the call just failed");
    assert.ok(captured.lines.some((line) => /Could not retrieve failed invoice subscription/.test(line)),
      "the retrieve failure left no trace at all");

    const workspace = h.workspace();
    assert.ok(workspace.billingPaymentFailedAt, "the failure stamp no longer lands");
    assert.strictEqual(workspace.billingStatus, "free", "nothing on this path writes billingStatus");

    const row = h.store.get(`stripeBillingEvents/${event.id}`);
    assert.ok(row, "the event row was never opened");
    assert.strictEqual(row.processingStatus, "received", "a handler that threw was filed as finished");
    assert.strictEqual(row.processedAt, undefined,
      "processedAt was stamped for a handler that threw, so the dedupe now refuses the retry");

    // Stripe redelivers the SAME event id, and this time the retrieve works.
    h.stripe.subscriptions.retrieve = async (id) => {
      h.retrieved.push(id);
      return dahliaSubscription({ status: "past_due" });
    };
    const retried = await h.processStripeEvent(h.stripe, event);
    assert.strictEqual(retried.duplicate, undefined, "the redelivery was refused as a duplicate");
    assert.strictEqual(retried.status, "past_due");
    assert.strictEqual(h.workspace().billingStatus, "past_due", "the redelivery never reached the workspace");

    // The same rule on the earlier exit. An invoice for a subscription and a
    // customer this Firestore has never seen resolves no workspace at all, and
    // filing that as a permanent "workspace_not_found" while the only thing
    // that actually failed was a Stripe call is the same lost event.
    const orphan = harness({ retrieve: () => { throw new Error("stripe unavailable"); } });
    await captureWarningsAsync(() => assert.rejects(
      () => orphan.applyInvoicePaymentFailed(orphan.stripe, dahliaInvoice({
        id: "in_orphan",
        customer: "cus_unknown",
        parent: { type: "subscription_details", subscription_details: { subscription: "sub_unknown" } }
      })),
      /stripe unavailable/,
      "a transient Stripe failure was filed as a permanent workspace_not_found"
    ));
  })();
});

check("every webhook rail stamps the ledger's event sequence", () => {
  // writeStripeSubscriptionLedger's ordering guard is gated on `seen > 0`: it
  // compares the incoming event's created time against the stripeEventSequence
  // already on the row, and a row without one cannot be defended at all. Only
  // customer.subscription.* used to pass an event time, so any row whose most
  // recent write came from checkout.session.completed or either invoice handler
  // carried no sequence and the guard was dead on it.
  //
  // Asserted through processStripeEvent, not through the appliers: which time
  // each rail hands down is a property of the dispatcher, and calling an
  // applier with an explicit third argument cannot observe it.
  const invoiceForRail = dahliaInvoice({ id: "in_rail" });
  const rails = [
    ["checkout.session.completed", { id: "cs_1", object: "checkout.session", mode: "subscription", subscription: SUB }, 1_700_010, undefined],
    ["invoice.paid", dahliaInvoice(), 1_700_020, undefined],
    ["invoice.payment_failed", invoiceForRail, 1_700_030, () => dahliaSubscription({ status: "past_due" })],
    ["customer.subscription.updated", dahliaSubscription(), 1_700_040, undefined]
  ];
  return (async () => {
    for (const [type, object, created, retrieve] of rails) {
      const h = harness({ retrieve });
      await h.processStripeEvent(h.stripe, { id: `evt_${type}`, type, created, data: { object } });
      const rows = h.ledgerRows();
      assert.strictEqual(rows.length, 1, `${type} left no ledger row`);
      assert.strictEqual(rows[0].stripeEventSequence, created * 1000,
        `${type} wrote the ledger row without raising the ordering watermark`);
    }
  })();
});

check("a renewal raises the watermark that protects its own date", () => {
  // Stress points (f) and (e) together, and the reason the sequence above is
  // not bookkeeping. invoice.paid is the rail that records a renewal, so it is
  // the rail whose date a late delivery can undo:
  //
  //   1. customer.subscription.updated, created T, period end PERIOD_END
  //   2. invoice.paid, created T+100, the retrieve returns the renewed end
  //   3. customer.subscription.updated, created T+50 — older than the renewal,
  //      delivered after it, still carrying the PRE-renewal end
  //
  // With the renewal's own event time on the row, step 3 is older than the
  // watermark and is dropped with a warning. Without it the row still reads T,
  // T+50 out-ranks it, and billingCurrentPeriodEnd rolls back to a date already
  // in the past — which reconcileExpiredBillingEntitlements then selects on
  // hourly (billingEffectiveStatus "active" AND billingCurrentPeriodEnd < now-2h)
  // to expire the plan row and re-resolve the workspace to Free Demo.
  const RENEWED_END = PERIOD_END + 2_592_000;
  // customer.subscription.* is now applied from a fresh retrieve rather than from
  // the delivered body, so the fake provider has to hold a state that MOVES: the
  // pre-renewal subscription until the invoice is paid, the renewed one after.
  // A retrieve that returned the renewed period end from the start would not be
  // Stripe, and step 1 below would be asserting against a renewal that had not
  // happened yet.
  let canonical = dahliaSubscription();
  const h = harness({ retrieve: () => canonical });
  const staleUpdate = {
    id: "evt_late",
    type: "customer.subscription.updated",
    created: 1_700_050,
    data: { object: dahliaSubscription() }
  };
  return (async () => {
    await h.processStripeEvent(h.stripe, {
      id: "evt_first", type: "customer.subscription.updated", created: 1_700_000, data: { object: dahliaSubscription() }
    });
    assert.strictEqual(millisOf(h.workspace().billingCurrentPeriodEnd, "billingCurrentPeriodEnd"), PERIOD_END * 1000);

    canonical = dahliaSubscription({
      items: { object: "list", has_more: false, data: [{ id: "si_plan", quantity: 1, price: { id: "price_pro_monthly" }, current_period_end: RENEWED_END }] }
    });
    await h.processStripeEvent(h.stripe, {
      id: "evt_renewal", type: "invoice.paid", created: 1_700_100, data: { object: dahliaInvoice() }
    });
    assert.strictEqual(millisOf(h.workspace().billingCurrentPeriodEnd, "billingCurrentPeriodEnd"), RENEWED_END * 1000,
      "the renewal was not recorded at all");
    assert.strictEqual(h.ledgerRows()[0].stripeEventSequence, 1_700_100_000,
      "the renewal was written without raising the watermark that protects it");

    // The guard now drops the whole application, not just the ledger write: the
    // stale delivery returns before the ledger row, before the workspace, and
    // before the Stripe call it would otherwise have paid for.
    const before = h.state();
    const spent = h.retrieved.length;
    const captured = await captureWarningsAsync(() => h.processStripeEvent(h.stripe, staleUpdate));
    assert.strictEqual(h.state(), before, "a stale event wrote something");
    assert.strictEqual(h.retrieved.length, spent, "a stale event still cost a Stripe call");
    assert.ok(captured.lines.some((line) => /arrived out of order/i.test(line)),
      "a rolled-back renewal was not even logged");
    assert.strictEqual(millisOf(h.workspace().billingCurrentPeriodEnd, "billingCurrentPeriodEnd"), RENEWED_END * 1000,
      "a late older event rolled the renewal date back to the pre-renewal period end");
    assert.strictEqual(h.ledgerRows()[0].stripeEventSequence, 1_700_100_000, "the watermark went backwards");
    assert.strictEqual(h.workspace().billingPlan, "pro_monthly");
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

// ---- state corruption on the customer.subscription.* rail ------------------
// Everything below is about ONE production defect and the three paths that made
// it possible. writeStripeSubscriptionLedger decided an event was stale, said so
// in its return value, and returned; applySubscription awaited it and threw the
// answer away; the storage and team-seat branches under that await then wrote
// the workspace from the stale body and returned before the entitlement
// recompute — the only thing on the plan rail that made a late event harmless.
// A Team workspace with three purchased seats and a 200 GB add-on, both
// cancelled, got both back from one late redelivery, durably, and the next
// invoice.paid did not repair it because the add-on branches never reach the
// recompute at all.
//
// The fix is not "guard the two branches". It is that the ordering decision now
// belongs to the one function that mutates entitlement, is taken before any
// write and before the Stripe call, fails CLOSED when it cannot be taken, and
// that what gets applied afterwards is the subscription Stripe currently holds
// rather than the body that was delivered. So the checks assert on the WHOLE
// store, not on the two branches that were reported: `h.state()` is every
// document except the event log, and a stale event has to leave it byte-equal.

const STORAGE_SUB = "sub_1PdahliaStorage";
const SEAT_SUB = "sub_1PdahliaSeats";

function storageSubscription(overrides = {}) {
  return {
    id: STORAGE_SUB,
    object: "subscription",
    status: "active",
    customer: CUSTOMER,
    livemode: false,
    // workspaceId is on the metadata on purpose: the id, the customer and the
    // workspace metadata are the three immutable things on a subscription, which
    // is exactly why a stale body is still safe to IDENTIFY from.
    metadata: { studioFlowBillingKey: "storage_200gb", workspaceId: WORKSPACE },
    items: {
      object: "list",
      has_more: false,
      data: [{ id: "si_storage", quantity: 1, price: { id: "price_storage_200gb" }, current_period_end: PERIOD_END }]
    },
    ...overrides
  };
}

function seatSubscription(overrides = {}) {
  return {
    id: SEAT_SUB,
    object: "subscription",
    status: "active",
    customer: CUSTOMER,
    livemode: false,
    metadata: { studioFlowBillingKey: "additional_team_seat_monthly", workspaceId: WORKSPACE },
    items: {
      object: "list",
      has_more: false,
      data: [{ id: "si_seat", quantity: 3, price: { id: "price_seat_monthly" }, current_period_end: PERIOD_END }]
    },
    ...overrides
  };
}

check("a cancelled storage add-on is not resurrected by a later stale event", () => {
  // Case 1. 200 GB live, cancelled, then a customer.subscription.updated created
  // BEFORE the cancellation and delivered after it, still carrying the add-on
  // alive. This is the reported sequence.
  const CANCELLED_AT = 1_800_000;
  const STALE_AT = 1_799_000;
  let canonical = storageSubscription({ status: "canceled" });
  const h = harness({
    retrieve: () => canonical,
    workspace: {
      billingPlan: "team_monthly",
      billingStatus: "active",
      billingStorageAddonMB: 200 * 1024,
      billingStorageAddonKey: "storage_200gb",
      billingStorageAddonStatus: "active",
      billingStorageAddonSubscriptionId: STORAGE_SUB
    }
  });
  return (async () => {
    await h.processStripeEvent(h.stripe, {
      id: "evt_storage_cancel",
      type: "customer.subscription.deleted",
      created: CANCELLED_AT,
      data: { object: storageSubscription({ status: "canceled" }) }
    });
    const cancelled = h.workspace();
    assert.strictEqual(cancelled.billingStorageAddonMB, 0, "the cancellation did not clear the add-on");
    assert.strictEqual(cancelled.billingStorageAddonStatus, "cancelled");
    assert.strictEqual(cancelled.billingStorageAddonSubscriptionId, "");

    const before = h.state();
    const spent = h.retrieved.length;
    const captured = await captureWarningsAsync(() => h.processStripeEvent(h.stripe, {
      id: "evt_storage_stale",
      type: "customer.subscription.updated",
      created: STALE_AT,
      data: { object: storageSubscription({ status: "active" }) }
    }));

    assert.strictEqual(captured.value.skipped, true, `the stale event was applied: ${JSON.stringify(captured.value)}`);
    assert.strictEqual(captured.value.reason, "stale_subscription_event");
    assert.ok(captured.lines.some((line) => /arrived out of order/i.test(line)), "the drop was not even logged");

    const after = h.workspace();
    // The two fields functions/index.js:2420 activeStorageAddonMB() reads.
    assert.strictEqual(after.billingStorageAddonMB, 0, "a cancelled 200 GB add-on came back from a stale event");
    assert.strictEqual(after.billingStorageAddonStatus, "cancelled", "a cancelled add-on was re-granted an active status");
    assert.strictEqual(after.billingStorageAddonSubscriptionId, "");
    assert.strictEqual(h.state(), before, "a stale event wrote SOMETHING - the mutation set is not empty");
    assert.strictEqual(h.retrieved.length, spent, "a stale event still cost a Stripe call");

    // And the rail is not wedged: a genuinely newer event is still applied.
    const later = await h.processStripeEvent(h.stripe, {
      id: "evt_storage_later",
      type: "customer.subscription.updated",
      created: CANCELLED_AT + 60,
      data: { object: storageSubscription({ status: "canceled" }) }
    });
    assert.strictEqual(later.skipped, undefined, "the guard is dropping current events too");
    assert.strictEqual(h.workspace().billingStorageAddonMB, 0);
  })();
});

check("cancelled team seats are not resurrected by a later stale event", () => {
  // Case 2. Same sequence on the seat rail, which is enforced by
  // activeAdditionalTeamSeats() in functions/index.js:2409 from exactly the two
  // fields asserted below.
  const CANCELLED_AT = 1_800_000;
  const STALE_AT = 1_799_000;
  let canonical = seatSubscription({ status: "canceled" });
  const h = harness({
    retrieve: () => canonical,
    workspace: {
      billingPlan: "team_monthly",
      billingStatus: "active",
      billingAdditionalTeamSeatQuantity: 3,
      billingAdditionalTeamSeatKey: "additional_team_seat_monthly",
      billingAdditionalTeamSeatStatus: "active",
      billingAdditionalTeamSeatSubscriptionId: SEAT_SUB,
      billingTeamIncludedSeats: 5,
      billingTeamMemberLimit: 8
    }
  });
  return (async () => {
    await h.processStripeEvent(h.stripe, {
      id: "evt_seat_cancel",
      type: "customer.subscription.deleted",
      created: CANCELLED_AT,
      data: { object: seatSubscription({ status: "canceled" }) }
    });
    const cancelled = h.workspace();
    assert.strictEqual(cancelled.billingAdditionalTeamSeatQuantity, 0, "the cancellation did not remove the seats");
    assert.strictEqual(cancelled.billingAdditionalTeamSeatStatus, "cancelled");
    assert.strictEqual(cancelled.billingTeamMemberLimit, 5, "the member limit still includes the cancelled seats");

    const before = h.state();
    const spent = h.retrieved.length;
    const stale = await captureWarningsAsync(() => h.processStripeEvent(h.stripe, {
      id: "evt_seat_stale",
      type: "customer.subscription.updated",
      created: STALE_AT,
      data: { object: seatSubscription({ status: "active" }) }
    }));

    assert.strictEqual(stale.value.skipped, true, `the stale event was applied: ${JSON.stringify(stale.value)}`);
    assert.strictEqual(stale.value.reason, "stale_subscription_event");

    const after = h.workspace();
    assert.strictEqual(after.billingAdditionalTeamSeatQuantity, 0, "three cancelled seats came back from a stale event");
    assert.strictEqual(after.billingAdditionalTeamSeatStatus, "cancelled", "cancelled seats were re-granted an active status");
    assert.strictEqual(after.billingAdditionalTeamSeatSubscriptionId, "");
    assert.strictEqual(after.billingTeamMemberLimit, 5, "the member limit grew back from a stale event");
    assert.strictEqual(h.state(), before, "a stale event wrote SOMETHING - the mutation set is not empty");
    assert.strictEqual(h.retrieved.length, spent, "a stale event still cost a Stripe call");
  })();
});

check("two conflicting events created in the same second converge on Stripe's state", () => {
  // Case 3. Stripe's `created` has one-second granularity, so a tie is ordinary,
  // and `eventSequence < seen` applies both members of it. That used to mean
  // last-writer-wins between two conflicting bodies. It no longer decides
  // anything, because neither body is what gets applied: both events retrieve the
  // subscription and both write the state Stripe currently holds. The tie is
  // therefore resolved by Stripe rather than by delivery order — which is why
  // there is no tie-breaker here to go wrong.
  //
  // Treating equal as stale would be the other kind of wrong: a cancellation
  // delivered in the same second as an update would be silently dropped.
  const TIE = 1_800_500;
  const activeBody = dahliaSubscription({ status: "active" });
  const trialBody = dahliaSubscription({
    status: "trialing",
    items: { object: "list", has_more: false, data: [{ id: "si_plan", quantity: 1, price: { id: "price_pro_monthly" }, current_period_end: PERIOD_END + 999_999 }] }
  });
  const orders = [
    [["evt_tie_active_first", activeBody], ["evt_tie_trial_second", trialBody]],
    [["evt_tie_trial_first", trialBody], ["evt_tie_active_second", activeBody]]
  ];
  return (async () => {
    for (const order of orders) {
      // Stripe's own answer, which neither body carries: the subscription is gone.
      const h = harness({ retrieve: () => dahliaSubscription({ status: "canceled" }) });
      const labels = order.map(([id]) => id).join(" then ");
      for (const [id, object] of order) {
        const result = await h.processStripeEvent(h.stripe, {
          id, type: "customer.subscription.updated", created: TIE, data: { object }
        });
        assert.strictEqual(result.skipped, undefined,
          `${id} was dropped as stale for sharing a second with its sibling: ${JSON.stringify(result)}`);
      }
      assert.strictEqual(h.retrieved.length, 2, `${labels}: an event was applied from its body instead of from Stripe`);
      const workspace = h.workspace();
      assert.strictEqual(workspace.billingPlan, "demo", `${labels}: the last body to arrive won instead of Stripe's own state`);
      assert.strictEqual(workspace.billingStatus, "cancelled", labels);
      assert.strictEqual(h.ledgerRows().length, 1, labels);
      assert.strictEqual(h.ledgerRows()[0].activeForEntitlement, false, labels);
      assert.strictEqual(h.ledgerRows()[0].stripeEventSequence, TIE * 1000, labels);
    }
  })();
});

check("a stale event is dropped and the current event that follows still applies", () => {
  // Case 4. The failure mode a watermark can introduce is a wedged subscription:
  // one bad sequence and nothing is ever accepted again. A dropped event must
  // leave the watermark exactly where it was.
  const BASE = 1_800_000;
  let canonical = dahliaSubscription({ status: "active" });
  const h = harness({ retrieve: () => canonical });
  return (async () => {
    await h.processStripeEvent(h.stripe, {
      id: "evt_seq_base", type: "customer.subscription.updated", created: BASE, data: { object: dahliaSubscription() }
    });
    assert.strictEqual(h.workspace().billingPlan, "pro_monthly");
    assert.strictEqual(h.ledgerRows()[0].stripeEventSequence, BASE * 1000);

    const stale = await captureWarningsAsync(() => h.processStripeEvent(h.stripe, {
      id: "evt_seq_stale", type: "customer.subscription.updated", created: BASE - 500,
      data: { object: dahliaSubscription({ status: "canceled" }) }
    }));
    assert.strictEqual(stale.value.reason, "stale_subscription_event");
    assert.strictEqual(h.ledgerRows()[0].stripeEventSequence, BASE * 1000, "a dropped event moved the watermark");
    assert.strictEqual(h.workspace().billingPlan, "pro_monthly", "a dropped event cancelled the plan");

    canonical = dahliaSubscription({ status: "canceled" });
    const current = await h.processStripeEvent(h.stripe, {
      id: "evt_seq_current", type: "customer.subscription.updated", created: BASE + 500,
      data: { object: dahliaSubscription({ status: "canceled" }) }
    });
    assert.strictEqual(current.skipped, undefined, `the current event was refused: ${JSON.stringify(current)}`);
    assert.strictEqual(h.ledgerRows()[0].stripeEventSequence, (BASE + 500) * 1000, "the watermark did not advance");
    assert.strictEqual(h.workspace().billingPlan, "demo", "the current event never reached the workspace");
    assert.strictEqual(h.workspace().billingStatus, "cancelled");
  })();
});

check("a current event followed by a stale one mutates nothing anywhere", () => {
  // Case 5, and the completeness proof for invariant 1. Not "the two add-on
  // branches do not write" — the whole store, every document, every field.
  // A cancelled Team workspace with both add-ons gone is the state that the
  // reported bug re-granted, so it is the state used here.
  const CURRENT = 1_800_000;
  const h = harness({
    retrieve: () => seatSubscription({ status: "canceled" }),
    workspace: {
      billingPlan: "team_monthly",
      billingStatus: "active",
      billingAdditionalTeamSeatQuantity: 3,
      billingAdditionalTeamSeatStatus: "active",
      billingAdditionalTeamSeatSubscriptionId: SEAT_SUB,
      billingStorageAddonMB: 200 * 1024,
      billingStorageAddonStatus: "active",
      billingTeamMemberLimit: 8
    }
  });
  return (async () => {
    await h.processStripeEvent(h.stripe, {
      id: "evt_state_current", type: "customer.subscription.updated", created: CURRENT,
      data: { object: seatSubscription({ status: "canceled" }) }
    });
    const before = h.state();
    const spent = h.retrieved.length;

    for (const [id, created, object] of [
      ["evt_state_stale_1", CURRENT - 1, seatSubscription({ status: "active" })],
      ["evt_state_stale_2", CURRENT - 86_400, seatSubscription({ status: "trialing" })],
      ["evt_state_stale_3", 1, seatSubscription({ status: "past_due" })]
    ]) {
      const result = await captureWarningsAsync(() => h.processStripeEvent(h.stripe, {
        id, type: "customer.subscription.updated", created, data: { object }
      }));
      assert.strictEqual(result.value.skipped, true, `${id} was applied: ${JSON.stringify(result.value)}`);
      assert.strictEqual(h.state(), before, `${id} mutated persistent state after being ruled stale`);
      assert.strictEqual(h.retrieved.length, spent, `${id} spent a Stripe call after being ruled stale`);
    }
  })();
});

check("a ledger read failure fails closed and leaves the event retryable", () => {
  // Case 6, and invariant 2. The ordering pre-read used to be wrapped in a catch
  // that warned and carried on, so ONE Firestore blip applied a stale event in
  // full AND filed it as processed — after which no redelivery could repair it,
  // because processStripeEvent's dedupe keys on that processedAt.
  //
  // Fail closed means the applier throws. That is only safe because the dedupe
  // row is opened with processingStatus "received" and gets its processedAt only
  // after the applier RETURNS, so the throw leaves the event retryable rather
  // than converting a transient failure into permanent loss. That is the exact
  // sequence driven below, on both rails: throw, inspect the row, redeliver.
  const LEDGER = `companies/${WORKSPACE}/subscriptions/stripe_${SUB}`;
  function failOnce() {
    let armed = true;
    return (docPath) => {
      if (docPath !== LEDGER || !armed) return null;
      armed = false;
      return new Error("firestore unavailable");
    };
  }

  return (async () => {
    const h = harness({ failGet: failOnce() });
    const event = {
      id: "evt_ledger_read", type: "customer.subscription.updated", created: 1_800_000,
      data: { object: dahliaSubscription() }
    };
    const before = h.state();
    const captured = await captureWarningsAsync(() => assert.rejects(
      () => h.processStripeEvent(h.stripe, event),
      /firestore unavailable/,
      "a failed ordering read was swallowed and the event applied anyway"
    ));
    assert.ok(captured.lines.some((line) => /refusing to apply/i.test(line)), "the refusal left no trace");
    assert.strictEqual(h.state(), before, "an event applied on top of an ordering read that failed");
    assert.deepStrictEqual(h.retrieved, [], "Stripe was called before the ordering read had succeeded");

    const row = h.store.get(`stripeBillingEvents/${event.id}`);
    assert.ok(row, "the event row was never opened");
    assert.strictEqual(row.processingStatus, "received", "an applier that threw was filed as finished");
    assert.strictEqual(row.processedAt, undefined,
      "processedAt was stamped for an event that never applied, so the redelivery is now refused");

    const retried = await h.processStripeEvent(h.stripe, event);
    assert.strictEqual(retried.duplicate, undefined, "the redelivery was refused as a duplicate");
    assert.strictEqual(retried.updated, true, `the redelivery did not apply: ${JSON.stringify(retried)}`);
    assert.strictEqual(h.workspace().billingPlan, "pro_monthly");

    // The same failure on the rail that stamps the workspace unconditionally.
    // The ordering read now fails BEFORE billingPaymentFailedAt lands, so there
    // is no half-written state to reconcile and the redelivery does both.
    const f = harness({ failGet: failOnce(), retrieve: () => dahliaSubscription({ status: "past_due" }) });
    const failure = {
      id: "evt_ledger_read_failed", type: "invoice.payment_failed", created: 1_800_000,
      data: { object: dahliaInvoice({ id: "in_ledger_read" }) }
    };
    const stateBefore = f.state();
    await captureWarningsAsync(() => assert.rejects(
      () => f.processStripeEvent(f.stripe, failure),
      /firestore unavailable/,
      "the payment_failed rail swallowed a failed ordering read"
    ));
    assert.strictEqual(f.state(), stateBefore, "the failure stamp landed on an event that never applied");
    assert.strictEqual(f.workspace().billingPaymentFailedAt, undefined);
    const failureRow = f.store.get(`stripeBillingEvents/${failure.id}`);
    assert.strictEqual(failureRow.processedAt, undefined, "the payment_failed dedupe row was closed on a thrown event");

    const failureRetried = await f.processStripeEvent(f.stripe, failure);
    assert.strictEqual(failureRetried.duplicate, undefined, "the redelivery was refused as a duplicate");
    assert.strictEqual(failureRetried.status, "past_due");
    assert.ok(f.workspace().billingPaymentFailedAt, "the redelivery never stamped the failure");
    assert.strictEqual(f.workspace().billingStatus, "past_due");
  })();
});

check("a failed canonical subscription retrieve leaves the event retryable", () => {
  // Case 7, and the cost of the architecture: converging on Stripe's state means
  // one more call that can fail. The answer is the same as everywhere else here —
  // apply nothing, keep the event retryable, never fall back to the body the
  // retrieve exists to distrust.
  const h = harness({ retrieve: () => { throw new Error("stripe unavailable"); } });
  const event = {
    id: "evt_retrieve_failed", type: "customer.subscription.updated", created: 1_800_000,
    data: { object: dahliaSubscription({ status: "active" }) }
  };
  return (async () => {
    const before = h.state();
    await assert.rejects(() => h.processStripeEvent(h.stripe, event), /stripe unavailable/,
      "a failed canonical read was swallowed and the delivered body applied instead");
    assert.strictEqual(h.state(), before, "the delivered body was applied after the canonical read failed");
    assert.deepStrictEqual(h.ledgerRows(), [], "the watermark moved for an event that never applied");

    const row = h.store.get(`stripeBillingEvents/${event.id}`);
    assert.strictEqual(row.processingStatus, "received");
    assert.strictEqual(row.processedAt, undefined, "a Stripe outage was filed as a consumed event");

    h.stripe.subscriptions.retrieve = async (id) => {
      h.retrieved.push(id);
      return dahliaSubscription({ status: "active" });
    };
    const retried = await h.processStripeEvent(h.stripe, event);
    assert.strictEqual(retried.duplicate, undefined, "the redelivery was refused as a duplicate");
    assert.strictEqual(retried.updated, true);
    assert.strictEqual(h.workspace().billingPlan, "pro_monthly");
    assert.strictEqual(h.ledgerRows()[0].stripeEventSequence, 1_800_000_000);
  })();
});

check("a replayed event is refused by the dedupe and changes nothing", () => {
  // Case 8. Idempotency has to survive the new throw sites: an event that DID
  // apply must still be refused on replay, and must not spend a second Stripe
  // call doing it.
  const h = harness();
  const event = {
    id: "evt_replay", type: "customer.subscription.updated", created: 1_800_000,
    data: { object: dahliaSubscription() }
  };
  return (async () => {
    const first = await h.processStripeEvent(h.stripe, event);
    assert.strictEqual(first.updated, true);
    const applied = h.state();
    const spent = h.retrieved.length;

    const second = await h.processStripeEvent(h.stripe, event);
    assert.deepStrictEqual(second, { duplicate: true }, `a replay was processed again: ${JSON.stringify(second)}`);
    assert.strictEqual(h.state(), applied, "a replayed event mutated state a second time");
    assert.strictEqual(h.retrieved.length, spent, "a replayed event cost a second Stripe call");

    // A redelivery Stripe files under a NEW event id gets past the dedupe by
    // design. It is safe for the other reason: same second, same canonical state.
    const twin = await h.processStripeEvent(h.stripe, { ...event, id: "evt_replay_twin" });
    assert.strictEqual(twin.skipped, undefined, `an equal-sequence twin was dropped: ${JSON.stringify(twin)}`);
    assert.strictEqual(h.workspace().billingPlan, "pro_monthly");
    assert.strictEqual(h.ledgerRows()[0].stripeEventSequence, 1_800_000_000);
    assert.strictEqual(h.ledgerRows()[0].activeForEntitlement, true);
  })();
});

check("a payment failure followed by a recovery ends active, not past_due", () => {
  // Case 9. Two rails, in order, each applying what Stripe held at the time.
  let canonical = dahliaSubscription({ status: "past_due" });
  const h = harness({ retrieve: () => canonical });
  return (async () => {
    const failed = await h.processStripeEvent(h.stripe, {
      id: "evt_dunning_failed", type: "invoice.payment_failed", created: 1_800_000,
      data: { object: dahliaInvoice({ id: "in_dunning" }) }
    });
    assert.strictEqual(failed.status, "past_due");
    assert.strictEqual(failed.entitlementResolutionApplied, true);
    assert.strictEqual(h.workspace().billingStatus, "past_due", "dunning never started");
    assert.ok(h.workspace().billingPaymentFailedAt, "the failure stamp is missing");

    canonical = dahliaSubscription({ status: "active" });
    const recovered = await h.processStripeEvent(h.stripe, {
      id: "evt_dunning_recovered", type: "invoice.paid", created: 1_800_100,
      data: { object: dahliaInvoice({ id: "in_recovered" }) }
    });
    assert.strictEqual(recovered.updated, true, `the recovery was skipped: ${JSON.stringify(recovered)}`);
    assert.strictEqual(h.workspace().billingStatus, "active", "the workspace is stuck in past_due after paying");
    assert.strictEqual(h.workspace().billingPlan, "pro_monthly");
    assert.strictEqual(h.workspace().billingLastInvoiceId, "in_recovered");
    assert.strictEqual(h.ledgerRows()[0].providerStatus, "active");
    assert.strictEqual(h.ledgerRows()[0].stripeEventSequence, 1_800_100_000);
  })();
});

check("an invoice.paid renewal applies Stripe's state and costs one retrieve", () => {
  // Case 10. The renewal rail already retrieved the subscription one frame up, so
  // it passes no client down and must NOT pay for a second call: the extra call
  // this fix introduces belongs to customer.subscription.* alone.
  const RENEWED_END = PERIOD_END + 2_592_000;
  const h = harness({
    retrieve: () => dahliaSubscription({
      items: { object: "list", has_more: false, data: [{ id: "si_plan", quantity: 1, price: { id: "price_pro_monthly" }, current_period_end: RENEWED_END }] }
    })
  });
  return (async () => {
    const result = await h.processStripeEvent(h.stripe, {
      id: "evt_renewal_canonical", type: "invoice.paid", created: 1_800_000,
      data: { object: dahliaInvoice() }
    });
    assert.strictEqual(result.updated, true, `the renewal was skipped: ${JSON.stringify(result)}`);
    assert.deepStrictEqual(h.retrieved, [SUB], "the renewal rail retrieved the subscription more than once");
    assert.strictEqual(millisOf(h.workspace().billingCurrentPeriodEnd, "billingCurrentPeriodEnd"), RENEWED_END * 1000);
    assert.strictEqual(millisOf(h.ledgerRows()[0].currentPeriodEnd, "ledger currentPeriodEnd"), RENEWED_END * 1000);
    assert.strictEqual(h.ledgerRows()[0].stripeEventSequence, 1_800_000_000, "the renewal did not raise its own watermark");
    assert.strictEqual(h.workspace().billingLastInvoiceId, "in_dahlia");
  })();
});

check("a skipped event is recorded as skipped, on every rail", () => {
  // Case 11, and invariant 4. applySubscription used to report `updated: true`
  // for a ledger write it had skipped, and processStripeEvent persists that
  // verbatim next to processingStatus "processed" — an event record that states
  // the opposite of what happened, which is how this survived a log review.
  //
  // All three rails that can carry a subscription are driven, because the
  // payment_failed rail builds its own return value rather than passing
  // applySubscription's through, and it was the one that claimed past_due.
  const HIGH = 1_800_000;
  const STALE = 1_700_000;
  const rails = [
    ["customer.subscription.updated", () => dahliaSubscription({ status: "active" })],
    ["invoice.paid", () => dahliaInvoice({ id: "in_stale_paid" })],
    ["invoice.payment_failed", () => dahliaInvoice({ id: "in_stale_failed" })]
  ];
  return (async () => {
    for (const [type, body] of rails) {
      const h = harness({ retrieve: () => dahliaSubscription({ status: "active" }) });
      await h.processStripeEvent(h.stripe, {
        id: `evt_watermark_${type}`, type: "customer.subscription.updated", created: HIGH,
        data: { object: dahliaSubscription() }
      });
      const before = h.state();

      const id = `evt_stale_${type}`;
      const captured = await captureWarningsAsync(() => h.processStripeEvent(h.stripe, {
        id, type, created: STALE, data: { object: body() }
      }));
      const result = captured.value;

      assert.strictEqual(result.skipped, true, `${type} did not report the skip: ${JSON.stringify(result)}`);
      assert.strictEqual(result.reason, "stale_subscription_event", type);
      assert.strictEqual(result.updated, undefined, `${type} claimed updated:true for an event it skipped`);
      assert.strictEqual(result.status, undefined, `${type} claimed a status transition it did not make`);

      const row = h.store.get(`stripeBillingEvents/${id}`);
      assert.ok(row, `${type} left no event row`);
      assert.strictEqual(row.processingStatus, "skipped", `${type} filed a skipped event as processed`);
      assert.ok(row.processedAt, `${type} left a deterministic skip retryable forever`);
      assert.strictEqual(row.result.reason, "stale_subscription_event", `${type} recorded no reason`);
      assert.strictEqual(row.result.updated, undefined, `${type} recorded updated:true for a skip`);

      assert.strictEqual(h.state(), before, `${type} mutated state after being ruled stale`);
    }
  })();
});

check("the ordering decision reads the watermark and never writes", () => {
  // The decision itself, at unit level: what counts as stale, what does not, and
  // what happens when the read fails. `<` and not `<=` is the whole of invariant
  // 3 at this layer — an equal sequence is APPLIED, and it is safe to apply
  // because applySubscription applies canonical state rather than the body.
  const h = harness();
  const workspace = { ref: h.db.collection("companies").doc(WORKSPACE), id: WORKSPACE, data: {} };
  const ledgerPath = `companies/${WORKSPACE}/subscriptions/stripe_${SUB}`;
  return (async () => {
    const noSequence = await h.stripeSubscriptionEventOrdering({
      workspace, subscriptionId: SUB, eventType: "manual.owner_resync", eventCreatedMs: 0
    });
    assert.strictEqual(noSequence.stale, false, "a resync or reconcile must never be ruled stale");
    assert.strictEqual(noSequence.checked, true);

    const empty = await h.stripeSubscriptionEventOrdering({
      workspace, subscriptionId: SUB, eventType: "customer.subscription.updated", eventCreatedMs: 5_000
    });
    assert.strictEqual(empty.stale, false, "a subscription with no row yet cannot be stale");

    await h.db.collection("companies").doc(WORKSPACE).collection("subscriptions")
      .doc(`stripe_${SUB}`).set({ stripeEventSequence: 5_000 }, { merge: true });
    const before = h.state();

    for (const [eventCreatedMs, stale, why] of [
      [4_999, true, "an older event is stale"],
      [5_000, false, "an equal event must be applied, not dropped"],
      [5_001, false, "a newer event must be applied"]
    ]) {
      const decision = await captureWarningsAsync(() => h.stripeSubscriptionEventOrdering({
        workspace, subscriptionId: SUB, eventType: "customer.subscription.updated", eventCreatedMs
      }));
      assert.strictEqual(decision.value.stale, stale, why);
      assert.strictEqual(decision.value.seen, 5_000);
    }
    assert.strictEqual(h.state(), before, "the ordering decision wrote to Firestore");

    const failing = harness({ failGet: (docPath) => (docPath === ledgerPath ? new Error("firestore unavailable") : null) });
    const failingWorkspace = { ref: failing.db.collection("companies").doc(WORKSPACE), id: WORKSPACE, data: {} };
    await captureWarningsAsync(() => assert.rejects(() => failing.stripeSubscriptionEventOrdering({
      workspace: failingWorkspace, subscriptionId: SUB, eventType: "customer.subscription.updated", eventCreatedMs: 5_000
    }), /firestore unavailable/, "the ordering read still fails open"));
  })();
});

check("the ledger write refuses to run without a fresh ordering decision", () => {
  // The structural half of invariant 1. The bug was reachable because the ledger
  // writer could decide staleness itself and its caller could ignore the answer;
  // now the decision is the caller's and the writer will not run without one.
  // A future caller that forgets throws — which is retryable — instead of
  // quietly writing a row nobody ordered.
  const h = harness();
  const ref = h.db.collection("companies").doc(WORKSPACE);
  const workspace = { ref, id: WORKSPACE, data: {} };
  const item = { key: "pro_monthly", type: "plan", plan: "pro_monthly", interval: "month" };
  const staleOrdering = {
    checked: true,
    stale: true,
    ledgerRef: ref.collection("subscriptions").doc(`stripe_${SUB}`),
    eventSequence: 1,
    seen: 2
  };
  return (async () => {
    const before = h.state();
    for (const ordering of [undefined, null, {}, { checked: false, stale: false }, staleOrdering]) {
      await assert.rejects(() => h.writeStripeSubscriptionLedger({
        workspace,
        subscription: dahliaSubscription(),
        item,
        eventType: "customer.subscription.updated",
        status: "active",
        periodEnd: null,
        customerId: CUSTOMER,
        shouldFallback: false,
        ordering
      }), /writeStripeSubscriptionLedger/, `ordering ${JSON.stringify(ordering || null)} was accepted`);
    }
    assert.strictEqual(h.state(), before, "a ledger write without a valid ordering decision still wrote a row");
  })();
});

// ---- the backstop ---------------------------------------------------------
// A grep, kept only for the handlers the checks above do not run. It is scoped
// to the factory, because the two resolvers below it keep the legacy reads on
// purpose as their fallback.
// ---- the trial stamp: the one fact a stale event may still write ------------
// d0c7f431 made a stale checkout.session.completed return {skipped:true} with
// no `updated`, and the once-per-workspace trial stamp was gated on `updated`,
// so a late checkout delivery stopped spending the free fortnight. Once a
// cancellation cleared billingSubscriptionId, the workspace could buy a second
// trial. The rule that fixes it, pinned here: billingTrialUsedAt is written when
// Stripe's own record shows a trial and the workspace resolved, ONLY if absent,
// inside a transaction — and it is the ONLY field a stale event may touch.

/** Every [document, field] whose value differs between two state snapshots. */
function stateDiff(before, after) {
  const read = (snapshot) => new Map(JSON.parse(snapshot).map(([docPath, fields]) => [docPath, new Map(fields)]));
  const left = read(before);
  const right = read(after);
  const changes = [];
  for (const docPath of new Set([...left.keys(), ...right.keys()])) {
    const l = left.get(docPath) || new Map();
    const r = right.get(docPath) || new Map();
    for (const field of new Set([...l.keys(), ...r.keys()])) {
      if (JSON.stringify(l.get(field)) !== JSON.stringify(r.get(field))) changes.push(`${docPath}.${field}`);
    }
  }
  return changes.sort();
}

const TRIAL_END = PERIOD_END;
const trialingSubscription = (overrides = {}) => dahliaSubscription({ status: "trialing", trial_start: TRIAL_END - 1_209_600, trial_end: TRIAL_END, ...overrides });
const checkoutEvent = (id, created, sessionId = id) => ({
  id, type: "checkout.session.completed", created,
  data: { object: { id: `cs_${sessionId}`, object: "checkout.session", mode: "subscription", subscription: SUB } }
});
const WORKSPACE_DOC = `companies/${WORKSPACE}`;
const BASE_SEQ = 1_800_000;

/** A workspace that has never spent its trial, with both add-ons cancelled — the state the leak needs. */
const UNSTAMPED_WORKSPACE = {
  billingPlan: "demo",
  billingStatus: "free",
  billingAdditionalTeamSeatQuantity: 0,
  billingAdditionalTeamSeatStatus: "cancelled",
  billingStorageAddonMB: 0,
  billingStorageAddonStatus: "cancelled"
};

check("a stale trial checkout still spends the once-per-workspace trial, and writes nothing else", () => {
  const h = harness({ retrieve: () => trialingSubscription(), workspace: UNSTAMPED_WORKSPACE });
  return (async () => {
    const applied = await h.processStripeEvent(h.stripe, {
      id: "evt_trial_sub", type: "customer.subscription.updated", created: BASE_SEQ, data: { object: trialingSubscription() }
    });
    assert.strictEqual(applied.updated, true);
    assert.strictEqual(h.workspace().billingStatus, "trialing");
    assert.strictEqual(h.workspace().billingTrialUsedAt, undefined, "the subscription rail must not stamp the trial; that is the checkout rail's job");

    const before = h.state();
    const writesBefore = h.writes.length;
    const stale = await captureWarningsAsync(() => h.processStripeEvent(h.stripe, checkoutEvent("evt_trial_checkout_stale", BASE_SEQ - 500)));

    assert.strictEqual(stale.value.skipped, true, `the stale checkout was applied: ${JSON.stringify(stale.value)}`);
    assert.strictEqual(stale.value.reason, "stale_subscription_event");
    assert.strictEqual(stale.value.billingTrialUsedAtStamped, true, "the event record must say the trial was spent");
    assert.ok(h.workspace().billingTrialUsedAt instanceof FakeTimestamp, "billingTrialUsedAt was not written");
    assert.deepStrictEqual(stateDiff(before, h.state()), [`${WORKSPACE_DOC}.billingTrialUsedAt`],
      "a stale checkout may write the trial stamp and nothing else");
    // The per-rail stamps stay behind `updated`: a stale session id must not
    // overwrite a newer one, and the plan/add-ons must not move.
    assert.strictEqual(h.workspace().billingCheckoutSessionId, undefined);
    assert.strictEqual(h.workspace().billingStorageAddonStatus, "cancelled");
    assert.strictEqual(h.workspace().billingAdditionalTeamSeatStatus, "cancelled");
    const workspaceWrites = h.writes.slice(writesBefore).filter((write) => write.path === WORKSPACE_DOC);
    assert.deepStrictEqual(workspaceWrites.map((write) => write.fields), [["billingTrialUsedAt"]],
      "exactly one write reached the workspace, carrying only the stamp");
  })();
});

check("an existing trial stamp keeps its date through a stale and a current checkout", () => {
  const EARLIER = new FakeTimestamp(1_600_000_000_000);
  const h = harness({ retrieve: () => trialingSubscription(), workspace: { ...UNSTAMPED_WORKSPACE, billingTrialUsedAt: EARLIER } });
  return (async () => {
    await h.processStripeEvent(h.stripe, {
      id: "evt_kept_sub", type: "customer.subscription.updated", created: BASE_SEQ, data: { object: trialingSubscription() }
    });
    const before = h.state();
    const stale = await captureWarningsAsync(() => h.processStripeEvent(h.stripe, checkoutEvent("evt_kept_stale", BASE_SEQ - 500)));
    assert.strictEqual(stale.value.skipped, true);
    assert.strictEqual(stale.value.billingTrialUsedAtStamped, undefined, "a stale checkout claimed to stamp a trial that was already spent");
    assert.strictEqual(h.state(), before, "a stale checkout on a stamped workspace mutated something");
    assert.strictEqual(h.workspace().billingTrialUsedAt.toMillis(), EARLIER.toMillis());

    const current = await h.processStripeEvent(h.stripe, checkoutEvent("evt_kept_current", BASE_SEQ + 500));
    assert.strictEqual(current.updated, true, `the current checkout was refused: ${JSON.stringify(current)}`);
    assert.strictEqual(current.billingTrialUsedAtStamped, undefined);
    assert.strictEqual(h.workspace().billingCheckoutSessionId, "cs_evt_kept_current", "a current checkout still records its session");
    assert.strictEqual(h.workspace().billingTrialUsedAt.toMillis(), EARLIER.toMillis(), "a current checkout moved the date of an existing stamp");
  })();
});

check("a checkout whose subscription shows no trial writes no stamp, stale or current", () => {
  // The evidence is Stripe's record. An active subscription with no trial_end is
  // a paid start, not a trial, however the event arrived.
  const h = harness({ retrieve: () => dahliaSubscription({ status: "active", trial_end: null }), workspace: UNSTAMPED_WORKSPACE });
  return (async () => {
    await h.processStripeEvent(h.stripe, {
      id: "evt_paid_sub", type: "customer.subscription.updated", created: BASE_SEQ, data: { object: dahliaSubscription() }
    });
    const before = h.state();
    const stale = await captureWarningsAsync(() => h.processStripeEvent(h.stripe, checkoutEvent("evt_paid_stale", BASE_SEQ - 500)));
    assert.strictEqual(stale.value.skipped, true);
    assert.strictEqual(h.state(), before, "a stale checkout without a trial mutated persistent state");

    const current = await h.processStripeEvent(h.stripe, checkoutEvent("evt_paid_current", BASE_SEQ + 500));
    assert.strictEqual(current.updated, true);
    assert.strictEqual(h.workspace().billingCheckoutSessionId, "cs_evt_paid_current");
    assert.strictEqual(h.workspace().billingTrialUsedAt, undefined, "a trial was manufactured from a subscription that never had one");
  })();
});

check("two concurrent deliveries of a stale trial checkout write the stamp once, and a replay writes nothing", () => {
  // Stripe retries, and it retries concurrently. Two deliveries of the same
  // checkout — different event ids, both stale — must leave one stamp with one
  // date. The fake's transactions interleave and retry like Firestore's, so a
  // read-then-write here would produce two writes and fail this check.
  const h = harness({ retrieve: () => trialingSubscription(), workspace: UNSTAMPED_WORKSPACE });
  return (async () => {
    await h.processStripeEvent(h.stripe, {
      id: "evt_conc_sub", type: "customer.subscription.updated", created: BASE_SEQ, data: { object: trialingSubscription() }
    });
    const writesBefore = h.writes.length;
    const [first, second] = await captureWarningsAsync(() => Promise.all([
      h.processStripeEvent(h.stripe, checkoutEvent("evt_conc_a", BASE_SEQ - 500)),
      h.processStripeEvent(h.stripe, checkoutEvent("evt_conc_b", BASE_SEQ - 400))
    ])).then((captured) => captured.value);
    assert.strictEqual(first.skipped, true);
    assert.strictEqual(second.skipped, true);
    const stampWrites = h.writes.slice(writesBefore).filter((write) => write.path === WORKSPACE_DOC && write.fields.includes("billingTrialUsedAt"));
    assert.strictEqual(stampWrites.length, 1, `the stamp was written ${stampWrites.length} times`);
    assert.strictEqual([first, second].filter((result) => result.billingTrialUsedAtStamped === true).length, 1,
      "exactly one of the two deliveries may claim the stamp");
    const stamped = h.workspace().billingTrialUsedAt;
    assert.ok(stamped instanceof FakeTimestamp);

    // A third delivery of an event id already processed is refused by the dedupe
    // before any handler runs, and the stamp keeps its date.
    const replay = await h.processStripeEvent(h.stripe, checkoutEvent("evt_conc_a", BASE_SEQ - 500));
    assert.deepStrictEqual(replay, { duplicate: true });
    assert.strictEqual(h.workspace().billingTrialUsedAt.toMillis(), stamped.toMillis());
  })();
});

check("a cancellation followed by a new checkout does not hand out a second free trial", () => {
  // The leak end to end, through the real handlers. The trial is spent by a
  // STALE checkout — the one path d0c7f431 missed — the subscription is then
  // cancelled, which clears billingSubscriptionId (the guard's other arm), and
  // the workspace opens a fresh checkout. With the stamp in place the session
  // is created without trial_period_days. The control at the end removes the
  // stamp and shows the same checkout asking Stripe for fourteen free days —
  // which is what the guard reads, and what the leak would have allowed.
  //
  // The checkout handler builds its own Stripe client from the secret, so the
  // SDK's session-create method is replaced on the resource prototype for the
  // duration of this check and restored after; nothing leaves the process.
  const Stripe = require("stripe");
  const sessionsProto = Object.getPrototypeOf(new Stripe("sk_test_stub").checkout.sessions);
  const originalCreate = sessionsProto.create;
  const ENV = ["STRIPE_BILLING_ENABLED", "STRIPE_SECRET_KEY", "STRIPE_INTERNAL_TEST_BILLING_ENABLED", "STRIPE_INTERNAL_TEST_EMAILS", "STRIPE_PRICE_PRO_MONTHLY", "STRIPE_ALLOW_LIVE_BILLING"];
  const savedEnv = Object.fromEntries(ENV.map((key) => [key, process.env[key]]));
  const created = [];
  return (async () => {
    let canonical = trialingSubscription();
    let h;
    h = harness({
      retrieve: () => canonical,
      workspace: { ...UNSTAMPED_WORKSPACE, ownerUid: "owner_1" },
      requireWorkspaceForBilling: async () => ({
        uid: "owner_1", companyId: WORKSPACE,
        companyRef: h.db.collection("companies").doc(WORKSPACE),
        companyData: { ...h.workspace() }
      })
    });
    try {
      sessionsProto.create = async function create(payload) { created.push(payload); return { id: `cs_created_${created.length}`, url: "https://checkout.stripe.test/s" }; };
      Object.assign(process.env, {
        STRIPE_BILLING_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_stub",
        STRIPE_INTERNAL_TEST_BILLING_ENABLED: "true", STRIPE_INTERNAL_TEST_EMAILS: "owner@example.test",
        STRIPE_PRICE_PRO_MONTHLY: "price_test_pro"
      });
      delete process.env.STRIPE_ALLOW_LIVE_BILLING;
      const request = { data: { itemKey: "pro_monthly" }, auth: { token: { email: "owner@example.test" } } };

      // 1. The trial is spent by a stale checkout only.
      await h.processStripeEvent(h.stripe, { id: "evt_resub_sub", type: "customer.subscription.updated", created: BASE_SEQ, data: { object: trialingSubscription() } });
      const stale = await captureWarningsAsync(() => h.processStripeEvent(h.stripe, checkoutEvent("evt_resub_stale", BASE_SEQ - 500)));
      assert.strictEqual(stale.value.billingTrialUsedAtStamped, true);

      // 2. Cancellation: the plan falls back and billingSubscriptionId is cleared.
      canonical = dahliaSubscription({ status: "canceled", trial_end: TRIAL_END });
      const deleted = await h.processStripeEvent(h.stripe, { id: "evt_resub_deleted", type: "customer.subscription.deleted", created: BASE_SEQ + 500, data: { object: canonical } });
      assert.strictEqual(deleted.updated, true, `the cancellation was refused: ${JSON.stringify(deleted)}`);
      assert.strictEqual(h.workspace().billingPlan, "demo");
      assert.strictEqual(h.workspace().billingSubscriptionId, "", "cancellation no longer clears billingSubscriptionId; the guard's second arm would mask this check");
      assert.ok(h.workspace().billingTrialUsedAt instanceof FakeTimestamp, "the stamp did not survive the cancellation");

      // 3. A new checkout: no second trial.
      const response = await h.createStripeCheckoutSession(request);
      assert.strictEqual(response.configured, true, `checkout refused: ${JSON.stringify(response)}`);
      assert.strictEqual(created.length, 1);
      assert.strictEqual(created[0].mode, "subscription");
      assert.strictEqual(created[0].subscription_data.trial_period_days, undefined, "a second free trial was offered");
      assert.strictEqual(created[0].payment_method_collection, undefined, "a card-free start was offered without a trial");

      // 4. Control: with the stamp gone, the same checkout asks for fourteen free
      //    days — the stamp is exactly what stands between a cancellation and a
      //    second trial.
      const doc = h.store.get(WORKSPACE_DOC);
      delete doc.billingTrialUsedAt;
      const leaked = await h.createStripeCheckoutSession(request);
      assert.strictEqual(leaked.configured, true);
      assert.strictEqual(created.length, 2);
      assert.strictEqual(created[1].subscription_data.trial_period_days, 14, "the control did not reproduce the leak; the check proves nothing");
    } finally {
      sessionsProto.create = originalCreate;
      for (const key of ENV) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
      }
    }
  })();
});

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
    // The event time is part of the dispatch, not an extra: a rail that writes
    // the ledger row without it leaves the row's ordering guard disarmed.
    assert.ok(body.includes(`${handler}(stripe, object, eventCreatedMs)`),
      `${eventType} no longer reaches ${handler} with the event time`);
  }
  assert.ok(/applySubscription\(object, event\.type, eventCreatedMs, \{ stripe \}\)/.test(body),
    "customer.subscription.* no longer reaches applySubscription with the client it re-reads Stripe through");
  assert.ok(/const eventCreatedMs = Number\(event\.created \|\| 0\) \* 1000;/.test(body),
    "the event time the rails are handed is no longer the event's own created time");
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

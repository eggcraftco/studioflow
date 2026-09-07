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
// These drive the shipped functions out of stripeBilling.js, and then assert
// that the three call sites in that same file actually go through them.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  stripeSubscriptionIdFromInvoice,
  stripeCurrentPeriodEndUnix
} = require("../../stripeBilling");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

const EXPECTED_CHECKS = 18;

const SUB = "sub_1PdahliaRenewal";

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

check("a genuine one-off invoice still has no subscription", () => {
  // This is the outcome the skip exists for. It must survive the fix — the bug
  // was that it fired for everything, not that it existed.
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
  assert.strictEqual(stripeSubscriptionIdFromInvoice({
    parent: { subscription_details: { subscription: "   " } }
  }), "");
  assert.strictEqual(stripeSubscriptionIdFromInvoice({
    parent: { subscription_details: { subscription: "  " + SUB + " " } }
  }), SUB);
});

// ---- the period end -------------------------------------------------------

const PERIOD_END = 1_790_000_000;

check("a dahlia subscription takes its period end from the items", () => {
  assert.strictEqual(stripeCurrentPeriodEndUnix({
    id: SUB,
    items: { object: "list", data: [{ id: "si_1", quantity: 1, current_period_start: PERIOD_END - 2_592_000, current_period_end: PERIOD_END }] }
  }), PERIOD_END);
});

check("the earliest item end wins when a subscription has several", () => {
  // Stripe defines the subscription-level value the same way (its list filter
  // is documented as "minimum item current_period_end"), and this date extends
  // paid access, so the latest end would entitle a workspace past what it paid.
  assert.strictEqual(stripeCurrentPeriodEndUnix({
    items: { data: [
      { current_period_end: PERIOD_END + 86_400 },
      { current_period_end: PERIOD_END },
      { current_period_end: PERIOD_END + 1 }
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
  for (const subscription of [
    null, undefined, "", 42, [],
    {},
    { items: null },
    { items: {} },
    { items: { data: null } },
    { items: { data: [] } },
    { items: { data: [null, undefined, {}, { current_period_end: 0 }, { current_period_end: -5 }, { current_period_end: "soon" }] } },
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

// ---- the wiring -----------------------------------------------------------
// Everything above is a pure function. These checks are what tie it to the
// handlers that actually run, so the resolver cannot be correct and unused.
const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "stripeBilling.js"), "utf8");

function block(marker, length = 1200) {
  const at = SOURCE.indexOf(marker);
  assert.ok(at > 0, `${marker} is where it was`);
  return SOURCE.slice(at, at + length);
}

check("applyInvoicePaid resolves the id through the shared reader, and still skips a one-off", () => {
  const body = block("async function applyInvoicePaid(");
  const read = body.indexOf("stripeSubscriptionIdFromInvoice(invoice)");
  const skip = body.indexOf('reason: "invoice_without_subscription"');
  const retrieve = body.indexOf("stripe.subscriptions.retrieve(");
  assert.ok(read > 0, "applyInvoicePaid does not use the shared reader");
  assert.ok(skip > read, "the one-off invoice skip is gone");
  assert.ok(retrieve > skip, "the subscription is fetched before the id is checked");
});

check("applyInvoicePaymentFailed resolves the id through the same reader", () => {
  // A fix that patched only invoice.paid would leave dunning broken: no id
  // means applySubscription is never called and past_due never lands.
  const body = block("async function applyInvoicePaymentFailed(", 2000);
  const read = body.indexOf("stripeSubscriptionIdFromInvoice(invoice)");
  const apply = body.indexOf('applySubscription(subscription, "invoice.payment_failed")');
  assert.ok(read > 0, "applyInvoicePaymentFailed does not use the shared reader");
  assert.ok(apply > read, "the failed invoice no longer re-applies the subscription");
});

check("applySubscription takes the period end from the items", () => {
  const body = block("async function applySubscription(");
  assert.ok(/timestampFromUnix\(stripeCurrentPeriodEndUnix\(subscription\)\)/.test(body),
    "the single choke point for every Stripe ledger row still reads the removed field");
});

check("no handler is left reading a field the pinned API no longer sends", () => {
  // Scoped to the factory: the two resolvers below it keep the legacy reads on
  // purpose, as their fallback.
  const start = SOURCE.indexOf("function createStripeBillingFunctions(");
  const end = SOURCE.indexOf("function stripeReferenceId(");
  assert.ok(start > 0 && end > start, "the file no longer has the shape this check assumes");
  // Comments stripped: the resolvers are named in prose above the call sites.
  const factory = SOURCE.slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.ok(!/invoice\.subscription\b/.test(factory), "a handler still reads the removed invoice.subscription");
  assert.ok(!/subscription\.current_period_end\b/.test(factory), "a handler still reads the removed subscription.current_period_end");
});

check("the checkout session's own subscription field is left alone", () => {
  // Checkout.Session.subscription was NOT removed — Sessions.d.ts still
  // declares `subscription: string | Subscription | null`. "Fixing" it would
  // break the one invoice-adjacent read that was never broken.
  const body = block("async function applyCompletedSubscriptionCheckout(");
  assert.ok(/session\.subscription/.test(body), "the checkout session read was changed for no reason");
  const types = path.join(__dirname, "..", "..", "node_modules", "stripe", "cjs", "resources", "Checkout", "Sessions.d.ts");
  if (fs.existsSync(types)) {
    assert.ok(/^ {4}subscription: string \| Subscription \| null;$/m.test(fs.readFileSync(types, "utf8")),
      "the pinned SDK no longer declares Checkout.Session.subscription — this read now needs the same treatment");
  }
});

check("the suite still has every check it was written with", () => {
  // Deleting a check must fail, not quietly print a smaller number.
  assert.strictEqual(checks.length, EXPECTED_CHECKS,
    `expected ${EXPECTED_CHECKS} checks, found ${checks.length}`);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log(`\n✅ STRIPE INVOICE API DRIFT GEÇTİ (${checks.length} kontrol)`);
})();

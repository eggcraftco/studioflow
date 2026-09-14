// PR-P0 — the Stripe Connect payment rail's contract, before any of it is built.
//
// Everything under test is a pure module in functions/payments/. Nothing here
// opens a socket, reads Firestore or needs a secret: the point of PR-P0 is that
// the decisions which cost money — which account an event belongs to, what a
// payment is worth in minor units, who may ask a customer for money, and what
// ten deliveries of one event add up to — are settled and provable before a
// single live call exists.
//
// Run: node test/qa/payments-connect-contract.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const money = require("../../payments/money");
const connection = require("../../payments/connectionState");
const request = require("../../payments/paymentRequestState");
const boundary = require("../../payments/eventBoundary");
const permissions = require("../../payments/permissions");

let checks = 0;
function pass(name) { checks += 1; console.log("PASS ", name); }

// ---------------------------------------------------------------------------
// 1. Money. Minor units, integers, and the two ways a currency can cost 100x.
// ---------------------------------------------------------------------------
{
  assert.deepStrictEqual(money.toMinorUnits("19.99", "GBP"), { ok: true, amountMinor: 1999, reason: "" });
  assert.deepStrictEqual(money.toMinorUnits("10.50", "GBP"), { ok: true, amountMinor: 1050, reason: "" });
  assert.deepStrictEqual(money.toMinorUnits("1,099.00", "USD"), { ok: true, amountMinor: 109900, reason: "" });
  assert.strictEqual(money.fromMinorUnits(1050, "GBP"), "10.50");
  pass("two-decimal money round-trips through minor units");
}

{
  // The zero-decimal case. 500 JPY is amount 500, not 50000.
  assert.deepStrictEqual(money.toMinorUnits("500", "JPY"), { ok: true, amountMinor: 500, reason: "" });
  assert.strictEqual(money.fromMinorUnits(500, "JPY"), "500");
  // And the commerce envelope's fixed-scale helper would have said 50000 here,
  // which is why this rail has its own module.
  const commerceMoney = require("../../commerce/money");
  assert.strictEqual(commerceMoney.toMinorUnits("500"), 50000);
  pass("JPY is zero-decimal here and would be 100x through commerce/money.js");
}

{
  // A workspace stores a SYMBOL, and two of the nine do not name one currency.
  assert.strictEqual(money.symbolToCurrency("£").currency, "GBP");
  const yen = money.symbolToCurrency("¥");
  assert.strictEqual(yen.ok, false);
  assert.strictEqual(yen.reason, "ambiguous_symbol");
  assert.deepStrictEqual(yen.candidates, ["JPY", "CNY"]);
  const dollar = money.symbolToCurrency("$");
  assert.strictEqual(dollar.ok, false, "a bare dollar sign is not a currency");
  pass("an ambiguous currency symbol is refused, never guessed");
}

{
  // Every symbol the workspace settings actually offer has an entry, so a
  // workspace can never reach the rail through a symbol nobody mapped.
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
  const line = source.split("\n").find((row) => row.includes("const FINANCIAL_CURRENCY_SYMBOLS"));
  assert(line, "the workspace currency symbol list still exists");
  const symbols = (line.match(/"([^"]+)"/g) || []).map((token) => token.slice(1, -1));
  assert(symbols.length >= 9, `expected the nine workspace symbols, saw ${symbols.length}`);
  for (const symbol of symbols) {
    assert(
      Object.prototype.hasOwnProperty.call(money.SYMBOL_TO_CURRENCIES, symbol),
      `workspace currency symbol ${symbol} has no entry in SYMBOL_TO_CURRENCIES`
    );
  }
  pass("every workspace currency symbol is accounted for");
}

{
  assert.strictEqual(money.toMinorUnits("10.999", "GBP").reason, "too_many_decimals");
  assert.strictEqual(money.toMinorUnits("19.99", "JPY").reason, "too_many_decimals");
  assert.strictEqual(money.toMinorUnits("abc", "GBP").reason, "not_a_number");
  assert.strictEqual(money.toMinorUnits("10.00", "ZZZ").reason, "unsupported_currency");
  assert.strictEqual(money.isChargeableAmount(0, "GBP").reason, "not_positive");
  assert.strictEqual(money.isChargeableAmount(-100, "GBP").reason, "not_positive");
  assert.strictEqual(money.isChargeableAmount(1999.5, "GBP").reason, "not_an_integer");
  pass("an amount that cannot be charged is refused with a reason");
}

{
  // The float trap this module exists to avoid: 19.99 * 100 is not 1999.
  assert.notStrictEqual(19.99 * 100, 1999);
  assert.strictEqual(money.toMinorUnits("19.99", "GBP").amountMinor, 1999);
  // A hundred prices, all exact.
  for (let pence = 1; pence <= 100; pence += 1) {
    const text = (pence / 100).toFixed(2);
    assert.strictEqual(money.toMinorUnits(text, "GBP").amountMinor, pence, `${text} -> ${pence}`);
  }
  pass("minor units come from the text, not from multiplying a float");
}

// ---------------------------------------------------------------------------
// 2. The connection. Derived from Stripe, never stored as an opinion.
// ---------------------------------------------------------------------------
{
  assert.strictEqual(connection.deriveStatus({ chargesEnabled: true, detailsSubmitted: true }), "ready");
  assert.strictEqual(connection.deriveStatus({ chargesEnabled: false, detailsSubmitted: false }), "onboarding");
  assert.strictEqual(connection.deriveStatus({ chargesEnabled: false, detailsSubmitted: true }), "onboarding");
  assert.strictEqual(connection.deriveStatus(null), "disconnected");
  assert.strictEqual(connection.deriveStatus({ missing: true }), "disconnected");
  pass("connection status is derived from the account snapshot");
}

{
  // A disabled reason outranks an enabled flag. Stripe can report both.
  assert.strictEqual(
    connection.deriveStatus({ chargesEnabled: true, requirements: { disabledReason: "requirements.past_due" } }),
    "restricted"
  );
  assert.strictEqual(
    connection.deriveStatus({ chargesEnabled: true, requirements: { pastDue: ["individual.id_number"] } }),
    "restricted"
  );
  pass("a restriction outranks charges_enabled");
}

{
  // Charges work, payouts do not: the workspace keeps trading.
  const status = connection.deriveStatus({ chargesEnabled: true, payoutsEnabled: false, detailsSubmitted: true });
  assert.strictEqual(status, "ready");
  assert.strictEqual(connection.capabilitiesFor(status).canCreatePaymentRequest, true);
  pass("a missing payout account does not stop a workspace taking payments");
}

{
  // Only `ready` opens a new link; a restricted account keeps collecting on the
  // links its customers already hold.
  assert.strictEqual(connection.capabilitiesFor("restricted").canCreatePaymentRequest, false);
  assert.strictEqual(connection.capabilitiesFor("restricted").canCollectOnExistingLink, true);
  assert.strictEqual(connection.capabilitiesFor("disconnected").canCollectOnExistingLink, false);
  pass("only a ready connection may open a new payment request");
}

{
  // A client never learns the account id.
  const summary = connection.publicSummary({
    status: "ready",
    stripeAccountId: "acct_secret",
    mode: "test",
    requirementsSummary: { currentlyDue: ["individual.verification.document"] }
  });
  const serialized = JSON.stringify(summary);
  assert(!serialized.includes("acct_secret"), "the connected account id must never reach a client");
  assert(!Object.prototype.hasOwnProperty.call(summary, "stripeAccountId"));
  assert.strictEqual(summary.requirementsSummary.currentlyDueCount, 1);
  pass("the client summary carries no account id");
}

{
  assert.strictEqual(connection.canTransition("disconnected", "ready"), false, "no jump straight to ready");
  assert.strictEqual(connection.canTransition("disconnected", "onboarding"), true);
  assert.strictEqual(connection.canTransition("ready", "restricted"), true);
  assert.strictEqual(connection.canTransition("ready", "disconnected"), true);
  assert.strictEqual(connection.canTransition("ready", "banana"), false);
  pass("connection transitions are an allowlist");
}

// ---------------------------------------------------------------------------
// 3. The payment request. Ten deliveries, one result; late events stay late.
// ---------------------------------------------------------------------------
{
  const open = request.emptyState({ publicStatus: "open", amountMinor: 1999 });
  const event = { id: "evt_1", type: "checkout.session.completed", sequence: 1000, amountMinor: 1999 };
  let state = open;
  for (let i = 0; i < 10; i += 1) state = request.apply(state, event).state;
  assert.strictEqual(state.publicStatus, "paid");
  assert.strictEqual(state.paidAmountMinor, 1999);
  assert.strictEqual(state.appliedEventIds.filter((id) => id === "evt_1").length, 1);
  pass("ten deliveries of one event produce one business result");
}

{
  // The pair Stripe sends for one Checkout payment must not be two payments.
  const session = { type: "checkout.session.completed", data: { object: { payment_intent: "pi_9" } } };
  const intent = { type: "payment_intent.succeeded", data: { object: { id: "pi_9" } } };
  assert.strictEqual(boundary.externalPaymentId(session), boundary.externalPaymentId(intent));
  assert.strictEqual(boundary.externalPaymentId(session), "pi:pi_9");
  pass("Checkout and PaymentIntent resolve to one external payment identity");
}

{
  // A REFUND'S IDENTITY, FROM THE SHAPE STRIPE ACTUALLY SENDS.
  //
  // `charge.refunded` delivers the CHARGE, and a charge lists its refunds under
  // `refunds.data[]`, newest first. There is no top-level `refund_id` on it —
  // that key was this rail's own invention, and because every fixture in this
  // repository fed it, all 85 payment checks passed while a real refund resolved
  // to "" and was dropped at `no_payment_identity`: the money never reaching the
  // ledger and `refundedAmount` never moving. A test written against the
  // invented shape certifies the invention, which is why this one is written
  // against the provider's.
  const charge = (refunds, extra = {}) => ({
    type: "charge.refunded",
    data: { object: { id: "ch_abc", object: "charge", payment_intent: "pi_1", currency: "gbp",
      amount: 100000, amount_refunded: 20000, refunded: false,
      refunds: { object: "list", data: refunds }, ...extra } }
  });

  assert.strictEqual(
    boundary.externalPaymentId(charge([{ id: "re_new", object: "refund", amount: 20000, charge: "ch_abc" }])),
    "refund:re_new",
    "the real payload's nested refund is the identity"
  );

  // A charge refunded twice re-delivers with BOTH listed, newest first: this
  // delivery is about the new one, and it earns its own ledger row.
  assert.strictEqual(
    boundary.externalPaymentId(charge([{ id: "re_second", amount: 15000 }, { id: "re_new", amount: 20000 }])),
    "refund:re_second",
    "a second refund is not collapsed onto the first"
  );

  // Nothing to identify is answered with nothing, never a guess — keying the row
  // on the charge would merge two refunds into one.
  assert.strictEqual(boundary.externalPaymentId(charge([])), "", "an empty refunds list yields no identity");

  // The hand-built legacy shape still resolves, so the existing race fixtures
  // and any replayed older payload keep their money.
  assert.strictEqual(
    boundary.externalPaymentId({ type: "charge.refunded", data: { object: { refund_id: "re_legacy" } } }),
    "refund:re_legacy",
    "the legacy key is still honoured"
  );
  pass("a refund's identity comes from refunds.data[], the shape Stripe actually sends");
}

{
  // NOTHING TO IDENTIFY IS ANSWERED WITH NOTHING — in every shape a charge can
  // arrive in without a readable refund.
  //
  // `refunds` is an EXPANDABLE list. Stripe does not always send it expanded,
  // an older replayed payload may not carry it at all, and a malformed one is
  // whatever the sender chose. None of these can be guessed, because both
  // available guesses are catastrophic: the charge id merges every refund of
  // that charge into one row, and the payment intent collides with the row that
  // already holds the PAYMENT — where `create()` would throw already-exists and
  // the refund would vanish as a duplicate.
  const charge = (object) => ({
    type: "charge.refunded",
    data: { object: { id: "ch_abc", object: "charge", payment_intent: "pi_1", amount: 100000, amount_refunded: 20000, ...object } }
  });
  for (const [name, object] of [
    ["refunds absent entirely", {}],
    ["refunds.data empty", { refunds: { object: "list", data: [] } }],
    ["refunds is null", { refunds: null }],
    ["refunds is a string", { refunds: "re_1" }],
    ["refunds is an array", { refunds: ["re_1"] }],
    ["refunds.data is not an array", { refunds: { object: "list", data: "re_1" } }],
    ["refunds.data holds a hole", { refunds: { object: "list", data: [null] } }],
    ["refunds.data holds a refund with no id", { refunds: { object: "list", data: [{ object: "refund", amount: 20000 }] } }]
  ]) {
    assert.strictEqual(boundary.externalPaymentId(charge(object)), "", `${name}: must yield no identity`);
  }
  assert.notStrictEqual(
    boundary.externalPaymentId(charge({})), "pi:pi_1",
    "and never the payment it refunds — that identity already holds the PAYMENT's ledger row"
  );
  pass("every unreadable refunds list yields no identity, never the charge and never the payment");
}

{
  // PAGINATION AND ORDER.
  //
  // `refunds` is a Stripe LIST object: it carries `has_more`, and a charge with
  // more refunds than the page holds is truncated. Stripe orders lists newest
  // first, so `has_more: true` means the OLDER tail was cut and the newest
  // refund is still in the page — under that convention, reading position 0 is
  // correct and `has_more` changes nothing.
  //
  // That convention is the ONLY thing holding the answer up, and this rail has
  // never seen a captured live payload to confirm it. A page that arrived the
  // other way round would file every later refund under the FIRST refund's id:
  // one row reused, `create()` refusing it as already-exists, and the second
  // refund's money never reaching the ledger — the same silent loss e5d84009
  // fixed, from a different direction. So the pick is made from the DATA and
  // not from the position: the greatest `created` wins.
  const page = (data, has_more = false) => ({
    type: "charge.refunded",
    data: { object: { id: "ch_abc", object: "charge", refunds: { object: "list", has_more, data } } }
  });
  const newest = { id: "re_new", object: "refund", created: 1_757_000_400 };
  const oldest = { id: "re_old", object: "refund", created: 1_757_000_300 };

  assert.strictEqual(boundary.externalPaymentId(page([newest, oldest], true)), "refund:re_new",
    "newest first with an older tail truncated: the newest is the identity");
  assert.strictEqual(boundary.externalPaymentId(page([oldest, newest], true)), "refund:re_new",
    "and the same answer when the page arrives oldest first");
  // Stripe stamps whole seconds, so two real refunds can share one. A tie has
  // no signal in it, and list order — Stripe's newest-first — decides.
  assert.strictEqual(
    boundary.externalPaymentId(page([{ id: "re_a", created: 1_757_000_400 }, { id: "re_b", created: 1_757_000_400 }])),
    "refund:re_a", "refunds stamped in the same second keep the list's order"
  );
  // A hand-built payload with no `created` anywhere is read in list order too.
  assert.strictEqual(boundary.externalPaymentId(page([{ id: "re_a" }, { id: "re_b" }])), "refund:re_a");
  pass("the newest refund is chosen by created, so a truncated or reordered page cannot pick the wrong one");
}

{
  // THE CONNECTED RAIL'S OWN LIVEMODE REFUSAL.
  //
  // platformEventAdmissible has refused a livemode mismatch on the subscription
  // rail since PR-P0 ("a test-mode deployment handed a live event is looking at
  // another environment's money"). The connected rail carries the same risk and
  // worse — these events move a workspace's own money — and had no such check.
  const live = { type: "charge.refunded", account: "acct_known", livemode: true };
  const test = { type: "charge.refunded", account: "acct_known", livemode: false };
  assert.deepStrictEqual(boundary.connectedEventAdmissible(live, { expectLivemode: false }), { admissible: false, reason: "livemode_mismatch" });
  assert.deepStrictEqual(boundary.connectedEventAdmissible(live, { expectLivemode: true }), { admissible: true, reason: "" });
  assert.strictEqual(boundary.connectedEventAdmissible(test, { expectLivemode: true }).reason, "livemode_mismatch");
  assert.strictEqual(boundary.connectedEventAdmissible(test, { expectLivemode: false }).admissible, true);
  // A payload that does not state its livemode says nothing, and a field that
  // says nothing must not drop a workspace's money. Same rule as the platform
  // rail, which treats an absent livemode as admissible.
  assert.strictEqual(boundary.connectedEventAdmissible({ type: "charge.refunded" }, { expectLivemode: true }).admissible, true);
  pass("the connected rail refuses an event from the other livemode");
}

{
  // A late event may be recorded but must not move the state backwards.
  let state = request.emptyState({ publicStatus: "open", amountMinor: 1999 });
  state = request.apply(state, { id: "e_paid", type: "payment_intent.succeeded", sequence: 2000, amountMinor: 1999 }).state;
  const late = request.apply(state, { id: "e_late", type: "payment_intent.processing", sequence: 1000 });
  assert.strictEqual(late.reason, "stale_event_recorded_only");
  assert.strictEqual(late.state.publicStatus, "paid");
  assert.strictEqual(late.state.lastEventSequence, 2000, "the newest sequence survives");
  pass("an older event never pulls a newer state backwards");
}

{
  // A failure after payment cannot reopen a closed request.
  let state = request.emptyState({ publicStatus: "open", amountMinor: 1999 });
  state = request.apply(state, { id: "a", type: "checkout.session.completed", sequence: 10, amountMinor: 1999 }).state;
  const failed = request.apply(state, { id: "b", type: "payment_intent.payment_failed", sequence: 20 });
  assert.strictEqual(failed.state.publicStatus, "paid");
  assert.strictEqual(failed.reason, "closed_status_kept");
  pass("a paid request is not reopened by a later failure");
}

{
  // Partial then full refund, with Stripe's cumulative refunded total.
  let state = request.emptyState({ publicStatus: "open", amountMinor: 1999 });
  state = request.apply(state, { id: "p", type: "checkout.session.completed", sequence: 10, amountMinor: 1999 }).state;
  const partial = request.apply(state, { id: "r1", type: "charge.refunded", sequence: 20, refundedTotalMinor: 500 });
  assert.strictEqual(partial.state.publicStatus, "partially_refunded");
  const full = request.apply(partial.state, { id: "r2", type: "charge.refunded", sequence: 30, refundedTotalMinor: 1999 });
  assert.strictEqual(full.state.publicStatus, "refunded");
  assert.strictEqual(full.state.refundedAmountMinor, 1999);
  pass("a cumulative refund total drives partial then full refund");
}

{
  // The refund that overtakes its payment: we wait, we do not invent a payment.
  const state = request.emptyState({ publicStatus: "open", amountMinor: 1999 });
  const early = request.apply(state, { id: "r0", type: "charge.refunded", sequence: 5, refundedTotalMinor: 1999 });
  assert.strictEqual(early.reason, "refund_before_payment_awaiting_reconciliation");
  assert.strictEqual(early.state.publicStatus, "open", "no paid state is invented to refund from");
  assert.strictEqual(early.state.refundedAmountMinor, 1999, "but the money fact is kept");
  pass("a refund delivered before its payment waits for reconciliation");
}

{
  // At most one ledger row per event, and only when money actually moved.
  const before = request.emptyState({ publicStatus: "open", amountMinor: 1999 });
  const paidEvent = { id: "x", type: "checkout.session.completed", sequence: 10, amountMinor: 1999 };
  const after = request.apply(before, paidEvent).state;
  assert.deepStrictEqual(request.ledgerRowFor(before, after, paidEvent), { type: "payment", amountMinor: 1999 });
  // The PaymentIntent twin of the same payment adds nothing.
  const twin = { id: "y", type: "payment_intent.succeeded", sequence: 11, amountMinor: 1999 };
  const afterTwin = request.apply(after, twin).state;
  assert.strictEqual(request.ledgerRowFor(after, afterTwin, twin), null);
  pass("the second event of one payment writes no second ledger row");
}

{
  const success = request.STATUSES.includes("paid");
  assert(success);
  // There is no event in the table that a browser redirect could produce: the
  // only routes to `paid` are provider events. A success URL is not one.
  const payingEvents = Object.entries(request.EVENT_INTENT).filter(([, intent]) => intent === "paid").map(([type]) => type);
  assert.deepStrictEqual(payingEvents.sort(), [
    "checkout.session.async_payment_succeeded",
    "checkout.session.completed",
    "payment_intent.succeeded"
  ]);
  pass("only a provider event can mark a request paid");
}

// ---------------------------------------------------------------------------
// 4. The boundary. NivaDesk's own subscriptions vs a workspace's takings.
// ---------------------------------------------------------------------------
{
  const resolve = (accountId) => (accountId === "acct_known" ? "company-1" : "");
  const platform = boundary.routeEvent({ type: "checkout.session.completed" }, resolve);
  assert.strictEqual(platform.rail, boundary.RAIL_PLATFORM);
  assert.strictEqual(platform.accepted, true);

  const connected = boundary.routeEvent({ type: "checkout.session.completed", account: "acct_known" }, resolve);
  assert.strictEqual(connected.rail, boundary.RAIL_CONNECTED);
  assert.strictEqual(connected.companyId, "company-1");
  pass("one event type routes to two different rails by event.account");
}

{
  // The failure this module exists for: an unknown connected account must not
  // fall through to the subscription rail.
  const stray = boundary.routeEvent({ type: "checkout.session.completed", account: "acct_stranger" }, () => "");
  assert.strictEqual(stray.accepted, false);
  assert.strictEqual(stray.reason, "unknown_connected_account");
  assert.notStrictEqual(stray.rail, boundary.RAIL_PLATFORM, "never handled as a NivaDesk subscription");
  pass("an unknown connected account is refused, not treated as a subscription");
}

{
  // The event ledger key keeps two accounts' event ids apart.
  assert.strictEqual(boundary.eventLedgerId("stripe", "acct_a", "evt_1"), "stripe:acct_a:evt_1");
  assert.strictEqual(boundary.eventLedgerId("stripe", "", "evt_1"), "stripe:_platform:evt_1");
  assert.notStrictEqual(
    boundary.eventLedgerId("stripe", "acct_a", "evt_1"),
    boundary.eventLedgerId("stripe", "acct_b", "evt_1")
  );
  pass("the provider event ledger is keyed by account as well as event id");
}

{
  // What the existing subscription webhook dispatches on, read from the live
  // source. If someone adds an event there and not here, the boundary would
  // silently drop it as unhandled — so this drifts loudly instead.
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "stripeBilling.js"), "utf8");
  const start = source.indexOf("async function processStripeEvent(");
  assert(start > 0, "processStripeEvent still exists");
  const block = source.slice(start, source.indexOf("const resyncStripeWorkspaceEntitlements", start));
  const dispatched = new Set((block.match(/event\.type === "([a-z_.]+)"/g) || [])
    .map((token) => token.replace(/^event\.type === "/, "").replace(/"$/, "")));
  assert(dispatched.size > 0, "the subscription webhook still dispatches on event.type");
  for (const type of dispatched) {
    assert(
      boundary.PLATFORM_EVENT_TYPES.includes(type),
      `${type} is handled by the subscription webhook but missing from PLATFORM_EVENT_TYPES`
    );
  }
  pass(`the platform rail lists all ${dispatched.size} events the subscription webhook handles`);
}

{
  // The subscription rail refuses connected-account events ITSELF, and does so
  // before any applier runs. Two endpoints and two signing secrets should make
  // such an event impossible here; this is the third layer, because the first
  // two are configuration and configuration is what gets pasted wrong.
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "stripeBilling.js"), "utf8");
  const start = source.indexOf("async function processStripeEvent(");
  assert(start > 0, "processStripeEvent still exists");
  const block = source.slice(start, source.indexOf("const resyncStripeWorkspaceEntitlements", start));

  const guardAt = block.indexOf("platformEventAdmissible");
  assert(guardAt > 0, "processStripeEvent calls the rail guard");
  // Before every applier, not merely somewhere in the function.
  for (const applier of ["applyCompletedSubscriptionCheckout(", "applySubscription(", "applyInvoicePaid(", "applyInvoicePaymentFailed("]) {
    const at = block.indexOf(applier);
    assert(at > guardAt, `the rail guard must run before ${applier}`);
  }
  // And the account is recorded, so a row can answer "was this a platform
  // event?" after the fact — the question an incident would ask.
  assert(/connectedAccountId: String\(event\.account/.test(source), "eventSummary records the connected account id");
  pass("the subscription rail refuses connected-account events before any applier");
}

{
  // The event has to agree with what we asked for, in every dimension.
  const req = { paymentRequestId: "pr_1", companyId: "company-1", currency: "GBP", amountMinor: 1999, connectedAccountId: "acct_known" };
  const good = {
    account: "acct_known",
    data: { object: { amount_total: 1999, currency: "gbp", metadata: { paymentRequestId: "pr_1", companyId: "company-1" } } }
  };
  assert.deepStrictEqual(boundary.matchesRequest(good, req), { ok: true, problems: [] });

  const wrongAmount = JSON.parse(JSON.stringify(good));
  wrongAmount.data.object.amount_total = 199;
  assert.deepStrictEqual(boundary.matchesRequest(wrongAmount, req).problems, ["amount_mismatch"]);

  const wrongWorkspace = JSON.parse(JSON.stringify(good));
  wrongWorkspace.data.object.metadata.companyId = "company-2";
  assert(boundary.matchesRequest(wrongWorkspace, req).problems.includes("workspace_mismatch"));

  const wrongAccount = JSON.parse(JSON.stringify(good));
  wrongAccount.account = "acct_other";
  assert(boundary.matchesRequest(wrongAccount, req).problems.includes("account_mismatch"));
  pass("amount, currency, workspace and account must all agree with the request");
}

// ---------------------------------------------------------------------------
// 5. Permissions. The existing role contract, and the reassignment rule.
// ---------------------------------------------------------------------------
{
  assert.strictEqual(permissions.can("connect", { role: "owner" }, {}).allowed, true);
  for (const r of ["admin", "member", "workflowOnly", "viewOnly"]) {
    const decision = permissions.can("connect", { role: r, financialInfo: true }, {});
    assert.strictEqual(decision.allowed, false, `${r} must not connect Stripe`);
    assert.strictEqual(decision.reason, "owner_only");
  }
  pass("only the owner connects or disconnects Stripe");
}

{
  // The reassignment rule: authority follows the order as it is NOW.
  const actor = { uid: "u1", role: "member", financialInfo: true, assignedProjectsOnly: true };
  assert.strictEqual(permissions.can("createRequest", actor, { assignedToUid: "u1" }).allowed, true);
  const reassigned = permissions.can("createRequest", actor, { assignedToUid: "u2" });
  assert.strictEqual(reassigned.allowed, false);
  assert.strictEqual(reassigned.reason, "not_assigned_to_you");
  assert.strictEqual(permissions.can("viewAmounts", actor, { assignedToUid: "u2" }).allowed, false);
  assert.strictEqual(permissions.can("cancelRequest", actor, { assignedToUid: "u2" }).allowed, false);
  pass("an assigned-only member loses the link when the order is reassigned");
}

{
  // Money visibility gates asking for money.
  const blind = { uid: "u3", role: "member", financialInfo: false };
  assert.strictEqual(permissions.can("createRequest", blind, {}).reason, "needs_financial_info");
  assert.strictEqual(permissions.can("viewAmounts", blind, {}).reason, "needs_financial_info");
  assert.strictEqual(permissions.can("createRequest", { uid: "u4", role: "viewOnly" }, {}).reason, "read_only_role");
  pass("financialInfo gates creating a link and seeing the amount");
}

{
  // Refunds are their own authority.
  assert.strictEqual(permissions.can("refund", { role: "owner" }, {}).allowed, true);
  assert.strictEqual(permissions.can("refund", { role: "admin" }, {}).reason, "needs_refund_permission");
  assert.strictEqual(permissions.can("refund", { role: "admin", refundApproved: true }, {}).allowed, true);
  for (const r of ["member", "workflowOnly", "viewOnly"]) {
    const decision = permissions.can("refund", { role: r, financialInfo: true, refundApproved: true }, {});
    assert.strictEqual(decision.allowed, false, `${r} must not start a refund`);
  }
  pass("a refund needs the owner or an explicitly approved admin");
}

{
  // Everyone in the workspace may learn whether payments work at all.
  assert.strictEqual(permissions.can("viewConnection", { role: "workflowOnly" }, {}).allowed, true);
  assert.strictEqual(permissions.can("viewConnection", { role: "workflowOnly" }, {}).reason, "limited_summary");
  assert.strictEqual(permissions.can("viewConnection", { role: "unknown" }, {}).allowed, false);
  assert.strictEqual(permissions.can("nonsense", { role: "owner" }, {}).reason, "unknown_action");
  pass("connection visibility is workspace-wide; an unknown role or action is refused");
}

console.log(`\nAll ${checks} PR-P0 payment contract checks passed.`);

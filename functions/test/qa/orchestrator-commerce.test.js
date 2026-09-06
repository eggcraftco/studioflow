// The cross-channel order search, against the rules that decide whether a
// number is true (§11, §26, §33.6).
//
// This file covered three capabilities until 6 September 2026, when the scope
// reduction took get_commerce_overview and get_channel_performance out of the
// release: no registry row, nothing published, nothing dispatched. Their money
// arithmetic — one sale counted three times, two currencies added together, an
// order's fee added to the payout's copy of it, a profit quoted with no cost
// behind it — is still in commerce.js and is reachable from nothing, so the
// checks that pinned it went with the capabilities rather than stay as claims
// about an answer nobody can ask for. What is left is the capability that
// ships, and the resolvers it shares with the rest of the module.
//
// Run: node test/qa/orchestrator-commerce.test.js
const assert = require("assert");
const commerce = require("../../orchestrator/commerce");
const channel = require("../../orchestrator/channel");
const money = require("../../orchestrator/money");
const orderView = require("../../orchestrator/orderView");
const { PAYMENT_STATUSES, FULFILLMENT_STATUSES } = require("../../commerce/envelope");
const registry = require("../../orchestrator/registry");
const freshness = require("../../orchestrator/freshness");
const loaders = require("../../orchestrator/loaders");
const fixtures = require("../fixtures/orchestrator");

let failures = 0;
const check = (name, run) => {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
};

const RANGE = { fromDate: "2026-09-01", toDate: "2026-09-30" };
const ctx = fixtures.ownerContext();
const numbersIn = (value) => JSON.stringify(value).match(/\d+(?:\.\d+)?/g) || [];

/**
 * The snapshot the LOADER would hand a capability, given what that capability
 * declares. A fixture richer than the declaration is a fixture that tests a
 * capability nobody deploys: loaders.snapshotFor reads a domain only when it is
 * declared, and populates `connections` only under "connections" or "payouts".
 */
function asLoaded(capability, snapshot) {
  const needs = new Set(registry.entryFor(capability).domainNeeds || []);
  const out = { ...snapshot };
  assert.ok([...needs].every((need) => loaders.DOMAINS.includes(need)), `${capability} declares a domain the loader cannot read`);
  if (!needs.has("connections") && !needs.has("payouts")) delete out.connections;
  if (!needs.has("payouts")) delete out.payouts;
  if (!needs.has("commerceHealth")) delete out.commerceHealth;
  if (!needs.has("bank")) delete out.bankRows;
  if (!needs.has("inventory")) delete out.inventoryItems;
  if (!needs.has("orders")) out.orders = [];
  return out;
}

check("a live Etsy shop is dated from its connection, on every capability that lists Etsy orders", () => {
  // Etsy writes no commerceHealth document — ever. The connection is the only
  // place its last successful sync is recorded, so a capability that reports
  // Etsy orders without declaring "connections" reports a working shop as never
  // synced, drags the answer to partial, and says so in a warning that is false.
  const base = fixtures.mixedSnapshot();
  // Amazon is opaque on purpose and would make every answer partial by itself.
  base.orders = base.orders.filter((order) => order.id !== "o_amazon");

  // The three capabilities this was written over are one now:
  // get_commerce_overview and get_channel_performance left the release on
  // 6 September 2026, and asLoaded() below reads their `domainNeeds` from the
  // registry, which no longer has them.
  for (const [capability, handler] of [
    ["search_commerce_orders", commerce.searchCommerceOrders]
  ]) {
    const snapshot = asLoaded(capability, base);
    const result = handler(snapshot, {}, ctx, { nowMs: base.nowMs });
    const etsy = result.sources.find((row) => row.provider === "etsy" && row.entity === "orders");
    assert.ok(etsy, `${capability}: Etsy rows are in the answer with no source row at all`);
    assert.strictEqual(etsy.state, "fresh", `${capability}: a healthy Etsy sync was reported as ${etsy.state}`);
    assert.strictEqual(etsy.lastSuccessAt, new Date(base.nowMs - 3 * 60 * 60 * 1000).toISOString());

    const built = freshness.build(result.sources, { nowMs: base.nowMs });
    assert.strictEqual(built.partial, false, `${capability}: the answer claims to be incomplete when it is not`);
    assert.ok(!built.warnings.some((row) => row.channel === "etsy"),
      `${capability}: told the reader something untrue about Etsy`);
    assert.strictEqual(built.freshness.ordersLastSync, new Date(base.nowMs - 3 * 60 * 60 * 1000).toISOString(),
      `${capability}: the oldest contributing order sync is the one to report`);
  }
});

check("no answer in this file hands VAT to a plan that does not include it", () => {
  // The entitlement is a property of the WORKSPACE, not of one capability. A
  // Starter workspace is refused VAT by get_order_financials, so a per-order
  // total, a per-channel tax block and a headline tax block must all refuse it
  // too — otherwise the plan gate is only as strong as the least careful read.
  const snapshot = fixtures.mixedSnapshot();
  const basic = fixtures.ownerContext({ entitlements: { advancedFinanceEnabled: false, chatgptAppEnabled: true } });
  const withheld = ["vatDue", "vatBase", "platformCollectedTax", "taxResponsibility"];

  for (const [name, handler, args] of [
    ["search_commerce_orders", commerce.searchCommerceOrders, {}]
  ]) {
    const result = handler(snapshot, args, basic, { nowMs: snapshot.nowMs });
    const serialised = JSON.stringify(result.data);
    for (const key of withheld) {
      assert.ok(!serialised.includes(`"${key}"`), `${name} put ${key} in front of a plan that does not include it`);
    }
    assert.ok(result.warnings.some((row) => row.code === "plan_limited"), `${name} withheld the figures without saying so`);
    assert.ok(/NivaDesk Pro and Team/.test(result.warnings.find((row) => row.code === "plan_limited").message),
      `${name} does not say where the missing figures live`);
  }
});

check("a paid plan still gets the tax detail", () => {
  const snapshot = fixtures.mixedSnapshot();
  const pro = fixtures.ownerContext({ entitlements: { advancedFinanceEnabled: true, chatgptAppEnabled: true } });
  const search = commerce.searchCommerceOrders(snapshot, {}, pro, { nowMs: snapshot.nowMs });
  assert.ok(search.data.orders.every((row) => typeof row.totals.vatDue === "number"));
  assert.ok(!search.warnings.some((row) => row.code === "plan_limited"));
});

check("the money a basic plan IS allowed still answers the question", () => {
  const snapshot = fixtures.mixedSnapshot();
  const basic = fixtures.ownerContext({ entitlements: { advancedFinanceEnabled: false, chatgptAppEnabled: true } });
  const search = commerce.searchCommerceOrders(snapshot, {}, basic, { nowMs: snapshot.nowMs });
  const row = search.data.orders.find((entry) => entry.orderId === "o_gbp");
  assert.strictEqual(row.totals.grandTotal, 200, "what the order took is not the part the plan withholds");
  assert.strictEqual(row.totals.remaining, 0);
  assert.strictEqual(row.totals.currency, "GBP");
});

/* ---------------------------------------------------------------- search */

check("the provider's status and NivaDesk's status are separate fields with separate filters", () => {
  const snapshot = fixtures.mixedSnapshot();
  const result = commerce.searchCommerceOrders(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  const row = result.data.orders.find((entry) => entry.orderId === "o_amazon");
  assert.ok("platformStatus" in row && "workflow" in row, "§33.6: platform status and workflow status are different questions");
  assert.strictEqual(row.workflow.status, "In Progress");

  const byWorkflow = commerce.searchCommerceOrders(snapshot, { workflowStatus: "In Progress" }, ctx, { nowMs: snapshot.nowMs });
  assert.ok(byWorkflow.data.orders.length > 0);
  const byPlatform = commerce.searchCommerceOrders(snapshot, { platformStatus: "In Progress" }, ctx, { nowMs: snapshot.nowMs });
  assert.strictEqual(byPlatform.data.orders.length, 0, "NivaDesk's own word must not match the provider's field");
});

check("the payment and fulfilment enums are the canonical ones, not a paraphrase", () => {
  // Imported from commerce/envelope.js, so a vocabulary change breaks this test
  // rather than the product.
  const snapshot = fixtures.mixedSnapshot();
  const result = commerce.searchCommerceOrders(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  for (const row of result.data.orders) {
    assert.ok(PAYMENT_STATUSES.has(row.paymentStatus), `${row.paymentStatus} is not a canonical payment status`);
    assert.ok(FULFILLMENT_STATUSES.has(row.fulfillmentStatus), `${row.fulfillmentStatus} is not a canonical fulfilment status`);
  }
  assert.ok(!PAYMENT_STATUSES.has("partial"), "\"partial\" is a fulfilment word, not a payment status");
});

check("a manual order derives its money statuses and reports no platform status at all", () => {
  const snapshot = fixtures.mixedSnapshot();
  const result = commerce.searchCommerceOrders(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  const manual = result.data.orders.find((row) => row.orderId === "o_assumed");
  assert.strictEqual(manual.channel, "manual");
  assert.strictEqual(manual.paymentStatus, "paid", "money says it is paid even with no provider to ask");
  assert.strictEqual(manual.platformStatus, null);
  assert.strictEqual(manual.platformStatusSource, "none", "null is not \"unknown\": there is no platform");
});

check("a restricted buyer is withheld, and so is the buyer's own note", () => {
  const snapshot = fixtures.mixedSnapshot();
  const result = commerce.searchCommerceOrders(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  const amazon = result.data.orders.find((row) => row.orderId === "o_amazon");
  assert.strictEqual(amazon.customer.restricted, true);
  assert.strictEqual(amazon.customer.reason, "provider_pii_policy");
  assert.ok(!("name" in amazon.customer), "the name must not travel beside the restriction flag");
  const serialised = JSON.stringify(result.data);
  assert.ok(!/buyer note that must never leave/.test(serialised), "the buyer's own sentence left the server");
});

check("free-text fields are not searchable: a buyer's note is not a search key", () => {
  const snapshot = fixtures.mixedSnapshot();
  snapshot.orders = snapshot.orders.map((order) => (order.id === "o_gbp" ? { ...order, notes: "unicorn" } : order));
  const result = commerce.searchCommerceOrders(snapshot, { query: "unicorn" }, ctx, { nowMs: snapshot.nowMs });
  assert.strictEqual(result.data.orders.length, 0);
});

check("many matches is a completed search, not a state that needs a human", () => {
  const snapshot = fixtures.mixedSnapshot();
  const result = commerce.searchCommerceOrders(snapshot, {}, ctx, { nowMs: snapshot.nowMs });
  assert.ok(result.data.orders.length > 1);
  assert.strictEqual(result.state, undefined, "an ordinary multi-row search must not flag itself as needing attention");
});

check("money fields are absent without financial access, and the answer says which section was withheld", () => {
  const snapshot = fixtures.mixedSnapshot();
  const restricted = fixtures.ownerContext({ isOwner: false, financialInfo: false });
  const result = commerce.searchCommerceOrders(snapshot, {}, restricted, { nowMs: snapshot.nowMs });
  assert.ok(result.data.orders.every((row) => !("totals" in row)));
  assert.ok(result.warnings.some((row) => row.code === "section_not_permitted"));
});

/* ------------------------------------------------------- channel performance */

/* ------------------------------------------------------------ the resolvers */

check("the channel resolver uses the dashboard's vocabulary, and inbound is a sub-label", () => {
  assert.deepStrictEqual(channel.CHANNELS, ["shopify", "woocommerce", "etsy", "square", "amazon", "ebay", "manual"]);
  for (const label of ["Website", "Wix", "Squarespace", "Zapier", "Make"]) {
    const resolved = channel.channelOf({ customFields: { Source: label } });
    assert.strictEqual(resolved.channel, "manual", `${label} must file under manual, as the dashboard files it`);
    assert.strictEqual(resolved.manualSource, label.toLowerCase());
  }
  assert.strictEqual(channel.channelOf({ createdFrom: "chatgpt" }).manualSource, "chatgpt");
  // Identity is carried, never remapped.
  assert.strictEqual(channel.channelOf({ commerce: { provider: "ebay" } }).channel, "ebay");
  assert.strictEqual(channel.channelOf({ commerce: { provider: "amazon" } }).channel, "amazon");
  assert.strictEqual(channel.channelOf({ etsySource: { receiptId: "1" } }).identitySource, "legacy");
});

check("the currency resolver reads the key each connector actually writes", () => {
  assert.strictEqual(money.currencyOf({ customFields: { Source: "Etsy", "Etsy Currency": "USD" } }).currency, "USD");
  // Case-folded, the way the dashboard matches: "etsy" must find "Etsy Currency".
  assert.strictEqual(money.currencyOf({ customFields: { Source: "etsy", "Etsy Currency": "USD" } }).currency, "USD");
  assert.strictEqual(money.currencyOf({ customFields: { Source: "Wix", Currency: "eur" } }).currency, "EUR");
  const assumed = money.currencyOf({ customFields: {} }, { workspace: "GBP" });
  assert.deepStrictEqual(assumed, { currency: "GBP", assumed: true });
  assert.strictEqual(money.workspaceCurrency({ seciliParaBirimi: "£" }), "GBP");
});

check("a due date is only a due date when the workspace gave one", () => {
  // deliveryTime 0 means "no date" (the app's own rule). Treating it as
  // createdAt + 0 makes every dateless order overdue the moment it is created.
  assert.strictEqual(orderView.dueDateMs({ createdAt: "2026-09-01", deliveryTime: 0 }), null);
  assert.strictEqual(orderView.dueDateMs({ createdAt: "2026-09-01", deliveryTime: 3 }), Date.parse("2026-09-04T00:00:00.000Z"));
  assert.strictEqual(orderView.dueDateMs({ dueDate: "2026-09-09" }), Date.parse("2026-09-09T00:00:00.000Z"));
});

console.log(failures === 0 ? "\nAll commerce checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

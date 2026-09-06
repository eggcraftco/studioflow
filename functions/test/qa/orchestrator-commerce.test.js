// The cross-channel sales capabilities, against the rules that decide whether a
// number is true (§11, §26, §33.6).
//
// The mistakes being guarded against are all "plausible wrong number" mistakes:
// counting one sale three times because it also appears as a payout and a bank
// credit, adding two currencies together, adding an order's fee to the payout's
// copy of the same fee, quoting a profit that has no cost behind it, and
// serving a stale money stamp as if it had just been computed.
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

check("a sale, its payout and the bank credit are one sale, not three", () => {
  // £100 order, £95 payout, £95 bank credit. §26.
  const snapshot = fixtures.tripleCountSnapshot();
  const result = commerce.commerceOverview(snapshot, RANGE, ctx, { nowMs: snapshot.nowMs });
  assert.strictEqual(result.data.sales.gross, 100);
  assert.strictEqual(result.data.settlements.square.net, 95);
  const printed = numbersIn(result.data);
  assert.ok(!printed.includes("195"), "100 + 95 appeared as a total somewhere");
  assert.ok(!printed.includes("290"), "the sale, the payout and the deposit were added together");
});

check("an order's platform fee and the payout's copy of it are never added", () => {
  // The same £5 Square commission, seen at two events.
  const snapshot = fixtures.tripleCountSnapshot();
  const result = commerce.commerceOverview(snapshot, RANGE, ctx, { nowMs: snapshot.nowMs });
  assert.strictEqual(result.data.fees.known, 5);
  assert.strictEqual(result.data.settlements.square.fee, 5);
  assert.ok(!numbersIn(result.data).includes("10"), "the fee was counted twice");
});

check("headline totals are workspace currency only, and every currency is still listed", () => {
  const snapshot = fixtures.mixedSnapshot();
  const result = commerce.commerceOverview(snapshot, RANGE, ctx, { nowMs: snapshot.nowMs });
  const { sales } = result.data;
  assert.strictEqual(sales.currency, "GBP");
  assert.strictEqual(sales.gross, 420, "the USD order must not be inside the GBP headline");
  const usd = sales.currencies.find((row) => row.currency === "USD");
  assert.ok(usd && usd.gross === 300, "the USD money is still reported, in its own row");
  assert.deepStrictEqual(sales.excludedByCurrency, { orders: 1, currencies: ["USD"] });
  assert.ok(result.warnings.some((row) => row.code === "mixed_currency"));
  // The rows must add up to the order count, or something was silently dropped.
  assert.strictEqual(sales.currencies.reduce((acc, row) => acc + row.orders, 0), result.data.orders.count);
});

check("an order with no currency of its own is counted, and counted as assumed", () => {
  const snapshot = fixtures.mixedSnapshot();
  const result = commerce.commerceOverview(snapshot, RANGE, ctx, { nowMs: snapshot.nowMs });
  assert.strictEqual(result.data.sales.assumedCurrencyOrders, 1,
    "a default is not a reading: the answer has to say how many orders fell through to it");
});

check("the channel breakdown adds up to its own total, Amazon included", () => {
  const snapshot = fixtures.mixedSnapshot();
  const result = commerce.commerceOverview(snapshot, RANGE, ctx, { nowMs: snapshot.nowMs });
  const rows = result.data.channels;
  assert.strictEqual(rows.reduce((acc, row) => acc + row.orders, 0), result.data.orders.count);

  const amazon = rows.find((row) => row.channel === "amazon");
  assert.strictEqual(amazon.orders, 1);
  assert.strictEqual(amazon.availability, "data_only", "Amazon orders are real even when its connection is not visible here");
  assert.ok(amazon.amounts.length > 0, "a data_only row carries its figures; hiding them breaks the total");

  const ebay = rows.find((row) => row.channel === "ebay");
  assert.strictEqual(ebay.orders, 0);
  assert.strictEqual(ebay.availability, "adapter_only");
  assert.deepStrictEqual(ebay.amounts, [], "a channel with no orders reports no figures");
});

check("gross is the studio's revenue; marketplace-collected tax is reported beside it", () => {
  const snapshot = fixtures.mixedSnapshot();
  const result = commerce.commerceOverview(snapshot, RANGE, ctx, { nowMs: snapshot.nowMs });
  assert.strictEqual(result.data.tax.platformCollected, 10);
  assert.strictEqual(result.data.tax.needsReview.count, 1, "an Etsy order with an unknown tax owner must be flagged");
  assert.deepStrictEqual(result.data.tax.needsReview.orderIds, ["o_etsy_tax"]);
  assert.ok(result.warnings.some((row) => row.code === "tax_needs_review"));
});

check("discounts and shipping income are unavailable, never zero", () => {
  const snapshot = fixtures.mixedSnapshot();
  const result = commerce.commerceOverview(snapshot, RANGE, ctx, { nowMs: snapshot.nowMs });
  assert.deepStrictEqual(result.data.sales.discounts, { available: false, reason: "not_persisted_on_order" });
  assert.deepStrictEqual(result.data.sales.shippingIncome, { available: false, reason: "not_persisted_on_order" });
  assert.ok(result.warnings.some((row) => row.code === "unsupported_metric"));
});

check("money is recomputed: a fee-percentage change moves the figures without touching the stamp", () => {
  // The stamp is only rewritten by the order-write trigger, and financeSweep
  // refuses to re-run for the same engine version — so trusting it would serve
  // yesterday's fee with today's timestamp on it.
  const base = fixtures.mixedSnapshot();
  base.orders = base.orders.map((order) => ({ ...order, finance: { platformFee: 999, netProfit: -999, engineVersion: 4 } }));
  const before = commerce.commerceOverview(base, RANGE, ctx, { nowMs: base.nowMs });

  const after = commerce.commerceOverview(
    { ...base, settings: { ...fixtures.settings, feePercentage: 10 } },
    RANGE, ctx, { nowMs: base.nowMs }
  );
  assert.ok(after.data.fees.estimated > before.data.fees.estimated,
    `changing feePercentage must move the fee: ${before.data.fees.estimated} → ${after.data.fees.estimated}`);
  assert.notStrictEqual(after.data.fees.estimated, 999, "the stale stamp was served instead of a fresh computation");
});

check("a basic plan gets a smaller answer, and is told so", () => {
  const snapshot = fixtures.mixedSnapshot();
  const basic = fixtures.ownerContext({ entitlements: { advancedFinanceEnabled: false, chatgptAppEnabled: true } });
  const result = commerce.commerceOverview(snapshot, RANGE, basic, { nowMs: snapshot.nowMs });
  assert.strictEqual(result.data.tax, undefined);
  assert.strictEqual(result.data.fees, undefined);
  assert.strictEqual(result.data.settlements, undefined);
  assert.ok(result.data.orders.count > 0 && result.data.sales.gross > 0, "counts and gross still answer the question");
  assert.ok(result.warnings.some((row) => row.code === "plan_limited"));
});

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

  for (const [capability, handler] of [
    ["search_commerce_orders", commerce.searchCommerceOrders],
    ["get_commerce_overview", commerce.commerceOverview],
    ["get_channel_performance", commerce.channelPerformance]
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
    ["get_commerce_overview", commerce.commerceOverview, RANGE],
    ["search_commerce_orders", commerce.searchCommerceOrders, {}],
    ["get_channel_performance", commerce.channelPerformance, RANGE]
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

check("a paid plan still gets the tax detail on every one of the three", () => {
  const snapshot = fixtures.mixedSnapshot();
  const pro = fixtures.ownerContext({ entitlements: { advancedFinanceEnabled: true, chatgptAppEnabled: true } });
  const overview = commerce.commerceOverview(snapshot, RANGE, pro, { nowMs: snapshot.nowMs });
  assert.ok(overview.data.tax && typeof overview.data.tax.vatDue === "number");
  const search = commerce.searchCommerceOrders(snapshot, {}, pro, { nowMs: snapshot.nowMs });
  assert.ok(search.data.orders.every((row) => typeof row.totals.vatDue === "number"));
  assert.ok(!search.warnings.some((row) => row.code === "plan_limited"));
  const channels = commerce.channelPerformance(snapshot, RANGE, pro, { nowMs: snapshot.nowMs });
  assert.ok(channels.data.channels.some((row) => row.tax && typeof row.tax.vatDue === "number"));
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

check("the range is inclusive UTC calendar days, and the basis mix is reported", () => {
  const snapshot = fixtures.mixedSnapshot();
  const single = commerce.commerceOverview(snapshot, { fromDate: "2026-09-03", toDate: "2026-09-03" }, ctx, { nowMs: snapshot.nowMs });
  assert.strictEqual(single.data.orders.count, 1, "a one-day range must include that whole day");
  assert.strictEqual(single.data.range.basisCounts.paymentDate, 1);
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

check("profit is definite only with full cost coverage, an estimate below it, and absent at zero", () => {
  const snapshot = fixtures.mixedSnapshot();
  const result = commerce.channelPerformance(snapshot, RANGE, ctx, { nowMs: snapshot.nowMs });
  const shopify = result.data.channels.find((row) => row.channel === "shopify");
  const gbp = shopify.amounts.find((row) => row.currency === "GBP");
  assert.strictEqual(gbp.profit.basis, "known", "one GBP Shopify order, and it has a cost");
  const usd = shopify.amounts.find((row) => row.currency === "USD");
  assert.strictEqual(usd.profit.basis, "unavailable");
  assert.strictEqual(usd.profit.value, null, "a profit with no cost behind it is not a number");

  const amazon = result.data.channels.find((row) => row.channel === "amazon");
  assert.strictEqual(amazon.amounts[0].profit.basis, "unavailable");
});

check("average order value is per currency, never across currencies", () => {
  const snapshot = fixtures.mixedSnapshot();
  const result = commerce.channelPerformance(snapshot, RANGE, ctx, { nowMs: snapshot.nowMs });
  const shopify = result.data.channels.find((row) => row.channel === "shopify");
  assert.strictEqual(shopify.amounts.find((row) => row.currency === "GBP").aov, 200);
  assert.strictEqual(shopify.amounts.find((row) => row.currency === "USD").aov, 300);
});

check("faire is unsupported, not a channel with no sales", () => {
  const snapshot = fixtures.mixedSnapshot();
  const result = commerce.channelPerformance(snapshot, RANGE, ctx, { nowMs: snapshot.nowMs });
  const faire = result.data.channels.find((row) => row.channel === "faire");
  assert.strictEqual(faire.availability, "not_supported");
});

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

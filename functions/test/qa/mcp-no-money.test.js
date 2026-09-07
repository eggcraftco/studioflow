// No money in the two kept capabilities. Not today's field names — ANY of them.
//
// The operator's decision of 7 September 2026: the reduced MCP surface is two
// read capabilities — `search_commerce_orders` and `search_inventory` — and
// neither of them reports money. No total, no paid, no outstanding, no refund,
// no VAT, no platform tax, no payout, no payment amount, and no currency: a
// currency code is the unit half of an amount and a statement about the
// workspace's money in its own right.
//
// WHY THIS FILE IS NOT A LIST OF THE FIELDS THAT WERE DELETED. A test that
// asserted `!("totals" in row)` would pass on the day somebody adds
// `grandTotalV2`, or `orderValue`, or `amounts[]`, or puts the same figure
// inside `workflow`. So the check runs the other way round: it ENUMERATES every
// key the capability actually emitted, at every depth, through arrays and
// inside warnings, freshness rows, entity refs and summary lines, and refuses
// any key whose NAME is money-shaped. A new money field is caught by being
// money-shaped, whatever it is called and wherever it is put.
//
// Three dimensions, because a single-caller check proves almost nothing here:
//
//   - EVERY FLAG STATE. All eight combinations of the three review flags are
//     driven through `createOrchestrator`, so a capability cannot start
//     reporting money under a flag nobody runs the tests with. The
//     `search_inventory` a deployment serves depends on the flags (the
//     orchestrator capability with the orchestrator flag on, the 1.1.1-era
//     handler in index.js with only the inventory flag), so both are covered.
//   - EVERY CALLER, INCLUDING THE RICHEST ONE. The removed block was gated on
//     `ctx.financialInfo` and `entitlements.advancedFinanceEnabled`, so the
//     caller most likely to be handed money back is a workspace OWNER on a plan
//     with advanced finance, on a channel whose profile allows financial data.
//     That caller is checked first and is asserted to have received real rows,
//     so this file cannot pass by testing an empty answer.
//   - EVERY FIXTURE. The ordinary workspace, the triple-count one (a £100 sale,
//     a £95 payout and a £95 bank credit, the shape money bugs hide in), and
//     the poisoned one.
//
// The denylist is WRITTEN DOWN HERE rather than imported from
// `envelope.MONEY_NAME`. That regex exists to decide what a WhatsApp group
// thread may not see and is tuned for a different job; if it is ever loosened
// for a reason that makes sense there, this file must not loosen with it. It is
// also deliberately wider than the operator's list, and its near-misses are
// named below with the reason each one is allowed, so "why does this pass?" has
// an answer that is not "nobody thought about it".
//
// Run: node test/qa/mcp-no-money.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const FUNCTIONS_DIR = path.join(__dirname, "..", "..");
const { createOrchestrator, CAPABILITY_NAMES, CAPABILITY_ALIASES } = require("../../orchestrator");
const registry = require("../../orchestrator/registry");
const commerce = require("../../orchestrator/commerce");
const inventory = require("../../orchestrator/inventory");
const fixtures = require("../fixtures/orchestrator");

let failures = 0;
const check = (name, run) => {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
};
const asyncChecks = [];
const checkAsync = (name, run) => { asyncChecks.push([name, run]); };

/* ------------------------------------------------------------------ *
 * The denylist.
 * ------------------------------------------------------------------ */

/**
 * A field NAME that is money, or that is one half of money.
 *
 * Every token is a substring test, case-insensitively, against the key as it is
 * spelled in the answer — so `grandTotal`, `grandTotalV2`, `order_total`,
 * `TOTALS` and `netTotalMinorUnits` are all one token away from being caught,
 * which is the point.
 *
 * Two tokens carry an exception, and both exceptions are narrow:
 *
 *   - `due` is money in `amountDue` and a date in `dueDate`. The lookahead
 *     excludes the date and nothing else; every money-shaped "due" this
 *     codebase has ever written (`vatDue`, `balanceDue`, `totalDue`) is caught
 *     by its other half anyway.
 *   - `net` must not eat `network`, so it is bounded to the end of a word or a
 *     camelCase hump.
 */
const MONEY_TOKENS = [
  "amount", "total", "subtotal", "grand", "gross", "net(?![a-z])",
  "fee", "charge", "commission", "surcharge",
  "refund", "chargeback", "discount", "rebate",
  "cost", "price", "pricing", "valuation", "value",
  "profit", "margin", "markup", "revenue", "turnover", "income", "earning",
  "expense", "spend", "outgoing(?!kind)",
  "vat", "tax(?!onomy)", "duty", "levy",
  "currency", "money", "cash", "fiat",
  "paid", "payable", "payment(?!status|statussource)", "payout", "settlement", "remit",
  "balance", "outstanding", "remaining", "owed", "owing", "arrears", "due(?!date)",
  "deposit", "credit", "debit", "invoiceamount", "aov", "arpu", "ltv"
];
const MONEY_KEY = new RegExp(`(${MONEY_TOKENS.join("|")})`, "i");

/**
 * The near-misses, named on purpose so a reader can tell a considered omission
 * from an oversight. Each is a key one of the two capabilities really emits.
 *
 *   paymentStatus / paymentStatusSource — the provider's own status WORD out of
 *     the canonical enum (commerce/envelope.js PAYMENT_STATUSES). "paid",
 *     "refunded" and "partially_paid" are categories, not amounts: they carry
 *     no figure and no currency, and a workflow search that could not say
 *     whether an order is paid would not be worth asking. `payment` is on the
 *     token list with these two spellings excluded, so `paymentTotal` or
 *     `paymentAmount` is still caught.
 *   financeLastSync / entity: "finance" — a freshness TIMESTAMP for a
 *     connector's finance feed. It says when a sync last succeeded, which is a
 *     fact about a connection rather than about any sum of money, so "finance"
 *     is not a token.
 *   unit — the inventory quantity unit ("g", "clasps"). `unitPrice` is caught by
 *     `price`; the unit on its own says what `onHand` counts.
 *   onHand / reserved / lowStockAt / matched / count — quantities and counts.
 *     None is denominated in anything.
 *
 * They are asserted below to pass the denylist, so the regex is shown to
 * discriminate rather than merely to be strict.
 */
const DELIBERATELY_ALLOWED = Object.freeze([
  "paymentStatus", "paymentStatusSource", "financeLastSync", "unit",
  "onHand", "reserved", "lowStockAt", "matched", "count", "dueDate", "connectionId"
]);

/**
 * Money written into a VALUE rather than into a field name — "420 GBP", "£420".
 * The key check is the main event; this is the second door, for the day a
 * figure arrives inside a sentence or under an innocent name.
 *
 * Case-SENSITIVE on the ISO half on purpose: with `i`, `\d+\s?[a-z]{3}` eats
 * "12 day(s)" and "5 min" out of honest sentences.
 */
const MONEY_IN_VALUE = /(?:[£$€¥₺₹₽₴₪]\s?\d)|(?:\d[\d,]*(?:\.\d+)?\s?(?:[£$€¥₺₹₽₴₪]|[A-Z]{3}\b))/u;

/** Every ISO code a workspace can actually choose, as a bare value. */
const BARE_CURRENCY = /^(GBP|USD|EUR|TRY|CHF|JPY|CAD|AUD|SEK|NOK|DKK|PLN|CZK|INR|BRL|RUB|UAH|ILS|AED|ZAR|NZD|MXN|SGD|HKD|CNY)$/;

/**
 * Every key and every string value in one answer, with the path it sits at.
 *
 * Arrays are walked by index, so a money field hidden in `orders[7].workflow`
 * is found; keys are collected at the depth they occur, so nesting a `totals`
 * block one level lower does not hide it.
 */
function walk(value, at = "$", found = { keys: [], strings: [] }) {
  if (typeof value === "string") { found.strings.push([at, value]); return found; }
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((row, index) => walk(row, `${at}[${index}]`, found));
    return found;
  }
  for (const [key, inner] of Object.entries(value)) {
    found.keys.push([`${at}.${key}`, key]);
    walk(inner, `${at}.${key}`, found);
  }
  return found;
}

/** The whole assertion, over anything an answer is made of. */
function assertNoMoney(answer, where) {
  const found = walk(answer);
  assert.ok(found.keys.length > 0, `${where}: nothing was walked, so this proves nothing`);
  for (const [at, key] of found.keys) {
    assert.ok(!MONEY_KEY.test(key),
      `${where}: money-shaped field "${key}" at ${at} — the two kept capabilities report no money.`);
  }
  for (const [at, text] of found.strings) {
    assert.ok(!MONEY_IN_VALUE.test(text),
      `${where}: an amount is written into the value at ${at}: ${JSON.stringify(text.slice(0, 120))}`);
    assert.ok(!BARE_CURRENCY.test(text.trim()),
      `${where}: a bare currency code at ${at}: ${JSON.stringify(text)}`);
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * 0. The denylist is shown to discriminate, in both directions.
 * ------------------------------------------------------------------ */

check("the denylist catches a money field NOBODY removed today, under any spelling", () => {
  // The names that were deleted on 7 September 2026 — and, more importantly,
  // names nobody has written yet. If this file only caught the first group it
  // would be a changelog, not a guard.
  const wouldBeCaught = [
    "totals", "grandTotal", "grandTotalV2", "paid", "paidAmount", "remaining",
    "remainingBalance", "refunded", "customerTotal", "vatDue", "platformCollectedTax",
    "currency", "unitPrice", "cost", "valuationCost", "value", "margin", "marginPct",
    "platformFee", "feesEstimated", "payoutNet", "settlementAmount", "netProfit",
    "orderValue", "grossSales", "amountOutstanding", "stockValue", "aov",
    "order_total", "TOTAL", "line_amount", "priceMinorUnits"
  ];
  for (const key of wouldBeCaught) {
    assert.ok(MONEY_KEY.test(key), `a money field named "${key}" would pass this file unnoticed`);
  }
  // And the walker finds one however deeply it is buried, or renamed, or put in
  // an array — which is the half a hand-written `!("totals" in row)` misses.
  for (const shape of [
    { data: { orders: [{ workflow: { grandTotalV2: 12 } }] } },
    { data: { orders: [{ facts: [{ orderValue: 12 }] }] } },
    { warnings: [{ code: "estimated", stockValue: 4 }] },
    { freshness: { sources: [{ provider: "square", payoutNet: 95 }] } },
    { summary: { lines: [{ slot: "finance", text: "420 GBP still outstanding" }] } },
    { data: { orders: [{ code: "GBP" }] } }
  ]) {
    assert.throws(() => assertNoMoney(shape, "probe"), /money-shaped field|an amount is written|bare currency/,
      `a planted money field survived: ${JSON.stringify(shape)}`);
  }
});

check("the denylist does not destroy the fields these capabilities are FOR", () => {
  for (const key of DELIBERATELY_ALLOWED) {
    assert.ok(!MONEY_KEY.test(key),
      `"${key}" is not money and the denylist rejects it — the rule is now removing honest fields`);
  }
  // The two that carry an exception are shown to still catch the money spelling
  // of themselves, or the exception is a hole rather than a carve-out.
  for (const key of ["paymentAmount", "paymentTotal", "amountDue", "balanceDue"]) {
    assert.ok(MONEY_KEY.test(key), `the exception in the denylist swallowed "${key}"`);
  }
});

/* ------------------------------------------------------------------ *
 * 1. The pure capabilities, over every fixture and every caller.
 * ------------------------------------------------------------------ */

/**
 * The callers. The first is the one this whole file exists for: an OWNER, with
 * the financial grant, on a plan that includes advanced finance — the caller
 * the deleted `if (financial) { … if (advanced) { … } }` would have handed
 * every figure to.
 */
const CALLERS = Object.freeze({
  "owner, financial grant, advanced finance plan": () => fixtures.ownerContext(),
  "owner on a plan without advanced finance": () => fixtures.ownerContext({
    entitlements: { advancedFinanceEnabled: false, bankFeedEnabled: true, chatgptAppEnabled: true }
  }),
  "member without the financial grant": () => fixtures.ownerContext({ isOwner: false, financialInfo: false }),
  "member whose plan and grant are both off": () => fixtures.ownerContext({
    isOwner: false, financialInfo: false,
    entitlements: { advancedFinanceEnabled: false, bankFeedEnabled: false, chatgptAppEnabled: true }
  }),
  // A channel that is ALLOWED money. `envelope.applyChannelProfile` is what
  // strips figures for a group thread, so a profile that permits them is the
  // state in which a leak would actually reach a reader — checking only the
  // restrictive profile would let the redactor's own behaviour stand in for
  // the capability's.
  "a WhatsApp thread whose profile allows financial data": () => fixtures.ownerContext({
    channel: {
      type: "whatsapp", bindingId: "cb_1", isGroup: false,
      profile: { capabilities: ["read"], security: { assurance_level: 3, pii_level: "full", financial_data_allowed: true } }
    }
  })
});

const FIXTURES = Object.freeze({
  "an ordinary two-currency workspace": () => fixtures.mixedSnapshot(),
  "one sale, its payout and its bank credit": () => fixtures.tripleCountSnapshot(),
  "a workspace poisoned in every string field": () => fixtures.poisonedSnapshot()
});

/** Argument sets that reach the branches a plain call does not. */
const COMMERCE_ARGS = [
  {},
  { limit: 1 },
  { query: "1001" },
  { source: "shopify" },
  { needsAttention: true },
  { fromDate: "2026-09-01", toDate: "2026-09-30" },
  { paymentStatus: "paid" }
];
const INVENTORY_ARGS = [
  {},
  { limit: 1 },
  { query: "pad" },
  { status: "available" },
  { status: "not-a-status" },
  { lowStock: true },
  { reserved: true },
  { channel: "shopify" }
];

check("the pure capabilities emit no money, for any caller, over any fixture, on any arguments", () => {
  let sawRows = 0;
  for (const [fixtureName, buildSnapshot] of Object.entries(FIXTURES)) {
    for (const [callerName, buildCaller] of Object.entries(CALLERS)) {
      const snapshot = buildSnapshot();
      const ctx = buildCaller();
      for (const args of COMMERCE_ARGS) {
        const result = commerce.searchCommerceOrders(snapshot, args, ctx, { nowMs: snapshot.nowMs });
        assertNoMoney(result, `search_commerce_orders / ${fixtureName} / ${callerName} / ${JSON.stringify(args)}`);
        sawRows += result.data.orders.length;
      }
      for (const args of INVENTORY_ARGS) {
        const result = inventory.searchInventoryItems(snapshot, args, ctx, { nowMs: snapshot.nowMs });
        assertNoMoney(result, `search_inventory / ${fixtureName} / ${callerName} / ${JSON.stringify(args)}`);
      }
    }
  }
  assert.ok(sawRows > 0, "every search returned nothing, so a money-free answer proves nothing");
});

/* ------------------------------------------------------------------ *
 * 2. The finished envelope, in all eight flag states.
 * ------------------------------------------------------------------ *
 *
 * The pure handler is only half the answer. `envelope.finish` adds freshness
 * rows, merges warnings and applies the channel profile, and `render.summaryFor`
 * writes the sentences a model reads first — a figure could arrive in any of
 * them. So the check is taken again on what `run()` actually returns, which is
 * verbatim what the MCP layer puts in `structuredContent`
 * (`nvMcpToolResult`, index.js).
 */

const FLAG_STATES = [];
for (const emailReceipts of [false, true]) {
  for (const inventoryFlag of [false, true]) {
    for (const orchestrator of [false, true]) {
      FLAG_STATES.push({ emailReceipts, inventory: inventoryFlag, orchestrator });
    }
  }
}
const flagLabel = (flags) => Object.entries(flags).filter(([, on]) => on).map(([key]) => key).join("+") || "all flags off";

function orchestratorOver(snapshot, flags) {
  return createOrchestrator({
    flags,
    now: () => snapshot.nowMs,
    loaders: {
      loadCompany: async () => ({ companyData: { ownerUid: "u_owner" }, settings: fixtures.settings }),
      snapshotFor: async () => snapshot
    }
  });
}

checkAsync("every finished envelope is money-free, in all eight flag states and for every caller", async () => {
  // The capability names come from the code, not from a list here: a third
  // capability added to the release is covered by this file the day it exists.
  const names = [...CAPABILITY_NAMES, ...Object.keys(CAPABILITY_ALIASES)];
  assert.deepStrictEqual([...CAPABILITY_NAMES].sort(), ["search_commerce_orders", "search_inventory"],
    "the kept set changed; this file's premise needs re-reading before its assertions are trusted");

  let answered = 0;
  for (const flags of FLAG_STATES) {
    for (const [fixtureName, buildSnapshot] of Object.entries(FIXTURES)) {
      for (const [callerName, buildCaller] of Object.entries(CALLERS)) {
        const snapshot = buildSnapshot();
        const instance = orchestratorOver(snapshot, flags);
        for (const capability of names) {
          const where = `${capability} / ${flagLabel(flags)} / ${fixtureName} / ${callerName}`;
          let result;
          try {
            result = await instance.run({ capability, args: {}, ctx: buildCaller() });
          } catch (error) {
            // A capability whose flag is off is refused, and a refusal carries
            // no data. The refusal message is checked for money too, because a
            // sentence is an answer.
            assert.ok(/not switched on|Unknown capability/.test(error.message),
              `${where}: refused for an unexpected reason: ${error.message}`);
            assert.ok(!MONEY_IN_VALUE.test(error.message), `${where}: the refusal quoted an amount`);
            continue;
          }
          assertNoMoney(result, where);
          answered += 1;
        }
      }
    }
  }
  // Half of the eight flag states publish nothing; the rest must have answered,
  // or every assertion above ran over an empty loop.
  assert.ok(answered > 0, "no capability ran in any flag state, so nothing was checked");
});

/* ------------------------------------------------------------------ *
 * 3. The OTHER search_inventory: the 1.1.1-era handler in index.js.
 * ------------------------------------------------------------------ */

check("the inventory-flag-only search_inventory projects no money either", () => {
  // With NIVADESK_MCP_INVENTORY on and the orchestrator flag off, the published
  // `search_inventory` is answered by nvChatGPTSearchInventory (index.js), not
  // by the orchestrator — index.js:24667 chooses between them. It is the same
  // published tool NAME, so it is in scope for this file.
  //
  // It reads Firestore, so it is checked at its projection rather than by being
  // run: the keys it puts in a row are read out of the deployed source between
  // two anchors. If the function is renamed or its shape changes beyond
  // recognition, the anchors fail loudly rather than the check passing
  // vacuously.
  const source = fs.readFileSync(path.join(FUNCTIONS_DIR, "index.js"), "utf8");
  const start = source.indexOf("async function nvChatGPTSearchInventory(");
  assert.ok(start > 0, "nvChatGPTSearchInventory is gone or renamed; this check no longer covers what it claims to");
  const end = source.indexOf("\nasync function ", start + 10);
  assert.ok(end > start, "could not find the end of nvChatGPTSearchInventory");
  const body = source.slice(start, end);

  assert.ok(/rows\.push\(\{/.test(body), "the row projection moved; re-read this check against the code");
  const emitted = body.match(/^\s{6}([A-Za-z_][A-Za-z0-9_]*):/gm) || [];
  assert.ok(emitted.length >= 5, `only ${emitted.length} projected fields were found; the anchors have drifted`);
  for (const raw of emitted) {
    const key = raw.trim().replace(/:$/, "");
    assert.ok(!MONEY_KEY.test(key), `the flags-off inventory search projects money-shaped field "${key}"`);
  }
  // Its envelope keys, too: `{ action, ok, count, items }`.
  for (const key of (body.match(/return \{ ([^}]*)\}/) || ["", ""])[1].split(",").map((part) => part.split(":")[0].trim())) {
    if (key) assert.ok(!MONEY_KEY.test(key), `the flags-off inventory search returns money-shaped field "${key}"`);
  }
});

/* ------------------------------------------------------------------ *
 * 4. The registry says the same thing the code does.
 * ------------------------------------------------------------------ */

check("neither kept capability claims a financial permission it no longer uses", () => {
  // `permission.financial` is what `context.assertCapability` reads to demand
  // the financial grant. Both kept rows say false, and after the reduction that
  // is not merely true — it is the whole story: there is no branch left that
  // reads `ctx.financialInfo`.
  for (const name of CAPABILITY_NAMES) {
    const entry = registry.entryFor(name);
    assert.ok(entry, `${name} has no registry row`);
    assert.strictEqual(entry.permission.financial, false, `${name} still asks for the financial grant`);
    assert.strictEqual(entry.permission.bankFeed, false, `${name} still asks for the bank-feed grant`);
  }
  const source = fs.readFileSync(path.join(FUNCTIONS_DIR, "orchestrator", "commerce.js"), "utf8");
  const start = source.indexOf("function searchCommerceOrders(");
  const end = source.indexOf("\nfunction ", start + 10);
  const body = source.slice(start, end > start ? end : source.length);
  assert.ok(!/ctx\.financialInfo|advancedFinance\(/.test(body),
    "searchCommerceOrders reads a money entitlement again — the branch is back, off by a condition");
});

/* ------------------------------------------------------------------ */

(async () => {
  for (const [name, run] of asyncChecks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
  }
  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log("\nno money in the two kept capabilities");
})();

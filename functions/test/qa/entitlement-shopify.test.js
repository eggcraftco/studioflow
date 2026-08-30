// Four payment rails converge on one resolver, and the resolver only knows
// about three of them. Stripe, Apple and Google each leave a row in the
// workspace's subscriptions collection; Shopify bills through its own API and
// writes the plan straight onto the workspace. So "no active plan
// subscription" is the normal, healthy state for a paying Shopify merchant —
// and it used to be the exact state that dropped them to Demo.
//
// The Shopify side has always refused to overwrite a live Stripe/Apple/Google
// plan. These tests hold the other direction of that promise.
//
// Run: node test/qa/entitlement-shopify.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "..", "stripeBilling.js"), "utf8");
function pass(name) { console.log("PASS ", name); }

// Lift the shipped condition rather than restating it, so a change to the rule
// fails here instead of quietly passing against a copy.
const branch = source.slice(
  source.indexOf("if (!selected) {"),
  source.indexOf("const normalizedTriggerStatus"));
assert(branch.length > 0, "the resolver still has a no-active-subscription branch");

const conditionText = (branch.match(/if \((currentSource === "shopify"[\s\S]*?)\) \{/) || [])[1];
assert(conditionText, "the branch preserves a live Shopify plan");
const preservesShopifyPlan = new Function(
  "currentSource", "currentPlan", "shopifyStatus", `return (${conditionText});`);

// 1. A merchant paying through Shopify keeps the plan they are paying for.
for (const status of ["active", "trialing", "past_due"]) {
  assert.strictEqual(
    Boolean(preservesShopifyPlan("shopify", "pro", status)), true,
    `a ${status} Shopify subscription is preserved`);
}
pass("a live Shopify plan survives a resolve with no subscription rows");

// 2. A cancelled Shopify subscription is not a plan. It must fall through to
//    the downgrade, or cancelling would leave the merchant on Pro forever.
for (const status of ["cancelled", "expired", "frozen", ""]) {
  assert.strictEqual(
    Boolean(preservesShopifyPlan("shopify", "pro", status)), false,
    `a ${status || "blank"} Shopify subscription is not preserved`);
}
pass("a dead Shopify subscription still downgrades");

// 3. The guard is Shopify's alone. A stale Stripe workspace with no active
//    rows must still be downgraded — that is the resolver's whole job.
assert.strictEqual(Boolean(preservesShopifyPlan("stripe", "pro", "active")), false);
assert.strictEqual(Boolean(preservesShopifyPlan("entitlement_resolver", "pro", "active")), false);
pass("the guard does not leak to the other rails");

// 4. Demo is not a plan worth preserving.
assert.strictEqual(Boolean(preservesShopifyPlan("shopify", "demo", "active")), false);
assert.strictEqual(Boolean(preservesShopifyPlan("shopify", "", "active")), false);
pass("Demo is not preserved as if it were paid");

// 5. Order matters: preservation has to be decided before the downgrade is
//    written, not after it.
assert(
  branch.indexOf('provider: "shopify"') < branch.length,
  "the Shopify return is inside the no-subscription branch");
assert(
  source.indexOf('preservedShopifyPlan: true') < source.indexOf('planUpdatePayload("demo"'),
  "the Shopify plan is preserved before the Demo downgrade is written");
pass("preservation is decided before the downgrade");

// 6. The other direction of the same promise: four rails sell the same plan
//    and none of them can see the other three at the till, so the server is
//    the only place a second charge can be refused.
function lift(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start > 0, `${name} is in stripeBilling.js`);
  const rest = source.slice(start + 1);
  return source.slice(start, start + 1 + rest.search(/\n  (?:function |const |async function )/));
}
const statuses = source.match(/const LIVE_BILLING_STATUSES = \[[^\]]*\];/);
assert(statuses, "the live-status list is still there to lift");
const billedByOther = new Function(
  `${statuses[0]}\n${lift("workspacePlanBilledByOtherProvider")}\nreturn workspacePlanBilledByOtherProvider;`)();

const stripePro = { billingPlan: "pro", billingStatus: "active", billingEffectiveProvider: "stripe" };
assert.strictEqual(billedByOther(stripePro, "apple"), "stripe", "iOS is told Stripe already bills this workspace");
assert.strictEqual(billedByOther(stripePro, "google"), "stripe");
assert.strictEqual(billedByOther(stripePro, "stripe"), "", "changing tier on the SAME rail stays allowed");
pass("a workspace paying on one rail cannot be sold a plan on another");

// A grant nobody is charged for must never block a real purchase.
for (const source_ of ["manual_workspace", "comp_review", "signup_trial", "entitlement_resolver"]) {
  assert.strictEqual(
    billedByOther({ billingPlan: "pro", billingStatus: "active", billingEffectiveProvider: source_ }, "stripe"), "",
    `${source_} is a grant, not a till`);
}
pass("manual and complimentary grants do not block buying");

// Nothing live, nothing to protect.
assert.strictEqual(billedByOther({ billingPlan: "demo", billingStatus: "active", billingEffectiveProvider: "stripe" }, "apple"), "");
assert.strictEqual(billedByOther({ billingPlan: "pro", billingStatus: "cancelled", billingEffectiveProvider: "stripe" }, "apple"), "");
assert.strictEqual(billedByOther({ billingPlan: "pro", billingStatus: "expired", billingEffectiveProvider: "stripe" }, "apple"), "");
pass("a demo, cancelled or expired workspace can still buy");

// 7. Add-ons must survive the guard: they are sold on Stripe whatever rail the
//    plan came from, and on the stores they share the plan's prepare call.
assert(
  /if \(item\.type === "plan"\) \{\s*refuseSecondTill\(companyData, "stripe"\);/.test(source),
  "Stripe checkout guards plans only, never seats or storage");
for (const rail of ["apple", "google"]) {
  const re = new RegExp(`if \\(String\\(request\\.data\\?\\.purpose \\|\\| ""\\)\\.trim\\(\\) === "plan"\\) \\{\\s*refuseSecondTill\\(companyData, "${rail}"\\);`);
  assert(re.test(source), `${rail} guards only what the client calls a plan`);
}
pass("storage and seat add-ons are never refused by the plan guard");

console.log("\nAll entitlement/Shopify checks passed.");

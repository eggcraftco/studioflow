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

console.log("\nAll entitlement/Shopify checks passed.");

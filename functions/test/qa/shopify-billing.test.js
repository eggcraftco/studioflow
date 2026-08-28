// Shopify's rule 1.2.1: an app on their App Store bills through THEIR Billing
// API, not an outside gateway. Sending merchants to Stripe is what paused the
// listing, so these are the rules that must not quietly come undone.
//
// Run: node test/qa/shopify-billing.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..", "..");
const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const planPage = fs.readFileSync(
  path.join(root, "studioflow-web", "app", "plan", "page.tsx"), "utf8");
const shopifyPlan = fs.readFileSync(
  path.join(root, "nivadesk-order-management", "app", "routes", "app.plan.tsx"), "utf8");
const toml = fs.readFileSync(
  path.join(root, "nivadesk-order-management", "shopify.app.toml"), "utf8");

function pass(name) { console.log("PASS ", name); }

// The lifted rule, so this tests the shipping code rather than a copy.
function lift(name) {
  const start = server.indexOf(`function ${name}(`);
  assert(start > 0, `${name} is in index.js`);
  const rest = server.slice(start + 1);
  const next = rest.search(/\n(?:function |const |async function |exports\.)/);
  return server.slice(start, start + 1 + next);
}
const workspaceBilledOutsideShopify = new Function(
  `${lift("workspaceBilledOutsideShopify")}\nreturn workspaceBilledOutsideShopify;`
)();

// 1. A workspace already paying by Stripe must never be sold a second time.
{
  const stripeCustomer = {
    billingProvider: "stripe",
    billingStatus: "active",
    billingSubscriptionId: "sub_123"
  };
  assert(workspaceBilledOutsideShopify(stripeCustomer), "a live Stripe subscription is billed elsewhere");
  assert(
    workspaceBilledOutsideShopify({ ...stripeCustomer, billingStatus: "trialing" }),
    "so is one still in its trial"
  );
  assert(
    workspaceBilledOutsideShopify({ ...stripeCustomer, billingStatus: "past_due" }),
    "and one that is late — it is still their subscription"
  );
  pass("an existing subscriber cannot be charged twice");
}

// 2. But a workspace Shopify already bills is not "elsewhere" — otherwise it
// could never be upgraded or downgraded through Shopify again.
{
  assert(
    !workspaceBilledOutsideShopify({
      billingProvider: "shopify",
      billingStatus: "active",
      billingSubscriptionId: "gid://shopify/AppSubscription/1"
    }),
    "Shopify's own subscription is not an outside one"
  );
  assert(!workspaceBilledOutsideShopify({ billingStatus: "free" }), "Free is not billed anywhere");
  pass("Shopify keeps billing what it already bills");
}

// 3. The web must not offer Stripe to a Shopify-billed workspace.
{
  assert(
    /shopifyBilled\s*=\s*\(workspace\?\.billingProvider[^\n]*shopify/.test(planPage),
    "the plan page knows who bills this workspace"
  );
  assert(
    /purchasesEnabled\s*=\s*!shopifyBilled/.test(planPage),
    "and disables its purchase buttons when Shopify does"
  );
  pass("the web offers no Stripe checkout to a Shopify merchant");
}

// 4. The embedded app must not carry prices of its own: the listing, the charge
// and the entitlement have to agree, and three copies never do.
{
  assert(
    /billingPlanRequest/.test(shopifyPlan),
    "the app asks the server what to charge"
  );
  const priceLiterals = shopifyPlan.match(/amount:\s*\d+/g) || [];
  assert.strictEqual(
    priceLiterals.length, 0,
    `the app hardcodes no price, found: ${priceLiterals.join(", ")}`
  );
  assert(/appSubscriptionCreate/.test(shopifyPlan), "it creates a real Shopify charge");
  assert(/confirmationUrl/.test(shopifyPlan), "and hands the merchant to Shopify's approval screen");
  pass("prices live on the server, and the charge is Shopify's own");
}

// 5. A cancellation has to land whether or not anyone has the app open.
{
  assert(/app_subscriptions\/update/.test(toml), "the app subscribes to the topic");
  assert(
    /topic === "app_subscriptions\/update"/.test(server),
    "and the server handles it"
  );
  pass("cancellations reach us without the app being open");
}

// 6. Approving a charge must not be trusted from the query string.
{
  const returnBlock = shopifyPlan.slice(shopifyPlan.indexOf("charge_id"));
  assert(
    /ACTIVE_SUBSCRIPTIONS|currentAppInstallation/.test(returnBlock),
    "the return reads the subscription back from Shopify"
  );
  pass("the entitlement follows Shopify, not the address bar");
}

// 7. A development store can only take a test charge, and App Review tests on
// one. This must follow the SHOP, not an environment flag — a flag is only ever
// correct for one of the two audiences at a time, and someone has to remember
// to flip it on the day of the submission.
{
  assert(
    /partnerDevelopment/.test(shopifyPlan),
    "the app asks the shop whether it is a development store"
  );
  assert(
    !/SHOPIFY_BILLING_TEST/.test(shopifyPlan),
    "and does not decide it from config"
  );
  const guard = shopifyPlan.slice(shopifyPlan.indexOf("shopChargesAreTestOnly"));
  assert(
    /catch[\s\S]{0,200}?return false/.test(guard),
    "a failed lookup charges for real — silently not billing a paying merchant is worse"
  );
  pass("test charges follow the shop, so a reviewer is never blocked");
}

console.log("\n✅ SHOPIFY BILLING GEÇTİ");

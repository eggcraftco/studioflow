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
function liftConst(name) {
  const start = server.indexOf(`const ${name} =`);
  assert(start > 0, `${name} is in index.js`);
  const rest = server.slice(start + 1);
  const next = rest.search(/\n(?:function |const |async function |exports\.)/);
  return server.slice(start, start + 1 + next);
}
// The constant it closes over has to come along, or the lift throws at the
// first paid provider it checks.
const workspaceBilledOutsideShopify = new Function(
  `${liftConst("SHOPIFY_PAYING_PROVIDERS")}\n${lift("workspaceBilledOutsideShopify")}\nreturn workspaceBilledOutsideShopify;`
)();

// 1. A workspace already paying by Stripe must never be sold a second time.
{
  const stripeCustomer = {
    billingPlanSource: "stripe",
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
  for (const provider of ["apple", "google"]) {
    assert(
      workspaceBilledOutsideShopify({
        billingPlanSource: "entitlement_resolver",
        billingEffectiveProvider: provider,
        billingStatus: "active"
      }),
      `an App Store / Play subscription (${provider}) counts too`
    );
  }
  pass("an existing subscriber cannot be charged twice");
}

// 1b. But a subscription id alone is NOT proof of payment. The App Review
// workspace carries one left over from a Stripe test while its plan is a
// complimentary grant — under the old rule the app refused to sell to it, so
// the reviewer could never reach the Billing API and would reject us again for
// the very thing we had just built.
{
  const reviewWorkspace = {
    companyName: "My Studio",
    billingPlan: "team_monthly",
    billingStatus: "active",
    billingPlanSource: "comp_review",
    billingSubscriptionId: "sub_1Tcu1WD3VBItFZ5TwF5iJvqD"
  };
  assert(
    !workspaceBilledOutsideShopify(reviewWorkspace),
    "a complimentary grant with a stale subscription id is not a paying customer"
  );
  assert(
    !workspaceBilledOutsideShopify({
      billingProvider: "nivadesk_trial",
      billingStatus: "trialing",
      billingPlanSource: "signup_free"
    }),
    "and neither is the automatic trial — a free fortnight cannot be double charged"
  );
  pass("comp grants and trials stay buyable, so review can reach the Billing API");
}

// 2. But a workspace Shopify already bills is not "elsewhere" — otherwise it
// could never be upgraded or downgraded through Shopify again.
{
  assert(
    !workspaceBilledOutsideShopify({
      billingProvider: "shopify",
      billingPlanSource: "shopify",
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
  // The guard widened from Shopify-only to every outside rail (Apple, Google
  // Play, Shopify), so assert the chain rather than the old variable name.
  assert(
    /billedElsewhere\s*=\s*shopifyBilled\s*\|\|/.test(planPage)
      && /purchasesEnabled\s*=\s*!billedElsewhere/.test(planPage),
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

// 8. The webhook has to stand on its own. The first live one died on
// "body is not defined" (the handler names it `payload`), and it identified the
// plan from a field only a completed return trip writes — so a cancellation
// arriving before any return would have found nothing.
{
  const start = server.indexOf('topic === "app_subscriptions/update"');
  assert(start > 0, "the topic is handled");
  const handler = server.slice(start, start + 1400);
  assert(!/\bbody\?\./.test(handler), "it reads `payload`, the name the handler actually uses");
  assert(
    /shopifyBillingPlanByName\(subscription\.name\)/.test(handler),
    "and identifies the plan from the subscription's own name"
  );
  const byName = new Function(
    `${liftConst("SHOPIFY_BILLING_PLANS")}\n${lift("shopifyBillingPlanByName")}\nreturn shopifyBillingPlanByName;`
  )();
  assert.strictEqual(byName("NivaDesk Pro")?.plan, "pro_monthly", "Pro maps back");
  assert.strictEqual(byName("nivadesk team")?.plan, "team_monthly", "case does not matter");
  assert.strictEqual(byName("Something Else"), null, "an unknown name maps to nothing");
  pass("the webhook can identify the plan without a prior return trip");
}

// 9. The listing promises a 14-day trial on every paid plan. If the charge
// screen says "due today" instead, the two contradict each other in front of
// the reviewer. The first live approval did exactly that, because the shared
// workspaceHasUsedTrial counts any surviving subscription id as proof — true
// for a real Stripe customer, false for the App Review workspace's stale one.
{
  const hasUsedTrial = new Function(
    `${liftConst("SHOPIFY_PAYING_PROVIDERS")}
     ${lift("workspaceBilledOutsideShopify")}
     ${lift("shopifyWorkspaceHasUsedTrial")}
     return shopifyWorkspaceHasUsedTrial;`
  )();

  assert(
    !hasUsedTrial({
      billingPlanSource: "comp_review",
      billingStatus: "active",
      billingSubscriptionId: "sub_1Tcu1WD3VBItFZ5TwF5iJvqD"
    }),
    "a stale id beside a complimentary plan does not spend the fortnight"
  );
  assert(
    hasUsedTrial({ billingTrialUsedAt: { seconds: 1 } }),
    "but the explicit stamp does — one fortnight per workspace, wherever it started"
  );
  assert(
    hasUsedTrial({
      billingPlanSource: "stripe",
      billingStatus: "active",
      billingSubscriptionId: "sub_real"
    }),
    "and so does a real paying subscription"
  );
  assert(
    /shopifyWorkspaceHasUsedTrial\(companyData\)/.test(server),
    "billingPlanRequest uses the Shopify-specific check, not the shared one"
  );
  pass("the trial the listing promises is the trial the charge screen shows");
}

// 11. An upgrade does not cancel the plan it just bought.
//
// Shopify does not amend a subscription in place: it activates the new one and
// cancels the old one. Our dev store received both webhooks inside the same
// second (two POSTs, 20:28:03, both 200). Read naively, the cancellation of the
// REPLACED plan says "this merchant has no subscription" and writes Free over
// the upgrade they just paid for. The workspace survived on Team that time by
// the luck of which write landed second — which is not a property to ship.
{
  const fn = server.slice(
    server.indexOf("async function applyShopifySubscription("),
    server.indexOf("const SHOPIFY_STORE_DEFAULT_SETTINGS")
  );
  assert(fn.length > 200, "applyShopifySubscription is in index.js");

  assert(
    /runTransaction\(/.test(fn),
    "the writer is transactional, so two deliveries cannot both read the stale doc"
  );
  assert(
    /tx\.get\(companyRef\)/.test(fn) && /tx\.set\(companyRef/.test(fn),
    "and it reads and writes inside that transaction, not around it"
  );
  assert(
    /superseded_subscription/.test(fn),
    "a cancellation naming a subscription we no longer hold is ignored"
  );
  // The guard must not swallow a genuine cancellation of the CURRENT plan —
  // that is the whole reason the webhook exists.
  const guard = fn.slice(fn.indexOf("const heldGid"), fn.indexOf("superseded_subscription"));
  assert(
    /!active/.test(guard) && /gid !== heldGid/.test(guard),
    "it only ignores a NON-active status for a DIFFERENT subscription"
  );
  assert(
    !/heldGid\s*\|\|\s*!gid/.test(guard),
    "an unknown-gid workspace still downgrades, rather than becoming uncancellable"
  );
  pass("an upgrade does not cancel the plan it just bought");
}

// 12. The same, actually executed — both delivery orders, not just grepped.
//
// #11 reads the source; this one runs it. Shopify sent the pair 144ms apart on
// the live switch, and a single run only ever exercises one order. So drive the
// real function with both, against a transaction that serialises the way
// Firestore does, and require the workspace to land on the plan the merchant
// bought either way.
{
  const src = server.slice(
    server.indexOf("async function applyShopifySubscription("),
    server.indexOf("const SHOPIFY_STORE_DEFAULT_SETTINGS")
  );

  function runOrder(deliveries) {
    let doc = {
      billingPlan: "team_monthly",
      billingProvider: "shopify",
      billingPlanSource: "shopify",
      billingStatus: "active",
      shopifySubscriptionGid: "gid://shopify/AppSubscription/TEAM"
    };
    // One doc, one lock: a transaction body sees the latest write, and the
    // real one retries rather than committing on a stale read.
    const stamp = { seconds: 0 };
    const fakeAdmin = {
      firestore: Object.assign(() => ({
        collection: () => ({ doc: () => ({ __ref: true }) }),
        runTransaction: async (fn) => fn({
          get: async () => ({ exists: true, data: () => ({ ...doc }) }),
          set: (_ref, update) => { doc = { ...doc, ...update }; }
        })
      }), {
        FieldValue: { serverTimestamp: () => stamp },
        Timestamp: { fromMillis: (ms) => ({ ms }) }
      })
    };
    const apply = new Function(
      "admin", "workspaceBilledOutsideShopify", "shopifyBillingPlanFor", "PLAN_ENTITLEMENTS",
      `${src}\nreturn applyShopifySubscription;`
    )(
      fakeAdmin,
      () => false,
      (key) => (key === "pro_monthly" ? { plan: "pro_monthly", name: "NivaDesk Pro" } : null),
      { pro_monthly: { displayName: "Pro" }, demo: { displayName: "Free" } }
    );
    return deliveries
      .reduce((chain, d) => chain.then(() => apply("shop", "c1", d)), Promise.resolve())
      .then(() => doc.billingPlan);
  }

  const activated = {
    gid: "gid://shopify/AppSubscription/PRO", status: "ACTIVE", plan: "pro_monthly"
  };
  const cancelledOld = {
    gid: "gid://shopify/AppSubscription/TEAM", status: "CANCELLED", plan: "team_monthly"
  };

  Promise.all([
    runOrder([activated, cancelledOld]),
    runOrder([cancelledOld, activated])
  ]).then(([first, second]) => {
    assert.strictEqual(first, "pro_monthly",
      "activation first: the replaced plan's cancellation must not undo it");
    assert.strictEqual(second, "pro_monthly",
      "cancellation first: the activation that follows still wins");
    pass("both webhook orders converge on the plan the merchant bought");
    console.log("\n✅ SHOPIFY BILLING GEÇTİ");
  }).catch((error) => {
    console.error("FAIL ", error.message);
    process.exit(1);
  });
}


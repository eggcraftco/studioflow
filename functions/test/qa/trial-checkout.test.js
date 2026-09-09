// The 14-day trial, as it is actually sold.
//
// Three rules worth protecting, because each one costs real money or real
// goodwill if it silently changes:
//   1. no card up front — the whole point of the offer;
//   2. one trial per workspace, ever — otherwise cancel-and-resubscribe is a
//      free subscription forever;
//   3. a trial that nobody pays for CANCELS rather than invoicing. NivaDesk has
//      a permanent Free tier, so an unpaid trial has somewhere safe to land;
//      leaving an unpaid invoice behind would chase a customer for a plan they
//      chose not to buy.
//
// Run: node test/qa/trial-checkout.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "stripeBilling.js"), "utf8");
function pass(name) { console.log("PASS ", name); }

// The block that builds the checkout session's subscription options.
const block = SOURCE.slice(
  SOURCE.indexOf("sessionPayload.subscription_data = { metadata };"),
  SOURCE.indexOf("const session = await stripe.checkout.sessions.create(sessionPayload);")
);

// 1. Fourteen days, and no card asked for.
{
  assert(/trial_period_days = 14/.test(block), "the trial is 14 days");
  assert(/payment_method_collection = "if_required"/.test(block), "no card is collected up front");
  pass("14 days, no card up front");
}

// 2. Stripe refuses `if_required` on a trial without an end behaviour, and the
// behaviour we want is cancel — Free catches the workspace.
{
  assert(/trial_settings/.test(block), "an end behaviour is declared");
  assert(/missing_payment_method: "cancel"/.test(block), "an unpaid trial cancels");
  assert(!/missing_payment_method: "create_invoice"/.test(block), "it never leaves an unpaid invoice");
  pass("an unpaid trial cancels instead of invoicing");
}

// 3. Once per workspace. Both halves of the guard matter: the stamp catches a
// workspace that trialled and cancelled, the subscription id catches one that
// is already paying.
{
  assert(/hasUsedTrial/.test(block), "the guard exists");
  assert(/billingTrialUsedAt/.test(block), "a used trial is remembered");
  assert(/billingSubscriptionId/.test(block), "an existing subscriber gets no trial");
  assert(/if \(item\.type === "plan" && !hasUsedTrial\)/.test(block), "the guard gates the trial");
  pass("one trial per workspace, ever");
}

// 4. Add-ons are not plans: storage and seats must never carry a trial, or a
// workspace could hold paid capacity for free.
{
  const trialLines = block.split("\n").filter(line => /trial_period_days|payment_method_collection|trial_settings/.test(line));
  assert(trialLines.length > 0, "found the trial lines");
  const guardIndex = block.indexOf('item.type === "plan" && !hasUsedTrial');
  for (const line of trialLines) {
    assert(block.indexOf(line) > guardIndex, `trial setting must sit inside the plan-only guard: ${line.trim()}`);
  }
  pass("add-ons never carry a trial");
}

// 5. The stamp is written when a trial subscription actually STARTS — in
// applyCompletedSubscriptionCheckout, conditional on Stripe's own record of the
// subscription carrying a trial — never when the checkout page is merely opened
// (audit S#11: opening the payment page and closing it used to burn the
// workspace's one trial), never unconditionally (an add-on purchase must not
// spend it either), and only while it is still absent, so a late delivery
// cannot move the date an earlier one set.
//
// The BEHAVIOUR is proved by running the handler in
// stripe-invoice-api-drift.test.js ("a stale trial checkout still spends the
// once-per-workspace trial…", "an existing trial stamp keeps its date…",
// "a checkout whose subscription shows no trial writes no stamp…", "two
// concurrent deliveries… write the stamp once", "a cancellation followed by a
// new checkout does not hand out a second free trial"). What is read off the
// source here is only the shape: which function owns the stamp, and that the
// session-opening path does not.
{
  const after = SOURCE.slice(SOURCE.indexOf("const session = await stripe.checkout.sessions.create(sessionPayload);"));
  const sessionBlock = after.slice(0, after.indexOf("stripePendingCheckout"));
  assert(!/billingTrialUsedAt:/.test(sessionBlock), "opening a checkout session does not spend the trial");
  const completed = SOURCE.slice(SOURCE.indexOf("async function applyCompletedSubscriptionCheckout("));
  const completedBlock = completed.slice(0, completed.indexOf("\n  }\n"));
  assert(/subscriptionShowsTrial\(subscription\)/.test(completedBlock), "the completed checkout decides the stamp from Stripe's retrieved subscription");
  assert(/stampTrialUsedIfMissing\(result\.workspaceId\)/.test(completedBlock), "the completed checkout writes the stamp through the write-once path");
  assert(!/billingTrialUsedAt:/.test(completedBlock), "the stamp is no longer written inline beside the session fields, where it was gated on `updated`");
  const stamper = SOURCE.slice(SOURCE.indexOf("async function stampTrialUsedIfMissing("));
  const stamperBlock = stamper.slice(0, stamper.indexOf("\n  }\n"));
  assert(/runTransaction/.test(stamperBlock) && /if \(data\.billingTrialUsedAt\) return/.test(stamperBlock), "the stamp is written once, inside a transaction");
  pass("the one trial is spent only when a trial subscription starts");
}

// 6. A cancelled subscription must drop the workspace to Free rather than
// stranding it — this is what makes a card-free trial safe.
{
  assert(/const shouldFallback = isDeleted \|\| \["canceled", "unpaid", "incomplete_expired"\]/.test(SOURCE),
    "a cancelled or unpaid subscription falls back");
  assert(/return !shouldFallback && \["active", "trialing", "past_due"\]/.test(SOURCE),
    "fallback removes the entitlement");
  assert(/billingPreviousPaidPlan/.test(SOURCE), "the previous paid plan is remembered for the win-back");
  pass("an ended trial lands on Free with its history kept");
}

// 7. While it runs, a trial is a full plan — not a crippled preview.
{
  assert(/\["active", "trialing", "past_due"\]\.includes/.test(SOURCE), "trialing grants entitlement");
  pass("a trialing workspace gets the whole plan");
}

console.log("\n✅ TRIAL CHECKOUT GEÇTİ");

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

// 5. The stamp is written only when a trial was actually granted — writing it
// unconditionally would burn the workspace's one trial on an add-on purchase.
{
  const after = SOURCE.slice(SOURCE.indexOf("const session = await stripe.checkout.sessions.create(sessionPayload);"));
  const stampBlock = after.slice(0, after.indexOf("stripePendingCheckout"));
  assert(/if \(sessionPayload\.subscription_data\?\.trial_period_days\)/.test(stampBlock),
    "the stamp is conditional on a trial having been granted");
  assert(/billingTrialUsedAt/.test(stampBlock), "the stamp is written");
  pass("the one trial is spent only when it is granted");
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

// The trial starts when the workspace holds real work, not when someone signs up.
//
// The report's reasoning: a fortnight that begins at registration is mostly
// spent looking around. Starting it at the first real order means all fourteen
// days are useful ones — and it means nobody has to hand over a card to get
// them.
//
// Run: node test/qa/automatic-trial.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
function pass(name) { console.log("PASS ", name); }

function lift(name) {
  const start = SOURCE.indexOf(`function ${name}(`);
  const from = SOURCE.lastIndexOf("\n", start) + 1;
  const rest = SOURCE.slice(start + 1);
  const nextTop = rest.search(/\n(?:function |const |async function |exports\.)/);
  return SOURCE.slice(from, start + 1 + nextTop);
}

// A fake Firestore doc, enough to see what the engine writes.
function fakeRef(id = "co") {
  const writes = [];
  return {
    id,
    writes,
    async set(value, options) { writes.push({ value, options }); }
  };
}

const admin = {
  firestore: Object.assign(() => ({}), {
    FieldValue: { serverTimestamp: () => "__now__" },
    Timestamp: { fromMillis: (ms) => ({ __ms: ms, toMillis: () => ms }) }
  })
};

const startAutomaticTrial = new Function(
  "admin", "normalizeBillingPlan", "console", "AUTOMATIC_TRIAL_DAYS",
  `${lift("automaticTrialPlanFor")}\n${lift("workspaceHasUsedTrial")}\n${lift("startAutomaticTrial")}\nreturn startAutomaticTrial;`
)(admin, (v, d) => String(v || d), console, 14);

// The constant the engine closes over must be the one it ships with, or this
// test would happily pass against a changed trial length.
assert(/const AUTOMATIC_TRIAL_DAYS = 14;/.test(SOURCE), "the shipped trial is 14 days");

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  // 1. A brand-new Free workspace doing its first real work gets Pro for 14 days.
  {
    const ref = fakeRef();
    const out = await startAutomaticTrial(ref, { billingPlan: "demo" }, "first_order");
    assert.strictEqual(out.started, true);
    assert.strictEqual(out.plan, "pro_monthly");
    assert.strictEqual(out.days, 14);
    const w = ref.writes[0].value;
    assert.strictEqual(w.billingStatus, "trialing");
    assert.strictEqual(w.billingPlan, "pro_monthly");
    const days = Math.round((w.billingTrialEndsAt.toMillis() - Date.now()) / DAY);
    assert.strictEqual(days, 14, "the end date is fourteen days out");
    pass("first real work starts a 14-day Pro trial");
  }

  // 2. A workspace that said it has a team gets Team — handing them Pro would
  // hide the very features they came to try.
  {
    const ref = fakeRef();
    const out = await startAutomaticTrial(ref, { billingPlan: "demo", onboardingTeamSize: 5 }, "first_order");
    assert.strictEqual(out.plan, "team_monthly");
    pass("a team workspace trials Team, not Pro");
  }

  // 3. One trial per workspace, ever — and it spends the SAME stamp the paid
  // checkout guard reads, so nobody gets fourteen automatic days and then
  // fourteen more at checkout.
  {
    const ref = fakeRef();
    const first = await startAutomaticTrial(ref, { billingPlan: "demo" }, "first_order");
    assert.strictEqual(first.started, true);
    assert.strictEqual(ref.writes[0].value.billingTrialUsedAt, "__now__", "the shared stamp is spent");

    const again = await startAutomaticTrial(fakeRef(), { billingPlan: "demo", billingTrialUsedAt: "__now__" });
    assert.strictEqual(again.started, false);
    assert.strictEqual(again.why, "trial_already_used");

    const subscriber = await startAutomaticTrial(fakeRef(), { billingPlan: "demo", billingSubscriptionId: "sub_123" });
    assert.strictEqual(subscriber.started, false, "a past subscriber gets no automatic trial");
    pass("one trial per workspace, shared with the checkout guard");
  }

  // 4. Someone already paying must never be pushed onto a trial plan — that
  // would quietly change what they are entitled to.
  {
    for (const plan of ["pro_monthly", "team_monthly", "lifetime_lite"]) {
      const out = await startAutomaticTrial(fakeRef(), { billingPlan: plan });
      assert.strictEqual(out.started, false, `${plan} must be left alone`);
      assert.strictEqual(out.why, "already_on_a_plan");
    }
    pass("a paying workspace is left alone");
  }

  // 5. Starting a trial must never break the order that triggered it.
  {
    const exploding = { id: "co", set: async () => { throw new Error("firestore down"); } };
    const out = await startAutomaticTrial(exploding, { billingPlan: "demo" });
    assert.strictEqual(out.started, false);
    assert.strictEqual(out.why, "error");
    pass("a failure here never fails the order");
  }

  // 6. Expiry needs no chasing: the existing trialHasExpired rule already drops
  // a trialing workspace back to Free once billingTrialEndsAt passes.
  {
    assert(/function trialHasExpired/.test(SOURCE), "the expiry rule exists");
    assert(/if \(plan !== "demo" && trialHasExpired\(data\)\) return "demo";/.test(SOURCE),
      "an expired trial resolves to Free");
    assert(/data\.billingTrialEndsAt \|\| data\.billingCurrentPeriodEnd/.test(SOURCE),
      "the explicit trial end is read first");
    pass("an expired trial falls back to Free on its own");
  }

  // 7. Both order paths start it — web and the native apps write through
  // different callables and the entitlement belongs to the workspace.
  {
    for (const fn of ["createWebOrder", "createSwiftOrder"]) {
      const at = SOURCE.indexOf(`exports.${fn} =`);
      const body = SOURCE.slice(at, SOURCE.indexOf("\nexports.", at + 10));
      assert(/startAutomaticTrial\(companyRef, companyData, "first_order"\)/.test(body), `${fn} starts the trial`);
      assert(/trialStarted:/.test(body), `${fn} tells the client it happened`);
    }
    pass("web and native both start it, and both say so");
  }

  console.log("\n✅ AUTOMATIC TRIAL GEÇTİ");
}

main().catch(error => { console.error("\n❌", error.message); process.exit(1); });

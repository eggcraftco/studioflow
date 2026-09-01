// A trial is an entitlement with a date on it, so the date is part of the guard.
//
// protectedBillingFields() listed sixty keys and not one of the trial fields, so
// validCompanyBillingUpdate() waved through a lone write to any of them. An
// owner could post billingTrialEndsAt in the year 3000 and hold a Team trial
// forever for nothing — trialHasExpired() (functions/index.js) reads that field
// FIRST, ahead of the protected billingCurrentPeriodEnd — or clear
// billingTrialUsedAt, the once-per-workspace stamp, and re-arm the free
// fortnight on every re-subscribe.
//
// Separately, hasTeamPlan()/hasAdvancedFinancePlan() read billingPlan straight
// off the document and never looked at the date at all, so a Team trial that
// lapsed a month ago still opened the Team-only collections even though every
// server callable had already dropped the workspace to the free plan.
//
// The trap this suite exists to catch: the fix must not lock out the people who
// are actually paying. Half of these cases are there to prove it does not.
//
// Needs the Firestore emulator on 127.0.0.1:8080.
// Run: firebase emulators:exec --only firestore \
//        "node functions/test/qa/billing-trial-rules.test.mjs"
import fs from "fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDoc, deleteField, Timestamp, setLogLevel } from "firebase/firestore";

setLogLevel("error");
const RULES = fs.readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8");

const env = await initializeTestEnvironment({
  projectId: "rules-billing-trial-test",
  firestore: { rules: RULES, host: "127.0.0.1", port: 8080 }
});

const DAY = 86400000;
const ago = (days) => Timestamp.fromMillis(Date.now() - days * DAY);
const ahead = (days) => Timestamp.fromMillis(Date.now() + days * DAY);

let failures = 0;
const check = async (name, p) => {
  try { await p; console.log("PASS ", name); }
  catch (e) { failures++; console.log("FAIL ", name, "-", String(e.message).slice(0, 110)); }
};

/** A workspace owned by `uid`, seeded past the rules. */
async function seed(uid, billing) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "companies", uid), {
      companyId: uid, ownerUid: uid, name: "Co",
      memberUids: [uid], memberRoles: { [uid]: "owner" }, members: { [uid]: { role: "owner" } },
      ...billing
    });
  });
  return env.authenticatedContext(uid).firestore();
}

const TEAM_TRIAL = {
  billingPlan: "team_monthly", billingPlanName: "NivaDesk Team", billingStatus: "trialing",
  billingProvider: "nivadesk_trial", billingStorageLimitMB: 51200, billingTeamMemberLimit: 5,
  billingTrialEndsAt: ago(30), billingTrialUsedAt: ago(44)
};

// ---- the trial's own fields are the server's ------------------------------
{
  const db = await seed("u-extend", TEAM_TRIAL);
  const ref = doc(db, "companies", "u-extend");
  await check("an owner cannot post their trial's end date into the future",
    assertFails(updateDoc(ref, { billingTrialEndsAt: Timestamp.fromMillis(32503680000000) })));
  await check("an owner cannot clear the once-per-workspace trial stamp",
    assertFails(updateDoc(ref, { billingTrialUsedAt: deleteField() })));
  await check("an owner cannot rewrite the trial stamp to an older date either",
    assertFails(updateDoc(ref, { billingTrialUsedAt: ago(900) })));
  await check("an owner cannot backdate the trial's start",
    assertFails(updateDoc(ref, { billingTrialStartedAt: ago(1) })));
  await check("an owner cannot rename the billing provider",
    assertFails(updateDoc(ref, { billingProvider: "nivadesk_trial_2" })));
  // Controls: the guard was already refusing these, and must go on refusing them.
  await check("an owner still cannot change the plan",
    assertFails(updateDoc(ref, { billingPlan: "team_yearly" })));
  await check("an owner still cannot claim an active status",
    assertFails(updateDoc(ref, { billingStatus: "active" })));
  // And the workspace's own non-billing fields are still the owner's to edit.
  await check("an owner can still rename their workspace",
    assertSucceeds(updateDoc(ref, { name: "Renamed Co" })));
}

// ---- a lapsed trial is not the plan it was trialling ----------------------
{
  const db = await seed("u-lapsed", TEAM_TRIAL);
  await check("a lapsed Team trial cannot read the team-only messages",
    assertFails(getDoc(doc(db, "companies", "u-lapsed", "messageThreads", "t-1"))));
}
{
  const db = await seed("u-running", { ...TEAM_TRIAL, billingTrialEndsAt: ahead(5) });
  await check("a running Team trial still reads them",
    assertSucceeds(getDoc(doc(db, "companies", "u-running", "messageThreads", "t-1"))));
}
{
  // The 36-hour grace window: a trial that ended an hour ago is still open,
  // because a late renewal webhook must not lock anyone out.
  const db = await seed("u-grace", { ...TEAM_TRIAL, billingTrialEndsAt: ago(1 / 24) });
  await check("a trial that ended an hour ago is still inside the grace window",
    assertSucceeds(getDoc(doc(db, "companies", "u-grace", "messageThreads", "t-1"))));
}
{
  // The one that matters most: paying customers must not notice any of this.
  const db = await seed("u-paid", {
    billingPlan: "team_monthly", billingStatus: "active", billingProvider: "stripe",
    billingCurrentPeriodEnd: ahead(12), billingStorageLimitMB: 51200, billingTeamMemberLimit: 5
  });
  await check("a paying Team workspace is untouched by the trial check",
    assertSucceeds(getDoc(doc(db, "companies", "u-paid", "messageThreads", "t-1"))));
}
{
  // A trialing workspace with no end date recorded is not lapsed — same answer
  // the server gives when it cannot find a date.
  const db = await seed("u-nodate", {
    billingPlan: "team_monthly", billingStatus: "trialing", billingProvider: "nivadesk_trial"
  });
  await check("a trial with no end date on it is not treated as lapsed",
    assertSucceeds(getDoc(doc(db, "companies", "u-nodate", "messageThreads", "t-1"))));
}
{
  // The webhooks persist the trial end as the first period end, so that is the
  // fallback the server reads and the rules must read it too.
  const db = await seed("u-periodonly", {
    billingPlan: "team_monthly", billingStatus: "trialing", billingProvider: "stripe",
    billingCurrentPeriodEnd: ago(20)
  });
  await check("a lapsed trial dated only by its period end is lapsed too",
    assertFails(getDoc(doc(db, "companies", "u-periodonly", "messageThreads", "t-1"))));
}

await env.cleanup();
console.log(failures === 0 ? "\n✅ BILLING TRIAL RULES GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);

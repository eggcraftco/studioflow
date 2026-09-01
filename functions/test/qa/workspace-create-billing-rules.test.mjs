// The plan's name is part of a security rule, so renaming the plan broke
// workspace creation.
//
// companies/{cid} create is guarded by validNewCompanyBillingState(): a client
// may write the protected billing fields ONLY if they spell out the free plan
// exactly. That guard is what stops a client from creating itself a workspace
// on Team with 50GB. It also pinned the plan's DISPLAY NAME:
//
//     data.billingPlanName == 'Free Demo'
//
// When the plan was renamed to "Free", all three clients started writing the
// new name against a rule that still demanded the old one, and every
// client-side create was denied. The rule now accepts both, because builds
// shipped before the rename still write the old string.
//
// This suite pins both halves: the rename must not lock anyone out, and the
// guard must still refuse a client that tries to grant itself a paid plan.
//
// Needs the Firestore emulator on 127.0.0.1:8080.
// Run: node functions/test/qa/workspace-create-billing-rules.test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, setLogLevel } from "firebase/firestore";

setLogLevel("error");
const here = path.dirname(fileURLToPath(import.meta.url));
const RULES = fs.readFileSync(path.join(here, "..", "..", "..", "firestore.rules"), "utf8");

const env = await initializeTestEnvironment({
  projectId: "rules-workspace-create-billing-test",
  firestore: { rules: RULES, host: "127.0.0.1", port: 8080 }
});

let failures = 0;
const check = async (name, p) => {
  try { await p; console.log("PASS ", name); }
  catch (e) { failures++; console.log("FAIL ", name, "-", String(e.message).slice(0, 120)); }
};

// The workspace id IS the owner's uid, so every case needs its own signed-in
// user; a second create by the same user is an update, not a create.
const asNewUser = (uid) => env.authenticatedContext(uid).firestore();

const freeWorkspace = (uid, overrides = {}) => ({
  companyId: uid,
  ownerUid: uid,
  name: "My Studio",
  memberUids: [uid],
  members: { [uid]: { role: "owner" } },
  billingPlan: "demo",
  billingPlanName: "Free",
  billingPlanSource: "new_workspace_default",
  billingStorageLimitMB: 50,
  billingTeamMemberLimit: 1,
  ...overrides
});

// ---- the rename must not lock anyone out -----------------------------------
await check("a new workspace on the free plan is created under its current name",
  assertSucceeds(setDoc(doc(asNewUser("u-free"), "companies", "u-free"), freeWorkspace("u-free"))));

await check("a store build that still writes the old name is not locked out",
  assertSucceeds(setDoc(doc(asNewUser("u-legacy"), "companies", "u-legacy"),
    freeWorkspace("u-legacy", { billingPlanName: "Free Demo" }))));

await check("the sign-up source is accepted as well as the new-workspace one",
  assertSucceeds(setDoc(doc(asNewUser("u-signup"), "companies", "u-signup"),
    freeWorkspace("u-signup", { billingPlanSource: "signup_free_demo" }))));

await check("a workspace that names no billing at all is still fine",
  assertSucceeds(setDoc(doc(asNewUser("u-plain"), "companies", "u-plain"), {
    companyId: "u-plain", ownerUid: "u-plain", name: "My Studio",
    memberUids: ["u-plain"], members: { "u-plain": { role: "owner" } }
  })));

// ---- and the guard must still guard ----------------------------------------
// Widening a name check is only safe if it stayed a name check. Every one of
// these is a client trying to write itself an entitlement it has not paid for.
await check("a client cannot create itself on Team",
  assertFails(setDoc(doc(asNewUser("u-team"), "companies", "u-team"),
    freeWorkspace("u-team", { billingPlan: "team_monthly", billingPlanName: "NivaDesk Team" }))));

await check("a client cannot keep the free plan id and take Team's storage",
  assertFails(setDoc(doc(asNewUser("u-storage"), "companies", "u-storage"),
    freeWorkspace("u-storage", { billingStorageLimitMB: 51200 }))));

await check("a client cannot keep the free plan id and take extra seats",
  assertFails(setDoc(doc(asNewUser("u-seats"), "companies", "u-seats"),
    freeWorkspace("u-seats", { billingTeamMemberLimit: 5 }))));

await check("a client cannot claim an active paid status",
  assertFails(setDoc(doc(asNewUser("u-active"), "companies", "u-active"),
    freeWorkspace("u-active", { billingStatus: "active" }))));

await check("a client cannot invent a billing source of its own",
  assertFails(setDoc(doc(asNewUser("u-source"), "companies", "u-source"),
    freeWorkspace("u-source", { billingPlanSource: "granted_by_me" }))));

await check("a client cannot smuggle in a Stripe customer id",
  assertFails(setDoc(doc(asNewUser("u-stripe"), "companies", "u-stripe"),
    freeWorkspace("u-stripe", { billingCustomerId: "cus_123" }))));

// A name the rule does not know is not a free plan, whatever else it says.
await check("an unrecognised plan name is not accepted",
  assertFails(setDoc(doc(asNewUser("u-name"), "companies", "u-name"),
    freeWorkspace("u-name", { billingPlanName: "Free Forever" }))));

// Someone else's workspace is still someone else's.
await check("a client cannot create a workspace under another uid",
  assertFails(setDoc(doc(asNewUser("u-other"), "companies", "u-victim"), freeWorkspace("u-victim"))));

await env.cleanup();
console.log(failures === 0 ? "\n✅ WORKSPACE CREATE BILLING RULES GEÇTİ" : `\n❌ ${failures} BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);

// External audit, 2 Sep 2026 — the rules findings, pinned.
//
//  S#1  a user could write users/{self}/workspaceAccess/{anyCompany} and
//       storage.rules counted it as membership proof;
//  S#3  paypalPayouts / squarePayouts / trackingResults fell through the
//       wildcard rule (readable by every member, writable by member+);
//  S#4  companySettings let a member flip SMS triggers or the tax basis that
//       only owner/admin callables were supposed to change;
//  Elle #17  a memberAccess entry without assignedProjectsOnly threw
//       "Property assignedProjectsOnly is undefined" and locked the member
//       out of every list query;
//  S#48 an owner could delete the company document from a client.
//
// Half of these are controls: the people the rules exist for must keep working.
//
// Needs the Firestore emulator on 127.0.0.1:8080.
// Run: firebase emulators:exec --only firestore "node functions/test/qa/audit-rules-hardening.test.mjs"
import fs from "fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDoc, getDocs, deleteDoc, collection, query, where, setLogLevel } from "firebase/firestore";

setLogLevel("error");
const RULES = fs.readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8");
const env = await initializeTestEnvironment({
  projectId: "rules-audit-hardening-test",
  firestore: { rules: RULES, host: "127.0.0.1", port: 8080 }
});

let failures = 0;
const check = async (name, p) => {
  try { await p; console.log("PASS ", name); }
  catch (e) { failures++; console.log("FAIL ", name, "-", String(e.message).slice(0, 120)); }
};

const OWNER = "owner-uid", ADMIN = "admin-uid", MEMBER = "member-uid", VIEWER = "viewer-uid", STRANGER = "stranger-uid";
const CID = OWNER;

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "companies", CID), {
    companyId: CID, ownerUid: OWNER, name: "Audit Co",
    billingPlan: "team_monthly", billingStatus: "active",
    memberUids: [OWNER, ADMIN, MEMBER, VIEWER],
    memberRoles: { [OWNER]: "owner", [ADMIN]: "admin", [MEMBER]: "member", [VIEWER]: "viewer" },
    members: { [OWNER]: { role: "owner" }, [ADMIN]: { role: "admin" }, [MEMBER]: { role: "member" }, [VIEWER]: { role: "viewer" } },
    // The member's access entry deliberately lacks assignedProjectsOnly (Elle #17).
    memberAccess: { [MEMBER]: { orders: true, dashboard: true }, [VIEWER]: { orders: true, bankFeed: true } }
  });
  await setDoc(doc(db, "companySettings", CID), {
    companyId: CID, feePercentage: 3, smsTriggers: { estimateReady: false }, customStepsJSON: "[]"
  });
  await setDoc(doc(db, "siparisler", "o-1"), { companyId: CID, customerName: "A", designName: "D", paidAmount: 0, remainingAmount: 10 });
  await setDoc(doc(db, "companies", CID, "paypalPayouts", "p-1"), { amount: 12.5 });
  await setDoc(doc(db, "companies", CID, "trackingResults", "o-1"), { status: "in_transit" });
});

const as = (uid) => env.authenticatedContext(uid).firestore();

// ---- Elle #17: a member whose access entry predates assignedProjectsOnly ----
await check("a member with no assignedProjectsOnly key can still list the workspace's orders",
  assertSucceeds(getDocs(query(collection(as(MEMBER), "siparisler"), where("companyId", "==", CID)))));
await check("…and read one order",
  assertSucceeds(getDoc(doc(as(MEMBER), "siparisler", "o-1"))));
await check("a viewer with an entry that names other keys reads the bank-scoped payouts it was granted",
  assertSucceeds(getDoc(doc(as(VIEWER), "companies", CID, "paypalPayouts", "p-1"))));

// ---- S#1: workspaceAccess is the server's ------------------------------------
await check("a user cannot write their own workspaceAccess record for another workspace",
  assertFails(setDoc(doc(as(STRANGER), "users", STRANGER, "workspaceAccess", CID), { role: "admin" })));
await check("…nor can the owner write it from a client (Admin SDK only)",
  assertFails(setDoc(doc(as(OWNER), "users", MEMBER, "workspaceAccess", CID), { role: "admin" })));
await check("a user still reads their own workspaceAccess",
  assertSucceeds(getDoc(doc(as(MEMBER), "users", MEMBER, "workspaceAccess", CID))));

// ---- S#3: payouts and tracking results ---------------------------------------
await check("a plain member (no bankFeed) cannot read PayPal payouts",
  assertFails(getDoc(doc(as(MEMBER), "companies", CID, "paypalPayouts", "p-1"))));
await check("the owner reads PayPal payouts",
  assertSucceeds(getDoc(doc(as(OWNER), "companies", CID, "paypalPayouts", "p-1"))));
await check("nobody writes a payout from a client, not even the owner",
  assertFails(updateDoc(doc(as(OWNER), "companies", CID, "paypalPayouts", "p-1"), { bankMatch: "forged" })));
await check("a member reads tracking results",
  assertSucceeds(getDoc(doc(as(MEMBER), "companies", CID, "trackingResults", "o-1"))));
await check("a member cannot write a fake tracking result",
  assertFails(setDoc(doc(as(MEMBER), "companies", CID, "trackingResults", "o-1"), { status: "delivered" })));

// ---- S#4: companySettings gates ----------------------------------------------
await check("a member cannot switch SMS triggers from a client",
  assertFails(updateDoc(doc(as(MEMBER), "companySettings", CID), { smsTriggers: { estimateReady: true } })));
await check("an admin cannot change the SMS sender either (owner-only in the callable)",
  assertFails(updateDoc(doc(as(ADMIN), "companySettings", CID), { smsSenderId: "EVIL" })));
await check("the owner may still write SMS fields directly",
  assertSucceeds(updateDoc(doc(as(OWNER), "companySettings", CID), { smsTriggers: { estimateReady: true } })));
await check("a member cannot change the platform fee",
  assertFails(updateDoc(doc(as(MEMBER), "companySettings", CID), { feePercentage: 0 })));
await check("an admin may change the platform fee (Mac/Android save Financial Settings directly)",
  assertSucceeds(updateDoc(doc(as(ADMIN), "companySettings", CID), { feePercentage: 2.5 })));
await check("a member still saves workflow settings",
  assertSucceeds(updateDoc(doc(as(MEMBER), "companySettings", CID), { customStepsJSON: "[{\"title\":\"Polish\"}]" })));
await check("a member's write that merely repeats the current fee value is not a change and passes",
  assertSucceeds(updateDoc(doc(as(MEMBER), "companySettings", CID), { feePercentage: 2.5, customTogglesJSON: "[]" })));
await check("a viewer cannot write settings at all",
  assertFails(updateDoc(doc(as(VIEWER), "companySettings", CID), { customStepsJSON: "[]" })));

// ---- S#48: the company document cannot be deleted from a client -------------
await check("the owner cannot delete the workspace document from a client",
  assertFails(deleteDoc(doc(as(OWNER), "companies", CID))));
await check("the owner still updates the workspace name",
  assertSucceeds(updateDoc(doc(as(OWNER), "companies", CID), { name: "Audit Co Ltd" })));

await env.cleanup();
if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
console.log("\n✅ AUDIT RULES HARDENING GEÇTİ");

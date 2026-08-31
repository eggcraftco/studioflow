// Five subcollections the wildcard rule was quietly handing to every member.
//
// companies/{cid}/{collectionId}/{document=**} is a DENY LIST: it grants read
// and write to any member of the workspace unless the collection is named in
// it. So a server-written subcollection is open by default, and nothing about
// writing the server code tells you that. Five had been missed:
//
//   supportSettings   — holds supportManagerUids, the list the server reads to
//                       decide who may act on other people's tickets. A member
//                       could append their own uid and grant themselves the
//                       thing the owner/admin check exists to withhold. This is
//                       privilege escalation, not a leak.
//   workspaceTickets  — the server marks some targetRole:"owner_admin".
//   notifications     — every client READS these (the bell), so read stays; but
//                       write was open, and a member could forge or edit another
//                       person's notification. Marking read goes through
//                       markActivityNotificationRead on all three platforms.
//   wooMergedPayments — the "already merged" marker. Writable meant a real
//                       payment could be made to look merged, or counted twice.
//   users             — a server-side member count.
//
// The trap this suite exists to catch: rules are OR'd, so adding an explicit
// deny-only block changes NOTHING while the wildcard still grants. Both places
// have to be edited, and only running it against the emulator proves they were.
//
// Needs the Firestore emulator on 127.0.0.1:8080.
// Run: node test/qa/workspace-private-rules.test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, deleteDoc, updateDoc, setLogLevel } from "firebase/firestore";

setLogLevel("error");
const here = path.dirname(fileURLToPath(import.meta.url));
const RULES = fs.readFileSync(path.join(here, "..", "..", "..", "firestore.rules"), "utf8");

const CO = "acme";
const OWNER = "owner-a";
const MEMBER = "member-b";
const OUTSIDER = "stranger";

const env = await initializeTestEnvironment({
  projectId: "rules-workspace-private-test",
  firestore: { rules: RULES, host: "127.0.0.1", port: 8080 }
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "companies", CO), {
    companyId: CO, ownerUid: OWNER,
    memberUids: [OWNER, MEMBER],
    memberRoles: { [OWNER]: "owner", [MEMBER]: "member" },
    members: { [OWNER]: { role: "owner" }, [MEMBER]: { role: "member" } }
  });
  await setDoc(doc(db, "companies", CO, "supportSettings", "general"), { supportManagerUids: [OWNER] });
  await setDoc(doc(db, "companies", CO, "workspaceTickets", "tkt-1"), { subject: "Billing", targetRole: "owner_admin" });
  await setDoc(doc(db, "companies", CO, "notifications", "n-1"), { title: "New order", readBy: {} });
  await setDoc(doc(db, "companies", CO, "wooMergedPayments", "woo-1"), { merged: true });
  await setDoc(doc(db, "companies", CO, "users", "u-1"), { uid: MEMBER });
});

const owner = env.authenticatedContext(OWNER).firestore();
const member = env.authenticatedContext(MEMBER).firestore();
const outside = env.authenticatedContext(OUTSIDER).firestore();

let failures = 0;
const check = async (name, p) => {
  try { await p; console.log("PASS ", name); }
  catch (e) { failures++; console.log("FAIL ", name, "-", String(e.message).slice(0, 100)); }
};

// ---- supportSettings: the privilege list -----------------------------------
// The one that matters most. Not "a member can see something they shouldn't"
// but "a member can become someone they shouldn't".
await check("a member cannot add themselves to supportManagerUids",
  assertFails(updateDoc(doc(member, "companies", CO, "supportSettings", "general"), { supportManagerUids: [OWNER, MEMBER] })));
await check("a member cannot overwrite the support settings wholesale",
  assertFails(setDoc(doc(member, "companies", CO, "supportSettings", "general"), { supportManagerUids: [MEMBER] })));
await check("a member cannot even read who the support managers are",
  assertFails(getDoc(doc(member, "companies", CO, "supportSettings", "general"))));
// The owner is not an exception. This list is the server's, and the owner
// changes it through a callable that checks far more than membership.
await check("not even the owner writes the privilege list from a client",
  assertFails(setDoc(doc(owner, "companies", CO, "supportSettings", "general"), { supportManagerUids: [OWNER, MEMBER] })));

// ---- workspaceTickets ------------------------------------------------------
await check("a member cannot read an owner_admin ticket",
  assertFails(getDoc(doc(member, "companies", CO, "workspaceTickets", "tkt-1"))));
await check("a member cannot write a ticket directly",
  assertFails(setDoc(doc(member, "companies", CO, "workspaceTickets", "tkt-2"), { subject: "forged" })));

// ---- notifications: read yes, write no -------------------------------------
// The bell has to keep working on all three platforms, so this is the one place
// a closed door would be the bug.
await check("a member still reads the notification bell",
  assertSucceeds(getDoc(doc(member, "companies", CO, "notifications", "n-1"))));
await check("the owner still reads it too",
  assertSucceeds(getDoc(doc(owner, "companies", CO, "notifications", "n-1"))));
await check("a member cannot forge a notification",
  assertFails(setDoc(doc(member, "companies", CO, "notifications", "n-2"), { title: "Pay this invoice" })));
await check("a member cannot edit an existing notification",
  assertFails(updateDoc(doc(member, "companies", CO, "notifications", "n-1"), { title: "changed" })));
await check("a member cannot mark one read by writing readBy directly",
  assertFails(setDoc(doc(member, "companies", CO, "notifications", "n-1"), { readBy: { [MEMBER]: true } }, { merge: true })));
await check("a member cannot delete a notification",
  assertFails(deleteDoc(doc(member, "companies", CO, "notifications", "n-1"))));
await check("an outsider cannot read the bell at all",
  assertFails(getDoc(doc(outside, "companies", CO, "notifications", "n-1"))));

// ---- wooMergedPayments and users ------------------------------------------
await check("a member cannot clear the woo merge marker",
  assertFails(deleteDoc(doc(member, "companies", CO, "wooMergedPayments", "woo-1"))));
await check("a member cannot forge a woo merge marker",
  assertFails(setDoc(doc(member, "companies", CO, "wooMergedPayments", "woo-2"), { merged: true })));
await check("a member cannot read the member-count mirror",
  assertFails(getDoc(doc(member, "companies", CO, "users", "u-1"))));

// ---- the thing that must not have broken ----------------------------------
// Closing five collections in a deny list is one careless keystroke away from
// closing the workspace. Prove the ordinary reads still work.
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "companies", CO, "orderDrafts", "d-1"), { note: "ordinary workspace data" });
});
await check("an unlisted subcollection is still readable by a member",
  assertSucceeds(getDoc(doc(member, "companies", CO, "orderDrafts", "d-1"))));
await check("and still writable by a member",
  assertSucceeds(setDoc(doc(member, "companies", CO, "orderDrafts", "d-2"), { note: "still works" })));
await check("but not by an outsider",
  assertFails(getDoc(doc(outside, "companies", CO, "orderDrafts", "d-1"))));

await env.cleanup();
console.log(failures ? `\n${failures} FAILED` : "\nPASS");
process.exit(failures ? 1 : 0);

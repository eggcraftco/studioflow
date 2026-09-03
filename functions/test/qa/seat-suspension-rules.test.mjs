// A suspended member is out, and everyone else is exactly where they were.
//
// The decision behind this is a security one: an over-limit member left
// read-only would go on reading customer records, invoices and files after they
// stopped being on the team. So suspension has to hold at the RULES, not only
// in the callables — a client talks to Firestore directly on every screen.
//
// The failure this suite is really guarding against is the opposite one. A
// workspace that has never suspended anybody has no suspendedMembers field at
// all, and in Firestore rules an undefined property is an ERROR, not a false —
// and an error denies. Read it without a default and every workspace in
// existence locks out for everybody. That is why the "nothing else changed"
// half below is as long as the suspension half.
//
// Needs the Firestore emulator on 127.0.0.1:8080.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, setLogLevel } from "firebase/firestore";

setLogLevel("error");
const here = path.dirname(fileURLToPath(import.meta.url));
const RULES = fs.readFileSync(path.join(here, "..", "..", "..", "firestore.rules"), "utf8");

const CO = "acme";
const OWNER = "owner-a";
const KEPT = "member-kept";
const GONE = "member-suspended";
const VIEWER = "member-viewer";
const OLD = "member-from-before";

// A second workspace that has never suspended anybody, and so has no
// suspendedMembers field at all. Today that is EVERY workspace in production.
const PLAIN = "plain-co";
const PLAIN_OWNER = "owner-p";
const PLAIN_MEMBER = "member-p";

const env = await initializeTestEnvironment({
  projectId: "rules-seat-suspension-test",
  firestore: { rules: RULES, host: "127.0.0.1", port: 8080 }
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "companies", CO), {
    companyId: CO, ownerUid: OWNER, name: "Acme",
    billingPlan: "team_monthly", billingTeamMemberLimit: 1,
    memberUids: [OWNER, KEPT, GONE, VIEWER, OLD],
    memberRoles: { [OWNER]: "owner", [KEPT]: "member", [GONE]: "member", [VIEWER]: "viewer", [OLD]: "member" },
    members: {
      [OWNER]: { role: "owner" },
      [KEPT]: { role: "member" },
      [GONE]: { role: "member" },
      [VIEWER]: { role: "viewer" },
      [OLD]: { role: "member" }
    },
    suspendedMembers: {
      [GONE]: { reason: "plan_downgrade" },
      [VIEWER]: { reason: "plan_downgrade" }
    }
  });
  await setDoc(doc(db, "companies", PLAIN), {
    companyId: PLAIN, ownerUid: PLAIN_OWNER, name: "Plain",
    billingPlan: "team_monthly", billingTeamMemberLimit: 5,
    memberUids: [PLAIN_OWNER, PLAIN_MEMBER],
    memberRoles: { [PLAIN_OWNER]: "owner", [PLAIN_MEMBER]: "member" },
    members: { [PLAIN_OWNER]: { role: "owner" }, [PLAIN_MEMBER]: { role: "member" } }
  });
  await setDoc(doc(db, "siparisler", "p-1"), { companyId: PLAIN, customerName: "Ada", designName: "Band" });
  await setDoc(doc(db, "companies", PLAIN, "teamChat", "pm-1"), { text: "hello" });
  await setDoc(doc(db, "siparisler", "o-1"), { companyId: CO, customerName: "Jane", designName: "Ring" });
  await setDoc(doc(db, "musteriler", "c-1"), { companyId: CO, name: "Jane" });
  await setDoc(doc(db, "companies", CO, "teamChat", "m-1"), { text: "morning" });
  await setDoc(doc(db, "companies", CO, "notifications", "n-1"), { title: "New order", readBy: {} });
});

const owner = env.authenticatedContext(OWNER).firestore();
const kept = env.authenticatedContext(KEPT).firestore();
const gone = env.authenticatedContext(GONE).firestore();
const viewer = env.authenticatedContext(VIEWER).firestore();
const old = env.authenticatedContext(OLD).firestore();
const plainMember = env.authenticatedContext(PLAIN_MEMBER).firestore();
const plainOwner = env.authenticatedContext(PLAIN_OWNER).firestore();

let failures = 0;
const check = async (name, p) => {
  try { await p; console.log("PASS ", name); }
  catch (e) { failures++; console.log("FAIL ", name, "-", String(e.message).slice(0, 120)); }
};

// ---- the suspended member is out ------------------------------------------
// Orders, customers and chat are the three the decision names by hand:
// "müşteri bilgileri, şirket finansı, dosyalar, sipariş geçmişi".
await check("a suspended member cannot read an order",
  assertFails(getDoc(doc(gone, "siparisler", "o-1"))));
await check("a suspended member cannot read a customer",
  assertFails(getDoc(doc(gone, "musteriler", "c-1"))));
await check("a suspended member cannot read the workspace itself",
  assertFails(getDoc(doc(gone, "companies", CO))));
await check("a suspended member cannot read team chat",
  assertFails(getDoc(doc(gone, "companies", CO, "teamChat", "m-1"))));
await check("a suspended member cannot write team chat",
  assertFails(setDoc(doc(gone, "companies", CO, "teamChat", "m-2"), { text: "still here" })));
await check("a suspended member cannot edit an order",
  assertFails(updateDoc(doc(gone, "siparisler", "o-1"), { customerName: "changed" })));
await check("a suspended member cannot create an order",
  assertFails(setDoc(doc(gone, "siparisler", "o-2"), { companyId: CO, customerName: "New" })));
await check("a suspended member cannot read the notification bell either",
  assertFails(getDoc(doc(gone, "companies", CO, "notifications", "n-1"))));

// Read-only was the rejected design. A suspended viewer — who could ONLY ever
// read — is the case where "leave them read-only" looks harmless and is not.
await check("a suspended viewer cannot read an order either",
  assertFails(getDoc(doc(viewer, "siparisler", "o-1"))));
await check("a suspended viewer cannot read a customer either",
  assertFails(getDoc(doc(viewer, "musteriler", "c-1"))));

// ---- and nobody else moved ------------------------------------------------
await check("the member who kept their seat still reads an order",
  assertSucceeds(getDoc(doc(kept, "siparisler", "o-1"))));
await check("the member who kept their seat still writes one",
  assertSucceeds(updateDoc(doc(kept, "siparisler", "o-1"), { customerName: "Jane Smith" })));
await check("the member who kept their seat still reads team chat",
  assertSucceeds(getDoc(doc(kept, "companies", CO, "teamChat", "m-1"))));
await check("a member from before the flag existed still reads an order",
  assertSucceeds(getDoc(doc(old, "siparisler", "o-1"))));
await check("a member from before the flag existed still writes one",
  assertSucceeds(updateDoc(doc(old, "siparisler", "o-1"), { designName: "Ring, resized" })));
await check("a member from before the flag existed still reads team chat",
  assertSucceeds(getDoc(doc(old, "companies", CO, "teamChat", "m-1"))));
// ---- the workspace that has never suspended anybody ------------------------
// The whole-product failure mode. In Firestore rules an undefined property is
// an ERROR and an error denies, so reading suspendedMembers without a default
// would lock out every workspace that has never used this feature — which,
// on the day it ships, is all of them. Removing the `.get(..., {})` default
// must break these four and nothing above them.
await check("a member of a workspace with no suspensions still reads an order",
  assertSucceeds(getDoc(doc(plainMember, "siparisler", "p-1"))));
await check("a member of a workspace with no suspensions still writes one",
  assertSucceeds(updateDoc(doc(plainMember, "siparisler", "p-1"), { designName: "Band, engraved" })));
await check("a member of a workspace with no suspensions still reads team chat",
  assertSucceeds(getDoc(doc(plainMember, "companies", PLAIN, "teamChat", "pm-1"))));
await check("a member of a workspace with no suspensions still reads the workspace",
  assertSucceeds(getDoc(doc(plainMember, "companies", PLAIN))));
await check("its owner is unaffected too",
  assertSucceeds(getDoc(doc(plainOwner, "companies", PLAIN))));

await check("the owner reads their own workspace",
  assertSucceeds(getDoc(doc(owner, "companies", CO))));
await check("the owner writes an order",
  assertSucceeds(updateDoc(doc(owner, "siparisler", "o-1"), { designName: "Ring" })));

// ---- the flag is the server's ---------------------------------------------
// Suspension that the suspended person can lift is not suspension. `members` is
// already a protected field, so this is a regression guard on that protection
// rather than a new rule.
await check("a suspended member cannot un-suspend themselves",
  assertFails(updateDoc(doc(gone, "companies", CO), { [`suspendedMembers.${GONE}`]: null })));
await check("a member cannot suspend a colleague",
  assertFails(updateDoc(doc(kept, "companies", CO), { [`suspendedMembers.${KEPT}`]: { reason: "x" } })));
// The one this suite was written for. An owner on a Team plan MAY edit the
// members map from a client, so a flag stored inside a member record would have
// been theirs to flip — five paid seats, seven people, no server involved.
await check("not even the owner restores somebody from a client",
  assertFails(updateDoc(doc(owner, "companies", CO), { [`suspendedMembers.${GONE}`]: null })));
await check("not even the owner clears the whole map from a client",
  assertFails(updateDoc(doc(owner, "companies", CO), { suspendedMembers: {} })));

await env.cleanup();
if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
console.log("\n✅ SEAT SUSPENSION RULES GEÇTİ");

// The Sales side documents are the server's: a member may read them, nobody may
// write them from a client, and the company wildcard does not quietly open them.
// The last check is the control — the wildcard is still open elsewhere, so the
// refusals above are this rule's doing and not a global block.
//
// Needs the Firestore emulator on 127.0.0.1:8080.
// Run: firebase emulators:exec --only firestore "node functions/test/qa/sales-rules.test.mjs"
import fs from "fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, collection, setLogLevel } from "firebase/firestore";

setLogLevel("error");
const RULES = fs.readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8");
const env = await initializeTestEnvironment({
  projectId: "rules-sales-faz1-test",
  firestore: { rules: RULES, host: "127.0.0.1", port: 8080 }
});

let failures = 0;
const check = async (name, promise) => {
  try { await promise; console.log("PASS ", name); }
  catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).slice(0, 160)); }
};

const OWNER = "owner-uid", ADMIN = "admin-uid", MEMBER = "member-uid", WORKFLOW = "workflow-uid", STRANGER = "stranger-uid";
const CID = OWNER;

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "companies", CID), {
    companyId: CID, ownerUid: OWNER, name: "Sales Co", billingPlan: "team_monthly", billingStatus: "active",
    memberUids: [OWNER, ADMIN, MEMBER, WORKFLOW],
    memberRoles: { [OWNER]: "owner", [ADMIN]: "admin", [MEMBER]: "member", [WORKFLOW]: "workflowOnly" },
    members: { [OWNER]: { role: "owner" }, [ADMIN]: { role: "admin" }, [MEMBER]: { role: "member" }, [WORKFLOW]: { role: "workflowOnly" } },
    memberAccess: { [MEMBER]: { orders: true, financialInfo: true }, [WORKFLOW]: { orders: true } }
  });
  await setDoc(doc(db, "companies", CID, "salesOrders", "o-1"), { orderId: "o-1", kind: "product_sale", revenue: 1200 });
  await setDoc(doc(db, "companies", CID, "salesProducts", "p-1"), { name: "Seamaster 300", defaultPrice: 3200 });
  await setDoc(doc(db, "companies", CID, "salesSettings", "main"), { visibility: "on" });
});

const as = (uid) => env.authenticatedContext(uid).firestore();

await check("the owner reads the sale rows, the catalog and the preference",
  assertSucceeds(Promise.all([
    getDoc(doc(as(OWNER), "companies", CID, "salesOrders", "o-1")),
    getDoc(doc(as(OWNER), "companies", CID, "salesProducts", "p-1")),
    getDoc(doc(as(OWNER), "companies", CID, "salesSettings", "main"))
  ])));

await check("a member with orders access reads them too",
  assertSucceeds(getDoc(doc(as(MEMBER), "companies", CID, "salesOrders", "o-1"))));

await check("a member can list the sale rows",
  assertSucceeds(getDocs(collection(as(MEMBER), "companies", CID, "salesOrders"))));

await check("a workflow-only member, who never sees money, is refused the sale rows",
  assertFails(getDoc(doc(as(WORKFLOW), "companies", CID, "salesOrders", "o-1"))));

await check("…and the catalog",
  assertFails(getDoc(doc(as(WORKFLOW), "companies", CID, "salesProducts", "p-1"))));

await check("…but may read the workspace's menu preference, which is not money",
  assertSucceeds(getDoc(doc(as(WORKFLOW), "companies", CID, "salesSettings", "main"))));

await check("a stranger reads nothing",
  assertFails(Promise.all([
    getDoc(doc(as(STRANGER), "companies", CID, "salesOrders", "o-1")),
    getDoc(doc(as(STRANGER), "companies", CID, "salesSettings", "main"))
  ])));

await check("the owner cannot write a sale row from a client",
  assertFails(setDoc(doc(as(OWNER), "companies", CID, "salesOrders", "o-2"), { orderId: "o-2", kind: "product_sale" })));

await check("a member cannot invent a product",
  assertFails(setDoc(doc(as(MEMBER), "companies", CID, "salesProducts", "p-2"), { name: "Invented" })));

await check("a member cannot flip the workspace preference directly",
  assertFails(updateDoc(doc(as(MEMBER), "companies", CID, "salesSettings", "main"), { visibility: "off" })));

await check("an admin cannot delete a sale row",
  assertFails(deleteDoc(doc(as(ADMIN), "companies", CID, "salesOrders", "o-1"))));

// The control: the company wildcard still admits an ordinary subcollection, so
// the refusals above come from the Sales rules and the deny list, not from a
// blanket lock that would have failed every write in the workspace.
await check("control: the wildcard still lets a member write an ordinary subcollection",
  assertSucceeds(setDoc(doc(as(MEMBER), "companies", CID, "someOtherThing", "x-1"), { note: "ordinary" })));

await env.cleanup();
console.log(failures === 0 ? "\n✅ SALES RULES GEÇTİ" : `\n❌ ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);

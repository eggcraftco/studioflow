// The Sales side documents are the server's: a member may read them, nobody may
// write them from a client, and the company wildcard does not quietly open them.
// The last check is the control — the wildcard is still open elsewhere, so the
// refusals above are this rule's doing and not a global block.
//
// Needs the Firestore emulator on 127.0.0.1:8080.
// Run: firebase emulators:exec --only firestore "node functions/test/qa/sales-rules.test.mjs"
import fs from "fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, collection, query, where, setLogLevel } from "firebase/firestore";

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

const OWNER = "owner-uid", ADMIN = "admin-uid", MEMBER = "member-uid", WORKFLOW = "workflow-uid", STRANGER = "stranger-uid", ASSIGNED = "assigned-uid";
const CID = OWNER;

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "companies", CID), {
    companyId: CID, ownerUid: OWNER, name: "Sales Co", billingPlan: "team_monthly", billingStatus: "active",
    memberUids: [OWNER, ADMIN, MEMBER, WORKFLOW, ASSIGNED],
    memberRoles: { [OWNER]: "owner", [ADMIN]: "admin", [MEMBER]: "member", [WORKFLOW]: "workflowOnly", [ASSIGNED]: "member" },
    members: { [OWNER]: { role: "owner" }, [ADMIN]: { role: "admin" }, [MEMBER]: { role: "member" }, [WORKFLOW]: { role: "workflowOnly" }, [ASSIGNED]: { role: "member" } },
    memberAccess: {
      [MEMBER]: { orders: true, financialInfo: true },
      [WORKFLOW]: { orders: true },
      // The Orders scope this member already has: their own work only.
      [ASSIGNED]: { orders: true, financialInfo: true, assignedProjectsOnly: true }
    }
  });
  await setDoc(doc(db, "companies", CID, "salesOrders", "o-1"), { orderId: "o-1", kind: "product_sale", revenue: 1200, assignedToUid: ASSIGNED });
  await setDoc(doc(db, "companies", CID, "salesOrders", "o-2"), { orderId: "o-2", kind: "product_sale", revenue: 800, assignedToUid: "someone-else" });

  // The canonical orders these rows are derived from. The rule reads THESE, so
  // the fixture is built to disagree with the rows on purpose:
  //   o-3  the order was reassigned; the row still names the old member
  //   o-4  the order names the member; the row has not caught up
  //   o-5  the order is gone; the row is a leftover
  //   o-6  the row is filed under this workspace; the order belongs to another
  await setDoc(doc(db, "siparisler", "o-1"), { companyId: CID, assignedToUid: ASSIGNED });
  await setDoc(doc(db, "siparisler", "o-2"), { companyId: CID, assignedToUid: "someone-else" });
  await setDoc(doc(db, "companies", CID, "salesOrders", "o-3"), { orderId: "o-3", kind: "product_sale", assignedToUid: ASSIGNED });
  await setDoc(doc(db, "siparisler", "o-3"), { companyId: CID, assignedToUid: "someone-else" });
  await setDoc(doc(db, "companies", CID, "salesOrders", "o-4"), { orderId: "o-4", kind: "product_sale", assignedToUid: "" });
  await setDoc(doc(db, "siparisler", "o-4"), { companyId: CID, assignedToUid: ASSIGNED });
  await setDoc(doc(db, "companies", CID, "salesOrders", "o-5"), { orderId: "o-5", kind: "product_sale", assignedToUid: ASSIGNED });
  await setDoc(doc(db, "companies", CID, "salesOrders", "o-6"), { orderId: "o-6", kind: "product_sale", assignedToUid: ASSIGNED });
  await setDoc(doc(db, "siparisler", "o-6"), { companyId: "another-workspace", assignedToUid: ASSIGNED });
  await setDoc(doc(db, "companies", CID, "salesSettings", "projection"), { catchUpRequired: false, backfill: { cursor: "o-1" } });
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

// Listing is gone on purpose, for everybody. The rule asks the canonical order
// for each returned document, and a query would need one get() per row — more
// than rules allow. listSalesRows is the list, and it reads `siparisler` itself.
await check("nobody lists this collection from a client any more, not even the owner",
  assertFails(getDocs(collection(as(OWNER), "companies", CID, "salesOrders"))));

await check("a workflow-only member, who never sees money, is refused the sale rows",
  assertFails(getDoc(doc(as(WORKFLOW), "companies", CID, "salesOrders", "o-1"))));

await check("…and the catalog",
  assertFails(getDoc(doc(as(WORKFLOW), "companies", CID, "salesProducts", "p-1"))));

await check("…but may read the workspace's menu preference, which is not money",
  assertSucceeds(getDoc(doc(as(WORKFLOW), "companies", CID, "salesSettings", "main"))));

await check("an assigned-only member reads the row of an order assigned to them",
  assertSucceeds(getDoc(doc(as(ASSIGNED), "companies", CID, "salesOrders", "o-1"))));

await check("…and not the row of somebody else's order",
  assertFails(getDoc(doc(as(ASSIGNED), "companies", CID, "salesOrders", "o-2"))));

await check("…and an own-rows query is refused too: the filter reads the row, the rule reads the order",
  assertFails(getDocs(query(collection(as(ASSIGNED), "companies", CID, "salesOrders"), where("assignedToUid", "==", ASSIGNED)))));

await check("…but not the whole workspace's rows",
  assertFails(getDocs(collection(as(ASSIGNED), "companies", CID, "salesOrders"))));

// Permission comes from the order. Six checks, because each clause can rot alone.
await check("a reassigned order cuts the former assignee off, even while the row still names them",
  assertFails(getDoc(doc(as(ASSIGNED), "companies", CID, "salesOrders", "o-3"))));

await check("the control: a member who sees the whole workspace still reads that same row",
  assertSucceeds(getDoc(doc(as(MEMBER), "companies", CID, "salesOrders", "o-3"))));

await check("the order decides the other way too: it names them, the row has not caught up",
  assertSucceeds(getDoc(doc(as(ASSIGNED), "companies", CID, "salesOrders", "o-4"))));

await check("a leftover row whose order was deleted is refused — to the assigned member",
  assertFails(getDoc(doc(as(ASSIGNED), "companies", CID, "salesOrders", "o-5"))));

await check("…and to a member who can see the whole workspace, who has no order to be authorised against",
  assertFails(getDoc(doc(as(MEMBER), "companies", CID, "salesOrders", "o-5"))));

await check("a row filed under this workspace whose order belongs to another is refused",
  assertFails(getDoc(doc(as(MEMBER), "companies", CID, "salesOrders", "o-6"))));

// The projection's progress record is operational state, not a preference: its
// cursor is an order id, and a workflow-only member may read this collection.
await check("the projection state document is server-only",
  assertFails(getDoc(doc(as(MEMBER), "companies", CID, "salesSettings", "projection"))));

await check("the control: the menu preference beside it is still readable",
  assertSucceeds(getDoc(doc(as(MEMBER), "companies", CID, "salesSettings", "main"))));

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

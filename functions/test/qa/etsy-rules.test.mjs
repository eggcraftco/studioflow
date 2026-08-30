// The Etsy collections hold OAuth tokens for somebody else's shop. No client
// should be able to reach any of them — not an outsider, not a workspace
// member, not the workspace owner. Everything goes through callables so the
// server can check the role first.
//
// This is tested rather than assumed because the rules file grants by OR: a
// single over-broad match anywhere else in it would quietly open these, and
// reading the file would not tell you.
//
// Needs the Firestore emulator on 127.0.0.1:8080 and @firebase/rules-unit-testing.
// Run: node test/qa/etsy-rules.test.mjs
import fs from "fs";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, deleteDoc, updateDoc, setLogLevel } from "firebase/firestore";
import path from "path";
import { fileURLToPath } from "url";

setLogLevel("error");
const here = path.dirname(fileURLToPath(import.meta.url));
const RULES = fs.readFileSync(path.join(here, "..", "..", "..", "firestore.rules"), "utf8");
const CO = "acme";
const OWNER = "owner-a";
const MEMBER = "member-b";
const OUTSIDER = "stranger";

const env = await initializeTestEnvironment({
  projectId: "rules-etsy-test",
  firestore: { rules: RULES, host: "127.0.0.1", port: 8080 }
});

// A real workspace with a real owner and a real member, so the test proves the
// collections are closed to people who genuinely belong here.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "companies", CO), {
    ownerUid: OWNER,
    authorizedUsers: [OWNER, MEMBER],
    companyName: "Acme"
  });
  await setDoc(doc(db, "etsyConnections", "conn1"), {
    companyId: CO,
    externalShopId: "222",
    accessTokenEncrypted: { v: 1, iv: "x", tag: "y", data: "z" }
  });
  await setDoc(doc(db, "etsyOAuthStates", "state1"), { companyId: CO, uid: OWNER });
  await setDoc(doc(db, "etsyExternalOrders", `${CO}_222_333`), { companyId: CO });
  await setDoc(doc(db, "etsyCustomerLinks", `${CO}_222_444`), { companyId: CO });
  await setDoc(doc(db, "etsyWebhookEvents", "wh1"), { companyId: CO });
});

const PATHS = [
  ["etsyConnections", "conn1"],
  ["etsyOAuthStates", "state1"],
  ["etsyExternalOrders", `${CO}_222_333`],
  ["etsyCustomerLinks", `${CO}_222_444`],
  ["etsyWebhookEvents", "wh1"]
];

const people = [
  ["the workspace owner", env.authenticatedContext(OWNER)],
  ["a workspace member", env.authenticatedContext(MEMBER)],
  ["an outsider", env.authenticatedContext(OUTSIDER)],
  ["a signed-out visitor", env.unauthenticatedContext()]
];

let failed = 0;
async function mustFail(what, promise) {
  try { await assertFails(promise); console.log("  ok  " + what); } catch (error) {
    failed += 1;
    console.log("  FAIL " + what + "\n        " + (error?.message || error));
  }
}

console.log("Etsy collections are closed to every client");

for (const [who, ctx] of people) {
  const db = ctx.firestore();
  for (const [collection, id] of PATHS) {
    await mustFail(`${who} cannot read ${collection}`, getDoc(doc(db, collection, id)));
    await mustFail(`${who} cannot write ${collection}`, setDoc(doc(db, collection, id), { hijacked: true }));
    await mustFail(`${who} cannot update ${collection}`, updateDoc(doc(db, collection, id), { hijacked: true }));
    await mustFail(`${who} cannot delete ${collection}`, deleteDoc(doc(db, collection, id)));
  }
  // Creating a brand new connection pointed at someone else's workspace is the
  // interesting one: it would be a way to make the server sync into your shop.
  await mustFail(`${who} cannot create a new connection`, setDoc(doc(db, "etsyConnections", "forged"), { companyId: CO }));
}

await env.cleanup();
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nPASS");

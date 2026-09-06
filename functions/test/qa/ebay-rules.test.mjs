// The eBay collections hold a seller's OAuth boxes, connect states bound to a
// browser, a buyer index keyed by hash, the deletion ledger, the daily quota
// counter and the signing-key cache — and, per workspace, a buyer's protected
// details and the reveal counters. No client may reach any of them: not an
// outsider, not a member, not the owner. Everything goes through callables.
//
// Tested rather than assumed because the rules file grants by OR: one
// over-broad match elsewhere would quietly open these.
//
// Needs the Firestore emulator on 127.0.0.1:8080. Run: node test/qa/ebay-rules.test.mjs
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

const env = await initializeTestEnvironment({ projectId: "rules-ebay-test", firestore: { rules: RULES, host: "127.0.0.1", port: 8080 } });

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "companies", CO), { ownerUid: OWNER, authorizedUsers: [OWNER, MEMBER], companyName: "Acme", memberAccess: { [MEMBER]: { restrictedCustomer: true } } });
  await setDoc(doc(db, "ebayConnections", `${CO}__seller`), { companyId: CO, provider: "ebay", status: "connected", sellerUserIdHash: "abc" });
  await setDoc(doc(db, "ebayConnections", `${CO}__seller`, "credentials", "current"), { accessTokenEncrypted: { v: 1, iv: "x", tag: "y", data: "z" } });
  await setDoc(doc(db, "ebayConnectStates", "state1"), { companyId: CO, uid: OWNER, nonceHash: "h" });
  await setDoc(doc(db, "ebayBuyers", `${CO}__hash`), { companyId: CO, usernameHash: "hash", orderIds: ["o1"] });
  await setDoc(doc(db, "ebayDeletionRequests", "n1"), { status: "queued", usernameHash: "hash" });
  await setDoc(doc(db, "ebayQuota", "2026-09-06"), { calls: 1 });
  await setDoc(doc(db, "ebayNotificationKeys", "kid1"), { key: "pem" });
  await setDoc(doc(db, "companies", CO, "restrictedCustomer", "o1"), { provider: "ebay", fields: { fullName: "Ada" } });
  await setDoc(doc(db, "companies", CO, "revealCounters", MEMBER), { hourCount: 1 });
});

const PATHS = [
  ["ebayConnections", `${CO}__seller`],
  ["ebayConnections", `${CO}__seller`, "credentials", "current"],
  ["ebayConnectStates", "state1"],
  ["ebayBuyers", `${CO}__hash`],
  ["ebayDeletionRequests", "n1"],
  ["ebayQuota", "2026-09-06"],
  ["ebayNotificationKeys", "kid1"],
  ["companies", CO, "restrictedCustomer", "o1"],
  ["companies", CO, "revealCounters", MEMBER]
];

const people = [
  ["the workspace owner", env.authenticatedContext(OWNER)],
  ["a member with the reveal grant", env.authenticatedContext(MEMBER)],
  ["an outsider", env.authenticatedContext(OUTSIDER)],
  ["a signed-out visitor", env.unauthenticatedContext()]
];

let failed = 0;
async function mustFail(what, promise) {
  try { await assertFails(promise); console.log("  ok  " + what); } catch (error) { failed += 1; console.log("  FAIL " + what + "\n        " + (error?.message || error)); }
}

console.log("eBay collections are closed to every client");
for (const [who, ctx] of people) {
  const db = ctx.firestore();
  for (const segments of PATHS) {
    const label = segments.join("/");
    await mustFail(`${who} cannot read ${label}`, getDoc(doc(db, ...segments)));
    await mustFail(`${who} cannot write ${label}`, setDoc(doc(db, ...segments), { hijacked: true }));
    await mustFail(`${who} cannot update ${label}`, updateDoc(doc(db, ...segments), { hijacked: true }));
    await mustFail(`${who} cannot delete ${label}`, deleteDoc(doc(db, ...segments)));
  }
  await mustFail(`${who} cannot create a connection pointed at the workspace`, setDoc(doc(db, "ebayConnections", "forged"), { companyId: CO, status: "connected" }));
  await mustFail(`${who} cannot mint a connect state`, setDoc(doc(db, "ebayConnectStates", "forged"), { companyId: CO, uid: OWNER, nonceHash: "x" }));
  await mustFail(`${who} cannot write a restricted buyer document`, setDoc(doc(db, "companies", CO, "restrictedCustomer", "forged"), { fields: {} }));
  await mustFail(`${who} cannot reset a reveal counter`, setDoc(doc(db, "companies", CO, "revealCounters", MEMBER), { hourCount: 0 }));
}

await env.cleanup();
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nPASS");

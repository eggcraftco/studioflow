// The payment rail's collections are server-only, in both directions.
//
// This file exists because of how firestore.rules is shaped: the
// `match /companies/{companyId}/{collectionId}/{document=**}` wildcard is a
// DENY LIST, so a new subcollection nobody adds to it is readable AND writable
// by every member of the workspace. Security here is "open if you forget", not
// "closed by default", and a block of its own does not help — Firestore OR's
// rules, so a narrower block cannot take back what the wildcard already gave.
//
// Four collections, and a sentence each for why closed:
//
//   paymentConnections     the connected Stripe account id: the credential that
//                          says where a workspace's money lands. Read is closed
//                          too; clients get publicSummary() from a callable.
//   paymentRequests        provider session ids and the amount asked for.
//   paymentConnectionIndex account -> workspace. Readable, it is a map of every
//                          workspace's provider account.
//   paymentProviderEvents  the idempotency record. Writable, a real payment
//                          event could be made to look already-handled.
//
// The control at the end is the point of the file: it proves the harness CAN
// write a workspace subcollection, so the four denials above are the rules
// working and not the test failing to authenticate.
//
// Needs the Firestore emulator (emulators:exec exports FIRESTORE_EMULATOR_HOST).
// Run: npm run test:rules
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, setLogLevel } from "firebase/firestore";

setLogLevel("error");
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..", "..");
const RULES = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

function emulator(variable, defaultPort) {
  const [host, port] = String(process.env[variable] || "").split(":");
  return { host: host || "127.0.0.1", port: Number(port) || defaultPort };
}

const CO = "acme-pay";
const OWNER = "uid-owner";
const MEMBER = "uid-member";
const PROJECT = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || "eggcraft-studio";

const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules: RULES, ...emulator("FIRESTORE_EMULATOR_HOST", 8080) }
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "companies", CO), {
    ownerUid: OWNER,
    authorizedUsers: [OWNER, MEMBER],
    companyName: "Acme",
    members: { [OWNER]: { role: "owner" }, [MEMBER]: { role: "member" } }
  });
  // Seed real rows, so the read denials below are denials and not "not found".
  await setDoc(doc(db, "companies", CO, "paymentConnections", "stripe"), { provider: "stripe", stripeAccountId: "acct_secret", status: "ready" });
  await setDoc(doc(db, "companies", CO, "paymentRequests", "pr_1"), { orderId: "o1", amountMinor: 1999, providerSessionId: "cs_secret" });
  await setDoc(doc(db, "paymentConnectionIndex", "stripe:acct_secret"), { provider: "stripe", companyId: CO });
  await setDoc(doc(db, "paymentProviderEvents", "stripe:acct_secret:evt_1"), { provider: "stripe", processedAt: 1 });
});

let failures = 0;
const check = async (name, run) => {
  try { await run(); console.log(`PASS  ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL  ${name} - ${String((error && error.message) || error).slice(0, 300)}`); }
};

const CLOSED = [
  ["the workspace's Stripe connection", (db) => doc(db, "companies", CO, "paymentConnections", "stripe"), { status: "ready" }],
  ["a payment request", (db) => doc(db, "companies", CO, "paymentRequests", "pr_1"), { amountMinor: 1 }],
  ["the connected-account index", (db) => doc(db, "paymentConnectionIndex", "stripe:acct_secret"), { companyId: "somewhere-else" }],
  ["the provider event ledger", (db) => doc(db, "paymentProviderEvents", "stripe:acct_secret:evt_1"), { processedAt: 2 }]
];

for (const [label, target, patch] of CLOSED) {
  await check(`the owner cannot read or write ${label}`, async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(getDoc(target(db)));
    await assertFails(setDoc(target(db), patch, { merge: true }));
  });
  await check(`a member cannot read or write ${label}`, async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(getDoc(target(db)));
    await assertFails(setDoc(target(db), patch, { merge: true }));
  });
}

await check("an unauthenticated client cannot read any of them", async () => {
  const db = env.unauthenticatedContext().firestore();
  for (const [, target] of CLOSED) await assertFails(getDoc(target(db)));
});

await check("a member cannot create a NEW document in either workspace collection", async () => {
  // The wildcard's write list is the half that is easy to add to only the read
  // list and never notice, because reads are what a developer tries by hand.
  const db = env.authenticatedContext(MEMBER).firestore();
  await assertFails(setDoc(doc(db, "companies", CO, "paymentConnections", "planted"), { provider: "stripe" }));
  await assertFails(setDoc(doc(db, "companies", CO, "paymentRequests", "planted"), { amountMinor: 1 }));
});

await check("CONTROL: the same member CAN write an ordinary workspace subcollection", async () => {
  const db = env.authenticatedContext(MEMBER).firestore();
  await assertSucceeds(setDoc(doc(db, "companies", CO, "someOrdinaryThing", "x"), { hello: "world" }));
});

await env.cleanup();
if (failures) { console.log(`\n${failures} payment collection rule check(s) failed.`); process.exit(1); }
console.log("\nAll payment collection rule checks passed.");

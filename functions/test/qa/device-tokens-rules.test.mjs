// Push tokens under the old wildcard were readable and deletable by every
// member of the workspace. This is the rule that fixed that, tested against the
// emulator as three different people - because the first version of it still
// let a colleague's row be taken over by a merge write, and only running it
// showed that.
//
// Needs the Firestore emulator on 127.0.0.1:8080 and @firebase/rules-unit-testing.
// Run: node test/qa/device-tokens-rules.test.mjs
import fs from "fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, deleteDoc, setLogLevel } from "firebase/firestore";

setLogLevel("error");
import path from "path";
import { fileURLToPath } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const RULES = fs.readFileSync(path.join(here, "..", "..", "..", "firestore.rules"), "utf8");
const CO = "acme";
const ME = "member-a";
const COLLEAGUE = "member-b";
const OUTSIDER = "stranger";

const env = await initializeTestEnvironment({
  projectId: "rules-devicetokens-test",
  firestore: { rules: RULES, host: "127.0.0.1", port: 8080 }
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "companies", CO), {
    companyId: CO, ownerUid: ME,
    memberUids: [ME, COLLEAGUE],
    memberRoles: { [ME]: "owner", [COLLEAGUE]: "member" },
    members: { [ME]: { role: "owner" }, [COLLEAGUE]: { role: "member" } }
  });
  // A token already belonging to the colleague, to try to steal.
  await setDoc(doc(db, "companies", CO, "deviceTokens", "tok-colleague"), {
    token: "tok-colleague", companyId: CO, userId: COLLEAGUE, platform: "Android", enabled: true
  });
});

const mine = env.authenticatedContext(ME).firestore();
const theirs = env.authenticatedContext(COLLEAGUE).firestore();
const outside = env.authenticatedContext(OUTSIDER).firestore();
const row = (uid) => ({ token: "t", companyId: CO, userId: uid, platform: "Web", enabled: true });
let failures = 0;
const check = async (name, p) => {
  try { await p; console.log("PASS ", name); }
  catch (e) { failures++; console.log("FAIL ", name, "-", String(e.message).slice(0, 90)); }
};

// What every app does on sign-in, and on sign-out. These must keep working.
await check("a member registers their own device",
  assertSucceeds(setDoc(doc(mine, "companies", CO, "deviceTokens", "tok-mine"), row(ME))));
await check("the same member refreshes that row",
  assertSucceeds(setDoc(doc(mine, "companies", CO, "deviceTokens", "tok-mine"), row(ME), { merge: true })));
await check("a member removes their own token on sign-out",
  assertSucceeds(deleteDoc(doc(mine, "companies", CO, "deviceTokens", "tok-mine"))));
await check("the colleague registers their own device too",
  assertSucceeds(setDoc(doc(theirs, "companies", CO, "deviceTokens", "tok-b"), row(COLLEAGUE))));

// What the old wildcard allowed, and must not any more.
await check("a member cannot read a colleague's token",
  assertFails(getDoc(doc(mine, "companies", CO, "deviceTokens", "tok-colleague"))));
await check("a member cannot delete a colleague's token and silence their alerts",
  assertFails(deleteDoc(doc(mine, "companies", CO, "deviceTokens", "tok-colleague"))));
await check("a member cannot overwrite a colleague's token",
  assertFails(setDoc(doc(mine, "companies", CO, "deviceTokens", "tok-colleague"), row(ME), { merge: true })));
await check("a member cannot register a row in someone else's name",
  assertFails(setDoc(doc(mine, "companies", CO, "deviceTokens", "tok-forged"), row(COLLEAGUE))));
await check("someone outside the workspace cannot register at all",
  assertFails(setDoc(doc(outside, "companies", CO, "deviceTokens", "tok-out"), row(OUTSIDER))));
await check("nobody reads their own token back either (the server does the reading)",
  assertFails(getDoc(doc(theirs, "companies", CO, "deviceTokens", "tok-b"))));

await env.cleanup();
console.log(failures ? `\n${failures} FAILED` : "\nAll deviceTokens rule checks passed.");
process.exit(failures ? 1 : 0);

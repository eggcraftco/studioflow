// The retention collections: the state, the per-campaign log and the inbound replies are the
// sweep's bookkeeping and the owner's own words — closed to every client, member and owner alike.
// The messages are what a Home screen shows: a member reads them, nobody writes them from a
// client (dismissal is a callable). Tested rather than assumed because the rules file grants by OR.
//
// Needs the Firestore emulator on 127.0.0.1:8080. Run: node test/qa/retention-rules.test.mjs
import fs from "fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
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
  projectId: "rules-retention-test",
  firestore: { rules: RULES, host: "127.0.0.1", port: 8080 }
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "companies", CO), { ownerUid: OWNER, memberUids: [OWNER, MEMBER], authorizedUsers: [OWNER, MEMBER], members: { [OWNER]: { role: "owner" }, [MEMBER]: { role: "member" } }, companyName: "Acme" });
  await setDoc(doc(db, "companies", CO, "retention", "state"), { supportCaseOpenAtMs: 0, userRepliedAtMs: 0, optOut: false });
  await setDoc(doc(db, "companies", CO, "retentionLog", "founder_intro__email"), { status: "sent", campaign: "founder_intro", channel: "email" });
  await setDoc(doc(db, "companies", CO, "retentionMessages", "m1"), { campaign: "finish_onboarding", title: "Finish setting up", action: "open_checklist" });
  await setDoc(doc(db, "companies", CO, "retentionInbound", "i1"), { kind: "reply", subject: "Re: hello", text: "the owner's own words" });
  await setDoc(doc(db, "retentionReplyKeys", "k1"), { companyId: CO });
});

let failures = 0;
const results = [];
async function expectFail(label, promise) {
  try { await assertFails(promise); results.push(`  ok  ${label}`); }
  catch (error) { failures += 1; results.push(`  FAIL ${label}: ${error.message}`); }
}
async function expectOk(label, promise) {
  try { await assertSucceeds(promise); results.push(`  ok  ${label}`); }
  catch (error) { failures += 1; results.push(`  FAIL ${label}: ${error.message}`); }
}

const who = { outsider: env.authenticatedContext(OUTSIDER).firestore(), member: env.authenticatedContext(MEMBER).firestore(), owner: env.authenticatedContext(OWNER).firestore(), anon: env.unauthenticatedContext().firestore() };
const closed = [["companies", CO, "retention", "state"], ["companies", CO, "retentionLog", "founder_intro__email"], ["companies", CO, "retentionInbound", "i1"], ["retentionReplyKeys", "k1"]];
for (const [name, db] of Object.entries(who)) {
  for (const p of closed) {
    const label = `${name} cannot touch ${p.join("/")}`;
    await expectFail(`${label} (read)`, getDoc(doc(db, ...p)));
    await expectFail(`${label} (write)`, setDoc(doc(db, ...p), { x: 1 }, { merge: true }));
    await expectFail(`${label} (update)`, updateDoc(doc(db, ...p), { x: 1 }));
    await expectFail(`${label} (delete)`, deleteDoc(doc(db, ...p)));
  }
  const m = ["companies", CO, "retentionMessages", "m1"];
  if (name === "member" || name === "owner") await expectOk(`${name} reads the workspace's message`, getDoc(doc(db, ...m)));
  else await expectFail(`${name} cannot read the workspace's message`, getDoc(doc(db, ...m)));
  await expectFail(`${name} cannot write a message`, setDoc(doc(db, "companies", CO, "retentionMessages", "m2"), { campaign: "x" }));
  await expectFail(`${name} cannot dismiss by writing`, updateDoc(doc(db, ...m), { dismissed: true }));
  await expectFail(`${name} cannot delete a message`, deleteDoc(doc(db, ...m)));
}
console.log(results.join("\n"));
await env.cleanup();
console.log(failures ? `\n❌ RETENTION RULES: ${failures} FAIL` : "\n✅ RETENTION RULES GEÇTİ");
process.exit(failures ? 1 : 0);

// The feedback collections are server-only: the note itself (feedback/{id}) and a
// person's prompt state (companies/{cid}/feedbackState/{uid}). No client may read
// or write either — not an outsider, not a member, not the owner, not the
// person the state is about. The rules file grants by OR, so this is executed
// rather than assumed.
//
// Needs the Firestore emulator on 127.0.0.1:8080. Run: node test/qa/feedback-rules.test.mjs
import fs from "fs";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, deleteDoc, updateDoc, collection, getDocs, setLogLevel } from "firebase/firestore";
import path from "path";
import { fileURLToPath } from "url";

setLogLevel("error");
const here = path.dirname(fileURLToPath(import.meta.url));
const RULES = fs.readFileSync(path.join(here, "..", "..", "..", "firestore.rules"), "utf8");
const CO = "acme";
const OWNER = "owner-a";
const MEMBER = "member-b";
const OUTSIDER = "stranger";
const ADMIN = "admin-c";

const env = await initializeTestEnvironment({ projectId: "rules-feedback-test", firestore: { rules: RULES, host: "127.0.0.1", port: 8080 } });

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "companies", CO), { ownerUid: OWNER, authorizedUsers: [OWNER, MEMBER], companyName: "Acme", memberUids: [OWNER, MEMBER], members: { [OWNER]: { role: "owner" }, [MEMBER]: { role: "member" } } });
  await setDoc(doc(db, "feedback", "fb_seed1"), { id: "fb_seed1", companyId: CO, uid: OWNER, text: "seeded note", status: "new", createdAtMs: 1 });
  await setDoc(doc(db, "companies", CO, "feedbackState", OWNER), { uid: OWNER, companyId: CO, shows: [] });
});

let failures = 0;
async function check(name, fn) { try { await fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error?.message || error).slice(0, 200)); } }

const identities = [
  ["the owner", env.authenticatedContext(OWNER, { email: "owner@acme.test", email_verified: true })],
  ["a member", env.authenticatedContext(MEMBER, { email: "member@acme.test", email_verified: true })],
  ["an outsider", env.authenticatedContext(OUTSIDER, { email: "x@other.test", email_verified: true })],
  ["a support-admin address (rules do not know admins; callables do)", env.authenticatedContext(ADMIN, { email: "contact@eggcraft.co.uk", email_verified: true })],
  ["nobody", env.unauthenticatedContext()]
];

for (const [who, ctx] of identities) {
  const db = ctx.firestore();
  await check(`${who} cannot read a feedback note`, () => assertFails(getDoc(doc(db, "feedback", "fb_seed1"))));
  await check(`${who} cannot list feedback`, () => assertFails(getDocs(collection(db, "feedback"))));
  await check(`${who} cannot create, change or delete a feedback note`, async () => {
    await assertFails(setDoc(doc(db, "feedback", "fb_new_1"), { companyId: CO, text: "hi" }));
    await assertFails(updateDoc(doc(db, "feedback", "fb_seed1"), { status: "closed" }));
    await assertFails(deleteDoc(doc(db, "feedback", "fb_seed1")));
  });
  await check(`${who} cannot read or write the prompt state`, async () => {
    await assertFails(getDoc(doc(db, "companies", CO, "feedbackState", OWNER)));
    await assertFails(getDocs(collection(db, "companies", CO, "feedbackState")));
    await assertFails(setDoc(doc(db, "companies", CO, "feedbackState", OWNER), { shows: [], done: ["first_success_feedback"] }));
    await assertFails(setDoc(doc(db, "companies", CO, "feedbackState", MEMBER), { shows: [] }));
    await assertFails(deleteDoc(doc(db, "companies", CO, "feedbackState", OWNER)));
  });
}

await env.cleanup();
console.log(failures === 0 ? "\n✅ FEEDBACK RULES GEÇTİ" : `\n❌ FEEDBACK RULES: ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);

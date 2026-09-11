// Feedback v1 native contract against the emulators: a send from a "Mac" and an "Android"
// client and one web-shaped send (no platform) through the real submitFeedback callable, then
// the record and the admin inbox row (listFeedback) — the flow the native screens use.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
import admin from "firebase-admin";
admin.initializeApp({ projectId: "eggcraft-studio" });
const db = admin.firestore();
const FN = "http://127.0.0.1:5001/eggcraft-studio/europe-west2";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key";
const COMPANY = "qa-fb-native", OWNER = "qa-fb-native-owner", ADMIN = "qa-fb-native-admin";
const OWNER_EMAIL = "owner-native@nivadesk.app", ADMIN_EMAIL = "nivadesk@gmail.com"; // admin address is one of SUPPORT_ADMIN_EMAILS; emulator-only user

async function user(uid, email) { try { await admin.auth().deleteUser(uid); } catch {} await admin.auth().createUser({ uid, email, emailVerified: true, displayName: uid }); }
async function idToken(uid) { const custom = await admin.auth().createCustomToken(uid); const r = await fetch(AUTH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }) }); const j = await r.json(); if (!j.idToken) throw new Error("no idToken: " + JSON.stringify(j).slice(0, 200)); return j.idToken; }
async function call(name, token, data) { const r = await fetch(`${FN}/${name}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) }); const j = await r.json().catch(() => ({})); return { status: r.status, result: j.result, error: j.error }; }

const out = [];
const log = (...a) => { const line = a.map((x) => typeof x === "string" ? x : JSON.stringify(x)).join(" "); out.push(line); console.log(line); };
await user(OWNER, OWNER_EMAIL); await user(ADMIN, ADMIN_EMAIL);
await db.collection("companies").doc(COMPANY).set({ name: "Native QA Studio", ownerUid: OWNER, members: { [OWNER]: { role: "owner", email: OWNER_EMAIL } }, memberRoles: { [OWNER]: "owner" }, createdAtMs: Date.now() - 86400000 });
await db.collection("users").doc(OWNER).set({ email: OWNER_EMAIL, activeCompanyId: COMPANY });
const owner = await idToken(OWNER), adminTok = await idToken(ADMIN);

log("1. availability (what the native menu asks):", await call("getFeedbackPrompt", owner, { companyId: COMPANY }));
const sends = [
  ["mac", { companyId: COMPANY, trigger: "manual", experience: "easy", kind: "suggestion", text: "Native QA note from the Mac form", page: "mac/orders", clientKey: "native-mac-" + Date.now(), language: "Türkçe", platform: "mac" }],
  ["android", { companyId: COMPANY, trigger: "manual", experience: "difficult", kind: "problem", text: "Native QA note from the Android dialog", page: "android/orders", clientKey: "native-android-" + Date.now(), language: "English", platform: "android" }],
  ["web-shaped (no platform, today's web client)", { companyId: COMPANY, trigger: "manual", experience: "okay", kind: "", text: "Web-shaped note", page: "/orders", clientKey: "web-" + Date.now(), language: "English" }],
  ["refused platform", { companyId: COMPANY, trigger: "manual", experience: "okay", text: "x", platform: "windows" }]
];
const ids = [];
for (const [label, data] of sends) {
  const r = await call("submitFeedback", owner, data);
  log(`2. submitFeedback [${label}] →`, { status: r.status, result: r.result, error: r.error && { status: r.error.status, message: r.error.message } });
  if (r.result && r.result.id) { const snap = await db.collection("feedback").doc(r.result.id).get(); const d = snap.data() || {}; ids.push(r.result.id); log(`   record ${r.result.id}:`, { companyId: d.companyId, uid: d.uid, platform: d.platform, source: d.source, trigger: d.trigger, kind: d.kind, experience: d.experience, page: d.page, language: d.language, status: d.status }); }
}
const inbox = await call("listFeedback", adminTok, { limit: 20 });
log("3. listFeedback as admin (the inbox):", { status: inbox.status, error: inbox.error && inbox.error.message, rows: (inbox.result && inbox.result.rows || []).filter((row) => row.companyId === COMPANY).map((row) => ({ id: row.id, platform: row.platform, workspaceName: row.workspaceName, kind: row.kind, experience: row.experience, page: row.page, status: row.status })) });
if (ids[0]) { const detail = await call("getFeedbackDetail", adminTok, { id: ids[0] }); log("4. getFeedbackDetail (inbox detail) platform:", detail.result && detail.result.feedback && detail.result.feedback.platform, "workspace:", detail.result && detail.result.feedback && detail.result.feedback.workspaceName); }
const asOwner = await call("listFeedback", owner, { limit: 5 });
log("5. listFeedback as the owner (not an admin) →", asOwner.status, asOwner.error && asOwner.error.message);
await import("node:fs").then((fs) => fs.writeFileSync(process.env.OUT || "/tmp/native-feedback-emulator.out", out.join("\n") + "\n"));
process.exit(0);

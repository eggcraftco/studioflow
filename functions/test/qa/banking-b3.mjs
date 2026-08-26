// Banking B3: en-özgül-kural-kazanır + kural izi, disconnect/purge ayrımı.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "eggcraft-studio" });
const db = admin.firestore();

const S = new URL(".", import.meta.url).pathname;
const { companyId, customToken } = JSON.parse(readFileSync(`${S}/seed-out.json`, "utf8"));
const authRes = await fetch(
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key",
  { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
const { idToken } = await authRes.json();
const BASE = "http://127.0.0.1:5001/eggcraft-studio/europe-west2";
async function call(name, data = {}) {
  const res = await fetch(`${BASE}/${name}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data: { companyId, ...data } })
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}
let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

const txCol = db.collection("companies").doc(companyId).collection("bankTransactions");
const ruleCol = db.collection("companies").doc(companyId).collection("bankRules");
const connCol = db.collection("companies").doc(companyId).collection("bankConnections");

// temizlik
for (const doc of (await ruleCol.where("keyword", "in", ["google", "google workspace"]).get()).docs) await doc.ref.delete();
for (const id of ["b3_tx_ws", "b3_tx_ads", "b3_keep_1"]) await txCol.doc(id).delete();
await connCol.doc("b3-conn").delete();

console.log("=== 1) en özgül kural kazanır + kural izi ===");
await txCol.doc("b3_tx_ws").set({ accountId: "acc1", status: "booked", amount: -14, currency: "GBP", bookingDate: "2026-08-18", description: "GOOGLE WORKSPACE", counterparty: "Google Workspace" });
await txCol.doc("b3_tx_ads").set({ accountId: "acc1", status: "booked", amount: -240, currency: "GBP", bookingDate: "2026-08-18", description: "GOOGLE ADS", counterparty: "Google Ads" });
await call("bankSaveRule", { keyword: "google", category: "Marketing" });
await call("bankSaveRule", { keyword: "google workspace", category: "Software", vatCode: "ST" });
let ws = (await txCol.doc("b3_tx_ws").get()).data() || {};
let ads = (await txCol.doc("b3_tx_ads").get()).data() || {};
ok("workspace → özgül kural (Software)", ws.categoryAuto === "Software", String(ws.categoryAuto));
ok("workspace kural izi doğru", ws.categoryAutoRule === "google workspace", String(ws.categoryAutoRule));
ok("workspace vatCodeAuto ST", ws.vatCodeAuto === "ST", String(ws.vatCodeAuto));
ok("ads → genel kural (Marketing)", ads.categoryAuto === "Marketing", String(ads.categoryAuto));
ok("ads kural izi doğru", ads.categoryAutoRule === "google", String(ads.categoryAutoRule));

console.log("=== 2) disconnect veri KORUR, purge siler ===");
await connCol.doc("b3-conn").set({ status: "linked", providerName: "TestBank", accounts: [{ id: "b3acc", name: "B3", currency: "GBP" }] });
await txCol.doc("b3_keep_1").set({ accountId: "b3acc", connectionId: "b3-conn", status: "booked", amount: -5, currency: "GBP", bookingDate: "2026-08-01", description: "keepme" });
const disc = await call("bankDeleteConnection", { requisitionId: "b3-conn", mode: "disconnect" });
ok("disconnect kept=true döndü", disc.kept === true, JSON.stringify(disc));
let conn = (await connCol.doc("b3-conn").get()).data() || {};
ok("bağlantı disconnected durumda", conn.status === "disconnected", String(conn.status));
ok("işlem YERİNDE", (await txCol.doc("b3_keep_1").get()).exists);
const purge = await call("bankDeleteConnection", { requisitionId: "b3-conn", mode: "purge" });
ok("purge deleted döndü", purge.deleted === true, JSON.stringify(purge));
ok("işlem silindi", !(await txCol.doc("b3_keep_1").get()).exists);
ok("bağlantı dokümanı silindi", !(await connCol.doc("b3-conn").get()).exists);

// temizlik
for (const doc of (await ruleCol.where("keyword", "in", ["google", "google workspace"]).get()).docs) await doc.ref.delete();
await call("bankDeleteRule", { ruleId: "noop" }).catch(() => {});
for (const id of ["b3_tx_ws", "b3_tx_ads"]) await txCol.doc(id).delete();

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

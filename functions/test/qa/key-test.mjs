// testQuickReplyApiKey: anahtar yokken doğru cevap, geçersiz anahtarda 401
// ayrımı ve sonucun ayarlara yazılması.
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
  if (json.error) throw new Error(`${name}: ${json.error.message}`);
  return json.result;
}

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

console.log("=== anahtar yokken ===");
const none = await call("testQuickReplyApiKey", {});
ok("anahtar yok deniyor", none.ok === false && none.reason === "no_key", JSON.stringify(none));

console.log("=== geçersiz anahtarla ===");
await db.collection("quickReplySecrets").doc(companyId).set({ openAIKey: "sk-gecersiz-anahtar", companyId }, { merge: true });
const bad = await call("testQuickReplyApiKey", {});
ok("geçersiz anahtar reddedildi", bad.ok === false, JSON.stringify(bad));
ok("kullanıcıya anlamlı mesaj döndü", typeof bad.message === "string" && bad.message.length > 0, JSON.stringify(bad));
const after = (await db.collection("companySettings").doc(companyId).get()).data();
ok("sonuç ayarlara yazıldı", after.openAIKeyWorks === false && Number(after.openAIKeyCheckedAtMs) > 0,
   JSON.stringify({ w: after.openAIKeyWorks, t: after.openAIKeyCheckedAtMs }));

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

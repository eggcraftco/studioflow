// Destek biletleri: çift tıklanan Send iki bilet (ve NivaDesk desteğinde iki
// e-posta) üretiyordu. Sunucu artık kısa pencerede aynı başlığı tek bilete indirir.
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
const workspaceTickets = () => db.collection("companies").doc(companyId).collection("workspaceTickets").get();

console.log("=== çalışma alanı bileti: hızlı çift gönderim tek bilet ===");
const payload = { title: "Çift tık testi", message: "Aynı bilet iki kez gitmesin.", category: "Internal workflow", priority: "normal" };
const first = await call("createWorkspaceTicket", payload);
const second = await call("createWorkspaceTicket", payload);
ok("ikisi de ok döndü", first.ok === true && second.ok === true, JSON.stringify({ f: first.ok, s: second.ok }));
ok("aynı bilet kimliği", first.ticketId === second.ticketId, `${first.ticketId} vs ${second.ticketId}`);
ok("ikincisi dedupe olarak işaretli", second.deduped === true, JSON.stringify(second));
const count1 = (await workspaceTickets()).size;
ok("koleksiyonda tek bilet var", count1 === 1, `count=${count1}`);

console.log("=== farklı başlık yeni bilet ===");
const third = await call("createWorkspaceTicket", { ...payload, title: "Bambaşka bir konu" });
ok("yeni bilet oluştu", third.ticketId !== first.ticketId && third.deduped !== true, JSON.stringify(third));
const count2 = (await workspaceTickets()).size;
ok("koleksiyonda iki bilet var", count2 === 2, `count=${count2}`);

console.log("=== NivaDesk destek bileti: aynı koruma ===");
const s1 = await call("createSupportTicket", { title: "Uygulama çöküyor", message: "Detaylar burada.", category: "Bug / Something is not working", priority: "high" });
const s2 = await call("createSupportTicket", { title: "Uygulama çöküyor", message: "Detaylar burada.", category: "Bug / Something is not working", priority: "high" });
ok("destek bileti tek", s1.ticketId === s2.ticketId && s2.deduped === true, `${s1.ticketId} vs ${s2.ticketId}`);

console.log("=== pencere dolunca yeniden bilet açılabilir ===");
// Pencereyi beklemek yerine dedupe kaydını geriye çekiyoruz — testin sınadığı şey pencere aritmetiği.
await db.collection("supportTicketDedupe").doc(`workspace_${companyId}_${(await workspaceTickets()).docs[0].data().createdByUid}`)
  .set({ atMs: Date.now() - 60 * 1000 }, { merge: true });
const fourth = await call("createWorkspaceTicket", payload);
ok("eski pencere yeni bilet açtı", fourth.ticketId !== first.ticketId && fourth.deduped !== true, JSON.stringify(fourth));

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

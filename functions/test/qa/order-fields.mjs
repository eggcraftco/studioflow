// QA raporu 1-3: To Do tarihi, teslim tarihi, Requested Work.
// Web istemcisinin GÖNDERDİĞİ yükü birebir taklit eder.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const admin = createRequire(import.meta.url)("firebase-admin");
admin.initializeApp({ projectId: "eggcraft-studio" });
const adb = admin.firestore();
const S = new URL(".", import.meta.url).pathname;
const { companyId, orderId, customToken } = JSON.parse(readFileSync(`${S}/seed-out.json`, "utf8"));

const authRes = await fetch(
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key",
  { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
const { idToken, error } = await authRes.json();
if (!idToken) { console.error("oturum açılamadı:", JSON.stringify(error)); process.exit(1); }

const BASE = "http://127.0.0.1:5001/eggcraft-studio/europe-west2";
async function call(name, data = {}) {
  const res = await fetch(`${BASE}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data: { companyId, ...data } })
  });
  const json = await res.json();
  if (json.error) throw new Error(`${name}: ${json.error.message}`);
  return json.result;
}
async function readOrder() {
  return (await adb.collection("siparisler").doc(orderId).get()).data() || {};
}

let fail = 0;
const ok = (label, cond, extra = "") => { if (!cond) fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : "  <- " + extra}`); };

console.log("=== QA1: To Do görev tarihi ===");
try {
  await call("updateWebOrder", { orderId, todo: {
    action: "add", title: "QA due-date verification", priority: "Normal",
    dueDate: "2026-08-30", assignedToUid: "", assignedToEmail: ""
  }});
  const f = await readOrder();
  const due = f.todoItems?.[0]?.dueAt;
  const iso = due?.toDate ? due.toDate().toISOString() : String(due);
  ok("dueAt seçilen gün (2026-08-30)", iso.startsWith("2026-08-30"), `dueAt=${iso}`);
} catch (e) { ok("To Do eklendi", false, e.message); }

console.log("=== QA2: Timeline & Delivery teslim tarihi ===");
try {
  await call("updateWebOrder", { orderId, details: { deliveryDueDate: "2026-09-30" } });
  const f = await readOrder();
  const dt = Number(f.deliveryTime ?? 0);
  ok("deliveryTime 45 -> 36 gün (25 Ağu + 36 = 30 Eyl)", dt === 36, `deliveryTime=${dt}`);
} catch (e) { ok("teslim tarihi kaydedildi", false, e.message); }

console.log("=== QA3: Repair Intake Requested Work ===");
try {
  await call("updateWebOrder", { orderId, details: {
    orderType: "repair",
    repairIntake: {
      fields: {}, condition: [], requestedWork: ["Kayış değişimi", "Cila"],
      customerInstructions: "", receivedAt: new Date("2026-08-25T09:00:00.000Z").toISOString(),
      receivedByUid: "qa-review-uid", receivedByName: "QA Review"
    }
  }});
  const f = await readOrder();
  const texts = f.repairIntake?.requestedWork || [];
  ok("requestedWork kaydedildi", texts.join("|") === "Kayış değişimi|Cila", JSON.stringify(texts));
} catch (e) { ok("Requested Work kaydedildi", false, e.message); }

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ — yerel sunucu kodu doğru" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

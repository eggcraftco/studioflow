// Emülatör çalışma zamanının firebase-admin gölgelemesini atlayarak
// updateWebOrder'ı doğrudan çalıştırır (v2 onCall .run()).
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "eggcraft-studio";
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
console.log("admin.firestore.FieldValue:", typeof admin.firestore.FieldValue);
const fns = require("../../index.js");
const db = admin.firestore();

const companyId = "qa-workspace";
const orderId = "QA-ORDER-1";
const auth = { uid: "qa-review-uid", token: { email: "review@nivadesk.app" } };
const call = (data) => fns.updateWebOrder.run({ data: { companyId, ...data }, auth, acceptsStreaming: false });

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };
const read = async () => (await db.collection("siparisler").doc(orderId).get()).data();

console.log("=== QA1: To Do görev tarihi ===");
try {
  await call({ orderId, todo: { action: "add", title: "QA due-date verification", priority: "Normal",
    dueDate: "2026-08-30", assignedToUid: "", assignedToEmail: "" } });
  const d = await read();
  const due = d.todoItems?.[0]?.dueAt;
  const iso = due?.toDate ? due.toDate().toISOString() : String(due);
  ok("dueAt = 2026-08-30", iso.startsWith("2026-08-30"), `dueAt=${iso}`);
} catch (e) { ok("To Do eklendi", false, e.message); }

console.log("=== QA2: teslim tarihi ===");
try {
  await call({ orderId, details: { deliveryDueDate: "2026-09-30" } });
  const d = await read();
  ok("deliveryTime 45 -> 36", Number(d.deliveryTime) === 36, `deliveryTime=${d.deliveryTime}`);
} catch (e) { ok("teslim tarihi kaydedildi", false, e.message); }

console.log("=== QA3: Requested Work ===");
try {
  await call({ orderId, details: { orderType: "repair", repairIntake: {
    fields: {}, condition: [], requestedWork: ["Kayış değişimi", "Cila"], customerInstructions: "",
    receivedAt: new Date("2026-08-25T09:00:00.000Z").toISOString(),
    receivedByUid: "qa-review-uid", receivedByName: "QA Review" } } });
  const d = await read();
  const rw = d.repairIntake?.requestedWork || [];
  ok("requestedWork kaydedildi", rw.join("|") === "Kayış değişimi|Cila", JSON.stringify(rw));
} catch (e) { ok("Requested Work kaydedildi", false, e.message); }

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

// "Remove VAT from all orders" artık önce ne olacağını söylüyor ve geri alınabiliyor.
// Düğmenin kendi metni "bu geri alınamaz" diyordu ve doğruydu: hiçbir yerde
// öncesi görüntüsü tutulmuyordu.
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

let fail = 0;
const ok = (label, cond, extra = "") => { if (!cond) fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : "  <- " + extra}`); };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.02;

for (const [id, tax, rate] of [["CT1", 241.67, 20], ["CT2", 100, 20], ["CT3", 0, 0]]) {
  await db.collection("siparisler").doc(id).set({
    companyId, customerName: `Vergi ${id}`, designName: "iş",
    paidAmount: 1000, remainingAmount: 0, watchPurchasePrice: 0, deliveryCost: 0,
    paymentFee: 0, taxRate: rate, taxType: rate > 0 ? "Revenue" : "", taxAmount: tax,
    paymentDate: admin.firestore.Timestamp.fromDate(new Date("2026-02-01T00:00:00.000Z")),
    deliveryTime: 30, status: "Done", createdAtMs: 1738368000000
  });
}

console.log("=== önizleme ===");
const preview = await call("previewClearAllOrdersTax", {});
ok("vergisi olan sipariş sayısı doğru", preview.wouldClearCount === 2, `wouldClear=${preview.wouldClearCount}`);
ok("silinecek KDV toplamı doğru", near(preview.totals.taxBefore, 341.67), `taxBefore=${preview.totals.taxBefore}`);
ok("geri alma mümkün deniyor", preview.undoAvailable === true, String(preview.undoAvailable));
ok("örnek satır var", Array.isArray(preview.sample) && preview.sample.length > 0, JSON.stringify(preview.sample?.[0]));
ok("önizleme hiçbir şeyi değiştirmedi",
   near((await db.collection("siparisler").doc("CT1").get()).data().taxAmount, 241.67), "CT1 değişti");

console.log("=== uygulama ===");
const cleared = await call("clearAllOrdersTax", {});
ok("önizleme ile uygulama aynı sayıyı verdi", cleared.clearedCount === preview.wouldClearCount,
   `önizleme=${preview.wouldClearCount} uygulama=${cleared.clearedCount}`);
ok("geri alma kimliği döndü", Boolean(cleared.runId), JSON.stringify(cleared));
const ct1 = (await db.collection("siparisler").doc("CT1").get()).data();
ok("KDV silindi", near(ct1.taxAmount, 0) && Number(ct1.taxRate || 0) === 0, JSON.stringify({ t: ct1.taxAmount, r: ct1.taxRate }));
ok("silme geçmişe yazıldı", (ct1.historyLog || []).some(e => e && e.title === "VAT removed"),
   JSON.stringify((ct1.historyLog || [])[0]));

console.log("=== geri alma ===");
const undone = await call("undoClearAllOrdersTax", { runId: cleared.runId });
ok("geri alınan sipariş sayısı doğru", undone.restoredCount === cleared.clearedCount, `restored=${undone.restoredCount}`);
const restored = (await db.collection("siparisler").doc("CT1").get()).data();
ok("KDV geri geldi", near(restored.taxAmount, 241.67) && Number(restored.taxRate) === 20,
   JSON.stringify({ t: restored.taxAmount, r: restored.taxRate }));
ok("vergi kuralı da geri geldi", restored.taxType === "Revenue", `taxType=${restored.taxType}`);

console.log("=== ikinci kez geri alma reddediliyor ===");
try {
  await call("undoClearAllOrdersTax", { runId: cleared.runId });
  ok("ikinci geri alma reddedildi", false, "hata beklendi");
} catch (e) {
  ok("ikinci geri alma reddedildi", /already been undone/i.test(e.message), e.message);
}

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

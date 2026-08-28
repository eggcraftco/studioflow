// Yedek içe aktarma: önce ne olacağını söylüyor, yinelenenleri uyarıyor,
// 500 kaydın üstünü sessizce kırpmıyor.
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
const orderCount = async () => (await db.collection("siparisler").where("companyId", "==", companyId).get()).size;

const backup = {
  siparisler: [
    { customerName: "Yedek Müşteri A", designName: "Vitrin", paymentDate: "2026-03-01T00:00:00Z", paidAmount: 500, remainingAmount: 0 },
    { customerName: "Yedek Müşteri B", designName: "Tabela", paymentDate: "2026-03-02T00:00:00Z", paidAmount: 300, remainingAmount: 200 }
  ],
  musteriler: [
    { name: "Yedek Müşteri A", email: "a@example.com" },
    { name: "Yedek Müşteri B", email: "b@example.com" }
  ]
};

console.log("=== ilk önizleme (temiz çalışma alanı) ===");
const before = await orderCount();
const first = await call("importWorkspaceBackup", { backup, dryRun: true });
ok("dosyadaki sipariş sayısı", first.fileOrders === 2, `fileOrders=${first.fileOrders}`);
ok("dosyadaki müşteri sayısı", first.fileCustomers === 2, `fileCustomers=${first.fileCustomers}`);
ok("henüz yinelenen yok", first.likelyDuplicateOrders === 0, `dup=${first.likelyDuplicateOrders}`);
ok("önizleme hiçbir şey yazmadı", (await orderCount()) === before, "sipariş sayısı değişti");

console.log("=== gerçek içe aktarma ===");
const done = await call("importWorkspaceBackup", { backup });
ok("iki sipariş eklendi", done.importedOrders === 2, `imported=${done.importedOrders}`);
ok("kırpma yok", done.truncated === false, JSON.stringify({ d: done.droppedOrders }));

console.log("=== aynı dosya ikinci kez: yinelenen uyarısı ===");
const second = await call("importWorkspaceBackup", { backup, dryRun: true });
ok("iki sipariş yinelenen olarak işaretlendi", second.likelyDuplicateOrders === 2, `dup=${second.likelyDuplicateOrders}`);
ok("iki müşteri yinelenen olarak işaretlendi", second.likelyDuplicateCustomers === 2, `dup=${second.likelyDuplicateCustomers}`);
ok("mevcut sipariş sayısı bildiriliyor", second.existingOrders >= 2, `existing=${second.existingOrders}`);

console.log("=== 500 üstü kırpma bildiriliyor ===");
const big = { siparisler: Array.from({ length: 520 }, (_, i) => ({
  customerName: `Toplu ${i}`, designName: "iş", paymentDate: "2026-04-01T00:00:00Z", paidAmount: 10, remainingAmount: 0
})) };
const bigPreview = await call("importWorkspaceBackup", { backup: big, dryRun: true });
ok("kırpılan sipariş sayısı doğru", bigPreview.droppedOrders === 20, `dropped=${bigPreview.droppedOrders}`);
ok("kırpma bayrağı açık", bigPreview.truncated === true, String(bigPreview.truncated));

console.log("=== yinelenenleri atlayarak içe aktarma ===");
// Aynı dosya, skipDuplicates=true: ikisi de atlanmalı, hiçbir şey yazılmamalı.
const beforeSkip = await orderCount();
const skipped = await call("importWorkspaceBackup", { backup, skipDuplicates: true });
ok("iki sipariş atlandı", skipped.skippedDuplicateOrders === 2, `skipped=${skipped.skippedDuplicateOrders}`);
ok("iki müşteri atlandı", skipped.skippedDuplicateCustomers === 2, `skipped=${skipped.skippedDuplicateCustomers}`);
ok("hiç sipariş yazılmadı", skipped.importedOrders === 0 && (await orderCount()) === beforeSkip,
   `imported=${skipped.importedOrders}`);
ok("mesaj atlananları söylüyor", /already have|duplicates/i.test(skipped.message), skipped.message);

console.log("=== dosya içi yinelenen: aynı kayıt iki kez, biri girer ===");
const twiceInFile = {
  siparisler: [
    { customerName: "Dosya İçi", designName: "kolye", paymentDate: "2026-05-01T00:00:00Z", paidAmount: 77, remainingAmount: 0 },
    { customerName: "Dosya İçi", designName: "kolye", paymentDate: "2026-05-01T00:00:00Z", paidAmount: 77, remainingAmount: 0 }
  ]
};
const inFile = await call("importWorkspaceBackup", { backup: twiceInFile, skipDuplicates: true });
ok("biri girdi biri atlandı", inFile.importedOrders === 1 && inFile.skippedDuplicateOrders === 1,
   JSON.stringify({ i: inFile.importedOrders, s: inFile.skippedDuplicateOrders }));

console.log("=== atlama kapalıyken eski davranış ===");
const noSkip = await call("importWorkspaceBackup", { backup: twiceInFile });
ok("atlamadan iki kopya daha girdi", noSkip.importedOrders === 2 && (noSkip.skippedDuplicateOrders || 0) === 0,
   JSON.stringify({ i: noSkip.importedOrders, s: noSkip.skippedDuplicateOrders }));

console.log("=== içe aktarma geri alınabiliyor ===");
const undoBackup = {
  siparisler: [{ customerName: "Geri Alınacak", designName: "yüzük", paymentDate: "2026-07-01T00:00:00Z", paidAmount: 42, remainingAmount: 0 }],
  musteriler: [{ name: "Geri Alınacak Müşteri", email: "undo@example.com" }]
};
const beforeUndoImport = await orderCount();
const undoRun = await call("importWorkspaceBackup", { backup: undoBackup });
ok("koşu kimliği döndü", Boolean(undoRun.runId) && undoRun.undoAvailable === true, JSON.stringify({ r: undoRun.runId, u: undoRun.undoAvailable }));
ok("bir sipariş girdi", (await orderCount()) === beforeUndoImport + 1, "sayı artmadı");
const undone = await call("undoWorkspaceBackupImport", { runId: undoRun.runId });
ok("tam olarak o kayıtlar silindi", undone.removedOrders === 1 && undone.removedCustomers === 1, JSON.stringify(undone));
ok("sipariş sayısı geri döndü", (await orderCount()) === beforeUndoImport, `şimdi=${await orderCount()}`);
try {
  await call("undoWorkspaceBackupImport", { runId: undoRun.runId });
  ok("ikinci geri alma reddedildi", false, "hata beklendi");
} catch (e) {
  ok("ikinci geri alma reddedildi", /already been undone/i.test(e.message), e.message);
}

console.log("=== v3 kesin kimlik eşleşmesi ===");
// backupRecordId taşıyan satır: bulanık alanlar farklı olsa bile kesin kimlik yakalar.
const v3first = {
  siparisler: [{ backupRecordId: "kesin-kimlik-1", customerName: "V3 Müşteri", designName: "bileklik", paymentDate: "2026-07-02T00:00:00Z", paidAmount: 10, remainingAmount: 0 }]
};
await call("importWorkspaceBackup", { backup: v3first });
const v3second = {
  siparisler: [{ backupRecordId: "kesin-kimlik-1", customerName: "V3 Müşteri (ADI DEĞİŞTİ)", designName: "bileklik", paymentDate: "2026-07-02T00:00:00Z", paidAmount: 999, remainingAmount: 0 }]
};
const v3preview = await call("importWorkspaceBackup", { backup: v3second, dryRun: true });
ok("adı ve tutarı değişse de yinelenen sayıldı", v3preview.likelyDuplicateOrders === 1, `dup=${v3preview.likelyDuplicateOrders}`);
const v3skip = await call("importWorkspaceBackup", { backup: v3second, skipDuplicates: true });
ok("kesin kimlikle atlandı", v3skip.skippedDuplicateOrders === 1 && v3skip.importedOrders === 0, JSON.stringify({ s: v3skip.skippedDuplicateOrders, i: v3skip.importedOrders }));

console.log("=== API anahtarı yedekten içeri girmiyor ===");
await call("importWorkspaceBackup", { backup: { settings: { strings: { openAIKey: "sk-sizin-anahtariniz", appSubtitle: "Test" } } } });
const settings = (await db.collection("companySettings").doc(companyId).get()).data();
ok("openAIKey companySettings'e yazılmadı", !settings.openAIKey, `openAIKey=${settings.openAIKey}`);
ok("diğer ayar yine de içeri girdi", settings.appSubtitle === "Test", `appSubtitle=${settings.appSubtitle}`);

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

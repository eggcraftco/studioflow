// Merkezi dosya kütüphanesi: dosya BİR kez kaydolur, gerisi bağlantıdır;
// bağlantı paylaşım değildir; indeksleyici iki kez koşunca iki kayıt üretmez.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "eggcraft-studio" });
const db = admin.firestore();

const S = new URL(".", import.meta.url).pathname;
const { companyId, customToken, orderId } = JSON.parse(readFileSync(`${S}/seed-out.json`, "utf8"));
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

// ---- fikstürler: sipariş dosyası + envanter fotoğrafı + eşleşmiş banka fişi ----
const P = (rest) => `companies/${companyId}/${rest}`;
await db.collection("siparisler").doc(orderId).set({
  clientFiles: [{ storagePath: P("client_files/QA/design.pdf"), fileName: "design.pdf", fileType: "application/pdf", fileSize: 1234, uploadedAtMs: Date.now() }]
}, { merge: true });
await db.collection("companies").doc(companyId).collection("inventoryItems").doc("lib-item-1").set({
  companyId, number: "INV-LIB-1", name: "Lib Watch", category: "Watches", trackingType: "unique",
  ownership: "business", status: "available", photos: [P("inventory_photos/lib-item-1/front.jpg")],
  purchaseId: "lib-pur-1", purchaseNumber: "PUR-084",
  quantity: { onHand: 1, reserved: 0, incoming: 0, unit: "" }, valuationCost: 100,
  reservations: [], reservedOrderIds: [], createdAtMs: Date.now(), updatedAtMs: Date.now()
});
await db.collection("companies").doc(companyId).collection("purchases").doc("lib-pur-1").set({
  companyId, number: "PUR-084", supplierName: "ABC Watches", itemIds: ["lib-item-1"], total: 2100
});
await db.collection("companies").doc(companyId).collection("bankTransactions").doc("lib-tx-1").set({
  companyId, counterparty: "ABC Watches", amount: -2100,
  receiptPath: P("bank_receipts/lib-tx-1/invoice.pdf"), receiptName: "invoice.pdf", purchaseId: "lib-pur-1"
});

console.log("=== indeksleyici: mevcut dosyaları bir kez kaydeder ===");
const first = await call("indexWorkspaceFilesIntoLibrary", {});
ok("üç kaynak da tarandı", first.scanned.orders >= 1 && first.scanned.inventoryItems >= 1 && first.scanned.bankTransactions >= 1,
   JSON.stringify(first.scanned));
ok("kayıtlar oluştu", first.created >= 3, `created=${first.created}`);
const second = await call("indexWorkspaceFilesIntoLibrary", {});
ok("ikinci koşu hiçbir şey yaratmadı", second.created === 0, `created=${second.created}`);

console.log("=== fatura örneği: tek dosya, üç bağlantı ===");
const list = await call("listLibraryFiles", {});
const invoice = list.files.find(f => f.fileName === "invoice.pdf");
ok("fiş kaydı var", Boolean(invoice), "yok");
ok("banka+satın alma+kalem bağlı",
   invoice.linkKinds.includes("bankTransaction") && invoice.linkKinds.includes("purchase") && invoice.linkKinds.includes("inventoryItem"),
   JSON.stringify(invoice.linkKinds));
ok("indeksli dosya portala kapalı", invoice.clientPortalVisible === false, String(invoice.clientPortalVisible));

console.log("=== bağlantı doğrulaması: sahte hedef reddedilir ===");
try {
  await call("linkLibraryFile", { fileId: invoice.id, kind: "order", id: "boyle-bir-siparis-yok" });
  ok("sahte sipariş bağlantısı reddedildi", false, "hata beklendi");
} catch (e) {
  ok("sahte sipariş bağlantısı reddedildi", /no longer exists|not-found/i.test(e.message), e.message);
}

console.log("=== paylaşım tek kapıdan: share portal görünürlüğü verir ===");
const design = list.files.find(f => f.fileName === "design.pdf");
await call("linkLibraryFile", { fileId: invoice.id, kind: "order", id: orderId, label: "QA" });
let after = (await call("listLibraryFiles", {})).files.find(f => f.id === invoice.id);
ok("düz bağlantı portal açmadı", after.clientPortalVisible === false, String(after.clientPortalVisible));
await call("shareLibraryFileWithOrder", { fileId: design.id, orderId, visibility: "portal", displayName: "Approved Design" });
after = (await call("listLibraryFiles", {})).files.find(f => f.id === design.id);
const orderLink = after.links.find(l => l.kind === "order" && l.id === orderId);
ok("paylaşım portal görünürlüğü verdi", after.clientPortalVisible === true && orderLink.audience === "portal",
   JSON.stringify(orderLink));
ok("müşteriye görünen ad kaydedildi", orderLink.displayName === "Approved Design", orderLink.displayName);
ok("aktivite izi tutuldu", after.activity.some(a => /shared to portal/.test(a.action)), JSON.stringify(after.activity[0]));

console.log("=== bağlantıyı kaldırmak dosyayı silmez ===");
await call("unlinkLibraryFile", { fileId: invoice.id, kind: "order", id: orderId });
after = (await call("listLibraryFiles", {})).files.find(f => f.id === invoice.id);
ok("dosya duruyor, sipariş bağı gitti", Boolean(after) && !after.links.some(l => l.kind === "order"),
   JSON.stringify(after?.linkKinds));

console.log("=== çöp kutusu: önce çöp, sonra silme; indeksli dosyanın deposu korunur ===");
try {
  await call("deleteLibraryFile", { fileId: invoice.id });
  ok("çöpe atılmadan silme reddedildi", false, "hata beklendi");
} catch (e) {
  ok("çöpe atılmadan silme reddedildi", /trash first/i.test(e.message), e.message);
}
await call("trashLibraryFile", { fileId: invoice.id });
const trashList = await call("listLibraryFiles", { trashed: true });
ok("çöp görünümünde", trashList.files.some(f => f.id === invoice.id), "yok");
await call("restoreLibraryFile", { fileId: invoice.id });
after = (await call("listLibraryFiles", {})).files.find(f => f.id === invoice.id);
ok("geri geldi", Boolean(after) && after.trashedAtMs === 0, String(after?.trashedAtMs));
await call("trashLibraryFile", { fileId: invoice.id });
const del = await call("deleteLibraryFile", { fileId: invoice.id });
ok("indeksli dosyada depo nesnesi silinmedi", del.storageDeleted === false, String(del.storageDeleted));

console.log("=== kayıt + versiyon ===");
const reg = await call("registerLibraryFile", {
  storagePath: P("client_files/library/v1-cert.pdf"), fileName: "cert.pdf", fileType: "application/pdf", fileSize: 10
});
ok("kayıt oluştu", Boolean(reg.fileId) && reg.existed === false, JSON.stringify(reg));
const regAgain = await call("registerLibraryFile", {
  storagePath: P("client_files/library/v1-cert.pdf"), fileName: "cert.pdf"
});
ok("aynı yol ikinci kez kaydolmadı", regAgain.existed === true, JSON.stringify(regAgain));
await call("addLibraryFileVersion", { fileId: reg.fileId, storagePath: P("client_files/library/v2-cert.pdf"), fileName: "cert-v2.pdf", fileSize: 12, note: "revised" });
after = (await call("listLibraryFiles", {})).files.find(f => f.id === reg.fileId);
ok("iki versiyon, aktif = v2", after.versions.length === 2 && after.activeVersionIndex === 1 && /v2-cert/.test(after.storagePath),
   JSON.stringify({ v: after.versions.length, a: after.activeVersionIndex }));
await call("setLibraryFileActiveVersion", { fileId: reg.fileId, index: 0 });
after = (await call("listLibraryFiles", {})).files.find(f => f.id === reg.fileId);
ok("aktif versiyon v1'e döndü", after.activeVersionIndex === 0 && /v1-cert/.test(after.storagePath), after.storagePath);

console.log("=== silme kapısı: deleteClientFiles=false üye düzenler ama çöpe atamaz/silemez ===");
const { memberCustomToken } = JSON.parse(readFileSync(`${S}/seed-out.json`, "utf8"));
const memberAuthRes = await fetch(
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key",
  { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: memberCustomToken, returnSecureToken: true }) });
const memberIdToken = (await memberAuthRes.json()).idToken;
async function memberCall(name, data = {}) {
  const res = await fetch(`${BASE}/${name}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${memberIdToken}` },
    body: JSON.stringify({ data: { companyId, ...data } })
  });
  const json = await res.json();
  if (json.error) throw new Error(`${name}: ${json.error.message}`);
  return json.result;
}
await memberCall("renameLibraryFile", { fileId: design.id, displayName: "Renamed by member" });
ok("üye yeniden adlandırabildi (yazma izni ayrı)", true);
try {
  await memberCall("trashLibraryFile", { fileId: design.id });
  ok("üye çöpe atamadı", false, "hata beklendi");
} catch (e) {
  ok("üye çöpe atamadı", /deleting/i.test(e.message), e.message);
}
try {
  await memberCall("deleteLibraryFile", { fileId: design.id });
  ok("üye kalıcı silemedi", false, "hata beklendi");
} catch (e) {
  ok("üye kalıcı silemedi", /deleting/i.test(e.message), e.message);
}

console.log("=== portal: paylaşılan dosya müşteri sayfasında, token URL ile ===");
// Gerçek baytlar: mint objenin metadata'sına token yazar, obje yoksa yazamaz.
// Fonksiyon emülatörünün varsayılan bucket adı sürüme göre değişebildiğinden
// iki aday isme de yükle.
for (const bucket of ["eggcraft-studio.appspot.com", "eggcraft-studio.firebasestorage.app"]) {
  await fetch(
    `http://127.0.0.1:9199/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(`companies/${companyId}/client_files/QA/design.pdf`)}`,
    { method: "POST", headers: { "Content-Type": "application/pdf" }, body: "%PDF-1.4 qa design bytes" }
  );
}
await call("shareLibraryFileWithOrder", { fileId: design.id, orderId, visibility: "portal", displayName: "Approved Design" });
const designAfterMint = (await call("listLibraryFiles", {})).files.find(f => f.id === design.id);
const { token: portalToken } = await call("createOrderPortalLink", { orderId });
const visitorRes = await fetch(`${BASE}/getPortalForVisitor`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ data: { token: portalToken } })
});
const visitorJson = await visitorRes.json();
const portalFiles = visitorJson.result && visitorJson.result.portal ? visitorJson.result.portal.files : null;
ok("ziyaretçi portalı dosya listesi döndü", Array.isArray(portalFiles), JSON.stringify(visitorJson.error || visitorJson).slice(0, 200));
ok("yalnız portal-paylaşımlı dosya listede", Array.isArray(portalFiles) && portalFiles.length === 1,
   JSON.stringify((portalFiles || []).map(f => f.name)));
if (Array.isArray(portalFiles) && portalFiles[0]) {
  ok("müşteri, seçilen adı görür", portalFiles[0].name === "Approved Design", portalFiles[0].name);
  ok("URL token'lı ve oturumsuz", /alt=media&token=/.test(portalFiles[0].url), portalFiles[0].url);
  const dl = await fetch(portalFiles[0].url.replace("https://firebasestorage.googleapis.com", "http://127.0.0.1:9199"));
  ok("URL gerçekten indiriyor", dl.ok && (await dl.text()).includes("qa design bytes"), `status=${dl.status}`);
}

console.log("=== yabancı yol reddedilir ===");
try {
  await call("registerLibraryFile", { storagePath: "companies/baska-sirket/client_files/x.pdf", fileName: "x.pdf" });
  ok("yabancı çalışma alanı yolu reddedildi", false, "hata beklendi");
} catch (e) {
  ok("yabancı çalışma alanı yolu reddedildi", /does not belong/i.test(e.message), e.message);
}

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

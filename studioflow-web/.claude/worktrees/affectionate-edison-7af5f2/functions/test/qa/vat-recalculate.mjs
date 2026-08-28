// "Recalculate Taxes for Past Orders" geçmişi düzeltilmiş KDV'ye taşır, ama
// dışarıdan (WooCommerce/Shopify/webhook) gelen gerçek vergi tutarlarını ezmez.
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

await db.collection("companySettings").doc(companyId).set(
  { defaultTaxRate: 20, taxCalculationType: "Revenue", feePercentage: 0 }, { merge: true });

// Eski, yanlış rakamla duran bir sipariş: £1.450 için £290 yazıyor.
await db.collection("siparisler").doc("VAT-OLD").set({
  companyId, customerName: "Eski kayıt", designName: "£1.450 iş",
  paidAmount: 450, remainingAmount: 1000, watchPurchasePrice: 0, deliveryCost: 0,
  paymentFee: 0, taxRate: 20, taxType: "Revenue", taxAmount: 290,
  paymentDate: admin.firestore.Timestamp.fromDate(new Date("2026-03-01T00:00:00.000Z")),
  deliveryTime: 30, status: "Done", createdAtMs: 1740787200000
});

// WooCommerce'ten gelen sipariş: mağazanın kendi vergisi, oran yok.
await db.collection("siparisler").doc("VAT-IMPORTED").set({
  companyId, customerName: "WooCommerce müşterisi", designName: "İçe aktarılan",
  paidAmount: 600, remainingAmount: 0, watchPurchasePrice: 0, deliveryCost: 0,
  paymentFee: 0, taxRate: 0, taxType: "Revenue", taxAmount: 83.45,
  customFields: { Source: "WooCommerce" },
  paymentDate: admin.firestore.Timestamp.fromDate(new Date("2026-04-01T00:00:00.000Z")),
  deliveryTime: 30, status: "Done", createdAtMs: 1743465600000
});

// Sıfır oranlı / muaf içe aktarım: eski koruma bunu kaçırıyor ve %20 uyduruyordu.
await db.collection("siparisler").doc("VAT-IMPORTED-ZERO").set({
  companyId, customerName: "İhracat müşterisi", designName: "Sıfır oranlı",
  paidAmount: 500, remainingAmount: 0, watchPurchasePrice: 0, deliveryCost: 0,
  paymentFee: 0, taxRate: 0, taxType: "Revenue", taxAmount: 0,
  customFields: { Source: "Shopify" },
  paymentDate: admin.firestore.Timestamp.fromDate(new Date("2026-05-01T00:00:00.000Z")),
  deliveryTime: 30, status: "Done", createdAtMs: 1746057600000
});

const preview = await call("previewFinancialRecalculationForOrders", {});
console.log(`önizleme: ${preview.wouldUpdateCount}/${preview.orderCount} değişir, ${preview.skippedIntegrationCount} entegrasyon atlanır, KDV ${preview.totals.taxBefore} -> ${preview.totals.taxAfter}`);
ok("önizleme değişecek sipariş sayısını veriyor", preview.wouldUpdateCount >= 1, JSON.stringify(preview.totals));
ok("önizleme entegrasyon siparişlerini atlanmış sayıyor", preview.skippedIntegrationCount === 2, `skipped=${preview.skippedIntegrationCount}`);
ok("önizleme örnek satır döndürüyor", Array.isArray(preview.sample) && preview.sample.length >= 1, JSON.stringify(preview.sample?.[0]));
const previewSaidWouldChange = preview.wouldUpdateCount;

const result = await call("recalculateFinancialSettingsForOrders", {});
ok("önizleme ile uygulama aynı sayıyı veriyor", result.updatedCount === previewSaidWouldChange, `önizleme=${previewSaidWouldChange} uygulama=${result.updatedCount}`);
console.log(`yeniden hesaplanan sipariş: ${result?.updatedCount ?? "?"}`);

const oldOrder = (await db.collection("siparisler").doc("VAT-OLD").get()).data();
ok("£1.450 -> KDV £241,67 (eskiden £290)", near(oldOrder.taxAmount, 241.67), `taxAmount=${oldOrder.taxAmount}`);

const imported = (await db.collection("siparisler").doc("VAT-IMPORTED").get()).data();
ok("içe aktarılan gerçek vergi korundu", near(imported.taxAmount, 83.45), `taxAmount=${imported.taxAmount}`);
ok("içe aktarılan siparişe oran uydurulmadı", Number(imported.taxRate || 0) === 0, `taxRate=${imported.taxRate}`);

const zeroRated = (await db.collection("siparisler").doc("VAT-IMPORTED-ZERO").get()).data();
ok("sıfır oranlı içe aktarıma KDV uydurulmadı", near(zeroRated.taxAmount, 0) && Number(zeroRated.taxRate || 0) === 0,
   `taxAmount=${zeroRated.taxAmount} taxRate=${zeroRated.taxRate}`);

const history = Array.isArray(oldOrder.historyLog) ? oldOrder.historyLog : [];
ok("yeniden hesaplama geçmişe yazıldı", history.some(e => e && e.title === "VAT recalculated"),
   JSON.stringify(history.slice(0, 1)));

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

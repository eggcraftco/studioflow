// Müşteri kimliği: mağazanın customer_id'si isimden önce gelir. İsim değişse
// de aynı id (veya aynı e-posta) tek müşteri kaydında toplanır — mükerrer yok.
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
async function post(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

// temiz başla — ve taksit birleştirmeyi kapat: bu test müşteri KİMLİĞİNİ
// sınar; aynı e-postanın siparişlerini tek siparişte toplayan özellik ayrı
// bir davranış ve upsert'i hiç çalıştırmadan 200 döndürür.
await db.collection("companySettings").doc(companyId).set({ wooCombineInstallments: false }, { merge: true });
const staleMarkers = await db.collection("companies").doc(companyId).collection("wooMergedPayments").get();
for (const doc of staleMarkers.docs) await doc.ref.delete();
const staleOrders = await db.collection("siparisler").where("companyId", "==", companyId).get();
for (const doc of staleOrders.docs) {
  if (doc.id.startsWith("woo_")) await doc.ref.delete();
}
const stale = await db.collection("musteriler").where("companyId", "==", companyId).get();
for (const doc of stale.docs) {
  const name = String(doc.data().name || "");
  if (name.startsWith("Identity")) await doc.ref.delete();
}

const wooInfo = await call("getWooCommerceWebhookToken", {});
const wooToken = new URL(wooInfo.deliveryUrl).searchParams.get("token");
const wooUrl = `${BASE}/woocommerceOrderWebhook?companyId=${companyId}&token=${wooToken}`;

const billingBase = {
  email: "identity@example.com", phone: "07000000001",
  address_1: "5 Identity Way", city: "London", postcode: "N1 1AA", country: "GB"
};

console.log("=== 1) ilk sipariş kaydı müşteriyi dış kimlikle açar ===");
const a = await post(wooUrl, {
  id: 555001, total: "50.00", currency: "GBP", status: "processing", customer_id: 9911,
  billing: { ...billingBase, first_name: "Identity", last_name: "Tester" },
  line_items: [{ name: "Test Ring", quantity: 1, total: "50.00" }]
});
ok("webhook 200", a.status === 200, JSON.stringify(a.body).slice(0, 120));
let docs = (await db.collection("musteriler").where("companyId", "==", companyId).where("name", "==", "Identity Tester").get()).docs;
ok("müşteri oluştu", docs.length === 1, `count=${docs.length}`);
ok("dış kimlik saklandı", docs[0]?.data().externalCustomerId === "9911", String(docs[0]?.data().externalCustomerId));
ok("kaynak woocommerce", docs[0]?.data().source === "woocommerce", String(docs[0]?.data().source));

console.log("=== 2) aynı customer_id, DEĞİŞİK isim → mükerrer yok ===");
const b = await post(wooUrl, {
  id: 555002, total: "60.00", currency: "GBP", status: "processing", customer_id: 9911,
  billing: { ...billingBase, first_name: "Identity", last_name: "Renamed", phone: "07000000099" },
  line_items: [{ name: "Test Band", quantity: 1, total: "60.00" }]
});
ok("webhook 200", b.status === 200, JSON.stringify(b.body).slice(0, 120));
const renamedDocs = (await db.collection("musteriler").where("companyId", "==", companyId).where("name", "==", "Identity Renamed").get()).docs;
ok("yeni isimle İKİNCİ kayıt açılmadı", renamedDocs.length === 0, `count=${renamedDocs.length}`);
docs = (await db.collection("musteriler").where("companyId", "==", companyId).where("externalCustomerId", "==", "9911").get()).docs;
ok("kimlikte tek kayıt", docs.length === 1, `count=${docs.length}`);
ok("iletişim güncellendi", docs[0]?.data().phone === "07000000099", String(docs[0]?.data().phone));

console.log("=== 3) guest (id yok) ama AYNI e-posta → e-postayla eşleşir ===");
const c = await post(wooUrl, {
  id: 555003, total: "70.00", currency: "GBP", status: "processing", customer_id: 0,
  billing: { ...billingBase, first_name: "Identity", last_name: "Third" },
  line_items: [{ name: "Test Chain", quantity: 1, total: "70.00" }]
});
ok("webhook 200", c.status === 200, JSON.stringify(c.body).slice(0, 120));
const thirdDocs = (await db.collection("musteriler").where("companyId", "==", companyId).where("name", "==", "Identity Third").get()).docs;
ok("üçüncü isim de yeni kayıt açmadı", thirdDocs.length === 0, `count=${thirdDocs.length}`);
const emailDocs = (await db.collection("musteriler").where("companyId", "==", companyId).where("email", "==", "identity@example.com").get()).docs;
ok("e-postada tek müşteri", emailDocs.length === 1, `count=${emailDocs.length}`);

console.log("=== 4) sync politikası: nivadesk seçiliyken atölye düzenlemesi kazanır ===");
// Atölye, müşterinin telefonunu elle düzeltmiş olsun; şehir alanı boş kalsın.
const identityDoc = (await db.collection("musteriler")
  .where("companyId", "==", companyId).where("externalCustomerId", "==", "9911").get()).docs[0];
await identityDoc.ref.set({ phone: "07999999999", city: "" }, { merge: true });
await db.collection("companySettings").doc(companyId).set({ integrationCustomerSync: "nivadesk" }, { merge: true });
const d = await post(wooUrl, {
  id: 555004, total: "80.00", currency: "GBP", status: "processing", customer_id: 9911,
  billing: { ...billingBase, first_name: "Identity", last_name: "Tester", phone: "07000000321", city: "Bristol" },
  line_items: [{ name: "Test Clasp", quantity: 1, total: "80.00" }]
});
ok("webhook 200", d.status === 200, JSON.stringify(d.body).slice(0, 120));
let after = (await identityDoc.ref.get()).data();
ok("atölyenin telefonu korundu", after.phone === "07999999999", after.phone);
ok("boş alan mağazadan doldu (city)", after.city === "Bristol", after.city);

console.log("=== 5) politika store'a dönünce mağaza yine kazanır ===");
await db.collection("companySettings").doc(companyId).set({ integrationCustomerSync: "store" }, { merge: true });
const e = await post(wooUrl, {
  id: 555005, total: "90.00", currency: "GBP", status: "processing", customer_id: 9911,
  billing: { ...billingBase, first_name: "Identity", last_name: "Tester", phone: "07000000321" },
  line_items: [{ name: "Test Pin", quantity: 1, total: "90.00" }]
});
ok("webhook 200", e.status === 200, JSON.stringify(e.body).slice(0, 120));
after = (await identityDoc.ref.get()).data();
ok("mağaza telefonu yeniden yazdı", after.phone === "07000000321", after.phone);

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

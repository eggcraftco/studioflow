// Webhook protokolü: token'sız giriş yok, tekrar teslimat iş akışını ezmiyor,
// biçimli para okunuyor, test payload'ı sipariş oluşturmuyor.
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
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.02;
const orders = async () => (await db.collection("siparisler").where("companyId", "==", companyId).get()).size;

const info = await call("getInboundWebhookToken", {});
// The delivery URL points at the live cloudfunctions host by design; for the
// emulator we keep the token and swap the origin.
const token = new URL(info.deliveryUrl).searchParams.get("token");
const url = `${BASE}/inboundOrderWebhook?companyId=${companyId}&token=${token}`;

console.log("=== token'sız giriş yok ===");
const noToken = await post(`${BASE}/inboundOrderWebhook?companyId=${companyId}`, { orderId: "X1", total: 10 });
ok("token'sız 401", noToken.status === 401, `status=${noToken.status}`);

console.log("=== test payload'ı sipariş oluşturmuyor ===");
const before = await orders();
const test = await post(url, { nivadeskTest: true, total: "£1,234.56", products: "Tek satır" });
ok("test 200 döndü", test.status === 200 && test.body.test === true, JSON.stringify(test.body).slice(0, 120));
ok("sipariş oluşturulmadı", test.body.orderCreated === false && (await orders()) === before, `${before} -> ${await orders()}`);
ok("şema sürümü bildiriliyor", test.body.schemaVersion === 1, `v=${test.body.schemaVersion}`);
ok("uyarılar döndü", Array.isArray(test.body.warnings) && test.body.warnings.length > 0, JSON.stringify(test.body.warnings));

console.log("=== orderId'siz ping artık 200 ===");
const ping = await post(url, { customerName: "Ping" });
ok("ping 200 (eskiden 400)", ping.status === 200 && ping.body.ignored === "no_order_id", `status=${ping.status}`);

console.log("=== biçimli para okunuyor ===");
await post(url, { orderId: "MONEY-1", customerName: "Para Testi", total: "£1,234.56",
                  shipping: { address1: "1 High St", city: "Leeds" }, shippingCost: "9,99" });
const money = (await db.collection("siparisler").doc(`inbound_${companyId}_MONEY-1`).get()).data();
ok("£1,234.56 doğru okundu", near(money.paidAmount, 1234.56), `paidAmount=${money.paidAmount}`);
ok("adres varken kargo bedeli kayboldu mu", near(money.deliveryCost, 9.99), `deliveryCost=${money.deliveryCost}`);

console.log("=== tekrar teslimat iş akışını ezmiyor ===");
await db.collection("siparisler").doc(`inbound_${companyId}_MONEY-1`).set({
  designStatus: "In Progress", status: "Done", trackingNumber: "TRK-999", courier: "DHL", isDispatched: true
}, { merge: true });
await post(url, { orderId: "MONEY-1", customerName: "Para Testi (güncellendi)", total: "1500" });
const after = (await db.collection("siparisler").doc(`inbound_${companyId}_MONEY-1`).get()).data();
ok("kargo takip numarası korundu", after.trackingNumber === "TRK-999", `trackingNumber=${after.trackingNumber}`);
ok("üretim durumu korundu", after.designStatus === "In Progress" && after.status === "Done",
   JSON.stringify({ d: after.designStatus, s: after.status }));
ok("kargo firması korundu", after.courier === "DHL", `courier=${after.courier}`);
ok("mağazanın alanı yine de güncellendi", near(after.paidAmount, 1500) && /güncellendi/.test(after.customerName),
   JSON.stringify({ p: after.paidAmount, c: after.customerName }));

console.log("=== payload doğrulayıcı ===");
const bad = await call("validateInboundOrderPayload", { payload: { orderId: "V1", total: "£12,34", currency: "USD", buyer_email: "a@b.c" } });
ok("uyarılar üretildi", bad.warnings.length >= 2, JSON.stringify(bad.warnings));
ok("tanınmayan alan adlandırıldı", bad.warnings.some(w => /buyer_email/.test(w)), JSON.stringify(bad.warnings));
const good = await call("validateInboundOrderPayload", { payload: { orderId: "V2", total: 100, products: [{ name: "A", quantity: 1, unitPrice: 100 }] } });
ok("temiz payload uyarısız", good.ok === true && good.warnings.length === 0, JSON.stringify(good.warnings));
ok("okunan değerler dönüyor", near(good.reads.total, 100) && good.reads.lineItemCount === 1, JSON.stringify(good.reads));

console.log("=== test teslimatı gerçek gibi görünmüyor ===");
const secret = (await db.doc(`companies/${companyId}/integrationSecrets/inbound`).get()).data();
ok("son teslimat gerçek olarak işaretli", secret.lastDeliveryOk === true && secret.lastDeliveryWasTest === false,
   JSON.stringify({ ok: secret.lastDeliveryOk, test: secret.lastDeliveryWasTest }));

console.log("=== teslimat günlüğü: son dokuz, en yenisi önde ===");
ok("günlük tutuluyor", Array.isArray(secret.recentDeliveries) && secret.recentDeliveries.length >= 3,
   `len=${secret.recentDeliveries?.length}`);
ok("en yeni kayıt gerçek sipariş", secret.recentDeliveries[0].ok === true && secret.recentDeliveries[0].test === false,
   JSON.stringify(secret.recentDeliveries[0]));
// Emülatörün taşıma katmanı istemci IP'sini iletmiyor; üretimde Google'ın ön
// ucu x-forwarded-for'u her zaman koyar. Burada yalnızca alanın var olduğunu
// sınayabiliyoruz.
ok("kaynak alanı kayıtta var", typeof secret.recentDeliveries[0].source === "string",
   JSON.stringify(secret.recentDeliveries[0]));
ok("günlükte test satırı da var", secret.recentDeliveries.some(d => d.test === true), "test satırı yok");
ok("günlükte ret satırı da var", secret.recentDeliveries.some(d => d.ok === false), "ret satırı yok");

console.log("=== Woo webhook: nivadeskTest sipariş yaratmıyor ===");
const wooInfo = await call("getWooCommerceWebhookToken", {});
const wooToken = new URL(wooInfo.deliveryUrl).searchParams.get("token");
const wooUrl = `${BASE}/woocommerceOrderWebhook?companyId=${companyId}&token=${wooToken}`;
const beforeWoo = await orders();
const wooTest = await post(wooUrl, { nivadeskTest: true, id: 987654, total: "12.00" });
ok("Woo test 200 + test bayrağı", wooTest.status === 200 && wooTest.body.test === true && wooTest.body.orderCreated === false,
   JSON.stringify(wooTest.body));
ok("Woo test sipariş yaratmadı", (await orders()) === beforeWoo, `${beforeWoo} -> ${await orders()}`);
const wooSecret = (await db.doc(`companies/${companyId}/integrationSecrets/woocommerce`).get()).data();
ok("Woo günlüğüne test yazıldı", wooSecret.lastDeliveryWasTest === true && wooSecret.recentDeliveries?.[0]?.test === true,
   JSON.stringify({ t: wooSecret.lastDeliveryWasTest }));

console.log("=== Shopify webhook: nivadeskTest aynı sözleşme ===");
const shopifyInfo = await call("getShopifyWebhookToken", {});
const shopifyToken = new URL(shopifyInfo.deliveryUrl).searchParams.get("token");
const shopifyUrl = `${BASE}/shopifyOrderWebhook?companyId=${companyId}&token=${shopifyToken}`;
const shopifyTest = await post(shopifyUrl, { nivadeskTest: true });
ok("Shopify test 200 + bayrak", shopifyTest.status === 200 && shopifyTest.body.test === true && shopifyTest.body.orderCreated === false,
   JSON.stringify(shopifyTest.body));

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

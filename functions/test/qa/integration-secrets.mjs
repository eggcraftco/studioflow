// Entegrasyon webhook token'ları: sunucuya özel depoda durur, eski alandan
// kendiliğinden taşınır, döndürülebilir, ve token'sız istek sipariş oluşturamaz.
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
const secretDoc = (kind) => db.doc(`companies/${companyId}/integrationSecrets/${kind}`);

console.log("=== eski alandan taşıma ===");
await secretDoc("woocommerce").delete().catch(() => {});
await db.collection("companies").doc(companyId).set({
  woocommerceWebhookToken: "legacytoken0000000000000000000000000000000000000",
  woocommerceWebhookTokenCreatedAt: admin.firestore.Timestamp.now()
}, { merge: true });

const woo = await call("getWooCommerceWebhookToken", {});
ok("çıplak token artık istemciye dönmüyor", woo.token === undefined, JSON.stringify(Object.keys(woo)));
ok("teslimat adresi eski token'ı koruyor", String(woo.deliveryUrl).includes("legacytoken"), woo.deliveryUrl);

const moved = (await secretDoc("woocommerce").get()).data();
ok("token gizli alt koleksiyona taşındı", String(moved?.token || "").startsWith("legacytoken"), JSON.stringify(moved));
const companyAfter = (await db.collection("companies").doc(companyId).get()).data();
ok("şirket dokümanındaki eski alan silindi", companyAfter.woocommerceWebhookToken === undefined,
   `hâlâ var: ${companyAfter.woocommerceWebhookToken}`);

console.log("=== token'sız webhook reddediliyor ===");
const ordersBefore = (await db.collection("siparisler").where("companyId", "==", companyId).get()).size;
await secretDoc("shopify").delete().catch(() => {});
const openDoor = await fetch(`${BASE}/shopifyOrderWebhook?companyId=${companyId}`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: 99001, financial_status: "paid", total_price: "120.00", line_items: [{ name: "Test", quantity: 1 }] })
});
ok("token yokken 401", openDoor.status === 401, `status=${openDoor.status}`);
const ordersAfter = (await db.collection("siparisler").where("companyId", "==", companyId).get()).size;
ok("kimliksiz istek sipariş oluşturmadı", ordersAfter === ordersBefore, `${ordersBefore} -> ${ordersAfter}`);

const shopifyStatus = (await secretDoc("shopify").get()).data();
ok("başarısız teslimat kaydedildi", shopifyStatus?.lastDeliveryOk === false && String(shopifyStatus?.lastDeliveryError || "").length > 0,
   JSON.stringify(shopifyStatus));

console.log("=== geçerli token kabul ediliyor ===");
const shopify = await call("getShopifyWebhookToken", {});
const shopifyToken = new URL(shopify.deliveryUrl).searchParams.get("token");
const good = await fetch(`${BASE}/shopifyOrderWebhook?companyId=${companyId}&token=${shopifyToken}`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: 99002, financial_status: "paid", total_price: "150.00", line_items: [{ name: "Test", quantity: 1 }] })
});
ok("doğru token 200", good.status === 200, `status=${good.status}`);
const okStatus = (await secretDoc("shopify").get()).data();
ok("başarılı teslimat kaydedildi", okStatus?.lastDeliveryOk === true && Number(okStatus?.lastDeliveryAt?.toMillis?.() || 0) > 0,
   JSON.stringify({ ok: okStatus?.lastDeliveryOk }));

console.log("=== döndürme ===");
const rotated = await call("rotateIntegrationWebhookToken", { integration: "shopify" });
const newToken = new URL(rotated.deliveryUrl).searchParams.get("token");
ok("döndürme yeni token üretti", newToken && newToken !== shopifyToken, `${shopifyToken} -> ${newToken}`);
const stale = await fetch(`${BASE}/shopifyOrderWebhook?companyId=${companyId}&token=${shopifyToken}`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: 99003, financial_status: "paid", total_price: "10.00", line_items: [] })
});
ok("eski token artık geçersiz", stale.status === 401, `status=${stale.status}`);

console.log("=== bilinmeyen entegrasyon reddediliyor ===");
try {
  await call("rotateIntegrationWebhookToken", { integration: "hayali" });
  ok("bilinmeyen entegrasyon reddedildi", false, "hata beklendi");
} catch (e) {
  ok("bilinmeyen entegrasyon reddedildi", /Unknown integration/i.test(e.message), e.message);
}

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

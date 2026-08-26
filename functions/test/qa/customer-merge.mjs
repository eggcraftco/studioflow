// Müşteri birleştirme: birincilin dolu alanları kazanır, boşluklar mükerrerden
// dolar, seçilen alanlar (keep) galip gelir, mükerrerin siparişleri isimle
// birincile taşınır, tam anlık görüntü customerMergeLog'a düşer ve o log
// istemci SDK'ya kapalıdır.
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

// fikstürler
for (const name of ["Merge Primary", "Merge Dup"]) {
  const stale = await db.collection("musteriler").where("companyId", "==", companyId).where("name", "==", name).get();
  for (const doc of stale.docs) await doc.ref.delete();
}
const staleLog = await db.collection("companies").doc(companyId).collection("customerMergeLog").get();
for (const doc of staleLog.docs) await doc.ref.delete();

const primaryRef = db.collection("musteriler").doc("merge-primary-1");
const mergedRef = db.collection("musteriler").doc("merge-dup-1");
await primaryRef.set({
  companyId, name: "Merge Primary", email: "primary@example.com", phone: "07111111111",
  instagram: "", address: "", city: "", postalCode: "", country: "",
  notes: "", profileImageUrl: "", source: "shopify", externalCustomerId: "77",
  lastContactDate: admin.firestore.Timestamp.fromDate(new Date("2026-08-01T00:00:00Z"))
});
await mergedRef.set({
  companyId, name: "Merge Dup", email: "dup@example.com", phone: "",
  instagram: "@dupgram", address: "", city: "Leeds", postalCode: "LS1 1AA", country: "United Kingdom",
  notes: "dup note", profileImageUrl: "", source: "web",
  lastContactDate: admin.firestore.Timestamp.fromDate(new Date("2026-08-20T00:00:00Z"))
});
await db.collection("siparisler").doc("merge-ord-1").set({
  companyId, customerName: "Merge Dup", designName: "Dup Ring", status: "In Progress",
  orderValue: 100, paidAmount: 0, paymentDate: admin.firestore.Timestamp.fromDate(new Date("2026-08-20T00:00:00Z")),
  deliveryTime: 10, createdAtMs: Date.now()
});
await db.collection("siparisler").doc("merge-ord-2").set({
  companyId, customerName: "Merge Dup", designName: "Dup Band", status: "In Progress",
  orderValue: 120, paidAmount: 0, paymentDate: admin.firestore.Timestamp.fromDate(new Date("2026-08-21T00:00:00Z")),
  deliveryTime: 10, createdAtMs: Date.now()
});

console.log("=== kendi kendine birleştirme reddedilir ===");
try {
  await call("mergeWebCustomers", { primaryId: "merge-primary-1", mergedId: "merge-primary-1" });
  ok("self-merge reddedildi", false, "hata beklendi");
} catch (e) {
  ok("self-merge reddedildi", /itself/i.test(e.message), e.message);
}

console.log("=== birleştirme: alanlar, siparişler, log ===");
const result = await call("mergeWebCustomers", {
  primaryId: "merge-primary-1",
  mergedId: "merge-dup-1",
  keep: { email: "merged" }
});
ok("çağrı ok + 2 sipariş taşındı", result.ok === true && result.movedOrderCount >= 2, JSON.stringify(result));
const primary = (await primaryRef.get()).data();
ok("mükerrer silindi", !(await mergedRef.get()).exists, "hâlâ var");
ok("isim birincilin", primary.name === "Merge Primary", primary.name);
ok("keep.email=merged galip", primary.email === "dup@example.com", primary.email);
ok("boşluk mükerrerden doldu (city)", primary.city === "Leeds", primary.city);
ok("telefon birincilde kaldı", primary.phone === "07111111111", primary.phone);
ok("notlar taşındı", primary.notes === "dup note", primary.notes);
ok("dış kimlik korundu", primary.externalCustomerId === "77" && primary.source === "shopify",
   `${primary.externalCustomerId}/${primary.source}`);
ok("son iletişim yenisi", primary.lastContactDate.toDate().toISOString().startsWith("2026-08-20"), primary.lastContactDate.toDate().toISOString());
const ord1 = (await db.collection("siparisler").doc("merge-ord-1").get()).data();
const ord2 = (await db.collection("siparisler").doc("merge-ord-2").get()).data();
ok("siparişler birincile taşındı", ord1.customerName === "Merge Primary" && ord2.customerName === "Merge Primary",
   `${ord1.customerName}/${ord2.customerName}`);
ok("sipariş e-postası senkron", ord1.emailAddress === "dup@example.com", String(ord1.emailAddress));
const log = await db.collection("companies").doc(companyId).collection("customerMergeLog").get();
ok("merge log tek kayıt + tam anlık görüntü", log.size === 1
   && log.docs[0].data().mergedSnapshot?.name === "Merge Dup"
   && log.docs[0].data().primaryBefore?.email === "primary@example.com",
   `size=${log.size}`);

console.log("=== merge log istemci SDK'ya kapalı ===");
const rest = await fetch(
  `http://127.0.0.1:8080/v1/projects/eggcraft-studio/databases/(default)/documents/companies/${companyId}/customerMergeLog`,
  { headers: { Authorization: `Bearer ${idToken}` } });
ok("owner bile listeleyemez (403)", rest.status === 403, `status=${rest.status}`);

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

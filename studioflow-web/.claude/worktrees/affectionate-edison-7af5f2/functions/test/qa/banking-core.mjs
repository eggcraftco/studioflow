// Banking çekirdeği: kalıcı provider kimlikleri, pending→booked mutabakatı,
// review statüleri, genişletilmiş VAT listesi, workspace kategori kayıtları.
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
  if (json.error) { const err = new Error(json.error.message); err.status = json.error.status; throw err; }
  return json.result;
}

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

const txCol = db.collection("companies").doc(companyId).collection("bankTransactions");
const catCol = db.collection("companies").doc(companyId).collection("bankCategories");
const ruleCol = db.collection("companies").doc(companyId).collection("bankRules");

// temiz başla (tekrar koşulabilir)
for (const id of ["acc1_pend-raw-1", "acc1_book-raw-9", "acc1_pend-raw-2", "acc1_book-raw-8", "qa_rs_a", "qa_rs_b"]) {
  await txCol.doc(id).delete();
}
for (const snap of [await catCol.where("name", "in", ["QA Packaging", "QA Packing Materials"]).get()]) {
  for (const doc of snap.docs) await doc.ref.delete();
}
for (const doc of (await ruleCol.where("keyword", "==", "qa-packaging-kw").get()).docs) await doc.ref.delete();

console.log("=== 1) normalizeTransaction kalıcı kimlikleri yazıyor ===");
const { createBankFeedFunctions } = require("../../bankFeed.js");
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const feed = createBankFeedFunctions({
  admin,
  onCall: (_opts, handler) => handler,
  onSchedule: (_opts, handler) => handler,
  HttpsError,
  uidIsCompanyOwner: () => true
});
const sampleTx = {
  transaction_id: "raw-tx-1", timestamp: "2026-08-20T09:00:00Z", amount: -42.5,
  currency: "GBP", description: "CARD PAYMENT COTSWOLD GOLD", transaction_type: "DEBIT",
  transaction_category: "PURCHASE", merchant_name: "Cotswold Gold",
  normalised_provider_transaction_id: "norm-tx-1",
  meta: { provider_reference: "REF-778899" }
};
const normalized = feed._internal.normalizeTransaction("acc1", "conn1", sampleTx, "booked", []);
ok("provider = truelayer", normalized.provider === "truelayer", String(normalized.provider));
ok("providerTransactionId saklandı", normalized.providerTransactionId === "raw-tx-1", String(normalized.providerTransactionId));
ok("normalisedProviderId saklandı", normalized.normalisedProviderId === "norm-tx-1", String(normalized.normalisedProviderId));
ok("providerReference saklandı", normalized.providerReference === "REF-778899", String(normalized.providerReference));
ok("doc id deterministik", feed._internal.transactionDocId("acc1", sampleTx) === feed._internal.transactionDocId("acc1", sampleTx));

console.log("=== 2) pending→booked mutabakatı: enrichment taşınır, hayalet silinir ===");
await txCol.doc("acc1_pend-raw-1").set({
  accountId: "acc1", connectionId: "conn1", status: "pending", amount: -12.5,
  normalisedProviderId: "norm-1", category: "Materials", note: "from pending", vatCode: "ST"
});
await txCol.doc("acc1_book-raw-9").set({
  accountId: "acc1", connectionId: "conn1", status: "booked", amount: -12.5,
  normalisedProviderId: "norm-1", description: "booked twin"
});
const moved = await feed._internal.reconcilePendingToBooked(companyId, "acc1", [
  { id: "acc1_book-raw-9", data: { status: "booked", normalisedProviderId: "norm-1" } }
]);
ok("bir doc taşındı", moved === 1, String(moved));
ok("pending hayalet silindi", !(await txCol.doc("acc1_pend-raw-1").get()).exists);
const booked = (await txCol.doc("acc1_book-raw-9").get()).data() || {};
ok("kategori taşındı", booked.category === "Materials", String(booked.category));
ok("not taşındı", booked.note === "from pending", String(booked.note));
ok("vat taşındı", booked.vatCode === "ST", String(booked.vatCode));

// var olan enrichment EZİLMEZ
await txCol.doc("acc1_pend-raw-2").set({
  accountId: "acc1", status: "pending", normalisedProviderId: "norm-2", category: "Materials"
});
await txCol.doc("acc1_book-raw-8").set({
  accountId: "acc1", status: "booked", normalisedProviderId: "norm-2", category: "Equipment"
});
await feed._internal.reconcilePendingToBooked(companyId, "acc1", [
  { id: "acc1_book-raw-8", data: { status: "booked", normalisedProviderId: "norm-2" } }
]);
const booked2 = (await txCol.doc("acc1_book-raw-8").get()).data() || {};
ok("booked'daki mevcut kategori korundu", booked2.category === "Equipment", String(booked2.category));
ok("ikinci hayalet de silindi", !(await txCol.doc("acc1_pend-raw-2").get()).exists);

console.log("=== 3) reviewStatus + yeni VAT kodları (callable) ===");
await txCol.doc("qa_rs_a").set({ accountId: "acc1", status: "booked", amount: -5, description: "qa a" });
await txCol.doc("qa_rs_b").set({ accountId: "acc1", status: "booked", amount: -6, description: "qa b" });
await call("bankUpdateTransaction", { transactionId: "qa_rs_a", vatCode: "ZR", reviewStatus: "ready" });
let a = (await txCol.doc("qa_rs_a").get()).data() || {};
ok("ZR vat kodu kabul edildi", a.vatCode === "ZR", String(a.vatCode));
ok("reviewStatus ready yazıldı", a.reviewStatus === "ready", String(a.reviewStatus));
let threw = "";
try { await call("bankUpdateTransaction", { transactionId: "qa_rs_a", reviewStatus: "bogus" }); } catch (e) { threw = e.message; }
ok("bilinmeyen statü reddedildi", /review status/i.test(threw), threw);
threw = "";
try { await call("bankUpdateTransaction", { transactionId: "qa_rs_a", vatCode: "XX" }); } catch (e) { threw = e.message; }
ok("bilinmeyen VAT reddedildi", /VAT/i.test(threw), threw);
const bulk = await call("bankSetReviewStatusBulk", { transactionIds: ["qa_rs_a", "qa_rs_b"], reviewStatus: "needs_info" });
ok("bulk 2 doc güncelledi", bulk.updated === 2, JSON.stringify(bulk));
a = (await txCol.doc("qa_rs_b").get()).data() || {};
ok("bulk statü yazıldı", a.reviewStatus === "needs_info", String(a.reviewStatus));
await call("bankSetReviewStatusBulk", { transactionIds: ["qa_rs_a"], reviewStatus: "unreviewed" });
a = (await txCol.doc("qa_rs_a").get()).data() || {};
ok("unreviewed alanı temizler", a.reviewStatus === undefined, String(a.reviewStatus));

console.log("=== 4) workspace kategori kayıtları ===");
const saved = await call("bankSaveCategory", {
  name: "QA Packaging", type: "expense", defaultVatCode: "ZR",
  mappings: { pandle: { nominalCode: "510", taxCode: "ST" }, xero: { accountCode: "402" } }
});
ok("kategori oluştu", Boolean(saved.categoryId), JSON.stringify(saved));
const catDoc = (await catCol.doc(saved.categoryId).get()).data() || {};
ok("defaultVatCode saklandı", catDoc.defaultVatCode === "ZR", String(catDoc.defaultVatCode));
ok("pandle mapping saklandı", catDoc.mappings?.pandle?.nominalCode === "510", JSON.stringify(catDoc.mappings));
ok("xero mapping saklandı", catDoc.mappings?.xero?.accountCode === "402", JSON.stringify(catDoc.mappings));
threw = "";
try { await call("bankSaveCategory", { name: "QA Packaging" }); } catch (e) { threw = e.message; }
ok("aynı isim ikinci kez reddedildi", /already exists/i.test(threw), threw);

// yeniden adlandırma: transaction + kural adı takip eder
await txCol.doc("qa_rs_a").set({ category: "QA Packaging" }, { merge: true });
await ruleCol.doc("qa-rule-1").set({ keyword: "qa-packaging-kw", category: "QA Packaging", createdAt: admin.firestore.FieldValue.serverTimestamp() });
const renamedRes = await call("bankSaveCategory", { categoryId: saved.categoryId, name: "QA Packing Materials", defaultVatCode: "ZR" });
ok("rename transaction'ı taşıdı", renamedRes.renamed >= 1, JSON.stringify(renamedRes));
a = (await txCol.doc("qa_rs_a").get()).data() || {};
ok("transaction yeni adı taşıyor", a.category === "QA Packing Materials", String(a.category));
const rule = (await ruleCol.doc("qa-rule-1").get()).data() || {};
ok("kural yeni adı taşıyor", rule.category === "QA Packing Materials", String(rule.category));
await call("bankDeleteCategory", { categoryId: saved.categoryId });
ok("kategori silindi", !(await catCol.doc(saved.categoryId).get()).exists);

console.log("=== 5) rules: bankCategories okunur, pandleSyncRuns kapalı ===");
const restBase = `http://127.0.0.1:8080/v1/projects/eggcraft-studio/databases/(default)/documents`;
const catRead = await fetch(`${restBase}/companies/${companyId}/bankCategories/xyz`, { headers: { Authorization: `Bearer ${idToken}` } });
ok("bankCategories owner'a açık (404 = kural geçti)", catRead.status === 404 || catRead.status === 200, String(catRead.status));
const runRead = await fetch(`${restBase}/companies/${companyId}/pandleSyncRuns/xyz`, { headers: { Authorization: `Bearer ${idToken}` } });
ok("pandleSyncRuns client'a kapalı", runRead.status === 403, String(runRead.status));
const catWrite = await fetch(`${restBase}/companies/${companyId}/bankCategories/hack`, {
  method: "PATCH", headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { name: { stringValue: "hack" } } })
});
ok("bankCategories client yazamaz", catWrite.status === 403, String(catWrite.status));

console.log("=== 6) kural VAT + kapsam: otomatik kategori yanında otomatik VAT ===");
await txCol.doc("qa_rs_a").set({ counterparty: "QA VATRULE LTD", description: "qa vat rule", amount: -9 }, { merge: true });
const vatRule = await call("bankSaveRule", { keyword: "qa vatrule", category: "Software", vatCode: "ZR", appliesTo: "out" });
ok("kural oluştu", Boolean(vatRule.ruleId), JSON.stringify(vatRule));
const ruleDoc = (await ruleCol.doc(vatRule.ruleId).get()).data() || {};
ok("kural vatCode saklandı", ruleDoc.vatCode === "ZR", String(ruleDoc.vatCode));
ok("kural appliesTo saklandı", ruleDoc.appliesTo === "out", String(ruleDoc.appliesTo));
a = (await txCol.doc("qa_rs_a").get()).data() || {};
ok("categoryAuto uygulandı", a.categoryAuto === "Software", String(a.categoryAuto));
ok("vatCodeAuto uygulandı", a.vatCodeAuto === "ZR", String(a.vatCodeAuto));
// gelen işlem "out" kuralına takılmamalı
await txCol.doc("qa_rs_b").set({ counterparty: "QA VATRULE LTD", description: "qa vat rule incoming", amount: 9, category: admin.firestore.FieldValue.delete(), categoryAuto: admin.firestore.FieldValue.delete() }, { merge: true });
await call("bankSaveRule", { keyword: "qa vatrule", category: "Software", vatCode: "ZR", appliesTo: "out" });
a = (await txCol.doc("qa_rs_b").get()).data() || {};
ok("money-in 'out' kuralından etkilenmedi", a.categoryAuto === undefined, String(a.categoryAuto));
await call("bankDeleteRule", { ruleId: vatRule.ruleId });
a = (await txCol.doc("qa_rs_a").get()).data() || {};
ok("kural silinince vatCodeAuto da temizlendi", a.vatCodeAuto === undefined, String(a.vatCodeAuto));

// temizlik
await ruleCol.doc("qa-rule-1").delete();
for (const id of ["acc1_book-raw-9", "acc1_book-raw-8", "qa_rs_a", "qa_rs_b"]) await txCol.doc(id).delete();

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

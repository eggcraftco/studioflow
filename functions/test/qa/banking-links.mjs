// Banking B2: split transaction doğrulaması, incoming↔order payment
// eşleştirmesi (duplicate payment üretmeden) ve Files kütüphanesinden receipt.
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
  if (json.error) { const err = new Error(json.error.message); throw err; }
  return json.result;
}

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

const txCol = db.collection("companies").doc(companyId).collection("bankTransactions");
const orderRef = db.collection("siparisler").doc("qa-bank-order");

// temiz başla
for (const id of ["qa_split_1", "qa_in_1", "qa_rcpt_1"]) await txCol.doc(id).delete();
await orderRef.delete();
await db.collection("companies").doc(companyId).collection("fileRecords").doc("qafilerecord1").delete();

console.log("=== 1) split: toplam tutmalı, satırlar doğrulanır ===");
await txCol.doc("qa_split_1").set({ accountId: "acc1", status: "booked", amount: -120, currency: "GBP", bookingDate: "2026-08-20", description: "AMAZON", counterparty: "Amazon" });
let threw = "";
try { await call("bankSetTransactionSplits", { transactionId: "qa_split_1", splits: [{ amount: 70, category: "Materials" }, { amount: 30, category: "Shipping" }] }); } catch (e) { threw = e.message; }
ok("eksik toplam reddedildi", /must match/i.test(threw), threw);
threw = "";
try { await call("bankSetTransactionSplits", { transactionId: "qa_split_1", splits: [{ amount: 120, category: "Materials" }] }); } catch (e) { threw = e.message; }
ok("tek satır split reddedildi", /two lines/i.test(threw), threw);
const splitRes = await call("bankSetTransactionSplits", { transactionId: "qa_split_1", splits: [
  { amount: 70, category: "Materials", vatCode: "ST", note: "gold wire" },
  { amount: 30, category: "Shipping", vatCode: "ZR" },
  { amount: 20, category: "Other" }
] });
ok("3 satırlık split kaydedildi", splitRes.lines === 3, JSON.stringify(splitRes));
let doc = (await txCol.doc("qa_split_1").get()).data() || {};
ok("splits dokümanda", Array.isArray(doc.splits) && doc.splits.length === 3 && doc.splits[0].amount === 70, JSON.stringify(doc.splits));
await call("bankSetTransactionSplits", { transactionId: "qa_split_1", splits: [] });
doc = (await txCol.doc("qa_split_1").get()).data() || {};
ok("boş dizi split'i temizler", doc.splits === undefined, JSON.stringify(doc.splits));

console.log("=== 2) incoming↔order payment: suggest → link, duplicate yok ===");
await orderRef.set({
  companyId, customerName: "Bank Match Customer", designName: "Gold Band",
  paidAmount: 850, remainingAmount: 150, orderValue: 1000,
  payments: [
    { id: "pay-1", amount: 850, date: admin.firestore.Timestamp.now(), method: "Card", note: "" },
    { id: "pay-2", amount: 100, date: admin.firestore.Timestamp.now(), method: "Cash", note: "" }
  ]
});
await txCol.doc("qa_in_1").set({ accountId: "acc1", status: "booked", amount: 850, currency: "GBP", bookingDate: "2026-08-21", description: "FASTER PAYMENT", counterparty: "Bank Match Customer" });
const sug = await call("bankMatchIncomingToOrder", { transactionId: "qa_in_1", orderId: "qa-bank-order", mode: "suggest" });
ok("öneri tek adayı buldu", sug.candidates.length === 1 && sug.candidates[0].id === "pay-1", JSON.stringify(sug.candidates));
const linked = await call("bankMatchIncomingToOrder", { transactionId: "qa_in_1", orderId: "qa-bank-order", mode: "link" });
ok("tek aday otomatik bağlandı", linked.linked === true && linked.paymentId === "pay-1", JSON.stringify(linked));
let order = (await orderRef.get()).data() || {};
ok("payment banka iziyle damgalandı", order.payments[0].bankTransactionId === "qa_in_1", JSON.stringify(order.payments[0]));
ok("paidAmount DEĞİŞMEDİ (duplicate yok)", order.paidAmount === 850, String(order.paidAmount));
doc = (await txCol.doc("qa_in_1").get()).data() || {};
ok("tx order_payment olarak işaretli", doc.incomingKind === "order_payment" && doc.linkedPaymentId === "pay-1", JSON.stringify({ k: doc.incomingKind, p: doc.linkedPaymentId }));

// aynı işlemi tekrar link etmek idempotent
const again = await call("bankMatchIncomingToOrder", { transactionId: "qa_in_1", orderId: "qa-bank-order", mode: "link" });
ok("tekrar link idempotent", again.already === true, JSON.stringify(again));
// create modu da aynı banka satırı için ikinci payment YARATMAZ
const noDup = await call("bankMatchIncomingToOrder", { transactionId: "qa_in_1", orderId: "qa-bank-order", mode: "create" });
ok("create de duplicate üretmedi", noDup.already === true && !noDup.created, JSON.stringify(noDup));
order = (await orderRef.get()).data() || {};
ok("payment sayısı hâlâ 2", order.payments.length === 2, String(order.payments.length));

console.log("=== 3) unlink geri alır, payment silinmez ===");
await call("bankMatchIncomingToOrder", { transactionId: "qa_in_1", mode: "unlink" });
order = (await orderRef.get()).data() || {};
ok("payment damgası kalktı", !order.payments[0].bankTransactionId, JSON.stringify(order.payments[0]));
ok("payment yerinde duruyor", order.payments.length === 2 && order.paidAmount === 850);
doc = (await txCol.doc("qa_in_1").get()).data() || {};
ok("tx bağlantısı temizlendi", !doc.linkedPaymentId && doc.incomingKind === undefined, JSON.stringify({ p: doc.linkedPaymentId, k: doc.incomingKind }));

console.log("=== 4) eşleşme yoksa create yeni payment ekler (bir kez) ===");
await txCol.doc("qa_in_1").set({ amount: 999.5 }, { merge: true });
const created = await call("bankMatchIncomingToOrder", { transactionId: "qa_in_1", orderId: "qa-bank-order", mode: "create" });
ok("payment oluştu", created.created === true, JSON.stringify(created));
order = (await orderRef.get()).data() || {};
ok("payment 3 oldu, tutar doğru", order.payments.length === 3 && order.payments[2].amount === 999.5, String(order.payments.length));
ok("paidAmount güncellendi", order.paidAmount === 1849.5, String(order.paidAmount));
ok("remaining sıfıra kilitlendi", order.remainingAmount === 0, String(order.remainingAmount));

console.log("=== 5) incomingKind doğrulaması + spending reddi ===");
await call("bankUpdateTransaction", { transactionId: "qa_in_1", incomingKind: "transfer" });
doc = (await txCol.doc("qa_in_1").get()).data() || {};
ok("incomingKind transfer yazıldı", doc.incomingKind === "transfer", String(doc.incomingKind));
threw = "";
try { await call("bankUpdateTransaction", { transactionId: "qa_in_1", incomingKind: "salary" }); } catch (e) { threw = e.message; }
ok("bilinmeyen kind reddedildi", /incoming kind/i.test(threw), threw);
await txCol.doc("qa_rcpt_1").set({ accountId: "acc1", status: "booked", amount: -50, currency: "GBP", bookingDate: "2026-08-19", description: "SUPPLIER", counterparty: "Supplier" });
threw = "";
try { await call("bankMatchIncomingToOrder", { transactionId: "qa_rcpt_1", orderId: "qa-bank-order", mode: "link" }); } catch (e) { threw = e.message; }
ok("giden işlem incoming eşleşmesine giremez", /incoming/i.test(threw), threw);

console.log("=== 6) receipt: Files kütüphanesinden seç, dosya kopyalanmaz/silinmez ===");
await db.collection("companies").doc(companyId).collection("fileRecords").doc("qafilerecord1").set({
  storagePath: `companies/${companyId}/purchase_files/invoice-abc.pdf`,
  fileName: "invoice-abc.pdf", displayName: "Supplier invoice ABC", trashedAtMs: 0
});
await call("bankSetTransactionReceipt", { transactionId: "qa_rcpt_1", fileRecordId: "qafilerecord1" });
doc = (await txCol.doc("qa_rcpt_1").get()).data() || {};
ok("kütüphane yolu receipt oldu", doc.receiptPath === `companies/${companyId}/purchase_files/invoice-abc.pdf`, doc.receiptPath);
ok("adı kütüphaneden geldi", doc.receiptName === "Supplier invoice ABC", doc.receiptName);
ok("fileRecordId damgalandı", doc.receiptFileRecordId === "qafilerecord1", String(doc.receiptFileRecordId));
// receipt'i temizle → kütüphane dosyası storage'dan SİLİNMEMELİ (path bank_receipts değil)
await call("bankSetTransactionReceipt", { transactionId: "qa_rcpt_1", storagePath: "" });
doc = (await txCol.doc("qa_rcpt_1").get()).data() || {};
ok("receipt temizlendi", doc.receiptPath === "" && doc.receiptFileRecordId === undefined, JSON.stringify({ p: doc.receiptPath, f: doc.receiptFileRecordId }));
// çöpteki kayıt reddedilir
await db.collection("companies").doc(companyId).collection("fileRecords").doc("qafilerecord1").set({ trashedAtMs: Date.now() }, { merge: true });
threw = "";
try { await call("bankSetTransactionReceipt", { transactionId: "qa_rcpt_1", fileRecordId: "qafilerecord1" }); } catch (e) { threw = e.message; }
ok("çöpteki dosya receipt olamaz", /trash/i.test(threw), threw);

// temizlik
for (const id of ["qa_split_1", "qa_in_1", "qa_rcpt_1"]) await txCol.doc(id).delete();
await orderRef.delete();
await db.collection("companies").doc(companyId).collection("fileRecords").doc("qafilerecord1").delete();

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

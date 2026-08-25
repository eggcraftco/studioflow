// KDV, müşterinin ödediği fiyatın İÇİNDEDİR: brütten çıkarılır, üstüne eklenmez.
// £1.450 %20 -> £1.208,33 + £241,67. Basılan her Subtotal + VAT = Total bunu
// karşılamalı; eskiden £1.160 + £290 yazıyordu ve %20 tutmuyordu.
import { readFileSync } from "node:fs";
const S = new URL(".", import.meta.url).pathname;
const { companyId, orderId, customToken } = JSON.parse(readFileSync(`${S}/seed-out.json`, "utf8"));

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
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

async function estimateFor(total, rate, taxType = "Revenue") {
  const made = await call("createOrderEstimate", {
    orderId, taxRate: rate, taxType,
    lineItems: [{ name: `Test ${total}`, quantity: 1, unitPrice: total }],
    notes: "", terms: ""
  });
  const rec = await call("getOrderEstimateRecord", { orderId, estimateId: made.estimateId });
  return rec.estimate || rec.record || rec;
}

console.log("=== KDV dahil çıkarım ===");
const a = await estimateFor(1450, 20);
ok("£1.450 %20 -> KDV £241,67", near(a.taxAmount, 241.67), `taxAmount=${a.taxAmount}`);
ok("£1.450 %20 -> alt toplam £1.208,33", near(a.subtotal, 1208.33), `subtotal=${a.subtotal}`);
ok("Subtotal + VAT == Total", near(Number(a.subtotal) + Number(a.taxAmount), a.total), `${a.subtotal}+${a.taxAmount}!=${a.total}`);
ok("VAT gerçekten alt toplamın %20'si", near(Number(a.subtotal) * 0.2, a.taxAmount), `${Number(a.subtotal) * 0.2} vs ${a.taxAmount}`);

console.log("=== sıfır oran ===");
const z = await estimateFor(500, 0);
ok("oran 0 -> KDV yok", near(z.taxAmount, 0) && near(z.subtotal, 500), JSON.stringify({ s: z.subtotal, t: z.taxAmount }));

console.log("=== kâr marjı şeması ===");
const m = await estimateFor(900, 20, "Profit");
ok("marj şemasında teklifte KDV satırı yok", near(m.taxAmount, 0) && near(m.subtotal, 900), JSON.stringify({ s: m.subtotal, t: m.taxAmount }));

console.log("=== farklı oran (%5) ===");
const f = await estimateFor(210, 5);
ok("£210 %5 -> KDV £10", near(f.taxAmount, 10), `taxAmount=${f.taxAmount}`);
ok("£210 %5 -> alt toplam £200", near(f.subtotal, 200), `subtotal=${f.subtotal}`);

console.log(fail === 0 ? "\nTÜMÜ GEÇTİ" : `\n${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

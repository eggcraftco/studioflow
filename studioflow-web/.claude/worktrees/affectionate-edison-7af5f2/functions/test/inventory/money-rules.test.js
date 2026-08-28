const { createInventoryFunctions } = require("../../inventory.js");

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const api = createInventoryFunctions({
  admin: { firestore: () => ({}) },
  onCall: (_opts, handler) => handler,
  HttpsError: class extends Error {},
  requireWorkspace: async () => ({ uid: "u", email: "e", companyId: "c" }),
  cleanText: (v, f = "", max = 200) => (v === undefined || v === null ? f : String(v).slice(0, max)),
  roundMoney: round
});
const { allocateExtras, purchaseTotals } = api._internal;

let fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
};

// Kullanıcının örneği: Rolex 1601 £2,300 + £150 kargo = £2,450
const one = [{ unitPrice: 2300, quantity: 1 }];
check("tek satır: kargo tamamı o satıra", allocateExtras(one, 150), [150]);
check("tek satır toplamı", purchaseTotals(one, 150, 0), { goodsTotal: 2300, shipping: 150, otherCosts: 0, total: 2450 });

// Üç satır, bölünemeyen kargo: paylar toplamı kargoya EŞİT olmalı (kuruş kaybı yok)
const three = [{ unitPrice: 100, quantity: 1 }, { unitPrice: 100, quantity: 1 }, { unitPrice: 100, quantity: 1 }];
const shares = allocateExtras(three, 10);
check("üç eşit satır, £10 kargo", shares, [3.33, 3.33, 3.34]);
check("paylar toplamı = kargo", round(shares.reduce((a, b) => a + b, 0)), 10);

// Değere göre orantı: pahalı parça kargonun büyük payını taşır
const mixed = [{ unitPrice: 900, quantity: 1 }, { unitPrice: 100, quantity: 1 }];
check("orantılı dağıtım 900/100", allocateExtras(mixed, 50), [45, 5]);

// Adet çarpanı hesaba katılıyor mu
const qty = [{ unitPrice: 10, quantity: 10 }, { unitPrice: 100, quantity: 1 }];
check("adet dahil orantı (100 vs 100)", allocateExtras(qty, 20), [10, 10]);

// Sıfır ve bedava mal: sıfıra bölme yok
check("kargo yok", allocateExtras(one, 0), [0]);
check("mal bedelsiz, kargo var -> dağıtılamaz", allocateExtras([{ unitPrice: 0, quantity: 3 }], 25), [0]);

// Toplam = mal + kargo + diğer
check("toplam üç bileşen", purchaseTotals(mixed, 50, 12.5), { goodsTotal: 1000, shipping: 50, otherCosts: 12.5, total: 1062.5 });

// Negatif tutar sızmasın
check("negatif kargo sıfırlanır", purchaseTotals(one, -99, 0).shipping, 0);

// EN ÖNEMLİSİ: satırların (fiyat + payı) toplamı purchase toplamına eşit olmalı
const lines = [{ unitPrice: 333.33, quantity: 3 }, { unitPrice: 12.99, quantity: 7 }];
const t = purchaseTotals(lines, 41.5, 3.75);
const sh = allocateExtras(lines, round(t.shipping + t.otherCosts));
const rebuilt = round(lines.reduce((s, l, i) => s + l.unitPrice * l.quantity + sh[i], 0));
check("satır maliyetleri toplamı = purchase toplamı", rebuilt, t.total);

console.log(fail === 0 ? "\nTÜM TESTLER GEÇTİ" : `\n${fail} TEST BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

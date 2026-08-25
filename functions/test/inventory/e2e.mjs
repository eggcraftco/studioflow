// Envanter faz 1-4 uçtan uca: ÇALIŞAN fonksiyonları, gerçek Firestore
// üzerinden, oturum açmış bir kullanıcı olarak çağırır.
import { readFileSync } from "node:fs";
const S = new URL(".", import.meta.url).pathname;
const { companyId, customToken } = JSON.parse(readFileSync(`${S}/seed-out.json`, "utf8"));

// Özel token -> ID token (emülatörün Identity Toolkit ucu; parola yok)
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
const ok = (label, cond, extra = "") => {
  if (!cond) fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : "  <- " + extra}`);
};
async function mustThrow(label, fn, expect) {
  try { await fn(); ok(label, false, "hata beklendi, geçti"); }
  catch (e) { ok(label, expect ? e.message.includes(expect) : true, e.message); }
}
const money = (n) => Math.round(n * 100) / 100;

console.log("=== 1. AÇILIŞ STOĞU ===");
const dial = await call("saveInventoryItem", { item: {
  name: "Rolex 1601 gümüş kadran", category: "Dials", trackingType: "unique",
  brand: "Rolex", reference: "1601", serialNumber: "D-77120", condition: "Excellent",
  location: "Kasa A", purchasePrice: 2300,
  additionalCosts: [{ label: "Restorasyon", amount: 300 }]
}});
ok("benzersiz kalem kaydedildi", dial.ok === true && /^INV-\d{5}$/.test(dial.number), JSON.stringify(dial));

const lacquer = await call("saveInventoryItem", { item: {
  name: "Şeffaf lake", category: "Consumables", trackingType: "quantity",
  sku: "LAC-CLR", onHand: 120, unit: "ml", lowStockAt: 30,
  location: "Raf 2", purchasePrice: 0.5
}});
ok("adetli kalem kaydedildi", lacquer.ok === true, JSON.stringify(lacquer));

const customerRing = await call("saveInventoryItem", { item: {
  name: "Müşteri yüzüğü (onarım)", category: "Other", trackingType: "unique",
  ownership: "customer", location: "Kasa B", purchasePrice: 4000
}});
ok("müşteri malı kaydedildi", customerRing.ok === true);

let list = await call("listInventoryItems", { limit: 500 });
ok("üç kalem listeleniyor", list.items.length === 3, String(list.items.length));
const dialRow = list.items.find(i => i.name.includes("Rolex"));
ok("alış fiyatı 2300 AYRI duruyor", dialRow.purchasePrice === 2300, String(dialRow.purchasePrice));
ok("ek maliyet 300 ayrı", dialRow.additionalCostsTotal === 300, String(dialRow.additionalCostsTotal));
ok("iç toplam 2600", dialRow.internalTotalCost === 2600, String(dialRow.internalTotalCost));
const ringRow = list.items.find(i => i.ownership === "customer");
ok("müşteri malı SIFIR değerli", ringRow.valuationCost === 0, String(ringRow.valuationCost));

let sum = (await call("getInventorySummary")).summary;
// 2600 (kadran) + 120*0.5 = 60 (lake) = 2660. Müşteri yüzüğü sayılmaz.
ok("toplam envanter değeri 2660", sum.totalValue === 2660, String(sum.totalValue));
ok("müşteri malı sayısı 1", sum.customerOwnedCount === 1, String(sum.customerOwnedCount));
ok("müşteri malı toplama girmedi", sum.totalValue < 4000);

console.log("\n=== 2. ALIM VE TEDARİKÇİ ===");
const purchase = await call("savePurchase", { purchase: {
  supplierName: "Vintage Watch Co", purchaseDate: "2026-08-20", reference: "INV-8842",
  shipping: 150, otherCosts: 0,
  lines: [
    { name: "Rolex 1675 kadran", category: "Dials", trackingType: "unique", quantity: 1, unitPrice: 2300, serialNumber: "D-88301" },
    { name: "Kadran ayağı lehimi", category: "Consumables", trackingType: "quantity", quantity: 20, unit: "pcs", unitPrice: 5 }
  ]
}});
ok("alım numarası verildi", /^PUR-\d{4}$/.test(purchase.number), purchase.number);
ok("alım toplamı 2550", purchase.total === 2550, String(purchase.total));
ok("iki stok kalemi yaratıldı", purchase.itemsCreated === 2, String(purchase.itemsCreated));

list = await call("listInventoryItems", { limit: 500 });
const newDial = list.items.find(i => i.name.includes("1675"));
ok("alınan kalem 'incoming'", newDial.status === "incoming", newDial.status);
ok("alınan kalemin alış fiyatı 2300 bozulmadı", newDial.purchasePrice === 2300, String(newDial.purchasePrice));
ok("kargo payı AYRI satırda 143.75", newDial.additionalCostsTotal === 143.75, String(newDial.additionalCostsTotal));

// Adetli satırda pay BİRİM başına düşmeli, yoksa adet kadar katlanır.
const solder = list.items.find(i => i.name.includes("lehim"));
ok("adetli satırın birim alış fiyatı 5", solder.purchasePrice === 5, String(solder.purchasePrice));
ok("kargo payı birim başına 0.3125", solder.additionalCostsTotal === 0.3125, String(solder.additionalCostsTotal));
const solderLine = money(solder.valuationCost * solder.quantity.onHand);
ok("lehim satır değeri 106.25 (225 DEĞİL)", solderLine === 106.25, String(solderLine));
// Satırların toplamı alım toplamına eşit kalmalı
const dialLine = money(newDial.valuationCost);
ok("alımdan gelen iki satır toplamı = 2550", money(dialLine + solderLine) === 2550, String(money(dialLine + solderLine)));

sum = (await call("getInventorySummary")).summary;
ok("gelen kalem sayısı 2", sum.incomingCount === 2, String(sum.incomingCount));

console.log("\n=== 3. BANKA EŞLEŞTİRME ===");
const m1 = await call("linkPurchaseToBankTransaction", { purchaseId: purchase.purchaseId, transactionId: "tx-exact" });
ok("ödeme eşleşti, fark yok", m1.linked === true && m1.difference === 0, JSON.stringify(m1));

const p2 = await call("savePurchase", { purchase: {
  supplierName: "Royal Mail", purchaseDate: "2026-08-18",
  lines: [{ name: "Posta kutuları", category: "Packaging", trackingType: "quantity", quantity: 50, unit: "pcs", unitPrice: 1.5 }]
}});
await mustThrow("aynı ödeme ikinci alıma bağlanamaz",
  () => call("linkPurchaseToBankTransaction", { purchaseId: p2.purchaseId, transactionId: "tx-exact" }),
  "already matched");

const m2 = await call("linkPurchaseToBankTransaction", { purchaseId: p2.purchaseId, transactionId: "tx-far" });
ok("kısmi/farklı tutar engellenmiyor", m2.linked === true);
ok("fark bildiriliyor (85.40 - 75 = 10.40)", money(m2.difference) === 10.4, String(m2.difference));

const sup = await call("listSuppliers");
const vintage = sup.suppliers.find(s => s.name.toLowerCase().includes("vintage"));
ok("kartı olmayan tedarikçi listelendi", !!vintage && vintage.implied === true);
ok("kartı olmayan tedarikçi adı yazıldığı gibi görünüyor", vintage.name === "Vintage Watch Co", vintage.name);
ok("tedarikçi harcaması 2550", vintage.stats.total === 2550, String(vintage.stats.total));
ok("eşleşen ödeme sayılıyor", vintage.stats.matched === 1, String(vintage.stats.matched));

await call("saveSupplier", { supplier: { name: "Vintage Watch Co", email: "sales@vintagewatch.co.uk", phone: "+44 20 7946 0000" }});
const sup2 = await call("listSuppliers");
const vintage2 = sup2.suppliers.filter(s => s.name.toLowerCase().includes("vintage"));
ok("kart açılınca tekrar etmiyor", vintage2.length === 1, JSON.stringify(vintage2.map(v => v.name)));
ok("kart açılınca istatistik korunuyor", vintage2[0].stats.total === 2550, String(vintage2[0].stats.total));

console.log("\n=== 4. TESLİM ALMA ===");
const rec = await call("receivePurchase", { purchaseId: purchase.purchaseId });
ok("iki kalem teslim alındı", rec.received === 2, String(rec.received));
list = await call("listInventoryItems", { limit: 500 });
ok("teslim sonrası rafta", list.items.find(i => i.name.includes("1675")).status === "available");
await mustThrow("teslim alınmış alım silinemez",
  () => call("deletePurchase", { purchaseId: purchase.purchaseId }), "cannot be deleted");

console.log("\n=== 5. SİPARİŞE STOK AYIRMA ===");
await call("reserveInventoryForOrder", { itemId: dial.itemId, orderId: "ORD-1001", quantity: 1 });
const r2 = await call("reserveInventoryForOrder", { itemId: lacquer.itemId, orderId: "ORD-1001", quantity: 30 });
ok("30 ml ayrıldı, 90 kaldı", r2.remaining === 90, JSON.stringify(r2));

const stock = await call("getOrderInventory", { orderId: "ORD-1001" });
ok("sipariş iki kalem tutuyor", stock.items.length === 2, String(stock.items.length));
// 2600 (kadran) + 30 * 0.5 = 15  => 2615
ok("sipariş stok maliyeti 2615", stock.totalCost === 2615, String(stock.totalCost));

await mustThrow("aynı benzersiz kalem ikinci siparişe verilemez",
  () => call("reserveInventoryForOrder", { itemId: dial.itemId, orderId: "ORD-1002", quantity: 1 }),
  "already reserved");
await mustThrow("müşteri malı ayrılamaz",
  () => call("reserveInventoryForOrder", { itemId: customerRing.itemId, orderId: "ORD-1001", quantity: 1 }),
  "not stock");
await mustThrow("rafta olandan fazlası ayrılamaz",
  () => call("reserveInventoryForOrder", { itemId: lacquer.itemId, orderId: "ORD-1002", quantity: 91 }),
  "Only 90");

const r3 = await call("reserveInventoryForOrder", { itemId: lacquer.itemId, orderId: "ORD-1002", quantity: 90 });
ok("kalan 90 ml ikinci siparişe verilebilir", r3.remaining === 0, JSON.stringify(r3));

sum = (await call("getInventorySummary")).summary;
ok("özet rezerveyi görüyor", sum.reservedCount >= 2, String(sum.reservedCount));

await call("releaseInventoryFromOrder", { itemId: lacquer.itemId, orderId: "ORD-1001" });
const stock2 = await call("getOrderInventory", { orderId: "ORD-1001" });
ok("bırakınca siparişten düştü", stock2.items.length === 1, String(stock2.items.length));
ok("kalan maliyet 2600", stock2.totalCost === 2600, String(stock2.totalCost));
const stock3 = await call("getOrderInventory", { orderId: "ORD-1002" });
ok("diğer siparişin payı korundu", stock3.items.length === 1 && stock3.items[0].quantity === 90,
   JSON.stringify(stock3.items.map(i => i.quantity)));

console.log("\n=== 6. AYRILMIŞ STOK DÜZENLEMEDE KORUNUYOR MU ===");
// ORD-1002 hâlâ 90 ml tutuyor. Kalemin adını değiştirmek onu unutturmamalı,
// yoksa aynı 90 ml ikinci kez söz verilebilir hâle gelir.
await call("saveInventoryItem", { itemId: lacquer.itemId, item: {
  name: "Şeffaf lake (yeni ad)", category: "Consumables", trackingType: "quantity",
  sku: "LAC-CLR", onHand: 120, unit: "ml", lowStockAt: 30, purchasePrice: 0.5
}});
const afterEdit = (await call("listInventoryItems", { limit: 500 })).items.find(i => i.id === lacquer.itemId);
ok("ad değişti", afterEdit.name.includes("yeni ad"), afterEdit.name);
ok("ayrılmış miktar korundu (90)", afterEdit.quantity.reserved === 90, JSON.stringify(afterEdit.quantity));
ok("rezervasyon kaydı korundu", (afterEdit.reservedForOrderId || "") === "" && afterEdit.status === "reserved", afterEdit.status);
const stillHeld = await call("getOrderInventory", { orderId: "ORD-1002" });
ok("sipariş hâlâ 90 ml tutuyor", stillHeld.items.length === 1 && stillHeld.items[0].quantity === 90,
   JSON.stringify(stillHeld.items.map(i => i.quantity)));
await mustThrow("düzenleme sonrası aşırı rezervasyon hâlâ engelli",
  () => call("reserveInventoryForOrder", { itemId: lacquer.itemId, orderId: "ORD-1001", quantity: 31 }),
  "Only 30");

console.log("\n=== 7. DURUM GEÇİŞLERİ ===");
await mustThrow("satılmamış kalem 'available'dan 'sold'a geçebilir mi (geçmeli)",
  async () => { await call("setInventoryItemStatus", { itemId: lacquer.itemId, status: "sold" }); throw new Error("__gecti__"); },
  "__gecti__");
await mustThrow("satılmış kalem tekrar 'available' olamaz",
  () => call("setInventoryItemStatus", { itemId: lacquer.itemId, status: "available" }));

console.log(fail === 0 ? "\n✅ TÜM UÇTAN UCA TESTLER GEÇTİ" : `\n❌ ${fail} TEST BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);

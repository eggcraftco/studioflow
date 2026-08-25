// Stok sayımı, hareket defteri ve raporlama — ÇALIŞAN fonksiyonlara karşı.
import { readFileSync } from "node:fs";
const S = new URL(".", import.meta.url).pathname;
const { companyId, customToken } = JSON.parse(readFileSync(`${S}/seed-out.json`, "utf8"));

const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake",
  { method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ token: customToken, returnSecureToken: true })});
const { idToken } = await r.json();
const call = async (n, d={}) => {
  const res = await fetch(`http://127.0.0.1:5001/eggcraft-studio/europe-west2/${n}`, {
    method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${idToken}`},
    body: JSON.stringify({ data: { companyId, ...d }})});
  const j = await res.json();
  if (j.error) throw new Error(`${n}: ${j.error.message}`);
  return j.result;
};
let fail=0;
const ok=(l,c,e="")=>{ if(!c) fail++; console.log(`${c?"PASS":"FAIL"}  ${l}${c?"":"  <- "+e}`); };
async function mustThrow(l, fn, expect) {
  try { await fn(); ok(l,false,"hata beklendi"); }
  catch(e){ ok(l, expect ? e.message.includes(expect) : true, e.message); }
}
const money = n => Math.round(n*100)/100;

console.log("=== 1. HAREKET DEFTERİ AÇILIŞTA YAZILIYOR MU ===");
const bars = await call("saveInventoryItem", { item: {
  name: "Yaylı çubuk 20mm", category: "Parts", trackingType: "quantity",
  onHand: 200, unit: "pcs", lowStockAt: 50, purchasePrice: 0.35, location: "Çekmece 1" }});
const dial = await call("saveInventoryItem", { item: {
  name: "Rolex 1601 kadran", category: "Dials", trackingType: "unique",
  purchasePrice: 2300, location: "Kasa A", serialNumber: "D-1" }});
const ring = await call("saveInventoryItem", { item: {
  name: "Müşteri yüzüğü", trackingType: "unique", ownership: "customer", purchasePrice: 4000 }});

let moves = (await call("listInventoryMovements")).movements;
ok("iki hareket yazıldı (müşteri malı da bir kalem)", moves.length === 3, String(moves.length));
const barMove = moves.find(m => m.itemId === bars.itemId);
ok("açılış hareketi 200 adet", barMove.delta === 200 && barMove.kind === "openingStock", JSON.stringify([barMove.delta, barMove.kind]));
ok("hareketin değeri 70", barMove.valueDelta === 70, String(barMove.valueDelta));

console.log("\n=== 2. ELLE DÜZELTME AYRI BİR SATIR ===");
await call("saveInventoryItem", { itemId: bars.itemId, item: {
  name: "Yaylı çubuk 20mm", category: "Parts", trackingType: "quantity",
  onHand: 190, unit: "pcs", lowStockAt: 50, purchasePrice: 0.35, location: "Çekmece 1" }});
moves = (await call("listInventoryMovements", { itemId: bars.itemId })).movements;
ok("aynı kalemde iki satır var", moves.length === 2, String(moves.length));
const adj = moves.find(m => m.kind === "adjustment");
ok("düzeltme -10", adj.delta === -10, String(adj.delta));
ok("defter düzeltiliyor değil, EKLENİYOR", moves.filter(m=>m.kind==="openingStock").length === 1);

console.log("\n=== 3. SAYIM BAŞLATMA ===");
const started = await call("startStocktake", { note: "Yıl sonu" });
ok("sayım numarası verildi", /^CNT-\d{4}$/.test(started.number), started.number);
// Müşteri malı sayıma girmemeli
ok("müşteri malı sayılacaklarda YOK", started.lines === 2, String(started.lines));
const st = (await call("getStocktake", { stocktakeId: started.stocktakeId })).stocktake;
const barLine = st.lines.find(l => l.itemId === bars.itemId);
ok("beklenen sayı dondurulmuş (190)", barLine.expected === 190, String(barLine.expected));
ok("henüz sayılmadı", barLine.counted === null, JSON.stringify(barLine.counted));

console.log("\n=== 4. SAYMADAN İŞLEMEK HİÇBİR ŞEYİ DEĞİŞTİRMEZ ===");
const emptyCommit = await call("commitStocktake", { stocktakeId: started.stocktakeId });
ok("sayılmayan satır düzeltilmedi", emptyCommit.adjusted === 0, String(emptyCommit.adjusted));
let items = (await call("listInventoryItems", { limit: 500 })).items;
ok("adet 190'da kaldı", items.find(i=>i.id===bars.itemId).quantity.onHand === 190);
await mustThrow("kapanmış sayım tekrar işlenemez",
  () => call("commitStocktake", { stocktakeId: started.stocktakeId }), "already closed");

console.log("\n=== 5. GERÇEK SAYIM: 190 beklenirken 187 sayıldı ===");
const s2 = await call("startStocktake", {});
await call("saveStocktakeCounts", { stocktakeId: s2.stocktakeId,
  counts: { [bars.itemId]: 187 }, notes: { [bars.itemId]: "Kırılan üç tane" }});
const res2 = await call("commitStocktake", { stocktakeId: s2.stocktakeId });
ok("bir satır düzeltildi", res2.adjusted === 1, String(res2.adjusted));
ok("değer etkisi -1.05", money(res2.valueDelta) === -1.05, String(res2.valueDelta));
items = (await call("listInventoryItems", { limit: 500 })).items;
ok("adet 187 oldu", items.find(i=>i.id===bars.itemId).quantity.onHand === 187);
moves = (await call("listInventoryMovements", { itemId: bars.itemId })).movements;
const cnt = moves.find(m => m.kind === "stocktake");
ok("defterde sayım satırı -3", cnt.delta === -3, String(cnt.delta));
ok("sayımın notu korundu", cnt.note === "Kırılan üç tane", cnt.note);

console.log("\n=== 6. SÖZ VERİLENDEN AZ SAYMAK: reddedilmez, BİLDİRİLİR ===");
await call("reserveInventoryForOrder", { itemId: bars.itemId, orderId: "ORD-1001", quantity: 100 });
const s3 = await call("startStocktake", {});
await call("saveStocktakeCounts", { stocktakeId: s3.stocktakeId, counts: { [bars.itemId]: 40 }});
const res3 = await call("commitStocktake", { stocktakeId: s3.stocktakeId });
ok("sayım kabul edildi (raf gerçektir)", res3.adjusted === 1);
ok("aşırı söz verilmiş kalem bildirildi", res3.overPromised.length === 1, JSON.stringify(res3.overPromised));
ok("hangi sipariş etkilendiği söyleniyor",
   res3.overPromised[0].orderIds.includes("ORD-1001"), JSON.stringify(res3.overPromised[0]));
ok("sayılan 40, söz verilen 100", res3.overPromised[0].counted === 40 && res3.overPromised[0].reserved === 100);

console.log("\n=== 7. BENZERSİZ KALEM SIFIR SAYILIRSA ===");
const s4 = await call("startStocktake", {});
await call("saveStocktakeCounts", { stocktakeId: s4.stocktakeId, counts: { [dial.itemId]: 0 }});
await call("commitStocktake", { stocktakeId: s4.stocktakeId });
items = (await call("listInventoryItems", { limit: 500 })).items;
const dialNow = items.find(i=>i.id===dial.itemId);
ok("kayıp benzersiz kalem raftan düştü", dialNow.status !== "available", dialNow.status);

console.log("\n=== 8. İPTAL ===");
const s5 = await call("startStocktake", {});
await call("cancelStocktake", { stocktakeId: s5.stocktakeId });
const list = (await call("listStocktakes")).stocktakes;
ok("iptal edilen silinmedi, işaretlendi",
   list.find(x=>x.id===s5.stocktakeId)?.status === "cancelled");
await mustThrow("işlenmiş sayım iptal edilemez",
   () => call("cancelStocktake", { stocktakeId: s2.stocktakeId }), "cannot be cancelled");

console.log("\n=== 9. RAPOR ===");
const rep = await call("getInventoryReport", {});
ok("müşteri malı değere girmiyor", rep.valuation.totalValue < 4000, String(rep.valuation.totalValue));
ok("kategoriye göre dağılım var", rep.valuation.byCategory.length >= 1, JSON.stringify(rep.valuation.byCategory));
ok("düşük stok yakalandı (40 <= 50)",
   rep.lowStock.some(l => l.itemId === bars.itemId), JSON.stringify(rep.lowStock.map(l=>l.name)));
ok("hareket türleri özetlendi", rep.movement.byKind.length >= 3, JSON.stringify(rep.movement.byKind.map(k=>k.kind)));
ok("defterin ne zaman başladığı söyleniyor", rep.movement.ledgerStartsMs > 0, String(rep.movement.ledgerStartsMs));

const old = await call("getInventoryReport", { fromMs: 1000000000000, toMs: Date.now() });
ok("defter öncesi dönem için DÜRÜST", old.movement.coversWholePeriod === false,
   String(old.movement.coversWholePeriod));

console.log(fail===0 ? "\n✅ TÜM SAYIM VE RAPOR TESTLERİ GEÇTİ" : `\n❌ ${fail} BAŞARISIZ`);
process.exit(fail===0?0:1);

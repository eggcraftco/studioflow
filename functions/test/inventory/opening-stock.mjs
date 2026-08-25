import { readFileSync } from "node:fs";
const S = new URL(".", import.meta.url).pathname;
const { companyId, customToken } = JSON.parse(readFileSync(`${S}/seed-out.json`, "utf8"));
const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake",
  { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ token: customToken, returnSecureToken: true })});
const { idToken } = await r.json();
const call = async (n, d={}) => {
  const res = await fetch(`http://127.0.0.1:5001/eggcraft-studio/europe-west2/${n}`, {
    method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${idToken}`},
    body: JSON.stringify({ data: { companyId, ...d }})});
  const j = await res.json();
  if (j.error) throw new Error(`${n}: ${j.error.message}`);
  return j.result;
};
let fail=0; const ok=(l,c,e="")=>{ if(!c) fail++; console.log(`${c?"PASS":"FAIL"}  ${l}${c?"":"  <- "+e}`); };

// CSV içe aktarımın kullanacağı toplu giriş
const res = await call("importOpeningStock", {
  openingDate: "2026-04-06",
  items: [
    { name: "Omega 168.022 kadran", category: "Dials", trackingType: "unique", purchasePrice: 900, serialNumber: "O-1" },
    { name: "Yaylı çubuk 20mm", category: "Parts", trackingType: "quantity", onHand: 200, unit: "pcs", purchasePrice: 0.35, lowStockAt: 50 },
    { name: "", category: "Parts", trackingType: "quantity", onHand: 5, purchasePrice: 1 }  // adsız: atlanmalı
  ]
});
ok("iki geçerli satır aktarıldı, adsız atlandı", res.imported === 2, JSON.stringify(res));

const list = await call("listInventoryItems", { limit: 500 });
const omega = list.items.find(i => i.name.includes("Omega"));
ok("açılış kalemi rafta", omega.status === "available", omega.status);
ok("açılış tarihi kaydedildi", omega.purchaseDate === "2026-04-06", omega.purchaseDate);
ok("sıralı numara verildi", /^INV-\d{5}$/.test(omega.number), omega.number);
const spring = list.items.find(i => i.name.includes("Yaylı"));
ok("adet ve birim doğru", spring.quantity.onHand === 200 && spring.quantity.unit === "pcs", JSON.stringify(spring.quantity));
ok("düşük stok eşiği kaydedildi", spring.lowStockAt === 50, String(spring.lowStockAt));
ok("adsız satır yaratılmadı", !list.items.some(i => !i.name));

console.log(fail===0 ? "\n✅ AÇILIŞ STOĞU TESTLERİ GEÇTİ" : `\n❌ ${fail} BAŞARISIZ`);
process.exit(fail===0?0:1);

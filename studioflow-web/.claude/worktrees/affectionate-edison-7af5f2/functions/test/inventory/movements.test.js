// Hareket defteri. En kritik iddia: ÇIKIŞLAR da yazılıyor.
// roundUnitMoney maliyet için sıfırda tabanlar; delta işaretlidir. O yardımcıyı
// burada bir kez kullanmak defterden her çıkışı sessizce yutuyordu.
const { createInventoryFunctions } = require("../../inventory.js");

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const store = new Map();
const key = (p) => p.join("/");
const mk = (p) => ({ path: p, id: p[p.length - 1], get: async () => snap(p), set: async (d, o) => write(p, d, o) });
const snap = (p) => { const d = store.get(key(p)); return { exists: d !== undefined, data: () => d, id: p[p.length - 1] }; };
const write = (p, d, o) => { const prev = o && o.merge ? store.get(key(p)) || {} : {}; store.set(key(p), { ...prev, ...d }); };
let seq = 0;
const coll = (p) => ({ doc: (id) => mk([...p, id || `auto${seq++}`]) });
const firestore = () => ({
  collection: (n) => ({ doc: (id) => ({ collection: (sub) => coll([n, id, sub]), ...mk([n, id]) }) }),
  runTransaction: async (fn) => fn({ get: async (r) => snap(r.path), set: (r, d, o) => write(r.path, d, o) })
});
const api = createInventoryFunctions({
  admin: { firestore }, onCall: (_o, h) => h, HttpsError: class extends Error {},
  requireWorkspace: async () => ({ uid: "u", email: "e", companyId: "C" }),
  cleanText: (v, f = "", m = 200) => (v == null ? f : String(v).slice(0, m)), roundMoney: round
});
const { roundSigned, roundUnitMoney } = api._internal;
const req = (d) => ({ data: d, auth: { uid: "u", token: { email: "e" } } });
const movements = () => [...store.entries()]
  .filter(([k]) => k.includes("inventoryMovements")).map(([, v]) => v);

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

(async () => {
  console.log("=== YUVARLAMA: maliyet vs delta ===");
  ok("maliyet negatif olamaz (tabanlanır)", roundUnitMoney(-5) === 0, String(roundUnitMoney(-5)));
  ok("delta İŞARETLİ kalır", roundSigned(-5) === -5, String(roundSigned(-5)));
  ok("delta kuruş altını korur", roundSigned(-0.3125) === -0.3125, String(roundSigned(-0.3125)));
  ok("delta sayı değilse sıfır", roundSigned("abc") === 0, String(roundSigned("abc")));

  console.log("\n=== GİRİŞ VE ÇIKIŞ ===");
  const a = await api.saveInventoryItem(req({ item: {
    name: "Bar", trackingType: "quantity", onHand: 200, purchasePrice: 0.35 }}));
  ok("açılış hareketi yazıldı", movements().length === 1, String(movements().length));
  ok("giriş +200", movements()[0].delta === 200, String(movements()[0].delta));

  await api.saveInventoryItem(req({ itemId: a.itemId, item: {
    name: "Bar", trackingType: "quantity", onHand: 190, purchasePrice: 0.35 }}));
  const adj = movements().find((m) => m.kind === "adjustment");
  ok("AŞAĞI düzeltme deftere yazıldı", !!adj, "hiç yazılmadı");
  ok("düzeltme -10", adj && adj.delta === -10, adj ? String(adj.delta) : "-");
  ok("değer etkisi de negatif", adj && adj.valueDelta === -3.5, adj ? String(adj.valueDelta) : "-");

  console.log("\n=== SATIŞ RAFTAN DÜŞÜRÜR ===");
  const b = await api.saveInventoryItem(req({ item: {
    name: "Kadran", trackingType: "unique", purchasePrice: 900 }}));
  await api.setInventoryItemStatus(req({ itemId: b.itemId, status: "sold" }));
  const sold = movements().find((m) => m.kind === "sold");
  ok("satış hareketi yazıldı", !!sold, "hiç yazılmadı");
  ok("satış -1", sold && sold.delta === -1, sold ? String(sold.delta) : "-");
  ok("satışın değer etkisi -900", sold && sold.valueDelta === -900, sold ? String(sold.valueDelta) : "-");

  console.log("\n=== REZERVE ETMEK STOK HAREKETİ DEĞİLDİR ===");
  const c = await api.saveInventoryItem(req({ item: {
    name: "Lake", trackingType: "quantity", onHand: 100, purchasePrice: 0.5 }}));
  const beforeCount = movements().length;
  await api.setInventoryItemStatus(req({ itemId: c.itemId, status: "reserved", orderId: "ORD-1" }));
  ok("rezerve defter satırı YARATMAZ", movements().length === beforeCount, String(movements().length - beforeCount));

  console.log("\n=== DEĞİŞMEYEN KAYIT SATIR YAZMAZ ===");
  const before2 = movements().length;
  await api.saveInventoryItem(req({ itemId: a.itemId, item: {
    name: "Bar (yeni ad)", trackingType: "quantity", onHand: 190, purchasePrice: 0.35 }}));
  ok("sadece ad değişince hareket yok", movements().length === before2, String(movements().length - before2));

  console.log(fail === 0 ? "\n✅ HAREKET DEFTERİ TESTLERİ GEÇTİ" : `\n❌ ${fail} BAŞARISIZ`);
  process.exit(fail === 0 ? 0 : 1);
})();

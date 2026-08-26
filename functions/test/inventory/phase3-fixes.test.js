// Faz-3 açılış kusur düzeltmeleri:
// 1) "removed" artık tanınan bir statü — özet toplamına sızmaz, geçişleri var.
// 2) Konum taşıması deftere "moved" satırı yazar (delta 0 ama iz kalır) ve
//    lastMovementAtMs'i YENİLEMEZ (raf değiştirmek ölü stoku gizlememeli).
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
const req = (d) => ({ data: d, auth: { uid: "u", token: { email: "e" } } });
const movements = () => [...store.entries()]
  .filter(([k]) => k.includes("inventoryMovements")).map(([, v]) => v);
const item = (id) => store.get(key(["companies", "C", "inventoryItems", id]));

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

(async () => {
  console.log("=== 1) removed tanınan statü ===");
  const a = await api.saveInventoryItem(req({ item: { name: "Kasa", trackingType: "unique", purchasePrice: 500 } }));
  await api.setInventoryItemStatus(req({ itemId: a.itemId, status: "removed" }));
  ok("removed'a geçiş kabul edildi", item(a.itemId).status === "removed", item(a.itemId).status);
  await api.setInventoryItemStatus(req({ itemId: a.itemId, status: "available" }));
  ok("removed'dan geri dönüş var", item(a.itemId).status === "available", item(a.itemId).status);

  console.log("\n=== 2) konum taşıması iz bırakır ===");
  const b = await api.saveInventoryItem(req({ item: { name: "Zemberek", trackingType: "quantity", onHand: 40, purchasePrice: 2, location: "Shelf A" } }));
  const beforeCount = movements().length;
  const beforeStamp = item(b.itemId).lastMovementAtMs;
  await api.saveInventoryItem(req({ itemId: b.itemId, item: { name: "Zemberek", trackingType: "quantity", onHand: 40, purchasePrice: 2, location: "Safe B" } }));
  const moved = movements().find((m) => m.kind === "moved");
  ok("moved satırı yazıldı", movements().length === beforeCount + 1 && !!moved, String(movements().length - beforeCount));
  ok("notta eski → yeni var", !!moved && moved.note === "Shelf A → Safe B", moved ? moved.note : "-");
  ok("delta sıfır", !!moved && moved.delta === 0, moved ? String(moved.delta) : "-");
  ok("lastMovementAtMs YENİLENMEDİ", item(b.itemId).lastMovementAtMs === beforeStamp, `${beforeStamp} → ${item(b.itemId).lastMovementAtMs}`);

  const before2 = movements().length;
  await api.saveInventoryItem(req({ itemId: b.itemId, item: { name: "Zemberek 2", trackingType: "quantity", onHand: 40, purchasePrice: 2, location: "Safe B" } }));
  ok("konum değişmeyince moved satırı yok", movements().length === before2, String(movements().length - before2));

  console.log("\n=== 3) kısmi rezervasyon kendi statüsünü söyler ===");
  const c = await api.saveInventoryItem(req({ item: { name: "Tel", trackingType: "quantity", onHand: 10, purchasePrice: 1 } }));
  await api.reserveInventoryForOrder(req({ itemId: c.itemId, orderId: "ORD-A", quantity: 3 }));
  ok("3/10 → partiallyReserved", item(c.itemId).status === "partiallyReserved", item(c.itemId).status);
  await api.reserveInventoryForOrder(req({ itemId: c.itemId, orderId: "ORD-B", quantity: 7 }));
  ok("10/10 → reserved", item(c.itemId).status === "reserved", item(c.itemId).status);
  await api.releaseInventoryFromOrder(req({ itemId: c.itemId, orderId: "ORD-B" }));
  ok("geri 3/10 → partiallyReserved", item(c.itemId).status === "partiallyReserved", item(c.itemId).status);
  await api.releaseInventoryFromOrder(req({ itemId: c.itemId, orderId: "ORD-A" }));
  ok("0/10 → available", item(c.itemId).status === "available", item(c.itemId).status);

  console.log("\n=== 4) kayıp türleri: sebep defterde ===");
  const d = await api.saveInventoryItem(req({ item: { name: "Lake", trackingType: "quantity", onHand: 82, purchasePrice: 0.5, unit: "ml" } }));
  await api.recordInventoryLoss(req({ itemId: d.itemId, kind: "wastage", quantity: 3, note: "fire" }));
  ok("fire onHand'ı 79'a düşürdü", item(d.itemId).quantity.onHand === 79, String(item(d.itemId).quantity.onHand));
  const w = movements().find((m) => m.kind === "wastage");
  ok("wastage satırı sebebiyle yazıldı", !!w && w.delta === -3 && w.note === "fire", w ? JSON.stringify({d:w.delta,n:w.note}) : "-");
  await api.reserveInventoryForOrder(req({ itemId: d.itemId, orderId: "ORD-C", quantity: 78 }));
  // Sahte HttpsError sınıfı mesajı değil kodu taşır; 5 < 79 olduğundan burada
  // tetiklenebilecek tek muhafız rezervasyon muhafızıdır.
  let threw = "";
  try { await api.recordInventoryLoss(req({ itemId: d.itemId, kind: "lost", quantity: 5 })); } catch (e) { threw = e.message; }
  ok("rezerve stok kayba yazılamaz", threw === "failed-precondition", threw || "hata fırlamadı");
  ok("onHand kayıpla DEĞİŞMEDİ", item(d.itemId).quantity.onHand === 79, String(item(d.itemId).quantity.onHand));
  const e2 = await api.saveInventoryItem(req({ item: { name: "Mineli Kadran", trackingType: "unique", purchasePrice: 700 } }));
  await api.recordInventoryLoss(req({ itemId: e2.itemId, kind: "damaged", note: "düştü" }));
  ok("unique hasar → removed", item(e2.itemId).status === "removed", item(e2.itemId).status);
  const dmg = movements().find((m) => m.kind === "damaged");
  ok("damaged satırı -1 × 700", !!dmg && dmg.delta === -1 && dmg.valueDelta === -700, dmg ? JSON.stringify({d:dmg.delta,v:dmg.valueDelta}) : "-");

  console.log(fail === 0 ? "\n✅ FAZ-3 AÇILIŞ DÜZELTMELERİ GEÇTİ" : `\n❌ ${fail} BAŞARISIZ`);
  process.exit(fail === 0 ? 0 : 1);
})();

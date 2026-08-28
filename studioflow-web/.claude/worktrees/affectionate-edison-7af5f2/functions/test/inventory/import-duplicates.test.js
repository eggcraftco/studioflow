// Faz-3 I4: iki kez dışa aktarılmış bir sayfa aynı stoku iki kez yaratmamalı.
// parse SKU/seri ile rafı tarar ve satırı işaretler; import politikası kişinin
// kararıdır: yine de oluştur / atla / mevcut olanı güncelle. Güncelleme sayfayı
// gerçek yapar ama başına GELENLERE (numara, statü, rezervasyon) dokunmaz ve
// rafı siparişlerin tuttuğunun altına çekemez.
const { createInventoryFunctions } = require("../../inventory.js");

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const store = new Map();
const key = (p) => p.join("/");
const mk = (p) => ({ path: p, id: p[p.length - 1], get: async () => snap(p), set: async (d, o) => write(p, d, o) });
const snap = (p) => { const d = store.get(key(p)); return { exists: d !== undefined, data: () => d, id: p[p.length - 1], ref: mk(p) }; };
const write = (p, d, o) => { const prev = o && o.merge ? store.get(key(p)) || {} : {}; store.set(key(p), { ...prev, ...d }); };
let seq = 0;
const collDocs = (prefix) => [...store.entries()]
  .filter(([k]) => k.startsWith(prefix.join("/") + "/") && k.split("/").length === prefix.length + 1)
  .map(([k, v]) => ({ id: k.split("/").pop(), data: () => v, exists: true }));
const coll = (p) => ({
  doc: (id) => mk([...p, id || `auto${seq++}`]),
  select: () => coll(p),
  limit: () => coll(p),
  get: async () => ({ docs: collDocs(p) })
});
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
const items = () => [...store.entries()]
  .filter(([k]) => k.startsWith("companies/C/inventoryItems/")).map(([k, v]) => ({ id: k.split("/").pop(), ...v }));
const movements = () => [...store.entries()]
  .filter(([k]) => k.includes("inventoryMovements")).map(([, v]) => v);

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

(async () => {
  console.log("=== 0) yeni alanlar ve barkod takma adı okunuyor ===");
  const p0 = await api.parseOpeningStock(req({
    text: "Name,Barcode,Condition,Year,Ownership,Description,Qty,Price\nBezel insert,5901234123457,Good,1968,customer,Faded pepsi insert,3,40",
    hasHeader: true, defaultType: "quantity"
  }));
  const r0 = p0.items[0];
  ok("barcode → sku", r0.sku === "5901234123457", r0.sku);
  ok("condition/year/description geldi", r0.condition === "Good" && r0.year === "1968" && /pepsi/.test(r0.description), JSON.stringify([r0.condition, r0.year, r0.description]));
  ok("ownership customer", r0.ownership === "customer", r0.ownership);

  console.log("\n=== 1) raf taraması satırı işaretler ===");
  await api.saveInventoryItem(req({ item: { name: "Eski kayış", trackingType: "quantity", onHand: 5, purchasePrice: 3, sku: "STR-18" } }));
  const shelfItem = items().find((i) => i.sku === "STR-18");
  const p1 = await api.parseOpeningStock(req({
    text: "Name,SKU,Qty,Price\nDeri kayış,str-18,9,4\nYeni toka,BCK-1,2,1",
    hasHeader: true, defaultType: "quantity"
  }));
  ok("SKU eşleşmesi (büyük/küçük harf duyarsız)", p1.items[0].existingItemId === shelfItem.id && p1.items[0].matchedBy === "sku", JSON.stringify({ e: p1.items[0].existingItemId, m: p1.items[0].matchedBy }));
  ok("eşleşmeyen satır işaretsiz", !p1.items[1].existingItemId, JSON.stringify(p1.items[1].existingItemId));
  ok("duplicates sayacı 1", p1.duplicates === 1, String(p1.duplicates));

  console.log("\n=== 2) skip politikası ===");
  const before = items().length;
  const s1 = await api.importOpeningStock(req({ items: p1.items, duplicatePolicy: "skip", openingDate: "2026-08-26" }));
  ok("1 atlandı, 1 yazıldı", s1.skippedDuplicates === 1 && s1.imported === 1, JSON.stringify(s1));
  ok("rafta yalnız 1 yeni ürün", items().length === before + 1, String(items().length - before));

  console.log("\n=== 3) update politikası ===");
  const u1 = await api.importOpeningStock(req({ items: [p1.items[0]], duplicatePolicy: "update", openingDate: "2026-08-26" }));
  const updatedItem = items().find((i) => i.id === shelfItem.id);
  ok("güncellendi sayacı 1", u1.updated === 1 && u1.imported === 0, JSON.stringify(u1));
  ok("onHand 5→9, ad sayfadan", updatedItem.quantity.onHand === 9 && updatedItem.name === "Deri kayış", JSON.stringify({ q: updatedItem.quantity.onHand, n: updatedItem.name }));
  ok("numara ve kaynak KORUNDU", updatedItem.number === shelfItem.number, `${shelfItem.number} → ${updatedItem.number}`);
  const adj = movements().find((m) => m.kind === "adjustment" && m.note === "Import update");
  ok("fark defterde adjustment (+4)", !!adj && adj.delta === 4, adj ? String(adj.delta) : "-");

  console.log("\n=== 4) güncelleme rezervin altına çekemez ===");
  await api.reserveInventoryForOrder(req({ itemId: shelfItem.id, orderId: "ORD-X", quantity: 8 }));
  const lowRow = { ...p1.items[0], onHand: 2 };
  const u2 = await api.importOpeningStock(req({ items: [lowRow], duplicatePolicy: "update", openingDate: "2026-08-26" }));
  ok("çatışma sayıldı, yazılmadı", u2.conflicts === 1 && u2.updated === 0, JSON.stringify(u2));
  ok("onHand hâlâ 9", items().find((i) => i.id === shelfItem.id).quantity.onHand === 9, String(items().find((i) => i.id === shelfItem.id).quantity.onHand));

  console.log("\n=== 5) create politikası eski davranış ===");
  const c1 = await api.importOpeningStock(req({ items: [p1.items[0]], duplicatePolicy: "create", openingDate: "2026-08-26" }));
  ok("işaretli satır bile yeni ürün oldu", c1.imported === 1 && c1.updated === 0 && c1.skippedDuplicates === 0, JSON.stringify(c1));

  console.log(fail === 0 ? "\n✅ ÇİFT KAYIT POLİTİKALARI GEÇTİ" : `\n❌ ${fail} BAŞARISIZ`);
  process.exit(fail === 0 ? 0 : 1);
})();

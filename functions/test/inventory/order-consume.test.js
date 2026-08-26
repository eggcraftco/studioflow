// Faz-3 I2: rezervden tüketime ve takasa.
// Tüketmek rezervasyonun devamı: bu siparişin tuttuğundan fazlası yakılamaz,
// defterde "used" satırı siparişi ref olarak taşır. Takas tek transaction:
// eskisi bırakılır, yenisi tutulur — ikisi birden ya da hiçbiri.
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
  console.log("=== 1) miktarlı tüketim ===");
  const a = await api.saveInventoryItem(req({ item: { name: "Vida", trackingType: "quantity", onHand: 15, purchasePrice: 2 } }));
  await api.reserveInventoryForOrder(req({ itemId: a.itemId, orderId: "ORD-1", quantity: 5 }));
  const c1 = await api.consumeInventoryForOrder(req({ itemId: a.itemId, orderId: "ORD-1", quantity: 2 }));
  ok("kısmi tüketim onHand 15→13", item(a.itemId).quantity.onHand === 13, String(item(a.itemId).quantity.onHand));
  ok("rezervasyon 5→3 kaldı", c1.stillReserved === 3 && item(a.itemId).quantity.reserved === 3, JSON.stringify({ s: c1.stillReserved, r: item(a.itemId).quantity.reserved }));
  ok("statü hâlâ partiallyReserved", item(a.itemId).status === "partiallyReserved", item(a.itemId).status);
  const u1 = movements().find((m) => m.kind === "used" && m.ref === "ORD-1");
  ok("used satırı siparişi ref alır", !!u1 && u1.delta === -2 && u1.valueDelta === -4, u1 ? JSON.stringify({ d: u1.delta, v: u1.valueDelta }) : "-");

  await api.consumeInventoryForOrder(req({ itemId: a.itemId, orderId: "ORD-1" }));
  ok("kalanı tüketince rezervasyon biter", item(a.itemId).quantity.reserved === 0 && item(a.itemId).status === "available", `${item(a.itemId).quantity.reserved}/${item(a.itemId).status}`);
  ok("onHand 13→10", item(a.itemId).quantity.onHand === 10, String(item(a.itemId).quantity.onHand));

  let threw = "";
  try { await api.consumeInventoryForOrder(req({ itemId: a.itemId, orderId: "ORD-1" })); } catch (e) { threw = e.message; }
  ok("rezervasyonsuz tüketim reddedilir", threw === "failed-precondition", threw || "hata fırlamadı");

  console.log("\n=== 2) benzersiz parça tüketimi ===");
  const b = await api.saveInventoryItem(req({ item: { name: "Kadran", trackingType: "unique", purchasePrice: 300 } }));
  await api.reserveInventoryForOrder(req({ itemId: b.itemId, orderId: "ORD-2" }));
  await api.consumeInventoryForOrder(req({ itemId: b.itemId, orderId: "ORD-2" }));
  ok("unique → used", item(b.itemId).status === "used", item(b.itemId).status);
  ok("rezervasyon listesi boş", (item(b.itemId).reservations || []).length === 0, JSON.stringify(item(b.itemId).reservations));
  const u2 = movements().find((m) => m.kind === "used" && m.ref === "ORD-2");
  ok("defterde -1 × 300", !!u2 && u2.delta === -1 && u2.valueDelta === -300, u2 ? JSON.stringify({ d: u2.delta, v: u2.valueDelta }) : "-");

  console.log("\n=== 3) takas: tek harekette bırak + tut ===");
  const c = await api.saveInventoryItem(req({ item: { name: "Kayış A", trackingType: "quantity", onHand: 8, purchasePrice: 10 } }));
  const d = await api.saveInventoryItem(req({ item: { name: "Kayış B", trackingType: "quantity", onHand: 6, purchasePrice: 12 } }));
  await api.reserveInventoryForOrder(req({ itemId: c.itemId, orderId: "ORD-3", quantity: 4 }));
  await api.swapInventoryForOrder(req({ orderId: "ORD-3", fromItemId: c.itemId, toItemId: d.itemId }));
  ok("A bırakıldı", item(c.itemId).quantity.reserved === 0 && item(c.itemId).status === "available", `${item(c.itemId).quantity.reserved}/${item(c.itemId).status}`);
  ok("B aynı miktarla tutuldu", item(d.itemId).quantity.reserved === 4 && item(d.itemId).status === "partiallyReserved", `${item(d.itemId).quantity.reserved}/${item(d.itemId).status}`);
  ok("B'nin rezervasyonu ORD-3 adına", (item(d.itemId).reservations || []).some((r) => r.orderId === "ORD-3" && r.quantity === 4), JSON.stringify(item(d.itemId).reservations));

  console.log("\n=== 4) takas hedefi taşıyamıyorsa İKİSİ de dokunulmaz ===");
  const e2 = await api.saveInventoryItem(req({ item: { name: "Cam", trackingType: "quantity", onHand: 10, purchasePrice: 5 } }));
  const f = await api.saveInventoryItem(req({ item: { name: "Cam mini", trackingType: "quantity", onHand: 2, purchasePrice: 5 } }));
  await api.reserveInventoryForOrder(req({ itemId: e2.itemId, orderId: "ORD-4", quantity: 6 }));
  threw = "";
  try { await api.swapInventoryForOrder(req({ orderId: "ORD-4", fromItemId: e2.itemId, toItemId: f.itemId })); } catch (err) { threw = err.message; }
  ok("kapasitesiz takas reddedilir", threw === "failed-precondition", threw || "hata fırlamadı");
  ok("kaynak rezervasyonu YERİNDE", item(e2.itemId).quantity.reserved === 6, String(item(e2.itemId).quantity.reserved));
  ok("hedefe hiçbir şey yazılmadı", !(item(f.itemId).reservations || []).length, JSON.stringify(item(f.itemId).reservations));

  console.log("\n=== 5) benzersiz hedefe takas ===");
  const g = await api.saveInventoryItem(req({ item: { name: "Vintage Kadran", trackingType: "unique", purchasePrice: 900 } }));
  await api.swapInventoryForOrder(req({ orderId: "ORD-4", fromItemId: e2.itemId, toItemId: g.itemId }));
  ok("kaynak bırakıldı", item(e2.itemId).quantity.reserved === 0, String(item(e2.itemId).quantity.reserved));
  ok("unique hedef reserved", item(g.itemId).status === "reserved" && item(g.itemId).reservedForOrderId === "ORD-4", `${item(g.itemId).status}/${item(g.itemId).reservedForOrderId}`);

  console.log(fail === 0 ? "\n✅ TÜKETİM + TAKAS GEÇTİ" : `\n❌ ${fail} BAŞARISIZ`);
  process.exit(fail === 0 ? 0 : 1);
})();

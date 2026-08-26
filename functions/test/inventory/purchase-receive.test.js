// Faz-3 I3: mal kuryede bölünür, satın alma da bölünebilmeli.
// 10 kasanın 6'sı gelirse: satır receivedQuantity=6, ürün onHand=6/incoming=4
// ve AVAILABLE (dokunulabilen sayılır), satın alma partiallyReceived. Kalan
// gelince received. Fazla kabul reddedilir; kısmen alınmış satın alma ne
// düzenlenir ne silinir.
const { createInventoryFunctions } = require("../../inventory.js");

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const store = new Map();
const key = (p) => p.join("/");
const mk = (p) => ({ path: p, id: p[p.length - 1], get: async () => snap(p), set: async (d, o) => write(p, d, o), delete: async () => store.delete(key(p)) });
const snap = (p) => { const d = store.get(key(p)); return { exists: d !== undefined, data: () => d, id: p[p.length - 1], ref: mk(p) }; };
const write = (p, d, o) => { const prev = o && o.merge ? store.get(key(p)) || {} : {}; store.set(key(p), { ...prev, ...d }); };
let seq = 0;
const coll = (p) => ({ doc: (id) => mk([...p, id || `auto${seq++}`]) });
const firestore = () => ({
  collection: (n) => ({ doc: (id) => ({ collection: (sub) => coll([n, id, sub]), ...mk([n, id]) }) }),
  runTransaction: async (fn) => fn({ get: async (r) => snap(r.path), set: (r, d, o) => write(r.path, d, o) }),
  batch: () => ({ set: (r, d, o) => write(r.path, d, o), delete: (r) => store.delete(key(r.path)), commit: async () => {} })
});
const api = createInventoryFunctions({
  admin: { firestore }, onCall: (_o, h) => h, HttpsError: class extends Error {},
  requireWorkspace: async () => ({ uid: "u", email: "e", companyId: "C" }),
  cleanText: (v, f = "", m = 200) => (v == null ? f : String(v).slice(0, m)), roundMoney: round
});
const req = (d) => ({ data: d, auth: { uid: "u", token: { email: "e" } } });
const movements = () => [...store.entries()]
  .filter(([k]) => k.includes("inventoryMovements")).map(([, v]) => v);
const doc = (coll2, id) => store.get(key(["companies", "C", coll2, id]));

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

(async () => {
  const saved = await api.savePurchase(req({ purchase: {
    supplierName: "BoxCo",
    purchaseDate: "2026-08-26",
    lines: [
      { name: "Kasa kutusu", trackingType: "quantity", quantity: 10, unit: "pcs", unitPrice: 2 },
      { name: "Vintage kadran", trackingType: "unique", quantity: 1, unitPrice: 500 }
    ]
  } }));
  const pid = saved.purchaseId;
  const purchase = () => doc("purchases", pid);
  const itemId = (i) => purchase().itemIds[i];
  const item = (i) => doc("inventoryItems", itemId(i));

  console.log("=== 1) 10'un 6'sı gelir ===");
  const r1 = await api.receivePurchase(req({ purchaseId: pid, lines: [{ index: 0, quantity: 6 }] }));
  ok("statü partiallyReceived", purchase().status === "partiallyReceived" && r1.status === "partiallyReceived", purchase().status);
  ok("satır receivedQuantity 6", purchase().lines[0].receivedQuantity === 6, String(purchase().lines[0].receivedQuantity));
  ok("ürün available, onHand 6, incoming 4", item(0).status === "available" && item(0).quantity.onHand === 6 && item(0).quantity.incoming === 4, JSON.stringify({ s: item(0).status, q: item(0).quantity }));
  ok("unique satıra dokunulmadı", item(1).status === "incoming", item(1).status);
  const m1 = movements().filter((m) => m.kind === "purchase");
  ok("defterde +6", m1.length === 1 && m1[0].delta === 6, JSON.stringify(m1.map((m) => m.delta)));

  console.log("\n=== 2) fazla kabul ve kilitler ===");
  let threw = "";
  try { await api.receivePurchase(req({ purchaseId: pid, lines: [{ index: 0, quantity: 7 }] })); } catch (e) { threw = e.message; }
  ok("kalan 4'ken 7 kabul edilmez", threw === "failed-precondition", threw || "hata fırlamadı");
  threw = "";
  try { await api.savePurchase(req({ purchaseId: pid, purchase: { lines: [{ name: "X", trackingType: "quantity", quantity: 1, unitPrice: 1 }] } })); } catch (e) { threw = e.message; }
  ok("kısmen alınmış satın alma düzenlenemez", threw === "failed-precondition", threw || "hata fırlamadı");
  threw = "";
  try { await api.deletePurchase(req({ purchaseId: pid })); } catch (e) { threw = e.message; }
  ok("kısmen alınmış satın alma silinemez", threw === "failed-precondition", threw || "hata fırlamadı");

  console.log("\n=== 3) kalan her şey tek tıkla gelir ===");
  const r2 = await api.receivePurchase(req({ purchaseId: pid }));
  ok("statü received", purchase().status === "received" && r2.status === "received", purchase().status);
  ok("receivedAtMs damgalı", Number(purchase().receivedAtMs) > 0, String(purchase().receivedAtMs));
  ok("ürün onHand 10, incoming 0", item(0).quantity.onHand === 10 && item(0).quantity.incoming === 0, JSON.stringify(item(0).quantity));
  ok("unique available", item(1).status === "available", item(1).status);
  const m2 = movements().filter((m) => m.kind === "purchase").map((m) => m.delta).sort((a, b) => a - b);
  ok("defter +6, +4, +1", JSON.stringify(m2) === JSON.stringify([1, 4, 6]), JSON.stringify(m2));

  console.log("\n=== 4) alınmışı tekrar almak sessiz no-op ===");
  const r3 = await api.receivePurchase(req({ purchaseId: pid }));
  ok("alreadyReceived", r3.alreadyReceived === true, JSON.stringify(r3));
  ok("defterde yeni satır yok", movements().filter((m) => m.kind === "purchase").length === 3, String(movements().length));

  console.log(fail === 0 ? "\n✅ KISMİ MAL KABULÜ GEÇTİ" : `\n❌ ${fail} BAŞARISIZ`);
  process.exit(fail === 0 ? 0 : 1);
})();

// Rezervasyon callable'larını sahte bir Firestore üzerinde gerçekten çalıştırır.
const { createInventoryFunctions } = require("../../inventory.js");
const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

const store = new Map(); // path -> data
const key = (path) => path.join("/");

function makeRef(path) {
  return {
    path,
    id: path[path.length - 1],
    get: async () => snap(path),
    set: async (data, opts) => write(path, data, opts)
  };
}
const snap = (path) => {
  const data = store.get(key(path));
  return { exists: data !== undefined, data: () => data, id: path[path.length - 1] };
};
const write = (path, data, opts) => {
  const prev = opts && opts.merge ? store.get(key(path)) || {} : {};
  store.set(key(path), { ...prev, ...data });
};

function collection(path) {
  return {
    doc: (id) => makeRef([...path, id || `auto${store.size}_${Math.floor(performance.now() * 1000)}`]),
    where(field, op, value) { return this._q({ field, op, value }); },
    _q(cond) {
      return {
        limit: () => ({
          get: async () => {
            const docs = [];
            for (const [k, v] of store.entries()) {
              const parts = k.split("/");
              if (parts.length !== path.length + 1) continue;
              if (parts.slice(0, path.length).join("/") !== path.join("/")) continue;
              const arr = v[cond.field];
              if (Array.isArray(arr) && arr.includes(cond.value)) {
                docs.push({ id: parts[parts.length - 1], data: () => v });
              }
            }
            return { docs, size: docs.length };
          }
        })
      };
    }
  };
}

const firestore = () => ({
  collection: (name) => ({
    doc: (id) => ({
      collection: (sub) => collection([name, id, sub]),
      ...makeRef([name, id])
    })
  }),
  runTransaction: async (fn) => fn({
    get: async (ref) => snap(ref.path),
    set: (ref, data, opts) => write(ref.path, data, opts)
  }),
  batch: () => {
    const ops = [];
    return {
      set: (ref, data, opts) => ops.push(() => write(ref.path, data, opts)),
      delete: (ref) => ops.push(() => store.delete(key(ref.path))),
      commit: async () => ops.forEach((op) => op())
    };
  }
});

class Err extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const api = createInventoryFunctions({
  admin: { firestore },
  onCall: (_o, h) => h,
  HttpsError: Err,
  requireWorkspace: async () => ({ uid: "u1", email: "e@x", companyId: "C" }),
  cleanText: (v, f = "", max = 200) => (v === undefined || v === null ? f : String(v).slice(0, max)),
  roundMoney: round
});

const req = (data) => ({ data, auth: { uid: "u1", token: { email: "e@x" } } });
let fail = 0;
const ok = (label, cond, extra = "") => { if (!cond) fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : "  <- " + extra}`); };
async function throws(label, fn, expect) {
  try { await fn(); ok(label, false, "hata beklendi ama geçti"); }
  catch (e) { ok(label, expect ? e.message.includes(expect) : true, e.message); }
}

(async () => {
  // Benzersiz parça: bir Rolex kadranı
  store.set("companies/C/inventoryItems/uniq1", {
    trackingType: "unique", ownership: "business", status: "available",
    valuationCost: 2450, name: "Rolex 1601 dial", number: "INV-00001",
    quantity: { onHand: 1, reserved: 0, unit: "" }, reservations: []
  });
  // Sayılan malzeme: 120 ml lake
  store.set("companies/C/inventoryItems/qty1", {
    trackingType: "quantity", ownership: "business", status: "available",
    valuationCost: 0.5, name: "Clear lacquer", number: "INV-00002",
    quantity: { onHand: 120, reserved: 0, unit: "ml" }, reservations: []
  });
  // Müşterinin kendi malı
  store.set("companies/C/inventoryItems/cust1", {
    trackingType: "unique", ownership: "customer", status: "available",
    valuationCost: 0, name: "Customer's ring", quantity: { onHand: 1, reserved: 0 }, reservations: []
  });

  // 1. Benzersiz parça bir siparişe rezerve edilir
  await api.reserveInventoryForOrder(req({ itemId: "uniq1", orderId: "ORD-A" }));
  const u = store.get("companies/C/inventoryItems/uniq1");
  ok("benzersiz parça rezerve edildi", u.status === "reserved" && u.reservedForOrderId === "ORD-A");

  // 2. EN KRİTİK: aynı parça ikinci siparişe söz verilemez
  await throws("aynı benzersiz parça iki siparişe verilemez",
    () => api.reserveInventoryForOrder(req({ itemId: "uniq1", orderId: "ORD-B" })), "already reserved");

  // 3. Aynı siparişe tekrar rezerve etmek hata değil (idempotent)
  await api.reserveInventoryForOrder(req({ itemId: "uniq1", orderId: "ORD-A" }));
  ok("aynı siparişe tekrar rezerve sorunsuz", store.get("companies/C/inventoryItems/uniq1").reservations.length === 1);

  // 4. Müşteri malı stok değildir
  await throws("müşteri malı rezerve edilemez",
    () => api.reserveInventoryForOrder(req({ itemId: "cust1", orderId: "ORD-A" })), "not stock");

  // 5. Kısmi miktar rezervasyonu
  await api.reserveInventoryForOrder(req({ itemId: "qty1", orderId: "ORD-A", quantity: 30 }));
  await api.reserveInventoryForOrder(req({ itemId: "qty1", orderId: "ORD-B", quantity: 50 }));
  const q = store.get("companies/C/inventoryItems/qty1");
  ok("iki sipariş 30+50 ml tuttu", q.quantity.reserved === 80, JSON.stringify(q.quantity));

  // 6. Rafta olandan fazlası söz verilemez (120 - 80 = 40 kaldı)
  await throws("aşırı rezervasyon engellenir",
    () => api.reserveInventoryForOrder(req({ itemId: "qty1", orderId: "ORD-C", quantity: 41 })), "Only 40");

  // 7. Tam kalanı almak serbest
  const r7 = await api.reserveInventoryForOrder(req({ itemId: "qty1", orderId: "ORD-C", quantity: 40 }));
  ok("kalan 40 ml alınabilir", r7.remaining === 0, JSON.stringify(r7));

  // 8. Siparişin tuttuğu stok ve maliyeti
  const view = await api.getOrderInventory(req({ orderId: "ORD-A" }));
  const names = view.items.map((i) => i.name).sort();
  ok("sipariş A iki kalem tutuyor", names.length === 2, JSON.stringify(names));
  // Rolex 2450 + 30 ml x 0.50 = 15  => 2465
  ok("sipariş A maliyeti 2465", view.totalCost === 2465, String(view.totalCost));

  // 9. Bırakınca rafa döner ve diğer siparişler etkilenmez
  await api.releaseInventoryFromOrder(req({ itemId: "qty1", orderId: "ORD-A" }));
  const q2 = store.get("companies/C/inventoryItems/qty1");
  ok("bırakınca 30 ml serbest kaldı", q2.quantity.reserved === 90, JSON.stringify(q2.quantity));
  ok("diğer siparişlerin payı korundu", q2.reservations.length === 2);

  await api.releaseInventoryFromOrder(req({ itemId: "uniq1", orderId: "ORD-A" }));
  const u2 = store.get("companies/C/inventoryItems/uniq1");
  ok("benzersiz parça rafa döndü", u2.status === "available" && u2.reservedForOrderId === "");

  // 10. Satılmış bir parça bırakılınca diriltilmez
  store.set("companies/C/inventoryItems/sold1", {
    trackingType: "unique", ownership: "business", status: "sold",
    valuationCost: 100, quantity: { onHand: 1 }, reservations: [{ orderId: "ORD-A", quantity: 1 }]
  });
  await api.releaseInventoryFromOrder(req({ itemId: "sold1", orderId: "ORD-A" }));
  ok("satılmış parça 'available'a dönmez", store.get("companies/C/inventoryItems/sold1").status === "sold");

  // 11. Satılmış parça rezerve edilemez
  await throws("satılmış parça rezerve edilemez",
    () => api.reserveInventoryForOrder(req({ itemId: "sold1", orderId: "ORD-Z" })), "no longer available");

  console.log(fail === 0 ? "\nTÜM TESTLER GEÇTİ" : `\n${fail} TEST BAŞARISIZ`);
  process.exit(fail === 0 ? 0 : 1);
})();

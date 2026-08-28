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
    limit() { return this; },
    orderBy() { return this; },
    async get() {
      const docs = [];
      for (const [k, v] of store.entries()) {
        const parts = k.split("/");
        if (parts.length !== path.length + 1) continue;
        if (parts.slice(0, path.length).join("/") !== path.join("/")) continue;
        docs.push({ id: parts[parts.length - 1], data: () => v });
      }
      return { docs, size: docs.length };
    },
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
  const mk = async (total) => (await api.savePurchase(req({ purchase: {
    supplierName: "eBay", purchaseDate: "2026-08-25", shipping: 0,
    lines: [{ name: "Part", category: "Parts", trackingType: "unique", quantity: 1, unitPrice: total }]
  }})));
  const p1 = await mk(2450);
  const p2 = await mk(100);

  store.set("companies/C/bankTransactions/tx1", { amount: -2450, bookingDate: "2026-08-20", counterparty: "eBay" });
  store.set("companies/C/bankTransactions/tx2", { amount: -1000, bookingDate: "2026-08-21", counterparty: "eBay" });

  // Tam eşleşme
  const m1 = await api.linkPurchaseToBankTransaction(req({ purchaseId: p1.purchaseId, transactionId: "tx1" }));
  ok("ödeme eşleşti", m1.linked === true && m1.difference === 0, JSON.stringify(m1));
  ok("banka satırına purchase yazıldı", store.get("companies/C/bankTransactions/tx1").purchaseNumber === p1.number);
  ok("purchase'a banka satırı yazıldı", store.get("companies/C/purchases/" + p1.purchaseId).bankTransactionId === "tx1");

  // EN KRİTİK: bir ödeme iki purchase'a birden sayılamaz
  await throws("aynı ödeme ikinci purchase'a bağlanamaz",
    () => api.linkPurchaseToBankTransaction(req({ purchaseId: p2.purchaseId, transactionId: "tx1" })),
    "already matched");

  // Tutar farkı reddedilmez, bildirilir (kapora / kısmi ödeme gerçek bir şey)
  const m2 = await api.linkPurchaseToBankTransaction(req({ purchaseId: p2.purchaseId, transactionId: "tx2" }));
  ok("farklı tutar engellenmez", m2.linked === true);
  ok("fark doğru bildirildi (1000 - 100 = 900)", m2.difference === 900, String(m2.difference));

  // Bağlantıyı kaldırınca İKİ taraf da temizlenir
  await api.linkPurchaseToBankTransaction(req({ purchaseId: p1.purchaseId, transactionId: "" }));
  ok("purchase tarafı temizlendi", store.get("companies/C/purchases/" + p1.purchaseId).bankTransactionId === "");
  ok("banka tarafı da temizlendi", store.get("companies/C/bankTransactions/tx1").purchaseId === "");

  // Serbest kalan ödeme artık başkasına bağlanabilir
  const m3 = await api.linkPurchaseToBankTransaction(req({ purchaseId: p2.purchaseId, transactionId: "tx1" }));
  ok("serbest kalan ödeme yeniden bağlanabilir", m3.linked === true);

  // Olmayan banka satırı
  await throws("olmayan banka satırı reddedilir",
    () => api.linkPurchaseToBankTransaction(req({ purchaseId: p1.purchaseId, transactionId: "yok" })), "not found");

  console.log(fail === 0 ? "\nTÜM TESTLER GEÇTİ" : `\n${fail} TEST BAŞARISIZ`);
  process.exit(fail === 0 ? 0 : 1);
})();

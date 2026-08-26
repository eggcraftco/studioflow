// Faz-3 BOM: reçete bir kere yazılır ("1 toka + 20cm deri + 2 vida"),
// siparişe uygulanınca HER satır tek transaction'da rezerve edilir — üçüncü
// satır sığmıyorsa ilk iki satıra da dokunulmaz. Maliyet katmanı gerekmez:
// her satın alma partisi zaten kendi maliyetini taşıyan ayrı dokümandır.
const { createInventoryFunctions } = require("../../inventory.js");

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const store = new Map();
const key = (p) => p.join("/");
const mk = (p) => ({ path: p, id: p[p.length - 1], get: async () => snap(p), set: async (d, o) => write(p, d, o), delete: async () => store.delete(key(p)) });
const snap = (p) => { const d = store.get(key(p)); return { exists: d !== undefined, data: () => d, id: p[p.length - 1], ref: mk(p) }; };
const write = (p, d, o) => { const prev = o && o.merge ? store.get(key(p)) || {} : {}; store.set(key(p), { ...prev, ...d }); };
let seq = 0;
const collDocs = (prefix) => [...store.entries()]
  .filter(([k]) => k.startsWith(prefix.join("/") + "/") && k.split("/").length === prefix.length + 1)
  .map(([k, v]) => ({ id: k.split("/").pop(), data: () => v, exists: true, ref: mk(k.split("/")) }));
const coll = (p) => ({
  doc: (id) => mk([...p, id || `auto${seq++}`]),
  select: () => coll(p),
  limit: () => coll(p),
  get: async () => ({ docs: collDocs(p) })
});
// Yazımlar rollback'siz uygulanır — hepsi-ya-da-hiçbiri garantisi bu yüzden
// KODUN yazmadan önce doğrulamasına dayanır; test tam da bunu ölçer.
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
const item = (id) => store.get(key(["companies", "C", "inventoryItems", id]));

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

(async () => {
  const buckle = await api.saveInventoryItem(req({ item: { name: "Toka", trackingType: "quantity", onHand: 10, purchasePrice: 2 } }));
  const leather = await api.saveInventoryItem(req({ item: { name: "Deri", trackingType: "quantity", onHand: 100, unit: "cm", purchasePrice: 0.5 } }));
  const clasp = await api.saveInventoryItem(req({ item: { name: "Vintage klips", trackingType: "unique", purchasePrice: 80 } }));

  console.log("=== 1) reçete CRUD ===");
  const saved = await api.saveInventoryRecipe(req({ recipe: { name: "Kayış işi", notes: "standart", lines: [
    { itemId: buckle.itemId, quantity: 1 },
    { itemId: leather.itemId, quantity: 20 },
    { itemId: clasp.itemId, quantity: 1 }
  ] } }));
  const listed = await api.listInventoryRecipes(req({}));
  ok("reçete kaydedildi ve listede", listed.recipes.length === 1 && listed.recipes[0].name === "Kayış işi", JSON.stringify(listed.recipes.map((r) => r.name)));
  ok("satırlar temizlenmiş", listed.recipes[0].lines.length === 3, String(listed.recipes[0].lines.length));

  console.log("\n=== 2) uygula: her satır tek harekette ===");
  const applied = await api.applyRecipeToOrder(req({ recipeId: saved.recipeId, orderId: "ORD-R1" }));
  ok("3 satır rezerve edildi", applied.reservedLines === 3, String(applied.reservedLines));
  ok("toka 1 rezerve", item(buckle.itemId).quantity.reserved === 1, String(item(buckle.itemId).quantity.reserved));
  ok("deri 20 rezerve, partiallyReserved", item(leather.itemId).quantity.reserved === 20 && item(leather.itemId).status === "partiallyReserved", `${item(leather.itemId).quantity.reserved}/${item(leather.itemId).status}`);
  ok("unique klips reserved", item(clasp.itemId).status === "reserved" && item(clasp.itemId).reservedForOrderId === "ORD-R1", item(clasp.itemId).status);

  console.log("\n=== 3) çarpan; aynı siparişte üstüne ekler ===");
  await api.applyRecipeToOrder(req({ recipeId: saved.recipeId, orderId: "ORD-R1", multiplier: 2 }));
  ok("deri 20+40=60", item(leather.itemId).quantity.reserved === 60, String(item(leather.itemId).quantity.reserved));
  ok("toka 1+2=3", item(buckle.itemId).quantity.reserved === 3, String(item(buckle.itemId).quantity.reserved));

  console.log("\n=== 4) sığmayan satır HİÇBİR şeyi rezerve etmez ===");
  const before = {
    buckle: item(buckle.itemId).quantity.reserved,
    leather: item(leather.itemId).quantity.reserved
  };
  let threw = "";
  // Klips zaten ORD-R1'de: başka bir sipariş reçeteyi uygulayamaz.
  try { await api.applyRecipeToOrder(req({ recipeId: saved.recipeId, orderId: "ORD-R2" })); } catch (e) { threw = e.message; }
  ok("başka siparişe reddedildi", threw === "failed-precondition", threw || "hata yok");
  ok("toka DEĞİŞMEDİ", item(buckle.itemId).quantity.reserved === before.buckle, String(item(buckle.itemId).quantity.reserved));
  ok("deri DEĞİŞMEDİ", item(leather.itemId).quantity.reserved === before.leather, String(item(leather.itemId).quantity.reserved));

  console.log("\n=== 5) kapasite yetmezse de aynı ===");
  const big = await api.saveInventoryRecipe(req({ recipe: { name: "Dev iş", lines: [
    { itemId: buckle.itemId, quantity: 2 },
    { itemId: leather.itemId, quantity: 500 }
  ] } }));
  threw = "";
  try { await api.applyRecipeToOrder(req({ recipeId: big.recipeId, orderId: "ORD-R1" })); } catch (e) { threw = e.message; }
  ok("kapasite reddi", threw === "failed-precondition", threw || "hata yok");
  ok("toka yine değişmedi (satır 1 yazılmadı)", item(buckle.itemId).quantity.reserved === before.buckle, String(item(buckle.itemId).quantity.reserved));

  console.log("\n=== 6) silme ===");
  await api.deleteInventoryRecipe(req({ recipeId: big.recipeId }));
  const after = await api.listInventoryRecipes(req({}));
  ok("silinen reçete listeden düştü", after.recipes.length === 1, String(after.recipes.length));

  console.log(fail === 0 ? "\n✅ REÇETELER GEÇTİ" : `\n❌ ${fail} BAŞARISIZ`);
  process.exit(fail === 0 ? 0 : 1);
})();

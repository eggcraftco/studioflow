// Faz-3: hiyerarşik konumlar. Ürünün üstündeki konum TEK dizgi kalır
// ("Safe A / Drawer 3") — ağaç ayrı koleksiyonda yaşar ve o dizgilerin
// SAHİBİDİR: yeniden adlandırma alt-ağacı VE içinde duran ürünleri yeniden
// yazar (defter satırı YOK — raf adı değişince mal taşınmaz). Döngü, derinlik,
// kardeş-ad çakışması ve kullanımdayken silme reddedilir.
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
const locs = () => [...store.entries()].filter(([k]) => k.includes("inventoryLocations")).map(([k, v]) => ({ id: k.split("/").pop(), ...v }));
const item = (id) => store.get(key(["companies", "C", "inventoryItems", id]));
const movements = () => [...store.entries()].filter(([k]) => k.includes("inventoryMovements")).map(([, v]) => v);

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

(async () => {
  console.log("=== 1) ağaç kurulur, yol dizgileri türetilir ===");
  const safe = await api.saveInventoryLocation(req({ name: "Safe A" }));
  const drawer = await api.saveInventoryLocation(req({ name: "Drawer 3", parentId: safe.locationId }));
  const tray = await api.saveInventoryLocation(req({ name: "Tray 1", parentId: drawer.locationId }));
  ok("yollar zincirlenir", tray.path === "Safe A / Drawer 3 / Tray 1", tray.path);
  const listed = await api.listInventoryLocations(req({}));
  ok("liste yol sırasına göre", listed.locations.map((l) => l.path).join("|") === "Safe A|Safe A / Drawer 3|Safe A / Drawer 3 / Tray 1", listed.locations.map((l) => l.path).join("|"));

  console.log("\n=== 2) muhafızlar ===");
  let threw = "";
  try { await api.saveInventoryLocation(req({ name: "drawer 3", parentId: safe.locationId })); } catch (e) { threw = e.message; }
  ok("kardeş ad çakışması reddedilir (harf duyarsız)", threw === "already-exists", threw || "hata yok");
  threw = "";
  try { await api.saveInventoryLocation(req({ locationId: safe.locationId, name: "Safe A", parentId: tray.locationId })); } catch (e) { threw = e.message; }
  ok("kendi altına taşınamaz", threw === "failed-precondition", threw || "hata yok");
  const l4 = await api.saveInventoryLocation(req({ name: "Slot", parentId: tray.locationId }));
  threw = "";
  try { await api.saveInventoryLocation(req({ name: "Too deep", parentId: l4.locationId })); } catch (e) { threw = e.message; }
  ok("derinlik 4'te durur", threw === "failed-precondition", threw || "hata yok");

  console.log("\n=== 3) yeniden adlandırma alt-ağacı ve ürünleri yeniden yazar ===");
  const a = await api.saveInventoryItem(req({ item: { name: "Kadran", trackingType: "unique", purchasePrice: 100, location: "Safe A / Drawer 3" } }));
  const b = await api.saveInventoryItem(req({ item: { name: "Vida", trackingType: "quantity", onHand: 5, purchasePrice: 1, location: "Safe A / Drawer 3 / Tray 1" } }));
  const c = await api.saveInventoryItem(req({ item: { name: "Başka raf", trackingType: "quantity", onHand: 2, purchasePrice: 1, location: "Shelf B" } }));
  const before = movements().length;
  const renamed = await api.saveInventoryLocation(req({ locationId: drawer.locationId, name: "Drawer 9", parentId: safe.locationId }));
  ok("alt-ağaç yeniden yazıldı", renamed.renamedDescendants === 2, String(renamed.renamedDescendants));
  ok("2 ürün yeniden etiketlendi", renamed.relabelledItems === 2, String(renamed.relabelledItems));
  ok("tam eşleşen ürün yeni yolda", item(a.itemId).location === "Safe A / Drawer 9", item(a.itemId).location);
  ok("alt yol ürünü yeni yolda", item(b.itemId).location === "Safe A / Drawer 9 / Tray 1", item(b.itemId).location);
  ok("ilgisiz ürün DOKUNULMADI", item(c.itemId).location === "Shelf B", item(c.itemId).location);
  ok("defterde YENİ satır yok (raf adı mal taşımaz)", movements().length === before, `${before} → ${movements().length}`);

  console.log("\n=== 4) silme muhafızları ===");
  threw = "";
  try { await api.deleteInventoryLocation(req({ locationId: safe.locationId })); } catch (e) { threw = e.message; }
  ok("içinde konum varken silinemez", threw === "failed-precondition", threw || "hata yok");
  threw = "";
  try { await api.deleteInventoryLocation(req({ locationId: tray.locationId })); } catch (e) { threw = e.message; }
  ok("içinde stok dururken silinemez", threw === "failed-precondition", threw || "hata yok");
  await api.recordInventoryLoss(req({ itemId: b.itemId, kind: "lost", quantity: 5, note: "test" }));
  await api.saveInventoryItem(req({ itemId: b.itemId, item: { name: "Vida", trackingType: "quantity", onHand: 0, purchasePrice: 1, location: "" } }));
  const l4b = locs().find((l) => l.name === "Slot");
  await api.deleteInventoryLocation(req({ locationId: l4b.id }));
  const gone = await api.deleteInventoryLocation(req({ locationId: tray.locationId }));
  ok("boşalan konum silinir", gone.ok === true && !locs().some((l) => l.id === tray.locationId), JSON.stringify(locs().map((l) => l.path)));

  console.log(fail === 0 ? "\n✅ HİYERARŞİK KONUMLAR GEÇTİ" : `\n❌ ${fail} BAŞARISIZ`);
  process.exit(fail === 0 ? 0 : 1);
})();

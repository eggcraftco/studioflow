// Domain-link raporu D1: tek kayıt defteri, host → workspace tek okumada.
// Slug benzersiz ve rezerve-liste korumalı; yenisini almak eskisini bırakır.
// Custom host Pro/Team ister, başkasınınki alınamaz, doğrulama DNS'in
// GERÇEKTEN söylediğini raporlar (stub'lu). resolve yalnız aktifleri döner.
const { createClientDomainFunctions } = require("../../clientDomains.js");

const store = new Map();
const key = (p) => p.join("/");
const mk = (p) => ({ path: p, id: p[p.length - 1], get: async () => snap(p), set: async (d, o) => write(p, d, o), delete: async () => store.delete(key(p)) });
const snap = (p) => { const d = store.get(key(p)); return { exists: d !== undefined, data: () => d, id: p[p.length - 1], ref: mk(p) }; };
const write = (p, d, o) => { const prev = o && o.merge ? store.get(key(p)) || {} : {}; store.set(key(p), { ...prev, ...d }); };
const collDocs = (name, filterField, filterValue) => [...store.entries()]
  .filter(([k]) => k.startsWith(name + "/") && k.split("/").length === 2)
  .filter(([, v]) => !filterField || String(v[filterField]) === String(filterValue))
  .map(([k, v]) => ({ id: k.split("/")[1], data: () => v, exists: true, ref: mk(k.split("/")) }));
function makeQuery(name, field, value) {
  return { __query: { name, field, value }, limit: () => makeQuery(name, field, value), get: async () => ({ docs: collDocs(name, field, value) }) };
}
const firestore = () => ({
  collection: (name) => ({
    doc: (id) => mk([name, id]),
    where: (field, _op, value) => makeQuery(name, field, value)
  }),
  runTransaction: async (fn) => fn({
    get: async (r) => r.__query ? { docs: collDocs(r.__query.name, r.__query.field, r.__query.value) } : snap(r.path),
    set: (r, d, o) => write(r.path, d, o),
    delete: (r) => store.delete(key(r.path))
  })
});

let plan = "pro_monthly";
let cnameAnswer = [];
let cnameError = null;
const api = createClientDomainFunctions({
  admin: { firestore },
  onCall: (_o, h) => h,
  HttpsError: class extends Error { constructor(code, message) { super(code); this.detail = message; } },
  uidIsCompanyOwner: (companyData, uid) => String(companyData.ownerUid) === uid,
  planForCompany: () => plan,
  dnsResolveCname: async () => { if (cnameError) throw cnameError; return cnameAnswer; },
  companySettingsDocRef: (companyId) => mk(["companySettings", companyId])
});
const req = (companyId, uid, data = {}) => ({ auth: { uid }, data: { companyId, ...data } });

store.set("companies/A", { ownerUid: "owner-a", name: "EGGcraft" });
store.set("companies/B", { ownerUid: "owner-b", name: "Rival" });

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

(async () => {
  console.log("=== 1) slug: sahiplik, rezervler, benzersizlik, devretme ===");
  let threw = "";
  try { await api.setClientSubdomain(req("A", "not-owner", { slug: "eggcraft-studio" })); } catch (e) { threw = e.message; }
  ok("owner olmayan reddedilir", threw === "permission-denied", threw);
  threw = "";
  try { await api.setClientSubdomain(req("A", "owner-a", { slug: "www" })); } catch (e) { threw = e.message; }
  ok("rezerve slug reddedilir", threw === "already-exists", threw);
  threw = "";
  try { await api.setClientSubdomain(req("A", "owner-a", { slug: "x" })); } catch (e) { threw = e.message; }
  ok("2 karakter reddedilir", threw === "invalid-argument", threw);
  const s1 = await api.setClientSubdomain(req("A", "owner-a", { slug: "EGGcraft-Studio" }));
  ok("slug küçük harfe iner, host doğru", s1.host === "eggcraft-studio.nivadesk.app", s1.host);
  threw = "";
  try { await api.setClientSubdomain(req("B", "owner-b", { slug: "eggcraft-studio" })); } catch (e) { threw = e.message; }
  ok("başkasının slug'ı alınamaz", threw === "already-exists", threw);
  await api.setClientSubdomain(req("A", "owner-a", { slug: "eggcraft-atolye" }));
  ok("yeni slug eskisini bırakır", !store.has("clientDomains/eggcraft-studio") && store.has("clientDomains/eggcraft-atolye"), JSON.stringify([...store.keys()].filter(k => k.startsWith("clientDomains"))));
  ok("company dokümanına yazıldı", store.get("companies/A").clientPortalSlug === "eggcraft-atolye", store.get("companies/A").clientPortalSlug);
  const b1 = await api.setClientSubdomain(req("B", "owner-b", { slug: "eggcraft-studio" }));
  ok("bırakılan slug'ı başkası alabilir", b1.host === "eggcraft-studio.nivadesk.app", b1.host);

  console.log("\n=== 2) custom host: plan kapısı ve sahiplik ===");
  plan = "lite_monthly";
  threw = "";
  try { await api.requestClientDomain(req("A", "owner-a", { host: "track.eggcraft.co.uk" })); } catch (e) { threw = e.message; }
  ok("Lite reddedilir", threw === "failed-precondition", threw);
  plan = "pro_monthly";
  threw = "";
  try { await api.requestClientDomain(req("A", "owner-a", { host: "eggcraft.co.uk/track" })); } catch (e) { threw = e.message; }
  ok("path'li/çıplak domain reddedilir", threw === "invalid-argument", threw);
  threw = "";
  try { await api.requestClientDomain(req("A", "owner-a", { host: "abc.nivadesk.app" })); } catch (e) { threw = e.message; }
  ok("nivadesk.app custom olamaz", threw === "invalid-argument", threw);
  const r1 = await api.requestClientDomain(req("A", "owner-a", { host: "https://Track.EGGcraft.co.uk/" }));
  ok("host normalize + CNAME talimatı", r1.host === "track.eggcraft.co.uk" && r1.record.target === "customers.nivadesk.app" && r1.record.name === "track", JSON.stringify(r1));
  threw = "";
  try { await api.requestClientDomain(req("B", "owner-b", { host: "track.eggcraft.co.uk" })); } catch (e) { threw = e.message; }
  ok("başkasının hostu bağlanamaz", threw === "already-exists", threw);

  console.log("\n=== 3) doğrulama DNS'in dediğini söyler ===");
  cnameAnswer = ["something-else.example.com"];
  let v = await api.verifyClientDomain(req("A", "owner-a", { host: "track.eggcraft.co.uk" }));
  ok("yanlış CNAME → pending + bulunanlar", v.verified === false && v.found[0] === "something-else.example.com", JSON.stringify(v));
  cnameError = Object.assign(new Error("queryCname ENOTFOUND"), { code: "ENOTFOUND" });
  v = await api.verifyClientDomain(req("A", "owner-a", { host: "track.eggcraft.co.uk" }));
  ok("kayıt yok → pending + sebep", v.verified === false && /ENOTFOUND/.test(v.error || ""), JSON.stringify(v));
  cnameError = null;
  cnameAnswer = ["Customers.NivaDesk.app."];
  v = await api.verifyClientDomain(req("A", "owner-a", { host: "track.eggcraft.co.uk" }));
  ok("doğru CNAME (harf/nokta toleranslı) → active", v.verified === true && store.get("clientDomains/track.eggcraft.co.uk").status === "active", JSON.stringify(v));

  console.log("\n=== 4) resolve: yalnız gerçek ve aktif ===");
  let m = await api.resolveClientDomain({ data: { host: "eggcraft-atolye.nivadesk.app" } });
  ok("slug host çözümlenir", m.match && m.match.companyId === "A" && m.match.kind === "subdomain", JSON.stringify(m));
  m = await api.resolveClientDomain({ data: { host: "track.eggcraft.co.uk" } });
  ok("aktif custom çözümlenir", m.match && m.match.companyId === "A", JSON.stringify(m));
  store.set("clientDomains/track.eggcraft.co.uk", { ...store.get("clientDomains/track.eggcraft.co.uk"), status: "pending" });
  m = await api.resolveClientDomain({ data: { host: "track.eggcraft.co.uk" } });
  ok("pending custom ÇÖZÜMLENMEZ", m.match === null, JSON.stringify(m));
  m = await api.resolveClientDomain({ data: { host: "unknown.example.com" } });
  ok("bilinmeyen host null", m.match === null, JSON.stringify(m));

  console.log("\n=== 5) kaldırma ===");
  threw = "";
  try { await api.removeClientDomain(req("B", "owner-b", { host: "track.eggcraft.co.uk" })); } catch (e) { threw = e.message; }
  ok("başkasınınkini kaldıramaz", threw === "permission-denied", threw);
  await api.removeClientDomain(req("A", "owner-a", { host: "eggcraft-atolye" }));
  ok("slug kaldırılınca company alanı boşalır", store.get("companies/A").clientPortalSlug === "" && !store.has("clientDomains/eggcraft-atolye"), store.get("companies/A").clientPortalSlug);

  console.log("\n=== 6) branding: renk temizliği, plan kapısı, config okuması ===");
  threw = "";
  try { await api.saveClientPortalBranding(req("A", "not-owner", { accentColor: "#112233" })); } catch (e) { threw = e.message; }
  ok("branding owner ister", threw === "permission-denied", threw);
  threw = "";
  try { await api.saveClientPortalBranding(req("A", "owner-a", { accentColor: "red" })); } catch (e) { threw = e.message; }
  ok("hex olmayan renk reddedilir", threw === "invalid-argument", threw);
  plan = "lite_monthly";
  threw = "";
  try { await api.saveClientPortalBranding(req("A", "owner-a", { accentColor: "#112233", showPoweredBy: false })); } catch (e) { threw = e.message; }
  ok("Lite Powered by'ı gizleyemez", threw === "failed-precondition", threw);
  const bLite = await api.saveClientPortalBranding(req("A", "owner-a", { accentColor: "#AABBCC", showPoweredBy: true }));
  ok("Lite renk kaydedebilir (küçük harfe iner)", bLite.accentColor === "#aabbcc" && bLite.showPoweredBy === true, JSON.stringify(bLite));
  plan = "pro_monthly";
  const bPro = await api.saveClientPortalBranding(req("A", "owner-a", { accentColor: "", showPoweredBy: false }));
  ok("Pro Powered by'ı gizler, boş renk temizler", bPro.accentColor === "" && bPro.showPoweredBy === false, JSON.stringify(bPro));
  ok("settings dokümanına yazıldı", store.get("companySettings/A").portalShowPoweredBy === false && store.get("companySettings/A").portalAccentColor === "", JSON.stringify(store.get("companySettings/A")));
  store.set("companySettings/A", { ...store.get("companySettings/A"), portalAccentColor: "#2F6F6D" });
  const cfg = await api.getClientDomainConfig(req("A", "owner-a"));
  ok("config branding'i normalize okur", cfg.branding.accentColor === "#2f6f6d" && cfg.branding.showPoweredBy === false, JSON.stringify(cfg.branding));

  console.log(fail === 0 ? "\n✅ CLIENT DOMAINS GEÇTİ" : `\n❌ ${fail} BAŞARISIZ`);
  process.exit(fail === 0 ? 0 : 1);
})();

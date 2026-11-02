// WOO-STORES (2 Nov 2026): one Source choice per WooCommerce store. Owner: TickToon's and EGGcraft's orders, two
// WooCommerce stores in one workspace, should be told apart from the button at the top of the order list; they
// all fell under the one "WooCommerce" choice. Spec: side-session notes woo-store-chips-SPEC-2026-11-02.md (the
// Apple apps and Android follow the same rules).
//
// 1. The store of one order (lib/studioflow/orderFilters.ts, compiled with the tree's own TypeScript and run): the
//    engine's commerce.connectionId (`<companyId>__<host>`) first, then the backfill's `wooStore`, else unknown;
//    only a WooCommerce order has one.
// 2. Each store's label: the name its orders carry most often, never an address; the host when there is none;
//    two stores with one name get their hosts.
// 3. The choices (orderSourceChoices — the bar and the Source rows of Order Filters read the same list): split only
//    with two or more stores, the store rows where WooCommerce was, "store unknown" last, the chosen one kept,
//    counts within the quick filter; one store (with or without unrecorded orders) and every other source exactly
//    as before. Matching through filterAndSortOrders.
// 4. The list and schedule loaders (lib/studioflow/firestore.ts) against a fake Firestore: each row carries its
//    store from the snapshot already read, no extra read.
// 5. The bar (components/OrderPlatformBar.tsx) rendered and clicked: the WC monogram + the store's name + count,
//    "WooCommerce · <name>" as tooltip and accessible name, "Store unknown" in twelve languages; Order Filters'
//    summary names the chosen store; the menu row does not translate a store's name.
// 6. The words in twelve languages, the CSS in app/globals.css (never the stale root copy), the pages' one state.
//
//   node scripts/check-woo-store-chips.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const failures = [];
let checks = 0;
const expect = (name, actual, wanted) => {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
};
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
// Files this change adds: a tree without them (the control run on 12458ebfd) fails their checks instead of crashing.
const readMaybe = (rel) => (fs.existsSync(path.join(root, rel)) ? read(rel) : "");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "woo-store-chips-check-"));

// ---- compiling the tree's modules, with fakes for Firebase (the pattern of check-ebay-screens.mjs)
const FAKES = {
  "firebase/firestore": `
    export const recorded = [];
    export const docs = new Map();   // path -> data
    const shape = (q) => ({ path: q.path, filters: (q.constraints || []).filter(c => c.type === "where").map(c => [c.field, c.op, c.value]) });
    export function collection(_db, ...segments) { return { kind: "collection", path: segments.join("/") }; }
    export function doc(_db, ...segments) { return { kind: "doc", path: segments.join("/") }; }
    export function query(base, ...constraints) { return { kind: "query", path: base.path, constraints: [...(base.constraints || []), ...constraints] }; }
    export function where(field, op, value) { return { type: "where", field, op, value }; }
    export function limit(n) { return { type: "limit", n }; }
    export function orderBy(field, dir) { return { type: "orderBy", field, dir }; }
    const snapOf = (p, data) => ({ id: p.split("/").pop(), ref: { path: p }, exists: () => data !== undefined, data: () => data });
    export async function getDocs(q) {
      recorded.push({ op: "getDocs", ...shape(q) });
      const rows = [...docs.entries()].filter(([p]) => p.startsWith(q.path + "/") && p.split("/").length === q.path.split("/").length + 1).map(([p, d]) => snapOf(p, d));
      return { docs: rows, size: rows.length, empty: rows.length === 0, forEach: (f) => rows.forEach(f) };
    }
    export async function getCountFromServer(q) { recorded.push({ op: "count", ...shape(q) }); return { data: () => ({ count: 0 }) }; }
    export async function getDoc(ref) { recorded.push({ op: "getDoc", path: ref.path, filters: [] }); return snapOf(ref.path, docs.get(ref.path)); }
    export function onSnapshot() { return () => {}; }
    export function serverTimestamp() { return { serverTimestamp: true }; }
    export async function setDoc() {} export async function updateDoc() {} export async function deleteDoc() {} export async function addDoc() { return { id: "x" }; }
    export function writeBatch() { return { set() {}, update() {}, delete() {}, async commit() {} }; }
    export async function runTransaction(_db, f) { return f({ get: getDoc, set() {}, update() {} }); }
    export function arrayUnion(...v) { return v; } export function arrayRemove(...v) { return v; } export function deleteField() { return null; } export function increment(n) { return n; }
    export class Timestamp { static fromDate(d) { return d; } static now() { return new Date(); } }
    export function documentId() { return "__name__"; } export function startAfter() { return { type: "startAfter" }; }
  `,
  "firebase/functions": `
    export const called = [];
    export function httpsCallable(_functions, name) { return async (data) => { called.push({ name, data }); return { data: { ok: true } }; }; }
  `,
  "@/lib/firebase/client": `export const auth = { currentUser: null }; export const db = {}; export const functions = {}; export const storage = {};`
};
for (const [name, source] of Object.entries(FAKES)) fs.writeFileSync(path.join(tmp, `${name.replace(/[^a-z]/gi, "_")}.mjs`), source);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const compile = (rel) => {
  const out = path.join(tmp, `${path.basename(rel).replace(/\.tsx?$/, "")}.mjs`);
  if (fs.existsSync(out)) return out;
  const tsx = rel.endsWith(".tsx");
  let js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020,
    ...(tsx ? { jsx: ts.JsxEmit.React, jsxFactory: "__h", jsxFragmentFactory: "__F" } : {}) } }).outputText;
  if (tsx) js = `import __React from ${JSON.stringify(reactUrl)};\nconst __h = __React.createElement; const __F = __React.Fragment;\n${js}`;
  js = js.replace(/from "([^"]+)"/g, (whole, spec) => {
    if (FAKES[spec]) return `from "./${spec.replace(/[^a-z]/gi, "_")}.mjs"`;
    if (spec.startsWith("@/lib/studioflow/")) return `from "./${spec.slice("@/lib/studioflow/".length)}.mjs"`;
    if (spec.startsWith("@/components/")) return `from "./${spec.slice("@/components/".length)}.mjs"`;
    if (spec.startsWith("./")) return `from "${spec}.mjs"`;
    return whole;
  });
  fs.writeFileSync(out, js);
  for (const m of js.matchAll(/from "\.\/([A-Za-z]+)\.mjs"/g)) {
    if (fs.existsSync(path.join(tmp, `${m[1]}.mjs`))) continue;
    const dir = path.dirname(rel);
    const candidates = [`lib/studioflow/${m[1]}.ts`, `${dir}/${m[1]}.ts`, `${dir}/${m[1]}.tsx`, `components/${m[1]}.tsx`];
    const dep = candidates.find((c) => fs.existsSync(path.join(root, c)));
    if (dep) compile(dep);
  }
  return out;
};
const load = async (rel) => import(pathToFileURL(compile(rel)).href);
const O = await load("lib/studioflow/orderFilters.ts");
const has = (name) => typeof O[name] === "function";
const NONE = { wooStoreKey: "", wooStoreName: "" };

// ---- 1. the store of one order
const fields = (data) => (has("wooStoreFieldsFrom") ? O.wooStoreFieldsFrom(data) : null);
expect("key: the host after the last __ of the engine's connection id (lower case, no www.)", has("wooStoreKeyFromConnectionId")
  ? ["ws1__eggcraft.co.uk", "ws1__WWW.TickToon.co.uk", "ticktoon.co.uk", "a__b__shop.example_8443", "", undefined].map((id) => O.wooStoreKeyFromConnectionId(id)) : null,
  ["eggcraft.co.uk", "ticktoon.co.uk", "ticktoon.co.uk", "shop.example_8443", "", ""]);
expect("row fields: a WooCommerce stamp gives its host and its name",
  fields({ commerce: { provider: "woocommerce", connectionId: "ws1__eggcraft.co.uk", connectionDisplayName: " EGGcraft " } }), { wooStoreKey: "eggcraft.co.uk", wooStoreName: "EGGcraft" });
expect("row fields: no stamp — the backfill's wooStore",
  fields({ customFields: { Source: "WooCommerce" }, wooStore: { host: "www.EGGcraft.co.uk", name: "EGGcraft", connectionId: "ws1__eggcraft.co.uk" } }), { wooStoreKey: "eggcraft.co.uk", wooStoreName: "EGGcraft" });
expect("row fields: the stamp wins over wooStore",
  fields({ commerce: { provider: "woocommerce", connectionId: "ws1__ticktoon.co.uk", connectionDisplayName: "TickToon" }, wooStore: { host: "eggcraft.co.uk", name: "EGGcraft" } }), { wooStoreKey: "ticktoon.co.uk", wooStoreName: "TickToon" });
expect("row fields: nothing recorded — unknown (the legacy webhook's orders)",
  [fields({}), fields({ customFields: { Source: "WooCommerce" } }), fields({ wooStore: "eggcraft.co.uk" }), fields({ wooStore: { host: "  " } }), fields({ commerce: { provider: "woocommerce" } })], Array(5).fill(NONE));
expect("row fields: another provider's stamp names no WooCommerce store",
  [fields({ commerce: { provider: "ebay", connectionId: "ws1__seller", connectionDisplayName: "My eBay" } }), fields({ commerce: { provider: "shopify", connectionId: "ws1__shop.myshopify.com" } })], Array(2).fill(NONE));
const fo = (id, over = {}) => ({ id, customerName: id, designName: "d", status: "Not Yet", paymentDate: null, dueDate: null, remainingAmount: 0, customFields: {}, ...over });
const woo = (id, key, name = "", over = {}) => fo(`woo_ws_${id}`, { commerceProvider: "woocommerce", customFields: { Source: "WooCommerce" }, wooStoreKey: key, wooStoreName: name, ...over });
expect("store of an order: only a WooCommerce order has one ('' = unknown)", has("wooStoreKeyOf")
  ? [O.wooStoreKeyOf(woo(1, "eggcraft.co.uk")), O.wooStoreKeyOf(woo(2, "")), O.wooStoreKeyOf(fo("ebay_ws_1", { commerceProvider: "ebay", wooStoreKey: "x" })), O.wooStoreKeyOf(fo("legacy-1", { customFields: { Source: "WooCommerce" } })), O.wooStoreKeyOf(fo("manual-1"))] : null,
  ["eggcraft.co.uk", "", null, "", null]);

// ---- 2. each store's label
const labels = (orders) => (has("wooStoreLabels") ? Object.fromEntries(O.wooStoreLabels(orders)) : null);
expect("label: the name the store's orders carry most often",
  labels([woo(1, "eggcraft.co.uk", "EGGcraft"), woo(2, "eggcraft.co.uk", "EGGcraft"), woo(3, "eggcraft.co.uk", "EGGcraft Old"), woo(4, "ticktoon.co.uk", "TickToon")]), { "eggcraft.co.uk": "EGGcraft", "ticktoon.co.uk": "TickToon" });
expect("label: a tie goes to the name that sorts first (case-blind)", labels([woo(1, "a.example", "Zeta"), woo(2, "a.example", "alpha")]), { "a.example": "alpha" });
expect("label: an address is not a name — the host",
  labels([woo(1, "ticktoon.co.uk", "https://ticktoon.co.uk"), woo(2, "ticktoon.co.uk", "ticktoon.co.uk"), woo(3, "ticktoon.co.uk", "www.TickToon.co.uk"), woo(4, "ticktoon.co.uk", ""), woo(5, "b.example", "b.example/shop")]),
  { "ticktoon.co.uk": "ticktoon.co.uk", "b.example": "b.example" });
expect("label: two stores with one name each get their host", labels([woo(1, "eggcraft.co.uk", "EGGcraft"), woo(2, "shop2.example", "eggcraft")]),
  { "eggcraft.co.uk": "EGGcraft (eggcraft.co.uk)", "shop2.example": "eggcraft (shop2.example)" });
expect("label: an unknown-store order or another platform adds no store", labels([woo(1, ""), fo("ebay_ws_1", { commerceProvider: "ebay", wooStoreKey: "seller", wooStoreName: "S" })]), {});

// ---- 3. the choices, and the filter
const EGG = [woo(1, "eggcraft.co.uk", "EGGcraft"), woo(2, "eggcraft.co.uk", "EGGcraft", { status: "Done" }), woo(3, "eggcraft.co.uk", "EGGcraft")];
const TICK = [woo(10, "ticktoon.co.uk", "TickToon"), woo(11, "ticktoon.co.uk", "https://ticktoon.co.uk", { status: "Done" })];
const LEGACY = [fo("woo_ws_900"), fo("woo_ws_901", { customFields: { Source: "WooCommerce" }, status: "Done" })];
const OTHERS = [fo("ebay_ws_1", { commerceProvider: "ebay" }), fo("manual-1")];
const LIST = [...OTHERS, ...TICK, ...LEGACY, ...EGG];
const rowsOf = (orders, filter, source) => O.orderSourceChoices(orders, filter, source).map((r) => [r.id, r.label, r.count]);
expect("choices: two stores split WooCommerce where it was; store unknown after them",
  rowsOf(LIST, "all", "all"),
  [["all", "All sources", 9], ["ebay", "eBay", 1], ["woocommerce:eggcraft.co.uk", "EGGcraft", 3], ["woocommerce:ticktoon.co.uk", "TickToon", 2], ["woocommerce:", "WooCommerce (store unknown)", 2], ["manual", "Added by hand", 1]]);
expect("choices: a store row carries its key ('' = unknown), every other row none",
  O.orderSourceChoices(LIST, "all", "all").map((r) => (r.wooStoreKey === undefined ? null : r.wooStoreKey)), [null, null, "eggcraft.co.uk", "ticktoon.co.uk", "", null]);
expect("choices: counts within the chosen quick filter",
  rowsOf(LIST, "completed", "all").map(([id, , n]) => [id, n]), [["all", 3], ["ebay", 0], ["woocommerce:eggcraft.co.uk", 1], ["woocommerce:ticktoon.co.uk", 1], ["woocommerce:", 1], ["manual", 0]]);
expect("choices: one store + unrecorded orders stays ONE WooCommerce choice, as before",
  rowsOf([...OTHERS, ...EGG, ...LEGACY], "all", "all"), [["all", "All sources", 7], ["ebay", "eBay", 1], ["woocommerce", "WooCommerce", 5], ["manual", "Added by hand", 1]]);
expect("choices: eBay + one store exactly as before (single-account sources untouched)", rowsOf([...OTHERS, ...EGG], "all", "all").map(([id]) => id), ["all", "ebay", "woocommerce", "manual"]);
expect("choices: one store alone — no choice at all, as before", O.orderSourceChoices(EGG, "all", "all"), []);
expect("choices: two stores and nothing else — the stores are a choice", rowsOf([...EGG, ...TICK], "all", "all").map(([id]) => id), ["all", "woocommerce:eggcraft.co.uk", "woocommerce:ticktoon.co.uk"]);
expect("choices: no order records a store (every list before the stamp) — as before", rowsOf([...OTHERS, ...LEGACY], "all", "all").map(([id]) => id), ["all", "ebay", "woocommerce", "manual"]);
expect("choices: the chosen store is kept when the list no longer splits",
  rowsOf([...OTHERS, ...EGG], "all", "woocommerce:ticktoon.co.uk"), [["all", "All sources", 5], ["ebay", "eBay", 1], ["woocommerce", "WooCommerce", 3], ["woocommerce:ticktoon.co.uk", "ticktoon.co.uk", 0], ["manual", "Added by hand", 1]]);
expect("choices: a chosen store still in the list keeps its name", rowsOf(EGG, "all", "woocommerce:eggcraft.co.uk"), [["all", "All sources", 3], ["woocommerce", "WooCommerce", 3], ["woocommerce:eggcraft.co.uk", "EGGcraft", 3]]);
expect("choices: the chosen 'store unknown' is kept too", rowsOf(EGG, "all", "woocommerce:"), [["all", "All sources", 3], ["woocommerce", "WooCommerce", 3], ["woocommerce:", "WooCommerce (store unknown)", 0]]);
expect("choices: a chosen store the split list lacks sits among the stores by its name",
  rowsOf([...OTHERS, ...EGG, ...TICK, ...LEGACY], "all", "woocommerce:freshshop.example").map(([id]) => id),
  ["all", "ebay", "woocommerce:eggcraft.co.uk", "woocommerce:freshshop.example", "woocommerce:ticktoon.co.uk", "woocommerce:", "manual"]);
expect("choices: plain WooCommerce chosen while split (a link) shows beside the stores",
  rowsOf(LIST, "all", "woocommerce").map(([id, , n]) => [id, n]), [["all", 9], ["ebay", 1], ["woocommerce", 7], ["woocommerce:eggcraft.co.uk", 3], ["woocommerce:ticktoon.co.uk", 2], ["woocommerce:", 2], ["manual", 1]]);
const pick = (source, filter = "all") => O.filterAndSortOrders(LIST, "", filter, "recent", source).map((o) => o.id).sort();
const idsOf = (orders) => orders.map((o) => o.id).sort();
expect("filter: a store shows only its own orders", [pick("woocommerce:eggcraft.co.uk"), pick("woocommerce:ticktoon.co.uk")], [idsOf(EGG), idsOf(TICK)]);
expect("filter: store unknown = the WooCommerce orders that record none", pick("woocommerce:"), idsOf(LEGACY));
expect("filter: WooCommerce still means every WooCommerce order", pick("woocommerce"), idsOf([...EGG, ...TICK, ...LEGACY]));
expect("filter: a store id is case- and www-blind", pick("woocommerce:WWW.TickToon.co.uk"), idsOf(TICK));
expect("filter: eBay, By hand and All unchanged", [pick("ebay"), pick("manual"), pick("all").length], [["ebay_ws_1"], ["manual-1"], 9]);
expect("filter: a store within a quick filter", pick("woocommerce:eggcraft.co.uk", "completed"), ["woo_ws_2"]);
expect("filter: every row's count is what picking it shows", ["all", "active", "completed"].every((filter) =>
  O.orderSourceChoices(LIST, filter, "all").every((row) => row.count === O.filterAndSortOrders(LIST, "", filter, "recent", row.id).length)), true);
expect("summary name: a store's own name, 'store unknown' and platforms through t()",
  has("orderSourceChoiceName") ? [O.orderSourceChoiceName(LIST, "woocommerce:ticktoon.co.uk", (x) => `t(${x})`), O.orderSourceChoiceName(LIST, "woocommerce:", (x) => `t(${x})`), O.orderSourceChoiceName(LIST, "ebay", (x) => `t(${x})`), O.orderSourceChoiceName(LIST, "woocommerce:gone.example")] : null,
  ["TickToon", "t(WooCommerce (store unknown))", "t(eBay)", "gone.example"]);

// ---- 4. the loaders carry the store, from the same read
const FS = await import(pathToFileURL(path.join(tmp, "firebase_firestore.mjs")).href);
const F = await load("lib/studioflow/firestore.ts");
const WS = "ws-woo";
const DOCS = {
  // The live writers: the engine (a legacy-form id before 21 Oct, a store-keyed id since), the retired legacy
  // webhook (no stamp), the backfill (wooStore on such an order), eBay's engine stamp, an order added by hand.
  [`woo_${WS}_5101`]: { customFields: { Source: "WooCommerce" }, commerce: { provider: "woocommerce", connectionId: `${WS}__eggcraft.co.uk`, connectionDisplayName: "EGGcraft" } },
  [`woo_${WS}_s0123456789_1142`]: { customFields: { Source: "WooCommerce" }, commerce: { provider: "woocommerce", connectionId: `${WS}__ticktoon.co.uk`, connectionDisplayName: "TickToon" } },
  [`woo_${WS}_77`]: { customFields: { Source: "WooCommerce" } },
  [`woo_${WS}_78`]: { customFields: { Source: "WooCommerce" }, wooStore: { host: "eggcraft.co.uk", name: "EGGcraft", connectionId: `${WS}__eggcraft.co.uk`, method: "legacy_owner" } },
  [`ebay_${WS}_12-1`]: { customFields: { Source: "eBay" }, commerce: { provider: "ebay", connectionId: `${WS}__seller`, connectionDisplayName: "seller" } },
  "Mn8kQ2vX4pLr7TzA1bC3": { customFields: {} }
};
const WANT_ROWS = {
  [`woo_${WS}_5101`]: ["eggcraft.co.uk", "EGGcraft"], [`woo_${WS}_s0123456789_1142`]: ["ticktoon.co.uk", "TickToon"], [`woo_${WS}_77`]: ["", ""],
  [`woo_${WS}_78`]: ["eggcraft.co.uk", "EGGcraft"], [`ebay_${WS}_12-1`]: ["", ""], "Mn8kQ2vX4pLr7TzA1bC3": ["", ""]
};
for (const [id, extra] of Object.entries(DOCS)) {
  FS.docs.set(`siparisler/${id}`, { companyId: WS, customerName: id, designName: "x", status: "Not Yet", paymentDate: new Date(), deliveryTime: 10, paidAmount: 1, remainingAmount: 0, ...extra });
}
const ctx = { id: WS, name: "Check", ownerUid: "owner-uid", role: "owner", roleLabel: "owner", memberAccess: { orders: true, schedule: true, financialInfo: true } };
for (const [name, loader] of [["list", F.loadRecentOrders], ["schedule/production", F.loadScheduleOrders]]) {
  FS.recorded.length = 0;
  const loaded = await loader(WS, ctx, "owner-uid");
  const reads = FS.recorded.map((r) => `${r.op} ${r.path}`);
  const sorted = (entries) => Object.fromEntries([...entries].sort(([x], [y]) => (x < y ? -1 : 1)));
  expect(`${name}: each row carries its store key and name`, sorted(loaded.map((r) => [r.id, [r.wooStoreKey ?? null, r.wooStoreName ?? null]])), sorted(Object.entries(WANT_ROWS)));
  expect(`${name}: no per-order read for it`, reads.filter((r) => r.startsWith("getDoc siparisler/")).length + reads.filter((r) => r === "getDocs siparisler").length, 1);
  expect(`${name}: the rows give EGGcraft 2 (one backfilled), TickToon 1, store unknown 1`, rowsOf(loaded, "all", "all"),
    [["all", "All sources", 6], ["ebay", "eBay", 1], ["woocommerce:eggcraft.co.uk", "EGGcraft", 2], ["woocommerce:ticktoon.co.uk", "TickToon", 1], ["woocommerce:", "WooCommerce (store unknown)", 1], ["manual", "Added by hand", 1]]);
}

// ---- 5. the bar and Order Filters, rendered
for (const rel of ["lib/studioflow/macTranslations.ts", "lib/studioflow/settingsContentTranslations.ts", "lib/studioflow/shippingTranslations.ts", "lib/studioflow/trackingEmailTranslations.ts", "lib/studioflow/screenGapTranslations.ts"]) compile(rel);
const { studioT, SUPPORTED_STUDIO_LANGUAGES } = await load("lib/studioflow/language.ts");
const { renderToStaticMarkup } = require("react-dom/server");
const React = require("react");
const unescape = (h) => h.replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
const textOf = (h) => unescape(h.replace(/<[^>]+>/g, ""));
// The spec's table, in the app's language order (English first): the same strings on Apple and Android.
const UNKNOWN_LONG = ["WooCommerce (store unknown)", "WooCommerce (mağaza bilinmiyor)", "WooCommerce (Shop unbekannt)", "WooCommerce (boutique inconnue)", "WooCommerce (negozio sconosciuto)", "WooCommerce (tienda desconocida)", "WooCommerce (loja desconhecida)", "WooCommerce (магазин неизвестен)", "WooCommerce（ストア不明）", "WooCommerce（店铺未知）", "WooCommerce (متجر غير معروف)", "WooCommerce (स्टोर अज्ञात)"];
const UNKNOWN_SHORT = ["Store unknown", "Mağaza bilinmiyor", "Shop unbekannt", "Boutique inconnue", "Negozio sconosciuto", "Tienda desconocida", "Loja desconhecida", "Магазин неизвестен", "ストア不明", "店铺未知", "متجر غير معروف", "स्टोर अज्ञात"];
expect("words: the two new keys in twelve languages", SUPPORTED_STUDIO_LANGUAGES.map((language) => [studioT("WooCommerce (store unknown)", language), studioT("Store unknown", language)]),
  UNKNOWN_LONG.map((long, i) => [long, UNKNOWN_SHORT[i]]));
expect("words: the unknown row's label is that key", O.WOO_STORE_UNKNOWN_LABEL, "WooCommerce (store unknown)");
try {
  const { OrderPlatformBar } = await load("components/OrderPlatformBar.tsx");
  // Order Filters keeps its open/closed state with React's hooks: its "react" import is pointed at the tree's React.
  const quickPath = compile("components/OrderQuickFilterBar.tsx");
  fs.writeFileSync(quickPath, fs.readFileSync(quickPath, "utf8").replace(/from "react"/g, `from ${JSON.stringify(reactUrl)}`));
  const { OrderQuickFilterBar } = await import(pathToFileURL(quickPath).href);
  const barHtml = (props, language = "English") => renderToStaticMarkup(React.createElement(OrderPlatformBar, { orders: LIST, filter: "all", source: "all", onSourceChange: () => {}, t: (x) => studioT(x, language), ...props }));
  const buttons = (html) => [...unescape(html).matchAll(/<button ([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attrs: m[1], inner: m[2] }));
  const a = (b, name) => (b.attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`)) || [])[1] ?? null;
  const split = buttons(barHtml({}));
  expect("bar: one button per store where WooCommerce was", split.map((b) => a(b, "data-order-platform")), ["all", "ebay", "woocommerce:eggcraft.co.uk", "woocommerce:ticktoon.co.uk", "woocommerce:", "manual"]);
  expect("bar: a store's button = the WC monogram + its name + count", split.map((b) => textOf(b.inner)), ["All9", "EB1", "WCEGGcraft3", "WCTickToon2", "WCStore unknown2", "By hand1"]);
  expect("bar: tooltip and accessible name say WooCommerce and the store", split.slice(2, 5).map((b) => [a(b, "title"), a(b, "aria-label")]),
    [["WooCommerce · EGGcraft", "WooCommerce · EGGcraft (3)"], ["WooCommerce · TickToon", "WooCommerce · TickToon (2)"], ["WooCommerce (store unknown)", "WooCommerce (store unknown) (2)"]]);
  expect("bar: the name in its own span; the monogram decorative; WooCommerce's colour class", split.slice(2, 5).map((b) => [/<span class="order-platform-bar-store">/.test(b.inner), /aria-hidden="true"/.test(b.inner), a(b, "class")]),
    Array(3).fill([true, true, "order-platform-bar-item is-woocommerce is-woo-store"]));
  expect("bar: 'Store unknown' in twelve languages; a store's name is never translated", SUPPORTED_STUDIO_LANGUAGES.map((language) => {
    const bs = buttons(barHtml({}, language));
    return [textOf(bs[4].inner), a(bs[4], "title"), textOf(bs[2].inner), a(bs[2], "title")];
  }), UNKNOWN_LONG.map((long, i) => [`WC${UNKNOWN_SHORT[i]}2`, long, "WCEGGcraft3", "WooCommerce · EGGcraft"]));
  expect("bar: one store + unrecorded orders — the one WC button, as before", buttons(barHtml({ orders: [...OTHERS, ...EGG, ...LEGACY] })).map((b) => [a(b, "data-order-platform"), textOf(b.inner), a(b, "title")]),
    [["all", "All7", "All sources"], ["ebay", "EB1", "eBay"], ["woocommerce", "WC5", "WooCommerce"], ["manual", "By hand1", "Added by hand"]]);
  const barOf = (props) => OrderPlatformBar({ orders: LIST, filter: "all", source: "all", onSourceChange: () => {}, t: (x) => x, ...props });
  const buttonsOf = (el) => (el ? [].concat(el.props.children).flat() : []);
  const picked = [];
  const press = (source, id) => { picked.length = 0; buttonsOf(barOf({ source, onSourceChange: (next) => picked.push(next) })).find((b) => b.props["data-order-platform"] === id).props.onClick(); return picked[0]; };
  expect("bar: one click picks a store; the same again, or All, clears; another store switches",
    [press("all", "woocommerce:ticktoon.co.uk"), press("woocommerce:ticktoon.co.uk", "woocommerce:ticktoon.co.uk"), press("woocommerce:ticktoon.co.uk", "woocommerce:eggcraft.co.uk"), press("woocommerce:", "all"), press("all", "woocommerce:")],
    ["woocommerce:ticktoon.co.uk", "all", "woocommerce:eggcraft.co.uk", "all", "woocommerce:"]);
  expect("bar: the chosen store is the pressed button", buttonsOf(barOf({ source: "woocommerce:ticktoon.co.uk" })).filter((b) => b.props["aria-pressed"]).map((b) => b.props["data-order-platform"]), ["woocommerce:ticktoon.co.uk"]);
  const filterHtml = (source, language = "English") => unescape(renderToStaticMarkup(React.createElement(OrderQuickFilterBar, { orders: LIST, filter: "all", sortMode: "smart", onFilterChange: () => {}, onSortModeChange: () => {}, language, source, onSourceChange: () => {} })));
  const summary = (html) => [textOf((html.match(/<strong>([\s\S]*?)<\/strong>/) || [])[1] || "").replace(/\s+/g, " ").trim(), (html.match(/class="order-filter-count">(\d+)</) || [])[1]];
  expect("Order Filters: the summary names the chosen store and counts its orders",
    [summary(filterHtml("woocommerce:ticktoon.co.uk")), summary(filterHtml("woocommerce:", "Türkçe")), summary(filterHtml("ebay"))],
    [["All • Smart • TickToon", "2"], [`${studioT("All", "Türkçe")} • ${studioT("Smart", "Türkçe")} • WooCommerce (mağaza bilinmiyor)`, "2"], ["All • Smart • eBay", "1"]]);
} catch (error) {
  // A tree without the store rows (the 12458ebfd control) cannot render them: one failure, the source checks below still run.
  checks += 1;
  failures.push(`rendered platform bar / Order Filters: ${String(error?.message || error).split("\n")[0].slice(0, 160)}`);
}

// ---- 6. the screens, the CSS, the words' table
const filterBar = read("components/OrderQuickFilterBar.tsx");
expect("Order Filters: a store's menu row shows its own name, not through t()", filterBar.includes("{item.wooStoreKey ? item.label : t(item.label)}"), true);
expect("Order Filters and the bar read one list (orderSourceChoices)", [filterBar.includes("orderSourceChoices(orders, filter, source)"), readMaybe("components/OrderPlatformBar.tsx").includes("orderSourceChoices(orders, filter, source)")], [true, true]);
expect("pages: Orders and Schedule each hold one choice state", ["app/orders/page.tsx", "app/schedule/page.tsx"].map((f) => (read(f).match(/useState<OrderSourceChoiceId>\("all"\)/g) || []).length), [1, 1]);
const css = read("app/globals.css");
expect("CSS: the store's name is cut with an ellipsis, in app/globals.css", /\.order-platform-bar-store \{[^}]*max-width: 14ch;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;[^}]*\}/.test(css), true);
expect("CSS: nothing added to the stale root globals.css", readMaybe("globals.css").includes("order-platform-bar-store"), false);
expect("words: both keys live in the platform bar's table", ["\"WooCommerce (store unknown)\":", "\"Store unknown\":"].map((k) => read("lib/studioflow/platformBarTranslations.ts").includes(k)), [true, true]);

console.log(`${checks - failures.length}/${checks} checks passed`);
if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  process.exit(1);
}

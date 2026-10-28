// UX-010 / UX-006 (27 Oct 2026): every order row shows the platform it came from.
//
// 1. The resolver (lib/studioflow/orderFilters.ts orderSourceOf), compiled with the tree's own TypeScript and run:
//    every rung on its own — commerce.provider → customFields.Source → orderSource → etsySource → document-id
//    prefix → manual — and the precedence between neighbours; the old call shape (no id) answers as before.
// 2. The list and schedule loaders (lib/studioflow/firestore.ts) against a fake Firestore holding one order per
//    provider in the shape each live writer gives it: the row carries what the resolver needs (id, Source,
//    commerce.provider, orderSource, whether etsySource is there) and NO extra read is made for it.
// 3. The chip (components/OrderSourceChip.tsx) rendered to HTML with react-dom: the words are always there,
//    provider names are not translated, "Website" goes through the app's studioT in all twelve languages, an
//    order added by hand (web, assistant, repair) has no chip.
// 4. The screens, from the source: the Orders/Schedule row and the Production board card render the chip in an
//    existing line; the order page's channel strip shows the chip's word for an inbound order, not "inbound".
// 5. The palette (app/globals.css): one token per provider per theme, and every text colour reads at >= 4.5:1 on
//    its own chip ground (the colour at 14 % over the card's plain ground, which the chip paints itself, so a
//    selected/done card tint or a photo under it cannot lower it) in both themes, on the list and on the board.
//
//   node scripts/check-order-source-chip.mjs
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "order-source-chip-check-"));

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
    if (spec.startsWith("./")) return `from "${spec}.mjs"`;
    return whole;
  });
  fs.writeFileSync(out, js);
  for (const m of js.matchAll(/from "\.\/([A-Za-z]+)\.mjs"/g)) {
    if (fs.existsSync(path.join(tmp, `${m[1]}.mjs`))) continue;
    const dir = path.dirname(rel);
    const candidates = [`lib/studioflow/${m[1]}.ts`, `${dir}/${m[1]}.ts`, `${dir}/${m[1]}.tsx`];
    const dep = candidates.find((c) => fs.existsSync(path.join(root, c)));
    if (dep) compile(dep);
  }
  return out;
};
const load = async (rel) => import(pathToFileURL(compile(rel)).href);
const O = await load("lib/studioflow/orderFilters.ts");
const of = (order) => O.orderSourceOf(order);

// ---- 1. the resolver, rung by rung
// Rung 1: the engine's stamp.
expect("rung 1: commerce.provider (eBay)", of({ commerceProvider: "ebay" }), "ebay");
expect("rung 1: commerce.provider (inbound) is the Website source", of({ commerceProvider: "inbound" }), "inbound");
expect("rung 1: commerce.provider spelled 'woo'", of({ commerceProvider: "woo" }), "woocommerce");
expect("rung 1 beats rung 2", of({ commerceProvider: "square", customFields: { Source: "Etsy" } }), "square");
expect("rung 1 beats rungs 3-5", of({ id: "etsy_ws_1_2", commerceProvider: "amazon", orderSource: "inbound", hasEtsySource: true }), "amazon");
// Rung 2: the adapter's Source word.
expect("rung 2: Source (Shopify, no stamp — the live Shopify writer)", of({ customFields: { Source: "Shopify" } }), "shopify");
expect("rung 2: Source spelled with case and spaces", of({ customFields: { Source: "  Woo Commerce " } }), "woocommerce");
expect("rung 2 beats rung 3", of({ customFields: { Source: "Etsy" }, orderSource: "inbound" }), "etsy");
expect("rung 2: the inbound label 'Website'", of({ customFields: { Source: "Website" } }), "inbound");
// Rung 3: the public order form's own field.
expect("rung 3: orderSource inbound", of({ orderSource: "inbound" }), "inbound");
expect("rung 3: an inbound label the table does not know (Wix) falls through to orderSource", of({ customFields: { Source: "Wix" }, orderSource: "inbound" }), "inbound");
expect("rung 3 beats rung 4", of({ orderSource: "inbound", hasEtsySource: true }), "inbound");
// Rung 4: Etsy's own copy on the order (the Etsy importer writes no stamp).
expect("rung 4: etsySource object (a detail/doc caller)", of({ etsySource: { receiptId: "1" } }), "etsy");
expect("rung 4: hasEtsySource (a list row)", of({ hasEtsySource: true }), "etsy");
expect("rung 4 beats rung 5", of({ id: "shopify_ws_1", hasEtsySource: true }), "etsy");
expect("rung 4: a non-object etsySource is not Etsy's copy", [of({ etsySource: "etsy" }), of({ etsySource: [] }), of({ etsySource: null }), of({ hasEtsySource: false })], ["manual", "manual", "manual", "manual"]);
// Rung 5: the importers' document ids.
const PREFIXES = { shopify_: "shopify", woo_: "woocommerce", etsy_: "etsy", ebay_: "ebay", square_: "square", amazon_: "amazon", inbound_: "inbound" };
for (const [prefix, source] of Object.entries(PREFIXES)) expect(`rung 5: id ${prefix}…`, of({ id: `${prefix}ws-1_123`, customFields: {} }), source);
expect("rung 5: an unknown Source word falls through to the id", of({ id: "inbound_ws_X-77", customFields: { Source: "Wix" } }), "inbound");
expect("rung 5: the prefix must start the id", [of({ id: "my_shopify_1" }), of({ id: "Shopify_1" }), of({ id: "woocommerce_1" }), of({ id: "inbound" })], ["manual", "manual", "manual", "manual"]);
// Rung 6: manual — added by hand (web/Android callable, Apple), assistant-created (MCP), repair intake, backup restore.
expect("rung 6: a random id with nothing else", of({ id: "Mn8kQ2vX4pLr7TzA1bC3", customFields: {} }), "manual");
expect("rung 6: unknown words never pick a provider", [of({ customFields: { Source: "constructor" } }), of({ customFields: { Source: "Wix" } }), of({ commerceProvider: "__proto__" })], ["manual", "manual", "manual"]);
expect("rung 6: assistant / repair / web / app fields are not sources", [of({ id: "Ai5sT6uV7wX8yZ9aB0cD", createdFrom: "claude" }), of({ id: "Rp1qR2sS3tT4uU5vV6wW", orderType: "repair" }), of({ id: "k1", source: "web" }), of({ id: "k2", source: "app" })], ["manual", "manual", "manual", "manual"]);
// The old call shape (no id, no etsySource) answers exactly as before (check-ebay-screens.mjs holds the same five).
expect("compat: stamp / Source / Woo two ways / form / nothing", [of({ commerceProvider: "ebay" }), of({ customFields: { Source: "eBay" } }), of({ customFields: { Source: "WooCommerce" } }), of({ commerceProvider: "woo" }), of({ orderSource: "inbound" }), of({})],
  ["ebay", "ebay", "woocommerce", "woocommerce", "inbound", "manual"]);
// The filter follows the same resolver, so the chip and the Source filter never disagree.
const listOf = [{ id: "etsy_ws_1_2", customerName: "a", designName: "b", status: "Not Yet", paymentDate: null, dueDate: null, customFields: {} },
  { id: "random-1", customerName: "c", designName: "d", status: "Not Yet", paymentDate: null, dueDate: null, customFields: {} }];
expect("filter: an Etsy order without a Source field is found under Etsy", O.filterAndSortOrders(listOf, "", "all", "recent", "etsy").map((o) => o.id), ["etsy_ws_1_2"]);
expect("filter: the menu offers it", O.orderSourcesPresent(listOf), ["etsy", "manual"]);
// Chip words.
expect("chip words: proper nouns as written; none for manual/all", ["shopify", "woocommerce", "etsy", "ebay", "square", "amazon", "manual", "all"].map((s) => O.orderSourceChipLabel(s, () => "TRANSLATED")),
  ["Shopify", "WooCommerce", "Etsy", "eBay", "Square", "Amazon", "", ""]);
expect("chip words: Website goes through t()", O.orderSourceChipLabel("inbound", (text) => `t(${text})`), "t(Website)");

// ---- 2. the loaders carry what the resolver needs, from the same read
const FS = await import(pathToFileURL(path.join(tmp, "firebase_firestore.mjs")).href);
const F = await load("lib/studioflow/firestore.ts");
const WS = "ws-chip";
const SHAPES = {
  // trace-clients.md §1: what each live writer puts on the order.
  [`shopify_${WS}_6100001`]: { customFields: { Source: "Shopify", "Shopify Order ID": "6100001" } },
  [`woo_${WS}_5101`]: { customFields: { Source: "WooCommerce" }, commerce: { provider: "woocommerce", providerDisplayName: "WooCommerce" } },
  [`etsy_${WS}_70001_31`]: { customFields: { Source: "Etsy" }, etsySource: { provider: "etsy", receiptId: "31" } },
  [`ebay_${WS}_12-1`]: { customFields: { Source: "eBay" }, commerce: { provider: "ebay" } },
  [`square_${WS}_SQ1`]: { customFields: { Source: "Square" }, commerce: { provider: "square" } },
  [`amazon_${WS}_203-1`]: { customFields: { Source: "Amazon" }, commerce: { provider: "amazon" } },
  [`inbound_${WS}_W1`]: { customFields: { Source: "Wix" }, orderSource: "inbound", inboundChannel: "wix", commerce: { provider: "inbound" } },
  [`etsy_${WS}_70001_32`]: { customFields: {}, etsySource: { provider: "etsy", receiptId: "32" } },
  [`shopify_${WS}_6100002`]: { customFields: {} },
  "Mn8kQ2vX4pLr7TzA1bC3": { customFields: {}, source: "web" },
  "Ai5sT6uV7wX8yZ9aB0cD": { customFields: {}, createdFrom: "claude" },
  "Rp1qR2sS3tT4uU5vV6wW": { customFields: {}, orderType: "repair", source: "app" }
};
const WANT = {
  [`shopify_${WS}_6100001`]: "shopify", [`woo_${WS}_5101`]: "woocommerce", [`etsy_${WS}_70001_31`]: "etsy", [`ebay_${WS}_12-1`]: "ebay",
  [`square_${WS}_SQ1`]: "square", [`amazon_${WS}_203-1`]: "amazon", [`inbound_${WS}_W1`]: "inbound", [`etsy_${WS}_70001_32`]: "etsy",
  [`shopify_${WS}_6100002`]: "shopify", "Mn8kQ2vX4pLr7TzA1bC3": "manual", "Ai5sT6uV7wX8yZ9aB0cD": "manual", "Rp1qR2sS3tT4uU5vV6wW": "manual"
};
for (const [id, extra] of Object.entries(SHAPES)) {
  FS.docs.set(`siparisler/${id}`, { companyId: WS, customerName: id, designName: "x", status: "Not Yet", paymentDate: new Date(), deliveryTime: 10, paidAmount: 1, remainingAmount: 0, ...extra });
}
const ctx = { id: WS, name: "Check", ownerUid: "owner-uid", role: "owner", roleLabel: "owner", memberAccess: { orders: true, schedule: true, financialInfo: true } };
FS.recorded.length = 0;
const rows = await F.loadRecentOrders(WS, ctx, "owner-uid");
const listReads = FS.recorded.map((r) => `${r.op} ${r.path}`);
expect("list: every seeded order is a row", rows.length, Object.keys(SHAPES).length);
expect("list: each row resolves to its platform", Object.fromEntries(rows.map((r) => [r.id, of(r)])), Object.fromEntries(rows.map((r) => [r.id, WANT[r.id]])));
expect("list: hasEtsySource is a boolean, never Etsy's copy itself", rows.every((r) => typeof r.hasEtsySource === "boolean") && rows.every((r) => !("etsySource" in r)), true);
expect("list: hasEtsySource only where etsySource is", rows.filter((r) => r.hasEtsySource).map((r) => r.id).sort(), [`etsy_${WS}_70001_31`, `etsy_${WS}_70001_32`].sort());
expect("list: no per-order read (one collection query, no getDoc on an order)", listReads.filter((r) => r.startsWith("getDoc siparisler/")).length + listReads.filter((r) => r === "getDocs siparisler").length, 1);
FS.recorded.length = 0;
const scheduleRows = await F.loadScheduleOrders(WS, ctx, "owner-uid");
const scheduleReads = FS.recorded.map((r) => `${r.op} ${r.path}`);
expect("schedule/production: each row resolves to its platform", Object.fromEntries(scheduleRows.map((r) => [r.id, of(r)])), Object.fromEntries(scheduleRows.map((r) => [r.id, WANT[r.id]])));
expect("schedule/production: no per-order read", scheduleReads.filter((r) => r.startsWith("getDoc siparisler/")).length + scheduleReads.filter((r) => r === "getDocs siparisler").length, 1);

// ---- 3. the chip, rendered
for (const rel of ["lib/studioflow/macTranslations.ts", "lib/studioflow/settingsContentTranslations.ts", "lib/studioflow/shippingTranslations.ts", "lib/studioflow/trackingEmailTranslations.ts", "lib/studioflow/screenGapTranslations.ts"]) compile(rel);
const { studioT, SUPPORTED_STUDIO_LANGUAGES } = await load("lib/studioflow/language.ts");
const { renderToStaticMarkup } = require("react-dom/server");
const React = require("react");
const chipSource = read("components/OrderSourceChip.tsx").replace('from "@/lib/studioflow/orderFilters"', 'from "./orderFilters"');
fs.writeFileSync(path.join(tmp, "OrderSourceChip.tsx.src"), chipSource);
const chipJs = ts.transpileModule(chipSource, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, jsxFactory: "__h", jsxFragmentFactory: "__F" } }).outputText
  .replace('from "./orderFilters"', 'from "./orderFilters.mjs"');
fs.writeFileSync(path.join(tmp, "OrderSourceChip.mjs"), `import __React from ${JSON.stringify(reactUrl)};\nconst __h = __React.createElement; const __F = __React.Fragment;\n${chipJs}`);
const { OrderSourceChip } = await import(pathToFileURL(path.join(tmp, "OrderSourceChip.mjs")).href);
const chip = (order, language = "English") => renderToStaticMarkup(React.createElement(OrderSourceChip, { order, t: (text) => studioT(text, language) }));
const unescape = (h) => h.replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
const textOf = (h) => unescape(h.replace(/<[^>]+>/g, ""));
const BRAND = { shopify: "Shopify", woocommerce: "WooCommerce", etsy: "Etsy", ebay: "eBay", square: "Square", amazon: "Amazon" };
for (const language of SUPPORTED_STUDIO_LANGUAGES) {
  for (const [source, word] of Object.entries(BRAND)) {
    const html = chip({ commerceProvider: source }, language);
    if (textOf(html) !== word || !html.includes(`class="order-source-chip is-${source}"`) || !html.includes(`data-source-chip="${source}"`)) {
      expect(`chip ${source} in ${language}`, textOf(html), word);
    }
  }
}
checks += 1;   // the loop above: 6 providers x 12 languages, a failure is recorded per pair
const websiteWords = SUPPORTED_STUDIO_LANGUAGES.map((language) => textOf(chip({ orderSource: "inbound" }, language)));
expect("chip Website: 12 languages, from the app's table", websiteWords,
  ["Website", "Web sitesi", "Website", "Site web", "Sito web", "Sitio web", "Site", "Веб-сайт", "ウェブサイト", "网站", "الموقع الإلكتروني", "वेबसाइट"]);
expect("chip Website: the same word the Source filter shows", SUPPORTED_STUDIO_LANGUAGES.every((language) => studioT("Website", language) === textOf(chip({ orderSource: "inbound" }, language))), true);
expect("chip: the hover says Source in the reader's language", unescape(chip({ commerceProvider: "etsy" }, "Türkçe")).includes('title="Kaynak: Etsy"'), true);
expect("chip: inbound class + data attribute", chip({ commerceProvider: "inbound" }).includes('class="order-source-chip is-inbound" data-source-chip="inbound"'), true);
expect("chip: none for an order added by hand (web, assistant, repair)", [chip({ id: "Mn8kQ2vX4pLr7TzA1bC3", customFields: {} }), chip({ id: "Ai5sT6uV7wX8yZ9aB0cD", createdFrom: "claude" }), chip({ id: "Rp1q", orderType: "repair" })], ["", "", ""]);
expect("chip: from a list row of each live shape", rows.map((r) => [r.id, textOf(chip(r))]).sort(),
  rows.map((r) => [r.id, WANT[r.id] === "manual" ? "" : WANT[r.id] === "inbound" ? "Website" : BRAND[WANT[r.id]]]).sort());

// ---- 4. the screens, from the source
const card = read("components/OrderListCard.tsx");
const dateLine = card.slice(card.indexOf('className="order-list-detail-line order-list-date-line"'), card.indexOf("{scheduleItem ?"));
expect("row: the chip rides on the date line (no new line)", dateLine.includes("<OrderSourceChip order={order} t={text => studioT(text, displayLanguage)} />"), true);
expect("row: the chip is not in the title row or the badges", (() => { const head = card.slice(card.indexOf('className="order-list-title-row"'), card.indexOf("{assignmentLabel ? (")); const side = card.slice(card.indexOf('className="order-list-side"')); return !head.includes("OrderSourceChip") && !side.includes("OrderSourceChip"); })(), true);
const css4 = read("app/globals.css");
expect("phone: the same chip is pinned on the photo's bottom edge (no new line), in both reading directions",
  css4.includes(".orders-mobile-list .order-list-date-line .order-source-chip {\n  position: absolute;") && css4.includes('html[dir="rtl"] .orders-mobile-list .order-list-date-line .order-source-chip { transform: translate(50%, -50%); }'), true);
expect("row: the chip keeps the date line at the date's own height", css4.includes(".order-list-date-line .order-source-chip { flex: 0 0 auto; margin: -3px 0 -3px 2px; }"), true);
expect("row type carries the resolver's inputs", ["commerceProvider?: string;", "orderSource?: string;", "hasEtsySource?: boolean;"].every((f) => card.includes(f)), true);
const board = read("app/production/ProductionContent.tsx");
expect("production board: the chip sits beside the priority chip in the existing row", /className="production-card-row">[\s\S]{0,260}<OrderSourceChip order=\{order\} t=\{t\} \/>[\s\S]{0,120}production-chip production-chip-/.test(board), true);
expect("one resolver: no second source rule in the chip", !/customFields\?\.\["Source"\]|commerceProvider ===|startsWith\("/.test(read("components/OrderSourceChip.tsx")), true);
const detail = read("app/orders/OrderDetailContent.tsx");
expect("detail strip: an inbound stamp shows the chip's word", detail.includes('const badge = (stamp?.provider || "").trim().toLowerCase() === "inbound" ? orderSourceChipLabel("inbound", t) : source;') && detail.includes('<span className="shopify-source-badge">{badge}</span>'), true);
expect("detail strip: one Shopify strip — the channel strip stands aside on the Shopify strip's own test, stamp or not",
  detail.includes('if ((cf["Source"] || "").trim() === "Shopify") return null;') && !detail.includes('if (source === "Shopify" && !stamp) return null;')
    && detail.includes('if ((cf["Source"] || "").trim() !== "Shopify") return null;'), true);
expect("detail strip: the field lookups still use the stored source", detail.includes("const field = (suffix: string) => (cf[`${source} ${suffix}`] || \"\").trim();"), true);

// ---- 5. the palette
const css = read("app/globals.css");
const rootBlock = css.slice(css.indexOf("/* ---- UX-010 / UX-006 (27 Oct 2026): the platform chip"), css.indexOf(".order-source-chip {"));
const tokens = (block) => Object.fromEntries([...block.matchAll(/--order-source-([a-z]+)-rgb:\s*(\d+),\s*(\d+),\s*(\d+);/g)].map((m) => [m[1], [Number(m[2]), Number(m[3]), Number(m[4])]]));
const lightPart = rootBlock.slice(0, rootBlock.indexOf('html[data-studio-theme="dark"]'));
const darkPart = rootBlock.slice(rootBlock.indexOf('html[data-studio-theme="dark"]'));
const light = tokens(lightPart);
const dark = tokens(darkPart);
const PROVIDERS = ["etsy", "shopify", "woocommerce", "ebay", "square", "amazon", "website"];
expect("palette: one light token per provider", Object.keys(light).sort(), [...PROVIDERS].sort());
expect("palette: one dark token per provider", Object.keys(dark).sort(), [...PROVIDERS].sort());
expect("palette: the tokens are defined once (no second copy elsewhere)", (css.match(/--order-source-etsy-rgb:/g) || []).length, 2);
expect("palette: the dark set lives under the app's own dark theme", darkPart.trimStart().startsWith('html[data-studio-theme="dark"],\nbody[data-studio-theme="dark"] {'), true);
for (const source of ["etsy", "shopify", "woocommerce", "ebay", "square", "amazon", "inbound"]) {
  const token = source === "inbound" ? "website" : source;
  expect(`palette: .is-${source} reads its token`, css.includes(`.order-source-chip.is-${source} { --order-source-rgb: var(--order-source-${token}-rgb); }`), true);
}
expect("palette: ground = 14 % over the card's plain ground, border 30 %", css.includes("border: 1px solid rgba(var(--order-source-rgb), 0.30);")
  && css.includes("background-color: var(--order-source-ground);")
  && css.includes("background-image: linear-gradient(rgba(var(--order-source-rgb), 0.14), rgba(var(--order-source-rgb), 0.14));")
  && css.includes("color: rgb(var(--order-source-rgb));"), true);
const groundOf = (block) => (block.match(/--order-source-ground:\s*(#[0-9a-f]{6});/i) || [])[1];
expect("palette: the chip's own ground per theme = the order card's plain ground", [groundOf(lightPart), groundOf(darkPart)], ["#ffffff", "#252525"]);
expect("palette: on the board the chip paints the board card's ground", css.includes(".production-card .order-source-chip { --order-source-ground: var(--surface); }"), true);
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = (h) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16));
// The grounds the chip paints itself on: the order card's plain ground and the board card's (--surface).
const GROUNDS = {
  light: { list: "#ffffff", board: "#ffffff" },
  dark: { list: "#252525", board: "#1f1f1f" }
};
const low = [];
for (const [theme, set] of [["light", light], ["dark", dark]]) {
  for (const [name, rgb] of Object.entries(set)) {
    for (const [ground, value] of Object.entries(GROUNDS[theme])) {
      const g = hex(value);
      const chipGround = rgb.map((c, i) => Math.round(c * 0.14 + g[i] * 0.86));
      const r = ratio(rgb, chipGround);
      if (r < 4.5) low.push(`${theme} ${name} on ${ground}: ${r.toFixed(2)}`);
    }
  }
}
expect("palette: every text colour >= 4.5:1 on its chip ground, both themes, list and board", low, []);

console.log(`${checks - failures.length}/${checks} checks passed`);
if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  process.exit(1);
}

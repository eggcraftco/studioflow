// UX-010 / UX-006: every order row shows the platform it came from — 27 Oct 2026 as the platform's name in a
// capsule, 28 Oct 2026 as its MONOGRAM (owner: "initials, not the long names"; no third-party logo), plus the
// quick platform bar at the top of the order list column.
//
// 1. The resolver (lib/studioflow/orderFilters.ts orderSourceOf), compiled with the tree's own TypeScript and run:
//    every rung on its own — commerce.provider → customFields.Source → orderSource → etsySource → document-id
//    prefix → manual — and the precedence between neighbours; the old call shape (no id) answers as before.
// 2. The list and schedule loaders (lib/studioflow/firestore.ts) against a fake Firestore holding one order per
//    provider in the shape each live writer gives it: the row carries what the resolver needs (id, Source,
//    commerce.provider, orderSource, whether etsySource is there) and NO extra read is made for it.
// 3. The monogram (components/OrderSourceMonogram.tsx via OrderSourceChip.tsx) rendered with react-dom: our own
//    letters per platform (a drawn globe for the website form), the full name as aria-label and in the tooltip
//    in all twelve languages, none for an order added by hand. The quick platform bar (components/OrderPlatformBar.tsx)
//    rendered and clicked: All + the sources present, monogram + count, aria-pressed, one click filters and a second
//    clears, hidden with one source, the same list (orderSourceChoices) as the Source rows in Order Filters.
// 4. The screens, from the source: the Orders/Schedule row and the Production board card render the monogram in an
//    existing line; the order page keeps the full name; the bar sits under the search box, above Order Filters, on
//    the page's one source state (Orders desktop + phone, Schedule); no third-party logo file is referenced.
// 5. The palette (app/globals.css): one token per provider per theme, and every text colour reads at >= 4.5:1 on
//    its own monogram ground (the colour at 14 % over the ground the monogram paints itself: the order card's, the
//    board card's, the bar button's), in both themes.
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
// Files this change adds: a tree without them (the control run on b54063fc) fails their checks instead of crashing.
const readMaybe = (rel) => (fs.existsSync(path.join(root, rel)) ? read(rel) : "");
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
// Full names (the monogram's tooltip and accessible name, the order page's strip).
expect("full names: proper nouns as written; none for manual/all", ["shopify", "woocommerce", "etsy", "ebay", "square", "amazon", "manual", "all"].map((s) => O.orderSourceChipLabel(s, () => "TRANSLATED")),
  ["Shopify", "WooCommerce", "Etsy", "eBay", "Square", "Amazon", "", ""]);
expect("full names: Website goes through t()", O.orderSourceChipLabel("inbound", (text) => `t(${text})`), "t(Website)");

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

// ---- 3. the monogram, rendered (the row badge, the board badge, the bar's buttons)
for (const rel of ["lib/studioflow/macTranslations.ts", "lib/studioflow/settingsContentTranslations.ts", "lib/studioflow/shippingTranslations.ts", "lib/studioflow/trackingEmailTranslations.ts", "lib/studioflow/screenGapTranslations.ts"]) compile(rel);
const { studioT, SUPPORTED_STUDIO_LANGUAGES } = await load("lib/studioflow/language.ts");
const { renderToStaticMarkup } = require("react-dom/server");
const React = require("react");
const unescape = (h) => h.replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
const textOf = (h) => unescape(h.replace(/<[^>]+>/g, ""));
const attr = (h, name) => { const m = unescape(h).match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null; };
try {
const { OrderSourceChip } = await load("components/OrderSourceChip.tsx");
const { OrderSourceMonogram } = await load("components/OrderSourceMonogram.tsx");
const { OrderPlatformBar } = await load("components/OrderPlatformBar.tsx");
const chip = (order, language = "English") => renderToStaticMarkup(React.createElement(OrderSourceChip, { order, t: (text) => studioT(text, language) }));
const BRAND = { shopify: "Shopify", woocommerce: "WooCommerce", etsy: "Etsy", ebay: "eBay", square: "Square", amazon: "Amazon" };
const LETTERS = { shopify: "SH", woocommerce: "WC", etsy: "ET", ebay: "EB", square: "SQ", amazon: "AM" };
for (const language of SUPPORTED_STUDIO_LANGUAGES) {
  for (const [source, word] of Object.entries(BRAND)) {
    const html = chip({ commerceProvider: source }, language);
    const got = [textOf(html), attr(html, "role"), attr(html, "aria-label"), attr(html, "title"), attr(html, "data-source-monogram"), attr(html, "class")];
    const want = [LETTERS[source], "img", word, `${studioT("Source", language)}: ${word}`, source, `order-source-monogram is-${source}`];
    if (JSON.stringify(got) !== JSON.stringify(want)) expect(`row monogram ${source} in ${language}`, got, want);
  }
}
checks += 1;   // the loop above: 6 platforms x 12 languages (letters, role, aria-label, title, data, class); a failure is recorded per pair
const website = SUPPORTED_STUDIO_LANGUAGES.map((language) => chip({ orderSource: "inbound" }, language));
expect("row monogram Website: a drawn globe, no letters, no image file", website.every((h) => textOf(h) === "" && /<svg [^>]*class="order-source-monogram-glyph"/.test(h) && !/<img|href=|xlink/.test(h)), true);
expect("row monogram Website: aria-label = the full name from the app's table, 12 languages", website.map((h) => attr(h, "aria-label")),
  ["Website", "Web sitesi", "Website", "Site web", "Sito web", "Sitio web", "Site", "Веб-сайт", "ウェブサイト", "网站", "الموقع الإلكتروني", "वेबसाइट"]);
expect("row monogram Website: the same word the Source filter shows", SUPPORTED_STUDIO_LANGUAGES.every((language, i) => attr(website[i], "aria-label") === studioT("Website", language)), true);
expect("row monogram: the hover says Source + the full name in the reader's language", [attr(chip({ commerceProvider: "etsy" }, "Türkçe"), "title"), attr(chip({ orderSource: "inbound" }, "Türkçe"), "title")], ["Kaynak: Etsy", "Kaynak: Web sitesi"]);
expect("row monogram: none for an order added by hand (web, assistant, repair)", [chip({ id: "Mn8kQ2vX4pLr7TzA1bC3", customFields: {} }), chip({ id: "Ai5sT6uV7wX8yZ9aB0cD", createdFrom: "claude" }), chip({ id: "Rp1q", orderType: "repair" })], ["", "", ""]);
expect("row monogram: from a list row of each live shape", rows.map((r) => [r.id, textOf(chip(r)) || (chip(r).includes("<svg") ? "globe" : "")]).sort(),
  rows.map((r) => [r.id, WANT[r.id] === "manual" ? "" : WANT[r.id] === "inbound" ? "globe" : LETTERS[WANT[r.id]]]).sort());
const quiet = renderToStaticMarkup(React.createElement(OrderSourceMonogram, { source: "woocommerce", t: (x) => x, decorative: true }));
expect("decorative monogram (inside a named button): hidden from assistive tech, no second name", [attr(quiet, "aria-hidden"), attr(quiet, "role"), attr(quiet, "aria-label"), attr(quiet, "title"), textOf(quiet)], ["true", null, null, null, "WC"]);

// The quick platform bar. A list with every source, in an order the menu does not follow.
const fo = (id, over = {}) => ({ id, customerName: id, designName: "d", status: "Not Yet", paymentDate: null, dueDate: null, remainingAmount: 0, customFields: {}, ...over });
const ALL = [fo("manual-1"), fo("woo_ws_1"), fo("woo_ws_2", { status: "Done" }), fo("etsy_ws_1_1"), fo("shopify_ws_1"), fo("ebay_ws_1"), fo("square_ws_1"), fo("amazon_ws_1"), fo("inbound_ws_1"), fo("manual-2")];
const barOf = (props) => OrderPlatformBar({ orders: ALL, filter: "all", source: "all", onSourceChange: () => {}, t: (x) => x, ...props });
const buttonsOf = (el) => (el ? [].concat(el.props.children).flat() : []);
const barHtml = (props, language = "English") => renderToStaticMarkup(React.createElement(OrderPlatformBar, { orders: ALL, filter: "all", source: "all", onSourceChange: () => {}, t: (x) => studioT(x, language), ...props }));
const html1 = barHtml({});
const buttons = [...unescape(html1).matchAll(/<button ([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attrs: m[1], inner: m[2] }));
const a = (b, name) => (b.attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`)) || [])[1] ?? null;
expect("bar: All first, then the sources present in the menu's order, By hand last", buttons.map((b) => a(b, "data-order-platform")), ["all", "ebay", "shopify", "woocommerce", "etsy", "square", "amazon", "inbound", "manual"]);
expect("bar: each button = monogram + count (All / By hand as words)", buttons.map((b) => textOf(b.inner)), ["All10", "EB1", "SH1", "WC2", "ET1", "SQ1", "AM1", "1", "By hand2"]);
expect("bar: the Website button carries the drawn globe", /<svg [^>]*class="order-source-monogram-glyph"/.test(buttons[7].inner), true);
expect("bar: the full name is the tooltip; the accessible name is the full name + count", buttons.map((b) => [a(b, "title"), a(b, "aria-label")]),
  [["All sources", "All sources (10)"], ["eBay", "eBay (1)"], ["Shopify", "Shopify (1)"], ["WooCommerce", "WooCommerce (2)"], ["Etsy", "Etsy (1)"], ["Square", "Square (1)"], ["Amazon", "Amazon (1)"], ["Website", "Website (1)"], ["Added by hand", "Added by hand (2)"]]);
expect("bar: plain buttons (keyboard-focusable), pressed state exposed", buttons.map((b) => [a(b, "type"), a(b, "aria-pressed")]), [["button", "true"], ...Array(8).fill(["button", "false"])]);
expect("bar: the monograms inside the buttons are decorative (the button carries the name)", buttons.slice(1, 8).every((b) => /aria-hidden="true"/.test(b.inner) && !/role="img"/.test(b.inner)), true);
expect("bar: a named group", [/^<div [^>]*role="group"/.test(html1), attr(html1, "aria-label"), attr(barHtml({}, "Türkçe"), "aria-label")], [true, "Source", "Kaynak"]);
expect("bar: in Arabic the words and names come from the app's table", [...unescape(barHtml({}, "العربية (Arabic)")).matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).filter((x, i) => [0, 1, 8, 9].includes(i)),
  ["المصدر", "كل المصادر (10)", "الموقع الإلكتروني (1)", "أُضيف يدويًا (2)"]);
expect("bar: counts within the chosen quick filter (the Order Filters rows count the same)", buttonsOf(barOf({ filter: "completed" })).map((b) => [b.props["data-order-platform"], b.props["aria-label"].match(/\((\d+)\)$/)[1]]).filter(([id]) => ["all", "woocommerce", "etsy"].includes(id)),
  [["all", "1"], ["woocommerce", "1"], ["etsy", "0"]]);
expect("bar: the chosen source is the pressed button", buttonsOf(barOf({ source: "woocommerce" })).filter((b) => b.props["aria-pressed"]).map((b) => b.props["data-order-platform"]), ["woocommerce"]);
const clicks = (source) => buttonsOf(barOf({ source, onSourceChange: (next) => picked.push(next) }));
const picked = [];
const press = (source, id) => { picked.length = 0; clicks(source).find((b) => b.props["data-order-platform"] === id).props.onClick(); return picked[0]; };
expect("bar: one click filters; the chosen one again, or All, clears", [press("all", "woocommerce"), press("woocommerce", "woocommerce"), press("woocommerce", "all"), press("all", "all"), press("woocommerce", "etsy"), press("all", "manual")],
  ["woocommerce", "all", "all", "all", "etsy", "manual"]);
expect("bar: hidden when the list has one source", [barOf({ orders: [fo("m1"), fo("m2")] }), barOf({ orders: [fo("etsy_ws_1"), fo("etsy_ws_2")] }), barHtml({ orders: [fo("m1")] })], [null, null, ""]);
expect("bar: still there with one source while a source is chosen (so it can be cleared)", buttonsOf(barOf({ orders: [fo("m1")], source: "ebay" })).map((b) => b.props["data-order-platform"]), ["all", "ebay", "manual"]);
expect("bar = Order Filters' Source rows: one list (orderSourceChoices) for both", (() => {
  const choices = O.orderSourceChoices(ALL, "completed", "etsy");
  const viaBar = buttonsOf(barOf({ filter: "completed", source: "etsy" })).map((b) => [b.props["data-order-platform"], Number(b.props["aria-label"].match(/\((\d+)\)$/)[1])]);
  return JSON.stringify(viaBar) === JSON.stringify(choices.map((c) => [c.id, c.count]));
})(), true);
} catch (error) {
  // A tree without the monogram or the bar (the b54063fc control) cannot render them: one failure, the source checks below still run.
  checks += 1;
  failures.push(`rendered monogram / platform bar: ${String(error?.message || error).split("\n")[0].slice(0, 160)}`);
}
const filterBar = read("components/OrderQuickFilterBar.tsx");
const platformBar = readMaybe("components/OrderPlatformBar.tsx");
expect("bar = Order Filters' Source rows: both read orderSourceChoices(orders, filter, source)", [filterBar.includes("const sourceRows = onSourceChange ? orderSourceChoices(orders, filter, source) : [];"), platformBar.includes("const choices = orderSourceChoices(orders, filter, source);")], [true, true]);
expect("bar: keeps no state of its own (no second filter)", platformBar !== "" && !/useState|useReducer|localStorage|sessionStorage/.test(platformBar), true);

// ---- 4. the screens, from the source
const card = read("components/OrderListCard.tsx");
const dateLine = card.slice(card.indexOf('className="order-list-detail-line order-list-date-line"'), card.indexOf("{scheduleItem ?"));
expect("row: the monogram rides on the date line (no new line)", dateLine.includes("<OrderSourceChip order={order} t={text => studioT(text, displayLanguage)} />"), true);
expect("row: the monogram is not in the title row or the badges", (() => { const head = card.slice(card.indexOf('className="order-list-title-row"'), card.indexOf("{assignmentLabel ? (")); const side = card.slice(card.indexOf('className="order-list-side"')); return !head.includes("OrderSourceChip") && !side.includes("OrderSourceChip"); })(), true);
const css4 = read("app/globals.css");
expect("phone: the monogram is pinned on the photo's corner (no new line), in both reading directions",
  css4.includes(".orders-mobile-list .order-list-date-line .order-source-monogram {\n  position: absolute;") && css4.includes('html[dir="rtl"] .orders-mobile-list .order-list-date-line .order-source-monogram { transform: translate(50%, -50%); }'), true);
expect("row: the monogram keeps the date line at the date's own height", css4.includes(".order-list-date-line .order-source-monogram { margin: -3px 0 -3px 2px; }"), true);
expect("row: the long-name chip is gone everywhere (class and CSS)", ["components/OrderListCard.tsx", "components/OrderSourceChip.tsx", "components/OrderSourceMonogram.tsx", "components/OrderPlatformBar.tsx", "app/production/ProductionContent.tsx", "app/orders/page.tsx", "app/schedule/page.tsx"].filter((f) => readMaybe(f).includes('"order-source-chip"')).concat(css4.includes(".order-source-chip") ? ["app/globals.css"] : []), []);
expect("row type carries the resolver's inputs", ["commerceProvider?: string;", "orderSource?: string;", "hasEtsySource?: boolean;"].every((f) => card.includes(f)), true);
const board = read("app/production/ProductionContent.tsx");
expect("production board: the monogram sits beside the priority chip in the existing row", /className="production-card-row">[\s\S]{0,260}<OrderSourceChip order=\{order\} t=\{t\} \/>[\s\S]{0,120}production-chip production-chip-/.test(board), true);
expect("one resolver: no second source rule in the monogram, the row badge or the bar", ["components/OrderSourceChip.tsx", "components/OrderSourceMonogram.tsx", "components/OrderPlatformBar.tsx"].filter((f) => /customFields\?\.\["Source"\]|commerceProvider ===|startsWith\("/.test(readMaybe(f))), []);
const detail = read("app/orders/OrderDetailContent.tsx");
expect("detail strip keeps the full name: an inbound stamp shows the word, no monogram on the order page",
  detail.includes('const badge = (stamp?.provider || "").trim().toLowerCase() === "inbound" ? orderSourceChipLabel("inbound", t) : source;') && detail.includes('<span className="shopify-source-badge">{badge}</span>')
    && !/OrderSourceMonogram|OrderSourceChip/.test(detail), true);
expect("detail strip: one Shopify strip — the channel strip stands aside on the Shopify strip's own test, stamp or not",
  detail.includes('if ((cf["Source"] || "").trim() === "Shopify") return null;') && !detail.includes('if (source === "Shopify" && !stamp) return null;')
    && detail.includes('if ((cf["Source"] || "").trim() !== "Shopify") return null;'), true);
expect("detail strip: the field lookups still use the stored source", detail.includes("const field = (suffix: string) => (cf[`${source} ${suffix}`] || \"\").trim();"), true);
const dashboard = read("app/dashboard/page.tsx");
const dashboardChannel = dashboard.slice(dashboard.indexOf("function dashboardOrderChannel("), dashboard.indexOf("const RANGE_OPTIONS"));
expect("dashboard pills ask the shared resolver, with no Source rule of their own",
  dashboard.includes('import { orderSourceOf } from "@/lib/studioflow/orderFilters";') && dashboardChannel.includes("return orderSourceOf(order);")
    && !/customFields\[|\.find\(/.test(dashboardChannel), true);
expect("dashboard: the website form has its own pill, its word through t()",
  dashboard.includes('{ key: "inbound", source: "Website" }') && dashboard.includes('channel.key === "inbound" ? t(channel.source) : channel.source')
    && /type DashboardChannel = [^;]*"inbound"/.test(dashboard), true);
const loaders = read("lib/studioflow/firestore.ts");
const financeLoader = loaders.slice(loaders.indexOf("export async function loadDashboardFinanceOrders("), loaders.indexOf("countsTowardBalance: orderCountsTowardBalance(data)", loaders.indexOf("export async function loadDashboardFinanceOrders(")));
expect("dashboard loader carries the stamps from the snapshot it already read", financeLoader.includes("...orderSourceFieldsFrom(data),"), true);
// The bar on the screens: under the search box, above Order Filters, on the page's one source state.
const listPage = read("app/orders/page.tsx");
expect("orders (desktop): the bar sits directly under the search box, above Order Filters",
  /className="orders-search">[\s\S]{0,320}?<\/label>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?<OrderPlatformBar orders=\{visibleOrders\} filter=\{orderFilter\} source=\{orderSource\} onSourceChange=\{setOrderSource\} t=\{t\} \/>\s*<OrderQuickFilterBar/.test(listPage), true);
expect("orders (phone): the bar sits at the top of the phone list, under its search", /className="orders-search orders-mobile-search">[\s\S]{0,520}?\) : null\}\s*<OrderPlatformBar orders=\{visibleOrders\} filter=\{orderFilter\} source=\{orderSource\} onSourceChange=\{setOrderSource\} t=\{t\} className="orders-mobile-platform-bar" \/>/.test(listPage), true);
expect("orders: Order Filters and the bar share one state (2 + 2 bindings, one useState)",
  [(listPage.match(/<OrderQuickFilterBar[\s\S]{0,400}?source=\{orderSource\}\s*onSourceChange=\{setOrderSource\}/g) || []).length, (listPage.match(/<OrderPlatformBar [^>]*source=\{orderSource\} onSourceChange=\{setOrderSource\}/g) || []).length, (listPage.match(/useState<OrderSourceId>/g) || []).length],
  [2, 2, 1]);
expect("orders: the list is filtered by that state", listPage.includes("filterAndSortOrders(orderFilter === \"trash\" ? deletedOrders : visibleOrders, orderSearch, orderFilter, orderSortMode, orderSource)"), true);
const schedulePage = read("app/schedule/page.tsx");
expect("schedule (same list column): the bar under the search box, above Order Filters, on one state",
  /className="orders-search">[\s\S]{0,320}?<\/label>\s*<OrderPlatformBar orders=\{visibleSourceOrders\} filter=\{filter\} source=\{source\} onSourceChange=\{setSource\} t=\{t\} \/>\s*<OrderQuickFilterBar/.test(schedulePage)
    && (schedulePage.match(/source=\{source\}\s*onSourceChange=\{setSource\}/g) || []).length === 3 && (schedulePage.match(/useState<OrderSourceId>/g) || []).length === 1
    && schedulePage.includes("filterAndSortOrders(visibleSourceOrders, search, filter, sortMode, source)"), true);
// No third-party logo: the monogram, the row badge, the bar and the screens that show them reference no logo file,
// no image and no CSS url(); the globe is drawn from three primitives.
const monogram = readMaybe("components/OrderSourceMonogram.tsx");
const LOGO = /integration-logos|brand\/integrations|<img\b|<image\b|src=|href=|url\(|\.(?:svg|png|jpe?g|webp|gif)["'`]/;
expect("no third-party logo: none referenced by the monogram, the row badge, the bar", ["components/OrderSourceMonogram.tsx", "components/OrderSourceChip.tsx", "components/OrderPlatformBar.tsx", "lib/studioflow/orderFilters.ts"].filter((f) => LOGO.test(readMaybe(f))), []);
expect("no third-party logo: none on the order rows, the board card or the bar's screens", ["components/OrderListCard.tsx", "app/production/ProductionContent.tsx", "app/orders/page.tsx", "app/schedule/page.tsx"].filter((f) => /integration-logos|brand\/integrations/.test(read(f))), []);
const monogramCss = css4.slice(css4.indexOf(".order-source-monogram {"), css4.indexOf(".orders-mobile-platform-bar::-webkit-scrollbar"));
expect("no third-party logo: the monogram and bar CSS paint no image", /url\(|image-set\(/.test(monogramCss), false);
expect("the globe is ours: a circle, one meridian, the equator — nothing else", (monogram.slice(monogram.indexOf("<svg"), monogram.indexOf("</svg>")).match(/<(\w+)/g) || []), ["<svg", "<circle", "<ellipse", "<path"]);
expect("monogram table: our own letters, one per platform, no letters for manual", [Object.fromEntries(Object.entries(O.ORDER_SOURCE_MONOGRAMS || {}).map(([k, v]) => [k, v.glyph ? `${v.letters}+${v.glyph}` : v.letters])), O.isOrderPlatform?.("manual"), O.isOrderPlatform?.("all")],
  [{ shopify: "SH", woocommerce: "WC", etsy: "ET", ebay: "EB", square: "SQ", amazon: "AM", inbound: "WEB+globe" }, false, false]);
expect("monogram table: every platform the Source filter knows has one", O.ORDER_SOURCE_FILTERS.map((f) => f.id).filter((id) => id !== "all" && id !== "manual" && !O.isOrderPlatform?.(id)), []);
// Words: the bar's new word and the reused ones, in all twelve languages.
const BAR_WORDS = ["By hand", "All", "All sources", "Added by hand", "Source", "Website"];
const SAME_WORD = { "Source": ["Français"], "Website": ["Deutsch"] };
const missing = [];
for (const w of BAR_WORDS) for (const language of SUPPORTED_STUDIO_LANGUAGES.filter((l) => l !== "English")) if (studioT(w, language) === w && !(SAME_WORD[w] || []).includes(language)) missing.push(`${w} / ${language}`);
expect("words: the bar's words in all twelve languages (By hand is new; the rest are reused rows)", missing, []);
expect("words: By hand, as merged", SUPPORTED_STUDIO_LANGUAGES.map((l) => studioT("By hand", l)), ["By hand", "Elle eklenen", "Manuell", "À la main", "A mano", "A mano", "À mão", "Вручную", "手動", "手动", "يدويًا", "हाथ से"]);

// ---- 5. the palette and the contrast of the monogram on every ground it paints
const css = read("app/globals.css");
const rootBlock = css.slice(css.indexOf("/* ---- UX-010 / UX-006 (27 Oct 2026): the platform chip"), css.indexOf(".order-source-monogram {"));
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
  expect(`palette: .is-${source} reads its token`, css.includes(`.order-source-monogram.is-${source} { --order-source-rgb: var(--order-source-${token}-rgb); }`), true);
}
const monoRule = css.slice(css.indexOf(".order-source-monogram {"), css.indexOf("}", css.indexOf(".order-source-monogram {")));
expect("palette: ground = 14 % over the monogram's own plain ground, border 30 %, text = the colour", monoRule.includes("border: 1px solid rgba(var(--order-source-rgb), 0.30);")
  && monoRule.includes("background-color: var(--order-source-ground);")
  && monoRule.includes("background-image: linear-gradient(rgba(var(--order-source-rgb), 0.14), rgba(var(--order-source-rgb), 0.14));")
  && monoRule.includes("color: rgb(var(--order-source-rgb));"), true);
expect("monogram: a small rounded square, 18 px on rows, 20 px in the bar", [monoRule.includes("--order-source-monogram-size: 18px;"), monoRule.includes("width: var(--order-source-monogram-size);"), monoRule.includes("height: var(--order-source-monogram-size);"), monoRule.includes("border-radius: 5px;"),
  css.includes(".order-platform-bar-item .order-source-monogram { --order-source-monogram-size: 20px; font-size: 10px; letter-spacing: 0; }")], [true, true, true, true, true]);
const groundOf = (block) => (block.match(/--order-source-ground:\s*(#[0-9a-f]{6});/i) || [])[1];
expect("palette: the monogram's own ground per theme = the order card's plain ground", [groundOf(lightPart), groundOf(darkPart)], ["#ffffff", "#252525"]);
expect("palette: on the board the monogram paints the board card's ground", css.includes(".production-card .order-source-monogram { --order-source-ground: var(--surface); }"), true);
const barGround = (re) => (css.match(re) || [])[1];
const barLight = barGround(/\.order-platform-bar \{\n  --order-platform-bar-ground: (#[0-9a-f]{6});/i);
const barDark = barGround(/body\[data-studio-theme="dark"\] \.order-platform-bar \{ --order-platform-bar-ground: (#[0-9a-f]{6}); \}/i);
expect("bar: the monogram paints the bar button's own ground, per theme", [barLight, barDark, css.includes("--order-source-ground: var(--order-platform-bar-ground);")], ["#ffffff", "#272727", true]);
expect("bar: the chosen button is told by more than colour (a doubled border, aria-pressed)", css.includes('.order-platform-bar-item[aria-pressed="true"] { border-color: var(--text); box-shadow: inset 0 0 0 1px var(--text); }'), true);
expect("bar: keyboard focus is visible", css.includes(".order-platform-bar-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }"), true);
const phoneBar = css.slice(css.indexOf(".orders-mobile-platform-bar {"), css.indexOf("}", css.indexOf(".orders-mobile-platform-bar {")));
expect("bar: wraps in the desktop column, scrolls inside itself on the phone (never the page)", [css.includes(".order-platform-bar {\n  --order-platform-bar-ground: #ffffff;\n  display: flex;\n  flex-wrap: wrap;"), phoneBar.includes("flex-wrap: nowrap;"), phoneBar.includes("overflow-x: auto;")], [true, true, true]);
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (x, y) => { const [p, q] = [lum(x), lum(y)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05); };
const hex = (h) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16));
// The grounds the monogram paints itself on: the order card's plain ground, the board card's (--surface), the bar button's.
const GROUNDS = {
  light: { list: "#ffffff", board: "#ffffff", bar: barLight || "#ffffff" },
  dark: { list: "#252525", board: "#1f1f1f", bar: barDark || "#272727" }
};
const low = [];
const table = {};
for (const [theme, set] of [["light", light], ["dark", dark]]) {
  for (const [name, rgb] of Object.entries(set)) {
    for (const [ground, value] of Object.entries(GROUNDS[theme])) {
      const g = hex(value);
      const monoGround = rgb.map((c, i) => Math.round(c * 0.14 + g[i] * 0.86));
      const r = ratio(rgb, monoGround);
      table[`${theme} ${name}`] = Math.min(table[`${theme} ${name}`] ?? 99, +r.toFixed(2));
      if (r < 4.5) low.push(`${theme} ${name} on ${ground}: ${r.toFixed(2)}`);
    }
  }
}
expect("contrast: every monogram text colour >= 4.5:1 on its own ground, both themes, list / board / bar", low, []);
console.log(`contrast (lowest of list/board/bar ground, WCAG): ${Object.entries(table).map(([k, v]) => `${k} ${v}`).join(" · ")}`);

console.log(`${checks - failures.length}/${checks} checks passed`);
if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  process.exit(1);
}

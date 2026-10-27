// MC-4 (27 Oct 2026): a WooCommerce order's "Stock" line and the card's flag, on the web.
//
// 1. lib/studioflow/wooOrderStockRules.ts, compiled with the tree's own TypeScript and run: the server's answer is
//    reduced to the fields the screen prints; every line state reads as the owner's words (reserved / took / restored /
//    oversold / refunded after dispatch — did it come back? / before the link); "Reserve stock" is offered only for a
//    line that holds nothing and only with the server's canEdit; "Return to stock" only for sold goods the server asks
//    about and only with canReturn (owner/admin); the card's flag is read from wooStockAttention.
// 2. Every sentence the screens print resolves in every app language.
// 3. The block is mounted on the order page after the eBay block, draws nothing until the server says enabled, calls
//    only getWooOrderStock / updateWooOrderStock, and the card panel shows the flag.
//
//   node scripts/check-woo-order-stock.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const expect = (name, actual, wanted) => { checks += 1; if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`); };
const ok = (name, condition) => { checks += 1; if (!condition) failures.push(name); };
const read = (rel) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), "utf8") : "");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "woo-order-stock-check-"));
const compile = (rel, out) => { fs.writeFileSync(path.join(tmp, out), ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText); return import(pathToFileURL(path.join(tmp, out)).href); };

const source = read("lib/studioflow/wooOrderStockRules.ts");
ok("rules module exists and imports nothing", Boolean(source) && !/^import /m.test(source));
if (!source) { console.log(`check-woo-order-stock: 0/${checks} FAILED (lib/studioflow/wooOrderStockRules.ts missing)`); process.exit(1); }
const R = await compile("lib/studioflow/wooOrderStockRules.ts", "rules.mjs");

// ---- 1. rules
const card = { id: "woo-1", number: "INV-00007", name: "Vintage Ronald McDonald Watch 1976", trackingType: "unique", status: "reserved", unitCost: 99 };
const line = (extra) => ({ lineId: "11", title: "Vintage Ronald McDonald Watch 1976", sku: "TT-VINRO76-01", quantity: 1, refundedQty: 0, state: "reserved", reservedQty: 1, soldQty: 0, returnedQty: 0, blocked: null, needsReturnDecision: false, attention: "", card, secret: "x", ...extra });
const view = R.wooOrderStockViewOf({ ok: true, enabled: true, preview: false, canEdit: true, canReturn: true, orderNumber: "1001", storeName: "TickToon", wooStatus: "processing", attention: [], money: 5, lines: [line({}), { title: "no id" }] });
expect("only lines with an id", view.lines.length, 1);
ok("nothing the screen does not print (no cost, no extra keys)", !("unitCost" in view.lines[0].card) && !("secret" in view.lines[0]) && !("money" in view));
const say = (extra) => { const w = R.wooStockLineSentence(R.wooOrderStockViewOf({ lines: [line(extra)] }).lines[0]); return R.fillWooStock(w.sentence, w.values); };
expect("paid → reserved", say({}), "Reserved INV-00007 for this order");
expect("completed / dispatched → took", say({ state: "sold", reservedQty: 0, soldQty: 1 }), "Took INV-00007 from stock");
expect("cancelled before it left → restored", say({ state: "released", reservedQty: 0 }), "Restored — INV-00007 is back on the shelf");
expect("oversold", say({ state: "none", reservedQty: 0, blocked: { reason: "held_by_another_order", atMs: 1 }, attention: "oversold" }), "Oversold — INV-00007 is already reserved or sold for another order. Check.");
expect("refunded after dispatch", say({ state: "sold_then_cancelled", reservedQty: 0, soldQty: 1, needsReturnDecision: true, attention: "returned_after_dispatch" }), "Refunded after dispatch — did INV-00007 come back?");
expect("before the link", say({ state: "before_link", reservedQty: 0 }), "Ordered before INV-00007 was linked — stock not touched");
expect("returned", say({ state: "returned", reservedQty: 0, soldQty: 1, returnedQty: 1 }), "Returned — INV-00007 is back in stock");
const acts = (v, extra) => R.wooStockLineActions(R.wooOrderStockViewOf({ ...v, lines: [line(extra)] }), R.wooOrderStockViewOf({ lines: [line(extra)] }).lines[0]);
expect("reserved line: no act", acts({ canEdit: true, canReturn: true }, {}), { reserve: false, returned: false });
expect("before the link: Reserve stock (editor)", acts({ canEdit: true }, { state: "before_link", reservedQty: 0 }), { reserve: true, returned: false });
expect("before the link: nothing without canEdit", acts({ canEdit: false }, { state: "before_link", reservedQty: 0 }), { reserve: false, returned: false });
expect("oversold: Reserve stock (try again)", acts({ canEdit: true }, { state: "none", reservedQty: 0, blocked: { reason: "held_by_another_order", atMs: 1 } }).reserve, true);
expect("refunded after dispatch: Return to stock for owner/admin only", [acts({ canEdit: true, canReturn: true }, { state: "sold_then_cancelled", reservedQty: 0, soldQty: 1, needsReturnDecision: true }).returned, acts({ canEdit: true, canReturn: false }, { state: "sold_then_cancelled", reservedQty: 0, soldQty: 1, needsReturnDecision: true }).returned], [true, false]);
expect("sold, not refunded: no Return to stock", acts({ canEdit: true, canReturn: true }, { state: "sold", reservedQty: 0, soldQty: 1 }).returned, false);
const flags = R.wooCardAttentionOf({ wooStockAttention: { woo_a: { reason: "oversold", orderNumber: "1011", storeName: "TickToon", atMs: 2 }, woo_b: { reason: "returned_after_dispatch", orderNumber: "1001", atMs: 3 }, woo_c: {} } });
expect("card flags newest first, empty ones dropped", flags.map((f) => [f.orderId, f.reason, f.orderNumber]), [["woo_b", "returned_after_dispatch", "1001"], ["woo_a", "oversold", "1011"]]);
expect("card flag sentence", R.fillWooStock(R.wooCardAttentionSentence("oversold"), { order: "1011" }), "Oversold on WooCommerce order #1011 — needs attention");
expect("no flags on a plain card", R.wooCardAttentionOf({}).length, 0);

// ---- 2. every printed sentence in every app language
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const printed = new Set();
for (const s of [...source.matchAll(/sentence: "([^"]+)"/g)].map((m) => m[1])) printed.add(s);
for (const s of [...source.matchAll(/return "([^"]+)";/g)].map((m) => m[1])) printed.add(s);
const comp = read("app/orders/WooOrderStock.tsx");
for (const s of [...comp.matchAll(/\bt\("([^"]+)"\)/g)].map((m) => m[1])) printed.add(s);
for (const s of printed) for (const lang of LANGS) ok(`"${s}" in ${lang}`, Boolean(R.wooOrderStockText(s, lang)));
for (const [s, row] of Object.entries(R.WOO_ORDER_STOCK_TEXT)) {
  const holes = (s.match(/\{\w+\}/g) || []).sort().join();
  for (const lang of LANGS) ok(`"${s}" ${lang} keeps its {placeholders}`, ((row[lang] || "").match(/\{\w+\}/g) || []).sort().join() === holes);
}

// ---- 3. wiring
const page = read("app/orders/OrderDetailContent.tsx");
ok("order page imports and mounts WooOrderStock after EbayOrderStock", /import \{ WooOrderStock \} from "\.\/WooOrderStock";/.test(page) && page.indexOf("<WooOrderStock ") > page.indexOf("<EbayOrderStock "));
const block = read("app/orders/WooOrderStock.tsx");
ok("block draws nothing unless the server says enabled and there are lines", /!view\.enabled \|\| view\.lines\.length === 0\) return null/.test(block));
ok("block draws nothing when the first load fails (functions not deployed)", /else setAbsent\(true\)/.test(block));
const calls = read("lib/studioflow/wooOrderStock.ts");
expect("only the two MC-4 callables", [...calls.matchAll(/call<[^>]*>\(\s*"(\w+)"\)|"(\w+)"\)\(\{ companyId/g)].map((m) => m[1] || m[2]).sort(), ["getWooOrderStock", "updateWooOrderStock"]);
ok("card panel shows the flag", /data-testid="woo-stock-attention"/.test(read("app/inventory/ItemDetailPanel.tsx")));

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.log(failures.slice(0, 30).join("\n")); console.log(`check-woo-order-stock: ${checks - failures.length}/${checks} FAILED`); process.exit(1); }
console.log(`check-woo-order-stock: ${checks}/${checks} ok`);

// envanter-test (owner, 8 Nov 2026): one TickToon watch was brought into Inventory on the live site and the gaps
// found on the way are closed here. What this proves:
//
// 1. "How do I…?" no longer sits on a page's own button. lib/studioflow/appHelpClearance.ts is compiled and run:
//    helpLiftFor rises above a pinned control under the bubble (and above a second one stacked over it), stays at 0
//    when nothing pinned is under it, never passes the cap. The bubble component uses the hook on both of its forms,
//    the hook only counts sticky/fixed controls and skips the help parts, and the CSS moves bubble + panel by
//    --app-help-lift and puts the bubble under an open dialog's backdrop.
// 2. A new item saved with a cost AND a photo keeps its cost: the photo save after the upload sends the same cost
//    fields as the first save (it used to send the draft's 0). Played through the server's merge rule below.
// 3. A website (WooCommerce) card's panel has an "On your website" box like eBay's: the link rows are parsed (price
//    only when the server sent one), the product page opens only on the store's own https host, the box is mounted
//    for cards whose channelLinks name "woocommerce", and every new sentence exists in all eleven other languages.
// 4. The item form has a Description box and a SKU box for one-off items.
// 5. A section change in the left list brings the section's top into view.
// 6. "Add what you paid" after an import (WooCommerce and eBay) opens the new card's edit form, only for people who
//    may see and change the cost.
//
//   node scripts/check-envanter-test.mjs
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "envanter-test-check-"));
const transpile = (src) => ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];

// ---- 1. the help bubble ---------------------------------------------------------------------------------------
const clearanceSrc = read("lib/studioflow/appHelpClearance.ts");
ok("lib/studioflow/appHelpClearance.ts exists", Boolean(clearanceSrc));
let C = null;
if (clearanceSrc) {
  // The hook needs React; the arithmetic does not. A stub stands in for "react" so the module loads in node.
  fs.writeFileSync(path.join(tmp, "react.mjs"), "export function useEffect() {}\n");
  fs.writeFileSync(path.join(tmp, "appHelpClearance.mjs"), transpile(clearanceSrc).replace(/from "react"/g, 'from "./react.mjs"'));
  C = await import(pathToFileURL(path.join(tmp, "appHelpClearance.mjs")).href);
}
if (C) {
  // The live page, 1728×912: the bubble at x 1568–1708, y 849–892; "Bring in selected" at x 1552–1712, y 849–889.
  const home = { left: 1568, right: 1708, top: 849, bottom: 892 };
  const bringIn = { left: 1552, right: 1712, top: 849, bottom: 889 };
  const probe = (controls) => (box) => controls.filter((c) => c.bottom > box.top && c.top < box.bottom && c.right > box.left && c.left < box.right);
  expect("nothing pinned under the bubble: no rise", C.helpLiftFor(home, probe([])), 0);
  const lift = C.helpLiftFor(home, probe([bringIn]));
  expect("over 'Bring in selected': rises to its top minus the gap", lift, 892 - 849 + C.HELP_CLEARANCE_GAP);
  ok("after the rise the bubble no longer overlaps the button", home.bottom - lift <= bringIn.top);
  const bar2 = { left: 1500, right: 1712, top: 800, bottom: 840 };
  const lift2 = C.helpLiftFor(home, probe([bringIn, bar2]));
  ok("a second pinned bar above the first: the bubble clears both", home.bottom - lift2 <= bar2.top && lift2 > lift);
  expect("a pinned control to the left of the bubble does not move it", C.helpLiftFor(home, probe([{ left: 1200, right: 1500, top: 849, bottom: 889 }])), 0);
  const tall = { left: 1500, right: 1712, top: 300, bottom: 900 };
  expect("never higher than the cap", C.helpLiftFor(home, probe([tall])), C.HELP_LIFT_MAX);
}
ok("the hook counts only sticky/fixed controls", /position === "sticky" \|\| position === "fixed"/.test(clearanceSrc));
ok("the hook skips the help bubble and panel", /HELP_PARTS = "\.app-help-bubble, \.app-help-panel"/.test(clearanceSrc) && /!element\.closest\(HELP_PARTS\)/.test(clearanceSrc));
ok("the hook writes --app-help-lift and data-help-under-modal", /--app-help-lift/.test(clearanceSrc) && /data-help-under-modal/.test(clearanceSrc));
ok("the hook re-measures on scroll (capture), resize and DOM changes", /addEventListener\("scroll", schedule, true\)/.test(clearanceSrc) && /addEventListener\("resize", schedule\)/.test(clearanceSrc) && /new MutationObserver\(schedule\)/.test(clearanceSrc));
const helpSrc = read("components/AppHelpAssistant.tsx");
ok("AppHelpAssistant uses useAppHelpClearance", /import \{ useAppHelpClearance \} from "@\/lib\/studioflow\/appHelpClearance"/.test(helpSrc) && /useAppHelpClearance\(bubbleRef, available \|\| paused\)/.test(helpSrc));
expect("both bubble forms (normal and paused) carry the ref", (helpSrc.match(/ref=\{bubbleRef\}/g) || []).length, 2);
ok("the hook runs before the early return (hooks order)", helpSrc.indexOf("useAppHelpClearance(bubbleRef") > -1 && helpSrc.indexOf("useAppHelpClearance(bubbleRef") < helpSrc.indexOf("if (!available && !paused) return null;"));
const css = read("app/globals.css");
ok("CSS: the bubble moves by --app-help-lift", /\.app-help-bubble \{ transform: translateY\(calc\(-1 \* var\(--app-help-lift, 0px\)\)\)/.test(css));
ok("CSS: the panel opens above the risen bubble (desktop and phone)", /\.app-help-panel \{ bottom: calc\(74px \+ var\(--app-help-lift, 0px\)\); \}/.test(css) && /\.app-help-panel \{ bottom: calc\(130px \+ var\(--app-help-lift, 0px\)\); \}/.test(css));
const underModal = css.match(/:root\[data-help-under-modal\] \.app-help-bubble \{ z-index: (\d+); \}/);
const backdrop = css.match(/\.modal-backdrop \{[^}]*z-index: (\d+);/);
ok("CSS: under an open dialog the bubble sits below the backdrop", Boolean(underModal && backdrop && Number(underModal[1]) < Number(backdrop[1])));
ok("CSS rules live in app/globals.css, not the stale root copy", !/app-help-lift/.test(read("globals.css")));

// ---- 2. cost + photo ------------------------------------------------------------------------------------------
const contentSrc = read("app/inventory/InventoryContent.tsx");
const submit = contentSrc.slice(contentSrc.indexOf("async function submit()"), contentSrc.indexOf("await onSaved();", contentSrc.indexOf("async function submit()")));
const photoSave = submit.slice(submit.indexOf("uploaded.push"));
ok("the photo save after the upload sends the cost fields", /\{ \.\.\.draft, \.\.\.costFields, photos: \[\.\.\.\(draft\.photos \?\? \[\]\), \.\.\.uploaded\] \}/.test(photoSave));
// The server rebuilds the card from what is sent over what it has (inventory.js inputOverExisting: a sent value
// wins), so the second save's purchasePrice is what the card keeps. Played with the form's own cost helper:
const costSrc = read("lib/studioflow/inventoryCost.ts");
fs.writeFileSync(path.join(tmp, "inventoryCost.mjs"), transpile(costSrc));
const Cost = await import(pathToFileURL(path.join(tmp, "inventoryCost.mjs")).href);
const merge = (existing, input) => { const out = { ...existing }; for (const [k, v] of Object.entries(input)) if (v !== undefined) out[k] = v; return out; };
const draft = { name: "Watch", purchasePrice: 0, photos: [] };               // emptyDraft: the cost box keeps its own text
const costFields = Cost.inventoryCostSaveFields("100", null);
const first = merge({}, { ...draft, ...costFields });
const fixed = merge(first, { ...draft, ...costFields, photos: ["p/1.jpg"] });
const old = merge(first, { ...draft, photos: ["p/1.jpg"] });
expect("a new card with a typed £100 and a photo keeps £100", fixed.purchasePrice, 100);
expect("(negative proof: the old photo save left £0)", old.purchasePrice, 0);

// ---- 3. "On your website" box ---------------------------------------------------------------------------------
const rulesSrc = read("lib/studioflow/wooInventoryRules.ts");
fs.writeFileSync(path.join(tmp, "wooInventoryRules.mjs"), transpile(rulesSrc));
const W = await import(pathToFileURL(path.join(tmp, "wooInventoryRules.mjs")).href);
ok("wooLinkViews and storeProductUrl exist", typeof W.wooLinkViews === "function" && typeof W.storeProductUrl === "function");
if (typeof W.wooLinkViews === "function") {
  const rows = W.wooLinkViews([
    { linkId: "s0123456789__p151__v0", connectionId: "c1", productId: "151", variationId: "0", sku: "TT-BRAMI72-01", title: "Bradley", listedQuantity: 1, stockTracked: true, price: { value: "170.00", currency: "GBP" }, permalink: "https://ticktoon.co.uk/product/x/", seenAtMs: 5 },
    { linkId: "s0123456789__p152__v0", productId: "152", price: null, listedQuantity: "3" },
    { title: "no id" }
  ]);
  expect("rows without a link id are dropped", rows.length, 2);
  expect("price kept when the server sent it", rows[0].price, { value: "170.00", currency: "GBP" });
  expect("no price for someone without Financial Info", rows[1].price, null);
  expect("a non-integer store count is not a count", rows[1].listedQuantity, null);
  expect("stock tracking", [rows[0].stockTracked, rows[1].stockTracked], [true, false]);
  expect("not an array: no rows", W.wooLinkViews(null), []);
}
if (typeof W.storeProductUrl === "function") {
  expect("product page on the store's host", W.storeProductUrl("https://ticktoon.co.uk/product/x/", "ticktoon.co.uk"), "https://ticktoon.co.uk/product/x/");
  expect("www on either side", W.storeProductUrl("https://www.ticktoon.co.uk/p/", "ticktoon.co.uk"), "https://www.ticktoon.co.uk/p/");
  expect("plain http is refused", W.storeProductUrl("http://ticktoon.co.uk/p/", "ticktoon.co.uk"), "");
  expect("another host is refused", W.storeProductUrl("https://evil.example/p/", "ticktoon.co.uk"), "");
  expect("a look-alike host is refused", W.storeProductUrl("https://ticktoon.co.uk.evil.example/p/", "ticktoon.co.uk"), "");
  expect("javascript: is refused", W.storeProductUrl("javascript:alert(1)", "ticktoon.co.uk"), "");
  expect("no store host: nothing", W.storeProductUrl("https://ticktoon.co.uk/p/", ""), "");
}
const boxSrc = read("app/inventory/WooItemLinks.tsx");
ok("WooItemLinks exists and draws only for a card linked to a website product", /l\.provider === "woocommerce"/.test(boxSrc) && /if \(!linkedOnCard\) return null;/.test(boxSrc));
ok("WooItemLinks reads one card's links and changes them through the server", /getWooProductLinks\(workspace\.id, \{ inventoryItemId: item\.id \}\)/.test(boxSrc) && /changeWooProductLink\(workspace\.id, linkId, to\)/.test(boxSrc));
ok("WooItemLinks shows the price only when the server says money", /money && link\.price \?/.test(boxSrc));
ok("WooItemLinks opens the product page only through storeProductUrl", /storeProductUrl\(link\.permalink, host\)/.test(boxSrc) && /rel="noopener noreferrer"/.test(boxSrc));
ok("the client call changeWooProductLink exists", /export async function changeWooProductLink\(companyId: string, linkId: string, inventoryItemId: string\)/.test(read("lib/studioflow/wooInventory.ts")));
const panelSrc = read("app/inventory/ItemDetailPanel.tsx");
ok("the item panel mounts WooItemLinks next to EbayItemLinks", /import \{ WooItemLinks \} from "\.\/WooItemLinks";/.test(panelSrc) && /<EbayItemLinks [^\n]*\/>[\s\S]{0,200}<WooItemLinks workspace=\{workspace\} item=\{item\}/.test(panelSrc));
// Every sentence the box prints resolves in all eleven languages (Woo table, then eBay's, as wooInventoryT does).
const ebaySrc = read("lib/studioflow/ebayInventoryRules.ts");
fs.writeFileSync(path.join(tmp, "ebayInventoryRules.mjs"), transpile(ebaySrc));
const E = await import(pathToFileURL(path.join(tmp, "ebayInventoryRules.mjs")).href);
const say = (s, lang) => W.wooInventoryText(s, lang) || (typeof E.ebayInventoryText === "function" ? E.ebayInventoryText(s, lang) : "");
const sentences = [...new Set([...boxSrc.matchAll(/\bt\("((?:[^"\\]|\\.)+)"\)/g)].map((m) => m[1]))];
ok("the box has sentences", sentences.length >= 12);
for (const s of sentences) for (const lang of LANGS) {
  const out = say(s, lang);
  ok(`"${s}" in ${lang}`, Boolean(out));
  for (const ph of s.match(/\{[a-z]+\}/g) || []) ok(`"${s}" in ${lang} keeps ${ph}`, out.includes(ph));
}
for (const lang of LANGS) ok(`"Add what you paid" in ${lang}`, Boolean(W.wooInventoryText("Add what you paid", lang)));

// ---- 4. the item form -----------------------------------------------------------------------------------------
const modal = contentSrc.slice(contentSrc.indexOf("function NewItemModal"));
ok("the form has a Description box bound to draft.description", /<span>\{t\("Description"\)\}<\/span>[\s\S]{0,400}value=\{draft\.description \?\? ""\}/.test(modal));
const uniqueBranch = modal.slice(modal.indexOf("{isUnique ? ("), modal.indexOf(") : (", modal.indexOf("{isUnique ? (")));
ok("a one-off item has a SKU box", /<span>\{t\("SKU"\)\}<\/span>[\s\S]{0,200}value=\{draft\.sku \?\? ""\}/.test(uniqueBranch));

// ---- 5. section change ----------------------------------------------------------------------------------------
ok("the main column has a ref and a section change scrolls it into view", /className="inventory-main" ref=\{inventoryMainRef\}/.test(contentSrc) && /getBoundingClientRect\(\)\.top < 0\) main\.scrollIntoView\(\{ block: "start" \}\)/.test(contentSrc) && /\}, \[sectionKey\]\);/.test(contentSrc));

// ---- 6. "Add what you paid" -----------------------------------------------------------------------------------
const wooPanel = read("app/inventory/WooProductsPanel.tsx");
const ebayPanel = read("app/inventory/EbayListingsPanel.tsx");
ok("WooCommerce products: a created card offers 'Add what you paid'", /done\.result === "created" && done\.inventoryItemId && onEditCard \?[\s\S]{0,200}t\("Add what you paid"\)/.test(wooPanel));
ok("eBay listings: a created card offers 'Add what you paid'", /done\.result === "created" && done\.inventoryItemId && onEditCard \?[\s\S]{0,220}wooInventoryT\("Add what you paid", language\)/.test(ebayPanel));
expect("both panels get onEditCard only for people who may edit and see the cost", (contentSrc.match(/onEditCard=\{canEdit && canSeeCost \? editCardById : undefined\}/g) || []).length, 2);
ok("editCardById opens the edit form (or the card when not loaded yet)", /function editCardById\(itemId: string\) \{\s*const card = items\.find\(row => row\.id === itemId\);\s*if \(card\) setEditing\(card\);\s*else openCard\(itemId\);/.test(contentSrc));

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`envanter-test: ${failures.length} of ${checks} checks failed`);
  for (const f of failures.slice(0, 60)) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`envanter-test: ${checks}/${checks} checks passed`);

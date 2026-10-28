// WooCommerce products → Inventory on the web (MC-3, 22 Oct 2026).
//
// 1. lib/studioflow/wooInventoryRules.ts, compiled with the tree's own TypeScript and run: a Preview row reaches the
//    screen with its own fields only (a picture only from the store's own host or WordPress's CDN); nothing is chosen
//    for the person (only a single SKU match starts as "link"; no count is ever prefilled); a counted card needs the
//    person's own opening count (0 allowed, "2,5" is 2.5) and the store's stock figure is never a default; a one-off
//    card needs "this item is here"; an ambiguous row needs the person's confirmation; sold-out/archived rows sit in
//    their own list and carry includeInactive only when sent from it.
// 2. Every sentence the panel prints resolves in every app language (this feature's table, or E4's shared one).
// 3. The panel is mounted in Inventory, gated on the server's answer, and calls only the read/import callables.
//
//   node scripts/check-woo-inventory.mjs
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "woo-inventory-check-"));
const compile = (rel, out) => { fs.writeFileSync(path.join(tmp, out), ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText); return import(pathToFileURL(path.join(tmp, out)).href); };

const source = read("lib/studioflow/wooInventoryRules.ts");
ok("lib/studioflow/wooInventoryRules.ts exists", Boolean(source));
ok("the rules module imports nothing (so it can run here)", !/^import /m.test(source));
const R = await compile("lib/studioflow/wooInventoryRules.ts", "rules.mjs");
const E = await compile("lib/studioflow/ebayInventoryRules.ts", "ebay.mjs");

// ---- 1. rules
const K = "s0123456789";
const answer = { host: "shop.example.com", rows: [
  { linkId: `${K}__p501__v0`, productId: "501", variationId: "0", title: "Seiko 6139", sku: "TT-501", listedQuantity: 1, stockTracked: true, lifecycle: "active", price: { value: "450.00", currency: "gbp" },
    imageUrl: "https://shop.example.com/wp-content/uploads/501.jpg", state: "sku_match", candidates: [{ id: "A", number: "INV-00001", name: "Seiko", sku: "TT-501", status: "available", trackingType: "unique", reason: "sku" }],
    proposed: { name: "Seiko 6139", trackingType: "unique" }, openingCount: 7, costPrice: "99", purchasePrice: 99 },
  { linkId: `${K}__p501__v0`, title: "duplicate" },
  { linkId: "not-a-link", title: "bad id" },
  { linkId: `${K}__p502__v601`, productId: "502", variationId: "601", hasVariations: true, title: "Strap", variationName: "Black", sku: "S-B", listedQuantity: 7, stockTracked: true, lifecycle: "active", state: "no_match",
    imageUrl: "https://evil.example.net/x.jpg", proposed: { name: "Strap — Black", trackingType: "quantity" } },
  { linkId: `${K}__p503__v0`, productId: "503", variationId: "0", title: "Roll", sku: "R", listedQuantity: null, stockTracked: false, lifecycle: "active", state: "ambiguous", ambiguity: "sku_on_several_products",
    imageUrl: "https://i1.wp.com/shop.example.com/r.jpg", proposed: { name: "Roll", trackingType: "" } },
  { linkId: `${K}__p504__v0`, productId: "504", variationId: "0", title: "Sold watch", sku: "SW", listedQuantity: 0, stockTracked: true, lifecycle: "sold", state: "no_match", proposed: { name: "Sold watch", trackingType: "unique" } },
  { linkId: `${K}__p508__v0`, productId: "508", variationId: "0", title: "Group", state: "not_stock", lifecycle: "active", proposed: {} }
] };
const rows = R.productRowsOf(answer);
expect("one row per link id, bad ids dropped", rows.map((r) => r.linkId), [`${K}__p501__v0`, `${K}__p502__v601`, `${K}__p503__v0`, `${K}__p504__v0`, `${K}__p508__v0`]);
ok("no cost / opening count field reaches the screen", !("costPrice" in rows[0]) && !("purchasePrice" in rows[0]) && !("openingCount" in rows[0]));
expect("currency upper-cased", rows[0].price, { value: "450.00", currency: "GBP" });
expect("store-host picture kept", rows[0].imageUrl, "https://shop.example.com/wp-content/uploads/501.jpg");
expect("foreign picture dropped", rows[1].imageUrl, "");
expect("WordPress CDN picture kept", rows[2].imageUrl, "https://i1.wp.com/shop.example.com/r.jpg");
expect("http picture dropped", R.safeImageUrl("http://shop.example.com/a.jpg", "shop.example.com"), "");
expect("lookalike host dropped", R.safeImageUrl("https://shop.example.com.evil.net/a.jpg", "shop.example.com"), "");
const [seiko, strap, roll, sold, group] = rows;
expect("single SKU match starts as link to it", R.startingDecision(seiko).action + "/" + R.startingDecision(seiko).inventoryItemId, "link/A");
expect("no other row starts with an action", [strap, roll, sold].map((r) => R.startingDecision(r).action), ["", "", ""]);
expect("no count is ever prefilled", [seiko, strap, roll, sold].map((r) => R.startingDecision(r).openingCount), ["", "", "", ""]);
ok("a grouped product cannot be chosen; a linked one cannot either", !R.canChoose(group) && !R.canChoose({ ...seiko, state: "linked" }));
// 27 Oct 2026 (inventory fixes): a new card needs its category — the decisions below carry one; check-inventory-fixes.mjs
// checks the missing-category case and the preselection.
const D = (patch) => ({ action: "create", inventoryItemId: "", trackingType: "quantity", openingCount: "", inHand: false, confirmAmbiguous: false, category: "Watches", ...patch });
expect("a new card without a category → category_required (asked after the count)", R.decisionProblem(strap, D({ openingCount: "2", category: "" })), "category_required");
expect("counted card without a count → count_required (the store's 7 is not a default)", R.decisionProblem(strap, D({})), "count_required");
expect("0 is allowed", R.decisionProblem(strap, D({ openingCount: "0" })), "");
expect("negative refused", R.decisionProblem(strap, D({ openingCount: "-1" })), "count_invalid");
expect("one-off without 'here' → count_required", R.decisionProblem(seiko, D({ trackingType: "unique" })), "count_required");
expect("one-off with 'here' ok", R.decisionProblem(seiko, D({ trackingType: "unique", inHand: true })), "");
expect("a variation is not a one-off", R.decisionProblem(strap, D({ trackingType: "unique", inHand: true })), "one_off_card_for_variation");
expect("no tracking type chosen", R.decisionProblem(roll, D({ trackingType: "", confirmAmbiguous: true })), "tracking_type_required");
expect("ambiguous needs confirmation", R.decisionProblem(roll, D({ openingCount: "2" })), "ambiguous_needs_decision");
expect("ambiguous confirmed ok", R.decisionProblem(roll, D({ openingCount: "2", confirmAmbiguous: true })), "");
const sent = R.decisionsToSend(rows, [strap.linkId, roll.linkId, sold.linkId, group.linkId], {
  [strap.linkId]: D({ openingCount: "2,5" }), [roll.linkId]: D({ openingCount: "1", confirmAmbiguous: true }), [sold.linkId]: D({ openingCount: "0" }), [group.linkId]: D({ openingCount: "1" })
});
expect("what is sent", sent, [
  { linkId: strap.linkId, action: "create", trackingType: "quantity", openingCount: 2.5, category: "Watches" },
  { linkId: roll.linkId, action: "create", trackingType: "quantity", openingCount: 1, category: "Watches", confirmAmbiguous: true },
  { linkId: sold.linkId, action: "create", trackingType: "quantity", openingCount: 0, category: "Watches", includeInactive: true }
]);
expect("the default tab is what is for sale; sold/archived apart", [R.filterRows(rows, "active").length, R.filterRows(rows, "inactive").map((r) => r.productId)], [4, ["504"]]);
// 27 Oct: the header's "{rows} to match" = Needs a choice + Same SKU (native 2.3 wooRowsToMatch parity). Linked rows,
// sold/archived rows and not-stock (grouped/external) rows are not counted, so linking one lowers the number.
const toMatch = (list) => (typeof R.rowsToMatch === "function" ? R.rowsToMatch(list) : "missing rowsToMatch");
expect("rows to match = needs a choice + same SKU (sold and not-stock left out)", toMatch(rows), 3);
expect("linking a row lowers the number", toMatch(rows.map((r, i) => (i === 0 ? { ...r, state: "linked" } : r))), 2);
expect("every row linked → 0 to match", toMatch(rows.map((r) => ({ ...r, state: "linked" }))), 0);
expect("no rows → 0 to match", toMatch([]), 0);
expect("store stock sentence: untracked", R.storeStockSentence(roll).sentence, "Stock not tracked in the store");
expect("store stock sentence: parent", R.storeStockSentence({ ...strap, stockTracked: "parent", listedQuantity: null }).sentence, "Stock is tracked on the parent product");
expect("unknown reason → the general sentence", R.reasonSentence("raw_code_x"), "This could not be done.");

// ---- 2. sentences in every language
const panel = read("app/inventory/WooProductsPanel.tsx");
const used = new Set();
for (const m of panel.matchAll(/\bt\("([^"]+)"\)/g)) used.add(m[1]);
for (const m of source.matchAll(/return "([^"]+)";/g)) used.add(m[1]);
for (const m of source.matchAll(/sentence: "([^"]+)"/g)) used.add(m[1]);
for (const m of source.matchAll(/^\s+[a-z_]+: "([^"]+)",?$/gm)) used.add(m[1]);
for (const [, label] of panel.matchAll(/\["[a-z_]+", "([^"]+)"\]/g)) used.add(label);
used.add("Sold out in the store"); used.add("Archived in the store");
const line = read("app/settings/WooInventoryLine.tsx");
for (const m of line.matchAll(/\bt\("([^"]+)"\)/g)) used.add(m[1]);
for (const word of [...used]) if (/^[a-z_]+$/.test(word)) used.delete(word);   // reason codes, not sentences
const content = read("app/inventory/InventoryContent.tsx");
ok("panel sentences found", used.size > 40);
for (const sentence of used) {
  for (const language of R.WOO_INVENTORY_LANGUAGES) {
    const got = R.wooInventoryText(sentence, language) || E.ebayInventoryText(sentence, language);
    checks += 1;
    if (!got) { failures.push(`no ${language} for: ${sentence}`); continue; }
    const want = (sentence.match(/\{\w+\}/g) || []).sort().join(",");
    if ((got.match(/\{\w+\}/g) || []).sort().join(",") !== want) failures.push(`placeholders differ (${language}): ${sentence}`);
  }
}

// ---- 3. wiring
ok("Inventory mounts the panel", /<WooProductsPanel\b/.test(content) && /from "\.\/WooProductsPanel"/.test(content));
ok("the nav entry is gated on the server's answer", /getWooProductLinks\(workspace\.id\)\.then\(\(answer\) => \{ if \(!cancelled\) setWooProductsOn\(answer\.enabled === true\)/.test(content));
ok("?panel=woo opens it", /get\("panel"\) === "woo"\) setTab\("woo"\)/.test(content));
const client = read("lib/studioflow/wooInventory.ts");
const callables = [...client.matchAll(/\("([A-Za-z]+)"\)\(/g)].map((m) => m[1]).sort();
expect("only the read/import callables are called", callables, ["getWooProductLinks", "importWooProducts", "previewWooProducts"]);
// 25 Oct fix: one store's list at a time, and a way in from Settings ▸ WooCommerce.
ok("changing the store empties the list, ticks and decisions", /onChange=\{\(event\) => chooseStore\(event\.target\.value\)\}/.test(panel) && /storeRef\.current = next;\s*setConnectionId\(next\);\s*setAnswer\(null\);[^\n]*setChosen\(\[\]\); setDecisions\(\{\}\)/.test(panel));
ok("a read that answers after the store changed is dropped", (panel.match(/if \(storeRef\.current !== forStore\) return;/g) || []).length === 2);
ok("import goes to the store the list was read from", /importWooProducts\(companyId, answerStore, toSend\)/.test(panel) && /answerStore && answerStore === connectionId \?/.test(panel));
ok("?store= preselects that store", /get\("store"\)/.test(panel));
const section = read("app/settings/WooCommerceIntegrationSection.tsx");
ok("Settings ▸ WooCommerce shows the products line for a connected store", /<WooInventoryLine companyId=\{companyId\} connectionId=\{connection\.id\}/.test(section) && /from "\.\/WooInventoryLine"/.test(section));
ok("the line opens Inventory ▸ WooCommerce products for that store, gated on the server's answer", /href=\{`\/inventory\?panel=woo&store=\$\{encodeURIComponent\(connectionId\)\}`\}/.test(line) && /if \(!answer \|\| !answer\.enabled\) return null;/.test(line));
const detail = read("app/inventory/ItemDetailPanel.tsx");
// MC-3 cost (25 Oct): the card reads the shared three-way rule (scripts/check-inventory-cost.mjs runs it).
ok("a WooCommerce card without a cost says 'not entered', not £0.00", /inventoryCostKind\(item\) === "notEntered"/.test(detail) && /wooInventoryT\("Cost: not entered — the store's price/.test(detail));
ok("the header counts the rows still to match, not every row read", /rows: rowsToMatch\(rows\)/.test(panel) && !/rows: rows\.length/.test(panel));
ok("prices only when the server says money", /money && row\.price/.test(panel) && /status\?\.money === true/.test(panel));

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.log(`check-woo-inventory: ${failures.length} failing of ${checks}`); for (const f of failures) console.log(" ✗", f); process.exit(1); }
console.log(`check-woo-inventory: ${checks}/${checks} ✓`);

// Inventory fixes (27 Oct 2026) on the web — what the owner saw on the first real WooCommerce import, and the list.
//
// 1. WooCommerce import (lib/studioflow/wooInventoryRules.ts, compiled with the tree's TypeScript and run):
//    the store's categories reach the row; a new card's category is preselected (the server's proposal when it is
//    offered, else the same rule as the server: same name → every word of a title → the default → none) and a create
//    with no category is not sent; right after an import the row IS linked ("Linked → INV-xxxxx"), cannot be ticked
//    again and leaves "to match"; the import row's category/photo answers are read.
// 2. The item list's pictures (lib/studioflow/inventoryThumbs.ts): the first stored photo path, else the category's own
//    icon — and the list renders a lazy thumbnail in every row.
// 3. Categories (lib/studioflow/inventoryCategoryTemplates.ts): a trade's starting set only ADDS (never renames,
//    deletes or duplicates), hides only unused watch-workshop rows on request, never hides "Other"; the sidebar names
//    "Manage categories"; a new item no longer starts in a hard-coded "Watches".
// 4. Every new sentence in every app language, placeholders intact.
//
//   node scripts/check-inventory-fixes.mjs
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "inventory-fixes-check-"));
const compile = async (rel, out) => {
  const src = read(rel);
  if (!src) return {};
  fs.writeFileSync(path.join(tmp, out), ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText);
  return import(pathToFileURL(path.join(tmp, out)).href);
};
const fn = (mod, name) => (typeof mod[name] === "function" ? mod[name] : () => "(missing " + name + ")");

const R = await compile("lib/studioflow/wooInventoryRules.ts", "rules.mjs");
const T = await compile("lib/studioflow/inventoryThumbs.ts", "thumbs.mjs");
const C = await compile("lib/studioflow/inventoryCategoryTemplates.ts", "templates.mjs");
const X = await compile("lib/studioflow/inventoryListText.ts", "text.mjs");
const SEED = ["Watches", "Dials", "Movements", "Bracelets", "Straps", "Parts", "Consumables", "Packaging", "Tools", "Other"];

// ---- 1. WooCommerce import ------------------------------------------------------------------------------------------
const K = "sc243557da7";
const answer = { host: "ticktoon.co.uk", rows: [
  { linkId: `${K}__p181__v0`, productId: "181", variationId: "0", title: "Vintage Ronald McDonald Watch 1976", sku: "TT-VINRO76-01", listedQuantity: 1, stockTracked: true, lifecycle: "active", state: "no_match",
    imageUrl: "https://ticktoon.co.uk/wp-content/uploads/2025/12/38.webp", categories: ["Character Watches"], proposed: { name: "Vintage Ronald McDonald Watch 1976", trackingType: "unique", category: "Watches", categoryBasis: "word", categoryFrom: "Character Watches" } },
  { linkId: `${K}__p182__v0`, productId: "182", variationId: "0", title: "Snoopy 1958", sku: "TT-2", listedQuantity: 1, stockTracked: true, lifecycle: "active", state: "no_match",
    categories: ["Snoopy Watches"], proposed: { name: "Snoopy 1958", trackingType: "unique" } },                       // an older server: no proposal
  { linkId: `${K}__p183__v0`, productId: "183", variationId: "0", title: "Gift card", sku: "G", listedQuantity: null, stockTracked: false, lifecycle: "active", state: "no_match",
    categories: ["Uncategorized"], proposed: { name: "Gift card", trackingType: "" } },
  { linkId: `${K}__p184__v0`, productId: "184", variationId: "0", title: "Omega", sku: "TT-4", listedQuantity: 1, stockTracked: true, lifecycle: "active", state: "sku_match",
    candidates: [{ id: "card-omega", number: "INV-00003", name: "Omega Seamaster", sku: "TT-4", status: "available", trackingType: "unique", reason: "sku" }], categories: ["Vintage Watches"], proposed: { name: "Omega", trackingType: "unique", category: "Watches", categoryBasis: "word", categoryFrom: "Vintage Watches" } }
] };
const rows = fn(R, "productRowsOf")(answer);
const [ronald, snoopy, gift, omega] = Array.isArray(rows) ? rows : [{}, {}, {}, {}];
expect("the store's categories reach the row", ronald?.categories, ["Character Watches"]);
expect("the server's proposal reaches the row", [ronald?.proposed?.category, ronald?.proposed?.categoryBasis, ronald?.proposed?.categoryFrom], ["Watches", "word", "Character Watches"]);
const pre = (row, options = SEED, def = "") => fn(R, "preselectCategory")(row, options, def);
expect("#181 preselected Watches (server proposal, offered)", pre(ronald)?.category, "Watches");
expect("an older server (no proposal): the same rule here → Watches from 'Snoopy Watches'", [pre(snoopy)?.category, pre(snoopy)?.basis, pre(snoopy)?.from], ["Watches", "word", "Snoopy Watches"]);
expect("a proposal the list does not offer is not used (a jeweller's list → its own rule)", pre(ronald, ["Rings", "Other"])?.category, "");
expect("'Uncategorized' → the workspace default", pre(gift, SEED, "Packaging")?.category, "Packaging");
expect("nothing to go on, no default → nothing (the person chooses)", pre(gift, SEED, "")?.category, "");
// the same vectors as the server's tests/unit-inventory-fixes.test.js (one rule, two languages)
const rule = (cats, titles = SEED, def = "") => fn(R, "categoryForStoreCategories")(cats, titles, def)?.category;
expect("parity: 'Mickey Mouse Watches' → Watches", rule(["Mickey Mouse Watches"]), "Watches");
expect("parity: same name, capitals ignored", rule(["watches"]), "Watches");
expect("parity: same name beats an earlier word match", rule(["Vintage Watches", "Straps"]), "Straps");
expect("parity: 'Leather Strap' → Straps", rule(["Leather Strap"]), "Straps");
expect("parity: 'Other' never matched by words", rule(["Other Watches"]), "Watches");
expect("parity: more words wins", rule(["Antique Pocket Watches"], ["Watches", "Pocket Watches", "Other"]), "Pocket Watches");
expect("parity: 'Straps & Bracelets' from 'Bracelets and Straps'", rule(["Bracelets and Straps"], ["Rings", "Straps & Bracelets", "Other"]), "Straps & Bracelets");
expect("parity: accents ignored", rule(["Céramique"], ["Ceramique", "Other"]), "Ceramique");
expect("parity: 'Glasses' does not match 'Gas'", rule(["Glasses"], ["Gas", "Other"]), "");
const start = fn(R, "startingDecision");
expect("ticking a new row starts with the preselected category", start(ronald, "Watches")?.category, "Watches");
expect("a single SKU match still starts as link", [start(omega, "Watches")?.action, start(omega, "Watches")?.inventoryItemId], ["link", "card-omega"]);
const D = (patch) => ({ action: "create", inventoryItemId: "", trackingType: "unique", openingCount: "", inHand: true, confirmAmbiguous: false, category: "", ...patch });
const problem = fn(R, "decisionProblem");
expect("a new card with no category is not sent (category_required)", problem(ronald, D({})), "category_required");
expect("…with one it is", problem(ronald, D({ category: "Watches" })), "");
expect("the count is still asked first", problem(ronald, D({ inHand: false })), "count_required");
expect("the reason has a sentence", fn(R, "reasonSentence")("category_required"), "Choose a category for the new card.");
const sent = fn(R, "decisionsToSend")(rows, [ronald.linkId, snoopy.linkId], { [ronald.linkId]: D({ category: "Watches" }), [snoopy.linkId]: D({}) });
expect("only rows with a category are sent, and the category goes with them", sent, [{ linkId: ronald.linkId, action: "create", trackingType: "unique", inHand: true, category: "Watches" }]);
const imported = fn(R, "importRowsOf")({ results: [{ linkId: ronald.linkId, result: "created", inventoryItemId: "woo-567d", number: "INV-00007", category: "Watches", photo: "copied" },
  { linkId: snoopy.linkId, result: "refused", reason: "count_required" }, { linkId: omega.linkId, result: "linked", inventoryItemId: "card-omega", number: "INV-00003", photo: "", photoReason: "" }] });
expect("the import row's category and photo are read", [imported[0]?.category, imported[0]?.photo], ["Watches", "copied"]);
const byId = Object.fromEntries((Array.isArray(imported) ? imported : []).map((r) => [r.linkId, r]));
const after = fn(R, "applyImportResults")(rows, byId);
const a = (id) => (Array.isArray(after) ? after.find((r) => r.linkId === id) : null) || {};
expect("right after the import the made card's row IS linked to INV-00007", [a(ronald.linkId).state, a(ronald.linkId).linkedItem?.number, a(ronald.linkId).linkedItem?.id], ["linked", "INV-00007", "woo-567d"]);
expect("…and says so (not 'No card has this SKU')", fn(R, "rowStateSentence")(a(ronald.linkId)), "Linked");
expect("…names the card", a(ronald.linkId).linkedItem?.name, "Vintage Ronald McDonald Watch 1976");
ok("…cannot be ticked again", fn(R, "canChoose")(a(ronald.linkId)) === false);
expect("a link to an existing card names that card", [a(omega.linkId).state, a(omega.linkId).linkedItem?.number, a(omega.linkId).linkedItem?.name], ["linked", "INV-00003", "Omega Seamaster"]);
expect("a refused row is unchanged", a(snoopy.linkId).state, "no_match");
expect("'to match' drops by the rows brought in (4 → 2)", [fn(R, "rowsToMatch")(rows), Array.isArray(after) ? fn(R, "rowsToMatch")(after) : "no applyImportResults"], [4, 2]);
expect("the picture rule matches the server: the bare name behind www.", fn(R, "safeImageUrl")("https://ticktoon.co.uk/x.webp", "www.ticktoon.co.uk"), "https://ticktoon.co.uk/x.webp");
expect("…a foreign host is still dropped", fn(R, "safeImageUrl")("https://evil.example/x.webp", "www.ticktoon.co.uk"), "");

// ---- 2. the list's pictures ----------------------------------------------------------------------------------------------
const P = "companies/C1/inventory_photos/item1/1793000000000-woo-p181.webp";
expect("the first stored photo path", fn(T, "thumbPath")({ photos: ["", "https://evil.example/x.jpg", P, "companies/C1/inventory_photos/item1/2.jpg"] }), P);
expect("no photo → no path", fn(T, "thumbPath")({ photos: [] }), "");
expect("a URL is never used as a path", fn(T, "thumbPath")({ photos: ["https://firebasestorage.googleapis.com/v0/b/x/o/y"] }), "");
expect("the workspace's own icon wins", fn(T, "categoryGlyph")("Rings", { Rings: "◇" }), "◇");
expect("a default title without a workspace icon gets the default icon (Bracelets ➰, not ▪)", fn(T, "categoryGlyph")("Bracelets", {}), "➰");
expect("an unknown title gets a neutral square", fn(T, "categoryGlyph")("Mystery", {}), "▪");
expect("title → icon map from the workspace list", fn(T, "workspaceCategoryIcons")([{ title: "Cakes", icon: "✦" }, { title: "Boxes", icon: "" }]), { Cakes: "✦" });
const content = read("app/inventory/InventoryContent.tsx");
const thumb = read("app/inventory/InventoryThumb.tsx");
ok("every item row renders a thumbnail (first photo or category tile)", /<InventoryThumb path=\{thumbPath\(item\)\} glyph=\{categoryGlyph\(item\.category, categoryIcons\)\} \/>/.test(content));
ok("the thumbnail is lazy: asks for the URL only near the viewport, <img loading=\"lazy\">, one URL per path per visit", /IntersectionObserver/.test(thumb) && /loading="lazy"/.test(thumb) && /const urls = new Map/.test(thumb) && /inventoryPhotoUrl\(path\)/.test(thumb));
ok("a photo that cannot be read falls back to the tile (no broken image)", /onError=\{\(\) => setFailed\(true\)\}/.test(thumb) && /\.catch\(\(\) => \{ if \(!cancelled\) setFailed\(true\); \}\)/.test(thumb));
ok("rows and sidebar read the workspace's icons, not a hard-coded table", !/CATEGORY_ICON\[/.test(content) && /categoryGlyph\(item\.category, categoryIcons\)/.test(content) && /workspaceCategoryIcons\(categories\)/.test(content));
const css = read("app/globals.css");
ok("thumbnail CSS is in app/globals.css (the served one), both themes by variables", /\.inventory-thumb \{[^}]*background: var\(--panel\); border: 1px solid var\(--border\);/.test(css));
ok("up to 1360 px the optional and action columns fold into the item cell (the list needs no sideways scroll)", /@media \(max-width: 1360px\) \{\s*\.inventory-table \{ min-width: 0; \}\s*\.inventory-table \.inventory-col-optional,\s*\.inventory-table \.inventory-col-actions \{ display: none; \}/.test(css));
ok("with the item panel open, optional and action columns fold into the item cell", /\.inventory-body\.has-panel \.inventory-table \.inventory-col-optional,/.test(css));
ok("phone width: the sidebar is one scrolling strip and optional columns fold", /@media \(max-width: 900px\) \{\s*\.inventory-nav \{ flex-direction: row; flex-wrap: nowrap; overflow-x: auto;/.test(css) && /@media \(max-width: 640px\) \{\s*\.inventory-table \{ min-width: 0; \}\s*\.inventory-table \.inventory-col-optional,\s*\.inventory-table \.inventory-col-actions,\s*\.inventory-table \.inventory-col-onhand \{ display: none; \}/.test(css) && /\$\{t\("On Hand"\)\}: \$\{inventoryOnHand\(item\)\}/.test(content));

// ---- 3. categories ---------------------------------------------------------------------------------------------------------
const seedRows = SEED.map((title, i) => ({ id: `c${i}`, title, icon: "▪", archived: false, itemCount: title === "Watches" ? 6 : title === "Other" ? 1 : 0 }));
const apply = fn(C, "applyCategoryTemplate");
const food = apply(seedRows, "food", "English", { hideUnusedSeed: true, now: 1 });
expect("a baker's set adds its categories at the end", food?.added, ["Ingredients", "Decorations", "Boxes & Packaging", "Equipment"]);
expect("…hides only unused watch-workshop rows (Watches holds 6, Other always stays)", food?.hidden, ["Dials", "Movements", "Bracelets", "Straps", "Parts", "Consumables", "Packaging", "Tools"]);
ok("…renames and deletes nothing", Array.isArray(food?.rows) && seedRows.every((r) => food.rows.some((n) => n.id === r.id && n.title === r.title)) && food.rows.length === seedRows.length + 4);
const kept = apply(seedRows, "food", "English", { hideUnusedSeed: false });
expect("without the box nothing is hidden", kept?.hidden, []);
const tr = apply(seedRows, "repairs", "Türkçe", { hideUnusedSeed: false, now: 2 });
expect("titles are written in the applying person's language; ones already there (English or translated) are not repeated", tr?.added, ["Yedek Parçalar", "Piller"]);
const again = apply(tr?.rows || [], "repairs", "Türkçe", { hideUnusedSeed: false, now: 3 });
expect("applying the same set twice adds nothing", again?.added, []);
expect("'Other' is never translated into a second fallback", fn(C, "templateTitle")("Other", "Türkçe"), "Other");
ok("untouched seed list recognised; a renamed one is not", fn(C, "isUntouchedSeedList")(seedRows) === true && fn(C, "isUntouchedSeedList")(seedRows.map((r) => (r.title === "Dials" ? { ...r, title: "Cakes" } : r))) === false);
expect("the sidebar nudge: a baker on the seed list yes; a watch workshop no; unknown trade no", [fn(C, "shouldSuggestTradeSet")(seedRows, ["food"]), fn(C, "shouldSuggestTradeSet")(seedRows, ["watches_jewellery"]), fn(C, "shouldSuggestTradeSet")(seedRows, [])], [true, false, false]);
const panelCats = read("app/inventory/CategoriesPanel.tsx");
const icons = (panelCats.match(/const ICON_CHOICES = \[([^\]]+)\]/) || [, ""])[1];
const templates = C.CATEGORY_TEMPLATES || {};
ok("every template icon is one the Categories screen offers", Object.values(templates).flat().every(([, icon]) => icons.includes(`"${icon}"`)) && Object.keys(templates).length === 9);
const onboarding = read("lib/studioflow/onboardingWizard.ts");
ok("one template per onboarding trade", [...onboarding.matchAll(/\{ id: "([a-z_]+)", label: "[^"]+" \}/g)].map((m) => m[1]).filter((id) => /^(watches_jewellery|repairs|leather|art_design|clothing|food|ceramics|made_to_order|other)$/.test(id)).every((id) => id in templates));
for (const [english, row] of Object.entries(C.TEMPLATE_TITLES || {})) for (const language of C.TEMPLATE_LANGUAGES || []) { checks += 1; if (!row[language]) failures.push(`no ${language} title for ${english}`); }
ok("every template title (but Other) has a translation row", Object.values(templates).flat().every(([english]) => english === "Other" || english in (C.TEMPLATE_TITLES || {})));
ok("the Categories screen offers the trade's set, preselected from the onboarding answer", /templateKindFromWorkKinds\(workKinds\)/.test(panelCats) && /applyCategoryTemplate\(rows, tradeKind, language, \{ hideUnusedSeed, now: Date\.now\(\) \}\)/.test(panelCats) && /data-testid="categories-template-apply"/.test(panelCats));
ok("Remove/Merge wait for unsaved edits (a reload would drop them)", (panelCats.match(/disabled=\{!canEdit \|\| busy \|\| [^}]*dirty\}/g) || []).length === 2);
ok("the sidebar has 'Manage categories' under the categories — one entry for the Categories screen, not two", /data-testid="inventory-nav-manage-categories"/.test(content) && /invT\("Manage categories"\)/.test(content) && (content.match(/data-active=\{tab === "categories"\}/g) || []).length === 1);
ok("a new item starts in the default or first category, never a hard-coded Watches", !/category: trackingType === "quantity" \? "Consumables" : "Watches"/.test(content) && /const newItemCategory = defaultCategory \|\| visibleCategories\[0\]\?\.title \|\| "Other";/.test(content) && /emptyDraft\(trackingType, current\.category\)/.test(content));
ok("one active sidebar entry: quick views clear the category; All Items clears every filter", /setStatusFilter\(""\);\s*setCategoryFilter\(""\);\s*setSelectedId\(""\);/.test(content) && /function openAllItems\(\) \{\s*openQuickView\("all"\);\s*setTypeFilter\(""\); setLocationFilter\(""\); setSupplierFilter\(""\); setSearch\(""\);/.test(content));

// ---- 1b. the panel wiring ----------------------------------------------------------------------------------------------
const panel = read("app/inventory/WooProductsPanel.tsx");
ok("rows carry the import's answers until the next read", /applyImportResults\(productRowsOf\(answer\), results\)/.test(panel));
ok("ticking a row preselects its category", /startingDecision\(row, preselectCategory\(row, categoryOptions, defaultCategory\)\.category\)/.test(panel));
ok("the row shows the chosen category and the store's categories", /data-testid="woo-row-category"/.test(panel) && /data-testid="woo-store-categories"/.test(panel));
ok("the linked row names the card and opens it", /data-testid="woo-row-linked-card"/.test(panel) && /onOpenCard\(row\.linkedItem!\.id\)/.test(panel));
ok("the result says whether the picture was copied", /done\.photo === "copied"/.test(panel) && /done\.photo === "not_copied"/.test(panel));
ok("Inventory passes the visible categories, the default and the open-card action", /categoryOptions=\{visibleCategories\.map\(row => row\.title\)\}\s*defaultCategory=\{defaultCategory\}/.test(content) && /onOpenCard=\{openCard\}/.test(content));

// ---- 4. sentences ----------------------------------------------------------------------------------------------------------
const languages = X.INVENTORY_LIST_LANGUAGES || [];
const usedList = new Set([...content.matchAll(/\binvT\("([^"]+)"\)/g)].map((m) => m[1]));
for (const m of panelCats.matchAll(/\bt\("([^"]+)"\)/g)) if (X.INVENTORY_LIST_TEXT && m[1] in X.INVENTORY_LIST_TEXT) usedList.add(m[1]);
ok("this round's list/category sentences found", usedList.size >= 12);
for (const sentence of usedList) {
  for (const language of languages) {
    const got = fn(X, "inventoryListText")(sentence, language);
    checks += 1;
    if (!got || String(got).startsWith("(missing")) { failures.push(`no ${language} for: ${sentence}`); continue; }
    if ((got.match(/\{\w+\}/g) || []).sort().join(",") !== (sentence.match(/\{\w+\}/g) || []).sort().join(",")) failures.push(`placeholders differ (${language}): ${sentence}`);
  }
}
const wooNew = ["Choose a category for the new card.", "Category for the new card", "Suggested from the store's category “{from}”", "Your default category", "In the store: {categories}", "Picture copied from the store", "The store's picture was not copied", "Open the card", "Picture shown from your store; bringing it in copies it onto the new card", "Choose…"];
for (const sentence of wooNew) {
  ok(`the panel uses: ${sentence}`, panel.includes(`t("${sentence}")`) || (sentence === "Choose a category for the new card." && /category_required: "Choose a category for the new card\."/.test(read("lib/studioflow/wooInventoryRules.ts"))));
  for (const language of R.WOO_INVENTORY_LANGUAGES || []) {
    const got = fn(R, "wooInventoryText")(sentence, language);
    checks += 1;
    if (!got || String(got).startsWith("(missing")) { failures.push(`no ${language} for: ${sentence}`); continue; }
    if ((got.match(/\{\w+\}/g) || []).sort().join(",") !== (sentence.match(/\{\w+\}/g) || []).sort().join(",")) failures.push(`placeholders differ (${language}): ${sentence}`);
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.log(`check-inventory-fixes: ${failures.length} failing of ${checks}`); for (const f of failures.slice(0, 80)) console.log(" ✗", f); process.exit(1); }
console.log(`check-inventory-fixes: ${checks}/${checks} ✓`);

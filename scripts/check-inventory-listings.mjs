// envanter-aktarma (6 Nov 2026): imported cards show their listing price and picture, the shelf's listing value sits
// next to (never inside) Total Inventory Value, and "Needs details" lists what is missing.
//
// 1. lib/studioflow/inventoryListings.ts, compiled with the tree's own TypeScript (with inventoryCost.ts) and run:
//    attention reasons (cost only for Financial Info, photo, "Other" = no category, off-shelf/customer never), the picture
//    candidates, money and channel names, and listedSummary (null on an older server, numbers on a new one).
// 2. Every sentence of the feature resolves in all eleven other app languages with its placeholders intact, and every
//    lt("…") the screen prints is in the table.
// 3. The screens are wired: the Inventory page reads channelListings from getInventorySummary, has the "Needs details"
//    view, the listing line on a row, the Listed value tile (never added to Total Inventory Value; the Value column still
//    the cost), the picture button; both import panels bring pictures in after an import; inventory.ts has the call.
//
//   node scripts/check-inventory-listings.mjs
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "inventory-listings-check-"));
const transpile = (src) => ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;

// ---- 1. the rules
let L = null;
const listingsSrc = read("lib/studioflow/inventoryListings.ts");
ok("lib/studioflow/inventoryListings.ts exists", Boolean(listingsSrc));
if (listingsSrc) {
  ok("inventoryListings.ts imports only ./inventoryCost", (listingsSrc.match(/^import .*$/gm) || []).every((line) => /from "\.\/inventoryCost"/.test(line)));
  fs.writeFileSync(path.join(tmp, "inventoryCost.mjs"), transpile(read("lib/studioflow/inventoryCost.ts")));
  fs.writeFileSync(path.join(tmp, "inventoryListings.mjs"), transpile(listingsSrc).replace(/from "\.\/inventoryCost"/g, 'from "./inventoryCost.mjs"'));
  L = await import(pathToFileURL(path.join(tmp, "inventoryListings.mjs")).href);
}
if (L) {
  const base = { id: "x", status: "available", ownership: "business", category: "Watches", photos: ["companies/w/inventory_photos/x/1.jpg"], purchasePrice: 100, costEntered: true };
  expect("complete card: nothing missing", L.attentionReasons(base, { canSeeCost: true }), []);
  expect("eBay import with no cost, no photo, Other", L.attentionReasons({ ...base, source: "ebay", purchasePrice: 0, costEntered: undefined, photos: [], category: "Other" }, { canSeeCost: true }), ["cost", "photo", "category"]);
  expect("no Financial Info: the cost gap is not shown", L.attentionReasons({ ...base, source: "ebay", purchasePrice: 0, costEntered: undefined }, { canSeeCost: false }), []);
  expect("typed £0 is a cost", L.attentionReasons({ ...base, purchasePrice: 0, costEntered: true }, { canSeeCost: true }), []);
  expect("empty category", L.attentionReasons({ ...base, category: "" }, { canSeeCost: true }), ["category"]);
  expect("sold card: never listed", L.attentionReasons({ ...base, status: "sold", photos: [] }, { canSeeCost: true }), []);
  expect("customer's item: never listed", L.attentionReasons({ ...base, ownership: "customer", photos: [] }, { canSeeCost: true }), []);
  expect("incoming: never listed", L.attentionReasons({ ...base, status: "incoming", photos: [] }, { canSeeCost: true }), []);
  const cards = [
    { ...base, id: "a", photos: [] }, { ...base, id: "b" }, { ...base, id: "c", photos: [] }, { ...base, id: "d", photos: [], status: "archived" }, { ...base, id: "e", photos: [] }
  ];
  const listings = {
    a: { price: { value: 450, currency: "GBP" }, provider: "ebay", label: "eBay", seenAtMs: 1, pictureAvailable: true, channels: [] },
    b: { price: null, provider: "ebay", label: "eBay", seenAtMs: 1, pictureAvailable: false, channels: [] },
    c: { price: null, provider: "woocommerce", label: "ticktoon.co.uk", seenAtMs: 1, pictureAvailable: false, channels: [] },
    d: { price: null, provider: "ebay", label: "eBay", seenAtMs: 1, pictureAvailable: true, channels: [] }
  };
  expect("picture candidates: on the shelf, no photo, a listing picture", L.pictureCandidateIds(cards, listings), ["a"]);
  expect("picture candidates with an older server", L.pictureCandidateIds(cards, undefined), []);
  expect("money GBP", L.listingMoney({ value: 1250, currency: "GBP" }), "£1,250.00");
  expect("money unknown code", L.listingMoney({ value: 10, currency: "CHF" }), "CHF 10.00");
  expect("no money for 0", L.listingMoney({ value: 0, currency: "GBP" }), "");
  expect("symbol GBP", L.currencySymbolOf("GBP"), "£");
  expect("symbol unknown", L.currencySymbolOf("CHF"), "CHF ");
  expect("channel name eBay", L.channelName({ provider: "ebay", label: "whatever" }), "eBay");
  expect("channel name site", L.channelName({ provider: "woocommerce", label: "ticktoon.co.uk" }), "ticktoon.co.uk");
  expect("listing line with price", L.listingLine(listings.a), "eBay · £450.00");
  expect("listing line without price", L.listingLine(listings.c), "ticktoon.co.uk");
  expect("listedSummary: older server → null", L.listedSummary({ totalValue: 100 }), null);
  expect("listedSummary: new server", L.listedSummary({ listedValue: 1970, listedCount: 4, listedCurrency: "GBP", listedOtherCurrencyCount: 1, listedNoCostCount: 2, pictureAvailableCount: 1, costMissingCount: 3 }),
    { value: 1970, count: 4, currency: "GBP", otherCurrency: 1, noCost: 2, pictures: 1, costMissing: 3 });
}

// ---- 2. the sentences
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const table = L ? L.INVENTORY_LISTINGS_TEXT : {};
ok("the feature has its sentence table", Object.keys(table).length >= 15);
for (const [en, row] of Object.entries(table)) {
  const holes = (en.match(/\{[a-z]+\}/g) || []).sort();
  for (const lang of LANGS) {
    const text = row[lang];
    ok(`"${en.slice(0, 40)}" in ${lang}`, typeof text === "string" && text.trim().length > 0 && text !== en);
    if (typeof text === "string") expect(`placeholders of "${en.slice(0, 30)}" in ${lang}`, (text.match(/\{[a-z]+\}/g) || []).sort(), holes);
  }
}
const page = read("app/inventory/InventoryContent.tsx");
const printed = [...page.matchAll(/\blt\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1]);
ok("the Inventory page prints this feature's sentences", printed.length >= 10);
for (const sentence of new Set(printed)) ok(`page sentence in the table: "${sentence.slice(0, 50)}"`, Object.prototype.hasOwnProperty.call(table, sentence));

// ---- 3. the wiring
const inv = read("lib/studioflow/inventory.ts");
ok("inventory.ts: getInventorySummary carries channelListings", /summary\?: InventorySummary; channelListings\?: ChannelListings/.test(inv));
ok("inventory.ts: copyListingPictures calls the server", /export async function copyListingPictures\(/.test(inv) && /"copyListingPictures"/.test(inv));
ok("page keeps channelListings from the summary call", /setChannelListings\(totals\?\.channelListings \?\? \{\}\)/.test(page));
ok("page has the Needs details view", /data-testid="inventory-nav-details"/.test(page) && /quickView === "details" && attentionReasons\(item, \{ canSeeCost \}\)\.length === 0/.test(page));
ok("row shows the listing line", /data-testid="inventory-row-listing"/.test(page) && /channelListings\[item\.id\]/.test(page));
ok("Listed value tile from listedSummary", /listedSummary\(/.test(page) && /label: lt\("Listed value"\)/.test(page));
ok("Listed value is never added to Total Inventory Value", !/totalValue\s*\+\s*[^;]*listed|listed[^;]*\+\s*summary\.totalValue/.test(page));
ok("Value column still the cost (inventoryLineValue)", /money\(currencySymbol, inventoryLineValue\(item\)\)/.test(page));
ok("picture button calls copyListingPictures for the candidates", /data-testid="inventory-bring-pictures"/.test(page) && /copyListingPictures\(workspace, \{ inventoryItemIds: pictureIds\.slice\(0, 60\) \}\)/.test(page));
ok("cost note links to Needs details", /data-testid="inventory-cost-missing-show"/.test(page));
for (const panel of ["app/inventory/EbayListingsPanel.tsx", "app/inventory/WooProductsPanel.tsx"]) {
  const src = read(panel);
  ok(`${panel}: pictures brought in after an import`, /async function picturesAfterImport\(/.test(src) && /await picturesAfterImport\(workspace, done\.filter/.test(src));
}
ok("Woo panel skips cards whose picture the import already copied", /r\.photo !== "copied"/.test(read("app/inventory/WooProductsPanel.tsx")));
ok("package.json runs this check", /"test:inventory-listings": "node scripts\/check-inventory-listings\.mjs"/.test(read("package.json")));

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  for (const f of failures) console.log(`✗ ${f}`);
  console.log(`\ncheck-inventory-listings: ${failures.length} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`check-inventory-listings: all ${checks} checks passed ✓`);

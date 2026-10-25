// MC-3 cost (25 Oct 2026): a card's purchase price is "not entered", a real £0, or a price — never one read as another.
//
// 1. lib/studioflow/inventoryCost.ts, compiled with the tree's own TypeScript and run on every card shape:
//    a store import (costEntered:false), a typed £0 (costEntered:true), a price, a hidden cost (FIN-01), and cards saved
//    before the marker existed (a store import's old 0 reads "not entered"; any other old 0 keeps its old reading).
//    The box text and what a save sends: a typed 0 is entered, an empty box never becomes a known £0.
// 2. Every new sentence resolves in every app language.
// 3. The screens read the shared rule (card, list row, totals note, form, order stock, home card, eBay card), and the
//    702d8fa4 rule (`!(Number(item.purchasePrice) > 0)`, every 0 on a Woo card = "not entered") is gone.
//
//   node scripts/check-inventory-cost.mjs
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "inventory-cost-check-"));
const compile = async (rel, out) => {
  const src = read(rel);
  if (!src) return null;
  fs.writeFileSync(path.join(tmp, out), ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText);
  return import(pathToFileURL(path.join(tmp, out)).href);
};

// ---- 1. the rule
const C = await compile("lib/studioflow/inventoryCost.ts", "cost.mjs");
ok("lib/studioflow/inventoryCost.ts exists and imports nothing", Boolean(C) && !/^import /m.test(read("lib/studioflow/inventoryCost.ts")));
if (C) {
  const cases = [
    ["Woo import, not entered", { source: "woocommerce", costEntered: false, purchasePrice: 0 }, "notEntered"],
    ["Woo card, person typed £0", { source: "woocommerce", costEntered: true, purchasePrice: 0 }, "zero"],
    ["Woo card, person typed £120", { source: "woocommerce", costEntered: true, purchasePrice: 120 }, "positive"],
    ["Woo card, £120 from an old app (no marker)", { source: "woocommerce", purchasePrice: 120 }, "positive"],
    ["marker false but a price (can only be typed)", { source: "woocommerce", costEntered: false, purchasePrice: 50 }, "positive"],
    ["legacy Woo 0, no marker (conservative)", { source: "woocommerce", purchasePrice: 0 }, "notEntered"],
    ["legacy eBay 0, no marker", { source: "ebay", purchasePrice: 0 }, "notEntered"],
    ["eBay card, person typed £0", { source: "ebay", costEntered: true, purchasePrice: 0 }, "zero"],
    ["legacy manual 0, no marker (old reading kept)", { source: "manual", purchasePrice: 0 }, "zero"],
    ["legacy opening-stock 0, no marker", { source: "openingStock", purchasePrice: 0 }, "zero"],
    ["manual card emptied by the person", { source: "manual", costEntered: false, purchasePrice: 0 }, "notEntered"],
    ["FIN-01 hidden", { source: "woocommerce", costHidden: true, purchasePrice: 0, costEntered: true }, "hidden"],
    ["missing card", null, "notEntered"]
  ];
  for (const [name, card, want] of cases) expect(`kind: ${name}`, C.inventoryCostKind(card), want);
  // the three answers stay apart: same source, same stored 0, different meaning
  ok("not entered ≠ typed £0 for the same stored 0",
    C.inventoryCostKind({ source: "woocommerce", costEntered: false, purchasePrice: 0 }) !== C.inventoryCostKind({ source: "woocommerce", costEntered: true, purchasePrice: 0 }));

  const shelf = [
    { source: "woocommerce", costEntered: false, purchasePrice: 0, status: "available" },
    { source: "woocommerce", costEntered: false, purchasePrice: 0, status: "reserved" },
    { source: "woocommerce", costEntered: true, purchasePrice: 0, status: "available" },
    { source: "woocommerce", costEntered: false, purchasePrice: 0, status: "sold" },
    { source: "woocommerce", costEntered: false, purchasePrice: 0, status: "archived" },
    { source: "woocommerce", costEntered: false, purchasePrice: 0, status: "available", ownership: "customer" },
    { source: "manual", purchasePrice: 0, status: "available" },
    { source: "ebay", purchasePrice: 0 },
    { source: "woocommerce", costHidden: true, purchasePrice: 0, status: "available" }
  ];
  expect("cards on the shelf with no cost entered (sold/archived/customer/hidden/typed £0/legacy manual left out)", C.inventoryCostMissingCount(shelf), 3);

  expect("box: not entered starts empty", C.inventoryCostFieldText({ source: "woocommerce", costEntered: false, purchasePrice: 0 }), "");
  expect("box: a typed £0 starts as 0", C.inventoryCostFieldText({ source: "woocommerce", costEntered: true, purchasePrice: 0 }), "0");
  expect("box: a price starts as the price", C.inventoryCostFieldText({ costEntered: true, purchasePrice: 120.5 }), "120.5");
  expect("box: a legacy 0 starts empty (as before)", C.inventoryCostFieldText({ source: "manual", purchasePrice: 0 }), "");
  expect("box: new card starts empty", C.inventoryCostFieldText(null), "");

  const notEntered = { source: "woocommerce", costEntered: false, purchasePrice: 0 };
  expect("save: typed 0 → entered £0", C.inventoryCostSaveFields("0", notEntered), { purchasePrice: 0, costEntered: true });
  expect("save: typed 0.00 → entered £0", C.inventoryCostSaveFields("0.00", notEntered), { purchasePrice: 0, costEntered: true });
  expect("save: 12,5 → 12.5 entered", C.inventoryCostSaveFields("12,5", notEntered), { purchasePrice: 12.5, costEntered: true });
  expect("save: empty box on a not-entered card sends no marker (stays not entered)", C.inventoryCostSaveFields("", notEntered), { purchasePrice: 0 });
  expect("save: empty box on a legacy 0 sends no marker (no guess)", C.inventoryCostSaveFields("  ", { source: "manual", purchasePrice: 0 }), { purchasePrice: 0 });
  expect("save: emptying a typed £0 → not entered", C.inventoryCostSaveFields("", { costEntered: true, purchasePrice: 0 }), { purchasePrice: 0, costEntered: false });
  expect("save: emptying a price → not entered", C.inventoryCostSaveFields("", { source: "manual", purchasePrice: 80 }), { purchasePrice: 0, costEntered: false });
  expect("save: new card, empty → no marker", C.inventoryCostSaveFields("", null), { purchasePrice: 0 });
  expect("save: new card, typed 0 → entered", C.inventoryCostSaveFields("0", null), { purchasePrice: 0, costEntered: true });
  expect("save: nonsense is not a number → treated as empty", C.inventoryCostSaveFields("abc", notEntered), { purchasePrice: 0 });
}

// ---- 2. sentences in every language
const R = await compile("lib/studioflow/wooInventoryRules.ts", "rules.mjs");
const SENTENCES = [
  "Cost: not entered",
  "Not entered",
  "Items on the shelf with no cost entered: {count}. The inventory value leaves them out — it does not count them as money spent.",
  "Leave it empty if you don't know it yet — type 0 only if it really cost nothing.",
  "Cost: not entered — the store's price is a sale price, not what you paid."
];
for (const sentence of SENTENCES) {
  for (const language of R.WOO_INVENTORY_LANGUAGES) {
    const got = R.wooInventoryText(sentence, language);
    checks += 1;
    if (!got) { failures.push(`no ${language} for: ${sentence}`); continue; }
    const want = (sentence.match(/\{\w+\}/g) || []).sort().join(",");
    if ((got.match(/\{\w+\}/g) || []).sort().join(",") !== want) failures.push(`placeholders differ (${language}): ${sentence}`);
  }
}

// ---- 3. wiring
const detail = read("app/inventory/ItemDetailPanel.tsx");
const content = read("app/inventory/InventoryContent.tsx");
ok("card: the 702d8fa4 rule (every Woo 0 = not entered) is gone", !/!\(Number\(item\.purchasePrice\) > 0\)/.test(detail));
ok("card: purchase price reads inventoryCostKind", /inventoryCostKind\(item\) === "notEntered"\s*\n?\s*\? <span className="inventory-sub" data-testid="woo-cost-not-entered">/.test(detail));
ok("card: line value and history read the rule", (detail.match(/inventoryCostKind\(item\) === "notEntered"/g) || []).length >= 3);
ok("form: the price box keeps its own text (empty ≠ 0)", /const \[costText, setCostText\] = useState\(\(\) => inventoryCostFieldText\(initialItem\)\)/.test(content) && /value=\{costText\}/.test(content) && !/set\("purchasePrice", Number\(e\.target\.value\) \|\| 0\)/.test(content));
ok("form: the save sends what the box says", /inventoryCostSaveFields\(costText, initialItem\)/.test(content) && /saveInventoryItem\(workspace, \{ \.\.\.draft, \.\.\.costFields \}/.test(content));
ok("list: a row with no cost says so, not £0.00", /data-testid="inventory-row-cost-not-entered"/.test(content));
ok("totals: the note under the value counts the cards with no cost", /inventoryCostMissingCount\(items\)/.test(content) && /data-testid="inventory-cost-missing-note"/.test(content));
ok("export: no cost entered exports empty cells, not 0.00", /inventoryCostKind\(item\) === "notEntered" && inventoryLineValue\(item\) === 0 \? \["", ""\]/.test(content));
ok("order stock: no '£0' cost for a card with none", /inventoryCostKind\(item\) === "notEntered"/.test(read("app/orders/OrderStockBlock.tsx")));
ok("home card: no '£0' value for a card with none", /inventoryCostKind\(item\) === "notEntered"/.test(read("components/home/HomeCardBodies.tsx")));
ok("eBay card: the same rule (a typed £0 is not 'not entered')", /inventoryCostKind\(item\) === "notEntered"/.test(read("app/inventory/EbayItemLinks.tsx")) && !/Number\(item\.internalTotalCost \|\| 0\) === 0/.test(read("app/inventory/EbayItemLinks.tsx")));
ok("types: costEntered on the card and the save input", (read("lib/studioflow/inventory.ts").match(/costEntered\?: boolean;/g) || []).length === 2);
// the store's price is never written as a cost by any web path of the import
ok("the Woo import screens never send a purchase price", !/purchasePrice/.test(read("app/inventory/WooProductsPanel.tsx")) && !/purchasePrice/.test(read("lib/studioflow/wooInventory.ts")));

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.log(`check-inventory-cost: ${failures.length} failing of ${checks}`); for (const f of failures) console.log(" ✗", f); process.exit(1); }
console.log(`check-inventory-cost: ${checks}/${checks} ✓`);

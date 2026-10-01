// Inventory notes: the item form edits `notes` (the server's saveInventoryItem keeps up to 2000 characters), only for the
// people the page already lets edit stock, and the item panel shows the note with its line breaks. Exit 1 on any miss.
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const content = read("app/inventory/InventoryContent.tsx");
const panel = read("app/inventory/ItemDetailPanel.tsx");
const lib = read("lib/studioflow/inventory.ts");
const page = read("app/inventory/page.tsx");
const lang = read("lib/studioflow/language.ts");
let failures = 0; let checks = 0;
const check = (ok, what) => { checks += 1; if (!ok) { failures += 1; console.error(`FAIL ${what}`); } };
const modalStart = content.indexOf("function NewItemModal(");
const modal = modalStart >= 0 ? content.slice(modalStart) : "";
check(modalStart >= 0, "NewItemModal exists");
check(/<textarea[\s\S]{0,200}value=\{draft\.notes \?\? ""\}[\s\S]{0,120}onChange=\{e => set\("notes", e\.target\.value\)\}/.test(modal), "the item form has a notes textarea bound to draft.notes");
check(/maxLength=\{2000\}/.test(modal.slice(modal.indexOf('value={draft.notes') - 200, modal.indexOf('value={draft.notes') + 50)), "the notes textarea stops at the server's 2000 characters");
check(/t\("Notes"\)/.test(modal), "the notes field is labelled with the translated \"Notes\"");
check(/function emptyDraft[\s\S]{0,900}notes: ""/.test(content), "a new item starts with an empty note");
check(/notes: item\.notes,/.test(lib), "editing an item keeps its existing note (inventoryItemToInput)");
check(/"saveInventoryItem"[\s\S]{0,80}\{ companyId: workspace\.id, itemId: itemId \|\| "", item \}/.test(lib), "the note travels to the server inside the saved item");
check(/const canEdit = workspaceAccessAllows\(workspace\.memberAccess, "orders"\)/.test(page), "the page's edit permission is unchanged (orders access)");
check(/\{canEdit && tab === "items" \? \(/.test(content), "Add Item is still offered only to people who can edit stock");
check(/item\.notes \? <p className="inventory-sub" style=\{\{ whiteSpace: "pre-wrap" \}\}>\{item\.notes\}<\/p>/.test(panel), "the item panel keeps the note's line breaks");
const translated = (lang.match(/^    "Notes": "/gm) || []).length;
check(translated >= 11, `"Notes" is translated in the 11 non-English languages (found ${translated})`);
if (failures) { console.error(`${failures} of ${checks} inventory-notes checks failed.`); process.exit(1); }
console.log(`All ${checks} inventory-notes checks passed.`);

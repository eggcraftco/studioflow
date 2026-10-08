// Order-card purposes + the Getting-started owner gate (8 Oct 2026).
//
// 1. Every order-detail card id (lib/studioflow/cardLayouts.ts
//    ORDER_DETAIL_CARD_IDS) has a purpose text in lib/studioflow/
//    orderCardPurposes.ts, and that text — plus the "i" button's label — is
//    translated in all 11 non-English languages through the real studioT
//    (deep merge, Mac table last): a key that only exists in the file is not
//    proof. No purpose is keyed by an id that is not a card.
// 2. The order view wires it: the header "i" exists, points at the purpose
//    element with aria-describedby, and the old per-option menu descriptions
//    are gone.
// 3. canSeeGettingStarted (lib/studioflow/homeCards.ts) is false for member,
//    viewer, workflow, admin and a custom role, true for owner only; the
//    gettingStarted card is ownerOnly; the dashboard and Home read the gate.
//
//   node scripts/check-card-purposes.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const ok = (name, condition) => {
  checks += 1;
  if (!condition) failures.push(name);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "card-purposes-"));
const compile = (rel, name, rewrite = (js) => js) => {
  const js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
  fs.writeFileSync(path.join(tmp, `${name}.mjs`), rewrite(js));
};
// language.ts and every sibling table it imports (the list grows: a new
// table is a new `./x` import there, found rather than listed here).
const tables = ["language", ...new Set([...read("lib/studioflow/language.ts").matchAll(/from "\.\/(\w+)"/g)].map((m) => m[1]))];
for (const name of tables) {
  if (fs.existsSync(path.join(root, `lib/studioflow/${name}.ts`))) compile(`lib/studioflow/${name}.ts`, name);
}
const { studioT, SUPPORTED_STUDIO_LANGUAGES } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
const languages = SUPPORTED_STUDIO_LANGUAGES.filter((l) => l !== "English");
ok(`11 non-English languages (got ${languages.length})`, languages.length === 11);

// 1. Card ids, read from the source so a new card cannot be forgotten.
const layouts = read("lib/studioflow/cardLayouts.ts");
const idsBlock = layouts.slice(layouts.indexOf("export const ORDER_DETAIL_CARD_IDS"), layouts.indexOf("] as const;"));
const cardIds = [...idsBlock.matchAll(/"(\w+)"/g)].map((m) => m[1]);
ok(`card ids found in cardLayouts.ts (got ${cardIds.length})`, cardIds.length >= 19);

const purposesPath = "lib/studioflow/orderCardPurposes.ts";
if (!fs.existsSync(path.join(root, purposesPath))) {
  failures.push(`${purposesPath} does not exist`);
  checks += 1;
} else {
  compile(purposesPath, "orderCardPurposes");
  const mod = await import(pathToFileURL(path.join(tmp, "orderCardPurposes.mjs")).href);
  const purposes = mod.ORDER_CARD_PURPOSES;
  for (const id of cardIds) {
    const english = purposes[id];
    ok(`card "${id}" has an English purpose`, typeof english === "string" && english.trim().length > 20);
    if (typeof english !== "string") continue;
    for (const lang of languages) {
      const out = studioT(english, lang);
      ok(`card "${id}" purpose has a ${lang} translation`, out !== english && out.trim().length > 0);
    }
  }
  for (const key of Object.keys(purposes)) ok(`purpose key "${key}" is a card id`, cardIds.includes(key));
  const toggle = mod.ORDER_CARD_PURPOSE_TOGGLE;
  ok("the \"i\" label exists", typeof toggle === "string" && toggle.length > 0);
  for (const lang of languages) ok(`"i" label has a ${lang} translation`, studioT(toggle, lang) !== toggle);
  if (process.argv.includes("--list")) {
    for (const id of cardIds) console.log(`${id}: ${purposes[id]}`);
  }
}

// 2. Wiring in the order view.
const tsx = read("app/orders/OrderDetailContent.tsx");
ok("order view imports orderCardPurposes", tsx.includes('from "@/lib/studioflow/orderCardPurposes"'));
ok("header \"i\" button exists", tsx.includes('className={infoOpen ? "order-card-menu-button order-card-info-button is-on" : "order-card-menu-button order-card-info-button"}'));
ok("header \"i\" is described by the purpose element", tsx.includes("aria-describedby={orderCardPurposeId(cardId)}"));
ok("purpose element carries the id", tsx.includes("id={orderCardPurposeId(cardId)}"));
ok("Escape closes the purpose and refocuses the \"i\"", tsx.includes("cardInfoButtonRefs.current[cardId]?.focus()"));
ok("phone shows the purpose inline under the title", tsx.includes('renderCardPurpose(cardId, "inline", infoOpen)'));
ok("desktop shows the purpose as a popover", tsx.includes('renderCardPurpose(cardId, "popover", infoOpen)'));
ok("per-option menu descriptions are gone from the order view", !tsx.includes("ORDER_CARD_MENU_DESCRIPTIONS") && !tsx.includes("block-custom-desc"));
ok("per-option menu description module is gone", !fs.existsSync(path.join(root, "lib/studioflow/orderCardMenuDescriptions.ts")));
const css = read("app/globals.css");
ok("purpose popover styled", css.includes(".order-card-purpose.is-popover {"));
ok("purpose inline styled", css.includes(".order-card-purpose.is-inline {"));
ok("old option-description CSS is gone", !css.includes(".block-custom-desc") && !css.includes(".is-describing"));

// 3. Getting started is the owner's.
const homeCardsPath = "lib/studioflow/homeCards.ts";
compile(homeCardsPath, "homeCards", (js) => js.replace('from "@/lib/studioflow/firestore"', 'from "./firestoreStub.mjs"'));
fs.writeFileSync(path.join(tmp, "firestoreStub.mjs"), "export const workspaceAccessAllows = () => true;\n");
const home = await import(pathToFileURL(path.join(tmp, "homeCards.mjs")).href);
ok("canSeeGettingStarted is exported", typeof home.canSeeGettingStarted === "function");
if (typeof home.canSeeGettingStarted === "function") {
  for (const role of ["member", "workflow", "viewer", "admin", "custom-role", "custom:abc123", "", null, undefined, "Owner ", "OWNER"]) {
    const want = typeof role === "string" && role.trim().toLowerCase() === "owner";
    ok(`canSeeGettingStarted(${JSON.stringify(role)}) === ${want}`, home.canSeeGettingStarted(role) === want);
  }
  ok("canSeeGettingStarted(\"owner\") === true", home.canSeeGettingStarted("owner") === true);
  const card = home.HOME_CARDS.find((c) => c.id === "gettingStarted");
  ok("gettingStarted card is ownerOnly", Boolean(card && card.ownerOnly === true));
  const fullAccess = { role: "member", memberAccess: {} };
  ok("visibleHomeCards hides gettingStarted from a member with every key", !home.visibleHomeCards(home.DEFAULT_HOME_LAYOUT, fullAccess).some((c) => c.definition.id === "gettingStarted"));
  ok("visibleHomeCards shows gettingStarted to the owner", home.visibleHomeCards(home.DEFAULT_HOME_LAYOUT, { role: "owner", memberAccess: {} }).some((c) => c.definition.id === "gettingStarted"));
  ok("availableHomeCards does not offer gettingStarted to a member", !home.availableHomeCards({ ...home.DEFAULT_HOME_LAYOUT, cards: [], hidden: [] }, fullAccess).some((c) => c.id === "gettingStarted"));
}
ok("dashboard gates the Getting started card by the helper", read("app/dashboard/page.tsx").includes("workspace && canSeeGettingStarted(workspace.role) ? ("));
ok("Home asks for the checklist only for the owner", read("app/home/page.tsx").includes("canSeeGettingStarted(workspace?.role)"));

if (failures.length) {
  console.error(`FAIL ${failures.length}/${checks}`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`PASS ${checks} checks`);

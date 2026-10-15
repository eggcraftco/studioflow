// Order-card "i" removed (N13, 15 Oct 2026) + the Getting-started owner gate.
//
// The card purposes of 8 Oct ("What is this card for?": a popover on a
// desktop, a blue box under the card title on a phone) were removed by the
// owner's decision N13. This script now keeps them gone:
// 1. lib/studioflow/orderCardPurposes.ts does not exist, and none of its 20
//    strings (19 purposes + the "i" label) is left in the translation tables
//    (probed through the real studioT, deep merge, Mac table last: a removed
//    row must not still translate).
// 2. The order view has no header "i", no purpose element, no inline blue box
//    and no popover; the old per-option menu descriptions stay gone; the "..."
//    menu is still there. The CSS for both is gone.
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

// 1. The purposes module and its translation rows are gone. The 20 English
//    keys are listed here on purpose: the module that held them is deleted,
//    so the only proof that a row is gone is asking studioT for it.
const REMOVED_PURPOSE_STRINGS = [
  "The order's pictures. Add photos of the piece, the design or the reference the customer sent; the first one is the order's cover image.",
  "Records the customer's own item that came in for repair: what it is, its condition and any marks. It is held for the customer, never counted as stock.",
  "The quote for this order and the customer's answer. Send the estimate, see whether it was approved or declined, and keep the signed record.",
  "The customer's own page for this order. Share the link so they can follow progress, see files and reply without an account.",
  "The headline facts of the order: what is being made, how many, the main choices and the reference number. Edit a value by clicking it.",
  "Who the order is for and how to reach them. Name, phone, e-mail and the customer's own notes, with shortcuts to call, message or open the customer.",
  "The lines that will appear on the invoice: each item, its quantity and price. Totals and tax are worked out from these lines.",
  "What this order needs in materials and parts, with a check for each. Items linked to inventory show their stock so nothing runs short mid-job.",
  "How urgent the order is and whether it is at risk. Set the priority, flag a risk and write the reason so the team sees it at a glance.",
  "When the order was created and when it is due. Shows the delivery date, the days remaining and turns red once the order is late.",
  "Free-form notes about this order for the team. Add your own note sections for the things this workspace always writes down.",
  "Files that belong to this order: designs, photos, documents and proofs. Upload, download and share them with the customer.",
  "The task list for this order. Add steps, tick them off, set due dates and assign them to team members; overdue tasks are flagged.",
  "Time spent on this order. Start a timer or log hours by hand so labour can be costed and compared with the estimate.",
  "The money on this order: price, cost, payments received, refunds and what is still owed. Record payments and see the margin.",
  "Where the order is in production. Tick the stages as the job moves along; the board and this card always show the same stage.",
  "How the finished order gets to the customer. Choose the courier, save the tracking number and follow the parcel from here.",
  "Reminders and alerts for this order. Set a date and time to be reminded about a fitting, a deadline or a follow-up.",
  "Everything that happened to this order, in time order: who changed what and when. Read-only; nothing here can be edited.",
  "What is this card for?"
];
ok("orderCardPurposes.ts is deleted", !fs.existsSync(path.join(root, "lib/studioflow/orderCardPurposes.ts")));
for (const english of REMOVED_PURPOSE_STRINGS) {
  for (const lang of languages) {
    ok(`removed purpose row is gone (${lang}): ${english.slice(0, 40)}`, studioT(english, lang) === english);
  }
}
const languageSource = read("lib/studioflow/language.ts");
ok("language.ts has no card-purpose block", !languageSource.includes("Order-detail card purposes") && !languageSource.includes('"What is this card for?"'));

// 2. The order view: no "i", no purpose text in any form; "..." stays.
const tsx = read("app/orders/OrderDetailContent.tsx");
ok("order view does not import orderCardPurposes", !tsx.includes("orderCardPurposes"));
ok("no header \"i\" button", !tsx.includes("order-card-info-button"));
ok("no purpose element (popover or inline blue box)", !tsx.includes("order-card-purpose") && !tsx.includes("renderCardPurpose"));
ok("no purpose state left", !tsx.includes("openCardInfoId") && !tsx.includes("cardInfoInline") && !tsx.includes("cardInfoButtonRefs"));
ok("no \"What is this card for?\" text", !tsx.includes("What is this card for?") && !tsx.includes("ORDER_CARD_PURPOSE"));
ok("the card \"...\" menu is still there", tsx.includes("aria-label={`${cardLabel(cardId)} menu`}") && tsx.includes("setOpenCardMenuId(current => current === cardId ? null : cardId)"));
ok("the \"...\" panel still closes on scroll", /window\.addEventListener\("scroll", onScroll, true\)/.test(tsx) && tsx.includes('target.closest(".block-custom-panel")'));
ok("per-option menu descriptions are gone from the order view", !tsx.includes("ORDER_CARD_MENU_DESCRIPTIONS") && !tsx.includes("block-custom-desc"));
ok("per-option menu description module is gone", !fs.existsSync(path.join(root, "lib/studioflow/orderCardMenuDescriptions.ts")));
const css = read("app/globals.css");
ok("purpose CSS is gone", !css.includes(".order-card-purpose") && !css.includes(".order-card-info-button"));
ok("old option-description CSS is gone", !css.includes(".block-custom-desc") && !css.includes(".is-describing"));
const all = ["app", "components", "lib"].flatMap((dir) => {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const r = path.join(d, e.name); if (e.isDirectory()) walk(r); else if (/\.(tsx?|css)$/.test(e.name)) out.push(r); } };
  walk(dir);
  return out;
});
ok("no source file mentions the card purpose any more", !all.some((rel) => /orderCardPurpose|order-card-purpose|What is this card for\?/.test(read(rel))));

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

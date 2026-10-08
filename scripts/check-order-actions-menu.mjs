// Order page Actions menu (8 Oct 2026).
//
// Two things, from the source alone (no browser):
//   1. The Actions button is an explicit open/close toggle: click toggles,
//      Escape and an outside click close, the button carries aria-expanded /
//      aria-controls and the panel the matching id; the panel shares the
//      account-menu popover styling (border token, radius, shadow, blur).
//   2. A team member is never told the name of a card their card* keys hide:
//      lib/studioflow/orderActionCards.ts exports the pure helper
//      visibleActionCardsFor(access, cards) that the Customize list uses, and
//      the vectors below run against the compiled helper — owner sees all,
//      three keys off removes exactly those cards, unknown ids stay visible.
//
//   node scripts/check-order-actions-menu.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const here = path.dirname(new URL(import.meta.url).pathname);
const webRoot = path.resolve(here, "..");
const read = (rel) => readFileSync(path.join(webRoot, rel), "utf8");
const page = read("app/orders/OrderDetailContent.tsx");
const css = read("app/globals.css");
const failures = [];
let checks = 0;
const check = (label, ok) => {
  checks += 1;
  if (!ok) failures.push(label);
};

// 1. Toggle semantics.
const buttonStart = page.indexOf('className="button secondary order-actions-button"');
check("Actions button found", buttonStart > 0);
const buttonTag = page.slice(buttonStart, page.indexOf(">", page.indexOf("{t(\"Actions\")}", buttonStart)));
check("button click toggles open/closed", /setOrderActionsOpen\(open => !open\)/.test(buttonTag));
check("button has aria-haspopup", /aria-haspopup="dialog"/.test(buttonTag));
check("button has aria-expanded bound to the open state", /aria-expanded=\{orderActionsOpen\}/.test(buttonTag));
check("button has aria-controls pointing at the panel", /aria-controls="order-actions-menu"/.test(buttonTag));
check("panel carries the id, role and label", /id="order-actions-menu" className="order-actions-menu-panel" role="dialog" aria-label=\{t\("Actions"\)\}/.test(page));
check("panel only rendered while open", /\{orderActionsOpen \? \(\s*<div id="order-actions-menu"/.test(page));
check("Escape closes", /if \(event\.key === "Escape"\) setOrderActionsOpen\(false\);/.test(page));
check("outside click closes (window click listener while open)", /if \(!orderActionsOpen\) return;\s*const closeMenu = \(\) => setOrderActionsOpen\(false\);[\s\S]{0,300}window\.addEventListener\("click", closeMenu\);/.test(page));
check("clicks inside the wrap do not close it", /<div className="order-actions-menu-wrap" onClick=\{event => event\.stopPropagation\(\)\}>\s*<button\s*className="button secondary order-actions-button"/.test(page));

// Styling shared with the account menu popover.
const rule = (selector) => {
  const m = css.match(new RegExp(`\\n${selector.replace(/[.\\-]/g, "\\$&")} \\{([^}]*)\\}`));
  return m ? m[1] : "";
};
const prop = (block, name) => {
  const m = block.match(new RegExp(`\\b${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
};
const account = rule(".toolbar-avatar-menu");
const actions = rule(".order-actions-menu-panel");
check("account menu rule found", account.length > 0);
check("actions panel rule found", actions.length > 0);
for (const name of ["border", "border-radius", "background", "box-shadow", "backdrop-filter", "top"]) {
  check(`actions panel ${name} matches the account menu`, prop(actions, name) !== null && prop(actions, name) === prop(account, name));
}
check("dark theme rule for the actions panel exists", /body\[data-studio-theme="dark"\] \.order-actions-menu-panel,/.test(css));

// 2. Card visibility helper wired into the page.
check("page imports the helper", /import \{ orderActionCardVisible, visibleActionCardsFor \} from "@\/lib\/studioflow\/orderActionCards";/.test(page));
check("canShowOrderCard uses the helper", /function canShowOrderCard\(cardId: OrderDetailCardId\) \{[\s\S]{0,400}if \(!orderActionCardVisible\(workspace\.memberAccess, cardId\)\) return false;/.test(page));
check("Customize list is built from visibleActionCardsFor", /const customizeCardOrder = visibleActionCardsFor\(workspace\.memberAccess, isNarrowLayout \? cardLayout\.mobileCardOrder : cardLayout\.cardOrder\)/.test(page));
check("no local CARD_ACCESS_KEYS map remains", !page.includes("CARD_ACCESS_KEYS"));
check("Invoice PDF stays behind canSeeFinance", /\{canSeeFinance \? \(\s*<button[\s\S]{0,400}Invoice PDF\s*<\/button>\s*\) : null\}/.test(page));
check("Order Value header toggle stays behind canSeeFinance", /\.\.\.\(canSeeFinance \? \[\{\s*label: t\("Order Value"\)/.test(page));

// Vectors against the compiled helper.
const outDir = mkdtempSync(path.join(tmpdir(), "nivadesk-order-actions-"));
try {
  execFileSync(
    path.join(webRoot, "node_modules", ".bin", "tsc"),
    [path.join(webRoot, "lib", "studioflow", "orderActionCards.ts"), "--outDir", outDir, "--module", "es2022", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck"],
    { stdio: "inherit" }
  );
  const { visibleActionCardsFor, ORDER_ACTION_CARD_ACCESS_KEYS } = await import(pathToFileURL(path.join(outDir, "orderActionCards.js")).href);
  const allCards = Object.keys(ORDER_ACTION_CARD_ACCESS_KEYS);
  check("helper covers the 19 order cards", allCards.length === 19);
  const expectedKeys = ["cardPreview", "cardSummary", "cardCustomer", "cardMaterials", "cardPriority", "cardDelivery", "cardNotes", "cardClientFiles", "cardTodo", "cardWorkTime", "cardFinancial", "cardStatus", "cardShipping", "cardSchedule", "cardHistoryLog", "clientFiles", "financialInfo"];
  const usedKeys = new Set(Object.values(ORDER_ACTION_CARD_ACCESS_KEYS).flat());
  check("every card* key plus clientFiles/financialInfo is used", expectedKeys.every(key => usedKeys.has(key)) && usedKeys.size === expectedKeys.length);

  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  // Owner: no access record → every card listed, order preserved.
  check("owner (no record) sees every card", same(visibleActionCardsFor(undefined, allCards), allCards));
  check("owner (null record) sees every card", same(visibleActionCardsFor(null, allCards), allCards));
  // Member with every key explicitly on → every card listed.
  const allOn = Object.fromEntries(expectedKeys.map(key => [key, true]));
  check("member with every key on sees every card", same(visibleActionCardsFor(allOn, allCards), allCards));
  // Member with three card keys off → exactly those cards absent.
  const threeOff = { ...allOn, cardMaterials: false, cardWorkTime: false, cardHistoryLog: false };
  const listed = visibleActionCardsFor(threeOff, allCards);
  check("three keys off: materials absent", !listed.includes("materials"));
  check("three keys off: workTime absent", !listed.includes("workTime"));
  check("three keys off: historyLog absent", !listed.includes("historyLog"));
  check("three keys off: the other 16 cards remain, in order", same(listed, allCards.filter(id => !["materials", "workTime", "historyLog"].includes(id))));
  // Keys shared by several cards hide all of them.
  const customerOff = { ...allOn, cardCustomer: false };
  check("cardCustomer off hides customer, customerPortal and invoiceItems", same(visibleActionCardsFor(customerOff, ["customer", "customerPortal", "invoiceItems", "notes"]), ["notes"]));
  // Other gates: financialInfo hides financial, clientFiles hides clientFiles.
  check("financialInfo off hides the financial card", !visibleActionCardsFor({ ...allOn, financialInfo: false }, allCards).includes("financial"));
  check("clientFiles off hides the client files card", !visibleActionCardsFor({ ...allOn, clientFiles: false }, allCards).includes("clientFiles"));
  // Unknown ids are not gated.
  check("unknown card ids stay visible", same(visibleActionCardsFor({ ...allOn, cardNotes: false }, ["notes", "mystery", "another"]), ["mystery", "another"]));
  check("does not mutate the input", (() => { const input = ["notes", "todo"]; visibleActionCardsFor({ cardNotes: false }, input); return same(input, ["notes", "todo"]); })());
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`check-order-actions-menu: ${failures.length} of ${checks} checks failed`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`check-order-actions-menu: ${checks} checks passed`);

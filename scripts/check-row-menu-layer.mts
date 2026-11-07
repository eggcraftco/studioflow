// Banking ▸ Payment links: the "···" menu beside Refund / Copy link must never be cut off (7 Nov 2026).
//   npm run test:row-menu-layer            (this tree)
//   node scripts/check-row-menu-layer.mts <web root>   (another tree — the live one goes red)
//
// The owner, 7 Nov 2026: the menu "açılmıyor, arka planda içeride kalıyor". Measured on the rig: the table's frame
// (.tableWrap) has overflow: hidden and the menu was position: absolute inside it, so on a wide screen the frame's
// bottom edge hid the menu — on a tab with one row, all three items ("Open order", "Show link", "Cancel link")
// could not be pressed (elementFromPoint 0/3; after the fix 3/3, and below/above/phone all reachable).
//
//   1. the panel draws its row menu through RowActionsMenu, never as a role="menu" inside the table
//   2. RowActionsMenu puts the menu in a portal on <body>, position: fixed, placed by placeMenu, and the keyboard
//      works (↓ ↑ Home End, Esc gives the focus back, Tab goes on from the button)
//   3. the stylesheet: .menu is position: fixed (an absolute .menu inside .tableWrap is the bug)
//   4. the panel no longer closes the row menu from its own "press outside this row" listener — with the menu on
//      <body>, that listener would close it before its own item could be pressed
//   5. placeMenu: below when it fits, above when it does not, the roomier side with a scroll otherwise, the end
//      lined up with the button, never outside the window (left-to-right and Arabic)
//
// The source rules run first against known-bad mutants, so a rule that cannot fail is itself a failure.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const here = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const webRoot = path.resolve(process.argv[2] || here);
const read = (file: string) => {
  const full = path.join(webRoot, file);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
};
let checks = 0;
let failures = 0;
function expect(name: string, ok: boolean, detail = "") {
  checks += 1;
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}${detail ? `  <- ${detail}` : ""}`); }
}
console.log(`web root: ${webRoot}`);

const panel = read("components/PaymentLinksPanel.tsx");
const menu = read("components/RowActionsMenu.tsx");
const sheet = read("components/PaymentLinksPanel.module.css");
const placement = read("lib/studioflow/menuPlacement.ts");

const rule = (css: string, selector: string) => {
  const at = css.search(new RegExp(`(^|\\n)${selector.replace(/\./g, "\\.")}\\s*\\{`));
  if (at < 0) return "";
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
};

function problems(panelSource: string, menuSource: string, css: string): string[] {
  const out: string[] = [];
  // 1. the panel
  if (!/import RowActionsMenu, \{ type RowMenuItem \} from "@\/components\/RowActionsMenu";/.test(panelSource)) out.push("the panel does not use RowActionsMenu");
  if (!/const rowMenu = menuItems\.length \? \(\s*<RowActionsMenu[\s\S]*?menuClassName=\{s\.menu\}[\s\S]*?\/>\s*\) : null;/.test(panelSource)) out.push("the row menu is not a RowActionsMenu");
  if (/role="menu"/.test(panelSource)) out.push("the panel draws a role=\"menu\" itself (inside the table's frame)");
  // 4. the panel's own outside-press listener leaves the row menu alone
  const listener = panelSource.slice(panelSource.indexOf("const filterRef = useRef"), panelSource.indexOf("const latest = useRef(0);"));
  if (/setMenuFor\(""\)/.test(listener) || /data-row-menu/.test(listener)) out.push("the panel's press-outside listener still closes the row menu (it would swallow the item's press)");
  // 2. the component
  if (!/createPortal\(\s*<div[\s\S]*?role="menu"[\s\S]*?document\.body\s*\)/.test(menuSource)) out.push("the menu is not a portal on <body>");
  if (!/position: "fixed"/.test(menuSource)) out.push("the menu is not position: fixed");
  if (!/setPlace\(placeMenu\(box, size,/.test(menuSource)) out.push("the menu is not placed from the button's rectangle");
  if (!/visibility: place \? "visible" : "hidden"/.test(menuSource)) out.push("the menu can flash in the corner before it is placed");
  if (!/window\.addEventListener\("scroll", follow, \{ capture: true, passive: true \}\)/.test(menuSource) || !/window\.addEventListener\("resize", follow\)/.test(menuSource)) out.push("the menu does not follow the page");
  if (!/document\.addEventListener\("pointerdown", outside, true\)/.test(menuSource) || !/menuRef\.current\?\.contains\(target\)/.test(menuSource)) out.push("a press elsewhere does not close it, or a press on it does");
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) if (!new RegExp(`case "${key}":`).test(menuSource)) out.push(`the menu ignores ${key}`);
  if (!/case "Escape":\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*close\(true\);/.test(menuSource)) out.push("Esc does not close the menu and give the focus back");
  if (!/case "Tab": \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?focusBeside\(trigger, event\.shiftKey \? -1 : 1\);/.test(menuSource)) out.push("Tab does not go on from the button");
  if (!/aria-haspopup="menu"/.test(menuSource) || !/aria-expanded=\{open\}/.test(menuSource) || !/role="menuitem"/.test(menuSource)) out.push("the menu button's ARIA is missing");
  // 3. the stylesheet
  const menuRule = rule(css, ".menu");
  if (!/position:\s*fixed/.test(menuRule)) out.push(".menu is not position: fixed");
  if (/position:\s*absolute/.test(menuRule)) out.push(".menu is absolute (clipped by .tableWrap)");
  if (!/z-index:\s*var\(--z-floating-menu/.test(menuRule)) out.push(".menu is not on the floating-menu layer");
  return out;
}

const mutants: Array<[string, string, string, string]> = [
  ["the menu back inside the row", panel.replace(/<RowActionsMenu[\s\S]*?\/>/, '<span className={s.menuWrap}><span className={s.menu} role="menu" /></span>'), menu, sheet],
  ["no portal", panel, menu.replace("document.body\n        )", "triggerRef.current!.parentElement!\n        )"), sheet],
  ["absolute again", panel, menu, sheet.replace(/\.menu \{\n  position: fixed;/, ".menu {\n  position: absolute;")],
  ["the panel closes the menu on mousedown", panel.replace('if (filterRef.current && !filterRef.current.contains(target as Node)) setFilterOpen(false);', 'if (!target?.closest?.(`[data-row-menu="${menuFor}"]`)) setMenuFor("");\n      if (filterRef.current && !filterRef.current.contains(target as Node)) setFilterOpen(false);'), menu, sheet],
  ["Tab left to the browser", panel, menu.replace("focusBeside(trigger, event.shiftKey ? -1 : 1);", ""), sheet],
  ["Esc keeps the focus in the void", panel, menu.replace(/case "Escape":([\s\S]*?)close\(true\);/, 'case "Escape":$1close(false);'), sheet],
  ["no scroll follow", panel, menu.replace('window.addEventListener("scroll", follow, { capture: true, passive: true });', ""), sheet],
];
for (const [name, a, b, c] of mutants) {
  const found = a === panel && b === menu && c === sheet ? [] : problems(a, b, c);
  expect(`rules catch the mutant: ${name}`, found.length > 0, "the mutant did not apply, or passed");
}
const real = problems(panel, menu, sheet);
expect("the row menu opens in its own layer and works from the keyboard", real.length === 0, real.join("; "));

// 5. placement
const placementFile = path.join(webRoot, "lib/studioflow/menuPlacement.ts");
if (!placement) {
  expect("placeMenu exists (lib/studioflow/menuPlacement.ts)", false, "missing");
} else {
  const { placeMenu, MENU_GAP, MENU_EDGE } = await import(pathToFileURL(placementFile).href) as typeof import("../lib/studioflow/menuPlacement.ts");
  const view = { width: 1366, height: 820 };
  const size = { width: 190, height: 120 };
  const button = (top: number, right = 1300) => ({ top, bottom: top + 34, left: right - 36, right });
  const low = placeMenu(button(300), size, view);
  expect("room below → under the button, ends lined up", !low.above && low.top === 334 + MENU_GAP && low.left === 1300 - 190 && low.maxHeight === 120, JSON.stringify(low));
  const atBottom = placeMenu(button(760), size, view);
  expect("no room below → over the button", atBottom.above && atBottom.top === 760 - MENU_GAP - 120 && atBottom.maxHeight === 120, JSON.stringify(atBottom));
  const tall = placeMenu(button(200), { width: 190, height: 900 }, view);
  expect("taller than either side → the roomier side, scrolling", !tall.above && tall.top === 234 + MENU_GAP && tall.maxHeight === view.height - MENU_EDGE - (234 + MENU_GAP), JSON.stringify(tall));
  const tallLow = placeMenu(button(700), { width: 190, height: 900 }, view);
  expect("…over the button when that side is roomier", tallLow.above && tallLow.top === MENU_EDGE && tallLow.maxHeight === 700 - MENU_GAP - MENU_EDGE, JSON.stringify(tallLow));
  const phone = placeMenu({ top: 400, bottom: 434, left: 330, right: 366 }, size, { width: 390, height: 844 });
  expect("phone: inside the window", phone.left >= MENU_EDGE && phone.left + 190 <= 390 - MENU_EDGE + 0.5, JSON.stringify(phone));
  const leftEdge = placeMenu({ top: 400, bottom: 434, left: 10, right: 46 }, size, view);
  expect("never off the left edge", leftEdge.left === MENU_EDGE, JSON.stringify(leftEdge));
  const rtl = placeMenu({ top: 400, bottom: 434, left: 60, right: 96 }, size, view, true);
  expect("Arabic: starts at the button's start", rtl.left === 60, JSON.stringify(rtl));
  const rtlEdge = placeMenu({ top: 400, bottom: 434, left: 1300, right: 1336 }, size, view, true);
  expect("Arabic: never off the right edge", rtlEdge.left === 1366 - MENU_EDGE - 190, JSON.stringify(rtlEdge));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);

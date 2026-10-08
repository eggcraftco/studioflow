// Collapsed-rail account menu (8 Oct 2026).
//
// With the sidebar collapsed (68 px rail, overflow hidden) the account menu
// at the bottom of the sidebar was squeezed inside the rail. The fix floats
// it outside the rail. This script asserts, from the source alone (no
// browser): the menu element gets `is-floating` only when the rail is
// collapsed and the anchor was measured, the popover CSS rule exists with
// position fixed, a min-width of at least 240 px, and a z-index above the
// rail's drawer form (80) and the top-row menus (40); focus moves into the
// menu; Escape and outside clicks still close it; the drawer (< 1024 px) is
// excluded by the matchMedia gate.
//
//   node scripts/check-rail-account-menu.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const shell = read("components/AppShell.tsx");
const css = read("app/globals.css");
const failures = [];
let checks = 0;
const check = (label, ok) => {
  checks += 1;
  if (!ok) failures.push(label);
};

// 1. The menu element carries is-floating only in the floating state.
const menuStart = shell.indexOf('id="app-sidebar-user-menu"');
check("menu element found", menuStart > 0);
const menuTag = shell.slice(menuStart, shell.indexOf(">", menuStart));
check(
  "is-floating class is conditional on accountMenuFloats",
  /accountMenuFloats\s*\?\s*"app-sidebar-user-menu toolbar-avatar-menu is-floating"\s*:\s*"app-sidebar-user-menu toolbar-avatar-menu"/.test(menuTag),
);
check(
  "accountMenuFloats requires open + collapsed + measured anchor",
  /const accountMenuFloats = avatarMenuOpen && sidebarCollapsed && railMenuAnchor !== null;/.test(shell),
);
check("floating only at >= 1024 px (the drawer below keeps the in-block menu)", shell.includes('window.matchMedia("(min-width: 1024px)").matches'));
check("anchor measured from the avatar button and the rail", shell.includes("button.getBoundingClientRect()") && shell.includes("rail.getBoundingClientRect()"));
check("RTL anchors to the left of the rail", /rtl \? window\.innerWidth - railRect\.left \+ 8 : null/.test(shell));
check("LTR anchors to the right of the rail", /rtl \? null : railRect\.right \+ 8/.test(shell));
check("inline style carries bottom/left/right from the anchor", /bottom: railMenuAnchor\.bottom,\s*left: railMenuAnchor\.left \?\? "auto",\s*right: railMenuAnchor\.right \?\? "auto",/.test(shell));
check("focus moves into the floating menu", /if \(!accountMenuFloats\) return;[\s\S]{0,200}\[role="menuitem"\]'\);\s*first\?\.focus\(\);/.test(shell));
check("Escape still closes", /if \(event\.key === "Escape"\) setAvatarMenuOpen\(false\);/.test(shell));
check("outside pointerdown still closes (menu stays a DOM child of the block)", /if \(target && sidebarUserRef\.current\?\.contains\(target\)\) return;\s*setAvatarMenuOpen\(false\);/.test(shell));
check("resize closes a floating menu", /function handleResize\(\) \{\s*if \(railMenuAnchor !== null\) setAvatarMenuOpen\(false\);/.test(shell));
check("expanded sidebar keeps the in-block menu (anchor null)", /\} else \{\s*setRailMenuAnchor\(null\);\s*\}/.test(shell));

// 2. The popover CSS rule.
const ruleMatch = css.match(/\.app-sidebar\.is-collapsed \.app-sidebar-user-menu\.is-floating \{([^}]*)\}/);
check("popover rule exists", !!ruleMatch);
const rule = ruleMatch ? ruleMatch[1] : "";
const prop = (name) => {
  const m = rule.match(new RegExp(`\\b${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
};
check("position: fixed (escapes the rail's overflow: hidden)", prop("position") === "fixed");
check("min-width >= 240px", parseInt(prop("min-width") ?? "0", 10) >= 240);
// The z-index may be a ladder token (`var(--z-floating-menu)`, see the :root
// ladder in globals.css) — resolve it against the ladder before comparing.
const zRaw = prop("z-index") ?? "0";
const ladder = (name) => parseInt((css.match(new RegExp(`${name}:\\s*(\\d+)`)) || [])[1] ?? "0", 10);
const z = /var\(--([\w-]+)\)/.test(zRaw) ? ladder(`--${zRaw.match(/var\(--([\w-]+)\)/)[1]}`) : parseInt(zRaw, 10);
check("z-index above the drawer (80) and the top-row menus (40)", z > 80);
check("overflow: auto for short windows", prop("overflow") === "auto" && !!prop("max-height"));
check("rail still clips its overflow (the reason the menu must leave it)", /\.app-sidebar \{[^}]*overflow: hidden;/.test(css));
// No ancestor of the sidebar at >= 1024 px may have a transform or filter,
// or position: fixed would be trapped inside it. The drawer transform lives
// only in the < 1024 px media block, and is-collapsed there is the same drawer.
const desktopCss = css.replace(/@media[^{]*max-width: 1023px[^{]*\{[\s\S]*?\n\}\n/g, "");
for (const selector of [".app-shell-fixed", ".shell-container", ".app-shell-frame", ".app-shell-body", ".app-sidebar"]) {
  const re = new RegExp(`(^|\\n)${selector.replace(/\./g, "\\.")}(,[^{]*)? \\{([^}]*)\\}`, "g");
  let m;
  while ((m = re.exec(desktopCss))) {
    check(`${selector} has no transform/filter on desktop`, !/\b(transform|filter):(?!\s*none)/.test(m[3]) || /backdrop-filter/.test(m[3]));
  }
}

console.log(`check-rail-account-menu: ${checks - failures.length}/${checks} passed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);

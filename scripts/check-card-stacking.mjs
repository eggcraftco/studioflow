// Card controls stay under the sticky bars (8 Oct 2026).
//
// 1. app/globals.css declares the z-index ladder on :root and its tiers are
//    strictly ordered: content tiers <= --z-content-max < --z-sticky-header
//    < --z-topbar < --z-drawer < --z-modal < --z-floating-menu.
// 2. No rule that belongs to a card's inside (order-card-*, order-detail-card*,
//    block-custom-* except the page-level .is-modal backdrop, schedule blocks
//    and handles) sets a z-index above --z-content-max, let alone the top bar.
// 3. The order detail head and the schedule month header sit on
//    --z-sticky-header; the native top bar on --z-topbar; the colour-labels
//    modal on --z-modal.
// 4. The order view closes both card popovers when the pane scrolls, so an
//    open popover cannot slide over the sticky head.
//
//   node scripts/check-card-stacking.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
const tsx = fs.readFileSync(path.join(root, "app/orders/OrderDetailContent.tsx"), "utf8");
const failures = [];
let checks = 0;
const ok = (name, condition) => { checks += 1; if (!condition) failures.push(name); };

// --- 1. the ladder
const vars = {};
for (const m of css.matchAll(/^\s*(--z-[a-z-]+):\s*(-?\d+);/gm)) vars[m[1]] = Number(m[2]);
const expected = {
  "--z-content-handle": 2, "--z-content-control": 4, "--z-content-control-raised": 5,
  "--z-content-active": 6, "--z-content-overlay": 8, "--z-content-max": 10,
  "--z-local-backdrop": 1, "--z-local-popover": 2,
  "--z-sticky-header": 30, "--z-topbar": 55, "--z-drawer": 80, "--z-modal": 100, "--z-floating-menu": 120
};
for (const [name, value] of Object.entries(expected)) ok(`${name} = ${value} (got ${vars[name]})`, vars[name] === value);
const contentTiers = ["--z-content-handle", "--z-content-control", "--z-content-control-raised", "--z-content-active", "--z-content-overlay", "--z-local-backdrop", "--z-local-popover"];
for (const t of contentTiers) ok(`${t} <= --z-content-max`, vars[t] <= vars["--z-content-max"]);
ok("content-max < sticky-header", vars["--z-content-max"] < vars["--z-sticky-header"]);
ok("sticky-header < topbar", vars["--z-sticky-header"] < vars["--z-topbar"]);
ok("topbar < drawer", vars["--z-topbar"] < vars["--z-drawer"]);
ok("drawer < modal", vars["--z-drawer"] < vars["--z-modal"]);
ok("modal < floating-menu", vars["--z-modal"] < vars["--z-floating-menu"]);

// --- 2. every rule: selector -> z-index (literal or var), resolved
const rules = [];
const re = /([^{}]+)\{([^{}]*)\}/g;
for (const m of css.matchAll(re)) {
  const selector = m[1].trim().split("\n").pop().trim();
  const z = m[2].match(/z-index:\s*([^;]+);/);
  if (!z) continue;
  const raw = z[1].trim();
  const v = raw.match(/^var\((--z-[a-z-]+)\)$/);
  const value = v ? vars[v[1]] : (/^-?\d+$/.test(raw) ? Number(raw) : NaN);
  rules.push({ selector, raw, value, viaVar: Boolean(v) });
}
ok("rules were parsed", rules.length > 50);
const cardInternal = /(^|[\s,>+~])\.(order-card-[a-z-]+|order-detail-card[a-z-]*|block-custom-(backdrop|panel)|schedule-(resize-handle|drag-preview|order-block))/;
const pageLevel = /\.block-custom-backdrop\.is-modal/;
const internalRules = rules.filter(r => cardInternal.test(r.selector) && !pageLevel.test(r.selector));
ok("card-internal z-index rules found", internalRules.length >= 10);
for (const r of internalRules) {
  ok(`${r.selector} uses a ladder variable (${r.raw})`, r.viaVar);
  ok(`${r.selector} z ${r.value} <= --z-content-max`, Number.isFinite(r.value) && r.value <= vars["--z-content-max"]);
  ok(`${r.selector} z ${r.value} < --z-topbar`, Number.isFinite(r.value) && r.value < vars["--z-topbar"]);
}
for (const r of rules) {
  if (r.raw.startsWith("var(")) ok(`${r.selector}: ${r.raw} resolves`, Number.isFinite(r.value));
}

// --- 3. the bars
const find = (sel) => rules.find(r => r.selector === sel);
ok(".order-detail-head on --z-sticky-header", find(".order-detail-head")?.raw === "var(--z-sticky-header)");
ok(".order-detail-head is sticky", /\.order-detail-head \{\s*position: sticky;/.test(css));
ok(".schedule-month-header on --z-sticky-header", find(".schedule-month-header")?.raw === "var(--z-sticky-header)");
ok(".app-toolbar-native on --z-topbar", find(".app-toolbar-native")?.raw === "var(--z-topbar)");
ok(".block-custom-backdrop.is-modal on --z-modal", find(".block-custom-backdrop.is-modal")?.raw === "var(--z-modal)");
ok(".order-card-purpose.is-popover on --z-local-popover", find(".order-card-purpose.is-popover")?.raw === "var(--z-local-popover)");
ok(".order-card-menu-wrap on --z-content-control-raised", find(".order-card-menu-wrap")?.raw === "var(--z-content-control-raised)");

// --- 4. popovers close on scroll
ok("order view closes popovers on scroll (capture)", /window\.addEventListener\("scroll", onScroll, true\)/.test(tsx)
  && /setOpenCardInfoId\(null\);\s*setOpenCardMenuId\(null\);/.test(tsx)
  && /closest\("\.block-custom-panel, \.order-card-purpose"\)/.test(tsx));

if (failures.length) {
  console.error(`check-card-stacking: ${failures.length} of ${checks} checks failed`);
  for (const f of failures) console.error(" - " + f);
  process.exit(1);
}
console.log(`check-card-stacking: ${checks} checks passed`);

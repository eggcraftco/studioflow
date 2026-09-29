// The Home cards' size and grid (29 Sep 2026).
//
// 1. How many columns, and how big a square. The stylesheet chooses four, three or two columns from
//    the width Home has so that a 1x1 is never drawn under 270px, and stops a 1x1 growing at 340px.
//    Four columns were kept at every width above the phone, so a 1x1 came out at 171-238px beside the
//    sidebar, and the square unit was never even set: the script that published it attached before
//    the grid existed. The rules are read from app/globals.css and their numbers checked against
//    each other (1128 = 4 x 270 + 3 x 16, 842 = 3 x 270 + 2 x 16).
// 2. How a narrower grid is packed. A layout is arranged in four columns; in three or two, a 2x1
//    that does not fit the space left on a row starts the next one and left a gap behind it. With
//    fillRows the card that ends a row takes that space: no row ends in a gap, the reading order
//    never changes, no card is drawn smaller than its own size. Without fillRows (four columns, and
//    the phone's two) the packing is exactly the live one — a frozen copy of it is compared below.
//    lib/studioflow/homeGrid.ts is compiled with the tree's own TypeScript and run.
// 3. The page and the cards use it: the grid is measured once it exists, fillRows is passed for a
//    non-phone grid under four columns, a widened 1x1 is drawn as the 2x1 it has become, and the
//    square's headline figures take the size that fits their card.
//
//   node scripts/check-home-cards.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
let checks = 0;
const expect = (name, actual, wanted) => {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
};
const has = (name, text, pattern) => {
  checks += 1;
  if (!pattern.test(text)) failures.push(`${name}: ${pattern} not found`);
};
const hasNot = (name, text, pattern) => {
  checks += 1;
  if (pattern.test(text)) failures.push(`${name}: ${pattern} is still there`);
};

// ---- 1. the stylesheet
const css = read("app/globals.css");
const MIN = 270;
const GAP = 16;
has("the unit is registered as a length", css, /@property --home-unit \{ syntax: "<length>"; inherits: true; initial-value: 270px; \}/);
has("Home is a size container", css, /\.home-screen \{[^}]*container: home-screen \/ inline-size;[^}]*\}/);
hasNot("the 1016px cap on Home is gone", css, /\.home-screen \{[^}]*max-width: 1016px/);
has("Home opts out of the shell's 1180px content column", css,
  /\.app-shell-scroll-area > \.app-shell-content:has\(> \.home-screen\) \{ max-width: none; \}/);
const maxMatch = css.match(/--home-unit-max: (\d+)px;/);
const gapMatch = css.match(/\.home-screen \{[^}]*--home-gap: (\d+)px;/);
expect("the largest square", maxMatch ? Number(maxMatch[1]) : null, 340);
expect("the gap", gapMatch ? Number(gapMatch[1]) : null, GAP);
const q3 = css.match(/@container home-screen \(max-width: ([\d.]+)px\) \{ \.home-screen > \* \{ --home-cols: 3; \} \}/);
const q2 = css.match(/@container home-screen \(max-width: ([\d.]+)px\) \{ \.home-screen > \* \{ --home-cols: 2; \} \}/);
expect("three columns under 4 x 270 + 3 gaps", q3 ? Math.ceil(Number(q3[1])) : null, 4 * MIN + 3 * GAP);
expect("two columns under 3 x 270 + 2 gaps", q2 ? Math.ceil(Number(q2[1])) : null, 3 * MIN + 2 * GAP);
has("four columns by default", css, /\.home-screen > \* \{\s*--home-cols: 4;/);
has("every row of the screen is as wide as the grid under it", css,
  /max-width: calc\(var\(--home-cols\) \* var\(--home-unit-max\) \+ \(var\(--home-cols\) - 1\) \* var\(--home-gap\)\);/);
has("the grid's columns follow the count", css, /grid-template-columns: repeat\(var\(--home-cols\), minmax\(0, 1fr\)\);/);
has("the square is derived in CSS from Home's own width", css,
  /--home-unit: min\(var\(--home-unit-max\), calc\(\(100cqi - \(var\(--home-cols\) - 1\) \* var\(--home-gap\)\) \/ var\(--home-cols\)\)\);/);
has("rows are the square", css, /grid-auto-rows: var\(--home-unit\);/);
hasNot("no 236px fallback row is left", css, /var\(--home-unit, 236px\)/);
has("the phone's square uses the phone's 12px gap", css, /\.home-screen \{ --home-gap: 12px; \}/);
has("the square's headline fits its card", css,
  /\.home-card-1x1 \.home-money:not\(\[class\*="is-"\]\) > \.home-metric-value \{\s*font-size: min\(36px, calc\(\(100cqi - 28px\) \/ \(var\(--figure-chars, 1\) \* 0\.62\)\)\);/);
has("the square's two figures fit their half", css,
  /\.home-card-1x1 \.home-money:not\(\[class\*="is-"\]\) > \.home-split-pair b \{\s*font-size: min\(19px, calc\(\(100cqi - 52px\) \/ 2 \/ \(var\(--figure-chars, 1\) \* 0\.62\)\)\);/);
// A clipping box in a flex column may shrink below its own line: the phone's Banking square squeezed
// its one-line freshness note to 4-11px and cut the letters in half (29 Sep, measured in six languages).
has("the phone square's freshness line keeps its height", css,
  /\.home-card\.is-square \.home-sync-line \{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; flex-shrink: 0; margin: 0; \}/);
has("and the square that carries it gives it the room", css,
  /\.home-card\.is-square \.home-money:not\(\[class\*="is-"\]\):has\(> \.home-sync-line\) \{ gap: 2px; \}/);
// Arithmetic of the rule, at the widths the round was measured at (the grid's own width).
const columnsFor = (width) => (width >= 4 * MIN + 3 * GAP ? 4 : width >= 3 * MIN + 2 * GAP ? 3 : 2);
const unitFor = (width) => { const n = columnsFor(width); return Math.min(340, (width - (n - 1) * GAP) / n); };
for (const [label, width, cols, unit] of [
  ["1920 open", 1628, 4, 340], ["1440 open", 1148, 4, 275], ["1440 folded", 1312, 4, 316], ["1280 open", 988, 3, 318.67],
  ["1280 folded", 1152, 4, 276], ["1024 open", 732, 2, 340], ["1024 folded", 896, 3, 288], ["834", 794, 2, 340],
]) {
  expect(`${label}: columns`, columnsFor(width), cols);
  expect(`${label}: square`, Math.round(unitFor(width) * 100) / 100, unit);
  checks += 1;
  if (unitFor(width) < MIN) failures.push(`${label}: a 1x1 of ${unitFor(width)}px is under ${MIN}px`);
}

// ---- 2. the packing, compiled and run
const cards = read("lib/studioflow/homeCards.ts");
const helpers = ["homeCardColumns", "homeCardRows"].map((name) => {
  const m = cards.match(new RegExp(`export function ${name}\\(size: HomeCardSize\\) \\{[\\s\\S]*?\\n\\}`));
  if (!m) { console.error(`homeCards.ts: ${name} not found`); process.exit(1); }
  return m[0];
}).join("\n");
const grid = read("lib/studioflow/homeGrid.ts")
  .replace(/^import \{[^}]*\} from "@\/lib\/studioflow\/homeCards";\n/m,
    `type HomeCardSize = "1x1" | "2x1" | "2x2";\ntype HomeCardPlacement = { id: string; size: HomeCardSize };\n${helpers}\n`);
const js = ts.transpileModule(grid, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "home-cards-")), "grid.mjs");
fs.writeFileSync(tmp, js);
const { packHomeGrid } = await import(pathToFileURL(tmp).href);

// The live packer (publish e96ef1f1), frozen: with fillRows off the new one must agree with it exactly.
function livePack(placements, columnCount) {
  const cols = (s) => (s === "1x1" ? 1 : 2); const rowsOf = (s) => (s === "2x2" ? 2 : 1);
  const taken = new Set(); const slots = []; let cursorRow = 0; let cursorColumn = 0;
  const fits = (row, column, width, height) => { for (let r = 0; r < height; r += 1) for (let c = 0; c < width; c += 1) if (taken.has(`${row + r}:${column + c}`)) return false; return true; };
  placements.forEach((placement, index) => {
    const width = Math.min(cols(placement.size), columnCount); const height = rowsOf(placement.size);
    let row = cursorRow; let column = cursorColumn;
    for (;;) { if (column + width > columnCount) { row += 1; column = 0; continue; } if (fits(row, column, width, height)) break; column += 1; }
    for (let r = 0; r < height; r += 1) for (let c = 0; c < width; c += 1) taken.add(`${row + r}:${column + c}`);
    slots.push({ id: placement.id, index, row, column, width, height }); cursorRow = row; cursorColumn = column + width;
  });
  return slots;
}
const L = (...specs) => specs.map((spec) => { const [id, size] = spec.split(":"); return { id, size }; });
const DEFAULT = L("gettingStarted:2x1", "quickActions:1x1", "recentActivity:1x1", "money:1x1", "banking:1x1", "inventory:1x1",
  "customers:1x1", "ordersProduction:2x1", "schedule:2x1", "files:2x1", "notes:2x1");
const MIXED = L("money:1x1", "ordersProduction:2x1", "quickActions:1x1", "schedule:2x2", "banking:1x1", "inventory:1x1",
  "recentActivity:2x1", "customers:1x1", "notes:2x1", "files:1x1", "gettingStarted:2x1");
const LARGE = L("money:2x2", "ordersProduction:2x2", "schedule:2x2", "banking:2x2");
const ODD = L("a:1x1", "b:2x1", "c:1x1", "d:1x1", "e:1x1", "f:2x2", "g:1x1", "h:2x1", "i:1x1");
const LAYOUTS = { DEFAULT, MIXED, LARGE, ODD };
const brief = (g) => g.slots.map((s) => `${s.placement.id}@${s.row},${s.column}+${s.width}x${s.height}`);
const endGaps = (g, columnCount) => {
  const taken = new Set(); g.slots.forEach((s) => { for (let r = 0; r < s.height; r += 1) for (let c = 0; c < s.width; c += 1) taken.add(`${s.row + r}:${s.column + c}`); });
  const gaps = [];
  for (let row = 0; row < g.rows; row += 1) {
    const used = [...Array(columnCount).keys()].filter((c) => taken.has(`${row}:${c}`));
    if (used.length && Math.max(...used) < columnCount - 1) gaps.push(row);
  }
  return gaps;
};
for (const [name, layout] of Object.entries(LAYOUTS)) {
  for (const columns of [4, 3, 2]) {
    const plain = packHomeGrid(layout, columns);
    expect(`${name} in ${columns} columns, no fillRows: exactly the live packing`,
      plain.slots.map((s) => ({ id: s.placement.id, index: s.index, row: s.row, column: s.column, width: s.width, height: s.height })),
      livePack(layout, columns));
    expect(`${name} in ${columns} columns, no fillRows: every card drawn at its own size`,
      plain.slots.every((s) => s.drawnSize === s.placement.size), true);
    const filled = packHomeGrid(layout, columns, { fillRows: true });
    expect(`${name} in ${columns} columns, fillRows: reading order unchanged`, filled.slots.map((s) => s.placement.id), layout.map((p) => p.id));
    expect(`${name} in ${columns} columns, fillRows: no card narrower or shorter than its own size`,
      filled.slots.every((s) => s.width >= Math.min(s.placement.size === "1x1" ? 1 : 2, columns) && s.height === (s.placement.size === "2x2" ? 2 : 1)), true);
    expect(`${name} in ${columns} columns, fillRows: the same rows as without it`, filled.rows, plain.rows);
    expect(`${name} in ${columns} columns, fillRows: each card starts where it started`,
      filled.slots.map((s) => [s.row, s.column]), plain.slots.map((s) => [s.row, s.column]));
    expect(`${name} in ${columns} columns, fillRows: a 1x1 two columns wide is drawn as a 2x1`,
      filled.slots.every((s) => s.placement.size !== "1x1" || (s.width >= 2) === (s.drawnSize === "2x1")), true);
  }
}
// The default layout, arranged in four columns, in three: the gap down the right-hand column is gone.
expect("DEFAULT in 3 columns without fillRows leaves the right-hand column empty on five rows",
  endGaps(packHomeGrid(DEFAULT, 3), 3), [2, 3, 4, 5, 6]);
expect("DEFAULT in 3 columns with fillRows: no row ends in a gap", endGaps(packHomeGrid(DEFAULT, 3, { fillRows: true }), 3), []);
expect("DEFAULT in 3 columns with fillRows: the placement", brief(packHomeGrid(DEFAULT, 3, { fillRows: true })), [
  "gettingStarted@0,0+2x1", "quickActions@0,2+1x1", "recentActivity@1,0+1x1", "money@1,1+1x1", "banking@1,2+1x1",
  "inventory@2,0+1x1", "customers@2,1+2x1", "ordersProduction@3,0+3x1", "schedule@4,0+3x1", "files@5,0+3x1", "notes@6,0+3x1",
]);
expect("DEFAULT in 3 columns with fillRows: Customers is drawn as a 2x1",
  packHomeGrid(DEFAULT, 3, { fillRows: true }).slots.find((s) => s.placement.id === "customers").drawnSize, "2x1");
expect("DEFAULT in 3 columns with fillRows: no hole is left to drop into", packHomeGrid(DEFAULT, 3, { fillRows: true }).holes, []);
expect("DEFAULT in 4 columns: no hole at all", packHomeGrid(DEFAULT, 4).holes, []);
expect("DEFAULT in 2 columns with fillRows: no row ends in a gap", endGaps(packHomeGrid(DEFAULT, 2, { fillRows: true }), 2), []);
for (const [name, layout] of Object.entries(LAYOUTS)) {
  for (const columns of [3, 2]) {
    const filled = packHomeGrid(layout, columns, { fillRows: true });
    // A 2x2 beside a card that holds only one of its two rows cannot widen, and that row keeps its
    // gap as a drop target; every other row ends at the grid's edge.
    const allowed = new Set();
    filled.slots.filter((s) => s.height === 2).forEach((s) => {
      const beside = filled.slots.some((o) => o !== s && o.column > s.column && o.row < s.row + 2 && o.row + o.height > s.row);
      if (beside) { allowed.add(s.row); allowed.add(s.row + 1); }
    });
    expect(`${name} in ${columns} columns, fillRows: rows end at the edge (except beside a 2x2 that could not widen)`,
      endGaps(filled, columns).filter((row) => !allowed.has(row)), []);
  }
}
// A 2x2 widens only when the space beside it is free on both of its rows.
expect("a 2x2 alone on its rows takes the third column", brief(packHomeGrid(L("x:2x2", "y:2x1"), 3, { fillRows: true })),
  ["x@0,0+3x2", "y@2,0+3x1"]);
expect("a 2x2 with a 1x1 beside one row keeps its width", brief(packHomeGrid(L("x:2x2", "y:1x1", "z:2x1"), 3, { fillRows: true })),
  ["x@0,0+2x2", "y@0,2+1x1", "z@2,0+3x1"]);

// ---- 3. the page and the cards
const page = read("app/home/page.tsx");
has("the grid is measured once it exists (a state callback ref)", page, /<div className="home-grid" ref=\{setGridNode\}>/);
has("the measuring effect runs when the grid appears", page, /\}, \[gridNode\]\);/);
hasNot("the page no longer writes the unit itself", page, /setProperty\("--home-unit"/);
has("a grid narrower than four columns fills its rows, not the phone's", page,
  /fillRows: columnCount !== null && columnCount < 4 && !phoneGrid,/);
has("the phone is recognised by the stylesheet's own breakpoint", page, /setPhoneGrid\(window\.matchMedia\("\(max-width: 640px\)"\)\.matches\);/);
has("each card is drawn at its drawn size", page, /drawnSize=\{drawnOf\(index\)\}/);
has("the body follows the drawn size", page, /\{renderBody\(placement\.id, drawnOf\(index\), placement\.period \?\? "month"\)\}/);
const shell = read("components/home/HomeCardShell.tsx");
has("the shell's size class is the drawn size", shell, /`home-card-\$\{shownSize\}`/);
has("the menu still offers and marks the card's own size", shell, /aria-checked=\{placement\.size === size\}/);
const bodies = read("components/home/HomeCardBodies.tsx");
for (const [label, pattern] of [
  ["Money's headline", /style=\{figureFit\(money\(profit\)\)\}>\{money\(profit\)\}<\/strong>/],
  ["Money's revenue", /style=\{figureFit\(money\(revenue\)\)\}>\{money\(revenue\)\}<\/b>/],
  ["Money's outstanding", /style=\{figureFit\(money\(outstanding\)\)\}>\{money\(outstanding\)\}<\/b>/],
  ["Banking's headline", /style=\{figureFit\(money\(spent\)\)\}>\{money\(spent\)\}<\/strong>/],
  ["Banking's incoming", /style=\{figureFit\(`\+\$\{money\(incoming\)\}`\)\}>\+\{money\(incoming\)\}<\/b>/],
  ["Inventory's headline", /style=\{figureFit\(money\(summary\.totalValue\)\)\}>\{money\(summary\.totalValue\)\}<\/strong>/],
]) has(`${label} carries its length for the stylesheet`, bodies, pattern);

if (failures.length) {
  console.error(`check-home-cards: ${failures.length} of ${checks} checks failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-home-cards: all ${checks} checks pass — a 1x1 is 270-340px (four, three or two columns from the width Home has), the square is set in CSS, a narrower grid fills its rows without reordering, and the square's figures fit their card.`);

/**
 * F1 (2.5 r8 test, 8 Nov 2026): Home's wide (2x1) Quick actions card on a phone.
 *
 * Below 900px the card used to switch to two columns — three rows of two — and a phone's 2x1 body is about 124px:
 * the second row was cut in half and the third (Add inventory item, Scan receipt) never showed. Since the Getting
 * started card left (7 Nov) this is the first card of the default Home, so every new account met it.
 * It stays three across and two down at every width; on narrow screens the icon stacks over the label and a label
 * may take two lines.
 *
 * Run: npx tsx scripts/check-quick-actions-2x1.mts [path/to/globals.css]
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(process.argv[2] || join(ROOT, "app/globals.css"), "utf8");
const bodies = readFileSync(join(ROOT, "components/home/HomeCardBodies.tsx"), "utf8");

let passed = 0;
let failed = 0;
function check(name: string, run: () => void) {
  try { run(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message.split("\n")[0]}`); }
}

/** Every declaration block whose selector list names the wide card's action grid itself. */
const GRID = ".home-card-2x1 .home-action-grid.is-rows";
function gridBlocks(): string[] {
  const out: string[] = [];
  // Comments out first: their commas would split a selector list in the wrong place.
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(plain))) {
    const selectors = m[1].split(",").map((s) => s.trim().replace(/\s+/g, " "));
    if (selectors.some((s) => s === GRID)) out.push(m[2]);
  }
  return out;
}
function narrowBlock(): string {
  const start = css.indexOf("@media (max-width: 900px) {\n  .home-card-2x1 .home-action-grid.is-rows {");
  assert.ok(start >= 0, "no narrow-screen block for the wide card's grid");
  return css.slice(start, css.indexOf("\n}\n", start));
}

check("the wide card's grid is never two columns (three rows of two did not fit a phone card)", () => {
  const blocks = gridBlocks();
  assert.ok(blocks.length >= 2, `found ${blocks.length} grid rule(s)`);
  for (const block of blocks) assert.ok(!/grid-template-columns:\s*repeat\(2/.test(block), `two columns: ${block.trim()}`);
  assert.ok(blocks.some((b) => /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/.test(b)), "three columns missing");
});

check("below 900px the two rows share the body's height and a button stacks its icon over its label", () => {
  const block = narrowBlock();
  assert.ok(/height: 100%; grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)/.test(block));
  assert.ok(/\.home-action-row \{\s*flex-direction: column;/.test(block));
});

check("below 900px a label may take two lines before it is cut", () => {
  const block = narrowBlock();
  assert.ok(/white-space: normal;/.test(block) && /-webkit-line-clamp: 2;/.test(block));
});

check("the wide card still shows six actions (none hidden to make them fit)", () => {
  assert.ok(bodies.includes('{quickActions.slice(0, 6).map((action) => ('));
});

console.log(`\nquick-actions-2x1: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

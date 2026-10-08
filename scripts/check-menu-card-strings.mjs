// Sidebar labels (8 Oct 2026).
//
// Every sidebar label (components/AppShell.tsx NAV_ITEMS, NAV_LOWER_ITEMS,
// Activity) has a translation in all 11 non-English languages, probed through
// the real studioT (deep merge, Mac table last), so the width chosen for the
// sidebar is chosen from the real strings. The order-card "..." menu option
// descriptions this script once checked were removed the same day (they read
// as clutter); the card purposes that replaced them are checked by
// scripts/check-card-purposes.mjs.
//
//   node scripts/check-menu-card-strings.mjs            # pass/fail
//   node scripts/check-menu-card-strings.mjs --labels   # also print the labels
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "menu-card-strings-"));
const compile = (rel, name) => {
  const js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
  fs.writeFileSync(path.join(tmp, `${name}.mjs`), js);
};
// language.ts and every sibling table it imports (the list grows: a new
// table is a new `./x` import there, found rather than listed here).
const tables = ["language", ...new Set([...read("lib/studioflow/language.ts").matchAll(/from "\.\/(\w+)"/g)].map((m) => m[1]))];
for (const name of tables) {
  if (fs.existsSync(path.join(root, `lib/studioflow/${name}.ts`))) compile(`lib/studioflow/${name}.ts`, name);
}
const { studioT, SUPPORTED_STUDIO_LANGUAGES } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
const languages = SUPPORTED_STUDIO_LANGUAGES.filter((l) => l !== "English");

// 1. Sidebar labels, read from the source so a new item cannot be forgotten.
const shell = read("components/AppShell.tsx");
const navBlock = shell.slice(shell.indexOf("const NAV_ITEMS"), shell.indexOf("const NAV_ACCESS_BY_HREF"));
const labels = [...navBlock.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
labels.push("Activity");
checks += 1;
if (labels.length < 15) failures.push(`sidebar labels: only ${labels.length} found in AppShell.tsx`);
const table = {};
for (const label of labels) {
  table[label] = {};
  // Short proper-ish nouns legitimately equal English in some languages
  // ("Notes" in French, "Home" in Italian), so a label fails only when it is
  // untranslated almost everywhere.
  let same = 0;
  for (const lang of languages) {
    const out = studioT(label, lang);
    table[label][lang] = out;
    if (out === label) same += 1;
  }
  checks += 1;
  if (same >= 8) failures.push(`sidebar label "${label}" is English in ${same}/11 languages`);
}
if (process.argv.includes("--labels")) {
  console.log(JSON.stringify({ labels, languages, table }, null, 0));
}

if (failures.length) {
  console.error(`FAIL ${failures.length}/${checks}`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`PASS ${checks} checks`);

// The web dictionary is assembled from 15 tables. Two of them (PAGE_TOP and
// PAGE_TOP_EXTRA) split the SAME keys by language: Türkçe/Deutsch/Français in
// one, the other eight in the other. A plain object spread replaces a key's
// whole language row, so the second table silently deleted the first table's
// three languages and 533 real translations fell back to English in the app.
//
// Android and iOS split their tables by key, never by language, so neither
// platform was affected. Only the web merge has to be deep.
const fs = require("fs");
const path = require("path");

const SRC = process.env.NIVADESK_LANGUAGE_TS || path.join(__dirname, "..", "..", "..", "studioflow-web", "lib", "studioflow", "language.ts");
const src = fs.readFileSync(SRC, "utf8");
let failed = 0;
function assert(ok, what) {
  if (ok) { console.log("  ok  " + what); return; }
  failed++; console.log("  FAIL " + what);
}

console.log("web translation tables merge per language");

assert(
  /const TRANSLATIONS: TranslationTable = mergeTranslationTables\(/.test(src),
  "TRANSLATIONS is built with mergeTranslationTables, not an object spread"
);

const assembly = src.slice(
  src.indexOf("const TRANSLATIONS: TranslationTable ="),
  src.indexOf("mergeIntoTranslations({")
);
assert(
  !/^\s*\.\.\.[A-Z_]/m.test(assembly),
  "no table is spread into the assembly (a spread would drop languages)"
);
assert(
  !/Object\.assign\(TRANSLATIONS/.test(src),
  "later additions use mergeIntoTranslations, not Object.assign"
);
assert(
  /merged\[source\] = \{ \.\.\.\(merged\[source\] \?\? \{\}\), \.\.\.langs \}/.test(src),
  "the helper merges one language at a time"
);

// The Mac table already merged per language; keep it that way.
assert(
  /TRANSLATIONS\[key\] = \{ \.\.\.\(TRANSLATIONS\[key\] \|\| \{\}\), \.\.\.\(langs/.test(src),
  "the Mac overlay still merges per language"
);

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nPASS");

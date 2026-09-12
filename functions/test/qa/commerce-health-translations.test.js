// CARD-001 — every word the Sync health card's empty state shows, in every
// language the rest of the card already speaks.
//
// The card renders three pill labels and a sentence under each. The labels were
// translated long ago; the two new sentences were not, so a Turkish or Japanese
// merchant would have read a translated card with an English paragraph under
// it. Nothing here is written twice: the strings are taken out of the card's own
// source, and the language set is taken from an entry that already exists, so a
// fourth sentence added to the card tomorrow fails this test until it is
// translated too.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failures = 0;
function check(name, fn) {
  try { fn(); console.log("PASS ", name); }
  catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 400)); }
}

const web = path.join(__dirname, "..", "..", "..", "studioflow-web");
const cardSrc = fs.readFileSync(path.join(web, "app", "settings", "CommerceSyncHealthCard.tsx"), "utf8");
const langSrc = fs.readFileSync(path.join(web, "lib", "studioflow", "language.ts"), "utf8");

/** The string values of one `const NAME ... = { ... };` object in the card. */
function cardStrings(name) {
  const start = cardSrc.indexOf(`const ${name}`);
  assert.notStrictEqual(start, -1, `${name} is gone from the card`);
  const body = cardSrc.slice(start, cardSrc.indexOf("};", start));
  const values = [...body.matchAll(/:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));
  assert.ok(values.length >= 3, `${name} yielded ${values.length} strings, so the reader is broken`);
  return [...new Set(values)];
}

/** The language row of one source string in the web dictionary, wherever it is declared. */
function languagesFor(source) {
  const needle = `"${source.replace(/"/g, '\\"')}": {`;
  const at = langSrc.indexOf(needle);
  if (at === -1) return null;
  const row = langSrc.slice(at + needle.length, langSrc.indexOf("},", at));
  return [...row.matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)].map(([, language, text]) => ({ language, text }));
}

// The control: a label the card has shown in every language for months.
const CONTROL = "Not connected";
const expectedLanguages = (languagesFor(CONTROL) || []).map((row) => row.language).sort();

check("the control entry is there, so the reader works", () => {
  assert.ok(expectedLanguages.length >= 10, `the control carries ${expectedLanguages.length} languages`);
});

check("every empty-state string the card shows has a translation row", () => {
  const strings = [...cardStrings("EMPTY_STATE_LABEL"), ...cardStrings("EMPTY_STATE_DETAIL")];
  assert.ok(strings.length >= 5, `only ${strings.length} strings were read out of the card`);
  for (const source of strings) {
    assert.ok(languagesFor(source), `no translation entry for: ${source.slice(0, 70)}`);
  }
});

check("every empty-state string speaks every language the control speaks", () => {
  const strings = [...cardStrings("EMPTY_STATE_LABEL"), ...cardStrings("EMPTY_STATE_DETAIL")];
  for (const source of strings) {
    const rows = languagesFor(source);
    assert.ok(rows, `untranslated: ${source.slice(0, 70)}`);
    assert.deepStrictEqual(rows.map((row) => row.language).sort(), expectedLanguages, `language set differs for: ${source.slice(0, 50)}`);
    for (const row of rows) {
      assert.ok(row.text.trim().length > 0, `${row.language} is empty for: ${source.slice(0, 40)}`);
      assert.notStrictEqual(row.text, source, `${row.language} still carries the English text for: ${source.slice(0, 40)}`);
    }
  }
});

check("the new table is actually merged into the dictionary", () => {
  // A table that is declared and never merged translates nothing.
  assert.match(langSrc, /const COMMERCE_HEALTH_TRANSLATIONS: TranslationTable = \{/, "the table is gone");
  const assembly = langSrc.slice(langSrc.indexOf("const TRANSLATIONS: TranslationTable ="), langSrc.indexOf("mergeIntoTranslations({"));
  assert.match(assembly, /\n\s*COMMERCE_HEALTH_TRANSLATIONS,/, "the table is declared but never merged");
  assert.ok(!/\.\.\.COMMERCE_HEALTH_TRANSLATIONS/.test(assembly), "spreading the table would drop other languages of the same key");
});

check("English is the fallback, for a missing key and for English itself", () => {
  // studioT returns the source text unchanged when the language is English, and
  // when the key is absent. That is what makes an untranslated sentence readable
  // rather than blank — and why this test, not the app, has to catch the gap.
  const fn = langSrc.slice(langSrc.indexOf("export function studioT"), langSrc.indexOf("\n}", langSrc.indexOf("export function studioT")));
  assert.match(fn, /if \(normalized === "English"\) return text;/, "English no longer returns the source text");
  assert.match(fn, /return TRANSLATIONS\[text\]\?\.\[normalized\] \?\? text;/, "a missing key no longer falls back to English");
});

console.log(failures ? `\n${failures} check(s) failed` : "\ncommerce health translations: all checks passed");
process.exit(failures ? 1 : 0);

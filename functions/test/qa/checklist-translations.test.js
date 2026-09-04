// Every word the setup checklist can put on screen has to exist in eleven
// languages.
//
// The card is the first thing a new workspace sees, and its text comes from the
// SERVER in English — so an untranslated string does not fail, it just quietly
// shows English to a Turkish workshop on the one screen where the product is
// trying hardest to be understood. That is what shipped, and this is what
// stops it shipping again: the strings live in one module, and this walks them.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { SETUP_STEP_COPY, SETUP_PRELUDE, setupChecklist } = require("../../lifecycle/checklist");
const { ACTIVATION_PATHS } = require("../../lifecycle/activation");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const language = fs.readFileSync(
  path.join(__dirname, "..", "..", "..", "studioflow-web", "lib", "studioflow", "language.ts"),
  "utf8"
);
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português",
  "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];

/** The entry for one English string, or "" — matched on the key, not on a guess at the line. */
function entryFor(text) {
  const key = `  "${text.replace(/"/g, '\\"')}": {`;
  const at = language.indexOf(key);
  if (at < 0) return "";
  return language.slice(at, language.indexOf("\n", at));
}

/** Every English string the checklist can render, gathered from the module itself. */
function allStrings() {
  const out = new Set(["Your NivaDesk setup", "You're set up", "Tell us what you'd like help with"]);
  for (const copy of Object.values(SETUP_STEP_COPY)) {
    if (copy.title) out.add(copy.title);
    if (copy.detail) out.add(copy.detail);
  }
  // The prelude's copy is not exported as a map of its own, so it is collected
  // by running every path — which also proves nothing renders that the module
  // cannot produce.
  for (const p of ACTIVATION_PATHS) {
    for (const step of setupChecklist({ path: p, events: [] }).steps) {
      if (step.title) out.add(step.title);
      if (step.detail) out.add(step.detail);
    }
  }
  return [...out];
}

check("the checklist really has strings to check", () => {
  const strings = allStrings();
  assert.ok(strings.length >= 15, `only ${strings.length} strings gathered`);
  assert.ok(Object.keys(SETUP_PRELUDE).length > 0);
});

check("every string the card can show is translated into all eleven", () => {
  const missing = [];
  const incomplete = [];
  for (const text of allStrings()) {
    const entry = entryFor(text);
    if (!entry) { missing.push(text); continue; }
    for (const lang of LANGS) {
      if (!entry.includes(`"${lang}":`)) incomplete.push(`${text} → ${lang}`);
    }
  }
  assert.deepStrictEqual(missing, [], `untranslated, so a non-English workspace sees English: ${missing.join(" | ")}`);
  assert.deepStrictEqual(incomplete, [], `missing a language: ${incomplete.slice(0, 6).join(" | ")}`);
});

check("no translation is left as the English string", () => {
  // A copy-paste that leaves English in a Turkish slot is worse than a missing
  // entry, because nothing else will ever flag it.
  const lazy = [];
  for (const text of allStrings()) {
    const entry = entryFor(text);
    if (!entry) continue;
    for (const lang of ["Türkçe", "Deutsch", "Français"]) {
      const match = entry.match(new RegExp(`"${lang.replace(/[()]/g, "\\$&")}": "([^"]*)"`));
      if (match && match[1] === text) lazy.push(`${lang}: ${text}`);
    }
  }
  assert.deepStrictEqual(lazy, [], `left in English: ${lazy.join(" | ")}`);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 300)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ CHECKLIST TRANSLATIONS GEÇTİ");
})();

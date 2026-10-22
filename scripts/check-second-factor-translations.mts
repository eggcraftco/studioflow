// GN-10 two-step verification strings: every literal the Settings card and the sign-in
// prompt send through t(), plus the lib/auth/secondFactor.ts sentences they show through
// t(error), must resolve in every supported language through studioT (not the file — an
// earlier table can hide a row). Placeholders must survive. Control: an unknown key must
// come back untranslated, or the probe cannot see a gap.
//   npx tsx scripts/check-second-factor-translations.mts
import { readFileSync } from "fs";
import { studioT, studioTranslationRow, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const keys = new Set<string>();
for (const rel of ["app/settings/TwoStepVerificationCard.tsx", "components/SecondFactorPromptHost.tsx"]) {
  for (const m of read(rel).matchAll(/(?<![\w.])t\(\s*"((?:[^"\\\n]|\\.)*)"\s*\)/g)) keys.add(m[1]);
}
for (const m of read("lib/auth/secondFactor.ts").matchAll(/"([A-Z][^"]{12,}[.?!])"/g)) keys.add(m[1]);

const others = SUPPORTED_STUDIO_LANGUAGES.filter((lang) => lang !== "English");
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join("|");
const problems: string[] = [];
for (const key of keys) for (const lang of others) {
  const out = studioT(key, lang);
  // A row whose cell equals English (e.g. "Password" in Italian) is a real translation.
  if (out === key && !studioTranslationRow(key)?.[lang]) problems.push(`MISSING ${key} [${lang}]`);
  else if (holes(out) !== holes(key)) problems.push(`PLACEHOLDER ${key} [${lang}] → ${out}`);
}
if (/t\("left"\)/.test(read("app/settings/TwoStepVerificationCard.tsx"))) problems.push('bare t("left") is back — use "{count} left"');
const control = "GN10 control key that no table has";
const controlSeen = others.every((lang) => studioT(control, lang) === control);
console.log(`keys ${keys.size} × languages ${others.length}; problems ${problems.length}; control ${controlSeen ? "ok" : "BROKEN"}`);
for (const line of problems) console.log(line);
if (!controlSeen || problems.length || keys.size < 30) process.exit(1);
console.log("✅ SECOND FACTOR TRANSLATIONS OK");

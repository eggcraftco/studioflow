// Missing translation keys per language on the web (9 Oct 2026). Runtime probe:
// every literal key passed to t("…") / studioT("…") in app/ and components/ is
// looked up through the merged table with studioT; a key that comes back as the
// English text is missing in that language. Report only — exits 0.
//   npx tsx scripts/list-missing-translation-keys.ts [--list]
// Limits: keys built at run time are not seen; a translation equal to English
// (brand names, "OK") counts as missing.
import fs from "node:fs";
import path from "node:path";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";

const root = path.resolve(__dirname, "..");
const keys = new Set<string>();
const walk = (dir: string) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "node_modules" && entry.name !== ".next") walk(p); continue; }
    if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue;
    const src = fs.readFileSync(p, "utf8");
    for (const m of src.matchAll(/(?<![\w.])(?:t|studioT|tr)\(\s*"((?:[^"\\\n]|\\.)*)"\s*[,)]/g)) {
      const k = m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
      if (k.trim() && !/^[\W\d_]+$/.test(k)) keys.add(k);
    }
  }
};
walk(path.join(root, "app"));
walk(path.join(root, "components"));
const out: Record<string, string[]> = {};
console.log(`== Web: ${keys.size} literal call-site keys`);
for (const lang of SUPPORTED_STUDIO_LANGUAGES) {
  if (lang === "English") continue;
  out[lang] = [...keys].filter((k) => studioT(k, lang) === k).sort();
  console.log(`  ${lang.padEnd(22)} missing ${out[lang].length}`);
}
if (process.argv.includes("--list")) console.log(JSON.stringify(out, null, 1));

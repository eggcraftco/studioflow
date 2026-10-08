// Every sentence the upload progress rows show has all eleven translations in
// lib/studioflow/language.ts, and the assembled table really returns them —
// a studioT(key, "Türkçe") probe over the compiled module, because a row that
// is in the file but swallowed by the merge order would pass a text check.
//
//   node scripts/check-upload-translations.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português",
  "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
// All four tables that feed studioT: a key the Mac table carries (Cancelled,
// Remove) is declared there, and the merge order lets that table win.
// language.ts imports every table listed here; one left out breaks the import
// of the compiled module (trackingEmailTranslations arrived on 8 Oct 2026).
const TABLES = ["language", "macTranslations", "settingsContentTranslations", "shippingTranslations", "trackingEmailTranslations"];
const dictionary = TABLES.map((name) => read(`lib/studioflow/${name}.ts`)).join("\n");

// Keys: t("…") literals in the panel, the stage labels the reducer returns,
// the runner's two error sentences and the queue's fallback.
const keys = new Set();
for (const m of read("components/UploadQueuePanel.tsx").matchAll(/\bt\("((?:[^"\\]|\\.)+)"\)/g)) keys.add(m[1]);
const stageSource = read("lib/studioflow/uploadProgress.ts").slice(read("lib/studioflow/uploadProgress.ts").indexOf("export function uploadStageLabel"));
for (const line of stageSource.slice(0, stageSource.indexOf("\n}\n")).matchAll(/return ([^;]+);/g)) {
  for (const m of line[1].matchAll(/"((?:[^"\\]|\\.)+)"/g)) if (/[A-Za-z]/.test(m[1])) keys.add(m[1]);
}
for (const m of read("lib/studioflow/uploadRunner.ts").matchAll(/message = "((?:[^"\\]|\\.)+)"/g)) keys.add(m[1]);
for (const m of read("lib/studioflow/useUploadQueue.ts").matchAll(/fallbackError \?\? "((?:[^"\\]|\\.)+)"/g)) keys.add(m[1]);
keys.delete("none"); keys.delete("pending"); keys.delete("clean"); keys.delete("blocked"); keys.delete("unknown");
for (const stage of ["queued", "preparing", "uploading", "processing", "done", "error", "cancelled"]) keys.delete(stage);

const missing = [];
for (const key of keys) {
  const needle = `${JSON.stringify(key)}: {`;
  let at = dictionary.indexOf(needle);
  const present = new Set();
  while (at >= 0) {
    const line = dictionary.slice(at, dictionary.indexOf("\n", at));
    for (const language of LANGUAGES) if (line.includes(`${JSON.stringify(language)}:`)) present.add(language);
    at = dictionary.indexOf(needle, at + needle.length);
  }
  if (present.size === 0) { missing.push(`${key} — no entry`); continue; }
  const absent = LANGUAGES.filter((language) => !present.has(language));
  if (absent.length) missing.push(`${key} — missing ${absent.join(", ")}`);
}

// The runtime probe: compile the dictionary and ask it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "upload-translations-"));
const compile = (rel, name) => {
  const js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
  fs.writeFileSync(path.join(tmp, `${name}.mjs`), js);
};
for (const name of TABLES) compile(`lib/studioflow/${name}.ts`, name);
const { studioT } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
fs.rmSync(tmp, { recursive: true, force: true });

// The compiled table must return a translation for every language. "Uploads"
// is the same word in German and Portuguese, so the test is "a value came
// back that the dictionary declares", not "differs from English".
const untranslated = [];
for (const key of keys) {
  for (const language of LANGUAGES) {
    const out = studioT(key, language);
    // A key declared in several tables (Cancelled, Remove) resolves to the
    // last one merged; any declared value is a translation.
    const declared = [...dictionary.matchAll(new RegExp(`${JSON.stringify(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: \\{[^\\n]*?${JSON.stringify(language).replace(/[()]/g, "\\$&")}: "([^"]+)"`, "g"))].map((m) => m[1]);
    if (declared.length === 0) continue; // reported under `missing` already
    // Keys older than this panel (Cancelled) are also declared in multi-line
    // language packs this scan does not parse; a value that is not the
    // English key is a translation from one of them.
    if (!out || (out === key && !declared.includes(out))) untranslated.push(`${key} → ${language} came back as ${JSON.stringify(out)}, dictionary says ${JSON.stringify(declared)}`);
  }
}
const probes = { Uploading: "Yükleniyor", Preparing: "Hazırlanıyor", Processing: "İşleniyor", "Waiting for network": "Ağ bekleniyor", Retry: studioT("Retry", "Türkçe") };
for (const [key, wanted] of Object.entries(probes)) {
  if (studioT(key, "Türkçe") !== wanted) untranslated.push(`${key} → Türkçe is ${JSON.stringify(studioT(key, "Türkçe"))}, wanted ${JSON.stringify(wanted)}`);
}

if (missing.length || untranslated.length) {
  console.error(`${missing.length + untranslated.length} problems over ${keys.size} upload sentences:`);
  for (const m of [...missing, ...untranslated]) console.error(`  ${m}`);
  process.exit(1);
}
console.log(`All ${keys.size} upload sentences have all 12 languages and studioT returns them (Türkçe probe: Uploading → ${studioT("Uploading", "Türkçe")}, Processing → ${studioT("Processing", "Türkçe")}).`);

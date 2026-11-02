// Language audit (2 Nov 2026, owner: "tum uygulamalari kontrol edebilir dil destegini kontrol edebilir misin").
//
// 1. Every row of LANGUAGE_AUDIT_TRANSLATIONS reaches the screen in all eleven other languages: studioT returns a
//    text that is not the English key (the table is merged last, gaps only, so an earlier table could hide a cell).
// 2. Every public-site key with English text has a value in all twelve languages. publicSiteT falls back to
//    English, so a missing cell is an English sentence on a German page — /features, the sign-in page and the
//    pricing hero read that way in ten languages until this audit.
// 3. The screens fixed here draw no bare English: the export page, the CSV panel and the e-mail link page pass
//    their sentences through t().
import fs from "node:fs";
import path from "node:path";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";
import { LANGUAGE_AUDIT_TRANSLATIONS } from "../lib/studioflow/languageAuditTranslations";
import { PUBLIC_SITE_EN, PUBLIC_SITE_TRANSLATIONS } from "../lib/publicSite/translations";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const failures: string[] = [];
const check = (ok: boolean, label: string) => { if (ok) console.log(`ok   ${label}`); else { console.log(`FAIL ${label}`); failures.push(label); } };
const others = SUPPORTED_STUDIO_LANGUAGES.filter((l) => l !== "English");

for (const key of Object.keys(LANGUAGE_AUDIT_TRANSLATIONS)) {
  const missing = others.filter((l) => studioT(key, l) === key);
  if (missing.length) check(false, `"${key}" falls back to English in ${missing.join(", ")}`);
}
check(Object.keys(LANGUAGE_AUDIT_TRANSLATIONS).length > 40, `${Object.keys(LANGUAGE_AUDIT_TRANSLATIONS).length} audit rows resolve in all eleven languages`);

const publicMissing: string[] = [];
for (const [lang, table] of Object.entries(PUBLIC_SITE_TRANSLATIONS)) {
  for (const [key, english] of Object.entries(PUBLIC_SITE_EN)) {
    if (english && !(table as Record<string, string>)[key]) publicMissing.push(`${lang}: ${key}`);
  }
}
check(publicMissing.length === 0, `public site: every key with English text exists in all twelve languages${publicMissing.length ? ` (missing: ${publicMissing.slice(0, 8).join("; ")}${publicMissing.length > 8 ? " …" : ""})` : ""}`);

const bare: Array<[string, string[]]> = [
  ["app/export/page.tsx", [">Export your workspace data<", ">Data export<", "title=\"Customers CSV\"", "{count} records</div>"]],
  ["components/ExportOrdersPanel.tsx", [">Export invoices to CSV<", "\"Preparing…\" : \"Download CSV\"", "<option value=\",\">Comma"]],
  ["app/auth/action/page.tsx", [">Email verified<", ">Choose a new password<", "placeholder=\"New password\"", "Continue to NivaDesk\n"]],
];
for (const [file, needles] of bare) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  for (const needle of needles) check(!src.includes(needle), `${file}: no bare ${JSON.stringify(needle)}`);
}

if (failures.length) { console.log(`\n${failures.length} of the language-audit checks failed.`); process.exit(1); }
console.log("\nAll language-audit checks passed.");

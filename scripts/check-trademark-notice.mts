// Trade mark notice (owner, 7 Nov 2026). "NivaDesk" is a registered UK word mark: UK00004386449, owner EGGCRAFT LIMITED
// (16566512), filed 12 May 2026, entered on the register 7 Aug 2026, classes 9 and 42, renewal due 12 May 2036.
// Source: UK IPO register, https://trademarks.ipo.gov.uk/ipo-tmcase/page/Results/1/UK00004386449 (read 7 Nov 2026).
//
// Trade Marks Act 1994 s.95: representing a mark as registered when it is not — or for goods/services it is not
// registered for — is an offence. So the ® stays only while that registration stands, and every notice says WHERE it
// is registered (the United Kingdom): there is no EU, US or Madrid registration (WIPO Global Brand Database, 7 Nov).
// If the registration lapses or a new one is added, change this script together with the notices.
//
//   npx tsx scripts/check-trademark-notice.mts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";
import { PUBLIC_SITE_TRANSLATIONS } from "../lib/publicSite/translations";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};

const UK_NUMBER = "UK00004386449";
// The country, in each site language, so no reader takes the ® for an EU or US registration.
const COUNTRY: Record<string, RegExp> = {
  English: /United Kingdom/,
  Türkçe: /Birleşik Krallık/,
  Deutsch: /Vereinigten Königreich/,
  "Français": /Royaume-Uni/,
  Italiano: /Regno Unito/,
  "Español (Spanish)": /Reino Unido/,
  "Português": /Reino Unido/,
  "Русский (Russian)": /Великобритани/,
  "日本語 (Japanese)": /英国/,
  "中文 (Chinese)": /英国/,
  "العربية (Arabic)": /المملكة المتحدة/,
  "हिन्दी (Hindi)": /यूनाइटेड किंगडम/,
};

// 1. Footer line in all 12 site languages: name + ®, legal owner, registration number, country.
ok("12 site languages", SUPPORTED_STUDIO_LANGUAGES.length === 12);
for (const language of SUPPORTED_STUDIO_LANGUAGES) {
  const line = (PUBLIC_SITE_TRANSLATIONS as Record<string, Record<string, string>>)[language]?.["footer.trademark"] ?? "";
  ok(`${language}: footer.trademark present`, line.length > 0);
  ok(`${language}: says NivaDesk®`, line.includes("NivaDesk®"));
  ok(`${language}: names EGGCRAFT LIMITED`, line.includes("EGGCRAFT LIMITED"));
  ok(`${language}: gives ${UK_NUMBER}`, line.includes(UK_NUMBER));
  ok(`${language}: names the country`, COUNTRY[language]?.test(line));
  ok(`${language}: no ™ (the mark is registered)`, !line.includes("™"));
  if (language !== "English") ok(`${language}: translated, not the English line`, line !== PUBLIC_SITE_TRANSLATIONS.English["footer.trademark"]);
}

// 2. Wiring: the public footer renders the line; the header puts ® after the wordmark (first, most prominent use).
const marketing = read("components/PublicMarketing.tsx");
ok("public footer renders footer.trademark", /className="public-footer-trademark">\{t\("footer\.trademark"\)\}/.test(marketing));
ok("public header: ® after the logo", /className="public-brand-logo"[^\n]*\n\s*<span className="public-brand-reg" aria-hidden="true">®<\/span>/.test(marketing));
const landing = read("components/CustomOrderLanding.tsx");
ok("custom-order landing footer carries the notice", landing.includes(`NivaDesk® is a registered trade mark of EGGCRAFT LIMITED in the United Kingdom (No. ${UK_NUMBER})`));
const css = read("app/globals.css");
ok("css: .public-brand-reg", /\.public-brand-reg \{[^}]*position: absolute;/.test(css));
ok("css: .public-footer-trademark", /\.public-footer-meta \.public-footer-trademark \{/.test(css));

// 3. No claim beyond the register: nothing on the site calls NivaDesk an EU/US registered mark, and no ™ beside the name.
const scan = ["components", "lib/publicSite", "app"].flatMap(dir => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const rel = path.join(d, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(tsx?|mts)$/.test(entry.name)) out.push(rel);
    }
  };
  walk(dir);
  return out;
});
for (const rel of scan) {
  const text = read(rel);
  ok(`${rel}: no "NivaDesk™"`, !text.includes("NivaDesk™"));
  ok(`${rel}: no EU/US registration claim`, !/NivaDesk®?[^.\n"]{0,80}registered[^.\n"]{0,40}(European Union|EUIPO|United States|USPTO)/i.test(text));
}

if (failures.length) {
  console.error(`trademark notice: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`trademark notice: ${checks}/${checks} checks passed`);

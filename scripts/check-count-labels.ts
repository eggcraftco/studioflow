// Count labels (9 Oct 2026). The Orders list printed "1 Aufträge": the count
// was glued to the plural key whatever the number. studioCountLabel picks the
// form by Intl.PluralRules for the app language.
//   npx tsx scripts/check-count-labels.ts
// 1. every app language has forms for every noun, and every plural category
//    its locale produces for 0..200 has a form (or falls back to "other");
// 2. known answers in German, French, Russian, Arabic, Japanese;
// 3. the screens no longer print `{n} {t("orders")}` / `{n} {t("customers")}`.
import fs from "fs";
import path from "path";
import { SUPPORTED_STUDIO_LANGUAGES, studioLocaleTag } from "../lib/studioflow/language";
import { STUDIO_COUNT_FORMS, studioCountLabel, type StudioCountNoun } from "../lib/studioflow/countLabel";

let failures = 0;
let checks = 0;
const check = (ok: boolean, what: string) => { checks += 1; if (!ok) { failures += 1; console.error(`FAIL ${what}`); } };
const eq = (got: string, want: string, what: string) => check(got === want, `${what}: got "${got}", wanted "${want}"`);

for (const noun of Object.keys(STUDIO_COUNT_FORMS) as StudioCountNoun[]) {
  for (const language of SUPPORTED_STUDIO_LANGUAGES) {
    const forms = STUDIO_COUNT_FORMS[noun][language];
    check(Boolean(forms?.other), `${noun} / ${language}: has forms`);
    if (!forms) continue;
    const rules = new Intl.PluralRules(studioLocaleTag(language));
    const used = new Set<string>();
    for (let n = 0; n <= 200; n += 1) used.add(rules.select(n));
    for (const category of used) {
      // A language with a single form ("other" only) does not inflect after a numeral.
      check(Boolean((forms as Record<string, string>)[category]) || Object.keys(forms).length === 1,
        `${noun} / ${language}: a form for plural category "${category}"`);
    }
    for (let n = 0; n <= 200; n += 1) {
      const label = studioCountLabel(n, noun, language);
      check(label.startsWith(`${n} `) && !label.includes("{count}"), `${noun} / ${language} / ${n}: "${label}" starts with the number`);
    }
  }
}

eq(studioCountLabel(1, "order", "Deutsch"), "1 Auftrag", "German 1");
eq(studioCountLabel(2, "order", "Deutsch"), "2 Aufträge", "German 2");
eq(studioCountLabel(0, "order", "Deutsch"), "0 Aufträge", "German 0");
eq(studioCountLabel(1, "customer", "Deutsch"), "1 Kunde", "German customer 1");
eq(studioCountLabel(1, "order", "Français"), "1 commande", "French 1");
eq(studioCountLabel(3, "order", "Français"), "3 commandes", "French 3");
eq(studioCountLabel(1, "order", "Русский (Russian)"), "1 заказ", "Russian 1");
eq(studioCountLabel(3, "order", "Русский (Russian)"), "3 заказа", "Russian 3");
eq(studioCountLabel(5, "order", "Русский (Russian)"), "5 заказов", "Russian 5");
eq(studioCountLabel(21, "order", "Русский (Russian)"), "21 заказ", "Russian 21");
eq(studioCountLabel(2, "order", "العربية (Arabic)"), "2 طلبان", "Arabic 2");
eq(studioCountLabel(5, "order", "العربية (Arabic)"), "5 طلبات", "Arabic 5");
eq(studioCountLabel(1, "order", "日本語 (Japanese)"), "1 件の注文", "Japanese 1");
eq(studioCountLabel(1, "order", "English"), "1 order", "English 1");
eq(studioCountLabel(2, "order", "English"), "2 orders", "English 2");
eq(studioCountLabel(1, "order", null), "1 order", "no language");

const root = path.resolve(__dirname, "..");
for (const rel of ["app/orders/page.tsx", "app/schedule/page.tsx", "app/customers/page.tsx"]) {
  const source = fs.readFileSync(path.join(root, rel), "utf8");
  check(!/\}\s*\{t\("(orders|customers)"\)\}/.test(source), `${rel}: no count glued to t("orders"/"customers")`);
  check(source.includes("studioCountLabel("), `${rel}: uses studioCountLabel`);
}

if (failures) {
  console.error(`Count labels: ${failures} failure(s) of ${checks} checks`);
  process.exit(1);
}
console.log(`Count labels: all ${checks} checks pass — order and customer counts use each language's plural form`);

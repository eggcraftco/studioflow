// Night quality run (6 Nov 2026, live site read): the pricing page's two storage add-on prices were written into
// components/PublicMarketing.tsx as English text — "£9 / month · £90 / year" and "£15 / month · £150 / year" — so
// /de/pricing, /ja/pricing … /hi/pricing showed "month" and "year" in English beside plan prices that are translated.
//
//   1. both add-on price lines go through t() with their own key; no "/ month" literal is left in the component;
//   2. every language has both keys in its own table (no fallback to English);
//   3. the words are the same ones that language already uses for the plan price (plan.lite.price), so the add-on
//      line reads exactly like the plan line beside it — only the amounts differ;
//   4. the amounts are the ones the site shows today (£9/£90 and £15/£150): this changes words, never a price.
//
//   npx tsx scripts/check-addon-price-translated.mts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_SITE_EN, PUBLIC_SITE_TRANSLATIONS } from "../lib/publicSite/translations.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "components/PublicMarketing.tsx"), "utf8");
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};

const KEYS = {
  "pricingPage.addon100.price": { monthly: "£9", yearly: "£90" },
  "pricingPage.addon200.price": { monthly: "£15", yearly: "£150" }
} as const;

// 1. the component reads the keys
ok("100 GB add-on price goes through t()", /<p className="public-addon-price">\{t\("pricingPage\.addon100\.price"\)\}<\/p>/.test(source));
ok("200 GB add-on price goes through t()", /<p className="public-addon-price">\{t\("pricingPage\.addon200\.price"\)\}<\/p>/.test(source));
ok("no hard-coded '/ month' price left in PublicMarketing.tsx", !/£\d+ \/ month/.test(source));

// 4. English is today's text, word for word
const en = PUBLIC_SITE_EN as Record<string, string>;
ok("English 100 GB price unchanged", en["pricingPage.addon100.price"] === "£9 / month · £90 / year");
ok("English 200 GB price unchanged", en["pricingPage.addon200.price"] === "£15 / month · £150 / year");

// 2 + 3. every language, its own words
const amountsOut = (text: string) => text.replace(/£\d+/g, "£N");
for (const [language, table] of Object.entries(PUBLIC_SITE_TRANSLATIONS) as [string, Record<string, string | undefined>][]) {
  const planPrice = table["plan.lite.price"];
  ok(`${language}: plan.lite.price exists (the wording reference)`, typeof planPrice === "string" && planPrice.length > 0);
  for (const [key, amounts] of Object.entries(KEYS)) {
    const value = table[key];
    ok(`${language}: ${key} is in the language's own table`, typeof value === "string" && value.length > 0);
    if (typeof value !== "string" || typeof planPrice !== "string") continue;
    ok(`${language}: ${key} uses the plan price's words ("${planPrice}")`, amountsOut(value) === amountsOut(planPrice));
    const [first, second] = value.match(/£\d+/g) ?? [];
    ok(`${language}: ${key} keeps ${amounts.monthly} then ${amounts.yearly}`, first === amounts.monthly && second === amounts.yearly);
    if (language !== "English") ok(`${language}: ${key} is not the English text`, value !== en[key]);
  }
}

if (failures.length) {
  console.log(`check-addon-price-translated: ${failures.length} of ${checks} FAILED`);
  for (const failure of failures) console.log("FAIL", failure);
  process.exit(1);
}
console.log(`check-addon-price-translated: ${checks}/${checks} passed (two add-on prices × 12 languages, same words as the plan price, same amounts)`);

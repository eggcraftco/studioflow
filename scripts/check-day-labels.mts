/**
 * ETSY-E2E r2 (24 Oct 2026): "1 days". Every day count on the order screen, the
 * trial bar and Home's bank card was `${n} days` or t("{count} days"), whatever n
 * was. studioCountLabel(n, "day") and studioDayPhrase(n, …) pick the plural form
 * by Intl.PluralRules for the app language.
 *
 * Run: npm run test:day-labels   (npx tsx scripts/check-day-labels.mts)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_STUDIO_LANGUAGES, studioLocaleTag } from "../lib/studioflow/language";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0; let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message}`); }
}
const mod = await import("../lib/studioflow/countLabel") as Record<string, any>;
const count = (n: number, lang: string) => mod.studioCountLabel(n, "day", lang);
const phrase = (n: number, p: string, lang: string) => {
  assert.equal(typeof mod.studioDayPhrase, "function", "studioDayPhrase is missing");
  return mod.studioDayPhrase(n, p, lang);
};

check("English: 1 day / 2 days / 5 days / 21 days", () => {
  assert.equal(count(1, "English"), "1 day");
  assert.equal(count(2, "English"), "2 days");
  assert.equal(count(5, "English"), "5 days");
  assert.equal(count(21, "English"), "21 days");
});
check("English phrases: remaining, late, last synced", () => {
  assert.equal(phrase(1, "remaining", "English"), "1 day remaining");
  assert.equal(phrase(21, "remaining", "English"), "21 days remaining");
  assert.equal(phrase(1, "late", "English"), "1 day late");
  assert.equal(phrase(5, "late", "English"), "5 days late");
  assert.equal(phrase(1, "syncedAgo", "English"), "Last synced 1 day ago");
  assert.equal(phrase(2, "syncedAgo", "English"), "Last synced 2 days ago");
});
check("Turkish does not inflect after a numeral", () => {
  for (const n of [1, 2, 5, 21]) assert.equal(count(n, "Türkçe"), `${n} gün`);
  assert.equal(phrase(1, "remaining", "Türkçe"), "1 gün kaldı");
  assert.equal(phrase(21, "late", "Türkçe"), "21 gün gecikti");
  assert.equal(phrase(5, "syncedAgo", "Türkçe"), "Son senkron 5 gün önce");
});
check("Russian one/few/many: 1 день, 2 дня, 5 дней, 21 день", () => {
  assert.equal(count(1, "Русский (Russian)"), "1 день");
  assert.equal(count(2, "Русский (Russian)"), "2 дня");
  assert.equal(count(5, "Русский (Russian)"), "5 дней");
  assert.equal(count(21, "Русский (Russian)"), "21 день");
  assert.equal(phrase(1, "remaining", "Русский (Russian)"), "остался 1 день");
  assert.equal(phrase(5, "remaining", "Русский (Russian)"), "осталось 5 дней");
  assert.equal(phrase(21, "late", "Русский (Russian)"), "Просрочено на 21 день");
});
check("Arabic dual and few: 2 يومان, 5 أيام", () => {
  assert.equal(count(2, "العربية (Arabic)"), "2 يومان");
  assert.equal(count(5, "العربية (Arabic)"), "5 أيام");
  assert.equal(count(21, "العربية (Arabic)"), "21 يومًا");
});
check("German and French singular", () => {
  assert.equal(count(1, "Deutsch"), "1 Tag");
  assert.equal(phrase(1, "syncedAgo", "Deutsch"), "Zuletzt vor 1 Tag synchronisiert");
  assert.equal(phrase(2, "syncedAgo", "Deutsch"), "Zuletzt vor 2 Tagen synchronisiert");
  assert.equal(count(1, "Français"), "1 jour");
  assert.equal(phrase(1, "late", "Français"), "1 jour de retard");
});
check("every language has a form for every plural category it uses (0..200), and the number appears", () => {
  const phrases = mod.STUDIO_DAY_PHRASE_FORMS as Record<string, Record<string, Record<string, string>>>;
  assert.ok(phrases, "STUDIO_DAY_PHRASE_FORMS is missing");
  const tables: Array<[string, Record<string, Record<string, string>>]> = [["day", mod.STUDIO_COUNT_FORMS.day], ...Object.entries(phrases)];
  for (const [name, table] of tables) {
    assert.ok(table, `${name} table missing`);
    for (const language of SUPPORTED_STUDIO_LANGUAGES) {
      const forms = table[language];
      assert.ok(forms?.other, `${name}/${language}: no forms`);
      const rules = new Intl.PluralRules(studioLocaleTag(language));
      for (let n = 0; n <= 200; n += 1) {
        const category = rules.select(n);
        assert.ok(forms[category] || Object.keys(forms).length === 1, `${name}/${language}: no "${category}" form`);
        const text = name === "day" ? count(n, language) : phrase(n, name, language);
        assert.ok(text.includes(String(n)) && !text.includes("{count}"), `${name}/${language}/${n}: "${text}"`);
      }
    }
  }
});

// The screens: no count glued to a plural word any more.
const detail = readFileSync(join(root, "app/orders/OrderDetailContent.tsx"), "utf8");
const shell = readFileSync(join(root, "components/AppShell.tsx"), "utf8");
const home = readFileSync(join(root, "components/home/HomeCardBodies.tsx"), "utf8");
check("order screen: no `${n} days` / t(\"{count} days\") / \"Late (n days)\" literal", () => {
  assert.doesNotMatch(detail, /\$\{days\} days`/);
  assert.doesNotMatch(detail, /days\)} days late`/);
  assert.doesNotMatch(detail, /`Late \(\$\{Math\.abs\(days\)\} days\)`/);
  assert.doesNotMatch(detail, /t\("\{count\} days"\)/);
  assert.doesNotMatch(detail, /\$\{order\.deliveryTime \|\| 0\} days`/, "PDF Delivery Time printed `${n} days`");
  assert.match(detail, /studioCountLabel\(order\.deliveryTime, "day", detailLanguage\)/);
  assert.match(detail, /studioDayPhrase\(/);
});
check("trial bar: no `${daysRemaining} ${t(\"days remaining\")}`", () => {
  assert.doesNotMatch(shell, /\$\{daysRemaining\} \$\{t\("days remaining"\)\}/);
  assert.match(shell, /studioDayPhrase\(daysRemaining, "remaining", language\)/);
});
check("Home bank card: no t(\"Last synced {n} days ago\")", () => {
  assert.doesNotMatch(home, /t\("Last synced \{n\} days ago"\)/);
  assert.match(home, /studioDayPhrase\(days, "syncedAgo", language\)/);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);

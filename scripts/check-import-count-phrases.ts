// ETSY plural pass (24 Oct 2026). "1 orders imported" on the held-orders band: every counted Etsy / held /
// import sentence now has one template per plural form (lib/studioflow/importCountPhrases.ts).
//   npx tsx scripts/check-import-count-phrases.ts            (writes scripts/import-count-phrases/expected.json,
//                                                              the fixture the iOS and Android checks compare with)
// 1. every phrase × every SUPPORTED_STUDIO_LANGUAGES entry has forms; the generated file == gen.py(phrases.json);
// 2. for 0/1/2/5/11/21 (and 0..200) the result starts with/contains the number, has no {count}, and uses the
//    template of the Intl.PluralRules category of the app language (falling back to "other");
// 3. known answers (English, German, French 0/1, Russian 1/2/5/11/21, Arabic 0/1/2/5/11/21, Turkish, Japanese,
//    Hindi 0/1);
// 4. the screens no longer glue a count to a plural key (`${n} ${t("orders imported")}` and the ten others).
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { SUPPORTED_STUDIO_LANGUAGES, studioLocaleTag } from "../lib/studioflow/language";
import { IMPORT_COUNT_PHRASE_FORMS, studioImportPhrase } from "../lib/studioflow/countLabel";
import type { StudioImportCountPhrase } from "../lib/studioflow/importCountPhrases";
import { etsyImportNotice } from "../lib/studioflow/etsyFirstImport";

let failures = 0, checks = 0;
const check = (ok: boolean, what: string) => { checks += 1; if (!ok) { failures += 1; console.error(`FAIL ${what}`); } };
const eq = (got: string, want: string, what: string) => check(got === want, `${what}: got "${got}", wanted "${want}"`);
const root = path.join(__dirname, "..");
const SAMPLES = [0, 1, 2, 5, 11, 21];
const phrases = Object.keys(IMPORT_COUNT_PHRASE_FORMS) as StudioImportCountPhrase[];

// 1. generated file is the table
const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "icp-"));
execFileSync("python3", ["-I", path.join(root, "scripts/import-count-phrases/gen.py"), path.join(root, "scripts/import-count-phrases/phrases.json"),
  path.join(tmp, "a.ts"), path.join(tmp, "a.swift"), path.join(tmp, "a.kt")]);
check(fs.readFileSync(path.join(tmp, "a.ts"), "utf8") === fs.readFileSync(path.join(root, "lib/studioflow/importCountPhrases.ts"), "utf8"),
  "lib/studioflow/importCountPhrases.ts == gen.py(phrases.json)");
check(SUPPORTED_STUDIO_LANGUAGES.length === 12, `12 app languages (got ${SUPPORTED_STUDIO_LANGUAGES.length})`);

// 2. every phrase, language, sample
const expected: Record<string, Record<string, Record<string, string>>> = {};
for (const phrase of phrases) {
  expected[phrase] = {};
  for (const language of SUPPORTED_STUDIO_LANGUAGES) {
    const forms = (IMPORT_COUNT_PHRASE_FORMS[phrase] as Record<string, Record<string, string>>)[language];
    check(Boolean(forms?.other), `${phrase} / ${language}: has an "other" form`);
    if (!forms) continue;
    const rules = new Intl.PluralRules(studioLocaleTag(language));
    expected[phrase][language] = {};
    for (let n = 0; n <= 200; n += 1) {
      const got = studioImportPhrase(n, phrase, language);
      const want = (forms[rules.select(n)] ?? forms.other).replace("{count}", String(n));
      check(got === want && got.includes(String(n)) && !got.includes("{count}"), `${phrase} / ${language} / ${n}: "${got}"`);
      if (SAMPLES.includes(n)) expected[phrase][language][String(n)] = got;
    }
    if (language !== "English") {
      // not English leaking through a missing language
      check(studioImportPhrase(5, phrase, language) !== studioImportPhrase(5, phrase, "English"), `${phrase} / ${language}: not English`);
    }
  }
}

// 3. known answers
eq(studioImportPhrase(1, "ordersImported", "English"), "1 order imported", "English 1 (the reported '1 orders imported')");
eq(studioImportPhrase(2, "ordersImported", "English"), "2 orders imported", "English 2");
eq(studioImportPhrase(0, "ordersImported", "English"), "0 orders imported", "English 0");
eq(studioImportPhrase(1, "heldStoreOrdersWaiting", "English"), "1 store order is waiting", "band English 1");
eq(studioImportPhrase(31, "heldStoreOrdersWaiting", "English"), "31 store orders are waiting", "band English 31");
eq(studioImportPhrase(1, "ordersBeingImported", "English"), "1 order is being imported", "English being 1");
eq(studioImportPhrase(1, "importSelectedOrders", "English"), "Import 1 selected order", "English import 1");
eq(studioImportPhrase(1, "receiptsAwaitingFirstImport", "English"), "1 receipt is waiting for your first import", "English receipts 1");
eq(studioImportPhrase(1, "waitingForRoomOnPlan", "English"), "1 is waiting for room on your plan.", "English room 1");
eq(studioImportPhrase(1, "needReview", "English"), "1 needs review. No records were lost; you can run the preview again.", "English review 1");
eq(studioImportPhrase(1, "alreadyInNivaDesk", "English"), "1 of these is already in NivaDesk and will be updated, not duplicated.", "English already 1");
eq(studioImportPhrase(1, "ordersImported", "Deutsch"), "1 Auftrag importiert", "German 1");
eq(studioImportPhrase(5, "ordersImported", "Deutsch"), "5 Aufträge importiert", "German 5");
eq(studioImportPhrase(0, "ordersImported", "Français"), "0 commande importée", "French 0 is singular");
eq(studioImportPhrase(2, "ordersImported", "Français"), "2 commandes importées", "French 2");
eq(studioImportPhrase(1, "ordersImported", "Русский (Russian)"), "1 заказ импортирован", "Russian 1");
eq(studioImportPhrase(2, "ordersImported", "Русский (Russian)"), "2 заказа импортировано", "Russian 2");
eq(studioImportPhrase(5, "ordersImported", "Русский (Russian)"), "5 заказов импортировано", "Russian 5");
eq(studioImportPhrase(11, "ordersImported", "Русский (Russian)"), "11 заказов импортировано", "Russian 11");
eq(studioImportPhrase(21, "ordersImported", "Русский (Russian)"), "21 заказ импортирован", "Russian 21");
eq(studioImportPhrase(0, "ordersImported", "العربية (Arabic)"), "0 طلب مستورد", "Arabic 0 (zero)");
eq(studioImportPhrase(1, "ordersImported", "العربية (Arabic)"), "1 طلب مستورد", "Arabic 1 (one)");
eq(studioImportPhrase(2, "ordersImported", "العربية (Arabic)"), "2 طلبان مستوردان", "Arabic 2 (two)");
eq(studioImportPhrase(5, "ordersImported", "العربية (Arabic)"), "5 طلبات مستوردة", "Arabic 5 (few)");
eq(studioImportPhrase(11, "ordersImported", "العربية (Arabic)"), "11 طلبًا مستوردًا", "Arabic 11 (many)");
eq(studioImportPhrase(21, "ordersImported", "العربية (Arabic)"), "21 طلبًا مستوردًا", "Arabic 21 (many)");
eq(studioImportPhrase(1, "ordersImported", "Türkçe"), "1 sipariş içeri alındı", "Turkish 1");
eq(studioImportPhrase(21, "ordersImported", "Türkçe"), "21 sipariş içeri alındı", "Turkish 21");
eq(studioImportPhrase(1, "ordersImported", "日本語 (Japanese)"), "1 件の注文を取り込みました", "Japanese 1");
eq(studioImportPhrase(0, "ordersImported", "हिन्दी (Hindi)"), "0 ऑर्डर आयात हुआ", "Hindi 0 (one)");
eq(studioImportPhrase(2, "ordersImported", "हिन्दी (Hindi)"), "2 ऑर्डर आयात हुए", "Hindi 2");
eq(etsyImportNotice({ created: 1, updated: 1, held: 1, failed: 1 }, (x) => x, "English"),
  "1 imported · 1 updated · 1 is waiting for room on your plan. They are kept safe on the Orders screen. · 1 needs review. No records were lost; you can run the preview again.",
  "import notice, all singular");
eq(etsyImportNotice({ created: 8, updated: 0, held: 32, failed: 0 }, (x) => x), "8 imported · 32 are waiting for room on your plan. They are kept safe on the Orders screen.", "import notice default English");

// 4. screens
const files = ["app/orders/page.tsx", "app/settings/EtsyIntegrationSection.tsx", "lib/studioflow/etsyFirstImport.ts"];
const glued = /\$\{[^}]+\}\s*\$\{t\("(orders imported|orders are being imported|store orders? (is|are) waiting|selected orders|receipts are waiting for your first import|could not be imported\. The sync log below says why\.|imported|updated|are waiting for room on your plan\.|need review\.[^"]*|of these are already in NivaDesk[^"]*)"\)\}/;
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), "utf8");
  check(!glued.test(src), `${f}: no count glued to a plural key`);
}
const band = fs.readFileSync(path.join(root, "app/orders/page.tsx"), "utf8");
check(/studioImportPhrase\(heldOrders\.heldCount \?\? 0, "heldStoreOrdersWaiting", language\)/.test(band), "Orders band headline uses the plural phrase");
check(/studioImportPhrase\(importedNow, "ordersImported", language\)/.test(band), "Orders band toast uses the plural phrase");

fs.writeFileSync(path.join(root, "scripts/import-count-phrases/expected.json"), JSON.stringify(expected, null, 1) + "\n");
console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);

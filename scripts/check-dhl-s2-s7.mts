// DHL S2–S7 (owner's decisions of 5 Nov 2026, before the first real customer shipment), web side.
//   npx tsx scripts/check-dhl-s2-s7.mts
//
// - S3: the dialog says NivaDesk cannot cancel a courier BEFORE the box is ticked (outside the
//   ticked-only block), the order card gives the cancel path beside the pickup number, and there is
//   no cancel button anywhere;
// - S5: the tariff's answer is shown only for the code it was asked for; found / not found /
//   unavailable each have their sentence; the "never fills or confirms" rule and the Trade Tariff
//   link are on screen; nothing in the dialog writes an HS code on its own;
// - S6: the weight of ONE item is typed, the line total DHL gets is shown, a line saved earlier as a
//   total is sent back as it was (never multiplied again), nothing defaults to 0 or 1 kg — the same
//   vectors as the server (functions/test/qa/dhl-s2-s7.test.js);
// - S7: a filled line takes the description and codes only (never HS, origin, weight), is ticked as
//   checked, and the EUDR TARIC code comes from HMRC's list (the server's 13 codes);
// - every new word and issue sentence is translated in the eleven other languages;
// - the checks can fail: each family is run once more on a broken copy (mutant) and must go red.
import { readFileSync } from "node:fs";
import { studioT, studioLocaleTag, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";
import { SHIPPING_TRANSLATIONS } from "../lib/studioflow/shippingTranslations";
import { customsLineWeights, kgText, lineWeightKg, tariffAnswerFor } from "../lib/studioflow/dhlLineWeight";
import { EUDR_TARIC_CODES, isEudrTaricCode } from "../lib/studioflow/dhlEudr";

let failures: string[] = [];
let checks = 0;
const expect = (name: string, ok: boolean) => { checks += 1; if (!ok) failures.push(name); };
const equal = (name: string, actual: unknown, wanted: unknown) => expect(`${name} (got ${JSON.stringify(actual)}, want ${JSON.stringify(wanted)})`, JSON.stringify(actual) === JSON.stringify(wanted));

// ------------------------------------------------------------------ S6 vectors (the server's)
equal("3 × 0.120", lineWeightKg(3, 0.12), 0.36);
equal("4 × 0.0125", lineWeightKg(4, 0.0125), 0.05);
equal("2 × (0.1 + 0.2)", lineWeightKg(2, 0.1 + 0.2), 0.6);
for (const [q, u] of [[0, 0.1], [3, 0], [3, null], [null, 0.1], [3, -1]] as [number | null, number | null][]) equal(`${q} × ${u} has no weight`, lineWeightKg(q, u), null);
const line = (over: Partial<Record<"quantity" | "unitNetWeight" | "unitGrossWeight" | "netWeight" | "grossWeight", string>>) => ({ quantity: "3", unitNetWeight: "", unitGrossWeight: "", netWeight: "", grossWeight: "", ...over });
equal("typed per item: unit keys + totals", customsLineWeights(line({ unitNetWeight: "0.12", unitGrossWeight: "0.15" })), { unitNetWeight: 0.12, unitGrossWeight: 0.15, netWeight: 0.36, grossWeight: 0.45 });
equal("gross of one item left empty is the net one", customsLineWeights(line({ unitNetWeight: "0.12" })), { unitNetWeight: 0.12, unitGrossWeight: 0.12, netWeight: 0.36, grossWeight: 0.36 });
equal("a total saved earlier goes back as it was, no unit key", customsLineWeights(line({ netWeight: "0.36", grossWeight: "0.45" })), { netWeight: 0.36, grossWeight: 0.45 });
equal("typing per item replaces the saved total", customsLineWeights(line({ unitNetWeight: "0.1", netWeight: "0.36" })), { unitNetWeight: 0.1, unitGrossWeight: 0.1, netWeight: 0.3, grossWeight: 0.3 });
equal("nothing typed: empty, never 0 or 1 kg", customsLineWeights(line({})), { unitNetWeight: null, unitGrossWeight: null, netWeight: null, grossWeight: null });
equal("quantity missing: no total", customsLineWeights(line({ quantity: "", unitNetWeight: "0.12" })).netWeight, null);
equal("0.360 in London", kgText(0.36, "en-GB"), "0.360");
equal("0,360 in Istanbul", kgText(0.36, "tr"), "0,360");
for (const language of SUPPORTED_STUDIO_LANGUAGES) expect(`${language}: a weight shows three decimals`, /^0[.,٫]360$|^٠[٫,]٣٦٠$/.test(kgText(0.36, studioLocaleTag(language))));

// ------------------------------------------------------------------ S5 vectors
const found = { code: "911430", tariff: "uk" as const, outcome: "found" as const, description: "Other clock or watch parts › Dials" };
equal("same code: the answer shows", tariffAnswerFor("9114.30", found, "GB"), found);
equal("retyped code: no answer until saved", tariffAnswerFor("9114.31", found, "GB"), null);
equal("GB: 8 digits are asked as 8", tariffAnswerFor("9114.30.00", found, "GB"), null);
equal("outside the UK: the first 6 digits", tariffAnswerFor("9114.30.00", found, "DE"), found);
equal("no answer yet", tariffAnswerFor("9114.30", null, "GB"), null);

// ------------------------------------------------------------------ S7 list (the server's)
const SERVER_CODES = ["C716", "C717", "C718", "C720", "C725", "Y129", "Y132", "Y133", "Y141", "Y142", "Y187", "Y190", "Y191"];
equal("EUDR list = the server's 13 codes", EUDR_TARIC_CODES.map(([code]) => code), SERVER_CODES);
expect("EU-export-only codes are not offered", !isEudrTaricCode("Y188") && !isEudrTaricCode("Y196"));
expect("Y999 is not an EUDR code", !isEudrTaricCode("Y999"));
expect("y129 reads as Y129", isEudrTaricCode("y129"));

// ------------------------------------------------------------------ words and issue sentences
const NEW_ISSUES = ["items_weight_over_parcels", "item_hs_code_not_in_tariff", "item_prefill_unchecked", "item_taric_code_invalid", "item_dds_reference_missing"];
// shipping.ts loads Firebase, so its sentence table is read as text (as check-dhl8-product-codes does).
const FALLBACK = "Something in this shipment needs attention.";
const shippingText = readFileSync(new URL("../lib/studioflow/shipping.ts", import.meta.url), "utf8");
const table = shippingText.slice(shippingText.indexOf("const ISSUE_MESSAGES"), shippingText.indexOf("export function shipmentIssueMessage"));
const issueSentences = NEW_ISSUES.map(code => (table.match(new RegExp(`\\n\\s*${code}: "((?:[^"\\\\]|\\\\.)*)",`)) ?? [])[1] ?? FALLBACK);
NEW_ISSUES.forEach((code, i) => expect(`issue ${code} has its own sentence`, issueSentences[i] !== FALLBACK));
const WORDS = [
  "NivaDesk cannot cancel a DHL courier booking. To cancel it, use the pickup number in MyDHL+ or contact DHL Express customer service. Cancelling the order in NivaDesk cancels neither the courier nor the label.",
  "NivaDesk cannot cancel this courier. To cancel it, use this pickup number in MyDHL+ or contact DHL Express customer service.",
  "Net weight of one item (kg)", "Gross weight of one item (kg)", "Line total sent to DHL: {quantity} × {unit} kg = {total} kg",
  "Saved earlier as the line's total: {total} kg. Type the weight of one item to replace it.", "Net weight of all lines: {lines} kg. Parcels: {parcels} kg.",
  "UK tariff: {description}", "Northern Ireland tariff: {description}", "The tariff could not be checked just now. Check this code yourself on the UK Trade Tariff.",
  "Saving looks the code up in the official tariff.", "More detailed codes exist under this one. UK export declarations use an 8-digit commodity code.",
  "NivaDesk never fills in or confirms an HS code for you. If you are not sure of a code, HMRC can give a binding Advance Tariff Ruling.",
  "Find a commodity code on the UK Trade Tariff", "Fill this line from…",
  "Description and product codes copied from: {source}. Check them. The HS code, origin and weight are not copied.",
  "I checked this line: description, HS code, origin and weight",
  ...issueSentences
];
const languages = SUPPORTED_STUDIO_LANGUAGES.filter(lang => lang !== "English");
equal("eleven other languages", languages.length, 11);
const PLACEHOLDER = /\{[a-z]+\}/g;

type Sources = { dialog: string; panel: string; shipping: string };
const real: Sources = {
  dialog: readFileSync(new URL("../app/orders/ShipmentDraftDialog.tsx", import.meta.url), "utf8"),
  panel: readFileSync(new URL("../app/orders/OrderShipmentsPanel.tsx", import.meta.url), "utf8"),
  shipping: readFileSync(new URL("../lib/studioflow/shipping.ts", import.meta.url), "utf8")
};

/** The screen checks, on any copy of the sources (the real ones, then broken ones). Returns its failures. */
function screenChecks(src: Sources, translate: (word: string, language: string) => string): string[] {
  const saved = failures;
  failures = [];
  const { dialog, panel, shipping } = src;
  for (const word of WORDS) {
    const quoted = `"${word}"`;
    expect(`"${word.slice(0, 50)}" is on screen`, dialog.includes(quoted) || panel.includes(quoted) || shipping.includes(quoted));
    for (const language of languages) {
      const shown = translate(word, language);
      expect(`"${word.slice(0, 40)}" in ${language}`, Boolean(shown) && shown !== word);
      expect(`"${word.slice(0, 40)}" in ${language} keeps its placeholders`, JSON.stringify((shown.match(PLACEHOLDER) ?? []).sort()) === JSON.stringify((word.match(PLACEHOLDER) ?? []).sort()));
    }
  }
  // S3: the sentence sits between the courier box and the ticked-only block, so it shows before booking.
  const box = dialog.indexOf('{t("Book a DHL courier to collect it")}');
  const note = dialog.indexOf('data-testid="pickup-cancel-note"');
  const tickedOnly = dialog.indexOf("{pickup.requested ? (", box);
  expect("S3: the cancel sentence shows before the courier is booked", box > 0 && note > box && tickedOnly > note);
  expect("S3: the order card gives the cancel path with the pickup number", /dispatchConfirmationNumber\s*\?\s*<span className="shipment-muted" data-testid="pickup-cancel-path">/.test(panel));
  expect("S3: no cancel-courier button or call", !/cancel(Pickup|Courier)|DELETE[^\n]*pickups|>\{t\("Cancel (the )?courier/i.test(dialog + panel + shipping));
  // S5
  expect("S5: the tariff answer is read for the typed code only", dialog.includes("tariffAnswerFor(item.hsCode, item.hsTariff, fromCountry)"));
  expect("S5: found, not found and unavailable each show", ['data-outcome="found"', 'data-outcome="not_found"', 'data-outcome="unavailable"'].every(m => dialog.includes(m)));
  expect("S5: the Trade Tariff link", dialog.includes('href="https://www.trade-tariff.service.gov.uk/find_commodity"'));
  expect("S5: the dialog never writes an HS code itself", !/updateItem\(index, "hsCode", (?!e\.target\.value)/.test(dialog) && !/hsCode: (suggestion|answer|item\.hsTariff)/.test(dialog));
  expect("S5: the tariff answer is never sent back", !/hsTariff: item\.hsTariff/.test(dialog) && !/\.\.\.item,?\s*\}\)\)/.test(dialog.slice(dialog.indexOf("items: items.map(item => ({"), dialog.indexOf("items: items.map(item => ({") + 900)));
  // S6
  expect("S6: the old total-weight labels are gone", !dialog.includes('t("Net weight (kg)")') && !dialog.includes('t("Gross weight (kg)")'));
  expect("S6: the patch takes the line's weights from customsLineWeights", /\.\.\.lineWeights\(item\)/.test(dialog) && dialog.includes("customsLineWeights(item)"));
  expect("S6: the unit field edits unitNetWeight", /updateItem\(index, "unitNetWeight", e\.target\.value\)/.test(dialog));
  expect("S6: a new line has no weight", /const emptyItem = \(\): ItemInput => \(\{[\s\S]*?unitNetWeight: "", unitGrossWeight: "", netWeight: "", grossWeight: ""/.test(dialog));
  expect("S6: the line total is shown", dialog.includes('data-testid={`line-weight-${index}`}'));
  // S7
  expect("S7: filling sets where from and asks for the line's check", /prefillSource: suggestion\.source,\s*lineChecked: false/.test(dialog));
  expect("S7: filling takes description and codes only", (() => {
    const start = dialog.indexOf("const applySuggestion");
    const body = dialog.slice(start, dialog.indexOf("};", start));
    return body.includes("suggestion.description") && !/hsCode|manufacturerCountry|Weight/.test(body);
  })());
  expect("S7: the line check is edited and sent", /updateItem\(index, "lineChecked", e\.target\.checked\)/.test(dialog) && /prefillSource: item\.prefillSource, lineChecked: item\.lineChecked/.test(dialog));
  expect("S7: the EUDR code is a list", /<select className="input" value=\{item\.taricDocumentCode\} data-testid=\{`eudr-taric-\$\{index\}`\}/.test(dialog) && dialog.includes("EUDR_TARIC_CODES.map"));
  expect("S7: no free-text TARIC field left", !/<input className="input" value=\{item\.taricDocumentCode\}/.test(dialog));
  const out = failures;
  failures = saved;
  return out;
}

const translate = (word: string, language: string) => studioT(word, language);
for (const failure of screenChecks(real, translate)) failures.push(failure);
// The table's own words are what the app shows (no other table overrides them).
for (const word of WORDS) {
  const row = SHIPPING_TRANSLATIONS[word];
  expect(`"${word.slice(0, 40)}" has its own row`, Boolean(row));
  if (row) for (const language of languages) expect(`"${word.slice(0, 40)}" in ${language} is the table's own`, studioT(word, language) === row[language as keyof typeof row]);
}

// ------------------------------------------------------------------ mutants: each family must go red
const mutants: [string, Sources, (w: string, l: string) => string][] = [
  ["S3 sentence moved inside the ticked-only block", { ...real, dialog: real.dialog.replace('<p className="shipment-note" data-testid="pickup-cancel-note">', '{pickup.requested ? (<p className="shipment-note" data-testid="pickup-cancel-note">') }, translate],
  ["S3 card sentence removed", { ...real, panel: real.panel.replace('data-testid="pickup-cancel-path"', 'data-testid="x"') }, translate],
  ["S3 cancel button added", { ...real, panel: real.panel + '\n<button onClick={() => cancelPickup()}>{t("Cancel courier")}</button>' }, translate],
  ["S5 answer shown for any code", { ...real, dialog: real.dialog.replace("tariffAnswerFor(item.hsCode, item.hsTariff, fromCountry)", "item.hsTariff") }, translate],
  ["S5 code filled by the screen", { ...real, dialog: real.dialog.replace("prefillSource: suggestion.source,", "hsCode: suggestion.description, prefillSource: suggestion.source,") }, translate],
  ["S6 old total label back", { ...real, dialog: real.dialog.replace('t("Net weight of one item (kg)")', 't("Net weight (kg)")') }, translate],
  ["S6 a new line weighs 1 kg", { ...real, dialog: real.dialog.replace('unitNetWeight: "", unitGrossWeight: "", netWeight: "", grossWeight: ""', 'unitNetWeight: "1", unitGrossWeight: "", netWeight: "", grossWeight: ""') }, translate],
  ["S7 filled line not asked to be checked", { ...real, dialog: real.dialog.replace("lineChecked: false\n", "lineChecked: true\n") }, translate],
  ["S7 TARIC back to free text", { ...real, dialog: real.dialog.replace('<select className="input" value={item.taricDocumentCode}', '<input className="input" value={item.taricDocumentCode}') }, translate],
  ["a language missing", real, (w, l) => (l === "Deutsch" && w.startsWith("NivaDesk cannot cancel a DHL") ? w : translate(w, l))],
  ["a placeholder lost in translation", real, (w, l) => (l === "Türkçe" && w.startsWith("Line total sent") ? translate(w, l).replace("{total}", "") : translate(w, l))]
];
for (const [name, src, tr] of mutants) {
  const red = screenChecks(src, tr);
  expect(`mutant "${name}" is caught`, red.length > 0);
}
// The S6 vectors themselves can fail: a mutant that multiplies a saved total again.
expect("mutant: a saved total multiplied again is caught", JSON.stringify(customsLineWeights(line({ netWeight: "0.36" }))) !== JSON.stringify({ unitNetWeight: 0.36, unitGrossWeight: 0.36, netWeight: 1.08, grossWeight: 1.08 }));

if (failures.length) {
  console.log(`check-dhl-s2-s7: ${failures.length} of ${checks} FAILED`);
  for (const failure of failures.slice(0, 60)) console.log(`  FAIL ${failure}`);
  process.exit(1);
}
console.log(`check-dhl-s2-s7: ${checks}/${checks} OK (${mutants.length + 1} mutants caught)`);

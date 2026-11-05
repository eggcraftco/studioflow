// "Download for MyDHL+" (owner's request, 3 + 5 Nov 2026): a NivaDesk DHL draft as a file for MyDHL+ ▸ Ship ▸
// Upload a Shipment File (upload option "NivaDesk"), where it is an unsent shipment to edit, save for later or label.
//   npx tsx scripts/check-mydhl-upload-file.mts
//
// - the fictional draft of order #102 gives, byte for byte, the file MyDHL+ accepted on 5 Nov 2026
//   ("Successful: 1 of 1 shipment(s) created", scripts/fixtures/mydhl-upload-accepted-NVD-102.csv);
// - what the uploads taught: no byte-order mark (it was read into the first header), the incoterm in "Trade Term"
//   (not "Terms of Payment": "Customs Terms of Trade Required"), the US state's NAME as well as its code
//   ("Invalid ZIP/Postal Code" with "NY"), the required "Account Number (Shipper)" and "Product Code (3 Letter)"
//   columns, ONE ROW PER SHIPMENT (two rows made two shipments) with the first customs line;
// - the dialog saves first, builds the file from the same patch it saves, says how many customs lines to add in
//   MyDHL+, and never creates a label or asks DHL anything;
// - every new sentence in the eleven other languages, placeholders kept;
// - the checks can fail: each family is run again on a broken copy (mutant) and must go red.
import { readFileSync } from "node:fs";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";
import { SHIPPING_TRANSLATIONS } from "../lib/studioflow/shippingTranslations";
import { MYDHL_UPLOAD_COLUMNS, MYDHL_UPLOAD_VALUES, myDhlUploadCsv, myDhlUploadExtraLines, myDhlUploadFileName, myDhlUploadRows } from "../lib/studioflow/mydhlUploadFile";

let failures: string[] = [];
let checks = 0;
const expect = (name: string, ok: boolean) => { checks += 1; if (!ok) failures.push(name); };
const equal = (name: string, actual: unknown, wanted: unknown) => expect(`${name} (got ${JSON.stringify(actual)}, want ${JSON.stringify(wanted)})`, JSON.stringify(actual) === JSON.stringify(wanted));

type Gen = { csv: typeof myDhlUploadCsv; rows: typeof myDhlUploadRows; extra: typeof myDhlUploadExtraLines };
const real: Gen = { csv: myDhlUploadCsv, rows: myDhlUploadRows, extra: myDhlUploadExtraLines };

const draft102 = () => ({
  recipient: { fullName: "DHL TEST Receiver", companyName: "", phone: "+1 212 555 0100", email: "", address: { line1: "350 Fifth Avenue", line2: "", city: "New York", postalCode: "10118", provinceCode: "NY", countryCode: "US" } },
  pieces: [{ weight: 0.8, length: 12, width: 12, height: 12 }],
  contentsDescription: "Wristwatch",
  planned: { date: "2026-11-06", time: "10:00" },
  service: { productCode: "P" },
  customs: {
    declarable: true, dutiesPayer: "receiver" as const, incoterm: "DAP", declaredValue: 5500, currency: "GBP", exportReasonType: "commercial_purpose_or_sale", shipmentType: "commercial" as const,
    invoice: { number: "DHLTEST-102", date: "2026-11-05" },
    items: [{ description: "Wristwatch, stainless steel, automatic (Rolex)", quantity: 1, quantityUnit: "PCS", unitValue: 5500, hsCode: "91022100", manufacturerCountry: "CH", netWeight: 0.15, grossWeight: 0.8 }]
  }
});
const accepted = readFileSync(new URL("./fixtures/mydhl-upload-accepted-NVD-102.csv", import.meta.url), "utf8");
const parse = (csv: string) => csv.trimEnd().split("\r\n").map(line => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replace(/""/g, '"')));

function fileChecks(gen: Gen): string[] {
  const saved = failures; failures = [];
  const csv = gen.csv({ orderReference: "NVD-102", draft: draft102() as never });
  expect("#102 gives the file MyDHL+ accepted, byte for byte", csv === accepted);
  expect("no byte-order mark", !csv.startsWith("﻿"));
  const [header, row, more] = parse(csv);
  equal("39 columns", header.length, 39);
  equal("the header is the mapping's order", header, [...MYDHL_UPLOAD_COLUMNS]);
  const at = (name: string) => row[header.indexOf(name)];
  equal("incoterm in Trade Term", at("Trade Term"), "DAP");
  expect("no Terms of Payment column", !header.includes("Terms of Payment"));
  equal("state name for the US", at("State/Province (Ship TO)"), "New York");
  equal("state code kept too", at("State/Province Code (Ship TO)"), "NY");
  expect("the account column is there, empty", header.includes("Account Number (Shipper)") && at("Account Number (Shipper)") === "");
  equal("P is WPX", at("Product Code (3 Letter)"), "WPX");
  equal("phone split", [at("Phone Country Code (Ship TO)"), at("Phone Number (Ship TO)")], ["1", "2125550100"]);
  equal("the order's reference", at("Shipment Reference 1"), "NVD-102");
  expect("one row", more === undefined);
  // Two customs lines: still one row (one shipment), the first line, one line left for MyDHL+.
  const two = draft102(); two.customs.items.push({ description: "Leather watch strap", quantity: 2, quantityUnit: "PCS", unitValue: 30, hsCode: "9113.90.00", manufacturerCountry: "GB", netWeight: 0.04, grossWeight: 0.06 });
  const rows2 = gen.rows({ orderReference: "NVD-102", draft: two as never });
  equal("two customs lines: header + one row", rows2.length, 2);
  equal("the row carries the first line", rows2[1][MYDHL_UPLOAD_COLUMNS.indexOf("Item Description")], "Wristwatch, stainless steel, automatic (Rolex)");
  equal("one line left for MyDHL+", gen.extra(two as never), 1);
  equal("one line: nothing left", gen.extra(draft102() as never), 0);
  // Documents: no customs columns, D.
  const docs = { ...draft102(), customs: { declarable: false } };
  const docRow = gen.rows({ orderReference: "NVD-7", draft: docs as never })[1];
  equal("documents: Shipment Type D", docRow[MYDHL_UPLOAD_COLUMNS.indexOf("Shipment Type")], MYDHL_UPLOAD_VALUES.shipmentType.documents);
  expect("documents: no customs values", ["Declared Value", "Trade Term", "Item Description", "Commodity Code"].every(c => docRow[MYDHL_UPLOAD_COLUMNS.indexOf(c as never)] === ""));
  equal("documents: nothing left for MyDHL+", gen.extra(docs as never), 0);
  // Two parcels: count and total, no single set of dimensions.
  const parcels = { ...draft102(), pieces: [{ weight: 0.5, length: 10, width: 10, height: 10 }, { weight: 0.3, length: 5, width: 5, height: 5 }] };
  const pRow = gen.rows({ orderReference: "NVD-9", draft: parcels as never })[1];
  equal("two parcels: count, total, no dimensions", ["Total Shipment Pieces", "Total Weight", "Piece Length"].map(c => pRow[MYDHL_UPLOAD_COLUMNS.indexOf(c as never)]), ["2", "0.8", ""]);
  // Canada and elsewhere.
  const ca = { ...draft102(), recipient: { ...draft102().recipient, address: { ...draft102().recipient.address, countryCode: "CA", provinceCode: "QC" } } };
  equal("Canada: province name", gen.rows({ orderReference: "NVD-9", draft: ca as never })[1][MYDHL_UPLOAD_COLUMNS.indexOf("State/Province (Ship TO)")], "Quebec");
  const au = { ...draft102(), recipient: { ...draft102().recipient, phone: "+61 412 345 678", address: { ...draft102().recipient.address, countryCode: "AU", provinceCode: "nsw" } } };
  const auRow = gen.rows({ orderReference: "NVD-9", draft: au as never })[1];
  equal("elsewhere: the code", auRow[MYDHL_UPLOAD_COLUMNS.indexOf("State/Province (Ship TO)")], "NSW");
  equal("Australian phone", [auRow[MYDHL_UPLOAD_COLUMNS.indexOf("Phone Country Code (Ship TO)")], auRow[MYDHL_UPLOAD_COLUMNS.indexOf("Phone Number (Ship TO)")]], ["61", "412345678"]);
  const unknownProduct = { ...draft102(), service: { productCode: "8" } };
  equal("a code without a known 3-letter one stays empty", gen.rows({ orderReference: "NVD-9", draft: unknownProduct as never })[1][MYDHL_UPLOAD_COLUMNS.indexOf("Product Code (3 Letter)")], "");
  // Quotes and line breaks.
  const quoted = { ...draft102(), contentsDescription: 'Dial "Blue"\nsecond line' };
  const qCsv = gen.csv({ orderReference: "NVD-9", draft: quoted as never });
  expect("a quote is doubled and a line break is a space", qCsv.includes('"Dial ""Blue"" second line"') && qCsv.trimEnd().split("\r\n").length === 2);
  equal("file name", myDhlUploadFileName("NVD-102", 1), "nivadesk-mydhl-NVD-102-S1.csv");
  equal("file name without odd characters", myDhlUploadFileName("NVD-X/1 2", "3"), "nivadesk-mydhl-NVD-X12-S3.csv");
  const out = failures; failures = saved; return out;
}

// ------------------------------------------------------------------ the dialog and the words
const NEW_WORDS = [
  "Download for MyDHL+",
  "Download for MyDHL+ saves this draft and downloads it as a file for MyDHL+ ▸ Ship ▸ Upload a Shipment File (upload option “NivaDesk”). In MyDHL+ it becomes an unsent shipment under Manage Shipments, which you can edit, save for later or label there. NivaDesk sends nothing to DHL.",
  "The file for MyDHL+ was downloaded: {file}. Upload it in MyDHL+ ▸ Ship ▸ Upload a Shipment File.",
  "MyDHL+'s upload takes one customs line per shipment, so the file carries the first line. Add the other {count} customs lines in MyDHL+ before you print the label."
];
const languages = SUPPORTED_STUDIO_LANGUAGES.filter(lang => lang !== "English");
const PLACEHOLDER = /\{[a-z]+\}/g;
const dialogText = readFileSync(new URL("../app/orders/ShipmentDraftDialog.tsx", import.meta.url), "utf8");
const between = (text: string, from: string, to: string) => { const i = text.indexOf(from); if (i < 0) return ""; const j = text.indexOf(to, i + from.length); return text.slice(i, j < 0 ? undefined : j); };

function screenChecks(dialog: string, translate: (w: string, l: string) => string): string[] {
  const saved = failures; failures = [];
  for (const word of NEW_WORDS) {
    expect(`"${word.slice(0, 40)}" is on screen`, dialog.includes(`"${word}"`));
    for (const language of languages) {
      const shown = translate(word, language);
      expect(`"${word.slice(0, 30)}" in ${language}`, Boolean(shown) && shown !== word);
      expect(`"${word.slice(0, 30)}" in ${language} keeps its placeholders`, JSON.stringify((shown.match(PLACEHOLDER) ?? []).sort()) === JSON.stringify((word.match(PLACEHOLDER) ?? []).sort()));
    }
  }
  const handler = between(dialog, "async function downloadForMyDhl()", "// What DHL's answer to the check says");
  expect("the button downloads the file", /data-testid="mydhl-file-button"[^\n]{0,200}onClick=\{\(\) => void downloadForMyDhl\(\)\}/.test(dialog));
  expect("it saves first", /await persist\(\);[\s\S]*myDhlUploadCsv/.test(handler));
  expect("the file is built from the patch that is saved", handler.includes("const draftNow = buildPatch();") && handler.includes("myDhlUploadCsv({ orderReference, draft: draftNow })"));
  expect("it says how many customs lines to add in MyDHL+", handler.includes("myDhlUploadExtraLines(draftNow)") && /extraLines > 0 \? t\("MyDHL\+'s upload takes one customs line per shipment/.test(handler));
  expect("it never makes a label, checks with DHL or locks the form", handler.length > 0 && !/createOrderShipment|checkOrderShipmentWithDhl|onCreated|setLocked/.test(handler));
  expect("the explanation sits beside the button", dialog.includes('data-testid="mydhl-file-explain"'));
  const out = failures; failures = saved; return out;
}

const translate = (w: string, l: string) => studioT(w, l);
for (const f of fileChecks(real)) failures.push(f);
for (const f of screenChecks(dialogText, translate)) failures.push(f);
for (const word of NEW_WORDS) {
  const row = SHIPPING_TRANSLATIONS[word];
  expect(`"${word.slice(0, 40)}" has its own row`, Boolean(row));
  if (row) for (const language of languages) expect(`"${word.slice(0, 30)}" in ${language} is the table's own`, studioT(word, language) === row[language as keyof typeof row]);
}

// ------------------------------------------------------------------ mutants
const withBom: Gen = { ...real, csv: input => "﻿" + real.csv(input) };
const termsOfPayment: Gen = { ...real, csv: input => real.csv(input).replace('"Trade Term"', '"Terms of Payment"') };
const stateCode: Gen = { ...real, csv: input => real.csv(input).replace('"New York"', '"NY"'), rows: input => real.rows(input).map(r => r.map(v => (v === "New York" ? "NY" : v))) };
const noAccount: Gen = { ...real, csv: input => real.csv(input).replace(',"Account Number (Shipper)"', "").replace(/,""(,"[^"]*")\r\n$/, "$1\r\n") };
const rowPerLine: Gen = {
  ...real,
  rows: input => { const base = real.rows(input); const items = (input.draft.customs?.items ?? []); return items.length > 1 ? [...base, ...items.slice(1).map(() => base[1])] : base; },
  extra: () => 0
};
const fileMutants: [string, Gen][] = [["byte-order mark back", withBom], ["incoterm in Terms of Payment", termsOfPayment], ["state code in the name column", stateCode], ["account column dropped", noAccount], ["a row per customs line", rowPerLine]];
for (const [name, gen] of fileMutants) expect(`mutant "${name}" is caught`, fileChecks(gen).length > 0);
const screenMutants: [string, string, (w: string, l: string) => string][] = [
  ["the button makes the label", dialogText.replace("onClick={() => void downloadForMyDhl()}", "onClick={() => void create()}"), translate],
  ["no save first", dialogText.replace("      await persist();\n      const fileName = myDhlUploadFileName", "      const fileName = myDhlUploadFileName"), translate],
  ["extra lines not said", dialogText.replace("extraLines > 0 ? t(", "false ? t("), translate],
  ["a language missing", dialogText, (w, l) => (l === "Deutsch" && w === "Download for MyDHL+" ? w : translate(w, l))],
  ["a placeholder lost", dialogText, (w, l) => (l === "Türkçe" && w.startsWith("The file for MyDHL+") ? translate(w, l).replace("{file}", "") : translate(w, l))]
];
for (const [name, src, tr] of screenMutants) expect(`mutant "${name}" is caught`, screenChecks(src, tr).length > 0);

if (failures.length) {
  console.log(`check-mydhl-upload-file: ${failures.length} of ${checks} FAILED`);
  for (const f of failures.slice(0, 60)) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`check-mydhl-upload-file: ${checks}/${checks} OK (${fileMutants.length + screenMutants.length} mutants caught)`);

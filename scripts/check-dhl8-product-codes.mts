// DHL-8 (27 Oct 2026): product codes on customs lines in the DHL shipment dialog.
//   npx tsx scripts/check-dhl8-product-codes.mts
//
// - every issue code the server raises for product codes (functions/shipping/productIds.js
//   ISSUE_TEXT, plus line_reference_type_invalid from dhl/request.js) has its own sentence, not the
//   "Something in this shipment needs attention." fallback;
// - every new word of the dialog and of those sentences is translated in all eleven languages;
// - the dialog shows the five line fields and sends them back in the patch (an app that drops
//   them would make the server keep the old codes only for unchanged lines);
// - the checks can fail: an unknown code gets the fallback, an unknown key is "missing".
import { readFileSync } from "node:fs";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";

// shipping.ts loads the Firebase client, so its ISSUE_MESSAGES table is read from the source (as
// shipmentIssueMessage does: the code's own sentence, else FALLBACK).
const shippingSource = readFileSync(new URL("../lib/studioflow/shipping.ts", import.meta.url), "utf8");
const table = shippingSource.slice(shippingSource.indexOf("const ISSUE_MESSAGES"), shippingSource.indexOf("export function shipmentIssueMessage"));
const shipmentIssueMessage = (issue: { code: string }, t: (text: string) => string) => {
  const m = table.match(new RegExp(`\\n\\s*${issue.code}: "((?:[^"\\\\]|\\\\.)*)",`));
  return t(m ? m[1] : FALLBACK);
};

const FALLBACK = "Something in this shipment needs attention.";
const failures: string[] = [];
let checks = 0;
const expect = (name: string, ok: boolean) => { checks += 1; if (!ok) failures.push(name); };
const english = (text: string) => text;

const CODES = [
  "item_merchant_pid_missing", "item_manufacturer_pid_missing", "item_pid_placeholder", "item_standard_pid_invalid",
  "item_dds_reference_invalid", "item_taric_code_invalid", "eu_b2c_use_mydhl_plus", "eu_product_ids_not_supported",
  "line_reference_type_invalid", "item_standard_pid_unconfirmed", "recipient_kind_unconfirmed"
];
const sentences = CODES.map(code => shipmentIssueMessage({ code }, english));
CODES.forEach((code, i) => expect(`issue ${code} has its own sentence`, sentences[i] !== FALLBACK && sentences[i].length > 10));
expect("table found in shipping.ts", table.includes("item_hs_code_missing"));
expect("self-check: an unknown code falls back", shipmentIssueMessage({ code: "no_such_code" }, english) === FALLBACK);

const DIALOG_WORDS = [
  "Product codes", "Your product code (SKU)", "Manufacturer's product code", "Barcode (GTIN/EAN/UPC), if any",
  "EUDR references (only for goods the EU deforestation rules cover)", "EUDR due-diligence reference (DDS)", "TARIC document code",
  "Copy codes from…", "Order line", "Watch reference on the order", "Held for this order",
  "This shipment goes to a consumer in the EU: from 1 November 2026 every line needs your product code and the manufacturer's product code. If you made the item, the manufacturer's code is your own model code. One code per product variant, never an order or batch number.",
  "Needed on shipments to consumers in the EU from 1 November 2026. Optional here.",
  // r2: business or consumer, no barcode (Y081), line-named refusals with the MyDHL+ path
  "Recipient type", "Automatic (from the details above)", "Business", "Consumer", "Recipient's VAT number (businesses only)",
  "Read as a business: the recipient has a VAT or EORI number.", "Read as a consumer: there is no company name.",
  "A company name alone does not show that the recipient is a business. Choose Business or Consumer.",
  "The recipient changed after the type was chosen. Choose again.", "Orders from online shops and marketplaces usually come from consumers.",
  "This product has no barcode (GTIN/EAN/UPC)", "Line {n}",
  "Or create this shipment in MyDHL+ with the reference {reference}, then use “Find shipments made on MyDHL” on the order to link it."
];
const languages = SUPPORTED_STUDIO_LANGUAGES.filter(lang => lang !== "English");
expect("eleven languages besides English", languages.length === 11);
for (const key of [...DIALOG_WORDS, ...sentences]) {
  for (const lang of languages) expect(`"${key.slice(0, 50)}…" in ${lang}`, studioT(key, lang) !== key && studioT(key, lang).trim().length > 0);
}
expect("self-check: an unknown key is missing", studioT("No such DHL-8 key", "Türkçe") === "No such DHL-8 key");

const dialog = readFileSync(new URL("../app/orders/ShipmentDraftDialog.tsx", import.meta.url), "utf8");
for (const field of ["merchantProductId", "manufacturerProductId", "standardProductId", "ddsReference", "taricDocumentCode"]) {
  expect(`dialog edits ${field}`, new RegExp(`updateItem\\(index, "${field}"`).test(dialog));
  expect(`dialog sends ${field}`, new RegExp(`${field}: item\\.${field}`).test(dialog));
  expect(`dialog reads ${field}`, new RegExp(`${field}: i\\.${field} \\?\\? ""`).test(dialog));
}
for (const word of DIALOG_WORDS) expect(`dialog uses "${word.slice(0, 40)}"`, dialog.includes(`"${word}"`));
// r2 wiring: the choice and the VAT go back to the server; the tick is read, edited and sent; a refusal names its line and offers MyDHL+.
expect("dialog sends the recipient kind", /kind: recipient\.kind/.test(dialog));
expect("dialog sends the recipient VAT as a registration", /typeCode: "VAT", number: recipient\.vat\.trim\(\)/.test(dialog));
expect("dialog edits the no-barcode tick", /updateItem\(index, "standardProductIdAbsent", e\.target\.checked\)/.test(dialog));
expect("dialog sends the tick only without a barcode", /standardProductIdAbsent: !item\.standardProductId\.trim\(\) && item\.standardProductIdAbsent/.test(dialog));
expect("dialog reads the tick", /standardProductIdAbsent: i\.standardProductIdAbsent === true/.test(dialog));
expect("issues name their line", /t\("Line \{n\}"\)\.replace\("\{n\}", String\(line\)\)/.test(dialog));
expect("refusals offer MyDHL+ with the order reference", /issue\.detail\?\.alternative === "mydhl_plus"/.test(dialog) && /\.replace\("\{reference\}", orderReference\)/.test(dialog));
// The MyDHL+ sentence names the panel's own button in every language (the same words as "Find shipments made on MyDHL").
const ALT = "Or create this shipment in MyDHL+ with the reference {reference}, then use “Find shipments made on MyDHL” on the order to link it.";
for (const lang of languages) expect(`MyDHL+ sentence names the panel button in ${lang}`, studioT(ALT, lang).includes(studioT("Find shipments made on MyDHL", lang)) && studioT(ALT, lang).includes("{reference}"));
expect("no maxLength cuts a code (the server reports too_long instead)", !/value=\{item\.(merchantProductId|manufacturerProductId|standardProductId|ddsReference|taricDocumentCode)\}[^>]*maxLength/.test(dialog));

if (failures.length) {
  console.error(`DHL-8 product codes: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`DHL-8 product codes: ${checks} checks passed (${CODES.length} issue sentences, ${DIALOG_WORDS.length} dialog words, 11 languages, 5 fields read/edited/sent).`);

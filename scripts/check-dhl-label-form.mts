// DHL-10 (4 Nov 2026): the DHL label form beside MyDHL+'s own.
//   npx tsx scripts/check-dhl-label-form.mts
//
// - phone: the country code is chosen beside the number; a stored number splits into code and rest,
//   and the form writes "+<code> <number>" (the trunk 0 dropped where the country uses one);
// - currency: picked from DHL's own list, the sender's country's first;
// - money fields: read the same in every locale (the payment-link reader), shown with the reader's
//   grouping, and what a field shows reads back to the same value in all twelve languages;
// - every new word of the dialog, the order card and the new issue codes is translated in all eleven
//   languages (and the table's word is the one the app shows: no other table overrides it);
// - the dialog no longer asks for a typed currency or calls the company optional, offers the courier
//   only to a server that keeps it, and sends the pickup and the composed phone back;
// - the checks can fail: a wrong vector, a missing word or a removed piece is reported.
import { readFileSync } from "node:fs";
import { studioT, studioLocaleTag, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";
import { SHIPPING_TRANSLATIONS } from "../lib/studioflow/shippingTranslations";
import { CALLING_CODES, callingCodeFor, composePhone, splitPhone } from "../lib/studioflow/dhlPhone";
import { DHL_COUNTRY_CURRENCY, DHL_CURRENCIES, currencyChoices, currencyMark, dhlCountryCurrency } from "../lib/studioflow/dhlCurrencies";
import { DHL_COUNTRIES } from "../lib/studioflow/dhlCountries";
import { amountText, formatMoney, readAmount } from "../lib/studioflow/customsAmount";

const failures: string[] = [];
let checks = 0;
const expect = (name: string, ok: boolean) => { checks += 1; if (!ok) failures.push(name); };
const equal = (name: string, actual: unknown, wanted: unknown) => expect(`${name} (got ${JSON.stringify(actual)}, want ${JSON.stringify(wanted)})`, JSON.stringify(actual) === JSON.stringify(wanted));

// ------------------------------------------------------------------ phone
const dhlCodes = DHL_COUNTRIES.map(([code]) => code);
equal("every DHL country has a calling code", dhlCodes.filter(code => !callingCodeFor(code)), []);
equal("no calling code for a country DHL does not list", Object.keys(CALLING_CODES).filter(code => !dhlCodes.includes(code)), []);
const splits: [string, string, { country: string; national: string }][] = [
  ["07700 900123", "GB", { country: "GB", national: "7700 900123" }],
  ["+44 7700 900123", "GB", { country: "GB", national: "7700 900123" }],
  ["+44 (0)20 7946 0000", "GB", { country: "GB", national: "20 7946 0000" }],
  ["0044 7700 900123", "DE", { country: "GB", national: "7700 900123" }],
  ["+1 212 555 0100", "CA", { country: "CA", national: "212 555 0100" }],
  ["+1 212 555 0100", "GB", { country: "US", national: "212 555 0100" }],
  ["+90 532 123 45 67", "TR", { country: "TR", national: "532 123 45 67" }],
  ["0532 123 45 67", "TR", { country: "TR", national: "532 123 45 67" }],
  ["06 1234 5678", "IT", { country: "IT", national: "06 1234 5678" }],
  ["+34 612 34 56 78", "ES", { country: "ES", national: "612 34 56 78" }],
  ["", "FR", { country: "FR", national: "" }]
];
for (const [stored, country, wanted] of splits) equal(`split ${stored} (${country})`, splitPhone(stored, country), wanted);
const composed: [string, string, string][] = [
  ["GB", "07700 900123", "+44 7700 900123"],
  ["GB", "7700  900123", "+44 7700 900123"],
  ["IT", "06 1234 5678", "+39 06 1234 5678"],
  ["US", "1 212 555 0100", "+1 212 555 0100"],
  ["DE", "030 1234567", "+49 30 1234567"],
  ["GB", "", ""],
  ["GB", "  ", ""]
];
for (const [country, national, wanted] of composed) equal(`compose ${country} ${national}`, composePhone(country, national), wanted);
// Split then composed again gives the international form, for any number the dialog opens with.
equal("round trip GB", composePhone(splitPhone("+44 7700 900123", "GB").country, splitPhone("+44 7700 900123", "GB").national), "+44 7700 900123");

// ------------------------------------------------------------------ currency
equal("DHL's list: GB is GBP", dhlCountryCurrency("GB"), "GBP");
equal("DHL's list: DE is EUR", dhlCountryCurrency("de"), "EUR");
equal("DHL's list has a currency for every DHL country", dhlCodes.filter(code => !/^[A-Z]{3}$/.test(DHL_COUNTRY_CURRENCY[code] ?? "")), []);
expect("DHL names 100+ currencies", DHL_CURRENCIES.length > 100);
equal("choices from GB start GBP, EUR, USD", currencyChoices("GB").slice(0, 3), ["GBP", "EUR", "USD"]);
equal("choices from US start USD, GBP, EUR", currencyChoices("US").slice(0, 3), ["USD", "GBP", "EUR"]);
equal("choices from TR start TRY", currencyChoices("TR")[0], "TRY");
equal("choices never repeat", new Set(currencyChoices("DE")).size, currencyChoices("DE").length);
equal("a draft's currency DHL does not list is kept", currencyChoices("GB", "XAU")[0], "XAU");
equal("the pound's mark", currencyMark("GBP", "en-GB"), "£");

// ------------------------------------------------------------------ money fields
const localeOf = (language: string) => studioLocaleTag(language);
equal("1750 in London", amountText(1750, "GBP", "en-GB"), "1,750.00");
equal("1750 in Istanbul", amountText(1750, "GBP", "tr"), "1.750,00");
equal("1750 in Berlin", amountText(1750, "EUR", "de"), "1.750,00");
equal("1750 yen", amountText(1750, "JPY", "ja"), "1,750");
equal("1234567.5 in Delhi groups in threes", amountText(1234567.5, "INR", "hi"), "1,234,567.50");
equal("typed 1750", readAmount("1750", "GBP", "en-GB"), { value: 1750, error: "" });
equal("typed 1.750,00 in Istanbul", readAmount("1.750,00", "GBP", "tr"), { value: 1750, error: "" });
equal("typed 12,5 in Istanbul", readAmount("12,5", "GBP", "tr"), { value: 12.5, error: "" });
equal("typed 0", readAmount("0", "GBP", "en-GB"), { value: 0, error: "" });
equal("typed nothing", readAmount("  ", "GBP", "en-GB"), { value: null, error: "" });
expect("1,750 is refused as two readings", readAmount("1,750", "GBP", "en-GB").value === null && /two ways/.test(readAmount("1,750", "GBP", "en-GB").error));
expect("€12 on a pound declaration is refused", /different currency/.test(readAmount("€12", "GBP", "en-GB").error));
for (const language of SUPPORTED_STUDIO_LANGUAGES) {
  const locale = localeOf(language);
  for (const [value, currency] of [[0.5, "GBP"], [12.5, "EUR"], [1750, "GBP"], [1234567.89, "USD"], [1750, "JPY"]] as [number, string][]) {
    const shown = amountText(value, currency, locale);
    equal(`${language}: ${value} ${currency} reads back from "${shown}"`, readAmount(shown, currency, locale).value, value);
  }
}
expect("the total shows the pound", formatMoney(1750, "GBP", "en-GB").startsWith("£"));

// ------------------------------------------------------------------ words
const dialog = readFileSync(new URL("../app/orders/ShipmentDraftDialog.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../app/orders/OrderShipmentsPanel.tsx", import.meta.url), "utf8");
const shippingSource = readFileSync(new URL("../lib/studioflow/shipping.ts", import.meta.url), "utf8");
const amountSource = readFileSync(new URL("../lib/studioflow/customsAmount.ts", import.meta.url), "utf8");
const incotermNames = [...dialog.slice(dialog.indexOf("const INCOTERM_NAMES"), dialog.indexOf("const IMPLIED_INCOTERM")).matchAll(/[A-Z]{3}: "([^"]+)"/g)].map(m => m[1]);
equal("eleven incoterm names", incotermNames.length, 11);
const issueSentence = (code: string) => (shippingSource.match(new RegExp(`\\n\\s*${code}: "((?:[^"\\\\]|\\\\.)*)",`)) ?? [])[1] ?? "";
const PICKUP_CODES = ["pickup_close_time_missing", "pickup_close_before_ready", "pickup_close_time_invalid"];
for (const code of PICKUP_CODES) expect(`issue ${code} has its own sentence`, issueSentence(code).length > 10);
const WORDS = [
  "Company", "Company name", "Not a company: use the recipient's name", "Country code", "Code…", "DHL gets:",
  "DHL needs a company name on every label. For a private person it is their own name, as in MyDHL+.",
  "Currency", "From the sender's country. Change it if the invoice is in another currency.",
  "This amount names a different currency from the one chosen for the declaration.",
  "Left empty, the net weight is used.", "Total units",
  "* Required by EU customs: from 1 November 2026, every line of a consumer shipment into the EU needs at least your product code and the manufacturer's product code (EU rule 2026/1022). DHL asks for them on every such shipment, whatever its value. MyDHL+ shows the same fields without a star.",
  "In MyDHL+: {name}", "Ready for collection at", "Book a DHL courier to collect it", "Latest collection time",
  "Where to collect it (optional)", "Reception", "Note for the courier (optional)",
  "The latest collection time must be after the ready time.", "DHL collects between {from} and {to} on this day.",
  "For this service, the parcel must be handed over by {time}.",
  "Show DHL's services for this parcel to see when DHL can collect on this day.",
  "These times are outside DHL's collection hours for this day. DHL may move or refuse the pickup.",
  "Creating the label sends this shipment to DHL once and books a DHL courier for {date}, between {from} and {to}. The order is not marked dispatched until DHL scans the parcel.",
  "DHL courier booked:", "Pickup number", "DHL courier requested:",
  "DHL's pickup number did not come back. Check the pickup in MyDHL+ before booking another.",
  ...incotermNames,
  ...PICKUP_CODES.map(issueSentence),
  // The payment-link reader's refusals, shown under a money field.
  "This amount can be read two ways. Type it without a thousands separator, or with two decimals.",
  "An amount can have at most two decimals.", "This currency does not use decimals.",
  "The thousands separators in this amount are not in the right place.",
  "This amount could not be read. Type digits, with a comma or a dot before the decimals.", "Enter an amount above zero."
];
for (const word of WORDS) {
  const used = dialog.includes(JSON.stringify(word).slice(1, -1)) || panel.includes(word) || shippingSource.includes(word) || amountSource.includes(word) || incotermNames.includes(word) || /^(This amount can|An amount can|This currency does|The thousands|This amount could|Enter an amount)/.test(word);
  expect(`"${word.slice(0, 50)}" is used on screen`, used);
  for (const language of SUPPORTED_STUDIO_LANGUAGES) {
    if (language === "English") continue;
    const shown = studioT(word, language);
    const row = SHIPPING_TRANSLATIONS[word];
    expect(`"${word.slice(0, 40)}" in ${language}`, Boolean(shown) && (shown !== word || Boolean(row && row[language as keyof typeof row] === word)));
    if (row && row[language as keyof typeof row]) expect(`"${word.slice(0, 40)}" in ${language} is the table's own`, shown === row[language as keyof typeof row]);
  }
}
expect("self-check: an unknown word is not translated", studioT("No such DHL-10 sentence", "Türkçe") === "No such DHL-10 sentence");

// ------------------------------------------------------------------ the dialog's own pieces
expect("the typed currency field is gone", !dialog.includes("Currency (3 letters)"));
expect("the company is no longer called optional", !dialog.includes("Company (optional)"));
expect("the currency is a list", /<select [^\n]*data-testid="customs-currency"/.test(dialog));
expect("money fields are text, not number inputs", !/type="number"[^>]*value=\{item\.unitValue\}/.test(dialog) && !/type="number"[^>]*value=\{declaredValue\}/.test(dialog));
expect("the courier is offered only to a server that keeps it", dialog.includes("const pickupSupported = draft.pickup !== undefined") && dialog.includes("{pickupSupported ? ("));
expect("the patch sends the pickup", /pickup: \{ requested: pickup\.requested, closeTime: pickup\.closeTime, location: pickup\.location, instructions: pickup\.instructions \}/.test(dialog));
expect("the patch sends the composed phone", dialog.includes("phone: composePhone(phone.country, phone.national)"));
expect("no company is stored empty", dialog.includes('companyName: noCompany ? "" : recipient.companyName'));
expect("the incoterm list carries names", dialog.includes("{incotermLabel(code)}"));
expect("the order card shows a booked courier", panel.includes('data-testid="pickup-booked"'));

if (failures.length) {
  console.log(`check-dhl-label-form: ${failures.length} of ${checks} FAILED`);
  for (const failure of failures.slice(0, 60)) console.log(`  FAIL ${failure}`);
  process.exit(1);
}
console.log(`check-dhl-label-form: ${checks}/${checks} OK`);

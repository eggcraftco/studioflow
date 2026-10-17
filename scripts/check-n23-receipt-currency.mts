// N23 server part (17 Oct), web side: the waiting receipt's own currency.
// The server now stores `documentCurrency` on bankReceiptInbox rows (null when
// the document does not say; rows queued before have no field) and returns
// `parsed.currency` from bankMatchReceipt. The web reads it, never falls back
// to the bank's GBP, and stops calling a same number in another currency a
// lookalike. Against the real modules (memory "tests that assert the bug").
//
// Run: npx tsx scripts/check-n23-receipt-currency.mts
import { readFileSync } from "node:fs";
import path from "node:path";

process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||= "check-only-not-a-key";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "demo-check";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const { studioT, SUPPORTED_STUDIO_LANGUAGES } = await import("@/lib/studioflow/language");
const { documentReceiptCurrency, documentAmountWithCurrency, waitingReceiptLookalikes } = await import("@/lib/studioflow/bankWaitingReceipts");

let checks = 0;
const failures: string[] = [];
function expect(name: string, actual: unknown, wanted: unknown) {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
}

// ---- the stored value ----
expect("currency read: USD", documentReceiptCurrency("USD"), "USD");
expect("currency read: lower case normalised", documentReceiptCurrency(" eur "), "EUR");
expect("not read (null) stays unknown", documentReceiptCurrency(null), null);
expect("old row (no field) stays unknown", documentReceiptCurrency(undefined), null);
expect("garbage stays unknown", documentReceiptCurrency("POUNDS"), null);
expect("known currency is shown with the number", documentAmountWithCurrency(838.8, "USD", "en-GB"), "USD 838.80");
expect("unknown currency: no label (screen shows the bare number + 'currency not read')", documentAmountWithCurrency(838.8, null, "en-GB"), null);

// ---- lookalikes ----
const row = (id: string, amount: number, currency: string, bookingDate: string, description: string, receiptPath = "x", receiptName = "r.pdf") =>
  ({ id, amount, currency, bookingDate, description, counterparty: "", receiptPath, receiptName });
const feed = [
  row("gbp-same-number", -838.8, "GBP", "2026-10-03", "OTHER SHOP"),
  row("usd-in-text", -660.15, "GBP", "2026-10-03", "ACME INC USD 838,80"),
  row("eur-in-text", -720.0, "GBP", "2026-10-03", "BETA EUR 838,80"),
];
const ids = (hits: { transaction: { id: string }; via: string }[]) => hits.map((hit) => `${hit.transaction.id}:${hit.via}`).sort();
expect("USD document: the GBP row with the same number is NOT a lookalike; the bank text in USD is",
  ids(waitingReceiptLookalikes({ amount: 838.8, date: "2026-10-02", currency: "USD" }, feed)), ["usd-in-text:foreign"]);
expect("GBP document: the same-number GBP row is a lookalike, foreign texts are not the same currency",
  ids(waitingReceiptLookalikes({ amount: 838.8, date: "2026-10-02", currency: "GBP" }, feed)), ["gbp-same-number:amount"]);
expect("unknown currency (old rows): unchanged behaviour, every hint shown",
  ids(waitingReceiptLookalikes({ amount: 838.8, date: "2026-10-02" }, feed)), ["eur-in-text:foreign", "gbp-same-number:amount", "usd-in-text:foreign"]);

// ---- the page ----
const bank = read("app/bank/page.tsx");
expect("page reads documentCurrency from the waiting row", bank.includes("currency: documentReceiptCurrency(data.documentCurrency)"), true);
expect("page never defaults the document currency to GBP", /documentCurrency[^\n]*\|\|\s*"GBP"/.test(bank), false);
expect("OCR result type carries the read currency", bank.includes("parsed: { amount: number; date: string; currency?: string | null }"), true);
expect("'currency not read' is only said when it was not read (waiting row)", bank.includes("item.currency ? <span>{documentAmountKnown(item.amount, item.currency)}</span> : <span title={t(\"currency not read from the document\")}>"), true);
expect("'currency not read' is only said when it was not read (OCR result)", bank.includes("documentReceiptCurrency(ocrParsed.currency) ? null :"), true);
expect("the old 'the currency is not read' explanation is gone from the page", bank.includes("the currency is not read."), false);
const NEW = "Amounts are as written on the document, in its own currency when the document states one. “Assign to a transaction” closes the waiting item, and so does attaching the same file straight to a transaction. A different file of the same document does not — remove the waiting copy here.";
expect("new explanation is on the page", bank.includes(`t("${NEW}")`), true);
expect("new explanation translated in every language",
  SUPPORTED_STUDIO_LANGUAGES.filter((language) => language !== "English" && studioT(NEW, language) === NEW), []);

if (failures.length) {
  console.error(`FAIL ${failures.length}/${checks}`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`ok ${checks}/${checks} — N23 receipt currency (web)`);

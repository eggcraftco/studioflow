// Review 10–11 Oct, N09 / N10 / N23 / N25 (web): the rules behind the fixes,
// against the real modules (no copies — memory "tests that assert the bug").
//
//   N09  a Turkish (or any non-English) workspace reads its trade's card
//        headings, its board lanes and the "New Project" title in its language
//   N10  "Create estimate" says up front that it needs an invoice item
//   N23  a waiting receipt's number is not dressed in the bank's currency, and
//        a matched transaction that may hold the same document is found
//   N25  the bank lists stack at phone width
//
// Run: npx tsx scripts/check-review-n09-n25.mts
import { readFileSync } from "node:fs";
import path from "node:path";

process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||= "check-only-not-a-key";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "demo-check";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const { studioT, SUPPORTED_STUDIO_LANGUAGES } = await import("@/lib/studioflow/language");
const { ONBOARDING_CARD_LABELS, productionStagesForWorkflow } = await import("@/lib/studioflow/onboardingWizard");
const { displayOrderTitle, isPlaceholderOrderTitle } = await import("@/lib/studioflow/orderTitle");
const { estimateUsableLines } = await import("@/lib/studioflow/estimates");
const { foreignAmountInBankText, waitingReceiptLookalikes, documentAmountText } = await import("@/lib/studioflow/bankWaitingReceipts");

let checks = 0;
const failures: string[] = [];
function expect(name: string, actual: unknown, wanted: unknown) {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
}
const LANGS = SUPPORTED_STUDIO_LANGUAGES.filter((language) => language !== "English");
/** Languages in which `key` still reads in English. `sameOk` lists the ones where it is right as-is. */
function untranslated(key: string, sameOk: string[] = []) {
  return LANGS.filter((language) => !sameOk.includes(language) && studioT(key, language) === key);
}

// ---------------------------------------------------------------- N09
const tradeHeadings = [...new Set(Object.values(ONBOARDING_CARD_LABELS).flatMap((labels) => Object.values(labels ?? {})))];
expect("N09 the trade table still holds its 25 headings", tradeHeadings.length, 25);
for (const heading of tradeHeadings) expect(`N09 trade heading translated: ${heading}`, untranslated(heading), []);
const lanes = [...new Set(["repairs", "batch", "made_to_order"].flatMap((flow) => productionStagesForWorkflow(flow as never).map((stage) => stage.title)))];
for (const lane of lanes) expect(`N09 board lane translated: ${lane}`, untranslated(lane), []);
expect("N09 Turkish jeweller heading", studioT("Metals & Stones", "Türkçe"), "Metaller ve Taşlar");

const tr = (text: string) => studioT(text, "Türkçe");
expect("N09 blank title reads New Project in Turkish", displayOrderTitle("", tr), studioT("New Project", "Türkçe"));
expect("N09 stored placeholder reads in Turkish", displayOrderTitle("New Project", tr), studioT("New Project", "Türkçe"));
expect("N09 Turkish placeholder is a placeholder", isPlaceholderOrderTitle("  yeni proje "), true);
expect("N09 a real name is left alone", displayOrderTitle("  Ayşe Kaya ", tr), "Ayşe Kaya");
expect("N09 English reader still reads New Project", displayOrderTitle(undefined, (text) => text), "New Project");
expect("N09 New Project has a Turkish row", untranslated("New Project"), []);
// The copies that returned the English words untranslated are gone, and the
// Orders page no longer relies on a blank name that never arrives.
expect("N09 OrderListCard copy removed", /return "New Project";/.test(read("components/OrderListCard.tsx")), false);
expect("N09 Schedule copy removed", /return "New Project";/.test(read("app/schedule/page.tsx")), false);
expect("N09 Orders page no `|| t(\"New Project\")`", read("app/orders/page.tsx").includes('customerName.trim() || t("New Project")'), false);
expect("N09 detail header goes through the helper", read("app/orders/OrderDetailContent.tsx").includes("<h1>{displayOrderTitle(order.customerName, t)}</h1>"), true);

// Getting started: every step the server or the fallback can show has a row.
// The fallback list moved to lib/studioflow/gettingStarted.ts (16 Oct 2026), where
// the Home card, the Settings checklist and the Dashboard card all read it.
const checklist = read("lib/studioflow/gettingStarted.ts");
const fallbackSteps = [...checklist.slice(checklist.indexOf("const SETUP_STEPS"), checklist.indexOf("] as const;")).matchAll(/(?:label|blurb|cta): "([^"]+)"/g)].map((m) => m[1]);
expect("N09 fallback checklist found", fallbackSteps.length, 18);
for (const text of fallbackSteps) expect(`N09 checklist translated: ${text}`, untranslated(text), []);
const serverSteps = ["Import your first order", "Create your first project", "Add your first customer", "Match your first transaction", "Add your first item", "Use stock on a job", "Ask the assistant something", "Connect your accounting", "Complete your first project", "Connect your first sales channel", "Connect your bank", "Give the assistant your data", "Tell us what you'd like help with", "You're set up", "Your NivaDesk setup", "Getting started", "Continue", "Skip for now", "{done} of {total} complete"];
for (const text of serverSteps) expect(`N09 server checklist translated: ${text}`, untranslated(text), []);

// ---------------------------------------------------------------- N10
const line = (name: string, lineTotal: number) => ({ id: name || String(lineTotal), name, quantity: 1, unitPrice: lineTotal, lineTotal });
expect("N10 no lines → nothing to build from", estimateUsableLines([]).length, 0);
expect("N10 an empty placeholder line is not usable", estimateUsableLines([line("", 0), line("  ", 0.004)]).length, 0);
expect("N10 a named line is usable", estimateUsableLines([line("Ring resize", 0)]).length, 1);
expect("N10 a priced line is usable", estimateUsableLines([line("", 250)]).length, 1);
for (const text of [
  "Needs an invoice item first.",
  "The estimate is built from this order's invoice items. Add at least one line (a name or a price), then come back here.",
  "The estimate is built from this order's invoice items, and the Invoice Items card is hidden on this order. Switch it on in Customize cards, add a line, then come back here.",
  "Go to Invoice Items", "Customize cards", "Create estimate", "Viewed", "Declined", "Superseded",
]) expect(`N10 translated: ${text.slice(0, 48)}`, untranslated(text), []);
expect("N10 Subtotal translated (same word in es/pt)", untranslated("Subtotal", ["Español (Spanish)", "Português"]), []);
const detail = read("app/orders/OrderDetailContent.tsx");
expect("N10 card reads the same rule as the click", (detail.match(/estimateUsableLines\(order\.lineItems\)/g) ?? []).length, 2);
expect("N10 the add button is the focus target", detail.includes('data-line-items-add="true"'), true);

// ---------------------------------------------------------------- N23
// The review's case: a dollar receipt for 838.80 and a GBP transaction of
// −636.76 whose bank text says "USD 838,80", already carrying receipt.pdf.
expect("N23 foreign amount in bank text", foreignAmountInBankText("CARD PAYMENT TO ACME INC USD 838,80 RATE 1.3173", 838.8, "GBP"), { currency: "USD", amount: 838.8 });
expect("N23 amount after the code", foreignAmountInBankText("ACME 838.80 USD", 838.8, "GBP"), { currency: "USD", amount: 838.8 });
expect("N23 thousands separators", foreignAmountInBankText("EUR1.234,56 FX", 1234.56, "GBP"), { currency: "EUR", amount: 1234.56 });
expect("N23 the bank's own currency is not foreign", foreignAmountInBankText("GBP 838.80", 838.8, "GBP"), null);
expect("N23 a different number is no match", foreignAmountInBankText("USD 838,81", 838.8, "GBP"), null);
expect("N23 no figure, no match", foreignAmountInBankText("TESCO STORES 1234", 12.34, "GBP"), null);

const row = (id: string, amount: number, bookingDate: string, description: string, receiptPath = "", receiptName = "") =>
  ({ id, amount, currency: "GBP", bookingDate, description, counterparty: "", receiptPath, receiptName });
const feed = [
  row("usd", -636.76, "2026-10-05", "ACME INC USD 838,80", "companies/c/bank_receipts/usd/receipt.pdf", "receipt.pdf"),
  row("same-no-receipt", -838.8, "2026-10-03", "OTHER SHOP"),
  row("far", -838.8, "2026-11-30", "LATER SHOP", "x", "late.pdf"),
  row("income", 838.8, "2026-10-02", "REFUND", "x", "in.pdf"),
  row("gbp", -62.16, "2026-10-08", "SUPPLIER LTD", "companies/c/bank_receipts/gbp/Order_Confirmation.pdf", "Order_Confirmation.pdf"),
];
const usdHits = waitingReceiptLookalikes({ amount: 838.8, date: "2026-10-02" }, feed);
expect("N23 the dollar receipt finds the GBP row that already has it", usdHits.map((hit) => [hit.transaction.id, hit.via, hit.foreign?.currency ?? null, hit.daysApart]), [["usd", "foreign", "USD", 3]]);
const gbpHits = waitingReceiptLookalikes({ amount: 62.16, date: "2026-10-08" }, feed);
expect("N23 same day, same amount, already matched", gbpHits.map((hit) => [hit.transaction.id, hit.via, hit.daysApart]), [["gbp", "amount", 0]]);
expect("N23 nothing for an unknown amount", waitingReceiptLookalikes({ amount: 0, date: "" }, feed).length, 0);
expect("N23 no date: amount alone, closest unknown", waitingReceiptLookalikes({ amount: 62.16, date: "" }, feed).map((hit) => hit.transaction.id), ["gbp"]);
expect("N23 the document number carries no currency", documentAmountText(838.8, "en-GB"), "838.80");
const bank = read("app/bank/page.tsx");
expect("N23 the waiting row no longer formats the OCR number as bank money", bank.includes("money(item.amount, currency0)"), false);
expect("N23 the OCR result no longer formats the number as bank money", bank.includes("money(ocrParsed.amount, currency0)"), false);
for (const text of [
  "currency not read from the document", "currency not read",
  "Amounts are as written on the document; the currency is not read. “Assign to a transaction” closes the waiting item. Attaching a file straight to a transaction does not — if it is the same document, remove the waiting copy here.",
  "Possibly already matched", "Bank text",
  "That transaction already has a receipt. If it is the same document, remove this waiting copy — assigning it there would replace that receipt.",
  "View that receipt", "Already has a receipt — assigning replaces it.",
]) expect(`N23 translated: ${text.slice(0, 48)}`, untranslated(text), []);

// ---------------------------------------------------------------- N25
const css = read("app/globals.css");
const phone = css.slice(css.indexOf("@media (max-width: 640px) {\n  .bank-tx-table {"));
expect("N25 phone block present", phone.length > 0 && css.includes("@media (max-width: 640px) {\n  .bank-tx-table {"), true);
expect("N25 who/what and amount on the first line", phone.includes('"merchant amount"'), true);
expect("N25 date and receipt state on the second line", phone.includes('"date receipt"'), true);
expect("N25 the 700px minimum is lifted", /\.bank-tx-table \{[^}]*min-width: 0 !important;/.test(phone), true);
for (const cell of ["bank-tx-merchant", "bank-tx-date", "bank-tx-amount", "bank-tx-receipt", "bank-tx-category"]) {
  expect(`N25 both bank lists tag ${cell}`, (bank.match(new RegExp(`className="${cell}"`, "g")) ?? []).length, 2);
}

if (failures.length) {
  console.error(`FAIL ${failures.length}/${checks}`);
  for (const failure of failures) console.error(" -", failure);
  process.exit(1);
}
console.log(`ok ${checks}/${checks} — review N09/N10/N23/N25`);

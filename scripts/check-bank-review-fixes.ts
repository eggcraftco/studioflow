/**
 * Review 10–11 Oct, N22 + N24 (15 Oct 2026). Imports the real helpers — no copies.
 *
 * N24: the built-in category library matched inside words. "APPLEADS-GBP " holds
 *      "bp " inside "gbp ", so Apple Ads was suggested as Travel (4 matches,
 *      £74.46 on the reviewed account). Every library keyword is checked here
 *      against a word it used to hit by accident, plus a line it must still hit.
 * N22: Home "Missing receipts" read receiptUrl/receiptFileId, which the server
 *      never writes (it writes receiptPath), so matched, "no receipt needed"
 *      and refund rows all counted as missing. Banking's "Needs attention"
 *      total counted price changes and cancellations it did not list, and
 *      listed rule suggestions it did not count.
 *
 * Run: npx tsx scripts/check-bank-review-fixes.ts
 */
import assert from "node:assert/strict";
import {
  bankAttentionSummary,
  bankRowMissingReceipt,
  categoryKeywordMatches,
  suggestCategory,
} from "../lib/studioflow/bankInsights";
import { homeBankTxFromDoc } from "../lib/studioflow/homeBankRows";

let failures = 0;
function check(name: string, run: () => void) {
  try {
    run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${(error as Error).message.split("\n")[0]}`);
  }
}

const row = (counterparty: string, description = counterparty) =>
  ({ amount: -10, currency: "GBP", bookingDate: "2026-10-05", counterparty, description });
const guess = (line: string) => suggestCategory(row(line), [])?.category ?? null;

// ---- N24 ------------------------------------------------------------------
const mustNotMatch: Array<[string, string]> = [
  ["APPLEADS-GBP APPLE ADS", "Travel"],        // "bp " inside "gbp "
  ["BEDFORD PRINT LTD", "Utilities"],         // "edf" inside "bedford"
  ["COSTA ESPRESSO BAR", "Travel"],           // "esso" inside "espresso"
  ["CURRENT ACCOUNT FEE", "Rent"],            // "rent" inside "current"
  ["PARENT TEACHER ASSOC", "Rent"],           // "rent" inside "parent"
  ["NEON SIGN CO", "Utilities"],              // "eon" inside "neon"
  ["COFFEE LTD", "Utilities"],                // "ee ltd" inside "coffee ltd"
  ["WHISKY SHOP", "Utilities"],               // "sky " inside "whisky "
  ["STARTUPS WEEKLY", "Shipping"],            // "ups" inside "startups"
  ["UPSTAIRS CAFE", "Shipping"],              // "ups" at the start of a longer word
  ["PRESET PRINTS", "Software"],              // "eset" inside "preset"
  ["OTHERWISE LTD", "Fees"],                  // "wise" inside "otherwise"
  ["NOVO STUDIO", "Utilities"],               // "ovo" inside "novo"
  ["CARGOS DIRECT", "Equipment"],             // "argos" inside "cargos"
];
for (const [line, wrong] of mustNotMatch) {
  check(`N24 "${line}" is not ${wrong}`, () => assert.notEqual(guess(line), wrong));
}
const mustMatch: Array<[string, string]> = [
  ["BP OXFORD RD", "Travel"],
  ["SHELL KINGS CROSS", "Travel"],
  ["TFL TRAVEL CH", "Travel"],
  ["ESSO HEATHROW", "Travel"],
  ["ROYAL MAIL GROUP", "Shipping"],
  ["UPS*1Z999", "Shipping"],
  ["DPD GROUP UK", "Shipping"],
  ["AMZNMKTPLACE", "Materials"],              // a brand run into the next word still counts
  ["AMAZON.CO.UK*AB12C3", "Materials"],
  ["B&Q 1234", "Materials"],
  ["ADOBE *CREATIVE CLOUD", "Software"],
  ["APPLE.COM/BILL", "Software"],
  ["GOOGLE*GSUITE_EXAMPLE", "Software"],
  ["ESET NOD32", "Software"],
  ["NETFLIX.COM", "Subscriptions"],
  ["SQUARESPACE INC", "Subscriptions"],
  ["PATREON MEMBERSHIPS", "Subscriptions"],   // plural of "membership"
  ["O2 UK", "Utilities"],
  ["SKY DIGITAL", "Utilities"],
  ["EDF ENERGY", "Utilities"],
  ["HMRC VAT", "Tax"],
  ["RENT PAYMENT OCT", "Rent"],
  ["WISE PAYMENTS LTD", "Fees"],
  ["FACEBK *ADS", "Marketing"],
];
for (const [line, right] of mustMatch) {
  check(`N24 "${line}" is still ${right}`, () => assert.equal(guess(line), right));
}
check("N24 keyword boundaries are the matcher's, not the caller's", () => {
  assert.equal(categoryKeywordMatches("appleads-gbp apple ads", "bp "), false);
  assert.equal(categoryKeywordMatches("bp oxford", "bp "), true);
  assert.equal(categoryKeywordMatches("amznmktplace", "amzn"), true);
  assert.equal(categoryKeywordMatches("groups", "ups"), false);
});

// ---- N22: one definition of "missing receipt" ------------------------------
const tx = (over: Record<string, unknown>) => ({ amount: -20, outgoingKind: "", receiptPath: "", receiptNotNeeded: false, ...over });
check("N22 spend with no receipt is missing", () => assert.equal(bankRowMissingReceipt(tx({})), true));
check("N22 a matched receipt (receiptPath) is not missing", () => assert.equal(bankRowMissingReceipt(tx({ receiptPath: "companies/x/bank_receipts/t/r.pdf" })), false));
check("N22 'no receipt needed' is not missing", () => assert.equal(bankRowMissingReceipt(tx({ receiptNotNeeded: true })), false));
check("N22 a customer refund (outgoingKind) is not missing", () => assert.equal(bankRowMissingReceipt(tx({ outgoingKind: "customer_refund" })), false));
check("N22 incoming money is not missing", () => assert.equal(bankRowMissingReceipt(tx({ amount: 525 })), false));

check("N22 Home reads the field the server writes (receiptPath)", () => {
  const mapped = homeBankTxFromDoc("t1", { amount: -636.76, bookingDate: "2026-10-05", counterparty: "SHAPEWAYS", receiptPath: "companies/x/bank_receipts/t1/receipt.pdf" });
  assert.equal(mapped.hasReceipt, true);
  assert.equal(bankRowMissingReceipt(mapped), false);
  const marked = homeBankTxFromDoc("t2", { amount: -45, bookingDate: "2026-10-09", receiptNotNeeded: true });
  assert.equal(bankRowMissingReceipt(marked), false);
  const refund = homeBankTxFromDoc("t3", { amount: -300, bookingDate: "2026-10-10", outgoingKind: "customer_refund" });
  assert.equal(bankRowMissingReceipt(refund), false);
  const owed = homeBankTxFromDoc("t4", { amount: -18.95, bookingDate: "2026-10-11", receiptUrl: "legacy-field-the-server-never-writes" });
  assert.equal(bankRowMissingReceipt(owed), true, "receiptUrl alone is not a receipt — Banking ignores it too");
});

// ---- N22: the attention total is exactly the lines it lists ----------------
check("N22 Needs attention total = sum of the listed lines; suggestions listed apart", () => {
  const summary = bankAttentionSummary({
    uncategorised: 7, missingReceipts: 10, waitingReceipts: 1, brokenConnections: 0,
    duplicates: 2, priceChanged: 1, possiblyCancelled: 1, ruleSuggestions: 4,
  });
  const listed = summary.lines.reduce((sum, line) => sum + line.count, 0);
  assert.equal(summary.total, 22);
  assert.equal(listed, summary.total, `lines add up to ${listed}, total says ${summary.total}`);
  assert.ok(summary.lines.every((line) => line.count > 0), "a zero line is not listed");
  assert.ok(!summary.lines.some((line) => (line.kind as string) === "ruleSuggestions"), "suggestions are not in the count");
  assert.equal(summary.notCounted.ruleSuggestions, 4);
  for (const kind of ["priceChanged", "possiblyCancelled", "duplicates"]) {
    assert.ok(summary.lines.some((line) => line.kind === kind), `${kind} is counted, so it is listed`);
  }
});

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall bank review checks passed");

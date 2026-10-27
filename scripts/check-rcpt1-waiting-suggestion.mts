// RCPT-1 (27 Oct), web side: a waiting receipt can carry the payment the
// server's matcher found but would not attach alone (N23 evidence short:
// currency not read, no merchant word, booked 5-7 days later). The Bank page's
// Receipts tab shows it on the waiting row with a one-tap "Attach to this
// payment" — only while that payment is in the feed without a receipt — and
// says why it was not attached automatically, in every interface language.
// Against the real modules (memory "tests that assert the bug").
//
// Run: npx tsx scripts/check-rcpt1-waiting-suggestion.mts
import { readFileSync } from "node:fs";
import path from "node:path";

process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||= "check-only-not-a-key";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "demo-check";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const { studioT, SUPPORTED_STUDIO_LANGUAGES } = await import("@/lib/studioflow/language");
const { waitingSuggestionFrom, waitingSuggestionReason, suggestedPaymentFor } = await import("@/lib/studioflow/bankWaitingReceipts");

let checks = 0;
const failures: string[] = [];
function expect(name: string, actual: unknown, wanted: unknown) {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
}

// ---- the server's field, as the matcher writes it ----
const stored = { transactionId: "tx-26oct", bookingDate: "2026-10-26", amount: -18.45, currency: "GBP", merchant: "TESCO STORES 3245", score: 80, reason: "currency_not_read", atMs: 1 };
expect("suggestion parsed", waitingSuggestionFrom(stored), { transactionId: "tx-26oct", bookingDate: "2026-10-26", amount: -18.45, currency: "GBP", merchant: "TESCO STORES 3245", reason: "currency_not_read" });
expect("no field (live rows, older servers) → none", waitingSuggestionFrom(undefined), null);
expect("deleted field (null) → none", waitingSuggestionFrom(null), null);
expect("no transaction id → none", waitingSuggestionFrom({ bookingDate: "2026-10-26" }), null);
expect("blank transaction id → none", waitingSuggestionFrom({ transactionId: "  " }), null);

// ---- when the row shows it ----
const feed = [
  { id: "tx-26oct", receiptPath: "", amount: -18.45 },
  { id: "tx-filed", receiptPath: "companies/c/bank_receipts/tx-filed/r.jpg", amount: -18.45 }
];
const s1 = waitingSuggestionFrom(stored);
expect("payment in the feed without a receipt → offered", suggestedPaymentFor(s1, feed)?.id, "tx-26oct");
expect("payment that already has a receipt → not offered", suggestedPaymentFor(waitingSuggestionFrom({ ...stored, transactionId: "tx-filed" }), feed), null);
expect("payment not in the loaded feed → not offered", suggestedPaymentFor(waitingSuggestionFrom({ ...stored, transactionId: "tx-gone" }), feed), null);
expect("no suggestion → nothing", suggestedPaymentFor(null, feed), null);

// ---- why, in every language ----
const reasons = ["currency_not_read", "no_merchant_word", "booked_later", "needs_confirmation"];
const keys = [...new Set(reasons.map(waitingSuggestionReason)), "Likely payment found", "Attach to this payment"];
expect("unknown reason falls back to 'please confirm'", waitingSuggestionReason("something_new"), waitingSuggestionReason("needs_confirmation"));
expect("four distinct reason sentences", new Set(reasons.map(waitingSuggestionReason)).size, 4);
for (const key of keys) {
  for (const language of SUPPORTED_STUDIO_LANGUAGES) {
    if (language === "English") continue;
    const out = studioT(key, language);
    if (!out || out === key) failures.push(`missing ${language} for "${key}"`);
    checks += 1;
  }
}

// ---- the page wires it (source read, since the page is a client component) ----
const bank = read("app/bank/page.tsx");
expect("page reads the field from the waiting row", /suggestion: waitingSuggestionFrom\(data\.suggestion\)/.test(bank), true);
expect("page offers the payment through the existing assign", /assignWaitingReceipt\(item, suggested\.id\)/.test(bank), true);
expect("one-tap attach is owner-only", /isOwner \? \(\s*<button[\s\S]{0,160}assignWaitingReceipt\(item, suggested\.id\)/.test(bank), true);
expect("a lookalike (already-filed same amount) hides the offer", /if \(!item\.suggestion \|\| !suggested \|\| lookalike\) return null;/.test(bank), true);

if (failures.length) {
  console.error(`RCPT-1 waiting suggestion: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`RCPT-1 waiting suggestion: ${checks}/${checks} checks passed`);

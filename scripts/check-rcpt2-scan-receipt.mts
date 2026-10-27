// RCPT-2 (27 Oct), web side: "Scan receipt" on the Bank page is one step — the photo (camera on a phone) goes
// to _inbox and bankCaptureReceipt attaches it or keeps it waiting; the page shows which, the likely payment
// with a one-tap attach, and falls back to the old candidate list only when the server has no such callable.
// Against the real modules (memory "tests that assert the bug").
//
// Run: npx tsx scripts/check-rcpt2-scan-receipt.mts
import { readFileSync } from "node:fs";
import path from "node:path";

process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||= "check-only-not-a-key";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "demo-check";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const { studioT, SUPPORTED_STUDIO_LANGUAGES } = await import("@/lib/studioflow/language");
const { captureResultFrom, captureCallableMissing, waitingSourceLabel } = await import("@/lib/studioflow/bankWaitingReceipts");

let checks = 0;
const failures: string[] = [];
function expect(name: string, actual: unknown, wanted: unknown) {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
}

// ---- the server's answers (functions/bankFeed.js captureInboxReceipt) ----
const attached = captureResultFrom({ ok: true, status: "attached", transaction: { id: "t1", bookingDate: "2026-10-14", amount: -30, currency: "GBP", merchant: "EPSILON CO" }, document: { amount: 30, currency: "GBP", date: "2026-10-14" }, message: "x" });
expect("attached: status", attached?.status, "attached");
expect("attached: transaction", attached?.transaction, { id: "t1", bookingDate: "2026-10-14", amount: -30, currency: "GBP", merchant: "EPSILON CO" });
expect("attached: flags off", [attached?.alreadyAttached, attached?.alreadyWaiting], [false, false]);
const waiting = captureResultFrom({ ok: true, status: "waiting", waitingId: "w1", storagePath: "companies/c/bank_receipts/_inbox/1_r.jpg", document: { amount: 34.08, currency: null, date: "2026-10-21" }, suggestion: { transactionId: "t-bq", bookingDate: "2026-10-22", amount: -34.08, currency: "GBP", merchant: "B&Q", reason: "currency_not_read" } });
expect("waiting: status + id + path", [waiting?.status, waiting?.waitingId, waiting?.storagePath], ["waiting", "w1", "companies/c/bank_receipts/_inbox/1_r.jpg"]);
expect("waiting: document currency unknown stays null", waiting?.document, { amount: 34.08, currency: null, date: "2026-10-21" });
expect("waiting: suggestion parsed", waiting?.suggestion?.transactionId, "t-bq");
const unread = captureResultFrom({ ok: true, status: "waiting", waitingId: "w2", storagePath: "p", document: { amount: null, currency: null, date: null } });
expect("unreadable: amount null (page says 'total could not be read')", unread?.document.amount, null);
expect("already waiting flag", captureResultFrom({ status: "waiting", alreadyWaiting: true, document: {} })?.alreadyWaiting, true);
expect("already attached flag", captureResultFrom({ status: "attached", alreadyAttached: true, document: {}, transaction: { id: "t" } })?.alreadyAttached, true);
expect("garbage → null", captureResultFrom({ status: "maybe" }), null);
expect("nothing → null", captureResultFrom(undefined), null);

// ---- older server: fall back only when the CALLABLE is missing ----
expect("callable missing (404) → fall back", captureCallableMissing({ code: "functions/not-found", message: "not-found" }), true);
expect("unimplemented → fall back", captureCallableMissing({ code: "functions/unimplemented", message: "x" }), true);
expect("the upload missing is a real answer, not a fallback", captureCallableMissing({ code: "functions/not-found", message: "The receipt upload was not found. Take the photo again." }), false);
expect("permission-denied is not a fallback", captureCallableMissing({ code: "functions/permission-denied", message: "x" }), false);

// ---- waiting-list source labels ----
expect("source labels", ["chatgpt", "claude", "ios", "android", "mac", "web", "", "x"].map(waitingSourceLabel), ["ChatGPT", "Claude", "iPhone", "Android", "Mac", "Web", "Web", "Web"]);

// ---- every sentence the scan answer can show, in every language ----
const keys = ["Scan receipt", "Uploading…", "Reading the receipt…", "Receipt attached", "This receipt was already attached", "Saved — waiting for the bank payment",
  "It will be attached automatically when the payment reaches your bank feed. You'll get a notification.", "This receipt is already waiting for the bank",
  "The total could not be read — check it in Banking ▸ Receipts.", "Likely payment found", "Attach to this payment", "Scan another", "Done",
  "Only the workspace owner can add bank receipts.", "Take a photo of a receipt — NivaDesk matches it to your bank"];
for (const key of keys) {
  for (const language of SUPPORTED_STUDIO_LANGUAGES) {
    if (language === "English") continue;
    checks += 1;
    const out = studioT(key, language);
    if (!out || out === key) failures.push(`missing ${language} for "${key}"`);
  }
}

// ---- the page wires it ----
const bank = read("app/bank/page.tsx");
expect("the scan input opens the camera on phones and takes PDFs", /accept="image\/\*,application\/pdf" capture="environment" id="bank-ocr-input"/.test(bank), true);
expect("the scan input calls the one-step capture", /if \(file\) void captureReceipt\(file\);/.test(bank), true);
expect("one call: bankCaptureReceipt with source web", /call<unknown>\("bankCaptureReceipt", \{ storagePath: path, fileName: file\.name, source: "web" \}\)/.test(bank), true);
expect("fallback deletes its own upload before the old flow", /captureCallableMissing\(captureError\)\) \{\s*try \{ await deleteObject\(storageRef\(storage, path\)\); \}/.test(bank), true);
expect("one-tap attach of the likely payment uses the existing callable", /call\("bankAssignInboxReceipt", \{ storagePath: current\.storagePath, transactionId: current\.suggestion\.transactionId/.test(bank), true);
expect("?scan=1 opens the prompt", /searchParams\?\.get\("scan"\) === "1"/.test(bank), true);
expect("waiting list uses the shared source labels", /waitingSourceLabel\(item\.source\)/.test(bank), true);

if (failures.length) {
  console.error(`RCPT-2 scan receipt: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`RCPT-2 scan receipt: ${checks}/${checks} checks passed`);

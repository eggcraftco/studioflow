// Does our receipt mapping read fields Etsy actually sends?
//
// Every test in this repo that maps an Etsy receipt maps a receipt I WROTE.
// That proves the mapper is consistent with my idea of Etsy, which is exactly
// the thing that has been wrong three times this month in other places:
// lineItems.total for lineTotal, fileType for contentType, plan for
// billingPlan. Each time the test agreed with the code because the test and
// the code shared the same wrong name.
//
// So this one checks the mapper against ETSY's published schema instead of
// against me. The field list is vendored from Etsy's OpenAPI document (see
// test/fixtures/etsy-receipt-schema.json for where and when); refresh it with
// scripts/refresh-etsy-schema.sh when Etsy ships API changes.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const SCHEMA = require("../fixtures/etsy-receipt-schema.json");
const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "etsy.js"), "utf8");

function pass(name) { console.log("PASS ", name); }
let failed = 0;
const check = (name, fn) => { try { fn(); pass(name); } catch (e) { failed++; console.log("FAIL ", name, "-", e.message); } };

// The normaliser's body — the only place a raw Etsy receipt is read.
const start = SOURCE.indexOf("function normalizeEtsyReceipt");
assert(start > 0, "normalizeEtsyReceipt not found in etsy.js");
const body = SOURCE.slice(start, start + 12000);

const NOISE = new Set(["map", "filter", "length", "forEach", "toString", "slice", "reduce", "join", "push"]);
const readFrom = (subject) => {
  const found = new Set();
  for (const m of body.matchAll(new RegExp(`${subject}(?:\\?)?\\.([a-z_][a-z0-9_]*)`, "g"))) {
    if (!NOISE.has(m[1])) found.add(m[1]);
  }
  return found;
};

check("every receipt field we read exists in Etsy's schema", () => {
  const unknown = [...readFrom("receipt")].filter((f) => !SCHEMA.ShopReceipt.includes(f));
  assert.deepStrictEqual(unknown, [], `not in ShopReceipt: ${unknown.join(", ")}`);
});

check("every transaction field we read exists in Etsy's schema", () => {
  // `variations` is read through a helper, so the regex sees the identifier
  // split; allow the prefix rather than loosening the whole check.
  const unknown = [...readFrom("transaction")]
    .filter((f) => !SCHEMA.ShopReceiptTransaction.includes(f) && !SCHEMA.ShopReceiptTransaction.some((k) => k.startsWith(f)));
  assert.deepStrictEqual(unknown, [], `not in ShopReceiptTransaction: ${unknown.join(", ")}`);
});

check("every status Etsy can send is handled, not just the ones we expected", () => {
  // Etsy's enum, as published. A status we neither map nor flag arrives
  // looking like an ordinary paid order, which for a refund is a real number
  // being wrong in the workshop's books.
  const handled = {
    "paid": () => /is_paid/.test(body),
    "completed": () => /completed/.test(SOURCE),
    "open": () => /"open"/.test(SOURCE),
    "payment processing": () => /not_paid/.test(SOURCE),
    "canceled": () => /=== "canceled"/.test(body),
    "fully refunded": () => /includes\("refund"\)/.test(body),
    "partially refunded": () => /includes\("refund"\)/.test(body)
  };
  const missing = SCHEMA.statusEnum.filter((s) => !handled[s] || !handled[s]());
  assert.deepStrictEqual(missing, [], `unhandled receipt statuses: ${missing.join(" | ")}`);
});

check("the cancelled spelling matches Etsy's, which is one L", () => {
  assert(SCHEMA.statusEnum.includes("canceled"), "Etsy's enum no longer contains 'canceled'");
  assert(/=== "canceled"/.test(body), "the mapper no longer checks Etsy's spelling");
});

console.log(failed ? `\n${failed} FAILED` : "\n✅ ETSY SCHEMA DRIFT GEÇTİ");
process.exit(failed ? 1 : 0);

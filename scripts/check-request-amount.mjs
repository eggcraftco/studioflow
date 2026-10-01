// The amount a payment link asks a customer to pay, as typed or pasted on any keyboard.
//
// Until 25 Sep 2026 both web payment-link screens (and the Apple and Android
// order screens) deleted every comma before reading the amount, so a Turkish
// or German "12,50" asked the customer for 1,250.00. This drives the strict
// reader in lib/studioflow/money.ts through scripts/request-amount/vectors.json
// — the same table Apple and Android run — in every locale listed there, and
// fails if any locale reads a case differently from the table: the amount
// meant, or the named refusal, never a different number.
//
//   npm run test:request-amount
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const here = path.dirname(new URL(import.meta.url).pathname);
const webRoot = path.resolve(here, "..");
const source = path.join(webRoot, "lib", "studioflow", "money.ts");
const vectors = JSON.parse(readFileSync(path.join(webRoot, "scripts", "request-amount", "vectors.json"), "utf8"));
const outDir = mkdtempSync(path.join(tmpdir(), "nivadesk-request-amount-"));

let failures = 0;
let checks = 0;
function expect(name, ok, detail = "") {
  checks += 1;
  if (!ok) { failures += 1; console.log(`FAIL ${name}${detail ? `  <- ${detail}` : ""}`); }
}

try {
  execFileSync(path.join(webRoot, "node_modules", ".bin", "tsc"),
    [source, "--outDir", outDir, "--module", "es2022", "--target", "es2022", "--skipLibCheck"], { stdio: "pipe" });
  writeFileSync(path.join(outDir, "package.json"), JSON.stringify({ type: "module" }));
  const { parseRequestAmount, requestAmountMessage, minorToInputText } = await import(pathToFileURL(path.join(outDir, "money.js")).href);

  for (const locale of vectors.locales) {
    for (const { typed, currency, expect: wanted } of vectors.cases) {
      const got = parseRequestAmount(typed, currency, locale);
      const ok = typeof wanted === "number" ? got.ok === true && got.amountMinor === wanted : got.ok === false && got.reason === wanted;
      expect(`${locale} ${JSON.stringify(typed)} ${currency} -> ${wanted}`, ok, JSON.stringify(got));
    }
  }
  console.log(`vectors: ${vectors.cases.length} cases x ${vectors.locales.length} locales`);

  // Every refusal has a sentence, and every sentence is distinct from the others.
  const sentences = vectors.reasons.map((reason) => requestAmountMessage(reason));
  expect("every reason has a sentence", sentences.every((text) => typeof text === "string" && text.length > 10));
  expect("only empty and not_positive share a sentence", new Set(sentences).size === vectors.reasons.length - 1);

  // The pre-filled amount reads back as itself in every locale and currency.
  for (const locale of vectors.locales) {
    for (const currency of ["GBP", "EUR", "TRY", "JPY"]) {
      for (const minor of [1, 5, 99, 100, 1250, 125000, 123456789]) {
        const text = minorToInputText(minor, currency, locale);
        const back = parseRequestAmount(text, currency, locale);
        expect(`prefill ${locale} ${currency} ${minor} -> ${JSON.stringify(text)}`, back.ok && back.amountMinor === minor, JSON.stringify(back));
      }
    }
  }
  // A comma-decimal locale pre-fills with a comma; nobody's pre-fill carries grouping.
  expect("tr-TR pre-fill uses its comma", minorToInputText(125050, "GBP", "tr-TR") === "1250,50", minorToInputText(125050, "GBP", "tr-TR"));
  expect("en-GB pre-fill uses a dot", minorToInputText(125050, "GBP", "en-GB") === "1250.50", minorToInputText(125050, "GBP", "en-GB"));

  // The regression itself, by name: what the comma-stripping code produced, and what it is now.
  const old = (typed) => Number(typed.trim().replace(/,/g, "")) * 100;
  expect("old reading of Turkish 12,50 was 125000 minor", old("12,50") === 125000);
  for (const locale of vectors.locales) {
    const now = parseRequestAmount("12,50", "GBP", locale);
    expect(`${locale} 12,50 GBP is 1250 minor now`, now.ok && now.amountMinor === 1250, JSON.stringify(now));
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failures) {
  console.log(`\n${failures} of ${checks} request amount checks FAILED`);
  process.exit(1);
}
console.log(`All ${checks} request amount checks passed.`);

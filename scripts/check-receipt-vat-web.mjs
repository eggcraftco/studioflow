// VAT-DOC web (28 Oct 2026, owner: "so I do not fix VAT one by one"). The server reads each attached receipt's VAT
// (functions/bankFeed.js bankReadReceiptVat) into `receiptVat` and into vatCodeAuto, which the bank page already
// uses. This page shows where that VAT came from and turns a mixed receipt into a ready split.
//
//   1. lib/studioflow/bankReceiptVat.ts, run for real: a reading counts only for the row's CURRENT receipt; a mixed
//      receipt's per-rate lines become split lines that add up to the bank amount exactly (a 1–2p rounding gap goes
//      on the last line; anything larger — another currency, a tip — is left to the person); non-mixed → no split.
//   2. Wiring in app/bank/page.tsx: the row carries receiptVat; the drawer says "Read from the receipt: <VAT>"
//      (with the per-rate gross for a mixed one), a foreign document asks the person to choose, the "Auto-applied"
//      line is not repeated for the same VAT; the split editor opens pre-split by rate and its button says so.
//   3. The three new strings have all 11 translations in language.ts.
//
//   node scripts/check-receipt-vat-web.mjs     (CHECK_ROOT=<live web files> runs it as the control: red)
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = process.env.CHECK_ROOT ? path.resolve(process.env.CHECK_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readOptional = (rel) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; } };
const failures = [];
let checks = 0;
const check = (label, ok) => { checks += 1; if (!ok) failures.push(label); };

// 1. The helpers, run. ---------------------------------------------------------------------------------------------
async function load() {
  const source = readOptional("lib/studioflow/bankReceiptVat.ts");
  if (!source) return null;
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "receipt-vat-")), "bankReceiptVat.mjs");
  fs.writeFileSync(file, out);
  return import(pathToFileURL(file).href);
}
const mod = await load();
check("lib/studioflow/bankReceiptVat.ts exports receiptVatFromDoc and receiptVatSplit", Boolean(mod?.receiptVatFromDoc && mod?.receiptVatSplit));
if (mod?.receiptVatFromDoc && mod?.receiptVatSplit) {
  const { receiptVatFromDoc, receiptVatSplit } = mod;
  const tesco = { path: "r/1.jpg", code: "MX", basis: "table", rates: [20, 0], vatAmount: 0.4, foreign: false,
    lines: [{ rate: 20, code: "ST", net: 2, vat: 0.4, gross: 2.4 }, { rate: 0, code: "ZR", net: 2.35, vat: 0, gross: 2.35 }] };
  const read = receiptVatFromDoc({ receiptPath: "r/1.jpg", receiptVat: tesco });
  check("a reading of the current receipt is taken (code, lines, VAT)", read?.code === "MX" && read.lines.length === 2 && read.vatAmount === 0.4);
  check("a reading left from a replaced receipt is ignored", receiptVatFromDoc({ receiptPath: "r/2.jpg", receiptVat: tesco }) === null);
  check("no receipt → no reading", receiptVatFromDoc({ receiptPath: "", receiptVat: tesco }) === null);
  check("a foreign document is flagged, with no code", (() => { const f = receiptVatFromDoc({ receiptPath: "p", receiptVat: { path: "p", code: null, foreign: true, lines: [], rates: [19] } }); return f?.foreign === true && f.code === null; })());
  const split = receiptVatSplit({ amount: -4.75, receiptVat: read });
  check(`a mixed receipt splits the payment by rate (got ${JSON.stringify(split)})`, JSON.stringify(split) === JSON.stringify([{ amount: 2.4, vatCode: "ST" }, { amount: 2.35, vatCode: "ZR" }]));
  const penny = receiptVatSplit({ amount: -4.76, receiptVat: read });
  check(`a 1p rounding gap goes on the last line (got ${JSON.stringify(penny)})`, penny?.[1]?.amount === 2.36 && penny?.[0]?.amount === 2.4);
  check("a gap larger than 2p (another currency, a tip) is not split automatically", receiptVatSplit({ amount: -5.75, receiptVat: read }) === null);
  check("a single-rate receipt offers no split", receiptVatSplit({ amount: -120, receiptVat: { ...read, code: "ST", lines: [{ rate: 20, code: "ST", net: 100, vat: 20, gross: 120 }] } }) === null);
  check("a mixed reading without gross figures offers no split", receiptVatSplit({ amount: -4.75, receiptVat: { ...read, lines: [{ rate: 20, code: "ST", net: null, vat: 0.4, gross: null }, { rate: 0, code: "ZR", net: null, vat: 0, gross: 2.35 }] } }) === null);
}

// 2. The page. ------------------------------------------------------------------------------------------------------
const page = readOptional("app/bank/page.tsx");
check("the page imports the helpers", page.includes('import { receiptVatFromDoc, receiptVatSplit, type ReceiptVat } from "@/lib/studioflow/bankReceiptVat";'));
check("a bank row carries receiptVat (read from the row's document)", /receiptVat: ReceiptVat \| null;/.test(page) && /receiptVat: receiptVatFromDoc\(data\),/.test(page));
check("the drawer says where the VAT came from: \"Read from the receipt\"", /🧾 \{t\("Read from the receipt"\)\}: \{t\(vatLabel\(drawerTx\.receiptVat\.code\)\)\}/.test(page));
check("a mixed receipt lists each rate with its gross", /drawerTx\.receiptVat\.code === "MX"\s*\? drawerTx\.receiptVat\.lines\.map\(/.test(page));
check("a foreign document asks the person to choose", page.includes(`t("Foreign supplier's document: choose the VAT yourself (goods: Import VAT, services: Reverse charge).")`));
check("\"Auto-applied\" is not repeated for the receipt's own VAT", /drawerTx\.vatCodeAuto !== drawerTx\.receiptVat\?\.code/.test(page));
check("the split editor opens pre-split by rate", /const byRate = tx\.splits\.length \? null : receiptVatSplit\(tx\);/.test(page) && /byRate \? byRate\.map\(line => \(\{ amount: line\.amount\.toFixed\(2\), category: effectiveCategory\(tx\) \|\| "", vatCode: line\.vatCode/.test(page));
check("the split button says it splits by VAT rate when the receipt allows it", /receiptVatSplit\(drawerTx\) \? t\("Split by VAT rate \(from the receipt\)"\)/.test(page));

// 3. Translations. --------------------------------------------------------------------------------------------------
const lang = readOptional("lib/studioflow/language.ts");
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const key of ["Read from the receipt", "Foreign supplier's document: choose the VAT yourself (goods: Import VAT, services: Reverse charge).", "Split by VAT rate (from the receipt)"]) {
  const row = (lang.match(new RegExp(`^\\s*"${escape(key)}": \\{([^\\n]*)\\}`, "m")) || [])[1] || "";
  check(`"${key.slice(0, 40)}…" has all 11 translations`, LANGUAGES.every((l) => row.includes(`"${l}":`)));
}

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`${failures.length} of ${checks} receipt-VAT web checks failed.`);
  process.exit(1);
}
console.log(`All ${checks} receipt-VAT web checks passed.`);

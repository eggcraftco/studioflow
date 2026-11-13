// Invoice / estimate VAT gate (9 Nov + 13 Nov 2026).
//
// A workshop that is not VAT registered (settings.vatRegistered === false) prints a document with
// no VAT row, rate 0, VAT 0, margin scheme off — and Subtotal = TOTAL, for an invoice and for an
// estimate (an estimate saved at 20% used to print "Subtotal 100 / TOTAL 120" with nothing between).
// An unknown answer (field missing) keeps the document as it was.
//
// The figures block is cut out of OrderDetailContent.tsx and run, so this checks the numbers the
// document prints, not only the text of the source.
//
//   npx tsx scripts/check-invoice-vat-gate.mts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "app/orders/OrderDetailContent.tsx"), "utf8");
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};

const start = source.indexOf("const vatOff = settings?.vatRegistered === false;");
const endMarker = "// The brand subtitle when the workshop wrote one";
const end = source.indexOf(endMarker, start);
ok("the figures block is found", start > 0 && end > start);
const block = source.slice(start, end);
const js = ts.transpileModule(block, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
type Figures = { vatOff: boolean; taxRate: number; isMarginScheme: boolean; vatAmount: number; subtotal: number };
const figures = new Function(
  "settings", "isEstimate", "estimate", "order", "hasLineItems", "orderValue",
  `${js}; return { vatOff, taxRate, isMarginScheme, vatAmount, subtotal };`
) as (...args: unknown[]) => Figures;

const order = { taxRate: 20, taxType: "Standard", taxAmount: 20 };
const estimate = { taxRate: 20, taxType: "Standard", taxAmount: 20, subtotal: 100, total: 120 };
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

// Invoice, not registered.
let f = figures({ vatRegistered: false }, false, null, order, false, 120);
ok("invoice, VAT off: rate 0, VAT 0, subtotal = total", f.vatOff && f.taxRate === 0 && f.vatAmount === 0 && near(f.subtotal, 120));
// Estimate saved at 20%, not registered.
f = figures({ vatRegistered: false }, true, estimate, order, true, estimate.total);
ok("estimate, VAT off: rate 0, VAT 0", f.vatOff && f.taxRate === 0 && f.vatAmount === 0);
ok("estimate, VAT off: subtotal = total (not the saved pre-VAT subtotal)", near(f.subtotal, 120));
// Margin scheme never applies with VAT off.
f = figures({ vatRegistered: false }, false, null, { ...order, taxType: "Profit" }, false, 120);
ok("VAT off: margin scheme off", f.isMarginScheme === false && near(f.subtotal, 120));
// Registered: unchanged.
f = figures({ vatRegistered: true }, false, null, order, false, 120);
ok("invoice, registered: VAT 20, subtotal 100", !f.vatOff && f.taxRate === 20 && near(f.vatAmount, 20) && near(f.subtotal, 100));
f = figures({ vatRegistered: true }, true, estimate, order, true, estimate.total);
ok("estimate, registered: saved subtotal 100, VAT 20", near(f.subtotal, 100) && near(f.vatAmount, 20));
// Unknown (field missing, or no settings yet): unchanged.
f = figures({}, false, null, order, false, 120);
ok("field missing: document as before", !f.vatOff && near(f.vatAmount, 20) && near(f.subtotal, 100));
f = figures(null, true, estimate, order, true, estimate.total);
ok("no settings: estimate as before", !f.vatOff && near(f.subtotal, 100));
// The row itself.
ok("VAT off prints no VAT row", /if \(vatOff\) \{\s*vatRow = "";/.test(source));

if (failures.length) {
  console.error(`invoice VAT gate: ${failures.length} of ${checks} FAILED`);
  for (const name of failures) console.error(`  ✗ ${name}`);
  process.exit(1);
}
console.log(`invoice VAT gate: ${checks} checks passed`);

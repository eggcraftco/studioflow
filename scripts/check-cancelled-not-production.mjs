// A cancelled order is not production work (1 Oct 2026, package E1).
//
// The eBay connector imports cancelled orders by default (status "Cancelled",
// never delivered, never dispatched). The Production board placed one in Ready,
// and Home's production, due-date and customer cards counted it as open — and,
// with its due date long past, as late. Both read the same rule the Orders list
// and the Schedule already use: lib/studioflow/orderFilters.ts orderIsCancelled.
//
// The helper is compiled with the tree's own TypeScript and run; the two screens'
// wiring is read from the sources, and each pattern fails loudly if it stops
// matching.
//
//   node scripts/check-cancelled-not-production.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const expect = (name, actual, wanted) => {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
};
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cancelled-not-production-"));
const js = ts.transpileModule(read("lib/studioflow/orderFilters.ts"), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
fs.writeFileSync(path.join(tmp, "orderFilters.mjs"), js);
const { orderIsCancelled } = await import(pathToFileURL(path.join(tmp, "orderFilters.mjs")).href);

// The shape loadScheduleOrders returns for the cancelled eBay order of 1 Oct
// (synthetic name), and the shapes it must not swallow.
const base = { customerName: "buyer_e1", designName: "Wrist watch x1", paymentDate: new Date("2026-07-17"), dueDate: new Date("2026-08-16"), isDelivered: false, isDispatched: false };
expect("eBay cancelled order", orderIsCancelled({ ...base, status: "Cancelled" }), true);
expect("US spelling", orderIsCancelled({ ...base, status: "Canceled" }), true);
expect("open order", orderIsCancelled({ ...base, status: "Not Yet" }), false);
expect("in progress", orderIsCancelled({ ...base, status: "In Progress" }), false);
expect("done", orderIsCancelled({ ...base, status: "Done" }), false);

const home = read("lib/studioflow/useHomeData.ts");
expect("Home imports the shared rule", /import\s*\{\s*orderIsCancelled\s*\}\s*from\s*"@\/lib\/studioflow\/orderFilters"/.test(home), true);
expect("Home's schedule list leaves cancelled orders out", /setScheduleOrders\(\s*nextSchedule\.filter\(\(order\)\s*=>\s*!orderIsCancelled\(order\)\)\s*\)/.test(home), true);
expect("Home sets the list in exactly one place", (home.match(/setScheduleOrders\(/g) || []).length, 1);

const board = read("app/production/ProductionContent.tsx");
expect("the board imports the shared rule", /import\s*\{\s*orderIsCancelled\s*\}\s*from\s*"@\/lib\/studioflow\/orderFilters"/.test(board), true);
expect("the board's cards leave cancelled orders out", /\.filter\(order\s*=>\s*!orderIsCancelled\(order\)\s*&&\s*\(!order\.isDelivered\s*\|\|\s*showDone\)\)/.test(board), true);

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.log(failures.map((f) => `FAIL  ${f}`).join("\n")); console.log(`\n${failures.length} of ${checks} checks failed`); process.exit(1); }
console.log(`PASS  ${checks}/${checks} checks — a cancelled order is not production work`);

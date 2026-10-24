// ET-E3 b2.1 (24 Oct 2026): a temporary server failure on an order save is never shown as the plan limit.
// The server (functions/orders/capacityTransaction.js) answers a real capacity refusal with failed-precondition and
// its plan sentence, and a temporary failure with aborted (contention not settled after its retries) or unavailable
// (database / connection). This check compiles lib/studioflow/friendlyError.ts and orderCallableErrors.ts with the
// tree's own TypeScript, runs them, probes the translations through the real studioT, and reads the wiring in
// lib/studioflow/orders.ts.
//
//   node scripts/check-order-transient-errors.mjs
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "order-transient-"));
const compile = (rel, name) => {
  const js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
  fs.writeFileSync(path.join(tmp, `${name}.mjs`), js);
};
for (const name of ["language", ...[...read("lib/studioflow/language.ts").matchAll(/from "\.\/([A-Za-z]+)"/g)].map((m) => m[1])]) compile(`lib/studioflow/${name}.ts`, name);
compile("lib/studioflow/friendlyError.ts", "friendlyError");
const { studioT } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
const { friendlyErrorMessage } = await import(pathToFileURL(path.join(tmp, "friendlyError.mjs")).href);
let temporaryOrderSaveMessage = () => "MODULE MISSING";
if (fs.existsSync(path.join(root, "lib/studioflow/orderCallableErrors.ts"))) {
  compile("lib/studioflow/orderCallableErrors.ts", "orderCallableErrors");
  ({ temporaryOrderSaveMessage } = await import(pathToFileURL(path.join(tmp, "orderCallableErrors.mjs")).href));
}

const BUSY = "The server is busy. Please try again.";
// Word for word as functions/orders/capacityTransaction.js and the create/reopen guards send them.
const SERVER_CONTENDED = "Several changes arrived at the same moment, so this one was not saved. Nothing was changed. Please try again.";
const SERVER_TRANSIENT = "This change could not be confirmed because of a temporary problem. Please check the order and try again.";
const PLAN_CREATE = "Your current plan has reached its order limit. Mark finished orders as delivered to free a slot, or upgrade the workspace plan.";
const PLAN_REOPEN = "Your current plan has reached its active order limit, so this order stays finished. Mark another order as delivered, or upgrade the workspace plan, then reopen it.";
const fe = (code, message) => Object.assign(new Error(message), { code });
const id = (s) => s;

// 1. The code decides, before any message text.
expect("aborted -> busy", temporaryOrderSaveMessage(fe("functions/aborted", SERVER_CONTENDED)), BUSY);
expect("unavailable -> busy", temporaryOrderSaveMessage(fe("functions/unavailable", SERVER_TRANSIENT)), BUSY);
expect("deadline-exceeded -> busy", temporaryOrderSaveMessage(fe("functions/deadline-exceeded", "deadline-exceeded")), BUSY);
expect("aborted carrying a plan-looking text is STILL busy (code first)", temporaryOrderSaveMessage(fe("functions/aborted", PLAN_CREATE)), BUSY);
expect("failed-precondition is not temporary (caller keeps the plan sentence)", temporaryOrderSaveMessage(fe("functions/failed-precondition", PLAN_CREATE)), null);
expect("internal is not classed temporary here (generic sentence elsewhere)", temporaryOrderSaveMessage(fe("functions/internal", "INTERNAL")), null);
expect("permission-denied is not temporary", temporaryOrderSaveMessage(fe("functions/permission-denied", "x")), null);
expect("no code -> null", temporaryOrderSaveMessage(new Error("x")), null);

// 2. friendlyErrorMessage keeps the two kinds apart.
expect("friendlyErrorMessage(aborted) -> busy", friendlyErrorMessage(fe("functions/aborted", SERVER_CONTENDED), id), BUSY);
expect("friendlyErrorMessage(unavailable) -> busy", friendlyErrorMessage(fe("functions/unavailable", SERVER_TRANSIENT), id), BUSY);
expect("friendlyErrorMessage(failed-precondition create) keeps the plan sentence", friendlyErrorMessage(fe("functions/failed-precondition", PLAN_CREATE), id), PLAN_CREATE);
expect("friendlyErrorMessage(failed-precondition reopen) keeps the plan sentence", friendlyErrorMessage(fe("functions/failed-precondition", PLAN_REOPEN), id), PLAN_REOPEN);

// 3. The server's temporary sentences carry no word the callers' text mappings read as plan / role / workflow.
for (const [name, text] of [["contended", SERVER_CONTENDED], ["transient", SERVER_TRANSIENT]]) {
  expect(`server ${name} sentence: no plan/limit words`, /plan.*limit|order limit|failed-precondition/i.test(text), false);
  expect(`server ${name} sentence: no permission/role/denied words`, /permission|role|denied/i.test(text), false);
  expect(`server ${name} sentence: no workflow/day-entry words`, /workflow|day entr|own days|Full day or Half day|^Your current role/i.test(text), false);
}

// 4. The busy sentence in every language.
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
expect(`translated in all 11 non-English languages: ${BUSY}`, LANGUAGES.filter((l) => studioT(BUSY, l) === BUSY), []);

// 5. Wiring: the code check runs FIRST in the create and update mappings, and restore rethrows the busy sentence.
const orders = read("lib/studioflow/orders.ts");
const fnBody = (name) => { const i = orders.indexOf(`function ${name}(error: unknown) {`); return i < 0 ? "" : orders.slice(i, orders.indexOf("\n}\n", i)); };
for (const name of ["friendlyCreateOrderError", "friendlyUpdateOrderError"]) {
  expect(`${name}: temporary check is its first statement`, /\{\n\s*const temporary = temporaryOrderSaveMessage\(error\);\n\s*if \(temporary\) return temporary;/.test(fnBody(name)), true);
}
const restore = orders.slice(orders.indexOf("export async function restoreOrderFromWeb"), orders.indexOf("export type MergeOrderResult"));
expect("restoreOrderFromWeb: a temporary failure is rethrown as the busy sentence, other errors unchanged", /const temporary = temporaryOrderSaveMessage\(error\);\s*if \(temporary\) throw new Error\(temporary\);\s*throw error;/.test(restore), true);

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.log(failures.map((f) => `FAIL  ${f}`).join("\n")); console.log(`\n${failures.length} of ${checks} checks failed`); process.exit(1); }
console.log(`PASS  ${checks}/${checks} checks — a temporary order-save failure is never the plan limit`);

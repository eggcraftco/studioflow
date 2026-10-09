// Plan & Access order usage (7 Oct 2026).
//
// The plan limit counts ACTIVE orders by the server's rule — functions/index.js
// countActiveOrders, read by createWebOrder/createSwiftOrder: an order is active
// unless isDeleted === true or isDelivered === true. Status is not read, so a
// cancelled order still counts. Total = every order outside Trash.
//
// lib/studioflow/planOrderUsage.ts is compiled with the tree's own TypeScript and
// run; the translations are probed through the real studioT (deep merge, Mac
// table last); the two screens' wiring is read from the sources.
//
//   node scripts/check-plan-order-usage.mjs
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plan-order-usage-"));
const compile = (rel, name) => {
  const js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
  fs.writeFileSync(path.join(tmp, `${name}.mjs`), js);
};
compile("lib/studioflow/planOrderUsage.ts", "planOrderUsage");
for (const name of ["language", "macTranslations", "settingsContentTranslations", "shippingTranslations", "trackingEmailTranslations", "screenGapTranslations"]) compile(`lib/studioflow/${name}.ts`, name);
const usage = await import(pathToFileURL(path.join(tmp, "planOrderUsage.mjs")).href);
const { studioT } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
const { isPlanActiveOrder, tallyPlanOrders, combinePlanOrderCounts, formatActiveOrdersLine, formatTotalOrdersLine, planOrderUsagePercent, PLAN_ORDER_RULE_HINT } = usage;

// 1. The predicate, case by case.
const open = { status: "Not Yet", isDelivered: false, isDeleted: false };
const cases = [
  ["open order", open, true],
  ["delivered", { ...open, isDelivered: true }, false],
  ["deleted (in Trash)", { ...open, isDeleted: true }, false],
  ["cancelled, not delivered — still counts", { ...open, status: "Cancelled" }, true],
  ["cancelled and delivered", { ...open, status: "Cancelled", isDelivered: true }, false],
  ["cancelled and deleted", { ...open, status: "Cancelled", isDeleted: true }, false],
  ["Done but not delivered — status is not read", { ...open, status: "Done" }, true],
  ["restored from Trash (isDeleted back to false)", { ...open, isDeleted: false }, true],
  ["fields missing (legacy order)", { status: "In Progress" }, true],
  ["string \"true\" is not true (server uses ===)", { isDelivered: "true", isDeleted: "true" }, true],
  ["null document", null, true]
];
for (const [name, row, wanted] of cases) expect(`predicate: ${name}`, isPlanActiveOrder(row), wanted);

// 2. Tally over a workspace: total leaves Trash out, keeps delivered.
const workspace = [
  open,
  { ...open, status: "Cancelled" },
  { ...open, isDelivered: true },
  { ...open, isDeleted: true },
  { ...open, isDeleted: true, isDelivered: true },
  { ...open, isDeleted: false } // restored
];
expect("tally", tallyPlanOrders(workspace), { active: 3, total: 4 });

// 3. The four-aggregate form equals the per-document rule on many random workspaces.
let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = () => { const r = rand(); return r < 0.4 ? true : r < 0.7 ? false : r < 0.85 ? undefined : "true"; };
let agree = true;
for (let i = 0; i < 300 && agree; i += 1) {
  const rows = Array.from({ length: Math.floor(rand() * 40) }, () => ({ isDeleted: pick(), isDelivered: pick() }));
  const counts = {
    all: rows.length,
    deleted: rows.filter(r => r.isDeleted === true).length,
    delivered: rows.filter(r => r.isDelivered === true).length,
    deletedAndDelivered: rows.filter(r => r.isDeleted === true && r.isDelivered === true).length
  };
  if (JSON.stringify(combinePlanOrderCounts(counts)) !== JSON.stringify(tallyPlanOrders(rows))) agree = false;
}
expect("aggregate form == per-document rule (300 random workspaces)", agree, true);
expect("aggregate form never goes negative", combinePlanOrderCounts({ all: 1, deleted: 5, delivered: 5, deletedAndDelivered: 0 }).active >= 0, true);

// 4. Lines shown on screen.
expect("free plan line", formatActiveOrdersLine(7, 10), "Active orders: \u20667 / 10\u2069");
expect("the ratio is a left-to-right isolate (RTL draws it 10 / 7 otherwise)", /^\u2066.*\u2069$/.test(formatActiveOrdersLine(7, 10).split(": ")[1]), true);
expect("over the limit after a restore", formatActiveOrdersLine(11, 10), "Active orders: \u206611 / 10\u2069");
expect("paid plan line", formatActiveOrdersLine(42, null), "Active orders: 42 (no limit)");
expect("total line", formatTotalOrdersLine(12), "Total orders: 12");
expect("percent", planOrderUsagePercent(7, 10), 70);
expect("percent caps at 100", planOrderUsagePercent(12, 10), 100);
expect("percent with no limit", planOrderUsagePercent(12, null), 0);
expect("hint wording", PLAN_ORDER_RULE_HINT, "Delivered and deleted orders don't count toward the limit; cancelled orders still count until you mark them delivered or delete them.");

// 5. Every string, every language — through the real studioT.
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
for (const key of ["Active orders", "Total orders", "no limit", PLAN_ORDER_RULE_HINT, "Orders", "Loading..."]) {
  const untranslated = LANGUAGES.filter(language => studioT(key, language) === key);
  expect(`translated in all 11 non-English languages: ${key.slice(0, 40)}`, untranslated, []);
}
expect("Turkish line", formatActiveOrdersLine(3, null, (s) => studioT(s, "Türkçe")), "Aktif siparişler: 3 (limit yok)");
expect("Arabic line", formatActiveOrdersLine(3, 10, (s) => studioT(s, "العربية (Arabic)")), "الطلبات النشطة: \u20663 / 10\u2069");

// 6. Wiring.
const settings = read("app/settings/page.tsx");
expect("Settings uses the shared formatter", /formatActiveOrdersLine\(orderUsage\.active, orderUsage\.limit, t\)/.test(settings), true);
expect("Settings shows the total", /formatTotalOrdersLine\(orderUsage\.total, t\)/.test(settings), true);
expect("Settings shows the rule, translated", /\{t\(PLAN_ORDER_RULE_HINT\)\}/.test(settings), true);
expect("Settings no longer shows every order under Orders", /<strong>\{counts\?\.orderCount \?\? 0\}<\/strong>\s*\{\/\* The plan limit/.test(settings), false);
const plan = read("app/plan/page.tsx");
expect("/plan loads the same usage", /loadPlanOrderUsage\(loadedWorkspace\.id, loadedWorkspace\.entitlements\.orderLimit\)/.test(plan), true);
const loader = read("lib/studioflow/planOrderUsageLoader.ts");
expect("loader reads the server callable", /"getWorkspacePlanUsage"/.test(loader), true);
expect("loader counts isDeleted == true", /where\("isDeleted", "==", true\)/.test(loader), true);
expect("loader counts isDelivered == true", /where\("isDelivered", "==", true\)/.test(loader), true);

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.log(failures.map((f) => `FAIL  ${f}`).join("\n")); console.log(`\n${failures.length} of ${checks} checks failed`); process.exit(1); }
console.log(`PASS  ${checks}/${checks} checks — plan order usage follows the server's active-order rule`);

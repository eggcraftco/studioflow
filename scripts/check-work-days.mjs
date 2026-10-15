// Day entries on the Work Time card (docs/working-day-entry-contract-2026-10-14.md).
//   1. lib/studioflow/workDays.ts, run for real: full = 1, half = 0.5, the total and its format,
//      stored rows (malformed / repeated dropped, newest date first), the local preview of a
//      set / replace / delete, and today's date key in local time;
//   2. the order model reads `workDays` beside `workSessions`;
//   3. the card writes ONLY through updateWebOrder's `workDay` patch (no Firestore write of
//      workDays from the web), the timer's own calls are unchanged, and the block is gated by
//      the same canEditWorkTime as the timer;
//   4. every new string is translated in all eleven languages (compiled studioT).
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
let checks = 0;
const check = (label, ok) => { checks += 1; if (!ok) failures.push(label); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "work-days-"));
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
  .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');

// 1. The pure module.
fs.writeFileSync(path.join(tmp, "workDays.mjs"), transpile(read("lib/studioflow/workDays.ts")));
const wd = await import(pathToFileURL(path.join(tmp, "workDays.mjs")).href);
check("full day = 1", wd.workDayValue("full_day") === 1);
check("half day = 0.5", wd.workDayValue("half_day") === 0.5);
check("unknown kind = 0", wd.workDayValue("x") === 0);
check("total 1 + 0.5 + 1 = 2.5", wd.totalWorkDays([{ kind: "full_day" }, { kind: "half_day" }, { kind: "full_day" }]) === 2.5);
check("format 1.5 → 1.5", wd.formatWorkDays(1.5, "en-GB") === "1.5");
check("format 2 → 2", wd.formatWorkDays(2, "en-GB") === "2");
check("format 1.5 in Deutsch → 1,5", wd.formatWorkDays(1.5, "de-DE") === "1,5");
const rows = wd.mapWorkDays([
  { memberUid: "a", date: "2026-10-01", kind: "full_day", memberEmail: "a@x.test" },
  { memberUid: "a", date: "2026-10-03", kind: "half_day" },
  { memberUid: "a", date: "2026-10-03", kind: "full_day" },
  { memberUid: "", date: "2026-10-03", kind: "full_day" },
  { memberUid: "b", date: "03/10/2026", kind: "full_day" },
  { memberUid: "b", date: "2026-10-03", kind: "quarter" },
  "junk"
]);
check("stored rows: malformed and repeated dropped", rows.length === 2);
check("stored rows: newest date first, first copy kept", rows[0].id === "a_2026-10-03" && rows[0].kind === "half_day" && rows[1].id === "a_2026-10-01");
check("not an array → []", wd.mapWorkDays(null).length === 0);
const set1 = wd.applyWorkDayPatchLocally([], { action: "set", date: "2026-10-14", kind: "full_day", note: " site " }, "me", "me@x.test");
check("local set adds my entry", set1.length === 1 && set1[0].id === "me_2026-10-14" && set1[0].note === "site" && set1[0].kind === "full_day");
const set2 = wd.applyWorkDayPatchLocally(set1, { action: "set", date: "2026-10-14", kind: "half_day" }, "me", "me@x.test");
check("local set on the same day replaces (one per member per day)", set2.length === 1 && set2[0].kind === "half_day");
const del = wd.applyWorkDayPatchLocally(set2, { action: "delete", date: "2026-10-14" }, "me", "me@x.test");
check("local delete removes it", del.length === 0);
check("localDateKey uses the local calendar", wd.localDateKey(new Date(2026, 0, 5, 23, 30)) === "2026-01-05");
check("workDayDate reads the stored day without a UTC shift", wd.workDayDate("2026-10-14")?.getDate() === 14);

// 2. Model.
const firestore = read("lib/studioflow/firestore.ts");
check("OrderDetail has workDays", /workDays\?: WorkDayDetail\[\];/.test(firestore));
check("order mapper reads data.workDays", firestore.includes("workDays: mapWorkDays(data.workDays),"));
const orders = read("lib/studioflow/orders.ts");
check("UpdateOrderInput carries workDay", /workDay\?: WorkDayPatch;/.test(orders));

// 3. Write path and gate.
const detail = read("app/orders/OrderDetailContent.tsx");
check("card saves through updateOrderFromWeb with workDay", /await updateOrderFromWeb\(workspace, \{\s*orderId: order\.id,\s*workDay: \{ \.\.\.patch, source: "web" \}\s*\}\);/.test(detail));
check("timer call unchanged", /await updateOrderFromWeb\(workspace, \{\s*orderId: order\.id,\s*workTime: patch\s*\}\);/.test(detail));
check("no Firestore write of workDays from the web", !/(updateDoc|setDoc|writeBatch)\([^)]*workDays/.test(detail + firestore + orders));
check("day block gated by canEditWorkTime (same as the timer)", /\{canEditWorkTime \? \(\s*<div className="app-work-day-entry"/.test(detail));
check("save refuses without the timer's permission", /async function saveWorkDayPatch[\s\S]{0,120}if \(!canEditWorkTime \|\| !user\?\.uid\)/.test(detail));
check("delete offered for own entries, or owner/admin", detail.includes("const canDelete = canEditWorkTime && (isMine || isWorkspaceManager);"));
check("kind switch only on my own entry", /\{isMine \? \(\s*<button[\s\S]{0,200}saveWorkDay\(entry\.kind === "half_day" \? "full_day" : "half_day", entry\.date, entry\.note\)/.test(detail));
check("days shown beside the timer total", detail.includes('{t("Days worked")}: <b>{formatWorkDays(daysWorked, detailLocale)}</b>'));

// 4. Translations.
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português",
  "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const DICTIONARY_FILES = ["language", ...[...read("lib/studioflow/language.ts").matchAll(/from "\.\/(\w+)"/g)].map((m) => m[1])];
for (const name of DICTIONARY_FILES) fs.writeFileSync(path.join(tmp, `${name}.mjs`), transpile(read(`lib/studioflow/${name}.ts`)));
const { studioT } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
const { WORK_DAY_TRANSLATIONS } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
const used = ["Day entry", "Full day", "Half day", "Note (optional)", "Save day", "Days worked", "Day saved.", "Day entry deleted.", "Delete day entry", "Could not save the day entry."];
for (const key of used) check(`string used by the card is in the table: ${key}`, Boolean(WORK_DAY_TRANSLATIONS[key]) && detail.includes(`"${key}"`));
for (const key of Object.keys(WORK_DAY_TRANSLATIONS)) {
  check(`English: ${key}`, studioT(key, "English") === key);
  for (const language of LANGUAGES) {
    const out = studioT(key, language);
    check(`studioT(${JSON.stringify(key)}, ${language}) translated`, Boolean(out) && out !== key);
  }
}
const server = ["You can log only your own days.", "You can delete only your own day entries.", "A day entry cannot be in the future.", "Pick a valid date for the day entry.", "Choose Full day or Half day.", "Day entry not found."];
for (const key of server) check(`server refusal translated: ${key}`, Boolean(WORK_DAY_TRANSLATIONS[key]));

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`check-work-days: ${failures.length} of ${checks} FAILED`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-work-days: ${checks}/${checks} passed`);

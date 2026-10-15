// Day entries on the Work Time card (docs/working-day-entry-contract-2026-10-14.md).
//   1. lib/studioflow/workDays.ts, run for real: full = 1, half = 0.5, the total and its format,
//      stored rows (malformed / repeated dropped, newest date first), the local preview of a
//      set / replace / delete, and today's date key in local time;
//   2. the order model reads `workDays` beside `workSessions`;
//   3. the card writes ONLY through updateWebOrder's `workDay` patch (no Firestore write of
//      workDays from the web), the timer's own calls are unchanged, and the block is gated by
//      the same canEditWorkTime as the timer;
//   4. every new string is translated in all eleven languages (compiled studioT);
//   5. (15 Oct 2026) two measures never added together, owner-only corrections of someone else's
//      entry, edit keeps the date and the member, change history read and shown, the date picker
//      stops at today, and the device's calendar day across midnight and time zones.
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import { execFileSync } from "child_process";
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
const wdModule = await import(pathToFileURL(path.join(tmp, "workDays.mjs")).href);
// A function the module does not have yet answers undefined, so an older module fails checks instead of crashing.
const wd = new Proxy(wdModule, { get: (target, key) => (key in target ? target[key] : () => []) });
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
// Midnight on this device: 23:59:59 is still the 15th, 00:00 is the 16th.
check("midnight: 23:59:59 local → that day", wd.localDateKey(new Date(2026, 9, 15, 23, 59, 59)) === "2026-10-15");
check("midnight: 00:00:00 local → the next day", wd.localDateKey(new Date(2026, 9, 16, 0, 0, 0)) === "2026-10-16");
// Time zones: one instant (16 Oct 10:30 UTC) is a different calendar day on different devices; each keeps its own.
const tzKey = (tz) => execFileSync(process.execPath, ["--input-type=module", "-e",
  `const m = await import(${JSON.stringify(pathToFileURL(path.join(tmp, "workDays.mjs")).href)}); process.stdout.write(m.localDateKey(new Date(Date.UTC(2026, 9, 16, 10, 30))));`],
  { env: { ...process.env, TZ: tz } }).toString();
check("time zone: Kiritimati (UTC+14) device → 2026-10-17", tzKey("Pacific/Kiritimati") === "2026-10-17");
check("time zone: London device → 2026-10-16", tzKey("Europe/London") === "2026-10-16");
check("time zone: UTC-12 device (22:30 on the 15th there) → 2026-10-15", tzKey("Etc/GMT+12") === "2026-10-15");
check("time zone: UTC-12 device at 11:30 UTC → 2026-10-15", execFileSync(process.execPath, ["--input-type=module", "-e",
  `const m = await import(${JSON.stringify(pathToFileURL(path.join(tmp, "workDays.mjs")).href)}); process.stdout.write(m.localDateKey(new Date(Date.UTC(2026, 9, 16, 11, 30))));`],
  { env: { ...process.env, TZ: "Etc/GMT+12" } }).toString() === "2026-10-15");
// Who may change or delete: own entry, or the OWNER for anyone's. Admin is not the owner.
check("manage: own entry", wd.canManageWorkDay({ memberUid: "me" }, "me", false, true) === true);
check("manage: someone else's, not the owner (admin/member/Workflow) → no", wd.canManageWorkDay({ memberUid: "other" }, "me", false, true) === false);
check("manage: someone else's, the owner → yes", wd.canManageWorkDay({ memberUid: "other" }, "me", true, true) === true);
check("manage: no Work Time permission → no, even own", wd.canManageWorkDay({ memberUid: "me" }, "me", true, false) === false);
// Timer seconds on the same member's same day — information beside the entry, never added to it.
const sess = [
  { createdByUid: "me", startedAt: new Date(2026, 9, 14, 9, 0), d: 3600 },
  { createdByUid: "me", startedAt: new Date(2026, 9, 14, 13, 0), d: 1800 },
  { createdByUid: "me", startedAt: new Date(2026, 9, 13, 9, 0), d: 600 },
  { createdByUid: "other", startedAt: new Date(2026, 9, 14, 9, 0), d: 900 }
];
check("timer on the same day: only my sessions on that local day", wd.timerSecondsOnDay(sess, "me", "2026-10-14", (x) => x.d) === 5400);
check("timer on the same day: none → 0", wd.timerSecondsOnDay(sess, "me", "2026-10-01", (x) => x.d) === 0);
// History rows as the server writes them; nothing invented for older entries.
const hist = wd.mapWorkDayHistory([
  { id: "h2", at: new Date(2026, 9, 15, 10, 0), action: "changed", date: "2026-10-14", memberUid: "m2", memberEmail: "m2@x.test", byUid: "own", byEmail: "own@x.test", before: { kind: "full_day", note: "" }, after: { kind: "half_day", note: "" }, source: "web" },
  { id: "h1", action: "logged", date: "2026-10-14", memberUid: "m2", byUid: "m2", before: null, after: { kind: "full_day", note: "" } },
  { action: "rewritten", date: "2026-10-14", memberUid: "m2", byUid: "m2" },
  { action: "logged", date: "bad", memberUid: "m2", byUid: "m2" }
]);
check("history: valid rows kept in order, malformed dropped", hist.length === 2 && hist[0]?.action === "changed" && hist[1]?.action === "logged");
check("history: before/after read", hist[0]?.before?.kind === "full_day" && hist[0]?.after?.kind === "half_day" && hist[1]?.before === null);
check("history: none stored → []", wd.mapWorkDayHistory(undefined).length === 0);
const stamped = wd.mapWorkDays([{ memberUid: "m2", date: "2026-10-14", kind: "half_day", updatedByUid: "own", updatedByEmail: "own@x.test" }, { memberUid: "m1", date: "2026-10-14", kind: "full_day" }]);
check("entries: last-changed-by read when stored, absent when not", stamped.find((e) => e.memberUid === "m2")?.updatedByUid === "own" && !("updatedByUid" in stamped.find((e) => e.memberUid === "m1")));
const ownerEdit = wd.applyWorkDayPatchLocally(stamped, { action: "set", date: "2026-10-14", kind: "full_day", memberUid: "m1" }, "own", "own@x.test");
check("local preview of the owner's correction keeps the member and stamps the owner", ownerEdit.find((e) => e.id === "m1_2026-10-14")?.memberUid === "m1" && ownerEdit.find((e) => e.id === "m1_2026-10-14")?.updatedByUid === "own");
const wdSource = read("lib/studioflow/workDays.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
check("workDays.ts never converts days to hours or money", !/\b(hours?|price|rate|wage|cost|amount|currency)\b|3600|\*\s*[48]\b/i.test(wdSource));

// 2. Model.
const firestore = read("lib/studioflow/firestore.ts");
check("OrderDetail has workDays", /workDays\?: WorkDayDetail\[\];/.test(firestore));
check("OrderDetail has workDayHistory", /workDayHistory\?: WorkDayHistoryDetail\[\];/.test(firestore));
check("order mapper reads data.workDayHistory", firestore.includes("workDayHistory: mapWorkDayHistory(data.workDayHistory),"));
check("order mapper reads data.workDays", firestore.includes("workDays: mapWorkDays(data.workDays),"));
const orders = read("lib/studioflow/orders.ts");
check("UpdateOrderInput carries workDay", /workDay\?: WorkDayPatch;/.test(orders));

// 3. Write path and gate.
const detail = read("app/orders/OrderDetailContent.tsx");
check("card saves through updateOrderFromWeb with workDay", /await updateOrderFromWeb\(workspace, \{\s*orderId: order\.id,\s*workDay: \{ \.\.\.patch, source: "web" \}\s*\}\);/.test(detail));
check("timer call unchanged", /await updateOrderFromWeb\(workspace, \{\s*orderId: order\.id,\s*workTime: patch\s*\}\);/.test(detail));
check("no Firestore write of workDays from the web", !/(updateDoc|setDoc|writeBatch)\([^)]*workDays/.test(detail + firestore + orders));
check("day block gated by canEditWorkTime (same as the timer)", /\{canEditWorkTime \? \(\s*<div className=\{`app-work-day-entry/.test(detail));
check("save refuses without the timer's permission", /async function saveWorkDayPatch[\s\S]{0,120}if \(!canEditWorkTime \|\| !user\?\.uid\)/.test(detail));
check("edit/delete offered for own entries, or the OWNER (not admin)", detail.includes("const canManage = canManageWorkDay(entry, myUid, isWorkspaceOwner, canEditWorkTime);")
  && detail.includes('const isWorkspaceOwner = normalizeWorkspaceRole(workspace.role) === "owner";') && !detail.includes("isWorkspaceManager"));
check("edit keeps the entry's date and member", detail.includes('void saveWorkDayPatch({ action: "set", date: editingWorkDay.date, kind, note: note.trim(), memberUid: editingWorkDay.memberUid });'));
check("date locked while editing", detail.includes("disabled={savingWorkDay || Boolean(editingWorkDay)}"));
check("date picker stops at today (device calendar)", detail.includes("max={localDateKey()}") && !detail.includes("localDateKey(new Date(Date.now() + 86400000))"));
check("two measures, two elements: timer total and days worked", detail.includes('<strong data-testid="work-timer-total">{formatWorkDuration(totalSeconds)}</strong>') && detail.includes('<strong data-testid="work-days-total">{formatWorkDays(daysWorked, detailLocale)}</strong>'));
check("never added together: no sum of days and timer seconds", !/daysWorked\s*[+*]|[+*]\s*daysWorked|totalSeconds\s*\+\s*\(?\s*daysWorked|workDayValue\([^)]*\)\s*\*/.test(detail));
check("the card says so", detail.includes('t("Timer hours and day entries are counted separately and never added together.")'));
check("history shown from the server's rows", detail.includes("order.workDayHistory ?? []") && detail.includes('data-testid="work-day-history"'));
check("timer on the same day shown per entry, information only", detail.includes("timerSecondsOnDay(sessions, entry.memberUid, entry.date,"));

// 4. Translations.
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português",
  "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const DICTIONARY_FILES = ["language", ...[...read("lib/studioflow/language.ts").matchAll(/from "\.\/(\w+)"/g)].map((m) => m[1])];
for (const name of DICTIONARY_FILES) fs.writeFileSync(path.join(tmp, `${name}.mjs`), transpile(read(`lib/studioflow/${name}.ts`)));
const { studioT } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
const { WORK_DAY_TRANSLATIONS } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
const used = ["Day entry", "Full day", "Half day", "Note (optional)", "Save day", "Days worked", "Day saved.", "Day entry deleted.", "Delete day entry", "Could not save the day entry.",
  "Timer total", "Day entries", "Timer hours and day entries are counted separately and never added together.", "Timer sessions", "Timer on this day",
  "Editing day entry", "Edit day entry", "Changed by", "Day entry history", "Day logged", "Day changed", "Day deleted"];
for (const key of used) check(`string used by the card is in the table: ${key}`, Boolean(WORK_DAY_TRANSLATIONS[key]) && detail.includes(`"${key}"`));
for (const key of Object.keys(WORK_DAY_TRANSLATIONS)) {
  check(`English: ${key}`, studioT(key, "English") === key);
  for (const language of LANGUAGES) {
    const out = studioT(key, language);
    check(`studioT(${JSON.stringify(key)}, ${language}) translated`, Boolean(out) && out !== key);
  }
}
const server = ["You can log only your own days.", "You can delete only your own day entries.", "A day entry cannot be in the future.", "Pick a valid date for the day entry.", "Choose Full day or Half day.", "Day entry not found.",
  "Only the workspace owner can change someone else's day entry."];
for (const key of server) check(`server refusal translated: ${key}`, Boolean(WORK_DAY_TRANSLATIONS[key]));

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`check-work-days: ${failures.length} of ${checks} FAILED`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-work-days: ${checks}/${checks} passed`);

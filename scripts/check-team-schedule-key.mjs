// Team Schedule access key (docs/team-schedule-access-contract-2026-10-08.md).
//   1. the `teamSchedule` option exists with label + description, both in all
//      twelve languages (English + eleven translations, via the compiled studioT);
//      it sits in the permission matrix; workflow defaults it off;
//   2. nav mapping: /team-schedule → teamSchedule (the page table AppShell uses),
//      closed when false, open by default;
//   3. no fetch when off: the team page redirects on teamSchedule=false BEFORE
//      any order / roster / callable read; members read through the callable,
//      not Firestore; other members' jobs do not click through to /orders;
//   4. the callable name equals the server export (functions/index.js, path from
//      TEAM_SCHEDULE_SERVER_INDEX; refused if the file is not found).
//
//   TEAM_SCHEDULE_SERVER_INDEX=<functions/index.js> node scripts/check-team-schedule-key.mjs
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

const firestore = read("lib/studioflow/firestore.ts");
const settings = read("app/settings/page.tsx");
const schedule = read("app/schedule/page.tsx");
const appShell = read("components/AppShell.tsx");
const editor = read("components/MemberAccessEditor.tsx");

// 1. Option, matrix, defaults.
const optionMatch = firestore.match(/\{ key: "teamSchedule", label: "([^"]+)", description: "([^"]+)" \}/);
check("teamSchedule option in WORKSPACE_NAVIGATION_ACCESS_OPTIONS", Boolean(optionMatch) && firestore.indexOf('key: "teamSchedule"') < firestore.indexOf("export const WORKSPACE_SETTINGS_ACCESS_OPTIONS"));
const LABEL = optionMatch?.[1] ?? "", DESCRIPTION = (optionMatch?.[2] ?? "").replace(/\\'/g, "'");
check("label is Team Schedule", LABEL === "Team Schedule");
check("permission matrix row", /\{ key: "teamSchedule", label: "Team Schedule", value: column =>/.test(settings));
check("matrix workflow column: teamSchedule false", /access\.schedule = true;\n\s*access\.teamSchedule = false;/.test(settings));
check("client role defaults: workflow → false", /function defaultWorkspaceAccessForRole[\s\S]{0,600}access\.teamSchedule = false;/.test(firestore));
check("client assigned-only scope helper used on member + custom role paths", (firestore.match(/enforceTeamScheduleScope\(/g) || []).length >= 3);
check("editor: turning Assigned Projects Only on turns Team Schedule off", editor.includes('key === "assignedProjectsOnly" && !currentValue ? { teamSchedule: false } : {}'));

const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português",
  "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const DICTIONARY_FILES = ["language", ...[...read("lib/studioflow/language.ts").matchAll(/from "\.\/(\w+)"/g)].map((m) => m[1])];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "team-schedule-key-"));
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
  .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
for (const name of DICTIONARY_FILES) fs.writeFileSync(path.join(tmp, `${name}.mjs`), transpile(read(`lib/studioflow/${name}.ts`)));
const { studioT } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
for (const key of [LABEL, DESCRIPTION, "Assigned to"]) {
  check(`English: ${key.slice(0, 40)}`, Boolean(key) && studioT(key, "English") === key);
  for (const language of LANGUAGES) {
    const out = studioT(key, language);
    check(`studioT(${JSON.stringify(key.slice(0, 40))}, ${language}) translated`, Boolean(key) && Boolean(out) && out !== key);
  }
}

// 2. Nav mapping (the pure helper, run for real).
fs.writeFileSync(path.join(tmp, "pageAccess.mjs"), transpile(read("lib/studioflow/pageAccess.ts")).replace(/^import type[^\n]*\n/m, ""));
const access = await import(pathToFileURL(path.join(tmp, "pageAccess.mjs")).href);
fs.rmSync(tmp, { recursive: true, force: true });
check("/team-schedule → teamSchedule", access.pageAccessKeyForPath("/team-schedule") === "teamSchedule");
check("/schedule still → schedule", access.pageAccessKeyForPath("/schedule") === "schedule");
check("teamSchedule=false closes /team-schedule only", !access.pageAccessAllows({ teamSchedule: false }, "/team-schedule") && access.pageAccessAllows({ teamSchedule: false }, "/schedule"));
check("default (no key) opens /team-schedule", access.pageAccessAllows({}, "/team-schedule"));
check("AppShell nav reads the page table and lists /team-schedule", appShell.includes("const NAV_ACCESS_BY_HREF = PAGE_ACCESS_BY_PATH;") && appShell.includes('{ href: "/team-schedule", label: "Team Schedule"'));

// 3. No fetch when off; callable for members; view-only.
const runBody = schedule.slice(schedule.indexOf("async function run() {"), schedule.indexOf("run();", schedule.indexOf("async function run() {")));
const gateAt = runBody.indexOf('if (teamMode && !workspaceAccessAllows(loadedWorkspace.memberAccess, "teamSchedule")) {');
const firstRead = Math.min(...["loadOrdersForView(", "loadTeamAccessData(", "loadScheduleOrders(", "loadWorkspaceBlockHeadings(", "loadWorkspaceSettingsOverview("].map((n) => { const i = runBody.indexOf(n); return i < 0 ? Infinity : i; }));
check("team page gate on teamSchedule exists", gateAt > 0);
check("gate redirects + returns before any data read", gateAt > 0 && gateAt < firstRead && /router\.replace\(pageAccessRedirectFor\("\/team-schedule", loadedWorkspace\.memberAccess\)\);\s*return;/.test(runBody.slice(gateAt, firstRead)));
check("members read via callable (loadOrdersForView → loadTeamScheduleItems)", /function loadOrdersForView[\s\S]{0,500}loadTeamScheduleItems\(/.test(schedule));
check("no callable without the Team plan", /function loadOrdersForView[\s\S]{0,400}billingPlan !== "team_monthly"\) return \[\];/.test(schedule));
const teamBlock = schedule.slice(schedule.indexOf("{teamMode ? (", schedule.indexOf("<main className=")), schedule.indexOf('t("Select a job to see its details.")'));
check("team view: no direct router.push to /orders", !teamBlock.includes("router.push(`/orders"));
check("team view: clicks go through openScheduleOrder with the assignee tooltip", (teamBlock.match(/openScheduleOrder\(order\)/g) || []).length >= 3 && teamBlock.includes("title={scheduleOrderTooltip(order)}"));
check("openScheduleOrder refuses other members' jobs", /const openScheduleOrder = \(order: ScheduleOrderItem\) => \{\s*if \(!canOpenScheduleOrder\(order\)\) return;/.test(schedule));
check("tooltip: Assigned to <name>", schedule.includes('return `${t("Assigned to")} ${name || t("Unassigned")}`;'));

// 4. Callable name = server export.
const nameMatch = firestore.match(/export const TEAM_SCHEDULE_CALLABLE = "(\w+)";/);
check("client callable constant", nameMatch?.[1] === "listTeamScheduleItems");
check("client loader uses the constant", firestore.includes("httpsCallable<Record<string, unknown>, { items?: TeamScheduleItemPayload[] }>(functions, TEAM_SCHEDULE_CALLABLE)"));
const serverIndex = process.env.TEAM_SCHEDULE_SERVER_INDEX || "";
const serverSource = serverIndex && fs.existsSync(serverIndex) ? fs.readFileSync(serverIndex, "utf8") : "";
check(`server index readable (${serverIndex || "TEAM_SCHEDULE_SERVER_INDEX unset"})`, Boolean(serverSource));
check("server exports the same callable", Boolean(nameMatch) && serverSource.includes(`exports.${nameMatch[1]} = onCall(`));
check("server defaults carry teamSchedule", /const WORKSPACE_MEMBER_ACCESS_DEFAULTS = Object\.freeze\(\{[\s\S]*?teamSchedule: true,/.test(serverSource));

if (failures.length) {
  console.log(`check-team-schedule-key: ${failures.length} of ${checks} FAILED`);
  for (const f of failures) console.log("FAIL", f);
  process.exit(1);
}
console.log(`check-team-schedule-key: ${checks}/${checks} passed (option ×12 languages, nav mapping, no fetch when off, callable name = server: ${serverIndex})`);

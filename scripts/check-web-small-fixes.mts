// Web small fixes (17 Oct 2026) — one check per fix, against the shipped text.
//
// 1. Team seats: the allowance is the server's effectiveTeamSeatLimit (Team = min(10, 5 + active extra
//    seats)), never the stored billingTeamMemberLimit that plan webhooks reset to 5; Settings ▸ Team
//    Access shows seats in use, included, extra and total as four separate numbers; /team says the same.
// 2. Permission matrix ▸ Delete orders follows canDeleteOrRestoreOrders / canRequestOrderDeletionApproval:
//    the owner-approval scope reads "Needs owner approval", Orders off reads "—".
// 3. Public pricing cards: every plan.* / pricing.* / cta.choose* key has a cell in all eleven
//    non-English languages, and the older-sentence cells (plan.lite.note, the shifted bullets) are replaced.
// 4. N14: the phone order header condenses once scrolled past and opens again at the top (hysteresis).
// 5. N15: the phone Schedule / Team Schedule keeps New Project, and each agenda card has its own
//    Calendar File button (a sibling of the card, never inside it).
//
//   npx tsx scripts/check-web-small-fixes.mts
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};

// ---------------------------------------------------------------- 1. seats
const seats = await import(pathToFileURL(path.join(root, "lib/studioflow/teamSeats.ts")).href);
const plans = await import(pathToFileURL(path.join(root, "lib/studioflow/plans.ts")).href);
ok("TEAM_INCLUDED_SEATS is the plan's includedTeamSeats (5)", seats.TEAM_INCLUDED_SEATS === 5 && plans.PLAN_ENTITLEMENTS.team_monthly.includedTeamSeats === 5);
ok("TEAM_SELF_SERVICE_MAX_SEATS is the plan's selfServiceMaxTeamSeats (10)", seats.TEAM_SELF_SERVICE_MAX_SEATS === 10 && plans.PLAN_ENTITLEMENTS.team_monthly.selfServiceMaxTeamSeats === 10);
const EXTRA: Array<[unknown, unknown, number]> = [
  [3, "active", 3], ["3", "active", 3], [3, "trialing", 3], [3, "past_due", 3], [3, " Active ", 3],
  [3, "canceled", 0], [3, "incomplete", 0], [3, "", 0], [3, undefined, 0], [0, "active", 0], [-2, "active", 0],
  [2.9, "active", 2], [9, "active", 5], ["x", "active", 0], [undefined, "active", 0]
];
for (const [quantity, status, want] of EXTRA) {
  ok(`activeAdditionalTeamSeats(${JSON.stringify(quantity)}, ${JSON.stringify(status)}) === ${want}`, seats.activeAdditionalTeamSeats(quantity, status) === want);
}
const ALLOW: Array<[string, number, number, { included: number; extra: number; total: number }]> = [
  ["team_monthly", 5, 3, { included: 5, extra: 3, total: 8 }],   // the reported workspace: 8 people, "8 / 5"
  ["team_monthly", 5, 0, { included: 5, extra: 0, total: 5 }],
  ["team_monthly", 5, 5, { included: 5, extra: 5, total: 10 }],
  ["team_monthly", 5, 9, { included: 5, extra: 5, total: 10 }],
  ["pro_monthly", 1, 3, { included: 1, extra: 0, total: 1 }],     // bought seats count on Team only
  ["demo", 1, 0, { included: 1, extra: 0, total: 1 }],
  ["lifetime_lite", 0, 0, { included: 1, extra: 0, total: 1 }]
];
for (const [plan, planLimit, extra, want] of ALLOW) {
  const got = seats.teamSeatAllowance(plan, planLimit, extra);
  ok(`teamSeatAllowance(${plan}, ${planLimit}, ${extra}) === ${JSON.stringify(want)} (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));
}
ok("teamSeatsAvailable(8, 8) === 0", seats.teamSeatsAvailable(8, 8) === 0);
ok("teamSeatsAvailable(9, 8) === 0 (never negative)", seats.teamSeatsAvailable(9, 8) === 0);
ok("teamSeatsAvailable(5, 8) === 3", seats.teamSeatsAvailable(5, 8) === 3);

const firestore = read("lib/studioflow/firestore.ts");
ok("workspace billingTeamMemberLimit is the server's allowance (seatAllowance.total)", /billingTeamMemberLimit: seatAllowance\.total,/.test(firestore));
ok("workspace carries teamSeatsIncluded / teamSeatsExtra", /teamSeatsIncluded: seatAllowance\.included,/.test(firestore) && /teamSeatsExtra: seatAllowance\.extra,/.test(firestore));
ok("the allowance reads the bought-seat fields", /activeAdditionalTeamSeats\(companyData\.billingAdditionalTeamSeatQuantity, companyData\.billingAdditionalTeamSeatStatus\)/.test(firestore));
ok("the stored billingTeamMemberLimit field is not read for the workspace any more", !/numberValue\(companyData\.billingTeamMemberLimit/.test(firestore));
for (const rel of ["app/settings/page.tsx", "app/team/page.tsx", "app/plan/page.tsx"]) {
  ok(`${rel} does not read the stored seat field`, !/companyData\.billingTeamMemberLimit/.test(read(rel)));
}
const settings = read("app/settings/page.tsx");
ok("Settings counts seats in use without suspended members", /const seatsUsed = members\.filter\(member => !member\.suspended\)\.length;/.test(settings));
ok("Settings header chip and metric use seatsUsed", /String\(seatsUsed\)\)\.replace\("\{limit\}", String\(seatLimit\)\)/.test(settings) && /\{seatsUsed\} <span className="settings-metric-of">\/ \{seatLimit\}<\/span>/.test(settings));
for (const label of ["Seats in use", "Included in plan", "Extra seats", "Total seats"]) {
  ok(`Settings seat breakdown has "${label}"`, settings.includes(`<dt>{t("${label}")}</dt>`));
}
const teamPage = read("app/team/page.tsx");
ok("/team names included + extra when seats were bought", /\$\{teamSeatsIncluded\} \$\{t\("included"\)\} \+ \$\{teamSeatsExtra\} \$\{t\("extra"\)\}/.test(teamPage));

// ---------------------------------------------------------------- 2. permission matrix ▸ Delete orders
function sliceFunction(source: string, name: string) {
  const start = source.search(new RegExp(`^(export )?function ${name}\\(`, "m"));
  if (start < 0) return null;
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end + 3);
}
const transpile = (source: string) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
}).outputText;
const pieces: string[] = [];
for (const name of ["normalizeWorkspaceRole", "workspaceAccessAllows", "requiresAssignedToSelfFilter", "roleCanDeleteOrders", "canDeleteOrRestoreOrders", "canRequestOrderDeletionApproval", "orderDeletionAccess"]) {
  const text = sliceFunction(firestore, name);
  ok(`firestore.ts defines ${name}`, Boolean(text));
  if (text) pieces.push(text.replace(/^function /, "export function "));
}
const matrixFn = sliceFunction(settings, "baseRoleMatrixAccess");
ok("settings page defines baseRoleMatrixAccess", Boolean(matrixFn));
if (matrixFn) pieces.push(matrixFn.replace(/^function /, "export function "));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "web-small-fixes-"));
const prelude = "const WORKSPACE_MEMBER_ACCESS_DEFAULTS = { orders: true, dashboard: true, financialInfo: true, customers: true, teamAccess: true, assignedProjectsOnly: false, manageProjectAssignments: false, bankFeed: false };\n";
fs.writeFileSync(path.join(tmp, "slices.mjs"), prelude + transpile(pieces.join("\n")));
const M = await import(pathToFileURL(path.join(tmp, "slices.mjs")).href);
// What the matrix cell must say, column by column (base columns use baseRoleMatrixAccess; custom roles their own map).
const DEFAULTS = { orders: true, assignedProjectsOnly: false, manageProjectAssignments: false };
const COLUMNS: Array<[string, string, Record<string, unknown> | null, string]> = [
  ["Owner", "owner", null, "allowed"],
  ["Member", "member", null, "allowed"],
  ["View Only", "viewer", null, "none"],
  ["Workflow Only (Orders off by default)", "workflow", null, "none"],
  ["custom: Assigned Projects Only, Change Project Assignments off", "member", { ...DEFAULTS, assignedProjectsOnly: true }, "ownerApproval"],
  ["custom: Assigned Projects Only + Change Project Assignments", "member", { ...DEFAULTS, assignedProjectsOnly: true, manageProjectAssignments: true }, "allowed"],
  ["custom: Assigned Projects Only, Orders off", "member", { ...DEFAULTS, assignedProjectsOnly: true, orders: false }, "none"],
  ["custom on Workflow, Orders on", "workflow", { ...DEFAULTS, assignedProjectsOnly: true }, "ownerApproval"],
  ["custom member, Orders off", "member", { ...DEFAULTS, orders: false }, "none"]
];
if (M.orderDeletionAccess && M.baseRoleMatrixAccess) {
  for (const [label, baseRole, custom, want] of COLUMNS) {
    const access = custom ?? M.baseRoleMatrixAccess(baseRole);
    const got = M.orderDeletionAccess({ role: baseRole, memberAccess: access });
    ok(`matrix Delete orders for ${label} = ${want} (got ${got})`, got === want);
    // The cell agrees with the two helpers every delete control reads.
    const del = M.canDeleteOrRestoreOrders({ role: baseRole, memberAccess: access });
    const req = M.canRequestOrderDeletionApproval({ role: baseRole, memberAccess: access });
    ok(`matrix Delete orders for ${label} agrees with the helpers`, got === (del ? "allowed" : req ? "ownerApproval" : "none"));
  }
}
ok("the Delete orders row reads orderDeletionAccess, not the base role", /key: "deleteOrders",[\s\S]{0,200}orderDeletionAccess\(\{ role: column\.baseRole, memberAccess: column\.access \}\)/.test(settings)
  && !/canDeleteOrdersForRole\(column\.baseRole\)/.test(settings));
ok("the matrix renders the approval cell as text, with a legend", /cell === "ownerApproval"[\s\S]{0,200}t\("Needs owner approval"\)/.test(settings) && /data-testid="matrix-owner-approval-legend"/.test(settings));

// ---------------------------------------------------------------- translations (app strings)
const language = await import(pathToFileURL(path.join(root, "lib/studioflow/language.ts")).href);
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const NEW_STRINGS = ["Seats in use", "Included in plan", "Extra seats", "Total seats", "extra", "Needs owner approval",
  "the member sends a deletion request and the owner deletes the order.",
  "Calendar File: use the calendar button on a project to add it to your calendar.", "included", "in total", "Limit", "Calendar File", "New Project"];
for (const text of NEW_STRINGS) {
  for (const lang of LANGS) {
    // A cell of its own ("Limit" is "Limit" in German), and what studioT returns is that cell.
    const cell = language.studioTranslationRow(text)?.[lang];
    const got = language.studioT(text, lang);
    ok(`studioT(${JSON.stringify(text)}, ${lang}) has its own cell (got ${JSON.stringify(got)})`, typeof cell === "string" && cell.length > 0 && got === cell);
  }
}

// ---------------------------------------------------------------- 3. public pricing cards
const site = await import(pathToFileURL(path.join(root, "lib/publicSite/translations.ts")).href);
const EN = site.PUBLIC_SITE_EN as Record<string, string>;
const TABLE = site.PUBLIC_SITE_TRANSLATIONS as Record<string, Record<string, string>>;
// The cards' own copy: plan.*, and the buttons and price words they print (cta.choose*, pricing.*).
const planKeys = Object.keys(EN).filter(key => key.startsWith("plan.") || key.startsWith("pricing.") || key.startsWith("cta.choose"));
ok("there are plan/pricing card keys", planKeys.length >= 70);
for (const lang of LANGS) {
  const missing = planKeys.filter(key => typeof TABLE[lang]?.[key] !== "string" || !TABLE[lang][key]);
  ok(`${lang}: every plan.* / pricing.* / cta.choose* key has a cell (missing: ${missing.join(", ")})`, missing.length === 0);
}
const LITE_NOTE: Record<string, string> = {
  "Türkçe": "Temel ihtiyaçları olan solo stüdyolar için.",
  "Deutsch": "Für Solo-Studios, die das Wesentliche brauchen.",
  "Français": "Pour les studios solo qui ont besoin de l'essentiel.",
  "Italiano": "Per gli studi singoli che hanno bisogno dell'essenziale.",
  "Español (Spanish)": "Para estudios en solitario que necesitan lo esencial.",
  "Português": "Para estúdios individuais que precisam do essencial.",
  "Русский (Russian)": "Для одиночных студий, которым нужно самое необходимое.",
  "日本語 (Japanese)": "基本機能が必要なソロスタジオ向け。",
  "中文 (Chinese)": "适合需要基础功能的单人工作室。",
  "العربية (Arabic)": "للاستوديوهات الفردية التي تحتاج إلى الأساسيات.",
  "हिन्दी (Hindi)": "उन एकल स्टूडियो के लिए जिन्हें ज़रूरी सुविधाएँ चाहिए।"
};
ok("English plan.lite.note is the essentials sentence", EN["plan.lite.note"] === "For solo studios that need the essentials.");
for (const lang of LANGS) ok(`${lang}: plan.lite.note is the current sentence (Android 773fd120)`, TABLE[lang]["plan.lite.note"] === LITE_NOTE[lang]);
// The older batch's shifted cells: none of these may survive.
const STALE: Array<[string, string, string]> = [
  ["Deutsch", "plan.demo.bullet3", "ChatGPT-App enthalten · keine Kundendateien"],
  ["Deutsch", "plan.team.bullet2", "Plätze für je £5/Monat hinzufügen"],
  ["Français", "plan.lite.bullet3", "App ChatGPT incluse · pas de Fichiers clients"],
  ["日本語 (Japanese)", "plan.team.bullet3", "最大10ユーザーまでセルフサービス"],
  ["العربية (Arabic)", "plan.team.bullet2", "أضف مقاعد بسعر £5/شهر لكل مقعد"]
];
for (const [lang, key, old] of STALE) ok(`${lang} ${key} is no longer the older batch's "${old}"`, TABLE[lang][key] !== old);
for (const lang of LANGS.filter(l => l !== "Türkçe")) {
  for (const key of ["plan.demo.bullet3", "plan.lite.bullet3", "plan.team.bullet2", "plan.team.bullet3"]) {
    ok(`${lang} ${key} names no price and no ChatGPT (it is not that bullet)`, !/£|ChatGPT/.test(TABLE[lang][key]));
  }
}

// ---------------------------------------------------------------- 4. N14
const condensed = await import(pathToFileURL(path.join(root, "lib/studioflow/useCondensedHeader.ts")).href);
const N14: Array<[boolean, number, number, boolean]> = [
  [false, 0, 286, false], [false, 310, 286, false], [false, 311, 286, true],
  [true, 120, 286, true], [true, 8, 286, true], [true, 7, 286, false], [true, 0, 286, false]
];
for (const [state, top, height, want] of N14) {
  ok(`nextCondensedState(${state}, ${top}, ${height}) === ${want}`, condensed.nextCondensedState(state, top, height) === want);
}
ok("condensing is phones only", condensed.CONDENSED_HEADER_QUERY === "(max-width: 640px)");
const detail = read("app/orders/OrderDetailContent.tsx");
ok("the order header carries the condensed class from useCondensedHeader", /useCondensedHeader\(orderHeadRef\)/.test(detail) && /ref=\{orderHeadRef\} className=\{orderHeadCondensed \? "order-detail-head is-condensed" : "order-detail-head"\}/.test(detail));
const css = read("app/globals.css");
const n14 = css.indexOf("/* ==== Order detail on phones: the sticky header condenses");
ok("globals.css (app/) has the condensed header block inside the 640 px query", n14 > 0 && /@media \(max-width: 640px\) \{\s*\.order-detail-head\.is-condensed \.order-detail-toolbar/.test(css.slice(n14)));

// ---------------------------------------------------------------- 5. N15
const schedule = read("app/schedule/page.tsx");
ok("all three phone agenda lists go through renderAgendaRow", (schedule.match(/renderAgendaRow\(order,/g) || []).length === 3);
const rowFn = schedule.slice(schedule.indexOf("function renderAgendaRow("), schedule.indexOf("function renderAgendaRow(") + 1200);
ok("the calendar button is a sibling of the card, with the project's name in its label", /\{card\}\s*<button[\s\S]*?className="schedule-agenda-calendar"[\s\S]*?aria-label=\{`\$\{t\("Calendar File"\)\}: \$\{title\}`\}/.test(rowFn));
ok("the calendar button downloads that card's order", /onClick=\{\(\) => downloadCalendarFileFor\(order\)\}/.test(rowFn));
ok("Open Order and the header Calendar File are the selection actions", (schedule.match(/schedule-header-selection-action/g) || []).length === 2);
const n15 = css.indexOf("/* ==== Schedule / Team Schedule on phones (review N15");
const oldHide = css.search(/\.schedule-header-actions \{\s*display: none;\s*\}/);
ok("the old phone rule that hid every header action is overridden later in the file", oldHide > 0 && n15 > oldHide && /@media \(max-width: 640px\) \{\s*\.schedule-header-actions \{\s*display: flex;/.test(css.slice(n15)));
ok("Team Schedule hides the selection actions where its agenda shows (900 px)", /@media \(max-width: 900px\) \{\s*\.schedule-main-pane\.is-team \.schedule-header-selection-action \{ display: none; \}/.test(css.slice(n15)));

if (failures.length) {
  console.error(`check-web-small-fixes: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`check-web-small-fixes: ${checks}/${checks} checks passed — seats, Delete orders matrix, plan translations, N14, N15`);

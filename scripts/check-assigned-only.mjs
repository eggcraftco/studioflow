// "Assigned projects only" rule (owner, 8 Oct 2026).
//
// A member whose effective access is "Assigned projects only" — the Workflow
// role, or a custom role with assignedProjectsOnly and without
// manageProjectAssignments — (1) never sees or uses a project-creation entry
// and (2) cannot change the created date (paymentDate) or the due setting
// (deliveryTime / due date) in the Timeline & Delivery card.
//
// 1. The pure helpers in lib/studioflow/firestore.ts return the right verdict
//    for owner / member / workflow / custom assigned-only / assigned-only with
//    manageProjectAssignments (run from the real source text, not a copy).
// 2. Every creation entry point references canCreateOrders (grep pins).
// 3. The two date fields (three rows: Delivery Time, Delivery Due, Created
//    Date) and the details write are gated by canEditOrderDates; the edit
//    modal and the Schedule drag too.
// 4. The server's two reasons map to sentences, translated in all 11
//    non-English languages through the real studioT (deep merge).
//
//   node scripts/check-assigned-only.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const ok = (name, condition) => {
  checks += 1;
  if (!condition) failures.push(name);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "assigned-only-"));
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;

// 1. Helpers, sliced out of firestore.ts by name so the verdicts come from the
//    shipped text (the module itself boots Firebase and cannot be imported here).
const firestore = read("lib/studioflow/firestore.ts");
function sliceFunction(name) {
  const start = firestore.search(new RegExp(`^(export )?function ${name}\\(`, "m"));
  if (start < 0) return null;
  const end = firestore.indexOf("\n}\n", start);
  return firestore.slice(start, end + 3);
}
const helperNames = ["normalizeWorkspaceRole", "requiresAssignedToSelfFilter", "roleCanCreateOrders", "canCreateOrders", "canEditOrderDates"];
const parts = helperNames.map((name) => [name, sliceFunction(name)]);
for (const [name, text] of parts) ok(`firestore.ts defines ${name}`, Boolean(text));
const constants = [...firestore.matchAll(/^export const (ASSIGNED_ONLY_CANNOT_\w+_MESSAGE) = (".*");$/gm)].map((m) => `export const ${m[1]} = ${m[2]};`);
ok("both ASSIGNED_ONLY_* messages are exported", constants.length === 2);
const helperSource = parts.map(([, text]) => (text || "").replace(/^function /m, "export function ")).join("\n") + "\n" + constants.join("\n") + "\n";
fs.writeFileSync(path.join(tmp, "helpers.mjs"), transpile(helperSource));
const helpers = await import(pathToFileURL(path.join(tmp, "helpers.mjs")).href);

const access = (overrides = {}) => ({ assignedProjectsOnly: false, manageProjectAssignments: false, orders: true, ...overrides });
const cases = [
  ["owner", { role: "owner", memberAccess: access() }, { create: true, dates: true }],
  ["admin", { role: "admin", memberAccess: access() }, { create: true, dates: true }],
  ["member", { role: "member", memberAccess: access() }, { create: true, dates: true }],
  ["viewer", { role: "viewer", memberAccess: access() }, { create: false, dates: true }],
  ["workflow", { role: "workflow", memberAccess: access() }, { create: false, dates: false }],
  ["Workflow Only (raw label)", { role: "Workflow Only", memberAccess: access() }, { create: false, dates: false }],
  ["workflow with manageProjectAssignments stored true", { role: "workflow", memberAccess: access({ assignedProjectsOnly: true, manageProjectAssignments: true }) }, { create: false, dates: false }],
  ["custom assigned-only", { role: "member", memberAccess: access({ assignedProjectsOnly: true }) }, { create: false, dates: false }],
  ["custom assigned-only (custom role id)", { role: "custom:abc123", memberAccess: access({ assignedProjectsOnly: true }) }, { create: false, dates: false }],
  ["assigned-only with manageProjectAssignments", { role: "member", memberAccess: access({ assignedProjectsOnly: true, manageProjectAssignments: true }) }, { create: true, dates: true }],
  ["owner with assignedProjectsOnly stored true", { role: "owner", memberAccess: access({ assignedProjectsOnly: true }) }, { create: false, dates: false }],
  ["null workspace", null, { create: false, dates: false }],
  ["undefined workspace", undefined, { create: false, dates: false }],
];
for (const [label, workspace, want] of cases) {
  ok(`canCreateOrders(${label}) === ${want.create}`, helpers.canCreateOrders(workspace) === want.create);
  ok(`canEditOrderDates(${label}) === ${want.dates}`, helpers.canEditOrderDates(workspace) === want.dates);
}
ok("requiresAssignedToSelfFilter(workflow) is true", helpers.requiresAssignedToSelfFilter({ role: "workflow", memberAccess: access() }) === true);
ok("requiresAssignedToSelfFilter(member) is false", helpers.requiresAssignedToSelfFilter({ role: "member", memberAccess: access() }) === false);
ok("canCreateOrders implies canEditOrderDates for every case", cases.every(([, w]) => !helpers.canCreateOrders(w) || helpers.canEditOrderDates(w)));

// The role-only gate in orders.ts delegates, so the two lists cannot drift.
const orders = read("lib/studioflow/orders.ts");
ok("orders.ts canCreateOrdersForRole delegates to roleCanCreateOrders", /export function canCreateOrdersForRole\(role: string\) \{\n  return roleCanCreateOrders\(role\);\n\}/.test(orders));
ok("createOrderFromWeb reads canCreateOrders(workspace)", orders.includes('"createWebOrder");') && (orders.match(/if \(!canCreateOrders\(workspace\)\) \{/g) || []).length >= 2);
ok("createOrderFromWeb no longer gates on role alone", !orders.includes("if (!canCreateOrdersForRole(workspace.role)) {"));
ok("orders.ts maps assigned_only_cannot_create", orders.includes("/assigned_only_cannot_create/i.test(message)) return ASSIGNED_ONLY_CANNOT_CREATE_MESSAGE"));
ok("orders.ts maps assigned_only_cannot_change_dates", orders.includes("/assigned_only_cannot_change_dates/i.test(message)) return ASSIGNED_ONLY_CANNOT_CHANGE_DATES_MESSAGE"));

// 2. Creation entry points (grep pins, one per surface).
const shell = read("components/AppShell.tsx");
ok("AppShell toolbar \"+ Add Project\" gate reads canCreateOrders(workspace)", /const canCreateToolbarOrder = Boolean\([\s\S]*?canCreateOrders\(workspace\)[\s\S]*?\);/.test(shell));
ok("AppShell toolbar button is rendered only behind canCreateToolbarOrder", shell.includes("{canCreateToolbarOrder ? (\n                <button\n                  ref={addProjectButtonRef}"));
ok("AppShell handleAddOrder (every quick-action funnel) refuses by canCreateOrders(workspace)", /function handleAddOrder\([\s\S]*?if \(!canCreateOrders\(workspace\)\) \{[\s\S]*?ASSIGNED_ONLY_CANNOT_CREATE_MESSAGE/.test(shell));
ok("AppShell no longer gates the toolbar by role alone", !shell.includes("canCreateOrdersForRole(workspace.role) &&"));
ok("AppShell Quick Create dialog opens only through handleAddOrder (setQuickCreateOpen(true) once)", (shell.match(/setQuickCreateOpen\(true\)/g) || []).length === 1);
const ordersPage = read("app/orders/page.tsx");
ok("Orders empty state gate reads canCreateOrders(workspace)", /const canCreateFirstOrder = Boolean\([\s\S]*?canCreateOrders\(workspace\)[\s\S]*?\);/.test(ordersPage));
ok("Orders held-orders Import banner is behind canCreateFirstOrder", ordersPage.includes("(heldOrders.heldCount ?? 0) > 0 && canCreateFirstOrder ? ("));
ok("Orders page does not import the role-only gate", !ordersPage.includes("canCreateOrdersForRole"));
const schedule = read("app/schedule/page.tsx");
ok("Schedule \"+ New Project\" gate reads canCreateOrders(workspace)", schedule.includes("canCreateScheduleOrder = Boolean(workspace && workspace.entitlements.features.orders_create && canCreateOrders(workspace))"));
ok("Schedule button is disabled by that gate", schedule.includes("disabled={!canCreateScheduleOrder}"));
const home = read("app/home/page.tsx");
ok("Home passes canCreateOrders(workspace) to the cards", home.includes("canCreateOrders: canCreateOrders(workspace),"));
const bodies = read("components/home/HomeCardBodies.tsx");
ok("Quick actions card drops \"New order\" when canCreateOrders is false", bodies.includes('canCreateOrders === false ? QUICK_ACTIONS.filter((action) => action.id !== "order") : QUICK_ACTIONS'));
ok("Quick actions card renders every size from the filtered list", (bodies.match(/quickActions\.(slice|filter)\(/g) || []).length === 3 && !/QUICK_ACTIONS\.slice\(|QUICK_ACTIONS\.filter\(\(action\) => action\.group/.test(bodies.slice(bodies.indexOf("export function QuickActionsCardBody"))));
// No other create surface: the quick-action event has exactly these raisers and one listener.
const raisers = ["app/home/page.tsx", "app/schedule/page.tsx", "app/orders/page.tsx"];
for (const rel of raisers) ok(`${rel} raises the order quick action (funnelled into handleAddOrder)`, read(rel).includes('dispatchQuickAction("order"'));
ok("AppShell is the only listener for the order quick action", shell.includes('useQuickActionEvent("order", (payload) => handleAddOrder(payload))'));
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const sources = [...walk(path.join(root, "app")), ...walk(path.join(root, "components")), ...walk(path.join(root, "lib"))];
const createCallers = sources.filter((f) => /\b(createOrderFromWeb|httpsCallable[^;]*"createWebOrder")\b/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(root, f));
ok(`createWebOrder is reached only through orders.ts and AppShell (got ${createCallers.join(", ")})`, createCallers.sort().join(",") === ["components/AppShell.tsx", "lib/studioflow/orders.ts"].join(","));

// 3. The two date fields.
const detail = read("app/orders/OrderDetailContent.tsx");
ok("order view reads canEditOrderDates(workspace)", detail.includes("const canEditDates = canEditOrderDates(workspace);"));
ok("Delivery Time row is read-only without canEditDates", detail.includes('disabled={!canEditWorkflowFields || !canEditDates}\n                saving={savingInlineField === "Delivery Time"}'));
ok("Delivery Due row is read-only without canEditDates", detail.includes('disabled={!canEditWorkflowFields || !canEditDates}\n                saving={savingInlineField === "Delivery Due"}'));
ok("Created Date row is read-only without canEditDates", detail.includes('disabled={!canEditOrderFully || !canEditDates}\n                saving={savingInlineField === "Created Date"}'));
ok("details write refuses a date patch without canEditDates", detail.includes("if (!canEditDates && (patch.paymentDate !== undefined || patch.deliveryTime !== undefined || patch.deliveryDueDate !== undefined)) {\n      setInlineError(ASSIGNED_ONLY_CANNOT_CHANGE_DATES_MESSAGE);"));
ok("edit modal due-date input is disabled without canEditOrderDates", detail.includes("disabled={saving || !canEditOrderDates(workspace)}"));
ok("edit modal strips deliveryDueDate from the payload without canEditOrderDates", detail.includes("...(canEditOrderDates(workspace) ? {} : { deliveryDueDate: undefined }),"));
ok("InlineValueRow keeps the lock styling for a disabled row", detail.includes('title={disabled ? "This field is read-only for your role." : "Click to edit"}') && detail.includes("disabled={disabled || saving}"));
ok("Schedule drag (paymentDate + deliveryTime) is gated by canEditOrderDates", schedule.includes("canEditSchedule = Boolean(workspace && canEditOrderStatusForRole(workspace.role) && canEditOrderDates(workspace))"));

// 4. Server reasons → translated sentences.
const friendly = read("lib/studioflow/friendlyError.ts");
ok("friendlyError maps assigned_only_cannot_create", friendly.includes('"assigned_only_cannot_create": "Members with access to assigned projects only cannot create projects."'));
ok("friendlyError maps assigned_only_cannot_change_dates", friendly.includes('"assigned_only_cannot_change_dates": "Members with access to assigned projects only cannot change the created date or the due date."'));
const compile = (rel, name) => fs.writeFileSync(path.join(tmp, `${name}.mjs`), transpile(read(rel)).replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"'));
const tables = ["language", ...new Set([...read("lib/studioflow/language.ts").matchAll(/from "\.\/(\w+)"/g)].map((m) => m[1]))];
for (const name of tables) if (fs.existsSync(path.join(root, `lib/studioflow/${name}.ts`))) compile(`lib/studioflow/${name}.ts`, name);
const { studioT, SUPPORTED_STUDIO_LANGUAGES } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
const languages = SUPPORTED_STUDIO_LANGUAGES.filter((l) => l !== "English");
ok(`11 non-English languages (got ${languages.length})`, languages.length === 11);
const sentences = [helpers.ASSIGNED_ONLY_CANNOT_CREATE_MESSAGE, helpers.ASSIGNED_ONLY_CANNOT_CHANGE_DATES_MESSAGE];
ok("friendlyError sentences equal the firestore.ts constants", sentences.every((s) => friendly.includes(JSON.stringify(s))));
for (const sentence of sentences) {
  for (const lang of languages) {
    const out = studioT(sentence, lang);
    ok(`"${sentence.slice(0, 40)}…" has a ${lang} translation`, out !== sentence && out.trim().length > 0);
  }
}

if (failures.length) {
  console.error(`FAIL ${failures.length}/${checks}`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`PASS ${checks} checks`);

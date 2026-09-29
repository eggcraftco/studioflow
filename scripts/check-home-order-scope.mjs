// Home for a member whose orders are the ones assigned to them (29 Sep 2026).
//
// Workflow Only members, and custom-role members with "Assigned Projects Only", may read only the
// orders assigned to them. The Orders list reads them that way (workspaceOrderQuery). Home did not:
// useHomeData asked loadDashboardCounts and loadDashboardFinanceOrders — and, for the Customers card,
// loadWorkspaceCustomers — for the WHOLE workspace's orders (`siparisler where companyId == ws`). The
// Firestore rules refuse that query to both roles, the orders Promise.all rejected, and every card that
// reads orders said "This could not be loaded."
//
// 1. lib/studioflow/firestore.ts, compiled with the tree's own TypeScript and run against a fake
//    Firestore that records every query: for each member shape, the queries the three loaders issue when
//    Home calls them. Each query is judged by a model of the live rules' list decision (below). Owner,
//    Member, View Only and a member with Orders off must issue exactly the queries they issued before.
// 2. The Home screen passes the workspace and the uid to the three loaders, and marks its scope
//    (data-home-order-scope) — read from the source.
//
// The model of the rules (firestore.rules, match /siparisler and /companies/{c}/workflowOrders):
//   siparisler, a query  — Workflow Only: always refused (usesWorkflowSafeView);
//                          Assigned Projects Only: allowed only with assignedToUid == uid (canReadOrderDocument);
//                          everybody else: allowed with companyId == ws.
//   workflowOrders       — Workflow Only only, and only with assignedToUid == uid.
//   musteriler           — any member of the workspace, with companyId == ws.
// The screen acceptance runs the real rules; this check is the fast, deterministic half.
//
//   node scripts/check-home-order-scope.mjs
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "home-order-scope-check-"));

// ---- the fakes the compiled module imports instead of Firebase
const FAKES = {
  "firebase/firestore": `
    export const recorded = [];
    const shape = (base, constraints = []) => ({ path: base.path, filters: constraints.filter(c => c.type === "where").map(c => [c.field, c.op, c.value]), limit: constraints.find(c => c.type === "limit")?.n ?? null });
    export function collection(_db, ...segments) { return { kind: "collection", path: segments.join("/") }; }
    export function doc(_db, ...segments) { return { kind: "doc", path: segments.join("/") }; }
    export function query(base, ...constraints) { return { kind: "query", path: base.path, constraints: [...(base.constraints || []), ...constraints] }; }
    export function where(field, op, value) { return { type: "where", field, op, value }; }
    export function limit(n) { return { type: "limit", n }; }
    export function orderBy(field, dir) { return { type: "orderBy", field, dir }; }
    const snap = (docs = []) => ({ docs, size: docs.length, empty: docs.length === 0, forEach: (f) => docs.forEach(f) });
    export async function getDocs(q) { recorded.push({ op: "getDocs", ...shape(q, q.constraints || []) }); return snap(); }
    export async function getCountFromServer(q) { recorded.push({ op: "count", ...shape(q, q.constraints || []) }); return { data: () => ({ count: 0 }) }; }
    export async function getDoc(ref) { recorded.push({ op: "getDoc", path: ref.path, filters: [], limit: null }); return { exists: () => false, data: () => ({}), id: ref.path.split("/").pop() }; }
    export function onSnapshot() { return () => {}; }
    export function serverTimestamp() { return { serverTimestamp: true }; }
    export async function setDoc() {} export async function updateDoc() {} export async function deleteDoc() {} export async function addDoc() { return { id: "x" }; }
    export function writeBatch() { return { set() {}, update() {}, delete() {}, async commit() {} }; }
    export async function runTransaction(_db, f) { return f({ get: getDoc, set() {}, update() {} }); }
    export function arrayUnion(...v) { return v; } export function arrayRemove(...v) { return v; } export function deleteField() { return null; } export function increment(n) { return n; }
    export class Timestamp { static fromDate(d) { return d; } static now() { return new Date(); } }
    export function documentId() { return "__name__"; } export function startAfter() { return { type: "startAfter" }; }
  `,
  "firebase/functions": `
    export const called = [];
    export function httpsCallable(_functions, name) { return async (data) => { called.push({ name, data }); return { data: { ok: true } }; }; }
  `,
  "@/lib/firebase/client": `export const auth = { currentUser: null }; export const db = {}; export const functions = {}; export const storage = {};`
};
for (const [name, source] of Object.entries(FAKES)) fs.writeFileSync(path.join(tmp, `${name.replace(/[^a-z]/gi, "_")}.mjs`), source);
const compile = (rel) => {
  const source = read(rel);
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  js = js.replace(/from "([^"]+)"/g, (whole, spec) => {
    if (FAKES[spec]) return `from "./${spec.replace(/[^a-z]/gi, "_")}.mjs"`;
    if (spec.startsWith("@/lib/studioflow/")) return `from "./${spec.slice("@/lib/studioflow/".length)}.mjs"`;
    return whole;
  });
  const out = path.join(tmp, `${path.basename(rel, ".ts")}.mjs`);
  fs.writeFileSync(out, js);
  // compile what it imports from lib/studioflow as well (none of those import anything further)
  for (const m of js.matchAll(/from "\.\/([A-Za-z]+)\.mjs"/g)) {
    const dep = `lib/studioflow/${m[1]}.ts`;
    if (!fs.existsSync(path.join(tmp, `${m[1]}.mjs`)) && fs.existsSync(path.join(root, dep))) compile(dep);
  }
  return out;
};
const F = await import(pathToFileURL(compile("lib/studioflow/firestore.ts")).href);
const FAKE_FS = await import(pathToFileURL(path.join(tmp, "firebase_firestore.mjs")).href);

// ---- the member shapes (WorkspaceContext as the web builds it: role + memberAccess)
const FULL = { orders: true, dashboard: true, schedule: true, customers: true, messages: true, notes: true, quickReply: true, settings: true, clientFiles: true, financialInfo: true, exportData: true, bankFeed: false, assignedProjectsOnly: false, manageProjectAssignments: false };
const WS = "ws-check";
const SHAPES = {
  owner: { role: "owner", memberAccess: { ...FULL, bankFeed: true } },
  member: { role: "member", memberAccess: FULL },
  viewer: { role: "viewer", memberAccess: FULL },
  noorders: { role: "member", memberAccess: { ...FULL, orders: false } },
  workflow: { role: "workflow", memberAccess: { ...FULL, dashboard: false, financialInfo: false, customers: false, assignedProjectsOnly: true } },
  assigned: { role: "member", memberAccess: { ...FULL, assignedProjectsOnly: true, manageProjectAssignments: false, financialInfo: false } },
  // "Assigned Projects Only" together with "Change Project Assignments" is NOT restricted (rules: isAssignedOnlyCustomMember)
  assignedManager: { role: "member", memberAccess: { ...FULL, assignedProjectsOnly: true, manageProjectAssignments: true } }
};
const UID = "uid-check";
const ctx = (shape) => ({ id: WS, name: "Check", ownerUid: "owner-uid", roleLabel: shape.role, ...shape });

function refusedByRules(shapeName, q) {
  const has = (field, value) => q.filters.some(([f, op, v]) => f === field && op === "==" && v === value);
  const restricted = shapeName === "workflow" || shapeName === "assigned";
  if (q.path === "siparisler") {
    if (shapeName === "workflow") return "siparisler is refused to Workflow Only";
    if (restricted && !has("assignedToUid", UID)) return "siparisler without assignedToUid == me";
    if (!has("companyId", WS)) return "siparisler without companyId == ws";
    return "";
  }
  if (q.path === `companies/${WS}/workflowOrders`) {
    return shapeName === "workflow" && has("assignedToUid", UID) ? "" : "workflowOrders outside Workflow Only's own";
  }
  if (q.path === "musteriler") return has("companyId", WS) ? "" : "musteriler without companyId == ws";
  return "";
}
async function queriesOf(loader, shapeName) {
  FAKE_FS.recorded.length = 0;
  let error = "";
  try { await loader(WS, ctx(SHAPES[shapeName]), UID); } catch (e) { error = String(e?.message || e); }
  return { error, queries: FAKE_FS.recorded.map((q) => ({ ...q })) };
}
const LOADERS = {
  loadDashboardCounts: F.loadDashboardCounts,
  loadDashboardFinanceOrders: F.loadDashboardFinanceOrders,
  loadWorkspaceCustomers: F.loadWorkspaceCustomers
};
// What each loader asked for on the live web (6a1458f0), for every shape: the whole workspace.
const WHOLE = {
  loadDashboardCounts: [
    { op: "count", path: "siparisler", filters: [["companyId", "==", WS]], limit: null },
    { op: "count", path: "musteriler", filters: [["companyId", "==", WS]], limit: null },
    { op: "getDocs", path: "siparisler", filters: [["companyId", "==", WS]], limit: 1000 }
  ],
  loadDashboardFinanceOrders: [{ op: "getDocs", path: "siparisler", filters: [["companyId", "==", WS]], limit: null }],
  loadWorkspaceCustomers: [
    { op: "getDocs", path: "musteriler", filters: [["companyId", "==", WS]], limit: null },
    { op: "getDocs", path: "siparisler", filters: [["companyId", "==", WS]], limit: null }
  ]
};
for (const [loaderName, loader] of Object.entries(LOADERS)) {
  if (typeof loader !== "function") { failures.push(`${loaderName} is not exported`); continue; }
  for (const shapeName of Object.keys(SHAPES)) {
    // Home never asks the customers loader for a member whose Customers area is off (Workflow Only).
    if (loaderName === "loadWorkspaceCustomers" && SHAPES[shapeName].memberAccess.customers === false) continue;
    const { error, queries } = await queriesOf(loader, shapeName);
    expect(`${loaderName} as ${shapeName}: runs`, error, "");
    const refused = queries.map((q) => refusedByRules(shapeName, q)).filter(Boolean);
    expect(`${loaderName} as ${shapeName}: every query it issues is one the rules allow`, refused, []);
    if (!["workflow", "assigned"].includes(shapeName)) {
      expect(`${loaderName} as ${shapeName}: the same queries as before (unchanged)`, queries, WHOLE[loaderName]);
    } else {
      const own = queries.filter((q) => q.path === "siparisler" || q.path.endsWith("/workflowOrders"));
      expect(`${loaderName} as ${shapeName}: reads orders, only its own`, own.length > 0 && own.every((q) => q.filters.some(([f, , v]) => f === "assignedToUid" && v === UID)), true);
    }
  }
}
// Without a workspace (Dashboard, Plan, Settings, the app shell): unchanged, whatever the role.
for (const [loaderName, loader] of Object.entries(LOADERS)) {
  if (typeof loader !== "function") continue;
  FAKE_FS.recorded.length = 0;
  await loader(WS);
  expect(`${loaderName}(companyId) alone: the same queries as before`, FAKE_FS.recorded.map((q) => ({ ...q })), WHOLE[loaderName]);
}
// Workflow Only reads no customers at all when Home counts (its Customers area is off).
{
  const { queries } = await queriesOf(F.loadDashboardCounts, "workflow");
  expect("loadDashboardCounts as workflow: no customer query (Customers off)", queries.filter((q) => q.path === "musteriler").length, 0);
}
expect("workspaceOrderScope is exported", typeof F.workspaceOrderScope, "function");
if (typeof F.workspaceOrderScope === "function") {
  for (const [shapeName, want] of [["owner", "workspace"], ["member", "workspace"], ["viewer", "workspace"], ["noorders", "workspace"],
    ["workflow", "assigned"], ["assigned", "assigned"], ["assignedManager", "workspace"]]) {
    expect(`workspaceOrderScope(${shapeName})`, F.workspaceOrderScope(ctx(SHAPES[shapeName])), want);
  }
}

// ---- 2. the Home screen calls them with the workspace and the uid, and marks its scope
const hook = read("lib/studioflow/useHomeData.ts");
for (const call of ["loadDashboardCounts(workspaceId, workspace, uid)", "loadDashboardFinanceOrders(workspaceId, workspace, uid)",
  "loadWorkspaceCustomers(workspaceId, workspace, uid)", "loadRecentOrders(workspaceId, workspace, uid)", "loadScheduleOrders(workspaceId, workspace, uid)"]) {
  expect(`useHomeData calls ${call}`, hook.includes(call), true);
}
expect("useHomeData no longer calls a loader with the workspace id alone", /load(DashboardCounts|DashboardFinanceOrders|WorkspaceCustomers)\(workspaceId\)/.test(hook), false);
expect("Home marks its order scope (data-home-order-scope)", read("app/home/page.tsx").includes("data-home-order-scope={data.orderScope}"), true);

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`Home order scope: ${failures.length} failure(s) of ${checks} checks`);
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`Home order scope: all ${checks} checks pass — Workflow Only and Assigned Projects Only read only their own orders on Home; Owner, Member, View Only and Orders-off issue the same queries as before`);

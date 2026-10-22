// Order delete controls offer only what the server accepts (15 Oct 2026).
//
// The server (deleteWebOrder, mergeOrders, and with the order-delete-auth package restoreWebOrder and
// purgeWebOrders) refuses a member in the owner-approval scope — the Workflow role, or "Assigned Projects
// Only" without "Change Project Assignments" (usesRestrictedAssignedProjectScope) — and everyone with the
// Orders key off. Such a member only asks the owner (requestWorkflowOrderDeletion), and only while their
// Orders key is on (canRequestApprovedOrderDeletion; Workflow orders contract, 9 Oct 2026).
//
// 1. The helpers in lib/studioflow/firestore.ts (sliced from the shipped text) give that verdict for every
//    member shape below.
// 2. The callable wrappers in lib/studioflow/orders.ts (sliced, run against a fake httpsCallable) reach
//    deleteWebOrder / mergeOrders / restoreWebOrder / purgeWebOrders / requestWorkflowOrderDeletion only
//    for the members the server accepts.
// 3. app/orders/page.tsx, read as a TypeScript syntax tree: the page's own canDeleteOrders /
//    canRequestOrderDeletion are evaluated per member, then every control whose onClick restores, purges,
//    deletes, merges or requests deletion is judged by the conditions that render it (a disabled button
//    still counts as shown). Restore / Delete permanently / Delete / Merge show only with delete rights;
//    the menu's Delete row shows only with delete rights or a request right, and reads "Request Deletion"
//    exactly for the latter.
// 4. The four handlers, run with recording stubs, call the server only for the members it accepts.
//
//   node scripts/check-order-delete-buttons.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const ok = (name, condition) => {
  checks += 1;
  if (!condition) failures.push(name);
};
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "order-delete-buttons-"));
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
}).outputText.replace(/^export \{\};?\s*$/m, "");

// ---- the server's rule, per member shape (what the screens must follow)
const FULL = { orders: true, financialInfo: true, assignedProjectsOnly: false, manageProjectAssignments: false };
const ACTORS = [
  ["owner", { role: "owner", memberAccess: FULL }, { del: true, req: false }],
  ["admin", { role: "admin", memberAccess: FULL }, { del: true, req: false }],
  ["member", { role: "member", memberAccess: FULL }, { del: true, req: false }],
  ["member, assigned only + Change Project Assignments", { role: "member", memberAccess: { ...FULL, assignedProjectsOnly: true, manageProjectAssignments: true } }, { del: true, req: false }],
  ["member, assigned only (owner approval)", { role: "member", memberAccess: { ...FULL, assignedProjectsOnly: true } }, { del: false, req: true }],
  ["custom role on admin, assigned only", { role: "admin", memberAccess: { ...FULL, assignedProjectsOnly: true } }, { del: false, req: true }],
  ["member, assigned only, Orders off", { role: "member", memberAccess: { ...FULL, assignedProjectsOnly: true, orders: false } }, { del: false, req: false }],
  ["Workflow, Orders off", { role: "workflow", memberAccess: { ...FULL, financialInfo: false, assignedProjectsOnly: true, orders: false } }, { del: false, req: false }],
  ["Workflow, Orders on", { role: "workflow", memberAccess: { ...FULL, financialInfo: false, assignedProjectsOnly: true, orders: true } }, { del: false, req: true }],
  ["Workflow Only (raw label), Orders on", { role: "Workflow Only", memberAccess: { ...FULL, financialInfo: false, assignedProjectsOnly: true } }, { del: false, req: true }],
  ["viewer", { role: "viewer", memberAccess: FULL }, { del: false, req: false }],
  ["member, Orders off", { role: "member", memberAccess: { ...FULL, orders: false } }, { del: false, req: false }],
];
const ctx = (shape) => ({ id: "ws-check", name: "Check", ownerUid: "owner-uid", roleLabel: shape.role, ...shape });

// ---- slices of the shipped modules
function sliceFunction(source, name) {
  const start = source.search(new RegExp(`^(export )?(async )?function ${name}\\(`, "m"));
  if (start < 0) return null;
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end + 3);
}
const firestore = read("lib/studioflow/firestore.ts");
const ordersLib = read("lib/studioflow/orders.ts");
const FIRESTORE_HELPERS = ["normalizeWorkspaceRole", "workspaceAccessAllows", "requiresAssignedToSelfFilter", "roleCanDeleteOrders", "canDeleteOrRestoreOrders", "canRequestOrderDeletionApproval"];
const ORDERS_FUNCTIONS = ["canDeleteOrdersForRole", "deleteOrderFromWeb", "purgeOrdersFromWeb", "restoreOrderFromWeb", "mergeOrders", "requestWorkflowOrderDeletionFromWeb"];
const pieces = [];
for (const name of FIRESTORE_HELPERS) {
  const text = sliceFunction(firestore, name);
  ok(`firestore.ts defines ${name}`, Boolean(text));
  if (text) pieces.push(text.replace(/^function /, "export function "));
}
for (const name of ORDERS_FUNCTIONS) {
  const text = sliceFunction(ordersLib, name);
  ok(`orders.ts defines ${name}`, Boolean(text));
  if (text) pieces.push(text.replace(/^(async )?function /, "export $1function "));
}
const prelude = `
export const reached = [];
const functions = {};
function httpsCallable(_functions, name) { return async () => { reached.push(name); return { data: { ok: true } }; }; }
async function withWebSyncStatus(operation) { return await operation(); }
function friendlyDeleteOrderError(error) { return error instanceof Error ? error.message : String(error); }
`;
fs.writeFileSync(path.join(tmp, "slices.mjs"), prelude + transpile(pieces.join("\n")));
const M = await import(pathToFileURL(path.join(tmp, "slices.mjs")).href);

// ---- 1. helper verdicts
if (M.canDeleteOrRestoreOrders && M.canRequestOrderDeletionApproval) {
  for (const [label, shape, want] of ACTORS) {
    ok(`canDeleteOrRestoreOrders(${label}) === ${want.del}`, M.canDeleteOrRestoreOrders(ctx(shape)) === want.del);
    ok(`canRequestOrderDeletionApproval(${label}) === ${want.req}`, M.canRequestOrderDeletionApproval(ctx(shape)) === want.req);
  }
  ok("canDeleteOrRestoreOrders(null) is false", M.canDeleteOrRestoreOrders(null) === false);
  ok("canRequestOrderDeletionApproval(null) is false", M.canRequestOrderDeletionApproval(null) === false);
  ok("the owner-approval scope is requiresAssignedToSelfFilter (the assigned-only rule's helper)",
    /export function canRequestOrderDeletionApproval\([^)]*\) \{[\s\S]*?requiresAssignedToSelfFilter\(workspace\)/.test(firestore)
    && /export function canDeleteOrRestoreOrders\([^)]*\) \{[\s\S]*?!requiresAssignedToSelfFilter\(workspace\)/.test(firestore));
}

// ---- 2. callable wrappers
const WRAPPERS = [
  ["deleteOrderFromWeb", "deleteWebOrder", "del", (w) => M.deleteOrderFromWeb(w, "o1")],
  ["purgeOrdersFromWeb", "purgeWebOrders", "del", (w) => M.purgeOrdersFromWeb(w, ["o1"])],
  ["restoreOrderFromWeb", "restoreWebOrder", "del", (w) => M.restoreOrderFromWeb(w, "o1")],
  ["mergeOrders", "mergeOrders", "del", (w) => M.mergeOrders(w, "o1", ["o2"])],
  ["requestWorkflowOrderDeletionFromWeb", "requestWorkflowOrderDeletion", "req", (w) => M.requestWorkflowOrderDeletionFromWeb(w, "o1")],
];
for (const [fn, callable, right, run] of WRAPPERS) {
  if (!M[fn]) continue;
  for (const [label, shape, want] of ACTORS) {
    M.reached.length = 0;
    try { await run(ctx(shape)); } catch { /* refused before the server: expected for the others */ }
    const got = M.reached.join(",");
    ok(`${fn}(${label}) ${want[right] ? "reaches" : "does not reach"} ${callable} (got "${got}")`, got === (want[right] ? callable : ""));
  }
}

// ---- 3. the Orders page, as a syntax tree
const pageSource = read("app/orders/page.tsx");
const sf = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let component = null;
sf.forEachChild((node) => {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "OrdersPage") component = node;
});
ok("app/orders/page.tsx defines OrdersPage", Boolean(component));
const expressionJs = (text) => transpile(`(${text});`).trim().replace(/;$/, "");
const UNSET = Symbol("unset");
function evaluate(text, scope, unknown = UNSET) {
  const proxy = new Proxy(scope, {
    has: (target, key) => key in target || (unknown !== UNSET && !(key in globalThis)),
    get: (target, key) => (key === Symbol.unscopables ? undefined : key in target ? target[key] : unknown)
  });
  return new Function("__scope", `with (__scope) { return (${expressionJs(text)}); }`)(proxy);
}
const helperScope = Object.fromEntries(Object.entries(M).filter(([, value]) => typeof value === "function"));

// The page's own gates, evaluated in source order per member.
const gateDeclarations = [];
const handlerDeclarations = new Map();
for (const statement of component?.body?.statements ?? []) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && ["canDeleteOrders", "canRequestOrderDeletion"].includes(declaration.name.text) && declaration.initializer) {
        gateDeclarations.push([declaration.name.text, declaration.initializer.getText()]);
      }
    }
  }
  if (ts.isFunctionDeclaration(statement) && statement.name) handlerDeclarations.set(statement.name.text, statement.getText());
}
ok("OrdersPage declares canDeleteOrders and canRequestOrderDeletion", gateDeclarations.length === 2);
ok("canDeleteOrders reads canDeleteOrRestoreOrders(workspace)", gateDeclarations.some(([name, text]) => name === "canDeleteOrders" && text === "canDeleteOrRestoreOrders(workspace)"));
ok("canRequestOrderDeletion reads canRequestOrderDeletionApproval(workspace)", gateDeclarations.some(([name, text]) => name === "canRequestOrderDeletion" && text === "canRequestOrderDeletionApproval(workspace)"));
ok("no inline copy of the scope rule is left on the page", !pageSource.includes("manageProjectAssignments !== true"));
ok("no inline copy of the scope rule is left in orders.ts", !ordersLib.includes("manageProjectAssignments !== true"));
function pageGates(shape) {
  const scope = { ...helperScope, workspace: shape ? ctx(shape) : null };
  for (const [name, text] of gateDeclarations) {
    try { scope[name] = Boolean(evaluate(text, scope)); } catch (error) { scope[name] = `error: ${error.message}`; }
  }
  return { canDeleteOrders: scope.canDeleteOrders, canRequestOrderDeletion: scope.canRequestOrderDeletion };
}

// Every control that restores, purges, deletes, merges or requests deletion, with the conditions that render it.
const ACTION = /\b(handleRestoreOrder|purgeSelectedOrders|deleteSelectedOrders|openMergeSelectedModal|deleteOrderFromMenu)\b/;
const controls = [];
function guardsOf(node) {
  const guards = [];
  let child = node;
  let parent = node.parent;
  while (parent && parent !== component) {
    if (ts.isConditionalExpression(parent)) {
      if (child === parent.whenTrue) guards.push(parent.condition.getText());
      else if (child === parent.whenFalse) guards.push(`!(${parent.condition.getText()})`);
    } else if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && child === parent.right) {
      guards.push(parent.left.getText());
    }
    child = parent;
    parent = parent.parent;
  }
  return guards;
}
function visit(node) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    const onClick = node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === "onClick");
    const handler = onClick?.initializer?.getText().match(ACTION)?.[1];
    if (handler) {
      const element = ts.isJsxOpeningElement(node) ? node.parent : node;
      let label = null;
      if (ts.isJsxElement(element)) {
        const labelExpression = element.children.find((c) => ts.isJsxExpression(c) && c.expression && /Request Deletion/.test(c.expression.getText()));
        if (labelExpression) label = labelExpression.expression.getText();
      }
      const kind = handler === "deleteOrderFromMenu" ? "deleteOrRequest" : handler === "handleRestoreOrder" ? "restore" : handler === "openMergeSelectedModal" ? "merge" : "purgeOrDelete";
      controls.push({ kind, handler, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, guards: guardsOf(element), label });
    }
  }
  ts.forEachChild(node, visit);
}
if (component) visit(component);
const count = (kind) => controls.filter((c) => c.kind === kind).length;
ok(`found the two Restore controls (got ${count("restore")})`, count("restore") === 2);
ok(`found the Delete permanently / Delete (n) controls (got ${count("purgeOrDelete")})`, count("purgeOrDelete") === 3);
ok(`found the two Merge controls (got ${count("merge")})`, count("merge") === 2);
ok(`found the one Delete / Request Deletion row (got ${count("deleteOrRequest")})`, count("deleteOrRequest") === 1);
ok("the Delete / Request Deletion row names its label from canRequestOrderDeletion", controls.some((c) => c.kind === "deleteOrRequest" && c.label));

function shown(control, gates) {
  // Shown if some screen state renders it: Trash or the live list, with a selection open.
  for (const inTrash of [true, false]) {
    const scope = {
      ...gates,
      inTrash,
      orderFilter: inTrash ? "trash" : "all",
      selectionActive: true,
      selectedOrderIds: new Set(["o1", "o2"]),
      contextOrderSelected: false,
      t: (text) => text
    };
    if (control.guards.every((guard) => Boolean(evaluate(guard, scope, true)))) return true;
  }
  return false;
}
for (const [label, shape, want] of ACTORS) {
  const gates = pageGates(shape);
  ok(`page canDeleteOrders(${label}) === ${want.del} (got ${gates.canDeleteOrders})`, gates.canDeleteOrders === want.del);
  ok(`page canRequestOrderDeletion(${label}) === ${want.req} (got ${gates.canRequestOrderDeletion})`, gates.canRequestOrderDeletion === want.req);
  for (const control of controls) {
    const wanted = control.kind === "deleteOrRequest" ? want.del || want.req : want.del;
    ok(`${control.handler} control at page.tsx:${control.line} is ${wanted ? "shown" : "not shown"} to ${label}`, shown(control, gates) === wanted);
    if (control.kind === "deleteOrRequest" && control.label && (want.del || want.req)) {
      const text = evaluate(control.label, { ...gates, t: (value) => value }, true);
      ok(`the row reads "${want.req ? "Request Deletion" : "Delete"}" for ${label} (got "${text}")`, text === (want.req ? "Request Deletion" : "Delete"));
    }
  }
}

// ---- 4. the handlers, with recording stubs
const HANDLERS = [
  ["handleRestoreOrder", (want) => (want.del ? "restore" : ""), "handleRestoreOrder(order)"],
  ["purgeSelectedOrders", (want) => (want.del ? "purge" : ""), "purgeSelectedOrders()"],
  ["deleteSelectedOrders", (want) => (want.del ? "delete" : ""), "deleteSelectedOrders()"],
  ["deleteOrderFromMenu", (want) => (want.req ? "request" : want.del ? "delete" : ""), "deleteOrderFromMenu(order)"],
];
for (const [name, expected, call] of HANDLERS) {
  const text = handlerDeclarations.get(name);
  ok(`OrdersPage defines ${name}`, Boolean(text));
  if (!text) continue;
  const js = transpile(text);
  for (const [label, shape, want] of ACTORS) {
    const calls = [];
    const order = { id: "o1", customerName: "Ann" };
    const scope = {
      ...helperScope,
      ...pageGates(shape),
      workspace: ctx(shape),
      user: { uid: "uid-check", email: "member@example.test" },
      order,
      orders: [order],
      deletedOrders: [order],
      selectedOrderIds: new Set(["o1"]),
      selectedOrderId: "o1",
      lastSelectedOrderIdRef: { current: null },
      window: { confirm: () => true, requestAnimationFrame: (f) => f() },
      t: (value) => value,
      displayOrderTitle: (value) => value || "Order",
      loadRecentOrders: async () => [],
      loadOrderListsWithTrash: async () => ({ orders: [], trashed: [] }),
      requestWorkflowOrderDeletionFromWeb: async () => { calls.push("request"); return {}; },
      deleteOrderFromWeb: async () => { calls.push("delete"); return {}; },
      purgeOrdersFromWeb: async () => { calls.push("purge"); return {}; },
      restoreOrderFromWeb: async () => { calls.push("restore"); return {}; }
    };
    const proxy = new Proxy(scope, {
      has: (target, key) => key in target || !(key in globalThis),
      get: (target, key) => (key === Symbol.unscopables ? undefined : key in target ? target[key] : () => undefined)
    });
    let error = "";
    try {
      await new Function("__scope", `with (__scope) { ${js}\n return ${call}; }`)(proxy);
    } catch (e) {
      error = String(e?.message || e);
    }
    const got = calls.join(",");
    ok(`${name} for ${label} calls "${expected(want)}" (got "${got}"${error ? `, threw ${error}` : ""})`, got === expected(want) && !error);
  }
}

// ---- the live marker: the list carries the decision
ok("the orders list marks the decision (data-order-delete-access)", pageSource.includes('data-order-delete-access={canDeleteOrders ? "delete" : canRequestOrderDeletion ? "request" : "none"}'));

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  for (const failure of failures) console.error("  - " + failure);
  console.error(`FAIL ${failures.length}/${checks} order delete control checks`);
  process.exit(1);
}
console.log(`PASS ${checks} order delete control checks — Restore, Delete permanently, Delete, Merge and Request Deletion follow the server`);

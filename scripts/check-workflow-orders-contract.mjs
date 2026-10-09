// Workflow orders contract (9 Oct 2026; server docs/workflow-orders-contract-2026-10-09.md).
// Source checks for the web half: the Workflow role does not grant Orders, a stored Orders value is
// what the member gets, the Workflow role keeps its assigned limited Orders list/detail and progress
// edits, its contact and notes cards stay shut, and export follows Orders. ROOT=<dir> runs it on another tree.
import fs from "fs";
import path from "path";
const root = process.env.ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fsrc = read("lib/studioflow/firestore.ts");
const defaults = (fsrc.match(/function defaultWorkspaceAccessForRole[\s\S]*?\n}\n/) || [""])[0];
const resolver = (fsrc.match(/function workspaceMemberAccess\([\s\S]*?\n}\n/) || [""])[0];
const settings = read("app/settings/page.tsx");
const matrix = (settings.match(/if \(baseRole === "workflow"\) \{[\s\S]*?\n  \}/) || [""])[0];
const checks = [
  ["role default: Workflow starts with Orders off", /access\.orders = false;/.test(defaults) && !/access\.orders = true;/.test(defaults)],
  ["resolver: Workflow Orders = stored root, then inline, else off", /merged\.orders = typeof rootAccess\.orders === "boolean"[\s\S]{0,140}: false;/.test(resolver) && !/merged\.orders = true/.test(resolver)],
  ["resolver: Workflow contact and notes cards shut", /merged\.cardCustomer = false;/.test(resolver) && /merged\.cardNotes = false;/.test(resolver)],
  ["lane helper: Workflow role keeps the limited Orders screens", /export function ordersScreenAllows\([\s\S]{0,200}workflowOrdersLaneOpen\(workspace\) \|\| workspaceAccessAllows\(workspace\?\.memberAccess, "orders"\)/.test(fsrc)],
  ["/orders list gate uses the lane helper", /if \(!ordersScreenAllows\(loadedWorkspace\)\)/.test(read("app/orders/page.tsx"))],
  ["/orders/[id] gate uses the lane helper", /if \(!ordersScreenAllows\(loadedWorkspace\)\)/.test(read("app/orders/[orderId]/page.tsx"))],
  ["sidebar keeps Orders for the Workflow role", /item\.href === "\/orders" && workflowOrdersLaneOpen\(workspace\)/.test(read("components/AppShell.tsx"))],
  ["detail: progress edits open for the Workflow lane", /\(canAccessOrders \|\| workflowOrdersLaneOpen\(workspace\)\) && canEditOrderStatusForRole/.test(read("app/orders/OrderDetailContent.tsx"))],
  ["production board still follows Orders", /if \(!workspaceAccessAllows\(context\.memberAccess, "orders"\)\)/.test(read("app/production/page.tsx"))],
  ["export needs Orders", /workspaceAccessAllows\(loadedWorkspace\.memberAccess, "orders"\)/.test(read("app/export/page.tsx"))],
  ["inventory page and nav need Orders too", /workspaceAccessAllows\(context\.memberAccess, "orders"\)/.test(read("app/inventory/page.tsx")) && /item\.href === "\/inventory" && !memberCanAccess\(workspace, "orders"\)/.test(read("components/AppShell.tsx"))],
  ["settings matrix shows Workflow Orders off, no contact/notes cards", /access\.orders = false;/.test(matrix) && /access\.cardCustomer = false;/.test(matrix) && /access\.cardNotes = false;/.test(matrix)]
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) failed += 1; }
console.log(`check-workflow-orders-contract: ${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);

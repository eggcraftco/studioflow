// Navigation delay (owner report, 14 Oct 2026): menu-to-menu waits on "Loading your workspace…", worst in a
// private window right after sign-in, gone after a reload. Every screen re-ran getDocs over all of the
// workspace's orders (and customers) on mount; with nothing listening, each click started the query again on the
// one watch stream — a full download whenever the browser had no current copy. The shell now keeps those two
// lists listening (keepWorkspaceListsListening), so a screen's identical getDocs joins a current target.
//
//   1. lib/studioflow/firestore.ts: the kept queries (all orders, all customers) are character-for-character the
//      loaders' own (same
//      canonical query = one shared target; a drift would silently bring the downloads back).
//   2. Scope: nothing for an assigned-scope / Workflow Only member; orders only with the Orders area, customers
//      only with the Customers area; a refused listen ends itself.
//   3. components/AppShell.tsx starts it once per workspace/access key and returns the stop.
//   4. With --emulator <host:port> (an isolated demo- Firestore emulator seeded with orders for --uid, default
//      nav-owner): the Firestore SDK itself — a getDocs on a query that is already listening answers without a
//      new download and much faster than the same getDocs with nothing listening. Control: a different query
//      (limit) is NOT served by the listening one.
//
//   node scripts/check-workspace-lists-warm.mjs [--root <dir>] [--emulator 127.0.0.1:8170 --project demo-… --uid …]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : ""; };
const root = arg("--root") ? path.resolve(arg("--root")) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const expect = (what, ok) => { checks++; if (!ok) failures.push(what); };

const fsSrc = fs.readFileSync(path.join(root, "lib/studioflow/firestore.ts"), "utf8");
const shellSrc = fs.readFileSync(path.join(root, "components/AppShell.tsx"), "utf8");

function body(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) return "";
  let depth = 0;
  for (let i = src.indexOf("{", start + signature.length - 1); i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  return "";
}

// 1. Same queries as the loaders.
const lists = body(fsSrc, "export function workspaceListQueries(");
const keep = body(fsSrc, "export function keepWorkspaceListsListening(");
expect("workspaceListQueries exists", lists.length > 0);
expect("keepWorkspaceListsListening exists", keep.length > 0);
const ORDERS = 'query(collection(db, "siparisler"), where("companyId", "==", companyId))';
const CUSTOMERS = 'query(collection(db, "musteriler"), where("companyId", "==", companyId))';
expect("kept orders query is the loaders' query", lists.includes(ORDERS));
expect("kept customers query is the loaders' query", lists.includes(CUSTOMERS));
expect("the counts' 1000-order sample is not kept (a second whole-list transfer at every sign-in)", !/limit\(/.test(lists));
expect("loadDashboardFinanceOrders reads the same orders query", body(fsSrc, "export async function loadDashboardFinanceOrders(").includes(ORDERS));
const customersLoader = body(fsSrc, "export async function loadWorkspaceCustomers(");
expect("loadWorkspaceCustomers reads the same orders query", customersLoader.includes(ORDERS));
expect("loadWorkspaceCustomers reads the same customers query", customersLoader.includes(CUSTOMERS));
expect("workspaceOrderQuery's workspace branch is the same query",
  body(fsSrc, "function workspaceOrderQuery(").includes('return query(workspaceOrderCollection(companyId, workspace), where("companyId", "==", companyId));')
  && body(fsSrc, "function workspaceOrderCollection(").includes(': collection(db, "siparisler")'));

// 2. Scope.
expect("assigned-scope members keep nothing", /usesAssignedOrderScope\(workspace, uid\)\s*\|\|\s*isWorkflowAssignedView\(workspace\)\)\s*return \[\]/.test(lists));
expect("orders only with the Orders area", /workspaceAccessAllows\(workspace\?\.memberAccess, "orders"\)\)\s*\{\s*lists\.push\(query\(collection\(db, "siparisler"\), where\("companyId", "==", companyId\)\)\);\s*\}/.test(lists));
expect("customers only with the Customers area", /workspaceAccessAllows\(workspace\?\.memberAccess, "customers"\)\)\s*\{\s*lists\.push\(query\(collection\(db, "musteriler"\)/.test(lists));
expect("a refused listen stops itself", /onSnapshot\(listQuery, \(\) => undefined, \(\) => \{\s*if \(stop\) stop\(\);/.test(keep));
expect("the returned stop ends every list", /return \(\) => stops\.forEach\(stop => stop\(\)\);/.test(keep));

// 3. Shell wiring.
expect("AppShell imports keepWorkspaceListsListening", /\bkeepWorkspaceListsListening,/.test(shellSrc));
expect("AppShell returns the stop from its effect", /return keepWorkspaceListsListening\(workspaceForLists\.current, workspaceListsUid\);\s*\}, \[workspaceListsKey, workspaceListsUid\]\);/.test(shellSrc));
expect("the key carries what decides the queries", /workspaceListsKey = workspace\s*\?\s*\[workspace\.id, workspace\.role, workspaceAccessAllows\(workspace\.memberAccess, "orders"\), workspaceAccessAllows\(workspace\.memberAccess, "customers"\), workspace\.memberAccess\?\.assignedProjectsOnly === true, workspace\.memberAccess\?\.manageProjectAssignments === true\]/.test(shellSrc));

// 4. The SDK premise, against an isolated emulator only.
const emulator = arg("--emulator");
if (emulator) {
  const [host, portText] = emulator.split(":");
  const port = Number(portText);
  const project = arg("--project") || "demo-nivadesk-nav14";
  const uid = arg("--uid") || "nav-owner";
  const PROTECTED = [8080, 9099, 5001, 9199, 4000, 4400, 8601, 9601, 5601];
  if (!project.startsWith("demo-") || PROTECTED.includes(port) || !["127.0.0.1", "localhost"].includes(host)) {
    console.error(`REFUSED: ${emulator} ${project} — demo- project on an unprotected local port only`);
    process.exit(2);
  }
  const req = (await import("module")).createRequire(path.join(root, "package.json"));
  const { initializeApp } = req("firebase/app");
  const fsdk = req("firebase/firestore");
  const run = async (label, warm, makeQuery) => {
    const app = initializeApp({ projectId: project, apiKey: "demo-key", appId: "1:0:web:check" }, `${label}-${Date.now()}`);
    const db = fsdk.initializeFirestore(app, {});
    fsdk.connectFirestoreEmulator(db, host, port, { mockUserToken: { user_id: uid } });
    const orders = fsdk.query(fsdk.collection(db, "siparisler"), fsdk.where("companyId", "==", uid));
    let stop = () => {};
    if (warm) await new Promise((resolve, reject) => { stop = fsdk.onSnapshot(orders, snap => { if (!snap.metadata.fromCache) resolve(); }, reject); });
    const t0 = performance.now();
    const snap = await fsdk.getDocs(makeQuery(fsdk, db, orders));
    const ms = performance.now() - t0;
    stop();
    await fsdk.terminate(db);
    return { ms, size: snap.size };
  };
  const same = (_f, _db, orders) => orders;
  const cold = await run("cold", false, same);
  const warm = await run("warm", true, same);
  const control = await run("control", true, (f, db) => f.query(f.collection(db, "siparisler"), f.where("companyId", "==", uid), f.limit(1000)));
  console.log(`emulator: getDocs(all orders) cold ${Math.round(cold.ms)} ms (${cold.size} docs) · while listening ${Math.round(warm.ms)} ms (${warm.size}) · control limit(1000) while listening ${Math.round(control.ms)} ms (${control.size})`);
  expect("the emulator holds orders for the check (seed first)", cold.size > 0);
  expect("a listening query serves the same getDocs: same result", warm.size === cold.size);
  expect("a listening query serves the same getDocs: at least 5x faster", warm.ms * 5 < cold.ms);
  expect("control: a different query is not served by it (it downloads)", control.ms > warm.ms * 3);
}

if (failures.length) {
  console.error(`check-workspace-lists-warm: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`check-workspace-lists-warm: ${checks}/${checks} checks passed${emulator ? " (incl. emulator)" : ""}`);

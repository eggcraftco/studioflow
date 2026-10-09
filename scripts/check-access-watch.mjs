// K2 (acceptance refresh 9 Oct 2026): an open tab drops what it read under an access the member no longer
// has. Measured on 7a934710: /orders kept four orders and their amounts after the owner switched Assigned
// Projects Only on, until a reload.
//   1. lib/studioflow/accessWatch.ts, compiled with the tree's own TypeScript: the fingerprint changes for
//      every access change of THIS member and for nothing else; only server snapshots count; a refusal
//      after a baseline reloads; the reload cap.
//   2. lib/auth/AuthProvider.tsx watches companies/{active} with metadata changes and reloads on the step.
//   3. Workflow Only's Orders entry follows memberAccess.<uid>.orders (the rule's memberAreaOpen).
//   4. A control: a wrong accessWatchStep (cache snapshots counted) must fail the vectors.
//
//   node scripts/check-access-watch.mjs [--root <dir>]
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "access-watch-"));

async function load(source, name) {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  const file = path.join(tmp, `${name}.mjs`);
  fs.writeFileSync(file, js);
  return import(pathToFileURL(file).href);
}

function vectors(m) {
  const failures = [];
  let checks = 0;
  const expect = (what, actual, wanted) => {
    checks++;
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${what}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
  };
  const fp = (data, uid = "m1") => m.memberAccessFingerprint(data, "ws", uid);
  const base = {
    ownerUid: "own", name: "Studio",
    members: { m1: { role: "member", displayName: "Mia", photoURL: "a" }, m2: { role: "member" } },
    memberAccess: { m1: { orders: true, customers: true, financialInfo: true }, m2: { orders: true } },
    customRoles: { custom_abcdef: { name: "Fitter", baseRole: "member", access: { orders: true } } }
  };
  const clone = () => JSON.parse(JSON.stringify(base));
  const b = fp(base);
  const changed = (what, mutate) => { const d = clone(); mutate(d); expect(`${what} changes the fingerprint`, fp(d) !== b, true); };
  const same = (what, mutate) => { const d = clone(); mutate(d); expect(`${what} leaves the fingerprint`, fp(d), b); };
  changed("Assigned Projects Only on", d => { d.memberAccess.m1.assignedProjectsOnly = true; });
  changed("role -> workflow", d => { d.members.m1.role = "workflow"; });
  changed("Orders off", d => { d.memberAccess.m1.orders = false; });
  changed("Customers off", d => { d.memberAccess.m1.customers = false; });
  changed("Financial Info off", d => { d.memberAccess.m1.financialInfo = false; });
  changed("a custom role assigned", d => { d.memberCustomRoles = { m1: "custom_abcdef" }; });
  changed("removed from the workspace", d => { delete d.members.m1; delete d.memberAccess.m1; });
  changed("suspended", d => { d.suspendedMembers = { m1: { reason: "manual" } }; });
  changed("inline access edited", d => { d.members.m1.access = { orders: false }; });
  same("another member's access", d => { d.memberAccess.m2.orders = false; });
  same("the member's display name / photo", d => { d.members.m1.displayName = "Mia R"; d.members.m1.photoURL = "b"; });
  same("the workspace name", d => { d.name = "Studio 2"; });
  same("key order in the access entry", d => { d.memberAccess.m1 = { financialInfo: true, customers: true, orders: true }; });
  {
    const d = clone(); d.memberCustomRoles = { m1: "custom_abcdef" };
    const before = fp(d); d.customRoles.custom_abcdef.access.orders = false;
    expect("the member's custom role edited changes it", fp(d) !== before, true);
    const e = clone(); e.memberCustomRoles = { m1: "custom_abcdef" };
    const before2 = fp(e); e.customRoles.custom_other = { name: "x", baseRole: "member", access: {} };
    expect("another custom role edited leaves it", fp(e), before2);
  }
  expect("the owner is constant", fp(base, "own"), "owner");
  expect("the personal workspace (uid == id) is the owner", m.memberAccessFingerprint({}, "m9", "m9"), "owner");
  expect("a missing document", fp(null), "absent");

  const S = (fromCache, fingerprint) => ({ kind: "snapshot", fromCache, fingerprint });
  expect("a cache snapshot sets no baseline", m.accessWatchStep(null, S(true, "a")), { baseline: null, action: "none" });
  expect("the first server snapshot is the baseline", m.accessWatchStep(null, S(false, "a")), { baseline: "a", action: "none" });
  expect("the same server fingerprint: nothing", m.accessWatchStep("a", S(false, "a")), { baseline: "a", action: "none" });
  expect("a different server fingerprint: reload", m.accessWatchStep("a", S(false, "b")), { baseline: "a", action: "reload" });
  expect("a different CACHE fingerprint: nothing", m.accessWatchStep("a", S(true, "b")), { baseline: "a", action: "none" });
  expect("refused after a baseline: reload", m.accessWatchStep("a", { kind: "refused" }), { baseline: "a", action: "reload" });
  expect("refused before any baseline: nothing (the page reports its own access)", m.accessWatchStep(null, { kind: "refused" }), { baseline: null, action: "none" });
  const now = 1_000_000;
  expect("reload allowed under the cap", m.mayReloadForAccess([now - 1000, now - 2000], now), true);
  expect("reload refused at the cap", m.mayReloadForAccess([now - 1000, now - 2000, now - 3000], now), false);
  expect("old reloads do not count", m.mayReloadForAccess([now - 70_000, now - 80_000, now - 90_000], now), true);
  return { failures, checks };
}

const failures = [];
const src = fs.existsSync(path.join(root, "lib/studioflow/accessWatch.ts")) ? fs.readFileSync(path.join(root, "lib/studioflow/accessWatch.ts"), "utf8") : "";
if (!src) failures.push("lib/studioflow/accessWatch.ts is absent");
let checks = 0;
if (src) {
  const result = vectors(await load(src, "accessWatch"));
  checks = result.checks;
  failures.push(...result.failures);
  // Control: count cache snapshots — must fail.
  const wrong = src.replace("if (event.fromCache) return { baseline, action: \"none\" };", "");
  if (wrong === src) failures.push("control: the cache guard text was not found");
  else if (vectors(await load(wrong, "accessWatchWrong")).failures.length === 0) failures.push("control: counting cache snapshots passes the vectors — they do not catch it");
  else console.log("control 'cache snapshots counted': fails as it should");
}
const auth = fs.readFileSync(path.join(root, "lib/auth/AuthProvider.tsx"), "utf8");
if (!/onSnapshot\(\s*doc\(db, "companies", companyId\),\s*\{ includeMetadataChanges: true \}/.test(auth)) failures.push("AuthProvider does not watch companies/{active} with metadata changes");
if (!/memberAccessFingerprint\(/.test(auth) || !/accessWatchStep\(accessBaseline, \{ kind: "refused" \}\)/.test(auth)) failures.push("AuthProvider does not reduce the document to the access fingerprint / ignores a refusal");
if (!/if \(step\.action === "reload"\) reloadForAccessChange\(companyId\)/.test(auth)) failures.push("AuthProvider does not reload on an access change");
if (!/if \(unsubAccess\) unsubAccess\(\);/.test(auth)) failures.push("the access listener is not detached on sign-out");
const fsrc = fs.readFileSync(path.join(root, "lib/studioflow/firestore.ts"), "utf8");
if (!/merged\.orders = rootAccess\.orders !== false;/.test(fsrc)) failures.push("Workflow Only's Orders entry ignores the owner's switch (forced true)");

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.log(`check-access-watch: ${failures.length} problem(s)`);
  failures.forEach(f => console.log("  - " + f));
  process.exit(1);
}
console.log(`check-access-watch: ${checks} vectors pass; AuthProvider reloads the page when this member's access entry changes on the server (or is refused after it was known); Workflow Only's Orders entry follows the switch.`);

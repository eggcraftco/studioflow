// Security audit #17 (28 Oct 2026): signing out (or losing the workspace) leaves no Firestore copy in this browser.
//
// 1. lib/auth/signOutSession.ts, compiled with the tree's own TypeScript against recording stubs:
//    pendingWritesSettled() answers true / false (timeout) / true (rejected); signOutAndWipe() asks only when
//    writes are still waiting, stays signed in on "no", and otherwise runs push unregister → device-local
//    clear → signOut → Firestore wipe → full load, in that order.
// 2. accessLostWipeStep(): one wipe per (uid, workspace) per ten minutes, so a refused reload cannot loop.
// 3. Every sign-out in app/, components/ and lib/ wipes the Firestore copy (the shared helper, or an explicit
//    clearFirestoreLocalCache() after signOut); AppShell wipes on WorkspaceAccessLostError; lib/firebase/client.ts
//    terminates + clears IndexedDB and finishes an unfinished wipe on the next load.
//
//   npx tsx scripts/check-sec-logout-cache.mts [--root <dir>]
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; } };
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};

// ---------------------------------------------------------------- 1. the helper, against stubs
type Calls = string[];
const g = globalThis as unknown as { __calls: Calls; __pending: () => Promise<void>; window: unknown };
g.__calls = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sec-logout-"));
fs.writeFileSync(path.join(tmp, "stub.mjs"), `
export const auth = { name: "auth" };
export const db = { name: "db" };
export async function signOut() { globalThis.__calls.push("signOut"); }
export async function waitForPendingWrites() { return globalThis.__pending(); }
export async function clearFirestoreLocalCache() { globalThis.__calls.push("clearFirestore"); return true; }
export function clearDeviceLocalWorkspaceCache() { globalThis.__calls.push("clearDeviceLocal"); }
export async function unregisterWebPush() { globalThis.__calls.push("unregisterPush"); }
export function clearSessionLockState() { globalThis.__calls.push("clearLock"); }
`);

let mod: Record<string, any> | null = null;
const source = read("lib/auth/signOutSession.ts");
if (!source) {
  ok("lib/auth/signOutSession.ts exists", false);
} else {
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  js = js.replace(/(["'])(firebase\/auth|firebase\/firestore|@\/lib\/firebase\/client|@\/lib\/studioflow\/deviceLocalCache|@\/lib\/studioflow\/pushNotifications|@\/lib\/auth\/sessionLock)\1/g, '"./stub.mjs"');
  const file = path.join(tmp, "signOutSession.mjs");
  fs.writeFileSync(file, js);
  const assigned: string[] = [];
  let reloaded = 0;
  const store = new Map<string, string>();
  g.window = {
    location: { assign: (to: string) => { g.__calls.push(`assign:${to}`); assigned.push(to); }, reload: () => { reloaded += 1; g.__calls.push("reload"); } },
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } }
  };
  mod = await import(pathToFileURL(file).href);

  const never = () => new Promise<void>(() => undefined);
  ok("pendingWritesSettled: delivered → true", await mod!.pendingWritesSettled(50, () => Promise.resolve()) === true);
  ok("pendingWritesSettled: still waiting after the budget → false", await mod!.pendingWritesSettled(30, never) === false);
  ok("pendingWritesSettled: Firestore refuses to answer → true", await mod!.pendingWritesSettled(50, () => Promise.reject(new Error("terminated"))) === true);

  // Nothing waiting: no question, the full sequence, in order.
  g.__calls = []; g.__pending = () => Promise.resolve();
  let asked = 0;
  let left = await mod!.signOutAndWipe({ confirmUnsynced: () => { asked += 1; return false; } });
  ok("nothing waiting: not asked", asked === 0);
  ok("nothing waiting: signed out (true)", left === true);
  ok(`nothing waiting: order push → device-local → lock record → signOut → Firestore wipe → /login (got ${g.__calls.join(" ")})`,
    g.__calls.join(" ") === "unregisterPush clearDeviceLocal clearLock signOut clearFirestore assign:/login");

  // Writes waiting, the person stays.
  g.__calls = []; g.__pending = never;
  const realSetTimeout = globalThis.setTimeout;
  // Run the 3 s budget at once.
  (globalThis as any).setTimeout = (fn: () => void, _ms?: number) => realSetTimeout(fn, 0);
  asked = 0;
  left = await mod!.signOutAndWipe({ confirmUnsynced: () => { asked += 1; return false; } });
  ok("writes waiting: asked once", asked === 1);
  ok("writes waiting + Stay signed in: resolves false", left === false);
  ok(`writes waiting + Stay signed in: nothing signed out or wiped (got ${g.__calls.join(" ") || "nothing"})`, g.__calls.length === 0);

  // Writes waiting, the person leaves anyway.
  g.__calls = []; asked = 0;
  left = await mod!.signOutAndWipe({ confirmUnsynced: async () => { asked += 1; return true; }, destination: "/invite/abc" });
  ok("writes waiting + Sign out anyway: signed out", left === true && asked === 1);
  ok(`writes waiting + Sign out anyway: full sequence to the destination (got ${g.__calls.join(" ")})`,
    g.__calls.join(" ") === "unregisterPush clearDeviceLocal clearLock signOut clearFirestore assign:/invite/abc");
  (globalThis as any).setTimeout = realSetTimeout;

  // No question asked at all (account deleted / boot recovery): never waits.
  g.__calls = []; g.__pending = never;
  left = await mod!.signOutAndWipe();
  ok("without confirmUnsynced: does not wait, wipes", left === true && g.__calls.includes("clearFirestore"));

  // ---------------------------------------------------------------- 2. access lost
  const T = 1_000_000_000;
  const gap = mod!.ACCESS_LOST_WIPE_GAP_MS as number;
  const s1 = mod!.accessLostWipeStep(null, "u1", "c1", T);
  ok("access lost: first refusal wipes", s1.wipe === true);
  const s2 = mod!.accessLostWipeStep(s1.markers, "u1", "c1", T + 1000);
  ok("access lost: the reload refused again does not wipe again (no loop)", s2.wipe === false);
  ok("access lost: another workspace wipes", mod!.accessLostWipeStep(s1.markers, "u1", "c2", T + 1000).wipe === true);
  ok("access lost: after the gap it wipes again", mod!.accessLostWipeStep(s1.markers, "u1", "c1", T + gap + 1).wipe === true);
  ok("access lost: no uid / workspace → no wipe", mod!.accessLostWipeStep(null, "", "c1", T).wipe === false && mod!.accessLostWipeStep(null, "u1", "", T).wipe === false);
  ok("access lost: garbage markers are ignored", mod!.accessLostWipeStep("x", "u1", "c1", T).wipe === true && mod!.accessLostWipeStep({ "u1:c1": "x" }, "u1", "c1", T).wipe === true);

  g.__calls = []; reloaded = 0;
  ok("wipeCacheAfterAccessLost: first call wipes and reloads", await mod!.wipeCacheAfterAccessLost("u9", "c9") === true && g.__calls.join(" ") === "clearFirestore reload");
  g.__calls = [];
  ok("wipeCacheAfterAccessLost: second call is a no-op", await mod!.wipeCacheAfterAccessLost("u9", "c9") === false && g.__calls.length === 0);
}

// ---------------------------------------------------------------- 3. every way out
function walk(dir: string, out: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const leaky: string[] = [];
for (const dir of ["app", "components", "lib"]) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const rel = path.relative(root, file);
    const text = fs.readFileSync(file, "utf8");
    const signsOut = /(^|[^.\w])signOut\(auth\)|auth\.signOut\(\)/.test(text);
    if (!signsOut) continue;
    if (rel === path.join("lib", "auth", "signOutSession.ts")) continue;
    if (!/clearFirestoreLocalCache\(\)/.test(text)) leaky.push(rel);
  }
}
ok(`every direct signOut also wipes the Firestore copy (leaky: ${leaky.join(", ") || "none"})`, leaky.length === 0);

const helperUsers = ["components/AppShell.tsx", "components/SessionAutoLock.tsx", "components/VerifyEmailGate.tsx", "app/settings/page.tsx", "app/invite/[token]/InviteAcceptContent.tsx"];
for (const rel of helperUsers) ok(`${rel} signs out through signOutAndWipe`, /signOutAndWipe\(/.test(read(rel)));
for (const rel of ["components/AppShell.tsx", "components/SessionAutoLock.tsx", "app/settings/page.tsx"]) {
  ok(`${rel} asks before throwing away undelivered writes`, /confirmUnsynced:/.test(read(rel)) && /UNSYNCED_SIGN_OUT_TEXT\.leave/.test(read(rel)));
}
const shell = read("components/AppShell.tsx");
ok("AppShell wipes the copy on WorkspaceAccessLostError", /accessLost && await wipeCacheAfterAccessLost\(currentUser\.uid, error\.companyId\)/.test(shell));
const client = read("lib/firebase/client.ts");
ok("client.ts: terminate(db) then clearIndexedDbPersistence(db)", /await terminate\(db\);\s*await clearIndexedDbPersistence\(db\);/.test(client));
ok("client.ts: an unfinished wipe is finished on the next load", /nv_fs_wipe_pending/.test(client) && /if \(wipePending\) \{\s*clearIndexedDbPersistence\(db\)/.test(client));
const translations = read("lib/studioflow/securityFixTranslations.ts");
for (const key of ["Changes not saved yet", "Stay signed in", "Sign out anyway"]) {
  const row = translations.split("\n").find(line => line.includes(`"${key}":`)) || "";
  ok(`"${key}" has a cell in all eleven languages`, (row.match(/": "/g) || []).length === 11);
}

if (failures.length) {
  console.error(failures.map(f => `FAIL ${f}`).join("\n"));
  console.error(`sec-logout-cache ${checks - failures.length}/${checks} pass; reds: ${failures.length}`);
  process.exit(1);
}
console.log(`sec-logout-cache ${checks}/${checks} pass; reds: none`);

// Security audit #46 (28 Oct 2026): the web lock survives a reload, and actions that cannot be undone ask for the
// sign-in again unless it is recent.
//
// 1. lib/auth/sessionLock.ts: shouldStartLocked() — a persisted lock stays down after F5 / a new tab unless a newer
//    sign-in replaced it; a page opened after the idle interval (activity of every tab) starts locked; Off never
//    locks by idle. The localStorage record per account; clearSessionLockState() removes only lock records.
// 2. lib/auth/recentAuth.ts, compiled against a stub client: a sign-in in the last five minutes passes without a
//    prompt; an older or unknown one prompts; a cancelled prompt throws "Confirm it's you to continue."; no mounted
//    prompt reads as cancelled.
// 3. The three destructive actions (deleteWorkspaceData, removeTeamMember, deleteMyAccount) check before calling the
//    server; SessionAutoLock persists the lock, follows other tabs, answers the prompt; sign-out clears the record.
//
//   npx tsx scripts/check-sec-session-lock.mts [--root <dir>]
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sec-lock-"));
async function load(rel: string, stubs: RegExp | null) {
  const source = read(rel);
  if (!source) { ok(`${rel} exists`, false); return null; }
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  if (stubs) js = js.replace(stubs, '"./stub.mjs"');
  const file = path.join(tmp, `${path.basename(rel, ".ts")}.mjs`);
  fs.writeFileSync(file, js);
  return import(pathToFileURL(file).href);
}

// A browser-shaped window: localStorage + events.
const store = new Map<string, string>();
const localStorage = {
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); }
};
const win = Object.assign(new EventTarget(), { localStorage });
(globalThis as any).window = win;
fs.writeFileSync(path.join(tmp, "stub.mjs"), `export const auth = { currentUser: null };\n`);

// ---------------------------------------------------------------- 1. sessionLock
const lock = await load("lib/auth/sessionLock.ts", null);
const MIN = 60_000;
const NOW = 2_000_000_000_000;
if (lock && typeof lock.shouldStartLocked !== "function") ok("sessionLock.ts exports shouldStartLocked / the persisted lock record", false);
if (lock && typeof lock.shouldStartLocked === "function") {
  const s = (o: Partial<{ lockedAt: number; lastActivity: number; lastSignIn: number; minutes: number }>) =>
    lock.shouldStartLocked({ lockedAt: 0, lastActivity: 0, lastSignIn: 0, minutes: 5, now: NOW, ...o });
  ok("a persisted lock is still down after F5", s({ lockedAt: NOW - 1000, lastSignIn: NOW - 60 * MIN }) === true);
  ok("a persisted lock is down even with Off chosen afterwards", s({ lockedAt: NOW - 1000, minutes: 0 }) === true);
  ok("a sign-in after the lock replaces it", s({ lockedAt: NOW - 10 * MIN, lastSignIn: NOW - MIN }) === false);
  ok("opened after the idle interval (all tabs idle) → locked", s({ lastActivity: NOW - 6 * MIN, lastSignIn: NOW - 60 * MIN }) === true);
  ok("opened within the idle interval → not locked", s({ lastActivity: NOW - 4 * MIN }) === false);
  ok("a recent sign-in counts as activity", s({ lastActivity: NOW - 60 * MIN, lastSignIn: NOW - MIN }) === false);
  ok("Off never locks by idle", s({ lastActivity: NOW - 600 * MIN, minutes: 0 }) === false);
  ok("no activity record yet (first visit) → not locked", s({ lastActivity: 0 }) === false);

  lock.writeSessionLockedAt("u1", NOW);
  ok("lockedAt is stored per account", lock.readSessionLockedAt("u1") === NOW && lock.readSessionLockedAt("u2") === 0);
  ok("lockedAt lives in localStorage (shared by tabs, survives F5)", store.get("studioflow-session-locked-at:u1") === String(NOW));
  lock.writeSessionActivity("u1", NOW - 5);
  ok("activity is stored per account", lock.readSessionActivity("u1") === NOW - 5);
  lock.writeSessionLockedAt("u1", null);
  ok("unlocking removes lockedAt", lock.readSessionLockedAt("u1") === 0);
  store.set("studioflow-auto-lock-minutes", "5");
  store.set("nv_lang", "Türkçe");
  lock.writeSessionLockedAt("u3", NOW);
  lock.clearSessionLockState();
  ok("sign-out clears every lock/activity record", ![...store.keys()].some(k => k.startsWith("studioflow-session-")));
  ok("sign-out keeps the per-device interval and other keys", store.get("studioflow-auto-lock-minutes") === "5" && store.get("nv_lang") === "Türkçe");
  ok("garbage in storage reads as no record", (store.set("studioflow-session-locked-at:u4", "x"), lock.readSessionLockedAt("u4") === 0));
}

// ---------------------------------------------------------------- 2. recentAuth
const recent = await load("lib/auth/recentAuth.ts", /(["'])@\/lib\/firebase\/client\1/g);
if (recent) {
  ok("auth 1 min ago is recent", recent.authIsRecent(NOW - MIN, NOW) === true);
  ok("auth 6 min ago is not recent", recent.authIsRecent(NOW - 6 * MIN, NOW) === false);
  ok("auth 30 s in the future (clock skew) is recent", recent.authIsRecent(NOW + 30_000, NOW) === true);
  ok("unknown auth time is not recent", recent.authIsRecent(Number.NaN, NOW) === false && recent.authIsRecent(0, NOW) === false);

  let asked = 0;
  const askYes = async () => { asked += 1; return true; };
  const askNo = async () => { asked += 1; return false; };
  asked = 0; await recent.ensureRecentAuthentication(async () => NOW - MIN, askNo, () => NOW);
  ok("recent sign-in: no prompt", asked === 0);
  asked = 0; await recent.ensureRecentAuthentication(async () => NOW - 30 * MIN, askYes, () => NOW);
  ok("old sign-in + re-authenticated: prompt once, passes", asked === 1);
  let thrown: Error | null = null;
  try { await recent.ensureRecentAuthentication(async () => NOW - 30 * MIN, askNo, () => NOW); } catch (e) { thrown = e as Error; }
  ok("old sign-in + Cancel: throws \"Confirm it's you to continue.\"", thrown?.message === "Confirm it's you to continue." && thrown?.name === "ReauthenticationRequiredError");
  asked = 0; thrown = null;
  try { await recent.ensureRecentAuthentication(async () => { throw new Error("no token"); }, askNo, () => NOW); } catch (e) { thrown = e as Error; }
  ok("token unreadable: prompts, and Cancel refuses", asked === 1 && thrown !== null);

  ok("no mounted prompt reads as cancelled", await recent.requestReauthentication() === false);
  const listener = (event: Event) => { const d = (event as CustomEvent).detail; d.handled = true; d.resolve(true); };
  win.addEventListener(recent.REAUTH_REQUEST_EVENT, listener);
  ok("a mounted prompt answers", await recent.requestReauthentication() === true);
  win.removeEventListener(recent.REAUTH_REQUEST_EVENT, listener);
}

// ---------------------------------------------------------------- 3. wiring
const team = read("lib/studioflow/teamActions.ts");
const settingsActions = read("lib/studioflow/settingsActions.ts");
const settings = read("app/settings/page.tsx");
const lockUi = read("components/SessionAutoLock.tsx");
const signOut = read("lib/auth/signOutSession.ts");
const before = (text: string, a: RegExp, b: RegExp) => { const i = text.search(a); const j = text.search(b); return i >= 0 && j >= 0 && i < j; };
const removeBody = team.slice(team.indexOf("export async function removeTeamMember"));
ok("removeTeamMember re-checks the sign-in before the callable", before(removeBody, /await ensureRecentAuthentication\(\)/, /removeWorkspaceTeamMember/));
const deleteBody = settingsActions.slice(settingsActions.indexOf("export async function deleteWorkspaceData"));
ok("deleteWorkspaceData re-checks the sign-in before the callable", before(deleteBody, /await ensureRecentAuthentication\(\)/, /"deleteWorkspaceData"/));
const accountBody = settings.slice(settings.indexOf("function DeleteAccountCard"));
ok("deleting the account re-checks the sign-in before deleteMyAccount", before(accountBody, /await ensureRecentAuthentication\(\)/, /"deleteMyAccount"/));
ok("the refusal is shown translated (workspace delete, account delete)", /t\(deleteError\.message\)/.test(settings) && /t\(err\.message\)/.test(accountBody));
ok("SessionAutoLock starts locked from the stored record before paint", /useLayoutEffect\(/.test(lockUi) && /shouldStartLocked\(/.test(lockUi));
ok("SessionAutoLock stores lockedAt when it locks and removes it on unlock", /writeSessionLockedAt\(uid, Date\.now\(\)\)/.test(lockUi) && /writeSessionLockedAt\(uid, null\)/.test(lockUi));
ok("SessionAutoLock follows other tabs (storage event on the lock key)", /sessionLockedAtKey\(uid\)/.test(lockUi) && /addEventListener\("storage", onStorage\)/.test(lockUi));
ok("SessionAutoLock answers the re-authentication prompt (handled + resolve)", /REAUTH_REQUEST_EVENT/.test(lockUi) && /detail\.handled = true/.test(lockUi) && /current\?\.resolve\(true\)/.test(lockUi));
ok("sign-out clears the lock record", /clearSessionLockState\(\)/.test(signOut));
const translations = read("lib/studioflow/securityFixTranslations.ts");
for (const key of ["Confirm it's you", "Confirm it's you to continue."]) {
  const row = translations.split("\n").find(line => line.startsWith(`  "${key}":`)) || "";
  ok(`"${key}" has a cell in all eleven languages`, (row.match(/": "/g) || []).length === 11);
}

if (failures.length) {
  console.error(failures.map(f => `FAIL ${f}`).join("\n"));
  console.error(`sec-session-lock ${checks - failures.length}/${checks} pass; reds: ${failures.length}`);
  process.exit(1);
}
console.log(`sec-session-lock ${checks}/${checks} pass; reds: none`);

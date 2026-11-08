// The help assistant keeps its conversation in this browser (1 Nov 2026, owner: "sonradan ne konuştuk diye
// bakamıyorsun"). The iPhone/iPad/Mac and Android apps keep it by the same rule; this pins the web half.
//
// 1. lib/studioflow/appHelpHistory.ts against a recording storage: the last 30 turns of the last 7 days, oldest
//    first; a ticket still "sending" comes back unsent; broken or foreign entries read as nothing; a full or
//    refused storage never throws; the key is the natives' name (first 16 bytes of sha256("uid|companyId"),
//    hex) and never carries the ids; the tab's open/closed state.
// 2. lib/studioflow/deviceLocalCache.ts, compiled with the tree's own TypeScript: sign-out removes every
//    account's kept conversation and the open state, and leaves a cosmetic preference alone.
// 3. Every way out of a session runs that clear (signOutAndWipe, sign in again, account deletion).
// 4. The panel: kept per account + workspace (AppShell passes the uid), written through the browser copy,
//    "New conversation" while there are turns (not while asking), the kept line only when it is true,
//    a link that leaves the page closes the panel; CSS in app/globals.css.
// 5. The kept line reads in every language through studioT; "New conversation" keeps the Messages wording.
//
//   npx tsx scripts/check-app-help-history.mts [--root <dir>]
import { createHash } from "crypto";
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

class MemoryStorage {
  map = new Map<string, string>();
  refuse = false;
  get length() { return this.map.size; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { if (this.refuse) throw new Error("QuotaExceededError"); this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
}

// The modules compiled on their own, with only the imports each one needs stubbed.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "app-help-history-"));
const compile = (rel: string, out: string, replace: (js: string) => string = js => js) => {
  const source = read(rel);
  if (!source) return "";
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  const file = path.join(tmp, out);
  fs.writeFileSync(file, replace(js));
  return file;
};

// ---------------------------------------------------------------- 1. the store
const historyFile = compile("lib/studioflow/appHelpHistory.ts", "appHelpHistory.mjs");
ok("lib/studioflow/appHelpHistory.ts exists", Boolean(historyFile));
if (historyFile) {
  const h = await import(pathToFileURL(historyFile).href);
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = Date.UTC(2026, 10, 1, 18, 0, 0);
  const turn = (n: number, askedAt: number, extra: Record<string, unknown> = {}) => ({
    id: `t${n}`, askedAt, question: `Question ${n}?`,
    answer: { answer: `Answer ${n}.`, needsChatGPT: false, needsSupport: n % 2 === 0, sources: [{ id: "calendar", path: "Calendar" }] },
    ticket: "", ...extra
  });

  ok("keeps 7 days and 30 turns, like the natives", h.APP_HELP_KEEP_DAYS === 7 && h.APP_HELP_KEEP_TURNS === 30);
  const forty = Array.from({ length: 40 }, (_, n) => turn(n, NOW - (40 - n) * 60_000));
  const kept = h.keptAppHelpTurns(forty, NOW);
  ok(`the newest 30 of 40, oldest first (got ${kept.length}, first ${kept[0]?.id})`, kept.length === 30 && kept[0].id === "t10" && kept[29].id === "t39");
  const ages = [turn(1, NOW - 8 * DAY), turn(2, NOW - 7 * DAY), turn(3, NOW - 7 * DAY + 1000), turn(4, NOW + 2 * DAY), turn(5, NOW)];
  ok(`older than 7 days and far-future turns go (got ${h.keptAppHelpTurns(ages, NOW).map((t: { id: string }) => t.id).join(",")})`,
    h.keptAppHelpTurns(ages, NOW).map((t: { id: string }) => t.id).join(",") === "t3,t5");
  ok("unsorted turns come back oldest first", h.keptAppHelpTurns([turn(2, NOW - 10), turn(1, NOW - 20)], NOW).map((t: { id: string }) => t.id).join(",") === "t1,t2");

  const expected = createHash("sha256").update("uid-123|company-9").digest().subarray(0, 16).toString("hex");
  const key = await h.appHelpHistoryKey("uid-123", "company-9");
  ok(`key = first 16 bytes of sha256("uid|companyId") as hex, the natives' name (got ${key})`, key === expected && /^[0-9a-f]{32}$/.test(key));
  ok("key trims like the natives", await h.appHelpHistoryKey("  uid-123 ", " company-9\n") === expected);
  ok("no account or no workspace → nothing kept (null key)", await h.appHelpHistoryKey("", "c") === null && await h.appHelpHistoryKey("u", " ") === null);
  ok("another workspace is another conversation", await h.appHelpHistoryKey("uid-123", "company-8") !== expected);

  const store = new MemoryStorage();
  const saved = h.saveAppHelpTurns(key, [turn(1, NOW - 1000), turn(2, NOW - 500, { ticket: "sending" }), turn(3, NOW - 100, { ticket: "sent" })], NOW, store);
  const storageKey = h.appHelpHistoryStorageKey(key);
  ok("saved under the hashed name only", store.length === 1 && store.key(0) === storageKey && !storageKey.includes("uid-123") && !storageKey.includes("company-9"));
  ok("the stored text never names the account or workspace", !String(store.getItem(storageKey)).includes("uid-123") && !String(store.getItem(storageKey)).includes("company-9"));
  ok("save returns what is kept", saved.length === 3);
  const loaded = h.loadAppHelpTurns(key, NOW, store);
  ok(`round trip keeps question, answer, sources, needsSupport (got ${JSON.stringify(loaded[0])})`,
    loaded.length === 3 && loaded[0].question === "Question 1?" && loaded[0].answer.answer === "Answer 1." && loaded[0].answer.sources[0].path === "Calendar" && loaded[1].answer.needsSupport === true);
  ok("a ticket still \"sending\" comes back unsent; \"sent\" stays", loaded[1].ticket === "" && loaded[2].ticket === "sent");
  ok("after 7 days the conversation reads empty", h.loadAppHelpTurns(key, NOW + 8 * DAY, store).length === 0);

  store.setItem(storageKey, "{not json");
  ok("broken JSON reads as nothing", h.loadAppHelpTurns(key, NOW, store).length === 0);
  store.setItem(storageKey, JSON.stringify({ version: 2, turns: [turn(1, NOW)] }));
  ok("another version reads as nothing", h.loadAppHelpTurns(key, NOW, store).length === 0);
  store.setItem(storageKey, JSON.stringify({ version: 1, turns: [turn(1, NOW), { id: "x" }, null, "x", { ...turn(2, NOW), answer: { answer: 5 } }, { ...turn(3, NOW), question: " " }, { ...turn(4, NOW), answer: { answer: "ok", sources: [{ id: 1 }, { id: "a", path: "B" }] } }] }));
  const mixed = h.loadAppHelpTurns(key, NOW, store);
  ok(`foreign entries are dropped, good ones kept (got ${mixed.map((t: { id: string }) => t.id).join(",")})`, mixed.map((t: { id: string }) => t.id).join(",") === "t1,t4" && mixed[1].answer.sources.length === 1);

  h.saveAppHelpTurns(key, [], NOW, store);
  ok("an empty conversation removes the entry", store.length === 0);
  h.saveAppHelpTurns(key, [turn(1, NOW)], NOW, store);
  h.clearAppHelpTurns(key, store);
  ok("New conversation removes the entry", store.length === 0);

  const full = new MemoryStorage();
  full.refuse = true;
  let threw = false;
  try { h.saveAppHelpTurns(key, [turn(1, NOW)], NOW, full); h.clearAppHelpTurns(key, full); h.loadAppHelpTurns(key, NOW, full); } catch { threw = true; }
  ok("a full or refusing storage never throws", !threw);
  ok("a refusing storage says it cannot keep", h.canKeepAppHelpTurns(full) === false && h.canKeepAppHelpTurns(new MemoryStorage()) === true);
  ok("no storage at all: nothing kept, nothing thrown", h.loadAppHelpTurns(key, NOW, null).length === 0 && h.saveAppHelpTurns(key, [turn(1, NOW)], NOW, null).length === 1 && h.canKeepAppHelpTurns(null) === false);

  const many = new MemoryStorage();
  // Saved "now" at the fixture's NOW, not the wall clock: a turn dated 1 Nov 2026
  // falls out of the 7-day window once the calendar passes 8 Nov, and this line
  // then fails for a reason that has nothing to do with the code under test.
  h.saveAppHelpTurns("a".repeat(32), [turn(1, NOW)], NOW, many);
  h.saveAppHelpTurns("b".repeat(32), [turn(1, NOW)], NOW, many);
  many.setItem("theme", "dark");
  ok("every kept conversation is found for sign-out", h.appHelpHistoryStorageKeys(many).length === 2 && !h.appHelpHistoryStorageKeys(many).includes("theme"));

  const tab = new MemoryStorage();
  h.writeAppHelpOpen(true, tab);
  ok("the tab remembers an open panel", h.readAppHelpOpen(tab) === true);
  h.writeAppHelpOpen(false, tab);
  ok("and a closed one", h.readAppHelpOpen(tab) === false && tab.length === 0);
  ok("turn ids are unique", h.newAppHelpTurnId() !== h.newAppHelpTurnId());

  // ---------------------------------------------------------------- 2. sign-out clears them
  fs.writeFileSync(path.join(tmp, "orderDetailView.stub.mjs"), "export function orderDetailViewStorageKeys() { return []; }\n");
  const cacheFile = compile("lib/studioflow/deviceLocalCache.ts", "deviceLocalCache.mjs", js => js
    .replace(/(["'])@\/lib\/studioflow\/orderDetailView\1/g, '"./orderDetailView.stub.mjs"')
    .replace(/(["'])@\/lib\/studioflow\/appHelpHistory\1/g, '"./appHelpHistory.mjs"'));
  ok("lib/studioflow/deviceLocalCache.ts exists", Boolean(cacheFile));
  if (cacheFile) {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    (globalThis as unknown as { window: unknown }).window = { localStorage: local, sessionStorage: session };
    h.saveAppHelpTurns("a".repeat(32), [turn(1, Date.now())], Date.now(), local);
    h.saveAppHelpTurns("b".repeat(32), [turn(1, Date.now())], Date.now(), local);
    local.setItem("nv_theme", "dark");
    local.setItem("nv_lang", "Türkçe");
    h.writeAppHelpOpen(true, session);
    const cache = await import(pathToFileURL(cacheFile).href);
    cache.clearDeviceLocalWorkspaceCache();
    ok(`sign-out removes every kept conversation (left: ${[...local.map.keys()].join(",")})`, h.appHelpHistoryStorageKeys(local).length === 0);
    ok("sign-out closes the remembered panel", h.readAppHelpOpen(session) === false);
    ok("sign-out leaves a cosmetic preference alone", local.getItem("nv_theme") === "dark" && local.getItem("nv_lang") === null);
    delete (globalThis as unknown as { window?: unknown }).window;
  }
}

// ---------------------------------------------------------------- 3. every way out
ok("signOutAndWipe clears device-local state", /clearDeviceLocalWorkspaceCache\(\);/.test(read("lib/auth/signOutSession.ts")));
ok("Sign in again (boot recovery) clears device-local state", /clearDeviceLocalWorkspaceCache\(\);/.test(read("lib/auth/bootRecovery.ts")));
ok("account deletion clears device-local state before signing out",
  /clearDeviceLocalWorkspaceCache\(\);\s*try \{\s*await auth\.signOut\(\);/.test(read("app/settings/page.tsx")));
ok("deviceLocalCache clears the kept conversations", /appHelpHistoryStorageKeys\(\)/.test(read("lib/studioflow/deviceLocalCache.ts")) && /writeAppHelpOpen\(false\)/.test(read("lib/studioflow/deviceLocalCache.ts")));

// ---------------------------------------------------------------- 4. the panel
const panel = read("components/AppHelpAssistant.tsx");
const shell = read("components/AppShell.tsx");
ok("AppShell passes the signed-in uid", shell.includes('<AppHelpAssistant workspace={workspace} userId={user?.uid ?? ""} language={language} t={t} />'));
ok("the conversation is named by account + workspace", /appHelpHistoryKey\(userId, companyId\)/.test(panel) && /\}, \[userId, companyId\]\);/.test(panel));
ok("the kept conversation is shown when the panel mounts", /setTurns\(key && canKeep \? loadAppHelpTurns\(key\) : \[\]\)/.test(panel));
ok("a new turn is written through the browser copy", /saveAppHelpTurns\(target, change\(loadAppHelpTurns\(target\)\)\)/.test(panel) && /changeTurns\(forKey, current => \[\.\.\.current, turn\]\)/.test(panel));
ok("the answer keeps the conversation it was asked in", /const forKey = historyKeyRef\.current;\s*try \{\s*const answer = await askAppAssistant/.test(panel) && /const target = forKey \?\? historyKeyRef\.current;/.test(panel));
ok("ticket state is written by turn id, not position", /item\.id === turn\.id \? \{ \.\.\.item, ticket \}/.test(panel) && !/sendToSupport\(index\)/.test(panel));
ok("another tab's change is shown", /window\.addEventListener\("storage", reload\)/.test(panel));
ok("New conversation while there are turns, not while asking", /\{turns\.length \? \(\s*<button type="button" className="app-help-new" onClick=\{startNewConversation\} disabled=\{busy\}/.test(panel));
ok("New conversation clears the browser copy", /if \(key\) clearAppHelpTurns\(key\);/.test(panel));
ok("the kept line only when the browser really keeps it", /\{turns\.length && keeping \? \(\s*<span className="app-help-kept">\{t\("This conversation is kept on this device for 7 days\."\)\}<\/span>/.test(panel));
ok("the tab's open panel opens again after a reload", /useState\(\(\) => readAppHelpOpen\(\)\)/.test(panel) && /writeAppHelpOpen\(open\)/.test(panel));
ok("See your tickets closes the panel", /href="\/settings\?section=support-tickets&support=appSupport" onClick=\{\(\) => setOpen\(false\)\}/.test(panel));
ok("turns are keyed by id", /key=\{turn\.id\}/.test(panel));
const css = read("app/globals.css");
ok("the header styles live in app/globals.css", css.includes(".app-help-head .app-help-new {") && css.includes(".app-help-head .app-help-kept {") && css.includes(".app-help-head-actions {"));
ok("not in the stale root globals.css", !read("globals.css").includes("app-help-new"));

// ---------------------------------------------------------------- 5. the words
const language = await import(pathToFileURL(path.join(root, "lib/studioflow/language.ts")).href);
const others = (language.SUPPORTED_STUDIO_LANGUAGES as string[]).filter(lang => lang !== "English");
const line = "This conversation is kept on this device for 7 days.";
const missing = others.filter(lang => language.studioT(line, lang) === line);
ok(`the kept line reads in all ${others.length} languages (missing: ${missing.join(", ") || "none"})`, missing.length === 0 && others.length === 11);
ok("the kept line is the natives' Turkish", language.studioT(line, "Türkçe") === "Bu konuşma bu cihazda 7 gün saklanır.");
ok(`"New conversation" keeps the Messages wording (got ${language.studioT("New conversation", "Türkçe")})`, language.studioT("New conversation", "Türkçe") === "Yeni sohbet");
const control = "App help history control key that no table has";
ok("control: an unknown key comes back untranslated", others.every(lang => language.studioT(control, lang) === control));

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(failures.map(f => `FAIL ${f}`).join("\n"));
  console.error(`app-help-history ${checks - failures.length}/${checks} pass; reds: ${failures.length}`);
  process.exit(1);
}
console.log(`app-help-history ${checks}/${checks} pass; reds: none`);

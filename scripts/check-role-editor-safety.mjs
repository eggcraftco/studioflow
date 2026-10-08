// Role editor safety + page access keys + export gating (8 Oct 2026, audit
// docs/security/role-key-enforcement-matrix-2026-10-08.md gaps 4, 9, 10).
// From the source alone, plus a compiled-dictionary probe and the pure
// pageAccess helpers run for real:
//   1. every new sentence has all eleven translations and studioT returns them;
//   2. CustomRoleManager: the sticky "Editing role: <name> · N members" bar,
//      the "Save <name>" button, the heading carries the role name, the draft
//      carries the stored description (so a save no longer wipes it), dirty
//      counts the description, one card open at a time, members listed;
//   3. both hosts pass members and toast "Saved role <name>";
//   4. every area page under app/ whose path has a key in PAGE_ACCESS_BY_PATH
//      checks workspaceAccessAllows(<that key>) and redirects through
//      pageAccessRedirectFor; AppShell reads the same table;
//   5. pageAccess helpers: key per path, landing never a closed page, never
//      the page itself, /home as the last resort;
//   6. export entry points sit behind the exportData key.
//
//   node scripts/check-role-editor-safety.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const manager = read("components/CustomRoleManager.tsx");
const teamPage = read("app/team/page.tsx");
const settingsPage = read("app/settings/page.tsx");
const appShell = read("components/AppShell.tsx");
const css = read("app/globals.css");
const failures = [];
let checks = 0;
const check = (label, ok) => { checks += 1; if (!ok) failures.push(label); };

// 1. Strings × 11 languages, in the file and out of the compiled dictionary.
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português",
  "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const KEYS = ["Editing role: {name}", "{count} members", "Members with this role: {names}", "No members use this role yet.", "Save {name}", "Saved role {name}"];
const DICTIONARY_FILES = ["language", ...[...read("lib/studioflow/language.ts").matchAll(/from "\.\/(\w+)"/g)].map((m) => m[1])];
const dictionary = DICTIONARY_FILES.map((name) => read(`lib/studioflow/${name}.ts`)).join("\n");
for (const key of KEYS) {
  const needle = `${JSON.stringify(key)}: {`;
  const present = new Set();
  let at = dictionary.indexOf(needle);
  while (at >= 0) {
    const line = dictionary.slice(at, dictionary.indexOf("\n", at));
    for (const language of LANGUAGES) if (line.includes(`${JSON.stringify(language)}:`)) present.add(language);
    at = dictionary.indexOf(needle, at + needle.length);
  }
  check(`${key}: all 11 translations declared (missing: ${LANGUAGES.filter((l) => !present.has(l)).join(", ") || "none"})`, present.size === LANGUAGES.length);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "role-editor-safety-"));
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
  .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
for (const name of DICTIONARY_FILES) fs.writeFileSync(path.join(tmp, `${name}.mjs`), transpile(read(`lib/studioflow/${name}.ts`)));
const { studioT } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
for (const key of KEYS) for (const language of LANGUAGES) {
  const out = studioT(key, language);
  check(`studioT(${JSON.stringify(key)}, ${language}) returns a translation`, Boolean(out) && out !== key);
}
check("Türkçe probe: Editing role → Düzenlenen rol", studioT("Editing role: {name}", "Türkçe") === "Düzenlenen rol: {name}");
check("English stays English", studioT("Save {name}", "English") === "Save {name}");

// 2. CustomRoleManager pins.
check("sticky bar rendered inside the expanded card", /\{expanded \? \(\s*<>\s*<div className="custom-role-editing-bar"/.test(manager));
check("bar text: Editing role: <name> · N members", manager.includes('t("Editing role: {name}").replace("{name}", role.name)') && manager.includes('t("{count} members").replace("{count}", String(roleMembers.length))'));
check("bar lists member names or the empty sentence", manager.includes('t("Members with this role: {names}").replace("{names}", memberNames.join(", "))') && manager.includes('t("No members use this role yet.")'));
check("bar is sticky in CSS", /\.custom-role-editing-bar \{[^}]*position: sticky;/.test(css));
check("Save button is Save <name>", manager.includes('t("Save {name}").replace("{name}", role.name)'));
check("permission heading carries the role name", manager.includes('heading={`${role.name} — ${t("Role permissions")}`}'));
check("draft carries the stored description", /description: role\.description \?\? "",\s*\n\s*baseRole: role\.baseRole,/.test(manager));
check("dirty counts the description", manager.includes('(draft.description ?? "") !== (role.description ?? "")'));
check("save sends the draft (description included)", manager.includes("onClick={() => onSave({ ...draft, id: role.id, name: cleanDraftName, access: normalizeAccess(draft.access) })}"));
check("one card at a time: expanding folds the new-role form too", /setExpandedRoleId\(current => current === role\.id \? null : role\.id\);\s*setNewRoleExpanded\(false\);/.test(manager));
check("members prop + membersUsingRole by role id", manager.includes("members?: CustomRoleMemberLike[];") && manager.includes("return members.filter(member => member.role === roleId);"));
check("summary row shows the member count", manager.includes('<span className="studio-pill">{t("{count} members").replace("{count}", String(roleMembers.length))}</span>'));
check("teamActions sends role.description (not a blank)", read("lib/studioflow/teamActions.ts").includes('description: role.description || "",'));

// 3. Hosts.
for (const [name, source] of [["team", teamPage], ["settings", settingsPage]]) {
  check(`${name} page passes members to CustomRoleManager`, /<CustomRoleManager\s*\n\s*roles=\{customRoles\}\s*\n\s*members=\{members\}/.test(source));
  check(`${name} page toasts Saved role <name>`, source.includes('role.id ? t("Saved role {name}").replace("{name}", role.name) : t("Role profile saved.")'));
}

// 4 + 5. Page access: the table, AppShell, every page.
fs.writeFileSync(path.join(tmp, "pageAccess.mjs"), transpile(read("lib/studioflow/pageAccess.ts")).replace(/^import type[^\n]*\n/m, ""));
const access = await import(pathToFileURL(path.join(tmp, "pageAccess.mjs")).href);
fs.rmSync(tmp, { recursive: true, force: true });
check("AppShell's nav table IS the page table", appShell.includes("const NAV_ACCESS_BY_HREF = PAGE_ACCESS_BY_PATH;") && appShell.includes('import { PAGE_ACCESS_BY_PATH } from "@/lib/studioflow/pageAccess";'));
check("no second copy of the href table", !/NAV_ACCESS_BY_HREF: Record</.test(appShell));
check("pageAccessKeyForPath: /notes → notes, /settings → settings, /export → exportData", access.pageAccessKeyForPath("/notes") === "notes" && access.pageAccessKeyForPath("/settings?section=data") === "settings" && access.pageAccessKeyForPath("/export") === "exportData");
check("pageAccessKeyForPath: nested order path rides orders; /home has none", access.pageAccessKeyForPath("/orders/abc") === "orders" && access.pageAccessKeyForPath("/home") === null);
check("landing never a closed page", access.pageAccessLandingFor({ orders: false, dashboard: false }) === "/customers");
check("landing for a member with everything closed is /home", access.pageAccessLandingFor(Object.fromEntries(Object.values(access.PAGE_ACCESS_BY_PATH).map((k) => [k, false]))) === "/home");
check("redirect never returns the page itself", access.pageAccessRedirectFor("/orders", { orders: false }) !== "/orders" && access.pageAccessRedirectFor("/orders", {}) === "/home");
check("undefined access opens everything (only explicit false closes)", access.pageAccessAllows(undefined, "/notes") && !access.pageAccessAllows({ notes: false }, "/notes"));

// Every area page with a key: reads the key and redirects through the helper.
// /team-schedule re-exports /schedule; /messages and /inbox redirect through
// messagingRedirectFor (the other messaging surface), which is checked by name.
const PAGE_FILES = {
  "/orders": "app/orders/page.tsx", "/production": "app/production/page.tsx", "/dashboard": "app/dashboard/page.tsx",
  "/bank": "app/bank/page.tsx", "/inventory": "app/inventory/page.tsx", "/schedule": "app/schedule/page.tsx",
  "/customers": "app/customers/page.tsx", "/messages": "app/messages/page.tsx", "/inbox": "app/inbox/page.tsx",
  "/notes": "app/notes/page.tsx", "/quick-reply": "app/quick-reply/page.tsx", "/settings": "app/settings/page.tsx",
  "/files": "app/files/page.tsx", "/export": "app/export/page.tsx", "/team": "app/team/page.tsx",
};
for (const [route, key] of Object.entries(access.PAGE_ACCESS_BY_PATH)) {
  if (route === "/team-schedule") { check("/team-schedule re-exports /schedule", read("app/team-schedule/page.tsx").includes('export { default } from "../schedule/page";')); continue; }
  const file = PAGE_FILES[route];
  check(`${route}: page file known`, Boolean(file));
  if (!file) continue;
  const source = read(file);
  const guard = new RegExp(`workspaceAccessAllows\\(\\w+(?:\\.memberAccess)?,\\s*"${key}"\\)`);
  check(`${route}: checks ${key}`, guard.test(source));
  const redirects = route === "/messages" || route === "/inbox"
    ? source.includes("router.replace(messagingRedirectFor(")
    : route === "/team"
      ? /router\.replace\("\/settings/.test(source) || source.includes("pageAccessRedirectFor(")
      : source.includes(`router.replace(pageAccessRedirectFor("${route}", `);
  check(`${route}: redirects when ${key} is false`, redirects);
}
// Any app/*/page.tsx that loads a workspace and whose route the table does not
// know is listed, so a new area cannot slip in unkeyed.
const unkeyed = fs.readdirSync(path.join(root, "app"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, "app", d.name, "page.tsx")))
  .map((d) => `/${d.name}`)
  .filter((route) => !(route in access.PAGE_ACCESS_BY_PATH) && read(`app${route}/page.tsx`).includes("loadWorkspaceContext("));
const KNOWN_UNKEYED = ["/home", "/plan", "/sales", "/admin", "/review-demo", "/connect", "/invite", "/custom-order-management", "/changelog", "/integrations", "/square", "/quickbooks", "/xero", "/etsy", "/ebay", "/pandle", "/chatgpt", "/signup", "/login", "/account-deletion"];
check(`workspace pages without a key are only the known ones (${unkeyed.filter((r) => !KNOWN_UNKEYED.includes(r)).join(", ") || "none new"})`, unkeyed.every((r) => KNOWN_UNKEYED.includes(r)));

// 6. Export entry points behind exportData.
const dashboard = read("app/dashboard/page.tsx");
check("dashboard: canExportData from the key", dashboard.includes('const canExportData = Boolean(workspace && workspaceAccessAllows(workspace.memberAccess, "exportData"));'));
check("dashboard: Export CSV pill behind canExportData", /\{canExportData \? \(\s*<button[\s\S]{0,700}?\{t\("Export CSV"\)\}\s*<\/button>\s*\) : null\}/.test(dashboard));
check("dashboard: spending CSV behind canExportData", /\{canExportData \? \(\s*<button className="ghost-button" type="button" onClick=\{exportCsv\}>/.test(dashboard));
check("orders: Export pill behind exportData", /\{workspace && workspaceAccessAllows\(workspace\.memberAccess, "exportData"\) \? \(\s*<button[\s\S]{0,400}?router\.push\("\/export"\)/.test(read("app/orders/page.tsx")));
check("settings: data section exportAllowed = plan feature AND key", settingsPage.includes('const exportAllowed = workspace.entitlements.features.export_data && workspaceAccessAllows(workspace.memberAccess, "exportData");'));
check("settings: Open full Export page link behind exportAllowed", settingsPage.includes('{exportAllowed ? <Link className="settings-inline-link" href="/export">'));
check("settings: PDF header Export link behind the key", settingsPage.includes('const canOpenExport = workspaceAccessAllows(workspace.memberAccess, "exportData");') && /useSettingsHeaderActions\(\s*canOpenExport \? \(/.test(settingsPage));
check("plan: Open Export behind the key", read("app/plan/page.tsx").includes('{!workspace || workspaceAccessAllows(workspace.memberAccess, "exportData") ? ('));
check("inventory: Export CSV behind the key", /\{workspaceAccessAllows\(workspace\.memberAccess, "exportData"\) \? \(\s*<button type="button" disabled=\{bulkBusy\} onClick=\{exportChecked\}>/.test(read("app/inventory/InventoryContent.tsx")));
check("teamAccess: /team page redirects without the key", /!workspaceAccessAllows\(workspaceContext\.memberAccess, "teamAccess"\)\) \{/.test(teamPage));
check("teamAccess: settings team management hidden without the key", settingsPage.includes('const canViewTeamManagement = Boolean(hasTeamPlan && workspaceAccessAllows(workspace.memberAccess, "teamAccess"));'));

console.log(`check-role-editor-safety: ${checks - failures.length}/${checks} passed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);

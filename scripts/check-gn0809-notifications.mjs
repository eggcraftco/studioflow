// GN-08/09 web (22 Oct 2026; rebuilt on the live web e2c75207, 27 Oct): Settings ▸ Notifications and the
// order notice that opens the Files / Work Time card.
//
//   1. lib/studioflow/notificationSettings.ts, run for real (Firebase stubbed): the bell/push target for a
//      member's upload / saved work time; an unknown focus is dropped; the server's settings are normalised
//      (owner switches default OFF, a member is never editable, garbage ignored); the two callables are the
//      ones the live server has (getNotificationSettings / saveNotificationSettings) and send { companyId }.
//   2. app/settings/NotificationSettingsSection.tsx rendered for real (react-dom/server): the owner sees the two
//      switches (and nothing can be switched before the server has answered); a member sees no switch, the
//      workspace rows and the "goes to the owner" sentence; owner-only links are hidden from a member.
//   3. The service worker's click handler, run in a sandbox: an order push opens /orders?orderId=…&focus=…;
//      the bell row does the same; the order page scrolls to that card (orderCardForFocus) and drops the params.
//   4. Settings wiring: the section exists in the personal group, has aliases, is gated like Preferences
//      (settingsGeneral) and is rendered; the new notification rows carry no access key.
//   5. Every visible string is translated in all eleven languages (compiled studioT); a control string is not.
//
//   node scripts/check-gn0809-notifications.mjs
import fs from "fs";
import os from "os";
import path from "path";
import vm from "vm";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));
const failures = [];
let checks = 0;
const check = (label, ok) => { checks += 1; if (!ok) failures.push(label); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gn0809-"));
const href = (spec) => pathToFileURL(require.resolve(spec)).href;
const transpile = (source, jsx = false) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, jsx: jsx ? ts.JsxEmit.ReactJSX : undefined } }).outputText
  .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"')
  .replace(/from "@\/lib\/studioflow\/(\w+)"/g, 'from "./$1.mjs"')
  .replace(/from "react\/jsx-runtime"/g, `from "${href("react/jsx-runtime")}"`)
  .replace(/from "react"/g, `from "${href("react")}"`);

// Stand-ins for the Firebase-bound modules (no network, no app).
const calls = [];
fs.writeFileSync(path.join(tmp, "firebase-functions.mjs"), `export const calls = globalThis.__gn0809Calls;
export function httpsCallable(_functions, name) { return async (payload) => { calls.push({ name, payload }); return { data: { settings: globalThis.__gn0809Reply } }; }; }`);
fs.writeFileSync(path.join(tmp, "firebase-client.mjs"), "export const functions = {};\n");
fs.writeFileSync(path.join(tmp, "auth.mjs"), "export function useAuth() { return { user: { uid: \"u-owner\", email: \"owner@example.test\" } }; }\n");
fs.writeFileSync(path.join(tmp, "firestore.mjs"), "export function normalizeWorkspaceRole(role) { return String(role || \"\").trim().toLowerCase(); }\n");
fs.writeFileSync(path.join(tmp, "pageHeader.mjs"), `import { jsx } from "${href("react/jsx-runtime")}";
export function SettingsCardHead({ title, subtitle }) { return jsx("h3", { "data-card-head": "", children: subtitle ? title + " — " + subtitle : title }); }`);
globalThis.__gn0809Calls = calls;

// 1. Pure module.
const modRel = "lib/studioflow/notificationSettings.ts";
check("notificationSettings.ts exists", exists(modRel));
const DICTIONARY_FILES = ["language", ...[...read("lib/studioflow/language.ts").matchAll(/from "\.\/(\w+)"/g)].map((m) => m[1])];
for (const name of DICTIONARY_FILES) fs.writeFileSync(path.join(tmp, `${name}.mjs`), transpile(read(`lib/studioflow/${name}.ts`)));
const { studioT, studioTranslationRow } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
let m = {};
if (exists(modRel)) {
  fs.writeFileSync(path.join(tmp, "notificationSettings.mjs"), transpile(read(modRel))
    .replace(/from "firebase\/functions"/, 'from "./firebase-functions.mjs"')
    .replace(/from "@\/lib\/firebase\/client"/, 'from "./firebase-client.mjs"'));
  m = await import(pathToFileURL(path.join(tmp, "notificationSettings.mjs")).href);
}
const has = (fn) => typeof m[fn] === "function";
check("file notice → the order, Files card, that file", has("orderNotificationHref") && m.orderNotificationHref({ orderId: "o 1", focus: "files", fileId: "f1" }) === "/orders?orderId=o+1&focus=files&fileId=f1");
check("work-time notice → Work Time card, that session", has("orderNotificationHref") && m.orderNotificationHref({ orderId: "o1", focus: "workTime", workSessionId: "s1" }) === "/orders?orderId=o1&focus=workTime&workSessionId=s1");
check("day entry → Work Time card, that day", has("orderNotificationHref") && m.orderNotificationHref({ orderId: "o1", focus: "workTime", workDayId: "d1" }) === "/orders?orderId=o1&focus=workTime&workDayId=d1");
check("unknown focus dropped; plain order row unchanged; no order → list", has("orderNotificationHref") && m.orderNotificationHref({ orderId: "o1", focus: "evil" }) === "/orders?orderId=o1" && m.orderNotificationHref({ orderId: "" }) === "/orders");
check("focus → card ids", has("orderCardForFocus") && m.orderCardForFocus("files") === "clientFiles" && m.orderCardForFocus("workTime") === "workTime" && m.orderCardForFocus("x") === null && m.orderCardForFocus(null) === null);
if (has("normalizeNotificationSettings")) {
  const empty = m.normalizeNotificationSettings(undefined);
  check("no answer: both owner switches OFF, nothing editable, device count unknown", JSON.stringify(empty.prefs) === '{"memberFileUploads":false,"memberWorkTime":false}' && !empty.editable.memberFileUploads && !empty.editable.memberWorkTime && empty.pushDeviceCount === null && empty.isOwner === false);
  const junk = m.normalizeNotificationSettings({ isOwner: "true", prefs: { memberFileUploads: "yes", other: true }, editable: { memberFileUploads: 1 }, pushDeviceCount: "3" });
  check("garbage ignored (only literal true counts; unknown keys dropped)", junk.isOwner === false && junk.prefs.memberFileUploads === false && !("other" in junk.prefs) && junk.editable.memberFileUploads === false && junk.pushDeviceCount === null);
  const owner = m.normalizeNotificationSettings({ isOwner: true, prefs: { memberFileUploads: true, memberWorkTime: false }, editable: { memberFileUploads: true, memberWorkTime: true }, pushDeviceCount: 2, smsAvailable: true });
  check("owner answer kept as sent", owner.isOwner && owner.prefs.memberFileUploads === true && owner.prefs.memberWorkTime === false && owner.editable.memberWorkTime === true && owner.pushDeviceCount === 2 && owner.smsAvailable === true);
} else check("normalizeNotificationSettings exported", false);
check("defaults are OFF", m.NOTIFICATION_PREF_DEFAULTS && m.NOTIFICATION_PREF_DEFAULTS.memberFileUploads === false && m.NOTIFICATION_PREF_DEFAULTS.memberWorkTime === false);
if (has("getNotificationSettings") && has("saveNotificationSettings")) {
  globalThis.__gn0809Reply = { isOwner: true, prefs: { memberFileUploads: true }, editable: { memberFileUploads: true, memberWorkTime: true } };
  const got = await m.getNotificationSettings({ id: "ws1" });
  const saved = await m.saveNotificationSettings({ id: "ws1" }, { memberWorkTime: true });
  check("get calls getNotificationSettings { companyId }", calls[0]?.name === "getNotificationSettings" && JSON.stringify(calls[0]?.payload) === '{"companyId":"ws1"}' && got.prefs.memberFileUploads === true);
  check("save calls saveNotificationSettings { companyId, settings }", calls[1]?.name === "saveNotificationSettings" && JSON.stringify(calls[1]?.payload) === '{"companyId":"ws1","settings":{"memberWorkTime":true}}' && saved.isOwner === true);
} else check("get/save exported", false);

// 2. The section, rendered.
const secRel = "app/settings/NotificationSettingsSection.tsx";
check("NotificationSettingsSection.tsx exists", exists(secRel));
if (exists(secRel) && exists(modRel)) {
  fs.writeFileSync(path.join(tmp, "NotificationSettingsSection.mjs"), transpile(read(secRel), true)
    .replace(/from "@\/lib\/auth\/AuthProvider"/, 'from "./auth.mjs"'));
  const { NotificationSettingsSection } = await import(pathToFileURL(path.join(tmp, "NotificationSettingsSection.mjs")).href);
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const html = (role, language = "English") => renderToStaticMarkup(React.createElement(NotificationSettingsSection, { workspace: { id: "ws1", role }, language }));
  const owner = html("owner");
  const switches = (s) => (s.match(/<input[^>]*type="checkbox"/g) || []).length;
  check("owner: two switches (uploads, work time)", switches(owner) === 2 && owner.includes("A member uploads a file to an order assigned to them") && owner.includes("A member saves work time on an order assigned to them"));
  check("owner: switches are off and locked until the server answers", !/<input[^>]*checked/.test(owner) && (owner.match(/<input[^>]*disabled/g) || []).length === 2);
  check("owner: says personal · owner only · bell and push", owner.includes("Personal · Owner only · Bell and push"));
  check("owner: workspace rows link to where they are decided", owner.includes('href="/settings?section=team-access"') && owner.includes('href="/settings?section=sms-notifications"') && owner.includes('href="/settings?section=message-settings"'));
  check("owner: the device card is first", owner.indexOf("This device") > -1 && owner.indexOf("This device") < owner.indexOf("Orders and assignment"));
  const member = html("member");
  check("member: no switch", switches(member) === 0);
  check("member: owner-only categories hidden", !member.includes("A member uploads a file") && !member.includes('data-notification-category="files"') && !member.includes('data-notification-category="workTime"'));
  check("member: told these go to the owner", member.includes("work on assigned orders go to the workspace owner, who switches them on here"));
  check("member: owner-only links hidden, personal links kept", !member.includes('href="/settings?section=team-access"') && !member.includes('href="/settings?section=message-settings"') && member.includes('href="/messages"') && member.includes('href="/settings?section=sms-notifications"'));
  const tr = html("owner", "Türkçe");
  check("Türkçe render: the switch title is translated", !tr.includes("A member uploads a file to an order assigned to them") && tr.includes(studioT("A member uploads a file to an order assigned to them", "Türkçe")));
}

// 3. Service worker + bell row + the order page.
const swSource = read("public/firebase-messaging-sw.js");
async function clickOpens(data, openTabs = []) {
  const listeners = {};
  const opened = [];
  const navigated = [];
  const sandbox = {
    URLSearchParams,
    importScripts: () => {},
    firebase: { initializeApp: () => {}, messaging: () => ({ onBackgroundMessage: () => {} }) },
    self: {
      location: { search: "" },
      registration: { showNotification: () => {} },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      clients: {
        matchAll: async () => openTabs.map((url) => ({ url, focus: async () => null, navigate: async (to) => { navigated.push(to); return null; } })),
        openWindow: async (url) => { opened.push(url); return null; }
      }
    }
  };
  vm.runInNewContext(swSource, sandbox);
  let waited = Promise.resolve();
  listeners.notificationclick({ notification: { close: () => {}, data }, stopImmediatePropagation: () => {}, waitUntil: (p) => { waited = p; } });
  await waited;
  return { opened, navigated };
}
let r = await clickOpens({ route: "order", orderId: "o1", focus: "files", fileId: "f1" });
check("SW: upload push opens the order on the Files card", r.opened[0] === "/orders?orderId=o1&focus=files&fileId=f1");
r = await clickOpens({ route: "order", orderId: "o1", focus: "workTime", workSessionId: "s1" }, ["https://nivadesk.app/orders"]);
check("SW: an open Orders tab is moved to the order's Work Time card", r.navigated[0] === "/orders?orderId=o1&focus=workTime&workSessionId=s1");
r = await clickOpens({ orderId: "o2", focus: "javascript:x" });
check("SW: an older order push opens that order; an unknown focus is dropped", r.opened[0] === "/orders?orderId=o2");
r = await clickOpens({ route: "messageThread", threadId: "t1" });
check("SW: a team push still opens Messages", r.opened[0] === "/messages");
const drawer = read("components/NotificationsDrawer.tsx");
check("bell row: an order notice opens orderNotificationHref(n)", drawer.includes("router.push(orderNotificationHref(n));") && drawer.includes('import { orderNotificationHref } from "@/lib/studioflow/notificationSettings";'));
const notifications = read("lib/studioflow/notifications.ts");
check("bell rows carry focus / fileId / workSessionId / workDayId", ["focus", "fileId", "workSessionId", "workDayId"].every((k) => notifications.includes(`${k}: str(data.${k}),`)));
const detail = read("app/orders/OrderDetailContent.tsx");
check("order page: focus → the card (orderCardForFocus) and the card frame is found by its guide id", detail.includes('const cardId = orderCardForFocus(url.searchParams.get("focus"));') && detail.includes("[data-first-project-guide-card=\"${cardId}\"]") && /data-first-project-guide-card=\{cardId\}/.test(detail));
check("order page: drops the focus params after one jump", detail.includes('["focus", "fileId", "workSessionId", "workDayId"].forEach(key => url.searchParams.delete(key));'));
check("order page: the Files and Work Time cards keep those ids", /clientFiles: "Client Files"/.test(detail) && /"workTime"/.test(detail));

// 4. Settings wiring.
const page = read("app/settings/page.tsx");
check("section id is a SettingsSectionId", /\| "notifications"\n/.test(page));
check("section listed in the personal group", /\{ id: "notifications", title: "Notifications", appKey: "Notifications",[^\n]*group: "personal" \}/.test(page));
check("aliases notification / notification-settings / push", page.includes('notification: "notifications",') && page.includes('"notification-settings": "notifications",') && page.includes('push: "notifications",'));
check("gated like Preferences (settingsGeneral)", /sectionId === "preferences" \|\|\s*sectionId === "notifications" \|\|\s*sectionId === "about"\s*\) \{\s*return allowed\("settingsGeneral"\);/.test(page));
check("rendered", page.includes('case "notifications":\n      return <NotificationSettingsSection workspace={workspace} language={language} />;'));
check("Customer SMS keeps its own id (sms alias unchanged)", page.includes('sms: "sms-notifications",'));
check("the search keywords include it", /\n  notifications: "notification notifications push bell/.test(page));
const accessRel = "lib/studioflow/notificationAccess.ts";
if (exists(accessRel)) {
  fs.writeFileSync(path.join(tmp, "notificationAccess.mjs"), transpile(read(accessRel)));
  const access = await import(pathToFileURL(path.join(tmp, "notificationAccess.mjs")).href);
  check("member upload / work-time rows ride no access key (owner-only by recipientUids)", access.notificationAccessKeyFor({ route: "order", type: "member_file_uploaded" }) === null && access.notificationAccessKeyFor({ route: "order", type: "member_work_time_saved" }) === null);
} else check("notificationAccess.ts exists", false);

// 5. Translations.
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const src = (exists(secRel) ? read(secRel) : "") + (exists(modRel) ? read(modRel) : "");
const strings = new Set();
for (const x of src.matchAll(/(?:title|detail|prefTitle|prefDetail|linkLabel): "((?:[^"\\]|\\.)+)"/g)) strings.add(JSON.parse(`"${x[1]}"`));
for (const x of src.matchAll(/\bt\("((?:[^"\\]|\\.)+)"\)/g)) strings.add(JSON.parse(`"${x[1]}"`));
for (const x of src.matchAll(/^\s+(personal|workspace|access): "([^"]+)",?$/gm)) strings.add(x[2]);
for (const x of src.matchAll(/"(Notification settings could not be (?:loaded|saved)\.)"/g)) strings.add(x[1]);
strings.add("Notifications");
strings.add("What notifies you, where it is decided, and whether this device can receive push.");
check(`visible strings found (${strings.size})`, strings.size >= 45);
for (const s of strings) {
  for (const l of LANGS) {
    const out = studioT(s, l);
    check(`studioT(${JSON.stringify(s.slice(0, 40))}, ${l}) translated`, Boolean(out) && (out !== s || studioTranslationRow(s)?.[l] === s));
  }
}
// The section's own table is what the screen shows: no other table merged after it changes one of its cells.
const { NOTIFICATION_SETTINGS_TRANSLATIONS: TABLE } = await import(pathToFileURL(path.join(tmp, "notificationSettingsTranslations.mjs")).href);
const overridden = Object.entries(TABLE || {}).flatMap(([key, row]) => LANGS.filter((l) => row[l] && studioT(key, l) !== row[l]).map((l) => `${key} [${l}]`));
check(`GN-09 table merged (${Object.keys(TABLE || {}).length} keys) and no cell overridden by another table${overridden.length ? ": " + overridden.slice(0, 3).join("; ") : ""}`, Object.keys(TABLE || {}).length >= 40 && overridden.length === 0);
const control = LANGS.filter((l) => studioT("gn0809 control string that has no translation", l) === "gn0809 control string that has no translation").length;
check("control: an untranslated string is reported (11/11)", control === 11);

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`check-gn0809-notifications: ${failures.length} of ${checks} FAILED`);
  for (const f of failures.slice(0, 40)) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-gn0809-notifications: ${checks}/${checks} passed`);

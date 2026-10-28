// GN-07 (22 Oct 2026): a customer-message notification opens THAT conversation, in THAT workspace — on the web.
//
//   1. The service worker's click handler is run (in a sandbox, with stand-in clients) and the URL it opens is read:
//      /inbox?conversation=<id>&workspace=<companyId>; a push from an older server without companyId still opens
//      the conversation; a team push still opens /messages.
//   2. The inbox page sends a signed-out visitor to /login?next=<the same link>, so the target survives the sign-in
//      (the login page honours a same-site ?next=).
//   3. The inbox opens a linked conversation only for the workspace that is open; another workspace's link opens
//      nothing and shows the "another workspace" sentence. The bell row passes its workspace too.
//   4. An Instagram photo's refusal names Instagram; every new sentence exists in all 11 other languages.
//
//   node scripts/check-inbox-push-link.mjs
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let passed = 0;
const expect = (name, actual, wanted) => {
  if (actual !== wanted) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
  else passed += 1;
};
const must = (name, ok) => { if (!ok) failures.push(name); else passed += 1; };

// 1. The service worker, run.
const swSource = fs.readFileSync(path.join(root, "public/firebase-messaging-sw.js"), "utf8");
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
        matchAll: async () => openTabs.map((url) => ({
          url, focus: async () => null, navigate: async (to) => { navigated.push(to); return null; }
        })),
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
const CONV = "4ad40affa253bc85e95f80f74f7c584ceb903ce7";
let r = await clickOpens({ route: "customerInbox", conversationId: CONV, companyId: "wsA", channel: "instagram" });
expect("SW: customer push opens the conversation in its workspace", r.opened[0], `/inbox?conversation=${CONV}&workspace=wsA`);
r = await clickOpens({ route: "customerInbox", conversationId: CONV });
expect("SW: an older push (no companyId) still opens the conversation", r.opened[0], `/inbox?conversation=${CONV}`);
r = await clickOpens({ route: "customerInbox", conversationId: CONV, companyId: "wsA" }, ["https://nivadesk.app/inbox"]);
expect("SW: an open inbox tab is moved to the conversation", r.navigated[0], `/inbox?conversation=${CONV}&workspace=wsA`);
r = await clickOpens({ route: "messageThread", threadId: "t1" });
expect("SW: a team push still opens Messages", r.opened[0], "/messages");

// 2. Signed out: the link survives the sign-in.
const page = fs.readFileSync(path.join(root, "app/inbox/page.tsx"), "utf8");
must("inbox/page.tsx: a signed-out visit is sent to /login?next=<the inbox link>", /router\.replace\(back\.startsWith\("\/inbox"\) \? `\/login\?next=\$\{encodeURIComponent\(back\)\}` : "\/login"\)/.test(page));
const login = fs.readFileSync(path.join(root, "app/login/page.tsx"), "utf8");
must("login/page.tsx: still honours a same-site ?next=", /next\.startsWith\("\/"\) && !next\.startsWith\("\/\/"\)/.test(login));

// 3. One workspace, always.
const inbox = fs.readFileSync(path.join(root, "app/inbox/InboxContent.tsx"), "utf8");
must("InboxContent.tsx: reads ?workspace=", /searchParams\?\.get\("workspace"\)/.test(inbox));
must("InboxContent.tsx: another workspace's link is recognised", /const linkForOtherWorkspace = linkedConversation !== "" && linkedWorkspace !== "" && linkedWorkspace !== workspace\.id;/.test(inbox));
must("InboxContent.tsx: another workspace's link opens nothing", /if \(linkForOtherWorkspace\) return;\s*\n\s*if \(linkHandled\.current === linkedConversation\) return;/.test(inbox));
must("InboxContent.tsx: and says so", /linkForOtherWorkspace \? \([\s\S]{0,200}"This message is for another workspace\. Switch to that workspace to open it\."/.test(inbox));
const drawer = fs.readFileSync(path.join(root, "components/NotificationsDrawer.tsx"), "utf8");
must("NotificationsDrawer.tsx: the bell row passes its workspace", /&workspace=\$\{encodeURIComponent\(rowWorkspace\)\}/.test(drawer));

// 4. Instagram's words, in every language.
const attachment = fs.readFileSync(path.join(root, "app/inbox/InboxAttachment.tsx"), "utf8");
must("InboxAttachment.tsx: an Instagram photo's refusal names Instagram", /if \(channel === "instagram"\)[\s\S]{0,200}"Instagram no longer serves this photo\./.test(attachment));
must("InboxAttachment.tsx: the refusal is told the channel", /refusalSentence\(phase\.reason, channel\)/.test(attachment));
must("InboxContent.tsx: passes the thread's channel to both attachment renderers", (inbox.match(/channel=\{thread\.channelMedium \|\| ""\}/g) || []).length >= 2);
const language = fs.readFileSync(path.join(root, "lib/studioflow/language.ts"), "utf8");
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
for (const key of [
  "Instagram no longer serves this photo. Ask the customer to send it again.",
  "Instagram is not connected, so the photo cannot be fetched.",
  "Instagram refused the request. Try again later.",
  "Instagram did not answer. Try again in a moment.",
  "This message is for another workspace. Switch to that workspace to open it."
]) {
  const lines = language.split("\n").filter((line) => line.trimStart().startsWith(JSON.stringify(key) + ":"));
  expect(`language.ts: "${key.slice(0, 40)}…" defined once`, lines.length, 1);
  for (const lang of LANGS) must(`language.ts: "${key.slice(0, 30)}…" in ${lang}`, lines[0] && lines[0].includes(`"${lang}": "`));
}

if (failures.length) {
  console.error(`${failures.length} problem(s):`);
  for (const f of failures) console.error(`  ${f}`);
  console.error(`❌ INBOX PUSH LINK (${passed} ok)`);
  process.exit(1);
}
console.log(`✅ INBOX PUSH LINK: ${passed} checks`);

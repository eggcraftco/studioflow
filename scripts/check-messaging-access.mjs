// Messaging access + inventory access (docs/messaging-access-contract-2026-10-08.md).
// Static reads of the sources plus the pure helpers run in Node:
//   1. the access option labels/descriptions (messages, teamChat, inventory)
//      and the three delete strings are in the dictionary in all 12 languages;
//   2. NAV_ACCESS_BY_HREF maps /messages → teamChat, /inbox → messages,
//      /inventory → inventory; the permission matrix has the teamChat and
//      inventory rows; the pages redirect on their own key;
//   3. messagesNavHref / messagingAccessFrom / messagingRedirectFor /
//      canDeleteTeamMessage answer the contract's cases;
//   4. the bubble renders t("Message deleted") and the menu t("Delete message").
//
//   node scripts/check-messaging-access.mjs [--root <dir>]
import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => { try { return fs.readFileSync(path.join(root, file), "utf8"); } catch { return ""; } };
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português",
  "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); };

// 1. Option list + matrix + strings.
const firestore = read("lib/studioflow/firestore.ts");
const dictionary = read("lib/studioflow/language.ts");
const options = {};
for (const m of firestore.matchAll(/\{ key: "(\w+)", label: "([^"]+)", description: "([^"]+)" \}/g)) options[m[1]] = { label: m[2], description: m[3] };
check(options.messages?.label === "Customer messages (WhatsApp, Instagram)", `messages label is "${options.messages?.label}"`);
check(options.teamChat?.label === "Team messages", `teamChat label is "${options.teamChat?.label}"`);
check(options.inventory?.label === "Inventory", `inventory option: ${options.inventory ? `label "${options.inventory.label}"` : "absent"}`);
check(/Customer message notifications/.test(options.messages?.description ?? ""), "messages description does not name its notifications");
check(/Team message notifications/.test(options.teamChat?.description ?? ""), "teamChat description does not name its notifications");

function inAllLanguages(key) {
  const at = dictionary.indexOf(`${JSON.stringify(key)}: {`);
  if (at < 0) return `"${key.slice(0, 60)}" — no entry`;
  const line = dictionary.slice(at, dictionary.indexOf("\n", at));
  const absent = LANGUAGES.filter((language) => !line.includes(`${JSON.stringify(language)}:`));
  return absent.length ? `"${key.slice(0, 60)}" — missing ${absent.join(", ")}` : "";
}
const strings = [
  ...["messages", "teamChat", "inventory"].flatMap((k) => options[k] ? [options[k].label, options[k].description] : []),
  "Delete message",
  "Message deleted",
  "Delete this message? It disappears for everyone in this conversation."
];
for (const key of strings) { const miss = inAllLanguages(key); check(!miss, miss); }

// The editor shows the description through t(), not raw.
const editor = read("components/MemberAccessEditor.tsx");
check(editor.includes("title={t(option.description)}"), "MemberAccessEditor shows option.description without t()");

const settings = read("app/settings/page.tsx");
check(/key: "teamChat", label: "Team messages", value: column => column\.access\.teamChat !== false/.test(settings), "permission matrix has no teamChat row");
check(/key: "messages", label: "Customer messages \(WhatsApp, Instagram\)"/.test(settings), "permission matrix messages row not relabelled");
check(/key: "inventory", label: "Inventory", value: column => column\.access\.inventory !== false/.test(settings), "permission matrix has no inventory row");

// 2. Nav mapping + page redirects.
// Since 8 Oct 2026 the href table lives in lib/studioflow/pageAccess.ts
// (PAGE_ACCESS_BY_PATH); AppShell aliases it as NAV_ACCESS_BY_HREF.
const shell = read("components/AppShell.tsx");
check(shell.includes("const NAV_ACCESS_BY_HREF = PAGE_ACCESS_BY_PATH;"), "AppShell does not read PAGE_ACCESS_BY_PATH");
const pageAccess = read("lib/studioflow/pageAccess.ts");
const navMap = pageAccess.slice(pageAccess.indexOf("export const PAGE_ACCESS_BY_PATH"), pageAccess.indexOf("};", pageAccess.indexOf("export const PAGE_ACCESS_BY_PATH")));
check(/"\/messages": "teamChat"/.test(navMap), "NAV_ACCESS_BY_HREF: /messages is not teamChat");
check(/"\/inbox": "messages"/.test(navMap), "NAV_ACCESS_BY_HREF: /inbox is not messages");
check(/"\/inventory": "inventory"/.test(navMap), "NAV_ACCESS_BY_HREF: /inventory is not inventory");
check(/id: "inventory",[\s\S]*?access: "inventory",[\s\S]*?href: "\/inventory"/.test(read("lib/studioflow/homeCards.ts")), "home Inventory card is not gated by the inventory key");
check(shell.includes("messagesNavHref(workspace.memberAccess) === null"), "navItemHidden does not use messagesNavHref for the Messages item");
check(shell.includes('href={item.href === "/inbox" ? (messagesNavHref(workspace?.memberAccess) ?? item.href) : item.href}'), "sidebar Messages href is not the allowed tab");
const messagesPage = read("app/messages/page.tsx");
check(/workspaceAccessAllows\(ws\.memberAccess, "teamChat"\)\) \{\s*router\.replace\(messagingRedirectFor\("team", ws\.memberAccess\)\)/.test(messagesPage), "app/messages does not redirect when teamChat is false");
const inboxPage = read("app/inbox/page.tsx");
check(/workspaceAccessAllows\(context\.memberAccess, "messages"\)\) \{\s*router\.replace\(messagingRedirectFor\("customers", context\.memberAccess\)\)/.test(inboxPage), "app/inbox does not redirect to the allowed surface");
const inventoryPage = read("app/inventory/page.tsx");
check(/workspaceAccessAllows\(context\.memberAccess, "inventory"\)\) \{\s*router\.replace\(pageAccessRedirectFor\("\/inventory", context\.memberAccess\)\)/.test(inventoryPage), "app/inventory does not redirect when inventory is false");
const tabs = read("components/MessagesTabs.tsx");
check(tabs.includes("{allowed.customers ? (") && tabs.includes("{allowed.team ? ("), "MessagesTabs does not hide a disallowed tab");
check(read("app/inbox/InboxContent.tsx").includes("access={workspace.memberAccess}"), "inbox tabs get no access");
check(messagesPage.includes("access={workspace?.memberAccess}"), "team tabs get no access");

// 4. Delete UI.
check(messagesPage.includes('<em className="bubble__deleted">{t("Message deleted")}</em>'), "deleted placeholder is not t(\"Message deleted\")");
check(messagesPage.includes('{t("Delete message")}') && messagesPage.includes("{canDelete && ("), "menu has no gated Delete message action");
check(messagesPage.includes("await deleteThreadMessage(workspace, selectedThread.id, messageId)"), "delete does not call deleteThreadMessage");
check(/item\.replyToMessageId && !item\.deletedForEveryone/.test(messagesPage), "deleted message still shows its reply quote");
check(/data\.deleted === true/.test(read("lib/studioflow/messages.ts")), "itemFromDoc ignores the server's `deleted` flag");

// 3. Pure helpers.
const helperPath = path.join(root, "lib/studioflow/messagingAccess.ts");
if (!fs.existsSync(helperPath)) failures.push("lib/studioflow/messagingAccess.ts is absent");
else {
  const h = await import(pathToFileURL(helperPath).href);
  const cases = [
    [h.messagesNavHref({ messages: true, teamChat: true }), "/inbox", "nav: both → /inbox"],
    [h.messagesNavHref(undefined), "/inbox", "nav: no access object → /inbox"],
    [h.messagesNavHref({ messages: false, teamChat: true }), "/messages", "nav: team only → /messages"],
    [h.messagesNavHref({ messages: true, teamChat: false }), "/inbox", "nav: customers only → /inbox"],
    [h.messagesNavHref({ messages: false, teamChat: false }), null, "nav: neither → hidden"],
    [JSON.stringify(h.messagingAccessFrom({ messages: false })), JSON.stringify({ customers: false, team: true }), "tabs: messages=false hides Customers only"],
    [JSON.stringify(h.messagingAccessFrom({ teamChat: false })), JSON.stringify({ customers: true, team: false }), "tabs: teamChat=false hides Team only"],
    [h.messagingRedirectFor("team", { teamChat: false, messages: true }), "/inbox", "redirect: team closed → /inbox"],
    [h.messagingRedirectFor("team", { teamChat: false, messages: false }), "/dashboard", "redirect: both closed → /dashboard"],
    [h.messagingRedirectFor("customers", { messages: false }), "/messages", "redirect: customers closed → /messages"],
    [h.canDeleteTeamMessage({ viewerUid: "owner", viewerIsOwner: true, senderUid: "other" }), true, "delete: owner on another's message"],
    [h.canDeleteTeamMessage({ viewerUid: "me", viewerIsOwner: false, senderUid: "me" }), true, "delete: sender on own message"],
    [h.canDeleteTeamMessage({ viewerUid: "me", viewerIsOwner: false, senderUid: "other" }), false, "delete: member on another's message"],
    [h.canDeleteTeamMessage({ viewerUid: "", viewerIsOwner: false, senderUid: "" }), false, "delete: empty uids never match"],
    [h.canDeleteTeamMessage({ viewerUid: "owner", viewerIsOwner: true, senderUid: "x", deleted: true }), false, "delete: already deleted"],
  ];
  for (const [got, want, what] of cases) check(got === want, `${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

// 5. Delete group follows the server's write gate (listMessageThreads canDelete =
//    requireMessagesWriteAccess roles + owner/creator): Workflow Only / View Only never see it.
{
  const messagesSrc = read("lib/studioflow/messages.ts");
  const fn = messagesSrc.slice(messagesSrc.indexOf("export function canDeleteMessageThread("), messagesSrc.indexOf("export async function deleteMessageThread("));
  const gate = fn.indexOf("if (!viewerIsOwner && !roleCanWrite) return false;");
  const serverFlag = fn.indexOf('if (typeof thread.canDelete === "boolean") return thread.canDelete;');
  check(gate > 0 && serverFlag > gate, "canDeleteMessageThread: the role gate comes before the server flag");
  const page = read("app/messages/page.tsx");
  check(/const canChangeConversations = \["owner", "admin", "member"\]\.includes\(messageRole\);/.test(page), "page: canChangeConversations = owner/admin/member (the server's write roles)");
  check(page.includes("canDeleteMessageThread(selectedThread, user.uid, viewerIsOwner, canChangeConversations)"), "page: Delete group passes canChangeConversations");
}

if (failures.length) {
  console.error(`check-messaging-access: ${failures.length} failure(s) at ${root}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`check-messaging-access: all checks passed (${strings.length} strings in 12 languages, nav mapping, tab/redirect gating, delete helper, placeholder).`);

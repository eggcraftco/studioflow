// The empty customer conversation list says the right one of three sentences
// (lib/studioflow/inboxEmptyState.ts), and the inbox screen uses it: it asks
// the extra "any conversation at all?" question only for an empty default
// (Open) list. The helper is compiled with the web tree's own TypeScript and
// run; the screen's wiring is read from its source.
//
//   node scripts/check-inbox-empty-state.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import os from "os";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "lib/studioflow/inboxEmptyState.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "inbox-empty-")), "inboxEmptyState.mjs");
fs.writeFileSync(tmp, js);
const { inboxEmptySentence, isDefaultInboxView } = await import(pathToFileURL(tmp).href);

const base = { status: "open", assignee: "anyone", label: "", query: "", unreadOnly: false };
const failures = [];
const expect = (name, actual, wanted) => { if (actual !== wanted) failures.push(`${name}: got "${actual}", wanted "${wanted}"`); };

// Open, unfiltered: the answer depends on whether any conversation exists at all.
expect("open, conversations exist in another status", inboxEmptySentence(base, true), "No open conversations.");
expect("open, none in any status", inboxEmptySentence(base, false), "No customer messages yet.");
expect("open, not known (check failed or not asked)", inboxEmptySentence(base, null), "No open conversations.");
// All conversations, unfiltered: empty means none at all, whatever was asked.
expect("all, empty", inboxEmptySentence({ ...base, status: "all" }, null), "No customer messages yet.");
expect("all, empty, even if the page thinks some exist", inboxEmptySentence({ ...base, status: "all" }, true), "No customer messages yet.");
// Anything narrowed says the filters left everything out.
for (const [name, extra] of [
  ["closed", { status: "closed" }], ["search", { query: "ring" }], ["label", { label: "urgent" }],
  ["unread only", { unreadOnly: true }], ["mine", { assignee: "me" }], ["unassigned", { assignee: "unassigned" }]
]) {
  expect(`narrowed by ${name}`, inboxEmptySentence({ ...base, ...extra }, false), "No conversations match these filters.");
}
// The default view is exactly open + anyone's + unfiltered.
expect("default view", isDefaultInboxView(base), true);
for (const [name, extra] of [["closed", { status: "closed" }], ["all", { status: "all" }], ["search", { query: "x" }], ["mine", { assignee: "me" }], ["unread", { unreadOnly: true }], ["label", { label: "x" }]]) {
  expect(`not the default view: ${name}`, isDefaultInboxView({ ...base, ...extra }), false);
}

// The screen: it renders the helper's sentence through t(), and the extra question is asked only for the default view.
const screen = fs.readFileSync(path.join(root, "app/inbox/InboxContent.tsx"), "utf8");
if (!/t\(inboxEmptySentence\(filters, anyConversation\)\)/.test(screen)) failures.push("the inbox does not render t(inboxEmptySentence(filters, anyConversation))");
if (!/next\.conversations\.length === 0 && isDefaultInboxView\(filters\)/.test(screen)) failures.push("the extra question is not limited to an empty default view");
if (/t\("No customer messages yet\."\)/.test(screen)) failures.push("the inbox still prints the old unconditional sentence");

if (failures.length) {
  console.error(`${failures.length} empty-list check(s) failed:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("Inbox empty list: all sentence and wiring checks passed.");

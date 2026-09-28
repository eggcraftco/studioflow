// The reaction chooser is drawn only where the server says a reaction may leave
// (`reactOut`, functions/inbox/customerInboxFunctions.js REACT_OUT_CHANNELS),
// and on a server that predates the field on WhatsApp only — never on an
// Instagram thread (28 Sep 2026: Meta refused the first two real reactions and
// the control is held while the cause is read). The helper is compiled with the
// web tree's own TypeScript and run; the screen's wiring is read from its source.
//
//   node scripts/check-inbox-react-out.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import os from "os";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

// 1. The helper's decisions.
const source = fs.readFileSync(path.join(root, "lib/studioflow/customerInbox.ts"), "utf8");
const helper = source.slice(source.indexOf("export function reactOutAvailable"), source.indexOf("export type CustomerInboxReactionResult"));
if (!helper.includes("export function metaErrorCode")) failures.push("customerInbox.ts: reactOutAvailable / metaErrorCode are missing");
const js = ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "inbox-react-out-")), "helper.mjs");
fs.writeFileSync(tmp, js);
const { reactOutAvailable, metaErrorCode } = await import(pathToFileURL(tmp).href);
const expect = (name, actual, wanted) => { if (actual !== wanted) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`); };
expect("server says Instagram off", reactOutAvailable({ reactOut: { available: false, reason: "instagram_diagnosis" }, channelMedium: "instagram" }), false);
expect("server says WhatsApp on", reactOutAvailable({ reactOut: { available: true, reason: "" }, channelMedium: "whatsapp" }), true);
expect("server says Instagram on (a later server change)", reactOutAvailable({ reactOut: { available: true, reason: "" }, channelMedium: "instagram" }), true);
expect("older server, Instagram thread", reactOutAvailable({ reactOut: null, channelMedium: "instagram" }), false);
expect("older server, WhatsApp thread", reactOutAvailable({ reactOut: undefined, channelMedium: "whatsapp" }), true);
expect("no thread", reactOutAvailable(null), false);
expect("Meta code with subcode", metaErrorCode({ details: { metaCode: 100, metaSubcode: 2534014 } }), "100.2534014");
expect("Meta code alone", metaErrorCode({ details: { metaCode: 10 } }), "10");
expect("not Meta's failure", metaErrorCode({ details: { reason: "window_closed" } }), "");
expect("no details", metaErrorCode(new Error("x")), "");

// 2. The screen's wiring: the chooser and the long-press both read the helper's answer.
const screen = fs.readFileSync(path.join(root, "app/inbox/InboxContent.tsx"), "utf8");
if (!/const canReactHere = reactOutAvailable\(thread\);/.test(screen)) failures.push("InboxContent.tsx: the chooser gate does not read reactOutAvailable(thread)");
if (!/if \(!canReactHere \|\| !mayLink \|\| message\.direction !== "inbound" \|\| message\.reactable !== true\) return null;/.test(screen)) failures.push("InboxContent.tsx: renderReactChooser is not gated on canReactHere");
if (!/if \(!canReactHere \|\| entry\.message\.direction !== "inbound"/.test(screen)) failures.push("InboxContent.tsx: the long-press is not gated on canReactHere");
if (!/metaErrorCode\(failure\)/.test(screen)) failures.push("InboxContent.tsx: the reaction notice does not carry Meta's code");
if (!/"Meta code \{code\}"/.test(screen)) failures.push("InboxContent.tsx: the Meta code sentence is not the translated one");

if (failures.length) {
  console.error(`${failures.length} problem(s):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("The reaction chooser follows the server's reactOut (Instagram off, WhatsApp on; WhatsApp only on an older server) and the notice carries Meta's code.");

// "Send the tracking details to the customer by e-mail?" on the web (8 Oct 2026).
//
// 1. The rules of lib/studioflow/trackingEmailRules.ts, compiled with the tree's own TypeScript
//    and run: a record for a previous number is not this number's result; a sent number is not
//    offered again, a failed one is; the result line keys; the address check matches the server's.
// 2. The screen: the Shipping card asks AFTER a saved tracking number (read from the source), the
//    section never sends on its own (only the dialog's Send calls the callable), the client sends
//    no link, and the dialog previews with `preview: true` before any send.
// 3. Every sentence the two components print has all eleven translations, through the app's own
//    studioT (language.ts and the tables it merges, compiled and run).
//
//   node scripts/check-tracking-email.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const expect = (name, actual, wanted) => {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tracking-email-check-"));
const compile = (rel, out) => {
  const source = fs.readFileSync(path.join(root, rel), "utf8");
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  js = js.replace(/from "\.\/([A-Za-z]+)"/g, 'from "./$1.mjs"');
  fs.writeFileSync(path.join(tmp, out), js);
  return path.join(tmp, out);
};
const exists = (rel) => fs.existsSync(path.join(root, rel));
const read = (rel) => (exists(rel) ? fs.readFileSync(path.join(root, rel), "utf8") : "");

// ---- 1. the rules
if (!exists("lib/studioflow/trackingEmailRules.ts")) failures.push("lib/studioflow/trackingEmailRules.ts does not exist");
const rules = await import(pathToFileURL(compile("lib/studioflow/trackingEmailRules.ts", "trackingEmailRules.mjs")).href);

const sentA = rules.trackingEmailRecordFrom({ trackingNumber: "A1", status: "sent", to: "Anna@Example.com", sentAtMs: 5, attempts: 1 });
const failedA = rules.trackingEmailRecordFrom({ trackingNumber: "A1", status: "failed", to: "anna@example.com", failedAtMs: 7, attempts: 2, lastError: "ECONNREFUSED" });
expect("record: lower-cased recipient", sentA.to, "anna@example.com");
expect("record: junk is null", rules.trackingEmailRecordFrom({ status: "sent" }), null);
expect("record: unknown status is null", rules.trackingEmailRecordFrom({ trackingNumber: "A1", status: "queued" }), null);
expect("record: an http link is dropped", rules.trackingEmailRecordFrom({ trackingNumber: "A1", status: "sent", link: "http://x" }).link, "");
expect("current: a record for another number is not shown", rules.currentTrackingEmail("B2", sentA), null);
expect("current: whitespace does not make a new number", rules.currentTrackingEmail(" A 1 ", sentA)?.status, "sent");
expect("offer: a new number is offered", rules.shouldOfferTrackingEmail("B2", sentA), true);
expect("offer: a number already sent is NOT offered", rules.shouldOfferTrackingEmail("A1", sentA), false);
expect("offer: a failed send is offered again", rules.shouldOfferTrackingEmail("A1", failedA), true);
expect("offer: no record, no number, no offer", rules.shouldOfferTrackingEmail("", null), false);
expect("line: sent", rules.trackingEmailResultLine(sentA), { key: "Tracking details e-mailed to {to} on {at}.", to: "anna@example.com", atMs: 5, error: "" });
expect("line: failed", rules.trackingEmailResultLine(failedA), { key: "Tracking e-mail to {to} failed on {at}: {error}", to: "anna@example.com", atMs: 7, error: "ECONNREFUSED" });
expect("line: none", rules.trackingEmailResultLine(null), null);
expect("fill", rules.fillResultLine("X {to} Y {at} Z {error}", { to: "a", at: "b", error: "c" }), "X a Y b Z c");
for (const ok of ["anna@example.com", "Other.Person@Example.ORG"]) expect(`email ok: ${ok}`, rules.isPlausibleEmail(ok), true);
for (const bad of ["", "anna@example", "a, b@example.com", "<a@b.co>", "a b@example.com", "a@b.co\nBcc: x@y.z"]) expect(`email bad: ${JSON.stringify(bad)}`, rules.isPlausibleEmail(bad), false);

// ---- 2. the screen
const detail = read("app/orders/OrderDetailContent.tsx");
const section = read("app/orders/OrderTrackingEmailSection.tsx");
const dialog = read("app/orders/TrackingEmailDialog.tsx");
const client = read("lib/studioflow/trackingEmail.ts");
const store = read("lib/studioflow/firestore.ts");
if (!section) failures.push("app/orders/OrderTrackingEmailSection.tsx does not exist");
if (!dialog) failures.push("app/orders/TrackingEmailDialog.tsx does not exist");
if (!client) failures.push("lib/studioflow/trackingEmail.ts does not exist");

// The question follows a successful save of the number, inside the Tracking row's onSave.
const trackingSave = detail.slice(detail.indexOf('const saved = await writeDetailsPatch({ trackingNumber: next }, "Tracking");'), detail.indexOf('const saved = await writeDetailsPatch({ trackingNumber: next }, "Tracking");') + 700);
expect("the card asks after the tracking number is saved", /if \(saved && cleanTrackingNumber\(next\)\) \{[\s\S]*?setTrackingEmailPrompt\(cleanTrackingNumber\(next\)\)/.test(trackingSave), true);
expect("the section is on the Shipping card with the saved number", /<OrderTrackingEmailSection[\s\S]*?promptForNumber=\{trackingEmailPrompt\}/.test(detail), true);
expect("the section reads the order's copy of the record", /orderRecord=\{order\.trackingEmail\}/.test(detail), true);
expect("the order type carries trackingEmail", /trackingEmail: TrackingEmailRecord \| null;/.test(store) && /trackingEmail: trackingEmailRecordFrom\(data\.trackingEmail\)/.test(store), true);

// Only the dialog's Send calls the sending function; the section and the card call nothing.
expect("the section never calls the sending function", /sendOrderTrackingEmail\(/.test(section), false);
expect("the card never calls the sending function", /sendOrderTrackingEmail\(/.test(detail), false);
expect("the dialog previews before anything is sent", /previewOrderTrackingEmail\(workspace, \{ orderId, language \}\)/.test(dialog), true);
expect("the dialog sends only from send()", (dialog.match(/sendOrderTrackingEmail\(workspace, /g) || []).length, 1);
expect("Send is a submit button the member presses", /type="submit"[^>]*disabled=\{sending \|\| !toValid\}/.test(dialog), true);
expect("the preview call carries preview: true", /preview: true/.test(client), true);
expect("the client sends no link, url or trackingUrl", /\b(link|url|trackingUrl):\s/.test(client.slice(client.indexOf("export async function sendOrderTrackingEmail"))), false);
expect("the section reads the server's row first", /doc\(db, "companies", workspace\.id, "trackingResults", orderId\)/.test(section), true);
expect("the shown record is the current number's", /currentTrackingEmail\(number, /.test(section) && /shouldOfferTrackingEmail\(number, record\)/.test(section), true);
expect("declining sends nothing and only hides the question", /setDeclinedNumber\(promptNumber\); onPromptHandled\(\);/.test(section), true);
expect("the no-address case is said plainly", /hasCustomerEmail \?/.test(dialog) && /no customer e-mail address/.test(dialog), true);
expect("the dispatch caveat is on the message", /not proof of dispatch/.test(dialog), true);
expect("a resend is explicit on the request", /resend: willResend/.test(dialog), true);

// ---- 3. every sentence the two components print, in all eleven languages, through studioT
for (const [rel, out] of [["lib/studioflow/macTranslations.ts", "macTranslations.mjs"], ["lib/studioflow/settingsContentTranslations.ts", "settingsContentTranslations.mjs"], ["lib/studioflow/shippingTranslations.ts", "shippingTranslations.mjs"], ["lib/studioflow/trackingEmailTranslations.ts", "trackingEmailTranslations.mjs"], ["lib/studioflow/screenGapTranslations.ts", "screenGapTranslations.mjs"]]) {
  if (exists(rel)) compile(rel, out); else failures.push(`${rel} does not exist`);
}
const { studioT } = await import(pathToFileURL(compile("lib/studioflow/language.ts", "language.mjs")).href);
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const sentences = new Set();
for (const src of [section, dialog]) {
  for (const m of src.matchAll(/\bt\("((?:[^"\\]|\\.)+)"\)/g)) sentences.add(m[1]);
}
const rulesSrc = read("lib/studioflow/trackingEmailRules.ts");
for (const m of rulesSrc.matchAll(/key: "([^"]+)"/g)) sentences.add(m[1]);
// A word that is the same in a language is not a missing translation (French "Message").
const SAME_WORD = { "Message": ["Français"] };
const untranslated = [];
for (const s of sentences) {
  const absent = LANGUAGES.filter((language) => studioT(s, language) === s && !(SAME_WORD[s] || []).includes(language));
  if (absent.length) untranslated.push(`${s} — ${absent.length === 11 ? "no entry" : `missing ${absent.join(", ")}`}`);
}
checks += sentences.size;
if (untranslated.length) failures.push(`${untranslated.length} of ${sentences.size} sentences are not in all twelve languages:\n    ${untranslated.join("\n    ")}`);
// Placeholders survive translation.
for (const key of ["Tracking details e-mailed to {to} on {at}.", "Tracking e-mail to {to} failed on {at}: {error}", "Already e-mailed to {to} on {at}. Sending again will deliver a second copy.", "The e-mail could not be sent: {error}"]) {
  for (const language of LANGUAGES) {
    const translated = studioT(key, language);
    for (const ph of key.match(/\{[a-z]+\}/g) || []) {
      checks += 1;
      if (!translated.includes(ph)) failures.push(`${language}: "${key}" lost ${ph}: ${translated}`);
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`check-tracking-email: ${failures.length} failure(s) of ${checks} checks`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`check-tracking-email: ${checks} checks passed (${sentences.size} sentences in all twelve languages).`);

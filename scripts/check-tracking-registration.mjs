// GN-13 17TRACK registration on the web (owner decisions 22 Oct 2026).
//
// 1. The rules (lib/studioflow/trackingRegistrationRules.ts), compiled and run: the setting is off
//    unless the server says `true`; missing numbers are 0; the usage line fills in.
// 2. The screens, from the source: Settings ▸ Integrations has the 17TRACK tile and screen; the switch
//    is disabled unless the server says the viewer may change it (owner); the screen tells apart numbers
//    a person adds (registered when asked, no switch needed) from shop-import numbers (the switch) and
//    shows used/limit for today and the month; the order panel says why a number is registered and,
//    when it could not be, the allowance used (owner follow-up 22 Oct).
// 3. Every sentence these screens print, and every fixed refusal sentence the server sends
//    (functions/orders/trackingRegistrations.js decisionMessage), has all eleven translations.
//
//   node scripts/check-tracking-registration.mjs
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tracking-registration-check-"));
const compile = (rel, out) => {
  let js = ts.transpileModule(fs.readFileSync(path.join(root, rel), "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  js = js.replace(/from "\.\/([A-Za-z]+)"/g, 'from "./$1.mjs"');
  fs.writeFileSync(path.join(tmp, out), js);
  return path.join(tmp, out);
};
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// ---- 1. rules
const R = await import(pathToFileURL(compile("lib/studioflow/trackingRegistrationRules.ts", "trackingRegistrationRules.mjs")).href);
const empty = R.trackingRegistrationSettingsFrom(null);
expect("off unless true", empty.autoRegister, false);
expect("cannot change unless true", empty.canChange, false);
expect("missing numbers are 0", [empty.used, empty.caps], [{ today: 0, month: 0 }, { daily: 0, monthly: 0 }]);
expect("a truthy non-boolean is still off", R.trackingRegistrationSettingsFrom({ autoRegister: "yes", canChange: 1 }).autoRegister, false);
const full = R.trackingRegistrationSettingsFrom({ autoRegister: true, canChange: true, caps: { daily: 10, monthly: 100 }, used: { today: 3, month: 41 }, outcomesThisMonth: { registered: 38, failed: 2, indeterminate: 1 }, providerPaused: false });
expect("server answer kept", [full.autoRegister, full.canChange, full.caps, full.used, full.outcomesThisMonth.indeterminate], [true, true, { daily: 10, monthly: 100 }, { today: 3, month: 41 }, 1]);
expect("usage line", R.usageLine("{used} of {limit}", 3, 10), "3 of 10");

// ---- 2. screens
const section = read("app/settings/TrackingRegistrationSection.tsx");
const page = read("app/settings/page.tsx");
const panel = read("app/orders/OrderLiveTrackingPanel.tsx");
const detail = read("app/orders/OrderDetailContent.tsx");
const orders = read("lib/studioflow/orders.ts");
expect("settings: tile + screen wired", [/TRACK17_TILE/.test(page), /managing === "tracking" \? <TrackingRegistrationSection/.test(page), /rawRequested === "tracking"/.test(page)], [true, true, true]);
expect("settings: the switch is disabled unless the server allows the change", /disabled=\{!view\.canChange \|\| busy\}/.test(section), true);
expect("settings: only the owner-only save callable writes it (no direct Firestore write)", [/saveTrackingRegistrationSettings\(workspace, next\)/.test(section), /firebase\/firestore|setDoc|updateDoc/.test(section)], [true, false]);
expect("settings: two kinds told apart; shows used/limit today and month", [/are registered with 17TRACK when you ask; this switch is not needed for them/.test(section), /numbers nobody added by hand/.test(section), /view\.used\.today, view\.caps\.daily/.test(section), /view\.used\.month, view\.caps\.monthly/.test(section)], [true, true, true, true]);
expect("panel: why registered (this number only), allowance when not registered, link to settings", [/registeredVia === "member"/.test(panel), /registeredVia === "automatic"/.test(panel), /cleanNumber\(String\(registration\.trackingNumber/.test(panel), /needsRegistration && allowance/.test(panel), /\/settings\?section=tracking/.test(panel)], [true, true, true, true, true]);
expect("panel/detail: no owner-only register button any more (a person's request needs no setting)", [/Register with 17TRACK/.test(panel), /canRegisterNew/.test(detail), /confirmNewRegistration/.test(orders + detail)], [false, false, false]);

// ---- 3. translations
for (const m of read("lib/studioflow/language.ts").matchAll(/from "\.\/([A-Za-z]+)"/g)) compile(`lib/studioflow/${m[1]}.ts`, `${m[1]}.mjs`);
const { studioT } = await import(pathToFileURL(compile("lib/studioflow/language.ts", "language.mjs")).href);
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const literal = (src) => [...src.matchAll(/\bt\("((?:[^"\\]|\\.)+)"\)/g)].map((m) => JSON.parse(`"${m[1]}"`));
const SERVER = [
  "Not registered: today's 17TRACK limit is reached", "Not registered: this month's 17TRACK limit is reached", "Not registered: too many new numbers this hour",
  "Not registered: 17TRACK registrations are paused", "Registering with 17TRACK", "Not registered: 17TRACK refused it recently",
  "The workspace's 17TRACK registrations for today are used up. Try again tomorrow, or choose the courier.",
  "The workspace's 17TRACK registrations for this month are used up. Choose the courier.",
  "Too many new 17TRACK registrations in the last hour. Try again later.",
  "New 17TRACK registrations are paused: NivaDesk's 17TRACK allowance is nearly used up.",
  "This number is being registered with 17TRACK. Check again in a few minutes.",
  "17TRACK could not register this number recently. Try again tomorrow, or choose the courier.",
  "This number is not registered with 17TRACK yet.",
  "Registration needed"
];
const sentences = new Set([...literal(section).filter((s) => !["Loading...", "Saved."].includes(s)), "Saved.", "Could not load the 17TRACK settings.", "Could not save the 17TRACK settings.",
  "Registered with 17TRACK because it was added to this order.", "Registered with 17TRACK automatically (shop import).",
  "17TRACK registrations used: today {today} of {daily}, this month {month} of {monthly}.", "17TRACK settings", "17TRACK tracking", "Follow any courier's tracking number through 17TRACK.", ...SERVER]);
for (const sentence of sentences) {
  const missing = LANGS.filter((lang) => studioT(sentence, lang) === sentence);
  expect(`translated in all eleven: ${sentence.slice(0, 60)}`, missing, []);
}
for (const placeholder of ["{used}", "{limit}"]) expect(`placeholder survives: ${placeholder}`, LANGS.filter((l) => !studioT("{used} of {limit}", l).includes(placeholder)), []);
for (const placeholder of ["{today}", "{daily}", "{month}", "{monthly}"]) expect(`placeholder survives: ${placeholder}`, LANGS.filter((l) => !studioT("17TRACK registrations used: today {today} of {daily}, this month {month} of {monthly}.", l).includes(placeholder)), []);

if (failures.length) { console.error(failures.join("\n")); console.error(`check-tracking-registration: ${failures.length} of ${checks} checks FAILED`); process.exit(1); }
console.log(`check-tracking-registration: ${checks} checks passed (${sentences.size} sentences in all twelve languages).`);

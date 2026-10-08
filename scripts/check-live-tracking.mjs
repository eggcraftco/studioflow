// The order's live courier status on the web (29 Sep 2026).
//
// 1. The rules of lib/studioflow/liveTracking.ts, compiled with the tree's own TypeScript and run:
//    an answer written for a previous number is not shown; the trackingResults row wins over the
//    order's fields; the badge names the provider that answered (17TRACK, DHL Express); a healthy
//    DHL answer ("supported") draws no support row; a message key the web has no words for shows
//    the server's own sentence.
// 2. The screen asks the server to follow a number the moment it is saved (and when the courier
//    changes while a number is saved) through the registerTracking callable — read from the source.
// 3. Every sentence the panel can print has all eleven translations, through the app's own studioT
//    (language.ts and the three tables it merges, compiled and run).
//
//   node scripts/check-live-tracking.mjs
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "live-tracking-check-"));
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
if (!exists("lib/studioflow/liveTracking.ts")) failures.push("lib/studioflow/liveTracking.ts does not exist: the web reads no live status at all");
const L = exists("lib/studioflow/liveTracking.ts") ? await import(pathToFileURL(compile("lib/studioflow/liveTracking.ts", "liveTracking.mjs")).href) : null;
if (L) {
const stored = (number, over = {}) => Object.fromEntries(Object.entries({ trackingNumber: number, provider: "17TRACK", status: "InTransit", statusText: "InTransit", carrier: "UPS", ...over }).map(([k, v]) => [`tracking::${k}`, v]));
const fields = (number, over) => L.trackingFieldsFromCustomFields(stored(number, over));

// A number changed on the web after an earlier registration: the old Delivered is not this number's.
let v = L.currentTrackingValues("1Z999AA10123456812", fields("1Z999AA10123456700", { status: "Delivered", statusText: "Delivered" }), { trackingNumber: "1Z999AA10123456700", status: "Delivered" });
expect("stale stored + stale row -> Not Registered", L.trackingDisplayStatus(v), "Not Registered");
expect("stale -> no carrier", v.carrier ?? "", "");
// The row wins over the order's fields (the webhook writes only the row for an exception).
v = L.currentTrackingValues("1Z1", fields("1Z1"), { trackingNumber: "1Z1", status: "Exception", statusText: "Exception", checkpoint: "Returning" });
expect("row wins", [L.trackingDisplayStatus(v), v.checkpoint, v.carrier], ["Exception", "Returning", "UPS"]);
// A row written for another number (a late push for an old number) does not replace the order's answer.
v = L.currentTrackingValues("1Z1", fields("1Z1"), { trackingNumber: "1Z0", status: "Delivered", statusText: "Delivered" });
expect("row for another number ignored", L.trackingDisplayStatus(v), "InTransit");
// The server clears these four on purpose; an empty value in the row is the current answer.
v = L.currentTrackingValues("1Z1", fields("1Z1", { supportMessageKey: "checking_support", error: "old" }), { trackingNumber: "1Z1", supportMessageKey: "", error: "" });
expect("cleared keys stay cleared", [v.supportMessageKey, v.error], ["", ""]);
// Spaces inside a number are not a different number.
v = L.currentTrackingValues(" 1Z 1 ", fields("1Z1"), null);
expect("spaces ignored", L.trackingDisplayStatus(v), "InTransit");
expect("no number, nothing", L.currentTrackingValues("", fields("1Z1"), null), {});
// Who answered.
expect("provider default", L.trackingProvider({}), "17TRACK");
expect("provider 17TRACK", L.trackingProvider({ provider: "17TRACK" }), "17TRACK");
expect("provider DHL", L.trackingProvider({ provider: "DHL Express" }), "DHL Express");
expect("provider Royal Mail", L.trackingProvider({ provider: "Royal Mail" }), "Royal Mail");
// Support row and messages.
expect("supported draws no row", L.trackingSupportLabel("supported"), "");
expect("active draws no row", L.trackingSupportLabel("active"), "");
expect("waiting", L.trackingSupportLabel("waiting"), "Waiting");
expect("carrier_required", L.trackingSupportLabel("carrier_required"), "Carrier required");
expect("dhl message", L.trackingSupportMessage("x", "dhl_express_direct"), "This waybill is tracked directly with DHL Express, so it was not registered with 17TRACK as well.");
expect("unknown key -> server sentence", L.trackingSupportMessage("A new server sentence.", "some_new_key"), "A new server sentence.");
expect("registered_waiting", L.trackingSupportMessage("Registered - waiting for 17TRACK update", "registered_waiting"), "Registered with 17TRACK and waiting for the next carrier update.");
// Status words and tones.
expect("InTransit", L.trackingStatusLabel("InTransit"), "In transit");
expect("AvailableForPickup", L.trackingStatusLabel("AvailableForPickup"), "Available for pickup");
expect("carrier sentence passes", L.trackingStatusLabel("Label created"), "Label created");
expect("tone delivered", L.trackingTone("Delivered", "active"), L.TRACKING_TONES.green);
expect("tone delivery failed is not green", L.trackingTone("DeliveryFailure", "active"), L.TRACKING_TONES.red);
expect("tone exception", L.trackingTone("Exception", "active"), L.TRACKING_TONES.red);
expect("tone waiting", L.trackingTone("Registered", "waiting"), L.TRACKING_TONES.blue);
expect("tone carrier required", L.trackingTone("Carrier Required", "carrier_required"), L.TRACKING_TONES.orange);
// Where "Open Tracking" goes.
expect("open 17TRACK", L.trackingOpenUrl({}, "1Z 1"), "https://www.17track.net/en/track-details?nums=1Z1");
expect("open DHL", L.trackingOpenUrl({ provider: "DHL Express", trackingUrl: "" }, "1234567890"), "https://www.dhl.com/gb-en/home/tracking/tracking-express.html?submit=1&tracking-id=1234567890");
expect("open stored https", L.trackingOpenUrl({ trackingUrl: "https://example.test/t" }, "1"), "https://example.test/t");
expect("open refuses non-https", L.trackingOpenUrl({ trackingUrl: "javascript:alert(1)" }, "1"), "https://www.17track.net/en/track-details?nums=1");

}

// ---- 2. the screen registers what it saves
const screen = fs.readFileSync(path.join(root, "app/orders/OrderDetailContent.tsx"), "utf8");
const shipping = screen.slice(screen.indexOf('case "shipping":'), screen.indexOf('case "schedule":'));
expect("tracking save then register", /writeDetailsPatch\(\{ trackingNumber: next \}, "Tracking"\)[\s\S]{0,200}requestLiveTracking\(next,/.test(shipping), true);
expect("courier save then register", /writeDetailsPatch\(\{ courier: value \}, "Courier"\)[\s\S]{0,300}requestLiveTracking\(order\.trackingNumber, String\(value\)/.test(shipping), true);
expect("panel on the card", shipping.includes("<OrderLiveTrackingPanel"), true);
expect("DHL panel still on the card", shipping.includes("<OrderShipmentsPanel"), true);
const orders = fs.readFileSync(path.join(root, "lib/studioflow/orders.ts"), "utf8");
expect("the callable is registerTracking", /registerOrderTrackingFromWeb[\s\S]{0,700}httpsCallable<[\s\S]{0,120}?>\(functions, "registerTracking"\)/.test(orders), true);

// ---- 3. every sentence the panel prints, in all eleven languages, through studioT
for (const [rel, out] of [["lib/studioflow/macTranslations.ts", "macTranslations.mjs"], ["lib/studioflow/settingsContentTranslations.ts", "settingsContentTranslations.mjs"], ["lib/studioflow/shippingTranslations.ts", "shippingTranslations.mjs"], ["lib/studioflow/trackingEmailTranslations.ts", "trackingEmailTranslations.mjs"]]) compile(rel, out);
const { studioT } = await import(pathToFileURL(compile("lib/studioflow/language.ts", "language.mjs")).href);
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const panel = read("app/orders/OrderLiveTrackingPanel.tsx");
const lib = read("lib/studioflow/liveTracking.ts");
if (!panel) failures.push("app/orders/OrderLiveTrackingPanel.tsx does not exist: the Shipping card has no live status panel");
const sentences = new Set();
for (const m of panel.matchAll(/\bt\("((?:[^"\\]|\\.)+)"\)/g)) sentences.add(m[1]);
for (const m of panel.matchAll(/\["([A-Z][A-Za-z ]+)", /g)) sentences.add(m[1]);
for (const m of lib.matchAll(/return "((?:[^"\\]|\\.)+)";/g)) if (!/^https?:|^\d|^17TRACK$|^DHL Express$|^Royal Mail$/.test(m[1])) sentences.add(m[1]);
for (const m of lib.matchAll(/: "([A-Z][^"]+)"/g)) sentences.add(m[1]);
for (const m of shipping.matchAll(/text: "([^"]+)"/g)) sentences.add(m[1]);
for (const s of ["No tracking number yet.", "Add a courier and tracking number to enable live status.", "Could not refresh live tracking."]) sentences.add(s);
// A word that is the same in a language is not a missing translation (Spanish "Error").
const SAME_WORD = { "Error": ["Español (Spanish)"] };
const untranslated = [];
for (const s of sentences) {
  const absent = LANGUAGES.filter((language) => studioT(s, language) === s && !(SAME_WORD[s] || []).includes(language));
  if (absent.length) untranslated.push(`${s} — ${absent.length === 11 ? "no entry" : `missing ${absent.join(", ")}`}`);
}
checks += sentences.size;
if (untranslated.length) failures.push(`${untranslated.length} of ${sentences.size} panel sentences are not in all twelve languages:\n    ${untranslated.join("\n    ")}`);

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`check-live-tracking: ${failures.length} failure(s) of ${checks} checks`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`check-live-tracking: ${checks} checks passed (${sentences.size} panel sentences in all twelve languages).`);

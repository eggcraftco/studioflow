// The Calendar tile in Settings ▸ Integrations and its card on the public /integrations page (31 Oct 2026).
//   npm run test:calendar-integration-card
//
// The owner's rule: say on the site that Google Calendar / Outlook exist, and write in the descriptions and in Settings how
// it works. What this keeps true, from source:
//   1. the app tile: one "Calendar" tile in "Payments, files & automation", native, opening its own card, with the two brand
//      names and "Read only" as chips and "outlook" among its search words
//   2. the site card: same name, same group, "live"; its three sentences exist in English and all eleven languages; they say
//      read only, that nobody else sees the meetings, that the Calendar is on the web app today, and that Microsoft's
//      publisher check is open (the Outlook caveat) — and never the word "pilot"
//   3. Settings: the card is wired (tile, deep link, render); it does NOT connect (no consent call, no callable) — it opens
//      /calendar, where connecting lives — and it speaks only for this person; every sentence it and the tile show has a
//      translation in all eleven languages
//   4. the state is the person's own reading (signed-in uid, two plain document reads — never the availability callable,
//      which also syncs at the provider), and a failed read is never "Not connected"
//   5. the member guide no longer says the connection is "being opened gradually" and points to the Settings tile
// The source rules run first against known-bad mutants, so a rule that cannot fail is itself a failure.
import { readFileSync } from "node:fs";
import path from "node:path";

const webRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (rel: string) => readFileSync(path.join(webRoot, rel), "utf8");

let checks = 0;
let failures = 0;
function expect(name: string, ok: boolean, detail = "") {
  checks += 1;
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}${detail ? `  <- ${detail}` : ""}`); }
}
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];

const integrations = read("lib/studioflow/integrations.ts");
const directory = read("app/integrations/IntegrationsDirectory.tsx");
const publicT = read("lib/publicSite/translations.ts");
const section = read("app/settings/CalendarIntegrationSection.tsx");
const settingsPage = read("app/settings/page.tsx");
const calendarT = read("lib/studioflow/calendarTranslations.ts");
const guide = read("lib/publicSite/guide.ts");
const external = read("lib/studioflow/calendarExternal.ts");

// ---- 1. the app tile --------------------------------------------------------------------------------------
function tileProblems(source: string): string[] {
  const out: string[] = [];
  const block = source.match(/\{\s*(?:\/\/[^\n]*\n\s*)*id: "calendar", name: "Calendar"[\s\S]*?manage: "[a-z]*",\s*\}/)?.[0] ?? "";
  if (!block) return ["no Calendar tile in INTEGRATION_PROVIDERS"];
  if (!/category: "automation", kind: "native"/.test(block)) out.push("the tile is not a native one in 'Payments, files & automation'");
  if (!/manage: "calendar"/.test(block)) out.push("the tile does not open its own card");
  if (!/capabilities: \["Google Calendar", "Outlook", "Read only"\]/.test(block)) out.push("the chips are not Google Calendar, Outlook, Read only");
  if (!/keywords: \[[^\]]*"outlook"/.test(block)) out.push("'outlook' does not find the tile");
  if (!/blurb: "[^"]*read only[^"]*Only you can see them\."/.test(block)) out.push("the blurb does not say read only and only you");
  if (!/\| "calendar";/.test(source)) out.push("'calendar' is not an IntegrationManageTarget");
  return out;
}
const tileMutants: Array<[string, string]> = [
  ["tile gone", integrations.replace('id: "calendar", name: "Calendar"', 'id: "cal", name: "Cal"')],
  ["tile in the wrong group", integrations.replace('id: "calendar", name: "Calendar", category: "automation"', 'id: "calendar", name: "Calendar", category: "commerce"')],
  ["tile opens nothing", integrations.replace('    manage: "calendar",\n  },\n];', '    manage: "",\n  },\n];')],
  ["no Outlook chip", integrations.replace('capabilities: ["Google Calendar", "Outlook", "Read only"]', 'capabilities: ["Google Calendar", "Read only"]')],
  ["a blurb that hides who sees it", integrations.replace(" Only you can see them.", "")],
];

// ---- 2. the site card -------------------------------------------------------------------------------------
function siteProblems(dir: string, table: string): string[] {
  const out: string[] = [];
  const row = dir.split("\n").find((line) => /^\s*\{ name: "Calendar",/.test(line)) ?? "";
  if (!row) return ["no Calendar card on /integrations"];
  if (!/category: "Payments, files & automation"/.test(row)) out.push("the card is not in the app's group");
  if (!/state: "live"/.test(row)) out.push("the card is not 'live'");
  if (/\blogo:|\bmark:|\bwebsite:/.test(row)) out.push("the card carries a logo, an initial or a provider site");
  for (const part of ["summary", "detail", "note"]) {
    const key = `integrations.${part}.calendar`;
    const count = (table.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")) || []).length;
    if (count !== 12) out.push(`${key} is in ${count} of 12 language tables`);
  }
  const english = (part: string) => table.match(new RegExp(`^  "integrations\\.${part}\\.calendar": "([^"]*)"`, "m"))?.[1] ?? "";
  const all = `${english("summary")} ${english("detail")} ${english("note")}`;
  if (/pilot/i.test(all)) out.push("the card says 'pilot', which it no longer is");
  if (!/read-only/.test(english("detail")) || !/never writes to your calendar/.test(english("detail"))) out.push("the detail does not say read only and never writes");
  if (!/nobody else in the workspace, the owner included, can see your meetings/.test(english("detail"))) out.push("the detail does not say nobody else sees the meetings");
  if (!/Calendar is on the web app today/.test(english("detail"))) out.push("the detail does not say the Calendar is on the web app today");
  if (!/Outlook/.test(english("note")) || !/still verifying NivaDesk as a publisher/.test(english("note"))) out.push("the note does not carry Microsoft's open publisher check");
  return out;
}
const siteMutants: Array<[string, string, string]> = [
  ["card gone", directory.replace('{ name: "Calendar", category', '{ name: "Kalender", category'), publicT],
  ["card coming soon", directory.replace(/(\{ name: "Calendar",[^\n]*)state: "live"/, '$1state: "comingSoon"'), publicT],
  ["card with a logo", directory.replace('{ name: "Calendar", category', '{ name: "Calendar", logo: "x.svg", category'), publicT],
  ["a language missing", directory, publicT.replace(/\n    "integrations\.note\.calendar": "[^\n]*Google Takvim herkese[^\n]*/, "")],
  ["a pilot card", directory, publicT.replace("Google Calendar is open to everyone.", "Google Calendar is a pilot.")],
  ["the Outlook caveat dropped", directory, publicT.replace("Microsoft is still verifying NivaDesk as a publisher, so a work", "A work")],
  ["the web-only limit dropped", directory, publicT.replace(" The Calendar is on the web app today.", "")],
];

// ---- 3. Settings: wired, does not connect, translated ----------------------------------------------------
function settingsProblems(sec: string, page: string, calT: string, ints: string): string[] {
  const out: string[] = [];
  if (!/import \{ CalendarIntegrationSection \} from "\.\/CalendarIntegrationSection";/.test(page)) out.push("the section is not imported");
  if (!/\{managing === "calendar" \? <CalendarIntegrationSection workspace=\{workspace\} language=\{language\} \/> : null\}/.test(page)) out.push("the section is not rendered for the tile");
  if (!/calendar: "integrations",/.test(page) || !/rawRequested === "calendar"/.test(page)) out.push("?section=calendar does not open the tile");
  if (/startCalendarConnect|httpsCallable|window\.location\.assign|finishCalendarConnect|disconnectCalendar|syncCalendarNow/.test(sec)) out.push("the section connects, syncs or disconnects — that lives on the Calendar screen");
  if (/calendarConnectorsAvailable/.test(sec)) out.push("the section calls the availability callable, which also syncs at the provider");
  if (!/<Link className="button" href="\/calendar"/.test(sec)) out.push("no way to the Calendar screen");
  if (!/auth\.currentUser\?\.uid/.test(sec) || !/loadCalendarTileSignal\(companyId, uid\)/.test(sec)) out.push("the section does not read this person's own connections");
  if (!/\.then\(\(next\) => \{ if \(active\) setAnswer\(next\); \}\)/.test(sec) || !/let active = true;/.test(sec) || !/return \(\) => \{ active = false; \};/.test(sec)) out.push("an answer for a previous workspace can land");
  if (!/\.catch\(\(\) => \{ if \(active\) setAnswer\(null\); \}\)/.test(sec)) out.push("a failed read is not shown as 'could not check'");
  if (!/Could not check your calendar connections just now/.test(sec)) out.push("no sentence for a failed read");
  if (!/Nobody else in the workspace, the owner included, sees your meetings/.test(sec)) out.push("the section does not say nobody else sees the meetings");
  if (!/Microsoft is still verifying NivaDesk as a publisher/.test(sec)) out.push("the section does not carry the Outlook caveat");
  const sentences = new Set<string>();
  for (const m of sec.matchAll(/\bt\("((?:[^"\\]|\\.)+)"\)/g)) sentences.add(m[1]);
  const blurb = ints.match(/id: "calendar", name: "Calendar"[\s\S]*?blurb: "([^"]+)"/)?.[1];
  if (blurb) sentences.add(blurb);
  if (sentences.size < 12) out.push(`read ${sentences.size} sentences — the reader is out of date`);
  for (const sentence of sentences) {
    const key = JSON.stringify(sentence).slice(1, -1).replace(/\\u2019/g, "’");
    const entry = calT.includes(`  "${key}": {`) ? calT.split(`  "${key}": {`)[1]?.split("\n")[0] ?? "" : "";
    // Sentences another screen already translates (Calendar, Connected, Loading…) live in the shared tables.
    if (!entry) continue;
    for (const language of LANGUAGES) if (!entry.includes(`"${language}":`)) out.push(`"${sentence.slice(0, 50)}…" has no ${language} translation`);
  }
  for (const own of ["How it works", "Open Calendar", "The connection has ended. Open Calendar and connect again.", "Could not check your calendar connections just now. Try again in a moment."]) {
    if (!calT.includes(`  "${own}": {`)) out.push(`"${own.slice(0, 40)}" is not in the Calendar translation table`);
  }
  return out;
}
const settingsMutants: Array<[string, string, string, string, string]> = [
  ["not rendered", section, settingsPage.replace('{managing === "calendar" ? <CalendarIntegrationSection', '{managing === "calendar-x" ? <CalendarIntegrationSection'), calendarT, integrations],
  ["the section connects", section.replace('import { auth } from "@/lib/firebase/client";', 'import { auth } from "@/lib/firebase/client";\nimport { startCalendarConnect } from "@/lib/studioflow/calendarExternal";'), settingsPage, calendarT, integrations],
  ["no way to Calendar", section.replace('href="/calendar"', 'href="/orders"'), settingsPage, calendarT, integrations],
  ["a failed read looks like 'not connected'", section.replace(".catch(() => { if (active) setAnswer(null); })", ".catch(() => { if (active) setAnswer({ connections: {} }); })"), settingsPage, calendarT, integrations],
  ["a late answer lands", section.replace("if (active) setAnswer(next)", "setAnswer(next)"), settingsPage, calendarT, integrations],
  ["speaks for the team", section.replace("Nobody else in the workspace, the owner included, sees your meetings.", "Your team sees your meetings."), settingsPage, calendarT, integrations],
  ["the Outlook caveat dropped", section.replace("Microsoft is still verifying NivaDesk as a publisher.", "Outlook works."), settingsPage, calendarT, integrations],
  ["the section calls the availability callable", section.replace('import { auth } from "@/lib/firebase/client";', 'import { auth } from "@/lib/firebase/client";\nimport { calendarConnectorsAvailable } from "@/lib/studioflow/calendarExternal";'), settingsPage, calendarT, integrations],
  ["a sentence loses a language", section, settingsPage, calendarT.replace(/("Open Calendar": \{[^\n]*?)"Deutsch": "[^"]*", /, "$1"), integrations],
];

// ---- 4. the signal is the person's -----------------------------------------------------------------------
function signalProblems(ints: string, ext: string): string[] {
  const out: string[] = [];
  if (!/auth\.currentUser\?\.uid \? loadCalendarTileSignal\(companyId, auth\.currentUser\.uid\) : Promise\.reject/.test(ints)) out.push("the loader does not read the signed-in person's own connections");
  if (!/calendar: calendar\.status === "fulfilled" \? calendar\.value : null,/.test(ints)) out.push("a failed calendar read is not null ('could not check')");
  if (!/if \(tile === undefined\) return \{ state: "checking" \};\s*if \(tile === null\) return \{ state: "unverified" \};/.test(ints)) out.push("not read yet / failed read are not 'checking' / 'unverified'");
  if (!/row\.status !== "active"\)\) return \{ state: "attention", detail: "Reconnect required" \}/.test(ints)) out.push("a connection that needs the person is not 'attention'");
  const body = ext.match(/export async function loadCalendarTileSignal[\s\S]*?\n\}\n/)?.[0] ?? "";
  if (!body) out.push("no loadCalendarTileSignal in calendarExternal.ts");
  if (/calendarConnectorsAvailable|httpsCallable/.test(body)) out.push("the tile's loader calls a callable (the availability callable also syncs at the provider)");
  if (!/getDoc\(doc\(db, "companies", companyId, "calendarConnections", `\$\{uid\}_\$\{provider\}`\)\)/.test(body)) out.push("the loader does not read the person's own connection documents");
  if (/catch/.test(body)) out.push("the loader swallows a failed read");
  return out;
}
const signalMutants: Array<[string, string, string]> = [
  ["loader reads nobody", integrations.replace("auth.currentUser?.uid ? loadCalendarTileSignal(companyId, auth.currentUser.uid) : Promise.reject(new Error(\"not signed in\"))", "Promise.resolve(null)"), external],
  ["failed read swallowed", integrations.replace('calendar: calendar.status === "fulfilled" ? calendar.value : null,', "calendar: calendar.status === \"fulfilled\" ? calendar.value : { connections: {} },"), external],
  ["failed read looks available", integrations.replace('if (tile === null) return { state: "unverified" };', 'if (tile === null) return { state: "available" };'), external],
  ["reconnect ignored", integrations.replace('row.status !== "active"', 'row.status === "never"'), external],
  ["the loader calls the availability callable", integrations, external.replace("  const snaps = await Promise.all(\n    CALENDAR_PROVIDERS.map(", "  await calendarConnectorsAvailable(companyId);\n  const snaps = await Promise.all(\n    CALENDAR_PROVIDERS.map(")],
  ["the loader swallows a failed read", integrations, external.replace("  const snaps = await Promise.all(\n    CALENDAR_PROVIDERS.map((provider) => getDoc(doc(db, \"companies\", companyId, \"calendarConnections\", `${uid}_${provider}`))),\n  );", "  const snaps = await Promise.all(\n    CALENDAR_PROVIDERS.map((provider) => getDoc(doc(db, \"companies\", companyId, \"calendarConnections\", `${uid}_${provider}`)).catch(() => null)),\n  ) as never;")],
];

// ---- 5. the member guide ---------------------------------------------------------------------------------
function guideProblems(source: string): string[] {
  const out: string[] = [];
  if (/being opened gradually|kademeli olarak açılıyor/.test(source)) out.push("the guide still says the connection is being opened gradually");
  if (!/Settings ▸ Integrations ▸ Calendar explains these steps/.test(source)) out.push("the English guide does not point to the Settings tile");
  if (!/Ayarlar ▸ Entegrasyonlar ▸ Takvim bu adımları anlatır/.test(source)) out.push("the Turkish guide does not point to the Settings tile");
  return out;
}
const guideMutants: Array<[string, string]> = [
  ["the old sentence back", guide.replace("Connecting Google Calendar and Outlook is open to every member of every workspace, on the web app.", "it is being opened gradually.")],
  ["no pointer (English)", guide.replace("Settings ▸ Integrations ▸ Calendar explains these steps", "Settings explains these steps")],
  ["no pointer (Turkish)", guide.replace("Ayarlar ▸ Entegrasyonlar ▸ Takvim bu adımları anlatır", "Ayarlar bu adımları anlatır")],
];

// ---- run ----------------------------------------------------------------------------------------------------
const verbose = (problems: string[]) => { if (process.env.CALENDAR_CARD_VERBOSE) for (const p of problems) console.log("      caught:", p); };
for (const [name, mutant] of tileMutants) { const p = mutant === integrations ? [] : tileProblems(mutant); expect(`tile rules catch the mutant: ${name}`, p.length > 0, "the mutant did not apply, or passed"); verbose(p); }
for (const [name, dir, table] of siteMutants) { const p = dir === directory && table === publicT ? [] : siteProblems(dir, table); expect(`site-card rules catch the mutant: ${name}`, p.length > 0, "the mutant did not apply, or passed"); verbose(p); }
for (const [name, sec, page, calT, ints] of settingsMutants) { const p = sec === section && page === settingsPage && calT === calendarT && ints === integrations ? [] : settingsProblems(sec, page, calT, ints); expect(`settings rules catch the mutant: ${name}`, p.length > 0, "the mutant did not apply, or passed"); verbose(p); }
for (const [name, ints, ext] of signalMutants) { const p = ints === integrations && ext === external ? [] : signalProblems(ints, ext); expect(`signal rules catch the mutant: ${name}`, p.length > 0, "the mutant did not apply, or passed"); verbose(p); }
for (const [name, mutant] of guideMutants) { const p = mutant === guide ? [] : guideProblems(mutant); expect(`guide rules catch the mutant: ${name}`, p.length > 0, "the mutant did not apply, or passed"); verbose(p); }

const tileReal = tileProblems(integrations);
expect("the app tile is the one tile the rule describes", tileReal.length === 0, tileReal.join("; "));
const siteReal = siteProblems(directory, publicT);
expect("the site card says what is true, in 12 languages", siteReal.length === 0, siteReal.join("; "));
const settingsReal = settingsProblems(section, settingsPage, calendarT, integrations);
expect("Settings explains the Calendar and never connects", settingsReal.length === 0, settingsReal.join("; "));
const signalReal = signalProblems(integrations, external);
expect("the tile's state is this person's own reading", signalReal.length === 0, signalReal.join("; "));
const guideReal = guideProblems(guide);
expect("the member guide matches the card", guideReal.length === 0, guideReal.join("; "));

console.log(failures ? `${failures} of ${checks} calendar-integration-card checks FAILED` : `All ${checks} calendar-integration-card checks passed.`);
process.exit(failures ? 1 : 0);

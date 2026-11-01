// Online booking (1 Nov 2026): the customer's public page (/book/<slug>), the manage page (/book/manage#<token>),
// Settings ▸ Online booking and the booking block in the Calendar.
//   npm run test:online-booking
//
// What this keeps true, from source and from the page helpers themselves:
//   1. the customer's words: all twelve languages complete, same placeholders as English, Arabic right-to-left
//   2. the public pages: never indexed, no referrer, the serving host rides along, the manage token is read from the
//      "#" (never a query string a server or analytics would log), nothing is kept in the browser, no cookie banner
//   3. framing: only /book/<slug> may sit in another site's frame; the manage page (which can cancel) never; every
//      other page keeps X-Frame-Options DENY; and the embed code only listens to messages from our own origin
//   4. Settings: the section is registered (union, list, search words, render) and shown to the owner and admins only;
//      every sentence it and the Calendar block show is in all eleven other languages
//   5. the Calendar: the booking block appears only on an online-booking entry (bk_<id>) and takes the place of a
//      bare delete there
//   6. the helpers: dates in the business's zone, the day strip, morning/afternoon/evening, price and cut-off lines
// The source rules run first against known-bad mutants, so a rule that cannot fail is itself a failure.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BOOKING_COPY,
  BOOKING_LANGUAGES,
  addDaysKey,
  bookingSlug,
  bookingToken,
  cutoffLabel,
  daysBetween,
  priceLabel,
  stripKeys,
  timesByPart,
  todayKeyIn,
  zoneCity
} from "../lib/publicSite/onlineBooking.ts";
import { paymentReturnDirection } from "../lib/publicSite/paymentReturn.ts";
import { studioT } from "../lib/studioflow/language.ts";

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

const pageServer = read("app/book/[slug]/page.tsx");
const pageClient = read("app/book/[slug]/BookingPageContent.tsx");
const manageServer = read("app/book/manage/page.tsx");
const manageClient = read("app/book/manage/ManageBookingContent.tsx");
const nextConfig = read("next.config.ts");
const cookie = read("components/CookieConsent.tsx");
const robots = read("app/robots.ts");
const settingsPage = read("app/settings/page.tsx");
const section = read("app/settings/OnlineBookingSection.tsx");
const block = read("app/calendar/CalendarBookingBlock.tsx");
const panel = read("app/calendar/CalendarDetailPanel.tsx");
const lib = read("lib/studioflow/onlineBooking.ts");

// ---- 1. the customer's words --------------------------------------------------------------------------------
type Copy = Record<string, Record<string, string>>;
function copyProblems(copy: Copy): string[] {
  const out: string[] = [];
  const en = copy.en || {};
  const keys = Object.keys(en);
  for (const lang of BOOKING_LANGUAGES) {
    const row = copy[lang];
    if (!row) { out.push(`${lang}: missing`); continue; }
    for (const key of keys) {
      const value = row[key];
      if (typeof value !== "string" || !value.trim()) { out.push(`${lang}.${key}: empty`); continue; }
      const want = (en[key].match(/\{\w+\}/g) || []).sort().join(",");
      const have = (value.match(/\{\w+\}/g) || []).sort().join(",");
      if (want !== have) out.push(`${lang}.${key}: placeholders ${have} instead of ${want}`);
    }
    if (lang !== "en") {
      const same = keys.filter((k) => row[k] === en[k] && !/^\{n\} min$/.test(en[k]));
      if (same.length > 3) out.push(`${lang}: ${same.length} lines still English (${same.slice(0, 3).join(", ")})`);
    }
  }
  return out;
}
const COPY = BOOKING_COPY as unknown as Copy;
const copyMutants: Array<[string, Copy]> = [
  ["a language gone", Object.fromEntries(Object.entries(COPY).filter(([k]) => k !== "hi"))],
  ["an empty line", { ...COPY, de: { ...COPY.de, confirm: "" } }],
  ["a lost placeholder", { ...COPY, fr: { ...COPY.fr, doneBody: "Nous avons envoyé les détails." } }],
  ["a language left in English", { ...COPY, ja: { ...COPY.en } }]
];

// ---- 2. the public pages ------------------------------------------------------------------------------------
function publicProblems(server: string, client: string, mServer: string, mClient: string, cookieSrc: string, robotsSrc: string): string[] {
  const out: string[] = [];
  for (const [name, src] of [["/book/<slug>", server], ["/book/manage", mServer]] as const) {
    if (!/robots: \{ index: false, follow: false, nocache: true \}/.test(src)) out.push(`${name}: not noindex/nofollow`);
    if (!/referrer: "no-referrer"/.test(src)) out.push(`${name}: sends a referrer`);
    if (!/paymentReturnLanguage\(\(await headers\(\)\)\.get\("accept-language"\)\)/.test(src)) out.push(`${name}: language not from Accept-Language`);
  }
  if (!/httpsCallable<[\s\S]{0,80}?>\(functions, "bookingPublic"\)/.test(client) || !/host: host\(\)/.test(client)) out.push("booking page does not call bookingPublic with the serving host");
  if (!/website: form\.website/.test(client) || !/openedAt: openedAt\.current/.test(client)) out.push("booking page drops the robot checks (trap field, time on page)");
  if (!/consent: form\.consent/.test(client)) out.push("booking page does not send the consent tick");
  if (!/bookingToken\(typeof window !== "undefined" \? window\.location\.hash : ""\)/.test(mClient)) out.push("manage page does not read the token from the #");
  if (/searchParams|useSearchParams|location\.search/.test(mClient + mServer)) out.push("manage page reads a query string");
  if (/localStorage|sessionStorage|document\.cookie/.test(client + mClient)) out.push("a public page keeps something in the browser");
  if (!/const PAYMENT_PATHS = \[[^\]]*\/\^\\\/book\\\/\//.test(cookieSrc)) out.push("the cookie banner shows on /book");
  if (!/"\/book\/",/.test(robotsSrc)) out.push("robots.txt does not keep crawlers off /book/");
  return out;
}
const publicMutants: Array<[string, string, string, string, string, string, string]> = [
  ["booking page indexable", pageServer.replace("index: false", "index: true"), pageClient, manageServer, manageClient, cookie, robots],
  ["manage page sends a referrer", pageServer, pageClient, manageServer.replace('referrer: "no-referrer"', 'referrer: "origin"'), manageClient, cookie, robots],
  ["host not sent", pageServer, pageClient.replace("host: host()", "host: \"\""), manageServer, manageClient, cookie, robots],
  ["another callable", pageServer, pageClient.replace('(functions, "bookingPublic")', '(functions, "somethingElse")'), manageServer, manageClient, cookie, robots],
  ["token from the query string", pageServer, pageClient, manageServer, manageClient.replace("window.location.hash", "window.location.search"), cookie, robots],
  ["trap field dropped", pageServer, pageClient.replace("website: form.website,", ""), manageServer, manageClient, cookie, robots],
  ["remembers in localStorage", pageServer, pageClient.replace("useEffect(() => { openedAt.current = Date.now(); }, []);", "useEffect(() => { openedAt.current = Date.now(); localStorage.setItem('x', '1'); }, []);"), manageServer, manageClient, cookie, robots],
  ["cookie banner back", pageServer, pageClient, manageServer, manageClient, cookie.replace(", /^\\/book\\//", ""), robots],
  ["crawlable", pageServer, pageClient, manageServer, manageClient, cookie, robots.replace('  "/book/",\n', "")]
];

// ---- 3. framing -----------------------------------------------------------------------------------------------
function frameProblems(config: string, libSrc: string): string[] {
  const out: string[] = [];
  if (!/\{ key: "X-Frame-Options", value: "DENY" \}/.test(config)) out.push("X-Frame-Options DENY is gone");
  const rule = config.match(/source: "\/book\/:slug\(([^"]+)\)",\s*headers: \[([\s\S]*?)\]/);
  if (!rule) return [...out, "no frame rule for /book/<slug>"];
  if (!rule[1].includes("(?!manage$)")) out.push("the frame rule does not exclude the manage page");
  if (!/\{ key: "X-Frame-Options", value: "ALLOWALL" \}/.test(rule[2])) out.push("the frame rule does not lift X-Frame-Options");
  if (/key: "Content-Security-Policy/.test(config)) out.push("a static CSP header (it carries no nonce; middleware owns the policy)");
  const frameIdx = config.indexOf('source: "/book/:slug(');
  const globalIdx = config.indexOf("headers: SECURITY_HEADERS");
  if (!(frameIdx > globalIdx && globalIdx > 0)) out.push("the frame rule is not after the global headers (it would lose)");
  if (/source: "\/book\/:path\*"|source: "\/book\/manage/.test(config)) out.push("a frame rule covers the manage page");
  if (!/if\(e\.origin!=="\$\{new URL\(url\)\.origin\}"\)return;/.test(libSrc)) out.push("the embed script listens to any origin");
  return out;
}
const frameMutants: Array<[string, string, string]> = [
  ["manage frameable", nextConfig.replace("(?!manage$)", ""), lib],
  ["X-Frame-Options not lifted", nextConfig.replace('headers: [{ key: "X-Frame-Options", value: "ALLOWALL" }]', 'headers: []'), lib],
  ["a static CSP sneaks in", nextConfig.replace('headers: [{ key: "X-Frame-Options", value: "ALLOWALL" }]', 'headers: [{ key: "X-Frame-Options", value: "ALLOWALL" }, { key: "Content-Security-Policy", value: "frame-ancestors *" }]'), lib],
  ["DENY dropped", nextConfig.replace('{ key: "X-Frame-Options", value: "DENY" },', ""), lib],
  ["embed listens to anyone", nextConfig, lib.replace('if(e.origin!=="${new URL(url).origin}")return;', "")]
];

// ---- 4. Settings ---------------------------------------------------------------------------------------------
function literals(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g)) out.add(JSON.parse(`"${m[1]}"`));
  const status = src.match(/const STATUS_LABEL[\s\S]*?\};/);
  if (status) for (const m of status[0].matchAll(/:\s*"([^"]+)"/g)) out.add(m[1]);
  const wd = src.match(/const WEEKDAY_NAMES = \[([^\]]+)\]/);
  if (wd) for (const m of wd[1].matchAll(/"([^"]+)"/g)) out.add(m[1]);
  return [...out];
}
// Words that are the same as English in some languages (a real translation, not a gap).
const SAME_AS_ENGLISH_OK = new Set(["Email", "Name", "Notes", "Optional", "Service", "Confirmation", "Consultation", "{n} min", "Online booking", "Price", "Request"]);
function settingsProblems(page: string, sec: string, blk: string, translate: (s: string, l: string) => string): string[] {
  const out: string[] = [];
  if (!/\| "online-booking";/.test(page)) out.push("'online-booking' is not a SettingsSectionId");
  if (!/\{ id: "online-booking", title: "Online booking"/.test(page)) out.push("not in SETTINGS_SECTIONS");
  if (!/"online-booking": "online booking appointment/.test(page)) out.push("no search words");
  if (!/case "online-booking":\s*return <OnlineBookingSection workspace=\{workspace\} language=\{language\} \/>;/.test(page)) out.push("not rendered");
  if (!/if \(sectionId === "online-booking"\) return normalizeWorkspaceRole\(workspace\.role\) === "admin";/.test(page)) out.push("members can see the setup (owner and admins only)");
  for (const text of [...literals(sec), ...literals(blk)]) {
    const missing = LANGUAGES.filter((l) => translate(text, l) === text && !(SAME_AS_ENGLISH_OK.has(text) && l !== "Türkçe"));
    if (missing.length) out.push(`"${text.slice(0, 60)}" untranslated in ${missing.length} language(s): ${missing.slice(0, 3).join(", ")}`);
  }
  return out;
}
const settingsMutants: Array<[string, string, string, string]> = [
  ["section not rendered", settingsPage.replace('case "online-booking":', 'case "online-booking-x":'), section, block],
  ["shown to every member", settingsPage.replace('if (sectionId === "online-booking") return normalizeWorkspaceRole(workspace.role) === "admin";', 'if (sectionId === "online-booking") return true;'), section, block],
  ["a new sentence with no translation", settingsPage, section.replace('t("Booking rules")', 't("Booking rules, freshly reworded")'), block],
  ["a block sentence with no translation", settingsPage, section, block.replace('t("Move booking")', 't("Shift this booking")')]
];

// ---- 5. the Calendar -----------------------------------------------------------------------------------------
function calendarProblems(panelSrc: string, libSrc: string): string[] {
  const out: string[] = [];
  if (!/const bookingId = entry \? bookingIdFromEntryId\(entry\.id\) : null;/.test(panelSrc)) out.push("the panel does not recognise a booking entry");
  if (!/\{bookingId && companyId \? <CalendarBookingBlock companyId=\{companyId\} bookingId=\{bookingId\}/.test(panelSrc)) out.push("the booking block is not shown");
  if (!/access\.remove && !archived && !confirmDelete && !bookingId \?/.test(panelSrc)) out.push("a bare delete is offered on a booking entry");
  if (!/export const BOOKING_ENTRY_PREFIX = "bk_";/.test(libSrc)) out.push("the entry prefix changed (the server writes bk_<id>)");
  return out;
}
const calendarMutants: Array<[string, string, string]> = [
  ["no block", panel.replace("{bookingId && companyId ? <CalendarBookingBlock", "{false && bookingId && companyId ? <CalendarBookingBlock"), lib],
  ["delete back", panel.replace("&& !bookingId ?", "?"), lib],
  ["prefix drift", panel, lib.replace('BOOKING_ENTRY_PREFIX = "bk_"', 'BOOKING_ENTRY_PREFIX = "booking_"')]
];

// ---- mutants first ---------------------------------------------------------------------------------------------
for (const [name, mutant] of copyMutants) expect(`copy rules catch the mutant: ${name}`, copyProblems(mutant).length > 0);
for (const [name, ...m] of publicMutants) expect(`public-page rules catch the mutant: ${name}`, publicProblems(...(m as [string, string, string, string, string, string])).length > 0);
for (const [name, cfg, l] of frameMutants) expect(`frame rules catch the mutant: ${name}`, frameProblems(cfg, l).length > 0);
for (const [name, p, s, b] of settingsMutants) expect(`settings rules catch the mutant: ${name}`, settingsProblems(p, s, b, (t, l) => studioT(t, l as never)).length > 0);
for (const [name, p, l] of calendarMutants) expect(`calendar rules catch the mutant: ${name}`, calendarProblems(p, l).length > 0);

// ---- the real sources ------------------------------------------------------------------------------------------
const show = (list: string[]) => list.slice(0, 6).join(" | ");
let p = copyProblems(COPY); expect("1 the customer's words: twelve languages, same placeholders", p.length === 0, show(p));
expect("1 Arabic reads right to left", paymentReturnDirection("ar") === "rtl" && paymentReturnDirection("tr") === "ltr");
p = publicProblems(pageServer, pageClient, manageServer, manageClient, cookie, robots); expect("2 public pages: noindex, no referrer, host, # token, nothing kept, no banner", p.length === 0, show(p));
p = frameProblems(nextConfig, lib); expect("3 framing: only /book/<slug>, never manage; embed listens to us only", p.length === 0, show(p));
p = settingsProblems(settingsPage, section, block, (t, l) => studioT(t, l as never)); expect("4 Settings: registered, owner/admin only, every sentence translated", p.length === 0, show(p));
p = calendarProblems(panel, lib); expect("5 Calendar: booking block on bk_ entries in place of delete", p.length === 0, show(p));

// ---- 6. helpers ---------------------------------------------------------------------------------------------------
expect("6 today in the business's zone (just after midnight UTC in Tokyo is already tomorrow)", todayKeyIn("Asia/Tokyo", Date.parse("2026-11-02T16:00:00Z")) === "2026-11-03" && todayKeyIn("Europe/London", Date.parse("2026-11-02T16:00:00Z")) === "2026-11-02");
expect("6 day keys across a month end and a clock change", addDaysKey("2026-10-24", 8) === "2026-11-01" && daysBetween("2026-10-24", "2026-11-01") === 8 && stripKeys("2026-12-30", 3).join(",") === "2026-12-30,2026-12-31,2027-01-01");
const parts = timesByPart([{ time: "09:00", startMs: 1 }, { time: "12:00", startMs: 2 }, { time: "16:59", startMs: 3 }, { time: "17:00", startMs: 4 }]);
expect("6 morning / afternoon / evening, empty parts dropped", parts.map((x) => `${x.part}:${x.times.length}`).join(",") === "morning:1,afternoon:2,evening:1" && timesByPart([{ time: "10:00", startMs: 1 }]).length === 1);
expect("6 price lines", priceLabel({ priceMode: "fixed", priceMinor: 2500 }, "GBP", "en") === "£25.00" && priceLabel({ priceMode: "from", priceMinor: 4000 }, "GBP", "en") === "from £40.00" && priceLabel({ priceMode: "hidden", priceMinor: null }, "GBP", "en") === "" && priceLabel({ priceMode: "free", priceMinor: null }, "GBP", "tr") === "Ücretsiz");
expect("6 cut-off lines", cutoffLabel(1440, "en") === "24 hours" && cutoffLabel(2880, "en") === "2 days" && cutoffLabel(120, "en") === "2 hours" && cutoffLabel(30, "tr") === "30 dk");
expect("6 slug and token shapes", bookingSlug("EGGcraft") === "eggcraft" && bookingSlug("a--b") === "" && bookingSlug("ab") === "" && bookingToken("#" + "a".repeat(32)) === "a".repeat(32) && bookingToken("short") === "");
expect("6 zone city", zoneCity("America/New_York") === "New York" && zoneCity("Europe/London") === "London");

console.log(`\nonline booking: ${checks - failures}/${checks} pass${failures ? "" : "; reds: none"}`);
process.exit(failures ? 1 : 0);

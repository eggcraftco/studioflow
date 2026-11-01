// Admin Insights ▸ Browsers (1 Nov 2026): the on-screen rules in lib/studioflow/adminBrowsers.ts and the wiring of the
// Browsers page, Live's "Browsers" card and Online time's browser line + AI filter. The labels themselves (family,
// version, AI browser / AI agent / normal / bot / can't tell) are decided on the server: functions insights/browser.js,
// tested there against a fixture list of real user agents and client hints.
//
//  1. Every family key the server can send has a name; apps are named as apps; an unknown Chromium says what it
//     calls itself, in quotes, and is never called Chrome.
//  2. Kinds are listed in a fixed order with shares of sessions; empty kinds are left out; shares never divide by 0.
//  3. The people filter: AI = AI browser or AI agent; search reads address, name and workspace.
//  4. The page is a section of Insights (Pulse ▸ Browsers, #browsers), asks getSitePresence for `browsers: { period }`
//     in the hub's view, and says plainly when the server or the labels are not there yet.
//  5. Online time shows each person's browsers and can keep only AI users, keeping their real rank.
//  6. Live shows the kinds right now without naming anyone.
//  7. It fits a phone: the person row folds into one column; nothing can push the page wider.
//
//   npx tsx scripts/check-admin-browsers.mts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  AI_CRAWLERS,
  BROWSER_FILTERS,
  BROWSER_KINDS,
  browserLabel,
  browsersLine,
  counterRows,
  familyLabel,
  familyOrder,
  filterPeople,
  isAiKind,
  isLegacyBrowsers,
  kindRows,
  labelsStartInside,
  shareLabel,
  siteKindRows,
  sortedBrowsers,
  versionsLabel,
  type BrowserItem
} from "../lib/studioflow/adminBrowsers";

let failures = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL ${name} — ${(error as Error).message.split("\n")[0]}`); }
};

const page = readFileSync(new URL("../components/AdminBrowsersPanel.tsx", import.meta.url), "utf8");
const kindsFile = readFileSync(new URL("../components/AdminBrowserKinds.tsx", import.meta.url), "utf8");
const live = readFileSync(new URL("../components/AdminLivePanel.tsx", import.meta.url), "utf8");
const online = readFileSync(new URL("../components/AdminOnlineTimePanel.tsx", import.meta.url), "utf8");
const hub = readFileSync(new URL("../components/AdminInsightsHub.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const lib = readFileSync(new URL("../lib/studioflow/adminBrowsers.ts", import.meta.url), "utf8");

// The family keys functions insights/browser.js can store (FAMILIES, printed from the 1 Nov 2026 package) and the app
// keys presence.js adds. Kept here by hand on purpose: a new server key without a name on screen turns this red.
const SERVER_FAMILIES = [
  "chatgpt_agent", "google_agent", "manus_agent", "cloudflare_browser", "signed_agent", "comet", "arc_search",
  "nova_act", "claude_agent", "chatgpt_atlas", "genspark", "chatgpt_user", "claude_user", "perplexity_user",
  "mistral_user", "gemini_fetch", "meta_ai_fetch", "amazon_user", "kimi_user", "duckassistbot", "gptbot",
  "oai_searchbot", "oai_adsbot", "claude_searchbot", "claudebot", "perplexitybot", "google_vertexbot", "googleother",
  "meta_ai", "bytespider", "ccbot", "amazonbot", "cohere", "mistralbot", "ai_crawler_other", "youbot", "diffbot",
  "timpibot", "googlebot", "google_fetcher", "bingbot", "applebot", "yandexbot", "duckduckbot", "baiduspider",
  "petalbot", "seznambot", "bravebot", "facebook_preview", "meta_other", "twitterbot", "linkedinbot", "slackbot",
  "discordbot", "whatsapp_preview", "telegrambot", "pinterestbot", "preview_other", "headless", "lighthouse",
  "http_client", "other_bot", "edge", "opera_gx", "opera", "brave", "vivaldi", "yandex", "samsung", "duckduckgo",
  "whale", "avast", "chrome", "uc", "miui", "huawei", "silk", "in_app_facebook", "in_app_instagram",
  "in_app_linkedin", "in_app_tiktok", "in_app_snapchat", "in_app_wechat", "in_app_line", "google_app", "firefox",
  "ie", "safari", "chromium_unknown", "android_webview", "ios_webview", "other", "none", "app_ios", "app_ipados",
  "app_ios_unknown", "app_mac", "app_android"
];

check("B1 every family the server can send has its own name (no raw key on screen)", () => {
  for (const family of SERVER_FAMILIES) {
    const label = familyLabel(family);
    assert.ok(label && label !== family.replace(/_/g, " "), `no name for ${family}`);
  }
  assert.strictEqual(familyLabel("app_ipados"), "iPad app");
  assert.strictEqual(familyLabel("app_mac"), "Mac app");
  assert.strictEqual(familyLabel("app_android"), "Android app");
  assert.strictEqual(familyLabel("app_ios"), "iPhone app");
  assert.strictEqual(familyLabel("chromium_unknown"), "Chromium (unknown)");
});

check("B2 browser labels: version after the name; an unknown Chromium quotes what it calls itself", () => {
  assert.strictEqual(browserLabel({ family: "chrome", major: "142" }), "Chrome 142");
  assert.strictEqual(browserLabel({ family: "app_ios", major: "2.4" }), "iPhone app 2.4");
  assert.strictEqual(browserLabel({ family: "chromium_unknown", major: "141", brand: "Nova" }), "Chromium (unknown) 141 · says “Nova”");
  assert.strictEqual(browserLabel({ family: "safari" }), "Safari");
  assert.ok(!browserLabel({ family: "chromium_unknown", major: "141" }).includes("Chrome "), "an unknown Chromium is never called Chrome");
});

check("B3 kinds: fixed order, shares of sessions, empty kinds left out, no division by zero", () => {
  assert.deepStrictEqual(BROWSER_KINDS.map(kind => kind.key), ["ai_browser", "ai_agent", "normal", "unknown", "bot", "app", "unclassified"]);
  const rows = kindRows({
    normal: { sessions: 6, members: 3, unidentified: 0, people: 3 },
    ai_agent: { sessions: 1, members: 1, unidentified: 0, people: 1 },
    app: { sessions: 3, members: 2, unidentified: 1, people: 3 },
    bot: { sessions: 0, members: 0, unidentified: 0, people: 0 }
  });
  assert.deepStrictEqual(rows.map(row => [row.key, row.sessions, row.shareLabel]), [["ai_agent", 1, "10%"], ["normal", 6, "60%"], ["app", 3, "30%"]]);
  assert.strictEqual(kindRows(null).length, 0);
  assert.strictEqual(kindRows(null, { keepEmpty: true }).length, 7);
  assert.strictEqual(shareLabel(0, 0), "—");
  assert.strictEqual(shareLabel(1, 300), "<1%");
  assert.strictEqual(shareLabel(2, 3), "67%");
});

check("B4 AI means AI browser or AI agent; bots and can't-tell are not AI", () => {
  assert.ok(isAiKind("ai_browser") && isAiKind("ai_agent"));
  for (const kind of ["normal", "bot", "unknown", "app", "unclassified"]) assert.ok(!isAiKind(kind), kind);
  assert.ok(AI_CRAWLERS.has("gptbot") && AI_CRAWLERS.has("claudebot") && !AI_CRAWLERS.has("googlebot"));
});

const people = [
  { uid: "a", kinds: ["normal", "ai_agent"], email: "ada@hart.example.test", name: "Ada", workspace: "Hart & Grain" },
  { uid: "b", kinds: ["app"], email: "ben@luma.example.test", name: "", workspace: "Luma Ceramics" },
  { uid: "c", kinds: ["unknown"], email: "", name: "Cem", workspace: "" },
  { uid: "d", kinds: ["normal"], email: "dan@oak.example.test", name: "", workspace: "Oak Lane" }
] as const;

check("B5 people filter: by kind and by address, name or workspace", () => {
  const ids = (filter: Parameters<typeof filterPeople>[1], q = "") => filterPeople([...people] as never[], filter, q).map((p: { uid: string }) => p.uid);
  assert.deepStrictEqual(ids("all"), ["a", "b", "c", "d"]);
  assert.deepStrictEqual(ids("ai"), ["a"]);
  assert.deepStrictEqual(ids("normal"), ["a", "d"]);
  assert.deepStrictEqual(ids("apps"), ["b"]);
  assert.deepStrictEqual(ids("other"), ["c"]);
  assert.deepStrictEqual(ids("all", "LUMA"), ["b"]);
  assert.deepStrictEqual(ids("all", "cem"), ["c"]);
  assert.deepStrictEqual(BROWSER_FILTERS.map(f => f.key), ["all", "ai", "normal", "apps", "other"]);
});

check("B6 a person's browsers: AI first; the Online time line names AI and can't-tell kinds", () => {
  const items: BrowserItem[] = [
    { family: "chrome", major: "142", kind: "normal", brand: "", sessions: 2, lastSeenMs: 2 },
    { family: "chatgpt_agent", major: "142", kind: "ai_agent", brand: "", sessions: 1, lastSeenMs: 1 },
    { family: "app_mac", major: "2.4", kind: "app", brand: "", sessions: 1, lastSeenMs: 0 }
  ];
  assert.deepStrictEqual(sortedBrowsers(items).map(item => item.family), ["chatgpt_agent", "chrome", "app_mac"]);
  assert.strictEqual(browsersLine(items), "ChatGPT agent 142 (AI agent) · Chrome 142 · Mac app 2.4");
  assert.strictEqual(browsersLine([...items, { ...items[0], family: "firefox" }], 2), "ChatGPT agent 142 (AI agent) · Chrome 142 +2");
  assert.strictEqual(browsersLine([]), "");
  assert.strictEqual(versionsLabel([{ major: "142", sessions: 3 }, { major: "141", sessions: 1 }]), "142 ×3, 141");
  assert.strictEqual(versionsLabel([]), "—");
  const sorted = [{ kind: "normal", sessions: 9 }, { kind: "ai_browser", sessions: 1 }, { kind: "app", sessions: 4 }].sort(familyOrder);
  assert.deepStrictEqual(sorted.map(row => row.kind), ["ai_browser", "normal", "app"]);
});

check("B7 website visitors: kinds with shares of labelled visits; crawlers listed by name, AI crawlers marked", () => {
  const site = { days: ["2026-11-01"], visits: 12, labelledVisits: 10, kinds: { normal: 8, unknown: 1, ai_browser: 1 }, browsers: { chrome: 6, safari: 2, chromium_unknown: 1, other: 1 }, agents: { gptbot: 3, googlebot: 2 }, readable: true };
  assert.deepStrictEqual(siteKindRows(site).map(row => [row.key, row.visits, row.shareLabel]), [["ai_browser", 1, "10%"], ["normal", 8, "80%"], ["unknown", 1, "10%"]]);
  assert.deepStrictEqual(counterRows(site.agents).map(row => [row.label, row.count, row.aiCrawler]), [["GPTBot (OpenAI crawler)", 3, true], ["Googlebot", 2, false]]);
  assert.deepStrictEqual(counterRows(site.browsers, 2).map(row => row.family), ["chrome", "safari"]);
  assert.deepStrictEqual(siteKindRows(null), []);
});

check("B8 older server / labels not there yet are said, not shown as zero", () => {
  assert.ok(isLegacyBrowsers({}));
  assert.ok(!isLegacyBrowsers({ browsers: {} }));
  assert.ok(!isLegacyBrowsers(null));
  assert.ok(labelsStartInside({ recordedSinceMs: null, startMs: 0 }));
  assert.ok(labelsStartInside({ recordedSinceMs: 10 * 60000, startMs: 0 }));
  assert.ok(!labelsStartInside({ recordedSinceMs: 60000, startMs: 0 }));
  assert.ok(page.includes("The server is still on the previous version"));
  assert.ok(page.includes("Not checked"));
});

check("B9 the page is Pulse ▸ Browsers (#browsers) and asks getSitePresence for `browsers` in the hub's view", () => {
  assert.ok(hub.includes('{ id: "browsers", label: "Browsers" }'));
  assert.ok(hub.includes('page === "browsers" ? <AdminBrowsersPanel view={view} onViewChange={setView} />'));
  assert.ok(page.includes('httpsCallable<{ view: AdminView; browsers: { period: OnlinePeriod } }, BrowsersResponse>(functions, "getSitePresence")'));
  assert.ok(page.includes("callable({ view, browsers: { period } })"));
  assert.ok(page.includes('checked={view === "business"}') && page.includes("Hide internal accounts"));
  assert.ok(page.includes("BROWSER_FILTERS.map") && page.includes('type="search"'));
});

check("B10 Online time: each person's browsers on the row; 'AI browsers & agents only' keeps the real rank", () => {
  assert.ok(online.includes("browsersLine(person.browsers)"));
  assert.ok(online.includes("AI browsers &amp; agents only"));
  assert.ok(online.includes("rank={aiOnly ? allPeople.indexOf(person) + 1 : index + 1}"));
  assert.ok(online.includes("disabled={Boolean(board) && !browsersKnown}"), "the filter waits for a server that sends browsers");
});

check("B11 Live: a 'Browsers' card with kinds and families right now, no person named", () => {
  const card = live.slice(live.indexOf('title="Browsers"'), live.indexOf('title="What this cannot see"'));
  assert.ok(card.includes("kindRows(now.browserKinds"));
  assert.ok(card.includes("now.browsers"));
  assert.ok(!/email|uid|personLabel/.test(card));
  assert.ok(kindsFile.includes("export function BrowserKindBadge") && kindsFile.includes("export function KindBars"));
});

check("B12 fits a phone: the person row folds into one column; no fixed column wider than a phone", () => {
  const block = css.slice(css.indexOf("/* Admin Insights ▸ Browsers"), css.indexOf("/* Admin Insights ▸ Online time"));
  assert.ok(block.length > 100, "Browsers CSS block present");
  assert.ok(/@media \(max-width: 640px\)[\s\S]*\.admin-browser-person \{\s*grid-template-columns: minmax\(0, 1fr\);/.test(block));
  assert.ok(block.includes(".admin-table-scroll") && block.includes("overflow-x: auto;"));
  assert.ok(!/grid-template-columns:[^;]*\b\d{3,}px/.test(block), "no fixed-width column wider than a phone");
});

check("B13 no address in the page sources; the honest limits are on the page", () => {
  for (const source of [page, lib, kindsFile]) assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(source));
  assert.ok(page.includes("send exactly what Chrome, Edge or Opera send"));
  assert.ok(page.includes("never guessed") && page.includes("not proof"));
  assert.ok(page.includes("Claude in Chrome"));
});

if (failures) {
  console.log(`check-admin-browsers: ${failures} FAILED`);
  process.exit(1);
}
console.log("check-admin-browsers: all checks pass");

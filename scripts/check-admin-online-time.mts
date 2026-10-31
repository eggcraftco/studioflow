// Admin Insights ▸ Online time (31 Oct 2026): the on-screen rules in lib/studioflow/adminOnlineTime.ts and the
// wiring of the page. The counting itself (2-minute slots, devices unioned, older apps kept apart, internal
// accounts) is the server's: functions insights/presence.js, tested in the functions package.
//
//  1. Durations, last seen, the per-app split and the range label read the way the page shows them.
//  2. Minutes are only claimed once they are recorded: "none" ranks by active hours, "partial" says from when.
//  3. The page is a section of Insights (Pulse ▸ Online time, #onlinetime), asks getSitePresence for
//     `leaderboard: { period }` in the hub's view, and says plainly when the server does not know the list yet.
//  4. "Hide internal accounts" is the hub's own business / QA view, not a second filter.
//  5. The older apps' time is its own row, never a ranked person.
//  6. It fits a phone: the row folds into one column, nothing can push the page wider.
//
//   npx tsx scripts/check-admin-online-time.mts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  ONLINE_PERIODS,
  appSplit,
  appSplitLabel,
  barPercent,
  coverage,
  durationLabel,
  internalLabel,
  isLegacyLeaderboard,
  isOnlineNow,
  lastSeenLabel,
  periodRangeLabel,
  personLabel
} from "../lib/studioflow/adminOnlineTime";

let failures = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL ${name} — ${(error as Error).message.split("\n")[0]}`); }
};

const NOW = Date.UTC(2026, 9, 31, 15, 0);

check("O1 durations: minutes under an hour, then hours and padded minutes, never days", () => {
  assert.strictEqual(durationLabel(0), "0 min");
  assert.strictEqual(durationLabel(46), "46 min");
  assert.strictEqual(durationLabel(60), "1 h");
  assert.strictEqual(durationLabel(185), "3 h 05 min");
  assert.strictEqual(durationLabel(26 * 60 + 10), "26 h 10 min");
  assert.strictEqual(durationLabel(undefined), "0 min");
  assert.strictEqual(durationLabel(-4), "0 min");
});

check("O2 last seen: now inside Live's 2 minutes, then minutes, hours, a date", () => {
  assert.strictEqual(lastSeenLabel(NOW - 30000, NOW), "in an app now");
  assert.ok(isOnlineNow(NOW - 119000, NOW));
  assert.ok(!isOnlineNow(NOW - 121000, NOW));
  assert.strictEqual(lastSeenLabel(NOW - 12 * 60000, NOW), "12 min ago");
  assert.strictEqual(lastSeenLabel(NOW - 3 * 3600000 - 60000, NOW), "3 h ago");
  assert.match(lastSeenLabel(NOW - 3 * 86400000, NOW), /28/);
  assert.strictEqual(lastSeenLabel(null, NOW), "—");
});

check("O3 per-app split keeps the owner's app order and drops apps with no time", () => {
  assert.deepStrictEqual(appSplit({ mac: 60, web: 130, android: 0 }).map(app => [app.key, app.minutes]), [["web", 130], ["mac", 60]]);
  assert.strictEqual(appSplitLabel({ mac: 60, web: 130 }), "Web 2 h 10 min · Mac 1 h");
  assert.strictEqual(appSplitLabel({ ios_unknown: 300 }), "iPhone/iPad (older app) 5 h");
  assert.strictEqual(appSplitLabel({}), "");
});

check("O4 who: the address first, then the name, then why there is neither; internal marks", () => {
  assert.strictEqual(personLabel({ email: "a@b.test", name: "Ada", accountFound: true }), "a@b.test");
  assert.strictEqual(personLabel({ email: "", name: "Ada", accountFound: true }), "Ada");
  assert.strictEqual(personLabel({ email: "", name: "", accountFound: false }), "Deleted account");
  assert.strictEqual(personLabel({ email: "", name: "", accountFound: null }), "Account without an address");
  assert.strictEqual(internalLabel({ internal: "staff", workspaceFlag: "" }), "NivaDesk staff");
  assert.strictEqual(internalLabel({ internal: "workspace", workspaceFlag: "qa" }), "Flagged workspace · qa");
  assert.strictEqual(internalLabel({ internal: "", workspaceFlag: "qa" }), "");
});

check("O5 periods: three, in order; the range label names UK days", () => {
  assert.deepStrictEqual(ONLINE_PERIODS.map(p => p.key), ["today", "yesterday", "7d"]);
  assert.strictEqual(periodRangeLabel({ period: "today", firstDay: "2026-10-31", lastDay: "2026-10-31" }), "Today so far (UK)");
  assert.strictEqual(periodRangeLabel({ period: "yesterday", firstDay: "2026-10-30", lastDay: "2026-10-30" }), "Yesterday · Fri 30 Oct");
  assert.strictEqual(periodRangeLabel({ period: "7d", firstDay: "2026-10-25", lastDay: "2026-10-31" }), "Sun 25 Oct – Sat 31 Oct (UK days)");
});

check("O6 minutes are claimed only once recorded; the bar falls back to active hours", () => {
  assert.strictEqual(coverage({ recordedSinceMs: null, startMs: NOW - 86400000, slotMinutes: 2 }), "none");
  assert.strictEqual(coverage({ recordedSinceMs: NOW - 3600000, startMs: NOW - 86400000, slotMinutes: 2 }), "partial");
  assert.strictEqual(coverage({ recordedSinceMs: NOW - 2 * 86400000, startMs: NOW - 86400000, slotMinutes: 2 }), "full");
  const people = [{ minutes: 90, activeHours: 2 }, { minutes: 45, activeHours: 4 }, { minutes: 0, activeHours: 0 }];
  assert.deepStrictEqual(people.map(p => barPercent(p, people, false)), [100, 50, 0]);
  assert.deepStrictEqual(people.map(p => barPercent(p, people, true)), [50, 100, 0]);
  assert.ok(isLegacyLeaderboard({}));
  assert.ok(!isLegacyLeaderboard({ leaderboard: {} }));
  assert.ok(!isLegacyLeaderboard(null));
});

const hub = readFileSync(new URL("../components/AdminInsightsHub.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../components/AdminOnlineTimePanel.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

check("O7 a section of Insights: Pulse ▸ Online time, in the address, with the view state", () => {
  assert.ok(hub.includes('{ id: "live", label: "Live" }, { id: "onlinetime", label: "Online time" }'));
  assert.ok(hub.includes('| "onlinetime"'));
  assert.ok(hub.includes('{page === "onlinetime" ? <AdminOnlineTimePanel view={view} onViewChange={setView} /> : null}'));
  const viewPages = /const viewPages: AdminHubPage\[\] = \[([^\]]*)\]/.exec(hub);
  assert.ok(viewPages && !viewPages[1].includes('"onlinetime"'), "its own switch replaces the hub toggle on this page");
});

check("O8 asks getSitePresence for the list only, in the hub's view; says when the server is older", () => {
  assert.ok(page.includes('httpsCallable<{ view: AdminView; leaderboard: { period: OnlinePeriod } }, LeaderboardResponse>(functions, "getSitePresence")'));
  assert.ok(page.includes("callable({ view, leaderboard: { period } })"));
  assert.ok(page.includes("setLegacy(isLegacyLeaderboard(app))"));
  assert.ok(page.includes("The server is still on the previous version"));
  assert.ok(page.includes('document.visibilityState === "visible"'), "refreshes only while visible");
  assert.ok(page.includes("if (id !== request.current) return;"), "a slow older answer never overwrites a newer period");
});

check("O9 'Hide internal accounts' is the business view; unchecked is the QA view", () => {
  assert.ok(page.includes('checked={view === "business"}'));
  assert.ok(page.includes('onViewChange(event.target.checked ? "business" : "qa")'));
  assert.ok(page.includes("Hide internal accounts"));
});

check("O10 the older apps' time is its own row outside the ranked list", () => {
  const list = page.slice(page.indexOf('<ol className="admin-online-list"'), page.indexOf("</ol>"));
  assert.ok(list.includes("people.map((person, index)"));
  assert.ok(!list.includes("unidentified"));
  assert.ok(page.includes('className="admin-online-row is-unidentified"'));
  assert.ok(page.includes("not shared out to people"));
});

check("O11 fits a phone: one column under 640px, and every column may shrink", () => {
  const phone = css.slice(css.indexOf("/* Admin Insights ▸ Online time"), css.indexOf("/* Auth provider buttons"));
  assert.ok(phone.includes("grid-template-columns: 28px minmax(0, 1.25fr) minmax(0, 1.5fr) minmax(0, 1fr);"));
  assert.ok(/@media \(max-width: 640px\)[\s\S]*\.admin-online-row \{\s*grid-template-columns: 24px minmax\(0, 1fr\);/.test(phone));
  assert.ok(phone.includes("overflow-wrap: anywhere;"));
  assert.ok(!/grid-template-columns:[^;]*\b\d{3,}px/.test(phone), "no fixed-width column wider than a phone");
});

check("O12 no address is written into the page source", () => {
  assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(page));
});

if (failures) {
  console.log(`check-admin-online-time: ${failures} FAILED`);
  process.exit(1);
}
console.log("check-admin-online-time: all checks pass");

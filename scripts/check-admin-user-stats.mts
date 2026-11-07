// Admin Insights ▸ one person (7 Nov 2026): page rules + "a name in any list opens the person".
//   node scripts/check-admin-user-stats.mts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { appShares, minutesText, providerLabel, shortUid, timeAgo, userSignals, type AdminUserStats } from "../lib/studioflow/adminUserStats.ts";

let failures = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL ${name} — ${(error as Error).message.split("\n")[0]}`); }
};
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-11-07T15:00:00Z");
const DAY = 86400000;

const base = (over: Partial<AdminUserStats["user"]> = {}, rest: Partial<AdminUserStats> = {}): AdminUserStats => ({
  ok: true,
  generatedAtMs: NOW,
  user: { uid: "u", email: "a@example.test", displayName: "A", createdAtMs: NOW - 40 * DAY, lastSignInMs: NOW - 2 * 3600e3, lastActiveMs: NOW - 3600e3, emailVerified: true, providers: ["google.com"], secondFactors: 0, disabled: false, admin: false, staff: false, ...over },
  workspaces: [{ companyId: "w", exists: true, name: "W", role: "owner", plan: "pro_monthly", billingState: "active", createdAtMs: NOW - 40 * DAY, members: 1, flagged: "", ordersTotal: 3 }],
  workspacesError: "",
  work: { ordersCreated: 1, ordersAssigned: 0, notes: null, supportTickets: 0 },
  apps: null,
  appsError: "",
  ...rest
});

check("minutes read as minutes and hours", () => {
  assert.strictEqual(minutesText(0), "0 min");
  assert.strictEqual(minutesText(45), "45 min");
  assert.strictEqual(minutesText(125), "2 h 05 min");
});

check("time ago reads plainly", () => {
  assert.strictEqual(timeAgo(null, NOW), "never");
  assert.strictEqual(timeAgo(NOW - 30e3, NOW), "just now");
  assert.strictEqual(timeAgo(NOW - 12 * 60e3, NOW), "12 min ago");
  assert.strictEqual(timeAgo(NOW - 3 * 3600e3, NOW), "3 h ago");
  assert.strictEqual(timeAgo(NOW - 30 * 3600e3, NOW), "yesterday");
  assert.strictEqual(timeAgo(NOW - 5 * DAY, NOW), "5 days ago");
  assert.strictEqual(timeAgo(NOW - 90 * DAY, NOW), "3 months ago");
});

check("signals: active today, never came back, gone 30+ days, no workspace, unverified, 2FA", () => {
  assert.ok(userSignals(base(), NOW).some(s => s.text === "Active in the last 24 hours" && s.tone === "good"));
  const ghost = userSignals(base({ createdAtMs: NOW - 10 * DAY, lastSignInMs: NOW - 10 * DAY + 60e3, lastActiveMs: null }), NOW);
  assert.ok(ghost.some(s => s.text === "Never came back after signing up"));
  const gone = userSignals(base({ lastSignInMs: NOW - 40 * DAY, lastActiveMs: NOW - 40 * DAY }), NOW);
  assert.ok(gone.some(s => s.text === "Not seen for 40 days" && s.tone === "bad"));
  assert.ok(userSignals(base({}, { workspaces: [] }), NOW).some(s => /No workspace/.test(s.text)));
  assert.ok(!userSignals(base({}, { workspaces: [], workspacesError: "not_readable" }), NOW).some(s => /No workspace/.test(s.text)), "unreadable is not 'none'");
  assert.ok(userSignals(base({ emailVerified: false }), NOW).some(s => s.text === "Email not verified"));
  assert.ok(userSignals(base({ secondFactors: 1 }), NOW).some(s => s.text === "Two-step sign-in on"));
});

check("app shares: largest first, percents add to 100, unknown app keeps its key", () => {
  const rows = appShares({ web: 30, mac: 90, android: 0, ios_unknown: 30 });
  assert.deepStrictEqual(rows.map(r => r.app), ["mac", "web", "ios_unknown"]);
  assert.strictEqual(Math.round(rows.reduce((a, r) => a + r.percent, 0)), 100);
  assert.strictEqual(appShares({ watch: 5 })[0].label, "watch");
});

check("labels and ids", () => {
  assert.strictEqual(providerLabel("google.com"), "Google");
  assert.strictEqual(providerLabel("password"), "Email + password");
  assert.strictEqual(shortUid("abcdefghijklmnopqrstuvwxyz"), "abcdef…wxyz");
  assert.strictEqual(shortUid("short"), "short");
});

const hub = read("components/AdminInsightsHub.tsx");
const online = read("components/AdminOnlineTimePanel.tsx");
const browsers = read("components/AdminBrowsersPanel.tsx");
const panel = read("components/AdminUserStatsPanel.tsx");

check("a name opens the person from Recent signups, User Lookup, Online time and Browsers", () => {
  assert.ok(hub.includes('<AdminUsersWorkspacesDetail onBack={goOverview} view={view} onOpenUser={openUser} />'));
  assert.ok(hub.includes('<AdminUserLookupDetail onBack={goOverview} onOpenUser={openUser} />'));
  assert.ok(hub.includes('onOpenUser ? onOpenUser(user.uid) : openDetail("user", user.uid)'));
  assert.ok(hub.includes('<AdminOnlineTimePanel view={view} onViewChange={setView} onOpenUser={openUser} />'));
  assert.ok(hub.includes('<AdminBrowsersPanel view={view} onViewChange={setView} onOpenUser={openUser} />'));
  assert.ok(online.includes('onClick={() => onOpenUser(person.uid)}') && browsers.includes('onClick={() => onOpenUser(person.uid)}'));
});

check("the person page: own address, back to where you came from, no uid in the address", () => {
  assert.ok(hub.includes('| "user";'));
  assert.ok(hub.includes('onBack={() => setPage(person.from)}'));
  assert.ok(!/#user\/|user\?uid|uid=\$\{/.test(hub), "uid never goes into the URL");
  assert.ok(hub.includes('page === "user" && !person'), "a reload on #user falls back to the overview");
});

check("the person page reads getAdminUserStats and uses the shared charts", () => {
  assert.ok(panel.includes('httpsCallable<{ uid: string }, AdminUserStats>(functions, "getAdminUserStats")'));
  assert.ok(panel.includes("<AdminLineChart") && panel.includes("<ActivityHeatmap") && panel.includes("<StatsDonut"));
  assert.ok(panel.includes("Not recorded"), "an unreadable count is not shown as 0");
});

console.log(failures ? `\nFAIL (${failures})` : "\nadmin user stats: all checks passed");
process.exit(failures ? 1 : 0);

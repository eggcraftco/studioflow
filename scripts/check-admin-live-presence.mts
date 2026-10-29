// Admin Insights ▸ Live (29 Oct 2026): the on-screen rules in lib/studioflow/adminLivePresence.ts, and
// the wiring the redesign depends on (grouped nav with the section in the address, the Live page,
// the web heartbeat's new fields, the admin opt-out on the public-site beacon).
//   node scripts/check-admin-live-presence.mts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  appBuckets,
  appleVersionForBuild,
  versionLabel,
  deviceLabel,
  stickinessLabel,
  peakOf,
  isLegacyPresence,
  csvCell,
  toCsv,
  PRESENCE_APPS,
  type PresenceCounts
} from "../lib/studioflow/adminLivePresence.ts";

let failures = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL ${name} — ${(error as Error).message.split("\n")[0]}`); }
};
const bucket = (people: number, members = people, unidentified = 0) => ({ sessions: people, members, unidentified, people });

check("L1 apps in the owner's order: web, iOS, iPadOS, older iPhone/iPad, macOS, Android", () => {
  assert.deepStrictEqual(PRESENCE_APPS.map(app => app.key), ["web", "ios", "ipados", "ios_unknown", "mac", "android"]);
});

check("L2 a server that sends byApp is read as is", () => {
  const counts = { ...bucket(4), byPlatform: { web: bucket(1), mac: bucket(1), ios: bucket(2), android: bucket(0) }, byApp: { web: bucket(1), ios: bucket(1), ipados: bucket(1), ios_unknown: bucket(0), mac: bucket(1), android: bucket(0) } } as PresenceCounts;
  const apps = appBuckets(counts);
  assert.strictEqual(apps.ipados.people, 1);
  assert.strictEqual(apps.ios.people, 1);
  assert.strictEqual(apps.ios_unknown.people, 0);
});

check("L3 an older answer (byPlatform only) puts all of iOS on the 'older app' row, never guessing iPhone or iPad", () => {
  const counts = { ...bucket(3), byPlatform: { web: bucket(1), mac: bucket(0), ios: bucket(2), android: bucket(0) } } as PresenceCounts;
  const apps = appBuckets(counts);
  assert.strictEqual(apps.ios_unknown.people, 2);
  assert.strictEqual(apps.ios.people, 0);
  assert.strictEqual(apps.ipados.people, 0);
  assert.strictEqual(appBuckets(null).web.people, 0);
});

check("L4 Apple builds map to released versions (project file history); unknown builds stay builds", () => {
  assert.strictEqual(appleVersionForBuild("33"), "2.3");
  assert.strictEqual(appleVersionForBuild("32"), "2.2");
  assert.strictEqual(appleVersionForBuild("30"), "2.1");
  assert.strictEqual(appleVersionForBuild("25"), "2.0");
  assert.strictEqual(appleVersionForBuild("34"), "");
  assert.strictEqual(versionLabel("mac", "", "32"), "2.2 (32)");
  assert.strictEqual(versionLabel("ios", "2.4", "34"), "2.4 (34)");
  assert.strictEqual(versionLabel("ios", "", "34"), "build 34");
  assert.strictEqual(versionLabel("android", "", ""), "not reported");
  assert.strictEqual(versionLabel("android", "2.4", "22"), "2.4 (22)");
});

check("L5 a web build id reads as its UTC minute", () => {
  assert.strictEqual(versionLabel("web", "", "202610291720"), "build 29 Oct 17:20 UTC");
  assert.strictEqual(versionLabel("web", "", ""), "build not reported");
});

check("L6 device names say when the app could not tell", () => {
  assert.strictEqual(deviceLabel("ipad"), "iPad");
  assert.strictEqual(deviceLabel("ios_unknown"), "iPhone or iPad (not reported)");
  assert.strictEqual(deviceLabel("something_new"), "something new");
});

check("L7 stickiness is a percentage or a dash, never 0% for 'no monthly actives'", () => {
  assert.strictEqual(stickinessLabel(33.3), "33.3%");
  assert.strictEqual(stickinessLabel(null), "—");
});

check("L8 the busiest bucket ignores empty ones", () => {
  assert.strictEqual(peakOf([{ people: 0 }, { people: 0 }]), null);
  assert.deepStrictEqual(peakOf([{ people: 1 }, { people: 3 }, { people: 2 }]), { people: 3 });
});

check("L9 an answer without the Live fields is recognised as the old server", () => {
  assert.strictEqual(isLegacyPresence({ active: 2, platforms: { web: 2 } }), true);
  assert.strictEqual(isLegacyPresence({ active: 2, live: { ...bucket(1), byPlatform: { web: bucket(1), mac: bucket(0), ios: bucket(0), android: bucket(0) }, view: "business", windowSeconds: 120, hiddenSessions: 0, staffSessions: 0, devices: [], versions: [], systems: [] } }), false);
  assert.strictEqual(isLegacyPresence(null), false);
});

check("L10 CSV cells: quotes, commas, newlines, and formula-leading text neutralised", () => {
  assert.strictEqual(csvCell('Studio "A", Ltd'), '"Studio ""A"", Ltd"');
  assert.strictEqual(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.strictEqual(csvCell("-12.5"), "-12.5");
  assert.strictEqual(csvCell(null), "");
  assert.strictEqual(toCsv(["a", "b"], [[1, "x,y"]]), 'a,b\r\n1,"x,y"\r\n');
});

const hub = readFileSync(new URL("../components/AdminInsightsHub.tsx", import.meta.url), "utf8");
const live = readFileSync(new URL("../components/AdminLivePanel.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
const beacon = readFileSync(new URL("../components/SiteVisitBeacon.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

check("W1 the hub is a nav landmark with aria-current, five groups, the section in the address, and a phone select", () => {
  assert.ok(/<nav className="admin-hub-sidebar" aria-label=/.test(hub));
  assert.ok(hub.includes('aria-current={page === item.id ? "page" : undefined}'));
  for (const group of ["Pulse", "Money", "Customers", "Product", "Website"]) assert.ok(hub.includes(`label: "${group}"`), group);
  assert.ok(hub.includes("window.history.pushState") && hub.includes("popstate"));
  assert.ok(hub.includes('id="admin-hub-section"'));
});

check("W2 the Live page is wired and the Overview's 'in the apps now' reads the same callable", () => {
  assert.ok(hub.includes('{page === "live" ? <AdminLivePanel view={view} /> : null}'));
  assert.ok(hub.includes("useLiveAppNow(view)"));
  assert.ok(live.includes('httpsCallable<{ view: AdminView; history: true }'));
  assert.ok(live.includes('document.visibilityState === "visible"'), "polls only while visible");
});

check("W3 no light-only grey and no plan colour used as text are left in the hub", () => {
  assert.ok(!/rgba\(17, ?24, ?39/.test(hub));
  // Chart fills may keep the plan colours; text may not (inline style ending the colour, or falling back to a theme colour).
  assert.ok(!/color: ADMIN_PLAN_COLORS\[[^\]]+\] \|\| "var\(--/.test(hub));
  assert.ok(!/color: ADMIN_PLAN_COLORS\[[^\]]+\] \}\}/.test(hub));
  assert.ok(css.includes('body[data-studio-theme="dark"] {\n  --admin-chip-bg'));
});

check("W4 unknown counts are a dash, the fake 'live' bars are gone, a failed poll stops saying Live", () => {
  assert.ok(!hub.includes("data.usage.ordersTotal ?? 0"));
  assert.ok(!hub.includes("Math.sin(index * 1.7 + active)"));
  assert.ok(hub.includes('{failed ? "Not updating" : loaded ? "Live" : "Connecting"}'));
});

check("W5 a cleared custom date cannot crash Global Statistics", () => {
  assert.ok(hub.includes("const validDay = (value: string) =>"));
});

check("W6 the web heartbeat carries device, build and the sign-in token; the public beacon skips admin browsers", () => {
  assert.ok(/kind: "heartbeat", scope: "app", platform: "web", device, appBuild: WEB_BUILD_ID/.test(shell));
  assert.ok(shell.includes("await user.getIdToken()"));
  assert.ok((beacon.match(/isAnalyticsExcluded\(\)/g) || []).length >= 3);
});

if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
console.log("admin live presence: all checks passed");

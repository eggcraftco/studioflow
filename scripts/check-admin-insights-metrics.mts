// Admin Insights display rules (N42 country share / page URLs, N33 exclusion line, N34 unknown,
// N30 evidence). Imports the SAME helper file the page uses, and checks the page wires it in.
//   node scripts/check-admin-insights-metrics.mts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { countryShares, pageRowLabels, exclusionLine, unknownOr, activationEvidenceLine } from "../lib/studioflow/adminInsightsMetrics.ts";

let failures = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL ${name} — ${(error as Error).message.split("\n")[0]}`); }
};

// The 11 Oct screen: United States 6, Russia 2, six countries 1 — total 14.
const oct11 = [{ country: "usa", impressions: 6 }, { country: "rus", impressions: 2 }, ...["gbr", "deu", "fra", "ind", "tur", "nld"].map(country => ({ country, impressions: 1 }))];

check("N42-1 country % is the share of the total (US 6/14 = 42.9%), the bar is relative to the largest", () => {
  const s = countryShares(oct11);
  assert.strictEqual(s.total, 14);
  assert.strictEqual(s.rows[0].sharePct.toFixed(1), "42.9");
  assert.strictEqual(s.rows[0].relativePct, 100);
  assert.strictEqual(s.rows[1].sharePct.toFixed(1), "14.3");
  assert.strictEqual(s.truncated, false);
  const shares = s.rows.reduce((a, r) => a + r.sharePct, 0);
  assert.ok(Math.abs(shares - 100) < 1e-9, `shares sum to ${shares}`);
  assert.strictEqual(countryShares(Array.from({ length: 20 }, (_, i) => ({ country: `c${i}`, impressions: 1 }))).truncated, true);
});

check("N42-2 same path on different URLs is told apart and flagged, not merged", () => {
  const rows = pageRowLabels([
    { page: "https://nivadesk.app/" }, { page: "https://www.nivadesk.app/" },
    { page: "https://nivadesk.app/faq" }, { page: "https://nivadesk.app/faq/" }, { page: "http://nivadesk.app/features" }, { page: "https://nivadesk.app/integrations" }
  ]);
  assert.deepStrictEqual(rows.map(r => r.label), ["nivadesk.app/", "www.nivadesk.app/", "nivadesk.app/faq", "nivadesk.app/faq/", "http://nivadesk.app/features", "nivadesk.app/integrations"]);
  assert.deepStrictEqual(rows.map(r => r.samePathElsewhere), [true, true, true, true, false, false]);
  assert.strictEqual(new Set(rows.map(r => r.label)).size, rows.length, "two rows share a label");
});

check("N33 exclusion line never silent; unreadable flags said out loud", () => {
  assert.match(exclusionLine({ view: "business", excludedCount: 1, excludedByKind: { qa: 1 }, flaggedTotal: 1 }), /1 flagged workspace left out \(1 qa\)/);
  assert.match(exclusionLine({ view: "qa", excludedCount: 0, flaggedTotal: 2 }), /including 2 flagged/);
  assert.match(exclusionLine({ view: "business", excludedCount: 0, readable: false }), /could not be read/);
  assert.strictEqual(exclusionLine(undefined), "");
});

check("N34 unknown is '—' with a reason, a real zero stays 0", () => {
  assert.strictEqual(unknownOr(0), "0");
  assert.strictEqual(unknownOr(null, "no_order_carries_a_date"), "— (orders carry no date)");
  assert.strictEqual(unknownOr(undefined), "— (not available)");
});

check("N30 evidence line names the path, the steps and the active days", () => {
  const line = activationEvidenceLine({ inferred: true, path: { path: "team", from: "main_goal", value: "team" }, required: { rule: "any", steps: [{ name: "job_assigned", done: false, firstAtMs: 0 }, { name: "task_assigned", done: true, firstAtMs: Date.parse("2026-10-10T16:12:00Z") }] }, activeDays: ["2026-10-10"], windowDays: 7, minActiveDays: 2 });
  assert.match(line, /^team path \(setup goal: team\)/);
  assert.match(line, /task assigned ✓ 2026-10-10/);
  assert.match(line, /1 active day in the last 7 \(needs 2/);
});

// The page must use these rules, not a private copy of the old ones.
const hub = readFileSync(new URL("../components/AdminInsightsHub.tsx", import.meta.url), "utf8");
check("page wiring: the hub imports the helpers and no longer divides a country by the largest row for its %", () => {
  for (const name of ["countryShares", "pageRowLabels", "exclusionLine", "unknownOr", "activationEvidenceLine"]) assert.ok(hub.includes(name), `${name} not used by the page`);
  assert.ok(!/\(\(c\.impressions \/ max\) \* 100\)\.toFixed\(0\)\}%/.test(hub), "old max-relative country % still rendered");
  assert.ok(!hub.includes('pathname || "/"; } catch'), "page label still drops the host");
});
check("page wiring: heatmap captions are per chart (uploads are not 'order creation')", () => {
  assert.ok(/ActivityHeatmap heatmap=\{data\.heatmap\} caption=/.test(hub), "ActivityHeatmap has no caption prop");
  assert.ok(!/Order creation activity by weekday and hour \(last 30 days, UK time\)\.<\/p>/.test(hub), "hard-coded caption still in the shared component");
});

console.log(failures ? `❌ admin insights metrics: ${failures} failure(s)` : "✅ admin insights metrics GEÇTİ");
process.exit(failures ? 1 : 0);

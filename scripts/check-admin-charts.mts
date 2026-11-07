// Insights charts show their numbers on hover / tap / keyboard (owner, 7 Nov 2026). Imports the SAME helper file
// the charts use, and checks that every Insights chart goes through the shared cursor instead of SVG <title>s.
//   node scripts/check-admin-charts.mts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  chartCount, chartDecimal, chartPercent, chartRatioPercent, chartPosition, chartDuration, chartMoney,
  chartDayLabel, chartDayTick, chartExtremes, chartNearestIndex, chartPointFraction, chartKeyStep, chartSummary
} from "../lib/studioflow/adminChartFormat.ts";

let failures = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL ${name} — ${(error as Error).message.split("\n")[0]}`); }
};
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

check("counts carry a thousands separator and a real minus", () => {
  assert.strictEqual(chartCount(1234567), "1,234,567");
  assert.strictEqual(chartCount(0), "0");
  assert.strictEqual(chartCount(12.6), "13");
  assert.strictEqual(chartCount(-4200), "−4,200");
  assert.strictEqual(chartCount(Number.NaN), "—");
});

check("decimals, percent, CTR ratio, Google position", () => {
  assert.strictEqual(chartDecimal(1234.56, 1), "1,234.6");
  assert.strictEqual(chartDecimal(-0.01, 1), "0.0", "no '−0.0'");
  assert.strictEqual(chartPercent(12.345), "12.3%");
  assert.strictEqual(chartPercent(100, 0), "100%");
  assert.strictEqual(chartRatioPercent(0.0345), "3.5%");
  assert.strictEqual(chartPosition(7.04), "7.0");
  assert.strictEqual(chartPosition(0), "—", "position 0 = no rank");
});

check("durations read mm:ss, hours as h:mm:ss", () => {
  assert.strictEqual(chartDuration(65), "01:05");
  assert.strictEqual(chartDuration(3725), "1:02:05");
  assert.strictEqual(chartDuration(-1), "—");
});

check("money uses the symbol the screen shows — no ISO guess ($ and ¥ name no single currency)", () => {
  assert.strictEqual(chartMoney(1234.5, "£"), "£1,234.50");
  assert.strictEqual(chartMoney(500, "¥", 0), "¥500", "¥500 stays 500, never ×100");
  assert.strictEqual(chartMoney(12, "A$"), "A$12.00");
  assert.strictEqual(chartMoney(12, "CHF"), "CHF 12.00");
  assert.strictEqual(chartMoney(-3, "€"), "−€3.00");
  assert.strictEqual(chartMoney(9, ""), "9.00");
  const src = read("lib/studioflow/adminChartFormat.ts");
  assert.ok(!/style:\s*"currency"/.test(src), "Intl currency style needs an ISO code");
});

check("calendar days never slip a day, whatever the time zone", () => {
  assert.strictEqual(chartDayLabel("2026-11-04"), "Wed 4 Nov 2026");
  assert.strictEqual(chartDayLabel("2026-03-29"), "Sun 29 Mar 2026", "UK clocks change that night");
  assert.strictEqual(chartDayLabel("2026-02-30"), "2026-02-30", "an impossible date is shown as given");
  assert.strictEqual(chartDayLabel("Mon"), "Mon");
  assert.strictEqual(chartDayTick("2026-11-04"), "4 Nov");
});

check("peak and low: highest / lowest, latest on a tie, none for a flat line; a rank swaps them", () => {
  assert.deepStrictEqual(chartExtremes([3, 9, 1, 9, 4]), { peak: 3, low: 2 });
  assert.deepStrictEqual(chartExtremes([5, null, 2, undefined, 7]), { peak: 4, low: 2 });
  assert.strictEqual(chartExtremes([4, 4, 4]), null);
  assert.strictEqual(chartExtremes([4]), null);
  assert.strictEqual(chartExtremes([]), null);
  assert.deepStrictEqual(chartExtremes([8.2, 3.1, 12.5], "lower"), { peak: 1, low: 2 }, "position 3.1 is the best");
});

check("pointer → nearest point and keyboard steps stay inside the data", () => {
  assert.strictEqual(chartNearestIndex(0, 30), 0);
  assert.strictEqual(chartNearestIndex(1, 30), 29);
  assert.strictEqual(chartNearestIndex(0.5, 3), 1);
  assert.strictEqual(chartNearestIndex(-0.2, 10), 0);
  assert.strictEqual(chartNearestIndex(1.4, 10), 9);
  assert.strictEqual(chartNearestIndex(0.5, 1), 0);
  assert.strictEqual(chartPointFraction(0, 1), 0.5);
  assert.strictEqual(chartKeyStep("ArrowRight", 29, 30), 29);
  assert.strictEqual(chartKeyStep("ArrowLeft", 0, 30), 0);
  assert.strictEqual(chartKeyStep("ArrowLeft", -1, 30), 28, "first press from nothing starts at the latest point");
  assert.strictEqual(chartKeyStep("Home", 12, 30), 0);
  assert.strictEqual(chartKeyStep("End", 2, 30), 29);
  assert.strictEqual(chartKeyStep("PageUp", 3, 30), 0);
  assert.strictEqual(chartKeyStep("ArrowDown", 5, 168, 24), 29, "heatmap: down = next day");
  assert.strictEqual(chartKeyStep("ArrowUp", 5, 168, 24), 0);
  assert.strictEqual(chartKeyStep("a", 5, 30), null);
  assert.strictEqual(chartKeyStep("ArrowRight", 0, 0), null);
});

check("the screen-reader summary names the peak, the low, the latest and how to step", () => {
  const text = chartSummary("Visitor sessions", ["Mon 3 Nov 2026", "Tue 4 Nov 2026", "Wed 5 Nov 2026"], [{ label: "Sessions", values: [12, 1200, 3], format: chartCount }]);
  assert.match(text, /3 points from Mon 3 Nov 2026 to Wed 5 Nov 2026/);
  assert.match(text, /Highest 1,200 on Tue 4 Nov 2026; lowest 3 on Wed 5 Nov 2026; latest 3/);
  assert.match(text, /arrow keys/);
  const rank = chartSummary("Position", ["a", "b"], [{ label: "Avg. position", values: [9.5, 4.2], format: chartPosition, better: "lower" }]);
  assert.match(rank, /Best 4\.2 on b; worst 9\.5 on a/);
  assert.match(chartSummary("Empty", [], []), /no data yet/);
});

// Wiring: every chart in Insights uses the shared cursor; the old hover-only <title> tips are gone.
const hub = read("components/AdminInsightsHub.tsx");
const live = read("components/AdminLivePanel.tsx");
const bots = read("components/AdminAssistantQuestionsPanel.tsx");
const chart = read("components/AdminChart.tsx");
const index = read("components/AdminSearchIndexPanel.tsx");
const css = read("app/globals.css");

check("no Insights chart relies on an SVG <title> or a title= tooltip any more", () => {
  for (const [name, src] of [["hub", hub], ["live", live], ["bots", bots], ["index", index]] as const) {
    assert.ok(!/<title>\{`/.test(src), `${name}: SVG <title> tip left`);
  }
  assert.ok(!/className="admin-columns-col" title=/.test(live), "Live columns: title= tip left");
  assert.ok(!/title=\{`\$\{row\.day\}/.test(bots), "Bot questions: title= tip left");
  assert.ok(!/title=\{`\$\{HEATMAP_DAYS/.test(hub + chart), "Heatmap: title= tip left");
  assert.ok(/import \{[^}]*\bActivityHeatmap\b[^}]*\bStatsDonut\b[^}]*\} from "@\/components\/AdminChart"/.test(hub), "the hub uses the shared donut and heatmap");
});

check("each chart kind is wired to the shared cursor", () => {
  for (const name of ["StatsSparkline", "StatsTrendChart", "SearchTrendChart", "SearchPositionChart", "GrowthChart"]) {
    const body = hub.slice(hub.indexOf(`function ${name}(`), hub.indexOf("\n}\n", hub.indexOf(`function ${name}(`)));
    assert.ok(body.includes("<AdminLineChart"), `${name} does not use AdminLineChart`);
  }
  for (const [name, src] of [["StatsDonut", chart], ["ActivityHeatmap", chart], ["PresenceColumns", live], ["QuestionsPerDay", bots]] as const) {
    const body = src.slice(src.indexOf(`function ${name}(`), src.indexOf("\n}\n", src.indexOf(`function ${name}(`)));
    assert.ok(body.includes("useChartCursor("), `${name} has no cursor`);
    assert.ok(body.includes("<ChartTip"), `${name} shows no tip`);
  }
  assert.ok((index.match(/<AdminLineChart/g) || []).length >= 2, "Google Indexing charts");
});

check("keyboard, touch and screen reader: focusable group, arrow keys, live text, tap stays", () => {
  assert.ok(chart.includes("tabIndex: 0") && chart.includes("onKeyDown"), "keyboard");
  assert.ok(chart.includes('aria-live="polite"'), "live region");
  assert.ok(chart.includes('aria-roledescription="chart"'), "chart role description");
  assert.ok(chart.includes('event.pointerType !== "mouse"') && chart.includes('document.addEventListener("pointerdown"'), "a tap keeps the tip until a tap elsewhere");
  assert.ok(/\.admin-chart-plot \{[^}]*touch-action: pan-y/.test(css), "vertical page scroll still works over a chart");
  assert.ok(/\.admin-chart-heatmap \{[^}]*touch-action: pan-x pan-y/.test(css), "the wide heatmap still scrolls sideways");
  assert.ok(css.includes(".admin-chart-plot:focus-visible"), "visible focus ring");
});

check("tips follow the theme: light and dark tokens, no light-only grey", () => {
  const light = css.slice(css.indexOf("--admin-chart-tip-bg: #ffffff"), css.indexOf("--admin-chart-tip-bg: #ffffff") + 300);
  const darkAt = css.indexOf("--admin-chart-tip-bg: #2a2a2a");
  assert.ok(light.length > 0 && darkAt > 0, "both tokens");
  assert.ok(css.lastIndexOf('body[data-studio-theme="dark"] {', darkAt) > css.indexOf("--admin-chart-tip-bg: #ffffff"), "the dark value is in the dark theme block");
  const tip = css.slice(css.indexOf(".admin-chart-tip {"), css.indexOf("}", css.indexOf(".admin-chart-tip {")));
  assert.ok(tip.includes("var(--admin-chart-tip-bg)") && tip.includes("var(--text)"), "tip colours come from tokens");
});

console.log(failures ? `\nFAIL (${failures})` : "\nadmin charts: all checks passed");
process.exit(failures ? 1 : 0);

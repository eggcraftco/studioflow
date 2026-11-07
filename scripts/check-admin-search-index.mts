// Admin Insights ▸ Google Indexing (7 Nov 2026): page rules + wiring.
//   node scripts/check-admin-search-index.mts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  indexedShare, sumCounts, sumTotals, positionChange, urlPath, notIndexedReason, canonicalElsewhere, manualScanState, ukTime, ukTimeFromIso
} from "../lib/studioflow/adminSearchIndex.ts";

let failures = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL ${name} — ${(error as Error).message.split("\n")[0]}`); }
};
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

check("indexed share counts only checked pages; nothing checked = no share", () => {
  assert.strictEqual(indexedShare({ inSitemap: 13, indexed: 9, notIndexed: 3, unknown: 1, byState: {} }), 75);
  assert.strictEqual(indexedShare({ inSitemap: 13, indexed: 0, notIndexed: 0, unknown: 13, byState: {} }), null);
  assert.strictEqual(indexedShare(undefined), null);
});

check("language sums: counts and reasons add up; position is impression-weighted", () => {
  const all = sumCounts([
    { inSitemap: 13, indexed: 12, notIndexed: 1, unknown: 0, byState: { "Submitted and indexed": 12, "Crawled - currently not indexed": 1 } },
    { inSitemap: 13, indexed: 2, notIndexed: 11, unknown: 0, byState: { "Submitted and indexed": 2, "Discovered - currently not indexed": 11 } },
    undefined
  ]);
  assert.deepStrictEqual([all.inSitemap, all.indexed, all.notIndexed], [26, 14, 12]);
  assert.strictEqual(all.byState["Submitted and indexed"], 14);
  const t = sumTotals([{ clicks: 1, impressions: 100, ctr: 0.01, position: 5 }, { clicks: 0, impressions: 300, ctr: 0, position: 25 }]);
  assert.strictEqual(t.impressions, 400);
  assert.strictEqual(t.position, 20);
  assert.strictEqual(t.ctr, 1 / 400);
  assert.deepStrictEqual(sumTotals([]), { clicks: 0, impressions: 0, ctr: 0, position: 0 });
});

check("rank change: up is positive, a missing rank on either side is no change", () => {
  assert.strictEqual(positionChange(4, 9), 5);
  assert.strictEqual(positionChange(9, 4), -5);
  assert.strictEqual(positionChange(0, 4), null);
  assert.strictEqual(positionChange(4, 0), null);
});

check("URL paths read short; another host keeps its name", () => {
  assert.strictEqual(urlPath("https://nivadesk.app/"), "/");
  assert.strictEqual(urlPath("https://nivadesk.app/de/pricing?x=1"), "/de/pricing?x=1");
  assert.strictEqual(urlPath("https://www.nivadesk.app/fr"), "www.nivadesk.app/fr");
  assert.strictEqual(urlPath("nonsense"), "nonsense");
});

check("why not indexed: noindex, robots.txt and fetch errors are named; Google's own wording otherwise", () => {
  const base = { url: "https://nivadesk.app/x", lang: "en", status: "not_indexed" as const, inspectedAtMs: 1 };
  assert.match(notIndexedReason({ ...base, indexingState: "BLOCKED_BY_META_TAG" }), /noindex/);
  assert.match(notIndexedReason({ ...base, robotsTxtState: "DISALLOWED" }), /robots\.txt/);
  assert.strictEqual(notIndexedReason({ ...base, coverageState: "Crawled - currently not indexed", pageFetchState: "SUCCESSFUL" }), "Crawled - currently not indexed");
  assert.strictEqual(notIndexedReason({ ...base, coverageState: "Not found (404)", pageFetchState: "NOT_FOUND" }), "Not found (404) · Not found (404)");
  assert.strictEqual(notIndexedReason({ ...base, error: "403 forbidden" }), "403 forbidden");
  assert.strictEqual(canonicalElsewhere({ ...base, googleCanonical: "https://nivadesk.app/y" }), true);
  assert.strictEqual(canonicalElsewhere({ ...base, googleCanonical: "https://nivadesk.app/x" }), false);
});

check("Check now: allowed with no scan or after the gap; refused before it", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  assert.deepStrictEqual(manualScanState(null, now), { allowed: true, nextAtMs: null });
  assert.deepStrictEqual(manualScanState({ ok: true, scan: { scannedAtMs: now - 7 * 3600e3, nextManualAtMs: now - 3600e3, trigger: "schedule", urlCount: 1, truncated: false, inspected: 1, errors: 0, quotaHit: false } }, now), { allowed: true, nextAtMs: null });
  assert.deepStrictEqual(manualScanState({ ok: true, scanRequest: { ok: false, reason: "too_soon", nextAllowedAtMs: now + 60000 } }, now), { allowed: false, nextAtMs: now + 60000 });
});

check("times are UK time", () => {
  assert.strictEqual(ukTime(Date.parse("2026-07-01T04:30:00Z")), "1 Jul 2026, 05:30");
  assert.strictEqual(ukTime(Date.parse("2026-11-07T05:30:00Z")), "7 Nov 2026, 05:30");
  assert.strictEqual(ukTimeFromIso(""), "—");
  assert.strictEqual(ukTimeFromIso("bad"), "—");
});

const hub = read("components/AdminInsightsHub.tsx");
const panel = read("components/AdminSearchIndexPanel.tsx");

check("the page sits under Website, after Google Search, with its own address #searchindex", () => {
  const website = hub.slice(hub.indexOf('label: "Website"'), hub.indexOf("]", hub.indexOf('label: "Website"')));
  assert.ok(website.indexOf('{ id: "searchconsole", label: "Google Search" }') < website.indexOf('{ id: "searchindex", label: "Google Indexing" }'));
  assert.ok(hub.includes('{page === "searchindex" ? <AdminSearchIndexPanel /> : null}'));
  assert.ok(hub.includes('| "searchindex"'));
});

check("the page calls getSearchIndexStats, gives a scan time to finish, and says what Google cannot give", () => {
  assert.ok(panel.includes('"getSearchIndexStats", { timeout: 300000 }'), "scan timeout");
  assert.ok(panel.includes("scan: true"));
  assert.ok(/no API for Search Console&apos;s Pages report/.test(panel), "honest limit on the page");
  assert.ok(/deprecated/.test(panel), "sitemap indexed count is deprecated");
  assert.ok(!/@\/lib\/publicSite\//.test(panel), "admin page imports no public-site code");
});

console.log(failures ? `\nFAIL (${failures})` : "\nadmin search index: all checks passed");
process.exit(failures ? 1 : 0);

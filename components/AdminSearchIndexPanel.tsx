"use client";

// Admin Insights ▸ Website ▸ Google Indexing (7 Nov 2026).
// Owner: "we had the site indexed in Google in every language — add its statistics here, under its own heading".
// Per language (English + the 11 prefixed ones): pages in the sitemap that Google has / has not indexed and why,
// impressions / clicks / CTR / average position over time (same hover tips as every Insights chart), and the
// sitemaps Search Console knows. Data: callable getSearchIndexStats (functions/searchIndex.js).
// What Google's API cannot give is said on the page: there is no API for the Pages report, so index state is
// checked one URL at a time (URL Inspection, 2,000 a day) — once a day, plus "Check now" at most every 6 hours.

import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { CardTitle } from "@/components/CardTitle";
import { AdminLineChart } from "@/components/AdminChart";
import { chartCount, chartDayLabel, chartDayTick, chartDecimal, chartPercent, chartPosition, chartRatioPercent } from "@/lib/studioflow/adminChartFormat";
import {
  canonicalElsewhere,
  indexedShare,
  manualScanState,
  notIndexedReason,
  positionChange,
  sumCounts,
  sumTotals,
  ukTime,
  ukTimeFromIso,
  urlPath,
  type SearchIndexLanguage,
  type SearchIndexResult
} from "@/lib/studioflow/adminSearchIndex";

type Metric = "impressions" | "clicks" | "position" | "indexed";

const METRICS: { id: Metric; label: string; color: string }[] = [
  { id: "impressions", label: "Impressions", color: "#8a5cf6" },
  { id: "clicks", label: "Clicks", color: "#0a84ff" },
  { id: "position", label: "Avg. position", color: "#ff9f0a" },
  { id: "indexed", label: "Indexed pages", color: "#30d158" }
];

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="admin-index-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function RankChange({ change }: { change: number | null }) {
  if (change === null || Math.abs(change) < 0.05) return <span className="admin-index-muted">–</span>;
  const up = change > 0;
  return (
    <span className={up ? "admin-delta is-good" : "admin-delta is-bad"} title={up ? "Ranks higher than in the previous period" : "Ranks lower than in the previous period"}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="visually-hidden">{up ? "up " : "down "}</span>
      {chartDecimal(Math.abs(change), 1)}
    </span>
  );
}

/** Every day of the range, so a language with no impressions on a day shows 0 there instead of a skipped day. */
function dayList(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const start = Date.parse(`${startDate}T12:00:00Z`);
  const end = Date.parse(`${endDate}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return out;
  for (let t = start; t <= end && out.length < 500; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

function LanguageChart({ lang, metric, days, history }: { lang: SearchIndexLanguage; metric: Metric; days: string[]; history: SearchIndexResult["history"] }) {
  const meta = METRICS.find(m => m.id === metric) || METRICS[0];
  if (metric === "indexed") {
    const rows = (history || []).filter(row => row.byLanguage?.[lang.code]);
    if (rows.length < 2) return <p className="muted-copy admin-index-empty">History starts with the first daily checks.</p>;
    return (
      <AdminLineChart
        title={`${lang.label}: indexed pages per day`}
        width={320}
        height={110}
        labels={rows.map(row => chartDayLabel(row.date))}
        ticks={rows.map(row => chartDayTick(row.date))}
        series={[{ key: "indexed", label: "Indexed", color: meta.color, values: rows.map(row => row.byLanguage[lang.code].indexed), format: chartCount, area: true }]}
        extraRows={index => {
          const row = rows[index].byLanguage[lang.code];
          return [{ label: "Not indexed", value: chartCount(row.notIndexed) }, { label: "In sitemap", value: chartCount(row.inSitemap) }];
        }}
      />
    );
  }
  const byDay = new Map(lang.byDate.map(day => [day.date, day]));
  const values = days.map(date => {
    const day = byDay.get(date);
    if (metric === "position") return day && day.position > 0 ? day.position : null;
    return day ? day[metric] : 0;
  });
  if (!values.some(value => typeof value === "number" && value > 0)) return <p className="muted-copy admin-index-empty">No Google impressions in this period.</p>;
  return (
    <AdminLineChart
      title={`${lang.label}: ${meta.label.toLowerCase()} per day`}
      width={320}
      height={110}
      labels={days.map(chartDayLabel)}
      ticks={days.map(chartDayTick)}
      series={[{ key: metric, label: meta.label, color: meta.color, values, format: metric === "position" ? chartPosition : chartCount, area: metric !== "position", better: metric === "position" ? "lower" : "higher" }]}
      extraRows={index => {
        const day = byDay.get(days[index]);
        if (!day) return [];
        return metric === "impressions"
          ? [{ label: "Clicks", value: chartCount(day.clicks) }, { label: "CTR", value: chartRatioPercent(day.ctr) }]
          : metric === "clicks"
            ? [{ label: "Impressions", value: chartCount(day.impressions) }, { label: "CTR", value: chartRatioPercent(day.ctr) }]
            : [{ label: "Impressions", value: chartCount(day.impressions) }];
      }}
    />
  );
}

export function AdminSearchIndexPanel() {
  const [rangeDays, setRangeDays] = useState(28);
  const [result, setResult] = useState<SearchIndexResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState<Metric>("impressions");
  const [focusLang, setFocusLang] = useState<string>("all");
  const [now, setNow] = useState(() => Date.now());

  const range = useMemo(() => {
    // Google's numbers settle about 3 days later, the same window as the Google Search page.
    const endMs = Date.now() - 3 * 86400000;
    const startMs = endMs - (rangeDays - 1) * 86400000;
    return { startDate: new Date(startMs).toISOString().slice(0, 10), endDate: new Date(endMs).toISOString().slice(0, 10) };
  }, [rangeDays]);

  const load = (scan: boolean) => {
    if (scan) setScanning(true);
    else setLoading(true);
    setError("");
    // A scan inspects every sitemap page (about 200 calls to Google), so it may take a few minutes.
    const callable = httpsCallable<{ startDate: string; endDate: string; scan?: boolean }, SearchIndexResult>(functions, "getSearchIndexStats", { timeout: 300000 });
    return callable({ ...range, ...(scan ? { scan: true } : {}) })
      .then(res => {
        setResult(res.data);
        setNow(Date.now());
      })
      .catch(err => setError(err instanceof Error ? err.message : "Could not load Google indexing."))
      .finally(() => {
        setLoading(false);
        setScanning(false);
      });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const callable = httpsCallable<{ startDate: string; endDate: string }, SearchIndexResult>(functions, "getSearchIndexStats", { timeout: 120000 });
    callable(range)
      .then(res => { if (!cancelled) { setResult(res.data); setNow(Date.now()); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load Google indexing."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const languages = result?.languages ?? [];
  const days = result?.range ? dayList(result.range.startDate, result.range.endDate) : [];
  const counts = sumCounts(languages.map(lang => lang.index));
  const current = sumTotals(languages.map(lang => lang.totals.current));
  const previous = sumTotals(languages.map(lang => lang.totals.previous));
  const scanState = manualScanState(result, now);
  const notIndexed = (result?.urls ?? []).filter(entry => entry.status !== "indexed");
  const shown = focusLang === "all" ? languages : languages.filter(lang => lang.code === focusLang);
  // Why the pages that are not indexed are not, as Google words it ("Discovered - currently not indexed" …).
  const reasons = Object.entries(notIndexed.reduce<Record<string, number>>((acc, entry) => {
    const state = entry.error ? "Not checked" : entry.coverageState || entry.verdict || "Unknown";
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);

  const chip = (active: boolean, label: string, onClick: () => void, key: string) => (
    <button key={key} type="button" className="button admin-index-chip" aria-pressed={active} onClick={onClick}>{label}</button>
  );

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Google indexing by language" />
        <p className="muted-copy">How many nivadesk.app pages Google has indexed in each of the 12 site languages, why the others are not indexed, and how each language performs in Google Search. Data from Google Search Console (search numbers ≈3-day lag).</p>
        <div className="admin-index-toolbar">
          {[7, 28, 90].map(option => chip(rangeDays === option, `${option}d`, () => setRangeDays(option), `r${option}`))}
          <span className="admin-index-spacer" />
          <button type="button" className="button secondary admin-small-button" disabled={scanning || !scanState.allowed || !result?.ok} onClick={() => load(true)}>
            {scanning ? "Checking every page…" : "Check index now"}
          </button>
        </div>
        <p className="admin-index-meta">
          {result?.property ? <>Property: <strong>{result.property}</strong> · </> : null}
          {result?.scan ? <>Last index check: <strong>{ukTime(result.scan.scannedAtMs)}</strong> UK ({result.scan.trigger === "manual" ? "started here" : "daily"}), {chartCount(result.scan.urlCount)} pages from the sitemap</> : result?.ok ? "No index check yet — the first one runs at 05:30 UK time, or start one now." : null}
          {!scanState.allowed && scanState.nextAtMs ? <> · next manual check from {ukTime(scanState.nextAtMs)}</> : null}
        </p>
        {result?.scanRequest && !result.scanRequest.ok ? (
          <p className="admin-index-warn" role="status">
            {result.scanRequest.reason === "too_soon" ? `A check ran less than ${result.limits?.manualGapHours ?? 6} hours ago; Google allows ${chartCount(result.limits?.inspectionsPerDay ?? 2000)} page checks a day.` : result.scanRequest.reason === "busy" ? "A check is already running; reload in a minute." : `The check failed: ${result.scanRequest.message || "unknown error"}`}
          </p>
        ) : null}
        {result?.scan?.quotaHit ? <p className="admin-index-warn" role="status">Google's daily URL Inspection limit was reached during the last check; pages it could not check keep their previous answer.</p> : null}
        {loading ? <p className="muted-copy" role="status">Loading Google indexing…</p> : null}
        {scanning ? <p className="muted-copy" role="status">Asking Google about every page in the sitemap. This can take a few minutes.</p> : null}
        {error ? <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
        <p className="muted-copy admin-footnote">
          Google has no API for Search Console&apos;s Pages report. Index state here comes from URL Inspection, one request per page (Google allows {chartCount(result?.limits?.inspectionsPerDay ?? 2000)} a day): every page in nivadesk.app/sitemap.xml is checked daily at 05:30 UK time, and &ldquo;Check index now&rdquo; can run once every {result?.limits?.manualGapHours ?? 6} hours. Search Console&apos;s own Pages report updates on its own schedule, so the two can differ for a few days. Search numbers are filtered by page, so Google counts them per page and they can be higher than the totals on Google Search.
        </p>
      </section>

      {!loading && result && result.ok === false ? (
        <section className="card app-card">
          <CardTitle icon="lock" eyebrow="Setup required" title="Search Console is not reachable" />
          <p className="muted-copy">{result.message || "Search Console access is not configured."}</p>
          {result.accessibleSites?.length ? <p className="admin-index-meta">Visible properties: {result.accessibleSites.join(", ")}</p> : null}
        </section>
      ) : null}

      {result?.ok ? (
        <>
          <div className="admin-index-tiles">
            <Tile label="Pages in sitemap" value={chartCount(counts.inSitemap)} sub={result.scan?.truncated ? `first ${chartCount(counts.inSitemap)} of ${chartCount(result.scan.sitemapTotal ?? counts.inSitemap)}` : "12 languages"} />
            <Tile label="Indexed" value={chartCount(counts.indexed)} sub={indexedShare(counts) === null ? "not checked yet" : `${chartPercent(indexedShare(counts) as number, 0)} of checked pages`} />
            <Tile label="Not indexed" value={chartCount(counts.notIndexed)} sub={counts.unknown ? `${chartCount(counts.unknown)} not checked` : "see the reasons below"} />
            <Tile label="Impressions" value={chartCount(current.impressions)} sub={`${chartCount(previous.impressions)} the period before`} />
            <Tile label="Clicks" value={chartCount(current.clicks)} sub={`CTR ${chartRatioPercent(current.ctr)}`} />
            <Tile label="Avg. position" value={chartPosition(current.position)} sub={previous.position > 0 ? `${chartPosition(previous.position)} the period before` : "no rank before"} />
          </div>

          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Google" title="Languages" />
            <div style={{ overflowX: "auto" }}>
              <table className="admin-search-table admin-index-table">
                <thead>
                  <tr>
                    <th>Language</th>
                    <th className="num">Pages</th>
                    <th className="num">Indexed</th>
                    <th className="num">Not indexed</th>
                    <th className="num">Impr.</th>
                    <th className="num">Clicks</th>
                    <th className="num">CTR</th>
                    <th className="num">Position</th>
                    <th className="num">Δ vs prev.</th>
                  </tr>
                </thead>
                <tbody>
                  {languages.map(lang => {
                    const share = indexedShare(lang.index);
                    return (
                      <tr key={lang.code} className={focusLang === lang.code ? "is-selected" : undefined}>
                        <td>
                          <button type="button" className="admin-index-lang" aria-pressed={focusLang === lang.code} onClick={() => setFocusLang(focusLang === lang.code ? "all" : lang.code)}>
                            <strong>{lang.label}</strong> <span>{lang.prefix ? `/${lang.prefix}` : "/ (no prefix)"}</span>
                          </button>
                          {lang.error ? <div className="admin-index-warn">Search numbers failed: {lang.error}</div> : null}
                        </td>
                        <td className="num">{chartCount(lang.index.inSitemap)}</td>
                        <td className="num">
                          {chartCount(lang.index.indexed)}
                          {share !== null ? (
                            <span className="admin-index-bar" aria-hidden="true"><span style={{ width: `${share}%` }} /></span>
                          ) : null}
                        </td>
                        <td className="num">{chartCount(lang.index.notIndexed)}{lang.index.unknown ? <small className="admin-index-muted"> +{chartCount(lang.index.unknown)} ?</small> : null}</td>
                        <td className="num">{chartCount(lang.totals.current.impressions)}</td>
                        <td className="num">{chartCount(lang.totals.current.clicks)}</td>
                        <td className="num">{lang.totals.current.impressions ? chartRatioPercent(lang.totals.current.ctr) : "—"}</td>
                        <td className="num"><strong>{chartPosition(lang.totals.current.position)}</strong></td>
                        <td className="num"><RankChange change={positionChange(lang.totals.current.position, lang.totals.previous.position)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="admin-index-meta">Pick a language to see only its chart below. &ldquo;?&rdquo; = pages Google could not be asked about yet. Δ compares the average position with {result.previousRange ? `${chartDayLabel(result.previousRange.startDate)} – ${chartDayLabel(result.previousRange.endDate)}` : "the previous period"}; ▲ green = moved up toward #1.</p>
          </section>

          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Google" title="Each language over time" />
            <div className="admin-index-toolbar">
              {METRICS.map(item => chip(metric === item.id, item.label, () => setMetric(item.id), item.id))}
              <span className="admin-index-spacer" />
              <label className="admin-index-select">
                <span>Language</span>
                <select value={focusLang} onChange={event => setFocusLang(event.target.value)}>
                  <option value="all">All languages</option>
                  {languages.map(lang => <option key={lang.code} value={lang.code}>{lang.label}</option>)}
                </select>
              </label>
            </div>
            <div className={focusLang === "all" ? "admin-index-grid" : "admin-index-grid is-single"}>
              {shown.map(lang => (
                <div key={lang.code} className="admin-index-cell">
                  <div className="admin-index-cell-head">
                    <strong>{lang.label}</strong>
                    <span>
                      {metric === "indexed"
                        ? `${chartCount(lang.index.indexed)} / ${chartCount(lang.index.inSitemap)} indexed`
                        : metric === "position"
                          ? `avg ${chartPosition(lang.totals.current.position)}`
                          : `${chartCount(lang.totals.current[metric])} in ${rangeDays}d`}
                    </span>
                  </div>
                  <LanguageChart lang={lang} metric={metric} days={days} history={result.history} />
                </div>
              ))}
            </div>
            <p className="admin-index-meta">Hover, tap or focus a chart and use the arrow keys to read each day. ▲ / ▼ mark the best and the lowest day.</p>
          </section>

          <section className="card app-card">
            <CardTitle icon="files" eyebrow="Google" title="Pages not indexed" />
            {!result.scan ? (
              <p className="muted-copy">The first index check has not run yet.</p>
            ) : notIndexed.length === 0 ? (
              <p className="muted-copy">Every page in the sitemap is indexed.</p>
            ) : (
              <>
                {reasons.length ? (
                  <div className="admin-index-reasons">
                    {reasons.map(([state, n]) => <span key={state}><strong>{chartCount(n)}</strong> {state}</span>)}
                  </div>
                ) : null}
                <div style={{ overflowX: "auto" }}>
                  <table className="admin-search-table admin-index-table">
                    <thead>
                      <tr><th>Page</th><th>Language</th><th>Why</th><th>Last crawl</th><th>Checked</th></tr>
                    </thead>
                    <tbody>
                      {notIndexed
                        .filter(entry => focusLang === "all" || entry.lang === focusLang)
                        .map(entry => (
                          <tr key={entry.url}>
                            <td className="admin-index-url" title={entry.url}>{urlPath(entry.url)}</td>
                            <td>{languages.find(lang => lang.code === entry.lang)?.label || entry.lang}</td>
                            <td>
                              {notIndexedReason(entry)}
                              {canonicalElsewhere(entry) ? <div className="admin-index-muted">Google chose {urlPath(entry.googleCanonical || "")} as the main page</div> : null}
                            </td>
                            <td>{ukTimeFromIso(entry.lastCrawlTime)}</td>
                            <td>{entry.inspectedAtMs ? ukTime(entry.inspectedAtMs) : "—"}{entry.stale ? <div className="admin-index-muted">earlier check</div> : null}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="card app-card">
            <CardTitle icon="files" eyebrow="Google" title="Sitemaps" />
            {result.sitemapsError ? <p className="admin-index-warn">Could not read the sitemaps: {result.sitemapsError}</p> : null}
            {(result.sitemaps ?? []).length === 0 && !result.sitemapsError ? (
              <p className="muted-copy">No sitemap is submitted in Search Console.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="admin-search-table admin-index-table">
                  <thead>
                    <tr><th>Sitemap</th><th>Status</th><th className="num">URLs submitted</th><th>Read by Google</th><th>Submitted</th><th className="num">Errors</th><th className="num">Warnings</th></tr>
                  </thead>
                  <tbody>
                    {(result.sitemaps ?? []).map(sitemap => (
                      <tr key={sitemap.path}>
                        <td className="admin-index-url" title={sitemap.path}>{urlPath(sitemap.path)}{sitemap.isSitemapsIndex ? <span className="admin-index-muted"> (index)</span> : null}</td>
                        <td>{sitemap.isPending ? "Waiting for Google" : sitemap.errors ? "Has errors" : "Processed"}</td>
                        <td className="num">{chartCount(sitemap.submitted)}</td>
                        <td>{ukTimeFromIso(sitemap.lastDownloaded)}</td>
                        <td>{ukTimeFromIso(sitemap.lastSubmitted)}</td>
                        <td className="num">{chartCount(sitemap.errors)}</td>
                        <td className="num">{chartCount(sitemap.warnings)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="admin-index-meta">Google no longer reports how many sitemap URLs are indexed (that API field is deprecated); the indexed numbers above come from URL Inspection.</p>
          </section>
        </>
      ) : null}
    </div>
  );
}

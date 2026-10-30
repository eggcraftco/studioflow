"use client";

// Admin Insights hub: top-level admin-only analytics area with a left sidebar.
// Hosts the cross-workspace insight pages and the public-site Global Statistics.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { CardTitle } from "@/components/CardTitle";
import { isAnalyticsExcluded, setAnalyticsExclusion } from "@/lib/landingTracking";
import { AdminFeedbackInbox } from "@/components/AdminFeedbackInbox";
import { AdminLivePanel, useLiveAppNow } from "@/components/AdminLivePanel";
import { AdminDropoffPanel } from "@/components/AdminDropoffPanel";
import { PRESENCE_APPS, appBuckets, downloadCsv, toCsv } from "@/lib/studioflow/adminLivePresence";
import {
  countryShares,
  pageRowLabels,
  exclusionLine,
  unknownOr,
  activationEvidenceLine,
  BILLING_STATE_LABELS,
  type ExclusionSummary,
  type ActivationEvidence
} from "@/lib/studioflow/adminInsightsMetrics";

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-info-tile admin-info-tile">
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{label}</span>
      <strong style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>{value}</strong>
    </div>
  );
}

type SiteStatsDay = {
  date: string;
  total: number;
  sessions: number;
  engagedSessions: number;
  durationSeconds: number;
  pages: Record<string, number>;
  devices: Record<string, number>;
  languages: Record<string, number>;
  referrers: Record<string, number>;
  countries: Record<string, number>;
};

function sumStatsField(days: SiteStatsDay[], field: "total" | "sessions" | "durationSeconds" | "engagedSessions") {
  return days.reduce((acc, day) => acc + (Number(day[field]) || 0), 0);
}

// Page paths are stored with "/" replaced by "_" (Firestore field-name
// limitation). Convert back for display; the bare home path gets a name.
function pagePathLabel(key: string) {
  const path = key.replace(/_/g, "/");
  if (path === "/" || path === "" || key === "unknown") return "Home page";
  return path;
}

function flagEmoji(countryCode: string) {
  const code = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌍";
  return String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt(0)));
}

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}

function topStatsEntries(days: SiteStatsDay[], field: "pages" | "devices" | "languages" | "referrers" | "countries", limit = 6): [string, number][] {
  const merged = new Map<string, number>();
  for (const day of days) {
    for (const [key, value] of Object.entries(day[field] || {})) {
      merged.set(key, (merged.get(key) || 0) + (Number(value) || 0));
    }
  }
  return Array.from(merged.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function statsAvgDuration(days: SiteStatsDay[]) {
  const sessions = sumStatsField(days, "sessions");
  return sessions > 0 ? sumStatsField(days, "durationSeconds") / sessions : 0;
}

function statsBounceRate(days: SiteStatsDay[]) {
  const sessions = sumStatsField(days, "sessions");
  if (sessions <= 0) return 0;
  const engaged = Math.min(sumStatsField(days, "engagedSessions"), sessions);
  return ((sessions - engaged) / sessions) * 100;
}

function statsDurationText(seconds: number) {
  const total = Math.round(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function statsDeltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

const STATS_SEARCH_HOSTS = ["google", "bing", "duckduckgo", "yandex", "baidu", "ecosia"];
const STATS_SOCIAL_HOSTS = ["facebook", "instagram", "twitter", "x.com", "t.co", "linkedin", "youtube", "tiktok", "reddit", "pinterest"];

function statsSourceSlices(days: SiteStatsDay[]): { label: string; value: number; color: string }[] {
  let direct = 0;
  let organic = 0;
  let social = 0;
  let referral = 0;
  for (const [host, value] of topStatsEntries(days, "referrers", 100)) {
    if (host === "direct") direct += value;
    else if (STATS_SEARCH_HOSTS.some(h => host.includes(h))) organic += value;
    else if (STATS_SOCIAL_HOSTS.some(h => host.includes(h))) social += value;
    else referral += value;
  }
  return [
    { label: "Direct", value: direct, color: "#0a84ff" },
    { label: "Organic Search", value: organic, color: "#30b0c7" },
    { label: "Social Media", value: social, color: "#30d158" },
    { label: "Referral", value: referral, color: "#ff9f0a" }
  ].filter(slice => slice.value > 0);
}

function StatsSparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${30 - (value / max) * 26}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" style={{ width: "100%", height: 30, display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StatsDeltaBadge({ delta, invertGood }: { delta: number | null; invertGood?: boolean }) {
  if (delta === null) return null;
  const isGood = invertGood ? delta <= 0 : delta >= 0;
  // The sign is in the text, not only in the arrow: a screen reader read a drop as "12.5%".
  return (
    <span className={isGood ? "admin-delta is-good" : "admin-delta is-bad"}>
      <span aria-hidden="true">{delta >= 0 ? "▲" : "▼"}</span>
      {delta >= 0 ? "+" : "−"}{Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function StatsTrendChart({ days }: { days: SiteStatsDay[] }) {
  const width = 600;
  const height = 200;
  const pad = 8;
  const max = Math.max(...days.map(day => day.sessions), 1);
  const x = (index: number) => pad + (index / Math.max(days.length - 1, 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2);
  const linePoints = days.map((day, index) => `${x(index)},${y(day.sessions)}`).join(" ");
  const areaPoints = `${pad},${height - pad} ${linePoints} ${width - pad},${height - pad}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <polygon points={areaPoints} fill="rgba(138, 92, 246, 0.16)" />
      <polyline points={linePoints} fill="none" stroke="#8a5cf6" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {days.map((day, index) => (
        <circle key={day.date} cx={x(index)} cy={y(day.sessions)} r="3" fill="#8a5cf6">
          <title>{`${day.date}: ${day.sessions}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function StatsDonut({ slices, centerLabel }: { slices: { label: string; value: number; color: string }[]; centerLabel: string }) {
  const total = Math.max(slices.reduce((acc, slice) => acc + slice.value, 0), 1);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="site-stats-donut-row">
      <div style={{ position: "relative", width: 116, height: 116, flex: "0 0 auto" }}>
        <svg viewBox="0 0 116 116" style={{ width: 116, height: 116, transform: "rotate(-90deg)" }}>
          {slices.map(slice => {
            const fraction = slice.value / total;
            const dash = fraction * circumference;
            const el = (
              <circle
                key={slice.label}
                cx="58"
                cy="58"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth="14"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>{centerLabel}</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{total.toLocaleString()}</div>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 7, minWidth: 0, flex: 1 }}>
        {slices.map(slice => (
          <div key={slice.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: slice.color, flex: "0 0 auto" }} />
            <span style={{ fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{slice.label}</span>
            <span style={{ marginLeft: "auto", color: "var(--muted)", fontWeight: 700 }}>{((slice.value / total) * 100).toFixed(1)}%</span>
            <strong style={{ minWidth: 40, textAlign: "right" }}>{slice.value.toLocaleString()}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsRankedList({ entries, flags }: { entries: [string, number][]; flags?: boolean }) {
  const total = Math.max(entries.reduce((acc, [, value]) => acc + value, 0), 1);
  if (!entries.length) return <p className="muted-copy">No data yet.</p>;
  return (
    <div style={{ display: "grid" }}>
      {entries.map(([key, value], index) => (
        <div
          key={key}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid var(--border)" }}
        >
          {flags ? (
            <>
              <span aria-hidden="true">{flagEmoji(key)}</span>
              <span style={{ fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{countryName(key)}</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", width: 16 }}>{index + 1}</span>
              <span style={{ fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{key}</span>
            </>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)" }}>{((value / total) * 100).toFixed(1)}%</span>
          <strong style={{ fontSize: 13, minWidth: 44, textAlign: "right" }}>{value.toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
}

function StatsCard({ title, value, delta, invertGood, spark, color }: {
  title: string;
  value: string;
  delta: number | null;
  invertGood?: boolean;
  spark: number[];
  color: string;
}) {
  return (
    <section className="card app-card" style={{ display: "grid", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{title}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <strong style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>{value}</strong>
        <StatsDeltaBadge delta={delta} invertGood={invertGood} />
      </div>
      <span style={{ fontSize: 10.5, color: "var(--muted)" }}>vs previous period</span>
      <StatsSparkline values={spark} color={color} />
    </section>
  );
}

function LiveOnSiteCard() {
  const [active, setActive] = useState(0);
  const [pages, setPages] = useState<{ path: string; count: number }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const callable = httpsCallable<Record<string, never>, { active: number; pages: { path: string; count: number }[] }>(functions, "getSitePresence");
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      callable({}).then(result => {
        if (cancelled) return;
        setActive(Number(result.data?.active) || 0);
        setPages(result.data?.pages ?? []);
        setLoaded(true);
        setFailed(false);
      }).catch(() => { if (!cancelled) setFailed(true); });
    };
    poll();
    const interval = window.setInterval(poll, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <section className="card app-card site-stats-live">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <strong style={{ fontSize: 15, color: "#fff" }}>On Site Now</strong>
        {/* "Live" only while the last poll answered; a failed poll used to keep the green dot. */}
        <span role="status" aria-live="polite" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, color: failed ? "#ffb340" : "#30d158" }}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: failed ? "#ffb340" : "#30d158" }} />
          {failed ? "Not updating" : loaded ? "Live" : "Connecting"}
        </span>
      </div>
      <div>
        <div style={{ fontSize: 40, fontWeight: 900, color: "#fff", lineHeight: 1.05 }}>{active}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>Public-site visitors in the last 2 minutes (anonymous sessions; people in the apps are on the Live page)</div>
      </div>
      {pages.length > 0 ? (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 4 }}>
            <span>Most Active Pages</span>
            <span>Users</span>
          </div>
          {pages.slice(0, 5).map((page, index) => (
            <div key={page.path} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: index === 0 ? "none" : "1px solid rgba(255,255,255,0.10)" }}>
              <span style={{ fontSize: 13, fontWeight: 650, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pagePathLabel(page.path)}</span>
              <strong style={{ fontSize: 13, color: "#fff" }}>{page.count}</strong>
            </div>
          ))}
        </div>
      ) : loaded ? (
        <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>No one is on the site right now.</p>
      ) : null}
    </section>
  );
}

type LandingDay = {
  date: string;
  views: number;
  ctaClicks: number;
  howItWorksClicks: number;
  signupVisits: number;
  signupsCompleted: number;
  ctaDrivenSignupVisits: number;
  uniqueViews: number;
  uniqueCtaClicks: number;
  uniqueSignupVisits: number;
  uniqueSignupsCompleted: number;
};

type LandingCampaignRow = {
  source: string;
  medium: string;
  campaign: string;
  views: number;
  ctaClicks: number;
  signupVisits: number;
  signupsCompleted: number;
};

type LandingStats = {
  ok: boolean;
  days: LandingDay[];
  totals: { views: number; ctaClicks: number; howItWorksClicks: number; signupVisits: number; signupsCompleted: number; ctaDrivenSignupVisits: number; demoPlays?: number; demoCompletes?: number; homepageDemoPlays?: number; homepageDemoCompletes?: number };
  unique: { views: number; ctaClicks: number; signupVisits: number; signupsCompleted: number; demoPlays?: number; homepageDemoPlays?: number };
  devices: Record<string, number>;
  sources: Record<string, number>;
  referrers: Record<string, number>;
  utmTerms: Record<string, number>;
  utmContents: Record<string, number>;
  campaigns: LandingCampaignRow[];
  reportFromDate?: string;
  range?: { start: string; end: string };
};

type LandingRangeKey = "today" | "yesterday" | "7" | "30" | "custom";

function landingRate(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

// YYYY-MM-DD in the timezone the server buckets days in (Europe/London), so the
// Today / Yesterday / custom buttons line up exactly with the stored daily docs.
function landingDayStr(offsetDays = 0): string {
  const d = new Date(Date.now() - offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
}

function LandingMetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px", background: "var(--surface, #fff)" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 950, marginTop: 4 }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

function AdminCustomOrderLandingSection() {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [rangeKey, setRangeKey] = useState<LandingRangeKey>("30");
  const [customStart, setCustomStart] = useState<string>(() => landingDayStr(6));
  const [customEnd, setCustomEnd] = useState<string>(() => landingDayStr(0));
  const [data, setData] = useState<LandingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [excluded, setExcluded] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  // An admin viewing this panel is internal traffic, so auto opt-out their
  // browser from landing analytics (plus a manual toggle below). The landing
  // tracking is also never loaded inside the authenticated app.
  useEffect(() => {
    if (!isAnalyticsExcluded()) setAnalyticsExclusion(true);
    setExcluded(isAnalyticsExcluded());
  }, []);

  const requestPayload = useMemo<{ days?: number; startDate?: string; endDate?: string }>(() => {
    if (rangeKey === "today") return { days: 1 };
    if (rangeKey === "7") return { days: 7 };
    if (rangeKey === "30") return { days: 30 };
    if (rangeKey === "yesterday") { const y = landingDayStr(1); return { startDate: y, endDate: y }; }
    return { startDate: customStart, endDate: customEnd };
  }, [rangeKey, customStart, customEnd]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const callable = httpsCallable<{ days?: number; startDate?: string; endDate?: string }, LandingStats>(functions, "getCustomOrderLandingStats");
    callable(requestPayload)
      .then(result => { if (!cancelled) setData(result.data); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load landing-page statistics."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [requestPayload, refreshTick]);

  const totals = data?.totals ?? { views: 0, ctaClicks: 0, howItWorksClicks: 0, signupVisits: 0, signupsCompleted: 0, ctaDrivenSignupVisits: 0 };
  const unique = data?.unique ?? { views: 0, ctaClicks: 0, signupVisits: 0, signupsCompleted: 0 };
  const rangeDays = data?.days ?? [];
  const deviceEntries = Object.entries(data?.devices ?? {}).sort((a, b) => b[1] - a[1]);
  const sourceEntries = Object.entries(data?.sources ?? {}).sort((a, b) => b[1] - a[1]);
  const referrerEntries = Object.entries(data?.referrers ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const termEntries = Object.entries(data?.utmTerms ?? {}).filter(([key]) => key !== "none").sort((a, b) => b[1] - a[1]).slice(0, 8);
  const contentEntries = Object.entries(data?.utmContents ?? {}).filter(([key]) => key !== "none").sort((a, b) => b[1] - a[1]).slice(0, 8);
  const campaigns = data?.campaigns ?? [];
  const deviceTotal = deviceEntries.reduce((sum, [, value]) => sum + value, 0);
  const sourceTotal = sourceEntries.reduce((sum, [, value]) => sum + value, 0);
  const referrerTotal = referrerEntries.reduce((sum, [, value]) => sum + value, 0);
  const reportFromDate = data?.reportFromDate || "";

  const rangeButton = (key: LandingRangeKey, label: string) => (
    <button
      key={key}
      type="button"
      className="button"
      aria-pressed={rangeKey === key}
      onClick={() => setRangeKey(key)}
      style={{
        padding: "7px 14px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        background: rangeKey === key ? "#0a84ff" : "var(--admin-chip-bg)",
        color: rangeKey === key ? "#fff" : "var(--text)"
      }}
    >
      {label}
    </button>
  );

  const toggleExclusion = () => {
    const next = !excluded;
    setAnalyticsExclusion(next);
    setExcluded(next);
  };

  const applyReset = async (fromDate: "today" | "clear") => {
    if (fromDate === "today" && typeof window !== "undefined" &&
      !window.confirm("Start the landing-page report fresh from today?\n\nEarlier counters stay stored in Firestore but are hidden from this panel. You can show all history again at any time.")) {
      return;
    }
    setResetBusy(true);
    setResetMsg("");
    try {
      const callable = httpsCallable<{ fromDate: string }, { ok: boolean; reportFromDate: string }>(functions, "resetCustomOrderLandingStats");
      const res = await callable({ fromDate });
      setResetMsg(res.data.reportFromDate ? `Now reporting from ${res.data.reportFromDate}.` : "Showing all history again.");
      setRefreshTick(tick => tick + 1);
    } catch (err) {
      setResetMsg(err instanceof Error ? err.message : "Could not update the reporting window.");
    } finally {
      setResetBusy(false);
    }
  };

  const funnelSteps = [
    { label: "Landing views", value: totals.views },
    { label: "Start Free Trial clicks", value: totals.ctaClicks },
    { label: "Signup page visits", value: totals.signupVisits },
    { label: "Signups completed", value: totals.signupsCompleted }
  ];
  const maxFunnel = Math.max(1, ...funnelSteps.map(step => step.value));

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Custom Order Landing Page" />
        <p className="muted-copy">
          Anonymous, aggregate-only stats for <strong>/custom-order-management</strong>. No cookies that identify a person, no
          email, name or IP — event counts, an anonymous random visitor id (used only to size unique counts), device class and
          campaign attribution.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0 0", alignItems: "center" }}>
          {rangeButton("today", "Today")}
          {rangeButton("yesterday", "Yesterday")}
          {rangeButton("7", "Last 7 days")}
          {rangeButton("30", "Last 30 days")}
          {rangeButton("custom", "Custom")}
        </div>
        {rangeKey === "custom" ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0 0", alignItems: "center", fontSize: 13 }}>
            <label htmlFor="landing-range-from" style={{ fontWeight: 700, color: "var(--muted)" }}>From</label>
            <input id="landing-range-from" className="admin-date-input" type="date" value={customStart} max={customEnd} onChange={event => setCustomStart(event.target.value)} />
            <label htmlFor="landing-range-to" style={{ fontWeight: 700, color: "var(--muted)" }}>to</label>
            <input id="landing-range-to" className="admin-date-input" type="date" value={customEnd} min={customStart} max={landingDayStr(0)} onChange={event => setCustomEnd(event.target.value)} />
          </div>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "12px 0 0", alignItems: "center" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <input type="checkbox" checked={excluded} onChange={toggleExclusion} />
            Exclude my own visits from these stats
          </label>
          <span style={{ fontSize: 11, fontWeight: 700, color: excluded ? "var(--success, #1a7f37)" : "var(--danger)" }}>
            {excluded ? "This browser is NOT counted." : "This browser IS being counted."}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0 0", alignItems: "center" }}>
          <button type="button" className="button" disabled={resetBusy} onClick={() => applyReset("today")}
            style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: "var(--danger-soft)", color: "var(--danger)" }}>
            Start fresh from today
          </button>
          {reportFromDate ? (
            <button type="button" className="button" disabled={resetBusy} onClick={() => applyReset("clear")}
              style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: "var(--admin-chip-bg)", color: "var(--text)" }}>
              Show all history
            </button>
          ) : null}
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>
            {reportFromDate ? `Reporting from ${reportFromDate} (older data hidden, not deleted).` : "Showing all stored history."}
            {resetMsg ? ` · ${resetMsg}` : ""}
          </span>
        </div>

        {loading ? <p className="muted-copy" style={{ marginTop: 8 }}>Loading…</p> : null}
        {error ? <p style={{ color: "var(--danger)", margin: "8px 0 0" }}>{t(error)}</p> : null}
      </section>

      {!loading && !error ? (
        <>
          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Totals + unique visitors" title="Key metrics" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 10 }}>
              <LandingMetricTile label="Landing page views" value={totals.views.toLocaleString()} sub={`${unique.views.toLocaleString()} unique visitors`} />
              <LandingMetricTile label="Start Free Trial clicks" value={totals.ctaClicks.toLocaleString()} sub={`${unique.ctaClicks.toLocaleString()} unique`} />
              <LandingMetricTile label="CTA click-through rate" value={landingRate(totals.ctaClicks, totals.views)} sub="clicks ÷ views" />
              <LandingMetricTile label="See How It Works clicks" value={totals.howItWorksClicks.toLocaleString()} />
              <LandingMetricTile label="Signup page visits" value={totals.signupVisits.toLocaleString()} sub={`${unique.signupVisits.toLocaleString()} unique · from this landing page`} />
              <LandingMetricTile label="CTA-driven signup visits" value={totals.ctaDrivenSignupVisits.toLocaleString()} sub="visited /signup right after a CTA click" />
              <LandingMetricTile label="Signups completed" value={totals.signupsCompleted.toLocaleString()} sub={`${unique.signupsCompleted.toLocaleString()} unique · from this landing page`} />
              <LandingMetricTile label="Landing → signup conversion" value={landingRate(totals.signupsCompleted, totals.views)} sub="completed ÷ views" />
              <LandingMetricTile label="Demo plays · landing page" value={(totals.demoPlays ?? 0).toLocaleString()} sub={`${(unique.demoPlays ?? 0).toLocaleString()} unique viewers`} />
              <LandingMetricTile label="Demo watched to end · landing" value={(totals.demoCompletes ?? 0).toLocaleString()} sub={`${landingRate(totals.demoCompletes ?? 0, totals.demoPlays ?? 0)} of plays`} />
              <LandingMetricTile label="Demo plays · main site" value={(totals.homepageDemoPlays ?? 0).toLocaleString()} sub={`${(unique.homepageDemoPlays ?? 0).toLocaleString()} unique · homepage + features`} />
              <LandingMetricTile label="Demo watched to end · main site" value={(totals.homepageDemoCompletes ?? 0).toLocaleString()} sub={`${landingRate(totals.homepageDemoCompletes ?? 0, totals.homepageDemoPlays ?? 0)} of plays`} />
            </div>
            <p className="muted-copy" style={{ fontSize: 11, marginTop: 10 }}>
              Signup visits may include users who reached /signup after being attributed to this landing page, including refreshes
              or direct return visits — so they can exceed CTA clicks. “CTA-driven signup visits” counts only visits immediately
              after a Start Free Trial click.
            </p>
          </section>

          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Funnel" title="Landing → signup funnel" />
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {funnelSteps.map((step, index) => {
                const prev = index === 0 ? null : funnelSteps[index - 1];
                return (
                  <Fragment key={step.label}>
                    {prev ? (
                      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textAlign: "center" }}>
                        ↓ {landingRate(step.value, prev.value)} of {prev.label.toLowerCase()}
                      </div>
                    ) : null}
                    <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", position: "relative", background: "var(--admin-tile-bg)" }}>
                      <div style={{ position: "absolute", inset: 0, width: `${Math.round((step.value / maxFunnel) * 100)}%`, background: "rgba(10,132,255,0.16)" }} />
                      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", padding: "10px 14px", fontWeight: 800, fontSize: 14 }}>
                        <span>{step.label}</span>
                        <span>{step.value.toLocaleString()}</span>
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
            <p className="muted-copy" style={{ fontSize: 11, marginTop: 10 }}>
              Overall landing view → completed signup: <strong>{landingRate(totals.signupsCompleted, totals.views)}</strong>.
            </p>
          </section>

          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Attribution" title="UTM / campaign breakdown" />
            {campaigns.length === 0 ? (
              <p className="muted-copy">No campaign data yet. Tag your ad URLs with utm_source / utm_medium / utm_campaign.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>
                      <th style={{ padding: "7px 8px" }}>Source</th>
                      <th style={{ padding: "7px 8px" }}>Medium</th>
                      <th style={{ padding: "7px 8px" }}>Campaign</th>
                      <th style={{ padding: "7px 8px" }}>Views</th>
                      <th style={{ padding: "7px 8px" }}>CTA clicks</th>
                      <th style={{ padding: "7px 8px" }}>Signup visits</th>
                      <th style={{ padding: "7px 8px" }}>Signups</th>
                      <th style={{ padding: "7px 8px" }}>Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((row, index) => (
                      <tr key={`${row.source}-${row.medium}-${row.campaign}-${index}`} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 8px", fontWeight: 700 }}>{row.source}</td>
                        <td style={{ padding: "7px 8px" }}>{row.medium}</td>
                        <td style={{ padding: "7px 8px" }}>{row.campaign}</td>
                        <td style={{ padding: "7px 8px" }}>{row.views.toLocaleString()}</td>
                        <td style={{ padding: "7px 8px" }}>{row.ctaClicks.toLocaleString()}</td>
                        <td style={{ padding: "7px 8px" }}>{row.signupVisits.toLocaleString()}</td>
                        <td style={{ padding: "7px 8px" }}>{row.signupsCompleted.toLocaleString()}</td>
                        <td style={{ padding: "7px 8px" }}>{landingRate(row.signupsCompleted, row.views)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Daily" title="Daily breakdown" />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>
                    <th style={{ padding: "7px 8px" }}>Date</th>
                    <th style={{ padding: "7px 8px" }}>Views</th>
                    <th style={{ padding: "7px 8px" }}>Unique</th>
                    <th style={{ padding: "7px 8px" }}>CTA clicks</th>
                    <th style={{ padding: "7px 8px" }}>How it works</th>
                    <th style={{ padding: "7px 8px" }}>Signup visits</th>
                    <th style={{ padding: "7px 8px" }}>Signups</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rangeDays].reverse().map(day => (
                    <tr key={day.date} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 8px", fontWeight: 700 }}>{day.date}</td>
                      <td style={{ padding: "7px 8px" }}>{day.views}</td>
                      <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{day.uniqueViews}</td>
                      <td style={{ padding: "7px 8px" }}>{day.ctaClicks}</td>
                      <td style={{ padding: "7px 8px" }}>{day.howItWorksClicks}</td>
                      <td style={{ padding: "7px 8px" }}>{day.signupVisits}</td>
                      <td style={{ padding: "7px 8px" }}>{day.signupsCompleted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="site-stats-grid">
            <section className="card app-card">
              <CardTitle icon="dashboard" eyebrow="Traffic" title="Device breakdown" />
              {deviceEntries.length === 0 ? (
                <p className="muted-copy">No data yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {deviceEntries.map(([key, value]) => (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                      <span style={{ textTransform: "capitalize" }}>{key}</span>
                      <span>{value.toLocaleString()} · {landingRate(value, deviceTotal)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="card app-card">
              <CardTitle icon="dashboard" eyebrow="Traffic" title="Source" />
              {sourceEntries.length === 0 ? (
                <p className="muted-copy">No data yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {sourceEntries.map(([key, value]) => (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                      <span style={{ textTransform: "capitalize" }}>{key}</span>
                      <span>{value.toLocaleString()} · {landingRate(value, sourceTotal)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="card app-card">
              <CardTitle icon="dashboard" eyebrow="Traffic" title="Referrer hostname" />
              {referrerEntries.length === 0 ? (
                <p className="muted-copy">No referrer data yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {referrerEntries.map(([key, value]) => (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                      <span>{key}</span>
                      <span>{value.toLocaleString()} · {landingRate(value, referrerTotal)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {(termEntries.length > 0 || contentEntries.length > 0) ? (
            <div className="site-stats-grid">
              <section className="card app-card">
                <CardTitle icon="dashboard" eyebrow="Attribution" title="utm_term" />
                {termEntries.length === 0 ? <p className="muted-copy">No utm_term data.</p> : (
                  <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    {termEntries.map(([key, value]) => (
                      <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                        <span>{key}</span><span>{value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section className="card app-card">
                <CardTitle icon="dashboard" eyebrow="Attribution" title="utm_content" />
                {contentEntries.length === 0 ? <p className="muted-copy">No utm_content data.</p> : (
                  <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    {contentEntries.map(([key, value]) => (
                      <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                        <span>{key}</span><span>{value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function AdminSiteStatsSection() {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  // The server files each visit under its UK date (siteStatsDateKey), so "today" is the UK date too —
  // the UTC date was a day behind between midnight and 01:00 in summer.
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const [rangeMode, setRangeMode] = useState<number>(30); // 7 / 30 / 90, -1 = custom
  const [customStart, setCustomStart] = useState(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(todayKey);
  const [allDays, setAllDays] = useState<SiteStatsDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const span = (() => {
    if (rangeMode !== -1) {
      const end = new Date(`${todayKey}T12:00:00Z`);
      const start = new Date(end.getTime() - (rangeMode - 1) * 86400000);
      return { start, end };
    }
    // A cleared or half-typed date field gives an empty string; it used to become an Invalid Date
    // whose toISOString() threw inside the effect and took the page down. Fall back to the last 30 days.
    const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`));
    let start = new Date(`${validDay(customStart) ? customStart : new Date(Date.parse(`${todayKey}T12:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10)}T12:00:00Z`);
    let end = new Date(`${validDay(customEnd) ? customEnd : todayKey}T12:00:00Z`);
    if (start > end) [start, end] = [end, start];
    const today = new Date(`${todayKey}T12:00:00Z`);
    if (end > today) end = today;
    return { start, end };
  })();
  const rangeLength = Math.max(Math.round((span.end.getTime() - span.start.getTime()) / 86400000) + 1, 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const fetchStart = new Date(span.start.getTime() - rangeLength * 86400000);
    const callable = httpsCallable<{ startDate: string; endDate: string }, { ok: boolean; days: SiteStatsDay[] }>(functions, "getSiteStats");
    callable({ startDate: fetchStart.toISOString().slice(0, 10), endDate: span.end.toISOString().slice(0, 10) })
      .then(result => {
        if (!cancelled) setAllDays(result.data?.days ?? []);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load site statistics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeMode, customStart, customEnd]);

  const loadedDays = allDays ?? [];
  const current = loadedDays.slice(-rangeLength);
  const previous = loadedDays.slice(0, Math.max(loadedDays.length - rangeLength, 0));

  const curSessions = sumStatsField(current, "sessions");
  const prevSessions = sumStatsField(previous, "sessions");
  const curViews = sumStatsField(current, "total");
  const prevViews = sumStatsField(previous, "total");
  const curDuration = statsAvgDuration(current);
  const prevDuration = statsAvgDuration(previous);
  const curBounce = statsBounceRate(current);
  const prevBounce = statsBounceRate(previous);

  const rangeButton = (option: number, label: string) => (
    <button
      key={option}
      type="button"
      className="button"
      aria-pressed={rangeMode === option}
      onClick={() => setRangeMode(option)}
      style={{
        padding: "7px 14px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        background: rangeMode === option ? "#0a84ff" : "var(--admin-chip-bg)",
        color: rangeMode === option ? "#fff" : "var(--text)"
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Public website statistics" />
        <p className="muted-copy">Anonymous visitor counts from nivadesk.app. No cookies or personal data are collected.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0 4px" }}>
          {rangeButton(7, "7d")}
          {rangeButton(30, "30d")}
          {rangeButton(90, "90d")}
          {rangeButton(-1, "Custom")}
        </div>
        {rangeMode === -1 ? (
          <div className="site-stats-custom-range">
            <label style={{ display: "grid", gap: 3, fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>
              Start
              <input type="date" value={customStart} max={todayKey} onChange={event => setCustomStart(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 3, fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>
              End
              <input type="date" value={customEnd} max={todayKey} onChange={event => setCustomEnd(event.target.value)} />
            </label>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", alignSelf: "end", paddingBottom: 8 }}>{rangeLength} days</span>
          </div>
        ) : null}
        {loading ? <p className="muted-copy" role="status">Loading statistics...</p> : null}
        {error ? <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>{t(error)}</p> : null}
        {!loading && !error && current.length ? (
          <button
            type="button"
            className="button secondary admin-small-button"
            style={{ marginTop: 10 }}
            onClick={() => downloadCsv(
              `nivadesk-site-stats-${current[0].date}-${current[current.length - 1].date}.csv`,
              toCsv(["uk_date", "page_views", "sessions", "engaged_sessions", "duration_seconds"], current.map(day => [day.date, day.total, day.sessions, day.engagedSessions, day.durationSeconds]))
            )}
          >
            Export CSV
          </button>
        ) : null}
        <p className="muted-copy admin-footnote">A session is one browser tab&apos;s visit, so one person with two tabs counts twice. Admin browsers are left out once Insights has been opened in them.</p>
      </section>

      <LiveOnSiteCard />

      {!loading && !error ? (
        <>
          <div className="site-stats-grid">
            <StatsCard title="Visitor sessions" value={curSessions.toLocaleString()} delta={statsDeltaPercent(curSessions, prevSessions)} spark={current.map(day => day.sessions)} color="#8a5cf6" />
            <StatsCard title="Page Views" value={curViews.toLocaleString()} delta={statsDeltaPercent(curViews, prevViews)} spark={current.map(day => day.total)} color="#0a84ff" />
            <StatsCard title="Avg. Session Duration" value={statsDurationText(curDuration)} delta={statsDeltaPercent(curDuration, prevDuration)} spark={current.map(day => (day.sessions > 0 ? day.durationSeconds / day.sessions : 0))} color="#30d158" />
            <StatsCard title="Bounce Rate" value={`${curBounce.toFixed(1)}%`} delta={statsDeltaPercent(curBounce, prevBounce)} invertGood spark={current.map(day => (day.sessions > 0 ? ((day.sessions - Math.min(day.engagedSessions, day.sessions)) / day.sessions) * 100 : 0))} color="#ff9f0a" />
          </div>

          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Visitors" title="Visitor Trend" />
            <StatsTrendChart days={current} />
          </section>

          <div className="site-stats-panels">
            <section className="card app-card">
              <CardTitle icon="dashboard" eyebrow="Visitors" title="Top Traffic Sources" />
              {statsSourceSlices(current).length ? <StatsDonut slices={statsSourceSlices(current)} centerLabel="Total" /> : <p className="muted-copy">No data yet.</p>}
            </section>
            <section className="card app-card">
              <CardTitle icon="dashboard" eyebrow="Visitors" title="Devices" />
              {(() => {
                const devices = topStatsEntries(current, "devices", 3);
                const palette: Record<string, string> = { desktop: "#0a84ff", mobile: "#8a5cf6", tablet: "#30b0c7" };
                const slices = devices.map(([key, value]) => ({ label: key.charAt(0).toUpperCase() + key.slice(1), value, color: palette[key] || "#9ca3af" }));
                return slices.length ? <StatsDonut slices={slices} centerLabel="Total" /> : <p className="muted-copy">No data yet.</p>;
              })()}
            </section>
            <section className="card app-card">
              <CardTitle icon="dashboard" eyebrow="Visitors" title="Visitors by Country" />
              <StatsRankedList entries={topStatsEntries(current, "countries")} flags />
            </section>
            <section className="card app-card">
              <CardTitle icon="dashboard" eyebrow="Visitors" title="Top Pages" />
              <StatsRankedList entries={topStatsEntries(current, "pages").map(([key, value]) => [pagePathLabel(key), value])} />
            </section>
            <section className="card app-card">
              <CardTitle icon="dashboard" eyebrow="Visitors" title="Visitor Languages" />
              <StatsRankedList entries={topStatsEntries(current, "languages")} />
            </section>
            <section className="card app-card">
              <CardTitle icon="dashboard" eyebrow="Visitors" title="Traffic Sources (hosts)" />
              <StatsRankedList entries={topStatsEntries(current, "referrers", 10)} />
            </section>
          </div>

        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Google Search — Search Console rankings (queries, position, day-over-day change)
// ---------------------------------------------------------------------------

type SearchConsoleQuery = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prevPosition: number | null;
  positionDelta: number | null;
  impressionsDelta: number | null;
  isNew: boolean;
};

type SearchConsoleDay = { date: string; clicks: number; impressions: number; ctr: number; position: number };
type SearchConsolePage = { page: string; clicks: number; impressions: number; ctr: number; position: number };
type SearchConsoleCountry = { country: string; clicks: number; impressions: number };
type SearchConsoleDevice = { device: string; clicks: number; impressions: number };

type SearchConsoleResult = {
  ok: boolean;
  needsAccess?: boolean;
  serviceAccountEmail?: string;
  accessibleSites?: string[];
  property?: string;
  message?: string;
  range?: { startDate: string; endDate: string };
  previousRange?: { startDate: string; endDate: string };
  totals?: {
    current: { clicks: number; impressions: number; ctr: number; position: number };
    previous: { clicks: number; impressions: number; ctr: number; position: number };
  };
  queries?: SearchConsoleQuery[];
  byDate?: SearchConsoleDay[];
  pages?: SearchConsolePage[];
  countries?: SearchConsoleCountry[];
  devices?: SearchConsoleDevice[];
};

// GSC reports countries as ISO alpha-3; map the common ones to alpha-2 so we can
// reuse the flag + localized name helpers. Unknown codes fall back to the code.
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  GBR: "GB", USA: "US", IRL: "IE", DEU: "DE", FRA: "FR", NLD: "NL", ESP: "ES", ITA: "IT",
  CAN: "CA", AUS: "AU", IND: "IN", TUR: "TR", BEL: "BE", CHE: "CH", AUT: "AT", SWE: "SE",
  NOR: "NO", DNK: "DK", FIN: "FI", POL: "PL", PRT: "PT", GRC: "GR", ROU: "RO", CZE: "CZ",
  NZL: "NZ", ZAF: "ZA", BRA: "BR", MEX: "MX", ARE: "AE", SAU: "SA", JPN: "JP", KOR: "KR",
  CHN: "CN", RUS: "RU", UKR: "UA", HUN: "HU", BGR: "BG", HRV: "HR", SRB: "RS", SVK: "SK"
};

function searchCountryLabel(alpha3: string) {
  const a2 = ALPHA3_TO_ALPHA2[alpha3];
  if (!a2) return { flag: "🌍", name: alpha3 };
  return { flag: flagEmoji(a2), name: countryName(a2) };
}

const SEARCH_DEVICE_LABELS: Record<string, string> = { DESKTOP: "Desktop", MOBILE: "Mobile", TABLET: "Tablet" };
const SEARCH_DEVICE_COLORS: Record<string, string> = { DESKTOP: "#0a84ff", MOBILE: "#8a5cf6", TABLET: "#30b0c7" };

// Clicks + impressions over time (impressions as area, clicks as line).
function SearchTrendChart({ data }: { data: SearchConsoleDay[] }) {
  if (data.length < 2) return <p className="muted-copy">Not enough days to chart yet.</p>;
  const width = 600;
  const height = 200;
  const pad = 10;
  const maxImpr = Math.max(...data.map(d => d.impressions), 1);
  const maxClk = Math.max(...data.map(d => d.clicks), 1);
  const x = (i: number) => pad + (i / Math.max(data.length - 1, 1)) * (width - pad * 2);
  const yI = (v: number) => height - pad - (v / maxImpr) * (height - pad * 2);
  const yC = (v: number) => height - pad - (v / maxClk) * (height - pad * 2);
  const imprLine = data.map((d, i) => `${x(i)},${yI(d.impressions)}`).join(" ");
  const imprArea = `${pad},${height - pad} ${imprLine} ${width - pad},${height - pad}`;
  const clkLine = data.map((d, i) => `${x(i)},${yC(d.clicks)}`).join(" ");
  return (
    <>
      <div style={{ display: "flex", gap: 16, fontSize: 11.5, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#8a5cf6" }} />Impressions</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#0a84ff" }} />Clicks</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <polygon points={imprArea} fill="rgba(138, 92, 246, 0.16)" />
        <polyline points={imprLine} fill="none" stroke="#8a5cf6" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={clkLine} fill="none" stroke="#0a84ff" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <circle key={d.date} cx={x(i)} cy={yI(d.impressions)} r="2.5" fill="#8a5cf6">
            <title>{`${d.date}: ${d.impressions} impressions, ${d.clicks} clicks`}</title>
          </circle>
        ))}
      </svg>
    </>
  );
}

// Average position over time. Y is inverted (1 = best at the top); a line that
// climbs means we rose toward #1.
function SearchPositionChart({ data }: { data: SearchConsoleDay[] }) {
  const pts = data.filter(d => d.position > 0);
  if (pts.length < 2) return <p className="muted-copy">Not enough ranked days to chart yet.</p>;
  const width = 600;
  const height = 150;
  const pad = 10;
  const maxPos = Math.max(...pts.map(d => d.position));
  const minPos = Math.min(...pts.map(d => d.position));
  const span = Math.max(maxPos - minPos, 1);
  const x = (i: number) => pad + (i / Math.max(pts.length - 1, 1)) * (width - pad * 2);
  // Higher on screen = better (smaller position number).
  const y = (v: number) => pad + ((v - minPos) / span) * (height - pad * 2);
  const line = pts.map((d, i) => `${x(i)},${y(d.position)}`).join(" ");
  return (
    <>
      <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 6px" }}>Higher line = better rank (closer to #1). Best {minPos.toFixed(1)} · worst {maxPos.toFixed(1)}.</p>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <polyline points={line} fill="none" stroke="#ff9f0a" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((d, i) => (
          <circle key={d.date} cx={x(i)} cy={y(d.position)} r="2.5" fill="#ff9f0a">
            <title>{`${d.date}: position ${d.position.toFixed(1)}`}</title>
          </circle>
        ))}
      </svg>
    </>
  );
}

// Shows the rank shift vs the previous period. A larger position number is
// worse, so positionDelta > 0 (we rose toward #1) is good → green ▲.
function PositionDeltaBadge({ delta, isNew }: { delta: number | null; isNew?: boolean }) {
  if (isNew) {
    return <span className="admin-delta is-good admin-new-badge">New</span>;
  }
  if (delta === null || Math.abs(delta) < 0.05) {
    return <span style={{ fontSize: 12, color: "var(--muted)" }}>–</span>;
  }
  const improved = delta > 0;
  return (
    <span className={improved ? "admin-delta is-good" : "admin-delta is-bad"} title={improved ? "Ranks higher than in the previous period" : "Ranks lower than in the previous period"}>
      <span aria-hidden="true">{improved ? "▲" : "▼"}</span>
      <span className="visually-hidden">{improved ? "up " : "down "}</span>
      {Math.abs(delta).toFixed(1)}
    </span>
  );
}

function AdminSearchConsoleSection() {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [rangeDays, setRangeDays] = useState<number>(28); // 7 / 28 / 90
  const [result, setResult] = useState<SearchConsoleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    // GSC data lags ~3 days; end the window there so positions are populated.
    const endMs = Date.now() - 3 * 86400000;
    const startMs = endMs - (rangeDays - 1) * 86400000;
    const callable = httpsCallable<{ startDate: string; endDate: string }, SearchConsoleResult>(functions, "getSearchConsoleStats");
    callable({ startDate: new Date(startMs).toISOString().slice(0, 10), endDate: new Date(endMs).toISOString().slice(0, 10) })
      .then(res => {
        if (!cancelled) setResult(res.data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load search rankings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeDays]);

  const rangeButton = (option: number, label: string) => (
    <button
      key={option}
      type="button"
      className="button"
      aria-pressed={rangeDays === option}
      onClick={() => setRangeDays(option)}
      style={{
        padding: "7px 14px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        background: rangeDays === option ? "#0a84ff" : "var(--admin-chip-bg)",
        color: rangeDays === option ? "#fff" : "var(--text)"
      }}
    >
      {label}
    </button>
  );

  const totals = result?.totals;
  const cur = totals?.current;
  const prev = totals?.previous;
  const queries = result?.queries ?? [];
  const byDate = result?.byDate ?? [];
  const pages = result?.pages ?? [];
  const countries = result?.countries ?? [];
  const devices = result?.devices ?? [];
  const movers = queries
    .filter(q => q.positionDelta !== null && !q.isNew && Math.abs(q.positionDelta) >= 0.5)
    .sort((a, b) => Math.abs(b.positionDelta as number) - Math.abs(a.positionDelta as number))
    .slice(0, 6);

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Google Search rankings" />
        <p className="muted-copy">What people search to find NivaDesk on Google, where we rank, and how positions changed vs the previous period. Data from Google Search Console (≈3-day lag).</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0 4px" }}>
          {rangeButton(7, "7d")}
          {rangeButton(28, "28d")}
          {rangeButton(90, "90d")}
        </div>
        {result?.property ? <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "4px 0 0" }}>Property: <strong>{result.property}</strong></p> : null}
        {loading ? <p className="muted-copy">Loading search rankings…</p> : null}
        {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{t(error)}</p> : null}
      </section>

      {!loading && result && result.ok === false ? (
        <section className="card app-card" style={{ display: "grid", gap: 10 }}>
          <CardTitle icon="lock" eyebrow="Setup required" title="Connect Google Search Console" />
          <p className="muted-copy">{result.message || "Search Console access is not configured yet."}</p>
          <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, fontSize: 13.5, lineHeight: 1.5 }}>
            <li>In Google Cloud Console, enable the <strong>Google Search Console API</strong> for project <code>eggcraft-studio</code>.</li>
            <li>
              In Search Console → <em>Settings → Users and permissions</em>, add this service account as a <strong>Full</strong> (or Restricted) user:
              {result.serviceAccountEmail ? (
                <div style={{ marginTop: 6 }}>
                  <code style={{ display: "inline-block", padding: "4px 8px", borderRadius: 8, background: "var(--admin-chip-bg)", fontSize: 12.5, wordBreak: "break-all" }}>{result.serviceAccountEmail}</code>
                </div>
              ) : <em> (service account email unavailable — check function logs)</em>}
            </li>
            <li>Make sure the <code>{NIVADESK_DOMAIN_LABEL}</code> property is verified, then reload this page.</li>
          </ol>
          {result.accessibleSites && result.accessibleSites.length > 0 ? (
            <p style={{ fontSize: 11.5, color: "var(--muted)", margin: 0 }}>Currently visible properties: {result.accessibleSites.join(", ")}</p>
          ) : null}
        </section>
      ) : null}

      {!loading && result?.ok && cur && prev ? (
        <>
          <div className="site-stats-grid">
            <StatsCard title="Total Clicks" value={cur.clicks.toLocaleString()} delta={statsDeltaPercent(cur.clicks, prev.clicks)} spark={byDate.map(d => d.clicks)} color="#0a84ff" />
            <StatsCard title="Impressions" value={cur.impressions.toLocaleString()} delta={statsDeltaPercent(cur.impressions, prev.impressions)} spark={byDate.map(d => d.impressions)} color="#8a5cf6" />
            <StatsCard title="Avg. CTR" value={`${(cur.ctr * 100).toFixed(1)}%`} delta={statsDeltaPercent(cur.ctr, prev.ctr)} spark={byDate.map(d => d.ctr * 100)} color="#30d158" />
            <StatsCard title="Avg. Position" value={cur.position.toFixed(1)} delta={statsDeltaPercent(cur.position, prev.position)} invertGood spark={byDate.map(d => d.position)} color="#ff9f0a" />
          </div>

          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Search" title="Clicks & impressions over time" />
            <SearchTrendChart data={byDate} />
          </section>

          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Search" title="Average position over time" />
            <SearchPositionChart data={byDate} />
          </section>

          {movers.length > 0 ? (
            <section className="card app-card">
              <CardTitle icon="dashboard" eyebrow="Search" title="Biggest ranking movers" />
              <div style={{ display: "grid" }}>
                {movers.map((q, index) => (
                  <div key={q.query} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid var(--border)" }}>
                    <span style={{ fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{q.query}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{q.prevPosition?.toFixed(1)} → {q.position.toFixed(1)}</span>
                    <PositionDeltaBadge delta={q.positionDelta} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Search" title="Top search queries" />
            {queries.length === 0 ? (
              <p className="muted-copy">No search impressions in this period yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="admin-search-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11, fontWeight: 800 }}>
                      <th style={{ padding: "8px 6px", width: 28 }}>#</th>
                      <th style={{ padding: "8px 6px" }}>Query</th>
                      <th style={{ padding: "8px 6px", textAlign: "right" }}>Impr.</th>
                      <th style={{ padding: "8px 6px", textAlign: "right" }}>Clicks</th>
                      <th style={{ padding: "8px 6px", textAlign: "right" }}>CTR</th>
                      <th style={{ padding: "8px 6px", textAlign: "right" }}>Position</th>
                      <th style={{ padding: "8px 6px", textAlign: "right" }}>Δ vs prev.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queries.map((q, index) => (
                      <tr key={q.query} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 6px", color: "var(--muted)", fontWeight: 800 }}>{index + 1}</td>
                        <td style={{ padding: "8px 6px", fontWeight: 650, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.query}</td>
                        <td style={{ padding: "8px 6px", textAlign: "right" }}>{q.impressions.toLocaleString()}</td>
                        <td style={{ padding: "8px 6px", textAlign: "right" }}>{q.clicks.toLocaleString()}</td>
                        <td style={{ padding: "8px 6px", textAlign: "right" }}>{(q.ctr * 100).toFixed(1)}%</td>
                        <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 800 }}>{q.position.toFixed(1)}</td>
                        <td style={{ padding: "8px 6px", textAlign: "right" }}><PositionDeltaBadge delta={q.positionDelta} isNew={q.isNew} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ fontSize: 11, color: "var(--muted)", margin: "10px 0 0" }}>Δ shows the average-position change vs the previous {result.previousRange ? `${result.previousRange.startDate} – ${result.previousRange.endDate}` : "period"}. ▲ green = moved up toward #1.</p>
          </section>

          <section className="card app-card">
            <CardTitle icon="files" eyebrow="Search" title="Top pages" />
            {pages.length === 0 ? (
              <p className="muted-copy">No pages have search impressions in this period yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="admin-search-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11, fontWeight: 800 }}>
                      <th style={{ padding: "8px 6px", width: 28 }}>#</th>
                      <th style={{ padding: "8px 6px" }}>Page</th>
                      <th style={{ padding: "8px 6px", textAlign: "right" }}>Impr.</th>
                      <th style={{ padding: "8px 6px", textAlign: "right" }}>Clicks</th>
                      <th style={{ padding: "8px 6px", textAlign: "right" }}>CTR</th>
                      <th style={{ padding: "8px 6px", textAlign: "right" }}>Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRowLabels(pages).map((p, index) => {
                      return (
                        <tr key={p.page} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 6px", color: "var(--muted)", fontWeight: 800 }}>{index + 1}</td>
                          <td style={{ padding: "8px 6px", fontWeight: 650, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <span title={p.page}>{p.label}</span>
                            {p.samePathElsewhere ? <span title="The same path also appears under another host / slash / protocol — listed separately, not merged" style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: "var(--admin-warn-text)" }}>same path, other URL</span> : null}
                          </td>
                          <td style={{ padding: "8px 6px", textAlign: "right" }}>{p.impressions.toLocaleString()}</td>
                          <td style={{ padding: "8px 6px", textAlign: "right" }}>{p.clicks.toLocaleString()}</td>
                          <td style={{ padding: "8px 6px", textAlign: "right" }}>{(p.ctr * 100).toFixed(1)}%</td>
                          <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 800 }}>{p.position.toFixed(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ fontSize: 11, color: "var(--muted)", margin: "10px 0 0" }}>Full URL per row (host and trailing slash included); Search Console reports them as different pages. Page totals need not equal the property totals above.</p>
          </section>

          <div className="site-stats-panels">
            <section className="card app-card">
              <CardTitle icon="dashboard" eyebrow="Search" title="Search by country" />
              {countries.length === 0 ? (
                <p className="muted-copy">No data yet.</p>
              ) : (
                <div style={{ display: "grid" }}>
                  {(() => {
                    const shares = countryShares(countries);
                    return (
                      <>
                        {shares.rows.slice(0, 8).map((c, index) => {
                          const { flag, name } = searchCountryLabel(c.country);
                          return (
                            <div key={c.country} style={{ display: "grid", gap: 3, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid var(--border)" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span aria-hidden="true">{flag}</span>
                                <span style={{ fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)" }} title="Share of all impressions in the listed countries">{c.sharePct.toFixed(1)}%</span>
                                <strong style={{ fontSize: 13, minWidth: 44, textAlign: "right" }}>{c.impressions.toLocaleString()}</strong>
                              </div>
                              <div aria-hidden="true" style={{ height: 4, borderRadius: 999, background: "var(--admin-chip-bg)", overflow: "hidden" }}>
                                <span style={{ display: "block", height: "100%", width: `${c.relativePct}%`, background: "#0a84ff", borderRadius: 999 }} />
                              </div>
                            </div>
                          );
                        })}
                        <p style={{ fontSize: 11, color: "var(--muted)", margin: "8px 0 0" }}>
                          % = share of {shares.total.toLocaleString()} impressions across {shares.truncated ? `the top ${countries.length} countries returned` : "all listed countries"}; the bar is scaled to the largest country.
                          {countries.length > 8 ? ` Showing 8 of ${countries.length}.` : ""}
                        </p>
                      </>
                    );
                  })()}
                </div>
              )}
            </section>
            <section className="card app-card">
              <CardTitle icon="dashboard" eyebrow="Search" title="Search by device" />
              {devices.length === 0 ? (
                <p className="muted-copy">No data yet.</p>
              ) : (
                <StatsDonut
                  slices={devices.map(d => ({ label: SEARCH_DEVICE_LABELS[d.device] || d.device, value: d.impressions, color: SEARCH_DEVICE_COLORS[d.device] || "#9ca3af" }))}
                  centerLabel="Impr."
                />
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

const NIVADESK_DOMAIN_LABEL = "nivadesk.app";

/* The two ways to read the workspace numbers (N33, 15 Oct 2026). "business" leaves out workspaces an
   admin flagged internal / QA / pilot (Lookup → Analytics flag) and says how many; "qa" counts
   everything. Nothing is ever left out because of its name. */
type AdminView = "business" | "qa";

function AdminViewToggle({ view, onChange }: { view: AdminView; onChange: (view: AdminView) => void }) {
  const option = (value: AdminView, label: string, hint: string) => (
    <button
      key={value}
      type="button"
      className="button"
      title={hint}
      aria-pressed={view === value}
      onClick={() => onChange(value)}
      style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: view === value ? "#0a84ff" : "var(--admin-chip-bg)", color: view === value ? "#fff" : "var(--text)" }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Workspace numbers:</span>
      {option("business", "Business view", "Leaves out workspaces an admin flagged internal / QA / pilot")}
      {option("qa", "Measurement / QA view", "Counts every workspace, flagged ones included")}
    </div>
  );
}

function ExclusionNote({ exclusion }: { exclusion?: ExclusionSummary | null }) {
  const line = exclusionLine(exclusion);
  if (!line) return null;
  return <p style={{ fontSize: 11.5, color: exclusion?.readable === false ? "var(--danger)" : "var(--muted)", margin: "6px 0 0" }}>{line}</p>;
}

type AdminBilling = {
  byState: Record<string, number>;
  byProvider: Record<string, number>;
  byTrialKind?: Record<string, number>;
  planAssigned: number;
  planAssignedByPlan?: Record<string, number>;
  listPricePotential: number;
  listPricePotentialByState: Record<string, number>;
  providerBilledListPrice: number;
  collectedRevenue: null;
  collectedRevenueReason: string;
};

const ADMIN_PROVIDER_LABELS: Record<string, string> = { stripe: "Stripe", apple: "Apple", google: "Google Play", shopify: "Shopify" };

function providerHint(billing: AdminBilling): string {
  const parts = Object.entries(billing.byProvider || {}).map(([provider, count]) => `${ADMIN_PROVIDER_LABELS[provider] || provider} ${count}`);
  const pastDue = billing.byState.past_due || 0;
  return `${parts.length ? parts.join(" · ") : "Stripe / Apple / Google / Shopify: none"}${pastDue ? ` · ${pastDue} payment failed` : ""}`;
}

type AdminInsights = {
  generatedAtMs: number;
  users: { total: number; new30d: number };
  workspaces: {
    total: number;
    new30d: number;
    active30d: number;
    paid: number;
    planCounts: Record<string, number>;
    assignedPlanCounts?: Record<string, number>;
    newest: { id: string; name: string; plan: string; createdAtMs: number }[];
  };
  revenue: { estimated: boolean; currency: string; mrr: number; arr: number; note: string };
  billing?: AdminBilling;
  exclusion?: ExclusionSummary;
  usage: {
    ordersTotal: number | null;
    ordersThisMonth: number | null;
    customersTotal: number | null;
    notesTotal: number | null;
    notesSharedCopies?: number | null;
    remindersTotal: number | null;
    messagesTotal: number | null;
    workspaceTicketsTotal: number | null;
  };
  support: { open: number | null; inProgress: number | null; total: number | null };
  chatgpt: { connectedWorkspaces: number; activeTokens: number; tokens30d: number };
  attention: { inactivePaidWorkspaces: { id: string; name: string; plan: string }[] };
  heartbeat: { lastOrderAtMs: number | null; lastSupportAtMs: number | null; lastSiteBeaconAtMs: number | null };
  site: { today: { total: number; sessions: number }; liveVisitors: number; appNow: number; appPlatforms: Record<string, number> };
};

const ADMIN_PLAN_LABELS: Record<string, string> = {
  demo: "Free",
  lifetime_lite: "Starter",
  pro_monthly: "Pro",
  team_monthly: "Team"
};

const ADMIN_PLAN_COLORS: Record<string, string> = {
  demo: "#8a5cf6",
  lifetime_lite: "#0a84ff",
  pro_monthly: "#30d158",
  team_monthly: "#ff9f0a"
};

/* The plan colours above are chart fills; as text on a card they fail contrast (#30d158 on white is
   about 1.9:1). Text uses these per-theme variables instead (app/globals.css, Admin Insights). */
const ADMIN_PLAN_TEXT_COLORS: Record<string, string> = {
  demo: "var(--admin-plan-free)",
  lifetime_lite: "var(--admin-plan-starter)",
  pro_monthly: "var(--admin-plan-pro)",
  team_monthly: "var(--admin-plan-team)"
};

function planTextColor(plan: string, fallback = "var(--text)") {
  return ADMIN_PLAN_TEXT_COLORS[plan] || fallback;
}

function adminKpiTile(label: string, value: string, hint?: string, onOpen?: () => void) {
  const body = (
    <>
      <span className="admin-kpi-label">{label}</span>
      <strong className="admin-kpi-value">{value}</strong>
      {hint ? <span className="admin-kpi-hint">{hint}</span> : null}
    </>
  );
  return onOpen ? (
    <button key={label} type="button" className="card app-card admin-kpi is-link" onClick={onOpen}>
      {body}
      <span className="admin-kpi-open" aria-hidden="true">→</span>
    </button>
  ) : (
    <section key={label} className="card app-card admin-kpi">{body}</section>
  );
}

/** A count the server could not produce is unknown, never zero. */
function countText(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "—";
}

type AdminUsersDetail = {
  generatedAtMs: number;
  users: { total: number; new7d: number; new30d: number; active7d: number; active30d: number; neverLoggedIn: number };
  growth: { date: string; signups: number; cumulative: number }[];
  workspaces: { total: number; active30d: number; inactive: number; planCounts: Record<string, number>; ordersOnUnknownWorkspaces30d?: number };
  quick: { avgWorkspacesPerUser: number; usersWithMultipleWorkspaces: number };
  topWorkspaces: { id: string; name: string; ownerEmail: string; plan: string; members: number | null; membersSuspended?: number | null; membersSource?: string; orders30d: number; ordersTotal: number | null; lastOrderAtMs: number }[];
  exclusion?: ExclusionSummary;
  recentUsers: { uid: string; email: string; displayName: string; createdAtMs: number; lastSignInMs: number; plan: string }[];
  heatmap: number[][];
};

function GrowthChart({ growth }: { growth: { date: string; cumulative: number }[] }) {
  if (!growth.length) return <p className="muted-copy">No data yet.</p>;
  const width = 600;
  const height = 190;
  const pad = 8;
  const max = Math.max(...growth.map(point => point.cumulative), 1);
  const min = Math.min(...growth.map(point => point.cumulative), 0);
  const x = (index: number) => pad + (index / Math.max(growth.length - 1, 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - ((value - min) / Math.max(max - min, 1)) * (height - pad * 2);
  const line = growth.map((point, index) => `${x(index)},${y(point.cumulative)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <polygon points={area} fill="rgba(138, 92, 246, 0.14)" />
      <polyline points={line} fill="none" stroke="#8a5cf6" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {growth.map((point, index) => (
        index % Math.ceil(growth.length / 24) === 0 ? (
          <circle key={point.date} cx={x(index)} cy={y(point.cumulative)} r="2.6" fill="#8a5cf6">
            <title>{`${point.date}: ${point.cumulative}`}</title>
          </circle>
        ) : null
      ))}
    </svg>
  );
}

const HEATMAP_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ActivityHeatmap({ heatmap, caption }: { heatmap: number[][]; caption: string }) {
  const max = Math.max(...heatmap.flat(), 1);
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "34px repeat(24, 1fr)", gap: 2, minWidth: 560 }}>
        <span />
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour} style={{ fontSize: 8.5, color: "var(--muted)", textAlign: "center" }}>{hour % 3 === 0 ? hour : ""}</span>
        ))}
        {heatmap.map((row, day) => (
          <Fragment key={HEATMAP_DAYS[day]}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", alignSelf: "center" }}>{HEATMAP_DAYS[day]}</span>
            {row.map((value, hour) => (
              <span
                key={hour}
                title={`${HEATMAP_DAYS[day]} ${hour}:00 — ${value}`}
                style={{
                  aspectRatio: "1",
                  borderRadius: 3,
                  background: value === 0 ? "var(--admin-chip-bg)" : `rgba(138, 92, 246, ${0.25 + (value / max) * 0.75})`
                }}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <p className="muted-copy" style={{ marginTop: 8 }}>{caption}</p>
    </div>
  );
}

function AdminUsersWorkspacesDetail({ onBack, view }: { onBack: () => void; view: AdminView }) {
  const [data, setData] = useState<AdminUsersDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const callable = httpsCallable<{ view: AdminView }, AdminUsersDetail>(functions, "getAdminUsersWorkspacesDetail");
    callable({ view })
      .then(result => {
        if (!cancelled) setData(result.data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const crumb = (
    <p className="muted-copy" style={{ margin: "0 0 4px" }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
      {" › "}Users & Workspaces
    </p>
  );

  if (loading || error || !data) {
    return (
      <div className="settings-card-stack">
        <section className="card app-card">
          {crumb}
          <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Users & Workspaces" />
          {loading ? <p className="muted-copy">Loading details...</p> : <p style={{ color: "var(--danger)", margin: 0 }}>{error || "No data."}</p>}
        </section>
      </div>
    );
  }

  const planSlices = Object.entries(data.workspaces.planCounts)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({ label: ADMIN_PLAN_LABELS[key] || key, value, color: ADMIN_PLAN_COLORS[key] || "#9ca3af" }));

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        {crumb}
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Users & Workspaces" />
        <p className="muted-copy">Track user growth, activity and workspace statistics across NivaDesk. Members are read from each workspace&apos;s own record: the owner plus everyone on its members list (suspended members shown apart).</p>
        <ExclusionNote exclusion={data.exclusion} />
        {data.workspaces.ordersOnUnknownWorkspaces30d ? <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "4px 0 0" }}>{data.workspaces.ordersOnUnknownWorkspaces30d} order(s) in the last 30 days belong to a deleted / unknown workspace and are not counted as activity.</p> : null}
      </section>

      <div className="site-stats-grid">
        {adminKpiTile("Total Users", data.users.total.toLocaleString(), `+${data.users.new30d} in last 30 days`)}
        {adminKpiTile("Active Users (30d)", data.users.active30d.toLocaleString(), `${data.users.active7d} this week`)}
        {adminKpiTile("New Users (30d)", data.users.new30d.toLocaleString(), `${data.users.new7d} this week`)}
        {adminKpiTile("Active Workspaces", data.workspaces.active30d.toLocaleString(), "order in last 30 days")}
        {adminKpiTile("Inactive Workspaces", data.workspaces.inactive.toLocaleString())}
      </div>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="Growth" title="User Growth" />
        <GrowthChart growth={data.growth} />
        <p className="muted-copy" style={{ marginTop: 6 }}>Cumulative registered users, last 60 days.</p>
      </section>

      <div className="site-stats-panels">
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Plans" title="Workspaces by Plan" />
          {planSlices.length ? <StatsDonut slices={planSlices} centerLabel="Workspaces" /> : <p className="muted-copy">No data yet.</p>}
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Users" title="Quick Stats" />
          <div className="settings-mini-grid">
            <InfoTile label="Avg workspaces per user" value={data.quick.avgWorkspacesPerUser.toLocaleString()} />
            <InfoTile label="Users in multiple workspaces" value={data.quick.usersWithMultipleWorkspaces.toLocaleString()} />
            <InfoTile label="New users this week" value={data.users.new7d.toLocaleString()} />
            <InfoTile label="Active users this week" value={data.users.active7d.toLocaleString()} />
            <InfoTile label="Never logged in" value={data.users.neverLoggedIn.toLocaleString()} />
          </div>
        </section>
      </div>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="Workspaces" title="Top Workspaces by Activity" />
        {data.topWorkspaces.length === 0 ? (
          <p className="muted-copy">No workspace activity in the last 30 days.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "6px 8px" }}>#</th>
                  <th style={{ padding: "6px 8px" }}>Workspace</th>
                  <th style={{ padding: "6px 8px" }}>Owner</th>
                  <th style={{ padding: "6px 8px" }}>Plan</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }} title="Owner + members on the workspace record">Members</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Orders (30d)</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Orders (total)</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {data.topWorkspaces.map((workspace, index) => (
                  <tr key={workspace.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 8px", color: "var(--muted)", fontWeight: 700 }}>{index + 1}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 700 }}>{workspace.name}</td>
                    <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{workspace.ownerEmail || "—"}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 800, color: planTextColor(workspace.plan, "var(--text)") }}>{ADMIN_PLAN_LABELS[workspace.plan] || workspace.plan}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }} title={workspace.membersSource || ""}>
                      {unknownOr(workspace.members, "not_available")}
                      {workspace.membersSuspended ? <span style={{ color: "var(--muted)" }}> ({workspace.membersSuspended} suspended)</span> : null}
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700 }}>{workspace.orders30d}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{workspace.ordersTotal ?? "—"}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--muted)" }}>{workspace.lastOrderAtMs ? new Date(workspace.lastOrderAtMs).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="Users" title="Recent signups" />
        {(() => {
          const recent = (data.recentUsers ?? []).slice(0, 50);
          if (recent.length === 0) return <p className="muted-copy">No recent signups.</p>;
          return (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                    <th style={{ padding: "6px 8px" }}>#</th>
                    <th style={{ padding: "6px 8px" }}>Email</th>
                    <th style={{ padding: "6px 8px" }}>Name</th>
                    <th style={{ padding: "6px 8px" }}>Signed up</th>
                    <th style={{ padding: "6px 8px" }}>Last sign-in</th>
                    <th style={{ padding: "6px 8px" }}>Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((u, index) => (
                    <tr key={u.uid} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 8px", color: "var(--muted)", fontWeight: 700 }}>{index + 1}</td>
                      <td style={{ padding: "7px 8px", fontWeight: 700 }}>{u.email || "—"}</td>
                      <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{u.displayName || "—"}</td>
                      <td style={{ padding: "7px 8px" }}>{u.createdAtMs ? new Date(u.createdAtMs).toLocaleDateString() : "—"}</td>
                      <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{u.lastSignInMs ? new Date(u.lastSignInMs).toLocaleDateString() : "never"}</td>
                      <td style={{ padding: "7px 8px", fontWeight: 800, color: planTextColor(u.plan, "var(--text)") }}>{ADMIN_PLAN_LABELS[u.plan] || u.plan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
        <p className="muted-copy" style={{ marginTop: 8 }}>Newest first (latest 50).</p>
      </section>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="Activity" title="Order Creation by Time of Day" />
        <ActivityHeatmap heatmap={data.heatmap} caption="Orders created, by weekday and hour (last 30 days, UK time; orders carrying a server creation stamp)." />
      </section>
    </div>
  );
}

type AdminSubsDetail = {
  generatedAtMs: number;
  note: string;
  subscriptions: { paidTotal: number; paidNew30d: number; planCounts: Record<string, number>; freeDemo: number };
  revenue: { currency: string; mrr: number; arr: number; arpu: number; mrrByPlan: Record<string, number> };
  sources: { source: string; count: number }[];
  recent: { id: string; name: string; ownerEmail: string; plan: string; monthlyGbp: number; createdAtMs: number; state?: string; provider?: string; trialKind?: string; trialEndsAtMs?: number | null; listPriceGbp?: number }[];
  billing?: AdminBilling;
  exclusion?: ExclusionSummary;
};

const ADMIN_SOURCE_LABELS: Record<string, string> = {
  signup_trial: "Sign-up trial (no card)",
  manual_workspace: "Set by hand (manual)",
  entitlement_resolver: "Entitlement resolver",
  stripe: "Stripe",
  shopify: "Shopify",
  signup_free_demo: "Sign-up default",
  new_workspace_default: "New workspace default",
  workspace: "Set in workspace (manual)",
  legacy_default: "Legacy default",
  legacy: "Legacy",
  secure_default: "Secure default"
};

function AdminSubscriptionsDetail({ onBack, view }: { onBack: () => void; view: AdminView }) {
  const [data, setData] = useState<AdminSubsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const callable = httpsCallable<{ view: AdminView }, AdminSubsDetail>(functions, "getAdminSubscriptionsDetail");
    callable({ view })
      .then(result => {
        if (!cancelled) setData(result.data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const crumb = (
    <p className="muted-copy" style={{ margin: "0 0 4px" }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
      {" › "}Subscriptions
    </p>
  );

  if (loading || error || !data) {
    return (
      <div className="settings-card-stack">
        <section className="card app-card">
          {crumb}
          <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Subscriptions" />
          {loading ? <p className="muted-copy">Loading details...</p> : <p style={{ color: "var(--danger)", margin: 0 }}>{error || "No data."}</p>}
        </section>
      </div>
    );
  }

  const paidSlices = ["lifetime_lite", "pro_monthly", "team_monthly"]
    .map(key => ({ label: ADMIN_PLAN_LABELS[key] || key, value: data.subscriptions.planCounts[key] || 0, color: ADMIN_PLAN_COLORS[key] || "#9ca3af" }))
    .filter(slice => slice.value > 0);

  const mrrEntries: [string, number][] = ["lifetime_lite", "pro_monthly", "team_monthly"]
    .map(key => [ADMIN_PLAN_LABELS[key] || key, data.revenue.mrrByPlan[key] || 0] as [string, number])
    .filter(([, value]) => value > 0);

  const sourceEntries: [string, number][] = data.sources.map(item => [ADMIN_SOURCE_LABELS[item.source] || item.source, item.count]);

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        {crumb}
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Subscriptions" />
        <p className="muted-copy">Monitor plan assignments and estimated billing performance. {data.note}</p>
        <ExclusionNote exclusion={data.exclusion} />
      </section>

      {data.billing ? (
        <div className="site-stats-grid">
          {adminKpiTile("Plan assigned", data.billing.planAssigned.toLocaleString(), "any source, any state")}
          {adminKpiTile("Active trials", (data.billing.byState.trial_active || 0).toLocaleString(), "running; no card for the sign-up trial")}
          {adminKpiTile("Trials ended", (data.billing.byState.trial_expired || 0).toLocaleString(), "now Free — not paid, not in MRR")}
          {adminKpiTile("Paid by provider", (data.billing.byState.paid_provider || 0).toLocaleString(), providerHint(data.billing))}
          {adminKpiTile("Payment failed", (data.billing.byState.past_due || 0).toLocaleString(), "provider reports past due")}
          {adminKpiTile("Manual / complimentary", (data.billing.byState.manual_comp || 0).toLocaleString(), "plan assigned, no till behind it")}
          {adminKpiTile("Free", (data.billing.byState.free || 0).toLocaleString())}
          {adminKpiTile("List-price potential", `£${data.billing.listPricePotential.toLocaleString()}/mo`, "trials running + manual + provider, at list price")}
          {adminKpiTile("Provider-billed (list price)", `£${data.billing.providerBilledListPrice.toLocaleString()}/mo`, "what tills report active — list price, not collected")}
          {adminKpiTile("Collected revenue", "Not measured", unknownOr(null, data.billing.collectedRevenueReason))}
        </div>
      ) : (
        <div className="site-stats-grid">
          {adminKpiTile("Active Subscriptions", data.subscriptions.paidTotal.toLocaleString(), "paid plan assigned")}
          {adminKpiTile("New Subscriptions (30d)", data.subscriptions.paidNew30d.toLocaleString(), "paid workspaces created")}
          {adminKpiTile("Free Workspaces", data.subscriptions.freeDemo.toLocaleString())}
          {adminKpiTile("Est. MRR", `£${data.revenue.mrr.toLocaleString()}`, "estimate — billing not live")}
          {adminKpiTile("Est. ARR", `£${data.revenue.arr.toLocaleString()}`, "estimate — billing not live")}
          {adminKpiTile("Est. ARPU", `£${data.revenue.arpu.toLocaleString()}`, "per paid workspace / month")}
        </div>
      )}

      <div className="site-stats-panels">
        {data.billing ? (
          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Billing" title="Workspaces by billing state" />
            <StatsRankedList entries={Object.entries(data.billing.byState).filter(([, value]) => value > 0).map(([state, value]) => [BILLING_STATE_LABELS[state] || state, value] as [string, number])} />
            <p className="muted-copy" style={{ marginTop: 8 }}>One state per workspace, read from its billing fields. A sign-up trial that has ended keeps &quot;trialing&quot; on the record; it is counted here as ended, as the app already treats it.</p>
          </section>
        ) : (
          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Plans" title="Subscriptions by Plan" />
            {paidSlices.length ? <StatsDonut slices={paidSlices} centerLabel="Paid" /> : <p className="muted-copy">No paid subscriptions yet.</p>}
          </section>
        )}
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Revenue" title={data.billing ? "List-price potential by plan" : "Est. MRR by Plan"} />
          <StatsRankedList entries={mrrEntries.map(([label, value]) => [`${label}`, value])} />
          <p className="muted-copy" style={{ marginTop: 8 }}>GBP/month at list prices{data.billing ? " — plans in force only (ended trials left out); not money collected" : ""}.</p>
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Source" title="Plan Source Distribution" />
          {sourceEntries.length ? <StatsRankedList entries={sourceEntries} /> : <p className="muted-copy">No paid subscriptions yet.</p>}
          <p className="muted-copy" style={{ marginTop: 8 }}>How each paid plan was assigned. This is the route the plan came by, not how the person found NivaDesk.</p>
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Billing" title="Not measured here" />
          <p className="muted-copy" style={{ margin: 0 }}>
            Live billing is not connected to Insights: no payment ledger (Stripe, App Store, Google Play, Shopify) is read. Money collected,
            refunds, billing cycles, trial-to-paid conversion and plan-change history are therefore not measured on this page.
          </p>
        </section>
      </div>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="Subscriptions" title="Recent Subscriptions" />
        {data.recent.length === 0 ? (
          <p className="muted-copy">No paid subscriptions yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "6px 8px" }}>Workspace</th>
                  <th style={{ padding: "6px 8px" }}>Owner</th>
                  <th style={{ padding: "6px 8px" }}>Plan</th>
                  <th style={{ padding: "6px 8px" }}>State</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>List £/mo</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map(item => (
                  <tr key={item.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 8px", fontWeight: 700 }}>{item.name}</td>
                    <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{item.ownerEmail || "—"}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 800, color: planTextColor(item.plan, "var(--text)") }}>{ADMIN_PLAN_LABELS[item.plan] || item.plan}</td>
                    <td style={{ padding: "7px 8px", color: "var(--muted)" }}>
                      {item.state ? BILLING_STATE_LABELS[item.state] || item.state : "—"}
                      {item.provider ? ` · ${ADMIN_PROVIDER_LABELS[item.provider] || item.provider}` : ""}
                      {item.trialEndsAtMs ? ` · ${item.state === "trial_expired" ? "ended" : "ends"} ${new Date(item.trialEndsAtMs).toLocaleDateString()}` : ""}
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700 }}>{item.state === "trial_expired" || item.state === "cancelled" ? <span title={`list price £${item.listPriceGbp ?? 0} — not counted`}>£0</span> : `£${item.monthlyGbp}`}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--muted)" }}>{item.createdAtMs ? new Date(item.createdAtMs).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type AdminRevenueDetail = {
  generatedAtMs: number;
  note: string;
  revenue: {
    currency: string;
    mrr: number;
    arr: number;
    arpu: number;
    baseMrr: number;
    seatsMrr: number;
    storageMrr: number;
    mrrByPlan: Record<string, number>;
    paidTotal: number;
    seatCount: number;
    storageAddonCount: number;
  };
  topPaying: { id: string; name: string; ownerEmail: string; plan: string; state?: string; provider?: string; baseGbp: number; seatGbp: number; storageGbp: number; totalGbp: number }[];
  potential?: { baseByState: Record<string, number>; providerBilledListPrice: number; expiredTrialCount: number; expiredTrialListPriceExcluded: number; collectedRevenue: null; collectedRevenueReason: string };
  exclusion?: ExclusionSummary;
  addons: {
    seatWorkspaces: { id: string; name: string; ownerEmail: string; seats: number; monthlyGbp: number }[];
    storageWorkspaces: { id: string; name: string; ownerEmail: string; addonGB: number; monthlyGbp: number }[];
    storageAddon100: number;
    storageAddon200: number;
  };
};

function AdminRevenueDetail({ onBack, view }: { onBack: () => void; view: AdminView }) {
  const [data, setData] = useState<AdminRevenueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const callable = httpsCallable<{ view: AdminView }, AdminRevenueDetail>(functions, "getAdminRevenueDetail");
    callable({ view })
      .then(result => {
        if (!cancelled) setData(result.data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const crumb = (
    <p className="muted-copy" style={{ margin: "0 0 4px" }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
      {" › "}Revenue
    </p>
  );

  if (loading || error || !data) {
    return (
      <div className="settings-card-stack">
        <section className="card app-card">
          {crumb}
          <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Revenue" />
          {loading ? <p className="muted-copy">Loading details...</p> : <p style={{ color: "var(--danger)", margin: 0 }}>{error || "No data."}</p>}
        </section>
      </div>
    );
  }

  const planSlices = ["lifetime_lite", "pro_monthly", "team_monthly"]
    .map(key => ({ label: ADMIN_PLAN_LABELS[key] || key, value: data.revenue.mrrByPlan[key] || 0, color: ADMIN_PLAN_COLORS[key] || "#9ca3af" }))
    .filter(slice => slice.value > 0);

  const breakdownRows: [string, number][] = [
    ["Subscription plans (base)", data.revenue.baseMrr],
    [`Extra team seats (${data.revenue.seatCount} × £5)`, data.revenue.seatsMrr],
    [`Storage add-ons (${data.revenue.storageAddonCount})`, data.revenue.storageMrr]
  ];

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        {crumb}
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Revenue" />
        <p className="muted-copy">Track estimated financial performance across NivaDesk. {data.note}</p>
        <ExclusionNote exclusion={data.exclusion} />
      </section>

      <div className="site-stats-grid">
        {adminKpiTile(data.potential ? "List-price potential" : "Est. MRR", `£${data.revenue.mrr.toLocaleString()}`, data.potential ? "plans in force + seats + storage, at list price — not revenue" : "plans + seats + storage")}
        {data.potential ? adminKpiTile("Provider-billed (list price)", `£${data.potential.providerBilledListPrice.toLocaleString()}/mo`, "base plans a till reports active") : null}
        {data.potential ? adminKpiTile("Ended trials left out", data.potential.expiredTrialCount.toLocaleString(), `£${data.potential.expiredTrialListPriceExcluded}/mo of list price not counted`) : null}
        {data.potential ? adminKpiTile("Collected revenue", "Not measured", unknownOr(null, data.potential.collectedRevenueReason)) : null}
        {adminKpiTile(data.potential ? "Potential × 12" : "Est. ARR", `£${data.revenue.arr.toLocaleString()}`)}
        {adminKpiTile("Est. ARPU", `£${data.revenue.arpu.toLocaleString()}`, "per paid workspace / month")}
        {adminKpiTile("Paid Workspaces", data.revenue.paidTotal.toLocaleString())}
        {adminKpiTile("Extra Seats", data.revenue.seatCount.toLocaleString(), `£${data.revenue.seatsMrr}/mo`)}
        {adminKpiTile("Storage Add-ons", data.revenue.storageAddonCount.toLocaleString(), `${data.addons?.storageAddon100 ?? 0} × 100GB · ${data.addons?.storageAddon200 ?? 0} × 200GB · £${data.revenue.storageMrr}/mo`)}
      </div>

      <div className="site-stats-panels">
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Revenue" title="Est. Revenue by Plan" />
          {planSlices.length ? <StatsDonut slices={planSlices} centerLabel="£/month" /> : <p className="muted-copy">No paid subscriptions yet.</p>}
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Revenue" title="Revenue Breakdown" />
          <StatsRankedList entries={breakdownRows.filter(([, value]) => value > 0).map(([label, value]) => [label, value])} />
          <p className="muted-copy" style={{ marginTop: 8 }}>Monthly GBP at list prices.</p>
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Billing" title="Not measured here" />
          <p className="muted-copy" style={{ margin: 0 }}>
            Live billing is not connected to Insights: revenue over time, currencies, countries, transactions and refunds would need
            the payment ledgers (Stripe / Apple / Google / Shopify), which this page does not read. Every £ here is a list price.
          </p>
        </section>
      </div>

      <div className="site-stats-panels">
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Add-ons" title="Extra Seat Buyers" />
          {(data.addons?.seatWorkspaces ?? []).length === 0 ? (
            <p className="muted-copy">No workspace has purchased extra seats yet.</p>
          ) : (
            <div style={{ display: "grid" }}>
              {data.addons.seatWorkspaces.map((workspace, index) => (
                <div key={workspace.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid var(--border)" }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: "#ff9f0a" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workspace.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{workspace.ownerEmail || "—"}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{workspace.seats} seat{workspace.seats === 1 ? "" : "s"}</span>
                  <strong style={{ fontSize: 12.5, minWidth: 56, textAlign: "right" }}>£{workspace.monthlyGbp}/mo</strong>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Add-ons" title="Storage Add-on Buyers" />
          {(data.addons?.storageWorkspaces ?? []).length === 0 ? (
            <p className="muted-copy">No workspace has purchased a storage add-on yet.</p>
          ) : (
            <div style={{ display: "grid" }}>
              {data.addons.storageWorkspaces.map((workspace, index) => (
                <div key={workspace.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid var(--border)" }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: workspace.addonGB >= 200 ? "#8a5cf6" : "#0a84ff" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workspace.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{workspace.ownerEmail || "—"}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800 }}>+{workspace.addonGB} GB</span>
                  <strong style={{ fontSize: 12.5, minWidth: 56, textAlign: "right" }}>£{workspace.monthlyGbp}/mo</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="Workspaces" title={data.potential ? "Highest list-price workspaces" : "Top Paying Workspaces (Est.)"} />
        {data.topPaying.length === 0 ? (
          <p className="muted-copy">No paid workspaces yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "6px 8px" }}>#</th>
                  <th style={{ padding: "6px 8px" }}>Workspace</th>
                  <th style={{ padding: "6px 8px" }}>Owner</th>
                  <th style={{ padding: "6px 8px" }}>Plan</th>
                  <th style={{ padding: "6px 8px" }}>State</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Base</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Seats</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Storage</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Est. £/mo</th>
                </tr>
              </thead>
              <tbody>
                {data.topPaying.map((workspace, index) => (
                  <tr key={workspace.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 8px", color: "var(--muted)", fontWeight: 700 }}>{index + 1}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 700 }}>{workspace.name}</td>
                    <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{workspace.ownerEmail || "—"}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 800, color: planTextColor(workspace.plan, "var(--text)") }}>{ADMIN_PLAN_LABELS[workspace.plan] || workspace.plan}</td>
                    <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{workspace.state ? `${BILLING_STATE_LABELS[workspace.state] || workspace.state}${workspace.provider ? ` · ${ADMIN_PROVIDER_LABELS[workspace.provider] || workspace.provider}` : ""}` : "—"}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>£{workspace.baseGbp}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{workspace.seatGbp ? `£${workspace.seatGbp}` : "—"}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{workspace.storageGbp ? `£${workspace.storageGbp}` : "—"}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 800 }}>£{workspace.totalGbp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type AdminPlansDetail = {
  generatedAtMs: number;
  totalWorkspaces: number;
  stats: Record<string, { workspaces: number; newThisMonth: number; active30d: number; orders30d: number; trialActive?: number; trialExpiredAssigned?: number }>;
  exclusion?: ExclusionSummary;
  comparison: { plan: string; label: string; orders: string; customers: string; storage: string; seats: string; monthly: number; yearly: number }[];
  note: string;
};

const ADMIN_PLAN_ORDER = ["demo", "lifetime_lite", "pro_monthly", "team_monthly"];

type AdminOnboardingDetail = {
  ok: boolean;
  generatedAtMs: number;
  settingsDocs: number;
  settingsWithoutWorkspace?: number;
  exclusion?: ExclusionSummary;
  completed: number;
  answeredAnything: number;
  counts: Record<string, Record<string, number>>;
  heardFrom: { text: string; atMs: number }[];
  otherGoals: { text: string; atMs: number }[];
  note: string;
};

/* The ids the wizard writes, in the order it offers them, with the words it
   shows. Reading a panel of raw ids ("lifetime_lite", "3_10") is a translation
   exercise; these are the same labels the person answering saw. */
const ONBOARDING_ANSWER_LABELS: Record<string, string> = {
  watches_jewellery: "Watches & jewellery", repairs: "Repairs & servicing", leather: "Leather goods",
  art_design: "Art & custom design", clothing: "Clothing & tailoring", food: "Cakes & food",
  ceramics: "Ceramics & crafts", made_to_order: "General made-to-order", other: "Other",
  batch: "Batch production", mixed: "A mix of these",
  solo: "Just me", "2_5": "2–5 people", "6_10": "6–10 people", "10_plus": "More than 10",
  under_10: "Fewer than 10", "10_30": "10–30", "31_100": "31–100", "100_plus": "More than 100",
  not_sure: "Not sure yet",
  starting: "Just starting out", under_1: "Less than a year", "1_3": "1–3 years",
  "3_10": "3–10 years", over_10: "More than 10 years",
  no_stock: "I don't hold stock", none: "New to it", some: "I track some of it",
  confident: "I track it closely",
  orders_customers: "Organise my orders and customers", production_deadlines: "Plan production and deadlines",
  repairs_service: "Track repairs and service work", estimates: "Send estimates and get approvals",
  inventory: "Manage inventory and materials", finance: "Track income, expenses and profit",
  files_notes: "Keep files and notes together", connect_store: "Connect Shopify or WooCommerce",
  team: "Manage work with my team",
  first_order: "Create my first order", sample: "Explore a sample workspace",
  spreadsheet: "Import a spreadsheet", empty: "Start empty", later: "I'll set this up later",
  wizard: "Finished the wizard", smart: "Smart setup", standard: "Standard setup", skip: "Skipped setup",
};

const ONBOARDING_SECTIONS: { key: string; title: string; blurb: string }[] = [
  { key: "workKind", title: "What they make", blurb: "The first work kind, which is the one the preset reads." },
  { key: "workflow", title: "How they work", blurb: "Decides the production board's lanes." },
  { key: "mainGoal", title: "What they want first", blurb: "Decides the starting task list." },
  { key: "teamSize", title: "Team size", blurb: "Also picks the trial plan we recommend." },
  { key: "volume", title: "Orders a month", blurb: "" },
  { key: "businessAge", title: "Business age", blurb: "" },
  { key: "inventoryExperience", title: "Stock tracking", blurb: "" },
  { key: "start", title: "How they chose to start", blurb: "Only one option is offered now; older workspaces carry the rest." },
  { key: "completedAction", title: "How setup finished", blurb: "" },
];

function AdminOnboardingDetail({ onBack, view }: { onBack: () => void; view: AdminView }) {
  const [data, setData] = useState<AdminOnboardingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const callable = httpsCallable<{ view: AdminView }, AdminOnboardingDetail>(functions, "getAdminOnboardingDetail");
    callable({ view })
      .then(result => { if (!cancelled) setData(result.data); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load details."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [view]);

  const crumb = (
    <p className="muted-copy" style={{ margin: "0 0 4px" }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
      {" › "}Setup Answers
    </p>
  );

  if (loading || error || !data) {
    return (
      <div className="settings-card-stack">
        <section className="card app-card">
          {crumb}
          <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Setup Answers" />
          {loading ? <p className="muted-copy">Loading details...</p> : <p style={{ color: "var(--danger)", margin: 0 }}>{error || "No data."}</p>}
        </section>
      </div>
    );
  }

  const label = (id: string) => ONBOARDING_ANSWER_LABELS[id] ?? id;
  const when = (ms: number) => (ms > 0 ? new Date(ms).toLocaleDateString() : "—");

  /* A share of the people who answered THIS question, not of every workspace:
     most of these are optional, and dividing by the whole estate would make
     every bar look tiny for no reason anyone could act on. */
  const rows = (bucket: Record<string, number>) => {
    const entries = Object.entries(bucket || {}).sort((a, b) => b[1] - a[1]);
    const answered = entries.reduce((sum, [, n]) => sum + n, 0);
    return { entries, answered };
  };

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        {crumb}
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Setup Answers" />
        <p className="muted-copy">{data.note}</p>
        {data.settingsWithoutWorkspace ? <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "4px 0 0" }}>{data.settingsWithoutWorkspace} of these settings belong to a workspace that no longer exists.</p> : null}
        <ExclusionNote exclusion={data.exclusion} />
        <div className="site-stats-grid">
          {[
            ["Workspaces with settings", data.settingsDocs],
            ["Finished setup", data.completed],
            ["Answered something", data.answeredAnything],
          ].map(([caption, value]) => (
            <section key={String(caption)} className="card app-card" style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{caption}</span>
              <strong style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.05 }}>{Number(value).toLocaleString()}</strong>
            </section>
          ))}
        </div>
      </section>

      {ONBOARDING_SECTIONS.map(section => {
        const { entries, answered } = rows(data.counts?.[section.key] ?? {});
        return (
          <section key={section.key} className="card app-card">
            <CardTitle icon="dashboard" eyebrow={`${answered} answered`} title={section.title} />
            {section.blurb ? <p className="muted-copy">{section.blurb}</p> : null}
            {entries.length === 0 ? (
              <p className="muted-copy">Nobody has answered this yet.</p>
            ) : (
              <StatsRankedList entries={entries.map(([id, count]) => [label(id), count] as [string, number])} />
            )}
          </section>
        );
      })}

      {[
        { title: "How did you find us?", rows: data.heardFrom, empty: "Nobody has typed an answer yet." },
        { title: "Something else, in their words", rows: data.otherGoals, empty: "Nobody has typed a goal yet." },
      ].map(block => (
        <section key={block.title} className="card app-card">
          <CardTitle icon="dashboard" eyebrow={`${block.rows.length} written`} title={block.title} />
          {block.rows.length === 0 ? (
            <p className="muted-copy">{block.empty}</p>
          ) : (
            <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 6 }}>
              {block.rows.map((row, index) => (
                <li key={`${row.atMs}-${index}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, fontSize: 13, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{row.text}</span>
                  <span className="muted-copy" style={{ whiteSpace: "nowrap" }}>{when(row.atMs)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function AdminPlansDetail({ onBack, view }: { onBack: () => void; view: AdminView }) {
  const [data, setData] = useState<AdminPlansDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const callable = httpsCallable<{ view: AdminView }, AdminPlansDetail>(functions, "getAdminPlansDetail");
    callable({ view })
      .then(result => {
        if (!cancelled) setData(result.data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const crumb = (
    <p className="muted-copy" style={{ margin: "0 0 4px" }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
      {" › "}Plans
    </p>
  );

  if (loading || error || !data) {
    return (
      <div className="settings-card-stack">
        <section className="card app-card">
          {crumb}
          <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Plans" />
          {loading ? <p className="muted-copy">Loading details...</p> : <p style={{ color: "var(--danger)", margin: 0 }}>{error || "No data."}</p>}
        </section>
      </div>
    );
  }

  const total = Math.max(data.totalWorkspaces, 1);
  const planSlices = ADMIN_PLAN_ORDER
    .map(key => ({ label: ADMIN_PLAN_LABELS[key] || key, value: data.stats[key]?.workspaces || 0, color: ADMIN_PLAN_COLORS[key] || "#9ca3af" }))
    .filter(slice => slice.value > 0);

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        {crumb}
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Plans" />
        <p className="muted-copy">Analyze plan performance, features and limits. Each workspace is counted under the plan it has now: a trial that has ended counts as Free. {data.note}</p>
        <ExclusionNote exclusion={data.exclusion} />
      </section>

      <div className="site-stats-grid">
        {ADMIN_PLAN_ORDER.map(key => {
          const bucket = data.stats[key] || { workspaces: 0, newThisMonth: 0, active30d: 0, orders30d: 0 };
          return (
            <section key={key} className="card app-card" style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: planTextColor(key, "var(--muted)") }}>{ADMIN_PLAN_LABELS[key] || key}</span>
              <strong style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.05 }}>{bucket.workspaces.toLocaleString()}</strong>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{((bucket.workspaces / total) * 100).toFixed(1)}% of total · {bucket.active30d} active 30d · +{bucket.newThisMonth} this month</span>
              {key !== "demo" && (typeof bucket.trialActive === "number" || typeof bucket.trialExpiredAssigned === "number") ? (
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{bucket.trialActive ?? 0} on a running trial · {bucket.trialExpiredAssigned ?? 0} trials ended (counted as Free)</span>
              ) : null}
            </section>
          );
        })}
      </div>

      <div className="site-stats-panels">
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Plans" title="Plan Distribution" />
          {planSlices.length ? <StatsDonut slices={planSlices} centerLabel="Workspaces" /> : <p className="muted-copy">No data yet.</p>}
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Usage" title="Orders Created by Plan (30d)" />
          <StatsRankedList entries={ADMIN_PLAN_ORDER.map(key => [ADMIN_PLAN_LABELS[key] || key, data.stats[key]?.orders30d || 0] as [string, number]).filter(([, value]) => value > 0)} />
        </section>
      </div>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="Plans" title="Plan Comparison" />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "6px 8px" }}>Feature / Limit</th>
                {data.comparison.map(plan => (
                  <th key={plan.plan} style={{ padding: "6px 8px", color: planTextColor(plan.plan, "var(--text)") }}>{plan.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                ["Orders", (plan: AdminPlansDetail["comparison"][number]) => plan.orders],
                ["Customers", plan => plan.customers],
                ["Storage", plan => plan.storage],
                ["Seats", plan => plan.seats],
                ["Price (monthly)", plan => (plan.monthly ? `£${plan.monthly}` : "£0")],
                ["Price (yearly)", plan => (plan.yearly ? `£${plan.yearly}` : "£0")]
              ] as [string, (plan: AdminPlansDetail["comparison"][number]) => string][]).map(([label, pick]) => (
                <tr key={label} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 8px", fontWeight: 700 }}>{label}</td>
                  {data.comparison.map(plan => (
                    <td key={plan.plan} style={{ padding: "7px 8px" }}>{pick(plan)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted-copy" style={{ marginTop: 8 }}>Values come from the live entitlement constants used by the apps.</p>
      </section>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="Plans" title="Plan Performance" />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 480, borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "6px 8px" }}>Plan</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Workspaces</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Active 30d</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>New This Month</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Orders 30d</th>
              </tr>
            </thead>
            <tbody>
              {ADMIN_PLAN_ORDER.map(key => {
                const bucket = data.stats[key] || { workspaces: 0, newThisMonth: 0, active30d: 0, orders30d: 0 };
                return (
                  <tr key={key} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 8px", fontWeight: 800, color: planTextColor(key, "var(--text)") }}>{ADMIN_PLAN_LABELS[key] || key}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{bucket.workspaces}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{bucket.active30d}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{bucket.newThisMonth}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700 }}>{bucket.orders30d}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted-copy" style={{ marginTop: 8 }}>Conversion, upgrade and downgrade columns will activate once live billing events are tracked.</p>
      </section>
    </div>
  );
}

type AdminFeatureUsageDetail = {
  generatedAtMs: number;
  totalWorkspaces: number;
  features: { key: string; label: string; total: number | null; count30d: number | null; unattributed30d?: number; activeWorkspaces: number | null; byPlan: Record<string, number>; scope?: string; error?: string }[];
  heatmap: number[][];
  funnel: { workspaces: number; withCustomer: number | null; withOrder: number | null; chatgptConnected: number; unknownWorkspaceIdsWithOrders?: number | null; unknownWorkspaceIdsWithCustomers?: number | null; independentCounters?: boolean };
  exclusion?: ExclusionSummary;
  topWorkspaces: { id: string; name: string; plan: string; actions: number; topFeature: string }[];
  note: string;
};

const ADMIN_FEATURE_COLORS = ["#8a5cf6", "#0a84ff", "#30d158", "#ff9f0a"];

function AdminFeatureUsageDetail({ onBack, view }: { onBack: () => void; view: AdminView }) {
  const [data, setData] = useState<AdminFeatureUsageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const callable = httpsCallable<{ view: AdminView }, AdminFeatureUsageDetail>(functions, "getAdminFeatureUsageDetail");
    callable({ view })
      .then(result => {
        if (!cancelled) setData(result.data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const crumb = (
    <p className="muted-copy" style={{ margin: "0 0 4px" }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
      {" › "}Feature Usage
    </p>
  );

  if (loading || error || !data) {
    return (
      <div className="settings-card-stack">
        <section className="card app-card">
          {crumb}
          <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Feature Usage" />
          {loading ? <p className="muted-copy">Loading details...</p> : <p style={{ color: "var(--danger)", margin: 0 }}>{error || "No data."}</p>}
        </section>
      </div>
    );
  }

  const totalActions30d = data.features.reduce((acc, feature) => acc + (feature.count30d ?? 0), 0);
  const distributionSlices = data.features
    .map((feature, index) => ({ label: feature.label, value: feature.count30d ?? 0, color: ADMIN_FEATURE_COLORS[index % ADMIN_FEATURE_COLORS.length] }))
    .filter(slice => slice.value > 0);

  const funnelSteps: [string, number | null][] = [
    ["Workspaces", data.funnel.workspaces],
    ["Added a customer", data.funnel.withCustomer],
    ["Created an order", data.funnel.withOrder],
    ["Connected ChatGPT App", data.funnel.chatgptConnected]
  ];
  const funnelMax = Math.max(data.funnel.workspaces, 1);

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        {crumb}
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Feature Usage" />
        <p className="muted-copy">Track how features are used across all workspaces (last 30 days). {data.note}</p>
        <ExclusionNote exclusion={data.exclusion} />
      </section>

      <div className="site-stats-grid">
        {data.features.map(feature => (
          <section key={feature.key} className="card app-card" style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{feature.label}</span>
            <strong style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.05 }}>{unknownOr(feature.count30d, feature.error)}</strong>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>30 days · {feature.total !== null ? `${feature.total.toLocaleString()} all-time` : "all-time —"}</span>
            {feature.unattributed30d ? <span style={{ fontSize: 11, color: "var(--muted)" }}>+{feature.unattributed30d} not tied to an existing workspace</span> : null}
            {feature.scope ? <span style={{ fontSize: 11, color: "var(--muted)" }}>{feature.scope}</span> : null}
          </section>
        ))}
      </div>

      <div className="site-stats-panels">
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Usage" title="Feature Usage Distribution (30d)" />
          {distributionSlices.length ? <StatsDonut slices={distributionSlices} centerLabel={`${totalActions30d.toLocaleString()} actions`} /> : <p className="muted-copy">No activity in the last 30 days.</p>}
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Adoption" title="Active Workspaces by Feature (30d)" />
          <StatsRankedList entries={data.features.map(feature => [`${feature.label} — ${(((feature.activeWorkspaces ?? 0) / Math.max(data.totalWorkspaces, 1)) * 100).toFixed(1)}% of ${data.totalWorkspaces} workspaces`, feature.activeWorkspaces ?? 0] as [string, number])} />
          <p className="muted-copy" style={{ marginTop: 8 }}>A workspace can use several features, so these do not add up to 100%.</p>
        </section>
      </div>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="Plans" title="Feature Usage by Plan (30d)" />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "6px 8px" }}>Feature</th>
                {["demo", "lifetime_lite", "pro_monthly", "team_monthly"].map(plan => (
                  <th key={plan} style={{ padding: "6px 8px", textAlign: "right", color: planTextColor(plan) }}>{ADMIN_PLAN_LABELS[plan]}</th>
                ))}
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.features.map(feature => (
                <tr key={feature.key} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 8px", fontWeight: 700 }}>{feature.label}</td>
                  {["demo", "lifetime_lite", "pro_monthly", "team_monthly"].map(plan => (
                    <td key={plan} style={{ padding: "7px 8px", textAlign: "right" }}>{(feature.byPlan[plan] || 0).toLocaleString()}</td>
                  ))}
                  <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 800 }}>{unknownOr(feature.count30d, feature.error)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="site-stats-panels">
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Adoption" title="Feature Adoption Funnel" />
          <div style={{ display: "grid", gap: 8 }}>
            {funnelSteps.map(([label, value], index) => (
              <div key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 650 }}>
                  <span>{index + 1}. {label}</span>
                  <span style={{ color: "var(--muted)", fontWeight: 800 }}>
                    {value !== null ? `${value.toLocaleString()} (${((value / funnelMax) * 100).toFixed(1)}%)` : "—"}
                  </span>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: "var(--border)", overflow: "hidden", marginTop: 4 }}>
                  <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${value !== null ? Math.max((value / funnelMax) * 100, 2) : 0}%`, background: ADMIN_FEATURE_COLORS[index % ADMIN_FEATURE_COLORS.length] }} />
                </div>
              </div>
            ))}
          </div>
          <p className="muted-copy" style={{ marginTop: 10 }}>
            All-time, independent counters — not a sequence: a workspace can have an order without a customer. Only workspaces that still exist are counted
            {data.funnel.unknownWorkspaceIdsWithOrders ? `; ${data.funnel.unknownWorkspaceIdsWithOrders} deleted / unknown workspace id(s) with orders left out` : ""}.
          </p>
        </section>
      </div>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="Activity" title="Feature Usage by Time of Day" />
        <ActivityHeatmap heatmap={data.heatmap} caption="Orders, customers, notes and messages created, by weekday and hour (last 30 days, UK time)." />
      </section>
    </div>
  );
}

type AdminStorageDetail = {
  generatedAtMs: number;
  totals: { totalBytes: number; fileCount: number; avgFileBytes: number; uploaded30dBytes: number; uploaded30dCount: number; nearLimitCount: number };
  typeBytes: Record<string, number>;
  planBytes: Record<string, number>;
  unknownWorkspace?: { bytes: number; files: number; workspaces: number };
  deletedOrders?: { bytes: number; files: number };
  exclusion?: ExclusionSummary;
  heatmapCaption?: string;
  topWorkspaces: { id: string; name: string; plan: string; bytes: number; files: number; limitMB: number | null; percent: number | null; unknownWorkspace?: boolean }[];
  nearLimit: { id: string; name: string; plan: string; bytes: number; limitMB: number; percent: number }[];
  recentUploads: { fileName: string; companyName: string; sizeBytes: number; type: string; uploadedAtMs: number }[];
  heatmap: number[][];
  note: string;
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const ADMIN_TYPE_COLORS: Record<string, string> = {
  Images: "#8a5cf6",
  Documents: "#0a84ff",
  Videos: "#30d158",
  Audio: "#ff9f0a",
  Other: "#9ca3af"
};

function AdminStorageDetail({ onBack, view }: { onBack: () => void; view: AdminView }) {
  const [data, setData] = useState<AdminStorageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const callable = httpsCallable<{ view: AdminView }, AdminStorageDetail>(functions, "getAdminStorageDetail");
    callable({ view })
      .then(result => {
        if (!cancelled) setData(result.data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const crumb = (
    <p className="muted-copy" style={{ margin: "0 0 4px" }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
      {" › "}Storage
    </p>
  );

  if (loading || error || !data) {
    return (
      <div className="settings-card-stack">
        <section className="card app-card">
          {crumb}
          <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Storage" />
          {loading ? <p className="muted-copy">Loading details...</p> : <p style={{ color: "var(--danger)", margin: 0 }}>{error || "No data."}</p>}
        </section>
      </div>
    );
  }

  const typeSlices = Object.entries(data.typeBytes)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ label: key, value, color: ADMIN_TYPE_COLORS[key] || "#9ca3af" }));

  // The deleted / unknown workspace group belongs in the chart, or the plans do not add up to the
  // total (11.2 MB on 15 Oct had no plan to land in).
  const planSlices = ["demo", "lifetime_lite", "pro_monthly", "team_monthly", "unknown"]
    .map(key => ({ label: key === "unknown" ? "Deleted / unknown workspace" : ADMIN_PLAN_LABELS[key] || key, value: data.planBytes[key] || 0, color: ADMIN_PLAN_COLORS[key] || "#9ca3af" }))
    .filter(slice => slice.value > 0);

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        {crumb}
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Storage" />
        <p className="muted-copy">Client Files usage across all workspaces. {data.note}</p>
        <ExclusionNote exclusion={data.exclusion} />
      </section>

      <div className="site-stats-grid">
        {adminKpiTile("Total Used", formatBytes(data.totals.totalBytes))}
        {adminKpiTile("Total Files", data.totals.fileCount.toLocaleString())}
        {adminKpiTile("Avg. File Size", formatBytes(data.totals.avgFileBytes))}
        {adminKpiTile("Uploaded (30d)", formatBytes(data.totals.uploaded30dBytes), `${data.totals.uploaded30dCount} files`)}
        {adminKpiTile("Near Limit (≥80%)", data.totals.nearLimitCount.toLocaleString(), "workspaces")}
      </div>

      <div className="site-stats-panels">
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Storage" title="Usage by File Type" />
          {typeSlices.length ? (
            <StatsDonut slices={typeSlices.map(slice => ({ ...slice, value: Math.round(slice.value / 1024 / 1024) || 1 }))} centerLabel="MB" />
          ) : <p className="muted-copy">No files yet.</p>}
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Storage" title="Usage by Plan" />
          {planSlices.length ? (
            <StatsRankedList entries={planSlices.map(slice => [slice.label, Math.round(slice.value / 1024 / 1024)] as [string, number])} />
          ) : <p className="muted-copy">No files yet.</p>}
          <p className="muted-copy" style={{ marginTop: 8 }}>
            Values in MB; % = share of the {formatBytes(data.totals.totalBytes)} total. Plan = the plan each workspace has now.
            {data.unknownWorkspace?.files ? ` ${data.unknownWorkspace.files} file(s) sit on orders of ${data.unknownWorkspace.workspaces} workspace(s) that no longer exist — no plan or limit is guessed for them.` : ""}
            {data.deletedOrders?.files ? ` ${data.deletedOrders.files} file(s) (${formatBytes(data.deletedOrders.bytes)}) belong to deleted orders and stay counted until purged.` : ""}
          </p>
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Attention" title="Storage Warnings" />
          {data.nearLimit.length === 0 ? (
            <p className="muted-copy">No workspace is above 80% of its storage limit. ✓</p>
          ) : (
            <div style={{ display: "grid" }}>
              {data.nearLimit.map((workspace, index) => (
                <div key={workspace.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid var(--border)" }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: workspace.percent >= 95 ? "#d92d20" : "#ff9f0a" }} />
                  <span style={{ fontSize: 13, fontWeight: 650, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workspace.name}</span>
                  <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{formatBytes(workspace.bytes)} / {workspace.limitMB >= 1024 ? `${workspace.limitMB / 1024} GB` : `${workspace.limitMB} MB`}</span>
                  <strong style={{ fontSize: 12.5, color: workspace.percent >= 95 ? "var(--admin-bad-text)" : "var(--admin-warn-text)" }}>{workspace.percent}%</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="Workspaces" title="Top Workspaces by Storage" />
        {data.topWorkspaces.length === 0 ? (
          <p className="muted-copy">No files yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 540, borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "6px 8px" }}>#</th>
                  <th style={{ padding: "6px 8px" }}>Workspace</th>
                  <th style={{ padding: "6px 8px" }}>Plan</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Files</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Used</th>
                  <th style={{ padding: "6px 8px", minWidth: 140 }}>Of Limit</th>
                </tr>
              </thead>
              <tbody>
                {data.topWorkspaces.map((workspace, index) => (
                  <tr key={workspace.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 8px", color: "var(--muted)", fontWeight: 700 }}>{index + 1}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 700 }}>{workspace.name}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 800, color: planTextColor(workspace.plan, "var(--text)") }}>{workspace.plan === "unknown" ? "Unknown" : ADMIN_PLAN_LABELS[workspace.plan] || workspace.plan}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{workspace.files}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700 }}>{formatBytes(workspace.bytes)}</td>
                    <td style={{ padding: "7px 8px" }}>
                      {workspace.percent === null ? <span style={{ fontSize: 11.5, color: "var(--muted)" }}>— (workspace no longer exists)</span> : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 7, borderRadius: 999, background: "var(--admin-track-bg)", overflow: "hidden" }}>
                          <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${Math.min(workspace.percent, 100)}%`, background: workspace.percent >= 95 ? "#d92d20" : workspace.percent >= 80 ? "#ff9f0a" : "#0a84ff" }} />
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", minWidth: 42, textAlign: "right" }}>{workspace.percent}%</span>
                      </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="site-stats-panels">
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Files" title="Recent Uploads" />
          {data.recentUploads.length === 0 ? (
            <p className="muted-copy">No uploads yet.</p>
          ) : (
            <div style={{ display: "grid" }}>
              {data.recentUploads.map((file, index) => (
                <div key={`${file.fileName}-${file.uploadedAtMs}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid var(--border)" }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: ADMIN_TYPE_COLORS[file.type] || "#9ca3af" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.fileName}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{file.companyName}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{formatBytes(file.sizeBytes)}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 74, textAlign: "right" }}>{new Date(file.uploadedAtMs).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Activity" title="Uploads by Time of Day (30d)" />
          <ActivityHeatmap heatmap={data.heatmap} caption={data.heatmapCaption || "Client-file uploads by weekday and hour (last 30 days, UK time)."} />
        </section>
      </div>
    </div>
  );
}

type AdminLookupUser = { uid: string; email: string; displayName: string; createdAtMs: number; lastSignInMs: number };
type AdminLookupWorkspace = { id: string; name: string; ownerEmail: string; plan: string };

function AdminUserLookupDetail({ onBack }: { onBack: () => void }) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [users, setUsers] = useState<AdminLookupUser[]>([]);
  const [workspaces, setWorkspaces] = useState<AdminLookupWorkspace[]>([]);
  const [searched, setSearched] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailKind, setDetailKind] = useState<"user" | "workspace" | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const runSearch = () => {
    const clean = query.trim();
    if (clean.length < 2) {
      setError("Enter at least 2 characters.");
      return;
    }
    setSearching(true);
    setError("");
    setDetail(null);
    setDetailKind(null);
    const callable = httpsCallable<{ mode: string; query: string }, { users: AdminLookupUser[]; workspaces: AdminLookupWorkspace[] }>(functions, "getAdminLookup");
    callable({ mode: "search", query: clean })
      .then(result => {
        setUsers(result.data?.users ?? []);
        setWorkspaces(result.data?.workspaces ?? []);
        setSearched(true);
      })
      .catch(err => setError(err instanceof Error ? err.message : "Search failed."))
      .finally(() => setSearching(false));
  };

  const openDetail = (kind: "user" | "workspace", id: string) => {
    setDetailLoading(true);
    setDetailKind(kind);
    setDetail(null);
    const callable = httpsCallable<{ mode: string; uid?: string; companyId?: string }, Record<string, unknown>>(functions, "getAdminLookup");
    const payload = kind === "user" ? { mode: "user", uid: id } : { mode: "workspace", companyId: id };
    callable(payload)
      .then(result => setDetail(result.data as Record<string, unknown>))
      .catch(err => setError(err instanceof Error ? err.message : "Could not load details."))
      .finally(() => setDetailLoading(false));
  };

  const crumb = (
    <p className="muted-copy" style={{ margin: "0 0 4px" }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
      {" › "}User Lookup
    </p>
  );

  const dateText = (ms: unknown) => (typeof ms === "number" && ms > 0 ? new Date(ms).toLocaleString() : "—");

  const [flagKind, setFlagKind] = useState("qa");
  const [flagNote, setFlagNote] = useState("");
  const [flagBusy, setFlagBusy] = useState(false);
  const setFlag = (companyId: string, kind: string | null) => {
    setFlagBusy(true);
    setError("");
    const callable = httpsCallable<{ companyId: string; kind: string | null; note: string }, { analyticsExclusion: { kind: string; note: string; setAtMs: number } | null }>(functions, "setAnalyticsExclusion");
    callable({ companyId, kind, note: flagNote })
      .then(result => {
        setDetail(previous => previous ? { ...previous, workspace: { ...(previous.workspace as Record<string, unknown>), analyticsExclusion: result.data?.analyticsExclusion ?? null } } : previous);
        setFlagNote("");
      })
      .catch(err => setError(err instanceof Error ? err.message : "Could not change the analytics flag."))
      .finally(() => setFlagBusy(false));
  };

  const renderUserDetail = () => {
    const user = (detail?.user ?? {}) as Record<string, unknown>;
    const memberships = (detail?.memberships ?? []) as { companyId: string; name: string; plan: string; role: string; sources?: string[]; workspaceExists?: boolean }[];
    const membershipsError = String(detail?.membershipsError || "");
    return (
      <>
        <div className="settings-mini-grid">
          <InfoTile label="Email" value={String(user.email || "—")} />
          <InfoTile label="Name" value={String(user.displayName || "—")} />
          <InfoTile label="Signed up" value={dateText(user.createdAtMs)} />
          <InfoTile label="Last sign-in" value={dateText(user.lastSignInMs)} />
          <InfoTile label="Support tickets" value={String(user.ticketsCreated ?? "—")} />
          <InfoTile label="Notes written" value={unknownOr(typeof user.notesOwned === "number" ? user.notesOwned : null, membershipsError || "not_available")} />
          <InfoTile label="Status" value={user.disabled ? "Disabled" : "Active"} />
        </div>
        <p className="muted-copy" style={{ margin: "12px 0 6px", fontWeight: 700 }}>Workspaces</p>
        {membershipsError ? (
          <p style={{ color: "var(--danger)", margin: 0 }}>{unknownOr(null, membershipsError)}</p>
        ) : memberships.length === 0 ? (
          <p className="muted-copy">No workspace owned or joined (checked: workspace records and access records).</p>
        ) : (
          <div style={{ display: "grid" }}>
            {memberships.map((membership, index) => (
              <div key={membership.companyId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid var(--border)" }}>
                <span style={{ fontSize: 13, fontWeight: 650, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{membership.name}</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: planTextColor(membership.plan, "var(--muted)") }}>{ADMIN_PLAN_LABELS[membership.plan] || membership.plan}</span>
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{membership.role}</span>
                {membership.sources?.length ? <span style={{ fontSize: 10.5, color: "var(--muted)" }} title="Where this membership was found">{membership.sources.join(" · ")}</span> : null}
                <button type="button" disabled={membership.workspaceExists === false} onClick={() => openDetail("workspace", membership.companyId)} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                  Stats →
                </button>
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  const renderWorkspaceDetail = () => {
    const workspace = (detail?.workspace ?? {}) as Record<string, unknown>;
    const percent = Number(workspace.storagePercent || 0);
    const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
    const members = num(workspace.members);
    const suspended = num(workspace.membersSuspended) || 0;
    const flag = (workspace.analyticsExclusion ?? null) as { kind: string; note?: string; setAtMs?: number } | null;
    const billingState = String(workspace.billingState || "");
    const lastOrder = num(workspace.lastOrderAtMs);
    return (
      <>
        <div className="settings-mini-grid">
          <InfoTile label="Workspace" value={String(workspace.name || "—")} />
          <InfoTile label="Owner" value={String(workspace.ownerEmail || "—")} />
          <InfoTile label="Plan" value={`${ADMIN_PLAN_LABELS[String(workspace.plan)] || String(workspace.plan || "—")}${billingState ? ` · ${BILLING_STATE_LABELS[billingState] || billingState}` : ""}`} />
          <InfoTile label="Members" value={members === null ? unknownOr(null, "not_available") : `${members} (owner${members > 1 ? ` + ${members - 1}` : " only"})${suspended ? ` · ${suspended} suspended` : ""}`} />
          <InfoTile label="Created" value={dateText(workspace.createdAtMs)} />
          <InfoTile label="Last order" value={lastOrder ? dateText(lastOrder) : unknownOr(null, String(workspace.lastOrderReason || "not_available"))} />
          <InfoTile label="Orders (total)" value={String(workspace.ordersTotal ?? "—")} />
          <InfoTile label="Orders (30d)" value={unknownOr(num(workspace.orders30d), String(workspace.orders30dReason || "not_available"))} />
          <InfoTile label="Notes" value={unknownOr(num(workspace.notesTotal), String(workspace.notesReason || "not_available"))} />
          <InfoTile label="Customers" value={String(workspace.customersTotal ?? "—")} />
          <InfoTile label="Messages" value={String(workspace.messagesTotal ?? "—")} />
          <InfoTile label="Support tickets" value={String(workspace.supportTotal ?? "—")} />
          <InfoTile label="Files" value={String(workspace.storageFiles ?? "—")} />
        </div>
        <p className="muted-copy" style={{ margin: "12px 0 6px", fontWeight: 700 }}>Storage</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 9, borderRadius: 999, background: "var(--admin-track-bg)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${Math.min(percent, 100)}%`, background: percent >= 95 ? "#d92d20" : percent >= 80 ? "#ff9f0a" : "#0a84ff" }} />
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>
            {formatBytes(Number(workspace.storageBytes || 0))} / {Number(workspace.storageLimitMB || 0) >= 1024 ? `${Number(workspace.storageLimitMB) / 1024} GB` : `${workspace.storageLimitMB} MB`} ({percent}%)
          </span>
        </div>
        <p className="muted-copy" style={{ margin: "10px 0 0", fontSize: 11.5 }}>
          Members: owner + members list on the workspace record. Orders (30d) / last order: creation stamp, or the order date for older orders without one
          {num(workspace.ordersUndated) ? ` (${workspace.ordersUndated} order(s) carry no date)` : ""}{num(workspace.ordersDeleted) ? `; ${workspace.ordersDeleted} deleted order(s) not counted` : ""}.
        </p>
        <p className="muted-copy" style={{ margin: "12px 0 6px", fontWeight: 700 }}>Analytics flag</p>
        <p className="muted-copy" style={{ margin: "0 0 6px", fontSize: 12 }}>
          {flag ? `Flagged ${flag.kind}${flag.note ? ` — “${flag.note}”` : ""}${flag.setAtMs ? ` (${new Date(flag.setAtMs).toLocaleDateString()})` : ""}: left out of the business view, counted in the QA view.` : "Not flagged: counted in every view."}
          {" "}Set by hand only — a workspace is never flagged because of its name.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <select value={flagKind} onChange={event => setFlagKind(event.target.value)} disabled={flagBusy} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}>
            <option value="internal">Internal</option>
            <option value="qa">QA / test</option>
            <option value="pilot">Pilot</option>
          </select>
          <input type="text" value={flagNote} maxLength={200} onChange={event => setFlagNote(event.target.value)} placeholder="Note (optional)" disabled={flagBusy} style={{ flex: "1 1 160px", padding: "6px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
          <button type="button" className="button" disabled={flagBusy} onClick={() => setFlag(String(workspace.id || ""), flagKind)} style={{ padding: "6px 12px", borderRadius: 10, fontWeight: 700 }}>{flag ? "Change flag" : "Flag"}</button>
          {flag ? <button type="button" className="button secondary" disabled={flagBusy} onClick={() => setFlag(String(workspace.id || ""), null)} style={{ padding: "6px 12px", borderRadius: 10, fontWeight: 700 }}>Clear flag</button> : null}
        </div>
      </>
    );
  };

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        {crumb}
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="User Lookup" />
        <p className="muted-copy">Search any user or workspace by email or name and inspect their statistics.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input
            type="text"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") runSearch(); }}
            placeholder="Email, name or workspace..."
            style={{ flex: "1 1 220px", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", color: "var(--text)", fontSize: 14 }}
          />
          <button
            type="button"
            className="button"
            onClick={runSearch}
            disabled={searching}
            style={{ padding: "10px 18px", borderRadius: 12, fontWeight: 800, background: "#0a84ff", color: "#fff" }}
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
        {error ? <p style={{ color: "var(--danger)", margin: "8px 0 0" }}>{t(error)}</p> : null}
      </section>

      {searched && !detailKind ? (
        <div className="site-stats-panels">
          <section className="card app-card">
            <CardTitle icon="customer" eyebrow="Results" title={`Users (${users.length})`} />
            {users.length === 0 ? <p className="muted-copy">No matching users.</p> : (
              <div style={{ display: "grid" }}>
                {users.map((user, index) => (
                  <button
                    key={user.uid}
                    type="button"
                    onClick={() => openDetail("user", user.uid)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: index === 0 ? "none" : "1px solid var(--border)", background: "none", border: 0, cursor: "pointer", textAlign: "left", width: "100%", color: "var(--text)" }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email || user.uid}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{user.displayName || "—"} · last sign-in {user.lastSignInMs ? new Date(user.lastSignInMs).toLocaleDateString() : "never"}</div>
                    </div>
                    <span aria-hidden="true" style={{ color: "var(--accent)", fontWeight: 800 }}>→</span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="card app-card">
            <CardTitle icon="storage" eyebrow="Results" title={`Workspaces (${workspaces.length})`} />
            {workspaces.length === 0 ? <p className="muted-copy">No matching workspaces.</p> : (
              <div style={{ display: "grid" }}>
                {workspaces.map((workspace, index) => (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => openDetail("workspace", workspace.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: index === 0 ? "none" : "1px solid var(--border)", background: "none", border: 0, cursor: "pointer", textAlign: "left", width: "100%", color: "var(--text)" }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workspace.name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{workspace.ownerEmail || "—"}</div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: planTextColor(workspace.plan, "var(--muted)") }}>{ADMIN_PLAN_LABELS[workspace.plan] || workspace.plan}</span>
                    <span aria-hidden="true" style={{ color: "var(--accent)", fontWeight: 800 }}>→</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {detailKind ? (
        <section className="card app-card">
          <p className="muted-copy" style={{ margin: "0 0 6px" }}>
            <button type="button" onClick={() => { setDetailKind(null); setDetail(null); }} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>← Results</button>
          </p>
          <CardTitle icon="dashboard" eyebrow={detailKind === "user" ? "User" : "Workspace"} title={detailKind === "user" ? "User Statistics" : "Workspace Statistics"} />
          {detailLoading ? <p className="muted-copy">Loading...</p> : detail ? (detailKind === "user" ? renderUserDetail() : renderWorkspaceDetail()) : null}
        </section>
      ) : null}
    </div>
  );
}

function AdminOverviewPanel({ view, onOpen }: { view: AdminView; onOpen: (page: AdminHubPage) => void }) {
  const [data, setData] = useState<AdminInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  // People in the apps now comes from the presence callable the Live page uses, so the two agree;
  // getAdminInsights' own appNow is a raw session count with staff and test sessions in it.
  const { live: appPresence, status: appStatus } = useLiveAppNow(view);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const callable = httpsCallable<{ view: AdminView }, AdminInsights>(functions, "getAdminInsights");
    callable({ view })
      .then(result => {
        if (!cancelled) setData(result.data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load admin insights.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, reloadKey]);

  if (loading && !data) {
    return (
      <div className="settings-card-stack">
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Overview" />
          <p className="muted-copy" role="status">Loading insights…</p>
          <div className="site-stats-grid admin-skeleton-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="admin-skeleton" />)}
          </div>
        </section>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="settings-card-stack">
        <section className="card app-card">
          <CardTitle icon="lock" eyebrow="NivaDesk admin" title="Overview" />
          <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>{error || "No data."}</p>
          <button type="button" className="button secondary admin-small-button" style={{ marginTop: 10 }} onClick={() => setReloadKey(key => key + 1)}>Try again</button>
        </section>
      </div>
    );
  }

  const planSlices = Object.entries(data.workspaces.planCounts)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({ label: ADMIN_PLAN_LABELS[key] || key, value, color: ADMIN_PLAN_COLORS[key] || "#9ca3af" }));

  const usageEntries: [string, number | null][] = [
    ["Orders (total)", data.usage.ordersTotal],
    ["Orders this month", data.usage.ordersThisMonth],
    ["Customers", data.usage.customersTotal],
    ["Notes (originals)", data.usage.notesTotal],
    ["Notes with reminders", data.usage.remindersTotal],
    ["Messages", data.usage.messagesTotal],
    ["Workspace tickets", data.usage.workspaceTicketsTotal]
  ];

  const heartbeatText = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : "—");
  const presenceLive = appPresence?.live;
  const appsNow = appBuckets(presenceLive);
  const appNowValue = presenceLive ? presenceLive.people : appPresence ? Number(appPresence.active || 0) : data.site.appNow ?? 0;
  const appNowHint = presenceLive
    ? PRESENCE_APPS.filter(app => appsNow[app.key].people > 0).map(app => `${app.short} ${appsNow[app.key].people}`).join(" · ") || "no one right now"
    : Object.entries(appPresence?.platforms ?? data.site.appPlatforms ?? {}).map(([key, value]) => `${key} ${value}`).join(" · ") || "web / mac / ios / android";

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <div className="admin-page-head">
          <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Overview" />
          <div className="admin-page-actions">
            <span className="admin-generated">Updated {new Date(data.generatedAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            <button type="button" className="button secondary admin-small-button" onClick={() => setReloadKey(key => key + 1)} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <ExclusionNote exclusion={data.exclusion} />
      </section>

      <h3 className="admin-group-heading">Right now</h3>
      <div className="site-stats-grid">
        {adminKpiTile("In the apps now", appStatus === "loading" && !appPresence ? "…" : appNowValue.toLocaleString(), presenceLive ? `${appNowHint} — open Live` : `${appNowHint} (sessions)`, () => onOpen("live"))}
        {adminKpiTile("On the website now", data.site.liveVisitors.toLocaleString(), `${data.site.today.sessions} visitor sessions today`, () => onOpen("sitestats"))}
        {adminKpiTile("Open support tickets", countText(data.support.open), `${countText(data.support.inProgress)} in progress`)}
      </div>

      <h3 className="admin-group-heading">Business</h3>
      <div className="site-stats-grid">
        {data.billing ? (
          <>
            {adminKpiTile("Paid by provider", (data.billing.byState.paid_provider || 0).toLocaleString(), providerHint(data.billing), () => onOpen("subscriptions"))}
            {adminKpiTile("Active trials", (data.billing.byState.trial_active || 0).toLocaleString(), `${data.billing.byState.trial_expired || 0} ended — now Free, not counted`)}
            {adminKpiTile("Manual / complimentary", (data.billing.byState.manual_comp || 0).toLocaleString(), "plan assigned, no till behind it")}
            {adminKpiTile("List-price potential", `£${data.billing.listPricePotential.toLocaleString()}/mo`, "plans in force at list price — not revenue", () => onOpen("revenue"))}
            {adminKpiTile("Collected revenue", "Not measured", "live billing is not connected to Insights")}
          </>
        ) : (
          <>
            {adminKpiTile("Paid Subscriptions", data.workspaces.paid.toLocaleString())}
            {adminKpiTile("Est. MRR", `£${data.revenue.mrr.toLocaleString()}`, "estimate — billing not live")}
            {adminKpiTile("Est. ARR", `£${data.revenue.arr.toLocaleString()}`, "estimate — billing not live")}
          </>
        )}
      </div>

      <h3 className="admin-group-heading">Growth</h3>
      <div className="site-stats-grid">
        {adminKpiTile("Sign-in accounts", data.users.total.toLocaleString(), `+${data.users.new30d} in last 30 days · every account, staff and test included`, () => onOpen("users"))}
        {adminKpiTile("Workspaces", data.workspaces.total.toLocaleString(), `+${data.workspaces.new30d} in last 30 days`, () => onOpen("users"))}
        {adminKpiTile("Workspaces with a new order", data.workspaces.active30d.toLocaleString(), "an order created in the last 30 days (shop imports included)", () => onOpen("activation"))}
      </div>

      <div className="site-stats-panels">
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Plans" title="Plan Distribution" />
          {planSlices.length ? <StatsDonut slices={planSlices} centerLabel="Workspaces" /> : <p className="muted-copy">No data yet.</p>}
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Usage" title="Feature Usage" />
          <ul className="admin-plain-list">
            {usageEntries.map(([label, value]) => <li key={label}><span>{label}</span><strong>{countText(value)}</strong></li>)}
          </ul>
          <p className="muted-copy" style={{ marginTop: 8 }}>Record counts of different kinds, some subsets of others — not shares of adoption. Notes count each note once (a note shared with a colleague is not counted again{typeof data.usage.notesSharedCopies === "number" ? `; ${data.usage.notesSharedCopies} shared copies` : ""}).</p>
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="ChatGPT App" title="ChatGPT App Usage" />
          <div className="settings-mini-grid">
            <InfoTile label="Connected workspaces" value={data.chatgpt.connectedWorkspaces.toLocaleString()} />
            <InfoTile label="Active OAuth tokens" value={data.chatgpt.activeTokens.toLocaleString()} />
            <InfoTile label="Tokens issued (30d)" value={data.chatgpt.tokens30d.toLocaleString()} />
          </div>
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Support" title="Support Tickets" />
          <div className="settings-mini-grid">
            <InfoTile label="Open" value={countText(data.support.open)} />
            <InfoTile label="In progress" value={countText(data.support.inProgress)} />
            <InfoTile label="All time" value={countText(data.support.total)} />
          </div>
          <p className="muted-copy" style={{ marginTop: 10 }}>Reply to tickets from the Support / Tickets section.</p>
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Workspaces" title="Newest Workspaces" />
          <div style={{ display: "grid" }}>
            {data.workspaces.newest.map((workspace, index) => (
              <div key={workspace.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid var(--border)" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", width: 16 }}>{index + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{workspace.name}</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: planTextColor(workspace.plan, "var(--muted)") }}>{ADMIN_PLAN_LABELS[workspace.plan] || workspace.plan}</span>
                <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 74, textAlign: "right" }}>
                  {workspace.createdAtMs ? new Date(workspace.createdAtMs).toLocaleDateString() : "—"}
                </span>
              </div>
            ))}
            {data.workspaces.newest.length === 0 ? <p className="muted-copy">No workspaces yet.</p> : null}
          </div>
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Attention" title="Workspaces Requiring Attention" />
          {data.attention.inactivePaidWorkspaces.length === 0 ? (
            <p className="muted-copy">Every workspace on a plan (paid, trial or manual) created an order in the last 30 days. ✓</p>
          ) : (
            <div style={{ display: "grid" }}>
              {data.attention.inactivePaidWorkspaces.map((workspace, index) => (
                <div key={workspace.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid var(--border)" }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: "#ff9f0a" }} />
                  <span style={{ fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{workspace.name}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: planTextColor(workspace.plan, "var(--muted)") }}>{ADMIN_PLAN_LABELS[workspace.plan] || workspace.plan}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>no orders in 30 days</span>
                </div>
              ))}
            </div>
          )}
          <p className="muted-copy" style={{ marginTop: 10 }}>Payment failures, trials and storage limits will appear here once live billing and storage metering are connected.</p>
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="System" title="Service Heartbeat" />
          <div className="settings-mini-grid">
            <InfoTile label="Last order created" value={heartbeatText(data.heartbeat.lastOrderAtMs)} />
            <InfoTile label="Last site visit" value={heartbeatText(data.heartbeat.lastSiteBeaconAtMs)} />
            <InfoTile label="Last support ticket" value={heartbeatText(data.heartbeat.lastSupportAtMs)} />
          </div>
          <p className="muted-copy" style={{ marginTop: 10 }}>Real activity timestamps — if these stop moving, the matching pipeline needs a look.</p>
        </section>
      </div>
    </div>
  );
}




// ---------------------------------------------------------------- activation
//
// The number that started this: thirty-seven workspaces signed up and none had
// ever created a customer record. It came from a query somebody ran by hand,
// which is why it went unseen for weeks — so it becomes a page.
//
// Every figure here is DERIVED from documents each workspace already has, which
// is what makes it work retroactively; nothing has been recording lifecycle
// events, and a stored funnel would show every existing workspace as having
// done nothing at all. The panel says so out loud, and names the events that
// cannot be derived, because an unmeasured thing shown as a zero is worse than
// no number.

type FunnelWorkspace = {
  companyId: string;
  name: string;
  path: string;
  state: string;
  reason: string;
  activated: boolean;
  activatedAtMs: number;
  steps: Record<string, boolean>;
  signedUpAtMs: number;
  orderCount: number;
  customerCount: number;
  meaningfulEventCount: number;
  lastMeaningfulAtMs: number;
  riskScore: number;
  riskLevel: string;
  riskReasons: string[];
  evidence?: ActivationEvidence;
  underivable: string[];
};

type FunnelResult = {
  ok: boolean;
  generatedAtMs: number;
  workspaces: FunnelWorkspace[];
  totals: {
    workspaces: number;
    activated: number;
    withCustomers: number;
    withOrders: number;
    byState: Record<string, number>;
    byPath: Record<string, number>;
  };
  derivedFrom: string;
  inferred?: boolean;
  definitions?: { engaged?: string; team?: string; finance?: string };
  exclusion?: ExclusionSummary;
  underivable: string[];
};

/** The states in the order a workspace passes through them, so the row reads as a journey. */
const FUNNEL_STATE_ORDER = ["new", "onboarding", "setup_started", "activated", "engaged", "at_risk", "dormant", "churned"];

const FUNNEL_STATE_LABELS: Record<string, string> = {
  new: "Signed up",
  onboarding: "In onboarding",
  setup_started: "Set something up",
  activated: "Got value",
  engaged: "Using it regularly",
  at_risk: "Slowing down",
  dormant: "Gone quiet",
  churned: "Cancelled"
};

function funnelDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toISOString().slice(0, 10);
}

function AdminActivationFunnelSection({ view }: { view: AdminView }) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [data, setData] = useState<FunnelResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const callable = httpsCallable<{ limit?: number; view: AdminView }, FunnelResult>(functions, "getActivationFunnel");
    callable({ limit: 500, view })
      .then(result => { if (!cancelled) setData(result.data); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the activation funnel."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [view]);

  const totals = data?.totals;
  const workspaces = data?.workspaces ?? [];
  // Worst first, because the list exists to be acted on rather than admired.
  const shown = showAll ? workspaces : workspaces.slice(0, 25);
  const cell = { padding: "8px 6px" } as const;
  const head = { textAlign: "left" as const, color: "var(--muted)", fontSize: 11, fontWeight: 800 };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Activation" />
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
          {t("Every figure here is worked out from what each workspace already has — its orders, customers, connections and bank matches. Nothing new is recorded to produce it, which is why it covers workspaces that signed up long before this page existed.")}
        </p>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
          Every label is inferred, not observed: it is read from documents, not from recorded visits. “Using it regularly” means real work on at least two different UK calendar days in the last week (setup answers do not count); a team goal is met by a job or task assigned to someone; a finance goal by a bank transaction matched to an order. The “Why” column lists the evidence behind each label.
        </p>
        <ExclusionNote exclusion={data?.exclusion} />
        {loading ? <p style={{ fontSize: 13, color: "var(--muted)" }}>{t("Working it out…")}</p> : null}
        {error ? <p role="alert" style={{ fontSize: 13, color: "var(--danger)", fontWeight: 700 }}>{error}</p> : null}

        {totals ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 12 }}>
            <LandingMetricTile label={t("Workspaces")} value={totals.workspaces.toLocaleString()} />
            <LandingMetricTile label={t("Got value")} value={totals.activated.toLocaleString()} sub={t("first real use, not a connection")} />
            <LandingMetricTile label={t("Have a customer")} value={totals.withCustomers.toLocaleString()} />
            <LandingMetricTile label={t("Have an order")} value={totals.withOrders.toLocaleString()} />
          </div>
        ) : null}
      </section>

      {totals ? (
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Funnel" title="Where they stopped" />
          <p className="muted-copy" style={{ margin: "6px 0 0", fontSize: 12 }}>Each workspace sits in one state today (inferred). This is a distribution of current states, not a step-by-step funnel.</p>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table className="admin-search-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={head}><th style={cell}>{t("Stage")}</th><th style={{ ...cell, textAlign: "right" }}>{t("Workspaces")}</th></tr></thead>
              <tbody>
                {FUNNEL_STATE_ORDER.filter(state => (totals.byState[state] || 0) > 0).map(state => (
                  <tr key={state}>
                    <td style={cell}>{t(FUNNEL_STATE_LABELS[state] || state)}</td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: 800 }}>{totals.byState[state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {workspaces.length ? (
        <section className="card app-card">
          <div className="admin-card-head">
            <CardTitle icon="dashboard" eyebrow="Most at risk first" title="Workspaces" />
            <button
              type="button"
              className="button secondary admin-small-button"
              onClick={() => downloadCsv(
                `nivadesk-activation-${view}-${new Date().toISOString().slice(0, 10)}.csv`,
                toCsv(
                  ["workspace", "workspace_id", "came_for", "stage", "orders", "customers", "signed_up", "last_activity", "risk_score", "risk_level", "why"],
                  workspaces.map(row => [row.name, row.companyId, row.path, FUNNEL_STATE_LABELS[row.state] || row.state, row.orderCount, row.customerCount, funnelDate(row.signedUpAtMs), funnelDate(row.lastMeaningfulAtMs), row.riskScore, row.riskLevel, activationEvidenceLine(row.evidence) || ""])
                )
              )}
            >
              Export CSV
            </button>
          </div>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table className="admin-search-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={head}>
                  <th style={cell}>{t("Workspace")}</th><th style={cell}>{t("Came for")}</th><th style={cell}>{t("Stage")}</th>
                  <th style={{ ...cell, textAlign: "right" }}>{t("Orders")}</th>
                  <th style={{ ...cell, textAlign: "right" }}>{t("Customers")}</th>
                  <th style={cell}>{t("Signed up")}</th><th style={cell}>{t("Last activity")}</th>
                  <th style={{ ...cell, textAlign: "right" }}>{t("Risk")}</th>
                  <th style={cell}>{t("Why")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(row => (
                  <tr key={row.companyId}>
                    <td style={cell} title={row.companyId}>{row.name || row.companyId.slice(0, 8)}</td>
                    <td style={cell}>{row.path.replace(/_/g, " ")}</td>
                    {/* The reason on hover, not just the state: "slowing down"
                        on its own is not something anybody can act on. */}
                    <td style={cell} title={row.reason.replace(/_/g, " ")}>{t(FUNNEL_STATE_LABELS[row.state] || row.state)}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{row.orderCount}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{row.customerCount}</td>
                    <td style={cell}>{funnelDate(row.signedUpAtMs)}</td>
                    <td style={cell}>{funnelDate(row.lastMeaningfulAtMs)}</td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: 800 }} title={row.riskReasons.map(reason => reason.replace(/_/g, " ")).join(", ")}>
                      {row.riskScore} · {row.riskLevel}
                    </td>
                    <td style={{ ...cell, fontSize: 11.5, color: "var(--muted)", minWidth: 260, maxWidth: 420 }}>
                      {activationEvidenceLine(row.evidence) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {workspaces.length > shown.length ? (
            <button type="button" className="button secondary" style={{ marginTop: 10 }} onClick={() => setShowAll(true)}>
              {t("Show all")} ({workspaces.length})
            </button>
          ) : null}
        </section>
      ) : null}

      {data ? (
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Honest limits" title="What this cannot see" />
          <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
            {t("These leave no record on any document, so a workspace that did them still reads as though it did not. Somebody opening a connect screen and giving up is the clearest example — and the one this page most needs.")}
          </p>
          <ul style={{ display: "flex", flexWrap: "wrap", gap: 6, listStyle: "none", padding: 0, marginTop: 10 }}>
            {(data.underivable ?? []).map(name => (
              <li key={name} style={{ fontSize: 11.5, fontWeight: 700, border: "1px solid var(--border)", borderRadius: 999, padding: "4px 10px", color: "var(--muted)" }}>
                {name.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

type AdminHubPage =
  | "overview"
  | "live"
  | "users"
  | "subscriptions"
  | "revenue"
  | "plans"
  | "features"
  | "storage"
  | "lookup"
  | "sitestats"
  | "searchconsole"
  | "customorderlanding"
  | "onboarding"
  | "feedback"
  | "activation"
  | "dropoff";

/* Fourteen flat links became five groups (29 Oct 2026): what is happening now, money, the
   customers themselves, how the product is used, and the public website. Order inside a group is
   the order an admin usually reads them in. */
const ADMIN_HUB_GROUPS: { label: string; pages: { id: AdminHubPage; label: string }[] }[] = [
  { label: "Pulse", pages: [{ id: "overview", label: "Overview" }, { id: "live", label: "Live" }] },
  { label: "Money", pages: [{ id: "subscriptions", label: "Subscriptions" }, { id: "revenue", label: "Revenue" }, { id: "plans", label: "Plans" }] },
  {
    label: "Customers",
    pages: [
      { id: "users", label: "Users & Workspaces" },
      { id: "activation", label: "Activation" },
      { id: "dropoff", label: "Drop-off" },
      { id: "onboarding", label: "Setup Answers" },
      { id: "feedback", label: "Customer Feedback" },
      { id: "lookup", label: "User Lookup" }
    ]
  },
  { label: "Product", pages: [{ id: "features", label: "Feature Usage" }, { id: "storage", label: "Storage" }] },
  {
    label: "Website",
    pages: [
      { id: "sitestats", label: "Global Statistics" },
      { id: "searchconsole", label: "Google Search" },
      { id: "customorderlanding", label: "Custom Order Landing Page" }
    ]
  }
];

const ADMIN_HUB_PAGE_IDS = ADMIN_HUB_GROUPS.flatMap(group => group.pages.map(page => page.id));

function pageFromHash(): AdminHubPage {
  if (typeof window === "undefined") return "overview";
  const id = window.location.hash.replace(/^#/, "") as AdminHubPage;
  return ADMIN_HUB_PAGE_IDS.includes(id) ? id : "overview";
}

export function AdminInsightsHub() {
  // The section lives in the address (#live, #revenue …): a link opens the right page and Back
  // returns to the previous section instead of leaving the admin area.
  const [page, setPageState] = useState<AdminHubPage>("overview");
  const [view, setView] = useState<AdminView>("business");
  const hubRef = useRef<HTMLDivElement | null>(null);
  const setPage = (next: AdminHubPage) => {
    setPageState(next);
    if (typeof window !== "undefined" && window.location.hash !== `#${next}`) {
      window.history.pushState(null, "", next === "overview" ? window.location.pathname + window.location.search : `#${next}`);
    }
    // The app scrolls inside its own pane, not the window: bring the hub's top into view.
    hubRef.current?.scrollIntoView({ block: "start" });
  };
  const goOverview = () => setPage("overview");

  useEffect(() => {
    setPageState(pageFromHash());
    const onPop = () => setPageState(pageFromHash());
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    // An admin's own browser is not a visitor: the landing-page and public-site beacons skip a
    // browser carrying the analytics opt-out, so opening Insights sets it (Custom Order Landing
    // has the switch to undo it).
    if (!isAnalyticsExcluded()) setAnalyticsExclusion(true);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, []);

  // The toggle only means something on the pages that count workspaces or members.
  const viewPages: AdminHubPage[] = ["overview", "live", "users", "subscriptions", "revenue", "plans", "features", "storage", "onboarding", "activation", "dropoff"];
  const currentLabel = ADMIN_HUB_GROUPS.flatMap(group => group.pages).find(item => item.id === page)?.label || "Overview";

  return (
    <div className="admin-hub-grid" ref={hubRef}>
      <nav className="admin-hub-sidebar" aria-label="Admin Insights sections">
        {ADMIN_HUB_GROUPS.map(group => (
          <div key={group.label} className="admin-hub-group">
            <span className="admin-hub-group-label">{group.label}</span>
            {group.pages.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={page === item.id ? "admin-hub-link active" : "admin-hub-link"}
                aria-current={page === item.id ? "page" : undefined}
                onClick={event => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                  event.preventDefault();
                  setPage(item.id);
                }}
              >
                {item.id === "live" ? <span className="admin-live-dot" aria-hidden="true" /> : null}
                {item.label}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div className="admin-hub-mobile-nav">
        <label htmlFor="admin-hub-section" className="admin-hub-group-label">Section</label>
        <select id="admin-hub-section" value={page} onChange={event => setPage(event.target.value as AdminHubPage)}>
          {ADMIN_HUB_GROUPS.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.pages.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <section className="admin-hub-content" aria-label={currentLabel}>
        {viewPages.includes(page) ? <AdminViewToggle view={view} onChange={setView} /> : null}
        {page === "overview" ? <AdminOverviewPanel view={view} onOpen={setPage} /> : null}
        {page === "live" ? <AdminLivePanel view={view} /> : null}
        {page === "users" ? <AdminUsersWorkspacesDetail onBack={goOverview} view={view} /> : null}
        {page === "subscriptions" ? <AdminSubscriptionsDetail onBack={goOverview} view={view} /> : null}
        {page === "revenue" ? <AdminRevenueDetail onBack={goOverview} view={view} /> : null}
        {page === "plans" ? <AdminPlansDetail onBack={goOverview} view={view} /> : null}
        {page === "features" ? <AdminFeatureUsageDetail onBack={goOverview} view={view} /> : null}
        {page === "storage" ? <AdminStorageDetail onBack={goOverview} view={view} /> : null}
        {page === "lookup" ? <AdminUserLookupDetail onBack={goOverview} /> : null}
        {page === "sitestats" ? <AdminSiteStatsSection /> : null}
        {page === "searchconsole" ? <AdminSearchConsoleSection /> : null}
        {page === "customorderlanding" ? <AdminCustomOrderLandingSection /> : null}
        {page === "onboarding" ? <AdminOnboardingDetail onBack={goOverview} view={view} /> : null}
        {page === "activation" ? <AdminActivationFunnelSection view={view} /> : null}
        {page === "dropoff" ? <AdminDropoffPanel view={view} /> : null}
        {page === "feedback" ? <AdminFeedbackInbox /> : null}
      </section>
    </div>
  );
}

"use client";

// Admin Insights hub: top-level admin-only analytics area with a left sidebar.
// Hosts the cross-workspace insight pages and the public-site Global Statistics.

import { Fragment, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { CardTitle } from "@/components/CardTitle";

export const NIVADESK_ADMIN_EMAILS = new Set(["nivadesk@gmail.com", "eggcraftco@gmail.com"]);

export function isNivaDeskAdminEmail(email: string | null | undefined) {
  return Boolean(email && NIVADESK_ADMIN_EMAILS.has(email.trim().toLowerCase()));
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-info-tile" style={{ display: "grid", gap: 3, padding: 12, borderRadius: 12, background: "rgba(17,24,39,0.04)" }}>
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
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 800, color: isGood ? "#1d8f43" : "#d92d20" }}>
      <span aria-hidden="true">{delta >= 0 ? "▲" : "▼"}</span>
      {Math.abs(delta).toFixed(1)}%
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
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid rgba(17,24,39,0.07)" }}
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

  useEffect(() => {
    let cancelled = false;
    const callable = httpsCallable<Record<string, never>, { active: number; pages: { path: string; count: number }[] }>(functions, "getSitePresence");
    const poll = () => {
      callable({}).then(result => {
        if (cancelled) return;
        setActive(Number(result.data?.active) || 0);
        setPages(result.data?.pages ?? []);
        setLoaded(true);
      }).catch(() => undefined);
    };
    poll();
    const interval = window.setInterval(poll, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const bars = Array.from({ length: 28 }, (_, index) =>
    active > 0 ? 10 + Math.abs(Math.sin(index * 1.7 + active)) * 22 : 6
  );

  return (
    <section className="card app-card site-stats-live">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <strong style={{ fontSize: 15, color: "#fff" }}>On Site Now</strong>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, color: "#30d158" }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: "#30d158" }} />
          Live
        </span>
      </div>
      <div>
        <div style={{ fontSize: 40, fontWeight: 900, color: "#fff", lineHeight: 1.05 }}>{active}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Active users</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 34 }}>
        {bars.map((height, index) => (
          <span key={index} style={{ width: 8, height, borderRadius: 99, background: active > 0 ? "#8a5cf6" : "rgba(255,255,255,0.14)", transition: "height 0.5s ease" }} />
        ))}
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

function AdminSiteStatsSection() {
  const todayKey = new Date().toISOString().slice(0, 10);
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
    let start = new Date(`${customStart}T12:00:00Z`);
    let end = new Date(`${customEnd}T12:00:00Z`);
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
      onClick={() => setRangeMode(option)}
      style={{
        padding: "7px 14px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        background: rangeMode === option ? "#0a84ff" : "rgba(17,24,39,0.06)",
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
        {loading ? <p className="muted-copy">Loading statistics...</p> : null}
        {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
      </section>

      <LiveOnSiteCard />

      {!loading && !error ? (
        <>
          <div className="site-stats-grid">
            <StatsCard title="Total Visitors" value={curSessions.toLocaleString()} delta={statsDeltaPercent(curSessions, prevSessions)} spark={current.map(day => day.sessions)} color="#8a5cf6" />
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
              <StatsRankedList entries={topStatsEntries(current, "referrers")} />
            </section>
          </div>

          <section className="card app-card">
            <CardTitle icon="notes" eyebrow="Support" title="Support inbox" />
            <p className="muted-copy">Messages sent via Contact NivaDesk Support appear in the Support / Tickets section — as an admin you see every user&apos;s tickets there.</p>
          </section>
        </>
      ) : null}
    </div>
  );
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
    newest: { id: string; name: string; plan: string; createdAtMs: number }[];
  };
  revenue: { estimated: boolean; currency: string; mrr: number; arr: number; note: string };
  usage: {
    ordersTotal: number | null;
    ordersThisMonth: number | null;
    customersTotal: number | null;
    notesTotal: number | null;
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
  demo: "Free Demo",
  lifetime_lite: "Lite",
  pro_monthly: "Pro",
  team_monthly: "Team"
};

const ADMIN_PLAN_COLORS: Record<string, string> = {
  demo: "#8a5cf6",
  lifetime_lite: "#0a84ff",
  pro_monthly: "#30d158",
  team_monthly: "#ff9f0a"
};

function adminKpiTile(label: string, value: string, hint?: string) {
  return (
    <section key={label} className="card app-card" style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{label}</span>
      <strong style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.05 }}>{value}</strong>
      {hint ? <span style={{ fontSize: 11, color: "var(--muted)" }}>{hint}</span> : null}
    </section>
  );
}

type AdminUsersDetail = {
  generatedAtMs: number;
  users: { total: number; new7d: number; new30d: number; active7d: number; active30d: number; neverLoggedIn: number };
  growth: { date: string; signups: number; cumulative: number }[];
  workspaces: { total: number; active30d: number; inactive: number; planCounts: Record<string, number> };
  quick: { avgWorkspacesPerUser: number; usersWithMultipleWorkspaces: number };
  topWorkspaces: { id: string; name: string; ownerEmail: string; plan: string; members: number | null; orders30d: number; ordersTotal: number | null; lastOrderAtMs: number }[];
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

function ActivityHeatmap({ heatmap }: { heatmap: number[][] }) {
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
                  background: value === 0 ? "rgba(17,24,39,0.06)" : `rgba(138, 92, 246, ${0.25 + (value / max) * 0.75})`
                }}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <p className="muted-copy" style={{ marginTop: 8 }}>Order creation activity by weekday and hour (last 30 days, UK time).</p>
    </div>
  );
}

function AdminUsersWorkspacesDetail({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<AdminUsersDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const callable = httpsCallable<Record<string, never>, AdminUsersDetail>(functions, "getAdminUsersWorkspacesDetail");
    callable({})
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
  }, []);

  const crumb = (
    <p className="muted-copy" style={{ margin: "0 0 4px" }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "#0a84ff", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
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
        <p className="muted-copy">Track user growth, activity and workspace statistics across NivaDesk.</p>
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
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Users</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Orders (30d)</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Orders (total)</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {data.topWorkspaces.map((workspace, index) => (
                  <tr key={workspace.id} style={{ borderTop: "1px solid rgba(17,24,39,0.07)" }}>
                    <td style={{ padding: "7px 8px", color: "var(--muted)", fontWeight: 700 }}>{index + 1}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 700 }}>{workspace.name}</td>
                    <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{workspace.ownerEmail || "—"}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 800, color: ADMIN_PLAN_COLORS[workspace.plan] || "var(--text)" }}>{ADMIN_PLAN_LABELS[workspace.plan] || workspace.plan}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{workspace.members ?? "—"}</td>
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
        <CardTitle icon="dashboard" eyebrow="Activity" title="User Activity Overview" />
        <ActivityHeatmap heatmap={data.heatmap} />
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
  recent: { id: string; name: string; ownerEmail: string; plan: string; monthlyGbp: number; createdAtMs: number }[];
};

const ADMIN_SOURCE_LABELS: Record<string, string> = {
  signup_free_demo: "Sign-up default",
  new_workspace_default: "New workspace default",
  workspace: "Set in workspace (manual)",
  legacy_default: "Legacy default",
  legacy: "Legacy",
  secure_default: "Secure default"
};

function AdminSubscriptionsDetail({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<AdminSubsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const callable = httpsCallable<Record<string, never>, AdminSubsDetail>(functions, "getAdminSubscriptionsDetail");
    callable({})
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
  }, []);

  const crumb = (
    <p className="muted-copy" style={{ margin: "0 0 4px" }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "#0a84ff", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
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
      </section>

      <div className="site-stats-grid">
        {adminKpiTile("Active Subscriptions", data.subscriptions.paidTotal.toLocaleString(), "paid plan assigned")}
        {adminKpiTile("New Subscriptions (30d)", data.subscriptions.paidNew30d.toLocaleString(), "paid workspaces created")}
        {adminKpiTile("Free Demo Workspaces", data.subscriptions.freeDemo.toLocaleString())}
        {adminKpiTile("Est. MRR", `£${data.revenue.mrr.toLocaleString()}`, "estimate — billing not live")}
        {adminKpiTile("Est. ARR", `£${data.revenue.arr.toLocaleString()}`, "estimate — billing not live")}
        {adminKpiTile("Est. ARPU", `£${data.revenue.arpu.toLocaleString()}`, "per paid workspace / month")}
      </div>

      <div className="site-stats-panels">
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Plans" title="Subscriptions by Plan" />
          {paidSlices.length ? <StatsDonut slices={paidSlices} centerLabel="Paid" /> : <p className="muted-copy">No paid subscriptions yet.</p>}
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Revenue" title="Est. MRR by Plan" />
          <StatsRankedList entries={mrrEntries.map(([label, value]) => [`${label}`, value])} />
          <p className="muted-copy" style={{ marginTop: 8 }}>Values in GBP/month, from plan list prices.</p>
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Source" title="Plan Source Distribution" />
          {sourceEntries.length ? <StatsRankedList entries={sourceEntries} /> : <p className="muted-copy">No paid subscriptions yet.</p>}
          <p className="muted-copy" style={{ marginTop: 8 }}>How each paid plan was assigned. Stripe / Apple / Google payment methods will appear here once live billing is connected.</p>
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Billing" title="Not Connected Yet" />
          <p className="muted-copy" style={{ margin: 0 }}>
            Trials, cancellations, expirations, failed payments, billing cycles and plan-change history require live billing.
            When Stripe / App Store / Play billing is enabled, those cards will activate here automatically.
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
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Est. £/mo</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map(item => (
                  <tr key={item.id} style={{ borderTop: "1px solid rgba(17,24,39,0.07)" }}>
                    <td style={{ padding: "7px 8px", fontWeight: 700 }}>{item.name}</td>
                    <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{item.ownerEmail || "—"}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 800, color: ADMIN_PLAN_COLORS[item.plan] || "var(--text)" }}>{ADMIN_PLAN_LABELS[item.plan] || item.plan}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700 }}>£{item.monthlyGbp}</td>
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
  topPaying: { id: string; name: string; ownerEmail: string; plan: string; baseGbp: number; seatGbp: number; storageGbp: number; totalGbp: number }[];
};

function AdminRevenueDetail({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<AdminRevenueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const callable = httpsCallable<Record<string, never>, AdminRevenueDetail>(functions, "getAdminRevenueDetail");
    callable({})
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
  }, []);

  const crumb = (
    <p className="muted-copy" style={{ margin: "0 0 4px" }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "#0a84ff", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
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
      </section>

      <div className="site-stats-grid">
        {adminKpiTile("Est. MRR", `£${data.revenue.mrr.toLocaleString()}`, "plans + seats + storage")}
        {adminKpiTile("Est. ARR", `£${data.revenue.arr.toLocaleString()}`)}
        {adminKpiTile("Est. ARPU", `£${data.revenue.arpu.toLocaleString()}`, "per paid workspace / month")}
        {adminKpiTile("Paid Workspaces", data.revenue.paidTotal.toLocaleString())}
        {adminKpiTile("Extra Seats", data.revenue.seatCount.toLocaleString(), `£${data.revenue.seatsMrr}/mo`)}
        {adminKpiTile("Storage Add-ons", data.revenue.storageAddonCount.toLocaleString(), `£${data.revenue.storageMrr}/mo`)}
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
          <CardTitle icon="dashboard" eyebrow="Billing" title="Not Connected Yet" />
          <p className="muted-copy" style={{ margin: 0 }}>
            Revenue over time, billing sources (Stripe / Apple / Google), currencies, countries, transactions and refunds
            require live billing. These cards will activate here automatically once payments are enabled.
          </p>
        </section>
      </div>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="Workspaces" title="Top Paying Workspaces (Est.)" />
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
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Base</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Seats</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Storage</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Est. £/mo</th>
                </tr>
              </thead>
              <tbody>
                {data.topPaying.map((workspace, index) => (
                  <tr key={workspace.id} style={{ borderTop: "1px solid rgba(17,24,39,0.07)" }}>
                    <td style={{ padding: "7px 8px", color: "var(--muted)", fontWeight: 700 }}>{index + 1}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 700 }}>{workspace.name}</td>
                    <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{workspace.ownerEmail || "—"}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 800, color: ADMIN_PLAN_COLORS[workspace.plan] || "var(--text)" }}>{ADMIN_PLAN_LABELS[workspace.plan] || workspace.plan}</td>
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
  stats: Record<string, { workspaces: number; newThisMonth: number; active30d: number; orders30d: number }>;
  comparison: { plan: string; label: string; orders: string; customers: string; storage: string; seats: string; monthly: number; yearly: number }[];
  note: string;
};

const ADMIN_PLAN_ORDER = ["demo", "lifetime_lite", "pro_monthly", "team_monthly"];

function AdminPlansDetail({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<AdminPlansDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const callable = httpsCallable<Record<string, never>, AdminPlansDetail>(functions, "getAdminPlansDetail");
    callable({})
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
  }, []);

  const crumb = (
    <p className="muted-copy" style={{ margin: "0 0 4px" }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "#0a84ff", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
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
        <p className="muted-copy">Analyze plan performance, features and limits. {data.note}</p>
      </section>

      <div className="site-stats-grid">
        {ADMIN_PLAN_ORDER.map(key => {
          const bucket = data.stats[key] || { workspaces: 0, newThisMonth: 0, active30d: 0, orders30d: 0 };
          return (
            <section key={key} className="card app-card" style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: ADMIN_PLAN_COLORS[key] || "var(--muted)" }}>{ADMIN_PLAN_LABELS[key] || key}</span>
              <strong style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.05 }}>{bucket.workspaces.toLocaleString()}</strong>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{((bucket.workspaces / total) * 100).toFixed(1)}% of total · {bucket.active30d} active 30d · +{bucket.newThisMonth} this month</span>
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
                  <th key={plan.plan} style={{ padding: "6px 8px", color: ADMIN_PLAN_COLORS[plan.plan] || "var(--text)" }}>{plan.label}</th>
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
                <tr key={label} style={{ borderTop: "1px solid rgba(17,24,39,0.07)" }}>
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
                  <tr key={key} style={{ borderTop: "1px solid rgba(17,24,39,0.07)" }}>
                    <td style={{ padding: "7px 8px", fontWeight: 800, color: ADMIN_PLAN_COLORS[key] || "var(--text)" }}>{ADMIN_PLAN_LABELS[key] || key}</td>
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
  features: { key: string; label: string; total: number | null; count30d: number; activeWorkspaces: number; byPlan: Record<string, number> }[];
  heatmap: number[][];
  funnel: { workspaces: number; withCustomer: number | null; withOrder: number | null; chatgptConnected: number };
  topWorkspaces: { id: string; name: string; plan: string; actions: number; topFeature: string }[];
  note: string;
};

const ADMIN_FEATURE_COLORS = ["#8a5cf6", "#0a84ff", "#30d158", "#ff9f0a"];

function AdminFeatureUsageDetail({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<AdminFeatureUsageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const callable = httpsCallable<Record<string, never>, AdminFeatureUsageDetail>(functions, "getAdminFeatureUsageDetail");
    callable({})
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
  }, []);

  const crumb = (
    <p className="muted-copy" style={{ margin: "0 0 4px" }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "#0a84ff", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
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

  const totalActions30d = data.features.reduce((acc, feature) => acc + feature.count30d, 0);
  const distributionSlices = data.features
    .map((feature, index) => ({ label: feature.label, value: feature.count30d, color: ADMIN_FEATURE_COLORS[index % ADMIN_FEATURE_COLORS.length] }))
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
      </section>

      <div className="site-stats-grid">
        {data.features.map(feature => (
          <section key={feature.key} className="card app-card" style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{feature.label}</span>
            <strong style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.05 }}>{feature.count30d.toLocaleString()}</strong>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>30 days · {feature.total !== null ? `${feature.total.toLocaleString()} all-time` : "all-time —"}</span>
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
          <StatsRankedList entries={data.features.map(feature => [`${feature.label} — ${((feature.activeWorkspaces / Math.max(data.totalWorkspaces, 1)) * 100).toFixed(1)}%`, feature.activeWorkspaces] as [string, number])} />
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
                  <th key={plan} style={{ padding: "6px 8px", textAlign: "right", color: ADMIN_PLAN_COLORS[plan] }}>{ADMIN_PLAN_LABELS[plan]}</th>
                ))}
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.features.map(feature => (
                <tr key={feature.key} style={{ borderTop: "1px solid rgba(17,24,39,0.07)" }}>
                  <td style={{ padding: "7px 8px", fontWeight: 700 }}>{feature.label}</td>
                  {["demo", "lifetime_lite", "pro_monthly", "team_monthly"].map(plan => (
                    <td key={plan} style={{ padding: "7px 8px", textAlign: "right" }}>{(feature.byPlan[plan] || 0).toLocaleString()}</td>
                  ))}
                  <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 800 }}>{feature.count30d.toLocaleString()}</td>
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
                <div style={{ height: 10, borderRadius: 999, background: "rgba(17,24,39,0.07)", overflow: "hidden", marginTop: 4 }}>
                  <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${value !== null ? Math.max((value / funnelMax) * 100, 2) : 0}%`, background: ADMIN_FEATURE_COLORS[index % ADMIN_FEATURE_COLORS.length] }} />
                </div>
              </div>
            ))}
          </div>
          <p className="muted-copy" style={{ marginTop: 10 }}>All-time adoption: how far workspaces get after signing up.</p>
        </section>
      </div>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="Activity" title="Feature Usage by Time of Day" />
        <ActivityHeatmap heatmap={data.heatmap} />
      </section>
    </div>
  );
}

type AdminStorageDetail = {
  generatedAtMs: number;
  totals: { totalBytes: number; fileCount: number; avgFileBytes: number; uploaded30dBytes: number; uploaded30dCount: number; nearLimitCount: number };
  typeBytes: Record<string, number>;
  planBytes: Record<string, number>;
  topWorkspaces: { id: string; name: string; plan: string; bytes: number; files: number; limitMB: number; percent: number }[];
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

function AdminStorageDetail({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<AdminStorageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const callable = httpsCallable<Record<string, never>, AdminStorageDetail>(functions, "getAdminStorageDetail");
    callable({})
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
  }, []);

  const crumb = (
    <p className="muted-copy" style={{ margin: "0 0 4px" }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "#0a84ff", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
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

  const planSlices = ["demo", "lifetime_lite", "pro_monthly", "team_monthly"]
    .map(key => ({ label: ADMIN_PLAN_LABELS[key] || key, value: data.planBytes[key] || 0, color: ADMIN_PLAN_COLORS[key] || "#9ca3af" }))
    .filter(slice => slice.value > 0);

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        {crumb}
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Storage" />
        <p className="muted-copy">Client Files usage across all workspaces. {data.note}</p>
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
          <p className="muted-copy" style={{ marginTop: 8 }}>Values in MB.</p>
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Attention" title="Storage Warnings" />
          {data.nearLimit.length === 0 ? (
            <p className="muted-copy">No workspace is above 80% of its storage limit. ✓</p>
          ) : (
            <div style={{ display: "grid" }}>
              {data.nearLimit.map((workspace, index) => (
                <div key={workspace.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid rgba(17,24,39,0.07)" }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: workspace.percent >= 95 ? "#d92d20" : "#ff9f0a" }} />
                  <span style={{ fontSize: 13, fontWeight: 650, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workspace.name}</span>
                  <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{formatBytes(workspace.bytes)} / {workspace.limitMB >= 1024 ? `${workspace.limitMB / 1024} GB` : `${workspace.limitMB} MB`}</span>
                  <strong style={{ fontSize: 12.5, color: workspace.percent >= 95 ? "#d92d20" : "#b36b00" }}>{workspace.percent}%</strong>
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
                  <tr key={workspace.id} style={{ borderTop: "1px solid rgba(17,24,39,0.07)" }}>
                    <td style={{ padding: "7px 8px", color: "var(--muted)", fontWeight: 700 }}>{index + 1}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 700 }}>{workspace.name}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 800, color: ADMIN_PLAN_COLORS[workspace.plan] || "var(--text)" }}>{ADMIN_PLAN_LABELS[workspace.plan] || workspace.plan}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{workspace.files}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700 }}>{formatBytes(workspace.bytes)}</td>
                    <td style={{ padding: "7px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 7, borderRadius: 999, background: "rgba(17,24,39,0.08)", overflow: "hidden" }}>
                          <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${Math.min(workspace.percent, 100)}%`, background: workspace.percent >= 95 ? "#d92d20" : workspace.percent >= 80 ? "#ff9f0a" : "#0a84ff" }} />
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", minWidth: 42, textAlign: "right" }}>{workspace.percent}%</span>
                      </div>
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
                <div key={`${file.fileName}-${file.uploadedAtMs}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid rgba(17,24,39,0.07)" }}>
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
          <ActivityHeatmap heatmap={data.heatmap} />
        </section>
      </div>
    </div>
  );
}

type AdminLookupUser = { uid: string; email: string; displayName: string; createdAtMs: number; lastSignInMs: number };
type AdminLookupWorkspace = { id: string; name: string; ownerEmail: string; plan: string };

function AdminUserLookupDetail({ onBack }: { onBack: () => void }) {
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
      <button type="button" onClick={onBack} style={{ background: "none", border: 0, padding: 0, color: "#0a84ff", fontWeight: 700, cursor: "pointer" }}>Admin Insights</button>
      {" › "}User Lookup
    </p>
  );

  const dateText = (ms: unknown) => (typeof ms === "number" && ms > 0 ? new Date(ms).toLocaleString() : "—");

  const renderUserDetail = () => {
    const user = (detail?.user ?? {}) as Record<string, unknown>;
    const memberships = (detail?.memberships ?? []) as { companyId: string; name: string; plan: string; role: string }[];
    return (
      <>
        <div className="settings-mini-grid">
          <InfoTile label="Email" value={String(user.email || "—")} />
          <InfoTile label="Name" value={String(user.displayName || "—")} />
          <InfoTile label="Signed up" value={dateText(user.createdAtMs)} />
          <InfoTile label="Last sign-in" value={dateText(user.lastSignInMs)} />
          <InfoTile label="Support tickets" value={String(user.ticketsCreated ?? "—")} />
          <InfoTile label="Status" value={user.disabled ? "Disabled" : "Active"} />
        </div>
        <p className="muted-copy" style={{ margin: "12px 0 6px", fontWeight: 700 }}>Workspaces</p>
        {memberships.length === 0 ? (
          <p className="muted-copy">No workspace memberships found.</p>
        ) : (
          <div style={{ display: "grid" }}>
            {memberships.map((membership, index) => (
              <div key={membership.companyId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid rgba(17,24,39,0.07)" }}>
                <span style={{ fontSize: 13, fontWeight: 650, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{membership.name}</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: ADMIN_PLAN_COLORS[membership.plan] || "var(--muted)" }}>{ADMIN_PLAN_LABELS[membership.plan] || membership.plan}</span>
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{membership.role}</span>
                <button type="button" onClick={() => openDetail("workspace", membership.companyId)} style={{ background: "none", border: 0, padding: 0, color: "#0a84ff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
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
    return (
      <>
        <div className="settings-mini-grid">
          <InfoTile label="Workspace" value={String(workspace.name || "—")} />
          <InfoTile label="Owner" value={String(workspace.ownerEmail || "—")} />
          <InfoTile label="Plan" value={ADMIN_PLAN_LABELS[String(workspace.plan)] || String(workspace.plan || "—")} />
          <InfoTile label="Members" value={String(workspace.members ?? "—")} />
          <InfoTile label="Created" value={dateText(workspace.createdAtMs)} />
          <InfoTile label="Last order" value={dateText(workspace.lastOrderAtMs)} />
          <InfoTile label="Orders (total)" value={String(workspace.ordersTotal ?? "—")} />
          <InfoTile label="Orders (30d)" value={String(workspace.orders30d ?? "—")} />
          <InfoTile label="Customers" value={String(workspace.customersTotal ?? "—")} />
          <InfoTile label="Messages" value={String(workspace.messagesTotal ?? "—")} />
          <InfoTile label="Support tickets" value={String(workspace.supportTotal ?? "—")} />
          <InfoTile label="Files" value={String(workspace.storageFiles ?? "—")} />
        </div>
        <p className="muted-copy" style={{ margin: "12px 0 6px", fontWeight: 700 }}>Storage</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 9, borderRadius: 999, background: "rgba(17,24,39,0.08)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${Math.min(percent, 100)}%`, background: percent >= 95 ? "#d92d20" : percent >= 80 ? "#ff9f0a" : "#0a84ff" }} />
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>
            {formatBytes(Number(workspace.storageBytes || 0))} / {Number(workspace.storageLimitMB || 0) >= 1024 ? `${Number(workspace.storageLimitMB) / 1024} GB` : `${workspace.storageLimitMB} MB`} ({percent}%)
          </span>
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
        {error ? <p style={{ color: "var(--danger)", margin: "8px 0 0" }}>{error}</p> : null}
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
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: index === 0 ? "none" : "1px solid rgba(17,24,39,0.07)", background: "none", border: 0, cursor: "pointer", textAlign: "left", width: "100%", color: "var(--text)" }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email || user.uid}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{user.displayName || "—"} · last sign-in {user.lastSignInMs ? new Date(user.lastSignInMs).toLocaleDateString() : "never"}</div>
                    </div>
                    <span style={{ color: "#0a84ff", fontWeight: 800 }}>→</span>
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
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: index === 0 ? "none" : "1px solid rgba(17,24,39,0.07)", background: "none", border: 0, cursor: "pointer", textAlign: "left", width: "100%", color: "var(--text)" }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workspace.name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{workspace.ownerEmail || "—"}</div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: ADMIN_PLAN_COLORS[workspace.plan] || "var(--muted)" }}>{ADMIN_PLAN_LABELS[workspace.plan] || workspace.plan}</span>
                    <span style={{ color: "#0a84ff", fontWeight: 800 }}>→</span>
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
            <button type="button" onClick={() => { setDetailKind(null); setDetail(null); }} style={{ background: "none", border: 0, padding: 0, color: "#0a84ff", fontWeight: 700, cursor: "pointer" }}>← Results</button>
          </p>
          <CardTitle icon="dashboard" eyebrow={detailKind === "user" ? "User" : "Workspace"} title={detailKind === "user" ? "User Statistics" : "Workspace Statistics"} />
          {detailLoading ? <p className="muted-copy">Loading...</p> : detail ? (detailKind === "user" ? renderUserDetail() : renderWorkspaceDetail()) : null}
        </section>
      ) : null}
    </div>
  );
}

function AdminOverviewPanel() {
  const [data, setData] = useState<AdminInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const callable = httpsCallable<Record<string, never>, AdminInsights>(functions, "getAdminInsights");
    callable({})
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
  }, []);

  if (loading) {
    return (
      <div className="settings-card-stack">
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Admin Insights" />
          <p className="muted-copy">Loading insights...</p>
        </section>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="settings-card-stack">
        <section className="card app-card">
          <CardTitle icon="lock" eyebrow="NivaDesk admin" title="Admin Insights" />
          <p style={{ color: "var(--danger)", margin: 0 }}>{error || "No data."}</p>
        </section>
      </div>
    );
  }

  const planSlices = Object.entries(data.workspaces.planCounts)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({ label: ADMIN_PLAN_LABELS[key] || key, value, color: ADMIN_PLAN_COLORS[key] || "#9ca3af" }));

  const usageEntries: [string, number][] = [
    ["Orders (total)", data.usage.ordersTotal ?? 0],
    ["Orders this month", data.usage.ordersThisMonth ?? 0],
    ["Customers", data.usage.customersTotal ?? 0],
    ["Notes", data.usage.notesTotal ?? 0],
    ["Notes with reminders", data.usage.remindersTotal ?? 0],
    ["Messages", data.usage.messagesTotal ?? 0],
    ["Workspace tickets", data.usage.workspaceTicketsTotal ?? 0]
  ];

  const heartbeatText = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : "—");

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Admin Insights" />
        <p className="muted-copy">
          Live overview across all NivaDesk users and workspaces. Generated {new Date(data.generatedAtMs).toLocaleString()}.
        </p>
      </section>

      <div className="site-stats-grid">
        {adminKpiTile("Total Users", data.users.total.toLocaleString(), `+${data.users.new30d} in last 30 days`)}
        {adminKpiTile("Workspaces", data.workspaces.total.toLocaleString(), `+${data.workspaces.new30d} in last 30 days`)}
        {adminKpiTile("Active Workspaces", data.workspaces.active30d.toLocaleString(), "created an order in last 30 days")}
        {adminKpiTile("Paid Subscriptions", data.workspaces.paid.toLocaleString())}
        {adminKpiTile("Est. MRR", `£${data.revenue.mrr.toLocaleString()}`, "estimate — billing not live")}
        {adminKpiTile("Est. ARR", `£${data.revenue.arr.toLocaleString()}`, "estimate — billing not live")}
        {adminKpiTile("On Site Now", data.site.liveVisitors.toLocaleString(), `${data.site.today.sessions} visitors today`)}
        {adminKpiTile("In App Now", (data.site.appNow ?? 0).toLocaleString(), Object.entries(data.site.appPlatforms ?? {}).map(([key, value]) => `${key} ${value}`).join(" · ") || "web / mac / ios / android")}
      </div>

      <div className="site-stats-panels">
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Plans" title="Plan Distribution" />
          {planSlices.length ? <StatsDonut slices={planSlices} centerLabel="Workspaces" /> : <p className="muted-copy">No data yet.</p>}
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Usage" title="Feature Usage" />
          <StatsRankedList entries={usageEntries} />
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
            <InfoTile label="Open" value={(data.support.open ?? 0).toLocaleString()} />
            <InfoTile label="In progress" value={(data.support.inProgress ?? 0).toLocaleString()} />
            <InfoTile label="All time" value={(data.support.total ?? 0).toLocaleString()} />
          </div>
          <p className="muted-copy" style={{ marginTop: 10 }}>Reply to tickets from the Support / Tickets section.</p>
        </section>
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Workspaces" title="Newest Workspaces" />
          <div style={{ display: "grid" }}>
            {data.workspaces.newest.map((workspace, index) => (
              <div key={workspace.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid rgba(17,24,39,0.07)" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", width: 16 }}>{index + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{workspace.name}</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: ADMIN_PLAN_COLORS[workspace.plan] || "var(--muted)" }}>{ADMIN_PLAN_LABELS[workspace.plan] || workspace.plan}</span>
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
            <p className="muted-copy">All paid workspaces created an order in the last 30 days. ✓</p>
          ) : (
            <div style={{ display: "grid" }}>
              {data.attention.inactivePaidWorkspaces.map((workspace, index) => (
                <div key={workspace.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: index === 0 ? "none" : "1px solid rgba(17,24,39,0.07)" }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: "#ff9f0a" }} />
                  <span style={{ fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{workspace.name}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: ADMIN_PLAN_COLORS[workspace.plan] || "var(--muted)" }}>{ADMIN_PLAN_LABELS[workspace.plan] || workspace.plan}</span>
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



type AdminHubPage =
  | "overview"
  | "users"
  | "subscriptions"
  | "revenue"
  | "plans"
  | "features"
  | "storage"
  | "lookup"
  | "sitestats";

const ADMIN_HUB_PAGES: { id: AdminHubPage; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users & Workspaces" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "revenue", label: "Revenue" },
  { id: "plans", label: "Plans" },
  { id: "features", label: "Feature Usage" },
  { id: "storage", label: "Storage" },
  { id: "lookup", label: "User Lookup" },
  { id: "sitestats", label: "Global Statistics" }
];

export function AdminInsightsHub() {
  const [page, setPage] = useState<AdminHubPage>("overview");
  const goOverview = () => setPage("overview");

  return (
    <div className="admin-hub-grid">
      <aside className="admin-hub-sidebar">
        {ADMIN_HUB_PAGES.map(item => (
          <button
            key={item.id}
            type="button"
            className={page === item.id ? "admin-hub-link active" : "admin-hub-link"}
            onClick={() => setPage(item.id)}
          >
            {item.label}
          </button>
        ))}
      </aside>
      <div className="admin-hub-content">
        {page === "overview" ? <AdminOverviewPanel /> : null}
        {page === "users" ? <AdminUsersWorkspacesDetail onBack={goOverview} /> : null}
        {page === "subscriptions" ? <AdminSubscriptionsDetail onBack={goOverview} /> : null}
        {page === "revenue" ? <AdminRevenueDetail onBack={goOverview} /> : null}
        {page === "plans" ? <AdminPlansDetail onBack={goOverview} /> : null}
        {page === "features" ? <AdminFeatureUsageDetail onBack={goOverview} /> : null}
        {page === "storage" ? <AdminStorageDetail onBack={goOverview} /> : null}
        {page === "lookup" ? <AdminUserLookupDetail onBack={goOverview} /> : null}
        {page === "sitestats" ? <AdminSiteStatsSection /> : null}
      </div>
    </div>
  );
}

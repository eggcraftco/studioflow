"use client";

// Admin Insights ▸ one person (7 Nov 2026). Owner: "when we click a user, show the user's statistics — whatever
// should be visible — and make the page really useful". Opened from every list of people in Insights (Recent
// signups, User Lookup, Online time, Browsers). Data: callable getAdminUserStats (functions/adminUserStats.js).

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { CardTitle } from "@/components/CardTitle";
import { ActivityHeatmap, AdminLineChart, StatsDonut } from "@/components/AdminChart";
import { chartCount, chartDayLabel, chartDayTick } from "@/lib/studioflow/adminChartFormat";
import { BILLING_STATE_LABELS } from "@/lib/studioflow/adminInsightsMetrics";
import {
  ADMIN_USER_APP_LABELS,
  appShares,
  minutesText,
  providerLabel,
  shortUid,
  timeAgo,
  userSignals,
  type AdminUserStats
} from "@/lib/studioflow/adminUserStats";

const UK_DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });
const UK_DATE_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function when(ms: number | null | undefined, withTime = true) {
  if (!ms) return "—";
  return (withTime ? UK_DATE_TIME : UK_DATE).format(new Date(ms));
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="admin-index-tile">
      <span>{label}</span>
      <strong className="admin-user-tile-value">{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function counted(value: number | null) {
  return value === null ? "Not recorded" : chartCount(value);
}

export function AdminUserStatsPanel({ uid, onBack, backLabel, planLabel }: {
  uid: string;
  onBack: () => void;
  backLabel: string;
  planLabel: (plan: string) => string;
}) {
  const [data, setData] = useState<AdminUserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(null);
    const callable = httpsCallable<{ uid: string }, AdminUserStats>(functions, "getAdminUserStats");
    callable({ uid })
      .then(result => { if (!cancelled) { setData(result.data); setNow(Date.now()); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this person."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid]);

  const copyId = () => {
    try {
      void navigator.clipboard?.writeText(uid).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); });
    } catch {
      setCopied(false);
    }
  };

  const user = data?.user;
  const apps = data?.apps ?? null;
  const shares = appShares(apps?.byApp ?? {});
  const signals = data ? userSignals(data, now) : [];
  // Web sessions only (the native apps are in the table above); kinds other than a plain browser are named (AI browser …).
  const webBrowsers = (apps?.browsers ?? [])
    .filter(b => b.kind !== "app" && !String(b.family).startsWith("app_"))
    .map(b => `${String(b.family).charAt(0).toUpperCase()}${String(b.family).slice(1)}${b.major ? ` ${b.major}` : ""}${b.kind && !["browser", "human", "unclassified"].includes(b.kind) ? ` (${b.kind.replace(/_/g, " ")})` : ""}`);
  const lastSeen = Math.max(user?.lastActiveMs || 0, user?.lastSignInMs || 0, apps?.lastSeenMs || 0) || null;

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <p className="muted-copy" style={{ margin: "0 0 4px" }}>
          <button type="button" className="admin-user-back" onClick={onBack}>‹ {backLabel}</button>
        </p>
        <CardTitle icon="customer" eyebrow="Person" title={user ? user.displayName || user.email || shortUid(uid) : "Loading…"} />
        {user ? (
          <div className="admin-user-head">
            <span className="admin-user-email">{user.email || "No email"}</span>
            <button type="button" className="admin-user-id" onClick={copyId} title="Copy the user ID for support">{copied ? "Copied" : `ID ${shortUid(uid)}`}</button>
            {user.admin ? <span className="admin-user-chip">NivaDesk admin</span> : null}
            {user.staff ? <span className="admin-user-chip">Staff</span> : null}
            {user.disabled ? <span className="admin-user-chip is-bad">Disabled</span> : null}
            <span className={user.emailVerified ? "admin-user-chip is-good" : "admin-user-chip is-warn"}>{user.emailVerified ? "Email verified" : "Email not verified"}</span>
            {user.secondFactors ? <span className="admin-user-chip is-good">Two-step sign-in</span> : null}
            {user.providers.map(p => <span key={p} className="admin-user-chip">{providerLabel(p)}</span>)}
          </div>
        ) : null}
        {loading ? <p className="muted-copy" role="status">Loading this person&apos;s statistics…</p> : null}
        {error ? <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
        {signals.length ? (
          <ul className="admin-user-signals" aria-label="At a glance">
            {signals.map(signal => <li key={signal.text} className={`is-${signal.tone}`}>{signal.text}</li>)}
          </ul>
        ) : null}
      </section>

      {data && user ? (
        <>
          <div className="admin-index-tiles">
            <Tile label="Signed up" value={when(user.createdAtMs, false)} sub={timeAgo(user.createdAtMs, now)} />
            <Tile label="Last sign-in" value={when(user.lastSignInMs, false)} sub={timeAgo(user.lastSignInMs, now)} />
            <Tile label="Last seen" value={timeAgo(lastSeen, now)} sub={when(lastSeen)} />
            <Tile label="Time in the apps (7 days)" value={apps ? minutesText(apps.minutes) : "—"} sub={apps ? `${apps.activeHours} active hours` : "not readable"} />
            <Tile label="Active days (7 days)" value={apps ? `${apps.activeDays} / 7` : "—"} sub={apps ? `${chartCount(apps.sessions)} sessions` : undefined} />
            <Tile label="Workspaces" value={chartCount(data.workspaces.length)} sub={data.workspaces.filter(w => w.role === "owner").length ? "owns one" : "member only"} />
          </div>

          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Apps" title="Time in NivaDesk, last 7 days" />
            {apps ? (
              <>
                <AdminLineChart
                  title={`${user.displayName || user.email || "This person"}: minutes in the apps per day`}
                  height={170}
                  labels={apps.days.map(day => chartDayLabel(day.date))}
                  ticks={apps.days.map(day => chartDayTick(day.date))}
                  series={[{ key: "minutes", label: "Time in the apps", color: "#0a84ff", values: apps.days.map(day => day.minutes), format: minutesText, area: true }]}
                />
                <p className="admin-index-meta">One minute counts once even with two apps open. App time is kept for 8 days{apps.recordedSinceMs ? `; recorded since ${when(apps.recordedSinceMs)}` : ""}. Apps 2.3 and older do not say who is using them, so their time is not here.</p>
              </>
            ) : (
              <p className="muted-copy">App time could not be read.</p>
            )}
          </section>

          {apps ? (
            <div className="site-stats-panels admin-user-panels">
              <section className="card app-card">
                <CardTitle icon="dashboard" eyebrow="Apps" title="Which apps" />
                {shares.length ? (
                  <StatsDonut slices={shares.map(s => ({ label: s.label, value: s.minutes, color: s.color }))} centerLabel="In the apps" format={minutesText} centerFormat={m => (m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m` : `${Math.round(m)}m`)} />
                ) : (
                  <p className="muted-copy">No app time in the last 7 days.</p>
                )}
              </section>
              <section className="card app-card">
                <CardTitle icon="dashboard" eyebrow="Apps" title="When they work" />
                <ActivityHeatmap heatmap={apps.heatmap} caption="Hours with any activity in the apps, last 7 days, UK time." unit="active hours" />
              </section>
            </div>
          ) : null}

          {apps && apps.versions.length ? (
            <section className="card app-card">
              <CardTitle icon="dashboard" eyebrow="Apps" title="Devices and versions" />
              <div style={{ overflowX: "auto" }}>
                <table className="admin-search-table admin-index-table">
                  <thead><tr><th>App</th><th>Version</th><th>System</th><th className="num">Sessions</th><th>Last seen</th></tr></thead>
                  <tbody>
                    {apps.versions.map(v => (
                      <tr key={`${v.app}-${v.version}-${v.build}`}>
                        <td><strong>{ADMIN_USER_APP_LABELS[v.app] || v.app}</strong></td>
                        <td>{v.version ? `${v.version}${v.build ? ` (${v.build})` : ""}` : v.app === "web" ? "Browser" : "—"}</td>
                        <td>{v.os || "—"}</td>
                        <td className="num">{chartCount(v.sessions)}</td>
                        <td>{timeAgo(v.lastSeenMs, now)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {webBrowsers.length ? (
                <p className="admin-index-meta">Browsers on the web: {webBrowsers.join(", ")}</p>
              ) : null}
            </section>
          ) : null}

          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Business" title="Workspaces" />
            {data.workspacesError ? <p className="admin-index-warn">Workspaces could not be read.</p> : null}
            {data.workspaces.length === 0 && !data.workspacesError ? <p className="muted-copy">No workspace owned or joined.</p> : null}
            {data.workspaces.length ? (
              <div style={{ overflowX: "auto" }}>
                <table className="admin-search-table admin-index-table">
                  <thead><tr><th>Workspace</th><th>Role</th><th>Plan</th><th className="num">Members</th><th className="num">Orders</th><th>Created</th></tr></thead>
                  <tbody>
                    {data.workspaces.map(w => (
                      <tr key={w.companyId}>
                        <td>
                          <strong>{w.name}</strong>
                          {!w.exists ? <div className="admin-index-muted">Workspace record missing</div> : null}
                          {w.flagged ? <div className="admin-index-muted">Flagged {w.flagged}: left out of the business view</div> : null}
                        </td>
                        <td>{w.role}</td>
                        <td>{w.plan ? planLabel(w.plan) : "—"}{w.billingState ? <div className="admin-index-muted">{BILLING_STATE_LABELS[w.billingState] || w.billingState}</div> : null}</td>
                        <td className="num">{chartCount(w.members)}</td>
                        <td className="num">{counted(w.ordersTotal)}</td>
                        <td>{when(w.createdAtMs, false)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Business" title="Their work" />
            <div className="admin-index-tiles">
              <Tile label="Orders they created" value={counted(data.work.ordersCreated)} />
              <Tile label="Orders assigned to them" value={counted(data.work.ordersAssigned)} />
              <Tile label="Notes" value={counted(data.work.notes)} />
              <Tile label="Support tickets" value={counted(data.work.supportTickets)} />
            </div>
            <p className="admin-index-meta">All time, from what each record stores about who made it or who it is for; orders saved before a field existed are not in these counts. &ldquo;Not recorded&rdquo; = the count could not be read, not zero.</p>
          </section>
        </>
      ) : null}
    </div>
  );
}

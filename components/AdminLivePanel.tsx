"use client";

// Admin Insights ▸ Live (29 Oct 2026): who is in a NivaDesk app right now, from which app and which
// version, the last 24 hours and 7 days, and daily/weekly/monthly active accounts. Reads
// getSitePresence (admin-only on the server); the rules are functions insights/presence.js and the
// on-screen names lib/studioflow/adminLivePresence.ts. Nothing here names a person.

import { useCallback, useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { CardTitle } from "@/components/CardTitle";
import {
  PRESENCE_APPS,
  PLATFORM_LABELS,
  appBuckets,
  dayLabel,
  deviceLabel,
  downloadCsv,
  hourLabel,
  isLegacyPresence,
  peakOf,
  stickinessLabel,
  toCsv,
  versionLabel,
  type PresenceAnswer,
  type PresenceCounts
} from "@/lib/studioflow/adminLivePresence";

type AdminView = "business" | "qa";

const POLL_MS = 30000;
const HISTORY_MS = 5 * 60000;

type PresenceResponse = { ok: boolean; active: number; pages: { path: string; count: number }[]; app?: PresenceAnswer };

function useAppPresence(view: AdminView, withHistory: boolean) {
  const [live, setLive] = useState<PresenceAnswer | null>(null);
  const [history, setHistory] = useState<PresenceAnswer | null>(null);
  const [status, setStatus] = useState<"loading" | "live" | "stale">("loading");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(withHistory);
  const viewRef = useRef(view);
  viewRef.current = view;

  const pollLive = useCallback(async () => {
    const callable = httpsCallable<{ view: AdminView }, PresenceResponse>(functions, "getSitePresence");
    try {
      const result = await callable({ view: viewRef.current });
      setLive(result.data?.app ?? {});
      setUpdatedAt(Date.now());
      setStatus("live");
      setError("");
    } catch (err) {
      setStatus("stale");
      setError(err instanceof Error ? err.message : "Could not reach the presence service.");
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (!withHistory) return;
    setHistoryLoading(true);
    const callable = httpsCallable<{ view: AdminView; history: true }, PresenceResponse>(functions, "getSitePresence");
    try {
      const result = await callable({ view: viewRef.current, history: true });
      const app = result.data?.app ?? {};
      setHistory(app);
      setLive(app);
      setUpdatedAt(Date.now());
      setStatus("live");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the presence history.");
    } finally {
      setHistoryLoading(false);
    }
  }, [withHistory]);

  useEffect(() => {
    setStatus("loading");
    setLive(null);
    setHistory(null);
    if (withHistory) void loadHistory();
    else void pollLive();
    // Polls only while the tab is visible, and catches up at once when it comes back.
    const tick = () => { if (document.visibilityState === "visible") void pollLive(); };
    const liveTimer = window.setInterval(tick, POLL_MS);
    const historyTimer = withHistory ? window.setInterval(() => { if (document.visibilityState === "visible") void loadHistory(); }, HISTORY_MS) : 0;
    const onVisible = () => { if (document.visibilityState === "visible") void pollLive(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(liveTimer);
      if (historyTimer) window.clearInterval(historyTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [view, withHistory, pollLive, loadHistory]);

  const refresh = useCallback(() => (withHistory ? loadHistory() : pollLive()), [withHistory, loadHistory, pollLive]);
  return { live, history, status, error, updatedAt, historyLoading, refresh };
}

export function LiveStatusPill({ status, updatedAt }: { status: "loading" | "live" | "stale"; updatedAt: number | null }) {
  const label = status === "live" ? "Live" : status === "stale" ? "Not updating" : "Connecting";
  return (
    <span className={`admin-status-pill is-${status}`} role="status" aria-live="polite">
      <span className="admin-status-dot" aria-hidden="true" />
      {label}
      {updatedAt ? <span className="admin-status-time">· {new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> : null}
    </span>
  );
}

/** Stacked columns per app; one column per bucket. HTML, not SVG, so labels keep their real size at any width. */
function PresenceColumns({ series, labelOf, title, tickEvery = 1, wrapLabels = false }: {
  series: (PresenceCounts & { key: string })[];
  labelOf: (index: number) => string;
  title: string;
  tickEvery?: number;
  wrapLabels?: boolean;
}) {
  const max = Math.max(1, ...series.map(item => item.people));
  const peak = peakOf(series);
  const summary = peak ? `${title}: busiest ${labelOf(series.indexOf(peak))} with ${peak.people}.` : `${title}: nothing recorded yet.`;
  return (
    <div className="admin-columns" role="img" aria-label={summary}>
      <div className="admin-columns-plot">
        <span className="admin-columns-scale" aria-hidden="true">{max}</span>
        {series.map((item, index) => {
          const apps = appBuckets(item);
          // Apps can add up to more than the total (one member on two apps), so each app's share of
          // the column is scaled to the column's own total.
          const sum = PRESENCE_APPS.reduce((acc, app) => acc + apps[app.key].people, 0) || 1;
          const label = `${labelOf(index)} — ${item.people} ${item.people === 1 ? "person" : "people"}${item.unidentified ? ` (${item.unidentified} unidentified)` : ""}`;
          return (
            <div key={item.key} className="admin-columns-col" title={label}>
              <div className="admin-columns-stack" style={{ height: `${(item.people / max) * 100}%` }}>
                {PRESENCE_APPS.map(app => {
                  const value = apps[app.key].people;
                  return value ? <span key={app.key} style={{ flexGrow: value / sum, background: app.color }} /> : null;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className={wrapLabels ? "admin-columns-labels is-wrap" : "admin-columns-labels"} aria-hidden="true">
        {series.map((item, index) => (
          <span key={item.key}>{index % tickEvery === 0 || index === series.length - 1 ? labelOf(index) : ""}</span>
        ))}
      </div>
    </div>
  );
}

function AppLegend() {
  return (
    <div className="admin-legend" aria-hidden="true">
      {PRESENCE_APPS.map(app => (
        <span key={app.key}><i style={{ background: app.color }} />{app.label}</span>
      ))}
    </div>
  );
}

export function AdminLivePanel({ view }: { view: AdminView }) {
  const { live, history, status, error, updatedAt, historyLoading, refresh } = useAppPresence(view, true);
  const legacy = isLegacyPresence(live);
  const now = live?.live;
  const apps = appBuckets(now);
  const appMax = Math.max(1, ...PRESENCE_APPS.map(app => apps[app.key].people));
  const hist = history?.history;
  const engagement = history?.engagement;

  const exportHistory = () => {
    if (!hist) return;
    const header = ["bucket", "start", "people", "signed_in_members", "unidentified_sessions", "sessions", ...PRESENCE_APPS.map(app => `people_${app.key}`)];
    const rows = [
      ...hist.hourly.map(h => { const a = appBuckets(h); return ["hour", new Date(h.startMs).toISOString(), h.people, h.members, h.unidentified, h.sessions, ...PRESENCE_APPS.map(app => a[app.key].people)]; }),
      ...hist.daily.map(d => { const a = appBuckets(d); return ["uk_day", d.date, d.people, d.members, d.unidentified, d.sessions, ...PRESENCE_APPS.map(app => a[app.key].people)]; })
    ];
    downloadCsv(`nivadesk-live-${view}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(header, rows));
  };

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <div className="admin-page-head">
          <CardTitle icon="team" eyebrow="NivaDesk admin" title="Live — people in the apps" />
          <div className="admin-page-actions">
            <LiveStatusPill status={status} updatedAt={updatedAt} />
            <button type="button" className="button secondary admin-small-button" onClick={() => void refresh()} disabled={historyLoading}>
              {historyLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <p className="muted-copy" style={{ marginTop: 8 }}>
          Signed-in sessions seen in the last 2 minutes across the web app, iPhone, iPad, Mac and Android. Updates every 30 seconds while this tab is open; the history refreshes every 5 minutes.
        </p>
        {error ? <p className="admin-error" role="alert">{error}</p> : null}
        {legacy ? (
          <p className="admin-note is-warning">
            The server is still on the previous version: only the raw session count per platform is available. Member counts, iPhone/iPad, app versions and history appear once the Insights functions are deployed.
          </p>
        ) : null}
      </section>

      <div className="admin-live-top">
        <section className="card app-card admin-live-hero" aria-labelledby="admin-live-now">
          <span className="admin-kpi-label" id="admin-live-now">In the apps now</span>
          <strong className="admin-live-number">{status === "loading" ? "…" : legacy ? (live?.active ?? 0) : (now?.people ?? 0)}</strong>
          {now ? (
            <span className="admin-kpi-hint">
              {now.members} signed-in {now.members === 1 ? "member" : "members"}
              {now.unidentified ? ` + ${now.unidentified} ${now.unidentified === 1 ? "session" : "sessions"} from older apps that do not say who they are` : ""}
              {` · ${now.sessions} ${now.sessions === 1 ? "session" : "sessions"}`}
            </span>
          ) : legacy ? (
            <span className="admin-kpi-hint">sessions (staff and test accounts included)</span>
          ) : null}
          {now && view === "business" && now.hiddenSessions > 0 ? (
            <span className="admin-kpi-hint">Business view leaves out {now.hiddenSessions} {now.hiddenSessions === 1 ? "session" : "sessions"} of NivaDesk staff or flagged test workspaces.</span>
          ) : null}
        </section>

        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Right now" title="By app" />
          <div className="admin-app-rows">
            {PRESENCE_APPS.map(app => {
              const bucket = apps[app.key];
              if (app.key === "ios_unknown" && !bucket.people && !legacy) return null;
              const legacyCount = legacy ? Number(live?.platforms?.[app.key === "ios_unknown" ? "ios" : app.key] || 0) : 0;
              const value = legacy ? legacyCount : bucket.people;
              const barMax = legacy ? Math.max(1, ...Object.values(live?.platforms ?? {}).map(Number)) : appMax;
              if (legacy && (app.key === "ios" || app.key === "ipados")) return null;
              return (
                <div key={app.key} className="admin-app-row">
                  <span className="admin-app-name"><i style={{ background: app.color }} aria-hidden="true" />{app.label}</span>
                  <span className="admin-app-bar" aria-hidden="true"><span style={{ width: `${(value / barMax) * 100}%`, background: app.color }} /></span>
                  <strong className="admin-app-value">{value}</strong>
                </div>
              );
            })}
          </div>
          <p className="muted-copy admin-footnote">A member using two apps at once appears under both, so the rows can add up to more than the total.</p>
        </section>
      </div>

      <div className="site-stats-panels">
        <section className="card app-card">
          <div className="admin-card-head">
            <CardTitle icon="historyClock" eyebrow="History" title="Last 24 hours" />
            <button type="button" className="button secondary admin-small-button" onClick={exportHistory} disabled={!hist}>Export CSV</button>
          </div>
          {hist ? (
            <>
              <PresenceColumns
                title="People per hour"
                series={hist.hourly.map(h => ({ ...h, key: h.hour }))}
                labelOf={index => hourLabel(hist.hourly[index].startMs)}
                tickEvery={6}
              />
              <AppLegend />
              <p className="muted-copy admin-footnote">
                People active at any point in each hour (local time).{" "}
                {(() => { const peak = peakOf(hist.hourly); return peak ? `Busiest: ${hourLabel(peak.startMs)} with ${peak.people}.` : "Nothing recorded in the last 24 hours."; })()}
              </p>
            </>
          ) : (
            <p className="muted-copy">{legacy ? "Available after the server update." : historyLoading ? "Loading…" : "No history yet."}</p>
          )}
        </section>

        <section className="card app-card">
          <CardTitle icon="calendar" eyebrow="History" title="Last 7 days" />
          {hist ? (
            <>
              <PresenceColumns title="People per day" series={hist.daily.map(d => ({ ...d, key: d.date }))} labelOf={index => dayLabel(hist.daily[index].date)} wrapLabels />
              <AppLegend />
              <p className="muted-copy admin-footnote">
                People active on each UK calendar day.
                {hist.recordedSinceMs && hist.recordedSinceMs > Date.now() - 7 * 86400000
                  ? ` Recording started ${new Date(hist.recordedSinceMs).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}, so earlier days are empty, not quiet.`
                  : ""}
                {hist.truncated ? " Only the most recent 5,000 sessions were read." : ""}
              </p>
            </>
          ) : (
            <p className="muted-copy">{legacy ? "Available after the server update." : historyLoading ? "Loading…" : "No history yet."}</p>
          )}
        </section>

        <section className="card app-card">
          <CardTitle icon="team" eyebrow="Engagement" title="Active accounts" />
          {engagement && !engagement.error ? (
            <>
              <div className="admin-tile-grid">
                <div className="admin-tile"><span>Daily (24 h)</span><strong>{engagement.dau.toLocaleString()}</strong></div>
                <div className="admin-tile"><span>Weekly (7 days)</span><strong>{engagement.wau.toLocaleString()}</strong></div>
                <div className="admin-tile"><span>Monthly (30 days)</span><strong>{engagement.mau.toLocaleString()}</strong></div>
                <div className="admin-tile"><span>DAU / MAU</span><strong>{stickinessLabel(engagement.stickiness)}</strong></div>
              </div>
              <p className="muted-copy admin-footnote">
                Accounts whose sign-in was refreshed in each rolling window — any app, any version (Firebase Auth; an open app refreshes it about hourly). {engagement.accounts.toLocaleString()} accounts counted
                {engagement.neverActive ? `, ${engagement.neverActive} never active` : ""}
                {view === "business" && engagement.hiddenAccounts ? `; ${engagement.hiddenAccounts} staff or test accounts left out` : ""}.
              </p>
            </>
          ) : engagement?.error ? (
            <p className="admin-error" role="alert">Firebase Auth could not be read, so active accounts are unknown (not zero).</p>
          ) : (
            <p className="muted-copy">{legacy ? "Available after the server update." : historyLoading ? "Loading…" : "—"}</p>
          )}
        </section>

        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Right now" title="App versions" />
          {now && now.versions.length ? (
            <table className="admin-search-table admin-compact-table">
              <thead><tr><th scope="col">App</th><th scope="col">Version</th><th scope="col" className="is-number">Sessions</th></tr></thead>
              <tbody>
                {now.versions.map(row => (
                  <tr key={`${row.platform}|${row.appVersion}|${row.appBuild}`}>
                    <td>{PLATFORM_LABELS[row.platform] || row.platform}</td>
                    <td>{versionLabel(row.platform, row.appVersion, row.appBuild)}</td>
                    <td className="is-number">{row.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted-copy">{legacy ? "Available after the server update." : "No one is in an app right now."}</p>
          )}
          <p className="muted-copy admin-footnote">Apple apps report their build even when older (2.3 = build 33). Android and the iPhone/iPad split need app 2.4.</p>
        </section>

        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Right now" title="Devices and systems" />
          {now && (now.devices.length || now.systems.length) ? (
            <div className="admin-two-lists">
              <ul className="admin-plain-list">
                {now.devices.map(row => <li key={row.device}><span>{deviceLabel(row.device)}</span><strong>{row.sessions}</strong></li>)}
              </ul>
              <ul className="admin-plain-list">
                {now.systems.filter(row => row.os || row.browser).map(row => (
                  <li key={`${row.platform}|${row.os}|${row.browser}`}>
                    <span>{[PLATFORM_LABELS[row.platform] || row.platform, row.os, row.browser].filter(Boolean).join(" · ")}</span>
                    <strong>{row.sessions}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="muted-copy">{legacy ? "Available after the server update." : "No one is in an app right now."}</p>
          )}
        </section>

        <section className="card app-card">
          <CardTitle icon="warningTriangle" eyebrow="Honest limits" title="What this cannot see" />
          <ul className="admin-limits">
            <li>Apps released before 2.4 do not say who is signed in or whether it is an iPhone or an iPad: each of their sessions counts as one person and cannot be left out as staff or test.</li>
            <li>The web app counts a tab only while it is visible; each open tab is its own session (one signed-in member still counts once).</li>
            <li>Presence is kept for {live?.retentionDays ?? 8} days and then deleted; the 7-day history cannot go further back.</li>
            <li>Nothing here names a person. Use User Lookup for one account.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Small live figure for the Overview: people in the apps now, per app, from the same callable. */
export function useLiveAppNow(view: AdminView) {
  const { live, status } = useAppPresence(view, false);
  return { live, status };
}

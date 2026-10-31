"use client";

// Admin Insights ▸ Online time (31 Oct 2026, owner: "which user is online how long — a top list"): who
// spent how long in the NivaDesk apps today, yesterday or over the last 7 UK days, longest first, with
// workspace, last seen and the split per app. Reads getSitePresence's `leaderboard` answer (admins only
// on the server); the counting is functions insights/presence.js leaderboardSummary and the on-screen
// names lib/studioflow/adminOnlineTime.ts. This is the one Insights page that names people.

import { useCallback, useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { CardTitle } from "@/components/CardTitle";
import { LiveStatusPill } from "@/components/AdminLivePanel";
import { deviceLabel } from "@/lib/studioflow/adminLivePresence";
import {
  ONLINE_PERIODS,
  appSplit,
  appSplitLabel,
  barPercent,
  coverage,
  durationLabel,
  internalLabel,
  isLegacyLeaderboard,
  isOnlineNow,
  lastSeenLabel,
  periodRangeLabel,
  personLabel,
  type OnlineLeaderboard,
  type OnlinePerson,
  type OnlinePeriod
} from "@/lib/studioflow/adminOnlineTime";

type AdminView = "business" | "qa";

// Today refreshes every 2 minutes; the last 7 days every 5 (it reads a week of sessions, like Live's history).
const POLL_MS: Record<OnlinePeriod, number> = { today: 2 * 60000, yesterday: 0, "7d": 5 * 60000 };

type LeaderboardResponse = { ok: boolean; app?: { leaderboard?: OnlineLeaderboard } };

function useOnlineLeaderboard(view: AdminView, period: OnlinePeriod) {
  const [board, setBoard] = useState<OnlineLeaderboard | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [status, setStatus] = useState<"loading" | "live" | "stale">("loading");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    const callable = httpsCallable<{ view: AdminView; leaderboard: { period: OnlinePeriod } }, LeaderboardResponse>(functions, "getSitePresence");
    try {
      const result = await callable({ view, leaderboard: { period } });
      if (id !== request.current) return;
      const app = result.data?.app ?? {};
      setLegacy(isLegacyLeaderboard(app));
      setBoard(app.leaderboard ?? null);
      setUpdatedAt(Date.now());
      setStatus("live");
      setError("");
    } catch (err) {
      if (id !== request.current) return;
      setStatus("stale");
      setError(err instanceof Error ? err.message : "Could not load online time.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [view, period]);

  useEffect(() => {
    setStatus("loading");
    setBoard(null);
    void load();
    // Yesterday does not change; today and the last 7 days refresh while the tab is visible.
    if (!POLL_MS[period]) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS[period]);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [period, load]);

  return { board, legacy, status, error, updatedAt, loading, refresh: load };
}

function AppStack({ person, percent }: { person: Pick<OnlinePerson, "byApp">; percent: number }) {
  const apps = appSplit(person.byApp);
  // Apps can add up to more than the person's total (two at once), so each app's share is scaled to their sum.
  const sum = apps.reduce((acc, app) => acc + app.minutes, 0) || 1;
  return (
    <span className="admin-app-bar admin-online-bar" aria-hidden="true">
      <span className="admin-online-bar-fill" style={{ width: `${percent}%` }}>
        {apps.length
          ? apps.map(app => <span key={app.key} style={{ flexGrow: app.minutes / sum, background: app.color }} />)
          : <span style={{ flexGrow: 1, background: "var(--muted)", opacity: 0.45 }} />}
      </span>
    </span>
  );
}

function PersonRow({ person, rank, percent, now, byHours }: { person: OnlinePerson; rank: number; percent: number; now: number; byHours: boolean }) {
  const internal = internalLabel(person);
  const split = appSplitLabel(person.byApp);
  const devices = person.devices.map(d => (d.sessions > 1 ? `${deviceLabel(d.device)} ×${d.sessions}` : deviceLabel(d.device))).join(", ");
  const online = isOnlineNow(person.lastSeenMs, now);
  return (
    <li className="admin-online-row">
      <span className="admin-online-rank" aria-label={`Rank ${rank}`}>{rank}</span>
      <div className="admin-online-who">
        <strong className="admin-online-name" title={person.uid}>{personLabel(person)}</strong>
        <span className="admin-online-sub">
          {[person.email && person.name ? person.name : "", person.workspace || (person.workspaceId ? "Workspace without a name" : "No workspace")].filter(Boolean).join(" · ")}
        </span>
        {internal ? <span className="admin-online-badge">{internal}</span> : null}
      </div>
      <div className="admin-online-time">
        <strong>{byHours ? "—" : durationLabel(person.minutes)}</strong>
        <AppStack person={person} percent={percent} />
        <span className="admin-online-apps">{split || (byHours ? "Minutes not recorded yet" : "No minutes in this period")}</span>
      </div>
      <div className="admin-online-meta">
        <span><b>{person.activeHours}</b> active {person.activeHours === 1 ? "hour" : "hours"}</span>
        <span className={online ? "admin-online-seen is-now" : "admin-online-seen"}>
          {online ? <i aria-hidden="true" /> : null}
          {lastSeenLabel(person.lastSeenMs, now)}
        </span>
        <span className="admin-online-devices">{devices}</span>
      </div>
    </li>
  );
}

export function AdminOnlineTimePanel({ view, onViewChange }: { view: AdminView; onViewChange: (view: AdminView) => void }) {
  const [period, setPeriod] = useState<OnlinePeriod>("today");
  const { board, legacy, status, error, updatedAt, loading, refresh } = useOnlineLeaderboard(view, period);
  const now = updatedAt ?? Date.now();
  const cover = board ? coverage(board) : "full";
  const byHours = cover === "none";
  const people = board?.people ?? [];
  const unidentified = board?.unidentified;

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <div className="admin-page-head">
          <CardTitle icon="historyClock" eyebrow="NivaDesk admin" title="Online time — who spends longest in the apps" />
          <div className="admin-page-actions">
            <LiveStatusPill status={status} updatedAt={updatedAt} />
            <button type="button" className="button secondary admin-small-button" onClick={() => void refresh()} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="admin-online-controls">
          <div className="admin-segmented" role="group" aria-label="Period">
            {ONLINE_PERIODS.map(item => (
              <button key={item.key} type="button" aria-pressed={period === item.key} className={period === item.key ? "is-active" : ""} onClick={() => setPeriod(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
          <label className="admin-online-check" title="NivaDesk staff, and members of workspaces flagged internal / QA / pilot">
            <input type="checkbox" checked={view === "business"} onChange={event => onViewChange(event.target.checked ? "business" : "qa")} />
            Hide internal accounts
          </label>
        </div>
        <p className="muted-copy" style={{ marginTop: 8 }}>
          Time with a NivaDesk app open — the web tab visible, or the app in front — across all of a person&apos;s devices, counted in 2-minute steps; two devices at the same time count once. UK days. Admins only: this page names people.
        </p>
        {error ? <p className="admin-error" role="alert">{error}</p> : null}
        {legacy ? (
          <p className="admin-note is-warning">
            The server is still on the previous version, so there is no list yet. It appears once the Insights functions are deployed (getSitePresence for the list, recordSiteVisit for the minutes).
          </p>
        ) : null}
        {board && cover === "none" ? (
          <p className="admin-note is-warning">
            Minutes are not being recorded yet (recordSiteVisit update pending), so the list is ranked by active hours — the clock hours in which each person was seen at all.
          </p>
        ) : null}
        {board && cover === "partial" && board.recordedSinceMs ? (
          <p className="admin-note">
            Minutes are counted from {new Date(board.recordedSinceMs).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}; earlier in this period only active hours exist.
          </p>
        ) : null}
      </section>

      <div className="admin-tile-grid admin-online-tiles">
        <div className="admin-tile"><span>People</span><strong>{board ? board.totalPeople.toLocaleString() : "…"}</strong></div>
        <div className="admin-tile"><span>Their time together</span><strong>{board ? (byHours ? "—" : durationLabel(board.totalMinutes)) : "…"}</strong></div>
        <div className="admin-tile">
          <span>Older apps, not identified</span>
          <strong>{board ? (byHours ? "—" : durationLabel(unidentified?.minutes ?? 0)) : "…"}</strong>
        </div>
        <div className="admin-tile">
          <span>{view === "business" ? "Internal accounts hidden" : "Internal accounts shown"}</span>
          <strong>{board ? (view === "business" ? board.hidden.people.toLocaleString() : people.filter(p => p.internal).length.toLocaleString()) : "…"}</strong>
        </div>
      </div>

      <section className="card app-card">
        <div className="admin-card-head">
          <CardTitle icon="team" eyebrow={board ? periodRangeLabel(board) : "Online time"} title="Top list" />
          {board && board.totalPeople > people.length ? <span className="admin-generated">Top {people.length} of {board.totalPeople}</span> : null}
        </div>
        {board && people.length ? (
          <ol className="admin-online-list" aria-label="People by online time, longest first">
            {people.map((person, index) => (
              <PersonRow key={person.uid} person={person} rank={index + 1} percent={barPercent(person, people, byHours)} now={now} byHours={byHours} />
            ))}
          </ol>
        ) : (
          <p className="muted-copy" style={{ marginTop: 10 }}>
            {legacy ? "Available after the server update." : loading && !board ? "Loading…" : board ? "No signed-in member was in an app in this period." : "—"}
          </p>
        )}

        {unidentified && unidentified.sessions > 0 ? (
          <div className="admin-online-row is-unidentified" role="group" aria-label="Older apps that do not say who is signed in">
            <span className="admin-online-rank" aria-hidden="true">?</span>
            <div className="admin-online-who">
              <strong className="admin-online-name">Older apps (2.3 and earlier)</strong>
              <span className="admin-online-sub">{unidentified.sessions} {unidentified.sessions === 1 ? "session" : "sessions"} that do not say who is signed in — not shared out to people, and staff or test use cannot be left out of it</span>
            </div>
            <div className="admin-online-time">
              <strong>{byHours ? "—" : durationLabel(unidentified.minutes)}</strong>
              <span className="admin-online-apps">{appSplitLabel(unidentified.byApp) || "—"} · session time (added up per session)</span>
            </div>
            <div className="admin-online-meta">
              <span><b>{unidentified.activeHours}</b> active {unidentified.activeHours === 1 ? "hour" : "hours"}</span>
              <span className="admin-online-seen">{lastSeenLabel(unidentified.lastSeenMs, now)}</span>
            </div>
          </div>
        ) : null}

        {board ? (
          <p className="muted-copy admin-footnote">
            {view === "business" && board.hidden.people
              ? `Hidden: ${board.hidden.people} internal ${board.hidden.people === 1 ? "account" : "accounts"} with ${durationLabel(board.hidden.minutes)}. `
              : ""}
            Per-app times can add up to more than a person&apos;s total when two apps were open at once. Active hours = clock hours with any activity.
            {board.accountsReadable === false ? " Firebase Auth could not be read, so addresses are missing (not deleted)." : ""}
            {board.workspacesReadable === false ? " Workspaces could not be read." : ""}
            {board.truncated ? " Only the most recent 5,000 sessions were read." : ""}
          </p>
        ) : null}
      </section>

      <section className="card app-card">
        <CardTitle icon="warningTriangle" eyebrow="Honest limits" title="What this cannot see" />
        <ul className="admin-limits">
          <li>Apps released before 2.4 do not say who is signed in: their time is the separate &ldquo;Older apps&rdquo; total. The Mac and iPhone apps 2.3 and older also count time in the background, so a Mac app left open counts all day.</li>
          <li>The web app counts a tab only while it is visible. Each 2-minute step with a heartbeat counts in full, so a visit is rounded up to the next 2 minutes.</li>
          <li>Sessions are kept for {board?.retentionDays ?? 8} days, so 7 days is the longest period. A longer view needs a daily total per person (not built).</li>
          <li>Ranked by minutes, then active hours, then most recently seen.</li>
        </ul>
      </section>
    </div>
  );
}

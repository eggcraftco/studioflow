"use client";

// Admin Insights ▸ Browsers (1 Nov 2026, owner: "show which browser users connect with, so we see whether they use AI
// browsers or normal ones"): for today, yesterday or the last 7 UK days — sessions and people per kind (AI browser,
// AI agent, normal browser, can't tell, bot, NivaDesk app), per browser and version, every member with the browsers
// they used (filter: AI only), and the anonymous public-website visits of the same days. Reads getSitePresence's
// `browsers` answer (admins only on the server); the labels are decided there (functions insights/browser.js) and
// named here by lib/studioflow/adminBrowsers.ts. Like Online time, this page names people.

import { useCallback, useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { CardTitle } from "@/components/CardTitle";
import { LiveStatusPill } from "@/components/AdminLivePanel";
import { BrowserKindBadge, KindBars } from "@/components/AdminBrowserKinds";
import { ONLINE_PERIODS, internalLabel, lastSeenLabel, periodRangeLabel, personLabel, type OnlinePeriod } from "@/lib/studioflow/adminOnlineTime";
import {
  BROWSER_FILTERS,
  browserLabel,
  counterRows,
  familyOrder,
  filterPeople,
  isAiKind,
  isLegacyBrowsers,
  kindRows,
  labelsStartInside,
  shareLabel,
  siteKindRows,
  sortedBrowsers,
  versionsLabel,
  type BrowserFilter,
  type BrowsersAnswer
} from "@/lib/studioflow/adminBrowsers";

type AdminView = "business" | "qa";

const POLL_MS: Record<OnlinePeriod, number> = { today: 2 * 60000, yesterday: 0, "7d": 5 * 60000 };

type BrowsersResponse = { ok: boolean; app?: { browsers?: BrowsersAnswer } };

function useBrowsers(view: AdminView, period: OnlinePeriod) {
  const [answer, setAnswer] = useState<BrowsersAnswer | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [status, setStatus] = useState<"loading" | "live" | "stale">("loading");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    const callable = httpsCallable<{ view: AdminView; browsers: { period: OnlinePeriod } }, BrowsersResponse>(functions, "getSitePresence");
    try {
      const result = await callable({ view, browsers: { period } });
      if (id !== request.current) return;
      const app = result.data?.app ?? {};
      setLegacy(isLegacyBrowsers(app));
      setAnswer(app.browsers ?? null);
      setUpdatedAt(Date.now());
      setStatus("live");
      setError("");
    } catch (err) {
      if (id !== request.current) return;
      setStatus("stale");
      setError(err instanceof Error ? err.message : "Could not load browsers.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [view, period]);

  useEffect(() => {
    setStatus("loading");
    setAnswer(null);
    void load();
    if (!POLL_MS[period]) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS[period]);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [period, load]);

  return { answer, legacy, status, error, updatedAt, loading, refresh: load };
}

export function AdminBrowsersPanel({ view, onViewChange, onOpenUser }: { view: AdminView; onViewChange: (view: AdminView) => void; onOpenUser?: (uid: string) => void }) {
  const [period, setPeriod] = useState<OnlinePeriod>("7d");
  const [filter, setFilter] = useState<BrowserFilter>("all");
  const [query, setQuery] = useState("");
  const { answer, legacy, status, error, updatedAt, loading, refresh } = useBrowsers(view, period);
  const now = updatedAt ?? Date.now();
  const kinds = kindRows(answer?.kinds);
  const aiKinds = kinds.filter(row => isAiKind(row.key));
  const aiSessions = aiKinds.reduce((sum, row) => sum + row.sessions, 0);
  const families = [...(answer?.families ?? [])].sort(familyOrder);
  const people = filterPeople(answer?.list ?? [], filter, query);
  const siteKinds = siteKindRows(answer?.site);
  const siteBrowsers = counterRows(answer?.site?.browsers, 10);
  const siteAgents = counterRows(answer?.site?.agents, 10);

  return (
    <div className="settings-card-stack">
      <section className="card app-card">
        <div className="admin-page-head">
          <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Browsers — AI browsers or normal ones" />
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
          What each signed-in session connected with — web browser and version, or a NivaDesk app — decided on the server from the request itself (user agent, the browser&apos;s client hints, a signed agent&apos;s signature). UK days. Admins only: this page names people.
        </p>
        {error ? <p className="admin-error" role="alert">{error}</p> : null}
        {legacy ? (
          <p className="admin-note is-warning">
            The server is still on the previous version, so there is no browser summary yet. It appears once the Insights functions are deployed (getSitePresence for this page, recordSiteVisit for the labels).
          </p>
        ) : null}
        {answer && labelsStartInside(answer) ? (
          <p className="admin-note">
            {answer.recordedSinceMs
              ? `Browser labels are recorded from ${new Date(answer.recordedSinceMs).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}; web sessions before that show as “Not checked”.`
              : "No web session has a browser label yet (recordSiteVisit update pending, or no web visits since): web sessions show as “Not checked”."}
          </p>
        ) : null}
      </section>

      <div className="admin-tile-grid admin-online-tiles">
        <div className="admin-tile"><span>People</span><strong>{answer ? answer.totalPeople.toLocaleString() : "…"}</strong></div>
        <div className="admin-tile"><span>Used an AI browser or agent</span><strong>{answer ? answer.aiPeople.toLocaleString() : "…"}</strong></div>
        <div className="admin-tile"><span>Sessions</span><strong>{answer ? answer.sessions.toLocaleString() : "…"}</strong></div>
        <div className="admin-tile"><span>AI share of sessions</span><strong>{answer ? shareLabel(aiSessions, answer.sessions) : "…"}</strong></div>
      </div>

      <section className="card app-card">
        <CardTitle icon="team" eyebrow={answer ? periodRangeLabel(answer) : "Browsers"} title="By kind" />
        {answer && kinds.length ? (
          <KindBars unit={["session", "sessions"]} rows={kinds.map(row => ({ ...row, value: row.sessions, people: row.people }))} />
        ) : (
          <p className="muted-copy" style={{ marginTop: 10 }}>{legacy ? "Available after the server update." : loading && !answer ? "Loading…" : "No sessions in this period."}</p>
        )}
        <p className="muted-copy admin-footnote">
          Share = share of sessions. A person who used two kinds counts under both, so people can add up to more than the total.
          {answer && view === "business" && answer.hidden.people ? ` Hidden: ${answer.hidden.people} internal ${answer.hidden.people === 1 ? "account" : "accounts"}.` : ""}
        </p>
      </section>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow={answer ? periodRangeLabel(answer) : "Browsers"} title="By browser" />
        {answer && families.length ? (
          <div className="admin-table-scroll">
            <table className="admin-search-table admin-compact-table admin-browser-table">
              <thead>
                <tr>
                  <th scope="col">Browser</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Versions</th>
                  <th scope="col" className="is-number">Sessions</th>
                  <th scope="col" className="is-number">Share</th>
                  <th scope="col" className="is-number">People</th>
                </tr>
              </thead>
              <tbody>
                {families.map(row => (
                  <tr key={`${row.family}|${row.kind}|${row.brand}`} className={isAiKind(row.kind) ? "is-ai" : undefined}>
                    <td>{browserLabel({ family: row.family, brand: row.brand })}</td>
                    <td><BrowserKindBadge kind={row.kind} /></td>
                    <td>{versionsLabel(row.versions)}</td>
                    <td className="is-number">{row.sessions.toLocaleString()}</td>
                    <td className="is-number">{shareLabel(row.sessions, answer.sessions)}</td>
                    <td className="is-number">{row.people.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-copy" style={{ marginTop: 10 }}>{legacy ? "Available after the server update." : loading && !answer ? "Loading…" : "No sessions in this period."}</p>
        )}
        {answer && answer.unidentifiedSessions ? (
          <p className="muted-copy admin-footnote">
            {answer.unidentifiedSessions} {answer.unidentifiedSessions === 1 ? "session does" : "sessions do"} not say who is signed in (apps 2.3 and older): counted here, each as one person, never shared out to people below.
          </p>
        ) : null}
      </section>

      <section className="card app-card">
        <div className="admin-card-head">
          <CardTitle icon="team" eyebrow={answer ? periodRangeLabel(answer) : "Browsers"} title="People and their browsers" />
          {answer && answer.totalPeople > (answer.list?.length ?? 0) ? <span className="admin-generated">{answer.list.length} of {answer.totalPeople}</span> : null}
        </div>
        <div className="admin-online-controls">
          <div className="admin-segmented" role="group" aria-label="Show">
            {BROWSER_FILTERS.map(item => (
              <button key={item.key} type="button" aria-pressed={filter === item.key} className={filter === item.key ? "is-active" : ""} onClick={() => setFilter(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            className="input admin-browser-search"
            placeholder="Search address, name or workspace"
            aria-label="Search people"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
        {answer && people.length ? (
          <ul className="admin-online-list admin-browser-people" aria-label="People and the browsers they used">
            {people.map(person => {
              const internal = internalLabel(person);
              return (
                <li key={person.uid} className={person.ai ? "admin-browser-person is-ai" : "admin-browser-person"}>
                  <div className="admin-online-who">
                    {onOpenUser ? (
                      <button type="button" className="admin-person-link admin-online-name" onClick={() => onOpenUser(person.uid)}>{personLabel(person)}</button>
                    ) : (
                      <strong className="admin-online-name" title={person.uid}>{personLabel(person)}</strong>
                    )}
                    <span className="admin-online-sub">
                      {[person.email && person.name ? person.name : "", person.workspace || (person.workspaceId ? "Workspace without a name" : "No workspace")].filter(Boolean).join(" · ")}
                    </span>
                    {internal ? <span className="admin-online-badge">{internal}</span> : null}
                  </div>
                  <ul className="admin-browser-chips" aria-label="Browsers used">
                    {sortedBrowsers(person.browsers).map(item => (
                      <li key={`${item.family}|${item.major}|${item.kind}|${item.brand}`} className={`admin-browser-chip is-${item.kind}`}>
                        <span>{browserLabel(item)}</span>
                        <BrowserKindBadge kind={item.kind} />
                        {item.sessions > 1 ? <em>×{item.sessions}</em> : null}
                      </li>
                    ))}
                  </ul>
                  <span className="admin-online-seen">{lastSeenLabel(person.lastSeenMs, now)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted-copy" style={{ marginTop: 10 }}>
            {legacy ? "Available after the server update." : loading && !answer ? "Loading…" : answer && answer.list.length ? "Nobody matches this filter." : "No signed-in member was in an app in this period."}
          </p>
        )}
        {answer ? (
          <p className="muted-copy admin-footnote">
            People who used an AI browser or agent come first, then by last seen.
            {answer.accountsReadable === false ? " Firebase Auth could not be read, so addresses are missing (not deleted)." : ""}
            {answer.workspacesReadable === false ? " Workspaces could not be read." : ""}
            {answer.truncated ? " Only the most recent 5,000 sessions were read." : ""}
          </p>
        ) : null}
      </section>

      <section className="card app-card">
        <CardTitle icon="dashboard" eyebrow={answer ? periodRangeLabel(answer) : "Website"} title="Public website visitors (anonymous)" />
        {answer && !answer.site.readable ? <p className="admin-error" role="alert">The website&apos;s day counters could not be read (not zero).</p> : null}
        {answer && siteKinds.length ? (
          <>
            <KindBars unit={["visit", "visits"]} rows={siteKinds.map(row => ({ ...row, value: row.visits }))} />
            <div className="admin-two-lists admin-browser-lists">
              <ul className="admin-plain-list" aria-label="Visits by browser">
                {siteBrowsers.map(row => <li key={row.family}><span>{row.label}</span><strong>{row.count.toLocaleString()} · {row.shareLabel}</strong></li>)}
              </ul>
              {siteAgents.length ? (
                <ul className="admin-plain-list" aria-label="Bots and agents that ran the page">
                  {siteAgents.map(row => <li key={row.family}><span>{row.label}{row.aiCrawler ? " · AI crawler" : ""}</span><strong>{row.count.toLocaleString()}</strong></li>)}
                </ul>
              ) : null}
            </div>
          </>
        ) : (
          <p className="muted-copy" style={{ marginTop: 10 }}>{legacy ? "Available after the server update." : loading && !answer ? "Loading…" : "No labelled website visit in this period yet."}</p>
        )}
        {answer ? (
          <p className="muted-copy admin-footnote">
            Visits to nivadesk.app by people who are not signed in, counted once per visit, no person named. {answer.site.labelledVisits.toLocaleString()} of {answer.site.visits.toLocaleString()} visits in these days carry a browser label (labels start with the server update).
            {siteAgents.length ? " The second list is crawlers and agents that ran the page's script: they are kept out of the visitor numbers." : ""}
          </p>
        ) : null}
      </section>

      <section className="card app-card">
        <CardTitle icon="warningTriangle" eyebrow="Honest limits" title="What this cannot see" />
        <ul className="admin-limits">
          <li>Most AI browsers are built on Chrome&apos;s engine and send exactly what Chrome, Edge or Opera send: Perplexity Comet on a computer, Dia, Arc, Opera Neon and the ChatGPT desktop app&apos;s browser are counted as that browser, because nothing in the request says otherwise. A Chromium browser that names nothing we know is &ldquo;Can&apos;t tell&rdquo; — never guessed. (ChatGPT Atlas, which sometimes said so, was retired in August 2026.)</li>
          <li>AI assistants that work inside a person&apos;s own browser — Claude in Chrome, Gemini in Chrome, Copilot Mode in Edge, Brave Leo, Opera Aria — leave no trace in the request: that person shows with their normal browser.</li>
          <li>AI agents are recognised when they sign their requests or name themselves: ChatGPT agent, Google-Agent, Manus, Nova Act. These are the agents&apos; own claims, good for counting, not proof. Assistants that only fetch a page (ChatGPT, Claude, Perplexity) do not run the app, so they appear on the public website at most.</li>
          <li>Apps released before 2.4 do not say who is signed in; web sessions before the server update were never checked (&ldquo;Not checked&rdquo;). Sessions are kept {answer?.retentionDays ?? 8} days, so 7 days is the longest period.</li>
        </ul>
      </section>
    </div>
  );
}

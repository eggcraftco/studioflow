"use client";

// Admin Insights ▸ Bot questions (30 Oct 2026): what people ask NivaDesk's two bots — the in-app
// "How do I…?" helper and the chat on nivadesk.app — when, in which language, and what came back.
// Reads getAssistantQuestions (admins only; functions assistant/questionLog.js). Every language is
// kept as it was asked, with an English copy the same model call wrote, so a question in Arabic or
// Japanese reads here too. Nothing names a person: a workspace is six characters of its id, e-mail
// addresses and long numbers are masked before anything is stored, and rows go after 180 days.

import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { CardTitle } from "@/components/CardTitle";
import { downloadCsv, toCsv } from "@/lib/studioflow/adminLivePresence";

type AdminView = "business" | "qa";
type Named = { name: string; count: number };
type Item = {
  id: string; atMs: number; bot: "app" | "website"; platform: string; depth: string; outcome: string; language: string;
  question: string; questionEn: string; answer: string; sources: string[]; fallback: boolean;
  workspace: string; plan: string; staff: boolean; page: string; ticketId: string; latencyMs: number;
};
type Gap = { question: string; count: number; lastAtMs: number; languages: string[]; bots: string[]; otherWordings?: string[] };
type QuestionsResult = {
  ok: boolean; days: number; view: AdminView; counted: number; truncated: boolean;
  left: { staff: number; excluded: number }; exclusions: { readable: boolean; flagged: number };
  languages: Named[]; outcomes: Record<string, string>; retentionDays: number;
  totals: { questions: number; answered: number; notAnswered: number; needsChatGPT: number; refused: number; failed: number; answeredPct: number | null; people: number; visitorChats: number };
  byDay: { day: string; app: number; website: number }[];
  byBot: Named[]; byPlatform: Named[]; byLanguage: Named[]; byOutcome: Named[]; byPlan: Named[];
  topSources: { id: string; count: number }[];
  gaps: Gap[];
  latency: { medianMs: number | null; p90Ms: number | null };
  tokens: { prompt: number; completion: number; estCostUsd: number };
  items: Item[]; itemsCapped: boolean;
};

const APP_LABELS: Record<string, string> = { web: "Web app", mac: "Mac", ios: "iPhone / iPad", android: "Android", website: "Website chat" };
const BOT_LABELS: Record<string, string> = { app: "In-app helper", website: "Website chat" };
const OUTCOME_TONE: Record<string, string> = {
  answered: "var(--admin-good-text, #1f8a4c)", unsure: "var(--admin-bad-text, var(--danger))", needs_support: "var(--admin-bad-text, var(--danger))",
  needs_chatgpt: "var(--muted)", refused_plan: "var(--muted)", limit: "var(--admin-warn-text, var(--muted))", off: "var(--admin-bad-text, var(--danger))", error: "var(--admin-bad-text, var(--danger))"
};

function when(ms: number) {
  return new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function seconds(ms: number | null) {
  return ms == null ? "—" : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="admin-kpi-tile" style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--admin-tile-bg, transparent)" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{value}</div>
      {sub ? <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

function CountList({ rows, labels, unit }: { rows: Named[]; labels?: Record<string, string>; unit: string }) {
  if (!rows.length) return <p className="muted-copy" style={{ fontSize: 12, marginTop: 8 }}>Nothing in this window.</p>;
  const top = rows[0].count || 1;
  return (
    <table className="admin-search-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
      <thead><tr><th style={{ textAlign: "left", padding: 6 }}>{unit}</th><th style={{ padding: 6 }} /><th style={{ textAlign: "right", padding: 6 }}>Questions</th></tr></thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.name}>
            <td style={{ padding: 6 }} dir="auto">{labels?.[row.name] || row.name}</td>
            <td style={{ padding: 6, width: "40%" }} aria-hidden="true">
              <span style={{ display: "block", height: 8, borderRadius: 999, background: "var(--admin-track-bg, var(--border))" }}>
                <span style={{ display: "block", height: "100%", width: `${Math.max(3, (100 * row.count) / top)}%`, borderRadius: 999, background: "var(--accent, #2563eb)" }} />
              </span>
            </td>
            <td style={{ padding: 6, textAlign: "right", fontWeight: 800 }}>{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AdminAssistantQuestionsPanel({ view }: { view: AdminView }) {
  const [days, setDays] = useState(30);
  const [bot, setBot] = useState("");
  const [outcome, setOutcome] = useState("");
  const [language, setLanguage] = useState("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<QuestionsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const callable = httpsCallable<{ days: number; view: AdminView; bot: string; outcome: string; language: string; q: string }, QuestionsResult>(functions, "getAssistantQuestions");
    callable({ days, view, bot, outcome, language, q: search })
      .then(result => { if (!cancelled) { setData(result.data); setShowAll(false); } })
      .catch(err => {
        if (cancelled) return;
        const code = String((err as { code?: unknown })?.code ?? "");
        setError(/not-found/.test(code)
          ? "The server does not have getAssistantQuestions yet (it ships in the assistant-bots package). Nothing to show until it is deployed."
          : err instanceof Error ? err.message : "Could not load the bot questions.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days, view, bot, outcome, language, search]);

  const outcomes = data?.outcomes ?? {};
  const items = data?.items ?? [];
  const shown = showAll ? items : items.slice(0, 50);
  const dayTop = useMemo(() => Math.max(1, ...(data?.byDay ?? []).map(row => row.app + row.website)), [data]);
  const languageOptions = useMemo(() => {
    const names = (data?.languages ?? []).map(row => row.name);
    return language && !names.includes(language) ? [language, ...names] : names;
  }, [data, language]);
  const cell = { padding: "6px", verticalAlign: "top" } as const;

  return (
    // minmax(0, 1fr): a grid column otherwise grows to its widest row and the cards spill past a phone screen.
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <section className="card app-card">
        <div className="admin-card-head">
          <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Bot questions" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", minWidth: 0, maxWidth: "100%" }}>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Last{" "}
              <select value={days} onChange={event => setDays(Number(event.target.value))} aria-label="Window">
                {[1, 7, 30, 90, 180].map(value => <option key={value} value={value}>{value === 1 ? "24 hours" : `${value} days`}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Bot{" "}
              <select value={bot} onChange={event => setBot(event.target.value)} aria-label="Bot">
                <option value="">Both</option>
                <option value="app">In-app helper</option>
                <option value="website">Website chat</option>
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Result{" "}
              <select value={outcome} onChange={event => setOutcome(event.target.value)} aria-label="Result" style={{ maxWidth: 190 }}>
                <option value="">All</option>
                <option value="not_answered">Not answered (all kinds)</option>
                {Object.entries(outcomes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Language{" "}
              <select value={language} onChange={event => setLanguage(event.target.value)} aria-label="Language">
                <option value="">All</option>
                {languageOptions.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <form onSubmit={event => { event.preventDefault(); setSearch(draft.trim()); }} style={{ display: "flex", gap: 6, flex: "1 1 220px", minWidth: 0 }}>
              <input type="search" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Search questions and answers"
                     aria-label="Search questions and answers" style={{ fontSize: 12, padding: "4px 8px", flex: 1, minWidth: 0 }} />
              <button type="submit" className="button secondary admin-small-button">Search</button>
            </form>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
          Every question asked of the in-app &quot;How do I…?&quot; helper (web, Mac, iPhone, iPad, Android) and of the chat on nivadesk.app, in whatever language it was asked, with the English copy the bot wrote of it, what it answered, which guide sections it used and how long it took. E-mail addresses, long numbers and keys are masked before anything is stored; no name is kept. Rows are deleted after {data?.retentionDays ?? 180} days.
        </p>
        {data ? (
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
            Left out: {data.left.staff} from NivaDesk staff, {data.left.excluded} from flagged workspaces{view === "qa" ? " (QA view counts them)" : ""}.
            {!data.exclusions.readable ? " Exclusion flags could not be read — flagged workspaces are counted." : ""}
            {data.truncated ? " The window holds more than 5,000 questions: only the newest 5,000 are counted." : ""}
          </p>
        ) : null}
        {loading ? <p role="status" style={{ fontSize: 13, color: "var(--muted)" }}>Reading the questions…</p> : null}
        {error ? <p role="alert" style={{ fontSize: 13, color: "var(--danger)", fontWeight: 700 }}>{error}</p> : null}
        {data ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 12 }}>
            <Tile label="Questions" value={data.totals.questions.toLocaleString()} sub={data.byBot.map(row => `${row.count} ${BOT_LABELS[row.name] || row.name}`).join(" · ") || "none yet"} />
            <Tile label="Answered" value={data.totals.answeredPct == null ? "—" : `${data.totals.answeredPct}%`} sub={`${data.totals.answered} of those the bot read`} />
            <Tile label="Not answered" value={data.totals.notAnswered.toLocaleString()} sub="offered the team or support — see Guide gaps" />
            <Tile label="Languages" value={String(data.byLanguage.filter(row => row.name !== "Unknown").length)} sub={data.byLanguage.slice(0, 3).map(row => row.name).join(", ")} />
            <Tile label="Reply time" value={seconds(data.latency.medianMs)} sub={`median · 90% within ${seconds(data.latency.p90Ms)}`} />
            <Tile label="OpenAI cost" value={`$${data.tokens.estCostUsd.toFixed(data.tokens.estCostUsd < 1 ? 4 : 2)}`} sub={`estimate · ${(data.tokens.prompt + data.tokens.completion).toLocaleString()} tokens`} />
          </div>
        ) : null}
      </section>

      {data && data.byDay.length > 1 ? (
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow={`${BOT_LABELS.app} and ${BOT_LABELS.website}`} title="Questions per day" />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120, marginTop: 12 }} role="img"
               aria-label={`Questions per day over ${data.days} days, ${data.totals.questions} in all`}>
            {data.byDay.map(row => {
              const total = row.app + row.website;
              return (
                <div key={row.day} title={`${row.day}: ${row.app} in-app, ${row.website} website`}
                     style={{ flex: 1, minWidth: 2, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                  <span style={{ height: `${(100 * row.website) / dayTop}%`, background: "var(--admin-plan-team, #8b5cf6)", borderRadius: "3px 3px 0 0" }} />
                  <span style={{ height: `${(100 * row.app) / dayTop}%`, background: "var(--accent, #2563eb)", borderRadius: total && !row.website ? "3px 3px 0 0" : 0 }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            <span>{data.byDay[0].day}</span>
            <span><span style={{ color: "var(--accent, #2563eb)" }}>■</span> in-app · <span style={{ color: "var(--admin-plan-team, #8b5cf6)" }}>■</span> website</span>
            <span>{data.byDay[data.byDay.length - 1].day}</span>
          </div>
        </section>
      ) : null}

      {data ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 14 }}>
          <section className="card app-card"><CardTitle icon="dashboard" eyebrow="Asked in" title="Languages" /><CountList rows={data.byLanguage} unit="Language" /></section>
          <section className="card app-card"><CardTitle icon="dashboard" eyebrow="What came back" title="Results" /><CountList rows={data.byOutcome} labels={outcomes} unit="Result" /></section>
          <section className="card app-card"><CardTitle icon="dashboard" eyebrow="Where it was asked" title="Apps" /><CountList rows={data.byPlatform} labels={APP_LABELS} unit="App" /></section>
          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Cited in answers" title="Guide sections used most" />
            <CountList rows={data.topSources.map(row => ({ name: row.id, count: row.count }))} unit="Section" />
          </section>
        </div>
      ) : null}

      {data ? (
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="What to write next in the guide" title="Guide gaps" />
          <p className="muted-copy" style={{ margin: "6px 0 0", fontSize: 12 }}>Questions the bots could not answer from the guide, counted once however often, however worded and in whatever language they were asked (grouped by the words of their English wording).</p>
          {data.gaps.length ? (
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="admin-search-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr><th style={{ ...cell, textAlign: "left" }}>Question</th><th style={cell}>Times</th><th style={{ ...cell, textAlign: "left" }}>Languages</th><th style={{ ...cell, textAlign: "left" }}>Bot</th><th style={{ ...cell, textAlign: "left" }}>Last asked</th></tr></thead>
                <tbody>
                  {data.gaps.map(gap => (
                    <tr key={`${gap.question}-${gap.lastAtMs}`}>
                      <td style={cell}>
                        <div dir="auto">{gap.question}</div>
                        {gap.otherWordings?.length ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }} dir="auto">also asked as: {gap.otherWordings.join(" · ")}</div> : null}
                      </td>
                      <td style={{ ...cell, textAlign: "center", fontWeight: 800 }}>{gap.count}</td>
                      <td style={cell}>{gap.languages.join(", ") || "—"}</td>
                      <td style={cell}>{gap.bots.map(name => BOT_LABELS[name] || name).join(", ")}</td>
                      <td style={cell}>{when(gap.lastAtMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted-copy" style={{ fontSize: 12, marginTop: 8 }}>No unanswered question in this window.</p>}
        </section>
      ) : null}

      {data ? (
        <section className="card app-card">
          <div className="admin-card-head">
            <CardTitle icon="dashboard" eyebrow={`Newest first · ${data.counted.toLocaleString()} match${data.itemsCapped ? ", the newest 500 listed" : ""}`} title="Every question" />
            <button
              type="button"
              className="button secondary admin-small-button"
              disabled={!items.length}
              onClick={() => downloadCsv(
                `nivadesk-bot-questions-${view}-${days}d-${new Date().toISOString().slice(0, 10)}.csv`,
                toCsv(
                  ["asked_at_utc", "bot", "app", "depth", "language", "question", "question_en", "result", "answer", "guide_sections", "whole_guide_sent", "workspace", "plan", "staff", "page", "conversation", "reply_ms"],
                  items.map(row => [new Date(row.atMs).toISOString(), row.bot, row.platform, row.depth, row.language, row.question, row.questionEn, row.outcome, row.answer,
                    row.sources.join(" "), row.fallback ? "yes" : "no", row.workspace, row.plan, row.staff ? "yes" : "no", row.page, row.ticketId, row.latencyMs])
                )
              )}
            >
              Export CSV
            </button>
          </div>
          {items.length ? (
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="admin-search-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ ...cell, textAlign: "left" }}>Asked</th><th style={{ ...cell, textAlign: "left" }}>Where</th><th style={{ ...cell, textAlign: "left" }}>Language</th>
                    <th style={{ ...cell, textAlign: "left", minWidth: 260 }}>Question</th><th style={{ ...cell, textAlign: "left" }}>Result</th>
                    <th style={{ ...cell, textAlign: "left" }}>Who</th><th style={{ ...cell, textAlign: "right" }}>Reply</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(row => (
                    <tr key={row.id}>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>{when(row.atMs)}</td>
                      <td style={cell}>{APP_LABELS[row.bot === "website" ? "website" : row.platform] || row.platform}{row.bot === "website" && row.page ? <div style={{ fontSize: 11, color: "var(--muted)" }}>{row.page}</div> : null}</td>
                      <td style={cell}>{row.language || "—"}</td>
                      <td style={cell}>
                        <div dir="auto" style={{ fontWeight: 600 }}>{row.question || "—"}</div>
                        {row.questionEn ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>EN: {row.questionEn}</div> : null}
                        {row.answer ? (
                          <details style={{ marginTop: 4 }}>
                            <summary style={{ fontSize: 12, cursor: "pointer" }}>Answer{row.sources.length ? ` · ${row.sources.join(", ")}` : row.fallback ? " · whole guide sent" : ""}</summary>
                            <div dir="auto" style={{ fontSize: 12.5, whiteSpace: "pre-wrap", marginTop: 4 }}>{row.answer}</div>
                          </details>
                        ) : null}
                      </td>
                      <td style={{ ...cell, color: OUTCOME_TONE[row.outcome] || "inherit", fontWeight: 700 }}>{outcomes[row.outcome] || row.outcome}</td>
                      <td style={cell}>
                        {row.bot === "website" ? (row.plan && row.plan !== "visitor" ? `signed in · ${row.plan}` : "visitor") : `${row.plan || "—"}${row.depth === "short" ? " (short)" : ""}`}
                        {row.workspace ? <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--muted)" }}> · {row.workspace}</span> : null}
                        {row.staff ? <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800 }}>staff</span> : null}
                      </td>
                      <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>{row.latencyMs ? seconds(row.latencyMs) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted-copy" style={{ fontSize: 12, marginTop: 8 }}>{loading ? "" : "No question matches."}</p>}
          {items.length > shown.length ? (
            <button type="button" className="button secondary" style={{ marginTop: 10 }} onClick={() => setShowAll(true)}>Show all ({items.length})</button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

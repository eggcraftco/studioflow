"use client";

// Admin Insights ▸ Drop-off (30 Oct 2026): where new accounts stop, step by step.
//
// Activation (next door) says which state each WORKSPACE is in today. This page follows
// each SIGN-UP from Firebase Auth through the steps after it — app opened, setup finished,
// first order, a real order, back on another day, still here after a week, paying — and,
// for accounts that signed up after the recorder went live, which setup step or screen
// was in front of them when they stopped. Older accounts show how far they got, never a
// guessed step. Nothing here names a person: ids are cut to six characters.

import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { CardTitle } from "@/components/CardTitle";
import { downloadCsv, toCsv } from "@/lib/studioflow/adminLivePresence";

type AdminView = "business" | "qa";
type Step = { key: string; label: string; reached: number; eligible: number; pct: number | null };
type Count<K extends string> = { [key in K]: string } & { count: number };
type PlatformRow = { platform: string; signedUp: number; appLoaded: number; setupFinished: number; firstOrder: number; realOrder: number; cameBack: number };
type WeekRow = { week: string; signedUp: number; setupFinished: number; firstOrder: number; realOrder: number; cameBack: number };
type AccountRow = {
  id: string; signedUpAtMs: number; platform: string; stoppedAt: string; lastSetupStep: string; lastScreen: string;
  orders: number; realOrders: number; cameBack: boolean; hasTelemetry: boolean;
};
type DropoffResult = {
  counted: number;
  days: number;
  left: { disabled: number; staff: number; excluded: number; outsideWindow: number; otherPlatform: number };
  steps: Step[];
  stoppedAt: Count<"step">[];
  byPlatform: PlatformRow[];
  byWeek: WeekRow[];
  insideSetup: { leftDuringSetup: number; withoutStepDetail: number; furthestStep: Count<"step">[] };
  lastScreenBeforeLeaving: { accounts: number; withoutScreenDetail: number; screens: Count<"screen">[] };
  errors: Count<"error">[];
  medians: { toSetupFinishedMin: number | null; toFirstOrderMin: number | null; toRealOrderMin: number | null };
  telemetry: { accounts: number; firstEventAtMs: number | null };
  accounts: AccountRow[];
  bySignIn: Record<string, number>;
  exclusions: { readable: boolean; flagged: number };
  recorderOn: boolean;
};

const STOP_LABELS: Record<string, string> = {
  app_loaded: "Never opened the app",
  setup_finished: "Left during setup",
  first_order: "Finished setup, no order",
  real_order: "Only an empty order",
  came_back: "Never came back",
  week_two: "Gone within a week",
  paying: "Active, not paying",
  too_early: "Too early to tell"
};
const SETUP_STEP_LABELS: Record<string, string> = {
  basics: "1 · Workspace basics",
  bringWork: "2 · Bring your work in",
  goal: "3 · First goal",
  work: "4 · Your work",
  plan: "5 · Plan",
  ready: "Ready screen",
  never_shown: "Setup never shown"
};
const PLATFORM_LABELS: Record<string, string> = {
  web: "Web", ios: "iPhone", ipados: "iPad", macos: "Mac", android: "Android",
  unknown_desktop: "Desktop (web or Mac, not recorded)", unknown_mobile: "Phone (web or app, not recorded)", unknown: "Not recorded"
};

const day = (ms: number) => (ms ? new Date(ms).toISOString().slice(0, 10) : "—");
const minutes = (value: number | null) => (value === null ? "—" : value < 90 ? `${Math.round(value)} min` : value < 2880 ? `${(value / 60).toFixed(1)} h` : `${(value / 1440).toFixed(1)} days`);
const pct = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : "—");

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px", background: "var(--surface, #fff)" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 950, marginTop: 4 }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

function CountTable<K extends string>({ rows, keyName, labels, unit }: { rows: Count<K>[]; keyName: K; labels?: Record<string, string>; unit: string }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (!rows.length) return <p className="muted-copy" style={{ fontSize: 12.5, marginTop: 8 }}>Nothing recorded yet.</p>;
  return (
    <table className="admin-search-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
      <thead><tr><th style={{ textAlign: "left", padding: "6px" }}>{unit}</th><th style={{ textAlign: "right", padding: "6px" }}>Accounts</th><th style={{ textAlign: "right", padding: "6px" }}>Share</th></tr></thead>
      <tbody>
        {rows.map(row => (
          <tr key={row[keyName]}>
            <td style={{ padding: "6px" }}>{labels?.[row[keyName]] || row[keyName].replace(/_/g, " ")}</td>
            <td style={{ padding: "6px", textAlign: "right", fontWeight: 800 }}>{row.count}</td>
            <td style={{ padding: "6px", textAlign: "right", color: "var(--muted)" }}>{pct(row.count, total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AdminDropoffPanel({ view }: { view: AdminView }) {
  const [days, setDays] = useState(90);
  const [platform, setPlatform] = useState("");
  const [data, setData] = useState<DropoffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const callable = httpsCallable<{ days: number; view: AdminView; platform: string }, DropoffResult>(functions, "getOnboardingFunnel");
    callable({ days, view, platform })
      .then(result => { if (!cancelled) setData(result.data); })
      .catch(err => {
        if (cancelled) return;
        const code = String((err as { code?: unknown })?.code ?? "");
        setError(/not-found/.test(code)
          ? "The server does not have getOnboardingFunnel yet (it ships in the onboarding package). Nothing to show until it is deployed."
          : err instanceof Error ? err.message : "Could not load the drop-off funnel.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days, view, platform]);

  const firstStep = data?.steps[0]?.reached || 0;
  const accounts = data?.accounts ?? [];
  const shown = showAll ? accounts : accounts.slice(0, 30);
  const platforms = useMemo(() => (data?.byPlatform ?? []).map(row => row.platform), [data]);
  const cell = { padding: "6px" } as const;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section className="card app-card">
        <div className="admin-card-head">
          <CardTitle icon="dashboard" eyebrow="NivaDesk admin" title="Drop-off" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Signed up in the last{" "}
              <select className="input admin-filter-select" value={days} onChange={event => setDays(Number(event.target.value))} aria-label="Window">
                {[30, 60, 90, 180].map(value => <option key={value} value={value}>{value} days</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Platform{" "}
              <select className="input admin-filter-select" value={platform} onChange={event => setPlatform(event.target.value)} aria-label="Platform">
                <option value="">All</option>
                {(platform && !platforms.includes(platform) ? [platform, ...platforms] : platforms).map(value => <option key={value} value={value}>{PLATFORM_LABELS[value] || value}</option>)}
              </select>
            </label>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
          Every sign-up in the window, followed step by step. How far each account got is read from what it left behind (workspace, setup answers, orders, Firebase Auth&apos;s last activity), so it covers every account. Which setup step or screen was in front of someone when they stopped comes from the onboarding recorder, which only sees accounts that signed up after it went live — older ones show how far they got, never a guessed step.
        </p>
        {data ? (
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
            Left out: {data.left.staff} staff, {data.left.disabled} disabled, {data.left.excluded} flagged or team members of another workspace{view === "qa" ? " (QA view keeps flagged workspaces in)" : ""}.
            {" "}Recorder: {data.recorderOn ? "on" : "off on the server"}; step detail for {data.telemetry.accounts} account{data.telemetry.accounts === 1 ? "" : "s"}{data.telemetry.firstEventAtMs ? ` since ${day(data.telemetry.firstEventAtMs)}` : ""}.
            {!data.exclusions.readable ? " Exclusion flags could not be read — flagged workspaces are counted." : ""}
          </p>
        ) : null}
        {loading ? <p style={{ fontSize: 13, color: "var(--muted)" }}>Working it out…</p> : null}
        {error ? <p role="alert" style={{ fontSize: 13, color: "var(--danger)", fontWeight: 700 }}>{error}</p> : null}
        {data ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 12 }}>
            <Tile label="Sign-ups" value={data.counted.toLocaleString()} sub={Object.entries(data.bySignIn).map(([key, n]) => `${n} ${key}`).join(" · ")} />
            <Tile label="To setup finished" value={minutes(data.medians.toSetupFinishedMin)} sub="median, of those who finished" />
            <Tile label="To first order" value={minutes(data.medians.toFirstOrderMin)} sub="median" />
            <Tile label="To a real order" value={minutes(data.medians.toRealOrderMin)} sub="median" />
          </div>
        ) : null}
      </section>

      {data ? (
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Step by step" title="How far they got" />
          <p className="muted-copy" style={{ margin: "6px 0 0", fontSize: 12 }}>Each step counted on its own. “Came back” and “after 7 days” only count accounts old enough to have done them.</p>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {data.steps.map((step, index) => {
              const previous = index > 0 ? data.steps[index - 1].reached : step.reached;
              const width = firstStep ? Math.max(2, (100 * step.reached) / firstStep) : 0;
              return (
                <div key={step.key} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 220px) 1fr auto", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{step.label}</span>
                  <span style={{ background: "var(--border)", borderRadius: 999, height: 12, overflow: "hidden" }} aria-hidden="true">
                    <span style={{ display: "block", height: "100%", width: `${width}%`, background: "var(--accent, #2563eb)", borderRadius: 999 }} />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, minWidth: 120, textAlign: "right" }}>
                    {step.reached}/{step.eligible} {step.pct === null ? "" : `· ${step.pct}%`}
                    {index > 0 && previous > step.reached ? <span style={{ color: "var(--danger)", fontWeight: 700, marginLeft: 6 }}>−{previous - step.reached}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {data ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="The first step not done" title="Where they stopped" />
            <CountTable rows={data.stoppedAt} keyName="step" labels={STOP_LABELS} unit="Stopped" />
          </section>
          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow={`${data.insideSetup.leftDuringSetup} left during setup`} title="Furthest setup step" />
            <CountTable rows={data.insideSetup.furthestStep} keyName="step" labels={SETUP_STEP_LABELS} unit="Step" />
            {data.insideSetup.withoutStepDetail ? <p className="muted-copy" style={{ fontSize: 12, marginTop: 6 }}>{data.insideSetup.withoutStepDetail} signed up before the recorder: no step detail.</p> : null}
          </section>
          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow={`${data.lastScreenBeforeLeaving.accounts} never came back`} title="Last screen they saw" />
            <CountTable rows={data.lastScreenBeforeLeaving.screens} keyName="screen" unit="Screen" />
            {data.lastScreenBeforeLeaving.withoutScreenDetail ? <p className="muted-copy" style={{ fontSize: 12, marginTop: 6 }}>{data.lastScreenBeforeLeaving.withoutScreenDetail} signed up before the recorder: no screen detail.</p> : null}
          </section>
          <section className="card app-card">
            <CardTitle icon="dashboard" eyebrow="Accounts that saw each" title="Errors on the way in" />
            <CountTable rows={data.errors} keyName="error" unit="Where : code" />
          </section>
        </div>
      ) : null}

      {data ? (
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow="Same steps, side by side" title="By platform and by sign-up week" />
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table className="admin-search-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr><th style={{ ...cell, textAlign: "left" }}>Platform</th><th style={cell}>Signed up</th><th style={cell}>Opened app</th><th style={cell}>Setup done</th><th style={cell}>Any order</th><th style={cell}>Real order</th><th style={cell}>Came back</th></tr></thead>
              <tbody>
                {data.byPlatform.map(row => (
                  <tr key={row.platform}>
                    <td style={cell}>{PLATFORM_LABELS[row.platform] || row.platform}</td>
                    <td style={{ ...cell, textAlign: "center", fontWeight: 800 }}>{row.signedUp}</td>
                    {[row.appLoaded, row.setupFinished, row.firstOrder, row.realOrder, row.cameBack].map((value, index) => (
                      <td key={index} style={{ ...cell, textAlign: "center" }}>{value} <span style={{ color: "var(--muted)" }}>({pct(value, row.signedUp)})</span></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <table className="admin-search-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr><th style={{ ...cell, textAlign: "left" }}>Week</th><th style={cell}>Signed up</th><th style={cell}>Setup done</th><th style={cell}>Any order</th><th style={cell}>Real order</th><th style={cell}>Came back</th></tr></thead>
              <tbody>
                {data.byWeek.map(row => (
                  <tr key={row.week}>
                    <td style={cell}>{row.week}</td>
                    <td style={{ ...cell, textAlign: "center", fontWeight: 800 }}>{row.signedUp}</td>
                    {[row.setupFinished, row.firstOrder, row.realOrder, row.cameBack].map((value, index) => (
                      <td key={index} style={{ ...cell, textAlign: "center" }}>{value} <span style={{ color: "var(--muted)" }}>({pct(value, row.signedUp)})</span></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {accounts.length ? (
        <section className="card app-card">
          <div className="admin-card-head">
            <CardTitle icon="dashboard" eyebrow="Newest first, no names" title="Accounts" />
            <button
              type="button"
              className="button secondary admin-small-button"
              onClick={() => downloadCsv(
                `nivadesk-dropoff-${view}-${days}d-${new Date().toISOString().slice(0, 10)}.csv`,
                toCsv(
                  ["account", "signed_up", "platform", "stopped", "furthest_setup_step", "last_screen", "orders", "real_orders", "came_back", "step_detail"],
                  accounts.map(row => [row.id, day(row.signedUpAtMs), row.platform, row.stoppedAt, row.lastSetupStep, row.lastScreen, row.orders, row.realOrders, row.cameBack ? "yes" : "no", row.hasTelemetry ? "yes" : "no"])
                )
              )}
            >
              Export CSV
            </button>
          </div>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table className="admin-search-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...cell, textAlign: "left" }}>Account</th><th style={{ ...cell, textAlign: "left" }}>Signed up</th><th style={{ ...cell, textAlign: "left" }}>Platform</th>
                  <th style={{ ...cell, textAlign: "left" }}>Stopped</th><th style={{ ...cell, textAlign: "left" }}>Setup step</th><th style={{ ...cell, textAlign: "left" }}>Last screen</th>
                  <th style={{ ...cell, textAlign: "right" }}>Orders</th><th style={{ ...cell, textAlign: "left" }}>Came back</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(row => (
                  <tr key={`${row.id}-${row.signedUpAtMs}`}>
                    <td style={{ ...cell, fontFamily: "ui-monospace, monospace" }}>{row.id}</td>
                    <td style={cell}>{day(row.signedUpAtMs)}</td>
                    <td style={cell}>{PLATFORM_LABELS[row.platform] || row.platform}</td>
                    <td style={cell}>{STOP_LABELS[row.stoppedAt] || row.stoppedAt}</td>
                    <td style={cell}>{row.hasTelemetry ? (SETUP_STEP_LABELS[row.lastSetupStep] || row.lastSetupStep || "—") : "no detail"}</td>
                    <td style={cell}>{row.hasTelemetry ? (row.lastScreen || "—") : "no detail"}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{row.orders}{row.orders ? ` (${row.realOrders} real)` : ""}</td>
                    <td style={cell}>{row.cameBack ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {accounts.length > shown.length ? (
            <button type="button" className="button secondary" style={{ marginTop: 10 }} onClick={() => setShowAll(true)}>
              Show all ({accounts.length})
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

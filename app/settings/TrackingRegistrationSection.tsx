"use client";

// 17TRACK tracking in Settings ▸ Integrations (GN-13, owner decisions 22 Oct 2026).
//
// - Two kinds of registration, said plainly (owner, 22 Oct follow-up):
//   a number a person ADDS to an order (web or app) or asks about with Check again is registered
//   when they ask — no setting needed; a number nobody added by hand (a shop import whose carrier
//   is unknown) is registered only if the owner turns on the switch here (default off).
// - Both use the same limited allowance; the screen shows today's and this month's use.
// - Only the owner sees a working switch (the server refuses everyone else as well).
import { useCallback, useEffect, useState } from "react";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { SettingsCardHead } from "./pageHeader";
import {
  getTrackingRegistrationSettings,
  saveTrackingRegistrationSettings,
  usageLine,
  type TrackingRegistrationSettings
} from "@/lib/studioflow/trackingRegistration";

type Props = { workspace: WorkspaceContext; language?: string };

export function TrackingRegistrationSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const [view, setView] = useState<TrackingRegistrationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    setError("");
    getTrackingRegistrationSettings(workspace)
      .then((next) => { if (alive) setView(next); })
      .catch(() => { if (alive) setError("Could not load the 17TRACK settings."); });
    return () => { alive = false; };
  }, [workspace]);

  async function toggle(next: boolean) {
    if (!view || !view.canChange || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      setView(await saveTrackingRegistrationSettings(workspace, next));
      setNotice("Saved.");
    } catch {
      setError("Could not save the 17TRACK settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-card-stack" data-section="tracking-registration">
      {notice ? <p className="success-copy">{t(notice)}</p> : null}
      {error ? <p className="layout-error" role="alert">{t(error)}</p> : null}
      <section className="card app-card">
        <SettingsCardHead title={t("Automatic 17TRACK registration")} subtitle={t("Follow any courier's tracking number through 17TRACK.")} />
        <p className="settings-field-hint">
          {t("Numbers you or your team add to an order — on the web or in the apps — and Check again are registered with 17TRACK when you ask; this switch is not needed for them. Each new number uses one registration from the workspace allowance below.")}
        </p>
        <p className="settings-field-hint">
          {t("This switch decides only whether NivaDesk also registers, on its own, numbers nobody added by hand: a shop import's tracking number whose carrier is unknown.")}
        </p>
        <p className="settings-field-hint">{t("Numbers already registered keep updating either way.")}</p>
        {view ? (
          <div className="settings-switch-list">
            <label className="settings-switch-line">
              <span className="settings-switch-line-copy">
                <strong>{t("Register shop-import numbers automatically")}</strong>
                <small>{view.canChange ? t("Uses the workspace's 17TRACK allowance.") : t("Only the workspace owner can change this.")}</small>
              </span>
              <input
                type="checkbox"
                className="settings-switch"
                data-testid="tracking-auto-register"
                checked={view.autoRegister}
                disabled={!view.canChange || busy}
                onChange={(event) => void toggle(event.target.checked)}
              />
            </label>
          </div>
        ) : !error ? <p className="settings-field-hint">{t("Loading...")}</p> : null}
      </section>
      {view ? (
        <section className="card app-card">
          <SettingsCardHead title={t("17TRACK allowance")} subtitle={t("New registrations for this workspace, added by a person or automatic. The limits apply to both.")} />
          <div className="settings-two-col">
            <div className="settings-subpanel" data-testid="tracking-used-today">
              <span className="settings-field-label">{t("Used today")}</span>
              <strong className="settings-fact-value">{usageLine(t("{used} of {limit}"), view.used.today, view.caps.daily)}</strong>
            </div>
            <div className="settings-subpanel" data-testid="tracking-used-month">
              <span className="settings-field-label">{t("Used this month")}</span>
              <strong className="settings-fact-value">{usageLine(t("{used} of {limit}"), view.used.month, view.caps.monthly)}</strong>
            </div>
          </div>
          <p className="settings-field-hint">
            {t("This month: {registered} registered, {failed} failed, {indeterminate} unconfirmed.")
              .replace("{registered}", String(view.outcomesThisMonth.registered))
              .replace("{failed}", String(view.outcomesThisMonth.failed))
              .replace("{indeterminate}", String(view.outcomesThisMonth.indeterminate))}
          </p>
          {view.providerPaused ? (
            <p className="layout-error" role="status">{t("New 17TRACK registrations are paused: NivaDesk's 17TRACK allowance is nearly used up.")}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

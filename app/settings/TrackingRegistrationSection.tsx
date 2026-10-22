"use client";

// 17TRACK tracking in Settings ▸ Integrations (GN-13, owner decisions 22 Oct 2026).
//
// - Says plainly that registering a new number with 17TRACK uses one registration from a
//   limited allowance, and shows the workspace's use against its daily and monthly limit.
// - Automatic registration is OFF until the owner turns it on; only the owner sees a working
//   switch (the server refuses everyone else as well). Numbers already registered keep updating.
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
          {t("Every new tracking number registered with 17TRACK uses one registration from a limited allowance. When this is on, NivaDesk registers new numbers by itself (shop imports and Check again). When it is off, nothing is registered on its own; the owner can still register a single number from the order.")}
        </p>
        <p className="settings-field-hint">{t("Numbers already registered keep updating either way.")}</p>
        {view ? (
          <div className="settings-switch-list">
            <label className="settings-switch-line">
              <span className="settings-switch-line-copy">
                <strong>{t("Register new numbers automatically")}</strong>
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
          <SettingsCardHead title={t("17TRACK allowance")} subtitle={t("New registrations for this workspace. The limits apply to automatic registration and to Check again alike.")} />
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

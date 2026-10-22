"use client";

// Settings → Sales (S-2, 23 Oct 2026).
//
// One switch: show Sales in the main menu for this workspace. The server
// already has the preference (setSalesVisibility, live since 12 Sep 2026) and
// decides everything around it in one place (functions/sales/capability.js):
//
//   * the workspace must be in the Sales pilot (appConfig/sales, server-only);
//   * only the owner or an admin may change the preference;
//   * the menu entry appears only when the pilot is open AND the preference is
//     on AND the member may read orders (never for Workflow Only).
//
// This screen asks the server first and draws what it says. Outside the pilot
// the switch is disabled and the reason is written next to it. Turning the
// switch off hides the menu entry only — it is not a lock, and the screen says
// so, because the /sales address keeps working for anyone who can see orders.

import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsCardHead } from "./pageHeader";
import { studioT } from "@/lib/studioflow/language";
import { friendlyErrorMessage } from "@/lib/studioflow/friendlyError";
import { normalizeWorkspaceRole, type WorkspaceContext } from "@/lib/studioflow/firestore";
import {
  fetchSalesCapability,
  setSalesVisibility,
  SALES_VISIBILITY_CHANGED_EVENT,
  type SalesCapability
} from "@/lib/studioflow/sales";

type Props = { workspace: WorkspaceContext; language?: string };

export function SalesSettingsSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const role = normalizeWorkspaceRole(workspace.role);
  const roleCanManage = role === "owner" || role === "admin";

  const [capability, setCapability] = useState<SalesCapability | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState("");
  // Answers for a workspace this screen is no longer showing are dropped.
  const requestRef = useRef(0);

  useEffect(() => {
    const ticket = (requestRef.current += 1);
    setCapability(null);
    setLoadError("");
    setSaveError("");
    setSaved("");
    (async () => {
      try {
        const answer = await fetchSalesCapability(workspace.id);
        if (ticket !== requestRef.current) return;
        setCapability(answer);
      } catch (error) {
        if (ticket !== requestRef.current) return;
        setLoadError(friendlyErrorMessage(error, t));
      }
    })();
  }, [workspace.id, t]);

  const pilotOpen = capability?.pilotEnabled === true;
  // The server's word wins; the role is only a fallback for an older answer.
  const canManage = capability ? (capability.canManageVisibility ?? roleCanManage) : false;
  const isOn = capability?.visibility === "on";
  const disabled = !capability || !pilotOpen || !canManage || saving;

  async function toggle(next: boolean) {
    if (disabled) return;
    const ticket = requestRef.current;
    setSaving(true);
    setSaveError("");
    setSaved("");
    try {
      const answer = await setSalesVisibility(workspace.id, next);
      if (ticket !== requestRef.current) return;
      const visibility = answer.visibility === "on" ? "on" : "off";
      setCapability(current => (current ? { ...current, visibility, showInMenu: current.canOpenSales && visibility === "on" } : current));
      setSaved(visibility === "on" ? t("Sales is now in the menu.") : t("Sales is no longer in the menu."));
      window.dispatchEvent(new CustomEvent(SALES_VISIBILITY_CHANGED_EVENT, { detail: { companyId: workspace.id, visibility } }));
    } catch (error) {
      if (ticket !== requestRef.current) return;
      setSaveError(friendlyErrorMessage(error, t));
    } finally {
      if (ticket === requestRef.current) setSaving(false);
    }
  }

  // Why the switch cannot be used, in the person's own words. Null = it can.
  const reason = !capability
    ? null
    : !pilotOpen
      ? t("Sales is not open for this workspace yet. It is being opened workspace by workspace; until then this switch stays off.")
      : !canManage
        ? t("Only the workspace owner or an admin can change this.")
        : null;

  return (
    <div className="settings-card-stack settings-sales-page">
      <section className="card app-card">
        <SettingsCardHead
          title={t("Sales in the menu")}
          subtitle={t("Sales lists everything you have sold, from the orders you already have.")}
        />
        {loadError ? <p className="layout-error" role="alert">{loadError}</p> : null}
        {!capability && !loadError ? <p className="muted-copy">{t("Loading…")}</p> : null}
        {capability ? (
          <div className="settings-switch-list">
            <label className="settings-switch-line" data-testid="sales-menu-switch-line">
              <span className="settings-switch-line-copy">
                <strong>{t("Show Sales in the menu")}</strong>
                <small>{t("For everyone in this workspace who can see orders. Workflow Only members never see Sales.")}</small>
              </span>
              <input
                type="checkbox"
                className="settings-switch"
                role="switch"
                aria-checked={isOn}
                aria-label={t("Show Sales in the menu")}
                data-testid="sales-menu-switch"
                checked={isOn}
                disabled={disabled}
                onChange={event => { void toggle(event.target.checked); }}
              />
            </label>
          </div>
        ) : null}
        {reason ? <p className="settings-field-hint is-caution" data-testid="sales-menu-reason">{reason}</p> : null}
        {saveError ? <p className="layout-error" role="alert">{saveError}</p> : null}
        {saved ? <p className="success-copy" role="status">{saved}</p> : null}
        <p className="settings-field-hint">
          {t("This only adds or removes the menu item. It does not change who may open Sales: anyone who can see orders can still reach it at its address.")}
        </p>
      </section>
    </div>
  );
}

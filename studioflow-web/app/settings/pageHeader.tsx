"use client";

// The one page header every Settings section shares (design handoff, Sept
// 2026): eyebrow + title + one-sentence purpose on the left, the save state
// and the section's own actions on the right. Sections that want buttons in
// the header register them through the context instead of rendering their
// own header, so the composition stays identical across all seventeen screens.
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

export type SettingsHeaderStatus = "saved" | "dirty" | "saving" | "readonly" | null;

type HeaderActionsContextValue = { setActions: (node: ReactNode) => void };

export const SettingsHeaderActionsContext = createContext<HeaderActionsContextValue>({ setActions: () => undefined });

/** Registers `node` as the header's action group while the calling section is mounted. */
export function useSettingsHeaderActions(node: ReactNode, deps: unknown[]) {
  const { setActions } = useContext(SettingsHeaderActionsContext);
  const latest = useRef(node);
  latest.current = node;
  useEffect(() => {
    setActions(latest.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => setActions(null), [setActions]);
}

export function SettingsStatusPill({ status, labels }: { status: SettingsHeaderStatus; labels: { saved: string; dirty: string; saving: string; readonly: string } }) {
  if (!status) return null;
  const text = labels[status];
  return (
    <span className={`settings-status-pill is-${status}`} role="status" aria-live="polite">
      <span className="settings-status-pill-mark" aria-hidden="true">{status === "saved" ? "✓" : status === "dirty" ? "●" : status === "saving" ? "…" : "○"}</span>
      {text}
    </span>
  );
}

export function SettingsPageHeader({
  eyebrow,
  title,
  subtitle,
  status,
  statusLabels,
  actions,
  note
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  status?: SettingsHeaderStatus;
  statusLabels: { saved: string; dirty: string; saving: string; readonly: string };
  actions?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <header className="settings-page-header">
      <div className="settings-page-header-info">
        <p className="settings-page-breadcrumb">{eyebrow}</p>
        <div className="settings-page-title-row">
          <h2>{title}</h2>
        </div>
        {subtitle ? <p className="settings-page-subtitle">{subtitle}</p> : null}
      </div>
      <div className="settings-page-header-side">
        <SettingsStatusPill status={status ?? null} labels={statusLabels} />
        {actions ? <div className="settings-page-header-actions">{actions}</div> : null}
      </div>
      {note}
    </header>
  );
}

/** A card's heading: optional icon tile, title, one-line purpose, and something on the right. */
export function SettingsCardHead({ icon, title, subtitle, aside }: { icon?: ReactNode; title: string; subtitle?: string; aside?: ReactNode }) {
  return (
    <div className="settings-card-head">
      {icon ? <span className="settings-card-head-icon" aria-hidden="true">{icon}</span> : null}
      <div className="settings-card-head-copy">
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {aside ? <div className="settings-card-head-aside">{aside}</div> : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Settings had no dialog of its own: every confirmation was a window.confirm,
// which freezes the tab and can only ask yes/no. Discarding an edit needs three
// answers, and a bulk financial operation needs a whole impact preview, so both
// use this instead.

export type SettingsDialogAction = {
  label: string;
  onClick: () => void;
  tone?: "primary" | "danger" | "secondary";
  disabled?: boolean;
};

export function SettingsDialog({
  title,
  eyebrow,
  children,
  actions,
  onDismiss,
  wide = false
}: {
  title: string;
  eyebrow?: string;
  children?: ReactNode;
  actions: SettingsDialogAction[];
  onDismiss: () => void;
  wide?: boolean;
}) {
  const panel = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  // Escape is not enough on its own — a dialog the keyboard never reaches is a
  // dialog a keyboard user cannot answer.
  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>("button, [href], input, select, textarea");
    first?.focus();
  }, []);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <section
        className={wide ? "card app-card settings-dialog settings-dialog-wide" : "card app-card settings-dialog"}
        ref={panel}
      >
        <div className="add-order-header">
          <div>
            {eyebrow ? <p className="orders-kicker">{eyebrow}</p> : null}
            <h2>{title}</h2>
          </div>
        </div>
        {children ? <div className="settings-dialog-body">{children}</div> : null}
        <div className="settings-dialog-actions">
          {actions.map(action => (
            <button
              key={action.label}
              type="button"
              className={
                action.tone === "danger"
                  ? "button danger"
                  : action.tone === "primary"
                    ? "button"
                    : "button secondary"
              }
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

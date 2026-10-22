"use client";

// The app's own yes/no question (22 Oct 2026), in place of window.confirm on the
// Files screens. window.confirm is drawn by the browser: it cannot be themed or
// translated in its buttons, and embedded browsers (and test panes) may dismiss it
// on their own, which reads as "Cancel" with nothing on screen.
//
//   const [confirm, confirmDialog] = useAppConfirm(t);
//   if (!(await confirm({ message, confirmLabel: t("Delete"), danger: true }))) return;
//   ...render {confirmDialog} once in the component.
//
// Cancel, Escape and a click on the backdrop all answer "no". Focus starts on
// Cancel, so Enter alone never deletes.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type AppConfirmRequest = {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type Pending = AppConfirmRequest & { resolve: (answer: boolean) => void };

export function useAppConfirm(t: (text: string) => string): [(request: AppConfirmRequest) => Promise<boolean>, ReactNode] {
  const [pending, setPending] = useState<Pending | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const confirm = useCallback((request: AppConfirmRequest) => new Promise<boolean>(resolve => {
    returnFocusRef.current = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    setPending(current => {
      current?.resolve(false);
      return { ...request, resolve };
    });
  }), []);

  const answer = useCallback((value: boolean) => {
    setPending(current => {
      current?.resolve(value);
      return null;
    });
    returnFocusRef.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        answer(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, answer]);

  // A question left open when the component goes away is a "no".
  useEffect(() => () => { setPending(current => { current?.resolve(false); return null; }); }, []);

  const dialog = pending ? (
    <div className="app-confirm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) answer(false); }}>
      <div
        className="app-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
        aria-describedby="app-confirm-message"
        data-testid="app-confirm-dialog"
      >
        <h2 id="app-confirm-title">{pending.title || t("Are you sure?")}</h2>
        <p id="app-confirm-message">
          {pending.message.split("\n").map((line, index) => (
            <span key={index}>{index > 0 ? <br /> : null}{line}</span>
          ))}
        </p>
        <div className="app-confirm-actions">
          <button ref={cancelRef} type="button" className="inventory-secondary" data-testid="app-confirm-cancel" onClick={() => answer(false)}>
            {pending.cancelLabel || t("Cancel")}
          </button>
          <button
            type="button"
            className={pending.danger ? "inventory-primary app-confirm-danger" : "inventory-primary"}
            data-testid="app-confirm-ok"
            onClick={() => answer(true)}
          >
            {pending.confirmLabel || t("Continue")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return [confirm, dialog];
}

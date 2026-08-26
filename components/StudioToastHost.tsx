"use client";

// The app-wide toast surface both QA reports asked for: a quiet, transient
// confirmation ("Schedule updated", "Card moved") that can carry ONE action —
// almost always Undo. Fired from anywhere via dispatchStudioToast; the host
// lives once in AppShell so every screen gets it for free.

import { useEffect, useRef, useState } from "react";

export type StudioToastInput = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
};

type StudioToastItem = StudioToastInput & { id: number };

const TOAST_EVENT = "studioflow:toast";

export function dispatchStudioToast(toast: StudioToastInput) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<StudioToastInput>(TOAST_EVENT, { detail: toast }));
}

export function StudioToastHost() {
  const [toasts, setToasts] = useState<StudioToastItem[]>([]);
  const nextIdRef = useRef(1);

  useEffect(() => {
    function onToast(event: Event) {
      const detail = (event as CustomEvent<StudioToastInput>).detail;
      if (!detail || !detail.message) return;
      const id = nextIdRef.current++;
      // Newest at the end; keep the stack short — three at most.
      setToasts(current => [...current.slice(-2), { ...detail, id }]);
      window.setTimeout(() => {
        setToasts(current => current.filter(item => item.id !== id));
      }, Math.max(2500, detail.durationMs ?? 6500));
    }
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="studio-toast-stack" role="status" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} className="studio-toast">
          <span>{toast.message}</span>
          {toast.actionLabel && toast.onAction ? (
            <button
              type="button"
              onClick={() => {
                setToasts(current => current.filter(item => item.id !== toast.id));
                toast.onAction?.();
              }}
            >
              {toast.actionLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="studio-toast-close"
            aria-label="Dismiss"
            onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

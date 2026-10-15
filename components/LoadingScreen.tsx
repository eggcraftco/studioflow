"use client";

import { useContext, useEffect, useState } from "react";
import { AppShellMountedContext } from "@/components/AppShellMounted";
import { useAuth } from "@/lib/auth/AuthProvider";
import { BOOT_STALL_MS, retryBoot, signInAgain } from "@/lib/auth/bootRecovery";
import { studioT } from "@/lib/studioflow/language";
import { bootMark } from "@/lib/studioflow/bootTrace";

/**
 * Login/loading hang (15 Oct 2026): every wait in the app — the session, the workspace, a screen's own data —
 * shows this component, so this is where a wait is not allowed to last for ever. After BOOT_STALL_MS it keeps
 * loading but offers Retry (a fresh load, what a manual refresh did) and Sign in again.
 */
function useStalled() {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      bootMark("page:stall-shown");
      setStalled(true);
    }, BOOT_STALL_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return stalled;
}

function StallActions({ t }: { t: (text: string) => string }) {
  const [signingOut, setSigningOut] = useState(false);
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <div className="boot-stall" data-boot-stall="1" role="alert">
      <strong>{t("This is taking longer than usual.")}</strong>
      <span>
        {offline
          ? t("You appear to be offline. Check your connection, then try again.")
          : t("The connection to NivaDesk may have stalled. Try again — if it keeps happening, sign in again.")}
      </span>
      <span className="boot-stall-actions">
        <button type="button" className="button" onClick={retryBoot} disabled={signingOut}>
          {t("Retry")}
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void signInAgain();
          }}
        >
          {signingOut ? t("Signing out…") : t("Sign in again")}
        </button>
      </span>
    </div>
  );
}

export function LoadingScreen() {
  // Inside the app shell this is a page loading its own data after a sidebar
  // click: the shell stays on screen and the wait shows in the content column
  // (only once it lasts, see .app-content-loading). The full-screen cover below
  // made every navigation look like a reload.
  const insideShell = useContext(AppShellMountedContext);
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const stalled = useStalled();
  useEffect(() => {
    const kind = insideShell ? "in-shell" : "full-screen";
    bootMark("page:wait-start", kind);
    return () => bootMark("page:wait-end", kind);
  }, [insideShell]);
  if (insideShell) {
    return (
      <div className="app-content-loading" role="status" aria-live="polite" aria-busy="true">
        <p>{t("Loading your workspace…")}</p>
        {stalled ? <StallActions t={t} /> : null}
      </div>
    );
  }
  return (
    <main
      className="page-shell loading-screen-overlay"
      aria-live="polite"
      aria-busy="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        width: "100vw",
        padding: 24,
        background: "var(--app-bg, #f3f4f6)",
      }}
    >
      <section className="card" style={{ padding: 28, textAlign: "center", maxWidth: 420, width: "min(420px, 100%)" }}>
        <div className="pill">NivaDesk</div>
        <h1 style={{ margin: "18px 0 8px" }}>{t("Loading your workspace…")}</h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>{t("Checking your account access.")}</p>
        {stalled ? <StallActions t={t} /> : null}
      </section>
    </main>
  );
}

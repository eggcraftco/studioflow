"use client";

import { useContext } from "react";
import { AppShellMountedContext } from "@/components/AppShellMounted";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";

export function LoadingScreen() {
  // Inside the app shell this is a page loading its own data after a sidebar
  // click: the shell stays on screen and the wait shows in the content column
  // (only once it lasts, see .app-content-loading). The full-screen cover below
  // made every navigation look like a reload.
  const insideShell = useContext(AppShellMountedContext);
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  if (insideShell) {
    return (
      <div className="app-content-loading" role="status" aria-live="polite" aria-busy="true">
        <p>{t("Loading your workspace…")}</p>
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
      </section>
    </main>
  );
}

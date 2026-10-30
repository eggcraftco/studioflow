"use client";

// Calendar V1.1 — back from Google / Microsoft (https://nivadesk.app/oauth/calendar?code=…&state=…).
// A flow started in the apps (state "n.…") is handed straight to the app (nivadesk://oauth/calendar), which finishes it
// signed in. A web flow is finished here, signed in: the server refuses unless this person started it. The one-time
// code is taken out of the address bar at once and never logged.

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { finishCalendarConnect } from "@/lib/studioflow/calendarExternal";
import { studioT } from "@/lib/studioflow/language";

// Microsoft's answers that mean "an administrator of this organisation has to approve the app first" (work/school
// accounts). Passed on as one plain code, to the web message below and to the apps.
const ADMIN_CONSENT = /AADSTS(65001|90094|90095|90008)\b/;
const ADMIN_TEXT = "Your organisation has to approve NivaDesk before this Outlook account can be connected. Ask your IT administrator, or connect a personal Outlook account.";

function CalendarConnectReturn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [toApp, setToApp] = useState(false);
  // A phone browser may not follow the automatic hand-off to the app; then the person taps this link (same address).
  const [appLink, setAppLink] = useState("");
  const params = useRef<{ code: string; state: string; error: string } | null>(null);

  // Read once, then clear the address bar (the code is single-use, but it should not sit in history either).
  if (params.current === null && typeof window !== "undefined") {
    const error = searchParams.get("error") || "";
    params.current = { code: searchParams.get("code") || "", state: searchParams.get("state") || "", error: error && ADMIN_CONSENT.test(searchParams.get("error_description") || "") ? "admin_consent_required" : error };
  }

  useEffect(() => {
    const p = params.current;
    if (!p) return;
    if (p.state.startsWith("n.")) {
      setToApp(true);
      const q = new URLSearchParams({ state: p.state, ...(p.code ? { code: p.code } : {}), ...(p.error ? { error: p.error } : {}) });
      const link = `nivadesk://oauth/calendar?${q}`;
      setAppLink(link);
      window.history.replaceState(null, "", "/oauth/calendar");
      window.location.replace(link);
      return;
    }
    window.history.replaceState(null, "", "/oauth/calendar");
  }, []);

  useEffect(() => {
    const p = params.current;
    if (!p || p.state.startsWith("n.") || loading) return;
    if (!user) { setFailed(true); setMessage(t("Sign in to NivaDesk in this browser, then connect your calendar again from the Calendar page.")); return; }
    if (p.error || !p.code || !p.state) {
      setFailed(true);
      setMessage(p.error === "admin_consent_required" ? t(ADMIN_TEXT)
        : p.error === "access_denied" ? t("Calendar access was not allowed. Nothing was connected.") : t("The calendar provider did not return a sign-in code. Nothing was connected."));
      return;
    }
    let cancelled = false;
    setMessage(t("Finishing the calendar connection…"));
    finishCalendarConnect(p.state, p.code).then(
      (r) => {
        if (cancelled) return;
        setMessage(`${t("Calendar connected.")}${r.accountEmail ? ` (${r.accountEmail})` : ""}`);
        setTimeout(() => router.replace("/calendar"), 900);
      },
      (error) => {
        if (cancelled) return;
        setFailed(true);
        setMessage(error instanceof Error && error.message ? t(error.message) : t("Could not finish the calendar connection."));
      },
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  if (loading && !toApp) return <LoadingScreen />;
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <div aria-hidden="true" style={{ fontSize: 34 }}>📅</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "8px 0" }}>{t("Calendar")}</h1>
        <p role={failed ? "alert" : "status"} style={{ margin: 0, fontSize: 14, color: failed ? "#dc2626" : "inherit", fontWeight: failed ? 600 : 400 }}>
          {toApp ? t("Returning to the NivaDesk app… If nothing happens, open NivaDesk yourself.") : message || "…"}
        </p>
        {toApp && appLink ? <p style={{ marginTop: 14 }}><a className="button" href={appLink}>{t("Open NivaDesk")}</a></p> : null}
        {failed ? <p style={{ marginTop: 14 }}><a href="/calendar">{t("Back to the calendar")}</a></p> : null}
      </div>
    </main>
  );
}

export default function CalendarOAuthPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CalendarConnectReturn />
    </Suspense>
  );
}

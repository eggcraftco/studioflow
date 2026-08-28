"use client";

// OAuth return from Pandle (https://nivadesk.app/pandle/callback?code=…&state=…).
// Exchanges the code server-side, then lands the owner back on /bank.

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { functions } from "@/lib/firebase/client";
import { loadWorkspaceContext } from "@/lib/studioflow/firestore";
import { studioT } from "@/lib/studioflow/language";

function PandleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [message, setMessage] = useState<string>("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const oauthError = searchParams.get("error_description") || searchParams.get("error");
    let cancelled = false;
    (async () => {
      if (oauthError || !code || !state) {
        setFailed(true);
        setMessage(oauthError || t("Pandle did not return a sign-in code."));
        return;
      }
      setMessage(t("Finishing the Pandle connection…"));
      try {
        const workspace = await loadWorkspaceContext(user.uid);
        const callable = httpsCallable<Record<string, unknown>, { status: string; company?: string }>(functions, "pandleConnectFinish");
        const result = await callable({ companyId: workspace.id, code, state });
        if (cancelled) return;
        setMessage(result.data.company ? `${t("Pandle connected.")} (${result.data.company})` : t("Pandle connected."));
        setTimeout(() => router.replace("/bank"), 900);
      } catch (finishError) {
        if (cancelled) return;
        setFailed(true);
        setMessage(finishError instanceof Error ? finishError.message : t("Could not finish the Pandle connection."));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, searchParams]);

  if (loading) return <LoadingScreen />;
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div aria-hidden="true" style={{ fontSize: 34 }}>📒</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "8px 0" }}>Pandle</h1>
        <p style={{ margin: 0, fontSize: 14, color: failed ? "#dc2626" : "inherit", fontWeight: failed ? 600 : 400 }}>{message || "…"}</p>
        {failed ? (
          <button type="button" onClick={() => router.replace("/bank")}
            style={{ marginTop: 16, border: "1px solid rgba(120,120,140,0.3)", background: "transparent", color: "inherit", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            ← {t("Back to Bank Spending")}
          </button>
        ) : null}
      </div>
    </main>
  );
}

export default function PandleCallbackPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <PandleCallbackContent />
    </Suspense>
  );
}

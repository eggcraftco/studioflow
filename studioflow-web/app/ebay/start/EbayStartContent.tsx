"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { claimEbayConnectState, sealEbayTicket, setEbayNonceCookie } from "@/lib/studioflow/ebay";
import { ebayStartLoginHref } from "@/lib/studioflow/ebayScreenRules";
import { studioT } from "@/lib/studioflow/language";

// Where a connection begun in the Mac, iPhone or Android app becomes a browser
// flow (design §5.2).
//
// A native app cannot set a cookie in the system browser, so it never receives
// the browser-binding nonce and is never handed the authorize URL. It opens
// this page with the state instead. Here, in a real browser, the person who
// began the flow signs in, claims the state once, gets the nonce, and only then
// goes to eBay.
//
// A phished start link therefore fails twice over: the victim is not signed in
// as the uid that began the flow, and a member of another workspace who IS
// signed in is refused by the server for the same reason.

export function EbayStartContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const state = (searchParams.get("state") || "").trim();
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    // …and BACK here afterwards. This page is not an ordinary screen a seller can
    // re-open: it carries a single-use state with a ten-minute TTL that exists
    // only in this URL, and it is reached from the Mac, iPhone or Android app,
    // whose session is not the browser's — so a signed-out visit is the likely
    // case, not the odd one. Without the `?next=` the seller lands on Home with
    // no message and the whole flow is gone (design §5.2, which said this already).
    if (!user) { router.replace(ebayStartLoginHref(state)); return; }
    if (!state) { setError(t("The eBay sign-in link has expired or was already used. Start again.")); return; }
    let cancelled = false;
    (async () => {
      try {
        const result = await claimEbayConnectState(state);
        if (cancelled) return;
        if (!result?.authorizeUrl || !result?.ticket) { setError(t("eBay did not complete the connection. Try again.")); return; }
        // Both cookies are written in the browser that is about to be sent to
        // eBay, which is the whole point of this page: the nonce from here, and
        // the ticket by a response from our own origin, because a ticket cookie
        // must be HttpOnly and script cannot set one (design §5.5).
        setEbayNonceCookie(state, result.nonce);
        const sealed = await sealEbayTicket(result.ticket);
        if (cancelled) return;
        // Sealing failed: the seller is not sent to eBay at all. Nothing has
        // been consumed, and a flow whose return leg is already doomed would
        // otherwise manufacture a live code nothing on our side can invalidate.
        if (!sealed) { setError(t("eBay did not complete the connection. Try again.")); return; }
        window.location.href = result.authorizeUrl;
      } catch (err) {
        if (cancelled) return;
        const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
        setError(code.includes("permission-denied")
          ? t("This eBay connection was started by a different NivaDesk user.")
          : t("The eBay sign-in link has expired or was already used. Start again."));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, state]);

  if (loading) return <LoadingScreen />;
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "8px 0" }}>eBay</h1>
        <p style={{ margin: 0, fontSize: 14, color: error ? "#dc2626" : "inherit", fontWeight: error ? 600 : 400 }}>
          {error || t("Opening eBay…")}
        </p>
        {error ? (
          <p style={{ marginTop: 16 }}>
            <Link href="/settings?section=ebay" className="button">← {t("Back to Integrations")}</Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}

export default EbayStartContent;

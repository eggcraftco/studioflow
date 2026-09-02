"use client";

// Xero may send the owner's browser here when the app's redirect URI was
// registered as nivadesk.app/xero/callback. The code is exchanged on the
// server, never in the page: this forwards the whole query string to the
// Cloud Function that owns the exchange, and nothing else on the page runs.
import { useEffect } from "react";

const CALLBACK_FUNCTION = "https://europe-west2-eggcraft-studio.cloudfunctions.net/xeroOAuthCallback";

export default function XeroCallbackPage() {
  useEffect(() => {
    const search = window.location.search || "";
    window.location.replace(`${CALLBACK_FUNCTION}${search}`);
  }, []);
  return (
    <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" }}>
      <p style={{ opacity: 0.7 }}>Connecting Xero…</p>
    </main>
  );
}

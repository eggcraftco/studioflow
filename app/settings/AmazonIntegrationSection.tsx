"use client";

// Amazon as a connector: the owner connects one seller account through Amazon's
// own consent page, and the workspace gets status, a disconnect, and — when
// connecting is not possible yet — a straight answer about why.
//
// Three things here differ from the eBay panel, each on purpose:
//
//   * There is no Sync health card. capabilities.js records Amazon as
//     `healthInstrumented: false` — nothing calls touchHealth for it — so the
//     card would draw empty, which reads as "nothing to report" rather than
//     "not reported here". An empty card is worse than no card.
//
//   * Connect is gated on the mode the SERVER reports, never on a constant
//     here. A draft application can be authorised only by the developer's own
//     Primary User — Amazon's rule, not ours — so offering Connect to a
//     customer would open a consent screen that can never complete. When Amazon
//     publishes the application the zone starts reporting "published" and the
//     button enables itself, with nothing to deploy here.
//
//   * The seller is sent to Amazon only after the binding is sealed. If sealing
//     fails they do not travel: a flow that reaches Amazon anyway mints a live
//     authorization code whose return leg was always going to be refused.
//
// Nothing in this file ever sees a token, and the `ticket` is treated as the
// short-lived credential it is — handed straight to the seal and never logged,
// stored, or put in a URL.

import { useCallback, useEffect, useState } from "react";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { CardTitle } from "@/components/CardTitle";
import {
  beginAmazonConnect, getAmazonStatus, disconnectAmazon, sealAmazonTicket,
  amazonReasonText, amazonCallableErrorText, activeAmazonConnection, amazonStatusLabel,
  type AmazonAuthorizationMode, type AmazonConnection
} from "@/lib/studioflow/amazon";

type Props = { workspace: WorkspaceContext; language?: string };

function ago(ms: number, t: (s: string) => string): string {
  if (!ms) return "—";
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 90 * 1000) return t("Just now");
  if (diff < 90 * 60 * 1000) return `${Math.round(diff / 60000)} ${t("minutes ago")}`;
  if (diff < 36 * 60 * 60 * 1000) return `${Math.round(diff / 3600000)} ${t("hours ago")}`;
  return `${Math.round(diff / 86400000)} ${t("days ago")}`;
}

export function AmazonIntegrationSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const companyId = workspace.id.trim();
  const isOwner = workspace.role === "owner";
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<AmazonConnection[]>([]);
  // "" until the server has answered. Never assumed to be "published": that
  // reading is the one that turns an unknown into an offered consent screen.
  const [mode, setMode] = useState<AmazonAuthorizationMode>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const connection = activeAmazonConnection(connections);

  const refresh = useCallback(async (keepError = false) => {
    if (!companyId) return;
    try {
      const result = await getAmazonStatus(companyId);
      setConnections(result.connections);
      setMode(result.authorizationMode);
      if (!keepError) setError("");
    } catch (err) {
      // Never `err.message` alone: an undeployed callable answers 404 and
      // @firebase/functions makes the message the bare word `not-found`.
      setError(t(amazonCallableErrorText(err, "Could not load.")));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => { void refresh(); }, [refresh]);

  // The zone lands the seller back on /settings?section=integrations with
  // ?amazon=connected|error (&reason=…). Read once, then taken out of the
  // address bar so a reload does not repeat the message.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("amazon");
    if (!outcome) return;
    const reason = params.get("reason") || "";
    for (const key of ["amazon", "reason", "connection"]) params.delete(key);
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    if (outcome === "connected") setNotice(t("Amazon account connected."));
    else setError(t(amazonReasonText(reason)));
    void refresh(true);
  }, [t, refresh]);

  async function guard(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(""); setNotice("");
    try { await fn(); } catch (err) { setError(t(amazonCallableErrorText(err, "Could not load."))); } finally { setBusy(""); }
  }

  const startConnect = () => guard("connect", async () => {
    // Belt and braces: the button is disabled in this state, but a mode the
    // server did not confirm must never start a flow.
    if (mode !== "published") { setError(t("Connecting to Amazon is not available yet.")); return; }
    const result = await beginAmazonConnect(companyId);
    if (!result?.url || !result?.sealUrl || !result?.ticket) {
      setError(t("Amazon did not complete the connection. Try again."));
      return;
    }
    if (!(await sealAmazonTicket(result.sealUrl, result.ticket))) {
      setError(t("Amazon did not complete the connection. Try again."));
      return;
    }
    window.location.href = result.url;
  });

  if (loading) return <section className="card app-card"><p className="muted-copy">{t("Loading…")}</p></section>;

  const marketplaces = (connection?.marketplaces || []).filter((row) => row.participating);

  return (
    <>
      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="orders" eyebrow={t("Amazon")} title={t("Amazon orders")} />
        {error ? <p className="layout-error">{error}</p> : null}
        {notice ? <p className="success-copy">{notice}</p> : null}

        {connection ? (
          <>
            <p className="muted-copy">
              {t("Status")}: <strong>{t(amazonStatusLabel(connection))}</strong>
              {" · "}{t("Last checked")}: {ago(connection.lastSyncAtMs, t)}
            </p>
            {connection.needsReauth ? (
              <p className="layout-error">
                {t("Amazon access needs renewing. Reconnect to keep orders arriving.")}
              </p>
            ) : null}
            {marketplaces.length ? (
              <p className="muted-copy">
                {t("Amazon sites")}: {marketplaces.map((row) => row.countryCode).filter(Boolean).join(", ")}
              </p>
            ) : null}
            {isOwner && typeof connection.lastSyncOrders === "number" ? (
              <p className="muted-copy">
                {t("Orders brought in")}: <strong>{connection.lastSyncOrders}</strong>
                {connection.lastSyncRefused ? ` · ${t("Refused")}: ${connection.lastSyncRefused}` : ""}
                {connection.lastSyncAnomalies ? ` · ${t("Needs a look")}: ${connection.lastSyncAnomalies}` : ""}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="muted-copy">
              {t("Connect your Amazon seller account once; orders arrive on their own.")}
            </p>
            {/* The honest sentence, and deliberately not "Beta", "Coming soon"
                or "Early access": Amazon is a supported integration, and what is
                pending is Amazon's review of our application, not this feature. */}
            {mode === "draft" ? (
              <p className="muted-copy">
                {t("Amazon is still reviewing our application, so seller accounts cannot be connected yet. Nothing is needed from you — this page will let you connect as soon as the review finishes.")}
              </p>
            ) : null}
            {mode === "" ? (
              <p className="muted-copy">{t("Could not check whether Amazon is ready. Try again shortly.")}</p>
            ) : null}
            {isOwner ? (
              <div className="settings-action-row">
                <button type="button" className="button" disabled={busy === "connect" || mode !== "published"}
                  onClick={startConnect}>
                  {busy === "connect" ? t("Connecting…") : t("Connect Amazon")}
                </button>
              </div>
            ) : (
              <p className="muted-copy">{t("Only the workspace owner can connect Amazon.")}</p>
            )}
          </>
        )}
      </section>

      {connection && isOwner && connection.connectionId ? (
        <section className="card app-card quick-reply-settings-card">
          <h3>{t("Disconnect Amazon")}</h3>
          {confirmDisconnect ? (
            <>
              <p className="muted-copy">{t("Disconnect this Amazon account? Syncing stops and the stored Amazon access is destroyed. The orders already imported stay in this workspace.")}</p>
              <div className="settings-action-row">
                <button type="button" className="button" style={{ color: "#b91c1c" }} disabled={busy === "disconnect"}
                  onClick={() => guard("disconnect", async () => {
                    await disconnectAmazon(companyId, String(connection.connectionId));
                    setConfirmDisconnect(false);
                    setNotice(t("Amazon account disconnected. Your orders stay in NivaDesk."));
                    await refresh(true);
                  })}>
                  {t("Disconnect")}
                </button>
                <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(false)}>{t("Keep connected")}</button>
              </div>
            </>
          ) : (
            <div className="settings-action-row">
              <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(true)}>{t("Disconnect Amazon")}</button>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}

export default AmazonIntegrationSection;

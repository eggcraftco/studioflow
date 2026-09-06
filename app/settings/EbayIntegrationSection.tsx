"use client";

// eBay as a connector (design §11.4): the owner connects one seller account
// through eBay's own consent page, chooses how far back to import, and gets
// sync health, a Sync now, a resumable backfill and a disconnect. Nothing here
// ever sees a token, and no eBay error code ever reaches the screen — the maps
// in lib/studioflow/ebay.ts are the single place a code becomes a sentence.
//
// The card's state comes from the rows the server returns (`status`,
// `specStatus`), never from a local "I pressed Connect" flag: the status table
// lives once, on the server, and the three clients copy it.
import { useCallback, useEffect, useState } from "react";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { CardTitle } from "@/components/CardTitle";
import { CommerceSyncHealthCard } from "./CommerceSyncHealthCard";
import {
  beginEbayConnect, getEbayConnections, verifyEbayConnection, updateEbayConnectionSettings,
  previewEbayImport, runEbayImport, retryEbayImportFailures, syncEbayNow, disconnectEbay,
  setEbayNonceCookie, sealEbayTicket, ebayEventText, ebayReasonText, ebaySpecStatusText, ebayStatusLabel,
  type EbayConnection, type EbayImportPreview, type EbayImportResult
} from "@/lib/studioflow/ebay";
import { ebayCallableErrorText } from "@/lib/studioflow/ebayScreenRules";

type Props = { workspace: WorkspaceContext; language?: string };

const IMPORT_RANGES = [7, 30, 90];

function ago(ms: number, t: (s: string) => string): string {
  if (!ms) return "—";
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 90 * 1000) return t("Just now");
  if (diff < 90 * 60 * 1000) return `${Math.round(diff / 60000)} ${t("minutes ago")}`;
  if (diff < 36 * 60 * 60 * 1000) return `${Math.round(diff / 3600000)} ${t("hours ago")}`;
  return `${Math.round(diff / 86400000)} ${t("days ago")}`;
}

export function EbayIntegrationSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const companyId = workspace.id.trim();
  const isOwner = workspace.role === "owner";
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<EbayConnection[]>([]);
  const [configured, setConfigured] = useState(true);
  const [environment, setEnvironment] = useState("sandbox");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [sinceDays, setSinceDays] = useState(90);
  const [includeUnpaid, setIncludeUnpaid] = useState(false);
  const [includeCancelled, setIncludeCancelled] = useState(true);
  const [preview, setPreview] = useState<EbayImportPreview | null>(null);
  const [imported, setImported] = useState<EbayImportResult | null>(null);

  // A disconnected row is not a connection, so it is never the one on screen.
  const connection = connections.find((row) => row.status === "connected")
    || connections.find((row) => row.status !== "disconnected")
    || null;

  const refresh = useCallback(async (keepError = false) => {
    if (!companyId) return;
    try {
      const result = await getEbayConnections(companyId);
      setConnections(result.connections);
      setConfigured(result.configured);
      setEnvironment(result.environment);
      if (!keepError) setError("");
    } catch (err) {
      // Never `err.message` on its own: a callable that is not deployed answers
      // 404 and @firebase/functions makes the message the bare word `not-found`,
      // which is the one thing the header rule above forbids on this screen.
      setError(t(ebayCallableErrorText(err, "Could not load.")));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => { void refresh(); }, [refresh]);

  // The callback lands the seller back on /settings?section=ebay&ebay=…&reason=…
  // Read once, then taken out of the address bar so a reload does not repeat it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("ebay");
    if (!outcome) return;
    const reason = params.get("reason") || "";
    for (const key of ["ebay", "reason"]) params.delete(key);
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    if (outcome === "connected") setNotice(t("eBay account connected."));
    else if (outcome === "cancelled") setNotice(t("eBay connection cancelled. Nothing was changed."));
    else setError(t(ebayReasonText(reason)));
    void refresh(true);
  }, [t, refresh]);

  async function guard(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(""); setNotice("");
    try { await fn(); } catch (err) { setError(t(ebayCallableErrorText(err, "Could not load."))); } finally { setBusy(""); }
  }

  // Owner-only, and the one place the browser's two halves of the binding are
  // put in cookies before the seller leaves for eBay (design §5.5): the nonce
  // from here, and the ticket by a response from our own origin, because a
  // ticket cookie must be HttpOnly and script cannot set one.
  //
  // If sealing fails the seller is NOT sent to eBay. Nothing has been consumed —
  // no code exists yet and the state expires by TTL — whereas sending them on
  // when we already know the return leg will be refused manufactures a live
  // authorization code that nothing on our side can then invalidate.
  const startConnect = () => guard("connect", async () => {
    const result = await beginEbayConnect(companyId);
    if (!result?.authorizeUrl || !result?.ticket) { setError(t("eBay did not complete the connection. Try again.")); return; }
    setEbayNonceCookie(result.state, result.nonce);
    if (!(await sealEbayTicket(result.ticket))) { setError(t("eBay did not complete the connection. Try again.")); return; }
    window.location.href = result.authorizeUrl;
  });

  const stack = (children: React.ReactNode) => (
    <div className="settings-card-stack">
      {notice ? <p className="success-copy">{notice}</p> : null}
      {error ? <p className="layout-error">{error}</p> : null}
      {children}
    </div>
  );

  if (loading) return stack(<p className="muted-copy">{t("Loading…")}</p>);

  // Not a fault and not an error: this server has no eBay application wired up.
  if (!configured) {
    return stack(
      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="orders" eyebrow={t("eBay")} title={t("Connect your eBay account")} />
        <p className="muted-copy">{t("eBay is not set up on this server yet. Contact support and we will enable it.")}</p>
      </section>
    );
  }

  if (!connection) {
    return stack(
      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="orders" eyebrow={t("eBay")} title={t("Connect your eBay account")} />
        <p className="muted-copy">{t("Connect your eBay seller account once; orders, payments and refunds arrive on their own.")}</p>
        <p className="muted-copy">{t("NivaDesk will read your orders. It will not change listings, prices or stock.")}</p>
        {environment === "sandbox" ? <p className="muted-copy"><strong>{t("Sandbox — test orders only")}</strong></p> : null}
        <div className="settings-action-row">
          <button type="button" className="button" disabled={!isOwner || busy === "connect"} onClick={startConnect}>
            {busy === "connect" ? t("Opening eBay…") : t("Connect eBay")}
          </button>
        </div>
        <p className="muted-copy">{isOwner ? t("You will be sent to eBay to approve NivaDesk, then back here.") : t("Only the workspace owner can connect or disconnect an eBay account.")}</p>
      </section>
    );
  }

  const specStatus = connection.specStatus;
  const healthy = specStatus === "connected_read_only";
  const statusSentence = ebaySpecStatusText(specStatus, connection.lastErrorCode);
  const importDone = connection.importState === "done";
  const failedCount = connection.importCursor?.failedCount ?? 0;
  const importPaused = connection.importCursor !== null && connection.importCursor.complete === false;
  const settings = connection.settings;
  const saveSettings = (patch: Parameters<typeof updateEbayConnectionSettings>[2]) =>
    guard("settings", async () => { await updateEbayConnectionSettings(companyId, connection.id, patch); setNotice(t("Settings saved.")); await refresh(true); });

  return stack(
    <>
      <section className="card app-card quick-reply-settings-card">
        <h3>{connection.displayName || connection.sellerUsername || connection.sellerUserId}</h3>
        <p className="muted-copy">
          {t("eBay seller")} · {connection.environment === "sandbox" ? t("Sandbox") : t("Production")} · {t("Read only")}
        </p>
        <ul className="settings-rule-list">
          <li><span>{t("Connection")}</span><span className={`studio-pill${healthy ? " success" : ""}`}>{t(ebayStatusLabel(specStatus))}</span></li>
          <li><span>{t("eBay sites")}</span><span>{connection.marketplaces.filter((m) => m.enabled).map((m) => m.marketplace).join(", ") || "—"}</span></li>
          <li><span>{t("Last successful sync")}</span><span>{ago(connection.lastSuccessAtMs, t)}</span></li>
          <li><span>{t("Last full check")}</span><span>{ago(connection.lastFullReconciliationAtMs, t)}</span></li>
          <li><span>{t("Calls used today")}</span><span>{connection.quota.today} / {connection.quota.share}</span></li>
        </ul>
        {statusSentence ? <p className="layout-error">{t(statusSentence)}</p> : null}
        {connection.reauthorizeByMs > 0 && connection.lastErrorCode === "refresh_token_expiring" ? (
          <p className="layout-error">{t("Reconnect eBay before {date} to keep syncing.").replace("{date}", new Date(connection.reauthorizeByMs).toLocaleDateString())}</p>
        ) : null}
        <div className="settings-action-row">
          {connection.needsReconnect && isOwner ? (
            <button type="button" className="button" disabled={busy === "connect"} onClick={startConnect}>
              {busy === "connect" ? t("Opening eBay…") : t("Reconnect eBay")}
            </button>
          ) : null}
          <button type="button" className="button secondary" disabled={busy === "verify"}
            onClick={() => guard("verify", async () => {
              const result = await verifyEbayConnection(companyId, connection.id);
              if (result.healthy) setNotice(t("The eBay connection is working."));
              else setError(t(ebayReasonText(result.reason)));
              await refresh(true);
            })}>
            {busy === "verify" ? t("Checking…") : t("Check now")}
          </button>
          <button type="button" className="button secondary" disabled={busy === "sync" || connection.status !== "connected"}
            onClick={() => guard("sync", async () => {
              const result = await syncEbayNow(companyId, connection.id);
              setNotice(t("Synced: {created} new, {updated} updated, {held} held, {failed} failed")
                .replace("{created}", String(result.outcome.created)).replace("{updated}", String(result.outcome.updated))
                .replace("{held}", String(result.outcome.held)).replace("{failed}", String(result.outcome.failed)));
              await refresh(true);
            })}>
            {busy === "sync" ? t("Syncing…") : t("Sync now")}
          </button>
          <span className="muted-copy">{t("Sync now checks the last 24 hours.")}</span>
        </div>
        <p className="muted-copy">{t("Listings and stock stay managed on eBay.")}</p>
      </section>

      {isOwner && !importDone ? (
        <section className="card app-card quick-reply-settings-card">
          <CardTitle icon="docText" eyebrow={t("eBay")} title={t("Choose what to import")} />
          <p className="muted-copy">{t("Preview writes nothing. It counts the orders eBay has in the period and how many are already here.")}</p>
          <div className="settings-action-row">
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="muted-copy">{t("How far back")}</span>
              <select value={sinceDays} onChange={(e) => setSinceDays(Number(e.target.value) || 90)}
                style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid var(--border)", font: "inherit" }}>
                {IMPORT_RANGES.map((days) => (
                  <option key={days} value={days}>{t("{count} days").replace("{count}", String(days))}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={includeUnpaid} onChange={(e) => setIncludeUnpaid(e.target.checked)} />
              <span>{t("Include orders that are not paid yet")}</span>
            </label>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={includeCancelled} onChange={(e) => setIncludeCancelled(e.target.checked)} />
              <span>{t("Include cancelled orders")}</span>
            </label>
          </div>
          <div className="settings-action-row">
            <button type="button" className="button secondary" disabled={busy === "preview" || connection.status !== "connected"}
              onClick={() => guard("preview", async () => { setImported(null); setPreview(await previewEbayImport(companyId, connection.id, sinceDays)); })}>
              {busy === "preview" ? t("Checking…") : t("Preview")}
            </button>
            <button type="button" className="button" disabled={busy === "import" || connection.status !== "connected"}
              onClick={() => guard("import", async () => {
                setPreview(null);
                setImported(await runEbayImport(companyId, connection.id, sinceDays, { includeUnpaid, includeCancelled }));
                await refresh(true);
              })}>
              {busy === "import" ? t("Importing…") : t("Import")}
            </button>
          </div>
          {preview ? (
            <p className="muted-copy" style={{ marginTop: 8 }}>
              {t("Orders found")}: <strong>{preview.ordersFound}</strong>{preview.truncated ? ` (${t("estimate — more than {count} orders").replace("{count}", String(preview.ordersFound))})` : ""}
              {" · "}{t("Duplicate orders prevented")}: <strong>{preview.duplicatesPrevented}</strong>
              {" · "}{t("Not paid yet")}: {preview.unpaid}
              {" · "}{t("Cancelled")}: {preview.cancelled}
              {preview.marketplaces.length ? ` · ${t("eBay sites")}: ${preview.marketplaces.join(", ")}` : ""}
            </p>
          ) : null}
          {imported ? (
            <p className="success-copy">
              {t("Imported")}: {imported.outcome.created} · {t("Updated")}: {imported.outcome.updated}
              {imported.outcome.held ? ` · ${t("Held")}: ${imported.outcome.held}` : ""}
              {imported.outcome.failed ? ` · ${t("Failed")}: ${imported.outcome.failed}` : ""}
            </p>
          ) : null}
          {importPaused ? <p className="muted-copy">{t("Import paused — press Import again to continue.")}</p> : null}
          {failedCount > 0 ? (
            <div className="settings-action-row">
              <span className="layout-error">{t("{count} orders could not be imported.").replace("{count}", String(failedCount))}</span>
              <button type="button" className="button secondary" disabled={busy === "retry"}
                onClick={() => guard("retry", async () => {
                  const result = await retryEbayImportFailures(companyId, connection.id);
                  setNotice(t("{count} orders were brought in on the retry.").replace("{count}", String(result.recovered)));
                  await refresh(true);
                })}>
                {t("Retry")}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {isOwner ? (
        <section className="card app-card quick-reply-settings-card">
          <CardTitle icon="bolt" eyebrow={t("eBay")} title={t("What comes in")} />
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={settings.autoSync} disabled={busy === "settings"} onChange={(e) => void saveSettings({ settings: { autoSync: e.target.checked } })} />
              <span>{t("Check eBay for new and changed orders automatically")}</span>
            </label>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={settings.includeUnpaid} disabled={busy === "settings"} onChange={(e) => void saveSettings({ settings: { includeUnpaid: e.target.checked } })} />
              <span>{t("Include orders that are not paid yet")}</span>
            </label>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={settings.includeCancelled} disabled={busy === "settings"} onChange={(e) => void saveSettings({ settings: { includeCancelled: e.target.checked } })} />
              <span>{t("Include cancelled orders")}</span>
            </label>
          </div>
          {/* Only the sites this account has actually sold on are offered: a
              list of every eBay marketplace would be a guess about the seller. */}
          <h4 style={{ margin: "14px 0 6px" }}>{t("eBay sites")}</h4>
          {connection.marketplaces.length === 0 ? (
            <p className="muted-copy">{t("The eBay sites you sell on appear here after the first orders arrive.")}</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {connection.marketplaces.map((row) => (
                <label key={row.marketplace} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={row.enabled} disabled={busy === "settings"}
                    onChange={(e) => void saveSettings({ marketplaces: [{ marketplace: row.marketplace, enabled: e.target.checked }] })} />
                  <span>{row.marketplace}{row.currency ? ` · ${row.currency}` : ""}</span>
                </label>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <CommerceSyncHealthCard workspace={workspace} language={language} provider="ebay" />

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="orders" eyebrow={t("eBay")} title={t("Recent activity")} />
        {connection.recentEvents.length === 0 ? (
          <p className="muted-copy">{t("Nothing has happened on this connection yet.")}</p>
        ) : (
          <ul className="settings-rule-list">
            {connection.recentEvents.slice(0, 9).map((event, index) => (
              <li key={`${event.atMs}-${index}`}>
                <span>{t(ebayEventText(event.type))}</span>
                <span className="muted-copy">{ago(event.atMs, t)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner ? (
        <section className="card app-card quick-reply-settings-card">
          <h3>{t("Disconnect eBay")}</h3>
          {confirmDisconnect ? (
            <>
              <p className="muted-copy">{t("Disconnect this eBay account? Syncing stops and the stored eBay access is destroyed. The orders already imported stay in this workspace.")}</p>
              <div className="settings-action-row">
                <button type="button" className="button" style={{ color: "#b91c1c" }} disabled={busy === "disconnect"}
                  onClick={() => guard("disconnect", async () => {
                    await disconnectEbay(companyId, connection.id);
                    setConfirmDisconnect(false);
                    setNotice(t("eBay account disconnected. Your orders stay in NivaDesk."));
                    await refresh(true);
                  })}>
                  {t("Disconnect")}
                </button>
                <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(false)}>{t("Keep connected")}</button>
              </div>
            </>
          ) : (
            <div className="settings-action-row"><button type="button" className="button secondary" onClick={() => setConfirmDisconnect(true)}>{t("Disconnect eBay")}</button></div>
          )}
        </section>
      ) : null}
    </>
  );
}

export default EbayIntegrationSection;

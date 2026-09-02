"use client";

// Faz 4 — WooCommerce as a full connector (spec §8): the merchant types the
// store's address, approves NivaDesk at the store, and comes back to a
// connected store with its webhooks, its sync health, a Sync now, an import
// preview and a backfill. Nothing here ever sees a key.
import { useCallback, useEffect, useState } from "react";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { CardTitle } from "@/components/CardTitle";
import { CommerceSyncHealthCard } from "./CommerceSyncHealthCard";
import {
  beginWooConnect, finishWooConnect, getWooConnections, disconnectWooShop, syncWooNow, recreateWooWebhooks, previewWooImport, runWooImport,
  type WooConnection, type WooImportPreview, type WooImportResult
} from "@/lib/studioflow/woocommerce";

type Props = { workspace: WorkspaceContext; language?: string };

function ago(ms: number, t: (s: string) => string): string {
  if (!ms) return "—";
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 90 * 1000) return t("Just now");
  if (diff < 90 * 60 * 1000) return `${Math.round(diff / 60000)} ${t("minutes ago")}`;
  if (diff < 36 * 60 * 60 * 1000) return `${Math.round(diff / 3600000)} ${t("hours ago")}`;
  return `${Math.round(diff / 86400000)} ${t("days ago")}`;
}

export function WooCommerceIntegrationSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const companyId = workspace.id.trim();
  const isOwner = workspace.role === "owner";
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<WooConnection[]>([]);
  const [siteUrl, setSiteUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [days, setDays] = useState(30);
  const [preview, setPreview] = useState<WooImportPreview | null>(null);
  const [imported, setImported] = useState<WooImportResult | null>(null);
  const connection = connections.find((row) => row.status === "connected") || connections.find((row) => row.status !== "disconnected") || connections[0] || null;

  const refresh = useCallback(async (keepError = false) => {
    if (!companyId) return;
    try {
      setConnections(await getWooConnections(companyId));
      if (!keepError) setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not load."));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => { void refresh(); }, [refresh]);

  // The store sends the merchant back with ?woo=return&state=…&success=1|0.
  // Finish the connection once, say what happened, clean the address bar.
  useEffect(() => {
    if (typeof window === "undefined" || !companyId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("woo") !== "return") return;
    const state = params.get("state") || "";
    const success = params.get("success");
    for (const key of ["woo", "state", "success", "user_id"]) params.delete(key);
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    if (success === "0" || !state) { setNotice(t("WooCommerce connection cancelled. Nothing was changed.")); return; }
    setBusy("finish");
    finishWooConnect(companyId, state)
      .then((result) => {
        if (result.status === "connected") setNotice(t("WooCommerce store connected."));
        else setError(result.message || t("The store has not sent its keys yet. If you cancelled at the store, start again."));
      })
      .catch((err) => setError(err instanceof Error ? err.message : t("The WooCommerce connection could not be completed. Try connecting again.")))
      .finally(() => { setBusy(""); void refresh(true); });
  }, [companyId, refresh, t]);

  async function guard(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(""); setNotice("");
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : t("Could not load.")); } finally { setBusy(""); }
  }

  const stack = (children: React.ReactNode) => (
    <div className="settings-card-stack">
      {notice ? <p className="success-copy">{notice}</p> : null}
      {error ? <p className="layout-error">{error}</p> : null}
      {children}
    </div>
  );

  if (loading) return stack(<p className="muted-copy">{t("Loading…")}</p>);

  if (!connection || connection.status === "disconnected") {
    return stack(
      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="orders" eyebrow={t("WooCommerce")} title={t("Connect your store")} />
        <p className="muted-copy">{t("Enter your store's address and approve NivaDesk at your WooCommerce site. Orders, customers and status changes then sync automatically, and NivaDesk checks the store every fifteen minutes for anything a webhook missed.")}</p>
        <label style={{ display: "grid", gap: 6, maxWidth: 480 }}>
          <span className="muted-copy">{t("Store address")}</span>
          <input type="url" value={siteUrl} placeholder="https://your-store.com" onChange={(e) => setSiteUrl(e.target.value)} disabled={!isOwner || busy === "connect"}
            style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", font: "inherit" }} />
        </label>
        <div className="settings-action-row">
          <button type="button" className="button" disabled={!isOwner || busy === "connect" || !siteUrl.trim()}
            onClick={() => guard("connect", async () => {
              const result = await beginWooConnect(companyId, siteUrl.trim());
              if (result?.authorizeUrl) window.location.href = result.authorizeUrl;
            })}>
            {busy === "connect" ? t("Opening your store…") : t("Connect WooCommerce")}
          </button>
        </div>
        <p className="muted-copy">{isOwner ? t("Approve NivaDesk at your store, then you will be sent back here.") : t("Only the workspace owner can connect a store.")}</p>
      </section>
    );
  }

  const healthy = connection.status === "connected" && connection.webhooksHealthy;
  const statusLabel = connection.status === "connected" ? (healthy ? t("Healthy") : t("Needs attention")) : (connection.status === "needs_reconnect" ? t("Needs attention") : t("Connected"));

  return stack(
    <>
      <section className="card app-card quick-reply-settings-card">
        <h3>{connection.storeName || connection.host}</h3>
        <p className="muted-copy">{connection.siteUrl}{connection.permissions ? ` · ${t("Permissions")}: ${connection.permissions}` : ""}</p>
        <ul className="settings-rule-list">
          <li><span>{t("Connection")}</span><span className={`studio-pill${healthy ? " success" : ""}`}>{statusLabel}</span></li>
          <li>
            <span>{t("Webhooks")}</span>
            <span className="settings-action-row">
              <span className="studio-pill">{connection.webhooksHealthy ? t("Webhooks are healthy") : t("Needs attention")}</span>
              {!connection.webhooksHealthy && isOwner ? (
                <button type="button" className="button secondary" disabled={busy === "recreate"}
                  onClick={() => guard("recreate", async () => { await recreateWooWebhooks(companyId, connection.id); setNotice(t("Webhooks recreated.")); await refresh(true); })}>
                  {t("Recreate webhooks")}
                </button>
              ) : null}
            </span>
          </li>
          <li><span>{t("Last successful sync")}</span><span>{ago(connection.lastSuccessAtMs, t)}</span></li>
        </ul>
        {!connection.webhooksHealthy ? <p className="layout-error">{t("A webhook was switched off by WooCommerce. Recreate them to resume live sync.")}</p> : null}
        <div className="settings-action-row">
          <button type="button" className="button secondary" disabled={busy === "sync" || connection.status !== "connected"}
            onClick={() => guard("sync", async () => { await syncWooNow(companyId, connection.id); setNotice(t("Sync finished.")); await refresh(true); })}>
            {busy === "sync" ? t("Syncing…") : t("Sync now")}
          </button>
          <span className="muted-copy">{t("Sync now checks the last 24 hours.")}</span>
        </div>
      </section>

      <CommerceSyncHealthCard workspace={workspace} language={language} provider="woocommerce" />

      {isOwner ? (
        <section className="card app-card quick-reply-settings-card">
          <CardTitle icon="docText" eyebrow={t("Import")} title={t("Import preview")} />
          <p className="muted-copy">{t("Preview shows what an import would bring in; nothing is written.")} {t("Import brings in paid orders from the chosen days; a buyer's second payment joins their open order.")}</p>
          <div className="settings-action-row">
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="muted-copy">{t("Days")}</span>
              <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Math.min(365, Math.max(1, Number(e.target.value) || 30)))}
                style={{ width: 80, padding: "7px 10px", borderRadius: 10, border: "1px solid var(--border)", font: "inherit" }} />
            </label>
            <button type="button" className="button secondary" disabled={busy === "preview" || connection.status !== "connected"}
              onClick={() => guard("preview", async () => { setImported(null); setPreview(await previewWooImport(companyId, connection.id, days)); })}>
              {t("Preview")}
            </button>
            <button type="button" className="button" disabled={busy === "import" || connection.status !== "connected"}
              onClick={() => guard("import", async () => { setImported(await runWooImport(companyId, connection.id, days)); setPreview(null); await refresh(true); })}>
              {busy === "import" ? t("Importing…") : t("Import")}
            </button>
          </div>
          {preview ? (
            <div style={{ marginTop: 10 }}>
              <p className="muted-copy">
                {t("Orders found")}: {preview.summary.total} · {t("Paid")}: {preview.summary.paid} · {t("Unpaid")}: {preview.summary.unpaid} · {t("Cancelled")}: {preview.summary.cancelled} · {t("Already in NivaDesk")}: {preview.summary.alreadyHere}
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr>{["#", t("Status"), t("Total"), t("Customer")].map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
                  <tbody>{preview.sample.map((row) => (
                    <tr key={row.id}>
                      <td style={{ padding: "6px 8px" }}>{row.number}</td><td style={{ padding: "6px 8px" }}>{row.status || "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{row.total ? `${row.total} ${row.currency || ""}` : "—"}</td><td style={{ padding: "6px 8px" }}>{row.customer || "—"}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            </div>
          ) : null}
          {imported ? (
            <p className="success-copy">{t("Imported")}: {imported.created} · {t("Updated")}: {imported.updated} · {t("Skipped")}: {imported.skipped}{imported.merged ? ` · ${t("Payments")}: ${imported.merged}` : ""}{imported.held ? ` · ${t("Held")}: ${imported.held}` : ""}</p>
          ) : null}
        </section>
      ) : null}

      {isOwner ? (
        <section className="card app-card quick-reply-settings-card">
          <h3>{t("Disconnect WooCommerce")}</h3>
          {confirmDisconnect ? (
            <>
              <p className="muted-copy">{t("Disconnect this store? New orders stop arriving. Orders already imported stay in this workspace.")}</p>
              <div className="settings-action-row">
                <button type="button" className="button" style={{ color: "#b91c1c" }} disabled={busy === "disconnect"}
                  onClick={() => guard("disconnect", async () => { await disconnectWooShop(companyId, connection.id); setConfirmDisconnect(false); setNotice(t("Store disconnected.")); await refresh(true); })}>
                  {t("Disconnect")}
                </button>
                <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(false)}>{t("Keep connected")}</button>
              </div>
            </>
          ) : (
            <div className="settings-action-row"><button type="button" className="button secondary" onClick={() => setConfirmDisconnect(true)}>{t("Disconnect WooCommerce")}</button></div>
          )}
        </section>
      ) : null}
    </>
  );
}

export default WooCommerceIntegrationSection;

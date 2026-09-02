"use client";

// PayPal as a money feed: the owner pastes the client id and secret of the
// workspace's own PayPal app (Transaction Search enabled), NivaDesk proves
// them before writing anything, and from then on PayPal's payments, fees and
// refunds sit in Banking beside the bank's rows, with withdrawals matched to
// the statement so nothing is counted twice. The secret is stored encrypted
// and never shown again.
import { useCallback, useEffect, useState } from "react";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { CardTitle } from "@/components/CardTitle";
import {
  getPayPalConnections, paypalConnect, bankSyncNow, bankDisconnect, listProviderPayouts, matchPayoutToBank,
  type PayPalConnection, type PayPalEnvironment, type PayPalPayoutRow, type PayoutMatchSuggestion
} from "@/lib/studioflow/paypal";

type Props = { workspace: WorkspaceContext; language?: string };

function ago(date: Date | null, t: (s: string) => string): string {
  if (!date) return "—";
  const diff = Math.max(0, Date.now() - date.getTime());
  if (diff < 90 * 1000) return t("Just now");
  if (diff < 90 * 60 * 1000) return `${Math.round(diff / 60000)} ${t("minutes ago")}`;
  if (diff < 36 * 60 * 60 * 1000) return `${Math.round(diff / 3600000)} ${t("hours ago")}`;
  return `${Math.round(diff / 86400000)} ${t("days ago")}`;
}

export function PayPalIntegrationSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const companyId = workspace.id.trim();
  const isOwner = workspace.role === "owner";
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<PayPalConnection[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [environment, setEnvironment] = useState<PayPalEnvironment>("live");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [payouts, setPayouts] = useState<PayPalPayoutRow[] | null>(null);
  const [settle, setSettle] = useState<{ payoutId: string; data: PayoutMatchSuggestion } | null>(null);
  const connection = connections.find((row) => row.status === "linked") || connections[0] || null;

  const refresh = useCallback(async (keepError = false) => {
    if (!companyId) return;
    try { setConnections(await getPayPalConnections(companyId)); if (!keepError) setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : t("Could not load.")); }
    finally { setLoading(false); }
  }, [companyId, t]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function guard(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(""); setNotice("");
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : t("Could not load.")); } finally { setBusy(""); }
  }

  const connectForm = (
    <div style={{ display: "grid", gap: 10, maxWidth: 560 }}>
      <p className="muted-copy">{t("In the PayPal Developer dashboard create an app under Live (or Sandbox to try), enable Transaction Search on it, then paste its Client ID and Secret here. NivaDesk stores the secret encrypted and only ever reads.")}</p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {(["live", "sandbox"] as PayPalEnvironment[]).map((env) => (
          <label key={env} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="radio" name="paypal-env" checked={environment === env} onChange={() => setEnvironment(env)} disabled={!isOwner || busy === "connect"} />
            {env === "live" ? t("Live") : t("Sandbox")}
          </label>
        ))}
      </div>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
        <span>{t("Client ID")}</span>
        <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={!isOwner || busy === "connect"} autoComplete="off" spellCheck={false} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
        <span>{t("Secret")}</span>
        <input className="input" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} disabled={!isOwner || busy === "connect"} autoComplete="new-password" spellCheck={false} />
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="button" disabled={!isOwner || busy === "connect" || !clientId.trim() || !clientSecret.trim()}
          onClick={() => guard("connect", async () => {
            const out = await paypalConnect(companyId, clientId.trim(), clientSecret.trim(), environment);
            setClientSecret(""); setShowForm(false);
            setNotice(out.reconnected ? t("PayPal credentials refreshed.") : `${t("PayPal connected.")} ${t("Imported")}: ${out.imported}`);
            await refresh(true);
          })}>{busy === "connect" ? t("Checking with PayPal…") : (connection ? t("Save new credentials") : t("Connect PayPal"))}</button>
        {connection && showForm ? <button type="button" className="button secondary" onClick={() => { setShowForm(false); setClientSecret(""); }}>{t("Cancel")}</button> : null}
      </div>
      <p className="muted-copy" style={{ fontSize: 12 }}>{t("The first sync takes the last six months; after that PayPal is read with every bank refresh, and withdrawals to your bank are matched to the statement so nothing is counted twice.")}</p>
    </div>
  );

  return (
    <div className="settings-card-stack">
      {notice ? <p className="settings-notice" style={{ color: "#16a34a", fontWeight: 600 }}>{notice}</p> : null}
      {error ? <p className="settings-notice" style={{ color: "#dc2626", fontWeight: 600 }}>{error}</p> : null}
      {loading ? <p className="muted-copy">{t("Loading...")}</p> : !connection || connection.status === "disconnected" ? (
        <section className="settings-card">
          <CardTitle icon="bolt" eyebrow="PayPal" title={t("Connect your PayPal account")} />
          {isOwner ? connectForm : <p className="muted-copy">{t("Only the workspace owner can connect PayPal.")}</p>}
        </section>
      ) : (
        <>
          <section className="settings-card">
            <CardTitle icon="bolt" eyebrow="PayPal" title={connection.providerName} />
            <ul className="settings-facts">
              <li>{t("Connection")} <strong style={{ color: connection.syncState === "ok" ? "#16a34a" : "#dc2626" }}>{connection.syncState === "ok" ? t("Healthy") : connection.syncState === "needs_reconsent" ? t("Credentials rejected") : t("Sync error")}</strong></li>
              <li>{t("App")} {connection.clientIdHint || "—"}{connection.environment === "sandbox" ? ` · ${t("Sandbox")}` : ""}{connection.accountNumber ? ` · ${connection.accountNumber}` : ""}</li>
              <li>{t("Last sync")} {ago(connection.lastSyncedAt, t)}</li>
              {connection.lastSyncError ? <li style={{ color: "#dc2626" }}>{connection.lastSyncError}</li> : null}
            </ul>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" className="button" disabled={!isOwner || busy === "sync"} onClick={() => guard("sync", async () => { const out = await bankSyncNow(companyId); setNotice(`${t("Sync finished.")} ${t("Imported")}: ${out.imported}`); await refresh(true); })}>{busy === "sync" ? t("Syncing…") : t("Sync now")}</button>
              {isOwner ? <button type="button" className="button secondary" onClick={() => setShowForm((v) => !v)}>{t("Enter new credentials")}</button> : null}
              <a className="button secondary" href="/bank">{t("Open Banking page")}</a>
            </div>
            {showForm ? <div style={{ marginTop: 12 }}>{connectForm}</div> : null}
          </section>

          <section className="settings-card">
            <CardTitle icon="orders" eyebrow={t("Finance")} title={t("PayPal withdrawals")} />
            <p className="muted-copy">{t("Money PayPal sent to your bank. Each withdrawal is matched to the bank row it landed in, so the same sales are never counted twice.")}</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" className="button secondary" disabled={busy === "payouts"} onClick={() => guard("payouts", async () => setPayouts((await listProviderPayouts(companyId, "paypal")).payouts))}>{t("Load")}</button>
            </div>
            {payouts ? (payouts.length === 0 ? <p className="muted-copy">{t("No withdrawals yet.")}</p> : (
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr>{[t("Date"), t("Amount"), t("Bank")].map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
                  <tbody>{payouts.map((row) => (
                    <tr key={row.id}>
                      <td style={{ padding: "6px 8px" }}>{row.arrivalDate || "—"}</td>
                      <td style={{ padding: "6px 8px" }}><strong>{row.amount ?? "—"} {row.currency || ""}</strong></td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        {row.bankMatch?.transactionId ? (
                          <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ {t("Matched")}{row.bankMatch.bookingDate ? ` · ${row.bankMatch.bookingDate}` : ""}
                            {isOwner ? <button type="button" className="link-button" style={{ marginLeft: 8, fontWeight: 400 }} disabled={busy === `settle:${row.id}`} onClick={() => guard(`settle:${row.id}`, async () => { await matchPayoutToBank(companyId, "paypal", row.id, "unlink"); setNotice(t("Payout unlinked.")); setSettle(null); setPayouts((await listProviderPayouts(companyId, "paypal")).payouts); })}>{t("Unlink")}</button> : null}
                          </span>
                        ) : (
                          <span>{t("Not matched")}
                            {isOwner ? <button type="button" className="link-button" style={{ marginLeft: 8 }} disabled={busy === `settle:${row.id}`} onClick={() => guard(`settle:${row.id}`, async () => setSettle({ payoutId: row.id, data: await matchPayoutToBank(companyId, "paypal", row.id, "suggest") }))}>{t("Find bank row")}</button> : null}
                          </span>
                        )}
                      </td>
                    </tr>))}</tbody>
                </table>
              </div>
            )) : null}
            {settle ? (
              <div style={{ marginTop: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <strong>{t("Bank row")} · {settle.data.payout.amount ?? "—"} {settle.data.payout.currency || ""}{settle.data.payout.arrivalDate ? ` · ${t("Arrival")} ${settle.data.payout.arrivalDate}` : ""}</strong>
                  <button type="button" className="link-button" onClick={() => setSettle(null)}>{t("Close")}</button>
                </div>
                {settle.data.candidates.length === 0 ? <p className="muted-copy" style={{ marginTop: 6 }}>{t("No bank row of this amount arrived in the window.")}</p> : (
                  <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 6 }}>
                    {settle.data.candidates.map((c) => (
                      <li key={c.transactionId} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
                        <span>{c.bookingDate || "—"}</span>
                        <span style={{ flex: "1 1 220px" }}>{c.counterparty || c.description || "—"}</span>
                        <strong>{c.amount} {c.currency || ""}</strong>
                        <span className="muted-copy">{t("Score")} {c.score}</span>
                        {c.free ? <button type="button" className="button secondary" style={{ padding: "2px 10px" }} disabled={busy === `settle:${settle.payoutId}`} onClick={() => guard(`settle:${settle.payoutId}`, async () => { await matchPayoutToBank(companyId, "paypal", settle.payoutId, "confirm", c.transactionId); setNotice(t("Payout matched to the bank row.")); setSettle(null); setPayouts((await listProviderPayouts(companyId, "paypal")).payouts); })}>{t("Match")}</button> : <span className="muted-copy">{t("Already classified")}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </section>

          {isOwner ? (
            <section className="settings-card">
              <CardTitle icon="bolt" eyebrow="PayPal" title={t("Disconnect PayPal")} />
              {confirmDisconnect ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <p className="muted-copy">{t("Disconnect PayPal? The stored credentials are removed and new rows stop arriving. Rows already imported stay in Banking.")}</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="button danger" disabled={busy === "disconnect"} onClick={() => guard("disconnect", async () => { await bankDisconnect(companyId, connection.id, "disconnect"); setConfirmDisconnect(false); setNotice(t("PayPal disconnected.")); setPayouts(null); await refresh(true); })}>{t("Disconnect")}</button>
                    <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(false)}>{t("Keep connected")}</button>
                  </div>
                </div>
              ) : <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(true)}>{t("Disconnect PayPal")}</button>}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

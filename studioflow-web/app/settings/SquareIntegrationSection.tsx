"use client";

// Square as a connector (Square spec §16): the owner connects the merchant
// once through Square's consent page, chooses which locations and which
// kinds of sale become NivaDesk orders, and gets sync health, a Sync now, an
// import preview, a backfill and the unmatched-payment review queue. Nothing
// here ever sees a token.
import { useCallback, useEffect, useState } from "react";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { CardTitle } from "@/components/CardTitle";
import { CommerceSyncHealthCard } from "./CommerceSyncHealthCard";
import {
  beginSquareConnect, getSquareConnections, updateSquareConnectionSettings, disconnectSquare, syncSquareNow, previewSquareImport, runSquareImport, listSquareUnmatched, listSquarePayouts, auditSquareOrders, matchSquarePayoutToBank,
  type SquareConnection, type SquareImportPolicy, type SquareImportPreview, type SquareImportResult, type SquareUnmatchedRow, type SquarePayoutRow, type SquareAuditReport, type SquarePayoutMatchSuggestion
} from "@/lib/studioflow/square";

type Props = { workspace: WorkspaceContext; language?: string };

const SOURCES: { id: string; label: string }[] = [
  { id: "SQUARE_POS", label: "Square Point of Sale" }, { id: "SQUARE_ONLINE", label: "Square Online" }, { id: "INVOICE", label: "Square Invoices" },
  { id: "APPOINTMENTS", label: "Square Appointments" }, { id: "VIRTUAL_TERMINAL", label: "Virtual Terminal" }, { id: "API", label: "API" }, { id: "OTHER", label: "Other" }
];

function ago(ms: number, t: (s: string) => string): string {
  if (!ms) return "—";
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 90 * 1000) return t("Just now");
  if (diff < 90 * 60 * 1000) return `${Math.round(diff / 60000)} ${t("minutes ago")}`;
  if (diff < 36 * 60 * 60 * 1000) return `${Math.round(diff / 3600000)} ${t("hours ago")}`;
  return `${Math.round(diff / 86400000)} ${t("days ago")}`;
}

export function SquareIntegrationSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const companyId = workspace.id.trim();
  const isOwner = workspace.role === "owner";
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<SquareConnection[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [days, setDays] = useState(90);
  const [preview, setPreview] = useState<SquareImportPreview | null>(null);
  const [imported, setImported] = useState<SquareImportResult | null>(null);
  const [unmatched, setUnmatched] = useState<{ payments: SquareUnmatchedRow[]; refunds: SquareUnmatchedRow[] } | null>(null);
  const [payouts, setPayouts] = useState<SquarePayoutRow[] | null>(null);
  const [audit, setAudit] = useState<SquareAuditReport | null>(null);
  // Faz 5: the bank side of one payout while the owner is resolving it.
  const [settle, setSettle] = useState<{ payoutId: string; data: SquarePayoutMatchSuggestion } | null>(null);
  const connection = connections.find((row) => row.status === "connected") || connections.find((row) => row.status !== "disconnected") || connections[0] || null;

  const refresh = useCallback(async (keepError = false) => {
    if (!companyId) return;
    try {
      setConnections(await getSquareConnections(companyId));
      if (!keepError) setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not load."));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Square sends the merchant back through our callback with ?square=connected|cancelled|error.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("square");
    if (!outcome) return;
    const reason = params.get("reason") || "";
    for (const key of ["square", "reason"]) params.delete(key);
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    if (outcome === "connected") setNotice(t("Square account connected."));
    else if (outcome === "cancelled") setNotice(t("Square connection cancelled. Nothing was changed."));
    else setError(reason === "state" ? t("This connection attempt has expired. Start again.") : t("The Square connection could not be completed. Try connecting again."));
  }, [t]);

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
        <CardTitle icon="orders" eyebrow={t("Square")} title={t("Connect your Square account")} />
        <p className="muted-copy">{t("Sign in to Square once and approve read-only access. Sales from Square Point of Sale, Square Online and Square Invoices, with their payments and refunds, then arrive on their own, and NivaDesk checks Square every fifteen minutes for anything a webhook missed.")}</p>
        <div className="settings-action-row">
          <button type="button" className="button" disabled={!isOwner || busy === "connect"}
            onClick={() => guard("connect", async () => {
              const result = await beginSquareConnect(companyId);
              if (result?.authorizeUrl) window.location.href = result.authorizeUrl;
            })}>
            {busy === "connect" ? t("Opening Square…") : t("Connect Square")}
          </button>
        </div>
        <p className="muted-copy">{isOwner ? t("You will be sent to Square to approve NivaDesk, then back here.") : t("Only the workspace owner can connect a Square account.")}</p>
      </section>
    );
  }

  const healthy = connection.status === "connected" && !connection.lastErrorCode;
  const statusLabel = connection.status === "connected" ? (healthy ? t("Healthy") : t("Needs attention")) : (connection.status === "reconnect_required" ? t("Reconnect required") : t("Connected"));
  const settings = connection.settings;
  const policyOptions: { id: SquareImportPolicy; label: string; hint: string }[] = [
    { id: "fulfillment_only", label: t("Sales with a shipment, pickup or delivery"), hint: t("Recommended. Quick counter sales stay in finance only.") },
    { id: "all", label: t("Every sale"), hint: t("Every Square sale becomes a NivaDesk order.") },
    { id: "none", label: t("None"), hint: t("Record sales for finance only; create no orders.") }
  ];
  const save = (patch: Parameters<typeof updateSquareConnectionSettings>[2]) => guard("settings", async () => { await updateSquareConnectionSettings(companyId, connection.id, patch); setNotice(t("Settings saved.")); await refresh(true); });

  return stack(
    <>
      <section className="card app-card quick-reply-settings-card">
        <h3>{connection.merchantName || connection.merchantId}</h3>
        <p className="muted-copy">{t("Square merchant")} · {connection.environment === "sandbox" ? t("Sandbox") : t("Production")} · {t("Read only")} · Square-Version {connection.apiVersion}</p>
        <ul className="settings-rule-list">
          <li><span>{t("Connection")}</span><span className={`studio-pill${healthy ? " success" : ""}`}>{statusLabel}</span></li>
          <li><span>{t("Locations")}</span><span>{connection.locations.filter((l) => l.selected).map((l) => l.name || l.id).join(", ") || "—"}</span></li>
          <li><span>{t("Last successful sync")}</span><span>{ago(connection.lastSuccessAtMs, t)}</span></li>
          <li><span>{t("Missed-event recovery")}</span><span className="studio-pill">{connection.eventsRecovery ? t("On (Events API, 28 days)") : t("Off")}</span></li>
          {connection.unmatchedPayments ? <li><span>{t("Issues")}</span><span className="studio-pill">{connection.unmatchedPayments} {t("unmatched payments")}</span></li> : null}
        </ul>
        {connection.status === "reconnect_required" ? <p className="layout-error">{t("Square has withdrawn NivaDesk's access. Connect again to resume sync.")}</p> : null}
        {connection.lastErrorCode === "location_inactive" ? <p className="layout-error">{t("A selected location is no longer active at Square. Past orders are kept; review the locations below.")}</p> : null}
        <div className="settings-action-row">
          {connection.status === "reconnect_required" && isOwner ? (
            <button type="button" className="button" disabled={busy === "connect"}
              onClick={() => guard("connect", async () => { const result = await beginSquareConnect(companyId); if (result?.authorizeUrl) window.location.href = result.authorizeUrl; })}>
              {t("Reconnect Square")}
            </button>
          ) : null}
          <button type="button" className="button secondary" disabled={busy === "sync" || connection.status !== "connected"}
            onClick={() => guard("sync", async () => { const r = await syncSquareNow(companyId, connection.id); setNotice(`${t("Sync finished.")} ${t("Orders")}: ${r.scanned} · ${t("Payments")}: ${r.payments?.scanned ?? 0}`); await refresh(true); })}>
            {busy === "sync" ? t("Syncing…") : t("Sync now")}
          </button>
          <span className="muted-copy">{t("Sync now checks the last 24 hours.")}</span>
        </div>
      </section>

      <CommerceSyncHealthCard workspace={workspace} language={language} provider="square" />

      {isOwner ? (
        <section className="card app-card quick-reply-settings-card">
          <CardTitle icon="bolt" eyebrow={t("Square")} title={t("What comes in")} />
          <p className="muted-copy">{t("Choose the locations to import and which sales become NivaDesk orders. Every sale is recorded for finance either way.")}</p>
          <h4 style={{ margin: "10px 0 6px" }}>{t("Locations")}</h4>
          <div style={{ display: "grid", gap: 6 }}>
            {connection.locations.map((loc) => (
              <label key={loc.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={loc.selected} disabled={busy === "settings"}
                  onChange={(e) => {
                    const next = new Set(connection.selectedLocationIds);
                    if (e.target.checked) next.add(loc.id); else next.delete(loc.id);
                    if (!next.size) { setError(t("Select at least one location.")); return; }
                    void save({ selectedLocationIds: [...next] });
                  }} />
                <span>{loc.name || loc.id}</span>
                {loc.status !== "ACTIVE" ? <span className="studio-pill">{t("Inactive")}</span> : null}
              </label>
            ))}
          </div>
          <h4 style={{ margin: "14px 0 6px" }}>{t("Which sales become orders")}</h4>
          <div style={{ display: "grid", gap: 6 }}>
            {policyOptions.map((opt) => (
              <label key={opt.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input type="radio" name="square-policy" checked={settings.importPolicy === opt.id} disabled={busy === "settings"} onChange={() => void save({ importPolicy: opt.id })} />
                <span><strong>{opt.label}</strong><br /><span className="muted-copy">{opt.hint}</span></span>
              </label>
            ))}
          </div>
          <h4 style={{ margin: "14px 0 6px" }}>{t("Square sources")}</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {SOURCES.map((src) => (
              <label key={src.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={settings.importSources.includes(src.id)} disabled={busy === "settings"}
                  onChange={(e) => {
                    const next = new Set(settings.importSources);
                    if (e.target.checked) next.add(src.id); else next.delete(src.id);
                    if (!next.size) { setError(t("Select at least one Square source.")); return; }
                    void save({ importSources: [...next] });
                  }} />
                <span>{t(src.label)}</span>
              </label>
            ))}
          </div>
          <div className="settings-action-row" style={{ marginTop: 12 }}>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={settings.autoSync} disabled={busy === "settings"} onChange={(e) => void save({ autoSync: e.target.checked })} />
              <span>{t("Create orders from new sales automatically")}</span>
            </label>
          </div>
          <p className="muted-copy">{t("Two-way inventory and taking payments through Square are not on yet; this connection reads only.")}</p>
        </section>
      ) : null}

      {isOwner ? (
        <section className="card app-card quick-reply-settings-card">
          <CardTitle icon="docText" eyebrow={t("Import")} title={t("Import preview")} />
          <p className="muted-copy">{t("Preview shows what an import would bring in; nothing is written.")} {t("Import brings in sales from the chosen days under the policy above.")}</p>
          <div className="settings-action-row">
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="muted-copy">{t("Days")}</span>
              <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Math.min(365, Math.max(1, Number(e.target.value) || 90)))}
                style={{ width: 80, padding: "7px 10px", borderRadius: 10, border: "1px solid var(--border)", font: "inherit" }} />
            </label>
            <button type="button" className="button secondary" disabled={busy === "preview" || connection.status !== "connected"}
              onClick={() => guard("preview", async () => { setImported(null); setPreview(await previewSquareImport(companyId, connection.id, days)); })}>
              {t("Preview")}
            </button>
            <button type="button" className="button" disabled={busy === "import" || connection.status !== "connected"}
              onClick={() => guard("import", async () => { setImported(await runSquareImport(companyId, connection.id, days)); setPreview(null); await refresh(true); })}>
              {busy === "import" ? t("Importing…") : t("Import")}
            </button>
          </div>
          {preview ? (
            <div style={{ marginTop: 10 }}>
              <p className="muted-copy">
                {t("Sales found")}: {preview.summary.total} · {t("Would become orders")}: {preview.summary.wouldCreate} · {t("Finance only")}: {preview.summary.financeOnly} · {t("Cancelled")}: {preview.summary.cancelled} · {t("Already in NivaDesk")}: {preview.summary.alreadyHere}
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr>{["#", t("Source"), t("Location"), t("Status"), t("Total"), t("Customer"), t("Order")].map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
                  <tbody>{preview.sample.map((row) => (
                    <tr key={row.id}>
                      <td style={{ padding: "6px 8px" }}>{row.number}</td><td style={{ padding: "6px 8px" }}>{row.source || "—"}</td><td style={{ padding: "6px 8px" }}>{row.location || "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{row.status || "—"}</td><td style={{ padding: "6px 8px" }}>{row.total ? `${row.total} ${row.currency || ""}` : "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{row.customer || "—"}</td><td style={{ padding: "6px 8px" }}>{row.wouldCreate ? t("Yes") : t("Finance only")}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            </div>
          ) : null}
          {imported ? (
            <p className="success-copy">{t("Imported")}: {imported.created} · {t("Updated")}: {imported.updated} · {t("Skipped")}: {imported.skipped}{imported.held ? ` · ${t("Held")}: ${imported.held}` : ""}</p>
          ) : null}
        </section>
      ) : null}

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="orders" eyebrow={t("Review")} title={t("Unmatched Square payments")} />
        <p className="muted-copy">{t("Payments and refunds Square reported for sales NivaDesk holds no order for. They are kept for finance and never turned into orders on their own.")}</p>
        <div className="settings-action-row">
          <button type="button" className="button secondary" disabled={busy === "unmatched"} onClick={() => guard("unmatched", async () => setUnmatched(await listSquareUnmatched(companyId)))}>{t("Load")}</button>
        </div>
        {unmatched ? (
          unmatched.payments.length + unmatched.refunds.length === 0 ? <p className="muted-copy">{t("Nothing to review.")}</p> : (
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead><tr>{[t("Type"), t("Square ID"), t("Status"), t("Amount"), t("Card"), t("Date")].map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {unmatched.payments.map((row) => (
                    <tr key={`p-${row.id}`}><td style={{ padding: "6px 8px" }}>{t("Payment")}</td><td style={{ padding: "6px 8px" }}>{row.externalId}</td><td style={{ padding: "6px 8px" }}>{row.status}</td><td style={{ padding: "6px 8px" }}>{row.total || row.amount || "—"} {row.currency || ""}</td><td style={{ padding: "6px 8px" }}>{row.cardBrand ? `${row.cardBrand} ${row.last4 || ""}` : (row.sourceType || "—")}</td><td style={{ padding: "6px 8px" }}>{row.at ? new Date(row.at).toLocaleString() : "—"}</td></tr>
                  ))}
                  {unmatched.refunds.map((row) => (
                    <tr key={`r-${row.id}`}><td style={{ padding: "6px 8px" }}>{t("Refund")}</td><td style={{ padding: "6px 8px" }}>{row.externalId}</td><td style={{ padding: "6px 8px" }}>{row.status}</td><td style={{ padding: "6px 8px" }}>{row.amount || "—"} {row.currency || ""}</td><td style={{ padding: "6px 8px" }}>—</td><td style={{ padding: "6px 8px" }}>{row.at ? new Date(row.at).toLocaleString() : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>

      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="orders" eyebrow={t("Finance")} title={t("Square payouts")} />
        <p className="muted-copy">{t("What Square sent to your bank, explained: gross sales, refunds, fees and adjustments per payout. A payout is not a payment; the two are kept apart.")}</p>
        <div className="settings-action-row">
          <button type="button" className="button secondary" disabled={busy === "payouts"} onClick={() => guard("payouts", async () => setPayouts((await listSquarePayouts(companyId)).payouts))}>{t("Load")}</button>
        </div>
        {payouts ? (
          payouts.length === 0 ? <p className="muted-copy">{t("No payouts yet.")}</p> : (
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead><tr>{[t("Date"), t("Status"), t("Gross"), t("Refunds"), t("Fees"), t("Net"), t("Bank")].map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
                <tbody>{payouts.map((row) => (
                  <tr key={row.id}>
                    <td style={{ padding: "6px 8px" }}>{row.arrivalDate || (row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—")}</td>
                    <td style={{ padding: "6px 8px" }}>{row.status}{row.reconciled ? "" : ` · ${t("Needs attention")}`}</td>
                    <td style={{ padding: "6px 8px" }}>{row.totals.gross ?? "—"}</td><td style={{ padding: "6px 8px" }}>{row.totals.refunds ?? "—"}</td><td style={{ padding: "6px 8px" }}>{row.totals.fee ?? "—"}</td>
                    <td style={{ padding: "6px 8px" }}><strong>{row.amount ?? row.totals.net ?? "—"} {row.currency || ""}</strong></td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      {row.bankMatch?.transactionId ? (
                        <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ {t("Matched")}{row.bankMatch.bookingDate ? ` · ${row.bankMatch.bookingDate}` : ""}
                          {isOwner ? <button type="button" className="link-button" style={{ marginLeft: 8, fontWeight: 400 }} disabled={busy === `settle:${row.id}`} onClick={() => guard(`settle:${row.id}`, async () => { await matchSquarePayoutToBank(companyId, row.id, "unlink"); setNotice(t("Payout unlinked.")); setSettle(null); setPayouts((await listSquarePayouts(companyId)).payouts); })}>{t("Unlink")}</button> : null}
                        </span>
                      ) : (
                        <span>{t("Not matched")}
                          {isOwner ? <button type="button" className="link-button" style={{ marginLeft: 8 }} disabled={busy === `settle:${row.id}`} onClick={() => guard(`settle:${row.id}`, async () => setSettle({ payoutId: row.id, data: await matchSquarePayoutToBank(companyId, row.id, "suggest") }))}>{t("Find bank row")}</button> : null}
                        </span>
                      )}
                    </td>
                  </tr>))}</tbody>
              </table>
            </div>
          )
        ) : null}
        {settle ? (
          <div style={{ marginTop: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <strong>{t("Bank row")} · {settle.data.payout.amount ?? "—"} {settle.data.payout.currency || ""}{settle.data.payout.arrivalDate ? ` · ${t("Arrival")} ${settle.data.payout.arrivalDate}` : ""}{settle.data.window ? ` · ${settle.data.window.from} → ${settle.data.window.to}` : ""}</strong>
              <button type="button" className="link-button" onClick={() => setSettle(null)}>{t("Close")}</button>
            </div>
            {settle.data.candidates.length === 0 ? <p className="muted-copy" style={{ marginTop: 6 }}>{t("No bank row of this amount arrived in the window.")}</p> : (
              <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 6 }}>
                {settle.data.candidates.map((c) => (
                  <li key={c.transactionId} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{c.bookingDate || "—"}</span>
                    <span style={{ flex: "1 1 220px" }}>{c.counterparty || c.description || "—"}{c.counterparty && c.description ? <span className="muted-copy"> · {c.description}</span> : null}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}><strong>{c.amount} {c.currency || ""}</strong></span>
                    <span className="muted-copy">{t("Score")} {c.score}{c.reasons.some((r) => r.startsWith("shift_")) ? ` · ${t("Same amount, another day.")}` : ""}</span>
                    {c.free ? (
                      <button type="button" className="button secondary" style={{ padding: "2px 10px" }} disabled={busy === `settle:${settle.payoutId}`} onClick={() => guard(`settle:${settle.payoutId}`, async () => { await matchSquarePayoutToBank(companyId, settle.payoutId, "confirm", c.transactionId); setNotice(t("Payout matched to the bank row.")); setSettle(null); setPayouts((await listSquarePayouts(companyId)).payouts); })}>{t("Match")}</button>
                    ) : <span className="muted-copy">{t("Already classified")}</span>}
                  </li>
                ))}
              </ul>
            )}
            {settle.data.near.length ? (
              <div style={{ marginTop: 8 }}>
                <p className="muted-copy" style={{ margin: 0 }}>{t("Nearby amounts (a fee or FX leg):")}</p>
                <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0", display: "grid", gap: 4, opacity: 0.7, fontSize: 12.5 }}>
                  {settle.data.near.map((c) => <li key={c.transactionId}>{c.bookingDate || "—"} · {c.counterparty || c.description || "—"} · {c.amount} {c.currency || ""}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {isOwner ? (
        <section className="card app-card quick-reply-settings-card">
          <CardTitle icon="check" eyebrow={t("Audit")} title={t("Missing order audit")} />
          <p className="muted-copy">{t("Compares Square's orders from the chosen days with what NivaDesk holds: as an order, as a finance-only sale, or not at all.")}</p>
          <div className="settings-action-row">
            <button type="button" className="button secondary" disabled={busy === "audit" || connection.status !== "connected"} onClick={() => guard("audit", async () => setAudit(await auditSquareOrders(companyId, connection.id, days)))}>{busy === "audit" ? t("Checking…") : t("Run audit")}</button>
            <span className="muted-copy">{t("Days")}: {days}</span>
          </div>
          {audit ? (
            <div style={{ marginTop: 8 }}>
              <p className="muted-copy">{t("At Square")}: {audit.atSquare} · {t("As orders")}: {audit.asOrders} · {t("Finance only")}: {audit.financeOnly} · {t("Missing")}: {audit.missing} · {t("Not selected")}: {audit.notSelected}{audit.truncated ? ` · ${t("Truncated")}` : ""}</p>
              {audit.missing === 0 ? <p className="success-copy">{t("Nothing is missing.")}</p> : (
                <>
                  <p className="layout-error">{t("These Square orders are not in NivaDesk. Sync now or Import brings them in.")}</p>
                  <p className="muted-copy" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{audit.missingIds.join(", ")}</p>
                </>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {isOwner ? (
        <section className="card app-card quick-reply-settings-card">
          <h3>{t("Disconnect Square")}</h3>
          {confirmDisconnect ? (
            <>
              <p className="muted-copy">{t("Disconnect this Square account? NivaDesk's access is revoked at Square and new sales stop arriving. Orders and payments already imported stay in this workspace.")}</p>
              <div className="settings-action-row">
                <button type="button" className="button" style={{ color: "#b91c1c" }} disabled={busy === "disconnect"}
                  onClick={() => guard("disconnect", async () => { await disconnectSquare(companyId, connection.id); setConfirmDisconnect(false); setNotice(t("Square account disconnected.")); await refresh(true); })}>
                  {t("Disconnect")}
                </button>
                <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(false)}>{t("Keep connected")}</button>
              </div>
            </>
          ) : (
            <div className="settings-action-row"><button type="button" className="button secondary" onClick={() => setConfirmDisconnect(true)}>{t("Disconnect Square")}</button></div>
          )}
        </section>
      ) : null}
    </>
  );
}

export default SquareIntegrationSection;

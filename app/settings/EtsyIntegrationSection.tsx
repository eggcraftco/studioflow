"use client";

// Settings → Integrations → Etsy.
//
// The flow follows the agreed screens in order: explain before connecting,
// verify on return, preview before importing anything, then a sync centre the
// seller can read at a glance. Two rules from the brief shape it:
//
//   * Nothing is imported until the owner has seen the list. The preview is
//     not a courtesy, it is the gate — and it writes nothing.
//   * A technical code never reaches the screen. The server sends codes; the
//     sentences live in lib/studioflow/etsy.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import {
  beginEtsyConnect,
  disconnectEtsyShop,
  etsyErrorText,
  etsyEventText,
  etsyReviewReasonText,
  getEtsyConnections,
  previewEtsyImport,
  resolveEtsyCustomerMatch,
  runEtsyImport,
  syncEtsyNow,
  verifyEtsyConnection,
  type EtsyConnection,
  type EtsyImportRules,
  type EtsyPreview,
  type EtsyPreviewRow
} from "@/lib/studioflow/etsy";

type Props = { workspace: WorkspaceContext; language?: string };

const DATE_RANGES = [
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last 12 months" }
];

function relativeTime(ms: number, t: (text: string) => string): string {
  if (!ms) return t("Never");
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return t("Just now");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? t("minute ago") : t("minutes ago")}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? t("hour ago") : t("hours ago")}`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? t("day ago") : t("days ago")}`;
}

function money(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "GBP" }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function EtsyIntegrationSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const companyId = workspace.id.trim();

  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [connections, setConnections] = useState<EtsyConnection[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const [rules, setRules] = useState<EtsyImportRules>({
    sinceDays: 90,
    includeCompleted: false,
    includeCancelled: false,
    includeDigital: false,
    includeUnpaid: false
  });
  const [preview, setPreview] = useState<EtsyPreview | null>(null);
  const [onlyReview, setOnlyReview] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [openMatch, setOpenMatch] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  // "Healthy" is a claim about right now, so it has to be earned by asking
  // Etsy. A stored status only changes when a sync happens to run and fail:
  // access revoked an hour ago still reads as fine until then. Until a check
  // answers, the row says Connected — which is a fact — rather than Healthy.
  const [liveCheck, setLiveCheck] = useState<"unknown" | "healthy" | "unhealthy">("unknown");
  const [checkOnArrival, setCheckOnArrival] = useState(false);

  // A workspace can connect more than one Etsy shop, and the hub counts them.
  // Showing only the first made every shop after it unreachable: counted on the
  // card, absent from the screen, with no way to sync or disconnect it.
  const [selectedId, setSelectedId] = useState("");
  const connection = connections.find((row) => row.id === selectedId) || connections[0] || null;

  const refresh = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await getEtsyConnections(companyId);
      setConnections(Array.isArray(data.connections) ? data.connections : []);
      setConfigured(data.configured !== false);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("The Etsy connection could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const checkConnection = useCallback(async () => {
    const current = connections.find((row) => row.id === selectedId) || connections[0];
    if (!current) return;
    const result = await verifyEtsyConnection(companyId, current.id);
    if (result?.healthy) {
      setLiveCheck("healthy");
      setNotice(t("Etsy answered. This connection is working."));
      return;
    }
    setLiveCheck("unhealthy");
    setError(
      etsyErrorText(String(result?.reason || ""), t) ||
        t("Etsy did not accept this connection. Reconnect the shop to continue.")
    );
    // The stored status may now disagree with what Etsy just said.
    await refresh();
  }, [companyId, connections, refresh, t]);

  // The OAuth callback sends the seller back with ?etsy=connected|cancelled|error.
  // Read it once, say what happened in words, then clean the address bar so a
  // refresh does not repeat the message.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("etsy");
    if (!outcome) return;
    if (outcome === "connected") {
      setNotice(t("Etsy shop connected. Choose what to import."));
      setCheckOnArrival(true);
    }
    else if (outcome === "cancelled") setNotice(t("Etsy connection cancelled. Nothing was changed."));
    else if (params.get("reason") === "no_shop") {
      // The most likely first-connect failure by a wide margin: the seller signs
      // in with the Etsy account they buy from rather than the one that owns
      // the shop. Etsy tells us exactly that, so say it rather than making them
      // guess from "something went wrong".
      setError(t("That Etsy account does not have a shop. Sign in to Etsy with the account that owns your shop, then connect again."));
    }
    else setError(t("The Etsy connection could not be completed. Try connecting again."));
    params.delete("etsy");
    params.delete("shop");
    params.delete("reason");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    void refresh();
  }, [refresh, t]);

  // The screen promises to verify on return. Do it once, as soon as the
  // connection this callback created has actually loaded.
  useEffect(() => {
    if (!checkOnArrival || !connections[0]) return;
    setCheckOnArrival(false);
    setBusy("verify");
    void checkConnection().catch(() => {}).finally(() => setBusy(""));
  }, [checkOnArrival, connections, checkConnection]);

  async function guard(key: string, run: () => Promise<void>) {
    setBusy(key);
    setError("");
    // The last action's green line has nothing to say about this one, and
    // leaving it there puts a success message directly above the error that
    // contradicts it.
    setNotice("");
    try {
      await run();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t("Something went wrong. Try again."));
    } finally {
      setBusy("");
    }
  }

  const selectedIds = useMemo(() => {
    if (!preview) return [] as string[];
    return preview.rows
      .filter((row) => row.outcome !== "unsupported" && !excluded.has(row.receiptId))
      .map((row) => row.receiptId);
  }, [preview, excluded]);

  const shownRows = useMemo(() => {
    if (!preview) return [] as EtsyPreviewRow[];
    return onlyReview ? preview.rows.filter((row) => row.outcome !== "ready") : preview.rows;
  }, [preview, onlyReview]);

  if (loading) return <p className="muted-copy">{t("Loading…")}</p>;

  if (!configured) {
    return (
      <section className="card app-card quick-reply-settings-card">
        <h3>{t("Etsy")}</h3>
        <p className="muted-copy">{t("Etsy is not set up on this server yet. Contact support and we will enable it.")}</p>
      </section>
    );
  }

  const shopPicker =
    connections.length > 1 ? (
      <section className="card app-card quick-reply-settings-card">
        <h4 className="quick-reply-settings-label">{t("Connected shops")}</h4>
        <div className="settings-action-row">
          {connections.map((row) => (
            <button
              key={row.id}
              type="button"
              className={row.id === (connection?.id || "") ? "button" : "button secondary"}
              onClick={() => {
                setSelectedId(row.id);
                // Everything below belongs to the shop that was showing.
                setPreview(null);
                setExcluded(new Set());
                setLiveCheck("unknown");
                setConfirmDisconnect(false);
                setNotice("");
                setError("");
              }}
            >
              {row.shopName || row.shopId}
            </button>
          ))}
        </div>
      </section>
    ) : null;

  // ── Screen 2 · Before connecting ──────────────────────────────────────────
  if (!connection || connection.status === "disconnected") {
    return (
      <div className="settings-card-stack">
        {notice ? <p className="success-copy">{notice}</p> : null}
        {error ? <p className="layout-error">{error}</p> : null}
        <section className="card app-card quick-reply-settings-card">
          <h3>{t("Secure Etsy connection")}</h3>
          <p className="muted-copy">{t("Your Etsy password is never shared with NivaDesk.")}</p>
          <ul className="settings-rule-list">
            <li>
              <span>{t("Read authorised sales data")}</span>
              <span className="studio-pill">{t("Included")}</span>
            </li>
            <li>
              <span>{t("Import line items and variations")}</span>
              <span className="studio-pill">{t("Included")}</span>
            </li>
            <li>
              <span>{t("Edit listings or Etsy checkout")}</span>
              <span className="studio-pill">{t("Not allowed")}</span>
            </li>
          </ul>
          <h4 className="quick-reply-settings-label">{t("Privacy summary")}</h4>
          <p className="muted-copy">
            {t("NivaDesk stores authorised connection tokens securely, uses data only for the connected workspace, and lets the owner disconnect at any time.")}
          </p>
          <p className="muted-copy">
            {t("Disconnecting does not delete the orders already in NivaDesk.")}
          </p>
          <div className="settings-action-row">
            <button
              type="button"
              className="button"
              disabled={busy === "connect"}
              onClick={() =>
                guard("connect", async () => {
                  const result = await beginEtsyConnect(companyId);
                  if (result?.authorizeUrl) window.location.href = result.authorizeUrl;
                })
              }
            >
              {busy === "connect" ? t("Opening Etsy…") : t("Continue to Etsy")}
            </button>
          </div>
        </section>
      </div>
    );
  }

  // What the server knows, which is what Reconnect exists for.
  const storedNeedsReconnect = connection.needsReconnect || connection.status === "needs_reconnect";
  // What the row says, which also reflects a live check that just failed.
  const needsAttention = storedNeedsReconnect || liveCheck === "unhealthy";
  // Connected is a fact: we hold access. Healthy is a claim about this
  // moment, so only a live answer from Etsy earns that word.
  const connectionLabel = needsAttention
    ? t("Needs attention")
    : liveCheck === "healthy"
      ? t("Healthy")
      : t("Connected");

  return (
    <div className="settings-card-stack">
      {notice ? <p className="success-copy">{notice}</p> : null}
      {error ? <p className="layout-error">{error}</p> : null}

      {shopPicker}

      {/* ── Screen 3 · Connected shop header ─────────────────────────────── */}
      <section className="card app-card quick-reply-settings-card">
        <h3>{connection.shopName || t("Etsy shop")}</h3>
        <p className="muted-copy">
          {`${t("Shop ID")} ${connection.shopId}`}
          {connection.shopCurrency ? ` · ${connection.shopCurrency}` : ""}
        </p>
        <ul className="settings-rule-list">
          <li>
            <span>{t("Connection")}</span>
            <span className="settings-action-row">
              <span className="studio-pill">{connectionLabel}</span>
              {/* Hidden on a stored needs_reconnect, where Reconnect is the
                  right action — but never hidden because a live check just
                  failed. Etsy has bad minutes; that would leave the one button
                  that can clear the state behind the state it set. */}
              {storedNeedsReconnect ? null : (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy === "verify"}
                  onClick={() => guard("verify", checkConnection)}
                >
                  {busy === "verify" ? t("Checking Etsy…") : t("Check now")}
                </button>
              )}
            </span>
          </li>
          <li>
            <span>{t("Granted scope")}</span>
            <span className="studio-pill">{t("Sales read")}</span>
          </li>
          <li>
            <span>{t("Last successful sync")}</span>
            <span>{relativeTime(connection.lastSuccessAtMs, t)}</span>
          </li>
        </ul>
      </section>

      {/* ── Screen 7 · Error recovery ────────────────────────────────────── */}
      {needsAttention ? (
        <section className="card app-card quick-reply-settings-card">
          <h3>{t("Connection needs attention")}</h3>
          <p>{t("We could not refresh this Etsy connection.")}</p>
          <p className="muted-copy">
            {etsyErrorText(connection.lastErrorCode, t) ||
              t("The shop owner may have revoked access, or Etsy may require authorisation again. Existing NivaDesk orders are safe.")}
          </p>
          <ul className="settings-rule-list">
            <li>
              <span>{t("Last successful sync")}</span>
              <span>{relativeTime(connection.lastSuccessAtMs, t)}</span>
            </li>
            <li>
              <span>{t("Existing imported records")}</span>
              <span className="studio-pill">{t("Safe")}</span>
            </li>
          </ul>
          <div className="settings-action-row">
            <button
              type="button"
              className="button"
              disabled={busy === "connect"}
              onClick={() =>
                guard("connect", async () => {
                  const result = await beginEtsyConnect(companyId);
                  if (result?.authorizeUrl) window.location.href = result.authorizeUrl;
                })
              }
            >
              {t("Reconnect Etsy")}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy === "sync"}
              onClick={() =>
                guard("sync", async () => {
                  // A button offered to fix something has to say whether it
                  // did. This one ran and reported nothing either way.
                  const result = await syncEtsyNow(companyId, connection.id);
                  const created = Number(result?.outcome?.created || 0);
                  const updated = Number(result?.outcome?.updated || 0);
                  setNotice(
                    created || updated
                      ? `${created} ${t("imported")} · ${updated} ${t("updated")}`
                      : t("Etsy answered. This connection is working.")
                  );
                  setLiveCheck("healthy");
                  await refresh();
                })
              }
            >
              {t("Try again")}
            </button>
          </div>
        </section>
      ) : null}

      {/* ── Screen 4 · First import, and Screen 5 · Sync centre ──────────── */}
      {!preview ? (
        <section className="card app-card quick-reply-settings-card">
          <h3>{connection.importState === "none" ? t("Choose what to import") : t("Etsy sync")}</h3>

          {connection.importState !== "none" ? (
            <>
              <p className="muted-copy">
                {`${t("Last checked")} ${relativeTime(connection.lastSyncAtMs, t)}`}
                {connection.importedOrders ? ` · ${connection.importedOrders} ${t("orders imported")}` : ""}
              </p>
              {connection.recentEvents && connection.recentEvents.length ? (
                <ul className="settings-rule-list">
                  {connection.recentEvents.slice(0, 6).map((event, index) => (
                    <li key={`${event.atMs}-${index}`}>
                      <span>
                        {etsyEventText(event, t)}
                      </span>
                      <span className="muted-copy">{relativeTime(event.atMs, t)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-copy">{t("No Etsy activity yet.")}</p>
              )}
            </>
          ) : null}

          <h4 className="quick-reply-settings-label">{t("Date range")}</h4>
          <div className="settings-action-row">
            {DATE_RANGES.map((range) => (
              <button
                key={range.days}
                type="button"
                className={rules.sinceDays === range.days ? "button" : "button secondary"}
                onClick={() => setRules((current) => ({ ...current, sinceDays: range.days }))}
              >
                {t(range.label)}
              </button>
            ))}
          </div>

          <h4 className="quick-reply-settings-label">{t("Order states")}</h4>
          <label className="settings-toggle-row">
            <input type="checkbox" checked readOnly />
            <span>{t("Paid and open orders")}</span>
          </label>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={rules.includeCompleted === true}
              onChange={(event) => setRules((current) => ({ ...current, includeCompleted: event.target.checked }))}
            />
            <span>{t("Completed orders")}</span>
          </label>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={rules.includeUnpaid === true}
              onChange={(event) => setRules((current) => ({ ...current, includeUnpaid: event.target.checked }))}
            />
            <span>{t("Orders not paid yet")}</span>
          </label>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={rules.includeCancelled === true}
              onChange={(event) => setRules((current) => ({ ...current, includeCancelled: event.target.checked }))}
            />
            <span>{t("Cancelled orders")}</span>
          </label>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={rules.includeDigital === true}
              onChange={(event) => setRules((current) => ({ ...current, includeDigital: event.target.checked }))}
            />
            <span>{t("Digital-only orders")}</span>
          </label>

          <div className="settings-action-row">
            <button
              type="button"
              className="button"
              disabled={busy === "preview"}
              onClick={() =>
                guard("preview", async () => {
                  const result = await previewEtsyImport(companyId, connection.id, rules);
                  setPreview(result);
                  setExcluded(new Set());
                })
              }
            >
              {busy === "preview" ? t("Checking Etsy…") : t("Preview")}
            </button>
            {connection.importState !== "none" ? (
              <button
                type="button"
                className="button secondary"
                disabled={busy === "sync"}
                onClick={() =>
                  guard("sync", async () => {
                    const result = await syncEtsyNow(companyId, connection.id);
                    const created = Number(result?.outcome?.created || 0);
                    const updated = Number(result?.outcome?.updated || 0);
                    const failed = Number(result?.outcome?.failed || 0);
                    const held = Number(result?.outcome?.held || 0);
                    // "Everything is already up to date" was said whenever
                    // nothing was created or updated — including a run where
                    // every order failed. Report what actually happened.
                    if (failed) {
                      setError(`${failed} ${t("could not be imported. The sync log below says why.")}`);
                    }
                    const good = [
                      created || updated ? `${created} ${t("imported")} · ${updated} ${t("updated")}` : "",
                      held ? `${held} ${t("are waiting for room on your plan.")}` : ""
                    ].filter(Boolean).join(" · ");
                    if (good) setNotice(good);
                    else if (!failed) setNotice(t("Everything is already up to date."));
                    await refresh();
                  })
                }
              >
                {busy === "sync" ? t("Checking Etsy…") : t("Sync now")}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── Import preview ───────────────────────────────────────────────── */}
      {preview ? (
        <section className="card app-card quick-reply-settings-card">
          <h3>{t("Review Etsy orders")}</h3>
          <p className="muted-copy">{t("Nothing is imported until the workspace owner confirms this list.")}</p>

          <div className="settings-impact-grid">
            <div>
              <strong>{preview.summary.found}</strong>
              <span className="muted-copy">{t("Orders found")}</span>
            </div>
            <div>
              <strong>{preview.summary.ready}</strong>
              <span className="muted-copy">{t("Ready")}</span>
            </div>
            <div>
              <strong>{preview.summary.review}</strong>
              <span className="muted-copy">{t("Needs review")}</span>
            </div>
            <div>
              <strong>{preview.summary.unsupported}</strong>
              <span className="muted-copy">{t("Unsupported records")}</span>
            </div>
          </div>

          {preview.summary.alreadyImported ? (
            <p className="muted-copy">
              {`${preview.summary.alreadyImported} ${t("of these are already in NivaDesk and will be updated, not duplicated.")}`}
            </p>
          ) : null}
          {preview.truncated ? (
            <p className="muted-copy">{t("Only the most recent orders are shown. Import these first, then run the preview again.")}</p>
          ) : null}

          <label className="settings-toggle-row">
            <input type="checkbox" checked={onlyReview} onChange={(event) => setOnlyReview(event.target.checked)} />
            <span>{t("Only needs review")}</span>
          </label>

          <ul className="settings-rule-list">
            {shownRows.map((row) => {
              const isExcluded = excluded.has(row.receiptId);
              const supported = row.outcome !== "unsupported";
              return (
                <li key={row.receiptId} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                  <div className="settings-action-row" style={{ justifyContent: "space-between", margin: 0 }}>
                    <label className="settings-toggle-row" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={supported && !isExcluded}
                        disabled={!supported}
                        onChange={(event) =>
                          setExcluded((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.delete(row.receiptId);
                            else next.add(row.receiptId);
                            return next;
                          })
                        }
                      />
                      <span>
                        <strong>#{row.receiptId}</strong>{" "}
                        {row.customerName || t("Etsy buyer")}
                        {row.itemTitles.length ? ` · ${row.itemTitles.join(", ")}` : ""}
                      </span>
                    </label>
                    <span>
                      {money(row.total, row.currency)}{" "}
                      <span className="studio-pill">
                        {row.outcome === "ready"
                          ? t("Ready")
                          : row.outcome === "review"
                            ? t("Review")
                            : t("Unsupported")}
                      </span>
                    </span>
                  </div>

                  {row.personalization.length ? (
                    <p className="muted-copy" style={{ margin: 0 }}>
                      {`${t("Personalisation")}: ${row.personalization.join(" · ")}`}
                    </p>
                  ) : null}

                  {row.outcome !== "ready" ? (
                    <p className="muted-copy" style={{ margin: 0 }}>
                      {etsyReviewReasonText(row.reason, t)}
                    </p>
                  ) : null}

                  {row.customer.decision === "review" && row.customer.candidates.length && row.buyerId ? (
                    <div>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => setOpenMatch(openMatch === row.receiptId ? "" : row.receiptId)}
                      >
                        {openMatch === row.receiptId ? t("Close") : t("Possible customer match")}
                      </button>
                      {openMatch === row.receiptId ? (
                        <div className="settings-rule-list" style={{ marginTop: 8 }}>
                          <p className="muted-copy" style={{ margin: 0 }}>
                            {t("No automatic merge. The decision is saved for this Etsy buyer identity.")}
                          </p>
                          {row.customer.candidates.map((candidate) => (
                            <div key={candidate.customerId} className="settings-action-row" style={{ justifyContent: "space-between" }}>
                              <span>{candidate.name || t("Customer")}</span>
                              <button
                                type="button"
                                className="button secondary"
                                disabled={busy === `match-${row.receiptId}`}
                                onClick={() =>
                                  guard(`match-${row.receiptId}`, async () => {
                                    // Keyed on the Etsy BUYER id, not the receipt:
                                    // the decision has to outlive this order and
                                    // apply to everything that buyer sends next.
                                    await resolveEtsyCustomerMatch(
                                      companyId,
                                      connection.id,
                                      row.buyerId,
                                      candidate.customerId
                                    );
                                    setNotice(t("Decision saved. Later orders from this buyer will use it."));
                                    setOpenMatch("");
                                    // The row still said "review" and still
                                    // offered the same candidates, so the
                                    // seller could not tell the decision had
                                    // landed — and every other row from the
                                    // same buyer kept asking. Settle them all.
                                    setPreview((current) =>
                                      current
                                        ? {
                                            ...current,
                                            summary: {
                                              ...current.summary,
                                              review: Math.max(
                                                0,
                                                current.summary.review -
                                                  current.rows.filter(
                                                    (other) =>
                                                      other.buyerId === row.buyerId &&
                                                      other.customer.decision === "review"
                                                  ).length
                                              )
                                            },
                                            rows: current.rows.map((other) =>
                                              other.buyerId === row.buyerId
                                                ? {
                                                    ...other,
                                                    outcome: other.outcome === "review" ? "ready" : other.outcome,
                                                    customer: { ...other.customer, decision: "link", candidates: [] }
                                                  }
                                                : other
                                            )
                                          }
                                        : current
                                    );
                                  })
                                }
                              >
                                {t("Link to existing")}
                              </button>
                            </div>
                          ))}
                          <p className="muted-copy" style={{ margin: 0 }}>
                            {t("Matching signals: normalised name + shipping address. Email alone is never enough.")}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <p className="muted-copy">{t("Selected orders use Etsy receipt ID as the permanent external identity.")}</p>

          <div className="settings-action-row">
            <button type="button" className="button secondary" onClick={() => setPreview(null)}>
              {t("Back")}
            </button>
            <button
              type="button"
              className="button"
              disabled={busy === "import" || !selectedIds.length}
              onClick={() =>
                guard("import", async () => {
                  const result = await runEtsyImport(companyId, connection.id, rules, selectedIds);
                  const created = Number(result?.outcome?.created || 0);
                  const updated = Number(result?.outcome?.updated || 0);
                  const failed = Number(result?.outcome?.failed || 0);
                  setNotice(
                    failed
                      ? `${created} ${t("imported")} · ${failed} ${t("need review. No records were lost; you can run the preview again.")}`
                      : `${created} ${t("imported")}${updated ? ` · ${updated} ${t("updated")}` : ""}`
                  );
                  setPreview(null);
                  await refresh();
                })
              }
            >
              {busy === "import"
                ? t("Importing…")
                : `${t("Import")} ${selectedIds.length} ${t("selected orders")}`}
            </button>
          </div>
        </section>
      ) : null}

      {/* ── Screen 8 · Disconnect ────────────────────────────────────────── */}
      <section className="card app-card quick-reply-settings-card">
        <h3>{t("Disconnect Etsy")}</h3>
        <h4 className="quick-reply-settings-label">{t("What happens next?")}</h4>
        <ul className="settings-rule-list">
          <li>
            <span>{t("Stop future Etsy synchronisation")}</span>
            <span className="studio-pill">{t("Yes")}</span>
          </li>
          <li>
            <span>{t("Keep existing orders and production work")}</span>
            <span className="studio-pill">{t("Default")}</span>
          </li>
          <li>
            <span>{t("Revoke stored access tokens")}</span>
            <span className="studio-pill">{t("Yes")}</span>
          </li>
        </ul>
        {/* Deleting the imported source data is a separate decision, and the
            server side of it is not built yet. Shown as planned rather than as
            a control that quietly does nothing. */}
        <p className="muted-copy">
          {t("Deleting imported Etsy source data is a separate request and is not available yet. Disconnecting never deletes anything from Etsy.")}
        </p>
        {confirmDisconnect ? (
          <div className="settings-action-row">
            <button
              type="button"
              className="button"
              disabled={busy === "disconnect"}
              onClick={() =>
                guard("disconnect", async () => {
                  await disconnectEtsyShop(companyId, connection.id);
                  setNotice(t("Etsy disconnected. Your orders and production work are unchanged."));
                  setConfirmDisconnect(false);
                  setPreview(null);
                  await refresh();
                })
              }
            >
              {t("Disconnect shop")}
            </button>
            <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(false)}>
              {t("Keep connected")}
            </button>
          </div>
        ) : (
          <div className="settings-action-row">
            <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(true)}>
              {t("Disconnect Etsy")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default EtsyIntegrationSection;

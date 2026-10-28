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
import { studioImportPhrase } from "@/lib/studioflow/countLabel";
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
import { EtsyText } from "@/app/orders/EtsyText";
import { etsyActionErrorText, etsyCanPreview, etsyImportNotice, etsyPersonalisationLine, shouldAutoPreviewEtsy } from "@/lib/studioflow/etsyFirstImport";
import { workspaceAccessAllows } from "@/lib/studioflow/firestore";
import { CommerceSyncHealthCard } from "./CommerceSyncHealthCard";

type Props = { workspace: WorkspaceContext; language?: string };

/**
 * Etsy API Terms: the trademark notice (T1), the contact address (T2) and the terms the
 * seller agrees to by connecting (T3), shown in EVERY state of this section. T1 is Etsy's
 * required wording and is NEVER translated or reworded (scripts/check-etsy-compliance.mts
 * reads this file for the exact string).
 */
export function EtsyLegalNotes({ t, showTrademark = true }: { t: (text: string) => string; showTrademark?: boolean }) {
  const agree = t("By connecting Etsy you agree to the NivaDesk {terms} and our {privacy}.");
  const [beforeTerms, afterTerms = ""] = agree.split("{terms}");
  const [between, afterPrivacy = ""] = afterTerms.split("{privacy}");
  return (
    <section className="card app-card quick-reply-settings-card" data-etsy-card="" data-etsy-legal="">
      {showTrademark ? (
        <p className="muted-copy" data-etsy-trademark="" lang="en">
          {"The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy."}
        </p>
      ) : null}
      <p className="muted-copy" data-etsy-contact="">
        {t("Questions about the Etsy connection? Email")}{" "}
        <a href="mailto:contact@nivadesk.co.uk">contact@nivadesk.co.uk</a>
      </p>
      <p className="muted-copy" data-etsy-agreement="">
        {beforeTerms}
        <a href="/terms" target="_blank" rel="noopener noreferrer">{t("Terms")}</a>
        {between}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">{t("Privacy Policy")}</a>
        {afterPrivacy}
      </p>
    </section>
  );
}

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

/** Etsy's own scope names are not readable. NivaDesk asks for exactly this set
 *  — the server's ETSY_SCOPES — and "Sales read" is what it amounts to: the
 *  receipts, the buyer's contact on them, and which shop they came from.
 *
 *  The previous attempt at this checked for a single "transactions_r" and fell
 *  through to the raw names for everything else, which is every real connection
 *  — so the row read "transactions_r, email_r, shops_r" to sellers, which is
 *  the technical code this file's own header forbids reaching the screen. The
 *  raw list is now only for a connection whose stored scopes are NOT what we
 *  ask for, where saying "Sales read" would be the untrue answer. */
const ETSY_REQUESTED_SCOPES = ["transactions_r", "email_r", "shops_r"];

function scopeLabel(scopes: string[] | undefined, t: (text: string) => string): string {
  const list = (scopes || []).filter(Boolean);
  if (!list.length) return t("Unknown");
  const asked = [...ETSY_REQUESTED_SCOPES].sort().join(",");
  if ([...list].sort().join(",") === asked) return t("Sales read");
  return list.join(", ");
}

export function EtsyIntegrationSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const companyId = workspace.id.trim();
  // beginEtsyConnect and disconnectEtsyShop both require the workspace owner on
  // the server. This screen offered both buttons to everyone and let the
  // rejection explain it — as "Only the workspace owner can run this billing
  // action", which is not what the member pressed and not a thing they can act
  // on. Mac and Android have hidden them from members all along.
  const isOwner = workspace.role === "owner";
  // ETSY-E2E (24 Oct 2026): the preview is refused on the server (previewEtsyImport, H16) to anyone but
  // the owner or an admin/member with Orders + Customers + Financial Info and no assigned-projects limit,
  // and the import is owner-only. The buttons follow the server instead of failing after the press.
  const canPreview = etsyCanPreview({
    role: workspace.role,
    access: (area) => workspaceAccessAllows(workspace.memberAccess, area),
    assignedProjectsOnly: Boolean((workspace.memberAccess as Record<string, unknown> | undefined)?.assignedProjectsOnly)
  });

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
  /** The Etsy shop id the OAuth callback just came back with, if any. */
  const [arrivedShopId, setArrivedShopId] = useState("");

  // A workspace can connect more than one Etsy shop, and the hub counts them.
  // Showing only the first made every shop after it unreachable: counted on the
  // card, absent from the screen, with no way to sync or disconnect it.
  const [selectedId, setSelectedId] = useState("");
  // And falling back to connections[0] was only half the fix: the list is not
  // ordered by health, so the first row can be a shop the seller disconnected
  // months ago — which puts the live one back out of reach. Prefer a shop that
  // still has an authorisation; fall back to the first only when none does.
  const connection = connections.find((row) => row.id === selectedId)
    || connections.find((row) => row.status !== "disconnected")
    || connections[0]
    || null;

  // keepError: a reload is not evidence that whatever just failed is fine now.
  // The OAuth return sets a message and then reloads; the live check sets one
  // and then reloads. Clearing unconditionally deleted both a moment after they
  // appeared, along with the address-bar parameters that produced them.
  const refresh = useCallback(async (keepError = false) => {
    if (!companyId) return;
    try {
      const data = await getEtsyConnections(companyId);
      setConnections(Array.isArray(data.connections) ? data.connections : []);
      setConfigured(data.configured !== false);
      if (!keepError) setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("The Etsy connection could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const checkConnection = useCallback(async (quiet = false) => {
    const current = connections.find((row) => row.id === selectedId) || connections[0];
    if (!current) return;
    const result = await verifyEtsyConnection(companyId, current.id);
    if (result?.healthy) {
      setLiveCheck("healthy");
      // On arrival the line above the panel already says what to do next
      // ("Etsy shop connected. Choose what to import."); replacing it with
      // "This connection is working" took that instruction away.
      if (!quiet) setNotice(t("Etsy answered. This connection is working."));
      // The check stamped lastSuccessAt; without a reload the row kept saying "Connection checked: Never".
      await refresh(true);
      return;
    }
    setLiveCheck("unhealthy");
    setError(
      etsyErrorText(String(result?.reason || ""), t) ||
        t("Etsy did not accept this connection. Reconnect the shop to continue.")
    );
    // The stored status may now disagree with what Etsy just said. Keep the
    // message: the reload is not evidence the failure went away.
    await refresh(true);
  }, [companyId, connections, refresh, selectedId, t]);

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
      setAutoPreviewPending(true);
      // Etsy sends the shop back with the outcome, and this read it only to
      // delete it. In a workspace with more than one shop that meant connecting
      // the second one left the panel showing the first: the seller pressed
      // Connect, was told it worked, and looked at somebody else's sync log.
      const shop = params.get("shop");
      if (shop) setArrivedShopId(shop);
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
    void refresh(true);
  }, [refresh, t]);

  // Select the shop the seller just authorised, once its row has loaded.
  useEffect(() => {
    if (!arrivedShopId || !connections.length) return;
    const row = connections.find((item) => item.shopId === arrivedShopId);
    if (row) setSelectedId(row.id);
    setArrivedShopId("");
  }, [arrivedShopId, connections]);

  // ETSY-FIRST-IMPORT (23 Oct 2026): a shop that has just been connected and never
  // imported opens straight onto the preview — the seller's own recent orders,
  // with the import button under them — instead of a page of filters above a
  // Preview button. Read-only: nothing is imported until the owner confirms.
  const [autoPreviewPending, setAutoPreviewPending] = useState(false);
  useEffect(() => {
    if (!autoPreviewPending) return;
    if (!connection) return;
    if (!canPreview || !shouldAutoPreviewEtsy({ arrived: true, connection, previewOpen: Boolean(preview), busy })) {
      if (connection.importState !== "none" || preview) setAutoPreviewPending(false);
      return;
    }
    setAutoPreviewPending(false);
    setBusy("preview");
    void previewEtsyImport(companyId, connection.id, rules)
      .then((result) => { setPreview(result); setExcluded(new Set()); })
      .catch((previewError) => {
        setError(etsyActionErrorText(previewError, t));
      })
      .finally(() => setBusy(""));
  }, [autoPreviewPending, canPreview, connection, preview, busy, companyId, rules, t]);

  // The screen promises to verify on return. Do it once, as soon as the
  // connection this callback created has actually loaded.
  useEffect(() => {
    if (!checkOnArrival || !connections[0]) return;
    setCheckOnArrival(false);
    setBusy("verify");
    void checkConnection(true).catch(() => {}).finally(() => setBusy(""));
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
      setError(etsyActionErrorText(actionError, t));
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
      <div className="settings-card-stack">
        <section className="card app-card quick-reply-settings-card" data-etsy-card="">
          <h3>{t("Etsy")}</h3>
          <p className="muted-copy">{t("Etsy is not set up on this server yet. Contact support and we will enable it.")}</p>
        </section>
        <EtsyLegalNotes t={t} />
      </div>
    );
  }

  const shopPicker =
    connections.length > 1 ? (
      <section className="card app-card quick-reply-settings-card" data-etsy-card="">
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
        <section className="card app-card quick-reply-settings-card" data-etsy-card="">
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
          {/* Required by Etsy's API Terms of Use, verbatim and in a prominent
              position. Deliberately NOT translated — it is a trademark notice,
              and the wording Etsy requires is this wording. It sits above the
              connect button because that is the moment a seller is deciding
              whether we are Etsy, and we are not. The same notice, with the
              contact address and the terms, closes every state of this section. */}
          <p className="muted-copy" data-etsy-trademark="" lang="en">
            {"The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy."}
          </p>
          <div className="settings-action-row">
            <button
              type="button"
              className="button"
              disabled={busy === "connect" || !isOwner}
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
          {!isOwner ? (
            <p className="muted-copy">{t("Only the workspace owner can connect an Etsy shop.")}</p>
          ) : null}
        </section>
        {/* The trademark notice is already above the connect button in this state. */}
        <EtsyLegalNotes t={t} showTrademark={false} />
      </div>
    );
  }

  function renderPreviewActions() {
    if (!connection) return null;
    return (
      <>
            <div className="settings-action-row">
              <button type="button" className="button secondary" onClick={() => setPreview(null)}>
                {t("Back")}
              </button>
              {isOwner ? (
              <button
                type="button"
                className="button"
                disabled={busy === "import" || !selectedIds.length}
                onClick={() =>
                  guard("import", async () => {
                    const result = await runEtsyImport(companyId, connection.id, rules, selectedIds);
                    // A silent cap reads as "that was everything". It is not:
                    // there are older orders this run never asked for.
                    if (result?.truncated) {
                      setError(t("Not every order fitted in one run. Import again to bring in the rest."));
                    }
                    // `held` used to be dropped here: a demo workspace imported 8 of 40 and
                    // was told "8 imported", with 32 parked out of sight on the Orders screen.
                    setNotice(etsyImportNotice(result?.outcome, t, language));
                    setPreview(null);
                    await refresh();
                  })
                }
              >
                {busy === "import"
                  ? t("Importing…")
                  : studioImportPhrase(selectedIds.length, "importSelectedOrders", language)}
              </button>
              ) : null}
            </div>
            {!isOwner ? <p className="muted-copy">{t("Only the workspace owner can import Etsy orders.")}</p> : null}
      </>
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
      <section className="card app-card quick-reply-settings-card" data-etsy-card="">
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
                  onClick={() => guard("verify", () => checkConnection())}
                >
                  {busy === "verify" ? t("Checking Etsy…") : t("Check now")}
                </button>
              )}
            </span>
          </li>
          <li>
            <span>{t("Granted scope")}</span>
            {/* What Etsy actually granted, not a label that says "Sales read"
                whatever is stored. The friendly name survives for the scope we
                ask for; anything else shows its own name rather than being
                described as something it is not. */}
            <span className="studio-pill">{scopeLabel(connection.scopes, t)}</span>
          </li>
          {connection.importState === "none" ? (
            <>
              {/* Before the first import a sweep succeeds by reaching Etsy and
                  skipping every receipt at the gate — so "Last successful
                  sync 6 minutes ago" over a shop nothing has ever been
                  imported from is true and misleading at once (the one live
                  connection read exactly that for three weeks). Say what
                  happened instead: checked, nothing imported, and how many
                  receipts the last sweep found waiting. */}
              <li>
                <span>{t("Connection checked")}</span>
                <span>{relativeTime(connection.lastSyncAtMs || connection.lastSuccessAtMs, t)}</span>
              </li>
              <li>
                <span>{t("Orders imported")}</span>
                <span className="muted-copy">
                  {connection.lastSweep && connection.lastSweep.awaitingFirstImport > 0
                    ? `${t("None yet")} · ${studioImportPhrase(connection.lastSweep.awaitingFirstImport, "receiptsAwaitingFirstImport", language)}`
                    : t("None yet — choose what to import below")}
                </span>
              </li>
            </>
          ) : (
            <li>
              <span>{t("Last successful sync")}</span>
              <span>{relativeTime(connection.lastSuccessAtMs, t)}</span>
            </li>
          )}
        </ul>
      </section>

      {/* ── Screen 7 · Error recovery ────────────────────────────────────── */}
      {needsAttention ? (
        <section className="card app-card quick-reply-settings-card" data-etsy-card="">
          <h3>{t("Connection needs attention")}</h3>
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
                  // did. This one ran and reported nothing either way — and
                  // then it went further and said the opposite: it read only
                  // created and updated, so a run where every order failed
                  // printed "this connection is working" and forced the badge
                  // to healthy. Sync now, 130 lines below, was fixed for
                  // exactly this and the fix never reached here.
                  const result = await syncEtsyNow(companyId, connection.id);
                  const created = Number(result?.outcome?.created || 0);
                  const updated = Number(result?.outcome?.updated || 0);
                  const failed = Number(result?.outcome?.failed || 0);
                  const held = Number(result?.outcome?.held || 0);
                  if (failed) {
                    setError(studioImportPhrase(failed, "couldNotBeImported", language));
                  }
                  const good = [
                    created || updated ? `${studioImportPhrase(created, "importedCount", language)} · ${studioImportPhrase(updated, "updatedCount", language)}` : "",
                    held ? studioImportPhrase(held, "waitingForRoomOnPlan", language) : ""
                  ].filter(Boolean).join(" · ");
                  if (good) setNotice(good);
                  else if (!failed) setNotice(t("Etsy answered. This connection is working."));
                  // Only claim health when the run gave a reason to.
                  if (!failed) setLiveCheck("healthy");
                  await refresh(Boolean(failed));
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
        <section className="card app-card quick-reply-settings-card" data-etsy-card="">
          <h3>{connection.importState === "none" ? t("Choose what to import") : t("Etsy sync")}</h3>

          {/* The log is shown before the first import too: a delivery Etsy
              sent while the seller was still choosing what to import used to be
              invisible here, and "nothing is happening" is the wrong thing to
              tell somebody whose orders are waiting at the gate. */}
          {connection.importState !== "none" || (connection.recentEvents && connection.recentEvents.length) ? (
            <>
              <p className="muted-copy">
                {`${t("Last checked")} ${relativeTime(connection.lastSyncAtMs, t)}`}
                {connection.importedOrders ? ` · ${studioImportPhrase(connection.importedOrders, "ordersImported", language)}` : ""}
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
          {/* ETSY-E2E: a 12-month import with this ticked brought 80+ long-shipped orders in as open work,
              each "100+ days late". Say what they will look like before the seller asks for them. */}
          {rules.includeCompleted ? (
            <p className="muted-copy">{t("Completed orders are already shipped on Etsy. They come in marked as dispatched and count as open work until you mark them delivered.")}</p>
          ) : null}
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
            {canPreview ? (
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
            ) : null}
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
                      setError(studioImportPhrase(failed, "couldNotBeImported", language));
                    }
                    const good = [
                      created || updated ? `${studioImportPhrase(created, "importedCount", language)} · ${studioImportPhrase(updated, "updatedCount", language)}` : "",
                      held ? studioImportPhrase(held, "waitingForRoomOnPlan", language) : ""
                    ].filter(Boolean).join(" · ");
                    if (good) setNotice(good);
                    else if (!failed) setNotice(t("Everything is already up to date."));
                    await refresh(Boolean(failed));
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
        <section className="card app-card quick-reply-settings-card" data-etsy-card="">
          <h3>{t("Review Etsy orders")}</h3>
          <p className="muted-copy">{t("Nothing is imported until the workspace owner confirms this list.")}</p>
          {/* ETSY-E2E: the preview opens by itself on the return from Etsy, and the date range and the
              Completed / Cancelled switches were only on the card behind "Back" — a seller asked to "switch on
              Completed orders" could not find it. Say what this list includes and offer the way to change it. */}
          <div className="settings-action-row" style={{ alignItems: "center" }}>
            <span className="muted-copy" style={{ flex: "1 1 260px" }}>
              {`${t("Included")}: ${t(DATE_RANGES.find((range) => range.days === rules.sinceDays)?.label || "Last 90 days")} · ${[
                t("Paid and open orders"),
                rules.includeCompleted ? t("Completed orders") : "",
                rules.includeUnpaid ? t("Orders not paid yet") : "",
                rules.includeCancelled ? t("Cancelled orders") : "",
                rules.includeDigital ? t("Digital-only orders") : ""
              ].filter(Boolean).join(", ")}`}
            </span>
            <button type="button" className="button secondary" onClick={() => setPreview(null)}>
              {t("Change what to include")}
            </button>
          </div>

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
              {studioImportPhrase(preview.summary.alreadyImported, "alreadyInNivaDesk", language)}
            </p>
          ) : null}
          {preview.truncated ? (
            <p className="muted-copy">{t("Only the most recent orders are shown. Import these first, then run the preview again.")}</p>
          ) : null}

          {/* ETSY-E2E: the same buttons above the list. With 40+ orders the only Import button sat
              thousands of pixels down on a phone, under every row. */}
          {preview.rows.length > 6 ? renderPreviewActions() : null}

          <label className="settings-toggle-row">
            <input type="checkbox" checked={onlyReview} onChange={(event) => setOnlyReview(event.target.checked)} />
            <span>{t("Only needs review")}</span>
          </label>

          <ul className="settings-rule-list">
            {shownRows.map((row) => {
              const isExcluded = excluded.has(row.receiptId);
              const supported = row.outcome !== "unsupported";
              return (
                <li key={row.receiptId} data-etsy-row="">
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
                      <span className="studio-pill" data-outcome={row.outcome}>
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
                      {`${t("Personalisation")}: `}
                      {row.personalization.map((line, i) => (
                        <span key={i}>{i ? " · " : ""}<EtsyText value={etsyPersonalisationLine(line)} photoLabel={t("Photo attached")} /></span>
                      ))}
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

          {renderPreviewActions()}
        </section>
      ) : null}

      {/* ── Sync health (SD-4, UX-004) ─────────────────────────────────────
          The same card as WooCommerce, Shopify, Square and eBay. It appears once the server records Etsy health
          (SD-ETSY: never_synced, then rows); against a server that answers not_supported it renders nothing, so
          this panel never shows a "Not supported" frame (E6). */}
      <CommerceSyncHealthCard workspace={workspace} language={language} provider="etsy" onlyWhenInstrumented />

      {/* ── Screen 8 · Disconnect ────────────────────────────────────────── */}
      <section className="card app-card quick-reply-settings-card" data-etsy-card="">
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
          {t("Disconnecting also removes Etsy's copy of the order details and the remembered buyer matches from NivaDesk. Your orders, notes and production work stay. Nothing is deleted on Etsy.")}
        </p>
        {confirmDisconnect ? (
          <div className="settings-action-row">
            <button
              type="button"
              className="button"
              disabled={busy === "disconnect" || !isOwner}
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
        ) : isOwner ? (
          <div className="settings-action-row">
            <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(true)}>
              {t("Disconnect Etsy")}
            </button>
          </div>
        ) : (
          // Gated where the journey starts, not two clicks in. Disabling the
          // confirm button left a member able to open the confirmation and find
          // a greyed-out control with nothing saying why — and a disabled button
          // is out of the tab order, so a screen reader is told even less.
          <p className="muted-copy">{t("Only the workspace owner can disconnect an Etsy shop.")}</p>
        )}
      </section>
      <EtsyLegalNotes t={t} />
    </div>
  );
}

export default EtsyIntegrationSection;

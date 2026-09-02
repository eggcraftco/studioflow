"use client";

// QuickBooks Online — the official accounting connection. Read-only phase:
// NivaDesk connects through Intuit's OAuth, verifies the company, imports the
// chart of accounts, VAT codes, customers, suppliers and items, proposes
// mappings for a person to confirm, keeps one primary writer per period next
// to Pandle, and follows what changes in QuickBooks through webhooks and
// change tracking. Nothing is posted yet; the tabs say so honestly.
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { CardTitle } from "@/components/CardTitle";
import {
  accountingAttentionResolve, accountingMappingSuggestions, accountingOverview, accountingPlanMigration, accountingSaveMappings,
  accountingSetMode, accountingSyncActivity, getAccountingCatalog, quickbooksConnectStart, quickbooksDisconnect, quickbooksSyncNow,
  ACCOUNT_MAPPING_KEYS, POSTING_MODES, SALES_SOURCES, TAX_MAPPING_KEYS,
  type AccountingCatalog, type AccountingConnection, type AccountingMappings, type AccountingOverview, type MappingSuggestions,
  type QuickBooksEnvironment, type SyncActivity
} from "@/lib/studioflow/quickbooks";

type Props = { workspace: WorkspaceContext; language?: string };
type Tab = "overview" | "setup" | "mappings" | "sales" | "purchases" | "inventory" | "reconciliation" | "activity" | "settings";

const CHECKLIST: { key: string; label: string }[] = [
  { key: "paypalAppActive", label: "The PayPal app inside QuickBooks is active" },
  { key: "squareAppActive", label: "The Square app inside QuickBooks is active" },
  { key: "salesAppWrites", label: "A Shopify, Etsy or WooCommerce app already writes sales into QuickBooks" },
  { key: "bankFeedConnected", label: "The bank feed is connected in QuickBooks" },
  { key: "inventoryAppWritesCogs", label: "Another inventory app writes COGS journals" },
];

function ago(ms: number | undefined, t: (s: string) => string): string {
  if (!ms) return "—";
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 90 * 1000) return t("Just now");
  if (diff < 90 * 60 * 1000) return `${Math.round(diff / 60000)} ${t("minutes ago")}`;
  if (diff < 36 * 60 * 60 * 1000) return `${Math.round(diff / 3600000)} ${t("hours ago")}`;
  return `${Math.round(diff / 86400000)} ${t("days ago")}`;
}

function modeLabel(mode: string, t: (s: string) => string): string {
  if (mode === "primary_write") return t("Primary accounting");
  if (mode === "migration_read") return t("Migration (read-only until hand-over)");
  if (mode === "shadow_read") return t("Read-only");
  return t("Disabled");
}

const tabStyle = (active: boolean): CSSProperties => ({
  border: 0, borderBottom: active ? "2px solid #2563eb" : "2px solid transparent", background: "transparent", color: active ? "#2563eb" : "inherit",
  fontWeight: 700, fontSize: 13, padding: "9px 14px", cursor: "pointer", marginBottom: -1, whiteSpace: "nowrap"
});
const facts: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, margin: 0, padding: 0, listStyle: "none" };
const fact: CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(120,120,140,0.25)", fontSize: 12.5 };
const factLabel: CSSProperties = { display: "block", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.6, marginBottom: 3 };
const selectStyle: CSSProperties = { fontSize: 12.5, padding: "6px 9px", borderRadius: 7, border: "1px solid rgba(120,120,140,0.35)", background: "transparent", color: "inherit", width: "100%" };
const th: CSSProperties = { textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.6, padding: "6px 8px", borderBottom: "1px solid rgba(120,120,140,0.25)" };
const td: CSSProperties = { padding: "6px 8px", fontSize: 12.5, borderBottom: "1px solid rgba(120,120,140,0.12)", verticalAlign: "top" };

export function QuickBooksIntegrationSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const companyId = workspace.id.trim();
  const isOwner = workspace.role === "owner";
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AccountingOverview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [environment, setEnvironment] = useState<QuickBooksEnvironment>("production");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [purgeOnDisconnect, setPurgeOnDisconnect] = useState(false);
  const [catalog, setCatalog] = useState<AccountingCatalog | null>(null);
  const [suggestions, setSuggestions] = useState<MappingSuggestions | null>(null);
  const [activity, setActivity] = useState<SyncActivity | null>(null);
  const [accountDraft, setAccountDraft] = useState<Record<string, string>>({});
  const [taxDraft, setTaxDraft] = useState<Record<string, string>>({});
  const [sourceDraft, setSourceDraft] = useState<Record<string, string>>({});
  const [bespokeDraft, setBespokeDraft] = useState("milestone_invoices");
  const [inventoryDraft, setInventoryDraft] = useState("purchases_expensed");
  const [estimatesDraft, setEstimatesDraft] = useState(false);
  const [effectiveFromDraft, setEffectiveFromDraft] = useState("");
  const [checklistDraft, setChecklistDraft] = useState<Record<string, boolean>>({});
  const [sourceChoice, setSourceChoice] = useState<"keep" | "migrate" | "primary">("keep");
  const [boundaryDate, setBoundaryDate] = useState("");
  const [ignoreReason, setIgnoreReason] = useState<Record<string, string>>({});

  const connection: AccountingConnection | null = useMemo(() => {
    const rows = (overview?.connections || []).filter((row) => row.provider === "quickbooks_online" && row.status !== "disconnected");
    return rows.find((row) => row.status === "linked") || rows[0] || null;
  }, [overview]);
  const pandle = useMemo(() => (overview?.connections || []).find((row) => row.provider === "pandle") || null, [overview]);
  const mappings: AccountingMappings | null = connection ? overview?.mappings?.[connection.connectionId] || null : null;
  const openAttention = (overview?.attention || []).filter((row) => row.status === "open");

  const refresh = useCallback(async (keepError = false) => {
    if (!companyId) return;
    try {
      const next = await accountingOverview(companyId);
      setOverview(next);
      if (!keepError) setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not load."));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);
  useEffect(() => { void refresh(true); }, [refresh]);

  // Drafts follow what is saved, so a reload never loses a confirmed mapping.
  useEffect(() => {
    if (!mappings) return;
    setAccountDraft(Object.fromEntries(Object.entries(mappings.accounts || {}).map(([key, value]) => [key, value.externalId])));
    setTaxDraft(Object.fromEntries(Object.entries(mappings.taxes || {}).map(([key, value]) => [key, value.externalId])));
    setSourceDraft({ ...(mappings.policies?.sources || {}) });
    if (mappings.policies?.bespoke) setBespokeDraft(mappings.policies.bespoke);
    if (mappings.policies?.inventory) setInventoryDraft(mappings.policies.inventory);
    setEstimatesDraft(mappings.policies?.estimatesToQuickBooks === true);
    setEffectiveFromDraft(mappings.policies?.effectiveFrom || "");
    setChecklistDraft(Object.fromEntries(CHECKLIST.map(({ key }) => [key, mappings.checklist?.[key] === true])));
  }, [mappings]);

  // Back from Intuit: the callback put its verdict in the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verdict = params.get("quickbooks");
    if (!verdict) return;
    const reason = params.get("reason") || "";
    params.delete("quickbooks"); params.delete("reason"); params.delete("connection");
    window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
    if (verdict === "connected") { setNotice(t("QuickBooks connected. Importing the chart of accounts, VAT codes, customers and items…")); setTab("setup"); }
    else if (verdict === "cancelled") setError(t("The QuickBooks connection was cancelled."));
    else if (reason === "state") setError(t("This connection link has expired. Start again from the Connect button."));
    else if (reason === "company") setError(t("QuickBooks returned a different company than the one you authorised. Try again."));
    else if (reason === "token") setError(t("QuickBooks did not accept the authorisation. Check the app's Client ID and Secret."));
    else setError(t("QuickBooks could not be connected. Try again in a minute."));
  }, [t]);

  async function guard(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(""); setNotice("");
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : t("Could not load.")); } finally { setBusy(""); }
  }

  async function syncNow(quiet = false) {
    if (!connection) return;
    await guard("sync", async () => {
      const result = await quickbooksSyncNow(companyId, connection.connectionId);
      const total = Object.values(result.counts || {}).reduce((acc, value) => acc + Number(value || 0), 0);
      if (!quiet) setNotice(`${t("QuickBooks read.")} ${total} ${t("catalogue rows")}, ${result.reconcile?.scanned ?? 0} ${t("changes since the last check")}.`);
      await refresh(true);
      setCatalog(await getAccountingCatalog(companyId, connection.connectionId));
    });
  }

  // A fresh connection imports itself once; the OAuth callback never does long work.
  useEffect(() => {
    if (!connection || connection.setupState !== "importing" || busy || !isOwner) return;
    void syncNow(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.connectionId, connection?.setupState]);

  useEffect(() => {
    if (!connection || !companyId) return;
    if ((tab === "mappings" || tab === "setup") && !catalog) void getAccountingCatalog(companyId, connection.connectionId).then(setCatalog).catch(() => undefined);
    if (tab === "activity" && !activity) void accountingSyncActivity(companyId).then(setActivity).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, connection?.connectionId, companyId]);

  async function connect() {
    await guard("connect", async () => {
      const result = await quickbooksConnectStart(companyId, environment);
      window.location.assign(result.authorizeUrl);
    });
  }

  async function loadSuggestions() {
    if (!connection) return;
    await guard("suggest", async () => {
      const next = await accountingMappingSuggestions(companyId, connection.connectionId);
      setSuggestions(next);
      setAccountDraft((prev) => ({ ...Object.fromEntries(Object.entries(next.accounts).map(([key, value]) => [key, value.externalId])), ...prev }));
      setTaxDraft((prev) => ({ ...Object.fromEntries(Object.entries(next.taxes).map(([key, value]) => [key, value.externalId])), ...prev }));
      setNotice(t("Suggestions filled in where nothing was chosen yet. Nothing is saved until you confirm."));
    });
  }

  async function saveMappings() {
    if (!connection) return;
    await guard("mappings", async () => {
      await accountingSaveMappings(companyId, connection.connectionId, { accounts: accountDraft, taxes: taxDraft });
      setNotice(t("Mappings confirmed."));
      await refresh(true);
    });
  }

  async function savePolicies() {
    if (!connection) return;
    await guard("policies", async () => {
      await accountingSaveMappings(companyId, connection.connectionId, { policies: { sources: sourceDraft, bespoke: bespokeDraft, inventory: inventoryDraft, estimatesToQuickBooks: estimatesDraft, ...(effectiveFromDraft ? { effectiveFrom: effectiveFromDraft } : {}) } });
      setNotice(t("Posting policies saved. They apply from the date you chose, never backwards."));
      await refresh(true);
    });
  }

  async function saveChecklist() {
    if (!connection) return;
    await guard("checklist", async () => {
      await accountingSaveMappings(companyId, connection.connectionId, { checklist: checklistDraft });
      setNotice(t("Checklist recorded in the audit trail."));
      await refresh(true);
    });
  }

  async function applySource() {
    if (!connection) return;
    await guard("mode", async () => {
      if (sourceChoice === "keep") {
        await accountingSetMode(companyId, connection.connectionId, "shadow_read");
        setNotice(t("QuickBooks stays read-only. Pandle remains the primary accounting provider."));
      } else if (sourceChoice === "migrate") {
        if (!boundaryDate) throw new Error(t("Choose the date QuickBooks takes over the books."));
        const result = await accountingPlanMigration(companyId, connection.connectionId, boundaryDate);
        setNotice(`${t("Migration planned.")} ${result.pandleUntil ? `${t("Pandle keeps the books until")} ${result.pandleUntil}. ` : ""}${t("QuickBooks is primary from")} ${result.boundaryDate}.`);
      } else {
        if (!boundaryDate) throw new Error(t("Choose the date QuickBooks takes over the books."));
        await accountingSetMode(companyId, connection.connectionId, "primary_write", boundaryDate);
        setNotice(`${t("QuickBooks is primary from")} ${boundaryDate}.`);
      }
      await refresh(true);
    });
  }

  async function disconnect() {
    if (!connection) return;
    await guard("disconnect", async () => {
      await quickbooksDisconnect(companyId, connection.connectionId, purgeOnDisconnect);
      setConfirmDisconnect(false);
      setNotice(t("QuickBooks disconnected. Access was revoked at Intuit."));
      await refresh(true);
    });
  }

  async function resolveAttention(id: string, action: "resolve" | "ignore") {
    await guard(`attention-${id}`, async () => {
      await accountingAttentionResolve(companyId, id, action, ignoreReason[id] || "");
      await refresh(true);
    });
  }

  const stack = (children: ReactNode) => (
    <div className="settings-card-stack">
      {notice ? <p className="success-copy">{notice}</p> : null}
      {error ? <p className="layout-error">{error}</p> : null}
      {children}
    </div>
  );

  if (loading) return stack(<p className="muted-copy">{t("Loading…")}</p>);

  if (!connection) {
    return stack(
      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="bank" eyebrow="QuickBooks Online" title={t("Connect QuickBooks Online")} />
        <p className="muted-copy">{t("NivaDesk runs the business; QuickBooks makes the books official. This first phase reads your company, chart of accounts, VAT codes, customers, suppliers and items, and proposes the mappings an accountant confirms. Nothing is posted to QuickBooks yet.")}</p>
        {pandle && pandle.status === "linked" ? <p className="muted-copy">⚠ {t("Pandle is connected. After connecting QuickBooks you will choose which one keeps the books, so nothing is ever written twice.")}</p> : null}
        {isOwner ? (
          <div className="settings-action-row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12.5, display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="radio" name="qbo-env" checked={environment === "production"} onChange={() => setEnvironment("production")} /> {t("Live company")}
            </label>
            <label style={{ fontSize: 12.5, display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="radio" name="qbo-env" checked={environment === "sandbox"} onChange={() => setEnvironment("sandbox")} /> {t("Sandbox (test company)")}
            </label>
            <button type="button" className="button" disabled={busy === "connect"} onClick={() => void connect()}>{busy === "connect" ? t("Loading…") : t("Connect QuickBooks")}</button>
          </div>
        ) : <p className="muted-copy">{t("Only the workspace owner can connect QuickBooks.")}</p>}
      </section>
    );
  }

  const profile = connection.profile;
  const counts = connection.counts || {};
  const healthy = connection.status === "linked" && (!connection.syncState || connection.syncState === "ok");

  const tabs: [Tab, string][] = [
    ["overview", t("Overview")], ["setup", t("Setup")], ["mappings", t("Mappings")], ["sales", t("Sales")], ["purchases", t("Purchases")],
    ["inventory", t("Inventory & COGS")], ["reconciliation", t("Reconciliation")], ["activity", t("Sync activity")], ["settings", t("Settings")]
  ];

  const readOnlyPanel = (title: string, body: string, phase: string) => (
    <section className="card app-card quick-reply-settings-card">
      <CardTitle icon="docText" eyebrow="QuickBooks Online" title={title} />
      <p className="muted-copy">{body}</p>
      <p style={{ fontSize: 12, opacity: 0.7 }}>{t("Read-only phase: nothing is posted to QuickBooks yet.")} {phase}</p>
    </section>
  );

  return stack(
    <>
      <section className="card app-card quick-reply-settings-card">
        <CardTitle icon="bank" eyebrow="QuickBooks Online" title={connection.companyName || t("QuickBooks Online")} />
        <ul style={facts}>
          <li style={fact}><span style={factLabel}>{t("Status")}</span><span className={`studio-pill${healthy ? " success" : ""}`}>{connection.status === "linked" ? (healthy ? t("Connected") : t("Needs attention")) : connection.status === "reconnect_required" ? t("Reconnect needed") : connection.status}</span></li>
          <li style={fact}><span style={factLabel}>{t("Accounting mode")}</span>{modeLabel(connection.mode, t)}{connection.writeBoundaryDate ? ` · ${t("from")} ${connection.writeBoundaryDate}` : ""}</li>
          <li style={fact}><span style={factLabel}>{t("Company ID")}</span>{connection.externalCompanyId}{connection.environment === "sandbox" ? ` · ${t("Sandbox")}` : ""}</li>
          <li style={fact}><span style={factLabel}>{t("Last catalogue read")}</span>{ago(connection.lastCatalogAtMs, t)}</li>
          <li style={fact}><span style={factLabel}>{t("Last change check")}</span>{ago(connection.lastReconciliationAtMs, t)}</li>
          <li style={fact}><span style={factLabel}>{t("Last webhook")}</span>{ago(connection.lastWebhookAtMs, t)}</li>
          <li style={fact}><span style={factLabel}>{t("Needs attention")}</span>{openAttention.length}</li>
        </ul>
        {connection.lastError ? <p className="layout-error" style={{ marginTop: 8 }}>{connection.lastError}</p> : null}
        {isOwner ? (
          <div className="settings-action-row">
            <button type="button" className="button secondary" disabled={busy === "sync"} onClick={() => void syncNow()}>{busy === "sync" ? t("Reading QuickBooks…") : t("Sync now")}</button>
            <button type="button" className="button secondary" onClick={() => setTab("setup")}>{t("Open setup")}</button>
            {connection.status === "reconnect_required" ? <button type="button" className="button" disabled={busy === "connect"} onClick={() => void connect()}>{t("Connect again")}</button> : null}
          </div>
        ) : null}
      </section>

      <div role="tablist" aria-label={t("QuickBooks sections")} style={{ display: "flex", gap: 2, overflowX: "auto", borderBottom: "1px solid rgba(120,120,140,0.25)" }}>
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} style={tabStyle(tab === key)}>{label}</button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <section className="card app-card quick-reply-settings-card">
            <CardTitle icon="finance" eyebrow={t("Overview")} title={t("What QuickBooks and NivaDesk know about each other")} />
            <ul style={facts}>
              <li style={fact}><span style={factLabel}>{t("Ready to post")}</span>{overview?.postings.readyToPost ?? 0}</li>
              <li style={fact}><span style={factLabel}>{t("Awaiting review")}</span>{overview?.postings.awaitingReview ?? 0}</li>
              <li style={fact}><span style={factLabel}>{t("Awaiting bank match")}</span>{overview?.postings.awaitingBankMatch ?? 0}</li>
              <li style={fact}><span style={factLabel}>{t("Synced today")}</span>{overview?.postings.syncedToday ?? 0}</li>
              <li style={fact}><span style={factLabel}>{t("Accounts")}</span>{counts.accounts ?? 0}</li>
              <li style={fact}><span style={factLabel}>{t("VAT codes")}</span>{counts.taxCodes ?? 0}</li>
              <li style={fact}><span style={factLabel}>{t("Customers")}</span>{counts.customers ?? 0}</li>
              <li style={fact}><span style={factLabel}>{t("Suppliers")}</span>{counts.vendors ?? 0}</li>
              <li style={fact}><span style={factLabel}>{t("Products & services")}</span>{counts.items ?? 0}</li>
            </ul>
            <p style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>{t("Read-only phase: nothing is posted to QuickBooks yet.")} {t("Sales, purchases and payouts follow once the mappings are confirmed and the accountant has approved the posting policy.")}</p>
          </section>
          {pandle && pandle.status === "linked" ? (
            <section className="card app-card quick-reply-settings-card">
              <CardTitle icon="bank" eyebrow="Pandle" title={pandle.companyName || "Pandle"} />
              <p className="muted-copy">{modeLabel(pandle.mode, t)}{pandle.writeUntilDate ? ` · ${t("until")} ${pandle.writeUntilDate}` : ""}. {t("Pandle confirms rows already waiting in its own bank feed; QuickBooks does not offer that, so the two are never asked to do the same job.")}</p>
            </section>
          ) : null}
          <section className="card app-card quick-reply-settings-card">
            <CardTitle icon="check" eyebrow={t("Needs attention")} title={openAttention.length ? `${openAttention.length} ${t("open")}` : t("Nothing needs attention")} />
            {openAttention.length === 0 ? <p className="muted-copy">{t("Changes made in QuickBooks to documents NivaDesk posted, deleted records and mapping gaps will appear here with a safe way to resolve each one.")}</p> : (
              <ul className="settings-rule-list">
                {openAttention.map((item) => (
                  <li key={item.id} style={{ display: "grid", gap: 6 }}>
                    <div><strong>{t(item.kind === "changed_in_quickbooks" ? "Changed in QuickBooks" : item.kind === "deleted_in_quickbooks" ? "Deleted in QuickBooks" : item.kind)}</strong> · <span style={{ fontSize: 12 }}>{item.message}</span></div>
                    <div style={{ fontSize: 11.5, opacity: 0.7 }}>{(item.entityRefs || []).join(" · ")} · {ago(item.lastSeenAtMs, t)}</div>
                    {isOwner ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <button type="button" className="button secondary" disabled={busy === `attention-${item.id}`} onClick={() => void resolveAttention(item.id, "resolve")}>{t("Reviewed")}</button>
                        <input className="input" style={{ flex: "1 1 200px", fontSize: 12 }} placeholder={t("Reason to ignore")} value={ignoreReason[item.id] || ""} onChange={(event) => setIgnoreReason((prev) => ({ ...prev, [item.id]: event.target.value }))} />
                        <button type="button" className="button secondary" disabled={busy === `attention-${item.id}` || !(ignoreReason[item.id] || "").trim()} onClick={() => void resolveAttention(item.id, "ignore")}>{t("Ignore with reason")}</button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {tab === "setup" ? (
        <>
          <section className="card app-card quick-reply-settings-card">
            <CardTitle icon="check" eyebrow={t("Step 2")} title={t("Verify the company")} />
            {profile ? (
              <ul style={facts}>
                <li style={fact}><span style={factLabel}>{t("Company")}</span>{profile.companyName}{profile.legalName && profile.legalName !== profile.companyName ? ` (${profile.legalName})` : ""}</li>
                <li style={fact}><span style={factLabel}>{t("Country")}</span>{profile.country || "—"}</li>
                <li style={fact}><span style={factLabel}>{t("Home currency")}</span>{profile.homeCurrency}{profile.multiCurrencyEnabled ? ` · ${t("multi-currency on")}` : ` · ${t("single currency")}`}</li>
                <li style={fact}><span style={factLabel}>{t("Financial year starts")}</span>{profile.fiscalYearStartMonth || "—"}</li>
                <li style={fact}><span style={factLabel}>{t("Books closed up to")}</span>{profile.bookCloseDate || t("not set")}</li>
                <li style={fact}><span style={factLabel}>{t("VAT tracking")}</span>{profile.taxTrackingEnabled ? t("on") : t("off")}</li>
              </ul>
            ) : <p className="muted-copy">{t("Company details arrive with the first sync.")}</p>}
            <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>{t("Wrong company? Disconnect under Settings and connect again with the right QuickBooks login.")}</p>
          </section>

          <section className="card app-card quick-reply-settings-card">
            <CardTitle icon="bank" eyebrow={t("Step 3")} title={t("Choose the accounting source")} />
            <p className="muted-copy">{t("Only one provider may write the books for a period. Pandle and QuickBooks never post the same sale.")}</p>
            <div style={{ display: "grid", gap: 8 }}>
              {pandle && pandle.status === "linked" ? (
                <>
                  <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "flex-start" }}><input type="radio" name="qbo-source" checked={sourceChoice === "keep"} onChange={() => setSourceChoice("keep")} /> <span>{t("Keep Pandle as primary; connect QuickBooks read-only")}</span></label>
                  <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "flex-start" }}><input type="radio" name="qbo-source" checked={sourceChoice === "migrate"} onChange={() => setSourceChoice("migrate")} /> <span>{t("Migrate to QuickBooks from a selected date (Pandle keeps the books until the day before)")}</span></label>
                </>
              ) : (
                <>
                  <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "flex-start" }}><input type="radio" name="qbo-source" checked={sourceChoice === "keep"} onChange={() => setSourceChoice("keep")} /> <span>{t("Read-only for now — connect, map and review before anything is posted")}</span></label>
                  <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "flex-start" }}><input type="radio" name="qbo-source" checked={sourceChoice === "primary"} onChange={() => setSourceChoice("primary")} /> <span>{t("QuickBooks is the primary accounting provider from a selected date")}</span></label>
                </>
              )}
              {sourceChoice !== "keep" ? (
                <label style={{ fontSize: 12.5, display: "grid", gap: 4, maxWidth: 260 }}>{t("Books start in QuickBooks on")}<input className="input" type="date" value={boundaryDate} onChange={(event) => setBoundaryDate(event.target.value)} /></label>
              ) : null}
              {isOwner ? <div className="settings-action-row"><button type="button" className="button" disabled={busy === "mode"} onClick={() => void applySource()}>{t("Apply")}</button></div> : null}
            </div>
          </section>

          <section className="card app-card quick-reply-settings-card">
            <CardTitle icon="check" eyebrow={t("Step 4")} title={t("Double-writer check")} />
            <p className="muted-copy">{t("Tick what is already writing into this QuickBooks company. Anything ticked stays out of NivaDesk's posting, and the answers are kept in the audit trail.")}</p>
            <div style={{ display: "grid", gap: 6 }}>
              {CHECKLIST.map(({ key, label }) => (
                <label key={key} style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={checklistDraft[key] === true} disabled={!isOwner} onChange={(event) => setChecklistDraft((prev) => ({ ...prev, [key]: event.target.checked }))} /> {t(label)}
                </label>
              ))}
            </div>
            {isOwner ? <div className="settings-action-row"><button type="button" className="button secondary" disabled={busy === "checklist"} onClick={() => void saveChecklist()}>{t("Record answers")}</button></div> : null}
          </section>

          <section className="card app-card quick-reply-settings-card">
            <CardTitle icon="orders" eyebrow={t("Step 5")} title={t("Posting mode per sales source")} />
            <p className="muted-copy">{t("Detailed for bespoke and low-volume work, daily summary for a busy channel with the accountant's approval. Payouts are transfers, never revenue, and are not part of this choice.")}</p>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>{t("Source")}</th><th style={th}>{t("Posting mode")}</th></tr></thead>
              <tbody>
                {SALES_SOURCES.map(({ key, label }) => (
                  <tr key={key}>
                    <td style={td}>{t(label)}</td>
                    <td style={td}>
                      <select style={selectStyle} disabled={!isOwner} value={sourceDraft[key] || "detailed"} onChange={(event) => setSourceDraft((prev) => ({ ...prev, [key]: event.target.value }))}>
                        {POSTING_MODES.map((mode) => <option key={mode.key} value={mode.key}>{t(mode.label)}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
              <label style={{ fontSize: 12.5, display: "grid", gap: 4 }}>{t("Bespoke orders with a deposit")}
                <select style={selectStyle} disabled={!isOwner} value={bespokeDraft} onChange={(event) => setBespokeDraft(event.target.value)}>
                  <option value="milestone_invoices">{t("Milestone invoices — deposit and final as separate invoices")}</option>
                  <option value="single_invoice_partial_payments">{t("One invoice with partial payments")}</option>
                </select>
              </label>
              <label style={{ fontSize: 12.5, display: "grid", gap: 4 }}>{t("Materials and stock")}
                <select style={selectStyle} disabled={!isOwner} value={inventoryDraft} onChange={(event) => setInventoryDraft(event.target.value)}>
                  <option value="purchases_expensed">{t("Purchases expensed — no inventory journals")}</option>
                  <option value="inventory_asset_cogs">{t("Inventory asset and periodic COGS journal (accountant-approved)")}</option>
                </select>
              </label>
              <label style={{ fontSize: 12.5, display: "grid", gap: 4 }}>{t("Policies apply from")}<input className="input" type="date" disabled={!isOwner} value={effectiveFromDraft} onChange={(event) => setEffectiveFromDraft(event.target.value)} /></label>
              <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", alignSelf: "end" }}><input type="checkbox" disabled={!isOwner} checked={estimatesDraft} onChange={(event) => setEstimatesDraft(event.target.checked)} /> {t("Send approved estimates to QuickBooks (no accounting effect)")}</label>
            </div>
            {isOwner ? <div className="settings-action-row"><button type="button" className="button secondary" disabled={busy === "policies"} onClick={() => void savePolicies()}>{t("Save policies")}</button></div> : null}
          </section>

          <section className="card app-card quick-reply-settings-card">
            <CardTitle icon="docText" eyebrow={t("Steps 6–8")} title={t("Mappings and dry run")} />
            <p className="muted-copy">{t("Account and VAT mappings live under the Mappings tab. The dry run — a bespoke invoice with a deposit, a channel sale, a refund with its fee, a supplier bill and a payout transfer shown as the QuickBooks documents they would become — arrives with the posting phase.")}</p>
            <div className="settings-action-row"><button type="button" className="button secondary" onClick={() => setTab("mappings")}>{t("Open mappings")}</button></div>
          </section>
        </>
      ) : null}

      {tab === "mappings" ? (
        <>
          <section className="card app-card quick-reply-settings-card">
            <CardTitle icon="finance" eyebrow={t("Accounts")} title={t("Where each NivaDesk event lands in the chart of accounts")} />
            <p className="muted-copy">{t("Read live from QuickBooks. NivaDesk proposes; you or your accountant confirm. Nothing posts while a mapping it needs is empty.")}</p>
            {!catalog ? <p className="muted-copy">{t("Sync first to load the chart of accounts.")}</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>{t("NivaDesk event")}</th><th style={th}>{t("QuickBooks account")}</th><th style={th}>{t("Suggestion")}</th></tr></thead>
                <tbody>
                  {ACCOUNT_MAPPING_KEYS.map(({ key, label }) => {
                    const hint = suggestions?.accounts?.[key];
                    return (
                      <tr key={key}>
                        <td style={td}>{t(label)}</td>
                        <td style={td}>
                          <select style={selectStyle} disabled={!isOwner} value={accountDraft[key] || ""} onChange={(event) => setAccountDraft((prev) => ({ ...prev, [key]: event.target.value }))}>
                            <option value="">{t("Not mapped")}</option>
                            {catalog.accounts.filter((account) => account.active).map((account) => <option key={account.externalId} value={account.externalId}>{account.fullyQualifiedName || account.name} · {account.accountType}</option>)}
                          </select>
                        </td>
                        <td style={{ ...td, fontSize: 11.5, opacity: 0.8 }}>{hint ? `${hint.name} (${Math.round(hint.confidence * 100)}% · ${hint.reason})` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
          <section className="card app-card quick-reply-settings-card">
            <CardTitle icon="finance" eyebrow={t("VAT")} title={t("NivaDesk VAT treatment → QuickBooks tax code")} />
            <p className="muted-copy">{t("Tax codes are read from this company, never assumed from a name. Refunds keep the original treatment.")}</p>
            {!catalog ? null : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>{t("Treatment")}</th><th style={th}>{t("QuickBooks tax code")}</th><th style={th}>{t("Suggestion")}</th></tr></thead>
                <tbody>
                  {TAX_MAPPING_KEYS.map(({ key, label }) => {
                    const hint = suggestions?.taxes?.[key];
                    return (
                      <tr key={key}>
                        <td style={td}>{key} · {t(label)}</td>
                        <td style={td}>
                          <select style={selectStyle} disabled={!isOwner} value={taxDraft[key] || ""} onChange={(event) => setTaxDraft((prev) => ({ ...prev, [key]: event.target.value }))}>
                            <option value="">{t("Not mapped")}</option>
                            {catalog.taxCodes.filter((code) => code.active && !code.hidden).map((code) => <option key={code.externalId} value={code.externalId}>{code.name} · {code.effectiveSalesRate}%</option>)}
                          </select>
                        </td>
                        <td style={{ ...td, fontSize: 11.5, opacity: 0.8 }}>{hint ? `${hint.name} (${Math.round(hint.confidence * 100)}% · ${hint.reason})` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {isOwner ? (
              <div className="settings-action-row">
                <button type="button" className="button secondary" disabled={busy === "suggest" || !catalog} onClick={() => void loadSuggestions()}>{busy === "suggest" ? t("Loading…") : t("Suggest mappings")}</button>
                <button type="button" className="button" disabled={busy === "mappings" || !catalog} onClick={() => void saveMappings()}>{busy === "mappings" ? t("Saving…") : t("Confirm mappings")}</button>
              </div>
            ) : null}
          </section>
          {suggestions ? (
            <section className="card app-card quick-reply-settings-card">
              <CardTitle icon="check" eyebrow={t("Customers")} title={`${t("Possible duplicates")}: ${suggestions.duplicates.length}`} />
              <p className="muted-copy">{t("NivaDesk customers that may already exist in QuickBooks, by email or name. A name alone is a reason to look, not to merge; linking arrives with the posting phase.")} ({suggestions.localCustomerCount} NivaDesk · {suggestions.remoteCustomerCount} QuickBooks)</p>
              {suggestions.duplicates.length ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>NivaDesk</th><th style={th}>QuickBooks</th><th style={th}>{t("Why")}</th></tr></thead>
                  <tbody>
                    {suggestions.duplicates.slice(0, 100).map((row) => (
                      <tr key={row.localId}>
                        <td style={td}>{row.localName}{row.localEmail ? <div style={{ fontSize: 11, opacity: 0.7 }}>{row.localEmail}</div> : null}</td>
                        <td style={td}>{row.candidates.map((candidate) => <div key={candidate.externalId}>{candidate.displayName} <span style={{ fontSize: 11, opacity: 0.6 }}>#{candidate.externalId}</span></div>)}</td>
                        <td style={td}>{row.candidates.map((candidate) => <div key={candidate.externalId}>{t(candidate.reason === "same_email" ? "same email" : "same name")}</div>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {tab === "sales" ? readOnlyPanel(t("Sales"), t("Bespoke orders become invoices or sales receipts with their payments; channel orders follow the posting mode you chose; refunds keep their VAT treatment. Every document carries NivaDesk's identity so it can never be posted twice."), t("Sales posting is the next phase."))
        : null}
      {tab === "purchases" ? readOnlyPanel(t("Purchases"), t("Supplier bills, purchases paid on the spot, bill payments, supplier credits and receipt attachments — each linked back to the NivaDesk purchase, order and bank row."), t("Purchases follow the sales phase."))
        : null}
      {tab === "inventory" ? readOnlyPanel(t("Inventory & COGS"), t("NivaDesk stays the owner of physical stock. With the inventory-asset policy, a period-end valuation and COGS journal is proposed for approval; with purchases expensed, nothing is journaled."), t("Optional, and only after the accountant approves the policy."))
        : null}
      {tab === "reconciliation" ? (
        <section className="card app-card quick-reply-settings-card">
          <CardTitle icon="check" eyebrow={t("Reconciliation")} title={t("Change tracking and bank matching")} />
          <p className="muted-copy">{t("Webhooks bring changes quickly; a six-hourly change-data check catches anything missed. Documents NivaDesk posted that were edited in QuickBooks are surfaced under Needs attention, never overwritten.")}</p>
          <ul style={facts}>
            <li style={fact}><span style={factLabel}>{t("Last change check")}</span>{ago(connection.lastReconciliationAtMs, t)}</li>
            <li style={fact}><span style={factLabel}>{t("Changes read")}</span>{connection.lastReconciliation?.scanned ?? 0}</li>
            <li style={fact}><span style={factLabel}>{t("Changed in QuickBooks")}</span>{connection.lastReconciliation?.changed ?? 0}</li>
            <li style={fact}><span style={factLabel}>{t("Deleted")}</span>{connection.lastReconciliation?.deleted ?? 0}</li>
          </ul>
          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>{t("QuickBooks' public API does not hand third parties the Banking screen's For Review rows. NivaDesk never fakes bank-feed rows: matching happens inside QuickBooks, and NivaDesk shows the document as awaiting match there.")}</p>
        </section>
      ) : null}

      {tab === "activity" ? (
        <section className="card app-card quick-reply-settings-card">
          <CardTitle icon="docText" eyebrow={t("Sync activity")} title={t("Webhooks received and actions taken")} />
          {!activity ? <p className="muted-copy">{t("Loading…")}</p> : (
            <>
              <h4 style={{ margin: "8px 0 4px", fontSize: 12.5 }}>{t("Actions")}</h4>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>{t("When")}</th><th style={th}>{t("Action")}</th><th style={th}>{t("Summary")}</th></tr></thead>
                <tbody>
                  {activity.audit.map((row) => <tr key={row.id}><td style={td}>{new Date(row.createdAtMs).toLocaleString()}</td><td style={td}>{row.action}</td><td style={td}>{row.summary}</td></tr>)}
                  {activity.audit.length === 0 ? <tr><td style={td} colSpan={3}>{t("Nothing yet.")}</td></tr> : null}
                </tbody>
              </table>
              <h4 style={{ margin: "14px 0 4px", fontSize: 12.5 }}>{t("Webhooks")}</h4>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>{t("Received")}</th><th style={th}>{t("Entity")}</th><th style={th}>{t("Operation")}</th><th style={th}>{t("Status")}</th></tr></thead>
                <tbody>
                  {activity.inbox.map((row) => <tr key={row.id}><td style={td}>{new Date(row.receivedAtMs).toLocaleString()}</td><td style={td}>{row.entityType} #{row.externalId}</td><td style={td}>{row.operation}</td><td style={td}>{row.status}{row.outcome ? ` · ${row.outcome}` : ""}{row.error ? ` · ${row.error}` : ""}</td></tr>)}
                  {activity.inbox.length === 0 ? <tr><td style={td} colSpan={4}>{t("No webhook has arrived yet. Configure the endpoint in the Intuit developer console; the first one can take a few minutes.")}</td></tr> : null}
                </tbody>
              </table>
            </>
          )}
        </section>
      ) : null}

      {tab === "settings" ? (
        <>
          <section className="card app-card quick-reply-settings-card">
            <CardTitle icon="bank" eyebrow={t("Settings")} title={t("Connection")} />
            <ul style={facts}>
              <li style={fact}><span style={factLabel}>{t("Accounting mode")}</span>{modeLabel(connection.mode, t)}</li>
              <li style={fact}><span style={factLabel}>{t("Books start in QuickBooks on")}</span>{connection.writeBoundaryDate || "—"}</li>
              <li style={fact}><span style={factLabel}>{t("Environment")}</span>{connection.environment === "sandbox" ? t("Sandbox") : t("Live company")}</li>
              <li style={fact}><span style={factLabel}>{t("Connected")}</span>{ago(connection.linkedAtMs, t)}</li>
            </ul>
            <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>{t("Webhook endpoint for the Intuit developer console")}: <code style={{ fontSize: 11.5 }}>https://europe-west2-eggcraft-studio.cloudfunctions.net/quickbooksWebhook</code></p>
          </section>
          {isOwner ? (
            <section className="card app-card quick-reply-settings-card">
              <CardTitle icon="check" eyebrow={t("Disconnect")} title={t("Disconnect QuickBooks")} />
              <p className="muted-copy">{t("Access is revoked at Intuit and the tokens are forgotten. Imported records and mappings stay unless you choose to remove them too.")}</p>
              {confirmDisconnect ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={purgeOnDisconnect} onChange={(event) => setPurgeOnDisconnect(event.target.checked)} /> {t("Also remove the imported records, mappings and activity")}</label>
                  <div className="settings-action-row">
                    <button type="button" className="button danger" disabled={busy === "disconnect"} onClick={() => void disconnect()}>{busy === "disconnect" ? t("Loading…") : t("Yes, disconnect")}</button>
                    <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(false)}>{t("Cancel")}</button>
                  </div>
                </div>
              ) : <div className="settings-action-row"><button type="button" className="button danger" onClick={() => setConfirmDisconnect(true)}>{t("Disconnect QuickBooks")}</button></div>}
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export default QuickBooksIntegrationSection;

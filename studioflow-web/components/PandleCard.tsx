"use client";

// Pandle bookkeeping bridge card (owner-only, lives on /bank).
// Connect Pandle via OAuth, map NivaDesk categories to Pandle nominal
// accounts + tax codes, then match NivaDesk's categorised bank feed against
// Pandle's unconfirmed "Check" queue and confirm the matches in one go.
// The mapping can be edited before Pandle is connected.

import React, { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase/client";

type PandleOption = { id: string; code: string; name: string; rate?: number; outstanding?: number };
type PandleMapping = { category: string; nominalCode: string; taxCode: string };
type PandleConnection = {
  status: string;
  pandleCompanyName: string;
  bankAccountId: string;
  bankAccountName: string;
  bankAccounts: PandleOption[];
  categories: PandleOption[];
  taxCodes: PandleOption[];
  mappings: PandleMapping[];
  lastPushAt: Date | null;
  lastPushCount: number;
};
type PreviewItem = {
  transactionId: string;
  importedId: string;
  bookingDate: string;
  pandleDate: string;
  dateDrift: number;
  amount: number;
  currency: string;
  counterparty: string;
  description: string;
  pandleDescription: string;
  category: string;
  hasReceipt: boolean;
  linkedOrderLabel: string;
  score: number;
  confidence: number;
  manual: boolean;
  needsConfirm: boolean;
  ready: boolean;
  problem: string;
  nominalCode: string;
  nominalName: string;
  taxCode: string;
};
type Preview = { pandleQueue: number; nivaCandidates: number; matched: number; ready: number; needsConfirm: number; items: PreviewItem[] };
type PushResult = { confirmed: number; failed: number; results: Array<{ transactionId: string; ok: boolean; error?: string }> };

// Mirrors functions/pandle.js DEFAULT_MAPPINGS (Pandle's default UK chart).
export const PANDLE_DEFAULT_MAPPINGS: PandleMapping[] = [
  { category: "Materials", nominalCode: "500", taxCode: "ST" },
  { category: "Equipment", nominalCode: "000", taxCode: "ST" },
  { category: "Shipping", nominalCode: "685", taxCode: "ST" },
  { category: "Software", nominalCode: "710", taxCode: "ST" },
  { category: "Subscriptions", nominalCode: "695", taxCode: "ST" },
  { category: "Fees", nominalCode: "700", taxCode: "NV" },
  { category: "Marketing", nominalCode: "725", taxCode: "ST" },
  { category: "Travel", nominalCode: "615", taxCode: "ST" },
  { category: "Utilities", nominalCode: "680", taxCode: "ST" },
  { category: "Rent", nominalCode: "645", taxCode: "EX" },
  { category: "Staff", nominalCode: "520", taxCode: "NV" },
  { category: "Tax", nominalCode: "730", taxCode: "NV" },
  { category: "Other", nominalCode: "735", taxCode: "ST" }
];
// Pandle's standard UK tax codes — used until the live list is cached.
const FALLBACK_TAX_CODES: PandleOption[] = [
  { id: "", code: "ST", name: "Standard VAT - 20%" },
  { id: "", code: "RR", name: "Reduced Rate - 5%" },
  { id: "", code: "RC", name: "Reverse Charge - 0%" },
  { id: "", code: "NV", name: "Non VATable - 0%" },
  { id: "", code: "EX", name: "VAT Exempt or Zero-Rated - 0%" }
];

function toDate(value: unknown): Date | null {
  const v = value as { toDate?: () => Date } | null | undefined;
  return v && typeof v.toDate === "function" ? v.toDate() : null;
}

export function PandleCard({ companyId, categoriesInUse, t, money }: {
  companyId: string;
  categoriesInUse: string[];
  t: (text: string) => string;
  money: (value: number, currency: string) => string;
}) {
  const [connection, setConnection] = useState<PandleConnection | null>(null);
  const [mappingDraft, setMappingDraft] = useState<PandleMapping[] | null>(null);
  const [showMapping, setShowMapping] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const unsub = onSnapshot(doc(db, "companies", companyId, "pandleConnection", "main"), snap => {
      const data = (snap.data() || {}) as Record<string, unknown>;
      setConnection({
        status: String(data.status || "none"),
        pandleCompanyName: String(data.pandleCompanyName || ""),
        bankAccountId: String(data.bankAccountId || ""),
        bankAccountName: String(data.bankAccountName || ""),
        bankAccounts: Array.isArray(data.bankAccounts) ? (data.bankAccounts as PandleOption[]) : [],
        categories: Array.isArray(data.categories) ? (data.categories as PandleOption[]) : [],
        taxCodes: Array.isArray(data.taxCodes) ? (data.taxCodes as PandleOption[]) : [],
        mappings: Array.isArray(data.mappings) ? (data.mappings as PandleMapping[]) : [],
        lastPushAt: toDate(data.lastPushAt),
        lastPushCount: Number(data.lastPushCount) || 0
      });
    }, () => setConnection(null));
    return () => unsub();
  }, [companyId]);

  const linked = connection?.status === "linked";
  const savedMappings = connection?.mappings?.length ? connection.mappings : PANDLE_DEFAULT_MAPPINGS;
  const taxOptions = connection?.taxCodes?.length ? connection.taxCodes : FALLBACK_TAX_CODES;

  // Every category the owner can pick on a transaction: presets + anything
  // custom already used in the feed + anything already mapped.
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    PANDLE_DEFAULT_MAPPINGS.forEach(item => set.add(item.category));
    categoriesInUse.forEach(item => { if (item) set.add(item); });
    savedMappings.forEach(item => set.add(item.category));
    return Array.from(set);
  }, [categoriesInUse, savedMappings]);

  const draft: PandleMapping[] = useMemo(() => {
    if (mappingDraft) return mappingDraft;
    return allCategories.map(category => savedMappings.find(item => item.category === category) || { category, nominalCode: "", taxCode: "" });
  }, [allCategories, mappingDraft, savedMappings]);

  async function call<T>(name: string, payload: Record<string, unknown> = {}): Promise<T> {
    const callable = httpsCallable<Record<string, unknown>, T>(functions, name);
    const result = await callable({ companyId, ...payload });
    return result.data;
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setStatus(null);
    try {
      await fn();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : t("Something went wrong."));
    } finally {
      setBusy(null);
    }
  }

  const connect = () => run("connect", async () => {
    const result = await call<{ link: string }>("pandleConnectStart");
    window.location.href = result.link;
  });
  const disconnect = () => {
    if (!window.confirm(t("Disconnect Pandle? Nothing already confirmed in Pandle is changed."))) return;
    void run("disconnect", async () => {
      await call("pandleDisconnect");
      setPreview(null);
      setStatus(t("Pandle disconnected."));
    });
  };
  const refreshMeta = () => run("meta", async () => {
    await call("pandleRefreshMeta");
    setStatus(t("Pandle data refreshed."));
  });
  const selectAccount = (bankAccountId: string) => run("account", async () => {
    await call("pandleSelectBankAccount", { bankAccountId });
    setPreview(null);
  });
  const saveMappings = () => run("mapping", async () => {
    await call("pandleSaveMappings", { mappings: draft.filter(item => item.nominalCode || item.taxCode) });
    setMappingDraft(null);
    setPreview(null);
    setStatus(t("Mapping saved."));
  });
  const findMatches = () => run("preview", async () => {
    const result = await call<Preview>("pandlePreview");
    setPreview(result);
    setPushResult(null);
    setSelected(new Set(result.items.filter(item => item.ready).map(item => item.transactionId)));
  });
  const push = () => {
    if (!preview) return;
    const items = preview.items.filter(item => item.ready && selected.has(item.transactionId))
      .map(item => ({ transactionId: item.transactionId, importedId: item.importedId }));
    if (!items.length) return;
    if (!window.confirm(`${t("Confirm these transactions in Pandle?")} (${items.length})`)) return;
    void run("push", async () => {
      // Idempotency: the same request id can be retried without confirming
      // anything twice — the server replays the stored result.
      const result = await call<PushResult>("pandlePush", { items, requestId: crypto.randomUUID() });
      setPushResult(result);
      const okIds = new Set(result.results.filter(row => row.ok).map(row => row.transactionId));
      setPreview(prev => prev ? { ...prev, items: prev.items.filter(item => !okIds.has(item.transactionId)), matched: prev.matched - okIds.size, ready: prev.ready - okIds.size } : prev);
      setSelected(new Set());
      setStatus(`${result.confirmed} ${t("confirmed in Pandle")}${result.failed ? ` · ${result.failed} ${t("failed")}` : ""}`);
    });
  };

  const updateDraft = (category: string, patch: Partial<PandleMapping>) => {
    setMappingDraft(draft.map(item => (item.category === category ? { ...item, ...patch } : item)));
  };
  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // The owner's verdict on an uncertain pair. Both answers are remembered on
  // the transaction, then the preview is rebuilt against the stored decision.
  const confirmMatch = (item: PreviewItem) => run(`confirm-${item.transactionId}`, async () => {
    await call("pandleConfirmMatch", { transactionId: item.transactionId, importedId: item.importedId });
    const result = await call<Preview>("pandlePreview");
    setPreview(result);
    setSelected(prev => new Set([...prev, item.transactionId]));
    setStatus(t("Match confirmed."));
  });
  const rejectMatch = (item: PreviewItem) => run(`confirm-${item.transactionId}`, async () => {
    await call("pandleRejectMatch", { transactionId: item.transactionId, importedId: item.importedId });
    const result = await call<Preview>("pandlePreview");
    setPreview(result);
    setStatus(t("Noted — that pair won't be suggested again."));
  });

  const problemLabel = (problem: string) => {
    switch (problem) {
      case "uncategorised": return t("No category in NivaDesk");
      case "unmapped": return t("Category not mapped");
      case "nominal-missing": return t("Pandle category code not found");
      case "tax-missing": return t("Tax code not found");
      case "mixed-vat": return t("Mixed VAT needs a split first");
      case "needs-confirm": return t("Possible match — confirm it");
      default: return problem;
    }
  };
  const selectedCount = preview ? preview.items.filter(item => item.ready && selected.has(item.transactionId)).length : 0;
  const currentAccount = connection?.bankAccounts.find(item => item.id === connection.bankAccountId);

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(14,165,233,0.14)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>📒</span>
        <strong style={{ fontSize: 14.5 }}>{t("Accounting")} · Pandle</strong>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: linked ? "#16a34a" : "#6b7280" }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: linked ? "#16a34a" : "#9ca3af", display: "inline-block" }} />
          {linked ? t("Connected") : t("Not connected")}
        </span>
        <span style={{ flex: 1 }} />
        {linked ? (
          <>
            <button type="button" style={btnSm} disabled={busy === "meta"} onClick={() => void refreshMeta()}>⟳ {t("Refresh Pandle data")}</button>
            <button type="button" style={{ ...btnSm, opacity: 0.7 }} disabled={busy === "disconnect"} onClick={disconnect}>{t("Disconnect")}</button>
          </>
        ) : (
          <button type="button" style={{ ...btnSm, background: "#2563eb", color: "#fff", borderColor: "#2563eb" }} disabled={busy === "connect"} onClick={() => void connect()}>
            {busy === "connect" ? t("Opening Pandle…") : `+ ${t("Connect Pandle")}`}
          </button>
        )}
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.65 }}>
        {t("Send the categories you set here into Pandle's Check queue, so you don't categorise every payment twice.")}
      </p>
      {status ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "#16a34a", fontWeight: 600 }}>{status}</p> : null}
      {error ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "#dc2626", fontWeight: 600 }}>{error}</p> : null}

      {linked && connection ? (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12.5 }}>
          <span><span style={{ opacity: 0.6 }}>{t("Company")}:</span> <strong>{connection.pandleCompanyName || "—"}</strong></span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ opacity: 0.6 }}>{t("Bank account")}:</span>
            <select value={connection.bankAccountId} disabled={busy === "account"} onChange={event => void selectAccount(event.target.value)} style={select}>
              {!connection.bankAccountId ? <option value="">{t("Choose…")}</option> : null}
              {connection.bankAccounts.map(account => (
                <option key={account.id} value={account.id}>{account.code ? `${account.code} | ` : ""}{account.name}</option>
              ))}
            </select>
          </label>
          {currentAccount && currentAccount.outstanding ? (
            <span style={{ fontSize: 11, fontWeight: 800, background: "rgba(245,158,11,0.16)", color: "#b45309", borderRadius: 7, padding: "2px 8px" }}>
              {currentAccount.outstanding} {t("waiting in Pandle")}
            </span>
          ) : null}
          {connection.lastPushAt ? (
            <span style={{ fontSize: 11, opacity: 0.6 }}>{t("Last push")}: {connection.lastPushAt.toLocaleString()} · {connection.lastPushCount}</span>
          ) : null}
        </div>
      ) : null}

      {/* ---- Mapping ------------------------------------------------------ */}
      <button type="button" onClick={() => setShowMapping(value => !value)} style={footLink}>
        {showMapping ? `${t("Hide category mapping")} ←` : `${t("Category mapping")} →`}
      </button>
      {showMapping ? (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: "0 0 8px", fontSize: 12, opacity: 0.65 }}>
            {t("Which Pandle category and tax code each NivaDesk category becomes. Ask your accountant if unsure — these are Pandle's standard codes.")}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 1fr) minmax(160px, 2fr) minmax(120px, 1.3fr)", gap: "6px 10px", alignItems: "center", fontSize: 12.5 }}>
            <span style={th}>{t("NivaDesk category")}</span><span style={th}>{t("Pandle category")}</span><span style={th}>{t("Tax code")}</span>
            {draft.map(row => (
              <React.Fragment key={row.category}>
                <span style={{ fontWeight: 700 }}>{t(row.category)}</span>
                {connection?.categories?.length ? (
                  <select value={row.nominalCode} onChange={event => updateDraft(row.category, { nominalCode: event.target.value })} style={select}>
                    <option value="">—</option>
                    {connection.categories.map(option => (
                      <option key={option.id} value={option.code}>{option.code} | {option.name}</option>
                    ))}
                  </select>
                ) : (
                  <input value={row.nominalCode} placeholder={t("Code, e.g. 500")} onChange={event => updateDraft(row.category, { nominalCode: event.target.value })} style={input} />
                )}
                <select value={row.taxCode} onChange={event => updateDraft(row.category, { taxCode: event.target.value })} style={select}>
                  <option value="">—</option>
                  {taxOptions.map(option => (
                    <option key={option.code} value={option.code}>{option.code} | {option.name}</option>
                  ))}
                </select>
              </React.Fragment>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" style={{ ...btnSm, background: "#2563eb", color: "#fff", borderColor: "#2563eb" }} disabled={busy === "mapping" || !mappingDraft} onClick={() => void saveMappings()}>
              {busy === "mapping" ? t("Saving…") : t("Save mapping")}
            </button>
            {mappingDraft ? <button type="button" style={btnSm} onClick={() => setMappingDraft(null)}>{t("Cancel")}</button> : null}
          </div>
        </div>
      ) : null}

      {/* ---- Match + push ------------------------------------------------- */}
      {linked ? (
        <div style={{ marginTop: 14, borderTop: "1px solid rgba(120,120,140,0.14)", paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={btnSm} disabled={busy === "preview" || !connection?.bankAccountId} onClick={() => void findMatches()}>
              {busy === "preview" ? t("Comparing with Pandle…") : `⇄ ${t("Find matches")}`}
            </button>
            {preview ? (
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                {preview.pandleQueue} {t("waiting in Pandle")} · {preview.matched} {t("matched")} · {preview.ready} {t("ready")}{preview.needsConfirm ? ` · ${preview.needsConfirm} ${t("to confirm")}` : ""}
              </span>
            ) : null}
            <span style={{ flex: 1 }} />
            {preview && preview.items.length ? (
              <button type="button" style={{ ...btnSm, background: "#16a34a", color: "#fff", borderColor: "#16a34a" }} disabled={busy === "push" || selectedCount === 0} onClick={push}>
                {busy === "push" ? t("Confirming…") : `✓ ${t("Confirm in Pandle")} (${selectedCount})`}
              </button>
            ) : null}
          </div>

          {preview && preview.items.length === 0 ? (
            <p style={{ margin: "10px 0 0", fontSize: 12.5, opacity: 0.7 }}>
              {preview.pandleQueue === 0 ? t("Pandle's queue is empty — nothing to confirm.") : t("No matching transactions yet — categorise payments in NivaDesk first, or refresh the bank feed.")}
            </p>
          ) : null}

          {preview && preview.items.length ? (
            <div style={{ marginTop: 10, maxHeight: 420, overflow: "auto", border: "1px solid rgba(120,120,140,0.16)", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ ...thCell, width: 28 }}>
                      <input type="checkbox" aria-label={t("Select all")}
                        checked={selectedCount > 0 && selectedCount === preview.ready}
                        onChange={event => setSelected(event.target.checked ? new Set(preview.items.filter(item => item.ready).map(item => item.transactionId)) : new Set())} />
                    </th>
                    <th style={thCell}>{t("Date")}</th>
                    <th style={thCell}>{t("Merchant")}</th>
                    <th style={{ ...thCell, textAlign: "right" }}>{t("Amount")}</th>
                    <th style={thCell}>{t("Category")}</th>
                    <th style={thCell}>Pandle</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map(item => {
                    const failure = pushResult?.results.find(row => row.transactionId === item.transactionId && !row.ok);
                    return (
                      <tr key={item.transactionId} style={{ borderTop: "1px solid rgba(120,120,140,0.1)", opacity: item.ready ? 1 : 0.6 }}>
                        <td style={tdCell}>
                          {item.ready ? <input type="checkbox" checked={selected.has(item.transactionId)} onChange={() => toggle(item.transactionId)} /> : <span aria-hidden="true" style={{ color: "#f59e0b" }}>●</span>}
                        </td>
                        <td style={{ ...tdCell, whiteSpace: "nowrap" }}>
                          {item.bookingDate}
                          {item.dateDrift ? <span title={`Pandle: ${item.pandleDate}`} style={{ marginLeft: 4, fontSize: 10, opacity: 0.55 }}>±{item.dateDrift}d</span> : null}
                        </td>
                        <td style={{ ...tdCell, maxWidth: 260 }}>
                          <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.counterparty || item.description || "—"}
                            {item.hasReceipt ? <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.6 }}>📎</span> : null}
                            {item.linkedOrderLabel ? <span style={{ marginLeft: 5, fontSize: 10, color: "#2563eb" }}>⛓ {item.linkedOrderLabel}</span> : null}
                          </div>
                          {item.pandleDescription && item.pandleDescription !== item.counterparty ? (
                            <div style={{ fontSize: 10.5, opacity: 0.55, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Pandle: {item.pandleDescription}</div>
                          ) : null}
                        </td>
                        <td style={{ ...tdCell, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: item.amount < 0 ? "#dc2626" : "#16a34a", whiteSpace: "nowrap" }}>
                          {item.amount < 0 ? "−" : "+"}{money(Math.abs(item.amount), item.currency)}
                        </td>
                        <td style={tdCell}>{item.category ? t(item.category) : <span style={{ opacity: 0.5 }}>—</span>}</td>
                        <td style={tdCell}>
                          <span title={`${t("Match confidence")}: ${item.confidence}%`} style={{ marginRight: 6, fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "1px 7px", background: item.manual ? "rgba(37,99,235,0.14)" : item.confidence >= 80 ? "rgba(22,163,74,0.12)" : "rgba(245,158,11,0.16)", color: item.manual ? "#2563eb" : item.confidence >= 80 ? "#16a34a" : "#b45309" }}>
                            {item.manual ? t("Confirmed by you") : `${item.confidence}%`}
                          </span>
                          {item.ready ? (
                            <span style={{ whiteSpace: "nowrap" }}>
                              <strong>{item.nominalCode}</strong> {item.nominalName} · <strong>{item.taxCode}</strong>
                            </span>
                          ) : item.needsConfirm ? (
                            <span style={{ whiteSpace: "nowrap" }}>
                              <button type="button" style={{ ...btnSm, padding: "2px 9px", fontSize: 11, color: "#16a34a", borderColor: "rgba(22,163,74,0.4)" }} disabled={busy === `confirm-${item.transactionId}`} onClick={() => void confirmMatch(item)}>✓ {t("Confirm match")}</button>{" "}
                              <button type="button" style={{ ...btnSm, padding: "2px 9px", fontSize: 11, opacity: 0.75 }} disabled={busy === `confirm-${item.transactionId}`} onClick={() => void rejectMatch(item)}>{t("Not the same")}</button>
                            </span>
                          ) : (
                            <span style={{ color: "#b45309", fontWeight: 700 }}>{problemLabel(item.problem)}</span>
                          )}
                          {failure ? <div style={{ fontSize: 10.5, color: "#dc2626" }}>{failure.error}</div> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--surface, rgba(255,255,255,0.6))",
  border: "1px solid rgba(120,120,140,0.18)",
  borderRadius: 14,
  padding: "16px 18px",
  position: "relative"
};
const btnSm: React.CSSProperties = {
  border: "1px solid rgba(120,120,140,0.3)", background: "transparent", color: "inherit",
  borderRadius: 10, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer"
};
const footLink: React.CSSProperties = { border: 0, background: "transparent", color: "#2563eb", fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: "10px 0 0", textAlign: "left" };
const select: React.CSSProperties = { fontSize: 12.5, padding: "5px 8px", borderRadius: 7, border: "1px solid rgba(120,120,140,0.35)", background: "transparent", color: "inherit", maxWidth: "100%" };
const input: React.CSSProperties = { ...select, width: "100%", boxSizing: "border-box" };
const th: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.55 };
const thCell: React.CSSProperties = { ...th, textAlign: "left", padding: "8px 10px", position: "sticky", top: 0, background: "var(--surface, rgba(255,255,255,0.9))" };
const tdCell: React.CSSProperties = { padding: "7px 10px", verticalAlign: "middle" };

"use client";

import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { CardTitle } from "@/components/CardTitle";

// Faz 2 / OBS-003+004 — freshness per data type per connection, and the
// events behind it, read from the common engine's health and event records.
// The owner can retry a dead event; everyone can see why it died.
type CommerceHealthEntity = {
  state: "fresh" | "stale" | "never" | "unsupported";
  lastSuccessAtMs?: number | null; lastAttemptAtMs?: number | null; lastWebhookAtMs?: number | null;
  lagMs?: number | null; pendingRetries?: number; deadLetters?: number;
};
type CommerceHealthConnection = {
  provider: string; connectionId: string;
  health: Record<"orders" | "products" | "inventory" | "finance", CommerceHealthEntity>;
};
// CARD-001 — the state the server decided for this provider. The browser
// renders it; it does not work the rule out again, because the same rule living
// in two places is how "Never synced" ended up on a connector that never
// records health at all.
type CommerceHealthCard = {
  provider: string; connected: boolean; healthInstrumented: boolean;
  state: "not_connected" | "not_supported" | "never_synced" | "rows";
};
type CommerceEventRow = {
  key: string; provider: string; connectionId: string; externalId: string; eventType: string; source: string; status: string;
  attempt: number; errorClass: string | null; message: string | null; orderId: string | null; startedAt: string | null; finishedAt: string | null; nextRetryAt: string | null;
};
type CommerceReviewRow = {
  orderId: string; provider: string; providerDisplayName: string; connectionId: string; externalId: string; orderNumber: string;
  customerName: string | null; grandTotal: string | null; currency: string | null; reasons: string[]; resolved: boolean; updatedAtMs: number;
};
// §10.5 — the review reasons the engine writes, in the merchant's words.
const REVIEW_REASON_LABELS: Record<string, string> = {
  ad_hoc_line_item: "Item not in the catalogue", no_line_items: "No line items", missing_total: "Missing total", unresolved_variation: "Unresolved variation"
};
const COMMERCE_STATUS_LABELS: Record<string, string> = {
  applied: "Applied", retrying: "Retrying", dead: "Dead", skipped: "Skipped", duplicate: "Duplicate", stale: "Stale", noop: "No change",
  held: "Held", queued: "Queued", processing: "Processing", received: "Received", failed: "Dead"
};
// CARD-001 — one contract, three states, and never an empty card:
//   Not connected  no connection with this provider in this workspace
//   Not supported  connected, but nothing here records health for it
//   Never synced   connected and instrumented, but nothing recorded yet
// functions/commerce/health.js decides which; these are only its words.
const EMPTY_STATE_LABEL: Record<string, string> = {
  not_connected: "Not connected", not_supported: "Not supported", never_synced: "Never synced", rows: "Never synced"
};
const EMPTY_STATE_DETAIL: Record<string, string> = {
  not_connected: "Connect this channel to see how fresh its data is.",
  not_supported: "Orders from this channel do reach your workspace. Their freshness is not recorded yet, so this card has nothing to measure.",
  never_synced: "No sync activity recorded yet.",
  rows: "No sync activity recorded yet."
};

function commerceAgoText(ms: number | null | undefined, t: (text: string) => string): string {
  if (!ms) return "—";
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 90 * 1000) return t("Just now");
  if (diff < 90 * 60 * 1000) return `${Math.round(diff / 60000)} ${t("minutes ago")}`;
  if (diff < 36 * 60 * 60 * 1000) return `${Math.round(diff / 3600000)} ${t("hours ago")}`;
  return `${Math.round(diff / 86400000)} ${t("days ago")}`;
}

export function CommerceSyncHealthCard({ workspace, language = "English", provider }: { workspace: WorkspaceContext; language?: string; provider: string }) {
  const t = (text: string) => studioT(text, language);
  const companyId = workspace.id.trim();
  const isOwner = workspace.role === "owner";
  const [connections, setConnections] = useState<CommerceHealthConnection[] | null>(null);
  const [card, setCard] = useState<CommerceHealthCard | null>(null);
  const [events, setEvents] = useState<CommerceEventRow[]>([]);
  const [review, setReview] = useState<CommerceReviewRow[]>([]);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const [health, activity, queue] = await Promise.all([
        httpsCallable<{ companyId: string; provider: string }, { connections: CommerceHealthConnection[]; card: CommerceHealthCard | null }>(functions, "getCommerceHealth")({ companyId, provider }),
        httpsCallable<{ companyId: string; limit: number }, { events: CommerceEventRow[] }>(functions, "listCommerceEvents")({ companyId, limit: 40 }),
        httpsCallable<{ companyId: string }, { items: CommerceReviewRow[] }>(functions, "listCommerceReviewQueue")({ companyId }).catch(() => ({ data: { items: [] as CommerceReviewRow[] } }))
      ]);
      setConnections((health.data?.connections ?? []).filter((row) => row.provider === provider));
      setCard(health.data?.card ?? null);
      setEvents((activity.data?.events ?? []).filter((row) => row.provider === provider).slice(0, 20));
      setReview((queue.data?.items ?? []).filter((row) => row.provider === provider));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not load."));
      setConnections([]);
    }
  }, [companyId, provider, language]);

  useEffect(() => { void load(); }, [load]);

  async function retry(eventKey: string) {
    setBusyKey(eventKey); setNotice("");
    try {
      await httpsCallable<{ companyId: string; eventKey: string }, { ok: boolean; status: string }>(functions, "retryCommerceEvent")({ companyId, eventKey });
      setNotice(t("Retried — see the result in the list."));
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t("Retry failed."));
    } finally {
      setBusyKey("");
    }
  }

  async function resolve(orderId: string) {
    setBusyKey(`review:${orderId}`); setNotice("");
    try {
      await httpsCallable<{ companyId: string; orderId: string }, { ok: boolean }>(functions, "resolveCommerceReview")({ companyId, orderId });
      setNotice(t("Resolved."));
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t("Could not load."));
    } finally {
      setBusyKey("");
    }
  }

  const entityLabel: Record<string, string> = { orders: "Orders", products: "Products", inventory: "Inventory", finance: "Finance" };
  const stateLabel: Record<string, string> = { fresh: "Fresh", stale: "Stale", never: "Never synced", unsupported: "Not supported" };
  const stateClass: Record<string, string> = { fresh: "due-pill success", stale: "due-pill warning", never: "due-pill", unsupported: "due-pill" };

  return (
    <section className="card app-card">
      <CardTitle icon="dashboard" eyebrow={t("Sync health")} title={t("Sync health")} />
      <p className="muted-copy">{t("Freshness per data type for this connection, and the events behind it.")}</p>
      {error ? <p className="layout-error">{error}</p> : null}
      {connections === null ? (
        <p className="muted-copy">{t("Loading…")}</p>
      ) : connections.length === 0 ? (
        <div>
          <span className="due-pill">{t(EMPTY_STATE_LABEL[card?.state ?? "never_synced"] ?? "Never synced")}</span>
          <p className="muted-copy" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
            {t(EMPTY_STATE_DETAIL[card?.state ?? "never_synced"] ?? "No sync activity recorded yet.")}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {connections.map((row) => (
            <div key={`${row.provider}:${row.connectionId}`} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
              <strong>{row.connectionId}</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {(["orders", "products", "inventory", "finance"] as const).map((entity) => {
                  const cell = row.health[entity] || { state: "unsupported" as const };
                  return (
                    <span key={entity} className={stateClass[cell.state] || "due-pill"} title={cell.lastSuccessAtMs ? `${t("Last successful sync")}: ${new Date(cell.lastSuccessAtMs).toLocaleString()}` : undefined}>
                      {t(entityLabel[entity])}: {t(stateLabel[cell.state] || "Not supported")}
                    </span>
                  );
                })}
              </div>
              <p className="muted-copy" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
                {t("Last successful sync")}: {commerceAgoText(row.health.orders?.lastSuccessAtMs, t)} · {t("Last webhook")}: {commerceAgoText(row.health.orders?.lastWebhookAtMs, t)} ·{" "}
                {t("Pending retries")}: {row.health.orders?.pendingRetries ?? 0} · {t("Dead letters")}: {row.health.orders?.deadLetters ?? 0}
              </p>
            </div>
          ))}
        </div>
      )}
      {connections !== null ? (
        <div style={{ marginTop: 14 }}>
          <strong style={{ fontSize: 13 }}>{t("Needs review")}</strong>
          <p className="muted-copy" style={{ fontSize: 12.5, margin: "2px 0 6px" }}>{t("Orders the sync could apply but could not vouch for: an item not in the catalogue, a missing total. Check the order, then resolve.")}</p>
          {review.length === 0 ? (
            <p className="muted-copy" style={{ fontSize: 12.5 }}>{t("Nothing needs review.")}</p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {review.map((row) => (
                <div key={row.orderId} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 12.5 }}>
                  <span className="due-pill warning">{row.providerDisplayName || row.provider}</span>
                  <span>#{row.orderNumber || row.externalId}{row.customerName ? ` · ${row.customerName}` : ""}{row.grandTotal ? ` · ${row.grandTotal} ${row.currency || ""}` : ""}</span>
                  <span className="muted-copy">{row.reasons.map((r) => t(REVIEW_REASON_LABELS[r] || r)).join(", ")}</span>
                  <a className="button secondary" style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }} href={`/orders/${encodeURIComponent(row.orderId)}`}>{t("Open order")}</a>
                  {isOwner ? (
                    <button type="button" className="button" style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }} disabled={busyKey === `review:${row.orderId}`} onClick={() => { void resolve(row.orderId); }}>
                      {t("Resolve")}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <strong style={{ fontSize: 13, display: "block", marginTop: 12 }}>{t("Recent activity")}</strong>
          {events.length === 0 ? (
            <p className="muted-copy" style={{ fontSize: 12.5 }}>{t("No events yet.")}</p>
          ) : (
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
              {events.map((row) => {
                const dead = row.status === "dead" || row.status === "failed";
                return (
                  <div key={row.key} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 12.5 }}>
                    <span className={dead ? "due-pill danger" : row.status === "applied" ? "due-pill success" : row.status === "retrying" ? "due-pill warning" : "due-pill"}>
                      {t(COMMERCE_STATUS_LABELS[row.status] || row.status)}
                    </span>
                    <span>{row.eventType}{row.externalId ? ` · #${row.externalId}` : ""}</span>
                    <span className="muted-copy">{commerceAgoText(row.startedAt ? Date.parse(row.startedAt) : null, t)}</span>
                    {row.message ? <span className="muted-copy" style={{ flexBasis: "100%" }}>{row.message}</span> : null}
                    {dead && isOwner ? (
                      <button type="button" className="button" style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }} disabled={busyKey === row.key} onClick={() => { void retry(row.key); }}>
                        {t("Retry")}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          {notice ? <p className="success-copy" style={{ fontSize: 12.5 }}>{notice}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

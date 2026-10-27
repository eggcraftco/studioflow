// Stuck store orders in the parked queue (capacity stage 1, CAP-K12 candidate, 23 Oct 2026).
//
// The stage-1 server (listHeldIntegrationOrders / releaseHeldIntegrationOrders in
// commerce/capacity.js) marks a parked row "stuck" after it has failed to import
// three times (or, when the whole store is down, a week after its first counted
// failure). A stuck row is kept — never deleted — but it no longer holds the
// queue, so the orders behind it can come in. Only the owner's "Try again"
// puts it back in its old place.
//
// Everything here reads fields a server without that rule does not send: with
// today's live list there is no `queueState`, so no row is stuck and nothing is
// shown. Pure (no Firebase), so the check script runs it for real.

export type HeldQueueRow = {
  id: string;
  provider: string;
  externalId: string;
  heldAtMs: number;
  queueState?: string;
  stuckAtMs?: number | null;
  stuckReason?: string;
  failedImports?: number;
  lastImportOutcome?: string;
  lastImportReason?: string;
  lastImportAtMs?: number | null;
};

export type HeldQueueList = {
  held?: HeldQueueRow[];
  heldCount?: number;
  stuckCount?: number;
  roomAvailable?: number;
};

/** Rows the server itself marked stuck. A row without `queueState` (older server, or parked before the rule) is never stuck. */
export function stuckHeldRows(list: HeldQueueList | null | undefined): HeldQueueRow[] {
  const rows = Array.isArray(list?.held) ? list!.held! : [];
  return rows.filter(row => row && typeof row.id === "string" && row.id && row.queueState === "stuck");
}

/** How many stuck rows there are: the server's own total when it sends one, else the rows it listed. */
export function stuckHeldCount(list: HeldQueueList | null | undefined): number {
  const listed = stuckHeldRows(list).length;
  const total = Number(list?.stuckCount);
  return Number.isFinite(total) && total > listed ? total : listed;
}

/** Rows an Import can actually bring in: Import passes stuck rows over. */
export function importableHeldCount(list: HeldQueueList | null | undefined): number {
  const held = Number(list?.heldCount) || 0;
  return Math.max(0, held - stuckHeldCount(list));
}

/** "Try again" is the owner's (and an admin's) decision; members only see the row. */
export function canRetryStuckOrders(role: string | null | undefined): boolean {
  const r = String(role || "").trim().toLowerCase();
  return r === "owner" || r === "admin";
}

/** At most 50 ids per call, as the server takes them. */
export function retryIdsFor(ids: readonly string[]): string[] {
  return [...new Set(ids.map(id => String(id || "")).filter(id => /^[A-Za-z0-9_-]{1,180}$/.test(id)))].slice(0, 50);
}

/**
 * The reason, as a fixed English sentence (studioT translates it). The server
 * stores `<result>:<why>`; `why` is the connector's own code or text, which is
 * never shown as the sentence — only as a small detail for support.
 */
export function stuckReasonSentence(reason: string | null | undefined): string {
  const raw = String(reason || "");
  const [result, ...rest] = raw.split(":");
  const why = rest.join(":");
  if (/^unknown_provider_/.test(why)) return "This store is no longer connected, so the order cannot be imported.";
  if (/^refetch_not_found/.test(why)) return "The store no longer has this order.";
  if (/^(no_payload|no_external_id|row_incomplete)/.test(why) || result === "invalid") {
    return "The store sent this order without the details NivaDesk needs to import it.";
  }
  if (/^worker_not_landed/.test(why)) return "The store connection took the order but did not finish importing it.";
  if (/auto_sync_off/.test(why)) return "Automatic sync is off for this store, so Import cannot bring the order in.";
  return "This order failed to import several times.";
}

/** The raw code, trimmed, for the small "details" line — empty when there is nothing useful. */
export function stuckReasonDetail(reason: string | null | undefined): string {
  return String(reason || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

export const STUCK_PROVIDER_LABELS: Record<string, string> = {
  amazon: "Amazon", inbound: "Website", woocommerce: "WooCommerce", woo: "WooCommerce", shopify: "Shopify",
  square: "Square", ebay: "eBay", etsy: "Etsy"
};

export function stuckProviderLabel(provider: string | null | undefined): string {
  const key = String(provider || "").trim().toLowerCase();
  return STUCK_PROVIDER_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : "Store");
}

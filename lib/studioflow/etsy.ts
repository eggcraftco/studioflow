import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

// The browser's whole view of Etsy.
//
// Every call here is a Cloud Function. Nothing in this file — and nothing the
// browser can reach — ever holds an Etsy token: the connect flow hands back a
// URL to send the seller to, and the code exchange happens server-side in
// etsyOAuthCallback. That is deliberate, and it is why there is no Etsy SDK on
// the client.

export type EtsyConnectionStatus =
  | "connected"
  | "needs_reconnect"
  | "disconnected"
  | "unknown";

export type EtsySyncEvent = {
  atMs: number;
  type: string;
  error: string;
  receiptId: string;
  /**
   * Why an order_needs_review event was written — and, on a webhook row whose
   * outcome is `skipped`, which gate declined the receipt
   * (`awaiting_first_import`, or one of the import-rule reasons).
   */
  reason?: string;
  /**
   * What a webhook row resulted in: `created` / `updated` when the receipt was
   * applied, `skipped` / `held` / `stale` when the server declined or ignored
   * it, or one of `resource_missing` / `resource_foreign_host` /
   * `resource_empty_body` / `no_resource` when the delivery was dropped.
   */
  outcome?: string;
};

export type EtsyConnection = {
  id: string;
  provider: "etsy";
  shopId: string;
  shopName: string;
  shopCurrency: string;
  status: EtsyConnectionStatus;
  scopes: string[];
  connectedAtMs: number;
  lastSyncAtMs: number;
  lastSuccessAtMs: number;
  lastErrorCode: string;
  lastErrorAtMs: number;
  needsReconnect: boolean;
  importState: "none" | "running" | "done" | string;
  importedOrders: number;
  /** The last sweep in numbers (etsySync.reconcileConnection): what to say instead of a green
   *  "last successful sync" while nothing has been imported yet. Null until a sweep has run on the new server. */
  lastSweep?: {
    atMs: number; created: number; updated: number; stale: number; held: number;
    skipped: number; failed: number; awaitingFirstImport: number; truncated: boolean;
  } | null;
  recentEvents?: EtsySyncEvent[];
};

export type EtsyImportRules = {
  sinceDays?: number;
  includeCompleted?: boolean;
  includeCancelled?: boolean;
  includeDigital?: boolean;
  includeUnpaid?: boolean;
};

export type EtsyCustomerCandidate = {
  customerId: string;
  name: string;
  score: number;
  signals: string[];
};

export type EtsyPreviewRow = {
  receiptId: string;
  buyerId: string;
  alreadyImported: boolean;
  outcome: "ready" | "review" | "unsupported";
  reason: string;
  createdAtMs: number;
  customerName: string;
  currency: string;
  total: number;
  itemTitles: string[];
  personalization: string[];
  customer: {
    decision: "link" | "create" | "review";
    confidence: string;
    signals: string[];
    candidates: EtsyCustomerCandidate[];
  };
};

export type EtsyPreview = {
  ok: boolean;
  shopId: string;
  shopName: string;
  truncated: boolean;
  summary: {
    found: number;
    ready: number;
    review: number;
    unsupported: number;
    alreadyImported: number;
    newCustomers: number;
  };
  rows: EtsyPreviewRow[];
};

export type EtsyImportOutcome = {
  ok: boolean;
  outcome: Record<string, number>;
  /** The run hit its cap and there are older orders it never asked for. */
  truncated?: boolean;
  failures: Array<{ receiptId: string; error: string }>;
};

const call = <TRequest, TResponse>(name: string) =>
  httpsCallable<TRequest, TResponse>(functions, name);

/** Start the OAuth flow. Returns the Etsy URL to send the seller to. */
export async function beginEtsyConnect(companyId: string) {
  const result = await call<{ companyId: string }, { ok: boolean; authorizeUrl: string; scopes: string[] }>(
    "beginEtsyConnect"
  )({ companyId });
  return result.data;
}

export async function getEtsyConnections(companyId: string) {
  const result = await call<{ companyId: string }, { ok: boolean; connections: EtsyConnection[]; configured: boolean }>(
    "getEtsyConnections"
  )({ companyId });
  return result.data;
}

export async function verifyEtsyConnection(companyId: string, connectionId: string) {
  const result = await call<
    { companyId: string; connectionId: string },
    { ok: boolean; healthy: boolean; reason?: string; etsyUserId?: string }
  >("verifyEtsyConnection")({ companyId, connectionId });
  return result.data;
}

export async function disconnectEtsyShop(companyId: string, connectionId: string) {
  const result = await call<{ companyId: string; connectionId: string }, { ok: boolean; ordersKept: boolean }>(
    "disconnectEtsyShop"
  )({ companyId, connectionId });
  return result.data;
}

/** A dry run. Creates nothing — the seller sees the result before anything is written. */
export async function previewEtsyImport(companyId: string, connectionId: string, rules: EtsyImportRules) {
  const result = await call<{ companyId: string; connectionId: string; rules: EtsyImportRules }, EtsyPreview>(
    "previewEtsyImport"
  )({ companyId, connectionId, rules });
  return result.data;
}

export async function runEtsyImport(
  companyId: string,
  connectionId: string,
  rules: EtsyImportRules,
  receiptIds?: string[]
) {
  const result = await call<
    { companyId: string; connectionId: string; rules: EtsyImportRules; receiptIds?: string[] },
    EtsyImportOutcome
  >("runEtsyImport")({ companyId, connectionId, rules, receiptIds });
  return result.data;
}

export async function syncEtsyNow(companyId: string, connectionId: string) {
  const result = await call<{ companyId: string; connectionId: string }, { ok: boolean; outcome: Record<string, number> }>(
    "syncEtsyNow"
  )({ companyId, connectionId });
  return result.data;
}

/** Remember "this Etsy buyer is this customer" so the next order does not ask again. */
export async function resolveEtsyCustomerMatch(
  companyId: string,
  connectionId: string,
  buyerId: string,
  customerId: string
) {
  const result = await call<
    { companyId: string; connectionId: string; buyerId: string; customerId: string },
    { ok: boolean; remembered: boolean }
  >("resolveEtsyCustomerMatch")({ companyId, connectionId, buyerId, customerId });
  return result.data;
}

/**
 * The seller-facing reason a receipt was not imported, or needs a look.
 *
 * The server sends codes; the words belong here, because the brief is explicit
 * that a technical code must never reach the screen. Anything unrecognised
 * falls back to a sentence that still says something true.
 */
export function etsyReviewReasonText(code: string, t: (text: string) => string): string {
  switch (code) {
    case "currency_mismatch":
      return t("This order uses a different currency. NivaDesk kept the original amount and did not convert it.");
    case "cancelled_at_source":
      return t("This order was cancelled on Etsy.");
    case "digital_only":
      return t("This order contains only digital items.");
    case "not_paid":
      return t("This order has not been paid yet.");
    case "no_line_items":
      return t("This order has no items NivaDesk can import.");
    case "no_buyer_id":
      return t("Etsy did not send a buyer for this order.");
    case "customer_review":
      return t("This Etsy buyer may already exist in NivaDesk. Review the details before linking the order.");
    default:
      return t("This order needs a look before it is imported.");
  }
}

/** The same, for a failed connection. Codes never reach the screen. */
export function etsyErrorText(code: string, t: (text: string) => string): string {
  switch (code) {
    case "auth_expired":
      return t("We could not refresh this Etsy connection. Existing NivaDesk orders are safe. Reconnect Etsy to continue receiving updates.");
    case "rate_limited":
      return t("Etsy is temporarily limiting requests. NivaDesk will continue automatically; no action is needed.");
    case "upstream":
    case "network":
      return t("Etsy could not be reached. NivaDesk will try again automatically.");
    case "token_unreadable":
      return t("The stored Etsy access could not be read. Reconnect the shop to continue.");
    default:
      return "";
  }
}

/**
 * One line of the sync log, in words.
 *
 * The server writes event types — reconcile_failed, token_refresh_failed — and
 * a technical code must never reach the screen. Showing the type with its
 * underscores swapped for spaces is still the code; it just looks friendlier.
 */
export function etsyEventText(
  event: { type: string; receiptId: string; reason?: string; outcome?: string },
  t: (text: string) => string
): string {
  const receipt = event.receiptId ? ` #${event.receiptId}` : "";
  switch (event.type) {
    case "order_imported":
      return `${t("Order")}${receipt} ${t("imported")}`;
    case "order_updated":
      return `${t("Order")}${receipt} ${t("updated")}`;
    case "customer_matched":
      return `${t("Order")}${receipt} ${t("matched to an existing customer")}`;
    // The reason matters here more than anywhere else in this list: an order
    // imported at a currency NivaDesk did not convert is money in the wrong
    // units until somebody looks at it, and a receipt with no Etsy buyer id
    // cannot be linked to a customer with any confidence.
    case "order_needs_review":
      return event.reason === "currency_mismatch"
        ? `${t("Order")}${receipt} ${t("needs currency review")}`
        : `${t("Order")}${receipt} ${t("needs a customer match")}`;
    // A webhook row is not always an update. When Etsy's delivery was dropped
    // the reason travels in `outcome`, and saying "Order updated" for it would
    // report the opposite of what happened. No receipt number is shown on a
    // drop: a dropped delivery has none.
    //
    // Nor is a delivery the server declined an update. `skipped` is the
    // first-import gate or the seller's own import rules refusing the receipt
    // (the server says which in `reason`), `held` is a workspace out of room,
    // `stale` is an older snapshot that arrived late and was ignored, and
    // `created` is an order that was just imported. Each says so; only an
    // outcome nobody has seen yet keeps the original "updated" line.
    case "webhook":
      switch (event.outcome) {
        case "resource_missing":
          return t("Etsy sent an update without saying which order");
        case "resource_foreign_host":
          return t("Etsy sent an update pointing somewhere NivaDesk will not follow");
        case "resource_empty_body":
          return t("Etsy sent an update but returned nothing for it");
        case "no_resource":
          return t("Etsy sent an update NivaDesk could not read");
        case "created":
          return `${t("Order")}${receipt} ${t("imported")}`;
        case "skipped":
          return event.reason === "awaiting_first_import"
            ? `${t("Order")}${receipt} ${t("is waiting for the first import")}`
            : `${t("Order")}${receipt} ${t("was not imported")}`;
        case "held":
          return `${t("Order")}${receipt} ${t("is held until the plan has room")}`;
        case "stale":
          return `${t("Order")}${receipt} ${t("received an older update, which was ignored")}`;
        default:
          return `${t("Order")}${receipt} ${t("updated")}`;
      }
    case "order_import_failed":
      return `${t("An order could not be imported")}${receipt}`;
    case "connected":
      return t("Shop connected");
    case "reconnected":
      return t("Shop reconnected");
    case "disconnected":
      return t("Shop disconnected");
    case "reconcile_failed":
      return t("A scheduled check could not finish");
    case "token_refresh_failed":
      return t("Etsy access could not be refreshed");
    case "verify_failed":
      return t("Etsy did not accept the connection check");
    default:
      return t("Etsy activity");
  }
}

import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

// The browser's whole view of the eBay connector.
//
// Every call here is a Cloud Function, and nothing in this file — nothing the
// browser can reach at all — ever holds an eBay token. The connect flow hands
// back a URL to send the seller to and a one-time nonce for the cookie; the
// code exchange, the refresh and the boxing happen server-side. The public
// view a connection comes back as carries no token, no box, no buyer hash and
// no nonce hash, so a screenshot of this data is not a credential.
//
// The one rule the three clients share: card state is read from these rows
// (`status`, `specStatus`), never from a local "I pressed Connect" flag and
// never by re-deriving specStatus from an error code here. The server owns
// that table (functions/commerce/ebay/status.js); this file only turns its
// words into sentences.

/** What the server stores. `disconnected` is not a connection. */
export type EbayConnectionStatus = "connected" | "reconnect_required" | "disconnected" | "connecting" | string;

/** The spec's word for the same row — the only thing the card may branch on. */
export type EbaySpecStatus = "connected_read_only" | "degraded" | "reauthorization_required" | "suspended" | "disconnected" | string;

export type EbayMarketplaceRow = { marketplace: string; enabled: boolean; currency: string };

export type EbaySyncEvent = { atMs: number; type: string; error?: string; orderId?: string; reason?: string };

export type EbayConnectionSettings = { autoSync: boolean; includeUnpaid: boolean; includeCancelled: boolean };

export type EbayConnection = {
  id: string;
  provider: "ebay";
  environment: string;
  sellerUsername: string;
  sellerUserId: string;
  displayName: string;
  registrationMarketplaceId: string;
  marketplaces: EbayMarketplaceRow[];
  status: EbayConnectionStatus;
  specStatus: EbaySpecStatus;
  readOnly: true;
  scopes: string[];
  capabilities: Record<string, true | false | string>;
  settings: EbayConnectionSettings;
  importState: "none" | "running" | "done" | string;
  importCounters: { created: number; updated: number; held: number; skipped: number; failed: number };
  /** null until an import has run. `complete:false` means "press Import again". */
  importCursor: { complete: boolean; failedCount: number } | null;
  connectedAtMs: number;
  lastSyncAtMs: number;
  lastSuccessAtMs: number;
  lastVerifiedAtMs: number;
  lastFullReconciliationAtMs: number;
  lastErrorCode: string;
  lastErrorAtMs: number;
  /** When the 18-month refresh authorisation should be renewed by. 0 = unknown. */
  reauthorizeByMs: number;
  needsReconnect: boolean;
  paused: boolean;
  quota: { today: number; share: number; cap: number; appToday: number };
  lastReconcile: { atMs?: number; truncated?: boolean; subWindows?: number; orders?: Partial<EbayOutcome> & { scanned?: number } } | null;
  recentEvents: EbaySyncEvent[];
};

export type EbayOutcome = { created: number; updated: number; noop: number; held: number; skipped: number; failed: number; stale: number };
export type EbaySyncResult = { ok: boolean; outcome: EbayOutcome; scanned: number; complete: boolean; truncated: boolean; subWindows: number };
export type EbayImportResult = { ok: boolean; outcome: EbayOutcome; complete: boolean; resumeFromMs: number; failures: string[] };
export type EbayImportPreview = {
  ok: boolean; sinceDays: number; ordersFound: number; duplicatesPrevented: number;
  unpaid: number; cancelled: number; marketplaces: string[]; truncated: boolean; windowsScanned: number;
};
export type EbayRevealedCustomer = {
  ok: boolean; provider: string; orderId: string; buyerUsername: string;
  fields: {
    fullName: string; companyName?: string; email?: string; phone?: string;
    address: { line1: string; line2?: string; city: string; stateOrProvince?: string; postalCode: string; countryCode: string };
  };
  updatedAtMs: number; ageDays: number;
};

const call = <TIn, TOut>(name: string) => httpsCallable<TIn, TOut>(functions, name);

/**
 * The owner's browser starts the flow and is the only browser allowed to
 * finish it: the nonce below never leaves this device, and a callback that
 * arrives without it is refused. See docs/ebay-connector-design.md §5.
 */
export async function beginEbayConnect(companyId: string) {
  return (await call<{ companyId: string }, { ok: boolean; authorizeUrl: string; state: string; nonce: string; scopes: string[]; environment: string }>(
    "beginEbayConnect")({ companyId })).data;
}
/** The native start page's half: the uid that began the flow claims it once. */
export async function claimEbayConnectState(state: string) {
  return (await call<{ state: string }, { ok: boolean; authorizeUrl: string; nonce: string }>("claimEbayConnectState")({ state })).data;
}
export async function getEbayConnections(companyId: string) {
  const data = (await call<{ companyId: string }, { ok: boolean; connections: EbayConnection[]; configured: boolean; environment: string }>(
    "getEbayConnections")({ companyId })).data;
  return { connections: data.connections ?? [], configured: data.configured !== false, environment: data.environment || "sandbox" };
}
/** Never throws for a provider failure: an unhealthy connection is an answer. */
export async function verifyEbayConnection(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, { ok: boolean; healthy: boolean; reason: string }>(
    "verifyEbayConnection")({ companyId, connectionId })).data;
}
export async function updateEbayConnectionSettings(
  companyId: string, connectionId: string,
  patch: { settings?: Partial<EbayConnectionSettings>; marketplaces?: { marketplace: string; enabled: boolean }[] }
) {
  return (await call<{ companyId: string; connectionId: string } & typeof patch, { ok: boolean; settings: EbayConnectionSettings; marketplaces: EbayMarketplaceRow[] }>(
    "updateEbayConnectionSettings")({ companyId, connectionId, ...patch })).data;
}
/** Writes nothing: it counts what an import would find, and what it would skip. */
export async function previewEbayImport(companyId: string, connectionId: string, sinceDays: number) {
  return (await call<{ companyId: string; connectionId: string; sinceDays: number }, EbayImportPreview>(
    "previewEbayImport")({ companyId, connectionId, sinceDays })).data;
}
/** Resumable: `complete:false` means press Import again, nothing is lost between. */
export async function runEbayImport(
  companyId: string, connectionId: string, sinceDays: number,
  options: { includeUnpaid?: boolean; includeCancelled?: boolean } = {}
) {
  return (await call<{ companyId: string; connectionId: string; sinceDays: number; includeUnpaid?: boolean; includeCancelled?: boolean }, EbayImportResult>(
    "runEbayImport")({ companyId, connectionId, sinceDays, ...options })).data;
}
export async function retryEbayImportFailures(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, { ok: boolean; remaining: number; recovered: number; complete?: boolean }>(
    "retryEbayImportFailures")({ companyId, connectionId })).data;
}
export async function syncEbayNow(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, EbaySyncResult>("syncEbayNow")({ companyId, connectionId })).data;
}
/** eBay has no revoke endpoint: this destroys our copy of the tokens. */
export async function disconnectEbay(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, { ok: boolean; ordersKept: boolean; revoked: boolean }>(
    "disconnectEbay")({ companyId, connectionId })).data;
}
/**
 * The buyer's address, out of the place the order document deliberately does
 * not keep it. Every call is written to the access log BEFORE the answer comes
 * back, and the server refuses when the log cannot be written.
 */
export async function revealRestrictedCustomer(companyId: string, orderId: string) {
  return (await call<{ companyId: string; orderId: string; source: string }, EbayRevealedCustomer>(
    "revealRestrictedCustomer")({ companyId, orderId, source: "web" })).data;
}

// --------------------------------------------------------------------------
// Codes into sentences. This is the ONLY place an eBay code becomes words —
// a technical code must never reach the screen — and every English string
// below has an entry in the other eleven languages (language.ts).
// --------------------------------------------------------------------------

const ERROR_TEXT: Record<string, string> = {
  credentials_rejected: "eBay no longer accepts this connection. Reconnect to continue syncing.",
  token_unreadable: "eBay no longer accepts this connection. Reconnect to continue syncing.",
  app_credentials_invalid: "eBay sync is temporarily unavailable. NivaDesk has been notified.",
  token_request_invalid: "eBay sync is temporarily unavailable. NivaDesk has been notified.",
  permission_missing: "eBay refused a permission. Reconnect and approve every permission.",
  rate_limited: "eBay is rate-limiting this account. Sync resumes automatically.",
  partial_pass: "Some eBay orders could not be imported. See Sync health.",
  provider_unavailable: "eBay could not be reached. Sync retries automatically.",
  environment_mismatch: "This eBay connection belongs to the sandbox. Disconnect it and connect your live account.",
  refresh_token_expiring: "Reconnect eBay to keep syncing.",
  disconnected: "eBay account disconnected."
};

/** "" for the benign codes ("", truncated, paused_by_owner): they are not faults. */
export function ebayErrorText(code: string): string {
  return ERROR_TEXT[String(code || "").trim()] || "";
}

/** Why a connection is not where it should be, whatever the code behind it. */
export function ebaySpecStatusText(specStatus: string, lastErrorCode: string): string {
  if (specStatus === "reauthorization_required") return ebayErrorText(lastErrorCode) || ERROR_TEXT.credentials_rejected;
  if (specStatus === "suspended") return lastErrorCode === "environment_mismatch" ? ERROR_TEXT.environment_mismatch : "eBay sync is paused on this server.";
  // Degraded with a benign code is the six-hour staleness rule, not an error.
  if (specStatus === "degraded") return ebayErrorText(lastErrorCode) || "eBay has not synced for a while. See Sync health.";
  return "";
}

export function ebayStatusLabel(specStatus: string): string {
  if (specStatus === "reauthorization_required") return "Reconnect required";
  if (specStatus === "suspended") return "Paused";
  if (specStatus === "degraded") return "Needs attention";
  if (specStatus === "connected_read_only") return "Healthy";
  return "Connected";
}

const REASON_TEXT: Record<string, string> = {
  state: "The eBay sign-in link has expired or was already used. Start again.",
  browser: "Finish connecting eBay in the same browser you started from.",
  environment: "This eBay account belongs to a different environment.",
  no_seller: "eBay did not tell us which seller account this is. Reconnect and approve every permission.",
  disabled: "eBay is not set up on this server yet. Contact support and we will enable it."
};

/** The `reason` the callback redirects with, and verify's own reason codes. */
export function ebayReasonText(reason: string): string {
  const key = String(reason || "").trim();
  return REASON_TEXT[key] || ebayErrorText(key) || "eBay did not complete the connection. Try again.";
}

const EVENT_TEXT: Record<string, string> = {
  connected: "Connected",
  reconnected: "Reconnected",
  disconnected: "Disconnected",
  sync_completed: "Sync finished",
  sync_partial: "Sync finished with something outstanding",
  sync_bisected: "A busy window was split and read in parts",
  catch_up_completed: "Caught up on what changed while disconnected",
  nightly_completed: "Nightly check finished",
  import_started: "Import started",
  import_resumed: "Import resumed",
  import_finished: "Import finished",
  import_preview: "Import preview",
  order_imported: "Order imported",
  order_import_failed: "An order could not be imported",
  order_needs_review: "An order needs a look",
  rate_limited: "eBay is rate-limiting this account",
  reauthorization_required: "eBay asked for the connection to be renewed",
  refresh_token_expiring: "The eBay authorisation is close to expiring",
  token_refresh_failed: "Renewing the eBay connection failed",
  app_credentials_invalid: "eBay refused NivaDesk's application credentials",
  environment_mismatch: "This connection belongs to another eBay environment",
  verify_failed: "The connection check failed",
  buyer_deleted: "A buyer's details were erased at eBay's request"
};

export function ebayEventText(type: string): string {
  return EVENT_TEXT[String(type || "").trim()] || "Activity";
}

/**
 * The one place the nonce cookie is written.
 *
 * It is first-party to nivadesk.app, `SameSite=Lax` so it survives eBay's
 * top-level redirect back, and scoped to the callback path so no other page in
 * the app can read it. Ten minutes is the state's own life.
 */
export function setEbayNonceCookie(nonce: string) {
  if (typeof document === "undefined" || !nonce) return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `nv_ebay_nonce=${encodeURIComponent(nonce)}${secure}; SameSite=Lax; Path=/ebay/callback; Max-Age=600`;
}

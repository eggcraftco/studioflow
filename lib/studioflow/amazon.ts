import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

// The browser's whole view of the Amazon connector.
//
// Every call here is a Cloud Function, and nothing in this file — nothing the
// browser can reach at all — ever holds an Amazon token. Connect hands back a
// URL to send the seller to and a one-time ticket that seals this browser to
// that flow; the code exchange, the refresh and the order reads all happen in
// the isolated Amazon project, behind an OIDC identity this app cannot mint.
//
// The rule this file shares with ebay.ts: card state is read from the rows the
// server returns (`status`, `needsReauth`), never from a local "I pressed
// Connect" flag. The server owns that table; this file only turns its words
// into sentences.

/** What the zone stores. `disconnected` is not a connection. */
export type AmazonConnectionStatus = "active" | "pending" | "disconnected" | string;

/**
 * Whether an arbitrary seller can finish consent yet, reported by the zone
 * itself (`/admin/status`) rather than kept as a second copy of a flag here.
 *
 * A DRAFT application can only be authorised by the developer's own Primary
 * User — Amazon's own rule, not ours — so a Connect button offered to a
 * customer in that state would open a consent screen that can never complete.
 * The screen says so plainly instead. `""` means the server did not say, which
 * is "we do not know yet", never "go ahead".
 */
export type AmazonAuthorizationMode = "draft" | "published" | "";

export type AmazonMarketplaceRow = { marketplaceId: string; countryCode: string; participating: boolean };

/**
 * The zone's `publicView`. A MEMBER is given only the first three fields — the
 * ones that answer "is this alive?" — so everything below them is optional and
 * a screen must not require it to draw a truthful card.
 */
export type AmazonConnection = {
  status: AmazonConnectionStatus;
  needsReauth: boolean;
  lastSyncAtMs: number;
  connectionId?: string;
  companyId?: string;
  needsReauthReason?: string;
  marketplaces?: AmazonMarketplaceRow[];
  consentedAtMs?: number;
  lastAttemptAtMs?: number;
  lastSyncOrders?: number;
  lastSyncErrors?: number;
  lastSyncRefused?: number;
  lastSyncAnomalies?: number;
  lastErrorClass?: string;
  lastErrorCode?: string;
  lastErrorAtMs?: number;
};

export type AmazonStatus = { authorizationMode: AmazonAuthorizationMode; connections: AmazonConnection[] };

const call = <TIn, TOut>(name: string) => httpsCallable<TIn, TOut>(functions, name);

/**
 * Owner-gated on the server, and the only place a connection is minted. The
 * `ticket` that comes back is a short-lived credential: it is handed straight
 * to sealAmazonTicket below and never logged, stored or put in a URL.
 */
export async function beginAmazonConnect(companyId: string) {
  return (await call<{ companyId: string }, { url: string; sealUrl: string; ticket: string }>(
    "amazonConnectStart")({ companyId })).data;
}

/**
 * Owners get the full rows; members get three fields. `authorizationMode` is
 * returned to both, because it describes the APPLICATION rather than this
 * workspace — without it a member's card could not say why Connect is absent.
 */
export async function getAmazonStatus(companyId: string): Promise<AmazonStatus> {
  const data = (await call<{ companyId: string }, AmazonStatus>("amazonStatus")({ companyId })).data;
  const mode = String(data?.authorizationMode || "");
  return {
    // Anything the server did not say is "unknown", never "published": the one
    // reading that would turn a missing field into an offered consent screen.
    authorizationMode: mode === "draft" || mode === "published" ? mode : "",
    connections: Array.isArray(data?.connections) ? data.connections : []
  };
}

export async function disconnectAmazon(companyId: string, connectionId: string) {
  return (await call<{ companyId: string; connectionId: string }, { ok: boolean }>(
    "amazonDisconnect")({ companyId, connectionId })).data;
}

/**
 * The ticket's other half. It cannot be written from here: the binding cookie
 * must be HttpOnly, and client JavaScript cannot set an HttpOnly cookie. So the
 * ticket is handed to the zone's own origin, which verifies it and answers with
 * the single `Set-Cookie` that seals this browser to this flow.
 *
 * Unlike eBay's, this POST is deliberately CROSS-ORIGIN: the zone lives on
 * amazon.nivadesk.app and the app on nivadesk.app. That is same-SITE, so the
 * browser sends `Sec-Fetch-Site: same-site` (which the zone requires and script
 * cannot forge) and will store a `SameSite=Lax` cookie from the response. Two
 * things are therefore not optional:
 *   - `credentials: "include"`, or the browser discards the Set-Cookie and the
 *     seller reaches Amazon with nothing sealed;
 *   - the exact `content-type`, which forces the preflight the zone answers for
 *     one allowlisted origin.
 *
 * Answering FALSE is a decision, not a detail: the caller must not send the
 * seller to Amazon when sealing failed. A doomed flow that reaches Amazon
 * anyway manufactures a live authorization code whose return leg was always
 * going to be refused — and a code we never present is the one thing nothing on
 * our side can invalidate.
 */
export async function sealAmazonTicket(sealUrl: string, ticket: string): Promise<boolean> {
  if (!sealUrl || !ticket) return false;
  // The ticket is a credential, so where it is sent is checked here even though
  // the URL came from our own callable. A server-side slip that put a foreign
  // host in `sealUrl` would otherwise become this browser POSTing a live ticket
  // to it; defence in depth costs two comparisons.
  let target: URL;
  try { target = new URL(sealUrl); } catch { return false; }
  if (target.protocol !== "https:" || target.pathname !== "/oauth/seal") return false;
  try {
    const response = await fetch(target.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket }),
      credentials: "include",
      cache: "no-store"
    });
    return response.status === 204;
  } catch {
    return false;
  }
}

/**
 * The closed set the zone redirects with (`?amazon=error&reason=…`). Anything
 * outside it gets the general sentence rather than being echoed to the screen:
 * a reason is a server's word, and only these ones have been given a meaning.
 */
const REASON_TEXT: Record<string, string> = {
  state: "That Amazon link has expired. Start again from this page.",
  session: "This connection was started in a different browser. Start again from this page.",
  denied: "Amazon access was not granted. Nothing was changed.",
  exchange: "Amazon did not complete the connection. Try again.",
  activation: "Amazon connected, but the account could not be set up. Try again."
};

export function amazonReasonText(reason: string): string {
  return REASON_TEXT[String(reason || "")] || "Amazon did not complete the connection. Try again.";
}

/** The same code-words rule ebayScreenRules.ts applies: a bare code is not a sentence. */
const CALLABLE_CODE_WORDS: ReadonlySet<string> = new Set([
  "ok", "cancelled", "unknown", "invalid-argument", "deadline-exceeded", "not-found",
  "already-exists", "permission-denied", "resource-exhausted", "failed-precondition",
  "aborted", "out-of-range", "unimplemented", "internal", "unavailable", "data-loss",
  "unauthenticated"
]);

const NOT_SET_UP = "Amazon is not set up on this server yet. Contact support and we will enable it.";

export function amazonCallableErrorText(error: unknown, fallback: string): string {
  const message = error instanceof Error ? String(error.message || "").trim() : "";
  const code = String((error as { code?: unknown } | null)?.code || "").replace(/^functions\//, "").trim();
  if (message && !CALLABLE_CODE_WORDS.has(message)) return message;
  if (code === "not-found" || code === "unimplemented") return NOT_SET_UP;
  return fallback;
}

/** A disconnected row is not a connection, so it is never the one on screen. */
export function activeAmazonConnection(rows: AmazonConnection[]): AmazonConnection | null {
  const live = (rows || []).filter((row) => row.status !== "disconnected");
  return live.find((row) => row.status === "active") || live[0] || null;
}

export function amazonStatusLabel(row: AmazonConnection | null): string {
  if (!row) return "Not connected";
  if (row.needsReauth) return "Reconnect needed";
  if (row.status === "active") return "Connected";
  if (row.status === "pending") return "Connecting…";
  return "Not connected";
}

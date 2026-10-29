// Finishing an Etsy / Square / QuickBooks / Xero / Instagram connection on the
// signed-in browser (security audit #9, 28 Oct 2026; server arm F3-09,
// security/connectClaim.js).
//
// The provider's answer no longer connects anything in whichever browser it
// lands in: the callback holds it and sends the browser to
//   /settings?section=<s>&<provider>=confirm&claim=<claim>
// (Instagram: section=customer-channels&instagram=confirm). This page then
//   1. takes the claim out of the address bar at once (history.replaceState) and
//      keeps it in sessionStorage — a sign-in in between does not lose it;
//   2. once signed in, POSTs { data: { claim } } with the ID token to the same
//      callback function (callable wire format);
//   3. on an answer, loads /settings again with the parameters the callback
//      would have redirected with (`params`) — so every provider panel shows its
//      result exactly as it does for the older server's ?etsy=connected etc.;
//      on a refusal, says why.
// A return without `confirm` (the older server) is untouched.

export type ConnectClaimProvider = "etsy" | "square" | "quickbooks" | "xero" | "instagram";

export const CONNECT_CLAIM_PROVIDERS: readonly ConnectClaimProvider[] = ["etsy", "square", "quickbooks", "xero", "instagram"];

/** The callback function that holds, and is claimed for, each provider. */
export const CONNECT_CLAIM_FUNCTIONS: Record<ConnectClaimProvider, string> = {
  etsy: "etsyOAuthCallback",
  square: "squareOAuthCallback",
  quickbooks: "quickbooksOAuthCallback",
  xero: "xeroOAuthCallback",
  instagram: "instagramConnectCallback"
};

/** The claim lives fifteen minutes on the server; the browser keeps it no longer. */
export const CONNECT_CLAIM_TTL_MS = 15 * 60_000;
const STORE_KEY = "nv_connect_claim";
// <43-char base64url secret>.<base64url state>, as the server mints it.
const CLAIM_PATTERN = /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{1,2800}$/;

export type PendingConnectClaim = {
  provider: ConnectClaimProvider;
  claim: string;
  /** The settings section the return named (kept for the panel to open). */
  section: string;
  at: number;
};

/** The claim in a /settings return, or null (no claim, or not a confirm return). */
export function readConnectClaim(search: string, now = Date.now()): PendingConnectClaim | null {
  const params = new URLSearchParams(search);
  const claim = params.get("claim") || "";
  if (!claim) return null;
  const provider = CONNECT_CLAIM_PROVIDERS.find(name => params.get(name) === "confirm");
  if (!provider || !CLAIM_PATTERN.test(claim)) return null;
  return { provider, claim, section: params.get("section") || "", at: now };
}

/** The same address without the claim and without `<provider>=confirm` (the panel opens from `section`). */
export function addressWithoutClaim(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("claim");
  for (const provider of CONNECT_CLAIM_PROVIDERS) {
    if (url.searchParams.get(provider) === "confirm") url.searchParams.delete(provider);
  }
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function stashConnectClaim(pending: PendingConnectClaim, storage: StorageLike): void {
  try { storage.setItem(STORE_KEY, JSON.stringify(pending)); } catch { /* storage unavailable: finished on this load only */ }
}

/** The stashed claim, if still within its fifteen minutes (an older one is dropped). */
export function readStashedConnectClaim(storage: StorageLike, now = Date.now()): PendingConnectClaim | null {
  let parsed: unknown = null;
  try { parsed = JSON.parse(storage.getItem(STORE_KEY) || "null"); } catch { parsed = null; }
  const row = parsed && typeof parsed === "object" ? (parsed as Partial<PendingConnectClaim>) : null;
  const valid = row
    && CONNECT_CLAIM_PROVIDERS.includes(row.provider as ConnectClaimProvider)
    && typeof row.claim === "string" && CLAIM_PATTERN.test(row.claim)
    && typeof row.at === "number" && now - row.at >= 0 && now - row.at < CONNECT_CLAIM_TTL_MS;
  if (!valid) {
    if (row) dropStashedConnectClaim(storage);
    return null;
  }
  return { provider: row!.provider as ConnectClaimProvider, claim: row!.claim as string, section: String(row!.section || ""), at: row!.at as number };
}

export function dropStashedConnectClaim(storage: StorageLike): void {
  try { storage.removeItem(STORE_KEY); } catch { /* nothing stored */ }
}

export type ConnectClaimAnswer =
  | { kind: "result"; ok: boolean; outcome: string; params: Record<string, string> }
  | { kind: "refused"; status: string; httpStatus: number };

/** The server's refusal, as one English sentence (a translation key). */
export function connectClaimRefusalSentence(status: string): string {
  switch (status) {
    case "UNAUTHENTICATED": return "Sign in to NivaDesk to finish connecting.";
    case "PERMISSION_DENIED": return "This connection was started by a different NivaDesk user. Sign in as that user, or start the connection again.";
    case "FAILED_PRECONDITION": return "This connection link has expired or was already used. Start the connection again.";
    case "INVALID_ARGUMENT": return "This connection link is not valid. Start the connection again.";
    default: return "The connection could not be finished just now. Try again.";
  }
}

/** Whether a refusal leaves the claim usable (keep it for another try / the right sign-in). */
export function connectClaimRefusalKeepsClaim(status: string): boolean {
  return status === "PERMISSION_DENIED" || status === "UNAUTHENTICATED" || status === "UNAVAILABLE" || status === "NETWORK";
}

/** The callback function's URL (the same base the app's other direct function calls use). */
export function connectClaimUrl(provider: ConnectClaimProvider, projectId: string | undefined, explicitBase = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL): string {
  const base = explicitBase ? explicitBase.replace(/\/$/, "") : projectId ? `https://europe-west2-${projectId}.cloudfunctions.net` : "";
  return base ? `${base}/${CONNECT_CLAIM_FUNCTIONS[provider]}` : "";
}

/** POST the claim with the ID token; never throws. */
export async function sendConnectClaim(
  pending: PendingConnectClaim,
  options: { idToken: string; url: string; fetchImpl?: typeof fetch }
): Promise<ConnectClaimAnswer> {
  const doFetch = options.fetchImpl ?? fetch;
  if (!options.url) return { kind: "refused", status: "UNAVAILABLE", httpStatus: 0 };
  let response: Response;
  try {
    response = await doFetch(options.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.idToken}` },
      body: JSON.stringify({ data: { claim: pending.claim } })
    });
  } catch {
    return { kind: "refused", status: "NETWORK", httpStatus: 0 };
  }
  const body = await response.json().catch(() => null) as { result?: unknown; error?: { status?: unknown } } | null;
  const result = body && body.result && typeof body.result === "object" ? body.result as { ok?: unknown; outcome?: unknown; params?: unknown } : null;
  if (response.ok && result) {
    const params: Record<string, string> = {};
    if (result.params && typeof result.params === "object") {
      for (const [key, value] of Object.entries(result.params as Record<string, unknown>).slice(0, 30)) {
        if (typeof value === "string" && key !== "claim") params[key.slice(0, 60)] = value.slice(0, 2000);
      }
    }
    return { kind: "result", ok: result.ok === true, outcome: typeof result.outcome === "string" ? result.outcome : "failed", params };
  }
  const status = body && body.error && typeof body.error.status === "string" ? body.error.status : response.status === 401 ? "UNAUTHENTICATED" : response.status === 403 ? "PERMISSION_DENIED" : "UNAVAILABLE";
  return { kind: "refused", status, httpStatus: response.status };
}

/**
 * Where to go with the server's answer: /settings with the parameters the
 * callback would have redirected with (what the panels already read). Never a
 * claim or a confirm again (no loop); `section` falls back to the claim's.
 */
export function settingsAddressForAnswer(pending: PendingConnectClaim, params: Record<string, string>, outcome: string): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "claim" || value === "confirm") continue;
    search.set(key, value);
  }
  if (!search.get("section") && pending.section) search.set("section", pending.section);
  if (!search.get(pending.provider)) search.set(pending.provider, outcome && outcome !== "confirm" ? outcome : "error");
  return `/settings?${search.toString()}`;
}

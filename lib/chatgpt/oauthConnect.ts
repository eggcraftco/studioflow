// What the ChatGPT / Claude connect page may do with the request in its URL
// (security audit #10, 28 Oct 2026).
//
// Everything in /chatgpt/connect?... can be written by whoever sent the link.
// The server checks the destination when the code is minted (chatgptOAuthApprove),
// but "Cancel" used to send the browser to redirect_uri straight from the URL —
// an open redirect on nivadesk.app. Cancel now goes back only where the server
// says this exact client + destination may go (chatgptOAuthWorkspaces
// `client.redirectAllowed === true`, server arm of #10, owner's allowlist
// decision 28 Oct). Without that answer (an older server, a failed call, a
// refusal) the page stays where it is.
//
// The page also shows what is being asked for: each requested scope in words
// (the server's filtered list when it sends one), and the client's name.

/**
 * The assistant hosts of the server's allowlist (owner decision 28 Oct, plus
 * claude.com which the server arm added; loopback for Claude Code is the
 * server's too). Display only: the page marks a destination outside them, but
 * Cancel follows the server's redirectAllowed alone.
 */
export const ASSISTANT_REDIRECT_HOSTS = ["chatgpt.com", "openai.com", "claude.ai", "claude.com", "anthropic.com"] as const;

/** The scopes the OAuth metadata advertises (functions/orchestrator/registry.js SCOPES_SUPPORTED). */
export const SUPPORTED_OAUTH_SCOPES = ["orders.read", "orders.write", "notes.read", "notes.write", "finance.read", "tasks.write"] as const;

const SCOPE_TEXT: Record<(typeof SUPPORTED_OAUTH_SCOPES)[number], string> = {
  "orders.read": "Read orders in the selected workspace",
  "orders.write": "Create orders, change their status and add order notes",
  "notes.read": "Read your personal notes",
  "notes.write": "Create and edit your personal notes",
  "finance.read": "Read financial summaries (only if your plan and role allow it)",
  "tasks.write": "Create and update tasks"
};

/** True for an https URL on one of ASSISTANT_REDIRECT_HOSTS, with no user name or password in it. */
export function isAssistantRedirect(uri: string | null | undefined): boolean {
  const raw = String(uri ?? "").trim();
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return ASSISTANT_REDIRECT_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
}

/**
 * Where Cancel sends the browser: the assistant's own redirect with
 * error=access_denied (and the state it sent), or "" to stay on this page.
 * `serverAllowed` is the server's `client.redirectAllowed` for this exact
 * client + redirect_uri (null when the server did not say).
 */
export function cancelRedirectUrl(params: { redirect_uri: string; state: string }, serverAllowed: boolean | null = null): string {
  if (serverAllowed !== true) return "";
  let redirect: URL;
  try {
    redirect = new URL(params.redirect_uri.trim());
  } catch {
    return "";
  }
  if (redirect.protocol !== "https:" && redirect.protocol !== "http:") return "";
  redirect.searchParams.set("error", "access_denied");
  redirect.searchParams.set("error_description", "User cancelled the NivaDesk connection.");
  if (params.state) redirect.searchParams.set("state", params.state);
  return redirect.toString();
}

export type RequestedScopes = {
  /** One line per recognised scope, in the advertised order. */
  lines: string[];
  /** Scopes NivaDesk does not know (they grant nothing). */
  unknown: string[];
  /** No scope named: the server's default (every advertised scope). */
  usesDefault: boolean;
};

/**
 * The requested scopes, in words. `serverScopes` is the server's filtered list
 * (chatgptOAuthWorkspaces `requestedScopes`) when it sends one; otherwise the
 * scope string from the request.
 */
export function describeRequestedScopes(scope: string | null | undefined, serverScopes: string[] | null = null): RequestedScopes {
  const source = serverScopes && serverScopes.length ? serverScopes.join(" ") : String(scope ?? "");
  const tokens = Array.from(new Set(source.split(/\s+/).map(token => token.trim()).filter(Boolean))).slice(0, 40);
  const usesDefault = tokens.length === 0;
  const named = usesDefault ? [...SUPPORTED_OAUTH_SCOPES] : tokens;
  const known = SUPPORTED_OAUTH_SCOPES.filter(supported => named.includes(supported));
  const unknown = named.filter(token => !(SUPPORTED_OAUTH_SCOPES as readonly string[]).includes(token)).map(token => token.slice(0, 80));
  return { lines: known.map(supported => SCOPE_TEXT[supported]), unknown, usesDefault };
}

export type ServerClientInfo = {
  /** client.name, or "". */
  name: string;
  /** client.redirectAllowed for this client + redirect_uri; null when the server did not say. */
  redirectAllowed: boolean | null;
  /** requestedScopes / scopes (the server's filtered list); null when absent. */
  requestedScopes: string[] | null;
  /** client.redirectHost: where the server will send the code; "" when absent. */
  redirectHost: string;
};

/** What chatgptOAuthWorkspaces says about the client (server arm of #10); all empty for an older server. */
export function serverClientInfo(data: unknown): ServerClientInfo {
  const empty: ServerClientInfo = { name: "", redirectAllowed: null, requestedScopes: null, redirectHost: "" };
  if (!data || typeof data !== "object") return empty;
  const record = data as { client?: unknown; requestedScopes?: unknown; scopes?: unknown };
  const client = record.client && typeof record.client === "object" ? (record.client as { name?: unknown; client_name?: unknown; redirectAllowed?: unknown; redirectHost?: unknown }) : null;
  const name = client ? (client.name ?? client.client_name) : "";
  const list = Array.isArray(record.requestedScopes) ? record.requestedScopes : Array.isArray(record.scopes) ? record.scopes : null;
  const scopes = list
    ? list.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean).slice(0, 40)
    : null;
  return {
    name: typeof name === "string" ? name.trim().slice(0, 120) : "",
    redirectAllowed: client && typeof client.redirectAllowed === "boolean" ? client.redirectAllowed : null,
    requestedScopes: scopes,
    redirectHost: client && typeof client.redirectHost === "string" ? client.redirectHost.trim().slice(0, 200) : ""
  };
}

/** The client's name as the server reports it (chatgptOAuthWorkspaces `client.name`), or "". */
export function serverClientName(data: unknown): string {
  return serverClientInfo(data).name;
}

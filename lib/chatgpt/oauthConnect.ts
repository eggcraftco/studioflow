// What the ChatGPT / Claude connect page may do with the request in its URL
// (security audit #10, 28 Oct 2026).
//
// Everything in /chatgpt/connect?... can be written by whoever sent the link.
// The server checks the destination when the code is minted (chatgptOAuthApprove),
// but "Cancel" used to send the browser to redirect_uri straight from the URL —
// an open redirect on nivadesk.app. Cancel now goes back only where the server
// says this client may go (chatgptOAuthWorkspaces `client.redirectAllowed`,
// server arm of #10), or — with a server that does not say yet — to the
// assistant hosts of the owner's allowlist (decision 28 Oct); anything else
// stays on this page.
//
// The page also shows what is being asked for: each requested scope in words
// (the server's filtered list when it sends one), and the client's name.

/**
 * The assistant hosts a connection may return to without the server's word (and
 * their subdomains): the owner's allowlist (28 Oct) plus claude.com, which the
 * server arm added as Anthropic's successor callback host (oauth/publicClients.js).
 * The server's list also admits loopback (Claude Code); Cancel goes there only
 * when the server confirms it.
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
  if (serverAllowed === false) return "";
  if (serverAllowed !== true && !isAssistantRedirect(params.redirect_uri)) return "";
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
  /** requestedScopes (the server's filtered list); null when absent. */
  requestedScopes: string[] | null;
};

/** What chatgptOAuthWorkspaces says about the client (server arm of #10); all empty for an older server. */
export function serverClientInfo(data: unknown): ServerClientInfo {
  const empty: ServerClientInfo = { name: "", redirectAllowed: null, requestedScopes: null };
  if (!data || typeof data !== "object") return empty;
  const record = data as { client?: unknown; requestedScopes?: unknown };
  const client = record.client && typeof record.client === "object" ? (record.client as { name?: unknown; client_name?: unknown; redirectAllowed?: unknown }) : null;
  const name = client ? (client.name ?? client.client_name) : "";
  const scopes = Array.isArray(record.requestedScopes)
    ? record.requestedScopes.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean).slice(0, 40)
    : null;
  return {
    name: typeof name === "string" ? name.trim().slice(0, 120) : "",
    redirectAllowed: client && typeof client.redirectAllowed === "boolean" ? client.redirectAllowed : null,
    requestedScopes: scopes
  };
}

/** The client's name as the server reports it (chatgptOAuthWorkspaces `client.name`), or "". */
export function serverClientName(data: unknown): string {
  return serverClientInfo(data).name;
}

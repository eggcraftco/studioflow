// What the ChatGPT / Claude connect page may do with the request in its URL
// (security audit #10, 28 Oct 2026).
//
// Everything in /chatgpt/connect?... can be written by whoever sent the link.
// The server checks the destination when the code is minted (chatgptOAuthApprove),
// but "Cancel" used to send the browser to redirect_uri straight from the URL —
// an open redirect on nivadesk.app. Cancel now goes back only to the assistants
// the server accepts (owner decision 28 Oct: an allowlist of chatgpt.com,
// openai.com, claude.ai, anthropic.com); anything else stays on this page.
//
// The page also shows what is being asked for: each requested scope in words,
// and the client's name when the server supplies it.

/** The assistant hosts a connection may return to (and their subdomains). Same list as the server's allowlist. */
export const ASSISTANT_REDIRECT_HOSTS = ["chatgpt.com", "openai.com", "claude.ai", "anthropic.com"] as const;

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
 */
export function cancelRedirectUrl(params: { redirect_uri: string; state: string }): string {
  if (!isAssistantRedirect(params.redirect_uri)) return "";
  const redirect = new URL(params.redirect_uri.trim());
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

/** The requested scope string, in words. */
export function describeRequestedScopes(scope: string | null | undefined): RequestedScopes {
  const tokens = Array.from(new Set(String(scope ?? "").split(/\s+/).map(token => token.trim()).filter(Boolean))).slice(0, 40);
  const usesDefault = tokens.length === 0;
  const named = usesDefault ? [...SUPPORTED_OAUTH_SCOPES] : tokens;
  const known = SUPPORTED_OAUTH_SCOPES.filter(supported => named.includes(supported));
  const unknown = named.filter(token => !(SUPPORTED_OAUTH_SCOPES as readonly string[]).includes(token)).map(token => token.slice(0, 80));
  return { lines: known.map(supported => SCOPE_TEXT[supported]), unknown, usesDefault };
}

/** The client's name as the server reports it (chatgptOAuthWorkspaces `client.name`), or "". */
export function serverClientName(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const client = (data as { client?: unknown }).client;
  if (!client || typeof client !== "object") return "";
  const name = (client as { name?: unknown; client_name?: unknown }).name ?? (client as { client_name?: unknown }).client_name;
  return typeof name === "string" ? name.trim().slice(0, 120) : "";
}

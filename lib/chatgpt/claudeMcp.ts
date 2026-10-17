// The Claude endpoint's public identity, in one place for the route, the
// metadata route, the connect page and scripts/check-claude-mcp-route.ts.
export const CLAUDE_MCP_RESOURCE = "https://nivadesk.app/claudeMcp";
export const CLAUDE_MCP_RESOURCE_METADATA_URL =
  "https://nivadesk.app/.well-known/oauth-protected-resource/claudeMcp";
export const CLAUDE_MCP_REQUIRED_SCOPES =
  "orders.read orders.write notes.read notes.write finance.read tasks.write";

// RFC 6750 §3 without an error code: no credential was presented. The function
// answers an unusable credential itself, with error="invalid_token".
export const CLAUDE_MCP_NO_CREDENTIAL_CHALLENGE =
  `Bearer error_description="Sign in to NivaDesk to continue", resource_metadata="${CLAUDE_MCP_RESOURCE_METADATA_URL}", scope="${CLAUDE_MCP_REQUIRED_SCOPES}"`;

/** Who the connect page names. Display only: what a grant may do never depends on it. */
export function assistantNameForResource(resource: string | null | undefined): "Claude" | "ChatGPT" {
  const raw = String(resource ?? "").trim();
  try {
    const url = new URL(raw);
    const canonical = `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
    return canonical === CLAUDE_MCP_RESOURCE && !url.search && !url.hash ? "Claude" : "ChatGPT";
  } catch {
    return "ChatGPT";
  }
}

/** Brand name of the assistant a grant belongs to (Settings ▸ ChatGPT / Claude). No field (older server) = ChatGPT. */
export function chatGPTConnectionAssistant(connection: { assistant?: string }): "ChatGPT" | "Claude" {
  return connection.assistant === "claude" ? "Claude" : "ChatGPT";
}

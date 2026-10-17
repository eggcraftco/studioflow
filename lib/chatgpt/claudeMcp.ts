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

/**
 * Which client a connection is (Settings ▸ ChatGPT / Claude): Claude Code is a
 * Claude grant whose callback is a loopback address; no field (older server or
 * a grant from before connections existed) = ChatGPT.
 */
export function chatGPTConnectionAssistant(connection: { assistant?: string; clientOrigin?: string }): "ChatGPT" | "Claude" | "Claude Code" {
  if (connection.assistant !== "claude") return "ChatGPT";
  return connection.clientOrigin === "loopback" ? "Claude Code" : "Claude";
}

/** The 21 tools claudeMcp lists (its tools/list, claude-endpoint-r3). The consent page's list is built from these. */
export const CLAUDE_MCP_TOOL_NAMES = [
  "create_order", "search_orders", "get_order_detail", "add_order_note", "update_order_status",
  "create_note", "search_notes", "get_note_detail", "append_note", "update_note", "pin_note", "archive_note",
  "get_order_financials", "get_dashboard_summary", "get_extra_spending_overview", "get_financial_overview",
  "get_bank_spending_summary", "search_bank_transactions", "attach_bank_receipt", "search_inventory", "search_commerce_orders"
] as const;

/** What the consent page says the assistant will be able to do: one line per group of the endpoint's real tools. */
export const CLAUDE_CONNECT_CAPABILITIES: { tools: readonly (typeof CLAUDE_MCP_TOOL_NAMES[number])[]; text: string }[] = [
  { tools: ["search_orders", "get_order_detail", "search_commerce_orders"], text: "Search and read orders in the selected workspace, including orders from connected shops." },
  { tools: ["create_order", "update_order_status", "add_order_note"], text: "Create orders, change their status and add order notes when you ask." },
  { tools: ["create_note", "search_notes", "get_note_detail", "append_note", "update_note", "pin_note", "archive_note"], text: "Create, read and edit your own personal notes." },
  { tools: ["get_order_financials", "get_dashboard_summary", "get_financial_overview", "get_extra_spending_overview"], text: "View financial summaries only when your NivaDesk plan and role allow financial access." },
  { tools: ["get_bank_spending_summary", "search_bank_transactions", "attach_bank_receipt"], text: "Read the bank feed, and prepare a receipt upload link for you, only when your role has Bank Spending access." },
  { tools: ["search_inventory"], text: "Search your stock." }
];

const CHATGPT_CONNECT_CAPABILITIES = [
  "Search and summarise orders, tasks, timelines and dashboard information in the selected workspace.",
  "View financial summaries only when your NivaDesk plan and role allow financial access.",
  "Create new orders, add order notes, add personal notes and update order status after your request.",
  "Read messages and quick replies only when your plan and role allow access.",
  "It will not access other workspaces unless you connect them separately."
];

/** The consent page's bullet list for the endpoint being authorised (ChatGPT's text is unchanged). */
export function connectCapabilities(resource: string | null | undefined): string[] {
  if (assistantNameForResource(resource) !== "Claude") return [...CHATGPT_CONNECT_CAPABILITIES];
  return [...CLAUDE_CONNECT_CAPABILITIES.map((group) => group.text), "It will not access other workspaces unless you connect them separately."];
}

/** The host of a client metadata document URL used as client_id (CIMD), or "" for a registered client id. */
export function clientMetadataHost(clientId: string | null | undefined): string {
  const raw = String(clientId ?? "").trim();
  if (!/^https:\/\//i.test(raw)) return "";
  try { return new URL(raw).host; } catch { return ""; }
}

/**
 * The NivaDesk connector for Claude (Anthropic): the facts the public setup page
 * (/integrations/claude) and the directory listing depend on.
 *
 * The connector address: the Claude endpoint went live on 17 Oct 2026 (web 11d622a2,
 * functions claudeMcp 00001-zed). Set in ONE place; the page shows it, is indexable
 * and is in the sitemap because it is set (app/integrations/claude/page.tsx and
 * app/sitemap.ts read this constant). Not the ChatGPT endpoint.
 */
export const CLAUDE_CONNECTOR_URL: string | null = "https://nivadesk.app/claudeMcp";

/** The connector's tools as the Claude endpoint lists them (claudeMcp tools/list,
 *  claude-endpoint/evidence/surface-diff.txt, 17 Oct 2026, 21 tools). `mode` follows
 *  the Claude surface's own annotations — they differ from ChatGPT's on five tools:
 *  readOnlyHint true → "read"; destructiveHint true → "destructive"; otherwise "write".
 *  Claude asks before every destructive call; change this only when the server does. */
export type ClaudeToolMode = "read" | "write" | "destructive";

export const CLAUDE_CONNECTOR_TOOLS: ReadonlyArray<{ name: string; mode: ClaudeToolMode }> = [
  { name: "search_orders", mode: "read" },
  { name: "get_order_detail", mode: "read" },
  { name: "search_commerce_orders", mode: "read" },
  { name: "create_order", mode: "write" },
  { name: "add_order_note", mode: "destructive" },
  { name: "update_order_status", mode: "destructive" },
  { name: "search_notes", mode: "read" },
  { name: "get_note_detail", mode: "read" },
  { name: "create_note", mode: "write" },
  { name: "append_note", mode: "destructive" },
  { name: "update_note", mode: "destructive" },
  { name: "pin_note", mode: "destructive" },
  { name: "archive_note", mode: "destructive" },
  { name: "get_dashboard_summary", mode: "read" },
  { name: "get_order_financials", mode: "read" },
  { name: "get_financial_overview", mode: "read" },
  { name: "get_extra_spending_overview", mode: "read" },
  { name: "get_bank_spending_summary", mode: "read" },
  { name: "search_bank_transactions", mode: "read" },
  { name: "attach_bank_receipt", mode: "write" },
  { name: "search_inventory", mode: "read" }
];

export function claudeToolMode(name: string): ClaudeToolMode {
  return CLAUDE_CONNECTOR_TOOLS.find(tool => tool.name === name)?.mode ?? "write";
}

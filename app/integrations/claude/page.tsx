import type { Metadata } from "next";
import { CLAUDE_CONNECTOR_URL } from "@/lib/studioflow/claudeConnector";
import ClaudeHelpPage from "./ClaudeHelpPage";

// Public on purpose (unlike /guide): this is the setup and documentation page the
// Claude Connectors Directory listing links to, so anyone must be able to read it
// before connecting, without an account. While the Claude endpoint's address is not
// published (CLAUDE_CONNECTOR_URL null) the page is noindex and app/sitemap.ts leaves
// it out; both follow the constant, so setting the address is the only switch.
export const metadata: Metadata = {
  title: "NivaDesk for Claude: setup guide, tools and permissions | NivaDesk",
  description: "How the NivaDesk connector for Claude works: who can use it, how to connect with your own NivaDesk account, the 21 tools for orders, notes, money, bank spending and inventory, the permission and safety rules, your data, and how to disconnect.",
  alternates: { canonical: "https://nivadesk.app/integrations/claude" },
  robots: CLAUDE_CONNECTOR_URL ? undefined : { index: false, follow: true }
};

export default function ClaudeIntegrationPage() {
  return <ClaudeHelpPage />;
}

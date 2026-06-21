export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { OPTIONS, POST } from "../chatgptMcp/route";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Session-Id, mcp-session-id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Link, MCP-Session-Id, mcp-session-id",
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "Content-Type": "application/json; charset=utf-8"
};

export function GET() {
  return Response.json(
    {
      name: "NivaDesk MCP Review",
      server: "NivaDesk",
      status: "ok",
      transport: "streamable-http",
      mcp: "https://nivadesk.app/chatgptMcpReview"
    },
    {
      status: 200,
      headers
    }
  );
}

export function HEAD() {
  return new Response(null, {
    status: 200,
    headers
  });
}

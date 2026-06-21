// RFC 9728: for a protected resource that has a path (https://nivadesk.app/chatgptMcp),
// the spec-compliant metadata location is the path-suffixed well-known URL
// (/.well-known/oauth-protected-resource/chatgptMcp). Strict MCP/OAuth clients look
// here first; serving the same metadata here avoids a 404 during OAuth discovery.
const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Content-Type": "application/json; charset=utf-8"
};

const protectedResourceMetadata = {
  resource: "https://nivadesk.app/chatgptMcp",
  authorization_servers: ["https://nivadesk.app"],
  bearer_methods_supported: ["header"],
  scopes_supported: [
    "orders.read",
    "orders.write",
    "notes.read",
    "notes.write",
    "finance.read",
    "tasks.write"
  ],
  resource_documentation: "https://nivadesk.app/privacy",
  server: "NivaDesk"
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(protectedResourceMetadata, { headers: responseHeaders });
}

export function HEAD() {
  return new Response(null, { status: 200, headers: responseHeaders });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: responseHeaders });
}

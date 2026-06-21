// Some OAuth/MCP clients (and ChatGPT's app submission scanner) probe
// /.well-known/openid-configuration as an alternative to oauth-authorization-server.
// We are an OAuth 2.0 (not full OIDC) provider, so we expose the same authorization
// server metadata here to avoid a 404 during discovery.
const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Content-Type": "application/json; charset=utf-8"
};

const authorizationServerMetadata = {
  issuer: "https://nivadesk.app",
  authorization_endpoint: "https://nivadesk.app/chatgptOAuthAuthorize",
  token_endpoint: "https://nivadesk.app/chatgptOAuthToken",
  client_id_metadata_document_supported: false,
  registration_endpoint: "https://nivadesk.app/chatgptOAuthRegister",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: [
    "orders.read",
    "orders.write",
    "notes.read",
    "notes.write",
    "finance.read",
    "tasks.write"
  ],
  service_documentation: "https://nivadesk.app/privacy",
  ui_locales_supported: ["en", "tr"],
  server: "NivaDesk"
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(authorizationServerMetadata, { headers: responseHeaders });
}

export function HEAD() {
  return new Response(null, { status: 200, headers: responseHeaders });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: responseHeaders });
}

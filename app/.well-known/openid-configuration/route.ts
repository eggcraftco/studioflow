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
  // Our server implements Dynamic Client Registration (DCR) only, not the Client ID
  // Metadata Document flow. ChatGPT PRIORITISES CIMD when this is true, then fails
  // ("Error fetching OAuth configuration") because we don't actually serve CIMD. Keep
  // false so ChatGPT uses the registration_endpoint (DCR), which we support.
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

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "Content-Type": "application/json; charset=utf-8"
};

const scopesSupported = [
  "orders.read",
  "orders.write",
  "notes.read",
  "notes.write",
  "finance.read",
  "tasks.write"
];

const authorizationServerMetadata = {
  issuer: "https://nivadesk.app",
  authorization_endpoint: "https://nivadesk.app/chatgptOAuthAuthorize",
  token_endpoint: "https://nivadesk.app/chatgptOAuthToken",
  registration_endpoint: "https://nivadesk.app/chatgptOAuthRegister",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: scopesSupported,
  resource_indicators_supported: true,
  authorization_response_iss_parameter_supported: false,
  client_id_metadata_document_supported: false,
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

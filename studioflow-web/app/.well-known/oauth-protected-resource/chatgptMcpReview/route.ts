export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_URL = "https://nivadesk.app";
const RESOURCE_URL = `${BASE_URL}/chatgptMcpReview`;
const AUTHORIZATION_SERVER = BASE_URL;

const metadata = {
  resource: RESOURCE_URL,
  authorization_servers: [AUTHORIZATION_SERVER],
  bearer_methods_supported: ["header"],
  scopes_supported: [
    "orders.read",
    "orders.write",
    "notes.read",
    "notes.write",
    "finance.read",
    "tasks.write"
  ],
  resource_documentation: `${BASE_URL}/privacy`,
  server: "NivaDesk"
};

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "Content-Type": "application/json; charset=utf-8"
};

export function GET() {
  return Response.json(metadata, { status: 200, headers });
}

export function HEAD() {
  return new Response(null, { status: 200, headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}

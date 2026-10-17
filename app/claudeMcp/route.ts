import { proxyNivaDeskFirebaseFunction } from "@/lib/chatgpt/proxyFirebaseFunction";
import { CLAUDE_MCP_NO_CREDENTIAL_CHALLENGE, CLAUDE_MCP_RESOURCE_METADATA_URL } from "@/lib/chatgpt/claudeMcp";

// https://nivadesk.app/claudeMcp — the Claude Connectors Directory endpoint.
//
// The same NivaDesk MCP server as /chatgptMcp, behind its own Cloud Function
// (claudeMcp), which runs the SAME request handler, OAuth resolver and
// dispatcher with the same plan, role and workspace checks. Only the wording of
// the tool list differs (no ChatGPT / OpenAI metadata), and a grant minted for
// this URL is bound to it. Nothing here decides access: this route only
// answers the no-credential case with the 401 Claude needs to start sign-in,
// and otherwise passes the request through untouched.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Discovery without an account: the tool metadata, never workspace data.
const PUBLIC_MCP_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "tools/list",
  "ping"
]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, mcp-protocol-version, MCP-Session-Id, mcp-session-id",
    "Access-Control-Expose-Headers": "WWW-Authenticate, Link, MCP-Protocol-Version, MCP-Session-Id, mcp-session-id"
  };
}

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  };
}

function authChallengeHeaders() {
  return {
    ...corsHeaders(),
    ...noStoreHeaders(),
    "WWW-Authenticate": CLAUDE_MCP_NO_CREDENTIAL_CHALLENGE,
    "Link": `<${CLAUDE_MCP_RESOURCE_METADATA_URL}>; rel="oauth-protected-resource"`
  };
}

function hasBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return /^Bearer\s+\S+/i.test(authorization.trim());
}

function unauthorizedResponse(method: string) {
  if (method === "HEAD") {
    return new Response(null, { status: 401, headers: authChallengeHeaders() });
  }
  return Response.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: "Sign in to NivaDesk to continue." }
    },
    { status: 401, headers: authChallengeHeaders() }
  );
}

async function readMcpMethod(request: Request) {
  try {
    const payload = await request.clone().json();
    return typeof payload?.method === "string" ? payload.method : null;
  } catch {
    return null;
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...corsHeaders(), ...noStoreHeaders() } });
}

export async function HEAD(request: Request) {
  if (!hasBearerToken(request)) return unauthorizedResponse("HEAD");
  return proxyNivaDeskFirebaseFunction(request, "claudeMcp");
}

export async function GET(request: Request) {
  if (!hasBearerToken(request)) return unauthorizedResponse("GET");
  return proxyNivaDeskFirebaseFunction(request, "claudeMcp");
}

export async function POST(request: Request) {
  if (!hasBearerToken(request)) {
    const method = await readMcpMethod(request);
    if (!method || !PUBLIC_MCP_METHODS.has(method)) {
      return unauthorizedResponse("POST");
    }
  }
  return proxyNivaDeskFirebaseFunction(request, "claudeMcp");
}

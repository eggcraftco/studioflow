import { proxyNivaDeskFirebaseFunction } from "@/lib/chatgpt/proxyFirebaseFunction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESOURCE_METADATA_URL =
  "https://nivadesk.app/.well-known/oauth-protected-resource/chatgptMcp";

const REQUIRED_SCOPES =
  "orders.read orders.write notes.read notes.write finance.read tasks.write";

const PUBLIC_MCP_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "tools/list"
]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Session-Id, mcp-session-id",
    "Access-Control-Expose-Headers": "WWW-Authenticate, Link, MCP-Session-Id, mcp-session-id"
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
    "WWW-Authenticate": `Bearer resource_metadata="${RESOURCE_METADATA_URL}", scope="${REQUIRED_SCOPES}"`,
    "Link": `<${RESOURCE_METADATA_URL}>; rel="oauth-protected-resource"`
  };
}

function hasBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return /^Bearer\s+\S+/i.test(authorization.trim());
}

function unauthorizedResponse(method: string) {
  if (method === "HEAD") {
    return new Response(null, {
      status: 401,
      headers: authChallengeHeaders()
    });
  }

  return Response.json(
    {
      error: "authorization_required",
      resource_metadata: RESOURCE_METADATA_URL
    },
    {
      status: 401,
      headers: authChallengeHeaders()
    }
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
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(),
      ...noStoreHeaders()
    }
  });
}

export async function HEAD(request: Request) {
  if (!hasBearerToken(request)) {
    return unauthorizedResponse("HEAD");
  }

  return proxyNivaDeskFirebaseFunction(request, "chatgptMcp");
}

export async function GET(request: Request) {
  if (!hasBearerToken(request)) {
    return unauthorizedResponse("GET");
  }

  return proxyNivaDeskFirebaseFunction(request, "chatgptMcp");
}

export async function POST(request: Request) {
  if (!hasBearerToken(request)) {
    const method = await readMcpMethod(request);

    // OpenAI's submission scanner needs to read the MCP tool metadata before a
    // user completes OAuth. Keep business data protected, but allow the public
    // handshake/tool-list calls so the dashboard can scan the server.
    if (!method || !PUBLIC_MCP_METHODS.has(method)) {
      return unauthorizedResponse("POST");
    }
  }

  return proxyNivaDeskFirebaseFunction(request, "chatgptMcp");
}

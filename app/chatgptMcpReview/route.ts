export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, mcp-protocol-version, MCP-Session-Id, mcp-session-id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Link, MCP-Protocol-Version, mcp-protocol-version, MCP-Session-Id, mcp-session-id",
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "Content-Type": "application/json; charset=utf-8"
};

// SEC-ABUSE-01 G3 (privacy): this route used to log the full request URL (query
// string included), the client address headers and every header value except
// authorization/cookie, so an mcp-session-id, an API key or a token put in a
// query string landed in the host's logs. It now logs ONE safe event per
// request, after the response is known: route name, HTTP method, the JSON-RPC
// method only when it is one this route knows, the response status, a request
// id generated here, an error class, and a coarse client family. Never the URL,
// the query, an address, a header value or the request body.
const REVIEW_ROUTE = "chatgptMcpReview";
const KNOWN_RPC_METHODS = new Set(["initialize", "ping", "tools/list", "notifications"]);

function reviewClientFamily(userAgent: string | null): string {
  const ua = (userAgent || "").toLowerCase();
  if (!ua) return "none";
  if (/openai|chatgpt/.test(ua)) return "openai";
  if (/claude|anthropic/.test(ua)) return "anthropic";
  if (/python|curl|wget|go-http|node|axios|undici/.test(ua)) return "script";
  if (/mozilla/.test(ua)) return "browser";
  return "other";
}

function reviewRequestId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

function logReviewEvent(
  method: string,
  request: Request | undefined,
  response: Response,
  { rpcMethod = "", errorClass = null }: { rpcMethod?: string; errorClass?: string | null } = {}
): Response {
  const rpc = rpcMethod.startsWith("notifications/") ? "notifications" : rpcMethod;
  console.log(
    "[MCP Review]",
    JSON.stringify({
      event: "mcp_review_request",
      route: REVIEW_ROUTE,
      method,
      rpcMethod: rpc ? (KNOWN_RPC_METHODS.has(rpc) ? rpc : "unknown") : null,
      status: response.status,
      requestId: reviewRequestId(),
      errorClass,
      client: reviewClientFamily(request?.headers.get("user-agent") ?? null),
      timestamp: new Date().toISOString()
    })
  );
  return response;
}

function mcpMethodNotAllowedResponse() {
  return Response.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32000,
        message: "This MCP endpoint does not provide a server-initiated SSE stream."
      }
    },
    {
      status: 405,
      headers: {
        ...headers,
        "Allow": "POST, OPTIONS"
      }
    }
  );
}

const noAuthSecuritySchemes = [{ type: "noauth" }];
const supportedProtocolVersions = ["2025-06-18", "2025-03-26"];

const reviewTools = [
  {
    name: "search_orders",
    title: "Search orders",
    description: "Search NivaDesk orders in the connected workspace by customer name, email, watch model, status, order ID, or keyword.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        query: {
          type: "string",
          description: "Search keyword, customer name, email, watch model, or order ID."
        },
        status: {
          type: "string",
          description: "Optional status filter."
        },
        limit: {
          type: "number",
          description: "Maximum number of orders to return. Default is 10."
        }
      }
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    securitySchemes: noAuthSecuritySchemes,
    _meta: {
      securitySchemes: noAuthSecuritySchemes
    }
  }
];

async function readMcpPayload(request: Request): Promise<{ payload: Record<string, unknown>; invalidJson: boolean }> {
  try {
    const payload = await request.json();
    return { payload: payload && typeof payload === "object" ? payload : {}, invalidJson: false };
  } catch {
    return { payload: {}, invalidJson: true };
  }
}

function mcpResult(id: unknown, result: unknown, status = 200) {
  return Response.json(
    {
      jsonrpc: "2.0",
      id,
      result
    },
    {
      status,
      headers
    }
  );
}

function mcpError(id: unknown, code: number, message: string, status = 200) {
  return Response.json(
    {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message
      }
    },
    {
      status,
      headers
    }
  );
}

function negotiatedProtocolVersion(payload: Record<string, unknown>) {
  const params = payload.params && typeof payload.params === "object" ? payload.params : {};
  const requestedVersion =
    "protocolVersion" in params && typeof params.protocolVersion === "string"
      ? params.protocolVersion
      : "";

  return supportedProtocolVersions.includes(requestedVersion)
    ? requestedVersion
    : supportedProtocolVersions[0];
}

export function GET(request: Request) {
  if ((request.headers.get("accept") ?? "").includes("text/event-stream")) {
    return logReviewEvent("GET", request, mcpMethodNotAllowedResponse(), { errorClass: "sse_not_supported" });
  }

  return logReviewEvent("GET", request, Response.json(
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
  ));
}

export function HEAD(request: Request) {
  return logReviewEvent("HEAD", request, new Response(null, {
    status: 200,
    headers
  }));
}

export function OPTIONS(request: Request) {
  return logReviewEvent("OPTIONS", request, new Response(null, {
    status: 204,
    headers
  }));
}

export async function POST(request: Request) {
  const { payload, invalidJson } = await readMcpPayload(request);
  const id = "id" in payload ? payload.id : null;
  const method = typeof payload.method === "string" ? payload.method : "";
  const done = (response: Response, errorClass: string | null = null) =>
    logReviewEvent("POST", request, response, { rpcMethod: method, errorClass: invalidJson ? "invalid_json" : errorClass });

  if (method.startsWith("notifications/")) {
    return done(new Response(null, {
      status: 202,
      headers
    }));
  }

  switch (method) {
    case "initialize":
      return done(mcpResult(id, {
        protocolVersion: negotiatedProtocolVersion(payload),
        serverInfo: {
          name: "NivaDesk MCP Review",
          version: "0.1.0"
        },
        capabilities: {
          tools: {}
        },
        instructions: "Temporary no-auth MCP review endpoint for OpenAI Apps dashboard tool scanning."
      }));

    case "ping":
      return done(mcpResult(id, {}));

    case "tools/list":
      return done(mcpResult(id, {
        tools: reviewTools
      }));

    default:
      return done(mcpError(id, -32601, `Method not found: ${method || "(empty)"}`), "method_not_found");
  }
}

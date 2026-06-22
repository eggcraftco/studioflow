export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function logReviewRequest(method: string, request?: Request) {
  const safeHeaders: Record<string, string> = {};

  if (request) {
    for (const [key, value] of request.headers.entries()) {
      const lowerKey = key.toLowerCase();

      if (lowerKey === "authorization" || lowerKey === "cookie") {
        safeHeaders[key] = "[redacted]";
      } else {
        safeHeaders[key] = value;
      }
    }
  }

  console.log(
    "[OpenAI MCP Review Scan]",
    JSON.stringify({
      method,
      url: request?.url ?? null,
      userAgent: request?.headers.get("user-agent") ?? null,
      xForwardedFor: request?.headers.get("x-forwarded-for") ?? null,
      xRealIp: request?.headers.get("x-real-ip") ?? null,
      headers: safeHeaders,
      timestamp: new Date().toISOString()
    })
  );
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

async function readMcpPayload(request: Request) {
  try {
    const payload = await request.json();
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
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

export function GET(request: Request) {
  logReviewRequest("GET", request);

  if ((request.headers.get("accept") ?? "").includes("text/event-stream")) {
    return mcpMethodNotAllowedResponse();
  }

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

export function HEAD(request: Request) {
  logReviewRequest("HEAD", request);

  return new Response(null, {
    status: 200,
    headers
  });
}

export function OPTIONS(request: Request) {
  logReviewRequest("OPTIONS", request);
  return new Response(null, {
    status: 204,
    headers
  });
}

export async function POST(request: Request) {
  logReviewRequest("POST", request);
  const payload = await readMcpPayload(request);
  const id = "id" in payload ? payload.id : null;
  const method = typeof payload.method === "string" ? payload.method : "";

  if (method.startsWith("notifications/")) {
    return new Response(null, {
      status: 202,
      headers
    });
  }

  switch (method) {
    case "initialize":
      return mcpResult(id, {
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: "NivaDesk MCP Review",
          version: "0.1.0"
        },
        capabilities: {
          tools: {}
        },
        instructions: "Temporary no-auth MCP review endpoint for OpenAI Apps dashboard tool scanning."
      });

    case "ping":
      return mcpResult(id, {});

    case "tools/list":
      return mcpResult(id, {
        tools: reviewTools
      });

    default:
      return mcpError(id, -32601, `Method not found: ${method || "(empty)"}`);
  }
}

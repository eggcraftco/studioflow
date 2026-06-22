import {
  OPTIONS as baseOptions,
  POST as basePost
} from "../chatgptMcp/route";

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

async function readMcpMethod(request: Request) {
  try {
    const payload = await request.clone().json();
    return typeof payload?.method === "string" ? payload.method : null;
  } catch {
    return null;
  }
}

async function noAuthToolsListResponse(response: Response) {
  if (!response.ok) {
    return response;
  }

  const payload = await response.clone().json();
  const tools = payload?.result?.tools;

  if (!Array.isArray(tools)) {
    return response;
  }

  const securitySchemes = [{ type: "noauth" }];
  const normalizedPayload = {
    ...payload,
    result: {
      ...payload.result,
      tools: tools.map((tool) => ({
        ...tool,
        securitySchemes,
        _meta: {
          ...(tool._meta || {}),
          securitySchemes
        }
      }))
    }
  };
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-length");

  return Response.json(normalizedPayload, {
    status: response.status,
    headers: responseHeaders
  });
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
  return baseOptions();
}

export async function POST(request: Request) {
  logReviewRequest("POST", request);
  const method = await readMcpMethod(request);
  const response = await basePost(request);

  if (method === "tools/list") {
    return noAuthToolsListResponse(response);
  }

  return response;
}

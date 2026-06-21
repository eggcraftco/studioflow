const FIREBASE_FUNCTIONS_BASE_URL =
  "https://europe-west2-eggcraft-studio.cloudfunctions.net";

const LEGACY_PUBLIC_ORIGINS = [
  "https://eggcraft-studio.web.app",
  "https://lightslategray-pheasant-732922.hostingersite.com"
];

const CHATGPT_MCP_RESOURCE = "https://nivadesk.app/chatgptMcp";

function rewritePublicLocation(location: string | null): string | null {
  if (!location) return null;

  let updatedLocation = location;
  for (const legacyOrigin of LEGACY_PUBLIC_ORIGINS) {
    updatedLocation = updatedLocation.replace(legacyOrigin, "https://nivadesk.app");
  }
  return updatedLocation;
}

function preserveOAuthResourceParam(
  location: string | null,
  incomingUrl: URL,
  functionName: string
): string | null {
  if (!location || functionName !== "chatgptOAuthAuthorize") {
    return location;
  }

  const resource = incomingUrl.searchParams.get("resource") ?? CHATGPT_MCP_RESOURCE;

  try {
    const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(location);
    const locationUrl = new URL(location, incomingUrl.origin);

    if (
      locationUrl.origin === "https://nivadesk.app" &&
      locationUrl.pathname === "/chatgpt/connect" &&
      !locationUrl.searchParams.has("resource")
    ) {
      locationUrl.searchParams.set("resource", resource);
    }

    if (isAbsolute) {
      return locationUrl.toString();
    }

    return `${locationUrl.pathname}${locationUrl.search}${locationUrl.hash}`;
  } catch {
    return location;
  }
}

function addChatGptCorsHeaders(responseHeaders: Headers, functionName: string) {
  if (!functionName.startsWith("chatgpt")) {
    return;
  }

  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  responseHeaders.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, MCP-Session-Id, mcp-session-id"
  );
}

function addMcpAuthChallengeIfNeeded(
  responseHeaders: Headers,
  functionName: string,
  status: number
) {
  if (functionName !== "chatgptMcp" || status !== 401) {
    return;
  }

  if (!responseHeaders.has("WWW-Authenticate")) {
    responseHeaders.set(
      "WWW-Authenticate",
      'Bearer resource_metadata="https://nivadesk.app/.well-known/oauth-protected-resource/chatgptMcp", scope="orders.read orders.write notes.read notes.write finance.read tasks.write"'
    );
  }

  responseHeaders.set("Access-Control-Expose-Headers", "WWW-Authenticate, MCP-Session-Id, mcp-session-id");
}

export async function proxyNivaDeskFirebaseFunction(
  request: Request,
  functionName: string
): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`${FIREBASE_FUNCTIONS_BASE_URL}/${functionName}`);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");
  headers.set("x-forwarded-host", incomingUrl.host);
  headers.set("x-forwarded-proto", "https");

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD"
    ? undefined
    : await request.arrayBuffer();

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: "manual",
    cache: "no-store"
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-length");
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.set("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  responseHeaders.set("Pragma", "no-cache");
  responseHeaders.set("Expires", "0");

  const location = preserveOAuthResourceParam(
    rewritePublicLocation(responseHeaders.get("location")),
    incomingUrl,
    functionName
  );

  if (location) {
    responseHeaders.set("location", location);
  }

  addChatGptCorsHeaders(responseHeaders, functionName);
  addMcpAuthChallengeIfNeeded(responseHeaders, functionName, upstream.status);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders
  });
}

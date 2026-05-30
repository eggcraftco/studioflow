const FIREBASE_FUNCTIONS_BASE_URL =
  "https://europe-west2-eggcraft-studio.cloudfunctions.net";

const LEGACY_PUBLIC_ORIGINS = [
  "https://eggcraft-studio.web.app",
  "https://lightslategray-pheasant-732922.hostingersite.com"
];

function rewritePublicLocation(location: string | null): string | null {
  if (!location) return null;

  let updatedLocation = location;
  for (const legacyOrigin of LEGACY_PUBLIC_ORIGINS) {
    updatedLocation = updatedLocation.replace(legacyOrigin, "https://nivadesk.app");
  }
  return updatedLocation;
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

  const location = rewritePublicLocation(responseHeaders.get("location"));
  if (location) {
    responseHeaders.set("location", location);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders
  });
}

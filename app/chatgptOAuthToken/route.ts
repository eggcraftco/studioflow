import { proxyNivaDeskFirebaseFunction } from "@/lib/chatgpt/proxyFirebaseFunction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const preflightHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0"
};

function handle(request: Request) {
  return proxyNivaDeskFirebaseFunction(request, "chatgptOAuthToken");
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: preflightHeaders });
}

export { handle as GET, handle as POST, handle as HEAD };

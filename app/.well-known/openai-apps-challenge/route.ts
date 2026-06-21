// OpenAI Apps domain verification.
//
// ChatGPT verifies domain ownership by fetching this origin-root well-known URL
// and checking that it returns the exact token shown in the app's MCP setup
// screen under Domain verification → Token.
//
// Keep this route isolated from OAuth/MCP discovery. It only returns plain text.

const CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? "REPLACE_WITH_OPENAI_TOKEN";

const responseHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS"
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(CHALLENGE_TOKEN, { status: 200, headers: responseHeaders });
}

export function HEAD() {
  return new Response(null, { status: 200, headers: responseHeaders });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: responseHeaders });
}

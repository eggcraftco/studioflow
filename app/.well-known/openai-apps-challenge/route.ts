export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHALLENGE_TOKEN =
  "aU3AeoxvW2W2EZvSnDAcFO-wZ5ymFzm4rUSD12UD_w4";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "Content-Type": "text/plain; charset=utf-8"
};

export function GET() {
  return new Response(CHALLENGE_TOKEN, {
    status: 200,
    headers
  });
}

export function HEAD() {
  return new Response(null, {
    status: 200,
    headers
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers
  });
}

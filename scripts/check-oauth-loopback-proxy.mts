// OAuth loopback redirect through the web proxy (17 Oct 2026).
//   node scripts/check-oauth-loopback-proxy.mts      (or: npx tsx scripts/check-oauth-loopback-proxy.mts)
// Route handlers get a NextRequest, whose .url rewrites the first 127.x.x.x / [::1] / localhost anywhere in the URL to
// "localhost". The proxy must forward the query exactly as the client sent it:
// 1. redirect_uri=http://127.0.0.1:PORT/cb (encoded and raw), 127.0.0.2, raw [::1] reach the function unchanged.
// 2. https clients (ChatGPT, claude.ai DCR, claude.ai CIMD client_id) and localhost: the forwarded URL is the same
//    string as before the fix (the query has no loopback literal, so Next's copy and the raw URL are identical).
// 3. the function's Location comes back untouched (Claude /connect) / with `resource` added (ChatGPT /chatgpt/connect).
// 4. POST bodies (approve, token) are forwarded byte-for-byte.
import { NextRequest } from "next/server.js";
import { proxyNivaDeskFirebaseFunction } from "../lib/chatgpt/proxyFirebaseFunction.ts";

let failures = 0; let checks = 0;
const check = (ok: boolean, what: string) => { checks += 1; if (!ok) { failures += 1; console.error(`FAIL ${what}`); } else console.log(`ok   ${what}`); };

const FN = "https://europe-west2-eggcraft-studio.cloudfunctions.net";
type Seen = { url: string; body: string };
let seen: Seen[] = [];
let location = "";
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const body = init?.body ? Buffer.from(init.body as ArrayBuffer).toString("utf8") : "";
  seen.push({ url: String(input), body });
  return new Response(null, { status: 302, headers: location ? { location } : {} });
}) as typeof fetch;

// What the function's query looked like before this fix: Next's normalised copy.
const before = (url: string) => `${FN}/chatgptOAuthAuthorize${new URL(new NextRequest(url).url).search}`;

async function authorize(query: string, loc = "") {
  seen = []; location = loc;
  const url = `https://nivadesk.app/chatgptOAuthAuthorize?${query}`;
  const res = await proxyNivaDeskFirebaseFunction(new NextRequest(url), "chatgptOAuthAuthorize");
  return { forwarded: seen[0]?.url || "", location: res.headers.get("location") || "", url };
}

const q = (redirect: string, extra = "", clientId = "client-1") =>
  `response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&state=st-1&code_challenge=abc&code_challenge_method=S256${extra}`;
const CLAUDE_RES = `&resource=${encodeURIComponent("https://nivadesk.app/claudeMcp")}`;

async function main() {
  // the bug, as Next does it
  const bug = new NextRequest(`https://nivadesk.app/x?${q("http://127.0.0.1:8765/callback")}`).url;
  check(bug.includes("redirect_uri=http%3A%2F%2Flocalhost%3A8765"), "Next's request.url turns redirect_uri 127.0.0.1 into localhost (the bug's cause)");

  // 1. loopback literals
  for (const [label, query, want] of [
    ["127.0.0.1 encoded", q("http://127.0.0.1:8765/callback", CLAUDE_RES), "redirect_uri=http%3A%2F%2F127.0.0.1%3A8765%2Fcallback"],
    ["127.0.0.1 raw", `response_type=code&client_id=c&redirect_uri=http://127.0.0.1:8765/callback&state=s`, "redirect_uri=http://127.0.0.1:8765/callback"],
    ["127.0.0.2 encoded", q("http://127.0.0.2:8765/callback"), "redirect_uri=http%3A%2F%2F127.0.0.2%3A8765%2Fcallback"],
    ["[::1] raw", `response_type=code&client_id=c&redirect_uri=http://[::1]:8765/callback&state=s`, "redirect_uri=http://[::1]:8765/callback"],
    ["[::1] encoded", q("http://[::1]:8765/callback"), "redirect_uri=http%3A%2F%2F%5B%3A%3A1%5D%3A8765%2Fcallback"]
  ] as const) {
    const r = await authorize(query);
    check(r.forwarded === `${FN}/chatgptOAuthAuthorize?${query}` && r.forwarded.includes(want), `${label}: the function receives the query exactly as sent`);
  }

  // 2. unchanged for every client that worked before
  const CHATGPT_CB = "https://chatgpt.com/connector_platform_oauth_redirect";
  const CLAUDE_CB = "https://claude.ai/api/mcp/auth_callback";
  const CIMD = "https://claude.ai/oauth/mcp-oauth-client-metadata";
  for (const [label, query] of [
    ["ChatGPT DCR (no resource)", q(CHATGPT_CB, "", "chatgpt-client")],
    ["ChatGPT DCR (resource chatgptMcp)", q(CHATGPT_CB, `&resource=${encodeURIComponent("https://nivadesk.app/chatgptMcp")}`, "chatgpt-client")],
    ["claude.ai DCR", q(CLAUDE_CB, CLAUDE_RES, "claude-client")],
    ["claude.ai CIMD", q(CLAUDE_CB, CLAUDE_RES, CIMD)],
    ["Claude Code localhost", q("http://localhost:53682/callback", CLAUDE_RES)]
  ] as const) {
    const r = await authorize(query);
    check(r.forwarded === before(r.url) && r.forwarded === `${FN}/chatgptOAuthAuthorize?${query}`, `${label}: forwarded URL identical to before the fix`);
  }

  // 3. Location handling unchanged
  const connect = `https://nivadesk.app/connect?resource=${encodeURIComponent("https://nivadesk.app/claudeMcp")}&client_id=c&redirect_uri=${encodeURIComponent("http://127.0.0.1:8765/callback")}&state=s`;
  const r3 = await authorize(q("http://127.0.0.1:8765/callback", CLAUDE_RES), connect);
  check(r3.location === connect, "Claude /connect Location passes through untouched (127.0.0.1 kept)");
  const gptLoc = `https://nivadesk.app/chatgpt/connect?client_id=g&redirect_uri=${encodeURIComponent(CHATGPT_CB)}&state=s`;
  const r4 = await authorize(q(CHATGPT_CB, "", "g"), gptLoc);
  check(r4.location === `${gptLoc}&resource=${encodeURIComponent("https://nivadesk.app/chatgptMcp")}`, "ChatGPT /chatgpt/connect Location still gets resource=chatgptMcp");

  // 4. POST bodies
  for (const fn of ["chatgptOAuthApprove", "chatgptOAuthToken"]) {
    const body = fn === "chatgptOAuthToken"
      ? `grant_type=authorization_code&code=x&redirect_uri=${encodeURIComponent("http://127.0.0.1:8765/callback")}&client_id=c&code_verifier=v`
      : JSON.stringify({ client_id: "c", redirect_uri: "http://127.0.0.1:8765/callback" });
    seen = []; location = "";
    await proxyNivaDeskFirebaseFunction(new NextRequest(`https://nivadesk.app/${fn}`, { method: "POST", body, headers: { "content-type": "text/plain" } }), fn);
    check(seen[0]?.url === `${FN}/${fn}` && seen[0]?.body === body, `${fn}: POST body forwarded byte-for-byte`);
  }

  // a plain Request (no Next wrapper) still works
  seen = [];
  await proxyNivaDeskFirebaseFunction(new Request(`https://nivadesk.app/chatgptOAuthAuthorize?${q("http://127.0.0.1:1/cb")}`), "chatgptOAuthAuthorize");
  check(seen[0]?.url.includes("127.0.0.1%3A1"), "plain Request: query forwarded as sent");

  console.log(`\n${checks - failures}/${checks} PASS`);
  if (failures) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(2); });

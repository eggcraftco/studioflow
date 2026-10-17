// Claude endpoint web routes (17 Oct 2026).
//   npx tsx scripts/check-claude-mcp-route.ts
// 1. /claudeMcp answers a call without a credential with the 401 + RFC 6750 challenge Claude needs (resource_metadata =
//    the claudeMcp metadata, scope), never reaching the function; discovery methods and every call WITH a bearer go to
//    the claudeMcp function, request body and Authorization untouched, and the function's own 401 comes back as it was.
// 2. /.well-known/oauth-protected-resource/claudeMcp: `resource` is exactly https://nivadesk.app/claudeMcp, the issuer is
//    https://nivadesk.app, the six scopes.
// 3. the authorize proxy carries Claude's `resource` to the connect page; the page names Claude only for that resource.
// 4. the ChatGPT routes are not touched by this change (byte-for-byte the files of cce8480c).
// 5. Settings names each grant's assistant (Claude grants share the list).
import { execFileSync } from "child_process";
import * as claudeRoute from "../app/claudeMcp/route";
import * as claudePrm from "../app/.well-known/oauth-protected-resource/claudeMcp/route";
import * as authorizeRoute from "../app/chatgptOAuthAuthorize/route";
import * as asRoute from "../app/.well-known/oauth-authorization-server/route";
import { assistantNameForResource, chatGPTConnectionAssistant, CLAUDE_MCP_NO_CREDENTIAL_CHALLENGE } from "../lib/chatgpt/claudeMcp";

let failures = 0; let checks = 0;
const check = (ok: boolean, what: string) => { checks += 1; if (!ok) { failures += 1; console.error(`FAIL ${what}`); } else console.log(`ok   ${what}`); };

type Seen = { url: string; method: string; headers: Headers; body: string };
let seen: Seen[] = [];
let upstream: () => Response = () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const body = init?.body ? Buffer.from(init.body as ArrayBuffer).toString("utf8") : "";
  seen.push({ url: String(input), method: String(init?.method), headers: new Headers(init?.headers), body });
  return upstream();
}) as typeof fetch;

const rpc = (method: string, extra: Record<string, unknown> = {}) => JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...extra });
const req = (method: string, body?: string, bearer?: string) => new Request("https://nivadesk.app/claudeMcp", {
  method, body, headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }
});
const PRM_URL = "https://nivadesk.app/.well-known/oauth-protected-resource/claudeMcp";
const SCOPES = "orders.read orders.write notes.read notes.write finance.read tasks.write";

async function main() {
  check(CLAUDE_MCP_NO_CREDENTIAL_CHALLENGE === `Bearer error_description="Sign in to NivaDesk to continue", resource_metadata="${PRM_URL}", scope="${SCOPES}"`, "challenge string");

  // 1. no credential
  seen = [];
  const r1 = await claudeRoute.POST(req("POST", rpc("tools/call", { params: { name: "search_orders", arguments: {} } })));
  const j1 = await r1.json();
  check(r1.status === 401 && r1.headers.get("www-authenticate") === CLAUDE_MCP_NO_CREDENTIAL_CHALLENGE, "tools/call without bearer: 401 + challenge");
  check(r1.headers.get("link") === `<${PRM_URL}>; rel="oauth-protected-resource"`, "tools/call without bearer: Link to the metadata");
  check(j1?.error?.code === -32001 && j1?.id === null, "tools/call without bearer: JSON-RPC -32001 body");
  check(seen.length === 0, "tools/call without bearer: the function is not called");
  const r1b = await claudeRoute.POST(req("POST", "not json"));
  check(r1b.status === 401 && seen.length === 0, "unparseable body without bearer: 401");
  const g = await claudeRoute.GET(req("GET"));
  const h = await claudeRoute.HEAD(req("HEAD"));
  check(g.status === 401 && h.status === 401 && g.headers.get("www-authenticate") === CLAUDE_MCP_NO_CREDENTIAL_CHALLENGE, "GET / HEAD without bearer: 401 + challenge");
  const o = await claudeRoute.OPTIONS();
  check(o.status === 204 && (o.headers.get("access-control-expose-headers") || "").includes("WWW-Authenticate"), "OPTIONS: 204, exposes WWW-Authenticate");

  // discovery without credential -> the claudeMcp function
  for (const m of ["initialize", "tools/list", "notifications/initialized", "ping"]) {
    seen = [];
    const body = rpc(m);
    const r = await claudeRoute.POST(req("POST", body));
    check(r.status === 200 && seen.length === 1 && seen[0].url === "https://europe-west2-eggcraft-studio.cloudfunctions.net/claudeMcp" && seen[0].body === body,
      `${m} without bearer: proxied to the claudeMcp function, body unchanged`);
    check(seen[0]?.headers.get("x-forwarded-host") === "nivadesk.app", `${m}: x-forwarded-host nivadesk.app`);
  }

  // with a bearer -> the function, which decides; its 401 comes back untouched
  seen = [];
  const dead = 'Bearer error="invalid_token", error_description="Sign in to NivaDesk to continue", resource_metadata="' + PRM_URL + '", scope="' + SCOPES + '"';
  upstream = () => new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "x" } }), { status: 401, headers: { "www-authenticate": dead, "content-type": "application/json" } });
  const r2 = await claudeRoute.POST(req("POST", rpc("tools/call", { params: { name: "search_orders", arguments: {} } }), "some-dead-token"));
  check(seen.length === 1 && seen[0].headers.get("authorization") === "Bearer some-dead-token", "tools/call with bearer: proxied with the Authorization header");
  check(r2.status === 401 && r2.headers.get("www-authenticate") === dead, "function's 401 + invalid_token challenge passes through unchanged");
  upstream = () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });

  // 2. metadata
  const p = await claudePrm.GET();
  const pj = await p.json();
  check(pj.resource === "https://nivadesk.app/claudeMcp", "PRM resource is exactly https://nivadesk.app/claudeMcp");
  check(JSON.stringify(pj.authorization_servers) === JSON.stringify(["https://nivadesk.app"]), "PRM authorization_servers = [https://nivadesk.app]");
  check(pj.scopes_supported.join(" ") === SCOPES && JSON.stringify(pj.bearer_methods_supported) === '["header"]', "PRM scopes + bearer methods");

  // 3. authorize proxy keeps Claude's resource on the connect page link
  seen = [];
  upstream = () => new Response(null, { status: 302, headers: { location: "https://nivadesk.app/chatgpt/connect?client_id=c1&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback" } });
  const az = await (authorizeRoute as unknown as { GET: (r: Request) => Promise<Response> }).GET(new Request("https://nivadesk.app/chatgptOAuthAuthorize?response_type=code&client_id=c1&resource=https%3A%2F%2Fnivadesk.app%2FclaudeMcp"));
  const loc = new URL(az.headers.get("location") || "https://x.invalid");
  check(az.status === 302 && loc.searchParams.get("resource") === "https://nivadesk.app/claudeMcp", "authorize: connect page receives resource=https://nivadesk.app/claudeMcp");
  upstream = () => new Response("{}", { status: 200 });

  check(assistantNameForResource("https://nivadesk.app/claudeMcp") === "Claude", "connect page names Claude for the Claude endpoint");
  check(assistantNameForResource("https://NIVADESK.app/claudeMcp/") === "Claude", "… host case / trailing slash");
  for (const r of ["https://nivadesk.app/chatgptMcp", "https://mcp.nivadesk.app/chatgptMcp", "", null, "https://nivadesk.app/claudeMcp?x=1", "https://evil.example/claudeMcp", "not a url"]) {
    check(assistantNameForResource(r) === "ChatGPT", `connect page keeps ChatGPT for ${JSON.stringify(r)}`);
  }

  // Settings ▸ ChatGPT / Claude lists both kinds of grant; an older server (no field) means ChatGPT.
  check(chatGPTConnectionAssistant({ assistant: "claude", clientOrigin: "https://claude.ai" }) === "Claude" && chatGPTConnectionAssistant({ assistant: "claude", clientOrigin: "loopback" }) === "Claude Code"
    && chatGPTConnectionAssistant({ assistant: "chatgpt", clientOrigin: "https://chatgpt.com" }) === "ChatGPT" && chatGPTConnectionAssistant({}) === "ChatGPT", "Settings row names each connection's client: ChatGPT / Claude / Claude Code");
  const asj = await (await asRoute.GET()).json();
  check(JSON.stringify(asj.grant_types_supported) === '["authorization_code","refresh_token"]' && asj.issuer === "https://nivadesk.app" && asj.registration_endpoint === "https://nivadesk.app/chatgptOAuthRegister", "AS metadata advertises refresh_token; issuer / DCR unchanged");
  const asDiff = execFileSync("git", ["diff", "-U0", "cce8480c", "--", "app/.well-known/oauth-authorization-server/route.ts"], { encoding: "utf8" }).split("\n").filter((l) => /^[+-][^+-]/.test(l));
  check(asDiff.length === 3 && asDiff.filter((l) => l.startsWith("-")).length === 1 && /grant_types_supported/.test(asDiff.join("")), "AS metadata: the only change is grant_types_supported (+1 comment line)");

  // 4. ChatGPT routes untouched
  const changed = execFileSync("git", ["diff", "--name-only", "cce8480c", "--", "app/chatgptMcp", "app/chatgptOAuthAuthorize", "app/chatgptOAuthToken", "app/chatgptOAuthRegister", "app/chatgptOAuthApprove", "app/.well-known/oauth-protected-resource/route.ts", "app/.well-known/oauth-protected-resource/chatgptMcp", "lib/chatgpt/proxyFirebaseFunction.ts"], { encoding: "utf8" }).trim();
  check(changed === "", `ChatGPT routes, metadata and proxy identical to cce8480c${changed ? `: ${changed}` : ""}`);

  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });

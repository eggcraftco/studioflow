// SEC-ABUSE-01 G3 acceptance (no network). Usage:
//   node --experimental-strip-types scripts/security/check-mcp-review-log.mjs <old route.ts> <new route.ts>
// 1) responses (status, headers, body) are identical old vs new for every request below;
// 2) the new route logs exactly one event per request with route/method/rpcMethod/status/requestId/errorClass
//    and NONE of: URL, query, token, session id, address, header values, body text.
import { pathToFileURL } from "node:url";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [oldPath, newPath] = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), "g3-"));
copyFileSync(oldPath, join(dir, "old.ts")); copyFileSync(newPath, join(dir, "new.ts"));
const OLD = await import(pathToFileURL(join(dir, "old.ts")).href);
const NEW = await import(pathToFileURL(join(dir, "new.ts")).href);
const SECRETS = ["QSECRET-TOKEN-123", "SESSION-ABC-999", "203.0.113.77", "198.51.100.9", "APIKEY-ZZZ", "BODY-PRIVATE-TEXT", "Bearer", "chatgptMcpReview?"];
const H = { "user-agent": "openai-mcp/1.0", "x-forwarded-for": "203.0.113.77, 198.51.100.9", "x-real-ip": "203.0.113.77",
  "mcp-session-id": "SESSION-ABC-999", "x-api-key": "APIKEY-ZZZ", authorization: "Bearer QSECRET-TOKEN-123", "content-type": "application/json" };
const URL_ = "https://nivadesk.app/chatgptMcpReview?token=QSECRET-TOKEN-123&k=APIKEY-ZZZ";
const cases = [
  ["GET", {}], ["GET", { accept: "text/event-stream" }], ["HEAD", {}], ["OPTIONS", {}],
  ["POST", {}, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }],
  ["POST", {}, { jsonrpc: "2.0", id: 2, method: "tools/list" }], ["POST", {}, { jsonrpc: "2.0", id: 3, method: "ping" }],
  ["POST", {}, { jsonrpc: "2.0", method: "notifications/initialized" }],
  ["POST", {}, { jsonrpc: "2.0", id: 4, method: "BODY-PRIVATE-TEXT" }], ["POST", {}, "not json BODY-PRIVATE-TEXT"]
];
let fail = 0; const logs = []; const orig = console.log;
const t = (c, m) => { if (!c) { fail++; orig("FAIL", m); } };
async function call(mod, method, extra, body, capture) {
  const init = { method, headers: { ...H, ...extra } };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  const lines = []; console.log = (...a) => lines.push(a.map(String).join(" "));
  const res = await mod[method](new Request(URL_, init));
  console.log = orig; if (capture) logs.push(...lines);
  return { status: res.status, headers: JSON.stringify([...res.headers.entries()].sort()), body: res.body ? await res.text() : "", lines };
}
for (const [method, extra, body] of cases) {
  const a = await call(OLD, method, extra, body, false), b = await call(NEW, method, extra, body, true);
  const label = `${method} ${body && body.method ? body.method : (typeof body === "string" ? "invalid-json" : JSON.stringify(extra))}`;
  t(a.status === b.status && a.headers === b.headers && a.body === b.body, `${label}: response changed`);
  t(b.lines.length === 1, `${label}: ${b.lines.length} log lines`);
  const ev = JSON.parse(b.lines[0].replace(/^\[MCP Review\] /, ""));
  t(ev.event === "mcp_review_request" && ev.route === "chatgptMcpReview" && ev.status === b.status && /^[0-9a-f-]{36}$/.test(ev.requestId), `${label}: event fields`);
  for (const s of SECRETS) t(!b.lines[0].includes(s), `${label}: log contains ${s}`);
  const oldLeaks = SECRETS.filter((s) => a.lines.join("\n").includes(s));
  orig(`${label.padEnd(40)} status=${b.status} rpc=${ev.rpcMethod} errorClass=${ev.errorClass} | old route leaked: ${oldLeaks.length ? oldLeaks.join(",") : "-"}`);
}
orig(fail ? `FAILED ${fail}` : `PASS ${cases.length} requests: responses identical, ${logs.length} safe log lines, 0 secrets`);
process.exit(fail ? 1 : 0);

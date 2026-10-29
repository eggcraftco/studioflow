// Security audit #10, web part (28 Oct 2026): the ChatGPT / Claude connect page is not an open redirect, and shows
// what is being asked for.
//
// 1. lib/chatgpt/oauthConnect.ts: Cancel returns where the server says this client may go
//    (chatgptOAuthWorkspaces client.redirectAllowed, server arm of #10), or, when the server does not say, only to
//    the allowlisted assistant hosts (owner decision 28 Oct: chatgpt.com, openai.com, claude.ai, anthropic.com +
//    claude.com, subdomains, https only); a server "false" or any other redirect_uri → "" (stay on the page).
//    Requested scopes in words (the server's filtered list when sent); unknown ones listed apart.
// 2. ChatGPTConnectClient.tsx: Cancel goes through cancelRedirectUrl (no other read of redirect_uri builds a
//    navigation), the client and the requested access are shown, the request goes along to chatgptOAuthWorkspaces.
//
//   npx tsx scripts/check-sec-oauth-connect.mts [--root <dir>]
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; } };
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};

let m: Record<string, any> | null = null;
try {
  m = await import(pathToFileURL(path.join(root, "lib/chatgpt/oauthConnect.ts")).href);
} catch (error) {
  ok(`lib/chatgpt/oauthConnect.ts loads (${(error as Error).message.split("\n")[0]})`, false);
}

if (m) {
  const ALLOWED = [
    "https://chatgpt.com/connector_platform_oauth_redirect",
    "https://chat.openai.com/aip/g-123/oauth/callback",
    "https://platform.openai.com/oauth/callback",
    "https://claude.ai/api/mcp/auth_callback",
    "https://console.anthropic.com/oauth/callback",
    "https://claude.com/api/mcp/auth_callback",
  ];
  const REFUSED = [
    "https://evil.example/cb",
    "https://chatgpt.com.evil.example/cb",
    "https://evilchatgpt.com/cb",
    "https://claude.ai.evil.example/api/mcp/auth_callback",
    "http://chatgpt.com/connector_platform_oauth_redirect",
    "https://user:pw@chatgpt.com/cb",
    "https://chatgpt.com:8443/cb",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//chatgpt.com/cb",
    "http://localhost:3000/callback",
    "",
  ];
  for (const uri of ALLOWED) ok(`assistant redirect allowed: ${uri}`, m.isAssistantRedirect(uri) === true);
  for (const uri of REFUSED) ok(`redirect refused: ${JSON.stringify(uri)}`, m.isAssistantRedirect(uri) === false);

  const back = m.cancelRedirectUrl({ redirect_uri: ALLOWED[0], state: "st-1" });
  const backUrl = back ? new URL(back) : null;
  ok("Cancel to ChatGPT carries error=access_denied and the state", backUrl?.host === "chatgpt.com" && backUrl?.searchParams.get("error") === "access_denied" && backUrl?.searchParams.get("state") === "st-1");
  ok("Cancel with a crafted redirect_uri stays on the page", m.cancelRedirectUrl({ redirect_uri: "https://evil.example/cb", state: "x" }) === "");
  ok("Cancel without redirect_uri stays on the page", m.cancelRedirectUrl({ redirect_uri: "", state: "" }) === "");

  const all = m.describeRequestedScopes("");
  ok("no scope → the server default, every advertised scope in words", all.usesDefault === true && all.lines.length === 6 && all.unknown.length === 0);
  const two = m.describeRequestedScopes("finance.read  orders.read orders.read");
  ok("two scopes → two lines, advertised order, no duplicates", two.usesDefault === false && two.lines.length === 2 && /orders/i.test(two.lines[0]) && /financial/i.test(two.lines[1]));
  const odd = m.describeRequestedScopes("orders.read admin.all");
  ok("an unknown scope is listed apart", odd.lines.length === 1 && odd.unknown.join() === "admin.all");
  ok("server client name read from client.name", m.serverClientName({ client: { name: " ChatGPT " } }) === "ChatGPT");
  ok("no client info → empty name", m.serverClientName({ workspaces: [] }) === "" && m.serverClientName(null) === "");
  const info = m.serverClientInfo({ client: { id: "c1", name: "Claude", redirectHost: "claude.ai", redirectAllowed: true }, requestedScopes: ["orders.read", "notes.read"] });
  ok("server info: name, redirectAllowed, requestedScopes", info.name === "Claude" && info.redirectAllowed === true && info.requestedScopes.join() === "orders.read,notes.read");
  const old = m.serverClientInfo({ workspaces: [] });
  ok("older server: redirectAllowed null, no scopes", old.redirectAllowed === null && old.requestedScopes === null);
  ok("server says allowed: Cancel to a loopback client (Claude Code)", new URL(m.cancelRedirectUrl({ redirect_uri: "http://127.0.0.1:33418/callback", state: "s" }, true)).searchParams.get("error") === "access_denied");
  ok("server silent: Cancel to loopback stays on the page", m.cancelRedirectUrl({ redirect_uri: "http://127.0.0.1:33418/callback", state: "s" }, null) === "");
  ok("server says refused: Cancel stays on the page even for chatgpt.com", m.cancelRedirectUrl({ redirect_uri: ALLOWED[0], state: "s" }, false) === "");
  ok("server says allowed but the URI is javascript: → stays", m.cancelRedirectUrl({ redirect_uri: "javascript:alert(1)", state: "s" }, true) === "");
  const filtered = m.describeRequestedScopes("orders.read admin.all offline_access", ["orders.read"]);
  ok("the server's filtered scope list wins over the URL's", filtered.lines.length === 1 && filtered.unknown.length === 0);
  ok("advertised scopes match the server registry list", JSON.stringify(m.SUPPORTED_OAUTH_SCOPES) === JSON.stringify(["orders.read", "orders.write", "notes.read", "notes.write", "finance.read", "tasks.write"]));
}

// ---------------------------------------------------------------- 2. the page
const page = read("app/chatgpt/connect/ChatGPTConnectClient.tsx");
const cancelBody = page.slice(page.indexOf("function handleCancel"), page.indexOf("function handleCancel") + 900);
ok("Cancel goes through cancelRedirectUrl with the server's word", /cancelRedirectUrl\(oauthParams, serverClient\.redirectAllowed\)/.test(cancelBody));
ok("no navigation is built from redirect_uri on the page (only its host is displayed)", !/new URL\(oauthParams\.redirect_uri\)(?!\.host)/.test(page));
ok("a refused Cancel shows a message instead of navigating", /setCancelled\(true\)/.test(cancelBody) && /data-testid="connect-cancelled"/.test(page));
ok("the requested access is shown (server's filtered list when sent)", /describeRequestedScopes\(oauthParams\.scope, serverClient\.requestedScopes\)/.test(page) && /data-testid="connect-requested-scopes"/.test(page));
ok("a destination the server refuses gets no Allow button", /destinationRefused \? null : \(/.test(page) && /data-testid="connect-destination-refused"/.test(page));
ok("the client is shown (server name, published host, client id)", /data-testid="connect-client-name"/.test(page) && /Client ID:/.test(page));
ok("the request goes along to chatgptOAuthWorkspaces", /chatgptOAuthWorkspaces\$\{search \? `\?\$\{search\}` : ""\}/.test(page));
ok("no 'unverified app' label (owner chose the allowlist)", !/unverified|not verified|verified ===|verified:/i.test(page));

if (failures.length) {
  console.error(failures.map(f => `FAIL ${f}`).join("\n"));
  console.error(`sec-oauth-connect ${checks - failures.length}/${checks} pass; reds: ${failures.length}`);
  process.exit(1);
}
console.log(`sec-oauth-connect ${checks}/${checks} pass; reds: none`);

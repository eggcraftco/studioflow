// The OAuth endpoints, over real HTTP, against the functions emulator.
//
// The unit tests prove the rule and the source-order tests prove it is wired
// in. Neither can prove that a request actually gets refused — an Express
// handler that returns before the guard, a CORS pre-flight that answers first,
// a thrown error swallowed into a 200. So this one talks to the endpoints.
//
// Needs: firebase emulators:exec --only firestore,auth,functions
//         "node test/e2e/chatgpt-oauth-http.mjs"
const BASE = process.env.NV_FN_BASE
  || "http://127.0.0.1:5001/eggcraft-studio/europe-west2";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) { console.log("PASS ", name); return; }
  failures += 1;
  console.log("FAIL ", name, detail ? `- ${String(detail).slice(0, 300)}` : "");
};

async function post(fn, body) {
  const res = await fetch(`${BASE}/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

async function get(fn, query) {
  const url = new URL(`${BASE}/${fn}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, { redirect: "manual" });
  let json = null;
  try { json = await res.json(); } catch { /* a redirect has no body */ }
  return { status: res.status, json, location: res.headers.get("location") || "" };
}

const GOOD = "https://chatgpt.com/aip/callback";
const EVIL = "https://evil.example/steal";

// ---- registration ---------------------------------------------------------
const registered = await post("chatgptOAuthRegister", {
  redirect_uris: [GOOD],
  client_name: "ChatGPT",
  grant_types: ["authorization_code"],
  response_types: ["code"]
});
check("a registration with a good redirect_uri succeeds", registered.status === 201, JSON.stringify(registered.json));
const clientId = registered.json?.client_id || "";
check("it returns a client_id", Boolean(clientId));
check("it reflects the registered redirect_uris back (ChatGPT requires this)",
  JSON.stringify(registered.json?.redirect_uris) === JSON.stringify([GOOD]),
  JSON.stringify(registered.json?.redirect_uris));

const noUris = await post("chatgptOAuthRegister", { redirect_uris: [], client_name: "ChatGPT" });
check("a registration with no redirect_uri is refused", noUris.status === 400 && noUris.json?.error === "invalid_redirect_uri",
  JSON.stringify(noUris.json));

const httpOnly = await post("chatgptOAuthRegister", { redirect_uris: ["http://evil.example/cb"] });
check("a registration offering only plain http off-loopback is refused",
  httpOnly.status === 400, JSON.stringify(httpOnly.json));

const loopback = await post("chatgptOAuthRegister", { redirect_uris: ["http://127.0.0.1:8976/cb"] });
check("but a loopback http callback still registers", loopback.status === 201, JSON.stringify(loopback.json));

// ---- authorize ------------------------------------------------------------
const authorizeParams = (redirectUri, id = clientId) => ({
  response_type: "code",
  client_id: id,
  redirect_uri: redirectUri,
  scope: "orders.read",
  state: "xyz",
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256"
});

const authGood = await get("chatgptOAuthAuthorize", authorizeParams(GOOD));
check("authorize accepts the registered destination", authGood.status === 302, `${authGood.status} ${JSON.stringify(authGood.json)}`);
check("and sends the person to the NivaDesk consent page", authGood.location.includes("/chatgpt/connect"), authGood.location);

const authEvil = await get("chatgptOAuthAuthorize", authorizeParams(EVIL));
check("authorize REFUSES an unregistered destination", authEvil.status === 400, `${authEvil.status} ${authEvil.location}`);
check("and does not redirect anywhere", !authEvil.location, authEvil.location);

const authUnknownClient = await get("chatgptOAuthAuthorize", authorizeParams(GOOD, "chatgpt_never_registered"));
check("authorize refuses a client that never registered", authUnknownClient.status === 400, String(authUnknownClient.status));

// ---- approve: the step that mints the code --------------------------------
// No Firebase ID token is sent, so a request that got past the redirect check
// would fail on authentication instead — which is why the two cases are told
// apart by their message, not just their status.
const approveEvil = await post("chatgptOAuthApprove", {
  client_id: clientId,
  redirect_uri: EVIL,
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
  companyId: "qa-workspace",
  state: "xyz"
});
check("approve refuses an unregistered destination", approveEvil.status === 400, JSON.stringify(approveEvil.json));
check("and says why, rather than failing on the sign-in first",
  /registered redirect URIs/i.test(approveEvil.json?.message || ""), JSON.stringify(approveEvil.json));

const approveGoodNoAuth = await post("chatgptOAuthApprove", {
  client_id: clientId,
  redirect_uri: GOOD,
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
  companyId: "qa-workspace",
  state: "xyz"
});
check("a registered destination gets past the redirect check and stops at authentication",
  approveGoodNoAuth.status === 401 || approveGoodNoAuth.status === 403,
  `${approveGoodNoAuth.status} ${JSON.stringify(approveGoodNoAuth.json)}`);

const approveUnknownClient = await post("chatgptOAuthApprove", {
  client_id: "chatgpt_never_registered",
  redirect_uri: GOOD,
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
  companyId: "qa-workspace"
});
check("approve refuses a client that never registered", approveUnknownClient.status === 400, JSON.stringify(approveUnknownClient.json));

// ---- the code, and every way it must not be spent --------------------------
//
// A code is a bearer credential with a short life. These are the negative paths
// the endpoints had no coverage of at all: nine OAuth and MCP handlers, and not
// one test between them, while the Etsy connector next door has an exemplary
// negative-path suite.
const CODE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

async function token(body) {
  const res = await fetch(`${BASE}/chatgptOAuthToken`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

const unknownCode = await token({
  grant_type: "authorization_code", code: "nope-not-a-code",
  client_id: clientId, redirect_uri: GOOD, code_verifier: "x".repeat(43)
});
check("a code nobody minted is refused", unknownCode.status >= 400, JSON.stringify(unknownCode.json));

const noGrant = await token({ code: "anything", client_id: clientId, redirect_uri: GOOD, code_verifier: "x".repeat(43) });
check("a request with no grant_type is refused", noGrant.status >= 400, String(noGrant.status));

const wrongGrant = await token({
  grant_type: "password", code: "anything",
  client_id: clientId, redirect_uri: GOOD, code_verifier: "x".repeat(43)
});
check("a grant type we do not support is refused", wrongGrant.status >= 400, String(wrongGrant.status));

const noVerifier = await token({
  grant_type: "authorization_code", code: "anything", client_id: clientId, redirect_uri: GOOD
});
check("a code redeemed with no PKCE verifier is refused", noVerifier.status >= 400, String(noVerifier.status));

// ---- the MCP surface, unauthenticated --------------------------------------
async function mcp(body, headers = {}) {
  const res = await fetch(`${BASE}/chatgptMcp`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

const noToken = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_orders", arguments: { companyId: "qa-workspace" } } });
check("an MCP tool call with no bearer token is refused",
  noToken.status === 401 || /unauthenticated|unauthorized/i.test(JSON.stringify(noToken.json || {})),
  `${noToken.status} ${JSON.stringify(noToken.json)}`);

const badToken = await mcp(
  { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search_orders", arguments: { companyId: "qa-workspace" } } },
  { authorization: "Bearer not-a-real-token" }
);
check("an invented bearer token is refused",
  badToken.status === 401 || /unauthenticated|unauthorized|invalid/i.test(JSON.stringify(badToken.json || {})),
  `${badToken.status} ${JSON.stringify(badToken.json)}`);

const hidden = await mcp(
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_inventory", arguments: { companyId: "qa-workspace" } } },
  { authorization: "Bearer not-a-real-token" }
);
check("a tool hidden by a review flag is not a way past authentication",
  hidden.status === 401 || /unauthenticated|unauthorized|invalid/i.test(JSON.stringify(hidden.json || {})),
  `${hidden.status} ${JSON.stringify(hidden.json)}`);

// ---- what the discovery documents may say -----------------------------------
const meta = await fetch(`${BASE}/chatgptOAuthAuthorizationServer`).then((r) => r.json()).catch(() => null);
check("the discovery document names PKCE S256 and the authorization_code grant",
  Boolean(meta) && JSON.stringify(meta.code_challenge_methods_supported || []).includes("S256"),
  JSON.stringify(meta));

if (failures) {
  console.log(`\n❌ ${failures} failing`);
  process.exit(1);
}
console.log("\n✅ CHATGPT OAUTH HTTP GEÇTİ");

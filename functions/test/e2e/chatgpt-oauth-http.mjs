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

if (failures) {
  console.log(`\n❌ ${failures} failing`);
  process.exit(1);
}
console.log("\n✅ CHATGPT OAUTH HTTP GEÇTİ");

// eBay OAuth, pinned to what developer.ebay.com says (design §1, §5, §6):
// the host per environment, a RuName as redirect_uri, the two read-only scopes
// joined by %20, Basic client credentials on the token endpoint, a refresh that
// asks for exactly the granted scopes, expiry from both TTLs, an identity call
// that drops the seller's own name and address, and error classes decided by
// the BODY — invalid_grant is the seller's problem, invalid_client is ours.
const assert = require("assert");
const oauth = require("../../commerce/ebay/oauth");
let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name)).catch((error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); }); }

function fakeFetch(handler) { const calls = []; const impl = async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init, calls.length); }; impl.calls = calls; return impl; }
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => null } });

(async () => {
  await check("the authorize URL is sandbox by default, production only when asked, and never carries a secret", () => {
    const sandbox = oauth.authorizeUrl({ clientId: "app-id", ruName: "EGGcraft-EGGcraft-sandbox-abc", state: "st4te" });
    assert.ok(sandbox.startsWith("https://auth.sandbox.ebay.com/oauth2/authorize?"), sandbox);
    const production = oauth.authorizeUrl({ environment: "production", clientId: "app-id", ruName: "EGGcraft-EGGcraft-prd-abc", state: "st4te" });
    assert.ok(production.startsWith("https://auth.ebay.com/oauth2/authorize?"), production);
    assert.strictEqual(oauth.ebayEnvironment("PRODUCTION"), "production");
    assert.strictEqual(oauth.ebayEnvironment("anything-else"), "sandbox", "an unknown value is the safe side");
    assert.ok(!/secret/i.test(sandbox));
  });

  await check("redirect_uri is the RuName verbatim, state is echoed, response_type is code", () => {
    const url = new URL(oauth.authorizeUrl({ clientId: "app-id", ruName: "EGGcraft-EGGcraft-sandbox-abc", state: "st4te+/=" }));
    assert.strictEqual(url.searchParams.get("client_id"), "app-id");
    assert.strictEqual(url.searchParams.get("redirect_uri"), "EGGcraft-EGGcraft-sandbox-abc", "not a URL — eBay assigns a RuName");
    assert.strictEqual(url.searchParams.get("response_type"), "code");
    assert.strictEqual(url.searchParams.get("state"), "st4te+/=");
  });

  await check("scope is the TWO read scopes joined by %20 — never a plus, never a write scope", () => {
    const raw = oauth.authorizeUrl({ clientId: "app-id", ruName: "ru", state: "s" });
    const scopePart = raw.split("scope=")[1].split("&")[0];
    assert.ok(scopePart.includes("%20"), scopePart);
    assert.ok(!scopePart.includes("+"), "URLSearchParams would have emitted a plus");
    const decoded = decodeURIComponent(scopePart).split(" ");
    assert.deepStrictEqual(decoded, ["https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly", "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly"]);
    assert.ok(!decoded.some((s) => /sell\.fulfillment$|sell\.inventory|sell\.account/.test(s)), "a write scope crept in");
    assert.deepStrictEqual(oauth.SCOPES.slice(), decoded);
  });

  await check("the code exchange posts a form to the token endpoint with HTTP Basic client credentials", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(200, { access_token: "v^1.1#at", expires_in: 7200, refresh_token: "v^1.1#rt", refresh_token_expires_in: 47304000, token_type: "User Access Token" }));
    const out = await oauth.exchangeCode({ environment: "sandbox", clientId: "app-id", clientSecret: "app-secret", code: "c0de", ruName: "EGGcraft-sandbox-abc", fetchImpl });
    assert.strictEqual(fetchImpl.calls.length, 1);
    const { url, init } = fetchImpl.calls[0];
    assert.strictEqual(url, "https://api.sandbox.ebay.com/identity/v1/oauth2/token");
    assert.strictEqual(init.method, "POST");
    assert.strictEqual(init.headers.Authorization, "Basic " + Buffer.from("app-id:app-secret").toString("base64"));
    assert.strictEqual(init.headers["Content-Type"], "application/x-www-form-urlencoded");
    const form = new URLSearchParams(init.body);
    assert.strictEqual(form.get("grant_type"), "authorization_code");
    assert.strictEqual(form.get("code"), "c0de");
    assert.strictEqual(form.get("redirect_uri"), "EGGcraft-sandbox-abc", "the RuName goes back as redirect_uri");
    assert.strictEqual(out.access_token, "v^1.1#at");
    assert.ok(!url.includes("app-secret") && !init.body.includes("app-secret"), "the secret travels only in the Basic header");
  });

  await check("a refresh sends exactly the granted scopes and keeps the rotated refresh token when eBay returns one", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(200, { access_token: "new-at", expires_in: 7200 }));
    await oauth.refreshToken({ environment: "production", clientId: "id", clientSecret: "s", refreshToken: "old-rt", scopes: ["https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly"], fetchImpl });
    const form = new URLSearchParams(fetchImpl.calls[0].init.body);
    assert.strictEqual(fetchImpl.calls[0].url, "https://api.ebay.com/identity/v1/oauth2/token");
    assert.strictEqual(form.get("grant_type"), "refresh_token");
    assert.strictEqual(form.get("refresh_token"), "old-rt");
    assert.strictEqual(form.get("scope"), "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly", "never wider than what was granted");
  });

  await check("expiry comes from both TTLs; a missing refresh_token means no refresh expiry", () => {
    const at = 1_700_000_000_000;
    const both = oauth.tokenExpiryOf({ expires_in: 7200, refresh_token: "rt", refresh_token_expires_in: 47304000 }, at);
    assert.strictEqual(both.accessTokenExpiresAtMs, at + 7200 * 1000);
    assert.strictEqual(both.refreshTokenExpiresAtMs, at + 47304000 * 1000, "547.5 days, eBay's documented figure");
    const accessOnly = oauth.tokenExpiryOf({ access_token: "x", expires_in: 7200 }, at);
    assert.strictEqual(accessOnly.refreshTokenExpiresAtMs, 0);
    const defaults = oauth.tokenExpiryOf({ access_token: "x", refresh_token: "y" }, at);
    assert.strictEqual(defaults.accessTokenExpiresAtMs, at + 7200 * 1000, "the documented default stands in for a missing field");
  });

  await check("classifyTokenError reads the body: invalid_grant (400) → auth; invalid_client (400 or 401) → app_credentials_invalid; invalid_request → token_request_invalid", () => {
    assert.deepStrictEqual(oauth.classifyTokenError(400, { error: "invalid_grant", error_description: "the provided authorization grant code is invalid" }), { errorClass: "auth", code: "invalid_grant" });
    assert.deepStrictEqual(oauth.classifyTokenError(401, { error: "invalid_grant" }), { errorClass: "auth", code: "invalid_grant" });
    assert.deepStrictEqual(oauth.classifyTokenError(400, { error: "invalid_client", error_description: "client authentication failed" }), { errorClass: "permission", code: "app_credentials_invalid" });
    assert.deepStrictEqual(oauth.classifyTokenError(401, { error: "invalid_client", error_description: "Client authentication failed" }), { errorClass: "permission", code: "app_credentials_invalid" });
    assert.deepStrictEqual(oauth.classifyTokenError(400, { error: "unauthorized_client" }), { errorClass: "permission", code: "app_credentials_invalid" });
    assert.deepStrictEqual(oauth.classifyTokenError(400, { error: "invalid_scope" }), { errorClass: "permission", code: "app_credentials_invalid" });
    assert.deepStrictEqual(oauth.classifyTokenError(400, { error: "invalid_request" }), { errorClass: "validation", code: "token_request_invalid" });
    assert.deepStrictEqual(oauth.classifyTokenError(400, {}), { errorClass: "validation", code: "token_request_invalid" });
    assert.strictEqual(oauth.classifyTokenError(429, {}).errorClass, "transient");
    assert.strictEqual(oauth.classifyTokenError(503, {}).errorClass, "transient");
    assert.strictEqual(oauth.classifyTokenError(0, null).errorClass, "transient", "a network failure is retried, never a reconnect");
    assert.strictEqual(oauth.classifyTokenError(401, {}).errorClass, "auth", "a bare 401 with no body is the token");
  });

  await check("a refused token request throws with the class from the body, and the thrown error never carries the secret", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(400, { error: "invalid_client", error_description: "Client authentication failed" }));
    await assert.rejects(oauth.exchangeCode({ environment: "sandbox", clientId: "id", clientSecret: "TOPSECRET", code: "c", ruName: "ru", fetchImpl }), (error) => {
      assert.strictEqual(error.errorClass, "permission"); assert.strictEqual(error.code, "app_credentials_invalid"); assert.strictEqual(error.status, 400);
      assert.ok(!JSON.stringify({ message: error.message, body: error.body }).includes("TOPSECRET"));
      return true;
    });
    const grant = fakeFetch(() => jsonResponse(400, { error: "invalid_grant" }));
    await assert.rejects(oauth.refreshToken({ environment: "sandbox", clientId: "id", clientSecret: "s", refreshToken: "rt", fetchImpl: grant }), (error) => error.errorClass === "auth" && error.code === "invalid_grant");
  });

  await check("§14.1 PIN — every EbayOAuthError message this module can throw matches the closed shape the callback is allowed to log", async () => {
    // One console line in ebayConnector.js prints an EbayOAuthError's message
    // (§5.4, *Logging*), and four places in the design said "§14.1 pins that
    // message". No such test existed: the only assertion touching it was that
    // the message does not contain the client secret. So here it is, and it is
    // run against every constructor rather than against a sample — a caught
    // foreign message used to be interpolated into two of them.
    const CODE = "AUTHCODE-9b2e-never-in-a-message";
    const messages = [];
    const capture = async (promise) => { try { await promise; assert.fail("expected a throw"); } catch (error) { messages.push(String(error.message)); return error; } };
    // eBay's own error field, with punctuation, capitals and a planted value.
    await capture(oauth.exchangeCode({ environment: "sandbox", clientId: "id", clientSecret: "s", code: CODE, ruName: "ru", fetchImpl: fakeFetch(() => jsonResponse(400, { error: `invalid_grant "${CODE}"`, error_description: `the code ${CODE} is invalid` })) }));
    await capture(oauth.refreshToken({ environment: "sandbox", clientId: "id", clientSecret: "s", refreshToken: "rt", fetchImpl: fakeFetch(() => jsonResponse(503, { error: "server_error" })) }));
    await capture(oauth.appToken({ environment: "sandbox", clientId: "id", clientSecret: "s", fetchImpl: fakeFetch(() => jsonResponse(401, {})) }));
    // A transport throw, whose own message is the classic carrier: the URL, the
    // body, or whatever the runtime decided to put in it.
    await capture(oauth.exchangeCode({ environment: "sandbox", clientId: "id", clientSecret: "s", code: CODE, ruName: "ru", fetchImpl: async () => { throw new Error(`connect ECONNREFUSED while sending ${CODE}`); } }));
    await capture(oauth.fetchIdentity({ environment: "sandbox", accessToken: "at", fetchImpl: async () => { throw Object.assign(new Error(`terminated ${CODE}`), { name: "AbortError" }); } }));
    for (const status of [401, 403, 500, 418]) await capture(oauth.fetchIdentity({ environment: "sandbox", accessToken: "at", fetchImpl: fakeFetch(() => jsonResponse(status, { errors: [{ message: CODE }] })) }));
    assert.strictEqual(messages.length, 9);
    for (const message of messages) {
      assert.ok(oauth.messageIsSafe(message), `outside the pinned shape: ${message}`);
      assert.ok(oauth.MESSAGE_SHAPE.test(message), message);
      assert.ok(!message.includes(CODE) && !message.includes(CODE.slice(0, 8)), message);
    }
    // The signal that matters is kept: the class word survives sanitising, and a
    // transport failure still says which kind it was.
    assert.strictEqual(messages[0], "ebay_oauth_http_400", "an error field that is not a bare OAuth code contributes NOTHING — stripping it would leave a mangled copy of the value");
    assert.ok(messages[1].endsWith(": server_error"), messages[1]);
    assert.ok(messages[3].endsWith(": Error") && messages[4].endsWith(": AbortError"), messages.slice(3, 5).join(" | "));
  });

  await check("fetchIdentity keeps four fields and drops the seller's own name, email and address", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(200, { userId: "ebayuser_xxx", username: "eggcraft_uk", accountType: "BUSINESS", registrationMarketplaceId: "EBAY_GB", businessAccount: { name: "EGGcraft Ltd", email: "owner@example.com", address: { addressLine1: "1 Workshop Lane", city: "London", postalCode: "E1 6AN", country: "GB" }, primaryContact: { firstName: "G", lastName: "O" } }, individualAccount: { firstName: "G", lastName: "O", email: "g@example.com" } }));
    const identity = await oauth.fetchIdentity({ environment: "sandbox", accessToken: "at", fetchImpl });
    assert.strictEqual(fetchImpl.calls[0].url, "https://apiz.sandbox.ebay.com/commerce/identity/v1/user/");
    assert.strictEqual(fetchImpl.calls[0].init.headers.Authorization, "Bearer at");
    assert.deepStrictEqual(identity, { userId: "ebayuser_xxx", username: "eggcraft_uk", accountType: "BUSINESS", registrationMarketplaceId: "EBAY_GB" });
    assert.ok(!JSON.stringify(identity).includes("example.com") && !JSON.stringify(identity).includes("Workshop Lane"));
  });

  await check("an identity 403 is no_seller (scope not granted); a 401 is the token", async () => {
    await assert.rejects(oauth.fetchIdentity({ environment: "sandbox", accessToken: "at", fetchImpl: fakeFetch(() => jsonResponse(403, { errors: [{ errorId: 1100 }] })) }), (e) => e.code === "no_seller" && e.errorClass === "permission");
    await assert.rejects(oauth.fetchIdentity({ environment: "sandbox", accessToken: "at", fetchImpl: fakeFetch(() => jsonResponse(401, {})) }), (e) => e.errorClass === "auth");
  });

  await check("the application token asks for client_credentials with the application scope only", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(200, { access_token: "app-token", expires_in: 7200 }));
    const out = await oauth.appToken({ environment: "production", clientId: "id", clientSecret: "s", fetchImpl });
    const form = new URLSearchParams(fetchImpl.calls[0].init.body);
    assert.strictEqual(form.get("grant_type"), "client_credentials");
    assert.strictEqual(form.get("scope"), "https://api.ebay.com/oauth/api_scope");
    assert.strictEqual(out.access_token, "app-token");
  });

  if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
  console.log("\n✅ COMMERCE EBAY OAUTH GEÇTİ");
})();

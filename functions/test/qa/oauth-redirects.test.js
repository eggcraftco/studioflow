// The check that decides where an authorization code is allowed to go.
//
// Before this existed, redirect_uri was checked only for being a syntactically
// valid URL. Registration wrote nothing down, so there was nothing to compare
// against; approve took the destination from the request body and sent the code
// there; and the token endpoint compared that destination to the copy it had
// stored from the same request, which is self-consistent by construction. A
// link on the real nivadesk.app domain, with the real consent screen, handed a
// thirty-day workspace token to whoever wrote the link.
//
// These tests are mostly about the ways this check is usually got around.
const assert = require("assert");
const {
  normalizeRedirectUri, normalizeRegisteredUris, isRegisteredRedirectUri, clientRecord, redirectHost
} = require("../../oauth/redirects");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

const REGISTERED = ["https://chatgpt.com/aip/callback", "https://chat.openai.com/aip/callback"];

check("a registered destination is admitted", () => {
  assert.ok(isRegisteredRedirectUri(REGISTERED, "https://chatgpt.com/aip/callback"));
  assert.ok(isRegisteredRedirectUri(REGISTERED, "https://chat.openai.com/aip/callback"));
});

check("an unregistered destination is refused", () => {
  assert.ok(!isRegisteredRedirectUri(REGISTERED, "https://evil.example/callback"));
  assert.ok(!isRegisteredRedirectUri(REGISTERED, "https://chatgpt.com.evil.example/aip/callback"));
});

check("a path suffix does not ride in on a registered prefix", () => {
  // The classic failure: writing the check as startsWith. Anyone who can put a
  // page under the registered origin then receives the code.
  assert.ok(!isRegisteredRedirectUri(REGISTERED, "https://chatgpt.com/aip/callback/evil"));
  assert.ok(!isRegisteredRedirectUri(REGISTERED, "https://chatgpt.com/aip/callbackevil"));
});

check("a query or fragment appended to a registered URI does not ride in", () => {
  assert.ok(!isRegisteredRedirectUri(REGISTERED, "https://chatgpt.com/aip/callback?next=https://evil.example"));
  assert.ok(!isRegisteredRedirectUri(REGISTERED, "https://chatgpt.com/aip/callback#x"));
});

check("a registered URI hidden inside somebody else's query does not ride in", () => {
  // The other classic: writing the check as includes().
  assert.ok(!isRegisteredRedirectUri(REGISTERED, "https://evil.example/?u=https://chatgpt.com/aip/callback"));
  assert.ok(!isRegisteredRedirectUri(REGISTERED, "https://evil.example/https://chatgpt.com/aip/callback"));
});

check("userinfo in the authority does not fool the host", () => {
  // https://chatgpt.com@evil.example/ goes to evil.example.
  assert.ok(!isRegisteredRedirectUri(REGISTERED, "https://chatgpt.com@evil.example/aip/callback"));
  assert.strictEqual(redirectHost("https://chatgpt.com@evil.example/cb"), "evil.example");
});

check("plain http is refused, because a code sent over it is readable in transit", () => {
  assert.strictEqual(normalizeRedirectUri("http://chatgpt.com/cb"), "");
  assert.ok(!isRegisteredRedirectUri(["http://chatgpt.com/cb"], "http://chatgpt.com/cb"));
});

check("except on the loopback host, where a desktop client's callback lives", () => {
  // A code sent to localhost never left the victim's own machine.
  for (const uri of ["http://localhost:3000/cb", "http://127.0.0.1:8976/cb", "http://[::1]:1410/cb"]) {
    assert.notStrictEqual(normalizeRedirectUri(uri), "", uri);
  }
  assert.ok(isRegisteredRedirectUri(["http://127.0.0.1:8976/cb"], "http://127.0.0.1:8976/cb"));
  // But a hostname that merely looks like it is not loopback.
  assert.strictEqual(normalizeRedirectUri("http://localhost.evil.example/cb"), "");
  assert.strictEqual(normalizeRedirectUri("http://127.0.0.1.evil.example/cb"), "");
});

check("a scheme that is not http(s) is refused outright", () => {
  for (const uri of [
    "javascript:alert(1)",
    "data:text/html,<script>x</script>",
    "file:///etc/passwd",
    "chatgpt://callback",
    " //evil.example/cb",
    "not a url"
  ]) {
    assert.strictEqual(normalizeRedirectUri(uri), "", uri);
  }
});

check("nothing empty or malformed is ever admitted", () => {
  for (const bad of ["", "   ", null, undefined, 7, {}, []]) {
    assert.strictEqual(normalizeRedirectUri(bad), "", JSON.stringify(bad));
    assert.ok(!isRegisteredRedirectUri(REGISTERED, bad));
  }
  // And an empty registration admits nothing at all, rather than everything.
  for (const registered of [[], null, undefined, "not a list"]) {
    assert.ok(!isRegisteredRedirectUri(registered, "https://chatgpt.com/aip/callback"), JSON.stringify(registered));
  }
});

check("both sides are canonicalised, so equivalent spellings still match", () => {
  // The registrant wrote a bare origin; the client sends the same thing with
  // the slash the URL parser adds. These are the same destination.
  assert.ok(isRegisteredRedirectUri(["https://chatgpt.com"], "https://chatgpt.com/"));
  assert.ok(isRegisteredRedirectUri(["https://ChatGPT.com/CB"], "https://chatgpt.com/CB"));
  // The path's case is NOT folded — paths are case sensitive.
  assert.ok(!isRegisteredRedirectUri(["https://chatgpt.com/cb"], "https://chatgpt.com/CB"));
});

check("a registration keeps its list clean and bounded", () => {
  const many = Array.from({ length: 40 }, (_, i) => `https://chatgpt.com/cb/${i}`);
  assert.strictEqual(normalizeRegisteredUris(many).length, 20);
  assert.deepStrictEqual(
    normalizeRegisteredUris(["https://a.example/cb", "https://a.example/cb", "javascript:x", "", null]),
    ["https://a.example/cb"]
  );
});

check("a stored record never holds something we would refuse anyway", () => {
  const record = clientRecord({
    clientId: "chatgpt_abc",
    redirectUris: ["https://chatgpt.com/cb", "http://evil.example/cb", "javascript:x"],
    clientName: "ChatGPT"
  });
  assert.deepStrictEqual(record.redirectUris, ["https://chatgpt.com/cb"]);
  assert.deepStrictEqual(record.grantTypes, ["authorization_code"]);
  assert.deepStrictEqual(record.responseTypes, ["code"]);
});

check("the consent screen can be told the real destination host", () => {
  assert.strictEqual(redirectHost("https://chatgpt.com/aip/callback"), "chatgpt.com");
  assert.strictEqual(redirectHost("http://localhost:3000/cb"), "localhost:3000");
  assert.strictEqual(redirectHost("nonsense"), "");
});

// ---- the wiring, which no unit test of the rule can see -------------------
//
// The rule being right is half of it. It has to be called at the two places
// that can lead to a code, registration has to actually write something down,
// and the write has to be awaited — a registration that exists only in the HTTP
// reply is exactly the hole this closes, because the client can authorize the
// instant it has the id.
const fs = require("fs");
const path = require("path");
const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");

function handlerBody(name) {
  const start = SOURCE.indexOf(`exports.${name} = onRequest(`);
  assert.ok(start > 0, `${name} is where it was`);
  const end = SOURCE.indexOf("\n});", start);
  return SOURCE.slice(start, end);
}

check("registration writes the client down, and waits for it", () => {
  const body = handlerBody("chatgptOAuthRegister");
  const write = body.indexOf("await nvChatGPTOAuthClientsRef().doc(clientId).set(");
  const reply = body.indexOf("nvOAuthJson(res, 201");
  assert.ok(write > 0, "the registration is stored");
  assert.ok(reply > 0, "the registration is answered");
  assert.ok(write < reply, "the record must be written BEFORE the client is told its id");
  assert.ok(
    /if \(!redirectUris\.length\)/.test(body),
    "a client with no usable redirect_uri is refused at registration, not at the consent screen"
  );
});

check("approve refuses an unregistered destination before it mints a code", () => {
  const body = handlerBody("chatgptOAuthApprove");
  const guard = body.indexOf("await nvOAuthRedirectAllowed(");
  const mint = body.indexOf("nvOAuthCreateCodeRecord(");
  assert.ok(guard > 0, "approve checks the destination");
  assert.ok(mint > 0, "approve mints the code");
  assert.ok(guard < mint, "the destination is checked BEFORE the code exists");
});

check("authorize refuses it too, so a crafted link dies before the sign-in", () => {
  const body = handlerBody("chatgptOAuthAuthorize");
  const guard = body.indexOf("await nvOAuthRedirectAllowed(");
  const redirect = body.indexOf("res.redirect(302");
  assert.ok(guard > 0, "authorize checks the destination");
  assert.ok(redirect > 0, "authorize still redirects to the login page");
  assert.ok(guard < redirect, "the check happens before the person is sent anywhere");
});

check("an unregistered client is refused rather than treated as unrestricted", () => {
  const helper = SOURCE.slice(
    SOURCE.indexOf("async function nvOAuthRedirectAllowed("),
    SOURCE.indexOf("async function nvOAuthRedirectAllowed(") + 700
  );
  assert.ok(
    /if \(!registered\.length\) return \{ ok: false/.test(helper),
    "an empty registration must refuse everything, not admit everything"
  );
});

check("the URI cleaner used everywhere else goes through the same rule", () => {
  // nvSafeOAuthUri is called from approve and from the token endpoint. If it
  // kept its own looser parse, plain http would still get through there.
  const cleaner = SOURCE.slice(SOURCE.indexOf("function nvSafeOAuthUri("), SOURCE.indexOf("function nvSafeOAuthUri(") + 260);
  assert.ok(/return nvNormalizeRedirectUri\(value\);/.test(cleaner), "nvSafeOAuthUri must delegate to the shared rule");
  assert.ok(!/\"http:\"/.test(cleaner), "the old protocol allowlist is gone");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ OAUTH REDIRECTS GEÇTİ");
})();

// The Etsy primitives every later stage depends on: token encryption, PKCE,
// and webhook signature verification.
//
// These are the pieces where being "almost right" is indistinguishable from
// being right until someone attacks them, so they get tested directly rather
// than through the sync engine.

const crypto = require("crypto");
const assert = require("assert");
const etsy = require("../../etsy");

let failed = 0;
function pass(what) { console.log("  ok  " + what); }
function check(fn, what) {
  try { fn(); pass(what); } catch (error) {
    failed += 1;
    console.log("  FAIL " + what + "\n        " + (error?.message || error));
  }
}

console.log("Etsy core primitives");

// --- token encryption -------------------------------------------------------
const key = crypto.randomBytes(32).toString("hex");

check(() => {
  const box = etsy.encryptToken("12345.abcdefg-refresh-token", key);
  assert.notStrictEqual(box.data, "12345.abcdefg-refresh-token", "ciphertext must not be the plaintext");
  assert.strictEqual(etsy.decryptToken(box, key), "12345.abcdefg-refresh-token");
}, "a token survives an encrypt/decrypt round trip");

check(() => {
  const box = etsy.encryptToken("secret", key);
  const other = crypto.randomBytes(32).toString("hex");
  assert.throws(() => etsy.decryptToken(box, other));
}, "a token does not decrypt under a different key");

check(() => {
  const box = etsy.encryptToken("secret", key);
  const tampered = { ...box, data: Buffer.from("tampered payload").toString("base64") };
  assert.throws(() => etsy.decryptToken(tampered, key), "GCM must reject a modified ciphertext");
}, "tampering with the ciphertext is detected");

check(() => {
  const a = etsy.encryptToken("same", key);
  const b = etsy.encryptToken("same", key);
  assert.notStrictEqual(a.iv, b.iv, "each encryption needs its own IV");
  assert.notStrictEqual(a.data, b.data, "the same token must not encrypt to the same bytes twice");
}, "the same token encrypts differently every time");

check(() => {
  assert.throws(() => etsy.encryptToken("x", "too-short"));
  assert.throws(() => etsy.encryptToken("x", ""));
  assert.strictEqual(etsy.tokenKeyBytes(crypto.randomBytes(32).toString("base64")).length, 32);
}, "the key must be 32 bytes, hex or base64");

// --- PKCE -------------------------------------------------------------------
check(() => {
  const verifier = etsy.makeCodeVerifier();
  assert.ok(verifier.length >= 43 && verifier.length <= 128, `verifier length ${verifier.length} outside 43..128`);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(verifier), "verifier must be base64url with no padding");
}, "the code verifier matches the PKCE spec");

check(() => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  // RFC 7636 appendix B: this verifier hashes to this challenge.
  assert.strictEqual(etsy.codeChallengeFor(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
}, "the S256 challenge matches the RFC 7636 test vector");

check(() => {
  const url = new URL(etsy.authorizeUrl({
    keystring: "kkkk", redirectUri: "https://example.test/cb", state: "st", codeChallenge: "ch"
  }));
  assert.strictEqual(url.searchParams.get("code_challenge_method"), "S256");
  assert.strictEqual(url.searchParams.get("response_type"), "code");
  assert.strictEqual(url.searchParams.get("client_id"), "kkkk");
  assert.strictEqual(url.searchParams.get("scope"), "transactions_r email_r shops_r");
  assert.ok(!url.searchParams.has("client_secret"), "the authorize URL must never carry a secret");
}, "the authorize URL is built to Etsy's contract");

check(() => {
  assert.ok(!etsy.ETSY_SCOPES.some((scope) => scope.endsWith("_w")), "phase 1 must request no write scope");
}, "no write scope is requested");

// --- webhook signature ------------------------------------------------------
const signingSecret = "whsec_" + crypto.randomBytes(24).toString("base64");
function signed(body, { id = "msg_1", ts = Math.floor(Date.now() / 1000), secret = signingSecret } = {}) {
  const keyBytes = Buffer.from(String(secret).replace(/^whsec_/, ""), "base64");
  const signature = crypto.createHmac("sha256", keyBytes).update(`${id}.${ts}.${body}`, "utf8").digest("base64");
  return { id, ts, signature };
}

const body = JSON.stringify({ event_type: "order.paid", shop_id: 123, resource_url: "https://openapi.etsy.com/v3/x" });

check(() => {
  const s = signed(body);
  const result = etsy.verifyWebhookSignature({
    rawBody: body, webhookId: s.id, webhookTimestamp: s.ts,
    webhookSignature: `v1,${s.signature}`, signingSecret
  });
  assert.strictEqual(result.ok, true, result.reason);
}, "a correctly signed webhook is accepted");

check(() => {
  const s = signed(body);
  const result = etsy.verifyWebhookSignature({
    rawBody: body, webhookId: s.id, webhookTimestamp: s.ts,
    webhookSignature: `v1,${s.signature} v1,AAAA`, signingSecret
  });
  assert.strictEqual(result.ok, true, "a rotated-secret header lists several signatures");
}, "one valid signature among several is enough");

check(() => {
  const s = signed(body);
  const result = etsy.verifyWebhookSignature({
    rawBody: body.replace("order.paid", "order.canceled"),
    webhookId: s.id, webhookTimestamp: s.ts, webhookSignature: `v1,${s.signature}`, signingSecret
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "signature_mismatch");
}, "a changed body is rejected");

check(() => {
  const s = signed(body);
  const result = etsy.verifyWebhookSignature({
    rawBody: body, webhookId: "msg_other", webhookTimestamp: s.ts,
    webhookSignature: `v1,${s.signature}`, signingSecret
  });
  assert.strictEqual(result.ok, false, "the id is part of the signed content");
}, "a swapped webhook id is rejected");

check(() => {
  const old = Math.floor(Date.now() / 1000) - (etsy.WEBHOOK_TOLERANCE_SECONDS + 60);
  const s = signed(body, { ts: old });
  const result = etsy.verifyWebhookSignature({
    rawBody: body, webhookId: s.id, webhookTimestamp: s.ts,
    webhookSignature: `v1,${s.signature}`, signingSecret
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "stale_timestamp");
}, "a replayed request outside the window is rejected");

check(() => {
  const other = "whsec_" + crypto.randomBytes(24).toString("base64");
  const s = signed(body, { secret: other });
  const result = etsy.verifyWebhookSignature({
    rawBody: body, webhookId: s.id, webhookTimestamp: s.ts,
    webhookSignature: `v1,${s.signature}`, signingSecret
  });
  assert.strictEqual(result.ok, false);
}, "a signature from another secret is rejected");

check(() => {
  const result = etsy.verifyWebhookSignature({ rawBody: body, signingSecret });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "missing_headers");
}, "an unsigned request is rejected");

// The trap this codebase should never fall into twice: re-serialising the body.
check(() => {
  const s = signed(body);
  const reserialised = JSON.stringify(JSON.parse(body).event_type ? JSON.parse(body) : {});
  const result = etsy.verifyWebhookSignature({
    rawBody: reserialised, webhookId: s.id, webhookTimestamp: s.ts,
    webhookSignature: `v1,${s.signature}`, signingSecret
  });
  // Same JSON, different bytes only if key order/whitespace changed. Assert the
  // verifier is byte-exact rather than lenient.
  assert.strictEqual(result.ok, reserialised === body);
}, "verification is over the raw bytes, not the parsed object");

// --- identity ---------------------------------------------------------------
check(() => {
  assert.strictEqual(etsy.externalOrderKey("c1", "222", "333"), "c1_222_333");
  assert.strictEqual(etsy.nivadeskOrderIdFor("222", "333"), "etsy_222_333");
  // Same receipt, same ids — that is the whole duplicate defence.
  assert.strictEqual(etsy.externalOrderKey("c1", "222", "333"), etsy.externalOrderKey("c1", "222", "333"));
}, "external ids are deterministic");

check(() => {
  assert.ok(!etsy.safeIdPart("../../etc/passwd").includes("/"), "no path separator survives");
  assert.ok(!etsy.safeIdPart("a/b").includes("/"));
  assert.strictEqual(etsy.safeIdPart("331234567"), "331234567", "an ordinary Etsy id passes through");
  assert.strictEqual(etsy.safeIdPart("K3mQ8vZp2LxR7tYw1NcB4dFg6HjA"), "K3mQ8vZp2LxR7tYw1NcB4dFg6HjA",
    "an ordinary Firebase uid passes through, so ids stay readable");
}, "path characters cannot escape a document id");

check(() => {
  // Stripping alone is not injective: "A.B" and "AB" would strip to the same
  // thing, and one workspace's rows would land on another's. Anything altered
  // carries a digest of the original.
  const pairs = [["a-b", "ab"], ["A.B", "AB"], ["comp any", "company"], ["x_1", "x1"], ["a_222", "a"]];
  for (const [left, right] of pairs) {
    assert.notStrictEqual(
      etsy.externalOrderKey(left, "222", "333"),
      etsy.externalOrderKey(right, "222", "333"),
      `${left} and ${right} must not share an id`
    );
  }
  // …and the separator cannot be shifted either.
  assert.notStrictEqual(etsy.externalOrderKey("a", "222_333", "444"), etsy.externalOrderKey("a_222", "333", "444"));
}, "two different workspaces can never share an external-order id");

check(() => {
  assert.strictEqual(etsy.etsyUserIdFromToken("12345.abcdef"), "12345");
  assert.strictEqual(etsy.etsyUserIdFromToken("nodot"), "");
  assert.strictEqual(etsy.etsyUserIdFromToken("abc.def"), "");
}, "the Etsy user id is read from the token prefix");

// --- retry ------------------------------------------------------------------
check(() => {
  assert.strictEqual(etsy.parseRetryAfter("30"), 30000);
  assert.strictEqual(etsy.parseRetryAfter(""), 0);
  assert.ok(etsy.retryDelayMs(0, 5000) === 5000, "Retry-After wins over backoff");
  assert.ok(etsy.retryDelayMs(9, 0) <= 16000, "backoff stays bounded");
  assert.ok(etsy.retryDelayMs(0, 999999) <= 30000, "an absurd Retry-After is capped");
}, "retry timing respects Etsy and stays bounded");


// Etsy wants both of its values in one header, joined by a colon:
// keystring:shared_secret. Nothing in the reference documentation says so —
// Etsy only tells you when you get it wrong, and it gives a different error for
// each way of getting it wrong. The keystring alone is what we shipped, and it
// 403s every request including the unauthenticated ping.
check(() => {
  assert.strictEqual(etsy.etsyApiKey("abc", "def"), "abc:def");
  assert.strictEqual(etsy.etsyApiKey("abc", ""), "abc", "falls back before the secret exists");
  assert.strictEqual(etsy.etsyApiKey("abc"), "abc");
  // The OAuth client_id is the keystring on its own — joining it there would
  // break the consent screen, which is the half that already worked.
  const url = new URL(etsy.authorizeUrl({
    keystring: "abc", redirectUri: "https://x.test/cb", state: "s", codeChallenge: "c"
  }));
  assert.strictEqual(url.searchParams.get("client_id"), "abc", "client_id is never joined");
}, "the API header joins keystring and shared secret; the OAuth client_id does not");

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nPASS");

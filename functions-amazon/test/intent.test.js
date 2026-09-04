// The connect intent: minted in the main project, carried by a browser,
// verified here. The browser is not trusted with anything but delivery.
const assert = require("assert");
const { mintIntent, verifyIntent, stateFor, INTENT_TTL_MS } = require("../src/intent");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const KEY = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex");
const OTHER_KEY = Buffer.from("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", "hex");
const T0 = 1_700_000_000_000;

check("a fresh intent verifies and carries the workspace", () => {
  const token = mintIntent({ companyId: "co-1", ownerUid: "uid-1", key: KEY, now: () => T0 });
  const r = verifyIntent(token, { key: KEY, now: () => T0 + 1000 });
  assert.strictEqual(r.ok, true, r.reason);
  assert.strictEqual(r.payload.companyId, "co-1");
  assert.strictEqual(r.payload.ownerUid, "uid-1");
  assert.ok(r.payload.nonce.length >= 16);
});

check("a different key, a changed byte, or a changed claim is a bad signature", () => {
  const token = mintIntent({ companyId: "co-1", ownerUid: "uid-1", key: KEY, now: () => T0 });
  assert.strictEqual(verifyIntent(token, { key: OTHER_KEY, now: () => T0 }).reason, "bad_signature");
  const [payload, sig] = token.split(".");
  const tampered = Buffer.from(payload, "base64url").toString("utf8").replace("co-1", "co-2");
  assert.strictEqual(verifyIntent(`${Buffer.from(tampered).toString("base64url")}.${sig}`, { key: KEY, now: () => T0 }).reason, "bad_signature");
  assert.strictEqual(verifyIntent(`${payload}.${sig.slice(0, -2)}xx`, { key: KEY, now: () => T0 }).reason, "bad_signature");
});

check("it expires after ten minutes and cannot be minted with a longer life", () => {
  const token = mintIntent({ companyId: "co-1", ownerUid: "uid-1", key: KEY, now: () => T0 });
  assert.strictEqual(verifyIntent(token, { key: KEY, now: () => T0 + INTENT_TTL_MS - 1 }).ok, true);
  assert.strictEqual(verifyIntent(token, { key: KEY, now: () => T0 + INTENT_TTL_MS + 1 }).reason, "expired");
  // A forged payload with a year of validity, signed with the real key, is still refused.
  const crypto = require("crypto");
  const long = JSON.stringify({ v: 1, companyId: "co-1", ownerUid: "uid-1", nonce: "n".repeat(32), iat: T0, exp: T0 + 365 * 24 * 3600 * 1000 });
  const sig = crypto.createHmac("sha256", KEY).update(long).digest("base64url");
  assert.strictEqual(verifyIntent(`${Buffer.from(long).toString("base64url")}.${sig}`, { key: KEY, now: () => T0 }).reason, "ttl_too_long");
});

check("a replayed nonce is refused", () => {
  const token = mintIntent({ companyId: "co-1", ownerUid: "uid-1", key: KEY, now: () => T0 });
  const seen = new Set();
  const first = verifyIntent(token, { key: KEY, now: () => T0, seenNonce: (n) => seen.has(n) });
  assert.strictEqual(first.ok, true);
  seen.add(first.payload.nonce);
  assert.strictEqual(verifyIntent(token, { key: KEY, now: () => T0, seenNonce: (n) => seen.has(n) }).reason, "replayed");
});

check("malformed input never throws", () => {
  for (const bad of ["", "a", "a.b", "a.b.c", null, undefined, 42, "..", `${"x".repeat(10)}.${"y".repeat(10)}`]) {
    const r = verifyIntent(bad, { key: KEY, now: () => T0 });
    assert.strictEqual(r.ok, false);
  }
});

check("an intent without a subject cannot be minted", () => {
  assert.throws(() => mintIntent({ companyId: "", ownerUid: "u", key: KEY }), /intent_missing_subject/);
  assert.throws(() => mintIntent({ companyId: "c", ownerUid: "", key: KEY }), /intent_missing_subject/);
});

check("the LWA state is bound to the nonce and cannot be guessed", () => {
  const a = stateFor("nonce-a", KEY);
  const b = stateFor("nonce-b", KEY);
  assert.notStrictEqual(a, b);
  assert.strictEqual(a, stateFor("nonce-a", KEY), "not deterministic");
  assert.notStrictEqual(a, stateFor("nonce-a", OTHER_KEY), "does not depend on the key");
  assert.ok(/^[A-Za-z0-9_-]{43}$/.test(a), a);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log(`PASS  ${name}`); }
    catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ INTENT GEÇTİ");
})();

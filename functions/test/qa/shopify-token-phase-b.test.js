// The plaintext copy of a Shopify OAuth token, and how it leaves.
//
// Phase A wrote the token twice — encrypted, and in the clear beside it — so a
// store whose box would not decrypt kept working in front of a Shopify
// reviewer. That copy is precisely what an encryption control exists to
// prevent, and "we encrypt our tokens" is not a true sentence while one is
// sitting in the database.
//
// Phase B removes it with no migration and no date: new tokens are boxed only,
// and an old store is boxed the first time its token is read. The rule this
// file exists for is the ordering — the plaintext is cleared only after the new
// box has been decrypted back and matched, because writing a box and deleting
// the original in one step trusts a key that has never been proved to read what
// it just wrote, and that failure is silent, total and unrecoverable.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
function bodyOf(marker, close = "\n}") {
  const start = source.indexOf(marker);
  assert.ok(start > 0, `${marker} is gone`);
  return source.slice(start, source.indexOf(close, start));
}

check("new tokens are written boxed only", () => {
  assert.ok(
    /const SHOPIFY_TOKEN_DUAL_WRITE = false;/.test(source),
    "the dual write is back on, so every new install stores a plaintext token"
  );
});

check("the plaintext is still written when there is no key, because losing the token is worse", () => {
  // The one case where a plaintext token is the lesser harm: a function without
  // SHOPIFY_TOKEN_KEY cannot box, and a store with no token at all has to be
  // reinstalled by the merchant.
  const line = source.split("\n").find((l) => l.includes("update.accessToken = SHOPIFY_TOKEN_DUAL_WRITE"));
  assert.ok(line, "the write site is gone");
  assert.ok(line.includes("!box"), "a store whose token could not be boxed now stores nothing at all");
});

check("the box is read back and compared before the plaintext is deleted", () => {
  const body = bodyOf("function migrateShopifyStoreToken(shop, plaintext) {");
  const decrypt = body.indexOf("decryptToken(box");
  const compare = body.indexOf("verified !== plaintext");
  const del = body.indexOf("FieldValue.delete()");
  assert.ok(decrypt > 0, "the box is never decrypted back");
  assert.ok(compare > decrypt, "the decrypted value is never compared with what went in");
  assert.ok(del > compare, "the plaintext is deleted before the box is proved to read back");
});

check("a box that will not read back leaves the plaintext alone and writes nothing", () => {
  const body = bodyOf("function migrateShopifyStoreToken(shop, plaintext) {");
  const compare = body.indexOf("verified !== plaintext");
  const afterCompare = body.slice(compare, compare + 260);
  assert.ok(/return;/.test(afterCompare), "a failed read-back does not stop the migration");
  const write = body.indexOf("shopifyStoreRef(shop).set(");
  assert.ok(write > compare, "the store is written before the check");
});

check("a decrypt that throws is a failed read-back, not a crash", () => {
  const body = bodyOf("function migrateShopifyStoreToken(shop, plaintext) {");
  assert.ok(/try \{[^}]*decryptToken\(box[^}]*\} catch/.test(body.replace(/\n/g, " ")),
    "a wrong key would throw out of a fire-and-forget path instead of being handled");
});

check("reading a token still prefers the box and never logs one", () => {
  const body = bodyOf("function shopifyStoreAccessToken(store) {");
  assert.ok(body.indexOf("accessTokenEncrypted") < body.indexOf("return plaintext"), "the plaintext is preferred over the box");
  // A token must never reach a log line, on any branch.
  for (const line of body.split("\n").filter((l) => l.includes("console."))) {
    assert.ok(!/\btoken\b\s*\)/.test(line) && !line.includes("plaintext)"), `a log line carries the token: ${line.trim()}`);
  }
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ SHOPIFY TOKEN PHASE B GEÇTİ");
})();

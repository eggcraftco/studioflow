// The two-key encoding of EBAY_TOKEN_KEY and EBAY_HASH_KEY (design §6, §4.6):
// one or two keys separated by whitespace or a comma, the first is the write
// key, three are refused, a short entry is refused at first use, and a buyer
// hash under either key is found by a match that runs under every key.
const assert = require("assert");
const crypto = require("crypto");
const { keyListOf, writeKeyOf, MAX_KEYS } = require("../../commerce/ebay/keys");
const hashing = require("../../commerce/ebay/hashing");
const { encryptToken, decryptToken, tokenNeedsRebox } = require("../../security/tokenBox");
let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 260)); } }

const A = crypto.randomBytes(32).toString("hex");
const B = crypto.randomBytes(32).toString("base64");

check("one key, two keys with whitespace, two keys with a comma", () => {
  assert.deepStrictEqual(keyListOf(A), [A]);
  assert.deepStrictEqual(keyListOf(`${A} ${B}`), [A, B]);
  assert.deepStrictEqual(keyListOf(`${A},${B}`), [A, B]);
  assert.deepStrictEqual(keyListOf(`  ${A} ,\n ${B}  `), [A, B], "surrounding whitespace and a newline are tolerated");
});

check("the write key is index 0 — the NEW key goes first at rotation", () => {
  assert.strictEqual(writeKeyOf(`${B} ${A}`), B);
  const box = encryptToken("refresh-token", keyListOf(`${B} ${A}`));
  assert.strictEqual(decryptToken(box, keyListOf(`${B} ${A}`)), "refresh-token");
  const old = encryptToken("refresh-token", A);
  assert.strictEqual(decryptToken(old, keyListOf(`${B} ${A}`)), "refresh-token", "a box on the old key still opens");
  assert.strictEqual(tokenNeedsRebox(old, keyListOf(`${B} ${A}`)), true, "and is marked to move to the new key");
});

check("three keys are refused; a 31-byte entry is refused; an empty secret is refused", () => {
  const C = crypto.randomBytes(32).toString("hex");
  assert.throws(() => keyListOf(`${A} ${B} ${C}`), new RegExp(`at most ${MAX_KEYS}`));
  assert.throws(() => keyListOf(`${A} ${crypto.randomBytes(31).toString("hex")}`), /32 bytes/);
  assert.throws(() => keyListOf(""), /No eBay key/);
  assert.throws(() => keyListOf("   ,  "), /No eBay key/);
});

check("buyer hashes are keyed HMACs, not plain digests, and the username is lower-cased first", () => {
  const h = hashing.usernameHash(A, "Ada_L");
  assert.strictEqual(h, hashing.usernameHash(A, "ada_l"));
  assert.strictEqual(h.length, 64);
  assert.notStrictEqual(h, crypto.createHash("sha256").update("ada_l").digest("hex"), "an unsalted SHA-256 of a handle is dictionary-reversible");
  assert.notStrictEqual(h, hashing.usernameHash(B, "ada_l"), "a different key, a different hash");
  assert.notStrictEqual(hashing.userIdHash(A, "ebayuser_xxx"), hashing.userIdHash(A, "EBAYUSER_XXX"), "user ids are opaque and case-significant");
});

check("a deletion match runs under every key the secret offers, write key first", () => {
  const value = hashing.normalizeUsername("ada_l");
  const under = hashing.hashesUnderEveryKey(`${B} ${A}`, value);
  assert.deepStrictEqual(under, [hashing.buyerHash(B, value), hashing.buyerHash(A, value)]);
  assert.ok(under.includes(hashing.usernameHash(A, "ada_l")), "a row written under the old key is still matched");
  assert.deepStrictEqual(hashing.hashesUnderEveryKey(A, value), [hashing.buyerHash(A, value)]);
});

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\n✅ COMMERCE EBAY KEYS GEÇTİ");

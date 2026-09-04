// Rotating an encryption key used to destroy every credential it protected.
//
// One key per connector, no record in the box of which key wrote it, and no
// second key to fall back on: changing a key made every stored token
// permanently unreadable, and every seller had to reconnect. Nothing announced
// it — the connections simply began to fail.
//
// This is the foundation that makes rotation survivable: a box says which key
// wrote it, a reader may offer several keys, and a caller can tell that a box
// is due to be re-written under the current one.
const assert = require("assert");
const etsy = require("../../etsy");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const KEY_C = Buffer.alloc(32, 7).toString("base64");
const SECRET = "etsy-refresh-token-value";

check("nothing changes for a caller that has always passed one key", () => {
  const box = etsy.encryptToken(SECRET, KEY_A);
  assert.strictEqual(etsy.decryptToken(box, KEY_A), SECRET);
  assert.strictEqual(etsy.encryptToken("", KEY_A), null);
  assert.strictEqual(etsy.decryptToken(null, KEY_A), "");
  assert.strictEqual(etsy.decryptToken({}, KEY_A), "");
});

check("a box records which key wrote it, without hinting at the key", () => {
  const box = etsy.encryptToken(SECRET, KEY_A);
  assert.ok(box.k, "the box does not name its key, so rotation is a guess");
  assert.match(box.k, /^[0-9a-f]{8}$/);
  // The identifier must not be derivable back into the key, and must differ per key.
  assert.notStrictEqual(box.k, etsy.encryptToken(SECRET, KEY_B).k);
  assert.ok(!KEY_A.includes(box.k), "the identifier leaks part of the key");
});

check("a reader offered several keys finds the right one", () => {
  // The rotation window: written under the old key, read while the new one is
  // primary. Without this the credential is simply gone.
  const old = etsy.encryptToken(SECRET, KEY_A);
  assert.strictEqual(etsy.decryptToken(old, [KEY_B, KEY_A]), SECRET);
  const fresh = etsy.encryptToken(SECRET, [KEY_B, KEY_A]);
  assert.strictEqual(etsy.decryptToken(fresh, [KEY_B, KEY_A]), SECRET);
  // A caller writes with the FIRST key it offers, never an older one.
  assert.strictEqual(fresh.k, etsy.encryptToken(SECRET, KEY_B).k);
});

check("a box written before key identifiers existed still reads", () => {
  // Every credential stored to date. If these stopped opening, the rotation
  // work would itself be the outage it was meant to prevent.
  const box = etsy.encryptToken(SECRET, KEY_A);
  delete box.k;
  assert.strictEqual(etsy.decryptToken(box, [KEY_B, KEY_A]), SECRET);
  assert.strictEqual(etsy.decryptToken(box, KEY_A), SECRET);
});

check("a wrong key still fails, and fails loudly", () => {
  // Authenticated encryption: a box that will not open must throw rather than
  // return an empty string that a caller could mistake for "no token".
  const box = etsy.encryptToken(SECRET, KEY_A);
  assert.throws(() => etsy.decryptToken(box, KEY_B));
  assert.throws(() => etsy.decryptToken(box, [KEY_B, KEY_C]));
  assert.throws(() => etsy.decryptToken(box, []), /No decryption key/);
  // And a tampered box fails under every key offered.
  const tampered = { ...etsy.encryptToken(SECRET, KEY_A), data: Buffer.from("nope").toString("base64") };
  assert.throws(() => etsy.decryptToken(tampered, [KEY_A, KEY_B]));
});

check("a caller can tell that a box is due to be rewritten", () => {
  // This is what lets a rotation finish by itself: each credential moves to the
  // new key the next time it is used, and the old key can then be retired.
  const old = etsy.encryptToken(SECRET, KEY_A);
  assert.strictEqual(etsy.tokenNeedsRebox(old, [KEY_B, KEY_A]), true);
  assert.strictEqual(etsy.tokenNeedsRebox(old, [KEY_A]), false);
  assert.strictEqual(etsy.tokenNeedsRebox(old, KEY_A), false);
  // A legacy box with no identifier is due, because it cannot prove otherwise.
  const legacy = { ...old }; delete legacy.k;
  assert.strictEqual(etsy.tokenNeedsRebox(legacy, [KEY_A]), true);
  // Nothing to rewrite is not "due".
  assert.strictEqual(etsy.tokenNeedsRebox(null, [KEY_A]), false);
  assert.strictEqual(etsy.tokenNeedsRebox({}, [KEY_A]), false);
});

check("blank keys in the offered list are ignored rather than throwing", () => {
  // A connector whose previous key is simply unset passes [primary, ""].
  const box = etsy.encryptToken(SECRET, [KEY_A, "", null, undefined]);
  assert.strictEqual(etsy.decryptToken(box, [KEY_A, "", null]), SECRET);
  assert.deepStrictEqual(etsy.tokenKeyList([KEY_A, "", KEY_A, null]), [KEY_A]);
});

check("both key encodings are accepted, and a wrong-sized key is refused", () => {
  const box = etsy.encryptToken(SECRET, KEY_C);
  assert.strictEqual(etsy.decryptToken(box, KEY_C), SECRET);
  assert.throws(() => etsy.encryptToken(SECRET, "too-short"));
  assert.throws(() => etsy.encryptToken(SECRET, ""));
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ TOKEN KEY ROTATION GEÇTİ");
})();

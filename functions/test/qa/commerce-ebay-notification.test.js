// eBay's Notification API, pure half (design §1, §9): the account-deletion
// challenge hashed in eBay's order, the base64-JSON signature header, the SDK's
// verification (SHA-1 ECDSA over JSON.stringify of the parsed body, key wrapped
// from one line), kid hygiene, and the body shape check.
const assert = require("assert");
const crypto = require("crypto");
const notification = require("../../commerce/ebay/notification");
let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); } }

check("the challenge response is sha256hex(challengeCode + verificationToken + endpointUrl), in that order", () => {
  const challengeCode = "123"; const verificationToken = "a".repeat(40); const endpointUrl = "https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayNotifications";
  const expected = crypto.createHash("sha256").update(challengeCode + verificationToken + endpointUrl).digest("hex");
  assert.strictEqual(notification.challengeResponse({ challengeCode, verificationToken, endpointUrl }), expected);
  assert.notStrictEqual(notification.challengeResponse({ challengeCode, verificationToken, endpointUrl: endpointUrl + "/" }), expected, "byte for byte: a trailing slash is a different URL");
  assert.notStrictEqual(notification.challengeResponse({ challengeCode: verificationToken, verificationToken: challengeCode, endpointUrl }), expected, "the order matters");
  const body = JSON.stringify({ challengeResponse: expected });
  assert.strictEqual(body.charCodeAt(0), 123, "JSON via the library: no BOM");
});

check("a verification token is 32–80 alphanumeric characters plus _ and -; a kid is 8–128 of the same", () => {
  assert.ok(notification.isValidVerificationToken("nivadesk_ebay_deletion-token_0123456789"));
  assert.ok(!notification.isValidVerificationToken("short"));
  assert.ok(!notification.isValidVerificationToken("a".repeat(81)));
  assert.ok(!notification.isValidVerificationToken("a".repeat(40) + "!"));
  assert.ok(notification.isValidKid("a1b2c3d4-e5f6"));
  assert.ok(!notification.isValidKid("short1")); assert.ok(!notification.isValidKid("has space in it")); assert.ok(!notification.isValidKid("x".repeat(129))); assert.ok(!notification.isValidKid(""));
});

check("the signature header is base64 of JSON { alg, kid, signature, digest }; anything else is null", () => {
  const header = Buffer.from(JSON.stringify({ alg: "ecdsa", kid: "kid-12345678", signature: "c2ln", digest: "SHA1" })).toString("base64");
  assert.deepStrictEqual(notification.parseSignatureHeader(header), { alg: "ecdsa", kid: "kid-12345678", signature: "c2ln", digest: "SHA1" });
  assert.strictEqual(notification.parseSignatureHeader(""), null);
  assert.strictEqual(notification.parseSignatureHeader("not base64 json"), null);
  assert.strictEqual(notification.parseSignatureHeader(Buffer.from("[1,2]").toString("base64")), null);
  assert.strictEqual(notification.parseSignatureHeader(Buffer.from(JSON.stringify({ alg: "ecdsa" })).toString("base64")), null, "no kid, no signature");
});

check("pemOf wraps the one-line key eBay returns and leaves a real PEM alone", () => {
  const oneLine = "-----BEGIN PUBLIC KEY-----MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE-----END PUBLIC KEY-----";
  assert.strictEqual(notification.pemOf(oneLine), "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----");
  const real = "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----";
  assert.strictEqual(notification.pemOf(real), real);
  assert.strictEqual(notification.pemOf(""), "");
});

check("a vector signed with our own EC P-256 key over JSON.stringify(body) with SHA-1 verifies; a changed body, a wrong key and a wrong signature do not", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  // The username/userId/eiasToken below are eBay's own published sample values from the
  // Marketplace Account Deletion documentation, not a captured buyer. The connector never
  // reads eiasToken; it is here only so the fixture matches the documented payload shape.
  const body = { metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0", deprecated: false }, notification: { notificationId: "49feeaeb-4982-42d9-a377-9645b8479411_33f7e043", eventDate: "2021-03-19T20:43:59.462Z", publishDate: "2021-03-19T20:43:59.679Z", publishAttemptCount: 1, data: { username: "test_user", userId: "ma8vp1jySJC", eiasToken: "nY+sHZ2PrBmdj6wVnY+sEZ2PrA2dj6wFk4GhC5eEoA2dj6x9nY+seQ==" } } };
  const signer = crypto.createSign("sha1"); signer.update(JSON.stringify(body)); signer.end();
  const signature = signer.sign(privateKey, "base64");
  // eBay hands the key back on one line, newlines stripped.
  const spki = publicKey.export({ type: "spki", format: "pem" }).replace(/\n/g, "");
  assert.ok(notification.verifyNotification({ body, signature, publicKey: spki }), "our own vector must verify");
  const changed = JSON.parse(JSON.stringify(body)); changed.notification.data.username = "someone_else";
  assert.ok(!notification.verifyNotification({ body: changed, signature, publicKey: spki }), "a byte changed in the body");
  const { publicKey: other } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  assert.ok(!notification.verifyNotification({ body, signature, publicKey: other.export({ type: "spki", format: "pem" }).replace(/\n/g, "") }), "a different key (a wrong kid)");
  assert.ok(!notification.verifyNotification({ body, signature: Buffer.from("garbage").toString("base64"), publicKey: spki }));
  assert.ok(!notification.verifyNotification({ body, signature, publicKey: "not a key" }), "an unreadable key is a false, not a throw");
  // The verification is over the PARSED body re-serialised: raw bytes with different whitespace still verify when the object is the same.
  const reparsed = JSON.parse(JSON.stringify(body, null, 2));
  assert.ok(notification.verifyNotification({ body: reparsed, signature, publicKey: spki }));
});

check("the body shape: topic, notificationId and a parseable eventDate not more than five minutes in the future", () => {
  const now = Date.parse("2026-09-06T12:00:00.000Z");
  const good = { metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0" }, notification: { notificationId: "n1", eventDate: "2026-09-06T11:59:00.000Z", publishAttemptCount: 2, data: { username: "u", userId: "id" } } };
  const out = notification.validateNotificationBody(good, now);
  assert.strictEqual(out.ok, true); assert.strictEqual(out.topic, "MARKETPLACE_ACCOUNT_DELETION"); assert.strictEqual(out.notificationId, "n1"); assert.strictEqual(out.publishAttemptCount, 2); assert.deepStrictEqual(out.data, { username: "u", userId: "id" });
  assert.strictEqual(notification.validateNotificationBody({ ...good, metadata: {} }, now).error, "topic");
  assert.strictEqual(notification.validateNotificationBody({ ...good, notification: { ...good.notification, notificationId: "" } }, now).error, "notification_id");
  assert.strictEqual(notification.validateNotificationBody({ ...good, notification: { ...good.notification, eventDate: "yesterday" } }, now).error, "event_date");
  assert.strictEqual(notification.validateNotificationBody({ ...good, notification: { ...good.notification, eventDate: "2026-09-06T12:10:00.000Z" } }, now).error, "event_date_future");
  assert.strictEqual(notification.validateNotificationBody({ ...good, notification: { ...good.notification, eventDate: "2026-09-06T12:04:00.000Z" } }, now).ok, true, "inside the five-minute tolerance");
  assert.strictEqual(notification.validateNotificationBody(null, now).error, "body");
  assert.strictEqual(notification.validateNotificationBody([], now).error, "body");
});

check("the topics this half knows, and the size limit eBay's endpoint must honour", () => {
  assert.strictEqual(notification.TOPICS.ACCOUNT_DELETION, "MARKETPLACE_ACCOUNT_DELETION");
  assert.strictEqual(notification.TOPICS.ORDER_CONFIRMATION, "ORDER_CONFIRMATION");
  assert.strictEqual(notification.MAX_BODY_BYTES, 256 * 1024);
});

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\n✅ COMMERCE EBAY NOTIFICATION GEÇTİ");

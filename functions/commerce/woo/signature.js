// WOO-005/006 — X-WC-Webhook-Signature is base64(HMAC-SHA256(secret, raw body)).
// Verified over the bytes that arrived, compared in constant time, and a bad
// signature is a refusal whatever else the request carries.
const crypto = require("crypto");

function expectedSignature(rawBody, secret) {
  return crypto.createHmac("sha256", String(secret)).update(rawBody).digest("base64");
}

function verifyWooSignature(rawBody, header, secret) {
  if (!secret || !header || !rawBody) return false;
  const expected = Buffer.from(expectedSignature(rawBody, secret));
  const provided = Buffer.from(String(header).trim());
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

module.exports = { verifyWooSignature, expectedSignature };

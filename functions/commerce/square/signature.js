// SQ-WEB-001..004 — x-square-hmacsha256-signature is
// base64(HMAC-SHA256(signature_key, notification_url + raw_body)).
// The URL is the one registered with the subscription, byte for byte
// (SQ-WEB-002); the body is the bytes that arrived; the comparison is
// constant time; and a bad signature is a refusal before any queue or
// domain write, whatever else the request carries.
const crypto = require("crypto");

function expectedSquareSignature(notificationUrl, rawBody, signatureKey) {
  const hmac = crypto.createHmac("sha256", String(signatureKey));
  hmac.update(String(notificationUrl));
  hmac.update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || "")));
  return hmac.digest("base64");
}

function verifySquareSignature({ notificationUrl, rawBody, header, signatureKey }) {
  if (!signatureKey || !header || !rawBody || !notificationUrl) return false;
  const expected = Buffer.from(expectedSquareSignature(notificationUrl, rawBody, signatureKey));
  const provided = Buffer.from(String(header).trim());
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

module.exports = { verifySquareSignature, expectedSquareSignature };

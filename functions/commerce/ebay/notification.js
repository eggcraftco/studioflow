"use strict";

// eBay's Notification API, the pure half: the marketplace-account-deletion
// challenge, the signature header, and the verifier.
//
// Facts (docs/ebay-connector-design.md §1, Marketplace User Account Deletion
// page; eBay/event-notification-nodejs-sdk lib/validator.js):
//   * challenge: GET ?challenge_code=<c> → 200 JSON { challengeResponse:
//     sha256hex(challengeCode + verificationToken + endpointUrl) } — hashed in
//     that order, endpoint URL byte for byte as registered.
//   * verification token: 32–80 chars, alphanumeric plus _ and -.
//   * X-EBAY-SIGNATURE: base64 of JSON { alg, kid, signature, digest }.
//   * the public key from getPublicKey is a one-line string: newlines are
//     inserted after the BEGIN marker and before the END marker.
//   * the signature is over JSON.stringify(<parsed body>) with SHA-1 (the SDK
//     verifies "ssl3-sha1" over the re-serialised body, not the raw bytes).
//   * body: { metadata: { topic, schemaVersion, deprecated }, notification:
//     { notificationId, eventDate, publishDate, publishAttemptCount, data } }.
// Pure: no network, no Firestore.
const crypto = require("crypto");

const TOPICS = Object.freeze({
  ACCOUNT_DELETION: "MARKETPLACE_ACCOUNT_DELETION",
  ORDER_CONFIRMATION: "ORDER_CONFIRMATION"
});
const MAX_BODY_BYTES = 256 * 1024;
const MAX_FUTURE_EVENT_MS = 5 * 60 * 1000;
const KID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const VERIFICATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,80}$/;

function challengeResponse({ challengeCode, verificationToken, endpointUrl }) {
  return crypto.createHash("sha256")
    .update(String(challengeCode || ""))
    .update(String(verificationToken || ""))
    .update(String(endpointUrl || ""))
    .digest("hex");
}

function isValidVerificationToken(token) { return VERIFICATION_TOKEN_PATTERN.test(String(token || "")); }
function isValidKid(kid) { return KID_PATTERN.test(String(kid || "")); }

/** The header decoded, or null when it is not what eBay sends. */
function parseSignatureHeader(header) {
  const raw = String(header || "").trim();
  if (!raw) return null;
  let parsed = null;
  try { parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8")); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const out = { alg: String(parsed.alg || ""), kid: String(parsed.kid || ""), signature: String(parsed.signature || ""), digest: String(parsed.digest || "") };
  if (!out.kid || !out.signature) return null;
  return out;
}

/** The one-line key eBay returns, wrapped so Node's crypto will read it. */
function pemOf(key) {
  const text = String(key || "").trim();
  if (!text) return "";
  if (text.includes("\n")) return text;
  return text
    .replace("-----BEGIN PUBLIC KEY-----", "-----BEGIN PUBLIC KEY-----\n")
    .replace("-----END PUBLIC KEY-----", "\n-----END PUBLIC KEY-----");
}

/**
 * Whether `signature` (base64) was made over JSON.stringify(body) with the
 * key — exactly what the SDK checks. `body` is the PARSED object.
 */
function verifyNotification({ body, signature, publicKey }) {
  if (!body || typeof body !== "object" || !signature || !publicKey) return false;
  try {
    const verifier = crypto.createVerify("sha1");
    verifier.update(JSON.stringify(body));
    verifier.end();
    return verifier.verify(pemOf(publicKey), String(signature), "base64");
  } catch { return false; }
}

/**
 * The shape check that runs after the signature: topic, id and a plausible
 * event time. Returns what the dispatcher needs or the reason it cannot.
 */
function validateNotificationBody(body, nowMs = Date.now()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "body" };
  const topic = String(body?.metadata?.topic || "").trim();
  const notificationId = String(body?.notification?.notificationId || "").trim();
  const eventDate = String(body?.notification?.eventDate || "").trim();
  const eventDateMs = Date.parse(eventDate);
  if (!topic) return { ok: false, error: "topic" };
  if (!notificationId || notificationId.length > 200) return { ok: false, error: "notification_id" };
  if (!Number.isFinite(eventDateMs)) return { ok: false, error: "event_date" };
  if (eventDateMs > Number(nowMs) + MAX_FUTURE_EVENT_MS) return { ok: false, error: "event_date_future" };
  const data = body.notification && typeof body.notification.data === "object" && body.notification.data ? body.notification.data : {};
  return { ok: true, topic, notificationId, eventDateMs, schemaVersion: String(body?.metadata?.schemaVersion || ""), publishAttemptCount: Number(body?.notification?.publishAttemptCount) || 0, data };
}

module.exports = {
  TOPICS, MAX_BODY_BYTES, MAX_FUTURE_EVENT_MS, KID_PATTERN, VERIFICATION_TOKEN_PATTERN,
  challengeResponse, isValidVerificationToken, isValidKid, parseSignatureHeader, pemOf, verifyNotification, validateNotificationBody
};

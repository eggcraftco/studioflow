"use strict";

// The connect intent: how the main project tells the Amazon project "this
// workspace's owner wants to connect Amazon", without either project trusting
// the browser in between.
//
// The main project mints it (amazonConnectStart), the seller's browser carries
// it to /oauth/start, and the Amazon project verifies it. It is an HMAC over a
// small JSON payload with a key held in both projects' Secret Managers, ten
// minutes to live, and single use — the Amazon side records the nonce when it
// accepts one, so a replay is refused.
//
// It is deliberately not a JWT library. The whole thing is a hundred lines
// that both sides can read, and there is nothing to negotiate: one algorithm,
// one key, one shape.
//
// Pure: crypto only, clock injected.

const crypto = require("crypto");

const INTENT_VERSION = 1;
const INTENT_TTL_MS = 10 * 60 * 1000;

const base64url = (buffer) => Buffer.from(buffer).toString("base64url");
const fromBase64url = (text) => Buffer.from(String(text), "base64url");

function sign(payloadText, key) {
  return crypto.createHmac("sha256", key).update(payloadText).digest();
}

/**
 * Mints an intent. `key` is the raw HMAC key (Buffer or string).
 * Returns the token string: base64url(payload).base64url(signature).
 */
function mintIntent({ companyId, ownerUid, key, now = Date.now, nonce = () => crypto.randomBytes(16).toString("hex") }) {
  const payload = {
    v: INTENT_VERSION,
    companyId: String(companyId || ""),
    ownerUid: String(ownerUid || ""),
    nonce: nonce(),
    iat: now(),
    exp: now() + INTENT_TTL_MS
  };
  if (!payload.companyId || !payload.ownerUid) throw new Error("intent_missing_subject");
  const payloadText = JSON.stringify(payload);
  const signature = sign(payloadText, key);
  return `${base64url(payloadText)}.${base64url(signature)}`;
}

/**
 * Verifies an intent. Returns { ok, payload, reason }.
 *
 * `seenNonce(nonce)` is the single-use check, injected so the Amazon side can
 * back it with Firestore and the suite with a Set. It must return true if the
 * nonce was already used; a nonce is recorded by the CALLER after a successful
 * verification, not here — this function has no side effects.
 */
function verifyIntent(token, { key, now = Date.now, seenNonce = () => false }) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, payload: null, reason: "malformed" };

  let payloadText;
  let payload;
  try {
    payloadText = fromBase64url(parts[0]).toString("utf8");
    payload = JSON.parse(payloadText);
  } catch {
    return { ok: false, payload: null, reason: "malformed" };
  }

  const expected = sign(payloadText, key);
  const given = fromBase64url(parts[1]);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return { ok: false, payload: null, reason: "bad_signature" };
  }
  if (payload.v !== INTENT_VERSION) return { ok: false, payload: null, reason: "bad_version" };
  if (typeof payload.companyId !== "string" || !payload.companyId) return { ok: false, payload: null, reason: "no_company" };
  if (typeof payload.ownerUid !== "string" || !payload.ownerUid) return { ok: false, payload: null, reason: "no_owner" };
  if (typeof payload.nonce !== "string" || payload.nonce.length < 16) return { ok: false, payload: null, reason: "no_nonce" };
  const t = now();
  if (!Number.isFinite(payload.exp) || payload.exp < t) return { ok: false, payload, reason: "expired" };
  if (!Number.isFinite(payload.iat) || payload.iat > t + 60000) return { ok: false, payload, reason: "from_the_future" };
  if (payload.exp - payload.iat > INTENT_TTL_MS + 1000) return { ok: false, payload, reason: "ttl_too_long" };
  if (seenNonce(payload.nonce)) return { ok: false, payload, reason: "replayed" };
  return { ok: true, payload, reason: "" };
}

/**
 * The LWA `state`: bound to the intent so a consent that comes back can be
 * matched to the workspace that asked for it, and only that one. Opaque and
 * unforgeable — an HMAC over the nonce with the same key — so Amazon's
 * redirect cannot be pointed at somebody else's workspace by editing a query
 * string.
 */
function stateFor(nonce, key) {
  return base64url(sign(`state:${String(nonce)}`, key)).slice(0, 43);
}

module.exports = { INTENT_VERSION, INTENT_TTL_MS, mintIntent, verifyIntent, stateFor };

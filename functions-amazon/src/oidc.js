"use strict";

// Who is calling, and who we are when we call.
//
// Inbound: every non-browser request to this zone — the main project's admin
// calls, Cloud Scheduler's sync ticks — carries a Google-signed OIDC token.
// It is verified against the signing keys, the audience (this service's own
// URL) and ONE exact service-account email. Cloud Armor and the ingress
// setting decide who can reach the door; this decides who is let in.
//
// Outbound: the bridge call to the main project carries our own identity
// token, minted by the metadata server for the bridge URL as audience. The
// main project verifies it the same way, against amazon-sync@'s email.

const { OAuth2Client } = require("google-auth-library");

const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

/**
 * Builds a verifier for one caller identity and one audience.
 * `verifyIdToken` is injectable so the suite can drive it without Google.
 */
function createOidcVerifier({ allowedEmail, audience, verifyIdToken = null, logger = console }) {
  const email = String(allowedEmail || "").trim().toLowerCase();
  if (!email || !audience) throw new Error("oidc: allowedEmail and audience are required");
  const client = new OAuth2Client();
  const verify = verifyIdToken || (async (idToken) => {
    const ticket = await client.verifyIdToken({ idToken, audience });
    return ticket.getPayload();
  });

  return async function verifyRequest(headers = {}) {
    const header = String(headers.authorization || headers.Authorization || "");
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) return { ok: false, reason: "no_bearer" };
    let payload;
    try {
      payload = await verify(match[1]);
    } catch (error) {
      logger.warn?.(`oidc: token rejected (${String(error && error.message || error).slice(0, 80)})`);
      return { ok: false, reason: "invalid_token" };
    }
    const claimedEmail = String((payload && payload.email) || "").toLowerCase();
    if (!payload || payload.email_verified !== true || claimedEmail !== email) {
      logger.warn?.(`oidc: wrong identity (${claimedEmail || "none"})`);
      return { ok: false, reason: "wrong_identity" };
    }
    if (String(payload.aud || "") !== audience) return { ok: false, reason: "wrong_audience" };
    return { ok: true, email: claimedEmail };
  };
}

/** Our own identity token for an audience, from the metadata server, cached. */
function createIdentityTokenSource({ audience, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  let cached = { token: "", expiresAtMs: 0 };
  return async function identityToken() {
    if (cached.token && cached.expiresAtMs > now() + 60000) return cached.token;
    const url = `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}`;
    const response = await fetchImpl(url, { headers: { "Metadata-Flavor": "Google" } });
    if (!response.ok) throw new Error(`identity_token_http_${response.status}`);
    const token = (await response.text()).trim();
    if (!token) throw new Error("identity_token_empty");
    cached = { token, expiresAtMs: now() + 50 * 60 * 1000 };
    return token;
  };
}

module.exports = { createOidcVerifier, createIdentityTokenSource, METADATA_IDENTITY_URL };

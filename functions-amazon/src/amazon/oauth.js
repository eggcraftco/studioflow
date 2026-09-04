"use strict";

// Login with Amazon, which is where an Amazon connection begins and where its
// access token keeps coming from.
//
// Two token kinds, and only one of them is ours to keep. The refresh token
// arrives once, at consent, and lives sealed on the connection document. The
// access token lasts an hour, is fetched from the refresh token, and is never
// stored, never logged and never sent to a client — §12 of the spec makes each
// of those a hard rule rather than a preference.
//
// Pure except for the fetch that is handed in.

/** Login with Amazon. One host for every region; the SP-API host is the regional one. */
const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

/** Where a seller is sent to consent. Region decides the Seller Central host. */
const SELLER_CENTRAL_CONSENT_PATH = "/apps/authorize/consent";

class AmazonAuthError extends Error {
  constructor(message, status = 0, code = "") {
    super(message);
    this.name = "AmazonAuthError";
    this.status = status;
    this.code = code;
    // Consent that has been withdrawn, or a client secret that is wrong, is not
    // something a retry fixes. The retry policy reads this.
    this.errorClass = status === 400 || status === 401 ? "auth" : status >= 500 ? "transient" : "unknown";
  }
}

/**
 * The URL a seller is sent to.
 *
 * `state` is mandatory and is checked when Amazon sends the seller back; an
 * authorization result without one, or with one we did not mint, is somebody
 * else's consent being pointed at this workspace.
 */
function consentUrl({ sellerCentralHost, applicationId, state, draft = false }) {
  const url = new URL(`https://${sellerCentralHost}${SELLER_CENTRAL_CONSENT_PATH}`);
  url.searchParams.set("application_id", String(applicationId || ""));
  url.searchParams.set("state", String(state || ""));
  // A draft application can only be authorised in draft mode; a published one
  // must not send this at all, or Amazon refuses the consent.
  if (draft) url.searchParams.set("version", "beta");
  return url.toString();
}

async function lwaPost(body, { fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(LWA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
      redirect: "manual"
    });
  } catch (error) {
    throw new AmazonAuthError(`amazon_lwa_unreachable: ${String(error?.message || error).slice(0, 120)}`, 0);
  } finally {
    clearTimeout(timer);
  }
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const code = String(data?.error || "").slice(0, 60);
    // The description can quote the credential back at us. Only the code.
    throw new AmazonAuthError(`amazon_lwa_http_${response.status}${code ? `: ${code}` : ""}`, response.status, code);
  }
  return data;
}

/** Consent → the refresh token we keep. Called once, at connect. */
async function exchangeAuthorizationCode({ code, clientId, clientSecret, redirectUri, fetchImpl, timeoutMs }) {
  const data = await lwaPost({
    grant_type: "authorization_code",
    code: String(code || ""),
    client_id: String(clientId || ""),
    client_secret: String(clientSecret || ""),
    ...(redirectUri ? { redirect_uri: String(redirectUri) } : {})
  }, { fetchImpl, timeoutMs });
  const refreshToken = String(data.refresh_token || "");
  if (!refreshToken) throw new AmazonAuthError("amazon_lwa_no_refresh_token", 400, "no_refresh_token");
  return {
    refreshToken,
    accessToken: String(data.access_token || ""),
    expiresInSeconds: Number(data.expires_in) || 3600
  };
}

/** The refresh token → an access token. Called on every sync, kept nowhere. */
async function accessTokenFromRefresh({ refreshToken, clientId, clientSecret, fetchImpl, timeoutMs }) {
  const data = await lwaPost({
    grant_type: "refresh_token",
    refresh_token: String(refreshToken || ""),
    client_id: String(clientId || ""),
    client_secret: String(clientSecret || "")
  }, { fetchImpl, timeoutMs });
  const accessToken = String(data.access_token || "");
  if (!accessToken) throw new AmazonAuthError("amazon_lwa_no_access_token", 400, "no_access_token");
  return { accessToken, expiresInSeconds: Number(data.expires_in) || 3600 };
}

module.exports = {
  LWA_TOKEN_URL, SELLER_CENTRAL_CONSENT_PATH, AmazonAuthError,
  consentUrl, exchangeAuthorizationCode, accessTokenFromRefresh
};

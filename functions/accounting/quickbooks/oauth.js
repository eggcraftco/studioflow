"use strict";

// Intuit OAuth 2.0 (verified against the developer portal on 2 Sep 2026):
//   authorize  https://appcenter.intuit.com/connect/oauth2
//   token      POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer   (Basic client_id:client_secret)
//   revoke     POST https://developer.api.intuit.com/v2/oauth2/tokens/revoke   (Basic, {"token": …})
// The callback carries code, state and realmId. Access tokens live an hour;
// refresh tokens roll for 100 days and MAY CHANGE ON EVERY REFRESH — the
// latest one is always the one to keep.

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const SCOPE_ACCOUNTING = "com.intuit.quickbooks.accounting";

class QuickBooksOAuthError extends Error {
  constructor(message, { status = 0, code = "", detail = "" } = {}) {
    super(message);
    this.name = "QuickBooksOAuthError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    // invalid_grant / invalid_client are the user's problem to fix by reconnecting.
    this.errorClass = status === 401 || code === "invalid_grant" || code === "invalid_client" ? "auth"
      : status === 429 || status >= 500 ? "transient"
      : status ? "validation" : "unknown";
  }
}

function authorizeUrl({ clientId, redirectUri, state, scope = SCOPE_ACCOUNTING }) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", String(clientId || ""));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", String(scope || SCOPE_ACCOUNTING));
  url.searchParams.set("redirect_uri", String(redirectUri || ""));
  url.searchParams.set("state", String(state || ""));
  return url.toString();
}

function basicAuth(clientId, clientSecret) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

async function tokenRequest({ clientId, clientSecret, form, fetchImpl = globalThis.fetch, now = Date.now }) {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(clientId, clientSecret),
      "x-include-refresh-token-hard-expires-in": "true"
    },
    body: new URLSearchParams(form).toString()
  });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  if (!response.ok) {
    throw new QuickBooksOAuthError(`intuit_token_${response.status}`, {
      status: response.status, code: String(json.error || ""), detail: String(json.error_description || text || "").slice(0, 300)
    });
  }
  const accessToken = String(json.access_token || "");
  const refreshToken = String(json.refresh_token || "");
  if (!accessToken || !refreshToken) throw new QuickBooksOAuthError("intuit_token_incomplete", { status: 200, code: "incomplete" });
  const issuedAt = now();
  return {
    accessToken,
    refreshToken,
    expiresAtMs: issuedAt + Math.max(60, Number(json.expires_in) || 3600) * 1000,
    refreshExpiresAtMs: issuedAt + Math.max(60, Number(json.x_refresh_token_expires_in) || 8640000) * 1000,
    refreshHardExpiresAtMs: json.x_refresh_token_hard_expires_in ? issuedAt + Number(json.x_refresh_token_hard_expires_in) * 1000 : 0,
    tokenType: String(json.token_type || "bearer")
  };
}

async function exchangeCode({ clientId, clientSecret, code, redirectUri, fetchImpl, now }) {
  return tokenRequest({ clientId, clientSecret, fetchImpl, now, form: { grant_type: "authorization_code", code: String(code || ""), redirect_uri: String(redirectUri || "") } });
}

async function refreshTokens({ clientId, clientSecret, refreshToken, fetchImpl, now }) {
  return tokenRequest({ clientId, clientSecret, fetchImpl, now, form: { grant_type: "refresh_token", refresh_token: String(refreshToken || "") } });
}

// Revoking the refresh token disconnects the company from the app; 200 is done,
// anything else is reported so the caller can still forget the tokens locally.
async function revokeToken({ clientId, clientSecret, token, fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(REVOKE_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
    body: JSON.stringify({ token: String(token || "") })
  });
  return response.ok;
}

module.exports = { AUTHORIZE_URL, TOKEN_URL, REVOKE_URL, SCOPE_ACCOUNTING, QuickBooksOAuthError, authorizeUrl, exchangeCode, refreshTokens, revokeToken };

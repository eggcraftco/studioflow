"use strict";

// eBay's OAuth authorization-code grant for a server-held confidential client.
//
// Facts this module is built on (developer.ebay.com, captured 6 Sep 2026 —
// docs/ebay-connector-design.md §1):
//   * authorize: https://auth.ebay.com/oauth2/authorize (sandbox
//     auth.sandbox.ebay.com) with client_id, response_type=code,
//     redirect_uri=<RuName>, scope=<space-separated, URL-encoded>, state.
//     The redirect_uri is NOT a URL: eBay hands out a RuName per keyset.
//   * token: POST https://api.ebay.com/identity/v1/oauth2/token (sandbox
//     api.sandbox.ebay.com) with HTTP Basic client credentials and a form body.
//     Access tokens live ~2 h (expires_in 7200), refresh tokens ~18 months
//     (refresh_token_expires_in 47304000).
//   * refresh: grant_type=refresh_token with a scope list that must be equal
//     to or a subset of the consented set — we send exactly the granted set.
//   * identity: GET https://apiz.ebay.com/commerce/identity/v1/user/ — only
//     userId, username, accountType, registrationMarketplaceId leave here.
//   * errors: the body's `error` field decides the class, never the status
//     alone. invalid_grant (400) is the seller's problem; invalid_client (401
//     or 400) is OUR keyset and must not mark anybody reconnect_required.
//
// Sandbox and production are two hosts that must never be mixed: the
// environment is configuration, sandbox by default, threaded through every URL.
// Read-only scopes only. Pure apart from the injected fetch.

const HOSTS = Object.freeze({
  sandbox: Object.freeze({ auth: "https://auth.sandbox.ebay.com", api: "https://api.sandbox.ebay.com", apiz: "https://apiz.sandbox.ebay.com" }),
  production: Object.freeze({ auth: "https://auth.ebay.com", api: "https://api.ebay.com", apiz: "https://apiz.ebay.com" })
});

/** The two scopes this half asks for — nothing that can write. */
const SCOPES = Object.freeze([
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly"
]);
/** The application (client-credentials) scope: signing keys for notifications only. */
const APP_SCOPE = "https://api.ebay.com/oauth/api_scope";

const TOKEN_PATH = "/identity/v1/oauth2/token";
const IDENTITY_PATH = "/commerce/identity/v1/user/";
const DEFAULT_ACCESS_TTL_SEC = 7200;
const DEFAULT_REFRESH_TTL_SEC = 47304000;

function ebayEnvironment(value) { return String(value || "").trim().toLowerCase() === "production" ? "production" : "sandbox"; }
function hostsFor(environment) { return HOSTS[ebayEnvironment(environment)]; }

/**
 * The consent URL. Built by hand: eBay's examples encode the scope separator
 * as %20, and URLSearchParams would emit "+" — which is pinned out by the test.
 */
function authorizeUrl({ environment, clientId, ruName, state, scopes = SCOPES }) {
  const list = Array.isArray(scopes) && scopes.length ? scopes : SCOPES;
  const query = [
    `client_id=${encodeURIComponent(String(clientId || ""))}`,
    "response_type=code",
    `redirect_uri=${encodeURIComponent(String(ruName || ""))}`,
    `scope=${list.map((s) => encodeURIComponent(String(s))).join("%20")}`,
    `state=${encodeURIComponent(String(state || ""))}`
  ];
  return `${hostsFor(environment).auth}/oauth2/authorize?${query.join("&")}`;
}

// §14.1 pins the MESSAGE of every EbayOAuthError to a closed shape, because one
// log line in `ebayConnector.js` is allowed to print it (§5.4, *Logging*) and a
// comment is not a guarantee. Two constructors used to interpolate a FOREIGN
// caught error's message into it — under undici those read "fetch failed" or
// "terminated" and carried nothing, so it was never a live leak, but the thing
// protecting the one open log line has to be a test, in a file whose comments
// are the thing under review. So: eBay's own `error` code, lowercased and
// stripped to `[a-z_]`, or the caught error's NAME stripped to letters. Nothing
// else reaches a message, and `messageIsSafe` is what the pin runs.
const MESSAGE_SHAPE = /^ebay_(oauth|identity)_(http_\d{3}(: [a-z_]{0,60})?|fetch_failed(: [A-Za-z]{0,40})?)$/;
// ACCEPT-OR-DROP, never strip: stripping the disallowed characters out of
// `invalid_grant "AUTHCODE-…"` leaves a mangled copy of the value that still
// matches the shape, which the pin caught the first time this was written. A
// value that is not already a bare OAuth error code contributes nothing.
const errorWord = (value) => { const word = String(value == null ? "" : value).trim(); return /^[a-z_]{1,60}$/.test(word) ? word : ""; };
const errorName = (error) => { const name = String(error?.name || ""); return /^[A-Za-z]{1,40}$/.test(name) ? name : "Error"; };
const withWord = (stem, word) => (word ? `${stem}: ${word}` : stem);
function messageIsSafe(message) { return MESSAGE_SHAPE.test(String(message || "")); }

class EbayOAuthError extends Error {
  constructor(message, { status = 0, code = "", errorClass = "unknown", body = null } = {}) {
    super(message);
    this.name = "EbayOAuthError";
    this.status = Number(status) || 0;
    this.code = String(code || "");
    this.errorClass = errorClass;
    this.body = body;
  }
}

/**
 * What a token-endpoint answer means — by BODY first, status second (§6).
 *
 *   invalid_grant                                  → auth        (seller: reconnect)
 *   invalid_client / unauthorized_client /
 *   invalid_scope                                  → permission  (us: app_credentials_invalid)
 *   429 / 5xx / no status (network)                → transient
 *   400 with any other error (invalid_request …)   → validation  (us: token_request_invalid)
 *   401 without a body error                       → auth
 */
function classifyTokenError(status, body) {
  const code = String((body && typeof body === "object" && body.error) || "").trim().toLowerCase();
  const http = Number(status) || 0;
  if (code === "invalid_grant") return { errorClass: "auth", code: "invalid_grant" };
  if (["invalid_client", "unauthorized_client", "invalid_scope"].includes(code)) return { errorClass: "permission", code: "app_credentials_invalid" };
  if (http === 429 || http >= 500 || http === 0) return { errorClass: "transient", code: http === 429 ? "rate_limited" : "provider_unavailable" };
  if (http === 401) return { errorClass: "auth", code: "invalid_grant" };
  if (http === 400 || http === 422) return { errorClass: "validation", code: "token_request_invalid" };
  if (http === 403) return { errorClass: "permission", code: "permission_missing" };
  return { errorClass: "unknown", code: code || `http_${http}` };
}

function basicAuth(clientId, clientSecret) {
  return "Basic " + Buffer.from(`${String(clientId || "")}:${String(clientSecret || "")}`, "utf8").toString("base64");
}

async function tokenRequest({ environment, clientId, clientSecret, form, fetchImpl = globalThis.fetch, timeoutMs = 20000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${hostsFor(environment).api}${TOKEN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: form.toString(), signal: controller.signal, redirect: "manual"
    });
  } catch (error) {
    throw new EbayOAuthError(withWord("ebay_oauth_fetch_failed", errorName(error)), { status: 0, errorClass: "transient", code: "provider_unavailable" });
  } finally { clearTimeout(timer); }
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const verdict = classifyTokenError(response.status, data);
    throw new EbayOAuthError(withWord(`ebay_oauth_http_${response.status}`, errorWord(data?.error)), { status: response.status, code: verdict.code, errorClass: verdict.errorClass, body: { error: String(data?.error || ""), error_description: String(data?.error_description || "").slice(0, 200) } });
  }
  return data;
}

/** One code, one exchange. The RuName goes back as redirect_uri, verbatim. */
async function exchangeCode({ environment, clientId, clientSecret, code, ruName, fetchImpl }) {
  const form = new URLSearchParams();
  form.set("grant_type", "authorization_code");
  form.set("code", String(code || ""));
  form.set("redirect_uri", String(ruName || ""));
  return tokenRequest({ environment, clientId, clientSecret, form, fetchImpl });
}

/** A new access token from the refresh token, asking for exactly the granted scopes. */
async function refreshToken({ environment, clientId, clientSecret, refreshToken: token, scopes = SCOPES, fetchImpl }) {
  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", String(token || ""));
  form.set("scope", (Array.isArray(scopes) && scopes.length ? scopes : SCOPES).join(" "));
  return tokenRequest({ environment, clientId, clientSecret, form, fetchImpl });
}

/** The application token (client credentials) — used only to fetch notification signing keys; held in memory by the caller. */
async function appToken({ environment, clientId, clientSecret, fetchImpl }) {
  const form = new URLSearchParams();
  form.set("grant_type", "client_credentials");
  form.set("scope", APP_SCOPE);
  return tokenRequest({ environment, clientId, clientSecret, form, fetchImpl });
}

/**
 * When the tokens in a token-endpoint answer run out, as absolute times.
 * eBay states both TTLs in seconds; the documented defaults stand in when a
 * field is missing so a box never carries an expiry of 0.
 */
function tokenExpiryOf(data, nowMs) {
  const now = Number(nowMs) || Date.now();
  const access = Number(data?.expires_in);
  const refresh = Number(data?.refresh_token_expires_in);
  return {
    accessTokenExpiresAtMs: now + (Number.isFinite(access) && access > 0 ? access : DEFAULT_ACCESS_TTL_SEC) * 1000,
    refreshTokenExpiresAtMs: data?.refresh_token ? now + (Number.isFinite(refresh) && refresh > 0 ? refresh : DEFAULT_REFRESH_TTL_SEC) * 1000 : 0
  };
}

/**
 * Who this token belongs to, from eBay — never from the callback URL.
 *
 * Only four fields leave: the seller's own name, email and address inside
 * individualAccount / businessAccount are dropped HERE, so no caller can store
 * them by accident. A 403 means the identity scope was not granted → no_seller.
 */
async function fetchIdentity({ environment, accessToken, fetchImpl = globalThis.fetch, timeoutMs = 20000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${hostsFor(environment).apiz}${IDENTITY_PATH}`, {
      method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` }, signal: controller.signal, redirect: "manual"
    });
  } catch (error) {
    throw new EbayOAuthError(withWord("ebay_identity_fetch_failed", errorName(error)), { status: 0, errorClass: "transient", code: "provider_unavailable" });
  } finally { clearTimeout(timer); }
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (response.status === 401) throw new EbayOAuthError("ebay_identity_http_401", { status: 401, errorClass: "auth", code: "invalid_grant" });
  if (response.status === 403) throw new EbayOAuthError("ebay_identity_http_403", { status: 403, errorClass: "permission", code: "no_seller" });
  if (!response.ok) throw new EbayOAuthError(`ebay_identity_http_${response.status}`, { status: response.status, errorClass: response.status >= 500 || response.status === 429 ? "transient" : "unknown", code: "identity_failed" });
  return identityOf(data);
}

/** The four fields of an identity answer that may be kept. */
function identityOf(data) {
  const text = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
  return {
    userId: text(data?.userId, 120),
    username: text(data?.username, 120),
    accountType: text(data?.accountType, 40),
    registrationMarketplaceId: text(data?.registrationMarketplaceId, 40)
  };
}

module.exports = {
  HOSTS, SCOPES, APP_SCOPE, TOKEN_PATH, IDENTITY_PATH, DEFAULT_ACCESS_TTL_SEC, DEFAULT_REFRESH_TTL_SEC,
  ebayEnvironment, hostsFor, authorizeUrl, classifyTokenError, basicAuth, exchangeCode, refreshToken, appToken, tokenExpiryOf, fetchIdentity, identityOf, EbayOAuthError,
  MESSAGE_SHAPE, messageIsSafe
};

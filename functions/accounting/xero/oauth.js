"use strict";

// Xero OAuth 2.0 (verified against developer.xero.com on 3 Sep 2026):
//   authorize   https://login.xero.com/identity/connect/authorize
//   token       POST https://identity.xero.com/connect/token        (Basic client_id:client_secret)
//   revoke      POST https://identity.xero.com/connect/revocation   (Basic, form token=<refresh_token>)
//   tenants     GET  https://api.xero.com/connections[?authEventId=] (Bearer) → the organisations this user let the app see
//   remove one  DELETE https://api.xero.com/connections/{connectionId}
// Access tokens live 30 minutes (a JWT carrying authentication_event_id and the
// granted scope list); refresh tokens live 60 days and ROTATE ON EVERY REFRESH —
// the previous one stays usable for a 30-minute grace only, so both new tokens
// are written atomically and the refresh is serialised per grant.

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const REVOKE_URL = "https://identity.xero.com/connect/revocation";
const CONNECTIONS_URL = "https://api.xero.com/connections";

// XR §3.1 — the scope registry. Granular scopes only (the broad
// accounting.transactions family retires in September 2027 and is never used
// here). Read-only setup asks for the read set; a write phase re-consents with
// the write set. accounting.journals.read is a premium-tier scope and is not
// requested; manual journals are a separate, later decision.
const SCOPE_SETS = Object.freeze({
  identity: ["openid", "profile", "email", "offline_access"],
  read: ["accounting.settings.read", "accounting.contacts.read", "accounting.invoices.read", "accounting.payments.read", "accounting.banktransactions.read", "accounting.attachments.read"],
  write: ["accounting.settings.read", "accounting.contacts", "accounting.invoices", "accounting.payments", "accounting.banktransactions", "accounting.attachments"],
  manualJournals: ["accounting.manualjournals"]
});

function scopesFor(level = "read", { manualJournals = false } = {}) {
  const set = new Set(SCOPE_SETS.identity);
  for (const scope of level === "write" ? SCOPE_SETS.write : SCOPE_SETS.read) set.add(scope);
  if (manualJournals) for (const scope of SCOPE_SETS.manualJournals) set.add(scope);
  return Array.from(set);
}

class XeroOAuthError extends Error {
  constructor(message, { status = 0, code = "", detail = "" } = {}) {
    super(message);
    this.name = "XeroOAuthError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.errorClass = status === 401 || code === "invalid_grant" || code === "invalid_client" ? "auth"
      : status === 429 || status >= 500 ? "transient"
      : status ? "validation" : "unknown";
  }
}

function authorizeUrl({ clientId, redirectUri, state, scopes = scopesFor("read") }) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", String(clientId || ""));
  url.searchParams.set("redirect_uri", String(redirectUri || ""));
  url.searchParams.set("scope", (Array.isArray(scopes) ? scopes : String(scopes || "").split(/\s+/)).filter(Boolean).join(" "));
  url.searchParams.set("state", String(state || ""));
  return url.toString();
}

function basicAuth(clientId, clientSecret) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

// The access token is a JWT; its payload names the consent event and the scopes
// that were actually granted. No signature check is needed for those two reads:
// the token came straight from Xero's token endpoint over TLS.
function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return {};
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(json);
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

async function tokenRequest({ clientId, clientSecret, form, fetchImpl = globalThis.fetch, now = Date.now }) {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth(clientId, clientSecret) },
    body: new URLSearchParams(form).toString()
  });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  if (!response.ok) {
    throw new XeroOAuthError(`xero_token_${response.status}`, { status: response.status, code: String(json.error || ""), detail: String(json.error_description || text || "").slice(0, 300) });
  }
  const accessToken = String(json.access_token || "");
  const refreshToken = String(json.refresh_token || "");
  if (!accessToken) throw new XeroOAuthError("xero_token_incomplete", { status: 200, code: "incomplete" });
  const issuedAt = now();
  const payload = decodeJwtPayload(accessToken);
  return {
    accessToken,
    refreshToken,
    idToken: String(json.id_token || ""),
    expiresAtMs: issuedAt + Math.max(60, Number(json.expires_in) || 1800) * 1000,
    refreshExpiresAtMs: refreshToken ? issuedAt + 60 * 24 * 60 * 60 * 1000 : 0,
    tokenType: String(json.token_type || "Bearer"),
    scopes: Array.isArray(payload.scope) ? payload.scope.map(String) : String(json.scope || "").split(/\s+/).filter(Boolean),
    authenticationEventId: String(payload.authentication_event_id || ""),
    xeroUserId: String(payload.xero_userid || "")
  };
}

async function exchangeCode({ clientId, clientSecret, code, redirectUri, fetchImpl, now }) {
  return tokenRequest({ clientId, clientSecret, fetchImpl, now, form: { grant_type: "authorization_code", code: String(code || ""), redirect_uri: String(redirectUri || "") } });
}

async function refreshTokens({ clientId, clientSecret, refreshToken, fetchImpl, now }) {
  return tokenRequest({ clientId, clientSecret, fetchImpl, now, form: { grant_type: "refresh_token", refresh_token: String(refreshToken || "") } });
}

// Which organisations this consent covers. authEventId narrows the list to the
// tenants the user just picked on Xero's own screen (XR §6 step 2).
async function listConnections({ accessToken, authEventId = "", fetchImpl = globalThis.fetch }) {
  const url = new URL(CONNECTIONS_URL);
  if (authEventId) url.searchParams.set("authEventId", String(authEventId));
  const response = await fetchImpl(url.toString(), { method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${String(accessToken || "")}` } });
  const text = await response.text();
  let json = [];
  try { json = text ? JSON.parse(text) : []; } catch { json = []; }
  if (!response.ok) throw new XeroOAuthError(`xero_connections_${response.status}`, { status: response.status, detail: String(text || "").slice(0, 300) });
  return (Array.isArray(json) ? json : []).map((row) => ({
    xeroConnectionId: String(row.id || ""),
    authEventId: String(row.authEventId || ""),
    tenantId: String(row.tenantId || ""),
    tenantType: String(row.tenantType || ""),
    tenantName: String(row.tenantName || ""),
    createdDateUtc: String(row.createdDateUtc || ""),
    updatedDateUtc: String(row.updatedDateUtc || "")
  }));
}

async function removeConnection({ accessToken, xeroConnectionId, fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(`${CONNECTIONS_URL}/${encodeURIComponent(String(xeroConnectionId || ""))}`, { method: "DELETE", headers: { Authorization: `Bearer ${String(accessToken || "")}` } });
  return response.ok || response.status === 404;
}

// Revoking the refresh token removes every connection of that user to the app.
async function revokeToken({ clientId, clientSecret, token, fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth(clientId, clientSecret) },
    body: new URLSearchParams({ token: String(token || "") }).toString()
  });
  return response.ok;
}

module.exports = { AUTHORIZE_URL, TOKEN_URL, REVOKE_URL, CONNECTIONS_URL, SCOPE_SETS, scopesFor, XeroOAuthError, authorizeUrl, decodeJwtPayload, exchangeCode, refreshTokens, listConnections, removeConnection, revokeToken };

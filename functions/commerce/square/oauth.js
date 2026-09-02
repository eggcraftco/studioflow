// SQ-AUTH — Square's OAuth code flow for a server-held confidential client.
// The application secret is only ever sent from here to Square; the browser
// sees the authorize URL and a state, nothing else (SQ-AUTH-004/005).
// Production and Sandbox are two hosts that must never be mixed (SQ-AUTH-009):
// the environment is chosen once, by configuration, and threads through
// every URL this module builds.
const SQUARE_API_VERSION = "2026-08-19";   // SQ-VER-001: pinned, bumped only through the fixture suite
const HOSTS = Object.freeze({ production: "https://connect.squareup.com", sandbox: "https://connect.squareupsandbox.com" });
const APP_HOSTS = Object.freeze({ production: "https://app.squareup.com", sandbox: "https://app.squareupsandbox.com" });

/** SQ-AUTH-011 — read-first: the scopes Faz 1–3 need and not one more. */
const READ_SCOPES = Object.freeze([
  "MERCHANT_PROFILE_READ", "ORDERS_READ", "PAYMENTS_READ", "CUSTOMERS_READ", "ITEMS_READ", "INVENTORY_READ", "PAYOUTS_READ"
]);

function squareEnvironment(value) { return String(value || "").trim().toLowerCase() === "sandbox" ? "sandbox" : "production"; }
function squareHost(environment) { return HOSTS[squareEnvironment(environment)]; }

/** The consent URL the merchant is sent to. `session=false` so a shared machine logs in fresh. */
function squareAuthorizeUrl({ environment, applicationId, state, scopes = READ_SCOPES, locale = null }) {
  const url = new URL(`${squareHost(environment)}/oauth2/authorize`);
  url.searchParams.set("client_id", String(applicationId));
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("session", "false");
  url.searchParams.set("state", String(state));
  if (locale) url.searchParams.set("locale", locale);
  return url.toString();
}

class SquareOAuthError extends Error {
  constructor(message, status, code = "") { super(message); this.name = "SquareOAuthError"; this.status = status; this.code = code; }
}

async function tokenRequest({ environment, fetchImpl = globalThis.fetch, body, timeoutMs = 20000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${squareHost(environment)}/oauth2/token`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "Square-Version": SQUARE_API_VERSION },
      body: JSON.stringify(body), signal: controller.signal, redirect: "manual"
    });
  } catch (error) {
    throw new SquareOAuthError(`square_oauth_fetch_failed: ${String(error?.message || error).slice(0, 120)}`, 0);
  } finally { clearTimeout(timer); }
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const first = Array.isArray(data?.errors) ? data.errors[0] : null;
    throw new SquareOAuthError(`square_oauth_http_${response.status}: ${String(first?.code || data?.error || "").slice(0, 80)}`, response.status, String(first?.code || data?.error || ""));
  }
  return data;
}

/** SQ-AUTH-003 — one code, one exchange; Square refuses a second use itself. */
async function exchangeAuthorizationCode({ environment, applicationId, applicationSecret, code, redirectUri, fetchImpl }) {
  return tokenRequest({ environment, fetchImpl, body: {
    client_id: applicationId, client_secret: applicationSecret, code, grant_type: "authorization_code",
    ...(redirectUri ? { redirect_uri: redirectUri } : {})
  } });
}

/** SQ-AUTH-006 — a new access token from the refresh token, before the old one expires. */
async function refreshAccessToken({ environment, applicationId, applicationSecret, refreshToken, fetchImpl }) {
  return tokenRequest({ environment, fetchImpl, body: { client_id: applicationId, client_secret: applicationSecret, refresh_token: refreshToken, grant_type: "refresh_token" } });
}

/** SQ-SEC-008 — disconnect revokes at Square, not just here. */
async function revokeToken({ environment, applicationId, applicationSecret, accessToken = null, merchantId = null, fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(`${squareHost(environment)}/oauth2/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "Square-Version": SQUARE_API_VERSION, Authorization: `Client ${applicationSecret}` },
    body: JSON.stringify({ client_id: applicationId, ...(accessToken ? { access_token: accessToken } : {}), ...(merchantId ? { merchant_id: merchantId } : {}) }),
    redirect: "manual"
  });
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  return { ok: response.ok && data?.success !== false, status: response.status };
}

/** SQ-AUTH-010 — what this token is: merchant, scopes, expiry — from Square, not from the callback. */
async function tokenStatus({ environment, accessToken, fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(`${squareHost(environment)}/oauth2/token/status`, {
    method: "POST", headers: { Accept: "application/json", "Square-Version": SQUARE_API_VERSION, Authorization: `Bearer ${accessToken}` }, redirect: "manual"
  });
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new SquareOAuthError(`square_token_status_http_${response.status}`, response.status);
  return { merchantId: String(data?.merchant_id || ""), scopes: Array.isArray(data?.scopes) ? data.scopes.map(String) : [], expiresAt: data?.expires_at || null, clientId: String(data?.client_id || "") };
}

/** The merchant-facing Dashboard link for an order (SQ-UX "Open in Square"). */
function squareOrderAdminUrl(environment, orderId) {
  return orderId ? `${APP_HOSTS[squareEnvironment(environment)]}/dashboard/orders/overview/${encodeURIComponent(orderId)}` : null;
}

module.exports = { SQUARE_API_VERSION, READ_SCOPES, HOSTS, squareEnvironment, squareHost, squareAuthorizeUrl, exchangeAuthorizationCode, refreshAccessToken, revokeToken, tokenStatus, squareOrderAdminUrl, SquareOAuthError };

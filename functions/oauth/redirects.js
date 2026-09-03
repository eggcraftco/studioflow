"use strict";

// Where an authorization code is allowed to go.
//
// This is the whole of the OAuth threat model in one file. A client asks for a
// code and names a destination; if nobody checks that destination against
// something the client registered in advance, then a link on the real
// nivadesk.app domain — with a real consent screen the user recognises — hands
// the code to whoever wrote the link. PKCE does not help: the attacker
// generates the challenge. Comparing the destination to "the destination we
// stored from this same request" does not help either; it is self-consistent by
// construction.
//
// So: registration writes the allowed destinations down, and every step that
// can mint or redeem a code compares against what was written.

/**
 * The canonical form of a redirect URI, or "" if it is not one we will accept.
 *
 * Both sides of every comparison go through this, so the comparison can be a
 * plain string equality — no prefix matching, which is how open redirects get
 * in through a path the registrant did not intend.
 *
 * Plain http is refused except on the loopback host, which is where a desktop
 * client's local callback lives and where https cannot be had. `localhost` is
 * not a normal hostname here: it resolves on the victim's own machine, so a
 * code sent there did not leave it.
 */
function normalizeRedirectUri(value, { allowInsecure = false } = {}) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    return "";
  }
  if (url.protocol === "https:") return url.toString();
  if (url.protocol !== "http:") return "";
  const host = url.hostname.toLowerCase();
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  return loopback || allowInsecure ? url.toString() : "";
}

/** The registered list, cleaned. Anything unusable is dropped rather than
 *  stored, so a stored list never contains something we would refuse anyway. */
function normalizeRegisteredUris(values, options = {}) {
  const list = Array.isArray(values) ? values : [];
  const seen = new Set();
  const out = [];
  for (const value of list) {
    const clean = normalizeRedirectUri(value, options);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 20) break;
  }
  return out;
}

/**
 * Whether this destination is one the client registered.
 *
 * Exact match on the canonical form. A registered `https://a.example/cb` does
 * NOT admit `https://a.example/cb/x`, `https://a.example/cb?x=1`, or
 * `https://evil.example/?x=https://a.example/cb` — all three are how this check
 * is usually got around when it is written as a prefix or a substring test.
 */
function isRegisteredRedirectUri(registered, candidate, options = {}) {
  const clean = normalizeRedirectUri(candidate, options);
  if (!clean) return false;
  return normalizeRegisteredUris(registered, options).includes(clean);
}

/** What a registration record looks like on disk. */
function clientRecord({ clientId, redirectUris, clientName, scope, tokenEndpointAuthMethod, grantTypes, responseTypes }, options = {}) {
  return {
    clientId: String(clientId || ""),
    redirectUris: normalizeRegisteredUris(redirectUris, options),
    clientName: String(clientName || "ChatGPT").slice(0, 200),
    scope: String(scope || "").slice(0, 500),
    tokenEndpointAuthMethod: String(tokenEndpointAuthMethod || "none").slice(0, 60),
    grantTypes: Array.isArray(grantTypes) && grantTypes.length ? grantTypes.slice(0, 10) : ["authorization_code"],
    responseTypes: Array.isArray(responseTypes) && responseTypes.length ? responseTypes.slice(0, 10) : ["code"]
  };
}

/** The host a person should be shown on the consent screen. */
function redirectHost(value) {
  const clean = normalizeRedirectUri(value, { allowInsecure: true });
  if (!clean) return "";
  try {
    return new URL(clean).host;
  } catch (_) {
    return "";
  }
}

module.exports = {
  normalizeRedirectUri,
  normalizeRegisteredUris,
  isRegisteredRedirectUri,
  clientRecord,
  redirectHost
};

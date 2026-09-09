// WOO-003 — a store URL a merchant typed, made safe before anything talks to
// it: https only, a public host, no path or query, no credentials, no port
// games. The DNS-level check (a public name resolving to a private address)
// is the connect function's job, because it needs to resolve.
// The ranges themselves live in security/privateAddress.js — one table, used
// by this, by the Woo client's per-request DNS check, and by the
// caller-supplied-URL fetch. This module keeps only the URL-shape rules.
const { isPrivateAddress } = require("../../security/privateAddress");

function normalizeWooSiteUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) return { ok: false, reason: "empty" };
  if (!/^[a-z]+:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try { url = new URL(raw); } catch { return { ok: false, reason: "invalid" }; }
  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };
  if (url.username || url.password) return { ok: false, reason: "credentials_in_url" };
  if (url.port && url.port !== "443") return { ok: false, reason: "port" };
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") || host === "metadata.google.internal") return { ok: false, reason: "private_host" };
  if (host.startsWith("[") || /^[0-9a-f:]+$/i.test(host) && host.includes(":")) return { ok: false, reason: "ip_literal" };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return { ok: false, reason: isPrivateAddress(host) ? "private_ip" : "ip_literal" };
  if (!host.includes(".")) return { ok: false, reason: "not_a_domain" };
  // A store may live under a path (example.com/shop); keep that, drop the rest.
  const path = url.pathname.replace(/\/+$/, "").replace(/\/wp-json.*$/, "").replace(/\/wc-auth.*$/, "");
  return { ok: true, siteUrl: `https://${host}${path}`, host };
}

/** The Application Authentication URL the merchant approves at (WOO-001). */
function wooAuthorizeUrl(siteUrl, { appName, userId, returnUrl, callbackUrl, scope = "read_write" }) {
  const url = new URL(`${siteUrl}/wc-auth/v1/authorize`);
  url.searchParams.set("app_name", appName);
  url.searchParams.set("scope", scope);
  url.searchParams.set("user_id", userId);
  url.searchParams.set("return_url", returnUrl);
  url.searchParams.set("callback_url", callbackUrl);
  return url.toString();
}

module.exports = { normalizeWooSiteUrl, isPrivateAddress, wooAuthorizeUrl };

// The WooCommerce REST client (wc/v3), with fetch injected so the suite can
// drive it without a store. Basic auth over HTTPS with the consumer pair;
// pagination by X-WP-TotalPages; every non-2xx becomes an error that carries
// the status, so the retry policy can classify it (§5.5).
const { resolvePublicAddresses } = require("../../security/privateAddress");

const DEFAULT_PER_PAGE = 50;

/**
 * Refuses a host that resolves somewhere private, on every request.
 *
 * The URL check runs when the merchant types it and the DNS check runs once, at
 * connect. Neither runs again — so a store domain later repointed at 10.x, at
 * 127.0.0.1 or at the cloud metadata service kept receiving authenticated
 * requests from the fifteen-minute reconcile job, with our credentials, for as
 * long as the connection lived. Checked here because here is where every
 * outbound request goes.
 *
 * The rule and the address ranges now live in security/privateAddress.js, so
 * that this and the caller-supplied-URL fetch in security/remoteFetch.js are
 * one implementation rather than three. This is the WooCommerce wrapper around
 * it: same behaviour, same two error strings, resolution still per request and
 * never cached.
 */
async function assertPublicHost(host, resolve = undefined) {
  try {
    await resolvePublicAddresses(host, resolve ? { resolve } : {});
  } catch (error) {
    if (error?.reason === "dns_failed") throw new WooApiError(`woo_dns_failed: ${String(error.message).slice(0, 80)}`, 0);
    throw new WooApiError("woo_private_address", 0);
  }
}

class WooApiError extends Error {
  constructor(message, status, retryAfter = null) { super(message); this.name = "WooApiError"; this.status = status; this.retryAfter = retryAfter; }
}

function createWooClient({ siteUrl, consumerKey, consumerSecret, fetchImpl = globalThis.fetch, timeoutMs = 25000, checkHost = assertPublicHost }) {
  const base = `${String(siteUrl).replace(/\/+$/, "")}/wp-json/wc/v3`;
  const auth = "Basic " + Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  async function request(method, path, { query = {}, body = null } = {}) {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    // Before the request, every time. See assertPublicHost.
    if (typeof checkHost === "function") await checkHost(url.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method, headers: { Authorization: auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: controller.signal, redirect: "manual"
      });
    } catch (error) {
      throw new WooApiError(`woo_fetch_failed: ${String(error?.message || error).slice(0, 120)}`, 0);
    } finally { clearTimeout(timer); }
    if (response.status >= 300 && response.status < 400) throw new WooApiError("woo_redirected", response.status);   // WOO-003: never follow
    const retryAfter = response.headers && typeof response.headers.get === "function" ? response.headers.get("retry-after") : null;
    if (!response.ok) {
      let detail = "";
      try { const j = await response.json(); detail = String(j?.code || j?.message || "").slice(0, 120); } catch { /* body not json */ }
      throw new WooApiError(`woo_http_${response.status}${detail ? `: ${detail}` : ""}`, response.status, retryAfter);
    }
    const totalPages = Number(response.headers && typeof response.headers.get === "function" ? response.headers.get("x-wp-totalpages") : 0) || 0;
    const data = await response.json();
    return { data, totalPages };
  }

  return {
    /** Orders modified since `modifiedAfterIso`, page by page; `maxPages` caps a sweep (REC-006). */
    async listOrders({ modifiedAfterIso = null, afterIso = null, page = 1, perPage = DEFAULT_PER_PAGE, status = "any" } = {}) {
      const { data, totalPages } = await request("GET", "/orders", { query: { modified_after: modifiedAfterIso, after: afterIso, page, per_page: perPage, status, orderby: "modified", order: "asc" } });
      return { orders: Array.isArray(data) ? data : [], totalPages, page };
    },
    async getOrder(orderId) {
      try { const { data } = await request("GET", `/orders/${encodeURIComponent(orderId)}`); return data; }
      catch (error) { if (error.status === 404) return null; throw error; }
    },
    async listWebhooks() { const { data } = await request("GET", "/webhooks", { query: { per_page: 100 } }); return Array.isArray(data) ? data : []; },
    async createWebhook({ name, topic, deliveryUrl, secret }) { const { data } = await request("POST", "/webhooks", { body: { name, topic, delivery_url: deliveryUrl, secret, status: "active" } }); return data; },
    async updateWebhook(id, patch) { const { data } = await request("PUT", `/webhooks/${encodeURIComponent(id)}`, { body: patch }); return data; },
    async deleteWebhook(id) { const { data } = await request("DELETE", `/webhooks/${encodeURIComponent(id)}`, { query: { force: true } }); return data; },
    /** The cheapest authenticated call: proves the site, the REST API and the credentials in one go. */
    async probe() { const { data } = await request("GET", "/orders", { query: { per_page: 1 } }); return { ok: true, sample: Array.isArray(data) ? data.length : 0 }; },
    async listProducts({ page = 1, perPage = DEFAULT_PER_PAGE } = {}) { const { data, totalPages } = await request("GET", "/products", { query: { page, per_page: perPage } }); return { products: Array.isArray(data) ? data : [], totalPages }; }
  };
}

module.exports = { createWooClient, WooApiError, DEFAULT_PER_PAGE, assertPublicHost };

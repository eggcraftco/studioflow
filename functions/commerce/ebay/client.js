"use strict";

// The eBay Sell Fulfillment client (v1), with fetch injected so the suite can
// drive it without a seller. Every path string eBay owns lives HERE and nowhere
// else — the connector never spells a URL. Every non-2xx becomes an error that
// carries the status, eBay's first error id and an error class the retry policy
// understands; a 401 is retried once through the caller's refresh; a 404 on a
// single order is `null`, not an error.
//
// Facts honoured (docs/ebay-connector-design.md §1): getOrders takes
// `filter=lastmodifieddate:[<from>..<to>]` (or creationdate), ISO 8601 UTC with
// milliseconds and Z, `limit` at most 200, `offset`, `fieldGroups=TAX_BREAKDOWN`
// (without it every order lands tax_responsibility_unknown); `orderIds` takes
// at most 50 ids; the result order is unspecified. Quota is charged BEFORE the
// request through the injected ledger.
const { hostsFor } = require("./oauth");

const API_VERSION = "v1";
const ORDER_PATH = `/sell/fulfillment/${API_VERSION}/order`;
const PUBLIC_KEY_PATH = "/commerce/notification/v1/public_key";
const MAX_PAGE_SIZE = 200;
const MAX_IDS_PER_CALL = 50;
const FIELD_GROUPS = "TAX_BREAKDOWN";

class EbayApiError extends Error {
  constructor(message, { status = 0, code = "", retryAfter = null, errorClass = "unknown" } = {}) {
    super(message);
    this.name = "EbayApiError";
    this.status = Number(status) || 0;
    this.code = String(code || "");
    this.retryAfter = retryAfter;
    this.errorClass = errorClass;
  }
}

function classOfStatus(status) {
  if (status === 429) return "transient";
  if (status >= 500 || status === 0) return "transient";
  if (status === 401) return "auth";
  if (status === 403) return "permission";
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "validation";
  return "unknown";
}

/** eBay wants ISO 8601 UTC with milliseconds: 2026-09-02T09:00:00.000Z. */
function isoMs(value) {
  const ms = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(ms)) throw new EbayApiError("ebay_invalid_timestamp", { status: 0, errorClass: "validation", code: "invalid_timestamp" });
  return new Date(ms).toISOString();
}

/** The filter eBay's getOrders reads: `lastmodifieddate:[from..to]` or `creationdate:[from..to]`. */
function dateFilter(field, fromMs, toMs) {
  return `${field}:[${isoMs(fromMs)}..${isoMs(toMs)}]`;
}

function chunk(list, size) { const out = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; }

/**
 * @param {object} options
 *   environment   sandbox | production
 *   accessToken   the seller's user token (or the application token for publicKey)
 *   fetchImpl     fetch
 *   onUnauthorized  async () => freshAccessToken | "" — called once on a 401
 *   quota         { charge: async ({ family }) => void } — throws to refuse
 *   timeoutMs
 */
function createEbayClient({ environment = "sandbox", accessToken, fetchImpl = globalThis.fetch, onUnauthorized = null, quota = null, timeoutMs = 25000 } = {}) {
  const hosts = hostsFor(environment);
  let bearer = String(accessToken || "");

  async function request(method, path, { query = {}, host = "api", family = "orders", retryOn401 = true } = {}) {
    if (quota && typeof quota.charge === "function") await quota.charge({ family });
    const url = new URL(hosts[host] + path);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method, headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json", "Content-Type": "application/json" },
        signal: controller.signal, redirect: "manual"
      });
    } catch (error) {
      throw new EbayApiError(`ebay_fetch_failed: ${String(error?.message || error).slice(0, 120)}`, { status: 0, errorClass: "transient", code: "network" });
    } finally { clearTimeout(timer); }
    if (response.status >= 300 && response.status < 400) throw new EbayApiError("ebay_redirected", { status: response.status, errorClass: "unknown" });
    if (response.status === 401 && retryOn401 && typeof onUnauthorized === "function") {
      const fresh = await onUnauthorized();
      if (fresh) { bearer = String(fresh); return request(method, path, { query, host, family, retryOn401: false }); }
    }
    const retryAfter = response.headers && typeof response.headers.get === "function" ? response.headers.get("retry-after") : null;
    let data = {};
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
      const first = Array.isArray(data?.errors) ? data.errors[0] : null;
      const code = String(first?.errorId || first?.message || "").slice(0, 60);
      throw new EbayApiError(`ebay_http_${response.status}${code ? `: ${code}` : ""}`, { status: response.status, code, retryAfter, errorClass: classOfStatus(response.status) });
    }
    return data;
  }

  return {
    /**
     * One page of orders in a window. `lastModified*` is the reconciliation
     * filter; `creation*` the backfill's. eBay uses only creationdate when both
     * are present, so the two are never combined here.
     */
    async getOrders({ lastModifiedFromMs = null, lastModifiedToMs = null, creationFromMs = null, creationToMs = null, limit = MAX_PAGE_SIZE, offset = 0 } = {}) {
      const size = Math.min(Math.max(Number(limit) || MAX_PAGE_SIZE, 1), MAX_PAGE_SIZE);
      let filter = "";
      if (creationFromMs !== null && creationToMs !== null) filter = dateFilter("creationdate", creationFromMs, creationToMs);
      else if (lastModifiedFromMs !== null && lastModifiedToMs !== null) filter = dateFilter("lastmodifieddate", lastModifiedFromMs, lastModifiedToMs);
      const data = await request("GET", ORDER_PATH, { query: { filter, fieldGroups: FIELD_GROUPS, limit: size, offset: Math.max(0, Number(offset) || 0) }, family: "orders" });
      return {
        orders: Array.isArray(data?.orders) ? data.orders : [],
        total: Number(data?.total) || 0, limit: Number(data?.limit) || size, offset: Number(data?.offset) || 0,
        next: data?.next ? String(data.next) : null, prev: data?.prev ? String(data.prev) : null
      };
    },
    /** One order with its tax breakdown, or null when eBay no longer has it. */
    async getOrder(orderId) {
      try { return await request("GET", `${ORDER_PATH}/${encodeURIComponent(String(orderId))}`, { query: { fieldGroups: FIELD_GROUPS }, family: "orders" }); }
      catch (error) { if (error.status === 404) return null; throw error; }
    },
    /** Several orders by id, 50 per call — the nightly fulfilment follow-up and the import's retry. */
    async getOrdersByIds(orderIds) {
      const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).map((v) => String(v || "").trim()).filter(Boolean))];
      const out = [];
      for (const batch of chunk(ids, MAX_IDS_PER_CALL)) {
        const data = await request("GET", ORDER_PATH, { query: { orderIds: batch.join(","), fieldGroups: FIELD_GROUPS, limit: MAX_PAGE_SIZE }, family: "orders" });
        for (const order of Array.isArray(data?.orders) ? data.orders : []) out.push(order);
      }
      return out;
    },
    /** What actually shipped: the adapter builds shipments from this and nothing else. */
    async getShippingFulfillments(orderId) {
      try {
        const data = await request("GET", `${ORDER_PATH}/${encodeURIComponent(String(orderId))}/shipping_fulfillment`, { family: "fulfillments" });
        return Array.isArray(data?.fulfillments) ? data.fulfillments : [];
      } catch (error) { if (error.status === 404) return []; throw error; }
    },
    /** The notification signing key for a kid (application token). 404/400 → null: an unknown kid is not a retryable failure. */
    async publicKey(kid) {
      try {
        const data = await request("GET", `${PUBLIC_KEY_PATH}/${encodeURIComponent(String(kid))}`, { family: "notification" });
        return data && data.key ? { key: String(data.key), algorithm: String(data.algorithm || ""), digest: String(data.digest || "") } : null;
      } catch (error) { if (error.status === 404 || error.status === 400) return null; throw error; }
    },
    /** The cheapest read that proves the token: one order, one page. */
    async probe() {
      const page = await this.getOrders({ limit: 1 });
      return { ok: true, total: page.total };
    }
  };
}

module.exports = { createEbayClient, EbayApiError, API_VERSION, ORDER_PATH, PUBLIC_KEY_PATH, MAX_PAGE_SIZE, MAX_IDS_PER_CALL, FIELD_GROUPS, isoMs, dateFilter, classOfStatus };

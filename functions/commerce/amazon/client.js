"use strict";

// The SP-API client, with fetch injected so the suite can drive it without a
// seller account.
//
// Orders API **v2026-01-01** only. v0 is what most code and most training data
// know, it still answers, and the spec forbids it for a new implementation
// (§14) — a v0 connector would work and fail acceptance. The two versions differ
// in more than the path: v2026-01-01 takes `includedData` and returns only the
// datasets asked for, which is the mechanism this phase leans on to avoid ever
// receiving a buyer's name.
//
// Every request carries the regional host for the marketplace. The wrong region
// is a 403, not a degraded answer.
const { AMAZON_ENDPOINTS, amazonEndpointFor } = require("../marketplaces");
const { INCLUDED_DATA_A1 } = require("./sanitize");

const ORDERS_API_VERSION = "2026-01-01";
const ORDERS_BASE = `/orders/${ORDERS_API_VERSION}`;
const SELLERS_BASE = "/sellers/v1";

class AmazonApiError extends Error {
  constructor(message, status, code = "", retryAfter = null) {
    super(message);
    this.name = "AmazonApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    // What the retry policy needs. 429 is Amazon's whole throttling model, so
    // it must classify as transient rather than as a failure of the request.
    this.errorClass = status === 401 ? "auth"
      : status === 403 ? "permission"
        : status === 404 ? "not_found"
          : status === 429 || status >= 500 ? "transient"
            : status === 400 ? "validation" : "unknown";
  }
}

function createAmazonClient({
  region = "eu",
  marketplaceId = null,
  accessToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = 25000,
  onUnauthorized = null
} = {}) {
  const host = (marketplaceId && amazonEndpointFor(marketplaceId)) || AMAZON_ENDPOINTS[region] || AMAZON_ENDPOINTS.eu;
  let bearer = accessToken;

  async function request(method, path, { query = {}, retryOn401 = true } = {}) {
    const url = new URL(host + path);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method,
        headers: { "x-amz-access-token": bearer, Accept: "application/json" },
        signal: controller.signal,
        redirect: "manual"
      });
    } catch (error) {
      throw new AmazonApiError(`amazon_fetch_failed: ${String(error?.message || error).slice(0, 120)}`, 0);
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) throw new AmazonApiError("amazon_redirected", response.status);
    if (response.status === 401 && retryOn401 && typeof onUnauthorized === "function") {
      const fresh = await onUnauthorized();
      if (fresh) { bearer = fresh; return request(method, path, { query, retryOn401: false }); }
    }
    const retryAfter = response.headers && typeof response.headers.get === "function"
      ? response.headers.get("retry-after") : null;
    let data = {};
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
      const first = Array.isArray(data?.errors) ? data.errors[0] : null;
      const code = String(first?.code || "").slice(0, 60);
      throw new AmazonApiError(`amazon_http_${response.status}${code ? `: ${code}` : ""}`, response.status, code, retryAfter);
    }
    return data;
  }

  return {
    host,
    ordersApiVersion: ORDERS_API_VERSION,

    /**
     * Which marketplaces this authorization actually covers.
     *
     * One Amazon consent can span several marketplaces, and the seller is never
     * asked to type them in — this is where the connection learns what it is
     * connected to. Marketplace discovery is part of phase A1 for that reason.
     */
    async getMarketplaceParticipations() {
      const data = await request("GET", `${SELLERS_BASE}/marketplaceParticipations`);
      const rows = Array.isArray(data?.payload) ? data.payload : Array.isArray(data) ? data : [];
      return rows.map((row) => ({
        marketplaceId: String(row?.marketplace?.id || ""),
        countryCode: String(row?.marketplace?.countryCode || ""),
        currencyCode: String(row?.marketplace?.defaultCurrencyCode || ""),
        name: String(row?.marketplace?.name || ""),
        // Amazon's own answer to "is this seller actually selling here".
        participating: row?.participation?.isParticipating === true,
        hasSuspendedListings: row?.participation?.hasSuspendedListings === true
      })).filter((row) => row.marketplaceId);
    },

    /**
     * Orders changed in a window, oldest first.
     *
     * `includedData` defaults to the phase's own list, which contains neither
     * BUYER nor RECIPIENT. Passing something wider is possible and is exactly
     * what the sanitizer exists to survive — but it is not done by accident,
     * because the default is the safe one.
     */
    async searchOrders({
      marketplaceIds,
      lastUpdatedAfter = null,
      lastUpdatedBefore = null,
      createdAfter = null,
      nextToken = null,
      maxResults = 100,
      includedData = INCLUDED_DATA_A1,
      orderStatuses = null
    } = {}) {
      const query = nextToken
        // A continuation carries the whole query; sending the filters again is
        // how you get a 400 from Amazon.
        ? { nextToken, marketplaceIds }
        : {
          marketplaceIds,
          lastUpdatedAfter,
          lastUpdatedBefore,
          createdAfter,
          maxResults,
          includedData,
          orderStatuses
        };
      const data = await request("GET", `${ORDERS_BASE}/orders`, { query });
      const payload = data?.payload || data || {};
      return {
        orders: Array.isArray(payload.orders) ? payload.orders : [],
        nextToken: payload.nextToken ? String(payload.nextToken) : null
      };
    },

    /** One order, with the datasets this phase is allowed to ask for. */
    async getOrder(amazonOrderId, { includedData = INCLUDED_DATA_A1 } = {}) {
      const data = await request("GET", `${ORDERS_BASE}/orders/${encodeURIComponent(String(amazonOrderId))}`, {
        query: { includedData }
      });
      return data?.payload || data || null;
    },

    /** The order's lines. Money per item lives here and nowhere else. */
    async getOrderItems(amazonOrderId, { nextToken = null } = {}) {
      const data = await request("GET", `${ORDERS_BASE}/orders/${encodeURIComponent(String(amazonOrderId))}/orderItems`, {
        query: nextToken ? { nextToken } : {}
      });
      const payload = data?.payload || data || {};
      return {
        items: Array.isArray(payload.orderItems) ? payload.orderItems : [],
        nextToken: payload.nextToken ? String(payload.nextToken) : null
      };
    }
  };
}

module.exports = { createAmazonClient, AmazonApiError, ORDERS_API_VERSION, ORDERS_BASE, SELLERS_BASE };

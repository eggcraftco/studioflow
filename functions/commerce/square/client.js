// The Square REST client (v2), with fetch injected so the suite can drive it
// without a merchant. Every call carries the pinned Square-Version
// (SQ-VER-001, SQ-TEST-023) and the merchant's OAuth bearer token
// (SQ-SEC-004); every non-2xx becomes an error that carries the status and
// Square's first error code, so the retry policy can classify it (§19.1).
// Redirects are never followed. Money stays as Square sent it (minor-unit
// integers) — the adapter converts, nowhere else (SQ-PAY-003).
const { SQUARE_API_VERSION, squareHost } = require("./oauth");

const DEFAULT_LIMIT = 100;

class SquareApiError extends Error {
  constructor(message, status, code = "", retryAfter = null) { super(message); this.name = "SquareApiError"; this.status = status; this.code = code; this.retryAfter = retryAfter; }
}

function createSquareClient({ environment = "production", accessToken, fetchImpl = globalThis.fetch, timeoutMs = 25000, onUnauthorized = null }) {
  const base = `${squareHost(environment)}/v2`;
  let bearer = accessToken;

  async function request(method, path, { query = {}, body = null, retryOn401 = true } = {}) {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method, headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json", "Square-Version": SQUARE_API_VERSION, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: controller.signal, redirect: "manual"
      });
    } catch (error) {
      throw new SquareApiError(`square_fetch_failed: ${String(error?.message || error).slice(0, 120)}`, 0);
    } finally { clearTimeout(timer); }
    if (response.status >= 300 && response.status < 400) throw new SquareApiError("square_redirected", response.status);
    if (response.status === 401 && retryOn401 && typeof onUnauthorized === "function") {
      // SQ-AUTH-006/007: one refresh, single-flight on the caller's side, then the same call again.
      const fresh = await onUnauthorized();
      if (fresh) { bearer = fresh; return request(method, path, { query, body, retryOn401: false }); }
    }
    const retryAfter = response.headers && typeof response.headers.get === "function" ? response.headers.get("retry-after") : null;
    let data = {};
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
      const first = Array.isArray(data?.errors) ? data.errors[0] : null;
      const code = String(first?.code || "").slice(0, 60);
      throw new SquareApiError(`square_http_${response.status}${code ? `: ${code}` : ""}`, response.status, code, retryAfter);
    }
    return data;
  }

  return {
    async getMerchant() { const data = await request("GET", "/merchants/me"); return data?.merchant || null; },
    async listLocations() { const data = await request("GET", "/locations"); return Array.isArray(data?.locations) ? data.locations : []; },
    /** SearchOrders over the selected locations (≤10 per call, SQ-LOC-007), by updated_at, oldest first, page by page (SQ-REC-004/005). */
    async searchOrders({ locationIds, updatedAfterIso = null, updatedBeforeIso = null, createdAfterIso = null, cursor = null, limit = DEFAULT_LIMIT, states = null } = {}) {
      // Square requires the sort field to be the field the date filter uses.
      const byCreated = Boolean(createdAfterIso) && !updatedAfterIso;
      const range = { start_at: byCreated ? createdAfterIso : updatedAfterIso, ...(updatedBeforeIso ? { end_at: updatedBeforeIso } : {}) };
      const filter = { date_time_filter: byCreated ? { created_at: range } : { updated_at: range } };
      if (Array.isArray(states) && states.length) filter.state_filter = { states };
      const data = await request("POST", "/orders/search", { body: {
        location_ids: locationIds, limit, ...(cursor ? { cursor } : {}), return_entries: false,
        query: { filter, sort: { sort_field: byCreated ? "CREATED_AT" : "UPDATED_AT", sort_order: "ASC" } }
      } });
      return { orders: Array.isArray(data?.orders) ? data.orders : [], cursor: data?.cursor || null };
    },
    async getOrder(orderId) {
      try { const data = await request("GET", `/orders/${encodeURIComponent(orderId)}`); return data?.order || null; }
      catch (error) { if (error.status === 404) return null; throw error; }
    },
    async getPayment(paymentId) {
      try { const data = await request("GET", `/payments/${encodeURIComponent(paymentId)}`); return data?.payment || null; }
      catch (error) { if (error.status === 404) return null; throw error; }
    },
    async listPayments({ beginTimeIso, endTimeIso = null, locationId = null, cursor = null, limit = DEFAULT_LIMIT } = {}) {
      const data = await request("GET", "/payments", { query: { begin_time: beginTimeIso, end_time: endTimeIso, sort_order: "ASC", cursor, limit, location_id: locationId } });
      return { payments: Array.isArray(data?.payments) ? data.payments : [], cursor: data?.cursor || null };
    },
    async getRefund(refundId) {
      try { const data = await request("GET", `/refunds/${encodeURIComponent(refundId)}`); return data?.refund || null; }
      catch (error) { if (error.status === 404) return null; throw error; }
    },
    async listRefunds({ beginTimeIso, endTimeIso = null, locationId = null, cursor = null, limit = DEFAULT_LIMIT } = {}) {
      const data = await request("GET", "/refunds", { query: { begin_time: beginTimeIso, end_time: endTimeIso, sort_order: "ASC", cursor, limit, location_id: locationId } });
      return { refunds: Array.isArray(data?.refunds) ? data.refunds : [], cursor: data?.cursor || null };
    },
    async getCustomer(customerId) {
      try { const data = await request("GET", `/customers/${encodeURIComponent(customerId)}`); return data?.customer || null; }
      catch (error) { if (error.status === 404) return null; throw error; }
    },
    async listPayouts({ beginTimeIso, endTimeIso = null, locationId = null, cursor = null, limit = DEFAULT_LIMIT } = {}) {
      const data = await request("GET", "/payouts", { query: { begin_time: beginTimeIso, end_time: endTimeIso, sort_order: "ASC", cursor, limit, location_id: locationId } });
      return { payouts: Array.isArray(data?.payouts) ? data.payouts : [], cursor: data?.cursor || null };
    },
    async listPayoutEntries(payoutId, { cursor = null, limit = DEFAULT_LIMIT } = {}) {
      const data = await request("GET", `/payouts/${encodeURIComponent(payoutId)}/payout-entries`, { query: { cursor, limit, sort_order: "ASC" } });
      return { entries: Array.isArray(data?.payout_entries) ? data.payout_entries : [], cursor: data?.cursor || null };
    },
    /** The cheapest authenticated call: proves the token and names the merchant in one go (SQ-AUTH-010). */
    async probe() { const merchant = await request("GET", "/merchants/me"); return { ok: true, merchantId: String(merchant?.merchant?.id || "") }; }
  };
}

/** The application-level client (personal access token) — Events API only (SQ-SEC-003, SQ-REC-001/002). */
function createSquareEventsClient({ environment = "production", appAccessToken, fetchImpl = globalThis.fetch, timeoutMs = 25000 }) {
  const inner = createSquareClient({ environment, accessToken: appAccessToken, fetchImpl, timeoutMs });
  // Reuse the bearer plumbing through a private request: the shape differs only in the path.
  const base = `${squareHost(environment)}/v2`;
  async function send(method, path, body) {
    const response = await fetchImpl(base + path, { method, headers: { Authorization: `Bearer ${appAccessToken}`, Accept: "application/json", "Content-Type": "application/json", "Square-Version": SQUARE_API_VERSION }, body: JSON.stringify(body), redirect: "manual" });
    let data = {};
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) { const first = Array.isArray(data?.errors) ? data.errors[0] : null; throw new SquareApiError(`square_events_http_${response.status}${first?.code ? `: ${first.code}` : ""}`, response.status, String(first?.code || "")); }
    return data;
  }
  return {
    // EnableEvents is a PUT in Square's reference (PUT /v2/events/enable); a POST answers 404 NOT_FOUND.
    async enableEvents() { return send("PUT", "/events/enable", {}); },
    async searchEvents({ createdAfterIso, createdBeforeIso = null, merchantId = null, eventTypes = null, cursor = null, limit = DEFAULT_LIMIT } = {}) {
      const filter = { created_at: { start_at: createdAfterIso, ...(createdBeforeIso ? { end_at: createdBeforeIso } : {}) } };
      if (merchantId) filter.merchant_ids = [merchantId];
      if (Array.isArray(eventTypes) && eventTypes.length) filter.event_types = eventTypes;
      const data = await send("POST", "/events", { query: { filter, sort: { field: "DEFAULT", order: "ASC" } }, limit, ...(cursor ? { cursor } : {}) });
      return { events: Array.isArray(data?.events) ? data.events : [], cursor: data?.cursor || null };
    },
    _merchantClient: inner
  };
}

module.exports = { createSquareClient, createSquareEventsClient, SquareApiError, DEFAULT_LIMIT };

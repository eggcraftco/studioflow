"use strict";
// PayPal REST — the two calls a money feed needs: a client-credentials token
// and the Transaction Search API (GET /v1/reporting/transactions, 31-day
// windows, up to three years back, ~3 hours behind). First-party: each
// workspace uses its own PayPal app's client id and secret.

const HOSTS = Object.freeze({ live: "https://api-m.paypal.com", sandbox: "https://api-m.sandbox.paypal.com" });
const MAX_WINDOW_DAYS = 31;

class PayPalApiError extends Error {
  constructor(message, status, code = "", stage = "data") {
    super(message); this.name = "PayPalApiError"; this.status = status; this.code = code; this.stage = stage;
    // The bank feed's error classifier reads these two.
    this.tlStatus = status; this.tlStage = stage;
  }
}

function paypalHost(environment) { return HOSTS[String(environment || "live").toLowerCase() === "sandbox" ? "sandbox" : "live"]; }

/** PayPal wants ISO 8601 with a numeric offset, no milliseconds: 2026-09-01T00:00:00-0000 */
function paypalIso(ms) { return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "-0000"); }

function createPayPalClient({ environment = "live", clientId, clientSecret, fetchImpl = globalThis.fetch, timeoutMs = 25000 }) {
  const host = paypalHost(environment);
  let bearer = ""; let bearerUntil = 0;

  async function request(method, path, { query = null, body = null, auth = "bearer" } = {}) {
    const url = new URL(host + path);
    if (query) for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, String(v));
    const headers = { Accept: "application/json" };
    if (auth === "basic") { headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`; headers["Content-Type"] = "application/x-www-form-urlencoded"; }
    else { headers.Authorization = `Bearer ${await token()}`; headers["Content-Type"] = "application/json"; }
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let response;
    try { response = await fetchImpl(url.toString(), { method, headers, body, signal: controller ? controller.signal : undefined }); }
    finally { if (timer) clearTimeout(timer); }
    let data = {};
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
      const code = String(data?.name || data?.error || "");
      const detail = String(data?.message || data?.error_description || (Array.isArray(data?.details) && data.details[0]?.description) || "");
      throw new PayPalApiError(`paypal_http_${response.status}${code ? `: ${code}` : ""}${detail ? ` — ${detail.slice(0, 160)}` : ""}`, response.status, code, auth === "basic" ? "auth" : "data");
    }
    return data;
  }

  async function token() {
    if (bearer && Date.now() < bearerUntil - 60000) return bearer;
    const data = await request("POST", "/v1/oauth2/token", { body: "grant_type=client_credentials", auth: "basic" });
    if (!data?.access_token) throw new PayPalApiError("paypal_token_missing", 401, "invalid_client", "auth");
    bearer = String(data.access_token); bearerUntil = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    return bearer;
  }

  /** One page of the Transaction Search API for a window of at most 31 days. PayPal takes ONE transaction_status (D, P, S or V); more than one is a 400, so rows are filtered by status after the fact. */
  async function listTransactions({ startMs, endMs, page = 1, pageSize = 500, statuses = null }) {
    if (endMs - startMs > MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000 + 1000) throw new PayPalApiError("paypal_window_too_wide", 400, "WINDOW", "data");
    const data = await request("GET", "/v1/reporting/transactions", { query: { start_date: paypalIso(startMs), end_date: paypalIso(endMs), fields: "all", page_size: pageSize, page, transaction_status: Array.isArray(statuses) && statuses.length === 1 ? statuses[0] : null } });
    return {
      transactions: Array.isArray(data?.transaction_details) ? data.transaction_details : [],
      page: Number(data?.page) || page, totalPages: Number(data?.total_pages) || 1, totalItems: Number(data?.total_items) || 0,
      accountNumber: String(data?.account_number || ""), lastRefreshed: String(data?.last_refreshed_datetime || "")
    };
  }

  /** Every transaction in [startMs, endMs], walking 31-day chunks and their pages. */
  async function* transactionsBetween({ startMs, endMs, statuses = null, maxPages = 40 }) {
    const step = MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    let pages = 0;
    for (let from = startMs; from < endMs; from += step) {
      const to = Math.min(from + step, endMs);
      for (let page = 1; ; page += 1) {
        const out = await listTransactions({ startMs: from, endMs: to, page, statuses });
        pages += 1;
        yield out;
        if (page >= out.totalPages || out.transactions.length === 0) break;
        if (pages >= maxPages) return;
      }
    }
  }

  /** The cheapest proof the credentials work AND the app may search transactions: one day, one page. */
  async function probe() {
    const endMs = Date.now(); const startMs = endMs - 24 * 60 * 60 * 1000;
    const out = await listTransactions({ startMs, endMs, page: 1, pageSize: 100 });
    return { ok: true, accountNumber: out.accountNumber, lastRefreshed: out.lastRefreshed };
  }

  return { token, listTransactions, transactionsBetween, probe, host };
}

module.exports = { createPayPalClient, PayPalApiError, paypalHost, paypalIso, MAX_WINDOW_DAYS };

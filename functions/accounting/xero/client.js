"use strict";

// A pure Xero Accounting API client: one bearer token, one tenant, an
// injectable fetch. It knows nothing about Firestore.
//   base      https://api.xero.com/api.xro/2.0
//   headers   Authorization: Bearer …, xero-tenant-id: <tenantId>, Accept: application/json
//   reads     If-Modified-Since for incremental sync; page=N (100 rows) where the
//             resource pages (Invoices, CreditNotes, Contacts, BankTransactions,
//             Payments, Overpayments, Prepayments, ManualJournals, PurchaseOrders)
//   writes    Idempotency-Key header (phase 3)
//   limits    5 concurrent, 60/min and 1,000 (Starter) or 5,000/day per tenant,
//             10,000/min per app; every response carries X-DayLimit-Remaining,
//             X-MinLimit-Remaining and X-AppMinLimit-Remaining; a 429 names the
//             limit in X-Rate-Limit-Problem and the wait in Retry-After.

const BASE_URL = "https://api.xero.com/api.xro/2.0";
// Xero's published limits, configuration rather than constants in callers (XR §3.2).
const XERO_LIMITS = Object.freeze({ concurrentPerTenant: 5, requestsPerMinute: 60, requestsPerDay: { starter: 1000, core: 5000 }, appRequestsPerMinute: 10000, pageSize: 100, maxNodesPerWrite: 50 });

const PAGED_RESOURCES = new Set(["Invoices", "CreditNotes", "Contacts", "BankTransactions", "Payments", "Overpayments", "Prepayments", "ManualJournals", "PurchaseOrders"]);
const RESPONSE_KEYS = Object.freeze({ Organisation: "Organisations" });

class XeroApiError extends Error {
  constructor(message, { status = 0, code = "", detail = "", retryAfterSeconds = 0, limitProblem = "", path = "" } = {}) {
    super(message);
    this.name = "XeroApiError";
    this.status = status;
    this.code = String(code || "");
    this.detail = String(detail || "").slice(0, 400);
    this.retryAfterSeconds = retryAfterSeconds;
    this.limitProblem = limitProblem;
    this.path = path;
    // A 403 on a resource the granted scopes do not cover is not a broken
    // connection: the UI offers "Update permissions" (XR §3.1).
    this.scopeProblem = status === 403 && /scope|AuthorizationUnsuccessful|unauthori[sz]ed/i.test(this.detail);
    this.errorClass = status === 401 ? "auth"
      : status === 403 ? "permission"
      : status === 404 ? "not_found"
      : status === 429 || status >= 500 ? "transient"
      : status === 412 ? "conflict"
      : status ? "validation" : "unknown";
  }
}

// Xero's JSON still carries .NET dates ("/Date(1439434356790+0000)/") on the
// audit fields; ISO strings pass straight through.
function parseXeroDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = /\/Date\((-?\d+)(?:([+-])(\d{2})(\d{2}))?\)\//.exec(text);
  if (match) {
    const ms = Number(match[1]);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
  }
  // Xero's DateString / DueDateString carry no zone: they are the
  // organisation's calendar date and must not drift a day through local time.
  const zoneless = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$/.test(text) ? `${text.length === 10 ? `${text}T00:00:00` : text}Z` : text;
  const parsed = Date.parse(zoneless);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : text;
}

function createXeroClient({ tenantId, accessToken, fetchImpl = globalThis.fetch, baseUrl = BASE_URL }) {
  const tenant = String(tenantId || "").trim();
  const token = String(accessToken || "");
  if (!tenant) throw new Error("xero_tenant_required");
  const lastLimits = { minuteRemaining: null, dayRemaining: null, appMinuteRemaining: null, observedAtMs: 0 };

  function readLimits(response) {
    const get = (name) => { const raw = response.headers?.get?.(name); return raw === null || raw === undefined || raw === "" ? null : Number(raw); };
    lastLimits.minuteRemaining = get("x-minlimit-remaining");
    lastLimits.dayRemaining = get("x-daylimit-remaining");
    lastLimits.appMinuteRemaining = get("x-appminlimit-remaining");
    lastLimits.observedAtMs = Date.now();
  }

  async function request(method, path, { query = {}, body = null, ifModifiedSince = "", idempotencyKey = "" } = {}) {
    const params = [];
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    const url = `${baseUrl}${path}${params.length ? `?${params.join("&")}` : ""}`;
    const headers = { Accept: "application/json", Authorization: `Bearer ${token}`, "xero-tenant-id": tenant };
    if (ifModifiedSince) headers["If-Modified-Since"] = new Date(ifModifiedSince).toUTCString();
    if (idempotencyKey) headers["Idempotency-Key"] = String(idempotencyKey);
    if (body !== null) headers["Content-Type"] = "application/json";
    const response = await fetchImpl(url, { method, headers, body: body === null ? undefined : JSON.stringify(body) });
    readLimits(response);
    const text = await response.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    if (!response.ok) {
      const element = Array.isArray(json?.Elements) && json.Elements[0] ? json.Elements[0] : null;
      const validation = element?.ValidationErrors?.[0]?.Message || json?.Message || json?.Detail || json?.Title || "";
      throw new XeroApiError(`xero_${response.status}`, {
        status: response.status, code: String(json?.ErrorNumber || json?.Type || ""), detail: validation || text,
        retryAfterSeconds: Number(response.headers?.get?.("retry-after") || 0) || 0,
        limitProblem: String(response.headers?.get?.("x-rate-limit-problem") || ""), path
      });
    }
    return json;
  }

  function rowsOf(resource, json) {
    const key = RESPONSE_KEYS[resource] || resource;
    const rows = json?.[key];
    return Array.isArray(rows) ? rows : [];
  }

  const client = {
    tenantId: tenant,
    limits: XERO_LIMITS,
    lastLimits,
    request,
    async get(resource, { query = {}, ifModifiedSince = "" } = {}) {
      return rowsOf(resource, await request("GET", `/${resource}`, { query, ifModifiedSince }));
    },
    // Every page of a paged resource, or the one response of an unpaged one.
    async getAll(resource, { ifModifiedSince = "", where = "", order = "", pageSize = XERO_LIMITS.pageSize, maxPages = 200, query = {} } = {}) {
      if (!PAGED_RESOURCES.has(resource)) return client.get(resource, { query: { ...query, where: where || undefined, order: order || undefined }, ifModifiedSince });
      const rows = [];
      let firstIdOfLastPage = "";
      for (let page = 1; page <= maxPages; page += 1) {
        const items = await client.get(resource, { query: { ...query, page, where: where || undefined, order: order || undefined }, ifModifiedSince });
        if (!items.length) break;
        const firstId = JSON.stringify(items[0]).slice(0, 200);
        if (firstId === firstIdOfLastPage) break;
        firstIdOfLastPage = firstId;
        rows.push(...items);
        if (items.length < pageSize) break;
      }
      return rows;
    },
    async organisation() { return rowsOf("Organisation", await request("GET", "/Organisation"))[0] || {}; },
    async currencies() { return client.get("Currencies"); },
    async trackingCategories() { return client.get("TrackingCategories"); },
    async accounts(options) { return client.getAll("Accounts", options); },
    async taxRates(options) { return client.getAll("TaxRates", options); },
    async contacts(options) { return client.getAll("Contacts", options); },
    async items(options) { return client.getAll("Items", options); },
    async invoices(options) { return client.getAll("Invoices", options); },
    async creditNotes(options) { return client.getAll("CreditNotes", options); },
    async payments(options) { return client.getAll("Payments", options); },
    async bankTransactions(options) { return client.getAll("BankTransactions", options); },
    async bankTransfers(options) { return client.getAll("BankTransfers", options); },
    async overpayments(options) { return client.getAll("Overpayments", options); },
    async prepayments(options) { return client.getAll("Prepayments", options); },
    async read(resource, id) {
      const rows = rowsOf(resource, await request("GET", `/${resource}/${encodeURIComponent(String(id))}`));
      return rows[0] || null;
    },
    async probe() {
      const org = await client.organisation();
      return { ok: true, companyName: String(org.Name || org.LegalName || ""), country: String(org.CountryCode || "") };
    }
  };
  return client;
}

module.exports = { BASE_URL, XERO_LIMITS, PAGED_RESOURCES, XeroApiError, parseXeroDate, createXeroClient };

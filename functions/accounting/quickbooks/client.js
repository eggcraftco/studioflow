"use strict";

// A pure QuickBooks Online Accounting API client: one bearer token, one realm,
// one environment, an injectable fetch. It knows nothing about Firestore.
//   sandbox    https://sandbox-quickbooks.api.intuit.com
//   production https://quickbooks.api.intuit.com
//   GET /v3/company/{realmId}/companyinfo/{realmId}   ?minorversion=75
//   GET /v3/company/{realmId}/preferences
//   GET /v3/company/{realmId}/query?query=<SQL-ish>
//   GET /v3/company/{realmId}/cdc?entities=A,B&changedSince=<ISO>   (30 days back at most)
//   GET /v3/company/{realmId}/<entity>/<id>
//   POST /v3/company/{realmId}/<entity>   (create; ?operation=update with SyncToken for updates)

const MINOR_VERSION = 75;
const BASE_URLS = Object.freeze({
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com"
});
// Intuit's published limits, kept configurable rather than sprinkled through callers.
const QBO_LIMITS = Object.freeze({ requestsPerMinute: 500, concurrentPerRealm: 10, cdcMaxDays: 30, queryPageSize: 1000, queryMaxRows: 20000 });

class QuickBooksApiError extends Error {
  constructor(message, { status = 0, code = "", detail = "", retryAfterSeconds = 0, path = "" } = {}) {
    super(message);
    this.name = "QuickBooksApiError";
    this.status = status;
    this.code = String(code || "");
    this.detail = String(detail || "").slice(0, 400);
    this.retryAfterSeconds = retryAfterSeconds;
    this.path = path;
    this.errorClass = status === 401 ? "auth"
      : status === 403 ? "permission"
      : status === 404 ? "not_found"
      : status === 429 || status >= 500 ? "transient"
      // 3200 = stale SyncToken, 6240 = duplicate name, 610 = object not found on update
      : this.code === "3200" ? "conflict"
      : this.code === "610" ? "not_found"
      : status ? "validation" : "unknown";
  }
}

function environmentOf(value) {
  return String(value || "").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function createQuickBooksClient({ environment, realmId, accessToken, fetchImpl = globalThis.fetch, minorVersion = MINOR_VERSION }) {
  const env = environmentOf(environment);
  const realm = String(realmId || "").trim();
  const token = String(accessToken || "");
  if (!realm) throw new Error("quickbooks_realm_required");
  const base = `${BASE_URLS[env]}/v3/company/${encodeURIComponent(realm)}`;

  async function request(method, path, { query = {}, body = null } = {}) {
    // Percent-encoding by hand: URLSearchParams would turn the spaces of a
    // query statement into "+", which Intuit's query parser does not unfold.
    const params = [`minorversion=${encodeURIComponent(String(minorVersion))}`];
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    const url = `${base}${path}?${params.join("&")}`;
    const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
    if (body !== null) headers["Content-Type"] = "application/json";
    const response = await fetchImpl(url, { method, headers, body: body === null ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    if (!response.ok) {
      const fault = json?.Fault?.Error?.[0] || json?.fault?.error?.[0] || {};
      const retryAfter = Number(response.headers?.get?.("retry-after") || 0) || 0;
      throw new QuickBooksApiError(`quickbooks_${response.status}`, {
        status: response.status, code: fault.code || json.error || "", detail: fault.Detail || fault.Message || json.error_description || text,
        retryAfterSeconds: retryAfter, path
      });
    }
    return json;
  }

  const client = {
    environment: env,
    realmId: realm,
    limits: QBO_LIMITS,
    request,
    async companyInfo() { return (await request("GET", `/companyinfo/${encodeURIComponent(realm)}`)).CompanyInfo || {}; },
    async preferences() { return (await request("GET", "/preferences")).Preferences || {}; },
    async query(sql) { return (await request("GET", "/query", { query: { query: String(sql || "") } })).QueryResponse || {}; },
    // SELECT * FROM <entity> [WHERE …] paged with STARTPOSITION/MAXRESULTS.
    async queryAll(entity, { where = "", pageSize = QBO_LIMITS.queryPageSize, max = QBO_LIMITS.queryMaxRows, orderBy = "" } = {}) {
      const rows = [];
      let start = 1;
      while (rows.length < max) {
        const size = Math.min(pageSize, max - rows.length);
        const sql = `SELECT * FROM ${entity}${where ? ` WHERE ${where}` : ""}${orderBy ? ` ORDERBY ${orderBy}` : ""} STARTPOSITION ${start} MAXRESULTS ${size}`;
        const page = await client.query(sql);
        const items = Array.isArray(page[entity]) ? page[entity] : [];
        rows.push(...items);
        if (items.length < size) break;
        start += items.length;
      }
      return rows;
    },
    async count(entity, where = "") {
      const page = await client.query(`SELECT COUNT(*) FROM ${entity}${where ? ` WHERE ${where}` : ""}`);
      return Number(page.totalCount) || 0;
    },
    async cdc(entities, changedSinceIso) {
      const list = (Array.isArray(entities) ? entities : String(entities || "").split(",")).map((name) => String(name).trim()).filter(Boolean);
      const json = await request("GET", "/cdc", { query: { entities: list.join(","), changedSince: String(changedSinceIso || "") } });
      const responses = Array.isArray(json.CDCResponse) ? json.CDCResponse : [];
      const changes = [];
      for (const block of responses) {
        const queryResponses = Array.isArray(block.QueryResponse) ? block.QueryResponse : [];
        for (const qr of queryResponses) {
          for (const [entity, rows] of Object.entries(qr)) {
            if (!Array.isArray(rows)) continue;
            for (const row of rows) changes.push({ entity, row, deleted: String(row?.status || "") === "Deleted" });
          }
        }
      }
      return changes;
    },
    async read(entity, id) {
      const json = await request("GET", `/${String(entity).toLowerCase()}/${encodeURIComponent(String(id))}`);
      return json[entity] || json[Object.keys(json).find((key) => key !== "time")] || null;
    },
    async create(entity, payload) {
      const json = await request("POST", `/${String(entity).toLowerCase()}`, { body: payload });
      return json[entity] || null;
    },
    async update(entity, payload) {
      const json = await request("POST", `/${String(entity).toLowerCase()}`, { query: { operation: "update" }, body: payload });
      return json[entity] || null;
    },
    async probe() {
      const info = await client.companyInfo();
      return { ok: true, companyName: String(info.CompanyName || ""), country: String(info.Country || "") };
    }
  };
  return client;
}

module.exports = { MINOR_VERSION, BASE_URLS, QBO_LIMITS, QuickBooksApiError, createQuickBooksClient, environmentOf };

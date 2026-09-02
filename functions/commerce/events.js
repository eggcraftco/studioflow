// §5.5 / §5.6 — the event, attempt and retry model every connector shares.
//
// An event is the durable fact that a provider told us something; an attempt
// is one try at applying it. The record carries a correlation id from the
// gateway to the last retry (OBS-001), a safe message that can never hold a
// token or an address (OBS-002), and an error CLASS, because the class — not
// the message — decides what happens next (RETRY-001/006).
const crypto = require("crypto");

const EVENT_STATUSES = new Set(["received", "queued", "processing", "applied", "duplicate", "stale", "noop", "held", "skipped", "retrying", "dead", "failed"]);
const ERROR_CLASSES = new Set(["transient", "auth", "validation", "permission", "not_found", "conflict", "unknown"]);
const MAX_ATTEMPTS = { transient: 6, conflict: 3, unknown: 3, auth: 1, permission: 1, validation: 1, not_found: 1 };
const BASE_DELAY_MS = 30 * 1000;
const MAX_DELAY_MS = 60 * 60 * 1000;
const EVENT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function newCorrelationId() { return "corr_" + crypto.randomBytes(8).toString("hex"); }

/** Which class an error belongs to; the message is data, the class is policy. */
function classifyError(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || error || "").toLowerCase();
  if (error?.errorClass && ERROR_CLASSES.has(error.errorClass)) return error.errorClass;
  // Our own throws carry the upstream status in the message ("shopify_graphql_http_503").
  const embedded = /(?:http|status)[_ ]?(\d{3})\b/.exec(message);
  const effectiveStatus = status || (embedded ? Number(embedded[1]) : 0);
  if (effectiveStatus === 429 || /rate.?limit|throttl/.test(message)) return "transient";
  if (effectiveStatus >= 500) return "transient";
  if (effectiveStatus === 401) return "auth";
  if (effectiveStatus === 403) return "permission";
  if (effectiveStatus === 404) return "not_found";
  if (status >= 500 || /timeout|timed out|econnreset|socket hang up|unavailable|deadline/.test(message)) return "transient";
  if (status === 401 || /invalid_grant|token (expired|revoked)|unauthori[sz]ed|reconnect/.test(message)) return "auth";
  if (status === 403 || /forbidden|missing.*scope|permission/.test(message)) return "permission";
  if (status === 404 || /not.?found|order_not_in_shopify/.test(message)) return "not_found";
  if (status === 409 || /conflict|stale/.test(message)) return "conflict";
  if (status === 400 || status === 422 || /invalid|schema|malformed|unsupported/.test(message) || code === "validation") return "validation";
  return "unknown";
}

/** Milliseconds until the next try; null means "do not retry" (RETRY-003 sends those to the DLQ). */
function retryDelayMs(errorClass, attempt, retryAfterSeconds = null) {
  const cap = MAX_ATTEMPTS[errorClass] ?? 1;
  if (attempt >= cap) return null;
  if (retryAfterSeconds && Number.isFinite(Number(retryAfterSeconds))) {
    return Math.min(MAX_DELAY_MS, Math.max(1000, Number(retryAfterSeconds) * 1000));   // RETRY-002
  }
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.min(exponential, 30 * 1000));
  return exponential + jitter;
}

/** Retry-After as seconds, from either form the header comes in. */
function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds;
  const at = Date.parse(String(value));
  return Number.isFinite(at) ? Math.max(1, Math.round((at - Date.now()) / 1000)) : null;
}

/** One message that is safe in a log and in the merchant's sync activity. */
function safeMessage(errorClass, error) {
  const text = String(error?.message || error || "").replace(/[A-Za-z0-9_-]{24,}/g, "…").replace(/\S+@\S+/g, "…").slice(0, 200);
  const label = { transient: "Provider temporarily unavailable", auth: "Reconnect required", validation: "Payload could not be understood",
    permission: "Missing permission on the connection", not_found: "Record no longer exists at the provider", conflict: "Newer version at the provider", unknown: "Unexpected error" }[errorClass] || "Error";
  return text ? `${label}: ${text}` : label;
}

/** SYNC-003 — the idempotency key, from the provider's event id or derived from what it identifies. */
function idempotencyKey({ provider, connectionId, eventId, entityType = "order", externalId = "", eventType = "" }) {
  if (eventId) return `${provider}|${connectionId}|${eventId}`;
  const digest = crypto.createHash("sha256").update([provider, connectionId, entityType, externalId, eventType].join("|")).digest("hex").slice(0, 24);
  return `${provider}|${connectionId}|derived_${digest}`;
}

function eventDocId(key) { return String(key).replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 300); }

function buildEventRecord(input) {
  const now = input.now || Date.now();
  return {
    correlation_id: input.correlationId || newCorrelationId(),
    provider: String(input.provider || ""),
    connection_id: String(input.connectionId || ""),
    company_id: String(input.companyId || ""),
    entity_type: String(input.entityType || "order"),
    external_id: String(input.externalId || ""),
    event_type: String(input.eventType || ""),
    source: String(input.source || "webhook"),
    idempotency_key: String(input.idempotencyKey || ""),
    attempt: Number(input.attempt || 1),
    status: EVENT_STATUSES.has(input.status) ? input.status : "received",
    error_class: input.errorClass && ERROR_CLASSES.has(input.errorClass) ? input.errorClass : null,
    safe_message: input.safeMessage ? String(input.safeMessage).slice(0, 300) : null,
    started_at: new Date(now).toISOString(),
    finished_at: input.finishedAt ? new Date(input.finishedAt).toISOString() : null,
    next_retry_at: input.nextRetryAt ? new Date(input.nextRetryAt).toISOString() : null,
    expireAtMs: now + EVENT_TTL_MS
  };
}

/** What a failed attempt turns into: retrying with a delay, or dead (DLQ) — never lost. */
function outcomeForError(error, attempt, retryAfterSeconds = null) {
  const errorClass = classifyError(error);
  const delay = retryDelayMs(errorClass, attempt, retryAfterSeconds);
  return { errorClass, safeMessage: safeMessage(errorClass, error), status: delay === null ? "dead" : "retrying", nextRetryInMs: delay };
}

module.exports = { EVENT_STATUSES, ERROR_CLASSES, MAX_ATTEMPTS, EVENT_TTL_MS, newCorrelationId, classifyError, retryDelayMs, parseRetryAfter, safeMessage, idempotencyKey, eventDocId, buildEventRecord, outcomeForError };

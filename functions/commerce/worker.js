// The queue worker's brain (§5.1): fetch the latest entity, normalize, apply —
// and write down every attempt (§5.6). Transport-free: the Cloud Tasks handler
// in index.js hands this a task and the provider's functions; the emulator
// suite hands it fakes. Either way the record in commerceEvents is the same.
const events = require("./events");

const EVENT_COLLECTION = "commerceEvents";

function eventRef(db, key) { return db.collection(EVENT_COLLECTION).doc(events.eventDocId(key)); }

/** The gateway's half: the durable fact that an event arrived, before any work (SYNC-003/004). */
async function recordReceived(db, task, { now = Date.now(), status = "queued" } = {}) {
  const record = events.buildEventRecord({ ...task, idempotencyKey: task.key, status, attempt: task.attempt || 1, now });
  await eventRef(db, task.key).set({ ...record, expireAt: new Date(record.expireAtMs) }, { merge: true });
  return record;
}

/**
 * @param task  { key, provider, connectionId, companyId, externalId, eventType, attempt, eventOrigin, correlationId }
 * @param deps  { fetchLatest(task) → raw | null, normalize(raw, task) → envelope, apply(envelope, task) → outcome, now }
 */
async function processCommerceEvent(db, task, deps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const attempt = Number(task.attempt || 1);
  const ref = eventRef(db, task.key);
  const started = now();
  // The gateway minted the correlation id; a task that does not carry it must not erase it.
  await ref.set({ status: "processing", attempt, started_at: new Date(started).toISOString(), ...(task.correlationId ? { correlation_id: task.correlationId } : {}) }, { merge: true });

  try {
    const raw = await deps.fetchLatest(task);
    if (raw === null || raw === undefined) {
      const error = new Error("entity not found at provider"); error.errorClass = "not_found"; throw error;
    }
    const envelope = deps.normalize(raw, task);
    const outcome = await deps.apply(envelope, task);
    const status = ["created", "updated", "noop", "duplicate", "stale", "held", "skipped"].includes(outcome.result) ? (outcome.result === "created" || outcome.result === "updated" ? "applied" : outcome.result) : (outcome.result === "invalid" ? "dead" : "applied");
    const finished = now();
    await ref.set({
      status, attempt, finished_at: new Date(finished).toISOString(), external_id: String(task.externalId || envelope?.identity?.external_id || ""),
      result: outcome.result, order_id: outcome.orderId || null, error_class: outcome.result === "invalid" ? "validation" : null,
      safe_message: outcome.result === "invalid" ? `Envelope rejected: ${(outcome.problems || []).join(", ")}`.slice(0, 300) : (outcome.reason ? String(outcome.reason).slice(0, 300) : null), next_retry_at: null
    }, { merge: true });
    return { status, outcome, envelope };
  } catch (error) {
    const retryAfter = deps.retryAfterOf ? deps.retryAfterOf(error) : null;
    const verdict = events.outcomeForError(error, attempt, retryAfter);
    const finished = now();
    await ref.set({
      status: verdict.status, attempt, finished_at: new Date(finished).toISOString(),
      error_class: verdict.errorClass, safe_message: verdict.safeMessage,
      next_retry_at: verdict.nextRetryInMs ? new Date(finished + verdict.nextRetryInMs).toISOString() : null,
      ...(verdict.status === "dead" ? { dead_at: new Date(finished).toISOString() } : {})
    }, { merge: true });
    return { status: verdict.status, errorClass: verdict.errorClass, nextRetryInMs: verdict.nextRetryInMs, safeMessage: verdict.safeMessage };
  }
}

module.exports = { processCommerceEvent, recordReceived, eventRef, EVENT_COLLECTION };

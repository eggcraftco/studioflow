// §5.4 — one cursor per connection per entity type (REC-002), advanced only
// when a whole pass succeeded (REC-003), read back with an overlap so clock
// skew and boundary events cannot fall between two windows (REC-004/005).
// The Etsy watermark and the Shopify reconcile map both predate this; they
// keep working, and the common cursor is written beside them until Faz 3
// makes it the only one.
const COLLECTION = "commerceCursors";
const DEFAULT_OVERLAP_MS = 10 * 60 * 1000;
const DEFAULT_MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

function cursorDocId(provider, connectionId, entityType = "order") {
  return [provider, connectionId, entityType].map((v) => String(v || "").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 200)).join("__");
}
function cursorRef(db, provider, connectionId, entityType = "order") {
  return db.collection(COLLECTION).doc(cursorDocId(provider, connectionId, entityType));
}

/** The window a pass should ask the provider for, from the cursor as it stands. */
function cursorWindow(cursor, now, { overlapMs = DEFAULT_OVERLAP_MS, maxWindowMs = DEFAULT_MAX_WINDOW_MS, lookbackMs = DEFAULT_MAX_WINDOW_MS, force = false } = {}) {
  const watermark = Number(cursor?.watermarkMs || 0);
  if (force || !watermark) return { fromMs: now - lookbackMs, toMs: now, reason: force ? "forced" : "first_pass" };
  return { fromMs: Math.max(now - maxWindowMs, watermark - overlapMs), toMs: now, reason: "incremental" };
}

async function readCursor(db, provider, connectionId, entityType = "order") {
  const snap = await cursorRef(db, provider, connectionId, entityType).get();
  return snap.exists ? (snap.data() || {}) : null;
}

/**
 * Record a pass. The watermark moves to `toMs` ONLY when `complete` is true —
 * a truncated page set or a failed item leaves it where it was, so the next
 * pass covers the same ground again (REC-003, REC-008).
 */
async function recordPass(db, { provider, connectionId, entityType = "order", companyId, fromMs, toMs, complete, scanned = 0, applied = 0, failed = 0, truncated = false, error = null, now = Date.now() }) {
  const ref = cursorRef(db, provider, connectionId, entityType);
  const patch = {
    provider, connectionId, entityType, companyId: companyId || null,
    lastPassAtMs: now, lastPassFromMs: fromMs, lastPassToMs: toMs,
    lastPassComplete: Boolean(complete), lastPassScanned: scanned, lastPassApplied: applied, lastPassFailed: failed,
    lastPassTruncated: Boolean(truncated), lastError: error ? String(error).slice(0, 200) : null,
    updatedAtMs: now
  };
  if (complete) { patch.watermarkMs = toMs; patch.lastCompleteAtMs = now; }
  await ref.set(patch, { merge: true });
  return patch;
}

module.exports = { COLLECTION, DEFAULT_OVERLAP_MS, DEFAULT_MAX_WINDOW_MS, cursorDocId, cursorRef, cursorWindow, readCursor, recordPass };

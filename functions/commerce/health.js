// OBS-003/004 — connection health as freshness per entity, not a word.
//
// "Connected" says nothing about whether orders are arriving; this record
// says when the last order sync succeeded, when the last attempt was, how
// many retries are pending and how many events died, for orders, products,
// inventory and finance separately — or that the provider has no such
// capability, which is the honest answer for most of them today.
const { getCapabilities } = require("./capabilities");

const COLLECTION = "commerceHealth";
const ENTITIES = ["orders", "products", "inventory", "finance"];

function healthDocId(provider, connectionId) {
  return [provider, connectionId].map((v) => String(v || "").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 200)).join("__");
}
function healthRef(db, provider, connectionId) { return db.collection(COLLECTION).doc(healthDocId(provider, connectionId)); }

/**
 * Which entities this provider can even be fresh about — what THIS codebase
 * reads, not what the provider's API offers. The two were the same test until
 * now, so an entity nobody syncs reported "never", which reads as a sync that
 * has not run yet rather than one that does not exist. `implemented` in the
 * registry is the answer; the protocol blocks remain the fallback for an entry
 * that predates it.
 */
function supportedEntities(provider) {
  const caps = getCapabilities(provider) || {};
  const implemented = caps.implemented && typeof caps.implemented === "object" ? caps.implemented : null;
  if (implemented) {
    return {
      orders: implemented.orders === true,
      products: implemented.products === true,
      inventory: implemented.inventory === true,
      finance: implemented.finance === true
    };
  }
  return {
    orders: Boolean(caps.orders && caps.orders.read),
    products: Boolean(caps.products && caps.products.read),
    inventory: Boolean(caps.inventory && caps.inventory.read),
    finance: Boolean(caps.financial_ledger && caps.financial_ledger.read) || Boolean(caps.payments && caps.payments.read)
  };
}

/**
 * One touch per outcome. `kind`: "success" | "attempt" | "retry_scheduled" | "retry_cleared" | "dead" | "webhook".
 * Counters are Firestore increments so concurrent workers never race.
 */
async function touchHealth(db, { provider, connectionId, companyId, entity = "orders", kind, now = Date.now(), FieldValue }) {
  if (!ENTITIES.includes(entity)) return null;
  const inc = (n) => (FieldValue ? FieldValue.increment(n) : n);
  const base = { provider, connectionId, companyId: companyId || null, updatedAtMs: now, supported: supportedEntities(provider) };
  const patch = {};
  if (kind === "success") { patch[`${entity}.lastSuccessAtMs`] = now; patch[`${entity}.lastAttemptAtMs`] = now; }
  else if (kind === "attempt") { patch[`${entity}.lastAttemptAtMs`] = now; }
  else if (kind === "retry_scheduled") { patch[`${entity}.pendingRetries`] = inc(1); patch[`${entity}.lastAttemptAtMs`] = now; }
  else if (kind === "retry_cleared") { patch[`${entity}.pendingRetries`] = inc(-1); }
  else if (kind === "dead") { patch[`${entity}.deadLetters`] = inc(1); patch[`${entity}.lastAttemptAtMs`] = now; }
  else if (kind === "webhook") { patch[`${entity}.lastWebhookAtMs`] = now; }
  else return null;
  await healthRef(db, provider, connectionId).set({ ...base, ...unflatten(patch) }, { merge: true });
  return patch;
}

function unflatten(flat) {
  const out = {};
  for (const [path, value] of Object.entries(flat)) {
    const [head, tail] = path.split(".");
    if (!tail) { out[head] = value; continue; }
    out[head] = out[head] || {}; out[head][tail] = value;
  }
  return out;
}

/** The view a client renders: per entity, fresh / stale / never / unsupported, with the numbers behind it. */
function healthView(doc, provider, { now = Date.now(), staleAfterMs = 6 * 60 * 60 * 1000 } = {}) {
  const supported = supportedEntities(provider);
  const view = {};
  for (const entity of ENTITIES) {
    const row = (doc && doc[entity]) || {};
    if (!supported[entity]) { view[entity] = { state: "unsupported" }; continue; }
    const last = Number(row.lastSuccessAtMs || 0);
    const lagMs = last ? now - last : null;
    view[entity] = {
      state: !last ? "never" : (lagMs > staleAfterMs ? "stale" : "fresh"),
      lastSuccessAtMs: last || null, lastAttemptAtMs: Number(row.lastAttemptAtMs || 0) || null, lastWebhookAtMs: Number(row.lastWebhookAtMs || 0) || null,
      lagMs, pendingRetries: Math.max(0, Number(row.pendingRetries || 0)), deadLetters: Math.max(0, Number(row.deadLetters || 0))
    };
  }
  return view;
}

/**
 * Does anything in this codebase record sync health for the provider? A third
 * question, separate from what the API offers and from `implemented`: Etsy and
 * Amazon read orders and apply them, but no code calls touchHealth for them, so
 * no health document is ever written. Pinned against the source by
 * functions/test/qa/commerce-capability-truth.test.js.
 */
function recordsHealth(provider) {
  const caps = getCapabilities(provider) || {};
  return caps.healthInstrumented === true;
}

/**
 * CARD-001 — the one state the Sync health card renders, decided here so that
 * capability, health and the web cannot answer differently:
 *
 *   not_connected  no connection with this provider in this workspace
 *   not_supported  connected, but nothing here records health for it, so there
 *                  is nothing this card can ever report — the honest answer for
 *                  Etsy and Amazon, whose orders do sync
 *   never_synced   connected and instrumented, but no health row exists yet
 *   rows           health rows exist; the per-entity view answers instead
 *
 * The empty card was the bug: with no row and no state, it drew nothing, and a
 * blank card reads as "all quiet" rather than "not measured here".
 */
function healthCardState({ provider, connected, rows = 0 }) {
  if (connected !== true) return "not_connected";
  if (Number(rows) > 0) return "rows";
  return recordsHealth(provider) ? "never_synced" : "not_supported";
}

module.exports = { COLLECTION, ENTITIES, healthDocId, healthRef, supportedEntities, touchHealth, healthView, recordsHealth, healthCardState };

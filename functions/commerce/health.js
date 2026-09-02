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

/** Which entities this provider can even be fresh about. */
function supportedEntities(provider) {
  const caps = getCapabilities(provider) || {};
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

module.exports = { COLLECTION, ENTITIES, healthDocId, healthRef, supportedEntities, touchHealth, healthView };

// MIG-002 — shadow comparison: what the live path wrote next to what the
// common engine would have written, recorded per event, never touching the
// order. This is how the new engine earns the right to become primary.
const { eventDocId } = require("./events");
const { stableStringify } = require("./envelope");

const SHADOW_COLLECTION = "commerceShadow";
const SHADOW_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const IGNORED_KEYS = new Set(["updatedAt", "createdAt", "createdAtMs", "companyId", "communication"]);

function toComparable(value) {
  if (value && typeof value.toMillis === "function") return Math.floor(value.toMillis() / 1000);
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (Array.isArray(value)) return value.map(toComparable);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) { if (k === "id") continue; out[k] = toComparable(v); }   // line item ids are random on the live path
    return out;
  }
  return value;
}

/** Fields the engine would set to something other than what the live path left in the document. */
function diffPatchAgainstDoc(patch, doc) {
  const diffs = [];
  for (const [key, value] of Object.entries(patch || {})) {
    if (IGNORED_KEYS.has(key)) continue;
    const mine = stableStringify(toComparable(value));
    const live = doc && doc[key] !== undefined ? stableStringify(toComparable(doc[key])) : undefined;
    if (mine !== live) diffs.push({ field: key, engine: mine.slice(0, 300), live: live === undefined ? null : String(live).slice(0, 300) });
  }
  return diffs;
}

async function recordShadow(db, { companyId, envelope, eventKey, eventType, liveOutcome, engineOutcome, liveDoc, now = Date.now() }) {
  try {
    const diffs = engineOutcome && engineOutcome.patch ? diffPatchAgainstDoc(engineOutcome.patch, liveDoc) : [];
    const record = {
      provider: envelope.identity.provider, connectionId: envelope.identity.connection_id, externalId: envelope.identity.external_id,
      companyId, eventKey: eventKey || null, eventType: eventType || null,
      live: { status: String(liveOutcome?.status || ""), created: Boolean(liveOutcome?.created), orderId: String(liveOutcome?.nivadeskOrderId || "") },
      engine: { result: String(engineOutcome?.result || ""), orderId: String(engineOutcome?.orderId || ""), patchKeys: Object.keys(engineOutcome?.patch || {}), problems: engineOutcome?.problems || [] },
      sameOrderId: Boolean(liveOutcome?.nivadeskOrderId) && String(liveOutcome.nivadeskOrderId) === String(engineOutcome?.orderId || ""),
      agree: diffs.length === 0,
      diffCount: diffs.length,
      diffs: diffs.slice(0, 40),
      recordedAtMs: now,
      expireAt: new Date(now + SHADOW_TTL_MS)
    };
    await db.collection(SHADOW_COLLECTION).doc(eventDocId(eventKey || `${envelope.identity.provider}|${envelope.identity.connection_id}|${envelope.identity.external_id}|${now}`)).set(record);
    return record;
  } catch (error) {
    console.warn("commerce shadow: record failed:", error?.message || error);
    return null;
  }
}

module.exports = { recordShadow, diffPatchAgainstDoc, SHADOW_COLLECTION, SHADOW_TTL_MS };

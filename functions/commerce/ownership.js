// §4.3 — who owns which field, applied the same way on every path (AC-004).
//
// The shop owns the value of what the buyer said and paid; the studio owns
// the work. integrationOrderFields already encodes the first half — the
// shop-owned set, the blank rule, the append-only note, the per-channel
// "unknown" constants — and this module builds on it rather than copying it:
// the last copy of that function is what let a real bug through.
const {
  INTEGRATION_SHOP_OWNED_FIELDS, UNKNOWN_ON_UPDATE_BY_SOURCE, integrationOrderUpdate, mergeShopNote, isBlank
} = require("../integrationOrderFields");

// MERGE-001: never written by an external sync, whatever the envelope says.
const NIVADESK_OWNED_FIELDS = new Set([
  "status", "designStatus", "priority", "todoItems", "assignedToUid", "assignedToEmail",
  "historyLog", "deliveryTime", "extraStatuses", "internalNotes", "productionNotes",
  "isDelivered", "deliveredAt", "dispatchedAt", "customerOwned", "productionSteps",
  "materialsChecks", "estimate", "signature", "attachments", "ownerUid", "createdAt", "createdBy"
]);

// Platform-provided tracking fills a blank; it never replaces what the studio
// typed. The only way a provider's tracking overwrites a manual one is an
// explicit outbound command, which is not a sync.
const SHIPMENT_FILL_FIELDS = ["trackingNumber", "courier"];

/** Strip anything the studio owns out of a patch — defence in depth, logged by the caller. */
function withoutNivaDeskOwned(patch) {
  const clean = {}; const stripped = [];
  for (const [key, value] of Object.entries(patch || {})) {
    if (NIVADESK_OWNED_FIELDS.has(key)) { stripped.push(key); continue; }
    clean[key] = value;
  }
  return { patch: clean, stripped };
}

/**
 * The patch a sync may write for an order that already exists: shop-owned
 * fields only, blanks never overwrite, the note appends, the channel's
 * "unknown" constants stay out (MERGE-002/003/004/005).
 */
function updatePatch(mapped, existing, source) {
  const unknown = UNKNOWN_ON_UPDATE_BY_SOURCE[String(source || "")] || null;
  const merged = integrationOrderUpdate(mapped, false, existing || {}, unknown);
  return withoutNivaDeskOwned(merged).patch;
}

/** For a brand-new order the whole mapped shape is written, minus anything the studio owns. */
function createPatch(mapped) {
  return withoutNivaDeskOwned(mapped).patch;
}

/** Tracking from the provider's shipments: fills blanks, marks dispatch, never overwrites. */
function shipmentPatch(shipments, existing) {
  const latest = (shipments || []).filter((s) => s && (s.tracking_number || s.carrier)).slice(-1)[0];
  if (!latest) return {};
  const patch = {};
  const current = existing || {};
  if (latest.tracking_number && isBlank(current.trackingNumber)) patch.trackingNumber = String(latest.tracking_number);
  if (latest.carrier && isBlank(current.courier)) patch.courier = String(latest.carrier);
  const sameTracking = !isBlank(current.trackingNumber) && String(current.trackingNumber) === String(latest.tracking_number || "");
  if (current.isDispatched !== true && (patch.trackingNumber || sameTracking || !latest.tracking_number)) patch.isDispatched = true;
  return patch;
}

module.exports = {
  NIVADESK_OWNED_FIELDS, PLATFORM_OWNED_FIELDS: INTEGRATION_SHOP_OWNED_FIELDS, SHIPMENT_FILL_FIELDS,
  UNKNOWN_ON_UPDATE_BY_SOURCE, mergeShopNote, isBlank, withoutNivaDeskOwned, updatePatch, createPatch, shipmentPatch
};

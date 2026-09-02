// The apply engine: one envelope in, one transactional decision out —
// created / updated / noop / duplicate / stale / held / skipped / invalid.
//
// It is the same function for a webhook, an import, a retry and a
// reconciliation pass (ARCH-007, MERGE-006), and it can run without writing
// (mode "shadow", MIG-002) so the live path and this one can be compared on
// real traffic before this one is trusted with a single write.
const { validateEnvelope, identityDocId, contentHash } = require("./envelope");
const ownership = require("./ownership");
const projection = require("./envelopeToOrder");

const ENTITY_COLLECTION = "externalEntities";
const ORDER_COLLECTION = "siparisler";
// §10.5 Mapping Review Queue — one row per order the engine could apply but
// could not vouch for (an ad-hoc line, a missing total, an unresolved
// variation). Kept beside the order so the clients can list "needs review"
// without a composite index, and cleared the moment a later apply is clean.
const REVIEW_COLLECTION = "commerceReviewQueue";

function isoNewer(a, b) {
  const ta = a ? Date.parse(a) : NaN; const tb = b ? Date.parse(b) : NaN;
  return Number.isFinite(ta) && Number.isFinite(tb) && ta > tb;
}

function historyEntry(title, oldValue, newValue, now) {
  return { id: require("crypto").randomUUID(), createdAtMs: now, title, oldValue: String(oldValue || "-"), newValue: String(newValue || "-") };
}

/**
 * @param db   Firestore
 * @param envelope  canonical envelope
 * @param ctx  { companyId, mode: "shadow"|"apply", eventKey, orderIdFor(envelope), source,
 *              defaultDeliveryTime, defaultStatus, reconcileLineItems, syncCancellations,
 *              capacity: async () => ({ allowed }), hold: async (envelope) => void, now }
 */
async function applyEnvelope(db, envelope, ctx) {
  const now = Number(ctx.now) || Date.now();
  const mode = ctx.mode === "apply" ? "apply" : "shadow";
  const problems = validateEnvelope(envelope);
  if (problems.length) return { result: "invalid", problems };
  if (envelope.order.is_test) return { result: "skipped", reason: "test_order" };   // SYNC-006
  if (!ctx.companyId || typeof ctx.orderIdFor !== "function") return { result: "invalid", problems: ["ctx"] };

  const identityRef = db.collection(ENTITY_COLLECTION).doc(identityDocId(envelope.identity));
  const hash = contentHash(envelope);
  const source = ctx.source || envelope.identity.provider;
  const shopOwned = projection.shopOwnedFields(envelope, ctx);

  const decide = async (tx) => {
    const identitySnap = await tx.get(identityRef);
    const identityData = identitySnap.exists ? (identitySnap.data() || {}) : null;
    if (identityData && identityData.companyId && identityData.companyId !== ctx.companyId) {
      // DATA-002: the identity is bound to another workspace; never cross the line.
      return { result: "invalid", problems: ["identity_bound_to_other_workspace"] };
    }
    const orderId = String((identityData && identityData.nivadeskOrderId) || ctx.orderIdFor(envelope));
    const orderRef = db.collection(ORDER_COLLECTION).doc(orderId);
    const orderSnap = await tx.get(orderRef);
    const existing = orderSnap.exists ? (orderSnap.data() || {}) : null;
    const stamp = (existing && existing.commerce) || {};

    if (existing) {
      if (ctx.eventKey && stamp.lastEventKey === ctx.eventKey) return { result: "duplicate", orderId };   // SYNC-014
      if (isoNewer(stamp.externalUpdatedAt, envelope.identity.external_updated_at)) return { result: "stale", orderId };   // SYNC-013
    }

    const commerce = {
      schemaVersion: envelope.schema_version,
      provider: envelope.identity.provider,
      connectionId: envelope.identity.connection_id,
      externalId: envelope.identity.external_id,
      externalUpdatedAt: envelope.identity.external_updated_at,
      contentHash: hash,
      lastEventKey: ctx.eventKey || null,
      lastEventOrigin: envelope.identity.event_origin,
      lastAppliedAtMs: now,
      reviewRequired: envelope.review.required,
      reviewReasons: envelope.review.reasons,
      // UX-010/012 — what the Channel Details strip shows on every client,
      // provider-agnostic: a badge, the connection's name, the platform's own
      // number and statuses, and a safe "open at the provider" link.
      providerDisplayName: envelope.source.provider_display_name || envelope.identity.provider,
      connectionDisplayName: envelope.source.connection_display_name || null,
      orderNumber: String((envelope.source.provider_metadata || {}).order_number || envelope.identity.external_id),
      externalAdminUrl: envelope.source.external_admin_url || null,
      platformStatus: envelope.order.platform_status || null,
      paymentStatus: envelope.order.payment_status || null,
      fulfillmentStatus: envelope.order.fulfillment_status || null,
      currency: envelope.order.currency || null,
      grandTotal: envelope.order.grand_total || null
    };
    const identityWrite = {
      provider: envelope.identity.provider, connectionId: envelope.identity.connection_id,
      entityType: envelope.identity.entity_type, externalId: envelope.identity.external_id,
      companyId: ctx.companyId, nivadeskOrderId: orderId,
      externalUpdatedAt: envelope.identity.external_updated_at, contentHash: hash, updatedAtMs: now
    };

    if (!existing) {
      if (ctx.capacity) {
        const capacity = await ctx.capacity();
        if (capacity && capacity.allowed === false) {
          if (mode === "apply" && ctx.hold) await ctx.hold(envelope, capacity);
          return { result: "held", orderId, reason: "plan_limit_reached" };
        }
      }
      const patch = { ...projection.newOrderDefaults(ctx), ...ownership.createPatch(shopOwned), ...ownership.shipmentPatch(envelope.shipments, {}) };
      if (envelope.order.platform_status === "cancelled" && ctx.syncCancellations !== false) patch.status = "Cancelled";
      if (mode === "apply") {
        tx.set(orderRef, { ...patch, commerce, createdAtMs: now }, { merge: true });
        tx.set(identityRef, { ...identityWrite, createdAtMs: now }, { merge: true });
        writeReview(tx, db, orderId, envelope, ctx, now);
      }
      return { result: mode === "apply" ? "created" : "would_create", orderId, patch };
    }

    if (stamp.contentHash === hash) {
      if (mode === "apply") { tx.set(orderRef, { commerce }, { merge: true }); tx.set(identityRef, identityWrite, { merge: true }); }
      return { result: "noop", orderId };   // SYNC-016
    }
    const patch = { ...ownership.updatePatch(shopOwned, existing, source), ...ownership.shipmentPatch(envelope.shipments, existing) };
    // The one platform status that reaches the workflow: a cancellation, when
    // the workspace has asked for it (§4.4 keeps the two statuses apart; this
    // is the merchant's own rule, not the provider's).
    if (envelope.order.platform_status === "cancelled" && ctx.syncCancellations !== false && String(existing.status || "") !== "Cancelled") {
      patch.status = "Cancelled";
      patch.historyLog = [historyEntry("Order cancelled", existing.status, "Cancelled", now), ...(Array.isArray(existing.historyLog) ? existing.historyLog : [])];
    }
    const changed = Object.keys(patch);
    if (mode === "apply") {
      tx.set(orderRef, { ...patch, commerce }, { merge: true });
      tx.set(identityRef, identityWrite, { merge: true });
      writeReview(tx, db, orderId, envelope, ctx, now);
    }
    return { result: changed.length ? (mode === "apply" ? "updated" : "would_update") : "noop", orderId, patch };
  };

  return mode === "apply" ? db.runTransaction(decide) : decide(readOnlyTx(db));
}

/** The review row: written when the envelope asks for review, removed when a later apply is clean. */
function writeReview(tx, db, orderId, envelope, ctx, now) {
  const ref = db.collection(REVIEW_COLLECTION).doc(orderId);
  if (envelope.review.required) {
    tx.set(ref, {
      companyId: ctx.companyId, orderId, provider: envelope.identity.provider, connectionId: envelope.identity.connection_id, externalId: envelope.identity.external_id,
      providerDisplayName: envelope.source.provider_display_name || envelope.identity.provider, orderNumber: String((envelope.source.provider_metadata || {}).order_number || envelope.identity.external_id),
      customerName: envelope.customer.name || null, grandTotal: envelope.order.grand_total || null, currency: envelope.order.currency || null,
      reasons: envelope.review.reasons, resolved: false, updatedAtMs: now
    }, { merge: true });
  } else {
    tx.delete(ref);
  }
}

/** Shadow mode reads through a fake transaction so the decision code is identical. */
function readOnlyTx(db) {
  return { get: (ref) => ref.get(), set: () => { throw new Error("shadow mode must not write"); } };
}

module.exports = { applyEnvelope, ENTITY_COLLECTION, ORDER_COLLECTION, REVIEW_COLLECTION };

// The Etsy sync engine: fetch, preview, import, reconcile.
//
// The shape of this file follows one sentence from the brief: the same receipt
// must land on the same order no matter how it arrives. It can arrive four
// ways — the first import, a webhook, a reconciliation sweep, or a seller
// pressing Sync now — and all four go through applyReceipt() so there is one
// place where "have I already got this, and is what I have newer?" is decided.
//
// Two guards are doing the real work there:
//
//   * The external-order document id IS the uniqueness key
//     (workspace + shop + receipt). Two workers racing cannot create two rows,
//     because there is only one id to create.
//   * `externalUpdatedAtMs` is compared before writing. Webhooks arrive out of
//     order; without this, a stale delivery overwrites a newer state and the
//     order silently goes backwards.
//
// And the rule that outranks both: an update only ever writes Etsy-owned
// fields. The studio's production steps, notes, assignments, costs and files
// are untouchable by a sync. That is enforced by integrationOrderUpdate, which
// already does this job for Shopify and WooCommerce.

const RECEIPT_PAGE_SIZE = 100;          // Etsy's maximum for getShopReceipts
const MAX_PREVIEW_RECEIPTS = 500;       // one preview should not eat the daily quota
const RECONCILE_OVERLAP_MS = 10 * 60 * 1000;  // re-ask a small window either side of the watermark
// One sweep must not be able to spend the whole app-wide daily quota. Oldest
// watermark first, so a shop skipped this run is first in line on the next.
const MAX_CONNECTIONS_PER_SWEEP = 25;

function createEtsySyncFunctions(deps) {
  const {
    admin,
    onCall,
    HttpsError,
    etsy,
    customerMatch,
    connect,                    // the _internal helpers from etsyConnect
    requireWorkspaceMember,
    requireWorkspaceOwner,
    // NivaDesk-side helpers, injected so Etsy reuses the shop pipeline rather
    // than growing a parallel one.
    orderDocRef,
    integrationOrderUpdate,
    integrationOrderCapacity,
    holdIntegrationOrder,
    upsertIntegrationCustomer,
    reconcileLineItems,
    resolveDefaultDeliveryTime,
    companySettingsDocRef,
    customersOfCompany,         // (companyId) => query
    sendPushNotificationToCompany = async () => {},
    onSchedule = null,
    now = () => Date.now()
  } = deps;

  const db = () => admin.firestore();
  const externalOrders = () => db().collection(etsy.EXTERNAL_ORDER_COLLECTION);
  const customerLinks = () => db().collection(etsy.CUSTOMER_LINK_COLLECTION);

  function millis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // -------------------------------------------------------------------------
  // Fetching
  // -------------------------------------------------------------------------

  /**
   * Page through a shop's receipts.
   *
   * `minLastModified` is the reconciliation path and the cheap one: it asks
   * Etsy only for what changed, which is why a full re-walk of the history is
   * never needed. The daily quota is shared across every NivaDesk seller, so
   * this distinction is not a micro-optimisation.
   */
  async function fetchReceipts(connectionRef, shopId, {
    minCreated = 0,
    minLastModified = 0,
    max = MAX_PREVIEW_RECEIPTS,
    wasPaid = null,
    wasCanceled = null
  } = {}) {
    const collected = [];
    let offset = 0;
    let truncated = false;

    while (collected.length < max) {
      const limit = Math.min(RECEIPT_PAGE_SIZE, max - collected.length);
      const page = await connect.callEtsy(connectionRef, `/shops/${encodeURIComponent(shopId)}/receipts`, {
        query: {
          limit,
          offset,
          min_created: minCreated ? Math.floor(minCreated / 1000) : undefined,
          min_last_modified: minLastModified ? Math.floor(minLastModified / 1000) : undefined,
          was_paid: wasPaid === null ? undefined : String(wasPaid),
          was_canceled: wasCanceled === null ? undefined : String(wasCanceled),
          sort_on: "created",
          sort_order: "down"
        }
      });
      const results = Array.isArray(page?.results) ? page.results : [];
      collected.push(...results);
      const total = Number(page?.count);
      offset += results.length;
      if (!results.length || results.length < limit) break;
      if (Number.isFinite(total) && offset >= total) break;
      if (collected.length >= max) {
        truncated = Number.isFinite(total) ? total > collected.length : true;
        break;
      }
      // Stay inside 5 requests/second with room to spare.
      await new Promise((resolve) => setTimeout(resolve, etsy.ETSY_MIN_CALL_GAP_MS));
    }
    return { receipts: collected, truncated };
  }

  // -------------------------------------------------------------------------
  // Classification
  // -------------------------------------------------------------------------

  /**
   * What the preview says about one receipt.
   *
   * "unsupported" is never silent. Every receipt NivaDesk will not import
   * carries the reason, and the reason survives into the import history.
   */
  function classify(normalised, rules) {
    const codes = normalised.review.map((row) => row.code);
    if (codes.includes("cancelled_at_source") && !rules.includeCancelled) {
      return { outcome: "unsupported", reason: "cancelled_at_source" };
    }
    if (codes.includes("digital_only") && !rules.includeDigital) {
      return { outcome: "unsupported", reason: "digital_only" };
    }
    if (codes.includes("no_line_items")) {
      return { outcome: "unsupported", reason: "no_line_items" };
    }
    if (codes.includes("not_paid") && !rules.includeUnpaid) {
      return { outcome: "unsupported", reason: "not_paid" };
    }
    if (codes.includes("currency_mismatch")) {
      return { outcome: "review", reason: "currency_mismatch" };
    }
    if (codes.includes("no_buyer_id")) {
      return { outcome: "review", reason: "no_buyer_id" };
    }
    return { outcome: "ready", reason: "" };
  }

  function normaliseRules(raw) {
    return {
      sinceDays: Math.min(Math.max(Number(raw?.sinceDays) || 90, 1), 730),
      includeCompleted: raw?.includeCompleted === true,
      includeCancelled: raw?.includeCancelled === true,
      includeDigital: raw?.includeDigital === true,
      includeUnpaid: raw?.includeUnpaid === true
    };
  }

  async function loadCustomerCandidates(companyId, source) {
    // Cheap first: an exact buyer-id hit needs no scan at all.
    const buyerId = String(source?.buyerUserId || "");
    const candidates = [];
    if (buyerId) {
      try {
        const exact = await customersOfCompany(companyId).where("externalCustomerId", "==", buyerId).limit(3).get();
        exact.docs.forEach((docSnap) => candidates.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
      } catch (_error) { /* an index may be missing; fall through to the name scan */ }
    }
    if (candidates.length) return candidates;

    const name = String(source?.address?.name || "").trim();
    if (!name) return candidates;
    try {
      const byName = await customersOfCompany(companyId).where("name", "==", name).limit(5).get();
      byName.docs.forEach((docSnap) => candidates.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
    } catch (_error) { /* same */ }
    return candidates;
  }

  async function existingLinkFor(companyId, shopId, buyerId) {
    if (!buyerId) return null;
    const snap = await customerLinks().doc(etsy.customerLinkKey(companyId, shopId, buyerId)).get();
    return snap.exists ? snap.data() : null;
  }

  // -------------------------------------------------------------------------
  // Preview
  // -------------------------------------------------------------------------

  const previewEtsyImport = onCall({ region: "europe-west2", timeoutSeconds: 300 }, async (request) => {
    const { companyId } = await requireWorkspaceMember(request);
    const { ref, data } = await connect.loadConnection(request.data?.connectionId, companyId);
    const rules = normaliseRules(request.data?.rules);
    const shopId = String(data.externalShopId || "");
    const settings = await companySettingsDocRef(companyId).get().catch(() => null);
    const defaultDeliveryTime = resolveDefaultDeliveryTime(settings?.data() || {});

    const since = now() - rules.sinceDays * 86400000;
    const { receipts, truncated } = await fetchReceipts(ref, shopId, {
      minCreated: since,
      max: MAX_PREVIEW_RECEIPTS,
      wasCanceled: rules.includeCancelled ? null : false
    });

    const rows = [];
    let ready = 0; let review = 0; let unsupported = 0; let alreadyImported = 0; let newCustomers = 0;

    for (const receipt of receipts) {
      const normalised = etsy.normalizeEtsyReceipt(receipt, {
        companyId,
        shopId,
        shopName: String(data.externalShopName || ""),
        shopCurrency: String(data.shopCurrency || ""),
        defaultDeliveryTime,
        reconcileLineItems
      });
      if (!rules.includeCompleted && String(normalised.source.status) === "completed") continue;

      const key = etsy.externalOrderKey(companyId, shopId, normalised.source.receiptId);
      const existing = await externalOrders().doc(key).get();
      const already = existing.exists;
      if (already) alreadyImported += 1;

      const verdict = classify(normalised, rules);
      const link = await existingLinkFor(companyId, shopId, normalised.source.buyerUserId);
      const candidates = link ? [] : await loadCustomerCandidates(companyId, normalised.source);
      const proposal = customerMatch.proposeCustomerMatch({
        source: normalised.source,
        candidates,
        existingLink: link
      });
      if (proposal.decision === "create") newCustomers += 1;

      // A customer NivaDesk cannot place on its own is a review even when the
      // order itself is clean — linking the wrong person is the expensive
      // mistake, not a delayed import.
      const outcome = verdict.outcome === "ready" && proposal.decision === "review" ? "review" : verdict.outcome;
      if (outcome === "ready") ready += 1;
      else if (outcome === "review") review += 1;
      else unsupported += 1;

      rows.push({
        receiptId: normalised.source.receiptId,
        // The buyer id, not the receipt id, is the identity a remembered match
        // is keyed on — the client needs it to resolve one.
        buyerId: normalised.source.buyerUserId,
        alreadyImported: already,
        outcome,
        reason: verdict.reason || (proposal.decision === "review" ? "customer_review" : ""),
        createdAtMs: normalised.source.createdAtMs,
        customerName: normalised.source.address.name,
        currency: normalised.source.currency,
        total: normalised.source.grandTotal,
        itemTitles: normalised.source.items.map((item) => item.title).slice(0, 4),
        personalization: normalised.source.personalization.slice(0, 3),
        customer: {
          decision: proposal.decision,
          confidence: proposal.confidence,
          signals: proposal.signals,
          candidates: proposal.candidates
        }
      });
    }

    return {
      ok: true,
      shopId,
      shopName: String(data.externalShopName || ""),
      truncated,
      summary: {
        found: rows.length,
        ready,
        review,
        unsupported,
        alreadyImported,
        newCustomers
      },
      // Newest first: the seller recognises recent orders and can sanity-check
      // the mapping against something they remember.
      rows: rows.sort((a, b) => b.createdAtMs - a.createdAtMs)
    };
  });

  // -------------------------------------------------------------------------
  // Applying one receipt — the single path every arrival takes
  // -------------------------------------------------------------------------

  async function applyReceipt({ companyId, connectionRef, connectionData, receipt, defaultDeliveryTime, customerChoice = null }) {
    const shopId = String(connectionData.externalShopId || "");
    const normalised = etsy.normalizeEtsyReceipt(receipt, {
      companyId,
      shopId,
      shopName: String(connectionData.externalShopName || ""),
      shopCurrency: String(connectionData.shopCurrency || ""),
      defaultDeliveryTime,
      reconcileLineItems
    });
    const receiptId = normalised.source.receiptId;
    const key = etsy.externalOrderKey(companyId, shopId, receiptId);
    const externalRef = externalOrders().doc(key);
    const existingSnap = await externalRef.get();
    const existing = existingSnap.exists ? (existingSnap.data() || {}) : null;

    // Out-of-order protection. Etsy webhooks are not ordered, and a
    // reconciliation sweep can overtake one. Without this, an older snapshot
    // overwrites a newer one and the order quietly goes backwards.
    if (existing && Number(existing.externalUpdatedAtMs || 0) > normalised.source.updatedAtMs) {
      return { status: "stale", receiptId, orderId: String(existing.nivadeskOrderId || "") };
    }

    const isNew = !existing || !existing.nivadeskOrderId;
    const orderId = existing?.nivadeskOrderId || etsy.nivadeskOrderIdFor(shopId, receiptId);

    if (isNew) {
      // Plan limits are the workspace's, not Etsy's. A full workspace parks the
      // order rather than dropping it, exactly as the other shop channels do.
      const companySnap = await db().collection("companies").doc(companyId).get();
      const capacity = await integrationOrderCapacity(companyId, companySnap.data() || {});
      if (!capacity.allowed) {
        await holdIntegrationOrder(companyId, "etsy", receiptId, receipt, capacity);
        await externalRef.set({
          companyId, provider: "etsy", externalShopId: shopId, externalOrderId: receiptId,
          syncState: "held", externalUpdatedAtMs: normalised.source.updatedAtMs,
          lastSyncedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return { status: "held", receiptId };
      }
    }

    const orderRef = orderDocRef(orderId);
    await orderRef.set(integrationOrderUpdate(normalised.order, isNew), { merge: true });

    // The read-only source panel. Kept apart from the order's own fields so a
    // resync can refresh it without ever reaching into the studio's work.
    await orderRef.set({ etsySource: normalised.source }, { merge: true });

    await externalRef.set({
      companyId,
      provider: "etsy",
      externalShopId: shopId,
      externalOrderId: receiptId,
      nivadeskOrderId: orderId,
      externalStatus: normalised.source.status,
      externalUpdatedAtMs: normalised.source.updatedAtMs,
      syncState: "synced",
      reviewReasons: normalised.review.map((row) => row.code),
      lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: existing?.createdAt || admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // The customer, best-effort: an order that arrived is worth more than a
    // perfect contact record, and the seller can resolve a match later.
    try {
      const buyerId = normalised.source.buyerUserId;
      const link = customerChoice?.customerId
        ? { customerId: customerChoice.customerId }
        : await existingLinkFor(companyId, shopId, buyerId);
      if (link?.customerId || customerChoice?.decision === "create") {
        await upsertIntegrationCustomer(companyId, normalised.customer, "etsy");
      } else if (!link) {
        const candidates = await loadCustomerCandidates(companyId, normalised.source);
        const proposal = customerMatch.proposeCustomerMatch({ source: normalised.source, candidates });
        if (proposal.decision !== "review") {
          await upsertIntegrationCustomer(companyId, normalised.customer, "etsy");
          if (buyerId && proposal.customerId) {
            await customerLinks().doc(etsy.customerLinkKey(companyId, shopId, buyerId)).set({
              companyId, externalShopId: shopId, externalBuyerId: buyerId,
              customerId: proposal.customerId, matchMethod: proposal.matchMethod,
              signals: proposal.signals,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          }
        }
      }
    } catch (error) {
      console.warn("etsy customer upsert failed:", error?.message || error);
    }

    if (isNew) {
      await connect.writeSyncEvent(connectionRef, { type: "order_imported", receiptId, orderId });
      await sendPushNotificationToCompany(companyId, {
        title: "New Etsy order",
        body: `${normalised.order.customerName}: ${normalised.order.designName}`.slice(0, 140),
        orderId,
        type: "etsy_order"
      }).catch(() => {});
    }
    return { status: isNew ? "created" : "updated", receiptId, orderId };
  }

  // -------------------------------------------------------------------------
  // Import and reconcile
  // -------------------------------------------------------------------------

  const runEtsyImport = onCall({ region: "europe-west2", timeoutSeconds: 540 }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref, data } = await connect.loadConnection(request.data?.connectionId, companyId);
    const rules = normaliseRules(request.data?.rules);
    const selection = Array.isArray(request.data?.receiptIds) ? request.data.receiptIds.map(String) : null;
    const choices = request.data?.customerChoices && typeof request.data.customerChoices === "object"
      ? request.data.customerChoices
      : {};

    const settings = await companySettingsDocRef(companyId).get().catch(() => null);
    const defaultDeliveryTime = resolveDefaultDeliveryTime(settings?.data() || {});
    const shopId = String(data.externalShopId || "");

    const { receipts } = await fetchReceipts(ref, shopId, {
      minCreated: now() - rules.sinceDays * 86400000,
      max: MAX_PREVIEW_RECEIPTS,
      wasCanceled: rules.includeCancelled ? null : false
    });

    const outcome = { created: 0, updated: 0, held: 0, skipped: 0, failed: 0, stale: 0 };
    const failures = [];
    await ref.set({ importState: "running", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    for (const receipt of receipts) {
      const receiptId = String(receipt?.receipt_id || "");
      if (selection && !selection.includes(receiptId)) { outcome.skipped += 1; continue; }
      try {
        const result = await applyReceipt({
          companyId,
          connectionRef: ref,
          connectionData: data,
          receipt,
          defaultDeliveryTime,
          customerChoice: choices[receiptId] || null
        });
        outcome[result.status] = (outcome[result.status] || 0) + 1;
      } catch (error) {
        outcome.failed += 1;
        // Named, kept, and shown. A partial import that hides its failures is
        // worse than one that reports them.
        failures.push({ receiptId, error: String(error?.code || error?.message || "unknown").slice(0, 120) });
        await connect.writeSyncEvent(ref, { type: "order_import_failed", receiptId, error: String(error?.code || "") });
      }
    }

    await ref.set({
      importState: "done",
      importedOrders: admin.firestore.FieldValue.increment(outcome.created),
      lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSuccessAt: admin.firestore.FieldValue.serverTimestamp(),
      // The watermark reconciliation resumes from. Deliberately behind now(),
      // so a receipt modified during this run is not missed.
      reconcileWatermarkMs: now() - RECONCILE_OVERLAP_MS,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { ok: true, outcome, failures: failures.slice(0, 25) };
  });

  /**
   * Ask Etsy only what changed since the watermark.
   *
   * This is the safety net under webhooks: a missed or late delivery is caught
   * here, and because it queries min_last_modified it costs one call rather
   * than a walk through the shop's history.
   */
  async function reconcileConnection(connectionRef, connectionData, { companyId }) {
    const shopId = String(connectionData.externalShopId || "");
    const watermark = Number(connectionData.reconcileWatermarkMs || 0) || (now() - 7 * 86400000);
    const settings = await companySettingsDocRef(companyId).get().catch(() => null);
    const defaultDeliveryTime = resolveDefaultDeliveryTime(settings?.data() || {});

    const { receipts } = await fetchReceipts(connectionRef, shopId, {
      minLastModified: Math.max(0, watermark - RECONCILE_OVERLAP_MS),
      max: RECEIPT_PAGE_SIZE
    });

    const outcome = { created: 0, updated: 0, stale: 0, held: 0, failed: 0 };
    for (const receipt of receipts) {
      try {
        const result = await applyReceipt({
          companyId, connectionRef, connectionData, receipt, defaultDeliveryTime
        });
        outcome[result.status] = (outcome[result.status] || 0) + 1;
      } catch (error) {
        outcome.failed += 1;
        await connect.writeSyncEvent(connectionRef, {
          type: "reconcile_failed",
          receiptId: String(receipt?.receipt_id || ""),
          error: String(error?.code || "")
        });
      }
    }

    await connectionRef.set({
      lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(outcome.failed ? {} : { lastSuccessAt: admin.firestore.FieldValue.serverTimestamp() }),
      // Only advance the watermark on a clean sweep. Moving it past a failure
      // is how a missed order becomes permanently missed.
      ...(outcome.failed ? {} : { reconcileWatermarkMs: now() - RECONCILE_OVERLAP_MS }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return outcome;
  }

  const syncEtsyNow = onCall({ region: "europe-west2", timeoutSeconds: 300 }, async (request) => {
    const { companyId } = await requireWorkspaceMember(request);
    const { ref, data } = await connect.loadConnection(request.data?.connectionId, companyId);
    const outcome = await reconcileConnection(ref, data, { companyId });
    return { ok: true, outcome };
  });

  const resolveEtsyCustomerMatch = onCall({ region: "europe-west2" }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { data } = await connect.loadConnection(request.data?.connectionId, companyId);
    const shopId = String(data.externalShopId || "");
    const buyerId = String(request.data?.buyerId || "").trim();
    const customerId = String(request.data?.customerId || "").trim();
    if (!buyerId || !customerId) {
      throw new HttpsError("invalid-argument", "A buyer and a customer are both required.");
    }
    await customerLinks().doc(etsy.customerLinkKey(companyId, shopId, buyerId)).set({
      companyId,
      externalShopId: shopId,
      externalBuyerId: buyerId,
      customerId,
      matchMethod: "user_confirmed",
      matchedByUserId: String(request.auth?.uid || ""),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { ok: true, remembered: true };
  });

  /**
   * The safety net under webhooks.
   *
   * Etsy's webhooks are good but not a guarantee: a delivery can be missed, a
   * function can be cold, an event can arrive out of order. Without a sweep
   * that asks "what changed since the watermark?", a missed order is missed
   * for good — and the seller would never know, because nothing failed
   * visibly.
   *
   * The daily API quota is 5,000 calls shared across EVERY NivaDesk seller, so
   * this is deliberately frugal: one call per shop per sweep (min_last_modified,
   * not a walk), a cap on how many shops one run touches, and oldest-first so
   * no connection can be starved by a busier one.
   */
  const reconcileEtsyConnections = onSchedule
    ? onSchedule(
        { schedule: "every 15 minutes", timeZone: "Europe/London", region: "europe-west2", timeoutSeconds: 540 },
        async () => {
          const snap = await db().collection(etsy.CONNECTION_COLLECTION)
            .where("status", "==", "connected")
            .get();
          const due = snap.docs
            .map((docSnap) => ({ ref: docSnap.ref, data: docSnap.data() || {} }))
            .filter((row) => String(row.data.companyId || ""))
            .sort((a, b) => Number(a.data.reconcileWatermarkMs || 0) - Number(b.data.reconcileWatermarkMs || 0))
            .slice(0, MAX_CONNECTIONS_PER_SWEEP);

          let swept = 0; let failed = 0;
          for (const row of due) {
            try {
              await reconcileConnection(row.ref, row.data, { companyId: String(row.data.companyId) });
              swept += 1;
            } catch (error) {
              failed += 1;
              console.warn("etsy reconcile failed:", row.ref.id, error?.code || error?.message || error);
            }
          }
          console.log(`etsy reconcile sweep: ${swept} shop(s), ${failed} failed, ${snap.size} connected`);
        }
      )
    : null;

  return {
    previewEtsyImport,
    runEtsyImport,
    syncEtsyNow,
    resolveEtsyCustomerMatch,
    reconcileEtsyConnections,
    _internal: { fetchReceipts, applyReceipt, reconcileConnection, classify, normaliseRules, loadCustomerCandidates }
  };
}

module.exports = {
  createEtsySyncFunctions,
  RECEIPT_PAGE_SIZE,
  MAX_PREVIEW_RECEIPTS,
  RECONCILE_OVERLAP_MS,
  MAX_CONNECTIONS_PER_SWEEP
};

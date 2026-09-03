"use strict";

// Puts the Finance Engine's answer onto the order document.
//
// A trigger rather than a change to each writer, because there are many
// writers and not all of them are ours to change: the web and Android
// callables, saveSwiftOrder, the direct Firestore write a Pro or Team Mac
// makes, five store integrations, the payment ledger and the bank module's
// refund link. One trigger covers every one of them, including a client we
// have not shipped yet.
//
// It writes only the `finance` block, and only when the block it computed
// differs from the block already stored. That is what stops it triggering
// itself: the second invocation computes the same numbers, finds no
// difference, and does nothing.
//
// Nothing else on the order is touched. `taxAmount` and `paymentFee` keep
// being whatever their writers say for now, so this can go live without
// changing a single number any screen shows — the block is additive until the
// clients are moved over to reading it.
//
// Spec: docs/finance-engine.md §8.

const { computeOrderFinance, ENGINE_VERSION } = require("./engine");

function createFinanceStamp({
  admin,
  onDocumentWritten,
  onCall,
  onSchedule,
  HttpsError,
  requireFinanceBackfill,
  region = "europe-west2"
}) {
  const db = () => admin.firestore();

  // One settings read per order write would be a read per order write. The
  // settings change rarely and a stale fee for a few seconds is corrected by
  // the next write or by the bulk recalculation, so a short per-instance cache
  // is the right trade.
  const SETTINGS_TTL_MS = 30_000;
  const settingsCache = new Map();

  async function financeSettingsFor(companyId, nowMs) {
    const cached = settingsCache.get(companyId);
    if (cached && nowMs - cached.at < SETTINGS_TTL_MS) return cached.settings;
    let settings = {};
    try {
      const snap = await db().collection("companySettings").doc(String(companyId)).get();
      settings = snap.exists ? snap.data() || {} : {};
    } catch (error) {
      console.warn("financeStamp settings read failed:", companyId, error?.message || error);
      return cached ? cached.settings : {};
    }
    settingsCache.set(companyId, { at: nowMs, settings });
    return settings;
  }

  function orderCompanyId(data = {}) {
    return String(data.companyId || "").trim();
  }

  function paymentDateMsOf(data = {}) {
    const value = data.paymentDate;
    if (!value) return NaN;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  // Everything the engine derives, compared field by field. The stamp itself
  // (`computedAtMs`) is deliberately left out of the comparison — including it
  // would make every block differ from the last one and the trigger would
  // write on every pass, for ever.
  const COMPARED = [
    "engineVersion", "method", "taxRate", "pricesIncludeVat", "vatRegistered",
    "revenue", "directCost", "grossMargin", "platformFee", "deliveryCost",
    "otherExpenses", "refunded", "vatBase", "vatDue", "netProfit",
    "customerTotal", "fromLineItems"
  ];

  function sameFinance(stored, computed) {
    if (!stored || typeof stored !== "object") return false;
    for (const field of COMPARED) {
      const a = stored[field];
      const b = computed[field];
      if (typeof b === "number") {
        if (!(typeof a === "number") || Math.abs(a - b) > 0.0049) return false;
      } else if (a !== b) {
        return false;
      }
    }
    const storedOrphans = Array.isArray(stored.orphanKeys) ? stored.orphanKeys : [];
    if (storedOrphans.length !== computed.orphanKeys.length) return false;
    for (let i = 0; i < storedOrphans.length; i += 1) {
      if (storedOrphans[i] !== computed.orphanKeys[i]) return false;
    }
    return true;
  }

  /**
   * The block as it goes onto the document. The per-line detail the engine
   * returns stays out of Firestore — a screen that wants the lines already has
   * the customFields they came from, and an order with forty custom rows would
   * otherwise carry them twice.
   */
  function financeBlockFor(orderData, settings, nowMs) {
    const computed = computeOrderFinance(orderData, settings, {
      paymentDateMs: paymentDateMsOf(orderData)
    });
    const block = {};
    for (const field of COMPARED) block[field] = computed[field];
    block.orphanKeys = computed.orphanKeys;
    return { computed, block: { ...block, computedAtMs: nowMs } };
  }

  const stampOrderFinance = onDocumentWritten(
    { document: "siparisler/{orderId}", region },
    async (event) => {
      const after = event.data?.after;
      if (!after?.exists) return;
      const data = after.data() || {};
      const companyId = orderCompanyId(data);
      if (!companyId) return;

      const nowMs = Date.now();
      const settings = await financeSettingsFor(companyId, nowMs);
      const { computed, block } = financeBlockFor(data, settings, nowMs);

      if (sameFinance(data.finance, computed)) return;

      try {
        await after.ref.update({ finance: block });
      } catch (error) {
        console.warn("financeStamp write failed:", event.params?.orderId, error?.message || error);
      }
    }
  );

  // ------------------------------------------------------------------------
  // The backfill
  //
  // The trigger only fires when an order is written, so orders that have not
  // been touched since the engine landed carry no block. This walks the
  // workspace once and stamps them.
  //
  // Not gated on a plan: the block is what every screen reads, so a Free
  // workspace needs it exactly as much as a Team one. Owner or admin, because
  // it rewrites derived money on every order.
  // ------------------------------------------------------------------------
  const BACKFILL_BATCH = 400;

  const backfillWorkspaceFinance = onCall(
    { region, timeoutSeconds: 540, memory: "512MiB" },
    async (request) => {
      const { uid, companyId, email } = await requireFinanceBackfill(request);
      const dryRun = request.data?.dryRun === true;

      const database = db();
      const settings = await financeSettingsFor(companyId, Date.now());
      const snapshot = await database.collection("siparisler").where("companyId", "==", companyId).get();

      let batch = database.batch();
      let pending = 0;
      let stamped = 0;
      let unchanged = 0;
      const changedFigures = [];

      async function flush(force) {
        if (pending === 0) return;
        if (!force && pending < BACKFILL_BATCH) return;
        await batch.commit();
        batch = database.batch();
        pending = 0;
      }

      for (const orderDoc of snapshot.docs) {
        const data = orderDoc.data() || {};
        const nowMs = Date.now();
        const { computed, block } = financeBlockFor(data, settings, nowMs);
        if (sameFinance(data.finance, computed)) {
          unchanged += 1;
          continue;
        }
        // What the old figures said next to what the engine says, so the person
        // who pressed the button can see the shape of the change before and
        // after rather than being told a count.
        if (changedFigures.length < 25) {
          changedFigures.push({
            orderId: orderDoc.id,
            customerName: String(data.customerName || ""),
            wasTaxAmount: Number(data.taxAmount) || 0,
            nowVatDue: computed.vatDue,
            wasPaymentFee: Number(data.paymentFee) || 0,
            nowPlatformFee: computed.platformFee,
            nowNetProfit: computed.netProfit,
            method: computed.method
          });
        }
        stamped += 1;
        if (dryRun) continue;
        batch.update(orderDoc.ref, { finance: block });
        pending += 1;
        await flush(false);
      }

      if (!dryRun) await flush(true);

      console.log("backfillWorkspaceFinance", { companyId, uid, dryRun, stamped, unchanged, total: snapshot.size });
      return {
        ok: true,
        companyId,
        dryRun,
        total: snapshot.size,
        stamped,
        unchanged,
        engineVersion: ENGINE_VERSION,
        samples: changedFigures,
        message: dryRun
          ? `${stamped} of ${snapshot.size} orders would be recalculated.`
          : `Recalculated ${stamped} of ${snapshot.size} orders.`
      };
    }
  );

  // ------------------------------------------------------------------------
  // The sweep
  //
  // The trigger only sees an order that is written, and the backfill needs
  // somebody to press it. Neither migrates the orders already sitting there,
  // so this walks every order in the database once and stamps the ones whose
  // block is missing or was computed by an older engine.
  //
  // Paged by document id, which needs no index, with the cursor kept in a
  // single document. When it reaches the end it records the version it
  // finished and then does nothing at all — until the engine version changes,
  // which starts it again. That is what makes a formula change a deployment
  // rather than a migration script.
  // ------------------------------------------------------------------------
  const SWEEP_PAGE = 1000;
  const SWEEP_WRITE_LIMIT = 2000;

  function sweepStateRef() {
    return db().collection("financeEngineSweeps").doc("state");
  }

  async function runFinanceSweep() {
    const stateSnap = await sweepStateRef().get().catch(() => null);
    const state = stateSnap && stateSnap.exists ? stateSnap.data() || {} : {};

    if (Number(state.completedVersion) === ENGINE_VERSION) {
      return { ok: true, done: true, reason: "already_swept_for_this_version", engineVersion: ENGINE_VERSION };
    }

    const startAfterId = String(state.cursorDocId || "");
    const database = db();
    let query = database.collection("siparisler").orderBy(admin.firestore.FieldPath.documentId()).limit(SWEEP_PAGE);
    if (startAfterId) query = query.startAfter(startAfterId);

    const page = await query.get();
    if (page.empty) {
      await sweepStateRef().set({
        completedVersion: ENGINE_VERSION,
        cursorDocId: "",
        completedAtMs: Date.now()
      }, { merge: true });
      console.log("financeSweep finished", { engineVersion: ENGINE_VERSION });
      return { ok: true, done: true, engineVersion: ENGINE_VERSION };
    }

    const settingsByCompany = new Map();
    let batch = database.batch();
    let pending = 0;
    let stamped = 0;
    let unchanged = 0;

    async function flush(force) {
      if (pending === 0) return;
      if (!force && pending < 400) return;
      await batch.commit();
      batch = database.batch();
      pending = 0;
    }

    for (const orderDoc of page.docs) {
      if (stamped >= SWEEP_WRITE_LIMIT) break;
      const data = orderDoc.data() || {};
      const companyId = orderCompanyId(data);
      if (!companyId) { unchanged += 1; continue; }

      if (!settingsByCompany.has(companyId)) {
        settingsByCompany.set(companyId, await financeSettingsFor(companyId, Date.now()));
      }
      const { computed, block } = financeBlockFor(data, settingsByCompany.get(companyId), Date.now());
      if (sameFinance(data.finance, computed)) { unchanged += 1; continue; }

      batch.update(orderDoc.ref, { finance: block });
      pending += 1;
      stamped += 1;
      await flush(false);
    }
    await flush(true);

    const lastId = page.docs[page.docs.length - 1].id;
    await sweepStateRef().set({
      cursorDocId: lastId,
      lastRunAtMs: Date.now(),
      lastRunStamped: stamped,
      lastRunUnchanged: unchanged,
      engineVersion: ENGINE_VERSION
    }, { merge: true });

    console.log("financeSweep page", { stamped, unchanged, read: page.size, cursorDocId: lastId });
    return { ok: true, done: false, stamped, unchanged, read: page.size };
  }

  const scheduledFinanceSweep = onSchedule(
    { schedule: "every 20 minutes", timeZone: "Europe/London", region, timeoutSeconds: 540, memory: "512MiB" },
    async () => { await runFinanceSweep(); }
  );

  return {
    stampOrderFinance,
    backfillWorkspaceFinance,
    scheduledFinanceSweep,
    _internal: { financeBlockFor, sameFinance, financeSettingsFor, runFinanceSweep, sweepStateRef, COMPARED, ENGINE_VERSION }
  };
}

module.exports = { createFinanceStamp };

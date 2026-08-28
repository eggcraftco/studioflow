// Production: where every live order actually is on the bench.
//
// The rule that shapes this whole module: production status is NOT order
// status, payment status or delivery status. An order can be paid, undelivered
// and still sitting in Quality Check. Keeping them apart is the point — mixing
// them is what makes a workshop lose track of its own work.
//
// Two levels, deliberately:
//   * Production STEPS   — the real work items, already configured per
//                          workspace as `customSteps` (Design, Casting, …) and
//                          answered per order in designStatus/status/extraStatuses.
//   * Production STAGE   — the one-line summary a board column represents.
//
// The stage is DERIVED from the steps rather than stored, so it can never
// disagree with them. Only two things are written to the order: an explicit
// human override (someone dragged the card) and the blocker. Everything else
// every platform computes with the same rule below, which is why a Mac writing
// a step directly to Firestore still lands in the right column on the web.

const DEFAULT_PRODUCTION_STAGES = [
  { id: "ready", title: "Ready", kind: "ready", wipLimit: 10 },
  { id: "in_production", title: "In Production", kind: "active", wipLimit: 10 },
  { id: "blocked", title: "Waiting / Blocked", kind: "blocked", wipLimit: 10 },
  { id: "quality_check", title: "Quality Check", kind: "review", wipLimit: 10 },
  { id: "ready_to_ship", title: "Ready to Ship", kind: "shipready", wipLimit: 10 },
  { id: "done", title: "Done", kind: "done", wipLimit: 0 }
];

// `kind` carries the meaning, `title` is the workspace's own word for it. A
// jeweller renaming "In Production" to "Casting" must not break the rule that
// decides which column demands a blocker reason.
const STAGE_KINDS = ["ready", "active", "blocked", "review", "shipready", "done"];

// Exactly one lane can mean "not started", "stuck" and "finished"; the middle
// of the board is the part a workshop should be free to shape.
const SINGLETON_KINDS = ["ready", "blocked", "done"];

const BLOCKER_REASONS = [
  "waiting_for_customer_approval",
  "material_unavailable",
  "supplier_delay",
  "technical_problem",
  "other"
];

// Step answers that mean the step is finished / actively being worked on. The
// vocabulary is the workspace's (DEFAULT_STATUS_OPTIONS + custom), so match on
// meaning rather than an exact list.
const DONE_STEP_VALUES = new Set(["done", "complete", "completed", "finished", "yes", "ready"]);
const IDLE_STEP_VALUES = new Set(["", "not yet", "new", "none", "no", "pending", "todo", "to do", "waiting"]);

function slugifyStageId(value, fallback) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || fallback;
}

function cleanStageTitle(value, fallback) {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, 40);
  return text || fallback;
}

function cleanWipLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0; // 0 = no limit
  return Math.min(999, Math.round(number));
}

// Read the workspace's stages, repairing anything a stale client wrote. The
// board must always render, so this never throws — it falls back instead.
function productionStagesFromSettings(settingsData = {}) {
  const raw = Array.isArray(settingsData.productionStages) ? settingsData.productionStages : [];
  const stages = [];
  const seenIds = new Set();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const kind = STAGE_KINDS.includes(String(entry.kind)) ? String(entry.kind) : "active";
    const title = cleanStageTitle(entry.title, "");
    if (!title) continue;
    let id = slugifyStageId(entry.id || title, `stage_${stages.length + 1}`);
    while (seenIds.has(id)) id = `${id}_${stages.length + 1}`;
    seenIds.add(id);
    stages.push({ id, title, kind, wipLimit: cleanWipLimit(entry.wipLimit) });
  }
  if (stages.length === 0) return DEFAULT_PRODUCTION_STAGES.map((stage) => ({ ...stage }));

  // A board with no "stuck" or "finished" lane cannot answer the questions it
  // exists to answer, so the missing ones are appended rather than refused.
  for (const kind of SINGLETON_KINDS) {
    if (stages.some((stage) => stage.kind === kind)) continue;
    const fallback = DEFAULT_PRODUCTION_STAGES.find((stage) => stage.kind === kind);
    const id = seenIds.has(fallback.id) ? `${fallback.id}_${stages.length + 1}` : fallback.id;
    seenIds.add(id);
    if (kind === "ready") stages.unshift({ ...fallback, id });
    else stages.push({ ...fallback, id });
  }
  if (!stages.some((stage) => stage.kind === "active")) {
    stages.splice(1, 0, { ...DEFAULT_PRODUCTION_STAGES[1], id: "in_production_1" });
  }
  return stages;
}

function stageOfKind(stages, kind) {
  return stages.find((stage) => stage.kind === kind) || null;
}

function normalizeStepValue(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function stepIsDone(value) {
  return DONE_STEP_VALUES.has(normalizeStepValue(value));
}

function stepIsIdle(value) {
  const normalized = normalizeStepValue(value);
  return normalized === "" || IDLE_STEP_VALUES.has(normalized);
}

// Mirrors the client: step 0 answers in designStatus, step 1 in status, the
// rest in extraStatuses keyed either by `statusStep::<id>` or by raw title.
function stepValueForOrder(orderData, step, index) {
  const extras = orderData && typeof orderData.extraStatuses === "object" && orderData.extraStatuses
    ? orderData.extraStatuses
    : {};
  const rawId = String(step.id || step.title || "").trim();
  const keyed = extras[`statusStep::${rawId.toLowerCase()}`];
  if (typeof keyed === "string" && keyed.trim()) return keyed;
  const byTitle = extras[step.title];
  if (typeof byTitle === "string" && byTitle.trim()) return byTitle;
  if (index === 0) return String(orderData.designStatus || "");
  if (index === 1) return String(orderData.status || "");
  return "";
}

function cleanBlocker(value) {
  if (!value || typeof value !== "object") return null;
  const reason = BLOCKER_REASONS.includes(String(value.reason)) ? String(value.reason) : "";
  if (!reason) return null;
  return {
    reason,
    note: String(value.note == null ? "" : value.note).replace(/\s+/g, " ").trim().slice(0, 240)
  };
}

/**
 * The single rule every platform follows. Returns the stage id an order sits
 * in, plus what it was derived from so the UI can explain itself.
 */
function resolveProductionStage(orderData = {}, stages = DEFAULT_PRODUCTION_STAGES, steps = []) {
  const blocked = stageOfKind(stages, "blocked");
  const ready = stageOfKind(stages, "ready") || stages[0];
  const done = stageOfKind(stages, "done") || stages[stages.length - 1];
  const shipReady = stageOfKind(stages, "shipready") || stageOfKind(stages, "review") || done;
  const firstActive = stages.find((stage) => stage.kind === "active") || ready;

  const values = steps.map((step, index) => stepValueForOrder(orderData, step, index));
  const doneCount = values.filter(stepIsDone).length;
  const total = steps.length;

  // A blocker outranks everything: a stuck job is stuck wherever it stood.
  const blocker = cleanBlocker(orderData.productionBlocker);
  if (blocker && blocked) {
    return { stageId: blocked.id, source: "blocker", doneCount, total, blocker };
  }

  // An override is a person's decision; only a delivered order overrules it,
  // because nothing still on the bench can already be with the customer.
  const delivered = orderData.isDelivered === true;
  const override = String(orderData.productionStageOverride || "").trim();
  if (delivered && done) return { stageId: done.id, source: "delivered", doneCount, total, blocker: null };
  if (override && stages.some((stage) => stage.id === override)) {
    return { stageId: override, source: "manual", doneCount, total, blocker: null };
  }

  if (total === 0) return { stageId: ready.id, source: "auto", doneCount, total, blocker: null };
  if (doneCount >= total) return { stageId: shipReady.id, source: "auto", doneCount, total, blocker: null };
  if (values.every(stepIsIdle)) return { stageId: ready.id, source: "auto", doneCount, total, blocker: null };

  // Name binding: when the step now being worked shares its name with a stage
  // ("Quality check" / "Quality Check"), that stage is plainly the right lane.
  const currentIndex = values.findIndex((value) => !stepIsDone(value));
  const currentStep = currentIndex >= 0 ? steps[currentIndex] : null;
  if (currentStep) {
    const wanted = String(currentStep.title || "").trim().toLowerCase();
    const named = stages.find((stage) => stage.kind !== "blocked" && stage.title.trim().toLowerCase() === wanted);
    if (named) return { stageId: named.id, source: "auto", doneCount, total, blocker: null };
  }
  return { stageId: firstActive.id, source: "auto", doneCount, total, blocker: null };
}

function createProductionFunctions({ admin, onCall, HttpsError, requireWorkspace, companySettingsDocRef, orderDocRef, ordersOfCompany, blockHeadingStepsFromSettings, notifyOrderAssignee }) {
  const db = () => admin.firestore();

  async function loadStagesAndSteps(companyId) {
    const snap = await companySettingsDocRef(companyId).get();
    const data = snap.exists ? snap.data() || {} : {};
    return {
      stages: productionStagesFromSettings(data),
      steps: blockHeadingStepsFromSettings(data)
    };
  }

  // Workspace wording for the board. Renaming a lane must never orphan the
  // orders standing in it, so ids that disappear are remapped to the lane that
  // replaced them by position before anything is written.
  const saveProductionStages = onCall({ region: "europe-west2" }, async (request) => {
    const { uid, companyId } = await requireWorkspace(request, { area: "orders", write: true });
    const incoming = Array.isArray(request.data && request.data.stages) ? request.data.stages : [];
    if (incoming.length === 0) throw new HttpsError("invalid-argument", "A board needs at least one column.");
    if (incoming.length > 12) throw new HttpsError("invalid-argument", "A board is capped at 12 columns.");

    for (const kind of SINGLETON_KINDS) {
      const count = incoming.filter((stage) => String(stage && stage.kind) === kind).length;
      if (count !== 1) {
        throw new HttpsError("invalid-argument", `The board needs exactly one "${kind}" column.`);
      }
    }
    if (!incoming.some((stage) => String(stage && stage.kind) === "active")) {
      throw new HttpsError("invalid-argument", "The board needs at least one in-production column.");
    }

    const stages = productionStagesFromSettings({ productionStages: incoming });
    const previous = (await loadStagesAndSteps(companyId)).stages;
    const survivingIds = new Set(stages.map((stage) => stage.id));
    const remap = new Map();
    previous.forEach((stage, index) => {
      if (survivingIds.has(stage.id)) return;
      const replacement = stages[index] || stageOfKind(stages, stage.kind) || stages[0];
      remap.set(stage.id, replacement.id);
    });

    await companySettingsDocRef(companyId).set({
      productionStages: stages,
      productionStagesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      productionStagesUpdatedBy: uid,
      lastSettingsWriteByUid: uid,
      lastSettingsWriteAtMs: Date.now()
    }, { merge: true });

    let moved = 0;
    if (remap.size > 0) {
      const snap = await ordersOfCompany(companyId).get();
      const batch = db().batch();
      for (const doc of snap.docs) {
        const current = String((doc.data() || {}).productionStageOverride || "");
        const next = current ? remap.get(current) : "";
        if (!next || next === current) continue;
        batch.set(doc.ref, { productionStageOverride: next }, { merge: true });
        moved += 1;
      }
      if (moved > 0) await batch.commit();
    }

    return { ok: true, companyId, stages, remapped: moved };
  });

  const setOrderProductionStage = onCall({ region: "europe-west2" }, async (request) => {
    const { uid, email, companyId } = await requireWorkspace(request, { area: "orders", write: true });
    const orderId = String((request.data && request.data.orderId) || "").trim();
    const stageId = String((request.data && request.data.stageId) || "").trim();
    if (!orderId) throw new HttpsError("invalid-argument", "Which order?");

    const { stages, steps } = await loadStagesAndSteps(companyId);
    const target = stages.find((stage) => stage.id === stageId);
    if (!target) throw new HttpsError("invalid-argument", "That column no longer exists.");

    const orderRef = orderDocRef(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
    const orderData = snap.data() || {};
    if (String(orderData.companyId || "") !== companyId) {
      throw new HttpsError("permission-denied", "That order belongs to another workspace.");
    }

    const before = resolveProductionStage(orderData, stages, steps);
    const beforeStage = stages.find((stage) => stage.id === before.stageId) || null;

    const updates = {
      productionStageAtMs: Date.now(),
      productionStageByUid: uid
    };

    if (target.kind === "blocked") {
      // The whole value of a Blocked lane is that it says WHY. A card that
      // lands there without a reason is just a card that has gone quiet.
      const blocker = cleanBlocker(request.data && request.data.blocker);
      if (!blocker) throw new HttpsError("invalid-argument", "A blocked job needs a reason.");
      updates.productionBlocker = { ...blocker, atMs: Date.now(), byUid: uid, byName: email || "" };
      updates.productionStageOverride = "";
    } else {
      updates.productionBlocker = admin.firestore.FieldValue.delete();
      // Moving to the lane the steps already imply means "follow the work
      // again" — storing an override there would freeze the card in place.
      const automatic = resolveProductionStage(
        { ...orderData, productionBlocker: null, productionStageOverride: "" },
        stages,
        steps
      );
      updates.productionStageOverride = automatic.stageId === target.id ? "" : target.id;
    }

    const historyEntry = {
      id: (admin.firestore().collection("_").doc()).id,
      createdAt: admin.firestore.Timestamp.now(),
      title: "Production stage changed",
      oldValue: beforeStage ? beforeStage.title : "-",
      newValue: target.title,
      source: "web",
      createdByUid: uid,
      createdByEmail: email || ""
    };
    const existingHistory = Array.isArray(orderData.historyLog) ? orderData.historyLog : [];
    updates.historyLog = [historyEntry, ...existingHistory].slice(0, 120);

    await orderRef.set(updates, { merge: true });

    if (typeof notifyOrderAssignee === "function" && before.stageId !== target.id) {
      await notifyOrderAssignee(companyId, orderData, {
        uid,
        title: "Production stage changed",
        message: `${String(orderData.designName || "Order")}: ${beforeStage ? beforeStage.title : "-"} → ${target.title}`,
        orderId
      }).catch((error) => console.warn("production notify failed:", error && error.message));
    }

    return {
      ok: true,
      companyId,
      orderId,
      stageId: target.id,
      // Everything Undo needs to put the card back exactly as it stood.
      previous: {
        stageId: before.stageId,
        override: String(orderData.productionStageOverride || ""),
        blocker: cleanBlocker(orderData.productionBlocker)
      }
    };
  });

  // Undo: restore the exact stored shape, without writing another "changed"
  // history line on top of the one being taken back.
  const undoOrderProductionStage = onCall({ region: "europe-west2" }, async (request) => {
    const { uid, companyId } = await requireWorkspace(request, { area: "orders", write: true });
    const orderId = String((request.data && request.data.orderId) || "").trim();
    if (!orderId) throw new HttpsError("invalid-argument", "Which order?");
    const previous = (request.data && request.data.previous) || {};
    const { stages } = await loadStagesAndSteps(companyId);
    const override = String(previous.override || "").trim();
    if (override && !stages.some((stage) => stage.id === override)) {
      throw new HttpsError("invalid-argument", "That column no longer exists.");
    }
    const blocker = cleanBlocker(previous.blocker);
    const orderRef = orderDocRef(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
    if (String((snap.data() || {}).companyId || "") !== companyId) {
      throw new HttpsError("permission-denied", "That order belongs to another workspace.");
    }
    const history = Array.isArray((snap.data() || {}).historyLog) ? snap.data().historyLog : [];

    await orderRef.set({
      productionStageOverride: override,
      productionBlocker: blocker
        ? { ...blocker, atMs: Date.now(), byUid: uid }
        : admin.firestore.FieldValue.delete(),
      productionStageAtMs: Date.now(),
      productionStageByUid: uid,
      // Drop the entry we are undoing rather than stacking a second one.
      historyLog: history.filter((entry, index) => !(index === 0 && String(entry && entry.title) === "Production stage changed"))
    }, { merge: true });

    return { ok: true, companyId, orderId };
  });

  return {
    saveProductionStages,
    setOrderProductionStage,
    undoOrderProductionStage,
    _internal: { resolveProductionStage, productionStagesFromSettings, stepValueForOrder, cleanBlocker }
  };
}

module.exports = {
  createProductionFunctions,
  DEFAULT_PRODUCTION_STAGES,
  STAGE_KINDS,
  SINGLETON_KINDS,
  BLOCKER_REASONS,
  productionStagesFromSettings,
  resolveProductionStage
};

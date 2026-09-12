// Sales, Faz 1: the server half, and nothing else.
//
// Three callables:
//   getSalesCapability  — may this workspace see Sales, does it want to, may this member open it
//   setSalesVisibility  — the workspace's menu preference (owner or admin)
//   listSalesRows       — the read-only list, derived from the orders that already exist
//
// What this file deliberately does NOT do: it writes no order, no side document
// for an order, no catalog record, no stock event, no notification, and it never
// re-stamps finance. The only write in the whole file is the workspace's own
// visibility preference, which a person asks for.
const { readSalesFlags, salesWorkspaceEnabled } = require("./flags");
const { salesCapability, normalizeVisibility, SALES_VISIBILITY } = require("./capability");
const { salesRowFromOrder, millisOf } = require("./rows");

const REGION = { region: "europe-west2", timeoutSeconds: 60 };
const DEFAULT_PAGE = 25;
const MAX_PAGE = 50;
const MAX_SCAN = 200;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
const text = (value, max = 200) => String(value == null ? "" : value).trim().slice(0, max);

function createSalesFunctions(deps) {
  const {
    admin, HttpsError, onCall,
    requireWorkspaceMember,             // (request) → { uid, companyId, companyData }
    memberAccessFor,                    // (companyData, uid) → the workspace access map
    roleFor,                            // (companyData, uid) → normalised role
    assignedOnlyFor = () => false,      // (companyData, uid) → boolean
    engineVersion = 0,                  // finance engine version the stamp must match
    listOrdersPage = null,              // injectable pager: tests do not need a live index
    now = () => Date.now()
  } = deps;

  const db = () => admin.firestore();
  const settingsRef = (companyId) => db().collection("companies").doc(companyId).collection("salesSettings").doc("main");

  /** The workspace's menu preference. A missing document means "not chosen yet", never "on". */
  async function readVisibility(companyId) {
    try {
      const snap = await settingsRef(companyId).get();
      const data = snap.exists ? (snap.data() || {}) : {};
      return normalizeVisibility(data.visibility);
    } catch (error) {
      console.warn("sales visibility read failed:", companyId, error?.message || error);
      return SALES_VISIBILITY.UNSET;
    }
  }

  /** One read for both the suggestion signals and the workspace currency. */
  async function readWorkspaceSettings(companyId) {
    try {
      const snap = await db().collection("companySettings").doc(companyId).get();
      const data = snap.exists ? (snap.data() || {}) : {};
      return {
        currency: text(data.seciliParaBirimi || data.selectedCurrency, 8),
        onboarding: {
          workKinds: data.onboardingWorkKinds,
          goals: data.onboardingGoals,
          mainGoal: data.onboardingMainGoal,
          startChoice: data.onboardingStartChoice,
          workflow: data.onboardingWorkflow
        }
      };
    } catch (error) {
      console.warn("sales settings read failed:", companyId, error?.message || error);
      return { currency: "", onboarding: {} };
    }
  }

  /** Membership, then the three separate facts the clients need. */
  async function resolve(request) {
    const { uid, companyId, companyData } = await requireWorkspaceMember(request);
    const flags = await readSalesFlags(db(), { now: now() });
    const pilotEnabled = salesWorkspaceEnabled(flags, companyId);
    const access = memberAccessFor(companyData, uid) || {};
    const role = roleFor(companyData, uid);
    const assignedOnly = assignedOnlyFor(companyData, uid) === true;
    const [visibility, settings] = await Promise.all([readVisibility(companyId), readWorkspaceSettings(companyId)]);
    const capability = salesCapability({
      pilotEnabled,
      visibility,
      canOpenOrders: access.orders !== false,
      canSeeFinance: access.financialInfo !== false,
      role,
      assignedOnly,
      onboarding: settings.onboarding
    });
    return { uid, companyId, companyData, capability, currency: settings.currency };
  }

  async function defaultListOrdersPage({ companyId, limit, cursor, assignedToUid = "" }) {
    // The document id is ordered explicitly, not left implicit: paymentDate is a
    // day, so several orders share the exact value, and a cursor of the date
    // alone would step over every one of them. Firestore also refuses a cursor
    // with more values than the query orders by, which is what an implicit
    // __name__ would have been. The live index (companyId ASC, paymentDate DESC)
    // already covers __name__ in the same direction, so this needs no new index.
    const build = (withAssignee) => {
      let query = db().collection("siparisler").where("companyId", "==", companyId);
      if (withAssignee && assignedToUid) query = query.where("assignedToUid", "==", assignedToUid);
      query = query.orderBy("paymentDate", "desc").orderBy(admin.firestore.FieldPath.documentId(), "desc");
      if (cursor && Number.isFinite(cursor.ms)) {
        const at = admin.firestore.Timestamp.fromMillis(cursor.ms);
        query = cursor.id ? query.startAfter(at, cursor.id) : query.startAfter(at);
      }
      return query.limit(limit);
    };
    const read = async (withAssignee) => {
      const snap = await build(withAssignee).get();
      return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    };
    if (!assignedToUid) return { orders: await read(false) };
    try {
      return { orders: await read(true) };
    } catch (error) {
      // The composite index for (companyId, assignedToUid, paymentDate) may not
      // exist yet. Falling back to the workspace query and filtering here keeps
      // the answer correct — the filter is still the server's — at the cost of
      // reading rows this member may not see. It never returns them.
      if (String(error?.code || "") !== "9" && !/index/i.test(String(error?.message || ""))) throw error;
      console.warn("sales: assigned-scope index missing, filtering on the server instead");
      const orders = await read(false);
      return { orders: orders.filter((order) => String(order.assignedToUid || "") === assignedToUid), indexMissing: true };
    }
  }
  const pager = typeof listOrdersPage === "function" ? listOrdersPage : defaultListOrdersPage;

  function cleanCursor(value) {
    if (!value || typeof value !== "object") return null;
    const ms = Number(value.ms);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return { ms, id: text(value.id, 128) };
  }

  const getSalesCapability = onCall(REGION, async (request) => {
    const { companyId, capability } = await resolve(request);
    // Never throws when Sales is closed: a client asks this on every load.
    return { ok: true, companyId, ...capability };
  });

  const setSalesVisibility = onCall(REGION, async (request) => {
    const { uid, companyId, capability } = await resolve(request);
    if (!capability.pilotEnabled) throw new HttpsError("failed-precondition", "Sales is not open for this workspace yet.");
    if (!capability.canManageVisibility) throw new HttpsError("permission-denied", "Only the workspace owner or an admin can change this.");
    if (typeof request.data?.visible !== "boolean") throw new HttpsError("invalid-argument", "Say whether Sales should be visible.");
    const visibility = request.data.visible === true ? SALES_VISIBILITY.ON : SALES_VISIBILITY.OFF;
    await settingsRef(companyId).set({ visibility, updatedAtMs: now(), updatedByUid: uid }, { merge: true });
    return { ok: true, companyId, visibility };
  });

  const listSalesRows = onCall(REGION, async (request) => {
    const { uid, companyId, capability, currency } = await resolve(request);
    if (!capability.pilotEnabled) {
      return { ok: true, companyId, enabled: false, reason: "flag_off", rows: [], nextCursor: null, financeVisible: false, scanned: 0, hasMore: false, scope: capability.scope, queryPath: "none" };
    }
    if (!capability.canOpenSales) {
      throw new HttpsError("permission-denied", "Your workspace account does not include orders.");
    }

    const limit = clamp(Math.floor(Number(request.data?.limit) || DEFAULT_PAGE), 1, MAX_PAGE);
    const cursor = cleanCursor(request.data?.cursor);
    const channel = text(request.data?.channel, 40).toLowerCase();
    const includeBespoke = request.data?.includeBespoke === true;
    const needsAttentionOnly = request.data?.needsAttentionOnly === true;

    // Scanned a little wider than the page: trashed orders and the filters drop
    // rows, and a page that returns fewer rows must still move the cursor on.
    const scanSize = clamp(limit * 2, limit, MAX_SCAN);
    // An assigned-only member sees exactly the orders Orders shows them.
    const assignedToUid = capability.scope === "assigned" ? uid : "";
    const page = await pager({ companyId, limit: scanSize, cursor, assignedToUid });
    const orders = Array.isArray(page?.orders) ? page.orders : [];

    // Which query actually ran. The acceptance test for the assigned-scope index
    // needs a positive signal, not the absence of a warning: the rows come back
    // identical either way, and a quiet log only proves that nothing spoke. This
    // says the path in the answer itself, so a person verifying the index after
    // it is published can see that the indexed query served the request rather
    // than the fallback that reads the workspace page and filters here.
    const queryPath = !assignedToUid
      ? "workspace"
      : (page?.indexMissing === true ? "assigned_fallback" : "assigned_indexed");

    // The cursor is the last order this page actually looked at, never the end
    // of the scan window: stopping early with the window's last order as the
    // cursor would step over everything in between.
    const rows = [];
    let lastExamined = null;
    let stoppedEarly = false;
    for (const order of orders) {
      lastExamined = order;
      if (order?.isDeleted === true) continue;
      const row = salesRowFromOrder(order, { financeVisible: capability.canSeeMoney, currency, engineVersion });
      if (!includeBespoke && row.kind === "bespoke_work") continue;
      if (channel && row.channel !== channel) continue;
      if (needsAttentionOnly && !row.needsAttention) continue;
      rows.push(row);
      if (rows.length >= limit) { stoppedEarly = true; break; }
    }

    // More to come when this page stopped early, or when the query filled the
    // whole scan window and there may be orders past it.
    const hasMore = stoppedEarly || orders.length >= scanSize;
    const nextCursor = hasMore && lastExamined ? { ms: millisOf(lastExamined.paymentDate), id: text(lastExamined.id, 128) } : null;

    return {
      ok: true, companyId, enabled: true, reason: "ok",
      rows, nextCursor, hasMore,
      financeVisible: capability.canSeeMoney,
      scope: capability.scope,
      scanned: orders.length,
      queryPath
    };
  });

  return { getSalesCapability, setSalesVisibility, listSalesRows };
}

module.exports = { createSalesFunctions };

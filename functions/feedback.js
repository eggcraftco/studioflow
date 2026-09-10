"use strict";

// The feedback callables — the account half of lifecycle/feedback.js.
//
//   * getFeedbackPrompt: may the first-success prompt be shown to this member
//     now? Answers from the workspace's own orders (the same bounded read the
//     setup checklist makes) and this person's prompt history. Asking records
//     nothing; the client calls again with `shown` once the card is actually on
//     screen, and only that confirmed showing counts for the seven-day cap.
//   * dismissFeedbackPrompt: "not now" — the dismissal cooldown starts.
//   * submitFeedback: the note itself, into the server-only `feedback`
//     collection, with the abuse limits and the duplicate check applied and
//     the lifecycle event recorded on the person's state document.
//   * listFeedback / getFeedbackDetail / updateFeedbackStatus: the admin inbox,
//     gated the way every other admin callable is (a verified address in the
//     support-admin list). No e-mail is sent by any of these.
//
// Everything user-facing ships behind two settings: NIVADESK_FEEDBACK=1 (the
// global switch) and NIVADESK_FEEDBACK_WORKSPACES (the pilot list — empty means
// nobody, "*" means everybody). The invitation additionally needs
// NIVADESK_FEEDBACK_INVITE_FROM_MS, the launch instant: only a first success
// after it is invited. The inbox is behind none of these — it reads what exists
// and is admin-only regardless (SUPPORT_ADMIN_EMAILS, checked in index.js).

const crypto = require("crypto");
const feedback = require("./lifecycle/feedback");
const substantiveOrder = require("./lifecycle/substantiveOrder");
const messaging = require("./lifecycle/messaging");

const FEEDBACK_COLLECTION = "feedback";
const STATE_SUBCOLLECTION = "feedbackState";
const ID_PATTERN = /^fb_[A-Za-z0-9_-]{6,40}$/;
const REGION = { region: "europe-west2", timeoutSeconds: 60 };

const text = (value) => (typeof value === "string" ? value : value == null ? "" : String(value)).trim();
const list = (value) => (Array.isArray(value) ? value : []);

function createFeedbackFunctions(deps) {
  const {
    admin, HttpsError, onCall,
    requireWorkspaceMember,                       // (request) → { uid, email, companyId, companyData }
    isAdminRequest = () => false,                 // (request) → boolean
    featureEnabled = () => false,
    pilotWorkspaces = () => "",                   // the raw NIVADESK_FEEDBACK_WORKSPACES value
    inviteFromMs = () => 0,                       // NIVADESK_FEEDBACK_INVITE_FROM_MS, the launch instant
    recentOrders = null,                          // (companyId) → order rows — injectable for tests
    now = () => Date.now(),
    newId = () => `fb_${crypto.randomBytes(9).toString("base64url")}`
  } = deps;

  const db = () => admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const feedbackRef = (id) => db().collection(FEEDBACK_COLLECTION).doc(id);
  const stateRef = (companyId, uid) => db().collection("companies").doc(companyId).collection(STATE_SUBCOLLECTION).doc(uid);
  const readState = async (companyId, uid) => { const snap = await stateRef(companyId, uid).get(); return snap.exists ? (snap.data() || {}) : {}; };

  // The checklist's read, repeated rather than shared: the newest fifty orders by
  // the date every creation path writes; the rows go to lifecycle/feedback.js,
  // which applies the shared substantive-order predicate and reads the creation
  // stamps (never paymentDate) for the first-success time.
  async function defaultRecentOrders(companyId) {
    const snap = await db().collection("siparisler").where("companyId", "==", companyId).orderBy("paymentDate", "desc").limit(50).get()
      .catch(() => db().collection("siparisler").where("companyId", "==", companyId).limit(50).get());
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
  const readRecentOrders = typeof recentOrders === "function" ? recentOrders : defaultRecentOrders;

  const enabledFor = (companyId) => featureEnabled() === true && feedback.pilotAllows(pilotWorkspaces(), companyId);
  function requireOn(companyId) {
    if (featureEnabled() !== true) throw new HttpsError("failed-precondition", "Feedback is not enabled on this server yet.");
    if (!feedback.pilotAllows(pilotWorkspaces(), companyId)) throw new HttpsError("failed-precondition", "Feedback is not enabled for this workspace yet.");
  }
  /** The state document, changed inside a transaction so two tabs never overwrite each other's entries. */
  async function updateState(companyId, uid, mutate) {
    const ref = stateRef(companyId, uid);
    return db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? (snap.data() || {}) : {};
      const patch = mutate(current);
      if (!patch) return current;
      tx.set(ref, { uid, companyId, ...patch, updatedAtMs: now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { ...current, ...patch };
    });
  }
  const SHOWN_DEBOUNCE_MS = 60 * 1000;
  function requireAdmin(request) {
    if (!isAdminRequest(request)) throw new HttpsError("permission-denied", "Customer feedback is restricted to NivaDesk admins.");
  }
  const eventRow = (name, atMs, subjectId) => ({ name, atMs, subjectId: text(subjectId) });
  function cleanId(value) {
    const id = text(value);
    if (!ID_PATTERN.test(id)) throw new HttpsError("invalid-argument", "A feedback id is required.");
    return id;
  }

  /** The record without server timestamps — what an admin screen renders. */
  function publicRecord(data) {
    const row = { ...(data || {}) };
    delete row.createdAt; delete row.updatedAt;
    return row;
  }
  function listRow(data) {
    const body = text(data.text);
    return {
      id: text(data.id), createdAtMs: Number(data.createdAtMs) || 0, updatedAtMs: Number(data.updatedAtMs) || 0,
      feedbackType: text(data.feedbackType), kind: text(data.kind), experience: text(data.experience), status: text(data.status),
      trigger: text(data.trigger), stage: text(data.stage), companyId: text(data.companyId), workspaceName: text(data.workspaceName),
      userEmail: text(data.userEmail), page: text(data.page), platform: text(data.platform), language: text(data.language),
      excerpt: body.slice(0, 140), textLength: body.length, ownerUid: text(data.ownerUid), category: text(data.category), impact: data.impact || null
    };
  }

  const getFeedbackPrompt = onCall(REGION, async (request) => {
    const { uid, companyId } = await requireWorkspaceMember(request);
    const campaign = feedback.CAMPAIGN_FIRST_SUCCESS;
    if (featureEnabled() !== true) return { ok: true, enabled: false, show: false, campaign, reason: "feature_off" };
    if (!feedback.pilotAllows(pilotWorkspaces(), companyId)) return { ok: true, enabled: false, show: false, campaign, reason: "not_in_pilot" };
    const nowMs = now();
    // The client confirming that the card is on screen: the one moment the
    // seven-day cap counts from. Idempotent inside a minute, so a second tab or
    // a re-render does not count twice.
    const shown = text(request.data?.shown);
    if (shown) {
      if (!feedback.isKnownCampaign(shown)) throw new HttpsError("invalid-argument", "Unknown feedback prompt.");
      let recorded = false;
      await updateState(companyId, uid, (current) => {
        const last = list(current.shows).filter((entry) => entry && text(entry.campaign) === shown).map((entry) => Number(entry.atMs) || 0).sort((a, b) => b - a)[0] || 0;
        if (nowMs - last < SHOWN_DEBOUNCE_MS) return null;
        recorded = true;
        return {
          shows: feedback.trimHistory([...list(current.shows), { campaign: shown, atMs: nowMs }]),
          events: feedback.trimHistory([...list(current.events), eventRow("feedback_prompt_shown", nowMs, shown)])
        };
      });
      return { ok: true, enabled: true, show: true, campaign: shown, reason: "", recorded };
    }
    const [orders, state] = await Promise.all([readRecentOrders(companyId), readState(companyId, uid)]);
    const verdict = feedback.promptEligibility({ nowMs, enabled: true, pilotAllowed: true, inviteFromMs: inviteFromMs(), firstSuccess: feedback.firstSuccess(orders), state });
    return { ok: true, enabled: true, show: verdict.show, campaign: verdict.campaign, reason: verdict.reason };
  });

  const dismissFeedbackPrompt = onCall(REGION, async (request) => {
    const { uid, companyId } = await requireWorkspaceMember(request);
    requireOn(companyId);
    const campaign = text(request.data?.campaign) || feedback.CAMPAIGN_FIRST_SUCCESS;
    if (!feedback.isKnownCampaign(campaign)) throw new HttpsError("invalid-argument", "Unknown feedback prompt.");
    const nowMs = now();
    await updateState(companyId, uid, (current) => ({
      dismissals: feedback.trimHistory([...list(current.dismissals), { campaign, atMs: nowMs }]),
      events: feedback.trimHistory([...list(current.events), eventRow("feedback_prompt_dismissed", nowMs, campaign)])
    }));
    return { ok: true, campaign, cooldownDays: messaging.DEFAULT_MESSAGE_CAPS.dismissalCooldownDays };
  });

  const submitFeedback = onCall(REGION, async (request) => {
    const { uid, email, companyId, companyData } = await requireWorkspaceMember(request);
    requireOn(companyId);
    const shape = feedback.submissionShape(request.data || {});
    if (!shape.ok) throw new HttpsError("invalid-argument", `Feedback could not be saved: ${shape.problems.join(", ")}.`);
    const value = shape.value;
    const nowMs = now();
    const id = newId();
    const record = {
      id, companyId, uid, userEmail: text(email),
      workspaceName: text(companyData && (companyData.name || companyData.companyName)),
      source: "in_app", platform: "web", trigger: value.trigger, campaign: value.campaign, stage: value.stage,
      feedbackType: value.feedbackType, kind: value.kind, experience: value.experience, text: value.text,
      category: "other", impact: null, status: "new", ownerUid: null, adminNote: "",
      page: value.page, language: value.language,
      createdAtMs: nowMs, createdAt: FieldValue.serverTimestamp(), updatedAtMs: nowMs, updatedAt: FieldValue.serverTimestamp(),
      statusHistory: [{ status: "new", atMs: nowMs, byUid: uid }]
    };
    // One transaction: the duplicate check, the abuse limit and the write all
    // see the same state, so two tabs sending the same note produce one record.
    const outcome = await db().runTransaction(async (tx) => {
      const ref = stateRef(companyId, uid);
      const snap = await tx.get(ref);
      const current = snap.exists ? (snap.data() || {}) : {};
      const submissions = list(current.submissions);
      const earlier = feedback.duplicateOf(submissions, value, nowMs);
      if (earlier) return { id: earlier, duplicate: true };
      const limit = feedback.rateLimitVerdict(submissions, nowMs);
      if (!limit.allowed) return { limited: limit.reason };
      const done = list(current.done);
      tx.set(feedbackRef(id), record);
      tx.set(ref, {
        uid, companyId,
        submissions: feedback.trimHistory([...submissions, { id, atMs: nowMs, campaign: value.campaign, kind: value.kind, experience: value.experience, textHash: feedback.textHash(value.text), clientKey: value.clientKey }]),
        done: value.campaign && !done.includes(value.campaign) ? [...done, value.campaign] : done,
        events: feedback.trimHistory([...list(current.events), eventRow("feedback_submitted", nowMs, id)]),
        lastSubmittedAtMs: nowMs, updatedAtMs: nowMs, updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return { id, duplicate: false };
    });
    if (outcome.limited) throw new HttpsError("resource-exhausted", "Too many feedback messages in a short time. Please try again later.");
    return { ok: true, id: outcome.id, duplicate: outcome.duplicate };
  });

  // ---- the admin inbox ---------------------------------------------------------

  const listFeedback = onCall(REGION, async (request) => {
    requireAdmin(request);
    const status = text(request.data?.status);
    if (status && !feedback.STATUSES.includes(status)) throw new HttpsError("invalid-argument", "Unknown feedback status.");
    const type = text(request.data?.feedbackType);
    if (type && !feedback.FEEDBACK_TYPES.includes(type)) throw new HttpsError("invalid-argument", "Unknown feedback type.");
    const limit = Math.min(Math.max(Number(request.data?.limit) || 50, 1), 200);
    const beforeMs = Number(request.data?.beforeMs) || 0;
    // Newest first on the one field every record carries; the status and type
    // filters are applied to the page in memory so no composite index is needed.
    let query = db().collection(FEEDBACK_COLLECTION).orderBy("createdAtMs", "desc");
    if (beforeMs > 0) query = query.where("createdAtMs", "<", beforeMs);
    const snap = await query.limit(limit).get();
    const page = snap.docs.map((doc) => doc.data() || {});
    const rows = page.filter((row) => (!status || text(row.status) === status) && (!type || text(row.feedbackType) === type)).map(listRow);
    return {
      ok: true, rows, pageSize: page.length,
      nextBeforeMs: page.length === limit ? (Number(page[page.length - 1].createdAtMs) || 0) : 0,
      statuses: feedback.STATUSES, feedbackTypes: feedback.FEEDBACK_TYPES, kinds: feedback.KINDS, experiences: feedback.EXPERIENCES
    };
  });

  const getFeedbackDetail = onCall(REGION, async (request) => {
    requireAdmin(request);
    const id = cleanId(request.data?.id);
    const snap = await feedbackRef(id).get();
    if (!snap.exists) throw new HttpsError("not-found", "No such feedback.");
    return { ok: true, feedback: publicRecord(snap.data()) };
  });

  const updateFeedbackStatus = onCall(REGION, async (request) => {
    requireAdmin(request);
    const id = cleanId(request.data?.id);
    const status = text(request.data?.status);
    if (!feedback.STATUSES.includes(status)) throw new HttpsError("invalid-argument", "Unknown feedback status.");
    const noteGiven = request.data?.adminNote !== undefined;
    const adminNote = text(request.data?.adminNote).slice(0, feedback.LIMITS.adminNoteMax);
    const snap = await feedbackRef(id).get();
    if (!snap.exists) throw new HttpsError("not-found", "No such feedback.");
    const current = snap.data() || {};
    const nowMs = now();
    const byUid = text(request.auth?.uid);
    const patch = { updatedAtMs: nowMs, updatedAt: FieldValue.serverTimestamp(), ownerUid: byUid };
    if (noteGiven) patch.adminNote = adminNote;
    if (text(current.status) !== status) {
      patch.status = status;
      patch.statusHistory = [...list(current.statusHistory), { status, atMs: nowMs, byUid }].slice(-50);
    }
    await feedbackRef(id).set(patch, { merge: true });
    const fresh = await feedbackRef(id).get();
    return { ok: true, feedback: publicRecord(fresh.data()) };
  });

  return {
    getFeedbackPrompt, dismissFeedbackPrompt, submitFeedback, listFeedback, getFeedbackDetail, updateFeedbackStatus,
    _internal: { FEEDBACK_COLLECTION, STATE_SUBCOLLECTION, stateRef, publicRecord, listRow, enabledFor }
  };
}

module.exports = { createFeedbackFunctions, FEEDBACK_COLLECTION, STATE_SUBCOLLECTION };

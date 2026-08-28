// Settings audit history (the settings report's last High item).
//
// One trigger watches the companySettings document — the single place all
// four platforms write workspace settings — and turns every save into a
// field-level diff entry under companies/{id}/settingsAuditLog. Attribution
// comes from stamps riding inside the same write (lastSettingsWriteByUid,
// or any per-area ...UpdatedByUid style field in the delta); a save without
// a stamp is still recorded, just as an unnamed workspace member. Entries
// are server-only in the rules; the owner reads them through a callable.

const BOOKKEEPING_KEY = /(updatedat|updatedby|updatedbyemail|completedat|completedby|appliedat|savedat|checkedatms|migratedat|lastsettingswrite|lastbackupexported|aiknowledgebaseprevious)/i;

// Values that never print: anything credential-shaped, plus keys whose value
// is an opaque blob or a raw timestamp where only the fact of change matters.
const SENSITIVE_KEY = /(secret|token|password|apikey|openaikey|hash)/i;
const SILENT_VALUE_KEY = /(json$|rotatedatms|base64)/i;

const AREA_RULES = [
  { pattern: /^(financial|corporationTax|vat|tax)/i, area: "Financial" },
  { pattern: /^pdfShow|^companyNumbers|^pdf/i, area: "PDF" },
  { pattern: /^(branding|logo|theme|accent|companyName|footerNote)/i, area: "Branding" },
  { pattern: /^portal/i, area: "Customer pages" },
  { pattern: /^(replyMode|quickReply|aiKnowledgeBase|customProducts|customRules|hasOpenAIKey|openAIKey)/i, area: "AI Reply" },
  { pattern: /^(upload|safety|policy)/i, area: "Uploads" },
  { pattern: /^(integration|woo|shopify|webhook|signature)/i, area: "Integrations" },
  { pattern: /^(showCard|orderCard|cardLayout|__workspaceLayout|workspaceSidebar|workspaceUserProfiles|typeWorkspaceSnapshots|invLabel|materials|summaryStep|orderListStep|customField|customStep|customToggle|designNameLabel|priorityCardLabel|riskCardLabel|extraStatus|businessType|businessDescription)|sidebar/i, area: "Workflow & cards" },
  { pattern: /^dashboard/i, area: "Dashboard" },
  { pattern: /^(selectedLanguage|selectedCurrency|language)/i, area: "Language & currency" },
  { pattern: /^(lastBackup|business(Template|Onboarding))/i, area: "Data" }
];

function areaForKey(key) {
  for (const rule of AREA_RULES) {
    if (rule.pattern.test(key)) return rule.area;
  }
  return "Other";
}

function printableValue(value) {
  if (value === undefined || value === null) return "—";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "—";
    return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
  }
  return null; // objects/arrays/timestamps: the key name is the story
}

function stableStringify(value) {
  try {
    return JSON.stringify(value, (key, inner) => {
      // Firestore Timestamps compare by content, not object identity.
      if (inner && typeof inner === "object" && typeof inner.toMillis === "function") return inner.toMillis();
      return inner;
    });
  } catch {
    return String(value);
  }
}

// Pure diff helper, exported for tests: what a trigger run would record.
function settingsAuditDiff(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changed = [];
  for (const key of keys) {
    if (stableStringify(before?.[key]) !== stableStringify(after?.[key])) changed.push(key);
  }
  const visible = changed.filter((key) => !BOOKKEEPING_KEY.test(key)).sort();
  if (visible.length === 0) return null;

  // The stamp attributes a save only when it moved in THIS write — the uid
  // alone repeats between saves, so the companion lastSettingsWriteAtMs is
  // what proves the stamp is fresh and not a stale leftover a direct
  // (unstamped) writer merged past.
  let byUid = "";
  const stamped = String(after?.lastSettingsWriteByUid || "");
  if (stamped && (changed.includes("lastSettingsWriteByUid") || changed.includes("lastSettingsWriteAtMs"))) byUid = stamped;
  if (!byUid) {
    for (const key of changed) {
      if (!/by(uid)?$/i.test(key)) continue;
      const value = after?.[key];
      if (typeof value === "string" && value && value.length <= 64 && !value.includes(" ") && !value.includes("@")) {
        byUid = value;
        break;
      }
    }
  }

  const values = [];
  for (const key of visible.slice(0, 12)) {
    if (SENSITIVE_KEY.test(key) || SILENT_VALUE_KEY.test(key)) continue;
    const from = printableValue(before?.[key]);
    const to = printableValue(after?.[key]);
    if (from === null || to === null || from === to) continue;
    values.push({ key, from, to });
  }

  const areas = [...new Set(visible.map(areaForKey))].slice(0, 6);
  return {
    changedKeys: visible.slice(0, 40),
    changedCount: visible.length,
    areas,
    values,
    byUid
  };
}

function createSettingsAuditFunctions({ admin, onCall, HttpsError, onDocumentWritten, uidIsCompanyOwner, auditLogEnabledForCompany }) {
  const REGION = "europe-west2";
  const logRef = (companyId) => admin.firestore().collection("companies").doc(String(companyId)).collection("settingsAuditLog");

  const settingsAuditTrail = onDocumentWritten({ region: REGION, document: "companySettings/{companyId}" }, async (event) => {
    const companyId = String(event.params.companyId || "");
    if (!companyId) return;
    const before = event.data?.before?.exists ? event.data.before.data() || {} : {};
    const after = event.data?.after?.exists ? event.data.after.data() || {} : {};
    const diff = settingsAuditDiff(before, after);
    if (!diff) return;

    const now = Date.now();
    try {
      // Dragging a sidebar fires a save per gesture; ten of those are one
      // story. The same person changing the same keys within a short window
      // updates the previous entry instead of burying the log under copies.
      const newestSnap = await logRef(companyId).orderBy("atMs", "desc").limit(1).get();
      const newest = newestSnap.empty ? null : newestSnap.docs[0];
      const newestData = newest ? newest.data() || {} : {};
      const sameStory = newest
        && String(newestData.byUid || "") === diff.byUid
        && JSON.stringify(newestData.changedKeys || []) === JSON.stringify(diff.changedKeys)
        && now - (Number(newestData.atMs) || 0) < 15 * 60 * 1000;
      if (sameStory) {
        await newest.ref.set({ ...diff, atMs: now, docDeleted: !event.data?.after?.exists }, { merge: true });
      } else {
        // The event id makes retried deliveries land on the same doc.
        const docId = String(event.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60) || undefined;
        const target = docId ? logRef(companyId).doc(docId) : logRef(companyId).doc();
        await target.set({ ...diff, atMs: now, docDeleted: !event.data?.after?.exists });
      }
    } catch (error) {
      console.warn("settingsAuditTrail write failed:", companyId, error?.message || error);
      return;
    }

    // Trim as we go: entries older than 90 days leave in small batches, so the
    // log never needs a scheduled cleaner.
    try {
      const stale = await logRef(companyId).where("atMs", "<", now - 90 * 24 * 3600 * 1000).limit(25).get();
      if (!stale.empty) {
        const batch = admin.firestore().batch();
        stale.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
    } catch (error) {
      console.warn("settingsAuditTrail cleanup failed:", companyId, error?.message || error);
    }
  });

  const getSettingsAuditLog = onCall({ region: REGION }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");
    const companyId = String(request.data?.companyId || "").trim();
    if (!companyId) throw new HttpsError("invalid-argument", "companyId is required.");
    const companySnap = await admin.firestore().collection("companies").doc(companyId).get();
    if (!companySnap.exists) throw new HttpsError("not-found", "Workspace not found.");
    const companyData = companySnap.data() || {};
    if (!uidIsCompanyOwner(companyData, uid)) {
      throw new HttpsError("permission-denied", "The change history is available to the workspace owner.");
    }
    if (!auditLogEnabledForCompany(companyData)) {
      // Recording never stops — the moment the plan includes it, the history
      // is already there.
      return { ok: true, enabled: false, entries: [] };
    }

    // The card promises 90 days; an idle workspace must not show older
    // leftovers just because the trigger-side trim never ran again.
    const cutoffMs = Date.now() - 90 * 24 * 3600 * 1000;
    const snap = await logRef(companyId).where("atMs", ">=", cutoffMs).orderBy("atMs", "desc").limit(50).get();
    const members = companyData.members && typeof companyData.members === "object" ? companyData.members : {};
    const nameForUid = (entryUid) => {
      if (!entryUid) return "";
      const member = members[entryUid];
      const name = member && typeof member === "object" ? String(member.displayName || "") : "";
      if (name) return name;
      if (entryUid === String(companyData.ownerUid || companyId)) {
        return String(companyData.ownerDisplayName || companyData.ownerEmail || "Owner");
      }
      return "";
    };
    const entries = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        atMs: Number(data.atMs) || 0,
        areas: Array.isArray(data.areas) ? data.areas.slice(0, 6) : [],
        changedKeys: Array.isArray(data.changedKeys) ? data.changedKeys.slice(0, 40) : [],
        changedCount: Number(data.changedCount) || 0,
        values: Array.isArray(data.values) ? data.values.slice(0, 12) : [],
        byUid: String(data.byUid || ""),
        byName: nameForUid(String(data.byUid || ""))
      };
    });
    return { ok: true, enabled: true, entries };
  });

  return { settingsAuditTrail, getSettingsAuditLog, _internal: { settingsAuditDiff, areaForKey } };
}

module.exports = { createSettingsAuditFunctions, settingsAuditDiff, areaForKey };

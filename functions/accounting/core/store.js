"use strict";

// Where the accounting connector keeps its state (§12). Everything sits under
// companies/{cid}/accounting* so a provider can be added without touching the
// order, purchase or bank collections; the OAuth state pool is root-level and
// server-only like squareConnectStates.
//
//   accountingConnections/{connId}   owner-readable   provider, realm, mode, boundary, capabilities, health
//   accountingTokens/{connId}        server-only      boxed access/refresh tokens + realm (atomic with the connection)
//   accountingIdentities/{id}        owner-readable   external id ↔ NivaDesk entity, SyncToken, normalized snapshot
//   accountingCatalog/{connId}       owner-readable   accounts / tax codes / items lists for the mapping UI
//   accountingMappings/{connId}      owner-readable   account, tax, item, contact mappings + posting policies
//   accountingEvents/{id}            owner-readable   normalized economic events (phase 3)
//   accountingPostings/{fingerprint} owner-readable   the posting state machine (phase 3)
//   accountingInbox/{id}             server-only      raw webhook envelopes, idempotent by event id
//   accountingAttention/{id}         owner-readable   Needs Attention queue
//   accountingCursors/{id}           server-only      CDC / reconciliation cursors
//   accountingAudit/{id}             owner-readable   who did what (connect, mode, mapping, ignore, retry)
//   accountingConnectStates/{state}  ROOT, server-only OAuth state pool

const COLLECTIONS = Object.freeze({
  connections: "accountingConnections",
  tokens: "accountingTokens",
  identities: "accountingIdentities",
  catalog: "accountingCatalog",
  mappings: "accountingMappings",
  events: "accountingEvents",
  postings: "accountingPostings",
  inbox: "accountingInbox",
  attention: "accountingAttention",
  cursors: "accountingCursors",
  audit: "accountingAudit"
});
const ROOT_COLLECTIONS = Object.freeze({ connectStates: "accountingConnectStates" });

function safeId(value, max = 120) {
  return String(value || "").replace(/[^A-Za-z0-9_.:@-]/g, "_").slice(0, max);
}

function connectionDocId(provider, externalCompanyId) {
  return `${safeId(provider, 40)}__${safeId(externalCompanyId, 80)}`;
}

function identityDocId(provider, connectionId, entityType, externalId) {
  return [safeId(provider, 40), safeId(connectionId, 130), safeId(entityType, 40), safeId(externalId, 80)].join("__");
}

function cursorDocId(connectionId, entity) {
  return `${safeId(connectionId, 130)}__${safeId(entity, 40)}`;
}

function refs(db, companyId) {
  const company = db.collection("companies").doc(String(companyId));
  return {
    company,
    connections: company.collection(COLLECTIONS.connections),
    tokens: company.collection(COLLECTIONS.tokens),
    identities: company.collection(COLLECTIONS.identities),
    catalog: company.collection(COLLECTIONS.catalog),
    mappings: company.collection(COLLECTIONS.mappings),
    events: company.collection(COLLECTIONS.events),
    postings: company.collection(COLLECTIONS.postings),
    inbox: company.collection(COLLECTIONS.inbox),
    attention: company.collection(COLLECTIONS.attention),
    cursors: company.collection(COLLECTIONS.cursors),
    audit: company.collection(COLLECTIONS.audit),
    connectStates: db.collection(ROOT_COLLECTIONS.connectStates)
  };
}

// REQ-ARCH-002 — is there already a primary writer whose period overlaps?
// `existing` are connection docs (plus the implicit Pandle one when linked).
// Returns null when the candidate may take primary_write, else the conflict.
function primaryWriterConflict(existing, candidate) {
  if (!candidate || candidate.mode !== "primary_write") return null;
  const candidateFrom = String(candidate.writeBoundaryDate || "");
  for (const row of Array.isArray(existing) ? existing : []) {
    if (!row || row.connectionId === candidate.connectionId) continue;
    if (row.mode !== "primary_write") continue;
    const rowFrom = String(row.writeBoundaryDate || "");
    const rowUntil = String(row.writeUntilDate || "");
    // The other writer stops the day before the candidate starts → no overlap.
    if (rowUntil && candidateFrom && rowUntil < candidateFrom) continue;
    return {
      code: "double_writer",
      connectionId: String(row.connectionId || ""),
      provider: String(row.provider || ""),
      companyName: String(row.companyName || ""),
      writeBoundaryDate: rowFrom,
      writeUntilDate: rowUntil,
      message: `${row.provider || "Another provider"} already writes this company's books${rowFrom ? ` from ${rowFrom}` : ""}. Set an end date on it or keep this connection read-only.`
    };
  }
  return null;
}

async function recordAudit(db, companyId, entry, { now = Date.now() } = {}) {
  const r = refs(db, companyId);
  const doc = r.audit.doc();
  await doc.set({
    companyId: String(companyId), connectionId: String(entry.connectionId || ""), provider: String(entry.provider || ""),
    action: String(entry.action || ""), actorUid: String(entry.actorUid || ""), actorEmail: String(entry.actorEmail || ""),
    summary: String(entry.summary || "").slice(0, 400), details: entry.details && typeof entry.details === "object" ? entry.details : {},
    createdAtMs: now
  });
  return doc.id;
}

async function openAttention(db, companyId, item, { now = Date.now() } = {}) {
  const r = refs(db, companyId);
  const id = safeId(item.id || `${item.connectionId || "conn"}__${item.kind || "issue"}__${item.entityRef || now}`, 200);
  await r.attention.doc(id).set({
    companyId: String(companyId), connectionId: String(item.connectionId || ""), provider: String(item.provider || ""),
    kind: String(item.kind || ""), severity: String(item.severity || "warning"), message: String(item.message || "").slice(0, 400),
    entityRefs: Array.isArray(item.entityRefs) ? item.entityRefs.slice(0, 10) : [], options: Array.isArray(item.options) ? item.options.slice(0, 6) : ["retry", "ignore"],
    externalUrl: String(item.externalUrl || ""), status: "open", occurrences: (item.occurrences || 0) + 1,
    firstSeenAtMs: item.firstSeenAtMs || now, lastSeenAtMs: now, updatedAtMs: now
  }, { merge: true });
  return id;
}

async function resolveAttention(db, companyId, id, { status = "resolved", reason = "", actorUid = "", now = Date.now() } = {}) {
  const r = refs(db, companyId);
  await r.attention.doc(safeId(id, 200)).set({ status, resolvedReason: String(reason || "").slice(0, 300), resolvedByUid: actorUid, resolvedAtMs: now, updatedAtMs: now }, { merge: true });
}

module.exports = { COLLECTIONS, ROOT_COLLECTIONS, safeId, connectionDocId, identityDocId, cursorDocId, refs, primaryWriterConflict, recordAudit, openAttention, resolveAttention };

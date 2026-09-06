"use strict";

/**
 * get_accounting_sync_status (§11).
 *
 * The single most important field here is `phase`. NivaDesk's accounting
 * connectors are read-only today: `accountingPostings` is never written
 * (that is QuickBooks/Xero phase 3–7). Without `phase`, "failed: 0" reads as
 * "everything posted cleanly", which is the opposite of the truth — nothing has
 * been posted at all. So each posting counter carries `available: false` and a
 * reason, and the renderer says "Ledger posting is not switched on yet;
 * NivaDesk is preparing records only".
 *
 * The attention rows are READ, never opened. `accounting/core/store.openAttention`
 * is a writer — it creates or bumps a document with an occurrence counter — and
 * calling it from a capability annotated `readOnlyHint: true` would make the
 * annotation false in exactly the way OpenAI rejected 1.1.1 over. This module
 * takes the rows the loader read and does nothing else with them.
 *
 * §39.7: the assistant is never the accountant. Nothing here is worded as a
 * filing or a formal reconciliation.
 */

const envelope = require("./envelope");
const freshness = require("./freshness");
const { DEFAULT_MAPPINGS } = require("../pandle");

const POSTING_PHASES = Object.freeze(["prepared", "approved", "queued", "synced", "failed", "conflict"]);

const SEVERITY_FROM_STORED = Object.freeze({ error: "high", warning: "medium", info: "low" });

/** Reasons a bank row is not ready to become a ledger record. */
function readinessOf(rows = [], connection = null) {
  const mappings = Array.isArray((connection || {}).mappings) && connection.mappings.length
    ? connection.mappings
    : DEFAULT_MAPPINGS;
  const mapped = new Set(mappings.map((row) => String((row || {}).category || "")));

  const notReady = { uncategorised: 0, unmapped: 0, split: 0, needsInfo: 0, unreviewed: 0 };
  let ready = 0;
  for (const row of rows) {
    const category = String(row.category || "");
    const splits = Array.isArray(row.splits) ? row.splits : [];
    const reviewStatus = String(row.reviewStatus || "");
    if (!category) { notReady.uncategorised += 1; continue; }
    if (splits.length > 0) { notReady.split += 1; continue; }
    if (reviewStatus === "needs_info") { notReady.needsInfo += 1; continue; }
    if (reviewStatus === "unreviewed" || row.categoryAuto === true) { notReady.unreviewed += 1; continue; }
    if (!mapped.has(category)) { notReady.unmapped += 1; continue; }
    ready += 1;
  }
  return { ready, notReady };
}

function accountingSyncStatus(snapshot, args = {}, ctx = {}, { nowMs = Date.now() } = {}) {
  const connections = (snapshot.connections || {}).accounting || [];
  const warnings = [];

  const writers = connections.filter((row) => String(row.mode || "") === "primary_write");
  const primaryWriter = writers.length > 0
    ? { provider: String(writers[0].provider || ""), connectionId: String(writers[0].id || "") }
    : null;
  const conflict = writers.length > 1;

  const postings = {};
  for (const key of POSTING_PHASES) {
    postings[key] = { value: 0, available: false, reason: "postings_not_implemented" };
  }

  const attention = (snapshot.accountingAttention || []).map((row) => ({
    id: String(row.id || ""),
    provider: String(row.provider || ""),
    connectionId: String(row.connectionId || ""),
    kind: String(row.kind || ""),
    severity: SEVERITY_FROM_STORED[String(row.severity || "")] || "low",
    message: String(row.message || ""),
    entityRefs: Array.isArray(row.entityRefs) ? row.entityRefs.slice(0, 5) : []
  }));

  const readiness = readinessOf(snapshot.bankRows || [], connections[0] || null);

  const sources = connections.map((connection) => freshness.sourceRow({
    provider: String(connection.provider || "accounting"),
    connectionId: connection.id,
    entity: "finance",
    kind: "accounting",
    lastSuccessAtMs: Number(connection.lastSyncAtMs || 0),
    contributed: true,
    nowMs
  }));

  warnings.push(envelope.warning(
    "unsupported_metric",
    "NivaDesk prepares accounting records but does not write them to the ledger yet, so the posting counters are reported as unavailable rather than as zero."
  ));
  if (conflict) {
    warnings.push(envelope.warning("plan_limited", "More than one connection claims to be the primary writer for this company's books; one of them has to be set read-only."));
  }

  return {
    data: {
      phase: "read_only",
      primaryWriter,
      conflict,
      connections: connections.map((connection) => ({
        provider: String(connection.provider || ""),
        connectionId: String(connection.id || ""),
        company: String(connection.companyName || connection.realmName || ""),
        mode: String(connection.mode || "read_only"),
        health: String(connection.status || "unknown"),
        writeBoundaryDate: String(connection.writeBoundaryDate || "") || null,
        lastSyncAt: connection.lastSyncAtMs ? new Date(Number(connection.lastSyncAtMs)).toISOString() : null
      })),
      postings,
      attention,
      readiness
    },
    warnings,
    sources,
    entityRefs: attention.slice(0, 20).map((row) => envelope.entityRef("attention", row.id, row.kind))
  };
}

module.exports = { POSTING_PHASES, SEVERITY_FROM_STORED, readinessOf, accountingSyncStatus };

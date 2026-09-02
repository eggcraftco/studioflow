"use strict";

// §4.2 step 7 / Xero §6 step 8 — contact matching produces candidates, never
// merges. Shared by every provider: a name alone is a reason to look, not to
// link. Provider modules re-export these so older imports keep working.

function nameKey(value) {
  return String(value || "").toLowerCase().replace(/\b(ltd|limited|llc|inc|plc)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function duplicateContactCandidates(local, remote, { limit = 200 } = {}) {
  const byName = new Map();
  const byEmail = new Map();
  for (const row of Array.isArray(remote) ? remote : []) {
    const key = nameKey(row.displayName || row.companyName);
    if (key) byName.set(key, (byName.get(key) || []).concat(row));
    if (row.email) byEmail.set(String(row.email).toLowerCase(), (byEmail.get(String(row.email).toLowerCase()) || []).concat(row));
  }
  const out = [];
  for (const row of Array.isArray(local) ? local : []) {
    const candidates = new Map();
    const email = String(row.email || "").toLowerCase();
    if (email && byEmail.has(email)) for (const hit of byEmail.get(email)) candidates.set(hit.externalId, { externalId: hit.externalId, displayName: hit.displayName, reason: "same_email", score: 90 });
    const key = nameKey(row.name || row.displayName);
    if (key && byName.has(key)) for (const hit of byName.get(key)) if (!candidates.has(hit.externalId)) candidates.set(hit.externalId, { externalId: hit.externalId, displayName: hit.displayName, reason: "same_name", score: 70 });
    if (candidates.size) out.push({ localId: String(row.id || ""), localName: String(row.name || row.displayName || ""), localEmail: email, candidates: Array.from(candidates.values()).sort((a, b) => b.score - a.score) });
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = { nameKey, duplicateContactCandidates };

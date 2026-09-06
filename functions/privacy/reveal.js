"use strict";

// Who may see a marketplace buyer's protected details, and what they see.
//
// `restrictedCustomer` is denied to every client; the only road to it is the
// `revealRestrictedCustomer` callable, and this module is its decision — pure,
// so the tier table (access-control policy §5.3) can be tested with real
// inputs rather than read off the callable's source.
//
// Provider-agnostic on purpose: the eBay half owns this file and the Amazon
// side calls the same export. Two variants racing would be the failure mode.

const REVEAL_LIMITS = Object.freeze({ perHour: 60, perDay: 300 });
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * @param {object} input
 *   isOwner     the caller owns the workspace
 *   access      companies/{cid}.memberAccess[uid] (the mirrored, effective access)
 *   order       the order document (assignedToUid / assignedUids are read)
 *   uid         the caller
 *   suspended   companies/{cid}.suspendedMembers[uid] === true
 * @returns {{allowed:boolean, reason:string}}
 */
function revealAllowed({ isOwner = false, access = null, order = null, uid = "", suspended = false } = {}) {
  if (isOwner) return { allowed: true, reason: "" };
  if (suspended) return { allowed: false, reason: "suspended" };
  const a = access && typeof access === "object" ? access : {};
  if (a.restrictedCustomer !== true) return { allowed: false, reason: "no_grant" };
  if (a.workflowOnly === true) return { allowed: false, reason: "workflow_only" };
  if (a.assignedProjectsOnly === true && a.manageProjectAssignments !== true) {
    const o = order && typeof order === "object" ? order : {};
    const assigned = new Set([String(o.assignedToUid || ""), ...(Array.isArray(o.assignedUids) ? o.assignedUids.map(String) : []), String(o.assignedTo || "")].filter(Boolean));
    if (!assigned.has(String(uid || ""))) return { allowed: false, reason: "not_assigned" };
  }
  return { allowed: true, reason: "" };
}

/**
 * The payload a reveal returns: shipping identity only. Never `paths`, never
 * the tax identifier (not needed to ship), never gift messages or checkout
 * notes (a later, separate decision).
 */
function revealPayloadOf(restrictedDoc, { now = Date.now() } = {}) {
  const doc = restrictedDoc && typeof restrictedDoc === "object" ? restrictedDoc : {};
  const fields = doc.fields && typeof doc.fields === "object" ? doc.fields : {};
  const address = fields.address && typeof fields.address === "object" ? fields.address : {};
  const text = (v, max = 200) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));
  const out = {
    provider: text(doc.provider, 40),
    orderId: text(doc.orderId, 200),
    buyerUsername: text(doc.buyerUsername, 120),
    fields: {
      fullName: text(fields.fullName),
      address: {
        line1: text(address.line1), city: text(address.city, 120), postalCode: text(address.postalCode, 40), countryCode: text(address.countryCode, 8)
      }
    },
    updatedAtMs: Number(doc.updatedAtMs || 0),
    ageDays: Number(doc.updatedAtMs) > 0 ? Math.max(0, Math.floor((Number(now) - Number(doc.updatedAtMs)) / DAY_MS)) : 0
  };
  if (text(fields.companyName)) out.fields.companyName = text(fields.companyName);
  if (text(fields.email)) out.fields.email = text(fields.email).toLowerCase();
  if (text(fields.phone, 60)) out.fields.phone = text(fields.phone, 60);
  if (text(address.line2)) out.fields.address.line2 = text(address.line2);
  if (text(address.stateOrProvince, 120)) out.fields.address.stateOrProvince = text(address.stateOrProvince, 120);
  return out;
}

/** Whether a restricted document holds anything worth revealing. */
function revealHasContent(restrictedDoc) {
  const payload = revealPayloadOf(restrictedDoc);
  const f = payload.fields;
  return Boolean(f.fullName || f.email || f.phone || f.address.line1 || f.address.city || f.address.postalCode);
}

/** The PII categories a reveal exposed — for the access log, derived from what was actually present. */
function revealCategoriesOf(payload) {
  const f = (payload && payload.fields) || {};
  const out = [];
  if (f.fullName || f.companyName) out.push("name");
  if (f.email) out.push("email");
  if (f.phone) out.push("phone");
  if (f.address && (f.address.line1 || f.address.city || f.address.postalCode)) out.push("address");
  return out;
}

/**
 * The rolling reveal budget for one user: 60 per hour, 300 per day.
 * `counters` is the stored document; the answer carries the next counters to
 * write. Windows are fixed-anchored (start when the first reveal lands, reset
 * when they lapse) — simple, and enough to stop a bulk read.
 */
function revealBudget(counters, nowMs, limits = REVEAL_LIMITS) {
  const now = Number(nowMs) || Date.now();
  const c = counters && typeof counters === "object" ? counters : {};
  const hourStart = Number(c.hourStartMs) > 0 && now - Number(c.hourStartMs) < HOUR_MS ? Number(c.hourStartMs) : now;
  const dayStart = Number(c.dayStartMs) > 0 && now - Number(c.dayStartMs) < DAY_MS ? Number(c.dayStartMs) : now;
  const hourCount = hourStart === Number(c.hourStartMs) ? Number(c.hourCount || 0) : 0;
  const dayCount = dayStart === Number(c.dayStartMs) ? Number(c.dayCount || 0) : 0;
  if (hourCount >= limits.perHour) return { allowed: false, reason: "hour", hourCount, dayCount, next: { hourStartMs: hourStart, hourCount, dayStartMs: dayStart, dayCount } };
  if (dayCount >= limits.perDay) return { allowed: false, reason: "day", hourCount, dayCount, next: { hourStartMs: hourStart, hourCount, dayStartMs: dayStart, dayCount } };
  return { allowed: true, reason: "", hourCount: hourCount + 1, dayCount: dayCount + 1, next: { hourStartMs: hourStart, hourCount: hourCount + 1, dayStartMs: dayStart, dayCount: dayCount + 1 } };
}

module.exports = { REVEAL_LIMITS, revealAllowed, revealPayloadOf, revealHasContent, revealCategoriesOf, revealBudget };

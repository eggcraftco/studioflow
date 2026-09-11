// How a Sales line stays attached to an order line, and when it stops.
//
// The shipped iOS/Mac 1.3 replaces the whole order document on paid plans, and
// the server mints a fresh id for any line sent without one (Android does that
// on every save). So a link can never be keyed on array position, and it must
// never be re-matched silently by product name or SKU: a wrong link would move
// real stock. Only an exact key match with an identical fingerprint stays
// LINKED, and only LINKED may act on stock. Everything else is shown to a
// person, who decides.
const STATES = Object.freeze({
  LINKED: "linked",        // the line is still there, unchanged
  CHANGED: "changed",      // the line is there, its numbers or name moved
  SUGGESTED: "suggested",  // the id is gone; exactly one line looks identical — a proposal, not a match
  AMBIGUOUS: "ambiguous",  // the id is gone; several lines look identical
  MISSING: "missing",      // the id is gone and nothing looks like it
  ORPHANED: "orphaned"     // the order itself was removed or trashed
});

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const name = (value) => String(value || "").trim().toLowerCase();

function fingerprintOf(line = {}) {
  return { name: name(line.name), quantity: Number(line.quantity) || 0, unitPrice: money(line.unitPrice) };
}

function sameFingerprint(left = {}, right = {}) {
  return name(left.name) === name(right.name)
    && Math.abs((Number(left.quantity) || 0) - (Number(right.quantity) || 0)) < 1e-6
    && Math.abs(money(left.unitPrice) - money(right.unitPrice)) < 0.005;
}

/**
 * @param {object} link  { lineId, fingerprint }
 * @param {object} order { lineItems, isDeleted }
 * @returns {{ state: string, allowsStockAction: boolean, candidateLineId: string, reason: string }}
 */
function linkState(link = {}, order = null) {
  const result = (state, reason, candidateLineId = "") => ({
    state, reason, candidateLineId, allowsStockAction: state === STATES.LINKED
  });
  if (!order || order.isDeleted === true) return result(STATES.ORPHANED, "order_removed");

  const lines = Array.isArray(order.lineItems) ? order.lineItems : [];
  const fingerprint = link.fingerprint || {};
  const lineId = String(link.lineId || "").trim();

  if (lineId) {
    const byId = lines.find((line) => String(line && line.id || "").trim() === lineId);
    if (byId) {
      return sameFingerprint(fingerprintOf(byId), fingerprint)
        ? result(STATES.LINKED, "key_match")
        : result(STATES.CHANGED, "line_changed", lineId);
    }
  }

  // The id is gone. A look-alike is reported, never adopted.
  const candidates = lines.filter((line) => sameFingerprint(fingerprintOf(line), fingerprint));
  if (candidates.length === 1) return result(STATES.SUGGESTED, "key_lost_single_candidate", String(candidates[0].id || ""));
  if (candidates.length > 1) return result(STATES.AMBIGUOUS, "key_lost_many_candidates");
  return result(STATES.MISSING, "line_gone");
}

function allowsStockAction(state) { return state === STATES.LINKED; }

module.exports = { linkState, allowsStockAction, fingerprintOf, sameFingerprint, SALES_LINK_STATES: STATES };

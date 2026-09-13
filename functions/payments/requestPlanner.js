// PR-P2 — deciding whether a payment link may be created, and what an open one
// is still worth once the world has moved on.
//
// The risk this module exists for is over-collection, and it is not symmetric:
// asking a customer for too little is a follow-up, asking for too much is money
// taken that has to be given back, by hand, with an apology. Three ways it
// happens, and the answer to each is different:
//
//   1. TWO OPEN LINKS. A deposit link for £300 and a balance link for £700 on a
//      £1,000 order are correct together. A second £700 link, opened because
//      somebody forgot the first, is £400 too much. Preventable, so it is
//      PREVENTED: creation reserves headroom against every link already open.
//
//   2. THE ORDER SHRANK. A £1,000 order with a £700 link open is reduced to
//      £500. Not preventable — the link is already in the customer's inbox and
//      the page is Stripe's, not ours. So the link is marked STALE and the
//      workspace is told, which is what "explicitly managed" has to mean when
//      the alternative is pretending we can reach into somebody's email.
//
//   3. MONEY ARRIVED ANOTHER WAY. The customer paid the balance by bank
//      transfer while the link was open. Same shape as (2), same answer.
//
// And when a stale link is paid anyway, the money is REAL and is recorded. It is
// recorded as an overpayment, named as one, and never quietly dropped or
// quietly counted as revenue the order did not earn.
//
// Pure: no Firestore, no Stripe, no clock. The server passes in what it read.

const PURPOSES = Object.freeze(["deposit", "instalment", "remaining_balance"]);
const OPEN_STATUSES = Object.freeze(["open", "processing"]);

function minor(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : 0;
}

/** Requests that can still take the customer's money. */
function openRequests(requests) {
  return (Array.isArray(requests) ? requests : []).filter(
    (row) => row && typeof row === "object" && OPEN_STATUSES.includes(String(row.publicStatus || ""))
  );
}

/**
 * What the order still expects to receive, in minor units.
 *
 * `remainingAmount` is the workspace's own statement of the balance, and it is
 * the number the clients show. Reading it rather than deriving a second one
 * keeps the link agreeing with the screen the workspace is looking at.
 */
function outstandingMinor(order) {
  const remaining = Number((order && order.remainingAmount) || 0);
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  return Math.round(remaining * 100);
}

/**
 * Headroom: what may still be asked for without any open link over-collecting.
 *
 * Every open link is treated as already spoken for, whether or not the customer
 * has opened it. A link nobody uses expires and returns its headroom; a link
 * treated as free until it is paid is the two-links bug.
 */
function headroomMinor(order, requests) {
  const claimed = openRequests(requests).reduce((sum, row) => sum + minor(row.amountMinor), 0);
  return outstandingMinor(order) - claimed;
}

/**
 * May a link for `amountMinor` be created right now?
 *
 * Returns { allowed, reason, headroomMinor, claimedMinor, outstandingMinor }.
 */
function canCreate(order, requests, amountMinor, { purpose = "remaining_balance" } = {}) {
  const amount = minor(amountMinor);
  const outstanding = outstandingMinor(order);
  const claimed = openRequests(requests).reduce((sum, row) => sum + minor(row.amountMinor), 0);
  const headroom = outstanding - claimed;
  const base = { headroomMinor: headroom, claimedMinor: claimed, outstandingMinor: outstanding };

  if (!PURPOSES.includes(String(purpose))) return { allowed: false, reason: "unknown_purpose", ...base };
  if (amount <= 0) return { allowed: false, reason: "amount_not_positive", ...base };
  if (outstanding <= 0) return { allowed: false, reason: "nothing_outstanding", ...base };
  if (amount > headroom) {
    // The two distinguishable failures, because the fix is different: reduce
    // this link, or cancel the one already open.
    return { allowed: false, reason: claimed > 0 ? "exceeds_headroom_open_links" : "exceeds_outstanding", ...base };
  }
  return { allowed: true, reason: "", ...base };
}

/**
 * Which open links would now over-collect, and by how much.
 *
 * Called after anything that can move the order's balance: an edit, a bank
 * payment, a refund, another link being paid. A link is stale when the order no
 * longer expects the money it asks for — either because the balance fell below
 * this link's own amount, or because the open links together now exceed it.
 *
 * The oldest link is kept whole and the newest is blamed for the excess, on
 * purpose: the customer most likely to be paying right now is the one who was
 * sent a link most recently, and telling the workspace to cancel the link
 * somebody is halfway through paying is the wrong advice.
 */
function staleRequests(order, requests) {
  const open = openRequests(requests).slice().sort(
    (a, b) => Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0)
  );
  const outstanding = outstandingMinor(order);
  const stale = [];
  let allocated = 0;
  for (const row of open) {
    const amount = minor(row.amountMinor);
    const room = Math.max(0, outstanding - allocated);
    if (amount > room) {
      stale.push({
        paymentRequestId: String(row.paymentRequestId || row.id || ""),
        amountMinor: amount,
        coveredMinor: room,
        excessMinor: amount - room,
        reason: room === 0 ? "order_fully_settled" : "order_balance_fell_below_link"
      });
    }
    allocated += amount;
  }
  return stale;
}

/**
 * A link was paid. Was it more than the order was still owed?
 *
 * The money is real either way — this decides what to CALL it, not whether to
 * keep it. `overpaidMinor` above zero is a fact for the workspace to act on
 * (refund it, or apply it to another order), never a reason to refuse a payment
 * Stripe has already taken.
 */
function classifyPayment(order, requests, { paymentRequestId = "", amountMinor = 0 } = {}) {
  const amount = minor(amountMinor);
  const outstanding = outstandingMinor(order);
  const others = openRequests(requests).filter(
    (row) => String(row.paymentRequestId || row.id || "") !== String(paymentRequestId)
  );
  const overpaidMinor = Math.max(0, amount - outstanding);
  return {
    amountMinor: amount,
    appliedMinor: Math.min(amount, Math.max(0, outstanding)),
    overpaidMinor,
    overpaid: overpaidMinor > 0,
    // Links still open after this one settles, which the workspace may now want
    // to cancel. Named, not cancelled: a second link may be a deliberate
    // instalment plan, and guessing costs the workspace a payment.
    stillOpenRequestIds: others.map((row) => String(row.paymentRequestId || row.id || "")).filter(Boolean)
  };
}

module.exports = {
  PURPOSES,
  OPEN_STATUSES,
  openRequests,
  outstandingMinor,
  headroomMinor,
  canCreate,
  staleRequests,
  classifyPayment
};

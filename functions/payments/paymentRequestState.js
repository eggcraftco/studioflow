// PR-P0 — the payment request state machine (plan §6.2, §8).
//
// A payment request is our record of "this order is asking this customer for
// this amount". Its `publicStatus` is the one field every surface reads, so it
// has to be true under the conditions Stripe actually delivers events in:
//
//   - events arrive out of order, so an older event must never pull a newer
//     state backwards (plan §8: "Eski olay yeni durumu geriye çeviremez");
//   - the same event arrives up to N times, so applying it N times must produce
//     one result;
//   - a refund can be delivered BEFORE the payment it refunds, in which case
//     reconciliation waits rather than inventing a paid state to refund from.
//
// apply() is therefore a pure reducer: (state, event) -> next state, with the
// event's provider sequence carried alongside so ordering is decided by data
// and not by arrival time.
//
// The success redirect is NOT in this file, deliberately. A customer landing on
// our success URL proves only that a browser followed a redirect; only a
// signature-verified webhook moves a request to `paid`.

const STATUSES = Object.freeze([
  "draft", "open", "processing", "paid", "expired", "cancelled",
  "refunded", "partially_refunded", "disputed"
]);

/** Terminal for the CUSTOMER: no further customer action can be taken. */
const CLOSED_TO_CUSTOMER = Object.freeze(["paid", "expired", "cancelled", "refunded", "partially_refunded", "disputed"]);

/**
 * How far along the money is. A transition may only RAISE the rank.
 *
 * This is what stops "checkout.session.completed arrived late" from dragging a
 * refunded request back to paid.
 *
 * The post-payment tail is ordered, not tied: a partial refund must be able to
 * become a full one, so partially_refunded sits BELOW refunded. `disputed` is
 * the top because it is the state that needs a person — a refund arriving after
 * a dispute still records its money (see ledgerRowFor) but must not quietly
 * clear the dispute off the operator's screen.
 *
 * expired and cancelled share open's rank: they are ends of the same step, and
 * either can still be overtaken by a real payment, because Stripe reporting a
 * payment outranks our record of a session we thought was over.
 */
const RANK = Object.freeze({
  draft: 0, open: 1, expired: 1, cancelled: 1, processing: 2, paid: 3,
  partially_refunded: 4, refunded: 5, disputed: 6
});

/** Which events this rail understands, and what each one claims. */
const EVENT_INTENT = Object.freeze({
  "request.opened": "open",
  "request.cancelled": "cancelled",
  "checkout.session.completed": "paid",
  "checkout.session.async_payment_succeeded": "paid",
  "checkout.session.async_payment_failed": "open",
  "checkout.session.expired": "expired",
  "payment_intent.processing": "processing",
  "payment_intent.succeeded": "paid",
  "payment_intent.payment_failed": "open",
  "charge.refunded": "refunded",
  "charge.dispute.created": "disputed"
});

function normalizeStatus(value) {
  return STATUSES.includes(value) ? value : "draft";
}

function emptyState(overrides) {
  return Object.assign({
    publicStatus: "draft",
    paidAmountMinor: 0,
    refundedAmountMinor: 0,
    amountMinor: 0,
    lastEventSequence: 0,
    appliedEventIds: []
  }, overrides || {});
}

/**
 * Apply one provider event to a payment request state.
 *
 * `event` is the normalized shape this rail produces from a webhook:
 *   { id, type, sequence, amountMinor?, refundedTotalMinor?, fullyRefunded? }
 * `sequence` is the provider's event time in ms — the only ordering signal we
 * are given, and the reason a late duplicate cannot rewrite history.
 *
 * Returns { changed, state, reason }. `changed:false` is a normal, expected
 * outcome — a duplicate, a stale event, or an event that says nothing new —
 * and the caller still marks the event processed so it stops being retried.
 */
function apply(current, event) {
  const state = emptyState(current);
  state.publicStatus = normalizeStatus(state.publicStatus);
  const applied = Array.isArray(state.appliedEventIds) ? state.appliedEventIds.slice() : [];

  const id = String(event && event.id ? event.id : "").trim();
  const type = String(event && event.type ? event.type : "").trim();
  if (!id || !type) return { changed: false, state, reason: "malformed_event" };

  // 1. Exactly-once. Ten deliveries of one event produce one business result.
  if (applied.includes(id)) return { changed: false, state, reason: "duplicate" };

  const intent = EVENT_INTENT[type];
  if (!intent) return { changed: false, state, reason: "unhandled_event" };

  // 2. Ordering. An event older than the newest one already applied may be
  // recorded, but must not move the status. Equal sequences are allowed through
  // because Stripe stamps whole seconds and two real events can share one.
  const sequence = Number(event.sequence || 0);
  const stale = Number.isFinite(sequence) && sequence > 0 && sequence < Number(state.lastEventSequence || 0);

  const next = Object.assign({}, state, { appliedEventIds: applied.concat([id]).slice(-50) });
  if (Number.isFinite(sequence) && sequence > Number(state.lastEventSequence || 0)) next.lastEventSequence = sequence;
  if (stale) return { changed: true, state: next, reason: "stale_event_recorded_only" };

  // 3. The money facts, which are cumulative and therefore order-independent:
  // Stripe reports a charge's refunded TOTAL, not a delta, so taking the max is
  // both idempotent and safe under reordering.
  if (intent === "paid" && Number.isSafeInteger(Number(event.amountMinor)) && Number(event.amountMinor) > 0) {
    next.paidAmountMinor = Math.max(Number(state.paidAmountMinor || 0), Number(event.amountMinor));
  }
  if (intent === "refunded" && Number.isSafeInteger(Number(event.refundedTotalMinor))) {
    next.refundedAmountMinor = Math.max(Number(state.refundedAmountMinor || 0), Number(event.refundedTotalMinor));
  }

  // 4. A refund that arrives before its payment. We know the money moved back,
  // so we keep the amount, but we do NOT claim a paid state we never observed.
  // Reconciliation waits for the payment event (plan §8).
  if (intent === "refunded" && Number(next.paidAmountMinor || 0) <= 0) {
    return { changed: true, state: next, reason: "refund_before_payment_awaiting_reconciliation" };
  }

  let target = intent;
  if (intent === "refunded") {
    const fully = event.fullyRefunded === true
      || Number(next.refundedAmountMinor || 0) >= Number(next.paidAmountMinor || 0);
    target = fully ? "refunded" : "partially_refunded";
  }

  // 5. Rank. Forward only, with one exception: a request that is already closed
  // to the customer cannot be reopened by a failure event, because the customer
  // has no page left to retry on.
  if (CLOSED_TO_CUSTOMER.includes(next.publicStatus) && RANK[target] <= RANK[next.publicStatus]) {
    return { changed: true, state: next, reason: "closed_status_kept" };
  }
  if (RANK[target] < RANK[next.publicStatus]) {
    return { changed: true, state: next, reason: "lower_rank_ignored" };
  }
  if (target === next.publicStatus) return { changed: true, state: next, reason: "no_status_change" };

  next.publicStatus = target;
  return { changed: true, state: next, reason: "status_changed" };
}

/**
 * Does the canonical order ledger get a row for this event?
 *
 * Exactly one row per external payment identity, and only for money that has
 * actually moved. The identity is the caller's to supply (see eventBoundary.js)
 * — this function only answers whether a row is owed at all.
 */
function ledgerRowFor(before, after, event) {
  const type = String(event && event.type ? event.type : "");
  const intent = EVENT_INTENT[type];
  if (intent === "paid" && before.publicStatus !== "paid" && after.publicStatus === "paid") {
    return { type: "payment", amountMinor: Number(after.paidAmountMinor || 0) };
  }
  if (intent === "refunded") {
    const delta = Number(after.refundedAmountMinor || 0) - Number(before.refundedAmountMinor || 0);
    if (delta > 0) return { type: "refund", amountMinor: delta };
  }
  return null;
}

module.exports = { STATUSES, CLOSED_TO_CUSTOMER, RANK, EVENT_INTENT, emptyState, apply, ledgerRowFor };

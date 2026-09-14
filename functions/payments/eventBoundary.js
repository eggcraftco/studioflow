// PR-P0 — the webhook boundary between NivaDesk's OWN Stripe account and a
// workspace's connected account (plan §5.2, §8).
//
// The fact this module exists to defend, found by reading the live code:
//
//   functions/stripeBilling.js already runs a Stripe webhook. It verifies the
//   signature, then routes on event.type alone — `checkout.session.completed`,
//   `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed` — and
//   it never reads `event.account`. eventSummary() does not even record it.
//
//   That is correct today, because today every event on that endpoint is a
//   platform event: NivaDesk selling NivaDesk subscriptions. The moment a
//   workspace connects its own account, Stripe starts delivering that account's
//   events too, and a workspace customer's `checkout.session.completed` would
//   land in applyCompletedSubscriptionCheckout — NivaDesk's SaaS entitlement
//   rail — carrying a stranger's session. That is a workspace's customer paying
//   for a jeweller's ring and NivaDesk reading it as a plan purchase.
//
// So the boundary is not a nicety, it is the first thing PR-P1 must ship, and
// it is decided HERE, before any handler runs:
//
//   * a platform event (no event.account) belongs to the subscription rail;
//   * a connected-account event (event.account set) belongs to this rail, and
//     only if that account id resolves to exactly one workspace on OUR side;
//   * an account id we do not know is rejected, never guessed and never
//     processed on the platform rail as a fallback.
//
// The two rails also use two different endpoints and two different signing
// secrets, so an event that arrives on the wrong one fails signature checking
// before it reaches this code. This module is the second line: it assumes the
// signature already passed and asks whose money the event is about.

const RAIL_PLATFORM = "platform_subscription";
const RAIL_CONNECTED = "workspace_collection";

/** The connected-account events this rail claims. Anything else is not ours. */
const CONNECTED_EVENT_TYPES = Object.freeze([
  "account.updated",
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.processing",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed"
]);

/** The platform events the existing subscription webhook already handles. */
const PLATFORM_EVENT_TYPES = Object.freeze([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed"
]);

function text(value) {
  return String(value == null ? "" : value).trim();
}

/**
 * Decide which rail an event belongs to.
 *
 * `event` is the verified Stripe event; `resolveAccount` is a caller-supplied
 * lookup accountId -> companyId (or "" when unknown). It is a plain function so
 * this module stays free of Firestore and of any external call.
 *
 * Returns { rail, companyId, accepted, reason }.
 */
function routeEvent(event, resolveAccount) {
  const type = text(event && event.type);
  const account = text(event && event.account);
  if (!type) return { rail: "", companyId: "", accepted: false, reason: "malformed_event" };

  if (!account) {
    // No account field: Stripe is telling us this happened on the platform
    // account. Only the subscription rail's own events are accepted there —
    // an unexpected type is dropped rather than handed to a handler that was
    // written for a different object.
    if (!PLATFORM_EVENT_TYPES.includes(type)) {
      return { rail: RAIL_PLATFORM, companyId: "", accepted: false, reason: "unhandled_platform_event" };
    }
    return { rail: RAIL_PLATFORM, companyId: "", accepted: true, reason: "" };
  }

  if (!CONNECTED_EVENT_TYPES.includes(type)) {
    return { rail: RAIL_CONNECTED, companyId: "", accepted: false, reason: "unhandled_connected_event" };
  }
  const companyId = typeof resolveAccount === "function" ? text(resolveAccount(account)) : "";
  if (!companyId) {
    // An account we do not recognise. This is the case that must NOT fall
    // through to the platform rail: a disconnected workspace, a second
    // platform, or an attacker replaying a real event from elsewhere all land
    // here, and all of them are "not ours".
    return { rail: RAIL_CONNECTED, companyId: "", accepted: false, reason: "unknown_connected_account" };
  }
  return { rail: RAIL_CONNECTED, companyId, accepted: true, reason: "" };
}

/**
 * May the SUBSCRIPTION handler act on this event at all?
 *
 * routeEvent() decides which rail an event belongs to, at the door. This is the
 * subscription rail's OWN refusal, taken inside its handler, and the two are
 * deliberately not the same check in the same place. Two endpoints with two
 * signing secrets should already make a connected-account event impossible
 * here; so should the routing. "Should" is three assumptions deep — a secret
 * pasted into the wrong Stripe endpoint configuration undoes all of it in one
 * click, and the failure it produces is a workspace customer's payment read as
 * a NivaDesk plan purchase. So the handler refuses on its own account.
 *
 * Four refusals, in the order a wrong event would trip them:
 *
 *   1. `event.account` set at all. The subscription rail is NivaDesk's own
 *      Stripe account; an event stamped with somebody else's account is not
 *      ours to apply, whatever its type says.
 *   2. a type this rail does not handle. Nothing downstream is written for
 *      those objects, so there is no handler that could do something sensible.
 *   3. livemode disagreeing with the key this deployment runs on. A test-mode
 *      deployment handed a live event (or the reverse) is looking at another
 *      environment's money; the ids would not resolve, but a refusal says so
 *      rather than leaving it to a lookup miss.
 *   4. Connect markers on the object itself — on_behalf_of, transfer_data,
 *      application_fee_amount, or a `transfer_data.destination`. A platform
 *      event carrying these is a connected charge routed through the platform
 *      account, which is money belonging to a workspace and not a subscription.
 *
 * Returns { admissible, reason }.
 */
function platformEventAdmissible(event, { expectLivemode = false } = {}) {
  const type = text(event && event.type);
  if (!type) return { admissible: false, reason: "malformed_event" };
  if (text(event && event.account)) return { admissible: false, reason: "connected_account_event" };
  if (!PLATFORM_EVENT_TYPES.includes(type)) return { admissible: false, reason: "unhandled_platform_event" };

  const livemode = event && typeof event.livemode === "boolean" ? event.livemode : null;
  if (livemode !== null && livemode !== Boolean(expectLivemode)) {
    return { admissible: false, reason: "livemode_mismatch" };
  }

  const object = (event && event.data && event.data.object) || {};
  const connectMarkers = ["on_behalf_of", "application_fee_amount", "application_fee", "transfer_data"];
  for (const marker of connectMarkers) {
    const value = object[marker];
    if (value !== undefined && value !== null && value !== "") {
      return { admissible: false, reason: `connect_marker_${marker}` };
    }
  }
  return { admissible: true, reason: "" };
}

/**
 * May the CONNECTED handler act on this event at all?
 *
 * One refusal, and it is the one platformEventAdmissible already takes for the
 * subscription rail (its point 3): livemode disagreeing with the keys this
 * deployment runs on. The connected rail had no such check, and the stake here
 * is higher — these events move a WORKSPACE's money rather than NivaDesk's own
 * subscription state. A live event applied on a test deployment moves a real
 * order's paidAmount and refundedAmount out of an environment that workspace
 * holds no account in, and the reverse lets a test card change live figures.
 *
 * An absent livemode is admissible, exactly as on the platform rail. Stripe
 * always sends the field, so an event without it is hand-built or replayed, and
 * dropping a workspace's money over a field that says nothing is the worse of
 * the two failures.
 *
 * Returns { admissible, reason }.
 */
function connectedEventAdmissible(event, { expectLivemode = false } = {}) {
  const livemode = event && typeof event.livemode === "boolean" ? event.livemode : null;
  if (livemode !== null && livemode !== Boolean(expectLivemode)) {
    return { admissible: false, reason: "livemode_mismatch" };
  }
  return { admissible: true, reason: "" };
}

/**
 * The provider event ledger key (plan §6.3):
 *   paymentProviderEvents/{provider}:{account}:{eventId}
 *
 * The account is IN the key on purpose. Stripe event ids are unique per account
 * and not globally, so keying on the event id alone would let one account's
 * event id silently shadow another's. `_platform` stands in for the absent
 * account so a platform event and a connected event can never collide.
 */
function eventLedgerId(provider, accountId, eventId) {
  const p = text(provider) || "stripe";
  const a = text(accountId) || "_platform";
  const e = text(eventId);
  if (!e) return "";
  return `${p}:${a}:${e}`;
}

/**
 * The canonical external payment identity (plan §8: "Aynı ödeme için Checkout
 * ve PaymentIntent olaylarının ikisini iki ödeme gibi yazma").
 *
 * Checkout emits `checkout.session.completed` AND `payment_intent.succeeded`
 * for one payment. Keying the ledger on the event, or on the session, would
 * write that payment twice. The PaymentIntent is the object both events point
 * at, so it — not the session, not the event — is the payment's identity.
 *
 * A refund's identity is the refund id for the same reason: one charge can be
 * refunded several times and each is its own ledger row.
 */
function externalPaymentId(event) {
  const type = text(event && event.type);
  const object = (event && event.data && event.data.object) || {};
  if (type.startsWith("charge.refunded")) {
    // `charge.refunded` delivers the CHARGE, and a charge carries its refunds in
    // a list — `refunds.data[]`, newest first. There is no top-level `refund_id`
    // on it; that key was this rail's own invention, and every fixture fed it,
    // so the suite passed while a real refund would have returned "" here and
    // been dropped at `no_payment_identity` — the money silently never reaching
    // the ledger and `refundedAmount` never moving.
    //
    // This returns which ONE id names the delivery. It is no longer how refund
    // money is priced or written: where the event carries `refunds.data`,
    // `refundSetFrom` below returns every refund and `applyProviderPayment`
    // writes one ledger row per refund id, deduped by that id. The order the
    // provider sent them in, and which end a truncated page lost, decide
    // nothing about the money.
    //
    // Two things still depend on the answer here, which is why it is still
    // chosen carefully rather than taken from position 0:
    //   - the presence gate: an event with no identity at all is skipped as
    //     `no_payment_identity` before any work happens;
    //   - the legacy/unpriced shape, where no per-refund amount exists to read
    //     and one row is written under this id for the cumulative delta.
    //
    // So the newest is chosen from the DATA, not the position: the greatest
    // `created` wins, and the list's own order only breaks a tie, because
    // Stripe stamps whole seconds and two refunds can share one. A page that
    // arrived oldest-first therefore changes nothing here — the fake transport
    // lists oldest-first on purpose so a position-trusting reader fails.
    const refunds = object.refunds && Array.isArray(object.refunds.data) ? object.refunds.data : [];
    let newest = null;
    let newestCreated = null;
    for (const entry of refunds) {
      if (!entry || typeof entry !== "object") continue;
      const created = Number(entry.created);
      const stamp = Number.isFinite(created) ? created : null;
      if (!newest) { newest = entry; newestCreated = stamp; continue; }
      // One side has no comparable stamp: keep the order Stripe sent.
      if (stamp === null || newestCreated === null) continue;
      if (stamp > newestCreated) { newest = entry; newestCreated = stamp; }
    }
    const refundId = text(
      (newest && (newest.id || newest.refundId))
      // Kept so a hand-built or legacy payload still resolves rather than
      // silently losing its money.
      || object.refundId
      || object.refund_id
    );
    return refundId ? `refund:${refundId}` : "";
  }
  if (type.startsWith("charge.dispute")) {
    const disputeId = text(object.id);
    return disputeId ? `dispute:${disputeId}` : "";
  }
  const intent = text(object.payment_intent || object.paymentIntent || (type.startsWith("payment_intent.") ? object.id : ""));
  return intent ? `pi:${intent}` : "";
}

/**
 * EVERY refund on the charge, and whether the list was complete.
 *
 * `externalPaymentId` above answers "which ONE refund is this delivery about",
 * and it answers it by recency. While a row could only be written for one
 * refund, that answer leaned on two conventions rather than contracts: that
 * `refunds.data` arrives newest first, and that a list too long for one page
 * loses its OLDER end.
 *
 * This is the answer that needs neither, so neither is a standing correctness
 * assumption any more. A charge's refunds are a SET, each
 * with its own id, and the ledger is already keyed by that id
 * (`paymentLedger/{provider}:refund:{id}`) — so the identity does the deduping
 * and the order the provider happened to send them in decides nothing at all.
 * A delivery that carries two refunds we have never seen writes two rows; a
 * delivery that carries five we already hold writes none. Reordered, replayed
 * or delivered out of sequence, the outcome is the same set.
 *
 * `complete` is `has_more === true` inverted: when Stripe says the list is
 * truncated we have NOT seen every refund, and the caller completes it through
 * the provider rather than guessing which end was cut. `chargeId` is what it
 * needs to ask.
 *
 * Amounts come from each refund's own `amount`, never from the charge's
 * cumulative `amount_refunded` — adding three payloads' running totals refunds
 * £1,700 on a £1,000 charge, which is the trap this rail already documents.
 */
function refundSetFrom(event) {
  const type = text(event && event.type);
  const object = (event && event.data && event.data.object) || {};
  if (!type.startsWith("charge.refunded")) {
    return { refunds: [], complete: true, chargeId: "", hasMore: false };
  }

  const list = object.refunds && typeof object.refunds === "object" && !Array.isArray(object.refunds)
    ? object.refunds
    : null;
  const rows = list && Array.isArray(list.data) ? list.data : [];
  const seen = new Set();
  const refunds = [];
  for (const entry of rows) {
    if (!entry || typeof entry !== "object") continue;
    const id = text(entry.id || entry.refundId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const amount = Number(entry.amount);
    refunds.push({
      id,
      externalPaymentId: `refund:${id}`,
      // `null` rather than 0 for an unreadable amount: a refund whose figure we
      // cannot read is not a refund of nothing, and the caller must be able to
      // tell those apart rather than writing a £0.00 row.
      amountMinor: Number.isSafeInteger(amount) && amount > 0 ? amount : null,
      createdAtSeconds: Number.isFinite(Number(entry.created)) ? Number(entry.created) : null
    });
  }

  // The legacy key, kept for the same reason the extractor keeps it: a
  // hand-built or replayed payload still resolves rather than losing its money.
  //
  // ITS AMOUNT IS DELIBERATELY NULL, and the caller must price it from the
  // cumulative delta instead. I tried the obvious thing first — this shape
  // carries no list, so it describes one refund, so the charge's
  // `amount_refunded` must be that refund's own figure — and it is wrong the
  // moment the SAME charge is delivered again under a different refund id: two
  // deliveries, two ids, each priced at its own running total, £1,000 + £200 on
  // a £1,000 charge. `payments-races` catches it.
  //
  // A delta cannot double-count, because the second delivery moves the total by
  // nothing. So per-refund amounts are used only where Stripe actually gives
  // them — inside `refunds.data` — and the legacy shape keeps the arithmetic
  // that was always immune to redelivery.
  if (!refunds.length) {
    const legacy = text(object.refundId || object.refund_id);
    if (legacy) {
      refunds.push({ id: legacy, externalPaymentId: `refund:${legacy}`, amountMinor: null, createdAtSeconds: null });
    }
  }

  const hasMore = Boolean(list && list.has_more === true);
  return { refunds, complete: !hasMore, hasMore, chargeId: text(object.id) };
}

/**
 * Does the event's own claim match what we asked for?
 *
 * Stripe tells us the amount, the currency and our metadata; all three have to
 * agree with the payment request we created, or the event is a mismatch and
 * goes to the operator rather than to the ledger. Amount is compared in minor
 * units as integers — never as floats, and never "close enough".
 */
function matchesRequest(event, request) {
  const object = (event && event.data && event.data.object) || {};
  const req = request && typeof request === "object" ? request : {};
  const problems = [];

  const metadata = object.metadata && typeof object.metadata === "object" ? object.metadata : {};
  if (text(metadata.paymentRequestId) !== text(req.paymentRequestId)) problems.push("payment_request_mismatch");
  if (text(metadata.companyId) !== text(req.companyId)) problems.push("workspace_mismatch");

  const currency = text(object.currency).toUpperCase();
  if (currency && currency !== text(req.currency).toUpperCase()) problems.push("currency_mismatch");

  const amount = object.amount_total === undefined ? object.amount : object.amount_total;
  if (amount !== undefined && amount !== null) {
    if (!Number.isSafeInteger(Number(amount)) || Number(amount) !== Number(req.amountMinor)) problems.push("amount_mismatch");
  }

  const account = text(event && event.account);
  if (text(req.connectedAccountId) && account !== text(req.connectedAccountId)) problems.push("account_mismatch");

  return { ok: problems.length === 0, problems };
}

module.exports = {
  RAIL_PLATFORM,
  RAIL_CONNECTED,
  CONNECTED_EVENT_TYPES,
  PLATFORM_EVENT_TYPES,
  routeEvent,
  refundSetFrom,
  platformEventAdmissible,
  connectedEventAdmissible,
  eventLedgerId,
  externalPaymentId,
  matchesRequest
};

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
    const refundId = text(object.refundId || object.refund_id);
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
  platformEventAdmissible,
  eventLedgerId,
  externalPaymentId,
  matchesRequest
};

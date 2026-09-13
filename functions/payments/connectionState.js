// PR-P0 — the Stripe Connect connection state machine (plan §6.1).
//
// One workspace, one connected Stripe account, one document:
//   companies/{companyId}/paymentConnections/stripe
//
// The state is NOT stored by the client and NOT chosen by us: it is DERIVED,
// every time, from what Stripe says about the account (charges_enabled,
// payouts_enabled, requirements). Storing a hand-set status is how a connection
// stays "ready" in our UI for a week after Stripe restricted it.
//
// deriveStatus() below is therefore a pure function of an account snapshot, and
// the document's `status` field is a cache of its answer — never an input to it.
//
// What this module deliberately does NOT do:
//   - it never sees or returns the account id (server-only, plan §6.1);
//   - it never talks to Stripe (PR-P0 has no external calls);
//   - it never decides who may act — that is permissions.js.

const STATUSES = Object.freeze(["disconnected", "onboarding", "restricted", "ready", "error"]);

/**
 * Which transitions the server will write.
 *
 * Every live status can fall back to `disconnected`, because a disconnect is an
 * operator action and must always be possible. `disconnected` can only go to
 * `onboarding`: a workspace re-connects by starting onboarding again, never by
 * jumping straight to ready on a stale snapshot.
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  disconnected: Object.freeze(["onboarding"]),
  onboarding: Object.freeze(["onboarding", "restricted", "ready", "error", "disconnected"]),
  restricted: Object.freeze(["restricted", "ready", "onboarding", "error", "disconnected"]),
  ready: Object.freeze(["ready", "restricted", "error", "disconnected"]),
  error: Object.freeze(["error", "onboarding", "restricted", "ready", "disconnected"])
});

function boolOf(value) {
  return value === true;
}

function listOf(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

/**
 * Stripe account snapshot -> connection status.
 *
 * `snapshot` is the shape of a Stripe Account as far as this rail cares:
 *   { chargesEnabled, payoutsEnabled, detailsSubmitted,
 *     requirements: { currentlyDue[], pastDue[], disabledReason } }
 *
 * The order of the tests is the whole point:
 *   1. no account at all -> disconnected;
 *   2. Stripe naming a disabled_reason outranks every enabled flag — an account
 *      can report charges_enabled true while Stripe is about to stop it;
 *   3. past_due outranks currently_due: past_due is already costing the
 *      workspace money, currently_due is a deadline;
 *   4. charges_enabled is what decides "can this workspace take money", NOT
 *      payouts_enabled. A workspace that can charge but cannot yet be paid out
 *      is `ready` with a warning, because the customer's payment still works
 *      and the money is safe in the connected account. Calling that state
 *      `restricted` would stop a business trading over a bank detail.
 */
function deriveStatus(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "disconnected";
  if (snapshot.missing === true) return "disconnected";

  const requirements = snapshot.requirements && typeof snapshot.requirements === "object" ? snapshot.requirements : {};
  const disabledReason = String(requirements.disabledReason || "").trim();
  const pastDue = listOf(requirements.pastDue);
  const currentlyDue = listOf(requirements.currentlyDue);
  const charges = boolOf(snapshot.chargesEnabled);
  const submitted = boolOf(snapshot.detailsSubmitted);

  if (disabledReason) return "restricted";
  if (pastDue.length) return "restricted";
  if (charges) return "ready";
  if (!submitted) return "onboarding";
  if (currentlyDue.length) return "restricted";
  // Details submitted, nothing outstanding, and Stripe still will not take
  // charges: that is Stripe reviewing, which is still onboarding to the user.
  return "onboarding";
}

/** Can the server move from `from` to `to`? Unknown states are refused. */
function canTransition(from, to) {
  const source = STATUSES.includes(from) ? from : "disconnected";
  if (!STATUSES.includes(to)) return false;
  return ALLOWED_TRANSITIONS[source].includes(to);
}

/**
 * What the customer-facing rail is allowed to do in each state.
 *
 * `ready` is the ONLY state that may create a new payment request. An existing
 * open link keeps working while the account is restricted — the customer's page
 * is Stripe's, and cancelling links because our snapshot went stale would break
 * payments that Stripe would have accepted.
 */
function capabilitiesFor(status) {
  const state = STATUSES.includes(status) ? status : "disconnected";
  return Object.freeze({
    status: state,
    canCreatePaymentRequest: state === "ready",
    canCollectOnExistingLink: state === "ready" || state === "restricted",
    canRefund: state === "ready" || state === "restricted",
    needsAttention: state === "restricted" || state === "error",
    needsOnboarding: state === "onboarding" || state === "disconnected"
  });
}

/**
 * The summary a client is allowed to read (plan §6.1: "Güvenli callable yalnız
 * özet dönsün").
 *
 * The account id is not in the output and cannot be: it is never read from the
 * document here. requirementsSummary is a COUNT and a list of requirement KEYS
 * (Stripe's own field names, e.g. "individual.verification.document") — never
 * the values a person submitted.
 */
function publicSummary(connection) {
  const row = connection && typeof connection === "object" ? connection : {};
  const status = STATUSES.includes(row.status) ? row.status : "disconnected";
  const requirements = row.requirementsSummary && typeof row.requirementsSummary === "object" ? row.requirementsSummary : {};
  return Object.freeze({
    provider: "stripe",
    status,
    mode: row.mode === "live" ? "live" : "test",
    chargesEnabled: boolOf(row.chargesEnabled),
    payoutsEnabled: boolOf(row.payoutsEnabled),
    requirementsSummary: Object.freeze({
      pastDueCount: listOf(requirements.pastDue).length,
      currentlyDueCount: listOf(requirements.currentlyDue).length,
      keys: Object.freeze(listOf(requirements.pastDue).concat(listOf(requirements.currentlyDue)).slice(0, 20))
    }),
    lastErrorCode: String(row.lastErrorCode || ""),
    connectedAt: row.connectedAt || null,
    lastCheckedAt: row.lastCheckedAt || null,
    ...capabilitiesFor(status)
  });
}

module.exports = { STATUSES, ALLOWED_TRANSITIONS, deriveStatus, canTransition, capabilitiesFor, publicSummary };

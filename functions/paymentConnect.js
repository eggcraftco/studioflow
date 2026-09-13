// PR-P1 — the workspace's own Stripe connection.
//
// A factory, like squareConnector and filesLibrary: everything it touches is
// injected, so the unit tests drive the real code paths with a fake transport
// and a fake Firestore, and CI makes no external call.
//
// Three boundaries this module exists to hold:
//
//   1. The connected account id is SERVER-ONLY. It is written to
//      companies/{cid}/paymentConnections/stripe, which firestore.rules denies
//      to every client, and it never appears in a callable's response — the
//      clients get connectionState.publicSummary(), which has no field for it.
//
//   2. This webhook is NOT the subscription webhook. It is its own endpoint
//      with its own signing secret, and every event it accepts must carry an
//      event.account that resolves to exactly one workspace. See
//      payments/eventBoundary.js for why that is the first thing PR-P1 ships.
//
//   3. Disconnecting does NOT delete the Stripe account. The account belongs to
//      the workspace, not to NivaDesk — it holds their money and their payout
//      history. Disconnecting removes OUR link to it and nothing else.

const connectionState = require("./payments/connectionState");
const eventBoundary = require("./payments/eventBoundary");
const permissions = require("./payments/permissions");

const PROVIDER = "stripe";
const CONNECTION_DOC = "stripe";

function createPaymentConnectFunctions({
  admin,
  onCall,
  onRequest,
  HttpsError,
  requireWorkspace,
  workspaceActor,
  transport,
  // Whether this environment can talk to Stripe at all. The rail is inert until
  // its secrets exist, and a client that could not tell the difference would
  // show a Set up button that throws failed-precondition — worse than a card
  // that says the feature is not here yet.
  railConfigured = () => false,
  secrets = [],
  region = "europe-west2",
  mode = "test",
  onboardingReturnUrl = () => "https://nivadesk.app/settings",
  onboardingRefreshUrl = () => "https://nivadesk.app/settings"
}) {
  const db = () => admin.firestore();
  const connectionRef = (companyId) =>
    db().collection("companies").doc(String(companyId)).collection("paymentConnections").doc(CONNECTION_DOC);
  // The reverse index a webhook needs: a connected account id arrives with no
  // workspace attached, and a collection-group query per event would be a read
  // on every delivery. Top level, server-only, one document per account.
  const indexRef = (accountId) =>
    db().collection("paymentConnectionIndex").doc(`${PROVIDER}:${String(accountId)}`);

  function requireAction(action, context, order) {
    const actor = workspaceActor(context);
    const decision = permissions.can(action, actor, order);
    if (!decision.allowed) {
      throw new HttpsError("permission-denied", messageFor(action, decision.reason), { reason: decision.reason });
    }
    return actor;
  }

  function messageFor(action, reason) {
    if (reason === "owner_only") return "Only the workspace owner can connect or disconnect Stripe.";
    if (reason === "needs_financial_info") return "Your workspace access does not include financial information.";
    if (reason === "not_assigned_to_you") return "This order is not assigned to you.";
    if (reason === "read_only_role") return "Your workspace role is read-only.";
    return `You cannot ${action} payments for this workspace.`;
  }

  async function readConnection(companyId) {
    const snapshot = await connectionRef(companyId).get();
    return snapshot.exists ? (snapshot.data() || {}) : {};
  }

  /**
   * Write what Stripe just said, and only if the move is one we allow.
   *
   * The stored `status` is a cache of deriveStatus(); a transition the state
   * machine refuses is recorded as an error rather than written, because the
   * alternative — writing it anyway — is how a "ready" workspace appears out of
   * a disconnected one on a stale snapshot.
   */
  async function applyAccountSnapshot(companyId, account, { reason = "" } = {}) {
    const current = await readConnection(companyId);
    const from = String(current.status || "disconnected");
    const to = connectionState.deriveStatus(account);
    const nowMs = Date.now();

    if (!connectionState.canTransition(from, to)) {
      await connectionRef(companyId).set({
        lastCheckedAt: nowMs,
        lastErrorCode: "refused_transition",
        lastRefusedTransition: `${from}->${to}`,
        updatedAt: nowMs
      }, { merge: true });
      return { ...current, status: from, refusedTransition: `${from}->${to}` };
    }

    const row = {
      provider: PROVIDER,
      stripeAccountId: String(account.accountId || current.stripeAccountId || ""),
      mode,
      status: to,
      chargesEnabled: account.chargesEnabled === true,
      payoutsEnabled: account.payoutsEnabled === true,
      requirementsSummary: {
        currentlyDue: (account.requirements && account.requirements.currentlyDue) || [],
        pastDue: (account.requirements && account.requirements.pastDue) || [],
        disabledReason: (account.requirements && account.requirements.disabledReason) || ""
      },
      lastCheckedAt: nowMs,
      lastErrorCode: "",
      lastRefusedTransition: "",
      updatedAt: nowMs,
      updatedBy: reason || "snapshot"
    };
    if (to === "ready" && !current.connectedAt) row.connectedAt = nowMs;
    await connectionRef(companyId).set(row, { merge: true });
    return { ...current, ...row };
  }

  // ---------------------------------------------------------------------------
  // Callables
  // ---------------------------------------------------------------------------

  /** Everyone in the workspace may learn whether payments work. Summary only. */
  const getStripePaymentConnection = onCall({ region }, async (request) => {
    const context = await requireWorkspace(request);
    requireAction("viewConnection", context);
    const connection = await readConnection(context.companyId);
    let configured = false;
    try { configured = railConfigured() === true; } catch { configured = false; }
    return { ok: true, configured, connection: connectionState.publicSummary(connection) };
  });

  /**
   * Start or resume onboarding. Owner only.
   *
   * Reuses the workspace's existing account whenever there is one: creating a
   * second Stripe account for a workspace that already has one would split its
   * money across two accounts with no way to merge them.
   */
  const beginStripeConnectOnboarding = onCall({ region, secrets }, async (request) => {
    const context = await requireWorkspace(request);
    requireAction("connect", context);
    const { companyId, companyData, uid } = context;

    const current = await readConnection(companyId);
    let accountId = String(current.stripeAccountId || "").trim();
    if (!accountId) {
      const created = await transport().createAccount({
        country: String((companyData && companyData.country) || "").trim() || undefined,
        email: String((companyData && companyData.ownerEmail) || "").trim() || undefined,
        workspaceId: companyId
      });
      accountId = created.accountId;
      if (!accountId) throw new HttpsError("internal", "Stripe did not return an account.");
      // Index first. If the link creation below fails, the account still exists
      // at Stripe and its events must still find their way home; an account we
      // created but cannot resolve is exactly the "unknown_connected_account"
      // case the boundary refuses.
      await indexRef(accountId).set({
        provider: PROVIDER, companyId: String(companyId), createdAtMs: Date.now(), createdByUid: String(uid || "")
      });
      await connectionRef(companyId).set({
        provider: PROVIDER,
        stripeAccountId: accountId,
        mode,
        status: "onboarding",
        chargesEnabled: false,
        payoutsEnabled: false,
        createdByUid: String(uid || ""),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        updatedBy: "begin_onboarding"
      }, { merge: true });
    }

    const link = await transport().createAccountLink({
      accountId,
      refreshUrl: onboardingRefreshUrl(companyId),
      returnUrl: onboardingReturnUrl(companyId)
    });
    if (!link || !link.url) throw new HttpsError("internal", "Stripe did not return an onboarding link.");
    // The URL is the only Stripe-shaped value that reaches a client here, and
    // it is single-use and short-lived by Stripe's design. The account id is
    // not returned, and the summary has no field for it.
    const connection = await readConnection(companyId);
    return { ok: true, url: link.url, expiresAt: link.expiresAt || 0, connection: connectionState.publicSummary(connection) };
  });

  /** Re-read the account from Stripe and re-derive the status. Owner only. */
  const refreshStripePaymentConnection = onCall({ region, secrets }, async (request) => {
    const context = await requireWorkspace(request);
    requireAction("connect", context);
    const current = await readConnection(context.companyId);
    const accountId = String(current.stripeAccountId || "").trim();
    if (!accountId) {
      return { ok: true, connection: connectionState.publicSummary({ status: "disconnected" }) };
    }
    let account;
    try {
      account = await transport().retrieveAccount(accountId);
    } catch (error) {
      // A missing account at Stripe is a real disconnection, not a transient
      // failure: the workspace deleted it, or it was never ours.
      const missing = String(error && error.code) === "resource_missing";
      await connectionRef(context.companyId).set({
        status: missing ? "disconnected" : String(current.status || "error"),
        lastErrorCode: missing ? "account_missing" : "provider_unreachable",
        lastCheckedAt: Date.now(),
        updatedAt: Date.now(),
        updatedBy: "refresh_failed"
      }, { merge: true });
      const after = await readConnection(context.companyId);
      return { ok: true, connection: connectionState.publicSummary(after) };
    }
    const next = await applyAccountSnapshot(context.companyId, account, { reason: "refresh" });
    return { ok: true, connection: connectionState.publicSummary(next) };
  });

  /**
   * Remove our link. Owner only.
   *
   * The Stripe account is NOT deleted — it is the workspace's, it holds their
   * money, and deleting it is theirs to do in their own Stripe dashboard. The
   * index entry goes, so any event that still arrives for it is refused by the
   * boundary rather than applied to a workspace that disconnected.
   */
  const disconnectStripePaymentConnection = onCall({ region }, async (request) => {
    const context = await requireWorkspace(request);
    requireAction("connect", context);
    const current = await readConnection(context.companyId);
    const accountId = String(current.stripeAccountId || "").trim();
    if (accountId) await indexRef(accountId).delete();
    await connectionRef(context.companyId).set({
      status: "disconnected",
      chargesEnabled: false,
      payoutsEnabled: false,
      disconnectedAt: Date.now(),
      disconnectedByUid: String(context.uid || ""),
      updatedAt: Date.now(),
      updatedBy: "disconnect"
    }, { merge: true });
    const after = await readConnection(context.companyId);
    return { ok: true, connection: connectionState.publicSummary(after), accountKeptAtProvider: Boolean(accountId) };
  });

  // ---------------------------------------------------------------------------
  // Webhook — its own endpoint, its own signing secret
  // ---------------------------------------------------------------------------

  async function resolveAccountCompany(accountId) {
    const snapshot = await indexRef(accountId).get();
    if (!snapshot.exists) return "";
    return String((snapshot.data() || {}).companyId || "");
  }

  /**
   * Record the event and say whether this delivery should do the work.
   *
   * Keyed by provider:account:eventId, because Stripe event ids are unique per
   * account and not globally. A row that already carries processedAt returns
   * duplicate:true before anything else happens.
   */
  async function claimEvent(event, companyId) {
    const id = eventBoundary.eventLedgerId(PROVIDER, event.account, event.id);
    if (!id) return { ok: false, reason: "malformed_event" };
    const ref = db().collection("paymentProviderEvents").doc(id);
    const existing = await ref.get();
    if (existing.exists && (existing.data() || {}).processedAt) return { ok: false, reason: "duplicate", ref };
    await ref.set({
      provider: PROVIDER,
      connectedAccountId: String(event.account || ""),
      companyId: String(companyId || ""),
      eventId: String(event.id || ""),
      eventType: String(event.type || ""),
      objectId: String((event.data && event.data.object && event.data.object.id) || ""),
      receivedAt: Date.now(),
      status: "received",
      attempts: admin.firestore.FieldValue.increment(1),
      schemaVersion: 1
    }, { merge: true });
    return { ok: true, ref };
  }

  const stripeConnectWebhook = onRequest({ region, secrets }, async (request, response) => {
    if (request.method !== "POST") { response.status(405).send("Method not allowed"); return; }
    const signature = request.headers["stripe-signature"];
    if (!signature) { response.status(400).send("Missing Stripe signature"); return; }

    let event;
    try {
      event = transport().verifyWebhook(request.rawBody, signature, process.env.STRIPE_CONNECT_WEBHOOK_SECRET || "");
    } catch {
      response.status(400).send("Webhook signature verification failed.");
      return;
    }

    const routed = eventBoundary.routeEvent(event, () => "");
    // routeEvent needs the workspace, and the lookup is async, so the rail is
    // decided in two steps: the shape first (is this even a connected-account
    // event?), then the account.
    if (routed.rail === eventBoundary.RAIL_PLATFORM) {
      // A platform event reached the CONNECTED endpoint. Both endpoints have
      // their own secret, so this should be impossible; if it happens, it is
      // misconfiguration, and handling it here would be the exact merge of the
      // two rails this endpoint exists to prevent.
      response.status(202).json({ received: true, ignored: "platform_event_on_connect_endpoint" });
      return;
    }

    const companyId = await resolveAccountCompany(event.account);
    const decided = eventBoundary.routeEvent(event, () => companyId);
    if (!decided.accepted) {
      // Unknown account, or an event type this rail does not claim. Answered
      // 202 so Stripe stops retrying something we will never accept.
      response.status(202).json({ received: true, ignored: decided.reason });
      return;
    }

    let claim;
    try {
      claim = await claimEvent(event, companyId);
    } catch (error) {
      response.status(500).json({ received: true, error: "ledger_unavailable" });
      return;
    }
    if (!claim.ok) { response.json({ received: true, result: { duplicate: true } }); return; }

    try {
      let result = { skipped: true, reason: "unhandled_event" };
      if (event.type === "account.updated") {
        // The body is used to identify the account, never to describe it: the
        // status is re-derived from a fresh read, the same discipline
        // applySubscription already uses on the subscription rail.
        const account = await transport().retrieveAccount(event.account);
        const next = await applyAccountSnapshot(companyId, account, { reason: "account.updated" });
        result = { skipped: false, status: next.status };
      }
      await claim.ref.set({
        status: result.skipped ? "skipped" : "processed",
        processedAt: Date.now(),
        result
      }, { merge: true });
      response.json({ received: true, result });
    } catch (error) {
      // No processedAt, so Stripe's retry finds the row claimable again.
      await claim.ref.set({ status: "error", lastErrorCode: "processing_failed" }, { merge: true }).catch(() => {});
      response.status(500).json({ received: true, error: "processing_failed" });
    }
  });

  return {
    getStripePaymentConnection,
    beginStripeConnectOnboarding,
    refreshStripePaymentConnection,
    disconnectStripePaymentConnection,
    stripeConnectWebhook,
    _internal: { applyAccountSnapshot, readConnection, resolveAccountCompany, claimEvent, connectionRef, indexRef }
  };
}

module.exports = { createPaymentConnectFunctions, PROVIDER, CONNECTION_DOC };

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

const crypto = require("crypto");
const connectionState = require("./payments/connectionState");
const eventBoundary = require("./payments/eventBoundary");
const permissions = require("./payments/permissions");
const requestState = require("./payments/paymentRequestState");
const planner = require("./payments/requestPlanner");
const orderLedger = require("./payments/orderLedger");
const money = require("./payments/money");

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
    if (accountId) {
      // RECONNECT. `disconnectStripePaymentConnection` deletes the index row and
      // deliberately keeps `stripeAccountId` — the account is the workspace's
      // and holds their money, so it is never deleted at Stripe. That left a
      // hole: this branch already had an account id, so the index write below
      // never ran, and the row a disconnect removed was never put back.
      //
      // The consequence was silent and permanent. `resolveAccountCompany`
      // reads that row and returns "" without it, so every later webhook for
      // this workspace is refused as `unknown_connected_account` — the account
      // charges cards, the money moves at Stripe, and nothing reaches the
      // ledger. Reconnecting looked like it worked, because onboarding returns
      // a link either way.
      //
      // Idempotent by shape: `set` on a row that already exists rewrites the
      // same fields. So the ordinary case — a reconnect that never lost its
      // index — is unchanged.
      await indexRef(accountId).set({
        provider: PROVIDER, companyId: String(companyId), createdAtMs: Date.now(), createdByUid: String(uid || "")
      });
    } else {
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

    // The other environment's money. A test-mode deployment holds test-mode
    // keys and connects its workspaces in test mode, so a live event on it —
    // and a test event on a live deployment — is looking at figures from a
    // reality this one has no account in. Refused BEFORE the event is claimed,
    // so a misrouted endpoint leaves no half-processed row behind it.
    const admissible = eventBoundary.connectedEventAdmissible(event, { expectLivemode: mode === "live" });
    if (!admissible.admissible) {
      response.status(202).json({ received: true, ignored: admissible.reason });
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
      const PAYMENT_EVENTS = [
        "checkout.session.completed", "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed", "checkout.session.expired",
        "payment_intent.processing", "payment_intent.succeeded", "payment_intent.payment_failed",
        "charge.refunded", "charge.dispute.created"
      ];
      if (PAYMENT_EVENTS.includes(event.type)) {
        result = await applyProviderPayment(companyId, event, decided);
      } else if (event.type === "account.updated") {
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

  // ---------------------------------------------------------------------------
  // Payment requests (PR-P2)
  // ---------------------------------------------------------------------------

  const requestRef = (companyId, id) =>
    db().collection("companies").doc(String(companyId)).collection("paymentRequests").doc(String(id));
  const requestsRef = (companyId) =>
    db().collection("companies").doc(String(companyId)).collection("paymentRequests");
  const ledgerRef = (companyId, id) =>
    db().collection("companies").doc(String(companyId)).collection("paymentLedger").doc(String(id));
  const orderRef = (orderId) => db().collection("siparisler").doc(String(orderId));

  async function readOrder(companyId, orderId) {
    const snapshot = await orderRef(orderId).get();
    if (!snapshot.exists) throw new HttpsError("not-found", "That order no longer exists.");
    const data = snapshot.data() || {};
    if (String(data.companyId || "") !== String(companyId)) {
      throw new HttpsError("permission-denied", "That order belongs to another workspace.");
    }
    return data;
  }

  async function readRequests(companyId, orderId) {
    const snapshot = await requestsRef(companyId).where("orderId", "==", String(orderId)).get();
    return snapshot.docs.map((doc) => ({ paymentRequestId: doc.id, ...(doc.data() || {}) }));
  }

  /**
   * The public shape of a payment request. No provider session id, no account.
   * The URL is Stripe's own hosted page and is the one provider value a client
   * is meant to have — it is what gets sent to the customer.
   */
  function requestSummary(row) {
    const data = row && typeof row === "object" ? row : {};
    return {
      paymentRequestId: String(data.paymentRequestId || ""),
      orderId: String(data.orderId || ""),
      purpose: String(data.purpose || ""),
      amountMinor: Number(data.amountMinor || 0),
      currency: String(data.currency || ""),
      publicStatus: String(data.publicStatus || "draft"),
      url: String(data.url || ""),
      createdAtMs: Number(data.createdAtMs || 0),
      paidAtMs: Number(data.paidAtMs || 0),
      expiresAtMs: Number(data.expiresAtMs || 0),
      paidAmountMinor: Number(data.paidAmountMinor || 0),
      refundedAmountMinor: Number(data.refundedAmountMinor || 0),
      createdByUid: String(data.createdByUid || ""),
      stale: data.stale === true,
      staleReason: String(data.staleReason || "")
    };
  }

  /**
   * Create (or finish) a payment link.
   *
   * The order of operations is the whole design, because a Stripe call and a
   * Firestore write are two systems and cannot be one transaction:
   *
   *   1. reserve, in a TRANSACTION: re-read the order and every open request,
   *      run the planner, and create the request document in `draft`. Two
   *      clicks racing each other both read the same headroom otherwise, and
   *      both get a link.
   *   2. call Stripe with the request's own document id as the idempotency key.
   *   3. write the session id and the URL, and move to `open`.
   *
   * Crash between 2 and 3 and the document is left in `draft`. Calling again
   * with the same clientRequestId finds it, sends Stripe the SAME key, and
   * Stripe returns the SAME session — one link, not two. That is why step 1
   * writes before the provider call rather than after it.
   */
  const createOrderPaymentRequest = onCall({ region, secrets }, async (request) => {
    const context = await requireWorkspace(request);
    const data = (request && request.data) || {};
    const orderId = String(data.orderId || "").trim();
    if (!orderId) throw new HttpsError("invalid-argument", "An order is required.");

    const order = await readOrder(context.companyId, orderId);
    requireAction("createRequest", context, order);

    const connection = await readConnection(context.companyId);
    const capability = connectionState.capabilitiesFor(String(connection.status || "disconnected"));
    if (!capability.canCreatePaymentRequest) {
      throw new HttpsError("failed-precondition", "Connect Stripe before asking a customer to pay.", {
        reason: "connection_not_ready", status: capability.status
      });
    }
    const accountId = String(connection.stripeAccountId || "").trim();
    if (!accountId) throw new HttpsError("failed-precondition", "This workspace has no Stripe account yet.");

    // The currency is the workspace's, resolved from its symbol — and refused
    // rather than guessed when the symbol names more than one code.
    const currency = resolveWorkspaceCurrency(data, context);
    const amountMinor = Number(data.amountMinor);
    const chargeable = money.isChargeableAmount(amountMinor, currency);
    if (!chargeable.ok) throw new HttpsError("invalid-argument", "That amount cannot be charged.", { reason: chargeable.reason });

    const purpose = String(data.purpose || "remaining_balance");
    const clientRequestId = String(data.clientRequestId || "").trim();

    // Resume an unfinished attempt before making a new one.
    if (clientRequestId) {
      const existing = await requestsRef(context.companyId).where("clientRequestId", "==", clientRequestId).limit(1).get();
      if (!existing.empty) {
        const row = { paymentRequestId: existing.docs[0].id, ...(existing.docs[0].data() || {}) };
        if (String(row.publicStatus) !== "draft") return { ok: true, resumed: true, request: requestSummary(row) };
        const finished = await finishDraftRequest(context.companyId, accountId, row);
        return { ok: true, resumed: true, request: requestSummary(finished) };
      }
    }

    const created = await db().runTransaction(async (transaction) => {
      const orderSnapshot = await transaction.get(orderRef(orderId));
      const live = orderSnapshot.exists ? (orderSnapshot.data() || {}) : {};
      const openSnapshot = await transaction.get(requestsRef(context.companyId).where("orderId", "==", orderId));
      const open = openSnapshot.docs.map((doc) => ({ paymentRequestId: doc.id, ...(doc.data() || {}) }));
      const decision = planner.canCreate(live, open, amountMinor, { purpose });
      if (!decision.allowed) {
        throw new HttpsError("failed-precondition", messageForPlanner(decision.reason), {
          reason: decision.reason,
          headroomMinor: decision.headroomMinor,
          claimedMinor: decision.claimedMinor,
          outstandingMinor: decision.outstandingMinor
        });
      }
      const ref = requestsRef(context.companyId).doc();
      transaction.set(ref, {
        orderId,
        customerId: String(live.customerId || ""),
        purpose,
        amountMinor,
        currency,
        provider: PROVIDER,
        // The account this link was created on, so a later event can be checked
        // against the account the money was ASKED for. Server-only, like the
        // connection document it comes from: requestSummary() has no field for
        // it, so it never reaches a client.
        connectedAccountId: String(accountId),
        publicStatus: "draft",
        clientRequestId,
        createdByUid: String(context.uid || ""),
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        schemaVersion: 1,
        // What the order looked like when the link was made. A link that asks
        // for money against a version of the order nobody would recognise is
        // exactly what staleRequests() has to be able to notice.
        sourceOrderRemaining: Number(live.remainingAmount || 0)
      });
      return { paymentRequestId: ref.id, orderId, amountMinor, currency, purpose, publicStatus: "draft" };
    });

    const finished = await finishDraftRequest(context.companyId, accountId, created);
    return { ok: true, request: requestSummary(finished) };
  });

  /** Steps 2 and 3: the provider call, then the write, keyed so a retry is safe. */
  async function finishDraftRequest(companyId, accountId, row) {
    const session = await transport().createCheckoutSession({
      accountId,
      // The document id IS the idempotency key. Deterministic, unique per
      // request, and already written down before the call went out.
      idempotencyKey: `pr_${companyId}_${row.paymentRequestId}`,
      amountMinor: Number(row.amountMinor),
      currency: String(row.currency),
      productName: `Order ${row.orderId}`,
      successUrl: `${checkoutReturnUrl(companyId)}?pr=${row.paymentRequestId}&status=paid`,
      cancelUrl: `${checkoutReturnUrl(companyId)}?pr=${row.paymentRequestId}&status=cancelled`,
      metadata: { companyId: String(companyId), paymentRequestId: String(row.paymentRequestId), orderId: String(row.orderId) }
    });
    const patch = {
      // Also written here, so a draft reserved before this field existed picks
      // it up when it is finished rather than staying unguarded forever.
      connectedAccountId: String(accountId),
      providerSessionId: String(session.sessionId || ""),
      providerPaymentIntentId: String(session.paymentIntentId || ""),
      url: String(session.url || ""),
      publicStatus: "open",
      expiresAtMs: Number(session.expiresAt || 0) * 1000,
      updatedAtMs: Date.now()
    };
    await requestRef(companyId, row.paymentRequestId).set(patch, { merge: true });
    return { ...row, ...patch };
  }

  function checkoutReturnUrl(companyId) {
    return onboardingReturnUrl(companyId).split("?")[0];
  }

  function messageForPlanner(reason) {
    if (reason === "exceeds_headroom_open_links") return "Another payment link is already open for this order. Cancel it, or ask for less.";
    if (reason === "exceeds_outstanding") return "That is more than this order still owes.";
    if (reason === "nothing_outstanding") return "This order has nothing left to pay.";
    if (reason === "amount_not_positive") return "Enter an amount above zero.";
    return "That payment link cannot be created.";
  }

  function resolveWorkspaceCurrency(data, context) {
    const explicit = money.normalizeCurrency(data && data.currency);
    if (explicit) {
      if (!money.isSupportedCurrency(explicit)) {
        throw new HttpsError("failed-precondition", "That currency cannot be charged yet.", { reason: "unsupported_currency" });
      }
      return explicit;
    }
    const symbol = String((context.companyData && context.companyData.seciliParaBirimi) || "").trim();
    const resolved = money.symbolToCurrency(symbol);
    if (!resolved.ok) {
      // "¥" is JPY or CNY and the two differ by a factor of a hundred. Refusing
      // is the only safe answer; the workspace states a code once and is done.
      throw new HttpsError("failed-precondition", "Choose your currency before taking card payments.", {
        reason: resolved.reason, candidates: resolved.candidates
      });
    }
    return resolved.currency;
  }

  /** Everyone who may see the money may see the links. */
  const listOrderPaymentRequests = onCall({ region }, async (request) => {
    const context = await requireWorkspace(request);
    const orderId = String(((request && request.data) || {}).orderId || "").trim();
    if (!orderId) throw new HttpsError("invalid-argument", "An order is required.");
    const order = await readOrder(context.companyId, orderId);
    requireAction("viewAmounts", context, order);

    const rows = await readRequests(context.companyId, orderId);
    const stale = planner.staleRequests(order, rows);
    const staleById = new Map(stale.map((row) => [row.paymentRequestId, row]));

    // The currency the workspace would actually be charged in, resolved by the
    // server and never by the screen. A client mapping its own symbol would be
    // a second answer, and for "$" and "¥" it would be a guess — which is the
    // one this rail refuses to make. `currency` is empty when the workspace has
    // not settled that question, and the screen shows the plain number.
    let currency = "";
    try { currency = resolveWorkspaceCurrency({}, context); } catch { currency = ""; }

    return {
      ok: true,
      currency,
      outstandingMinor: planner.outstandingMinor(order),
      headroomMinor: planner.headroomMinor(order, rows),
      requests: rows.map((row) => {
        const summary = requestSummary(row);
        const problem = staleById.get(summary.paymentRequestId);
        return problem
          ? { ...summary, stale: true, staleReason: problem.reason, excessMinor: problem.excessMinor }
          : summary;
      })
    };
  });

  /**
   * Every payment link in the workspace, for the Banking screen.
   *
   * Ordered newest first and capped, because this is a screen and not an export
   * — a workspace with ten thousand links must not be able to time the function
   * out by opening a tab. The cap is reported so the screen can say so rather
   * than silently showing a slice.
   *
   * The customer's name is NOT joined in here. It lives on the order, the
   * caller's finance visibility has already been checked, and a list endpoint
   * that fans out to one order read per row is how a screen becomes a bill.
   * The row carries the orderId; the screen already has the orders it shows.
   */
  const listWorkspacePaymentRequests = onCall({ region }, async (request) => {
    const context = await requireWorkspace(request);
    // Workspace-wide, so there is no single order to scope an assigned-only
    // member against. They get their own orders' links and nothing else.
    const actor = workspaceActor(context);
    const view = permissions.can("viewAmounts", actor, {});
    if (!view.allowed) {
      throw new HttpsError("permission-denied", messageFor("viewAmounts", view.reason), { reason: view.reason });
    }
    const limit = Math.min(Math.max(Number(((request && request.data) || {}).limit) || 200, 1), 500);
    const snapshot = await requestsRef(context.companyId).orderBy("createdAtMs", "desc").limit(limit + 1).get();
    const rows = snapshot.docs.map((doc) => ({ paymentRequestId: doc.id, ...(doc.data() || {}) }));
    const truncated = rows.length > limit;
    const page = truncated ? rows.slice(0, limit) : rows;

    const assignedOnly = actor.assignedProjectsOnly === true;
    const visible = [];
    for (const row of page) {
      if (!assignedOnly) { visible.push(row); continue; }
      const order = await orderRef(row.orderId).get();
      const data = order.exists ? (order.data() || {}) : {};
      if (String(data.assignedToUid || "") === String(context.uid || "")) visible.push(row);
    }
    return {
      ok: true,
      truncated,
      requests: visible.map((row) => requestSummary(row))
    };
  });

  /**
   * Cancel a link. Expires the session at Stripe FIRST, then records it.
   *
   * That order is deliberate and it is the opposite of the create path. There,
   * writing first is safe because an unfinished draft can be finished. Here,
   * recording "cancelled" before Stripe has actually stopped the session would
   * tell the workspace the link is dead while the customer's page still takes
   * their card.
   */
  const cancelOrderPaymentRequest = onCall({ region, secrets }, async (request) => {
    const context = await requireWorkspace(request);
    const id = String(((request && request.data) || {}).paymentRequestId || "").trim();
    if (!id) throw new HttpsError("invalid-argument", "A payment request is required.");
    const snapshot = await requestRef(context.companyId, id).get();
    if (!snapshot.exists) throw new HttpsError("not-found", "That payment link no longer exists.");
    const row = { paymentRequestId: id, ...(snapshot.data() || {}) };

    const order = await readOrder(context.companyId, row.orderId);
    requireAction("cancelRequest", context, order);

    if (["paid", "refunded", "partially_refunded", "disputed"].includes(String(row.publicStatus))) {
      throw new HttpsError("failed-precondition", "That payment has already been made.", { reason: "already_paid" });
    }
    if (String(row.publicStatus) === "cancelled") return { ok: true, request: requestSummary(row), already: true };

    const connection = await readConnection(context.companyId);
    const accountId = String(connection.stripeAccountId || "").trim();
    if (accountId && row.providerSessionId) {
      try {
        await transport().expireCheckoutSession({ accountId, sessionId: row.providerSessionId });
      } catch (error) {
        // Already expired or already paid at Stripe. Re-reading the truth is
        // the webhook's job; refusing here would leave a link nobody can close.
        if (String(error && error.code) !== "resource_missing") {
          throw new HttpsError("unavailable", "Stripe could not close that link. Try again in a moment.");
        }
      }
    }
    const patch = { publicStatus: "cancelled", cancelledAtMs: Date.now(), cancelledByUid: String(context.uid || ""), updatedAtMs: Date.now() };
    await requestRef(context.companyId, id).set(patch, { merge: true });
    return { ok: true, request: requestSummary({ ...row, ...patch }) };
  });

  /**
   * A provider payment event, applied exactly once.
   *
   * Four writes, in an order chosen so that a crash anywhere leaves something
   * recoverable and nothing double-counted:
   *
   *   1. the LEDGER row, with `create()` on a deterministic id. This is the
   *      idempotency point for the money. A second delivery throws
   *      already-exists and the rest is skipped.
   *   2. the request's own status, through the pure reducer.
   *   3. the order's money fields, repaired from the whole ledger rather than
   *      incremented — so a repair that runs twice, or after a client wiped the
   *      document, converges on the same numbers.
   *   4. the over-collection verdict, recorded on the request.
   *
   * If we crash after 1, the reconcile path rebuilds 2-4 from the ledger. If we
   * crash before 1, Stripe redelivers. Neither leaves money counted twice.
   */
  async function applyProviderPayment(companyId, event, decided) {
    const object = (event.data && event.data.object) || {};
    const externalPaymentId = eventBoundary.externalPaymentId(event);
    if (!externalPaymentId) return { skipped: true, reason: "no_payment_identity" };

    const paymentRequestId = String((object.metadata && object.metadata.paymentRequestId) || "").trim();
    if (!paymentRequestId) return { skipped: true, reason: "no_payment_request_on_event" };
    const snapshot = await requestRef(companyId, paymentRequestId).get();
    if (!snapshot.exists) return { skipped: true, reason: "payment_request_not_found" };
    const row = { paymentRequestId, ...(snapshot.data() || {}) };

    const match = eventBoundary.matchesRequest(event, {
      paymentRequestId, companyId, currency: row.currency,
      // The account the LINK was made on, never the event's own. Passing
      // `event.account` here compared the event with itself, so PR-P0's
      // `account_mismatch` problem could not fire at all: a charge or refund
      // stamped with a DIFFERENT connected account was applied to this
      // workspace's order as though its own Stripe balance had moved.
      // Empty on a request created before the field existed, and matchesRequest
      // skips the comparison then rather than refusing every older link.
      amountMinor: row.amountMinor, connectedAccountId: String(row.connectedAccountId || "")
    });
    if (!match.ok) {
      // A mismatch is never applied and never retried into oblivion: it is the
      // operator's to look at, because the alternative is guessing which of the
      // two amounts is real.
      await requestRef(companyId, paymentRequestId).set({
        mismatchProblems: match.problems, mismatchAtMs: Date.now(), updatedAtMs: Date.now()
      }, { merge: true });
      return { skipped: true, reason: "event_does_not_match_request", problems: match.problems };
    }

    const before = requestState.emptyState({
      publicStatus: row.publicStatus, amountMinor: Number(row.amountMinor || 0),
      paidAmountMinor: Number(row.paidAmountMinor || 0),
      refundedAmountMinor: Number(row.refundedAmountMinor || 0),
      lastEventSequence: Number(row.lastEventSequence || 0),
      appliedEventIds: Array.isArray(row.appliedEventIds) ? row.appliedEventIds : []
    });
    const reduced = requestState.apply(before, {
      id: String(event.id || ""),
      type: String(event.type || ""),
      sequence: Number(event.created || 0) * 1000,
      amountMinor: Number(object.amount_total === undefined ? object.amount : object.amount_total) || 0,
      refundedTotalMinor: Number(object.amount_refunded || 0),
      fullyRefunded: object.refunded === true
    });
    const ledgerRow = requestState.ledgerRowFor(before, reduced.state, event);

    // (1) The money, once.
    let ledgerWritten = false;
    if (ledgerRow) {
      const entry = orderLedger.entryFrom({
        externalPaymentId, type: ledgerRow.type, amountMinor: ledgerRow.amountMinor,
        currency: row.currency, orderId: row.orderId, paymentRequestId,
        connectedAccountId: String(event.account || ""), provider: PROVIDER,
        receivedAtMs: Number(event.created || 0) * 1000
      });
      if (entry) {
        const entryId = orderLedger.ledgerEntryId(PROVIDER, externalPaymentId);
        try {
          await ledgerRef(companyId, entryId).create(entry);
          ledgerWritten = true;
        } catch (error) {
          // already-exists: this money is already in the ledger. Everything
          // below still runs, because it is all derived from the ledger and
          // converges rather than accumulating.
          ledgerWritten = false;
        }
      }
    }

    // (2) The request's own status.
    await requestRef(companyId, paymentRequestId).set({
      publicStatus: reduced.state.publicStatus,
      paidAmountMinor: reduced.state.paidAmountMinor,
      refundedAmountMinor: reduced.state.refundedAmountMinor,
      lastEventSequence: reduced.state.lastEventSequence,
      appliedEventIds: reduced.state.appliedEventIds,
      ...(reduced.state.publicStatus === "paid" && !row.paidAtMs ? { paidAtMs: Number(event.created || 0) * 1000 } : {}),
      updatedAtMs: Date.now()
    }, { merge: true });

    // (3) The order, repaired from the whole ledger.
    //
    // The BEFORE snapshot is taken first, and the overpayment is judged against
    // it. Judging after the repair asks "is the order still owed anything now
    // that this payment has been applied?", whose answer is always no — every
    // payment would read as a full overpayment. The question is what the order
    // was owed when the money arrived.
    const orderBefore = (await orderRef(row.orderId).get()).data() || {};
    const repaired = await repairOrderFromLedger(companyId, row.orderId);

    // (4) The over-collection verdict, exactly once per payment.
    //
    // Gated on the REQUEST not having been classified yet, not on "this
    // delivery wrote the ledger row". The difference is a real window: if the
    // row was written and everything after it failed, the retry finds
    // already-exists — and gating on the write would skip the verdict forever,
    // leaving a customer £600 overpaid with nothing anywhere saying so.
    //
    // The balance it is judged against is the one the payment MET, which on a
    // retry is not the order as it now stands: a previous attempt may already
    // have applied this payment. Adding this payment's own amount back when the
    // order already reflects it recovers the pre-payment balance exactly,
    // because the balance moves by the gross amount taken.
    //
    // It also cannot depend on `ledgerRow`, and that was the first version's
    // bug: a retry whose step 2 already succeeded reduces to a duplicate, so
    // the reducer reports no status change and ledgerRowFor returns null. The
    // condition is the REQUEST's own state — paid, and not yet classified —
    // which is true on every attempt until one of them finishes.
    let overpaid = null;
    const paidMinor = Number(reduced.state.paidAmountMinor || 0);
    if (reduced.state.publicStatus === "paid" && paidMinor > 0 && !Number(row.overpaymentCheckedAtMs || 0)) {
      const siblings = await readRequests(companyId, row.orderId);
      const alreadyReflected = Array.isArray(orderBefore.payments)
        && orderBefore.payments.some((entry) => entry && String(entry.externalPaymentId || "") === externalPaymentId);
      const metOrder = alreadyReflected
        ? { ...orderBefore, remainingAmount: Number(orderBefore.remainingAmount || 0) + (paidMinor / 100) }
        : orderBefore;
      overpaid = planner.classifyPayment(metOrder, siblings, { paymentRequestId, amountMinor: paidMinor });
      const orderAfter = (await orderRef(row.orderId).get()).data() || orderBefore;
      await markStaleRequests(companyId, row.orderId, orderAfter, siblings);
      await requestRef(companyId, paymentRequestId).set({
        overpaymentCheckedAtMs: Date.now(),
        ...(overpaid.overpaid ? { overpaidMinor: overpaid.overpaidMinor, overpaidAtMs: Date.now() } : {}),
        updatedAtMs: Date.now()
      }, { merge: true });
    }

    return {
      skipped: false,
      paymentRequestId,
      publicStatus: reduced.state.publicStatus,
      ledgerWritten,
      externalPaymentId,
      repaired: Boolean(repaired),
      overpaidMinor: overpaid ? overpaid.overpaidMinor : 0
    };
  }

  /** Rebuild the order's money fields from the ledger. Converges; never adds. */
  async function repairOrderFromLedger(companyId, orderId) {
    const snapshot = await orderRef(orderId).get();
    if (!snapshot.exists) return null;
    const order = snapshot.data() || {};
    const entries = (await db().collection("companies").doc(String(companyId)).collection("paymentLedger")
      .where("orderId", "==", String(orderId)).get()).docs.map((doc) => doc.data() || {});
    const patch = orderLedger.repairPatch(order, entries);
    if (!patch) return null;
    await orderRef(orderId).set(patch, { merge: true });
    return patch;
  }

  /** Flag links the order can no longer justify. Named, never cancelled. */
  async function markStaleRequests(companyId, orderId, order, rows) {
    const stale = planner.staleRequests(order, rows);
    const staleIds = new Set(stale.map((row) => row.paymentRequestId));
    const writes = [];
    for (const row of rows) {
      const id = String(row.paymentRequestId || "");
      if (!id || !planner.OPEN_STATUSES.includes(String(row.publicStatus || ""))) continue;
      const problem = stale.find((entry) => entry.paymentRequestId === id);
      if (problem && row.stale !== true) {
        writes.push(requestRef(companyId, id).set({
          stale: true, staleReason: problem.reason, staleExcessMinor: problem.excessMinor, updatedAtMs: Date.now()
        }, { merge: true }));
      } else if (!staleIds.has(id) && row.stale === true) {
        writes.push(requestRef(companyId, id).set({ stale: false, staleReason: "", staleExcessMinor: 0, updatedAtMs: Date.now() }, { merge: true }));
      }
    }
    await Promise.all(writes);
    return stale;
  }

  return {
    getStripePaymentConnection,
    beginStripeConnectOnboarding,
    createOrderPaymentRequest,
    listOrderPaymentRequests,
    listWorkspacePaymentRequests,
    cancelOrderPaymentRequest,
    refreshStripePaymentConnection,
    disconnectStripePaymentConnection,
    stripeConnectWebhook,
    _internal: {
      applyAccountSnapshot, readConnection, resolveAccountCompany, claimEvent, connectionRef, indexRef,
      applyProviderPayment, repairOrderFromLedger, markStaleRequests, finishDraftRequest, requestSummary
    }
  };
}

module.exports = { createPaymentConnectFunctions, PROVIDER, CONNECTION_DOC };

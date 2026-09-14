// PR-P1 — the seam between the connection service and Stripe.
//
// Everything the service needs from Stripe goes through this interface, and
// nothing else in functions/payments/ imports the Stripe SDK. Two reasons, and
// the second is the one that matters here:
//
//   1. the unit tests drive the real service with a fake, so PR-P1 ships with
//      no external call in CI, exactly as the plan requires;
//   2. the emulator pulls REAL secrets out of Secret Manager, so a test that
//      reached the SDK would reach live Stripe. A seam is not a convenience
//      for this repo, it is the only thing standing between a test run and a
//      real connected account.
//
// The interface is deliberately tiny. Anything Stripe-shaped that leaks past
// it — a raw Account object, an error class, a field name — becomes something
// the service has to know about, and then the fake has to imitate it.

/** Only what the service is allowed to learn about a connected account. */
function normalizeAccount(account) {
  const raw = account && typeof account === "object" ? account : {};
  const requirements = raw.requirements && typeof raw.requirements === "object" ? raw.requirements : {};
  const list = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string" && item) : []);
  return {
    accountId: String(raw.id || ""),
    chargesEnabled: raw.charges_enabled === true,
    payoutsEnabled: raw.payouts_enabled === true,
    detailsSubmitted: raw.details_submitted === true,
    country: String(raw.country || ""),
    defaultCurrency: String(raw.default_currency || "").toUpperCase(),
    requirements: {
      disabledReason: String(requirements.disabled_reason || ""),
      currentlyDue: list(requirements.currently_due),
      pastDue: list(requirements.past_due)
    }
  };
}

/**
 * The real transport. `stripe` is an initialized Stripe client; this module
 * never creates one, so it never needs a secret of its own.
 */
function createStripeConnectTransport(stripe) {
  return {
    name: "stripe",
    async createAccount({ country, email, workspaceId }) {
      const account = await stripe.accounts.create({
        type: "standard",
        country: country || undefined,
        email: email || undefined,
        metadata: { workspaceId: String(workspaceId || "") }
      });
      return normalizeAccount(account);
    },
    async retrieveAccount(accountId) {
      const account = await stripe.accounts.retrieve(String(accountId));
      return normalizeAccount(account);
    },
    async createAccountLink({ accountId, refreshUrl, returnUrl }) {
      const link = await stripe.accountLinks.create({
        account: String(accountId),
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding"
      });
      return { url: String(link.url || ""), expiresAt: Number(link.expires_at || 0) };
    },
    /**
     * Create a Checkout Session ON THE CONNECTED ACCOUNT (direct charges: the
     * money lands in the workspace's own Stripe balance, never ours).
     *
     * `idempotencyKey` is not optional and not decoration. A Stripe call and a
     * Firestore write are two systems and cannot be one transaction: crash
     * between them and a retry would open a SECOND link for the same money.
     * With the key, Stripe returns the session it already made.
     */
    async createCheckoutSession({ accountId, idempotencyKey, amountMinor, currency, productName, successUrl, cancelUrl, expiresAtSeconds, metadata }) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          quantity: 1,
          price_data: {
            currency: String(currency || "").toLowerCase(),
            unit_amount: amountMinor,
            product_data: { name: String(productName || "Payment") }
          }
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        ...(expiresAtSeconds ? { expires_at: expiresAtSeconds } : {}),
        metadata: metadata || {},
        payment_intent_data: { metadata: metadata || {} }
      }, { stripeAccount: String(accountId), idempotencyKey: String(idempotencyKey) });
      return {
        sessionId: String(session.id || ""),
        url: String(session.url || ""),
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : "",
        expiresAt: Number(session.expires_at || 0),
        status: String(session.status || "")
      };
    },
    async expireCheckoutSession({ accountId, sessionId }) {
      const session = await stripe.checkout.sessions.expire(String(sessionId), { stripeAccount: String(accountId) });
      return { sessionId: String(session.id || ""), status: String(session.status || "") };
    },
    /**
     * Every refund on a charge, following the list through its pages.
     *
     * The webhook's `refunds` is a Stripe LIST and can be truncated. Rather
     * than assume which end was cut, the caller asks for the whole set — and
     * this is the provider's own answer to that question, on the CONNECTED
     * account, because the charge is the workspace's and not ours.
     *
     * `starting_after` is Stripe's cursor and takes the last id of the page you
     * were given; the loop is bounded so a provider that never stops saying
     * `has_more` cannot hold a webhook open for ever. Reaching that bound is
     * reported rather than hidden: an incomplete answer that says so is usable,
     * one that pretends to be complete is not.
     */
    async listChargeRefunds({ accountId, chargeId, pageLimit = 100, maxPages = 10 }) {
      const out = [];
      let startingAfter = "";
      let pages = 0;
      let complete = true;
      while (pages < maxPages) {
        const page = await stripe.refunds.list(
          {
            charge: String(chargeId),
            limit: pageLimit,
            ...(startingAfter ? { starting_after: startingAfter } : {})
          },
          { stripeAccount: String(accountId) }
        );
        const rows = Array.isArray(page && page.data) ? page.data : [];
        for (const row of rows) out.push(row);
        pages += 1;
        if (!page || page.has_more !== true || !rows.length) { complete = true; break; }
        startingAfter = String(rows[rows.length - 1].id || "");
        if (!startingAfter) { complete = true; break; }
        complete = false;
      }
      return { refunds: out, complete, pages };
    },
    verifyWebhook(rawBody, signature, secret) {
      return stripe.webhooks.constructEvent(rawBody, signature, secret);
    }
  };
}

/**
 * The fake. It is a real state machine, not a set of canned answers: an account
 * it created starts unsubmitted, `completeOnboarding` moves it the way Stripe
 * would, and `restrict` puts a requirement back. A fake that only returns
 * fixtures proves the service compiles; this one proves the service reacts.
 */
function createFakeConnectTransport(options = {}) {
  const accounts = new Map();
  const sessions = new Map();   // idempotency key -> session
  const byId = new Map();       // session id -> session
  const refundsByCharge = new Map();  // charge id -> refund objects, as Stripe shapes them
  const calls = [];
  let sequence = 0;

  // Optional file backing, for the local emulator ONLY.
  //
  // The functions emulator runs each function in its own runtime process, so an
  // in-memory fake is a DIFFERENT provider for every callable: onboarding
  // creates an account in one process and the refresh in another cannot find
  // it. A real provider is shared by definition, so a fake that is not shared
  // is not simulating one. A JSON file is the smallest thing that fixes it,
  // and it is only ever used when a path is handed in.
  const statePath = String(options.statePath || "");
  const fs = statePath ? require("fs") : null;

  function load() {
    if (!fs) return;
    let raw = "";
    try { raw = fs.readFileSync(statePath, "utf8"); } catch { return; }
    let saved = null;
    try { saved = JSON.parse(raw); } catch { return; }
    accounts.clear(); sessions.clear(); byId.clear(); refundsByCharge.clear();
    for (const [k, v] of Object.entries((saved && saved.accounts) || {})) accounts.set(k, v);
    for (const [k, v] of Object.entries((saved && saved.sessions) || {})) sessions.set(k, v);
    for (const [k, v] of Object.entries((saved && saved.byId) || {})) byId.set(k, v);
    // Refunds persist for the same reason accounts do, and forgetting them here
    // would be worse than not storing them at all: the emulator runs each
    // function in its own process, so a refund recorded by one callable would
    // be invisible to the next and a test would pass against a provider that
    // had quietly forgotten the money went back.
    for (const [k, v] of Object.entries((saved && saved.refundsByCharge) || {})) {
      refundsByCharge.set(k, Array.isArray(v) ? v : []);
    }
    sequence = Number((saved && saved.sequence) || 0);
  }

  function save() {
    if (!fs) return;
    try {
      fs.writeFileSync(statePath, JSON.stringify({
        accounts: Object.fromEntries(accounts),
        sessions: Object.fromEntries(sessions),
        byId: Object.fromEntries(byId),
        refundsByCharge: Object.fromEntries(refundsByCharge),
        sequence
      }));
    } catch { /* a fake that cannot persist still works in-process */ }
  }

  load();
  const nextId = () => `acct_fake${String(++sequence).padStart(4, "0")}`;

  const shape = (row) => ({
    accountId: row.accountId,
    chargesEnabled: row.chargesEnabled,
    payoutsEnabled: row.payoutsEnabled,
    detailsSubmitted: row.detailsSubmitted,
    country: row.country,
    defaultCurrency: row.defaultCurrency,
    requirements: {
      disabledReason: row.disabledReason,
      currentlyDue: row.currentlyDue.slice(),
      pastDue: row.pastDue.slice()
    }
  });

  return {
    name: "fake",
    calls,
    accounts,
    async createAccount({ country, email, workspaceId }) {
      load();
      if (options.failCreate) throw new Error(String(options.failCreate));
      const accountId = nextId();
      accounts.set(accountId, {
        accountId,
        workspaceId: String(workspaceId || ""),
        email: String(email || ""),
        country: String(country || "GB"),
        defaultCurrency: String(options.defaultCurrency || "GBP"),
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        disabledReason: "",
        currentlyDue: ["external_account", "individual.verification.document"],
        pastDue: []
      });
      calls.push({ method: "createAccount", accountId, workspaceId });
      save();
      return shape(accounts.get(accountId));
    },
    async retrieveAccount(accountId) {
      load();
      const row = accounts.get(String(accountId));
      calls.push({ method: "retrieveAccount", accountId: String(accountId), found: Boolean(row) });
      if (!row) { const error = new Error("No such account"); error.code = "resource_missing"; throw error; }
      return shape(row);
    },
    async createAccountLink({ accountId, refreshUrl, returnUrl }) {
      load();
      if (!accounts.has(String(accountId))) { const e = new Error("No such account"); e.code = "resource_missing"; throw e; }
      calls.push({ method: "createAccountLink", accountId: String(accountId), refreshUrl, returnUrl });
      return { url: `https://connect.stripe.test/setup/${accountId}`, expiresAt: 0 };
    },
    verifyWebhook(rawBody, signature) {
      calls.push({ method: "verifyWebhook", signature: String(signature || "") });
      if (String(signature || "") !== "valid") { const e = new Error("Webhook signature verification failed."); e.type = "StripeSignatureVerificationError"; throw e; }
      return JSON.parse(String(rawBody));
    },
    async createCheckoutSession({ accountId, idempotencyKey, amountMinor, currency, metadata }) {
      load();
      if (!accounts.has(String(accountId))) { const e = new Error("No such account"); e.code = "resource_missing"; throw e; }
      const key = String(idempotencyKey || "");
      calls.push({ method: "createCheckoutSession", accountId: String(accountId), idempotencyKey: key, amountMinor });
      // The behaviour that matters: the same key returns the SAME session, as
      // Stripe does. A fake that minted a new id per call would let the
      // crash-after-Stripe test pass while production opened two links.
      if (key && sessions.has(key)) return { ...sessions.get(key), replayed: true };
      if (options.failCheckout) throw new Error(String(options.failCheckout));
      const sessionId = `cs_fake${String(++sequence).padStart(4, "0")}`;
      const session = {
        sessionId,
        url: `https://checkout.stripe.test/pay/${sessionId}`,
        paymentIntentId: `pi_fake${String(sequence).padStart(4, "0")}`,
        expiresAt: 0,
        status: "open",
        amountMinor, metadata: metadata || {}, accountId: String(accountId)
      };
      if (key) sessions.set(key, session);
      byId.set(sessionId, session);
      save();
      return session;
    },
    async expireCheckoutSession({ accountId, sessionId }) {
      load();
      calls.push({ method: "expireCheckoutSession", accountId: String(accountId), sessionId: String(sessionId) });
      const session = byId.get(String(sessionId));
      if (!session) { const e = new Error("No such session"); e.code = "resource_missing"; throw e; }
      session.status = "expired";
      save();
      return { sessionId: String(sessionId), status: "expired" };
    },
    /**
     * The fake's answer to "every refund on this charge".
     *
     * A real state machine, like the rest of this fake: `refund()` below puts
     * money back and this reads what is there. The page size is honoured so a
     * truncated list can be produced on purpose, because "the caller completes
     * a partial list through the provider" is only proved by a provider that
     * actually returns one.
     *
     * Stripe returns refunds newest first. This fake deliberately returns them
     * OLDEST first — the opposite convention — because the whole point of the
     * set-based reader is that the order must not matter. A fake that copied
     * Stripe's ordering would let an order-dependent reader pass.
     */
    async listChargeRefunds({ accountId, chargeId, pageLimit = 100, maxPages = 10 }) {
      load();
      calls.push({ method: "listChargeRefunds", accountId: String(accountId), chargeId: String(chargeId) });
      if (!accounts.has(String(accountId))) { const e = new Error("No such account"); e.code = "resource_missing"; throw e; }
      const all = (refundsByCharge.get(String(chargeId)) || []).slice()
        .sort((a, b) => Number(a.created || 0) - Number(b.created || 0));
      const capacity = Math.max(1, Number(pageLimit) || 100) * Math.max(1, Number(maxPages) || 1);
      return { refunds: all.slice(0, capacity), complete: all.length <= capacity, pages: 1 };
    },
    sessions,
    sessionsById: byId,
    refundsByCharge,
    // Test-only controls. Not part of the transport interface the service uses.
    /**
     * Refund money on a charge, the way Stripe does: each refund is its own
     * object with its own id and its own amount, and the charge's
     * `amount_refunded` is the CUMULATIVE total rather than this refund's
     * figure. A fake that returned the running total as the refund's own amount
     * would let the £1,700-on-a-£1,000-charge bug pass.
     */
    refund(chargeId, { id, amountMinor, created }) {
      load();
      const key = String(chargeId);
      const rows = refundsByCharge.get(key) || [];
      const refundId = String(id || `re_fake${String(++sequence).padStart(4, "0")}`);
      if (rows.some((row) => row.id === refundId)) return rows.find((row) => row.id === refundId);
      const row = {
        id: refundId, object: "refund", charge: key,
        amount: Number(amountMinor) || 0,
        created: Number(created) || Math.floor(Date.now() / 1000),
        currency: "gbp", status: "succeeded"
      };
      rows.push(row);
      refundsByCharge.set(key, rows);
      save();
      return row;
    },
    /** What a `charge.refunded` payload would carry for this charge right now. */
    refundedTotalMinor(chargeId) {
      load();
      return (refundsByCharge.get(String(chargeId)) || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    },
    completeOnboarding(accountId) {
      load();
      const row = accounts.get(String(accountId));
      if (!row) throw new Error(`fake: no account ${accountId}`);
      row.detailsSubmitted = true; row.chargesEnabled = true; row.payoutsEnabled = true;
      row.currentlyDue = []; row.pastDue = []; row.disabledReason = "";
      save();
    },
    restrict(accountId, { pastDue = [], disabledReason = "" } = {}) {
      load();
      const row = accounts.get(String(accountId));
      if (!row) throw new Error(`fake: no account ${accountId}`);
      row.pastDue = pastDue.slice(); row.disabledReason = disabledReason;
      save();
    }
  };
}

module.exports = { normalizeAccount, createStripeConnectTransport, createFakeConnectTransport };

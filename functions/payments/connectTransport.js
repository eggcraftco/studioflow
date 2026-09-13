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
  const calls = [];
  let sequence = 0;
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
      return shape(accounts.get(accountId));
    },
    async retrieveAccount(accountId) {
      const row = accounts.get(String(accountId));
      calls.push({ method: "retrieveAccount", accountId: String(accountId), found: Boolean(row) });
      if (!row) { const error = new Error("No such account"); error.code = "resource_missing"; throw error; }
      return shape(row);
    },
    async createAccountLink({ accountId, refreshUrl, returnUrl }) {
      if (!accounts.has(String(accountId))) { const e = new Error("No such account"); e.code = "resource_missing"; throw e; }
      calls.push({ method: "createAccountLink", accountId: String(accountId), refreshUrl, returnUrl });
      return { url: `https://connect.stripe.test/setup/${accountId}`, expiresAt: 0 };
    },
    verifyWebhook(rawBody, signature) {
      calls.push({ method: "verifyWebhook", signature: String(signature || "") });
      if (String(signature || "") !== "valid") { const e = new Error("Webhook signature verification failed."); e.type = "StripeSignatureVerificationError"; throw e; }
      return JSON.parse(String(rawBody));
    },
    // Test-only controls. Not part of the transport interface the service uses.
    completeOnboarding(accountId) {
      const row = accounts.get(String(accountId));
      if (!row) throw new Error(`fake: no account ${accountId}`);
      row.detailsSubmitted = true; row.chargesEnabled = true; row.payoutsEnabled = true;
      row.currentlyDue = []; row.pastDue = []; row.disabledReason = "";
    },
    restrict(accountId, { pastDue = [], disabledReason = "" } = {}) {
      const row = accounts.get(String(accountId));
      if (!row) throw new Error(`fake: no account ${accountId}`);
      row.pastDue = pastDue.slice(); row.disabledReason = disabledReason;
    }
  };
}

module.exports = { normalizeAccount, createStripeConnectTransport, createFakeConnectTransport };

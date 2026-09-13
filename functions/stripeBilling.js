const crypto = require("crypto");
// The rail boundary. Two endpoints and two signing secrets should make a
// connected-account event impossible on this one; this handler refuses on its
// own account anyway, because "should" there is three assumptions deep and a
// secret pasted into the wrong Stripe endpoint undoes all three in one click.
const eventBoundary = require("./payments/eventBoundary");

const STRIPE_BILLING_REGION = "europe-west2";
const APPLE_BILLING_REGION = STRIPE_BILLING_REGION;

const APPLE_PLAN_PRODUCTS = {
  "uk.co.eggcraft.studioflow.lite.monthly": "lite_monthly",
  "uk.co.eggcraft.studioflow.lite.yearly": "lite_yearly",
  "uk.co.eggcraft.studioflow.pro.monthly": "pro_monthly",
  "uk.co.eggcraft.studioflow.pro.yearly": "pro_yearly",
  "uk.co.eggcraft.studioflow.team.monthly": "team_monthly",
  "uk.co.eggcraft.studioflow.team.yearly": "team_yearly",
  "uk.co.eggcraft.studioflow.storage.100gb.monthly": "storage_100gb",
  "uk.co.eggcraft.studioflow.storage.100gb.yearly": "storage_100gb_yearly",
  "uk.co.eggcraft.studioflow.storage.200gb.monthly": "storage_200gb",
  "uk.co.eggcraft.studioflow.storage.200gb.yearly": "storage_200gb_yearly"
};

// Google Play subscriptions use a subscription product id + a base plan id.
// Keys are "<subscriptionId>|<basePlanId>" and map to the shared internal item key.
// Verified against Google Play Console on 24 Aug 2026.
const GOOGLE_PLAY_PRODUCTS = {
  "nivadesk_lite|lite-monthly": "lite_monthly",
  "nivadesk_lite|lite-annual": "lite_yearly",
  "nivadesk_pro|pro-monthly": "pro_monthly",
  "nivadesk_pro|pro-annual": "pro_yearly",
  "nivadesk_team|team-monthly": "team_monthly",
  "nivadesk_team|team-annual": "team_yearly",
  "nivadesk_storage_100gb|storage-100gb-monthly": "storage_100gb",
  "nivadesk_storage_100gb|storage-100gb-annual": "storage_100gb_yearly",
  "nivadesk_storage_200gb|storage-200gb-monthly": "storage_200gb",
  "nivadesk_storage_200gb|storage-200gb-annual": "storage_200gb_yearly",
  // Legacy "-yearly" base plans. They were created with a monthly billing period by
  // mistake and are deactivated in Play Console (24 Aug 2026); no new purchases can
  // use them, but keep the mapping so any pre-existing purchase token still resolves.
  "nivadesk_lite|lite-yearly": "lite_yearly",
  "nivadesk_pro|pro-yearly": "pro_yearly",
  "nivadesk_team|team-yearly": "team_yearly",
  "nivadesk_storage_100gb|storage-100gb-yearly": "storage_100gb_yearly",
  "nivadesk_storage_200gb|storage-200gb-yearly": "storage_200gb_yearly"
};

const STRIPE_BILLING_ITEMS = {
  lite_monthly: {
    key: "lite_monthly",
    type: "plan",
    plan: "lifetime_lite",
    interval: "month",
    mode: "subscription",
    priceEnv: "STRIPE_PRICE_LITE_MONTHLY"
  },
  lite_yearly: {
    key: "lite_yearly",
    type: "plan",
    plan: "lifetime_lite",
    interval: "year",
    mode: "subscription",
    priceEnv: "STRIPE_PRICE_LITE_YEARLY"
  },
  pro_monthly: {
    key: "pro_monthly",
    type: "plan",
    plan: "pro_monthly",
    interval: "month",
    mode: "subscription",
    priceEnv: "STRIPE_PRICE_PRO_MONTHLY"
  },
  pro_yearly: {
    key: "pro_yearly",
    type: "plan",
    plan: "pro_monthly",
    interval: "year",
    mode: "subscription",
    priceEnv: "STRIPE_PRICE_PRO_YEARLY"
  },
  team_monthly: {
    key: "team_monthly",
    type: "plan",
    plan: "team_monthly",
    interval: "month",
    mode: "subscription",
    priceEnv: "STRIPE_PRICE_TEAM_MONTHLY"
  },
  team_yearly: {
    key: "team_yearly",
    type: "plan",
    plan: "team_monthly",
    interval: "year",
    mode: "subscription",
    priceEnv: "STRIPE_PRICE_TEAM_YEARLY"
  },
  additional_team_seat_monthly: {
    key: "additional_team_seat_monthly",
    type: "team_seat_addon",
    mode: "subscription",
    interval: "month",
    availableForCheckout: true,
    priceEnv: "STRIPE_PRICE_ADDITIONAL_TEAM_SEAT_MONTHLY"
  },
  additional_team_seat_yearly: {
    key: "additional_team_seat_yearly",
    type: "team_seat_addon",
    mode: "subscription",
    interval: "year",
    availableForCheckout: true,
    priceEnv: "STRIPE_PRICE_ADDITIONAL_TEAM_SEAT_YEARLY"
  },
  storage_100gb: {
    key: "storage_100gb",
    type: "storage_addon",
    mode: "subscription",
    interval: "month",
    availableForCheckout: true,
    priceEnv: "STRIPE_PRICE_ADDON_100GB",
    storageAddonMB: 100 * 1024
  },
  storage_100gb_yearly: {
    key: "storage_100gb_yearly",
    type: "storage_addon",
    mode: "subscription",
    interval: "year",
    availableForCheckout: true,
    priceEnv: "STRIPE_PRICE_ADDON_100GB_YEARLY",
    storageAddonMB: 100 * 1024
  },
  storage_200gb: {
    key: "storage_200gb",
    type: "storage_addon",
    mode: "subscription",
    interval: "month",
    availableForCheckout: true,
    priceEnv: "STRIPE_PRICE_ADDON_200GB",
    storageAddonMB: 200 * 1024
  },
  storage_200gb_yearly: {
    key: "storage_200gb_yearly",
    type: "storage_addon",
    mode: "subscription",
    interval: "year",
    availableForCheckout: true,
    priceEnv: "STRIPE_PRICE_ADDON_200GB_YEARLY",
    storageAddonMB: 200 * 1024
  }
};

function createStripeBillingFunctions({
  admin,
  onCall,
  onRequest,
  onSchedule,
  HttpsError,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  APPLE_ROOT_CA_CERTS_PEM,
  GOOGLE_PLAY_SERVICE_ACCOUNT,
  PLAN_ENTITLEMENTS,
  requireWorkspaceForBilling,
  workspaceOrderRole,
  normalizeWorkspaceRole,
  workspaceRoleLabel
}) {
  function secretValue(secretParam, envName) {
    try {
      const value = secretParam && typeof secretParam.value === "function" ? secretParam.value() : "";
      if (String(value || "").trim()) return String(value || "").trim();
    } catch {
      // Firebase secrets are only readable at runtime. Local checks can fall back to env.
    }
    return String(process.env[envName] || "").trim();
  }

  function billingEnabled() {
    return String(process.env.STRIPE_BILLING_ENABLED || "").trim().toLowerCase() === "true";
  }

  function internalTestBillingEnabled() {
    return String(process.env.STRIPE_INTERNAL_TEST_BILLING_ENABLED || "").trim().toLowerCase() === "true";
  }

  function internalTestBillingEmails() {
    return new Set(
      String(process.env.STRIPE_INTERNAL_TEST_EMAILS || "")
        .split(",")
        .map(value => value.trim().toLowerCase())
        .filter(Boolean)
    );
  }

  function authenticatedEmail(request) {
    return String(request.auth?.token?.email || "").trim().toLowerCase();
  }

  function requireBillingEnvironmentAccess(request, config) {
    if (!config.secretKey.startsWith("sk_test_")) return;

    const allowedEmails = internalTestBillingEmails();
    const email = authenticatedEmail(request);
    if (!internalTestBillingEnabled() || !email || !allowedEmails.has(email)) {
      throw new HttpsError(
        "permission-denied",
        "Stripe test billing is restricted to authorised internal test accounts."
      );
    }
  }

  function defaultWebUrl() {
    return String(process.env.STUDIOFLOW_WEB_APP_URL || process.env.NEXT_PUBLIC_STUDIOFLOW_WEB_URL || "http://localhost:3000").replace(/\/+$/, "");
  }

  function safeAbsoluteUrl(value, fallbackPath) {
    const raw = String(value || "").trim();
    if (/^https?:\/\//i.test(raw)) return raw.slice(0, 700);
    return defaultWebUrl() + fallbackPath;
  }

  function normalizeBillingItemKey(value) {
    const raw = String(value || "").trim();
    if (STRIPE_BILLING_ITEMS[raw]) return raw;
    const compact = raw.toLowerCase().replace(/[\s-]+/g, "_");
    if (compact === "lite" || compact === "lifetime_lite" || compact === "lite_monthly") return "lite_monthly";
    if (compact === "lite_yearly" || compact === "lite_annual") return "lite_yearly";
    if (compact === "pro" || compact === "pro_monthly") return "pro_monthly";
    if (compact === "pro_yearly" || compact === "pro_annual") return "pro_yearly";
    if (compact === "team" || compact === "team_monthly") return "team_monthly";
    if (compact === "team_yearly" || compact === "team_annual") return "team_yearly";
    if (compact === "additional_team_seat_monthly" || compact === "team_seat_monthly") return "additional_team_seat_monthly";
    if (compact === "additional_team_seat_yearly" || compact === "team_seat_yearly") return "additional_team_seat_yearly";
    if (compact === "100gb" || compact === "storage_100gb") return "storage_100gb";
    if (compact === "storage_100gb_yearly" || compact === "100gb_yearly") return "storage_100gb_yearly";
    if (compact === "200gb" || compact === "storage_200gb") return "storage_200gb";
    if (compact === "storage_200gb_yearly" || compact === "200gb_yearly") return "storage_200gb_yearly";
    return "";
  }

  function billingItemFromRequest(request) {
    const key = normalizeBillingItemKey(request.data?.itemKey || request.data?.planKey || request.data?.addonKey);
    const item = STRIPE_BILLING_ITEMS[key];
    if (!item) {
      throw new HttpsError("invalid-argument", "A valid NivaDesk billing item key is required.");
    }
    if (item.availableForCheckout === false) {
      const message = item.type === "team_seat_addon"
        ? "Additional team seat checkout will be enabled after the seat entitlement rollout is complete."
        : "Additional Client Files storage will be available after the initial billing launch.";
      throw new HttpsError("failed-precondition", message);
    }
    return item;
  }

  function configStatus(item = null, { requireWebhook = false } = {}) {
    if (!billingEnabled()) {
      return { configured: false, message: "Billing setup coming soon." };
    }

    const secretKey = secretValue(STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY");
    if (!secretKey) {
      return { configured: false, message: "Stripe test secret is not configured." };
    }

    const allowLive = String(process.env.STRIPE_ALLOW_LIVE_BILLING || "").trim().toLowerCase() === "true";
    if (secretKey.startsWith("sk_live_") && !allowLive) {
      return { configured: false, message: "Live Stripe keys are blocked for this scaffold." };
    }

    if (!secretKey.startsWith("sk_test_") && !allowLive) {
      return { configured: false, message: "Use a Stripe test secret key for this scaffold." };
    }

    if (requireWebhook) {
      const webhookSecret = secretValue(STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET");
      if (!webhookSecret) {
        return { configured: false, message: "Stripe webhook secret is not configured." };
      }
      return { configured: true, secretKey, webhookSecret };
    }

    if (item) {
      const priceId = String(process.env[item.priceEnv] || "").trim();
      if (!priceId) {
        return { configured: false, message: "Billing setup coming soon." };
      }
      return { configured: true, secretKey, priceId };
    }

    return { configured: true, secretKey };
  }

  function stripeClient(secretKey) {
    const Stripe = require("stripe");
    return new Stripe(secretKey);
  }

  // ---------------------------------------------------------------------------
  // Account-deletion cleanup: cancel every Stripe subscription still attached to
  // the workspace before its documents are wiped. Without this, deleting an
  // account leaves the provider subscription alive and Stripe keeps retrying the
  // card (real incident: a past_due live subscription retried 6 times after the
  // account was gone). Best-effort by design — deletion must never be blocked by
  // a billing failure, so every error is collected instead of thrown. Bypasses
  // the STRIPE_ALLOW_LIVE_BILLING purchase gate on purpose: stopping charges is
  // always safe. Apple/Google subscriptions cannot be canceled server-side, so
  // they are only reported for follow-up.
  async function cancelWorkspaceStripeSubscriptionsForDeletion(workspaceId) {
    const summary = { canceled: [], voidedInvoices: [], unmanaged: [], errors: [] };
    const db = admin.firestore();

    let subsSnap;
    try {
      subsSnap = await db.collection("companies").doc(String(workspaceId)).collection("subscriptions").get();
    } catch (error) {
      summary.errors.push(`ledger read failed: ${error?.message || error}`);
      return summary;
    }
    if (subsSnap.empty) return summary;

    const secretKey = secretValue(STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY");
    let stripe = null;

    for (const subDoc of subsSnap.docs) {
      const data = subDoc.data() || {};
      const provider = String(data.provider || "").trim().toLowerCase();

      if (provider !== "stripe") {
        if (data.activeForEntitlement === true) {
          summary.unmanaged.push(`${provider || "unknown"}:${subDoc.id}`);
        }
        continue;
      }
      if (String(data.providerStatus || "").toLowerCase() === "canceled") continue;

      const subscriptionId = String(data.externalSubscriptionId || "").trim() ||
        (subDoc.id.startsWith("stripe_") ? subDoc.id.slice("stripe_".length) : "");
      if (!subscriptionId) {
        summary.errors.push(`${subDoc.id}: no subscription id on ledger doc`);
        continue;
      }
      if (!secretKey) {
        summary.errors.push(`${subscriptionId}: STRIPE_SECRET_KEY unavailable`);
        continue;
      }
      if (!stripe) stripe = stripeClient(secretKey);

      try {
        await stripe.subscriptions.cancel(subscriptionId);
        summary.canceled.push(subscriptionId);
      } catch (error) {
        // resource_missing covers already-deleted subs and test/live key-mode
        // mismatches — nothing left to stop in either case.
        if (error?.code === "resource_missing") continue;
        summary.errors.push(`${subscriptionId}: cancel failed: ${error?.message || error}`);
        continue;
      }

      // Cancellation alone does not stop dunning on an invoice that is already
      // open — void those so no further payment attempts happen.
      try {
        const openInvoices = await stripe.invoices.list({ subscription: subscriptionId, status: "open", limit: 10 });
        for (const invoice of openInvoices.data || []) {
          await stripe.invoices.voidInvoice(invoice.id);
          summary.voidedInvoices.push(invoice.id);
        }
      } catch (error) {
        summary.errors.push(`${subscriptionId}: invoice void failed: ${error?.message || error}`);
      }
    }

    return summary;
  }

  function appleBillingEnabled() {
    return String(process.env.APPLE_BILLING_ENABLED || "").trim().toLowerCase() === "true";
  }

  function appleBundleId() {
    return String(process.env.APPLE_APP_BUNDLE_ID || "uk.co.eggcraft.studioflow").trim();
  }

  function appleAppStoreId() {
    const value = Number(String(process.env.APPLE_APP_STORE_ID || "").trim());
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  function appleLedgerId(originalTransactionId) {
    return `apple_${String(originalTransactionId || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180)}`;
  }

  function appleItemForProductId(productId) {
    const key = APPLE_PLAN_PRODUCTS[String(productId || "").trim()];
    return key ? STRIPE_BILLING_ITEMS[key] || null : null;
  }

  function appleRootCertificates() {
    const pem = secretValue(APPLE_ROOT_CA_CERTS_PEM, "APPLE_ROOT_CA_CERTS_PEM");
    if (!pem) return [];
    const matches = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
    return matches.map((certificate) => Buffer.from(
      certificate.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, ""),
      "base64"
    ));
  }

  function appleVerificationConfigStatus() {
    if (!appleBillingEnabled()) {
      return { configured: false, message: "App Store billing setup coming soon." };
    }
    const roots = appleRootCertificates();
    if (!roots.length) {
      return { configured: false, message: "Apple root certificates are not configured." };
    }
    const environments = ["Sandbox"];
    if (String(process.env.APPLE_ALLOW_XCODE_TESTING || "").trim().toLowerCase() === "true") {
      environments.push("Xcode");
    }
    if (String(process.env.APPLE_ALLOW_PRODUCTION_BILLING || "").trim().toLowerCase() === "true") {
      if (!appleAppStoreId()) return { configured: false, message: "Apple App Store ID is required before production billing is enabled." };
      environments.unshift("Production");
    }
    return { configured: true, roots, environments };
  }

  async function verifyAppleSignedData(kind, signedPayload) {
    const payload = String(signedPayload || "").trim();
    if (!payload || payload.length > 16000) {
      throw new HttpsError("invalid-argument", "A valid signed Apple purchase payload is required.");
    }
    const config = appleVerificationConfigStatus();
    if (!config.configured) {
      throw new HttpsError("failed-precondition", config.message);
    }
    const { SignedDataVerifier, Environment } = require("@apple/app-store-server-library");
    let lastError = null;
    for (const name of config.environments) {
      const environment = Environment[String(name || "").toUpperCase()];
      try {
        const verifier = new SignedDataVerifier(
          config.roots,
          true,
          environment,
          appleBundleId(),
          name === "Production" ? appleAppStoreId() : undefined
        );
        const decoded = kind === "notification"
          ? await verifier.verifyAndDecodeNotification(payload)
          : await verifier.verifyAndDecodeTransaction(payload);
        return { decoded, verifier, environmentName: name };
      } catch (error) {
        lastError = error;
      }
    }
    console.warn("Apple signed payload verification failed:", lastError?.message || lastError);
    throw new HttpsError("permission-denied", "Apple purchase verification failed.");
  }

  function ownerOrAdminRole(companyData, uid) {
    const role = normalizeWorkspaceRole(workspaceOrderRole(companyData, uid), "unknown");
    if (role !== "owner") {
      throw new HttpsError("permission-denied", "Only the workspace owner can manage billing.", {
        role,
        roleLabel: workspaceRoleLabel(role)
      });
    }
    return role;
  }

  async function getOrCreateCustomer(stripe, companyRef, companyData, companyId, uid) {
    const existing = String(companyData.billingCustomerId || companyData.billingStripeCustomerId || "").trim();
    if (existing) return existing;

    let userRecord = null;
    try {
      userRecord = await admin.auth().getUser(uid);
    } catch {
      userRecord = null;
    }

    const customer = await stripe.customers.create({
      email: userRecord?.email || companyData.ownerEmail || undefined,
      name: companyData.name || companyData.companyName || userRecord?.displayName || "NivaDesk Workspace",
      metadata: {
        workspaceId: companyId,
        ownerUid: String(companyData.ownerUid || uid),
        createdByUid: uid,
        billingSource: "studioflow_web"
      }
    });

    await companyRef.set({
      billingCustomerId: customer.id,
      billingStripeCustomerId: customer.id,
      billingCustomerCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
      billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return customer.id;
  }

  function eventSummary(event) {
    return {
      id: event.id,
      type: event.type,
      // Recorded because this rail now DEPENDS on it being empty. A row that
      // does not carry the field cannot answer "was this a platform event?"
      // after the fact, which is exactly the question an incident would ask.
      connectedAccountId: String(event.account || ""),
      livemode: Boolean(event.livemode),
      apiVersion: event.api_version || "",
      created: event.created || null
    };
  }

  function timestampFromUnix(seconds) {
    const value = Number(seconds || 0);
    return Number.isFinite(value) && value > 0 ? admin.firestore.Timestamp.fromMillis(value * 1000) : null;
  }

  function planTierForItem(item = null) {
    const key = String(item?.key || "").trim();
    if (key.startsWith("lite_")) return "lite";
    if (key.startsWith("pro_")) return "pro";
    if (key.startsWith("team_")) return "team";
    return "free_demo";
  }

  function effectiveProviderForPlanKey(planKey) {
    return planKey === "demo" ? "none" : "stripe";
  }

  // How many times a Stripe ledger row has been APPLIED — by a webhook, an
  // invoice rail, a checkout or the owner's resync. The watermark
  // (stripeEventSequence) orders webhook events against each other, but it says
  // nothing about a write that carried no event time, and a resync's list
  // snapshot is exactly that. The generation is what every writer reads BEFORE
  // it takes its Stripe snapshot and compares again, inside its transaction, at
  // the moment it writes: a mismatch means somebody applied this row in
  // between, so the snapshot in hand is not known to be the newest and is not
  // written. Rows from before this field existed read as 0.
  function stripeApplyGenerationOf(row) {
    const value = Math.floor(Number(row?.stripeApplyGeneration || 0));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  // On a generation conflict the apply re-reads Stripe and tries again with the
  // generation it just saw; each retry costs one Stripe call. The writer that
  // caused the conflict has already committed by the time it is seen, so a
  // second conflict needs a third writer in the same window.
  const STRIPE_APPLY_CONFLICT_RETRIES = 3;

  function stripeSubscriptionLedgerId(subscriptionId) {
    return `stripe_${String(subscriptionId || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180)}`;
  }

  function subscriptionActiveForEntitlement(status, shouldFallback) {
    return !shouldFallback && ["active", "trialing", "past_due"].includes(String(status || "").toLowerCase());
  }

  function subscriptionPlanRank(tier) {
    const ranks = { free_demo: 0, lite: 1, pro: 2, team: 3 };
    return ranks[String(tier || "").trim().toLowerCase()] || 0;
  }

  function defaultInternalPlanKeyForTier(tier) {
    const normalized = String(tier || "").trim().toLowerCase();
    if (normalized === "team") return "team_monthly";
    if (normalized === "pro") return "pro_monthly";
    if (normalized === "lite") return "lifetime_lite";
    return "demo";
  }

  function mappedEffectiveStatus(rawStatus) {
    const status = String(rawStatus || "").trim().toLowerCase();
    if (status === "trialing") return "trialing";
    if (status === "past_due") return "past_due";
    return "active";
  }

  function firestoreTimestampMillis(value) {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    return 0;
  }

  /**
   * Where an incoming webhook event sits against what this subscription's
   * ledger row has already applied.
   *
   * Stripe does not promise delivery in order: a `customer.subscription.updated`
   * retried after a network blip could overwrite a newer one and push a
   * workspace that had just gone active back to `trialing`.
   *
   * The comparison is the WEBHOOK EVENT's own created time, which is the only
   * value that reliably increases from one delivery to the next. An earlier
   * attempt built a sequence out of the subscription's own date fields, and
   * that is not monotonic — once canceled_at was set it out-ranked every
   * later event, so a resubscribe or a manual resync was dropped for good.
   *
   * Anything without an event time (the reconcile job, the owner's own
   * "Refresh subscription access") is never treated as stale.
   *
   * This USED to live inside writeStripeSubscriptionLedger, and that was the
   * whole defect: the ledger write skipped itself and RETURNED, applySubscription
   * discarded the return value, and the storage and team-seat branches below it
   * then wrote the workspace from the stale payload anyway — re-granting an
   * add-on and seats that had already been cancelled, durably, with no later
   * event repairing it. The decision is made once, here, by the one caller that
   * can act on it, BEFORE anything mutates.
   *
   * The read FAILS CLOSED. It used to be caught and warned, which let a single
   * ledgerRef.get() failure apply a stale event in full and file it as processed,
   * so no redelivery could ever repair it. Throwing instead leaves the
   * stripeBillingEvents row at "received" with no processedAt (processStripeEvent
   * only stamps processedAt after the applier RETURNS), so the dedupe lets
   * Stripe's redelivery through.
   */
  async function stripeSubscriptionEventOrdering({ workspace, subscriptionId, eventType, eventCreatedMs = 0 }) {
    const ledgerRef = workspace.ref.collection("subscriptions").doc(stripeSubscriptionLedgerId(subscriptionId));
    const eventSequence = Number(eventCreatedMs) > 0 ? Number(eventCreatedMs) : 0;

    // Read even without an event time. A resync or reconcile can never be
    // stale, but the row's generation from BEFORE its snapshot is what the
    // write-time check compares against (stripeApplyGenerationOf), and a
    // decision taken without it would have nothing to compare.
    let existing = null;
    try {
      existing = await ledgerRef.get();
    } catch (error) {
      console.warn("Stripe ledger ordering check failed; refusing to apply the event.", {
        subscriptionId, eventType, eventSequence, message: error?.message || String(error)
      });
      throw error instanceof Error ? error : new Error(String(error));
    }

    const row = existing.exists ? existing.data() || {} : {};
    const seen = Number(row.stripeEventSequence || 0);
    const generation = stripeApplyGenerationOf(row);
    if (eventSequence <= 0) {
      return { checked: true, stale: false, subscriptionId, ledgerRef, eventSequence: 0, seen, generation };
    }

    // Strictly older, never equal. Stripe's `created` has one-second granularity,
    // so two events for the same subscription can share a timestamp; treating
    // equal as stale would drop the second one, and a cancellation delivered in
    // the same second as an update is exactly the pair that must not be dropped.
    // Equal is safe to apply because what gets applied is not the payload — it is
    // the subscription Stripe currently holds (see applySubscription), so both
    // members of a tie write the same canonical state instead of racing.
    const stale = seen > 0 && eventSequence < seen;
    if (stale) {
      console.warn("Stripe subscription event arrived out of order; not applied.", {
        subscriptionId, eventType, eventSequence, seen
      });
    }
    return { checked: true, stale, subscriptionId, ledgerRef, eventSequence, seen, generation };
  }

  async function writeStripeSubscriptionLedger({
    workspace,
    subscription,
    item,
    eventType,
    status,
    periodEnd,
    customerId,
    shouldFallback,
    ordering,
    // Inside applySubscription's transaction both are supplied: the row goes
    // through `transaction`, and `existingRow` is what that same transaction
    // read, so the watermark and the generation are advanced from committed
    // state rather than from the pre-read. Without a transaction (the unit
    // checks) the row is read and written directly.
    transaction = null,
    existingRow = undefined
  }) {
    const subscriptionId = String(subscription?.id || "").trim();
    if (!workspace?.ref || !subscriptionId || !item) return { skipped: true, reason: "ledger_write_not_applicable" };

    // A precondition, not a second read. The ordering decision belongs to
    // applySubscription because it also gates the add-on branches and the
    // entitlement recompute; a ledger writer that could make its own decision is
    // how those branches came to run behind its back. Anything that reaches here
    // without a fresh, non-stale decision is a programming error, and it throws
    // rather than writing — a throw is retryable, a quiet write is not.
    if (!ordering || ordering.checked !== true) {
      throw new Error("writeStripeSubscriptionLedger requires an ordering decision from applySubscription");
    }
    if (ordering.stale === true) {
      throw new Error("writeStripeSubscriptionLedger must never be reached for a stale subscription event");
    }
    const ledgerRef = ordering.ledgerRef;
    const eventSequence = Number(ordering.eventSequence) > 0 ? Number(ordering.eventSequence) : 0;

    let current = existingRow;
    if (current === undefined) {
      const snapshot = await ledgerRef.get();
      current = snapshot.exists ? snapshot.data() || {} : null;
    }
    const seenNow = Number(current?.stripeEventSequence || 0);
    const generation = stripeApplyGenerationOf(current) + 1;

    const metadata = subscription.metadata || {};
    const activeForEntitlement = subscriptionActiveForEntitlement(status, shouldFallback);
    const quantity = Math.max(
      1,
      Number(Array.isArray(subscription.items?.data) ? subscription.items.data[0]?.quantity || 1 : 1) || 1
    );

    const row = {
      provider: "stripe",
      // Only advanced by a real webhook delivery — a reconcile leaves it alone —
      // and never moved backwards: an apply that lands after a newer event has
      // raised the watermark (a conflict retry that re-read Stripe, a same-second
      // tie) keeps the higher value.
      ...(eventSequence > 0 ? { stripeEventSequence: Math.max(seenNow, eventSequence) } : {}),
      stripeApplyGeneration: generation,
      subscriptionType: item.type,
      planTier: item.type === "plan" ? planTierForItem(item) : "",
      internalPlanKey: item.plan || "",
      itemKey: item.key,
      interval: item.interval || "",
      externalSubscriptionId: subscriptionId,
      externalCustomerId: String(customerId || ""),
      workspaceId: workspace.id,
      purchasedByUserId: String(metadata.requestedByUid || metadata.ownerUid || ""),
      providerStatus: String(status || "unknown"),
      activeForEntitlement,
      autoRenew: activeForEntitlement && subscription.cancel_at_period_end !== true,
      cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
      currentPeriodEnd: periodEnd,
      quantity: item.type === "team_seat_addon" ? Math.min(5, Math.floor(quantity)) : quantity,
      environment: subscription.livemode === true ? "live" : "test",
      lastProviderEventType: String(eventType || ""),
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(current?.createdAt ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() })
    };

    if (transaction) transaction.set(ledgerRef, row, { merge: true });
    else await ledgerRef.set(row, { merge: true });

    // `row` is the row as it will read once committed — for the entitlement
    // resolve that runs in the same transaction and cannot see its own write.
    return { written: true, eventSequence, generation, row: { ...(current || {}), ...row } };
  }

  function timestampFromAppleMillis(milliseconds) {
    const value = Number(milliseconds || 0);
    return Number.isFinite(value) && value > 0 ? admin.firestore.Timestamp.fromMillis(value) : null;
  }

  async function persistApplePlanSubscription(workspace, transaction, {
    environmentName = "Sandbox",
    eventType = "client.verify",
    notificationStatus = null,
    eventSequenceMs = 0
  } = {}) {
    const item = appleItemForProductId(transaction?.productId);
    const originalTransactionId = String(transaction?.originalTransactionId || "").trim();
    const transactionId = String(transaction?.transactionId || "").trim();
    if (!item || item.type !== "plan" || !originalTransactionId || !transactionId) {
      throw new HttpsError("failed-precondition", "This App Store purchase is not a supported NivaDesk subscription.");
    }

    const expirationMilliseconds = Number(transaction?.expiresDate || 0);
    const revoked = Number(transaction?.revocationDate || 0) > 0;
    const activeByDate = expirationMilliseconds > Date.now();
    const statusNumber = Number(notificationStatus || 0);
    const activeForEntitlement = !revoked && activeByDate && ![2, 5].includes(statusNumber);
    const providerStatus = revoked || statusNumber === 5
      ? "revoked"
      : activeForEntitlement
        ? (statusNumber === 4 ? "grace_period" : "active")
        : "expired";
    const ledgerRef = workspace.ref.collection("subscriptions").doc(appleLedgerId(originalTransactionId));
    const existing = await ledgerRef.get();

    // Apple does not promise delivery in order either, and this was the one
    // rail with no guard: Stripe compares the webhook event's own time, and
    // Google ignores the pushed payload and re-reads live state, which is
    // inherently order-safe. Here a DID_RENEW delivered late — after a REFUND
    // that had already revoked the subscription — overwrote `providerStatus`,
    // `activeForEntitlement` and `currentPeriodEnd` unconditionally and handed
    // the workspace its paid plan back. The expiry reconcile does not catch it,
    // because the row it left behind has a future period end.
    //
    // The comparison is the NOTIFICATION's signedDate, the only value that
    // reliably increases from one delivery to the next. Anything without one —
    // the owner's own "Refresh subscription access", a client verify — is never
    // treated as stale, exactly as on the Stripe side.
    const appleSequence = Number(eventSequenceMs) > 0 ? Number(eventSequenceMs) : 0;
    if (appleEventIsStale(existing.exists ? existing.data() : null, appleSequence)) {
      console.warn("Apple subscription notification arrived out of order; not applied.", {
        originalTransactionId, eventType, appleSequence
      });
      return { skipped: true, reason: "stale_apple_event" };
    }

    await ledgerRef.set({
      provider: "apple",
      // Only advanced by a real notification; a client verify leaves it alone,
      // so an owner re-checking their own purchase can never be dropped.
      ...(appleSequence > 0 ? { appleEventSequence: appleSequence } : {}),
      subscriptionType: "plan",
      planTier: planTierForItem(item),
      internalPlanKey: item.plan || "",
      itemKey: item.key,
      interval: item.interval || "",
      originalTransactionId,
      latestTransactionId: transactionId,
      externalSubscriptionId: originalTransactionId,
      workspaceId: workspace.id,
      appAccountToken: String(transaction?.appAccountToken || "").trim(),
      productId: String(transaction?.productId || "").trim(),
      providerStatus,
      activeForEntitlement,
      autoRenew: activeForEntitlement,
      currentPeriodEnd: timestampFromAppleMillis(expirationMilliseconds),
      environment: String(environmentName || "Sandbox").toLowerCase(),
      lastProviderEventType: String(eventType || ""),
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() })
    }, { merge: true });

    return recomputeEffectiveWorkspaceEntitlement(workspace, {
      triggerEventType: String(eventType || "apple.verify"),
      triggerProviderStatus: providerStatus
    });
  }

  // App Store storage add-on. Writes the additive billingStorageAddon* fields
  // (same schema as the Stripe/Google handlers) rather than changing the plan.
  async function persistAppleStorageAddon(workspace, transaction, {
    environmentName = "Sandbox",
    eventType = "client.verify",
    notificationStatus = null,
    eventSequenceMs = 0
  } = {}) {
    const item = appleItemForProductId(transaction?.productId);
    const originalTransactionId = String(transaction?.originalTransactionId || "").trim();
    const transactionId = String(transaction?.transactionId || "").trim();
    if (!item || item.type !== "storage_addon" || !originalTransactionId || !transactionId) {
      throw new HttpsError("failed-precondition", "This App Store purchase is not a supported NivaDesk storage add-on.");
    }

    const expirationMilliseconds = Number(transaction?.expiresDate || 0);
    const revoked = Number(transaction?.revocationDate || 0) > 0;
    const activeByDate = expirationMilliseconds > Date.now();
    const statusNumber = Number(notificationStatus || 0);
    const addonActive = !revoked && activeByDate && ![2, 5].includes(statusNumber);
    const providerStatus = revoked || statusNumber === 5
      ? "revoked"
      : addonActive
        ? (statusNumber === 4 ? "grace_period" : "active")
        : "expired";
    const ledgerRef = workspace.ref.collection("subscriptions").doc(appleLedgerId(originalTransactionId));
    const existing = await ledgerRef.get();

    // The same ordering guard as the plan ledger above, for the same reason.
    const appleSequence = Number(eventSequenceMs) > 0 ? Number(eventSequenceMs) : 0;
    if (appleEventIsStale(existing.exists ? existing.data() : null, appleSequence)) {
      console.warn("Apple storage add-on notification arrived out of order; not applied.", {
        originalTransactionId, eventType, appleSequence
      });
      return { skipped: true, reason: "stale_apple_event" };
    }

    await ledgerRef.set({
      provider: "apple",
      ...(appleSequence > 0 ? { appleEventSequence: appleSequence } : {}),
      subscriptionType: "storage_addon",
      itemKey: item.key,
      interval: item.interval || "",
      storageAddonMB: item.storageAddonMB || 0,
      originalTransactionId,
      latestTransactionId: transactionId,
      externalSubscriptionId: originalTransactionId,
      workspaceId: workspace.id,
      appAccountToken: String(transaction?.appAccountToken || "").trim(),
      productId: String(transaction?.productId || "").trim(),
      providerStatus,
      activeForEntitlement: addonActive,
      autoRenew: addonActive,
      currentPeriodEnd: timestampFromAppleMillis(expirationMilliseconds),
      environment: String(environmentName || "Sandbox").toLowerCase(),
      lastProviderEventType: String(eventType || ""),
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() })
    }, { merge: true });

    await workspace.ref.set({
      billingStorageAddonMB: addonActive ? item.storageAddonMB : 0,
      billingStorageAddonKey: addonActive ? item.key : "",
      billingStorageAddonStatus: addonActive ? "active" : "cancelled",
      billingStorageAddonProvider: addonActive ? "apple" : "",
      billingStorageAddonOriginalTransactionId: addonActive ? originalTransactionId : "",
      billingStorageAddonCurrentPeriodEnd: timestampFromAppleMillis(expirationMilliseconds),
      billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      billingUpdatedBy: "apple_verification",
      billingExportAccessPreserved: true
    }, { merge: true });

    return { updated: true, workspaceId: workspace.id, addon: item.key, active: addonActive };
  }

  async function persistApplePurchase(workspace, transaction, options = {}) {
    const item = appleItemForProductId(transaction?.productId);
    if (item && item.type === "storage_addon") {
      return persistAppleStorageAddon(workspace, transaction, options);
    }
    return persistApplePlanSubscription(workspace, transaction, options);
  }

  // The resolver, in two halves so applySubscription can run it INSIDE its
  // transaction: Firestore wants every read before the first write, so the
  // inputs are read up front (through the transaction when there is one) and
  // the resolve itself is pure — it returns the workspace patch and the result
  // and writes nothing. recomputeEffectiveWorkspaceEntitlement below is the
  // read-resolve-write wrapper the Apple, Google, resync-less and scheduled
  // paths keep using.
  async function readEntitlementInputs(workspace, transaction = null) {
    const subscriptionsRef = workspace.ref.collection("subscriptions");
    const subscriptionSnapshot = transaction ? await transaction.get(subscriptionsRef) : await subscriptionsRef.get();
    const currentSnap = transaction ? await transaction.get(workspace.ref) : await workspace.ref.get();
    return {
      rows: subscriptionSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })),
      currentData: currentSnap.exists ? currentSnap.data() || {} : {}
    };
  }

  function resolveWorkspaceEntitlement({ rows, currentData }, {
    triggerEventType = "",
    triggerProviderStatus = "",
    triggerCustomerId = ""
  } = {}) {
    const activePlanSubscriptions = rows
      .filter((entry) => (
        entry.subscriptionType === "plan"
        && entry.activeForEntitlement === true
        && subscriptionPlanRank(entry.planTier) > 0
      ))
      .sort((left, right) => {
        const tierDifference = subscriptionPlanRank(right.planTier) - subscriptionPlanRank(left.planTier);
        if (tierDifference !== 0) return tierDifference;
        const expiryDifference = firestoreTimestampMillis(right.currentPeriodEnd) - firestoreTimestampMillis(left.currentPeriodEnd);
        if (expiryDifference !== 0) return expiryDifference;
        return String(left.provider || "").localeCompare(String(right.provider || ""));
      });

    const selected = activePlanSubscriptions[0] || null;
    const activeProviders = [...new Set(activePlanSubscriptions.map((entry) => String(entry.provider || "").trim()).filter(Boolean))];
    const hasMultipleActiveSubscriptions = activePlanSubscriptions.length > 1;
    const resolutionFields = {
      billingActivePlanSubscriptionCount: activePlanSubscriptions.length,
      billingActivePlanProviders: activeProviders,
      billingHasMultipleActiveSubscriptions: hasMultipleActiveSubscriptions,
      billingDuplicateSubscriptionDetectedAt: hasMultipleActiveSubscriptions
        ? admin.firestore.FieldValue.serverTimestamp()
        : admin.firestore.FieldValue.delete(),
      billingEntitlementResolutionReason: selected
        ? "highest_active_verified_plan"
        : "no_active_verified_plan",
      billingEntitlementTriggerEvent: String(triggerEventType || ""),
      billingEntitlementResolvedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (!selected) {
      // Preserve a manually granted plan. A manual_workspace plan has no Stripe plan
      // subscription, so the resolver must not downgrade it to Demo just because an
      // add-on purchase (storage/seats) created a Stripe customer with no plan sub.
      const currentSource = String(currentData.billingPlanSource || "").trim().toLowerCase();
      const currentPlan = String(currentData.billingPlan || "").trim();
      if (currentSource.includes("manual") && currentPlan && currentPlan !== "demo") {
        return {
          payload: { ...resolutionFields },
          result: {
            plan: currentPlan,
            provider: "manual",
            activePlanSubscriptionCount: 0,
            hasMultipleActiveSubscriptions: false,
            preservedManualPlan: true
          }
        };
      }

      // Shopify bills through its own API and writes the plan straight onto the
      // workspace, so it never leaves a row in subscriptions: "no active plan
      // subscription" is the normal, healthy state for a paying Shopify
      // merchant. The Shopify side already refuses to overwrite a live
      // Stripe/Apple/Google plan; this is that same courtesy in the other
      // direction. Without it, a merchant who once tried Stripe (leaving a
      // customer id behind), then subscribed on Shopify, would be dropped to
      // Demo the moment anything triggered a resolve.
      const shopifyStatus = String(currentData.shopifySubscriptionStatus || currentData.billingStatus || "").trim().toLowerCase();
      if (currentSource === "shopify" && currentPlan && currentPlan !== "demo" && ["active", "trialing", "past_due"].includes(shopifyStatus)) {
        return {
          payload: { ...resolutionFields },
          result: {
            plan: currentPlan,
            provider: "shopify",
            activePlanSubscriptionCount: 0,
            hasMultipleActiveSubscriptions: false,
            preservedShopifyPlan: true
          }
        };
      }

      const normalizedTriggerStatus = String(triggerProviderStatus || "").trim().toLowerCase();
      const legacyStatus = normalizedTriggerStatus === "unpaid"
        ? "expired"
        : (["canceled", "cancelled"].includes(normalizedTriggerStatus) || triggerEventType === "customer.subscription.deleted")
          ? "cancelled"
          : "free";

      return {
        payload: planUpdatePayload("demo", legacyStatus, triggerProviderStatus || "free", {
          billingPlanSource: "entitlement_resolver",
          billingEffectivePlanTier: "free_demo",
          billingEffectiveStatus: "free",
          billingEffectiveProvider: "none",
          billingEffectiveSubscriptionId: "",
          billingCustomerId: String(triggerCustomerId || ""),
          billingSubscriptionId: "",
          billingSubscriptionItemKey: "",
          billingInterval: "",
          billingCurrentPeriodEnd: null,
          billingStorageAddonMB: 0,
          billingAdditionalTeamSeatQuantity: 0,
          billingAdditionalTeamSeatKey: "",
          billingAdditionalTeamSeatStatus: "cancelled",
          billingAdditionalTeamSeatSubscriptionId: "",
          ...resolutionFields
        }),
        result: {
          plan: "demo",
          provider: "none",
          activePlanSubscriptionCount: 0,
          hasMultipleActiveSubscriptions: false
        }
      };
    }

    const effectivePlanKey = String(selected.internalPlanKey || "").trim()
      || defaultInternalPlanKeyForTier(selected.planTier);
    const effectiveProvider = String(selected.provider || "").trim() || "unknown";
    const effectiveSubscriptionId = String(
      selected.externalSubscriptionId
      || selected.originalTransactionId
      || selected.purchaseTokenHash
      || selected.id
      || ""
    );
    const common = {
      billingPlanSource: "entitlement_resolver",
      billingEffectivePlanTier: String(selected.planTier || "").trim(),
      billingEffectiveProvider: effectiveProvider,
      billingEffectiveSubscriptionId: effectiveSubscriptionId,
      billingSubscriptionItemKey: String(selected.itemKey || ""),
      billingInterval: String(selected.interval || ""),
      billingCurrentPeriodEnd: selected.currentPeriodEnd || null,
      ...resolutionFields
    };

    // Preserve the existing Stripe fields while Stripe is the selected provider.
    // Future Apple/Google handlers will rely on billingEffective* fields without
    // erasing Stripe customer references that may still be needed for portal access.
    if (effectiveProvider === "stripe") {
      common.billingCustomerId = String(selected.externalCustomerId || triggerCustomerId || "");
      common.billingSubscriptionId = String(selected.externalSubscriptionId || "");
    }

    return {
      payload: planUpdatePayload(
        effectivePlanKey,
        mappedEffectiveStatus(selected.providerStatus),
        String(selected.providerStatus || "active"),
        common
      ),
      result: {
        plan: effectivePlanKey,
        provider: effectiveProvider,
        activePlanSubscriptionCount: activePlanSubscriptions.length,
        hasMultipleActiveSubscriptions
      }
    };
  }

  async function recomputeEffectiveWorkspaceEntitlement(workspace, options = {}) {
    const inputs = await readEntitlementInputs(workspace);
    const { payload, result } = resolveWorkspaceEntitlement(inputs, options);
    await workspace.ref.set(payload, { merge: true });
    return result;
  }

  function itemByPriceId(priceId) {
    const target = String(priceId || "").trim();
    if (!target) return null;
    return Object.values(STRIPE_BILLING_ITEMS).find((item) => String(process.env[item.priceEnv] || "").trim() === target) || null;
  }

  function itemFromMetadataOrSubscription(metadata = {}, subscription = {}) {
    const key = normalizeBillingItemKey(metadata.studioFlowBillingKey || metadata.plan || metadata.addonKey || metadata.itemKey);
    if (STRIPE_BILLING_ITEMS[key]) return STRIPE_BILLING_ITEMS[key];
    const firstItem = Array.isArray(subscription.items?.data) ? subscription.items.data[0] : null;
    const priceId = firstItem?.price?.id || "";
    return itemByPriceId(priceId);
  }

  async function workspaceRefFromStripeRefs({ workspaceId, subscriptionId, customerId }) {
    const db = admin.firestore();
    const directWorkspaceId = String(workspaceId || "").trim();
    if (directWorkspaceId) {
      const directRef = db.collection("companies").doc(directWorkspaceId);
      const directSnap = await directRef.get();
      if (directSnap.exists) return { ref: directRef, id: directWorkspaceId, data: directSnap.data() || {} };
    }

    const subId = String(subscriptionId || "").trim();
    if (subId) {
      const baseSnap = await db.collection("companies").where("billingSubscriptionId", "==", subId).limit(1).get();
      if (!baseSnap.empty) {
        const doc = baseSnap.docs[0];
        return { ref: doc.ref, id: doc.id, data: doc.data() || {} };
      }

      const addonSnap = await db.collection("companies").where("billingStorageAddonSubscriptionId", "==", subId).limit(1).get();
      if (!addonSnap.empty) {
        const doc = addonSnap.docs[0];
        return { ref: doc.ref, id: doc.id, data: doc.data() || {} };
      }

      const teamSeatSnap = await db.collection("companies").where("billingAdditionalTeamSeatSubscriptionId", "==", subId).limit(1).get();
      if (!teamSeatSnap.empty) {
        const doc = teamSeatSnap.docs[0];
        return { ref: doc.ref, id: doc.id, data: doc.data() || {} };
      }
    }

    const custId = String(customerId || "").trim();
    if (custId) {
      const customerSnap = await db.collection("companies").where("billingCustomerId", "==", custId).limit(1).get();
      if (!customerSnap.empty) {
        const doc = customerSnap.docs[0];
        return { ref: doc.ref, id: doc.id, data: doc.data() || {} };
      }
    }

    return null;
  }

  function billingUpdatedBySource(provider) {
    switch (String(provider || "").trim().toLowerCase()) {
      case "apple": return "apple_verification";
      case "google": return "google_verification";
      case "none": return "entitlement_resolver";
      default: return "stripe_webhook";
    }
  }

  function planUpdatePayload(planKey, status, rawStatus, common = {}) {
    const entitlements = PLAN_ENTITLEMENTS[planKey] || PLAN_ENTITLEMENTS.demo;
    return {
      // billingPlan remains the app-compatible effective entitlement key during rollout.
      billingPlan: entitlements.plan,
      billingPlanName: entitlements.displayName,
      billingPlanSource: "stripe",
      billingStatus: status,
      billingProviderRawStatus: rawStatus || status,
      billingEffectivePlan: entitlements.plan,
      billingEffectivePlanTier: planKey === "demo" ? "free_demo" : planTierForItem({ key: common.billingSubscriptionItemKey || "" }),
      billingEffectiveStatus: status,
      billingEffectiveProvider: effectiveProviderForPlanKey(planKey),
      billingEffectiveSubscriptionId: planKey === "demo" ? "" : String(common.billingSubscriptionId || ""),
      billingEntitlementUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      billingStorageLimitMB: entitlements.storageLimitMB,
      billingTeamMemberLimit: entitlements.teamMemberLimit,
      billingTeamIncludedSeats: entitlements.plan === "team_monthly" ? 5 : entitlements.teamMemberLimit,
      billingTeamSelfServiceMax: entitlements.plan === "team_monthly" ? 10 : entitlements.teamMemberLimit,
      billingExportAccessPreserved: true,
      billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      billingUpdatedBy: common.billingUpdatedBy || billingUpdatedBySource(common.billingEffectiveProvider),
      ...common
    };
  }

  // eventCreatedMs is the delivering webhook event's own created time. It is
  // forwarded to applySubscription for one reason: the ledger's ordering guard
  // can only compare against a row that already carries a stripeEventSequence,
  // so every rail that WRITES the row has to raise the watermark. See the note
  // over the same parameter on applyInvoicePaid.
  async function applyCompletedSubscriptionCheckout(stripe, session, eventCreatedMs = 0) {
    if (String(session.mode || "") !== "subscription") {
      return { skipped: true, reason: "non_subscription_checkout" };
    }

    const subscriptionId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id || "";
    if (!subscriptionId) {
      return { skipped: true, reason: "subscription_not_found_on_checkout" };
    }

    // The row's generation is read BEFORE the retrieve, so the write-time check
    // in applySubscription compares against the state as it stood when this
    // snapshot was taken, not a moment later (see stripeApplyGenerationOf).
    const baseline = await stripeApplyBaseline({
      workspaceId: session.metadata?.workspaceId,
      subscriptionId,
      customerId: stripeReferenceId(session.customer),
      eventType: "checkout.session.completed",
      eventCreatedMs
    });
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const result = await applySubscription(subscription, "checkout.session.completed", eventCreatedMs, {
      stripe, subscriptionIsCanonical: true, baseline
    });

    // The once-per-workspace trial stamp is the ONE thing a stale event may
    // still write, and the only one. "A stale event mutates nothing" is the
    // rule for STATE: a plan, a period end, an add-on, a checkout session id
    // can each be rolled backwards by a late delivery, so a late delivery may
    // not touch them. "This workspace has, at some point, started a free
    // trial" is not state — it is a fact that cannot become false by arriving
    // late, and every reader of it (`hasUsedTrial` in
    // createStripeCheckoutSession, index.js's workspaceHasUsedTrial, the
    // Shopify guard) reads it as a boolean. d0c7f431 gated the stamp on
    // `result.updated`, which a stale checkout no longer carries, so the stamp
    // was dropped; once a cancellation had cleared billingSubscriptionId the
    // workspace could buy a second free fortnight.
    //
    // Three rules, each pinned by stripe-invoice-api-drift.test.js:
    //   1. The evidence is Stripe's, never the event's: the subscription
    //      retrieved a moment ago shows "trialing" or a trial_end. No trial in
    //      the canonical record, no stamp — an ambiguous event does not
    //      manufacture trial usage.
    //   2. The workspace is the one applySubscription resolved through the
    //      trusted references; no resolved workspace, no stamp.
    //   3. Written only when absent, inside a transaction, so an existing stamp
    //      keeps its date and two concurrent deliveries cannot both write.
    let trialStamp = null;
    if (result.workspaceId && subscriptionShowsTrial(subscription)) {
      trialStamp = await stampTrialUsedIfMissing(result.workspaceId);
    }

    if (result.updated && result.workspaceId) {
      await admin.firestore().collection("companies").doc(result.workspaceId).set({
        billingCheckoutSessionId: session.id || "",
        billingCheckoutCompletedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    // Recorded on the event row either way, so a skipped event that spent the
    // trial says so rather than reading as "nothing happened".
    return trialStamp && trialStamp.stamped ? { ...result, billingTrialUsedAtStamped: true } : result;
  }

  /** Stripe's own record says a trial exists or existed on this subscription. */
  function subscriptionShowsTrial(subscription) {
    if (!subscription || typeof subscription !== "object") return false;
    if (String(subscription.status || "") === "trialing") return true;
    const trialEnd = Number(subscription.trial_end);
    return Number.isFinite(trialEnd) && trialEnd > 0;
  }

  /**
   * billingTrialUsedAt, written once. A transaction rather than a merge-set:
   * the read and the write have to be one decision, or two deliveries of the
   * same checkout — Stripe retries, and it retries concurrently — could each
   * read "absent" and each write, the second moving the date the first set.
   */
  async function stampTrialUsedIfMissing(workspaceId) {
    const db = admin.firestore();
    const ref = db.collection("companies").doc(workspaceId);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.exists ? snapshot.data() || {} : {};
      if (data.billingTrialUsedAt) return { stamped: false, reason: "already_stamped" };
      transaction.set(ref, { billingTrialUsedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return { stamped: true };
    });
  }

  // The ONE place a Stripe subscription mutates a workspace: the ledger row, the
  // storage add-on, the purchased team seats and the entitlement recompute all
  // happen here and nowhere else. Two properties are enforced at the top, in this
  // order, and everything below them depends on both:
  //
  //   (1) ORDERING, decided once. If the delivering event is older than what this
  //       subscription's ledger row has already applied, the function returns
  //       before it has mutated anything at all — not the ledger, not the add-on
  //       branches, not the recompute, and not the per-rail stamps its callers
  //       write, which are all gated on `updated`. The previous shape made this
  //       decision two frames down, inside the ledger writer, whose return value
  //       was discarded here; the add-on branches then wrote a cancelled add-on
  //       and cancelled seats back onto the workspace from the stale payload.
  //
  //   (2) CANONICAL STATE. `stripe` is passed by the rail that is handed a
  //       webhook PAYLOAD (customer.subscription.*). The event is then used only
  //       to IDENTIFY the subscription: its id and its customer never change,
  //       and `metadata.workspaceId` is written once by createStripeCheckoutSession
  //       and never rewritten by NivaDesk — a NivaDesk rule, not a Stripe
  //       guarantee (Stripe lets metadata be edited), which is why the resolver
  //       also falls back to the subscription id and the customer. That is what
  //       makes identification safe even when the body is stale — and what gets
  //       applied is the subscription
  //       Stripe currently holds. A late delivery therefore re-applies present
  //       truth instead of an old snapshot, which is what makes an equal
  //       `event.created` (Stripe's granularity is one second) a non-event rather
  //       than a race: both members of a tie write the same state.
  //
  //       The other three rails already retrieved the subscription themselves one
  //       frame up and pass no `stripe`, so this costs exactly one extra API call
  //       per customer.subscription.* event and never two on the same event.
  //
  //       The costs, honestly: that call can fail, and a failure now THROWS
  //       instead of applying something. That is the direction that keeps the
  //       event retryable rather than losing it. A `customer.subscription.deleted`
  //       retrieve is fine — the pinned SDK types retrieve as
  //       `Promise<Response<Subscription>>` with no deleted variant
  //       (Subscriptions.d.ts:29; only SubscriptionItems has a Deleted* type) and
  //       `Subscription.Status` includes 'canceled' (Subscriptions.d.ts:430) — so
  //       a cancelled subscription comes back as itself with status canceled,
  //       which is the right answer. `isDeleted` below also forces the fallback
  //       from the event type, so that rail does not depend on the status alone.
  //
  //   (3) THE WRITE IS ONE TRANSACTION, AND THE DECISION IS TAKEN AGAIN INSIDE IT.
  //       (1) and (2) are decided before the write, and Stripe's state can move
  //       between the two: an apply that retrieved the seats alive, held for a
  //       moment, and then wrote them back after a later apply had already
  //       cancelled them (Addendum 7, L1). So the ledger row, the add-on fields
  //       and the entitlement recompute go into a single Firestore transaction
  //       that re-reads the row and refuses to write if (a) a newer event has
  //       raised the watermark since — stale after all — or (b) the row's
  //       generation (stripeApplyGenerationOf) has moved since this apply's
  //       snapshot was taken — someone applied this row in between, so the
  //       snapshot is not known to be newest; the apply then re-reads Stripe
  //       and tries again against the generation it saw. Both checks read the
  //       committed row at the moment of writing, which the pre-read cannot.
  //       No Stripe call happens inside the transaction: a retried callback
  //       must not have side effects, and the re-read runs between attempts.
  async function applySubscription(subscription, eventType, eventCreatedMs = 0, {
    stripe = null,
    // The subscription in hand is already canonical — the caller retrieved it
    // a frame ago, or it came out of a fresh list — so `stripe` is kept for a
    // conflict re-read only and is not spent on a retrieve up front.
    subscriptionIsCanonical = false,
    // From stripeApplyBaseline: the workspace and the ordering decision taken
    // BEFORE the caller's own retrieve, used in place of the resolve and the
    // pre-read below, which would otherwise run AFTER that snapshot.
    baseline = null,
    // From the owner resync: this row's generation as read BEFORE the list
    // call that produced `subscription`. It overrides the pre-read's
    // generation, which for the resync is read after the snapshot.
    expectedGeneration = null
  } = {}) {
    const eventMetadata = subscription?.metadata || {};
    const subscriptionId = String(subscription?.id || "").trim();
    if (!subscriptionId) {
      // Without an id there is no ledger row to order against and nothing to
      // retrieve, so there is no safe way to apply this at all.
      return { skipped: true, reason: "subscription_not_found_on_event" };
    }

    const baselineApplies = Boolean(
      baseline && baseline.workspace && baseline.ordering && baseline.ordering.subscriptionId === subscriptionId
    );
    const workspace = baselineApplies ? baseline.workspace : await workspaceRefFromStripeRefs({
      workspaceId: eventMetadata.workspaceId,
      subscriptionId,
      customerId: stripeReferenceId(subscription.customer)
    });
    if (!workspace) {
      return { skipped: true, reason: "workspace_not_found" };
    }

    // (1) Ordering, before any mutation and before the Stripe call — a stale
    // redelivery must not cost an API request either.
    const ordering = baselineApplies ? baseline.ordering : await stripeSubscriptionEventOrdering({
      workspace, subscriptionId, eventType, eventCreatedMs
    });
    if (ordering.stale === true) {
      return {
        skipped: true,
        reason: "stale_subscription_event",
        workspaceId: workspace.id,
        eventSequence: ordering.eventSequence,
        appliedEventSequence: ordering.seen
      };
    }

    // (2) Canonical state. Retrieved here in two cases. The first is the
    // webhook BODY rail (customer.subscription.*), as before. The second is a
    // retrieve-first rail that could not resolve the workspace from the
    // session's or invoice's own references — and so could not take its
    // baseline — before it retrieved, and whose retrieved subscription is what
    // resolved the workspace above: that snapshot predates the pre-read just
    // taken, so it is trusted to IDENTIFY the subscription and for nothing
    // else, exactly like a body, and what is applied is a read taken after the
    // pre-read. The owner resync keeps its list entry: its generation was read
    // before the list. Without this second case, a cancellation applied between
    // that rail's retrieve and this pre-read — a same-second webhook, a resync,
    // both invisible to the watermark — was written over by the old snapshot,
    // because the generation it compared against had been read after the event.
    const generationFromCaller = expectedGeneration !== null && expectedGeneration !== undefined;
    const snapshotPredatesPreRead = subscriptionIsCanonical && !baselineApplies && !generationFromCaller;
    let current = subscription;
    if (stripe && (!subscriptionIsCanonical || snapshotPredatesPreRead)) {
      current = await retrieveCanonicalSubscription(stripe, subscriptionId);
    }

    const item = itemFromMetadataOrSubscription(current.metadata || {}, current);
    if (!item) {
      return { skipped: true, reason: "billing_item_not_found" };
    }

    // (3) The write, checked again at the moment it lands.
    let generation = generationFromCaller
      ? Math.max(0, Math.floor(Number(expectedGeneration) || 0))
      : ordering.generation;
    for (let attempt = 0; ; attempt += 1) {
      const outcome = await commitStripeSubscriptionApply({
        workspace, subscription: current, item, eventType, ordering, expectedGeneration: generation
      });
      if (outcome.stale) {
        console.warn("Stripe subscription event was out-ranked while being applied; not applied.", {
          subscriptionId, eventType, eventSequence: ordering.eventSequence, seen: outcome.seen
        });
        return {
          skipped: true,
          reason: "stale_subscription_event",
          workspaceId: workspace.id,
          eventSequence: ordering.eventSequence,
          appliedEventSequence: outcome.seen
        };
      }
      if (!outcome.conflict) return outcome.result;

      if (!stripe || attempt >= STRIPE_APPLY_CONFLICT_RETRIES) {
        // Retryable on purpose: the webhook answers 500 and Stripe redelivers,
        // the resync reports the failure to the owner. Nothing was written.
        throw new Error(
          `Stripe subscription ${subscriptionId} was applied by another writer while ${eventType} was in flight; not applied`
        );
      }
      console.warn("Stripe subscription was applied by another writer while this apply was in flight; re-reading Stripe.", {
        subscriptionId, eventType, expectedGeneration: generation, generation: outcome.generation
      });
      current = await retrieveCanonicalSubscription(stripe, subscriptionId);
      generation = outcome.generation;
    }
  }

  async function retrieveCanonicalSubscription(stripe, subscriptionId) {
    const current = await stripe.subscriptions.retrieve(subscriptionId);
    if (!current || typeof current !== "object" || String(current.id || "").trim() !== subscriptionId) {
      // Not a transient network error, but the same answer: refuse to apply
      // anything and let the redelivery try again rather than falling back to
      // the payload this retrieve exists to distrust.
      throw new Error(`Stripe returned no usable subscription for ${subscriptionId}`);
    }
    return current;
  }

  // The pre-read for the rails that retrieve the subscription themselves before
  // calling applySubscription (checkout, both invoice rails): the same ordering
  // decision applySubscription would take, taken BEFORE their retrieve so the
  // generation it carries predates the snapshot. Null when the references at
  // hand resolve no workspace yet; applySubscription then resolves from the
  // retrieved subscription's own references, pre-reads, and — because that
  // snapshot predates the pre-read — re-reads Stripe before it writes (see the
  // canonical-state step there). A workspace nothing resolves is skipped as
  // workspace_not_found, never written.
  async function stripeApplyBaseline({ workspaceId, subscriptionId, customerId, eventType, eventCreatedMs = 0 }) {
    const workspace = await workspaceRefFromStripeRefs({ workspaceId, subscriptionId, customerId });
    if (!workspace) return null;
    const ordering = await stripeSubscriptionEventOrdering({ workspace, subscriptionId, eventType, eventCreatedMs });
    return { workspace, ordering };
  }

  // One transaction: the ledger row, the workspace's add-on fields (or the
  // entitlement resolve for a plan) and the fallback stamps, or nothing at all.
  // Resolves to { result } when written, { stale, seen } when a newer event
  // landed first, { conflict, generation } when the row moved under us.
  async function commitStripeSubscriptionApply({ workspace, subscription: current, item, eventType, ordering, expectedGeneration }) {
    const status = String(current.status || "unknown");
    // Reads the items, not the subscription: current_period_end moved there.
    const periodEnd = timestampFromUnix(stripeCurrentPeriodEndUnix(current));
    const customerId = stripeReferenceId(current.customer);
    const isDeleted = eventType === "customer.subscription.deleted";
    const shouldFallback = isDeleted || ["canceled", "unpaid", "incomplete_expired"].includes(status);
    const eventSequence = Number(ordering.eventSequence) > 0 ? Number(ordering.eventSequence) : 0;
    const ledgerRef = ordering.ledgerRef;

    return admin.firestore().runTransaction(async (transaction) => {
      // Reads first — Firestore's rule, and also what makes the two checks and
      // the resolve one consistent picture: the row this event orders against,
      // every row the resolve ranks, and the workspace document. Reading the
      // workspace here is what serialises two applies for DIFFERENT
      // subscriptions of one workspace (seats and storage, say): whichever
      // commits second is retried by Firestore over the first's result instead
      // of resolving from a picture that is missing it.
      const ledgerSnap = await transaction.get(ledgerRef);
      const inputs = await readEntitlementInputs(workspace, transaction);
      const existingRow = ledgerSnap.exists ? ledgerSnap.data() || {} : null;
      const seenNow = Number(existingRow?.stripeEventSequence || 0);
      const generationNow = stripeApplyGenerationOf(existingRow);

      if (eventSequence > 0 && seenNow > 0 && eventSequence < seenNow) return { stale: true, seen: seenNow };
      if (generationNow !== expectedGeneration) return { conflict: true, generation: generationNow };

      // Every verified Stripe subscription update is persisted in a provider-neutral
      // ledger. Apple and Google purchase handlers write the same schema, while
      // billingPlan continues to serve existing clients during rollout.
      const ledger = await writeStripeSubscriptionLedger({
        workspace,
        subscription: current,
        item,
        eventType,
        status,
        periodEnd,
        customerId,
        shouldFallback,
        ordering,
        transaction,
        existingRow
      });

      if (item.type === "storage_addon") {
        const addonActive = !shouldFallback && ["active", "trialing", "past_due"].includes(status);
        transaction.set(workspace.ref, {
          billingCustomerId: customerId,
          billingStorageAddonMB: addonActive ? item.storageAddonMB : 0,
          billingStorageAddonKey: addonActive ? item.key : "",
          billingStorageAddonStatus: addonActive ? status : "cancelled",
          billingStorageAddonSubscriptionId: addonActive ? current.id : "",
          billingStorageAddonCurrentPeriodEnd: periodEnd,
          billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          billingUpdatedBy: "stripe_webhook",
          billingExportAccessPreserved: true
        }, { merge: true });

        return { result: { updated: true, workspaceId: workspace.id, addon: item.key, active: addonActive } };
      }

      if (item.type === "team_seat_addon") {
        const addonActive = !shouldFallback && ["active", "trialing", "past_due"].includes(status);
        const firstSubscriptionItem = Array.isArray(current.items?.data) ? current.items.data[0] : null;
        const requestedQuantity = Math.max(1, Number(firstSubscriptionItem?.quantity || 1) || 1);
        const purchasedSeatQuantity = addonActive ? Math.min(5, Math.floor(requestedQuantity)) : 0;
        // The quantity and the limit computed from it land in the same write;
        // they cannot be seen apart.
        transaction.set(workspace.ref, {
          billingCustomerId: customerId,
          billingAdditionalTeamSeatQuantity: purchasedSeatQuantity,
          billingAdditionalTeamSeatKey: addonActive ? item.key : "",
          billingAdditionalTeamSeatStatus: addonActive ? status : "cancelled",
          billingAdditionalTeamSeatSubscriptionId: addonActive ? current.id : "",
          billingAdditionalTeamSeatCurrentPeriodEnd: periodEnd,
          billingTeamIncludedSeats: 5,
          billingTeamSelfServiceMax: 10,
          billingTeamMemberLimit: 5 + purchasedSeatQuantity,
          billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          billingUpdatedBy: "stripe_webhook",
          billingExportAccessPreserved: true
        }, { merge: true });

        return { result: { updated: true, workspaceId: workspace.id, addon: item.key, active: addonActive, purchasedSeatQuantity } };
      }

      // The resolve ranks the rows as they will stand once this transaction
      // commits: the collection as read, with this subscription's row replaced
      // by the one being written.
      const rows = inputs.rows.filter((row) => row.id !== ledgerRef.id).concat([{ id: ledgerRef.id, ...ledger.row }]);
      const { payload, result: entitlementResolution } = resolveWorkspaceEntitlement(
        { rows, currentData: inputs.currentData },
        { triggerEventType: eventType, triggerProviderStatus: status, triggerCustomerId: customerId }
      );
      transaction.set(workspace.ref, {
        ...payload,
        ...(shouldFallback ? {
          billingPreviousPaidPlan: item.plan,
          billingPreviousSubscriptionItemKey: item.key,
          billingPreviousInterval: item.interval || ""
        } : {})
      }, { merge: true });

      return {
        result: {
          updated: true,
          workspaceId: workspace.id,
          providerPlanEvent: item.plan,
          providerStatus: status,
          effectivePlan: entitlementResolution.plan,
          effectiveProvider: entitlementResolution.provider,
          activePlanSubscriptionCount: entitlementResolution.activePlanSubscriptionCount,
          hasMultipleActiveSubscriptions: entitlementResolution.hasMultipleActiveSubscriptions
        }
      };
    });
  }

  // The third argument is what stops a renewal being undone. Before the drift
  // fix every invoice.paid skipped before it reached applySubscription, so this
  // rail never wrote the ledger row and never needed a sequence. Now it writes
  // the renewed currentPeriodEnd — and a write that does not also raise
  // stripeEventSequence leaves that date unprotected: a customer.subscription.*
  // event created BEFORE this renewal but delivered after it still out-ranks the
  // stale watermark, is applied, and rolls billingCurrentPeriodEnd back to the
  // pre-renewal date. That date is not cosmetic — reconcileExpiredBillingEntitlements
  // selects on it hourly and drops the workspace to Free Demo.
  //
  // Using the invoice event's created time here is the conservative direction:
  // the subscription written on this rail comes from a fresh retrieve, so it is
  // at least as new as event.created claims, never older.
  async function applyInvoicePaid(stripe, invoice, eventCreatedMs = 0) {
    // parent.subscription_details.subscription first, legacy invoice.subscription second.
    const subscriptionId = stripeSubscriptionIdFromInvoice(invoice);
    if (!subscriptionId) {
      // Still correct for a genuine one-off invoice, which has no subscription.
      return { skipped: true, reason: "invoice_without_subscription" };
    }

    // Pre-read before the retrieve, for the same reason as on the checkout rail.
    const baseline = await stripeApplyBaseline({
      workspaceId: stripeInvoiceWorkspaceId(invoice),
      subscriptionId,
      customerId: stripeReferenceId(invoice.customer),
      eventType: "invoice.paid",
      eventCreatedMs
    });
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const result = await applySubscription(subscription, "invoice.paid", eventCreatedMs, {
      stripe, subscriptionIsCanonical: true, baseline
    });
    if (result.updated && result.workspaceId) {
      await admin.firestore().collection("companies").doc(result.workspaceId).set({
        billingLastInvoiceId: invoice.id || "",
        billingLastInvoicePaidAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return result;
  }

  async function applyInvoicePaymentFailed(stripe, invoice, eventCreatedMs = 0) {
    let subscription = null;
    let retrieveError = null;
    // Same drift as invoice.paid, but it fails quietly here: without the id the
    // workspace still resolves through invoice.customer, so the failure is
    // stamped and the handler looks successful while applySubscription is never
    // called and the workspace never moves to past_due. Dunning depends on this.
    const subscriptionId = stripeSubscriptionIdFromInvoice(invoice);
    let baseline = null;
    if (subscriptionId) {
      // Pre-read before the retrieve, for the same reason as on the checkout rail.
      baseline = await stripeApplyBaseline({
        workspaceId: stripeInvoiceWorkspaceId(invoice),
        subscriptionId,
        customerId: stripeReferenceId(invoice.customer),
        eventType: "invoice.payment_failed",
        eventCreatedMs
      });
      try {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (error) {
        // Held, not swallowed. The catch exists so the failure stamp below still
        // lands; the error is re-thrown after it, because a Stripe outage is a
        // transient failure and processStripeEvent files anything that RETURNS
        // as processed-with-a-processedAt. That stamp is what the dedupe keys
        // on, so returning here would tell Stripe the event was consumed AND
        // refuse the redelivery that would have applied it — the past_due
        // transition would be lost for good on that event id.
        retrieveError = error;
        console.warn("Could not retrieve failed invoice subscription:", error?.message || error);
      }
    }

    const metadata = invoice.metadata || subscription?.metadata || {};
    const workspace = baseline ? baseline.workspace : await workspaceRefFromStripeRefs({
      workspaceId: metadata.workspaceId,
      subscriptionId,
      customerId: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id
    });
    if (!workspace) {
      // Same rule: a Stripe outage must not be filed as a permanent
      // "no such workspace" verdict on an event that is never redelivered.
      if (retrieveError) throw retrieveError;
      return { skipped: true, reason: "workspace_not_found" };
    }

    let resolution = null;
    if (subscription) {
      resolution = await applySubscription(subscription, "invoice.payment_failed", eventCreatedMs, {
        stripe, subscriptionIsCanonical: true, baseline
      });
      // Invariant: after a stale decision NOTHING mutates, and that includes the
      // failure stamp below. This rail is the only caller that writes the
      // workspace unconditionally rather than behind `result.updated`, so it is
      // the only one that needs the decision spelled out. Returning the skip
      // verbatim is also what keeps the stripeBillingEvents row truthful: a
      // handler that had applied nothing used to file itself as
      // `updated: true, status: "past_due"`.
      if (resolution && resolution.skipped === true && resolution.reason === "stale_subscription_event") {
        return {
          skipped: true,
          reason: "stale_subscription_event",
          workspaceId: workspace.id,
          eventSequence: resolution.eventSequence,
          appliedEventSequence: resolution.appliedEventSequence
        };
      }
    }

    await workspace.ref.set({
      billingLastInvoiceId: invoice.id || "",
      billingPaymentFailedAt: admin.firestore.FieldValue.serverTimestamp(),
      billingExportAccessPreserved: true,
      billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      billingUpdatedBy: "stripe_webhook"
    }, { merge: true });

    // The stamp has landed, so the transient failure can now be surfaced. This
    // is the same shape as invoice.paid, which never caught the retrieve at all:
    // the webhook answers 500, the stripeBillingEvents row stays "received" with
    // no processedAt, and Stripe's redelivery is let through by the dedupe.
    if (retrieveError) throw retrieveError;

    // `status` is a claim about what this handler DID, and processStripeEvent
    // persists it verbatim into the stripeBillingEvents row alongside
    // processingStatus "processed". Nothing on this path writes billingStatus
    // itself: past_due only lands via applySubscription, which needs both an id
    // and a subscription the retrieve actually returned. The retrieve is
    // caught-and-warned on purpose (the failure stamp must land either way), so
    // reporting "past_due" unconditionally described a transition that had not
    // happened — the same shape of untrue-on-its-face record as the drift above.
    const entitlementResolutionApplied = Boolean(resolution?.updated);
    const notAppliedReason = entitlementResolutionApplied
      ? ""
      : !subscriptionId
        ? "invoice_without_subscription"
        : !subscription
          ? "subscription_retrieve_failed"
          : String(resolution?.reason || "subscription_not_applied");
    return {
      updated: true,
      workspaceId: workspace.id,
      status: entitlementResolutionApplied ? "past_due" : "payment_failed_not_applied",
      entitlementResolutionApplied,
      ...(notAppliedReason ? { entitlementResolutionSkippedReason: notAppliedReason } : {})
    };
  }

  async function processStripeEvent(stripe, event) {
    const eventRef = admin.firestore().collection("stripeBillingEvents").doc(event.id);
    const existing = await eventRef.get();
    if (existing.exists && existing.data()?.processedAt) {
      return { duplicate: true };
    }

    await eventRef.set({
      ...eventSummary(event),
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      processingStatus: "received"
    }, { merge: true });

    // The rail check, BEFORE any applier and before any Stripe call. An event
    // refused here is filed as refused and processed, so Stripe stops retrying
    // something this endpoint will never accept — and, more to the point, no
    // plan, entitlement, trial stamp or ledger row is touched on the way past.
    //
    // expectLivemode comes from the key this deployment actually runs on, not
    // from a flag: the key is what decides which Stripe environment these ids
    // belong to.
    const admissible = eventBoundary.platformEventAdmissible(event, {
      expectLivemode: String(configStatus().secretKey || "").startsWith("sk_live_")
    });
    if (!admissible.admissible) {
      const refused = { skipped: true, reason: admissible.reason, rail: "subscription", refused: true };
      await eventRef.set({
        processingStatus: "refused",
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        connectedAccountId: String(event.account || ""),
        result: refused
      }, { merge: true });
      return refused;
    }

    let result = { skipped: true, reason: "unhandled_event" };
    const object = event.data?.object || {};
    // Every rail below can write the subscription ledger row, so every rail
    // gets the event time. Passing it only to customer.subscription.* left the
    // rows written by the other three carrying no stripeEventSequence at all,
    // and writeStripeSubscriptionLedger's ordering guard needs `seen > 0` to
    // fire — so a renewal recorded by invoice.paid could be rolled back by an
    // older customer.subscription.updated with no warning logged.
    const eventCreatedMs = Number(event.created || 0) * 1000;

    if (event.type === "checkout.session.completed") {
      result = await applyCompletedSubscriptionCheckout(stripe, object, eventCreatedMs);
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      // The only rail handed a raw webhook body. `stripe` tells applySubscription
      // to re-read the subscription from Stripe and apply THAT, so the body is
      // used to identify the subscription and never to describe it. The other
      // three rails retrieved it themselves a frame ago and must not pay for a
      // second call.
      result = await applySubscription(object, event.type, eventCreatedMs, { stripe });
    } else if (event.type === "invoice.paid") {
      result = await applyInvoicePaid(stripe, object, eventCreatedMs);
    } else if (event.type === "invoice.payment_failed") {
      result = await applyInvoicePaymentFailed(stripe, object, eventCreatedMs);
    }

    await eventRef.set({
      processingStatus: result.skipped ? "skipped" : "processed",
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      result
    }, { merge: true });

    return result;
  }

  const resyncStripeWorkspaceEntitlements = onCall({ region: STRIPE_BILLING_REGION, secrets: [STRIPE_SECRET_KEY] }, async (request) => {
    const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
    ownerOrAdminRole(companyData, uid);

    const config = configStatus();
    if (!config.configured) {
      return { ok: true, configured: false, message: config.message };
    }

    // Refresh only verifies an existing server-owned Stripe customer/subscription
    // and cannot create checkout sessions or accept a client-provided plan.
    // Therefore it is safe for any workspace Owner, including review/demo owners,
    // while test checkout and billing portal actions remain allowlisted below.
    const customerId = String(companyData.billingCustomerId || companyData.billingStripeCustomerId || "").trim();
    if (!customerId) {
      // No Stripe customer means there cannot be any active add-on subscriptions.
      // Clear any stale seat/storage add-on fields so a leftover record cannot keep
      // inflating the effective allowance.
      const seatStatus = String(companyData.billingAdditionalTeamSeatStatus || "").trim().toLowerCase();
      const storageStatus = String(companyData.billingStorageAddonStatus || "").trim().toLowerCase();
      const reconcilePlanKey = String(companyData.billingPlan || "demo").trim();
      const reconcileEntitlements = PLAN_ENTITLEMENTS[reconcilePlanKey] || PLAN_ENTITLEMENTS.demo;
      // Without a Stripe customer there cannot be any purchased seats, so the
      // effective seat limit must equal the base plan allowance.
      const seatLimitInflated = Number(companyData.billingTeamMemberLimit || 0) > Number(reconcileEntitlements.teamMemberLimit || 0);
      const staleSeat = ["active", "trialing", "past_due"].includes(seatStatus)
        || Number(companyData.billingAdditionalTeamSeatQuantity || 0) > 0
        || seatLimitInflated;
      const staleStorage = ["active", "trialing", "past_due"].includes(storageStatus) || Number(companyData.billingStorageAddonMB || 0) > 0;
      if (staleSeat || staleStorage) {
        await companyRef.set({
          billingAdditionalTeamSeatQuantity: 0,
          billingAdditionalTeamSeatKey: "",
          billingAdditionalTeamSeatStatus: "cancelled",
          billingAdditionalTeamSeatSubscriptionId: "",
          billingTeamMemberLimit: reconcileEntitlements.teamMemberLimit,
          billingStorageAddonMB: 0,
          billingStorageAddonKey: "",
          billingStorageAddonStatus: "cancelled",
          billingStorageAddonSubscriptionId: "",
          billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          billingUpdatedBy: "stripe_resync_reconcile",
          billingExportAccessPreserved: true
        }, { merge: true });
      }
      return {
        ok: true,
        configured: true,
        resynced: staleSeat || staleStorage,
        message: staleSeat || staleStorage
          ? "Cleared stale add-on records. Your allowance has been refreshed."
          : "No verified Stripe customer is connected to this workspace yet."
      };
    }

    // Prevent an owner or a duplicated client request from repeatedly causing
    // provider reads and entitlement writes in a short interval.
    const nowMs = Date.now();
    await admin.firestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(companyRef);
      const lastRequestedAt = snapshot.data()?.billingLastEntitlementResyncRequestedAt;
      const lastRequestedMs = lastRequestedAt && typeof lastRequestedAt.toMillis === "function"
        ? lastRequestedAt.toMillis()
        : 0;
      if (lastRequestedMs > 0 && nowMs - lastRequestedMs < 60 * 1000) {
        throw new HttpsError(
          "resource-exhausted",
          "Subscription access was recently refreshed. Please wait one minute before trying again."
        );
      }

      transaction.set(companyRef, {
        billingLastEntitlementResyncRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
        billingLastEntitlementResyncRequestedBy: uid,
        billingLastEntitlementResyncProvider: "stripe"
      }, { merge: true });
    });

    const stripe = stripeClient(config.secretKey);

    // The generation of every Stripe row, read BEFORE the list call below and
    // BEFORE any of it is applied. Each row's apply and the closing reconcile
    // compare against this: a row somebody applied after this read — a webhook
    // that cancelled, or granted, while the list was in flight — is newer than
    // the list, and the list must not be written over it. Rows the list does
    // not name are only ever touched if they still carry this generation.
    const baselineRows = await companyRef.collection("subscriptions").where("provider", "==", "stripe").get();
    const baselineGenerations = new Map(baselineRows.docs.map((doc) => [doc.id, stripeApplyGenerationOf(doc.data() || {})]));

    const foundSubscriptionIds = new Set();
    let foundSubscriptionCount = 0;
    let recognisedSubscriptionCount = 0;
    let startingAfter = null;

    // Read all subscription states from Stripe. The client cannot provide a plan,
    // status, subscription ID or entitlement value to this operation.
    do {
      const listParams = {
        customer: customerId,
        status: "all",
        limit: 100
      };
      if (startingAfter) listParams.starting_after = startingAfter;

      const page = await stripe.subscriptions.list(listParams);
      for (const subscription of page.data || []) {
        const subscriptionId = String(subscription?.id || "").trim();
        if (!subscriptionId) continue;

        foundSubscriptionCount += 1;
        foundSubscriptionIds.add(subscriptionId);

        const item = itemFromMetadataOrSubscription(subscription.metadata || {}, subscription);
        if (!item) continue;

        recognisedSubscriptionCount += 1;
        // The list entry is a fresh read and is applied as such; `stripe` is
        // for the conflict re-read only. A row created after the baseline
        // (a re-subscribe under a new id) is expected at generation 0, exactly
        // as an absent row reads, so a legitimate new subscription applies.
        await applySubscription(subscription, "manual.owner_resync", 0, {
          stripe,
          subscriptionIsCanonical: true,
          expectedGeneration: baselineGenerations.has(stripeSubscriptionLedgerId(subscriptionId))
            ? baselineGenerations.get(stripeSubscriptionLedgerId(subscriptionId))
            : 0
        });
      }

      if (!page.has_more || !(page.data || []).length) {
        startingAfter = null;
      } else {
        startingAfter = page.data[page.data.length - 1].id;
      }
    } while (startingAfter);

    // The closing reconcile — deactivate Stripe rows the list no longer names,
    // clear add-on fields no active row backs, resolve the plan — used to work
    // from the list itself and from three separate writes, so a webhook that
    // granted or cancelled an add-on while the list was in flight was undone
    // by it. It now reads the rows as they stand at this moment, in one
    // transaction, and touches an unlisted row only if nothing has applied it
    // since the baseline above: "Stripe no longer lists it" is a claim about
    // the list's snapshot, and it is not made about a row that is newer.
    const closing = await admin.firestore().runTransaction(async (transaction) => {
      const rowsSnap = await transaction.get(companyRef.collection("subscriptions"));
      const companySnap = await transaction.get(companyRef);
      const currentData = companySnap.exists ? companySnap.data() || {} : {};

      let staleRecordsDeactivated = 0;
      const rows = [];
      for (const doc of rowsSnap.docs) {
        const data = { id: doc.id, ...(doc.data() || {}) };
        const externalSubscriptionId = String(data.externalSubscriptionId || "").trim();
        const unlisted = data.provider === "stripe" && externalSubscriptionId && !foundSubscriptionIds.has(externalSubscriptionId);
        const untouchedSinceBaseline = baselineGenerations.has(doc.id) && baselineGenerations.get(doc.id) === stripeApplyGenerationOf(data);
        if (!unlisted || !untouchedSinceBaseline) {
          rows.push(data);
          continue;
        }
        if (data.activeForEntitlement === true) staleRecordsDeactivated += 1;
        const deactivated = {
          activeForEntitlement: false,
          autoRenew: false,
          providerStatus: "not_found_during_resync",
          lastProviderEventType: "manual.owner_resync_missing_at_provider",
          stripeApplyGeneration: stripeApplyGenerationOf(data) + 1
        };
        transaction.set(doc.ref, {
          ...deactivated,
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        rows.push({ ...data, ...deactivated });
      }

      // Reconcile the add-on fields against the rows. If no active seat/storage
      // add-on row remains, clear any stale add-on fields so the resolve below
      // does not keep inflating the effective allowance.
      const activeAddonRow = (type) => rows.some((row) => (
        row.provider === "stripe" && row.subscriptionType === type && row.activeForEntitlement === true
      ));
      const addonReconcile = {};
      if (!activeAddonRow("team_seat_addon")) {
        addonReconcile.billingAdditionalTeamSeatQuantity = 0;
        addonReconcile.billingAdditionalTeamSeatKey = "";
        addonReconcile.billingAdditionalTeamSeatStatus = "cancelled";
        addonReconcile.billingAdditionalTeamSeatSubscriptionId = "";
        // Reset the effective seat limit to the base plan allowance (no purchased seats).
        const reconcilePlanKey = String(currentData.billingPlan || "demo").trim();
        const reconcileEntitlements = PLAN_ENTITLEMENTS[reconcilePlanKey] || PLAN_ENTITLEMENTS.demo;
        addonReconcile.billingTeamMemberLimit = reconcileEntitlements.teamMemberLimit;
      }
      if (!activeAddonRow("storage_addon")) {
        addonReconcile.billingStorageAddonMB = 0;
        addonReconcile.billingStorageAddonKey = "";
        addonReconcile.billingStorageAddonStatus = "cancelled";
        addonReconcile.billingStorageAddonSubscriptionId = "";
      }
      if (Object.keys(addonReconcile).length) {
        addonReconcile.billingUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
        addonReconcile.billingUpdatedBy = "stripe_resync_reconcile";
        addonReconcile.billingExportAccessPreserved = true;
      }

      const { payload, result: resolution } = resolveWorkspaceEntitlement({ rows, currentData }, {
        triggerEventType: "manual.owner_resync_completed",
        triggerProviderStatus: "verified",
        triggerCustomerId: customerId
      });

      // In the order the three writes used to land, so a later field wins.
      transaction.set(companyRef, {
        ...addonReconcile,
        ...payload,
        billingLastEntitlementResyncCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
        billingLastEntitlementResyncCompletedBy: uid,
        billingLastEntitlementResyncFoundSubscriptions: foundSubscriptionCount,
        billingLastEntitlementResyncRecognisedSubscriptions: recognisedSubscriptionCount,
        billingLastEntitlementResyncStaleRecordsDeactivated: staleRecordsDeactivated,
        billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        billingUpdatedBy: "stripe_owner_resync"
      }, { merge: true });

      return { staleRecordsDeactivated, resolution };
    });
    const { staleRecordsDeactivated, resolution } = closing;

    return {
      ok: true,
      configured: true,
      resynced: true,
      workspaceId: companyId,
      foundSubscriptionCount,
      recognisedSubscriptionCount,
      staleRecordsDeactivated,
      effectivePlan: resolution.plan,
      effectiveProvider: resolution.provider,
      activePlanSubscriptionCount: resolution.activePlanSubscriptionCount,
      hasMultipleActiveSubscriptions: resolution.hasMultipleActiveSubscriptions
    };
  });

  // Four rails sell the same plan, and none of them can see the other three at
  // the till. Shopify has always refused to sell to a workspace paying
  // elsewhere; nothing stopped the other direction, so an owner paying Stripe
  // for Pro could open the iOS app, tap Team, and pay twice for one workspace.
  // The resolver would notice - it records billingHasMultipleActiveSubscriptions
  // and picks the higher tier - but noticing a double charge is not preventing
  // one. Returns the provider already billing them, or "" when the till is free.
  //
  // Add-ons are deliberately not covered: seats and storage are sold through
  // Stripe whatever rail the plan came from, and blocking those would break a
  // flow that works today.
  const LIVE_BILLING_STATUSES = ["active", "trialing", "past_due"];
  function workspacePlanBilledByOtherProvider(companyData = {}, targetProvider = "") {
    const plan = String(companyData.billingPlan || "").trim().toLowerCase();
    if (!plan || plan === "demo") return "";

    const status = String(companyData.billingEffectiveStatus || companyData.billingStatus || "").trim().toLowerCase();
    if (!LIVE_BILLING_STATUSES.includes(status)) return "";

    const provider = String(
      companyData.billingEffectiveProvider
      || companyData.billingProvider
      || companyData.billingPlanSource
      || ""
    ).trim().toLowerCase();
    // A manual or complimentary grant is not a till anyone can be charged at,
    // so it must not block a workspace from actually buying a plan.
    if (!provider || ["none", "manual", "manual_workspace", "comp_review", "signup_trial", "entitlement_resolver"].includes(provider)) return "";

    return provider === String(targetProvider || "").trim().toLowerCase() ? "" : provider;
  }

  const BILLED_ELSEWHERE_MESSAGE = {
    stripe: "This workspace already pays for its plan by card. Change or cancel that subscription first, then come back.",
    apple: "This workspace already pays for its plan through the App Store. Change or cancel it in your Apple subscriptions first, then come back.",
    google: "This workspace already pays for its plan through Google Play. Change or cancel it in your Play subscriptions first, then come back.",
    shopify: "This workspace already pays for its plan through Shopify. Change or cancel it in your Shopify admin first, then come back."
  };
  function refuseSecondTill(companyData, targetProvider) {
    const other = workspacePlanBilledByOtherProvider(companyData, targetProvider);
    if (!other) return;
    throw new HttpsError(
      "failed-precondition",
      BILLED_ELSEWHERE_MESSAGE[other] || "This workspace already pays for its plan somewhere else. Change or cancel that subscription first, then come back."
    );
  }

  const createStripeCheckoutSession = onCall({ region: STRIPE_BILLING_REGION, secrets: [STRIPE_SECRET_KEY] }, async (request) => {
    const item = billingItemFromRequest(request);
    const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
    const role = ownerOrAdminRole(companyData, uid);
    const config = configStatus(item);
    if (!config.configured) {
      return { ok: true, configured: false, message: config.message };
    }
    requireBillingEnvironmentAccess(request, config);
    if (item.type === "plan") {
      refuseSecondTill(companyData, "stripe");
    }

    // Additional team seats: only on the Team plan, single subscription slot,
    // quantity 1..5 (Team includes 5, self-service cap is 10 total).
    let seatQuantity = 1;
    if (item.type === "team_seat_addon") {
      const onTeamPlan = String(companyData.billingPlan || "").trim() === "team_monthly"
        || String(companyData.billingEffectivePlan || "").trim() === "team_monthly";
      if (!onTeamPlan) {
        return { ok: true, configured: false, message: "Additional seats are available on the Team plan." };
      }
      const existingSeatStatus = String(companyData.billingAdditionalTeamSeatStatus || "").trim().toLowerCase();
      const hasActiveSeatAddon = ["active", "trialing", "past_due"].includes(existingSeatStatus)
        && String(companyData.billingAdditionalTeamSeatSubscriptionId || "").trim();
      if (hasActiveSeatAddon) {
        return { ok: true, configured: false, message: "You already have additional seats. Use Manage billing to change or cancel them." };
      }
      const requested = Math.floor(Number(request.data?.quantity || 1));
      seatQuantity = Math.min(5, Math.max(1, Number.isFinite(requested) ? requested : 1));
    }

    const stripe = stripeClient(config.secretKey);
    const customerId = await getOrCreateCustomer(stripe, companyRef, companyData, companyId, uid);
    const metadata = {
      workspaceId: companyId,
      ownerUid: String(companyData.ownerUid || uid),
      requestedByUid: uid,
      requestedByRole: role,
      billingSource: "stripe",
      billingEnvironment: config.secretKey.startsWith("sk_live_") ? "live" : "test",
      billingInterval: item.interval || "",
      studioFlowBillingKey: item.key,
      plan: item.plan || "",
      addonKey: item.type !== "plan" ? item.key : ""
    };

    const sessionPayload = {
      mode: item.mode,
      customer: customerId,
      client_reference_id: companyId,
      line_items: [{ price: config.priceId, quantity: item.type === "team_seat_addon" ? seatQuantity : 1 }],
      success_url: safeAbsoluteUrl(request.data?.successUrl, "/plan?billing=success"),
      cancel_url: safeAbsoluteUrl(request.data?.cancelUrl, "/pricing?billing=cancelled"),
      allow_promotion_codes: true,
      metadata
    };

    if (item.mode === "subscription") {
      sessionPayload.subscription_data = { metadata };
      // Every paid plan is sold with a 14-day trial, but only once per workspace:
      // without this guard a workspace could cancel and re-subscribe for a fresh
      // free fortnight every time. Add-ons (storage, seats) never carry a trial.
      const hasUsedTrial = Boolean(companyData.billingTrialUsedAt)
        || Boolean(String(companyData.billingSubscriptionId || "").trim());
      if (item.type === "plan" && !hasUsedTrial) {
        sessionPayload.subscription_data.trial_period_days = 14;
        // No card to start the trial. We can afford that because Free is a
        // permanent tier: a trial nobody pays for has somewhere safe to land,
        // so the subscription simply cancels and the workspace drops back to
        // Free with its data intact — the same path an ordinary cancellation
        // already takes. Stripe requires an explicit end_behavior whenever
        // payment_method_collection is "if_required".
        sessionPayload.payment_method_collection = "if_required";
        sessionPayload.subscription_data.trial_settings = {
          end_behavior: { missing_payment_method: "cancel" }
        };
      }
    } else {
      sessionPayload.payment_intent_data = { metadata };
    }

    const session = await stripe.checkout.sessions.create(sessionPayload);
    // The once-per-workspace trial stamp is written when the checkout
    // COMPLETES (applyCompletedSubscriptionCheckout), not here: opening the
    // payment page and closing it must not burn the free fortnight.
    await companyRef.collection("billing").doc("stripePendingCheckout").set({
      sessionId: session.id,
      itemKey: item.key,
      mode: item.mode,
      requestedByUid: uid,
      requestedByRole: role,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return {
      ok: true,
      configured: true,
      url: session.url || "",
      sessionId: session.id,
      mode: item.mode,
      itemKey: item.key
    };
  });

  const createStripeCustomerPortalSession = onCall({ region: STRIPE_BILLING_REGION, secrets: [STRIPE_SECRET_KEY] }, async (request) => {
    const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
    ownerOrAdminRole(companyData, uid);
    const config = configStatus();
    if (!config.configured) {
      return { ok: true, configured: false, message: config.message };
    }
    requireBillingEnvironmentAccess(request, config);

    const customerId = String(companyData.billingCustomerId || companyData.billingStripeCustomerId || "").trim();
    if (!customerId) {
      return { ok: true, configured: false, message: "No Stripe customer is connected to this workspace yet." };
    }

    const stripe = stripeClient(config.secretKey);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: safeAbsoluteUrl(request.data?.returnUrl, "/plan")
    });

    return {
      ok: true,
      configured: true,
      url: session.url || "",
      workspaceId: companyId
    };
  });

  const prepareAppleSubscriptionPurchase = onCall({ region: APPLE_BILLING_REGION }, async (request) => {
    const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
    ownerOrAdminRole(companyData, uid);
    // The same token mints a plan and a storage add-on, so the guard has to be
    // told which one this is. Add-ons are sold on every rail and must keep
    // working; an app version too old to say what it is buying is left alone
    // rather than blocked, which is the state it was already in.
    if (String(request.data?.purpose || "").trim() === "plan") {
      refuseSecondTill(companyData, "apple");
    }
    let appAccountToken = String(companyData.billingAppleAppAccountToken || "").trim();
    if (!appAccountToken) {
      appAccountToken = crypto.randomUUID();
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      await companyRef.set({
        billingAppleAppAccountToken: appAccountToken,
        billingAppleTokenCreatedAt: timestamp,
        billingUpdatedAt: timestamp
      }, { merge: true });
      await admin.firestore().collection("appleBillingAccounts").doc(appAccountToken).set({
        workspaceId: companyId,
        ownerUid: uid,
        createdAt: timestamp,
        updatedAt: timestamp
      }, { merge: true });
    }
    return { ok: true, workspaceId: companyId, appAccountToken };
  });

  const verifyAppleSubscriptionPurchase = onCall({ region: APPLE_BILLING_REGION, secrets: [APPLE_ROOT_CA_CERTS_PEM] }, async (request) => {
    const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
    ownerOrAdminRole(companyData, uid);
    const signedTransactionInfo = String(request.data?.signedTransactionInfo || "").trim();
    const verified = await verifyAppleSignedData("transaction", signedTransactionInfo);
    const transaction = verified.decoded || {};
    const expectedToken = String(companyData.billingAppleAppAccountToken || "").trim();
    const transactionToken = String(transaction.appAccountToken || "").trim();
    if (!expectedToken || transactionToken !== expectedToken) {
      throw new HttpsError("permission-denied", "This App Store purchase is not linked to the current NivaDesk workspace.");
    }
    if (String(transaction.bundleId || "").trim() !== appleBundleId()) {
      throw new HttpsError("permission-denied", "Apple purchase app identifier does not match NivaDesk.");
    }
    const result = await persistApplePurchase({ id: companyId, ref: companyRef }, transaction, {
      environmentName: verified.environmentName,
      eventType: "client.verified_purchase"
    });
    return {
      ok: true,
      workspaceId: companyId,
      plan: result.plan || null,
      addon: result.addon || null,
      provider: "apple",
      productId: String(transaction.productId || ""),
      currentPeriodEnd: Number(transaction.expiresDate || 0) || null
    };
  });

  const appleAppStoreServerNotification = onRequest({ region: APPLE_BILLING_REGION, secrets: [APPLE_ROOT_CA_CERTS_PEM] }, async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method not allowed");
      return;
    }
    try {
      const signedPayload = String(request.body?.signedPayload || "").trim();
      const verifiedNotification = await verifyAppleSignedData("notification", signedPayload);
      const notification = verifiedNotification.decoded || {};
      if (String(notification.notificationType || "") === "TEST") {
        response.status(200).json({ received: true, test: true });
        return;
      }
      const signedTransactionInfo = String(notification.data?.signedTransactionInfo || "").trim();
      if (!signedTransactionInfo) {
        response.status(200).json({ received: true, skipped: "no_transaction" });
        return;
      }
      const transactionVerified = await verifyAppleSignedData("transaction", signedTransactionInfo);
      const transaction = transactionVerified.decoded || {};
      const appAccountToken = String(transaction.appAccountToken || "").trim();
      if (!appAccountToken) {
        response.status(200).json({ received: true, skipped: "no_account_token" });
        return;
      }
      const mapping = await admin.firestore().collection("appleBillingAccounts").doc(appAccountToken).get();
      const workspaceId = String(mapping.data()?.workspaceId || "").trim();
      if (!workspaceId) {
        response.status(200).json({ received: true, skipped: "unknown_account_token" });
        return;
      }
      const companyRef = admin.firestore().collection("companies").doc(workspaceId);
      const companySnap = await companyRef.get();
      if (!companySnap.exists || String(companySnap.data()?.billingAppleAppAccountToken || "").trim() !== appAccountToken) {
        response.status(200).json({ received: true, skipped: "workspace_token_mismatch" });
        return;
      }
      await persistApplePurchase({ id: workspaceId, ref: companyRef }, transaction, {
        environmentName: transactionVerified.environmentName,
        eventType: `notification.${String(notification.notificationType || "unknown")}`,
        notificationStatus: notification.data?.status,
        // Apple stamps every notification with the moment it signed it. That is
        // the only value here that reliably increases from one delivery to the
        // next — the transaction's own dates do not, so a REFUND followed by a
        // late DID_RENEW would look newer by expiry date and win.
        eventSequenceMs: Number(notification.signedDate || 0) || 0
      });
      response.status(200).json({ received: true, processed: true });
    } catch (error) {
      console.error("Apple App Store notification processing failed:", error?.message || error);
      response.status(400).json({ received: false, error: "verification_failed" });
    }
  });

  const stripeWebhook = onRequest({ region: STRIPE_BILLING_REGION, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] }, async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method not allowed");
      return;
    }

    const config = configStatus(null, { requireWebhook: true });
    if (!config.configured) {
      response.status(503).json({ ok: false, configured: false, message: config.message });
      return;
    }

    const signature = request.headers["stripe-signature"];
    if (!signature) {
      response.status(400).send("Missing Stripe signature");
      return;
    }

    const stripe = stripeClient(config.secretKey);
    let event;
    try {
      event = stripe.webhooks.constructEvent(request.rawBody, signature, config.webhookSecret);
    } catch (error) {
      response.status(400).send("Webhook signature verification failed.");
      return;
    }

    try {
      const result = await processStripeEvent(stripe, event);
      response.json({ received: true, result });
    } catch (error) {
      console.error("Stripe webhook processing failed:", error?.message || error);
      response.status(500).json({ received: true, error: "processing_failed" });
    }
  });

  // ---------------------------------------------------------------------------
  // Google Play Billing (provider-neutral mirror of the Apple StoreKit flow).
  // Inert until a Google Play service account secret is configured, exactly like
  // the Apple flow stayed inert until APPLE_ROOT_CA_CERTS_PEM was added.
  // ---------------------------------------------------------------------------
  const GOOGLE_BILLING_REGION = STRIPE_BILLING_REGION;

  function googlePackageName() {
    return String(process.env.GOOGLE_PLAY_PACKAGE_NAME || "uk.co.eggcraft.studioflow").trim();
  }

  function googlePlayServiceAccount() {
    const raw = secretValue(GOOGLE_PLAY_SERVICE_ACCOUNT, "GOOGLE_PLAY_SERVICE_ACCOUNT");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function googlePlayBillingEnabled() {
    return String(process.env.GOOGLE_PLAY_BILLING_ENABLED || "").trim().toLowerCase() === "true";
  }

  function googlePlayConfigStatus() {
    const credentials = googlePlayServiceAccount();
    if (credentials && credentials.client_email && credentials.private_key) {
      return { configured: true, credentials, packageName: googlePackageName() };
    }
    // Keyless mode: when no service-account JSON is provided but billing is
    // explicitly enabled, authenticate with Application Default Credentials
    // (the function's runtime service account). This avoids downloading a
    // service-account key, which an org policy may block.
    if (googlePlayBillingEnabled()) {
      return { configured: true, credentials: null, packageName: googlePackageName() };
    }
    return { configured: false, message: "Google Play billing setup coming soon." };
  }

  function googleLedgerId(purchaseToken) {
    const hash = crypto.createHash("sha256").update(String(purchaseToken || "")).digest("hex");
    return `google_${hash.slice(0, 48)}`;
  }

  function googleItemForProduct(productId, basePlanId) {
    const composite = `${String(productId || "").trim()}|${String(basePlanId || "").trim()}`;
    const key = GOOGLE_PLAY_PRODUCTS[composite] || GOOGLE_PLAY_PRODUCTS[String(productId || "").trim()];
    return key ? STRIPE_BILLING_ITEMS[key] || null : null;
  }

  function androidPublisherClient(credentials) {
    const { google } = require("googleapis");
    const auth = new google.auth.GoogleAuth({
      // When credentials are omitted, GoogleAuth falls back to Application
      // Default Credentials (the function's runtime service account).
      ...(credentials ? { credentials } : {}),
      scopes: ["https://www.googleapis.com/auth/androidpublisher"]
    });
    return google.androidpublisher({ version: "v3", auth });
  }

  // Calls the Google Play Developer API and returns a normalized purchase record.
  async function fetchGooglePlaySubscription(productId, purchaseToken) {
    const config = googlePlayConfigStatus();
    if (!config.configured) {
      throw new HttpsError("failed-precondition", config.message);
    }
    const publisher = androidPublisherClient(config.credentials);
    const { data } = await publisher.purchases.subscriptionsv2.get({
      packageName: config.packageName,
      token: purchaseToken
    });

    const lineItems = Array.isArray(data?.lineItems) ? data.lineItems : [];
    const lineItem = lineItems.find((entry) => String(entry?.productId || "").trim() === String(productId || "").trim())
      || lineItems[0]
      || {};
    const state = String(data?.subscriptionState || "").trim();
    const expiryMillis = lineItem?.expiryTime ? Date.parse(lineItem.expiryTime) : 0;

    return {
      productId: String(lineItem?.productId || productId || "").trim(),
      basePlanId: String(lineItem?.offerDetails?.basePlanId || "").trim(),
      purchaseToken: String(purchaseToken || "").trim(),
      orderId: String(data?.latestOrderId || "").trim(),
      obfuscatedAccountId: String(data?.externalAccountIdentifiers?.obfuscatedExternalAccountId || "").trim(),
      state,
      expiryMillis: Number.isFinite(expiryMillis) ? expiryMillis : 0,
      autoRenewing: lineItem?.autoRenewingPlan?.autoRenewEnabled === true,
      linkedPurchaseToken: String(data?.linkedPurchaseToken || "").trim()
    };
  }

  function googleProviderStatusFor(state, activeForEntitlement) {
    switch (String(state || "").trim()) {
      case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD": return "grace_period";
      case "SUBSCRIPTION_STATE_ON_HOLD": return "on_hold";
      case "SUBSCRIPTION_STATE_PAUSED": return "paused";
      case "SUBSCRIPTION_STATE_EXPIRED": return "expired";
      case "SUBSCRIPTION_STATE_PENDING": return "pending";
      case "SUBSCRIPTION_STATE_CANCELED": return activeForEntitlement ? "cancelled_active" : "cancelled";
      default: return activeForEntitlement ? "active" : "expired";
    }
  }

  async function persistGooglePlanSubscription(workspace, purchase, {
    eventType = "client.verify"
  } = {}) {
    const item = googleItemForProduct(purchase?.productId, purchase?.basePlanId);
    const purchaseToken = String(purchase?.purchaseToken || "").trim();
    if (!item || item.type !== "plan" || !purchaseToken) {
      throw new HttpsError("failed-precondition", "This Google Play purchase is not a supported NivaDesk subscription.");
    }

    const inactiveStates = [
      "SUBSCRIPTION_STATE_EXPIRED",
      "SUBSCRIPTION_STATE_ON_HOLD",
      "SUBSCRIPTION_STATE_PAUSED",
      "SUBSCRIPTION_STATE_PENDING"
    ];
    const activeByDate = Number(purchase?.expiryMillis || 0) > Date.now();
    const activeForEntitlement = activeByDate && !inactiveStates.includes(String(purchase?.state || "").trim());
    const providerStatus = googleProviderStatusFor(purchase?.state, activeForEntitlement);

    const ledgerRef = workspace.ref.collection("subscriptions").doc(googleLedgerId(purchaseToken));
    const existing = await ledgerRef.get();

    await ledgerRef.set({
      provider: "google",
      subscriptionType: "plan",
      planTier: planTierForItem(item),
      internalPlanKey: item.plan || "",
      itemKey: item.key,
      interval: item.interval || "",
      purchaseToken,
      purchaseTokenHash: crypto.createHash("sha256").update(purchaseToken).digest("hex"),
      latestOrderId: String(purchase?.orderId || ""),
      externalSubscriptionId: purchaseToken,
      linkedPurchaseToken: String(purchase?.linkedPurchaseToken || ""),
      workspaceId: workspace.id,
      obfuscatedAccountId: String(purchase?.obfuscatedAccountId || ""),
      productId: String(purchase?.productId || ""),
      basePlanId: String(purchase?.basePlanId || ""),
      providerStatus,
      activeForEntitlement,
      autoRenew: activeForEntitlement && purchase?.autoRenewing === true,
      currentPeriodEnd: timestampFromAppleMillis(purchase?.expiryMillis),
      environment: "production",
      lastProviderEventType: String(eventType || ""),
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() })
    }, { merge: true });

    return recomputeEffectiveWorkspaceEntitlement(workspace, {
      triggerEventType: String(eventType || "google.verify"),
      triggerProviderStatus: providerStatus
    });
  }

  // Google Play storage add-on. Unlike a plan, this does not change the
  // effective plan tier; it writes the additive billingStorageAddon* fields
  // (the same schema the Stripe storage handler uses), which
  // planLimitsFromEntitlements sums onto the base plan allowance.
  async function persistGoogleStorageAddon(workspace, purchase, {
    eventType = "client.verify"
  } = {}) {
    const item = googleItemForProduct(purchase?.productId, purchase?.basePlanId);
    const purchaseToken = String(purchase?.purchaseToken || "").trim();
    if (!item || item.type !== "storage_addon" || !purchaseToken) {
      throw new HttpsError("failed-precondition", "This Google Play purchase is not a supported NivaDesk storage add-on.");
    }

    const inactiveStates = [
      "SUBSCRIPTION_STATE_EXPIRED",
      "SUBSCRIPTION_STATE_ON_HOLD",
      "SUBSCRIPTION_STATE_PAUSED",
      "SUBSCRIPTION_STATE_PENDING"
    ];
    const activeByDate = Number(purchase?.expiryMillis || 0) > Date.now();
    const addonActive = activeByDate && !inactiveStates.includes(String(purchase?.state || "").trim());
    const providerStatus = googleProviderStatusFor(purchase?.state, addonActive);

    const ledgerRef = workspace.ref.collection("subscriptions").doc(googleLedgerId(purchaseToken));
    const existing = await ledgerRef.get();
    await ledgerRef.set({
      provider: "google",
      subscriptionType: "storage_addon",
      itemKey: item.key,
      interval: item.interval || "",
      storageAddonMB: item.storageAddonMB || 0,
      purchaseToken,
      purchaseTokenHash: crypto.createHash("sha256").update(purchaseToken).digest("hex"),
      externalSubscriptionId: purchaseToken,
      linkedPurchaseToken: String(purchase?.linkedPurchaseToken || ""),
      workspaceId: workspace.id,
      obfuscatedAccountId: String(purchase?.obfuscatedAccountId || ""),
      productId: String(purchase?.productId || ""),
      basePlanId: String(purchase?.basePlanId || ""),
      providerStatus,
      activeForEntitlement: addonActive,
      autoRenew: addonActive && purchase?.autoRenewing === true,
      currentPeriodEnd: timestampFromAppleMillis(purchase?.expiryMillis),
      environment: "production",
      lastProviderEventType: String(eventType || ""),
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() })
    }, { merge: true });

    await workspace.ref.set({
      billingStorageAddonMB: addonActive ? item.storageAddonMB : 0,
      billingStorageAddonKey: addonActive ? item.key : "",
      billingStorageAddonStatus: addonActive ? "active" : "cancelled",
      billingStorageAddonProvider: addonActive ? "google" : "",
      billingStorageAddonPurchaseToken: addonActive ? purchaseToken : "",
      billingStorageAddonCurrentPeriodEnd: timestampFromAppleMillis(purchase?.expiryMillis),
      billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      billingUpdatedBy: "google_verification",
      billingExportAccessPreserved: true
    }, { merge: true });

    return { updated: true, workspaceId: workspace.id, addon: item.key, active: addonActive };
  }

  async function persistGooglePurchase(workspace, purchase, options = {}) {
    const item = googleItemForProduct(purchase?.productId, purchase?.basePlanId);
    if (item && item.type === "storage_addon") {
      return persistGoogleStorageAddon(workspace, purchase, options);
    }
    return persistGooglePlanSubscription(workspace, purchase, options);
  }

  async function workspaceForGoogleAccountToken(token) {
    const clean = String(token || "").trim();
    if (!clean) return null;
    const mapping = await admin.firestore().collection("googleBillingAccounts").doc(clean).get();
    const workspaceId = String(mapping.data()?.workspaceId || "").trim();
    if (!workspaceId) return null;
    const companyRef = admin.firestore().collection("companies").doc(workspaceId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) return null;
    return { id: workspaceId, ref: companyRef, data: companySnap.data() || {} };
  }

  const prepareGooglePlayPurchase = onCall({ region: GOOGLE_BILLING_REGION }, async (request) => {
    const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
    ownerOrAdminRole(companyData, uid);
    if (String(request.data?.purpose || "").trim() === "plan") {
      refuseSecondTill(companyData, "google");
    }
    let accountToken = String(companyData.billingGoogleAccountToken || "").trim();
    if (!accountToken) {
      accountToken = crypto.randomUUID();
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      await companyRef.set({
        billingGoogleAccountToken: accountToken,
        billingGoogleTokenCreatedAt: timestamp,
        billingUpdatedAt: timestamp
      }, { merge: true });
      await admin.firestore().collection("googleBillingAccounts").doc(accountToken).set({
        workspaceId: companyId,
        ownerUid: uid,
        createdAt: timestamp,
        updatedAt: timestamp
      }, { merge: true });
    }
    return { ok: true, workspaceId: companyId, obfuscatedAccountId: accountToken };
  });

  const verifyGooglePlayPurchase = onCall({ region: GOOGLE_BILLING_REGION, secrets: [GOOGLE_PLAY_SERVICE_ACCOUNT] }, async (request) => {
    const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
    ownerOrAdminRole(companyData, uid);
    const productId = String(request.data?.productId || "").trim();
    const purchaseToken = String(request.data?.purchaseToken || "").trim();
    if (!productId || !purchaseToken) {
      throw new HttpsError("invalid-argument", "A Google Play productId and purchaseToken are required.");
    }

    const purchase = await fetchGooglePlaySubscription(productId, purchaseToken);
    const expectedToken = String(companyData.billingGoogleAccountToken || "").trim();
    if (!expectedToken || purchase.obfuscatedAccountId !== expectedToken) {
      throw new HttpsError("permission-denied", "This Google Play purchase is not linked to the current NivaDesk workspace.");
    }

    const result = await persistGooglePurchase({ id: companyId, ref: companyRef }, purchase, {
      eventType: "client.verified_purchase"
    });
    return {
      ok: true,
      workspaceId: companyId,
      plan: result.plan || null,
      addon: result.addon || null,
      provider: "google",
      productId: purchase.productId,
      currentPeriodEnd: Number(purchase.expiryMillis || 0) || null
    };
  });

  // Google Real-time Developer Notifications arrive as a Pub/Sub push request.
  const googlePlayRtdnNotification = onRequest({ region: GOOGLE_BILLING_REGION, secrets: [GOOGLE_PLAY_SERVICE_ACCOUNT] }, async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method not allowed");
      return;
    }
    if (!googlePlayConfigStatus().configured) {
      response.status(200).json({ received: true, skipped: "not_configured" });
      return;
    }
    try {
      const encoded = request.body?.message?.data;
      if (!encoded) {
        response.status(200).json({ received: true, skipped: "no_data" });
        return;
      }
      const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
      const sub = payload?.subscriptionNotification;
      if (!sub?.purchaseToken || !sub?.subscriptionId) {
        // testNotification / voidedPurchase / oneTimeProduct events are acknowledged but ignored.
        response.status(200).json({ received: true, skipped: "no_subscription_notification" });
        return;
      }
      const purchase = await fetchGooglePlaySubscription(sub.subscriptionId, sub.purchaseToken);
      const workspace = await workspaceForGoogleAccountToken(purchase.obfuscatedAccountId);
      if (!workspace) {
        response.status(200).json({ received: true, skipped: "unknown_account_token" });
        return;
      }
      await persistGooglePurchase({ id: workspace.id, ref: workspace.ref }, purchase, {
        eventType: `notification.${String(sub.notificationType || "unknown")}`
      });
      response.status(200).json({ received: true, processed: true });
    } catch (error) {
      console.error("Google Play RTDN processing failed:", error?.message || error);
      response.status(400).json({ received: false, error: "verification_failed" });
    }
  });

  // ---------------------------------------------------------------------------
  // Safety net: a missed Apple/Google expiry notification would otherwise leave a
  // workspace on a paid plan forever, because activeForEntitlement is a stored flag
  // that is only re-evaluated when a provider event arrives. This scheduled job
  // expires any verified plan whose period ended well past a grace buffer and
  // re-resolves the workspace entitlement (dropping it to Free Demo when nothing
  // active remains).
  // ---------------------------------------------------------------------------
  const BILLING_EXPIRY_GRACE_MS = 2 * 60 * 60 * 1000; // 2h buffer for renewal/notification lag

  // Finds workspaces still marked active whose paid period ended past the grace buffer,
  // expires their stale subscription docs and re-resolves the entitlement. Uses a
  // companies-collection query (deployable composite index) instead of a collection-group
  // query, so no manual index step is required.
  async function reconcileExpiredBillingEntitlements() {
    const db = admin.firestore();
    const cutoffMs = Date.now() - BILLING_EXPIRY_GRACE_MS;
    const cutoff = admin.firestore.Timestamp.fromMillis(cutoffMs);
    const companiesSnap = await db.collection("companies")
      .where("billingEffectiveStatus", "==", "active")
      .where("billingCurrentPeriodEnd", "<", cutoff)
      .get();

    let expiredCount = 0;
    let workspaceCount = 0;
    for (const companyDoc of companiesSnap.docs) {
      const subsSnap = await companyDoc.ref.collection("subscriptions")
        .where("activeForEntitlement", "==", true)
        .get();

      let flippedHere = 0;
      for (const subDoc of subsSnap.docs) {
        const data = subDoc.data() || {};
        if (String(data.subscriptionType || "") !== "plan") continue;
        // Apple/Google grace-period subscriptions stay active until the grace window ends.
        if (String(data.providerStatus || "") === "grace_period") continue;
        const endMs = firestoreTimestampMillis(data.currentPeriodEnd);
        if (!(endMs > 0 && endMs < cutoffMs)) continue;

        await subDoc.ref.set({
          activeForEntitlement: false,
          providerStatus: "expired",
          lastProviderEventType: "scheduled.expiry_reconcile",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        flippedHere += 1;
        expiredCount += 1;
      }

      if (flippedHere > 0) {
        await recomputeEffectiveWorkspaceEntitlement(
          { id: companyDoc.id, ref: companyDoc.ref },
          { triggerEventType: "scheduled.expiry_reconcile", triggerProviderStatus: "expired" }
        );
        workspaceCount += 1;
      }
    }

    console.log(`Billing reconcile: expired ${expiredCount} subscription(s) across ${workspaceCount} workspace(s).`);
    return { expiredCount, workspaceCount };
  }

  const scheduledBillingEntitlementReconcile = onSchedule({
    region: STRIPE_BILLING_REGION,
    schedule: "every 60 minutes",
    timeZone: "Europe/London"
  }, async () => {
    await reconcileExpiredBillingEntitlements();
  });

  return {
    createStripeCheckoutSession,
    createStripeCustomerPortalSession,
    resyncStripeWorkspaceEntitlements,
    prepareAppleSubscriptionPurchase,
    verifyAppleSubscriptionPurchase,
    appleAppStoreServerNotification,
    prepareGooglePlayPurchase,
    verifyGooglePlayPurchase,
    googlePlayRtdnNotification,
    scheduledBillingEntitlementReconcile,
    stripeWebhook,
    // Not deployable functions — consumed by deleteMyAccount in index.js and by
    // the tests, and stripped out before Object.assign(exports, ...).
    _internal: {
      cancelWorkspaceStripeSubscriptionsForDeletion,
      // The four webhook appliers are closures over this factory's injected
      // admin/PLAN_ENTITLEMENTS, so nothing outside could call them and the
      // only checks over them were reading their source text. A source check
      // cannot tell "uses the resolver" from "calls the resolver and throws the
      // answer away", which is exactly how the drift got in. Exposed here so
      // functions/test/qa/stripe-invoice-api-drift.test.js can run them against
      // a fake Firestore and assert on what they write.
      applyCompletedSubscriptionCheckout,
      applySubscription,
      applyInvoicePaid,
      applyInvoicePaymentFailed,
      // The ordering decision and the ledger writer, so the tests can prove the
      // two halves of the guard separately: that the decision is made before any
      // mutation, and that the writer refuses to run without one. A future caller
      // that reintroduces the bypass fails a check rather than a customer.
      stripeSubscriptionEventOrdering,
      writeStripeSubscriptionLedger,
      // The dispatcher, for the same reason: which event time each rail hands
      // to applySubscription, and whether a throwing handler leaves the
      // stripeBillingEvents row retryable, are properties of THIS function.
      // Calling the appliers directly cannot observe either.
      processStripeEvent
    }
  };
}

/**
 * Whether an App Store notification has been overtaken by one already applied.
 *
 * Apple does not promise delivery in order, and this rail had no guard at all:
 * Stripe compares the webhook event's own time, and Google ignores the pushed
 * payload and re-reads live state, which is inherently order-safe. Here a
 * DID_RENEW delivered late — after a REFUND that had already revoked the
 * subscription — overwrote the ledger unconditionally and handed the workspace
 * its paid plan back, with a future period end that the expiry reconcile then
 * leaves alone.
 *
 * A sequence of zero means "this did not come from a notification": the owner's
 * own Refresh subscription access, a client verify, the reconcile job. Those are
 * never stale, or an owner could not recover from a bad row.
 */
function appleEventIsStale(existingData, eventSequenceMs) {
  const incoming = Number(eventSequenceMs);
  if (!Number.isFinite(incoming) || incoming <= 0) return false;
  const seen = Number((existingData && existingData.appleEventSequence) || 0);
  if (!Number.isFinite(seen) || seen <= 0) return false;
  return incoming < seen;
}

/**
 * The id behind a Stripe reference, which is either the id or the expanded object.
 */
function stripeReferenceId(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  return typeof value.id === "string" ? value.id.trim() : "";
}

/**
 * The subscription that generated an invoice.
 *
 * Stripe REMOVED `Invoice.subscription`: from 2025-03-31.basil onward the link
 * lives at `invoice.parent.subscription_details.subscription`, and both of this
 * account's webhook endpoints — and the pinned SDK's own default — run
 * 2026-04-22.dahlia. The old read returned undefined for every event, so all
 * seven invoice.paid events that ever arrived were skipped as
 * "invoice_without_subscription" and no renewal was ever recorded.
 *
 * Order matters. The new location is preferred because it is where the pinned
 * SDK says the field is; the legacy top-level field is only a fallback, so a
 * payload replayed from an older API version (or an endpoint pinned back during
 * a rollback) still resolves instead of silently skipping.
 *
 * An empty string is a real answer, not a failure, and it has two shapes. The
 * pinned SDK types `parent` as `Invoice.Parent | null` (Invoices.d.ts:344) and
 * `Parent.Type` as exactly `'quote_details' | 'subscription_details'`
 * (Invoices.d.ts:858) — there is no third value meaning "neither". So a one-off
 * or manually issued invoice carries `parent: null` outright, and only an
 * invoice generated from a QUOTE carries `parent.type === "quote_details"`.
 * Both resolve to "" here, by different branches. Callers must keep skipping
 * them: the bug was that the skip fired for everything, not that it exists.
 */
// The workspace id an invoice carries: its own metadata first, then the
// subscription metadata Stripe copies onto parent.subscription_details. Only a
// hint for the resolver, which falls back to the subscription and the customer.
function stripeInvoiceWorkspaceId(invoice) {
  if (!invoice || typeof invoice !== "object") return "";
  const own = String(invoice.metadata?.workspaceId || "").trim();
  if (own) return own;
  const parent = invoice.parent;
  const details = parent && typeof parent === "object" ? parent.subscription_details : null;
  return details && typeof details === "object" ? String(details.metadata?.workspaceId || "").trim() : "";
}

function stripeSubscriptionIdFromInvoice(invoice) {
  if (!invoice || typeof invoice !== "object") return "";

  const parent = invoice.parent;
  const details = parent && typeof parent === "object" ? parent.subscription_details : null;
  const current = details && typeof details === "object" ? stripeReferenceId(details.subscription) : "";
  if (current) return current;

  // Pre-2025-03-31.basil payloads only. Never reached on 2026-04-22.dahlia.
  return stripeReferenceId(invoice.subscription);
}

/**
 * The unix second at which a subscription's current billing period ends, or 0.
 *
 * `Subscription.current_period_end` moved onto each subscription ITEM in the
 * same API generation. It is absent from the Subscription object on
 * 2026-04-22.dahlia, which is why every Stripe ledger row in Firestore carries a
 * null currentPeriodEnd while the Apple and Google rows — same field, same
 * schema — carry a real one. That null is not cosmetic: it gates the 36-hour
 * grace window in firestore.rules/storage.rules and it makes the expiry sweep's
 * `where("billingCurrentPeriodEnd", "<", cutoff)` unable to ever match the row.
 *
 * With more than one item, the EARLIEST item end wins. That matches how Stripe
 * itself defines the subscription-level value (its list filter is documented as
 * "subscriptions whose minimum item current_period_end"), and it is the
 * conservative direction here: this date extends paid access, so the latest end
 * would keep a workspace entitled past what its earliest item paid for.
 *
 * That is deliberately NOT the rule the rest of the ledger row uses: planTier,
 * itemKey and quantity all come from `items.data[0]`
 * (itemFromMetadataOrSubscription, and the quantity read in
 * writeStripeSubscriptionLedger). With two items on different cadences the row
 * therefore describes data[0]'s plan with the earliest item's expiry. The
 * asymmetry is on purpose and the direction is what settles it: this field
 * grants access, and under-granting is recovered by the next webhook or by the
 * owner's own Refresh subscription access, while over-granting is not recovered
 * at all. Checkout only ever creates one line item (createStripeCheckoutSession
 * passes a single-entry `line_items`), so today this is reachable only by adding
 * an item from the Stripe Dashboard.
 *
 * `subscription.items` is an ApiList, not an array (Subscriptions.d.ts:190), and
 * an embedded sub-list returns at most ten entries. Past ten this sees a page,
 * not the set, so the "earliest" could be later than the real one — the
 * over-granting direction. Paging it needs a Stripe call, which would make this
 * resolver async and is not in scope here; instead the truncation is logged
 * rather than swallowed, and an operator who ever sees that line has to page the
 * list before this can be trusted.
 */
function stripeCurrentPeriodEndUnix(subscription) {
  if (!subscription || typeof subscription !== "object") return 0;

  if (subscription.items && subscription.items.has_more === true) {
    console.warn("Stripe subscription items are paginated; the period end is the earliest of the FIRST PAGE only.", {
      subscriptionId: String(subscription.id || "")
    });
  }
  const items = subscription.items && Array.isArray(subscription.items.data) ? subscription.items.data : [];
  let earliest = 0;
  for (const item of items) {
    const value = Number(item && item.current_period_end);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (!earliest || value < earliest) earliest = value;
  }
  if (earliest > 0) return earliest;

  // Pre-basil payloads only, for the same reason as the invoice fallback above.
  const legacy = Number(subscription.current_period_end);
  return Number.isFinite(legacy) && legacy > 0 ? legacy : 0;
}

module.exports = {
  STRIPE_BILLING_ITEMS,
  APPLE_PLAN_PRODUCTS,
  createStripeBillingFunctions,
  // Exported for functions/test/qa/apple-billing-order.test.js.
  appleEventIsStale,
  // Exported for functions/test/qa/stripe-invoice-api-drift.test.js.
  stripeSubscriptionIdFromInvoice,
  stripeCurrentPeriodEndUnix
};

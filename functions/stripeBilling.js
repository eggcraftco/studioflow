const crypto = require("crypto");

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

  async function writeStripeSubscriptionLedger({
    workspace,
    subscription,
    item,
    eventType,
    status,
    periodEnd,
    customerId,
    shouldFallback
  }) {
    const subscriptionId = String(subscription?.id || "").trim();
    if (!workspace?.ref || !subscriptionId || !item) return;

    const metadata = subscription.metadata || {};
    const activeForEntitlement = subscriptionActiveForEntitlement(status, shouldFallback);
    const quantity = Math.max(
      1,
      Number(Array.isArray(subscription.items?.data) ? subscription.items.data[0]?.quantity || 1 : 1) || 1
    );

    await workspace.ref.collection("subscriptions").doc(stripeSubscriptionLedgerId(subscriptionId)).set({
      provider: "stripe",
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
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const ledgerRef = workspace.ref.collection("subscriptions").doc(stripeSubscriptionLedgerId(subscriptionId));
    const ledgerSnap = await ledgerRef.get();
    if (!ledgerSnap.exists || !ledgerSnap.data()?.createdAt) {
      await ledgerRef.set({ createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
  }

  function timestampFromAppleMillis(milliseconds) {
    const value = Number(milliseconds || 0);
    return Number.isFinite(value) && value > 0 ? admin.firestore.Timestamp.fromMillis(value) : null;
  }

  async function persistApplePlanSubscription(workspace, transaction, {
    environmentName = "Sandbox",
    eventType = "client.verify",
    notificationStatus = null
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

    await ledgerRef.set({
      provider: "apple",
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
    notificationStatus = null
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

    await ledgerRef.set({
      provider: "apple",
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

  async function recomputeEffectiveWorkspaceEntitlement(workspace, {
    triggerEventType = "",
    triggerProviderStatus = "",
    triggerCustomerId = ""
  } = {}) {
    const subscriptionSnapshot = await workspace.ref.collection("subscriptions").get();
    const activePlanSubscriptions = subscriptionSnapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
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
      const currentSnap = await workspace.ref.get();
      const currentData = currentSnap.data() || {};
      const currentSource = String(currentData.billingPlanSource || "").trim().toLowerCase();
      const currentPlan = String(currentData.billingPlan || "").trim();
      if (currentSource.includes("manual") && currentPlan && currentPlan !== "demo") {
        await workspace.ref.set({ ...resolutionFields }, { merge: true });
        return {
          plan: currentPlan,
          provider: "manual",
          activePlanSubscriptionCount: 0,
          hasMultipleActiveSubscriptions: false,
          preservedManualPlan: true
        };
      }

      const normalizedTriggerStatus = String(triggerProviderStatus || "").trim().toLowerCase();
      const legacyStatus = normalizedTriggerStatus === "unpaid"
        ? "expired"
        : (["canceled", "cancelled"].includes(normalizedTriggerStatus) || triggerEventType === "customer.subscription.deleted")
          ? "cancelled"
          : "free";

      await workspace.ref.set(planUpdatePayload("demo", legacyStatus, triggerProviderStatus || "free", {
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
      }), { merge: true });

      return {
        plan: "demo",
        provider: "none",
        activePlanSubscriptionCount: 0,
        hasMultipleActiveSubscriptions: false
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

    await workspace.ref.set(planUpdatePayload(
      effectivePlanKey,
      mappedEffectiveStatus(selected.providerStatus),
      String(selected.providerStatus || "active"),
      common
    ), { merge: true });

    return {
      plan: effectivePlanKey,
      provider: effectiveProvider,
      activePlanSubscriptionCount: activePlanSubscriptions.length,
      hasMultipleActiveSubscriptions
    };
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

  async function applyCompletedSubscriptionCheckout(stripe, session) {
    if (String(session.mode || "") !== "subscription") {
      return { skipped: true, reason: "non_subscription_checkout" };
    }

    const subscriptionId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id || "";
    if (!subscriptionId) {
      return { skipped: true, reason: "subscription_not_found_on_checkout" };
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const result = await applySubscription(subscription, "checkout.session.completed");

    if (result.updated && result.workspaceId) {
      await admin.firestore().collection("companies").doc(result.workspaceId).set({
        billingCheckoutSessionId: session.id || "",
        billingCheckoutCompletedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return result;
  }

  async function applySubscription(subscription, eventType) {
    const metadata = subscription.metadata || {};
    const item = itemFromMetadataOrSubscription(metadata, subscription);
    const workspace = await workspaceRefFromStripeRefs({
      workspaceId: metadata.workspaceId,
      subscriptionId: subscription.id,
      customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id
    });

    if (!workspace || !item) {
      return { skipped: true, reason: !workspace ? "workspace_not_found" : "billing_item_not_found" };
    }

    const status = String(subscription.status || "unknown");
    const periodEnd = timestampFromUnix(subscription.current_period_end);
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || "";
    const isDeleted = eventType === "customer.subscription.deleted";
    const shouldFallback = isDeleted || ["canceled", "unpaid", "incomplete_expired"].includes(status);

    // Every verified Stripe subscription update is persisted in a provider-neutral
    // ledger. Apple and Google purchase handlers can later write the same schema,
    // while billingPlan continues to serve existing clients during rollout.
    await writeStripeSubscriptionLedger({
      workspace,
      subscription,
      item,
      eventType,
      status,
      periodEnd,
      customerId,
      shouldFallback
    });

    if (item.type === "storage_addon") {
      const addonActive = !shouldFallback && ["active", "trialing", "past_due"].includes(status);
      await workspace.ref.set({
        billingCustomerId: customerId,
        billingStorageAddonMB: addonActive ? item.storageAddonMB : 0,
        billingStorageAddonKey: addonActive ? item.key : "",
        billingStorageAddonStatus: addonActive ? status : "cancelled",
        billingStorageAddonSubscriptionId: addonActive ? subscription.id : "",
        billingStorageAddonCurrentPeriodEnd: periodEnd,
        billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        billingUpdatedBy: "stripe_webhook",
        billingExportAccessPreserved: true
      }, { merge: true });

      return { updated: true, workspaceId: workspace.id, addon: item.key, active: addonActive };
    }

    if (item.type === "team_seat_addon") {
      const addonActive = !shouldFallback && ["active", "trialing", "past_due"].includes(status);
      const firstSubscriptionItem = Array.isArray(subscription.items?.data) ? subscription.items.data[0] : null;
      const requestedQuantity = Math.max(1, Number(firstSubscriptionItem?.quantity || 1) || 1);
      const purchasedSeatQuantity = addonActive ? Math.min(5, Math.floor(requestedQuantity)) : 0;
      await workspace.ref.set({
        billingCustomerId: customerId,
        billingAdditionalTeamSeatQuantity: purchasedSeatQuantity,
        billingAdditionalTeamSeatKey: addonActive ? item.key : "",
        billingAdditionalTeamSeatStatus: addonActive ? status : "cancelled",
        billingAdditionalTeamSeatSubscriptionId: addonActive ? subscription.id : "",
        billingAdditionalTeamSeatCurrentPeriodEnd: periodEnd,
        billingTeamIncludedSeats: 5,
        billingTeamSelfServiceMax: 10,
        billingTeamMemberLimit: 5 + purchasedSeatQuantity,
        billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        billingUpdatedBy: "stripe_webhook",
        billingExportAccessPreserved: true
      }, { merge: true });

      return { updated: true, workspaceId: workspace.id, addon: item.key, active: addonActive, purchasedSeatQuantity };
    }

    const entitlementResolution = await recomputeEffectiveWorkspaceEntitlement(workspace, {
      triggerEventType: eventType,
      triggerProviderStatus: status,
      triggerCustomerId: customerId
    });

    if (shouldFallback) {
      await workspace.ref.set({
        billingPreviousPaidPlan: item.plan,
        billingPreviousSubscriptionItemKey: item.key,
        billingPreviousInterval: item.interval || ""
      }, { merge: true });
    }

    return {
      updated: true,
      workspaceId: workspace.id,
      providerPlanEvent: item.plan,
      providerStatus: status,
      effectivePlan: entitlementResolution.plan,
      effectiveProvider: entitlementResolution.provider,
      activePlanSubscriptionCount: entitlementResolution.activePlanSubscriptionCount,
      hasMultipleActiveSubscriptions: entitlementResolution.hasMultipleActiveSubscriptions
    };
  }

  async function applyInvoicePaid(stripe, invoice) {
    const subscriptionId = typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id || "";
    if (!subscriptionId) {
      return { skipped: true, reason: "invoice_without_subscription" };
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const result = await applySubscription(subscription, "invoice.paid");
    if (result.updated && result.workspaceId) {
      await admin.firestore().collection("companies").doc(result.workspaceId).set({
        billingLastInvoiceId: invoice.id || "",
        billingLastInvoicePaidAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return result;
  }

  async function applyInvoicePaymentFailed(stripe, invoice) {
    let subscription = null;
    const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id || "";
    if (subscriptionId) {
      try {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (error) {
        console.warn("Could not retrieve failed invoice subscription:", error?.message || error);
      }
    }

    const metadata = invoice.metadata || subscription?.metadata || {};
    const workspace = await workspaceRefFromStripeRefs({
      workspaceId: metadata.workspaceId,
      subscriptionId,
      customerId: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id
    });
    if (!workspace) return { skipped: true, reason: "workspace_not_found" };

    let resolution = null;
    if (subscription) {
      resolution = await applySubscription(subscription, "invoice.payment_failed");
    }

    await workspace.ref.set({
      billingLastInvoiceId: invoice.id || "",
      billingPaymentFailedAt: admin.firestore.FieldValue.serverTimestamp(),
      billingExportAccessPreserved: true,
      billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      billingUpdatedBy: "stripe_webhook"
    }, { merge: true });

    return {
      updated: true,
      workspaceId: workspace.id,
      status: "past_due",
      entitlementResolutionApplied: Boolean(resolution?.updated)
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

    let result = { skipped: true, reason: "unhandled_event" };
    const object = event.data?.object || {};

    if (event.type === "checkout.session.completed") {
      result = await applyCompletedSubscriptionCheckout(stripe, object);
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      result = await applySubscription(object, event.type);
    } else if (event.type === "invoice.paid") {
      result = await applyInvoicePaid(stripe, object);
    } else if (event.type === "invoice.payment_failed") {
      result = await applyInvoicePaymentFailed(stripe, object);
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
    const foundSubscriptionIds = new Set();
    let foundSubscriptionCount = 0;
    let recognisedSubscriptionCount = 0;
    let activeSeatSubFound = false;
    let activeStorageSubFound = false;
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
        const subStatus = String(subscription.status || "").trim().toLowerCase();
        const subActiveForEntitlement = ["active", "trialing", "past_due"].includes(subStatus);
        if (subActiveForEntitlement && item.type === "team_seat_addon") activeSeatSubFound = true;
        if (subActiveForEntitlement && item.type === "storage_addon") activeStorageSubFound = true;
        await applySubscription(subscription, "manual.owner_resync");
      }

      if (!page.has_more || !(page.data || []).length) {
        startingAfter = null;
      } else {
        startingAfter = page.data[page.data.length - 1].id;
      }
    } while (startingAfter);

    // Disable stale Stripe ledger records that are no longer returned by Stripe.
    // This prevents an old cached entitlement from surviving a provider-side removal.
    const existingStripeRecords = await companyRef.collection("subscriptions")
      .where("provider", "==", "stripe")
      .get();

    const staleBatch = admin.firestore().batch();
    let staleRecordsDeactivated = 0;
    existingStripeRecords.docs.forEach((doc) => {
      const data = doc.data() || {};
      const externalSubscriptionId = String(data.externalSubscriptionId || "").trim();
      if (!externalSubscriptionId || foundSubscriptionIds.has(externalSubscriptionId)) return;
      if (data.activeForEntitlement === true) staleRecordsDeactivated += 1;
      staleBatch.set(doc.ref, {
        activeForEntitlement: false,
        autoRenew: false,
        providerStatus: "not_found_during_resync",
        lastProviderEventType: "manual.owner_resync_missing_at_provider",
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    await staleBatch.commit();

    // Reconcile add-on doc fields against Stripe. If no active seat/storage add-on
    // subscription exists at the provider, clear any stale add-on fields so the
    // recompute below does not keep inflating the effective allowance.
    const addonReconcile = {};
    if (!activeSeatSubFound) {
      addonReconcile.billingAdditionalTeamSeatQuantity = 0;
      addonReconcile.billingAdditionalTeamSeatKey = "";
      addonReconcile.billingAdditionalTeamSeatStatus = "cancelled";
      addonReconcile.billingAdditionalTeamSeatSubscriptionId = "";
      // Reset the effective seat limit to the base plan allowance (no purchased seats).
      const reconcilePlanKey = String(companyData.billingPlan || "demo").trim();
      const reconcileEntitlements = PLAN_ENTITLEMENTS[reconcilePlanKey] || PLAN_ENTITLEMENTS.demo;
      addonReconcile.billingTeamMemberLimit = reconcileEntitlements.teamMemberLimit;
    }
    if (!activeStorageSubFound) {
      addonReconcile.billingStorageAddonMB = 0;
      addonReconcile.billingStorageAddonKey = "";
      addonReconcile.billingStorageAddonStatus = "cancelled";
      addonReconcile.billingStorageAddonSubscriptionId = "";
    }
    if (Object.keys(addonReconcile).length) {
      addonReconcile.billingUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
      addonReconcile.billingUpdatedBy = "stripe_resync_reconcile";
      addonReconcile.billingExportAccessPreserved = true;
      await companyRef.set(addonReconcile, { merge: true });
    }

    const resolution = await recomputeEffectiveWorkspaceEntitlement(companyRef && {
      id: companyId,
      ref: companyRef
    }, {
      triggerEventType: "manual.owner_resync_completed",
      triggerProviderStatus: "verified",
      triggerCustomerId: customerId
    });

    await companyRef.set({
      billingLastEntitlementResyncCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      billingLastEntitlementResyncCompletedBy: uid,
      billingLastEntitlementResyncFoundSubscriptions: foundSubscriptionCount,
      billingLastEntitlementResyncRecognisedSubscriptions: recognisedSubscriptionCount,
      billingLastEntitlementResyncStaleRecordsDeactivated: staleRecordsDeactivated,
      billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      billingUpdatedBy: "stripe_owner_resync"
    }, { merge: true });

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

  const createStripeCheckoutSession = onCall({ region: STRIPE_BILLING_REGION, secrets: [STRIPE_SECRET_KEY] }, async (request) => {
    const item = billingItemFromRequest(request);
    const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
    const role = ownerOrAdminRole(companyData, uid);
    const config = configStatus(item);
    if (!config.configured) {
      return { ok: true, configured: false, message: config.message };
    }
    requireBillingEnvironmentAccess(request, config);

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
    if (sessionPayload.subscription_data?.trial_period_days) {
      await companyRef.set({
        billingTrialUsedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
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
        notificationStatus: notification.data?.status
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
    // Not a deployable function — consumed by deleteMyAccount in index.js and
    // stripped out before Object.assign(exports, ...).
    _internal: { cancelWorkspaceStripeSubscriptionsForDeletion }
  };
}

module.exports = {
  STRIPE_BILLING_ITEMS,
  APPLE_PLAN_PRODUCTS,
  createStripeBillingFunctions
};

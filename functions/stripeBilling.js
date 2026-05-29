const STRIPE_BILLING_REGION = "europe-west2";

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
    availableForCheckout: false,
    priceEnv: "STRIPE_PRICE_ADDITIONAL_TEAM_SEAT_MONTHLY"
  },
  additional_team_seat_yearly: {
    key: "additional_team_seat_yearly",
    type: "team_seat_addon",
    mode: "subscription",
    interval: "year",
    availableForCheckout: false,
    priceEnv: "STRIPE_PRICE_ADDITIONAL_TEAM_SEAT_YEARLY"
  },
  storage_100gb: {
    key: "storage_100gb",
    type: "storage_addon",
    mode: "subscription",
    interval: "month",
    availableForCheckout: false,
    priceEnv: "STRIPE_PRICE_ADDON_100GB",
    storageAddonMB: 100 * 1024
  },
  storage_200gb: {
    key: "storage_200gb",
    type: "storage_addon",
    mode: "subscription",
    interval: "month",
    availableForCheckout: false,
    priceEnv: "STRIPE_PRICE_ADDON_200GB",
    storageAddonMB: 200 * 1024
  }
};

function createStripeBillingFunctions({
  admin,
  onCall,
  onRequest,
  HttpsError,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
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
    if (compact === "200gb" || compact === "storage_200gb") return "storage_200gb";
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

  function ownerOrAdminRole(companyData, uid) {
    const role = normalizeWorkspaceRole(workspaceOrderRole(companyData, uid), "unknown");
    if (role !== "owner" && role !== "admin") {
      throw new HttpsError("permission-denied", "Only workspace owners/admins can manage billing.", {
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

  function planUpdatePayload(planKey, status, rawStatus, common = {}) {
    const entitlements = PLAN_ENTITLEMENTS[planKey] || PLAN_ENTITLEMENTS.demo;
    return {
      billingPlan: entitlements.plan,
      billingPlanName: entitlements.displayName,
      billingPlanSource: "stripe",
      billingStatus: status,
      billingProviderRawStatus: rawStatus || status,
      billingStorageLimitMB: entitlements.storageLimitMB,
      billingTeamMemberLimit: entitlements.teamMemberLimit,
      billingTeamIncludedSeats: entitlements.plan === "team_monthly" ? 5 : entitlements.teamMemberLimit,
      billingTeamSelfServiceMax: entitlements.plan === "team_monthly" ? 10 : entitlements.teamMemberLimit,
      billingExportAccessPreserved: true,
      billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      billingUpdatedBy: "stripe_webhook",
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

    if (shouldFallback) {
      await workspace.ref.set(planUpdatePayload("demo", status === "unpaid" ? "expired" : "cancelled", status, {
        billingCustomerId: customerId,
        billingSubscriptionId: subscription.id,
        billingPreviousPaidPlan: item.plan,
        billingPreviousSubscriptionItemKey: item.key,
        billingPreviousInterval: item.interval || "",
        billingCurrentPeriodEnd: periodEnd,
        billingStorageAddonMB: 0,
        billingAdditionalTeamSeatQuantity: 0,
        billingAdditionalTeamSeatKey: "",
        billingAdditionalTeamSeatStatus: "cancelled",
        billingAdditionalTeamSeatSubscriptionId: ""
      }), { merge: true });

      return { updated: true, workspaceId: workspace.id, plan: "demo", fallbackFrom: item.plan };
    }

    const mappedStatus = status === "trialing" ? "trialing" : status === "past_due" ? "past_due" : "active";
    await workspace.ref.set(planUpdatePayload(item.plan, mappedStatus, status, {
      billingCustomerId: customerId,
      billingSubscriptionId: subscription.id,
      billingSubscriptionItemKey: item.key,
      billingInterval: item.interval || "",
      billingCurrentPeriodEnd: periodEnd
    }), { merge: true });

    return { updated: true, workspaceId: workspace.id, plan: item.plan, status: mappedStatus };
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

    await workspace.ref.set({
      billingStatus: "past_due",
      billingProviderRawStatus: "invoice.payment_failed",
      billingLastInvoiceId: invoice.id || "",
      billingPaymentFailedAt: admin.firestore.FieldValue.serverTimestamp(),
      billingExportAccessPreserved: true,
      billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      billingUpdatedBy: "stripe_webhook"
    }, { merge: true });

    return { updated: true, workspaceId: workspace.id, status: "past_due" };
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

  const createStripeCheckoutSession = onCall({ region: STRIPE_BILLING_REGION, secrets: [STRIPE_SECRET_KEY] }, async (request) => {
    const item = billingItemFromRequest(request);
    const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
    const role = ownerOrAdminRole(companyData, uid);
    const config = configStatus(item);
    if (!config.configured) {
      return { ok: true, configured: false, message: config.message };
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
      line_items: [{ price: config.priceId, quantity: 1 }],
      success_url: safeAbsoluteUrl(request.data?.successUrl, "/plan?billing=success"),
      cancel_url: safeAbsoluteUrl(request.data?.cancelUrl, "/pricing?billing=cancelled"),
      allow_promotion_codes: true,
      metadata
    };

    if (item.mode === "subscription") {
      sessionPayload.subscription_data = { metadata };
    } else {
      sessionPayload.payment_intent_data = { metadata };
    }

    const session = await stripe.checkout.sessions.create(sessionPayload);
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

  return {
    createStripeCheckoutSession,
    createStripeCustomerPortalSession,
    stripeWebhook
  };
}

module.exports = {
  STRIPE_BILLING_ITEMS,
  createStripeBillingFunctions
};

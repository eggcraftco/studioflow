// The WooCommerce connector (spec §8) — the first channel built on the common
// engine alone, with no legacy path beside it.
//
//   * Connecting is WooCommerce's own Application Authentication flow (WOO-001):
//     the merchant approves at their store, the store POSTs the consumer pair
//     to our callback server-to-server, and nothing secret ever reaches a
//     browser (WOO-002). The `state` is a document that carries who started
//     the flow and which site it was for, consumed with a transaction so a
//     replayed callback finds it gone — the same shape as Etsy's.
//   * The site URL is normalised and its host resolved before anything talks
//     to it: plain http, credentials, ports, IP literals, private hosts and
//     names that resolve to private addresses are all refused (WOO-003).
//   * We create the webhooks ourselves and watch their status (WOO-004/009);
//     each delivery is verified over the raw body with the connection's own
//     secret, and the URL token only routes (WOO-005/006).
//   * A webhook is a doorbell: the order is fetched again from the REST API
//     before it is applied (WOO-007), through the same engine every path uses.
//   * Reconciliation runs on the common cursor with an overlap (WOO-008), and
//     the merchant's installment rule is kept as it was (WOO-010).
const crypto = require("crypto");
const engine = require("./commerce/engine");
const cursors = require("./commerce/cursors");
const health = require("./commerce/health");
const events = require("./commerce/events");
const worker = require("./commerce/worker");
const { normalizeWooOrder } = require("./commerce/adapters/woocommerce");
const { verifyWooSignature } = require("./commerce/woo/signature");
const { normalizeWooSiteUrl, isPrivateAddress, wooAuthorizeUrl } = require("./commerce/woo/url");
const { createWooClient } = require("./commerce/woo/client");

const CONNECTION_COLLECTION = "wooConnections";
const STATE_COLLECTION = "wooConnectStates";
const STATE_TTL_MS = 10 * 60 * 1000;
const DELIVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const WEBHOOK_TOPICS = ["order.created", "order.updated", "order.deleted", "customer.created", "customer.updated"];
const INSTALLMENT_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_CONNECTIONS_PER_SWEEP = 25;
const RECONCILE_MAX_PAGES = 4;
const IMPORT_MAX_PAGES = 20;
const SYNC_LOCK_MS = 3 * 60 * 1000;

function safeIdPart(value) { return String(value || "").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120); }
function connectionDocId(companyId, host) { return `${safeIdPart(companyId)}__${safeIdPart(host)}`; }
function timingSafeEqualText(a, b) {
  const x = Buffer.from(String(a || "")); const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

function createWooConnectorFunctions(deps) {
  const {
    admin, onCall, onRequest, onSchedule = null, HttpsError,
    tokenKey, encryptToken, decryptToken,
    requireWorkspaceOwner, requireWorkspaceMember,
    appReturnUrl, functionsBaseUrl, appName = "NivaDesk",
    orderDocRef, wooOrderDocId, integrationOrderCapacity, holdIntegrationOrder,
    upsertIntegrationCustomer, sendPushNotificationToCompany = async () => {},
    reconcileLineItems, resolveDefaultDeliveryTime, companySettingsDocRef,
    historyLogWithEntry, amountHistoryValue, roundMoneyValue, dateFromFirestore,
    createClient = createWooClient, fetchImpl = globalThis.fetch,
    lookup = async (host) => require("dns").promises.lookup(host, { all: true }),
    now = () => Date.now()
  } = deps;

  const db = () => admin.firestore();
  const connections = () => db().collection(CONNECTION_COLLECTION);
  const states = () => db().collection(STATE_COLLECTION);
  const FieldValue = admin.firestore.FieldValue;

  // ---- secrets at rest ------------------------------------------------------
  const box = (plain) => encryptToken(plain, tokenKey());
  const unbox = (b) => (b && typeof b === "object" ? decryptToken(b, tokenKey()) : "");

  function clientFor(connectionData) {
    const consumerKey = unbox(connectionData.consumerKeyEncrypted);
    const consumerSecret = unbox(connectionData.consumerSecretEncrypted);
    if (!consumerKey || !consumerSecret) { const e = new Error("woo_credentials_missing"); e.errorClass = "auth"; throw e; }
    return createClient({ siteUrl: connectionData.siteUrl, consumerKey, consumerSecret, fetchImpl });
  }

  function publicView(id, data) {
    const hooks = Array.isArray(data.webhooks) ? data.webhooks : [];
    return {
      id, provider: "woocommerce", siteUrl: String(data.siteUrl || ""), host: String(data.host || ""), storeName: String(data.storeName || ""),
      status: String(data.status || "pending"), permissions: String(data.permissions || ""),
      connectedAtMs: Number(data.connectedAtMs || 0), lastSyncAtMs: Number(data.lastSyncAtMs || 0), lastSuccessAtMs: Number(data.lastSuccessAtMs || 0),
      lastErrorCode: String(data.lastErrorCode || ""), webhooks: hooks.map((h) => ({ topic: String(h.topic || ""), status: String(h.status || "") })),
      webhooksHealthy: data.webhooksHealthy !== false, importState: String(data.importState || "none"),
      combineInstallments: data.combineInstallments !== false,
      settings: { autoSync: data.settings?.autoSync !== false, importUnpaid: data.settings?.importUnpaid === true }
    };
  }

  async function loadOwnedConnection(companyId, connectionId) {
    const snap = await connections().doc(String(connectionId || "")).get();
    const data = snap.exists ? (snap.data() || {}) : null;
    if (!data || String(data.companyId || "") !== companyId) throw new HttpsError("not-found", "No such WooCommerce connection in this workspace.");
    return { ref: snap.ref, data };
  }

  // ---- 1. begin: the merchant types a store URL -----------------------------
  const beginWooConnect = onCall({ region: "europe-west2" }, async (request) => {
    const { uid, companyId } = await requireWorkspaceOwner(request);
    const normalized = normalizeWooSiteUrl(request.data?.siteUrl);
    if (!normalized.ok) throw new HttpsError("invalid-argument", `That store address cannot be used (${normalized.reason}). Enter the https address of your WooCommerce site.`);
    let addresses = [];
    try { addresses = await lookup(normalized.host); } catch { throw new HttpsError("invalid-argument", "That store address does not resolve. Check the domain and try again."); }
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address || a))) {
      throw new HttpsError("invalid-argument", "That store address must be a public website.");
    }
    const state = crypto.randomBytes(24).toString("base64url");
    await states().doc(state).set({
      companyId, uid, siteUrl: normalized.siteUrl, host: normalized.host, used: false,
      createdAt: FieldValue.serverTimestamp(), expiresAt: now() + STATE_TTL_MS,
      expireAt: admin.firestore.Timestamp.fromMillis(now() + STATE_TTL_MS)
    });
    const returnUrl = `${appReturnUrl()}?section=woocommerce&woo=return&state=${encodeURIComponent(state)}`;
    const callbackUrl = `${functionsBaseUrl()}/wooAuthCallback`;
    return { ok: true, state, siteUrl: normalized.siteUrl, authorizeUrl: wooAuthorizeUrl(normalized.siteUrl, { appName, userId: state, returnUrl, callbackUrl, scope: "read_write" }) };
  });

  // ---- 2. callback: the store hands us the consumer pair, server to server ---
  const wooAuthCallback = onRequest({ region: "europe-west2" }, async (req, res) => {
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "post_only" }); return; }
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const state = String(body.user_id || "").trim();
    const consumerKey = String(body.consumer_key || "").trim();
    const consumerSecret = String(body.consumer_secret || "").trim();
    if (!state || !consumerKey || !consumerSecret) { res.status(400).json({ ok: false, error: "missing_fields" }); return; }
    let stateData = null;
    try {
      stateData = await db().runTransaction(async (tx) => {
        const ref = states().doc(state);
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const row = snap.data() || {};
        if (row.used === true || Number(row.expiresAt || 0) < now()) return null;
        tx.update(ref, { used: true, usedAt: FieldValue.serverTimestamp() });
        return row;
      });
    } catch (error) { console.error("wooAuthCallback state failed:", error?.message || error); }
    if (!stateData) { res.status(400).json({ ok: false, error: "unknown_or_expired_state" }); return; }
    const id = connectionDocId(stateData.companyId, stateData.host);
    await connections().doc(id).set({
      companyId: String(stateData.companyId), provider: "woocommerce", siteUrl: String(stateData.siteUrl), host: String(stateData.host),
      status: "authorized", keyId: String(body.key_id || ""), permissions: String(body.key_permissions || ""),
      consumerKeyEncrypted: box(consumerKey), consumerSecretEncrypted: box(consumerSecret),
      authorizedAtMs: now(), connectedByUid: String(stateData.uid || ""), connectState: state,
      lastErrorCode: "", updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await states().doc(state).set({ connectionId: id }, { merge: true });
    res.status(200).json({ ok: true });
  });

  async function fetchSiteName(siteUrl) {
    try {
      const response = await fetchImpl(`${siteUrl}/wp-json/`, { headers: { Accept: "application/json" }, redirect: "manual" });
      if (!response.ok) return "";
      const data = await response.json();
      return String(data?.name || "").slice(0, 120);
    } catch { return ""; }
  }

  async function ensureWebhooks(id, data, client) {
    const secret = unbox(data.webhookSecretEncrypted) || crypto.randomBytes(24).toString("base64url");
    const deliveryToken = String(data.deliveryToken || "") || crypto.randomBytes(18).toString("base64url");
    const deliveryUrl = `${functionsBaseUrl()}/wooConnectorWebhook?c=${encodeURIComponent(id)}&t=${encodeURIComponent(deliveryToken)}`;
    const existing = await client.listWebhooks();
    const ours = existing.filter((h) => String(h?.delivery_url || "").startsWith(deliveryUrl.split("&t=")[0]));
    const webhooks = [];
    for (const topic of WEBHOOK_TOPICS) {
      const found = ours.find((h) => h.topic === topic);
      if (found && String(found.status) === "active" && String(found.delivery_url) === deliveryUrl) { webhooks.push({ id: String(found.id), topic, status: "active" }); continue; }
      if (found) { try { await client.deleteWebhook(found.id); } catch { /* stale hook, best-effort */ } }
      const created = await client.createWebhook({ name: `${appName} ${topic}`, topic, deliveryUrl, secret });
      webhooks.push({ id: String(created?.id || ""), topic, status: String(created?.status || "active") });
    }
    return { webhooks, secret, deliveryToken };
  }

  // ---- 3. finish: the merchant is back; probe, name, webhooks, cursors -------
  const finishWooConnect = onCall({ region: "europe-west2", timeoutSeconds: 120 }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const state = String(request.data?.state || "").trim();
    if (!state) throw new HttpsError("invalid-argument", "state is required.");
    const stateSnap = await states().doc(state).get();
    const stateData = stateSnap.exists ? (stateSnap.data() || {}) : null;
    if (!stateData || String(stateData.companyId) !== companyId) throw new HttpsError("not-found", "This connection attempt is not yours or has expired.");
    if (!stateData.connectionId) return { ok: false, status: "not_authorized", message: "The store has not sent its keys yet. If you cancelled at the store, start again." };
    const { ref, data } = await loadOwnedConnection(companyId, stateData.connectionId);
    const client = clientFor(data);
    try { await client.probe(); } catch (error) {
      const cls = events.classifyError(error);
      await ref.set({ status: "needs_reconnect", lastErrorCode: cls === "auth" ? "credentials_rejected" : "site_unreachable", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      throw new HttpsError("failed-precondition", cls === "auth" ? "The store rejected the keys it just issued. Start the connection again." : "The store's REST API could not be reached. Check that the WooCommerce REST API is enabled and the site is public.");
    }
    const storeName = data.storeName || await fetchSiteName(data.siteUrl);
    const { webhooks, secret, deliveryToken } = await ensureWebhooks(ref.id, data, client);
    await ref.set({
      status: "connected", storeName, webhooks, webhooksHealthy: true, webhookSecretEncrypted: box(secret), deliveryToken,
      connectedAtMs: data.connectedAtMs || now(), lastProbeAtMs: now(), lastErrorCode: "",
      combineInstallments: data.combineInstallments !== false, settings: { autoSync: true, importUnpaid: false, ...(data.settings || {}) },
      importState: data.importState || "none", updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await health.touchHealth(db(), { provider: "woocommerce", connectionId: ref.id, companyId, kind: "success", now: now(), FieldValue });
    const fresh = (await ref.get()).data() || {};
    return { ok: true, status: "connected", connection: publicView(ref.id, fresh) };
  });

  const getWooConnections = onCall({ region: "europe-west2" }, async (request) => {
    const { companyId } = await requireWorkspaceMember(request);
    const snap = await connections().where("companyId", "==", companyId).get();
    return { ok: true, connections: snap.docs.map((d) => publicView(d.id, d.data() || {})) };
  });

  const disconnectWooShop = onCall({ region: "europe-west2", timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref, data } = await loadOwnedConnection(companyId, request.data?.connectionId);
    let removed = 0;
    try {
      const client = clientFor(data);
      for (const hook of Array.isArray(data.webhooks) ? data.webhooks : []) { if (hook.id) { try { await client.deleteWebhook(hook.id); removed += 1; } catch { /* best-effort */ } } }
    } catch { /* no usable credentials: nothing to remove */ }
    await ref.set({
      status: "disconnected", consumerKeyEncrypted: FieldValue.delete(), consumerSecretEncrypted: FieldValue.delete(), webhookSecretEncrypted: FieldValue.delete(),
      deliveryToken: FieldValue.delete(), webhooks: [], webhooksHealthy: false, disconnectedAtMs: now(), updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { ok: true, webhooksRemoved: removed, ordersKept: true };
  });

  // ---- the apply path every event and every pass goes through ---------------
  async function findInstallmentCandidate(companyId, emailLower, excludeDocId) {
    if (!emailLower) return null;
    const snapshot = await db().collection("siparisler").where("companyId", "==", companyId).where("emailAddress", "==", emailLower).get();
    const matches = [];
    for (const doc of snapshot.docs) {
      if (doc.id === excludeDocId) continue;
      const o = doc.data() || {};
      if (o.isDeleted === true || o.isDelivered === true) continue;
      if (String(o.customFields?.Source || "") !== "WooCommerce") continue;
      const paymentDate = dateFromFirestore(o.paymentDate, null);
      if (!paymentDate || now() - paymentDate.getTime() > INSTALLMENT_WINDOW_MS) continue;
      matches.push(doc);
    }
    return matches.length === 1 ? matches[0] : null;   // exactly one open order, as the legacy rule had it
  }

  async function applyWooOrder(connectionId, connectionData, order, { eventKey = null, eventOrigin = "provider", eventType = "" } = {}) {
    const companyId = String(connectionData.companyId || "");
    const settings = { autoSync: connectionData.settings?.autoSync !== false, importUnpaid: connectionData.settings?.importUnpaid === true };
    const envelope = normalizeWooOrder(order, { connectionId, siteUrl: connectionData.siteUrl, storeName: connectionData.storeName, eventOrigin, rawSnapshotRef: eventKey });
    const externalId = envelope.identity.external_id;
    if (!externalId) return { result: "invalid", problems: ["missing_external_id"] };
    const docId = wooOrderDocId(companyId, externalId);
    const existing = await orderDocRef(docId).get();
    if (!existing.exists) {
      if (!settings.autoSync && eventOrigin !== "import") return { result: "skipped", reason: "auto_sync_off" };
      if (!settings.importUnpaid && !["paid", "partially_refunded", "refunded"].includes(envelope.order.payment_status)) return { result: "skipped", reason: `unpaid_${envelope.order.platform_status || "unknown"}` };
      // WOO-010 — the merchant's installment rule, kept exactly: a second paid
      // order from the same buyer within sixty days, when exactly one open
      // WooCommerce order of theirs exists, is a payment on it, not an order.
      if (connectionData.combineInstallments !== false && envelope.customer.email) {
        const markerRef = db().collection("companies").doc(companyId).collection("wooMergedPayments").doc(safeIdPart(externalId));
        if ((await markerRef.get()).exists) return { result: "duplicate", reason: "already_merged" };
        const candidate = await findInstallmentCandidate(companyId, envelope.customer.email, docId);
        if (candidate) {
          const amount = Number(envelope.order.grand_total || 0);
          const current = candidate.data() || {};
          const payments = Array.isArray(current.payments) ? current.payments.slice() : [];
          const orderNumber = envelope.source.provider_metadata.order_number;
          payments.push({ id: crypto.randomUUID(), amount, date: new Date(now()), method: envelope.source.provider_metadata.payment_method || "WooCommerce", note: `WooCommerce installment (order #${orderNumber})`, createdByUid: "", createdByEmail: "" });
          await candidate.ref.set({
            paidAmount: roundMoneyValue(current.paidAmount) + roundMoneyValue(amount),
            remainingAmount: Math.max(0, roundMoneyValue(current.remainingAmount) - roundMoneyValue(amount)),
            payments, historyLog: historyLogWithEntry(current, "Payment received", `WooCommerce installment #${orderNumber}`, amountHistoryValue(amount)),
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
          await markerRef.set({ mergedIntoOrderId: candidate.id, wooOrderId: externalId, amount, mergedAtMs: now() });
          await sendPushNotificationToCompany(companyId, { title: "WooCommerce payment received", body: `${current.customerName || envelope.customer.name || "Customer"}: installment #${orderNumber}`, orderId: candidate.id, type: "woocommerce_payment" });
          return { result: "merged", orderId: candidate.id, mergedAmount: amount };
        }
      }
    }
    const settingsSnap = await companySettingsDocRef(companyId).get();
    const outcome = await engine.applyEnvelope(db(), envelope, {
      companyId, mode: "apply", source: "woocommerce", eventKey,
      orderIdFor: () => docId,
      defaultDeliveryTime: envelope.source.provider_metadata.delivery_days || resolveDefaultDeliveryTime(settingsSnap.data()),
      defaultStatus: "Not Yet", syncCancellations: true, reconcileLineItems,
      capacity: async () => { const c = await db().collection("companies").doc(companyId).get(); return integrationOrderCapacity(companyId, c.data() || {}); },
      hold: async (env, capacity) => holdIntegrationOrder(companyId, "woocommerce", env.identity.external_id, order, capacity, { wooConnectionId: connectionId, eventType })
    });
    if (outcome.result === "created") {
      try {
        await upsertIntegrationCustomer(companyId, {
          name: envelope.customer.name || "", externalCustomerId: envelope.customer.external_customer_id || "", email: envelope.customer.email || "", phone: envelope.customer.phone || "",
          address: [envelope.customer.billing_address?.street, envelope.customer.billing_address?.city, envelope.customer.billing_address?.postalCode, envelope.customer.billing_address?.country].filter(Boolean).join(", "),
          streetAddress: envelope.customer.billing_address?.street || "", city: envelope.customer.billing_address?.city || "", postalCode: envelope.customer.billing_address?.postalCode || "", country: envelope.customer.billing_address?.country || "",
          shippingAddress: [envelope.customer.shipping_address?.street, envelope.customer.shipping_address?.city, envelope.customer.shipping_address?.postalCode, envelope.customer.shipping_address?.country].filter(Boolean).join(", "),
          shippingStreetAddress: envelope.customer.shipping_address?.street || "", shippingCity: envelope.customer.shipping_address?.city || "", shippingPostalCode: envelope.customer.shipping_address?.postalCode || "", shippingCountry: envelope.customer.shipping_address?.country || "", shippingPhone: envelope.customer.shipping_address?.phone || envelope.customer.phone || ""
        }, "woocommerce");
      } catch (error) { console.warn("woo customer upsert failed:", error?.message || error); }
      await sendPushNotificationToCompany(companyId, { title: "New WooCommerce order", body: `${envelope.customer.name || "Customer"}: ${envelope.source.provider_metadata.design_name}`, orderId: outcome.orderId, type: "woocommerce_order" });
    }
    return outcome;
  }

  async function applyWooCustomer(connectionData, customer) {
    const companyId = String(connectionData.companyId || "");
    const billing = customer?.billing || {};
    const name = [billing.first_name, billing.last_name].map((v) => String(v || "").trim()).filter(Boolean).join(" ") || [customer?.first_name, customer?.last_name].map((v) => String(v || "").trim()).filter(Boolean).join(" ");
    await upsertIntegrationCustomer(companyId, {
      name, externalCustomerId: customer?.id ? String(customer.id) : "", email: String(customer?.email || billing.email || "").trim().toLowerCase(), phone: String(billing.phone || "").trim(),
      address: [billing.address_1, billing.city, billing.postcode, billing.country].map((v) => String(v || "").trim()).filter(Boolean).join(", "),
      streetAddress: String(billing.address_1 || ""), city: String(billing.city || ""), postalCode: String(billing.postcode || ""), country: String(billing.country || ""),
      shippingAddress: "", shippingStreetAddress: "", shippingCity: "", shippingPostalCode: "", shippingCountry: "", shippingPhone: ""
    }, "woocommerce");
    return { result: "updated" };
  }

  // ---- 4. the doorbell -------------------------------------------------------
  const wooConnectorWebhook = onRequest({ region: "europe-west2" }, async (req, res) => {
    try {
      if (req.method !== "POST") { res.status(200).json({ ok: true, message: "NivaDesk WooCommerce webhook endpoint. POST only." }); return; }
      const id = String(req.query?.c || "");
      const token = String(req.query?.t || "");
      const snap = id ? await connections().doc(id).get() : null;
      const data = snap && snap.exists ? (snap.data() || {}) : null;
      if (!data || !timingSafeEqualText(token, data.deliveryToken)) { res.status(401).json({ ok: false, error: "unknown_connection" }); return; }
      const topic = String(req.headers["x-wc-webhook-topic"] || "");
      const deliveryId = String(req.headers["x-wc-webhook-delivery-id"] || req.headers["x-wc-webhook-id"] || "");
      const signature = String(req.headers["x-wc-webhook-signature"] || "");
      const rawBody = req.rawBody || Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}));
      // The ping Woo sends when a webhook is created carries only its own id.
      if (!topic && req.body && typeof req.body === "object" && req.body.webhook_id !== undefined) { res.status(200).json({ ok: true, ping: true }); return; }
      if (!verifyWooSignature(rawBody, signature, unbox(data.webhookSecretEncrypted))) { res.status(401).json({ ok: false, error: "invalid_signature" }); return; }
      if (String(data.status) !== "connected") { res.status(200).json({ ok: true, result: "skipped", reason: `connection_${data.status}` }); return; }
      const payload = typeof req.body === "object" && req.body ? req.body : {};
      const externalId = String(payload?.id || "");
      const eventKey = events.idempotencyKey({ provider: "woocommerce", connectionId: id, eventId: deliveryId, externalId, eventType: topic });
      if (deliveryId) {
        const claim = snap.ref.collection("deliveries").doc(safeIdPart(deliveryId));
        try { await claim.create({ topic, receivedAtMs: now(), expireAt: admin.firestore.Timestamp.fromMillis(now() + DELIVERY_TTL_MS) }); }
        catch { res.status(200).json({ ok: true, duplicate: true }); return; }
      }
      const task = { key: eventKey, provider: "woocommerce", connectionId: id, companyId: String(data.companyId || ""), externalId, eventType: topic, attempt: 1, eventOrigin: "provider", correlationId: events.newCorrelationId() };
      await worker.recordReceived(db(), task, { status: "received", now: now() }).catch(() => undefined);
      await health.touchHealth(db(), { provider: "woocommerce", connectionId: id, companyId: task.companyId, kind: "webhook", now: now(), FieldValue }).catch(() => undefined);
      let outcome;
      if (topic.startsWith("order.")) {
        if (topic === "order.deleted") outcome = { result: "skipped", reason: "deleted_at_provider" };
        else {
          // WOO-007: the payload is a doorbell; the order is fetched again.
          const latest = await clientFor(data).getOrder(externalId);
          outcome = latest ? await applyWooOrder(id, data, latest, { eventKey, eventOrigin: "provider", eventType: topic }) : { result: "skipped", reason: "not_found_at_provider" };
        }
      } else if (topic.startsWith("customer.")) {
        outcome = await applyWooCustomer(data, payload);
      } else {
        outcome = { result: "skipped", reason: `unknown_topic_${topic.replace(/[^a-z_.]/gi, "")}` };
      }
      const status = ["created", "updated", "merged"].includes(outcome.result) ? "applied" : (outcome.result === "invalid" ? "dead" : (outcome.result || "skipped"));
      await worker.eventRef(db(), eventKey).set({ status, result: outcome.result, order_id: outcome.orderId || null, safe_message: outcome.reason || null, finished_at: new Date(now()).toISOString() }, { merge: true }).catch(() => undefined);
      if (status === "applied") await health.touchHealth(db(), { provider: "woocommerce", connectionId: id, companyId: task.companyId, kind: "success", now: now(), FieldValue }).catch(() => undefined);
      res.status(200).json({ ok: true, result: outcome.result });
    } catch (error) {
      console.error("wooConnectorWebhook error:", error?.message || error);
      res.status(500).json({ ok: false });
    }
  });

  /** The queue worker's brain for a WooCommerce task (fetch → normalize → apply), for index.js's dispatcher. */
  async function processWooCommerceTask(task) {
    const snap = await connections().doc(String(task.connectionId || "")).get();
    const data = snap.exists ? (snap.data() || {}) : null;
    if (!data || String(data.status) !== "connected") { const e = new Error(data ? `connection_${data.status}` : "connection_missing"); e.errorClass = "validation"; throw e; }
    const client = clientFor(data);
    return worker.processCommerceEvent(db(), task, {
      fetchLatest: async () => client.getOrder(String(task.externalId || "")),
      normalize: (raw) => raw,   // applyWooOrder normalizes; the worker's apply receives the raw order
      apply: (raw) => applyWooOrder(snap.id, data, raw, { eventKey: task.key, eventOrigin: task.eventOrigin || "retry", eventType: task.eventType }),
      retryAfterOf: (error) => events.parseRetryAfter(error?.retryAfter), now
    });
  }

  // ---- 5. reconciliation and the webhook watch --------------------------------
  async function reconcileConnection(ref, data, { force = false, lookbackMs = null, maxPages = RECONCILE_MAX_PAGES, eventOrigin = "reconcile" } = {}) {
    const companyId = String(data.companyId || "");
    const cursor = await cursors.readCursor(db(), "woocommerce", ref.id);
    const window = cursors.cursorWindow(cursor, now(), { force, lookbackMs: lookbackMs || undefined });
    const client = clientFor(data);
    const audit = { scanned: 0, created: 0, updated: 0, merged: 0, skipped: 0, failed: 0, truncated: false, fromMs: window.fromMs, toMs: window.toMs };
    let page = 1;
    for (;;) {
      const result = await client.listOrders({ modifiedAfterIso: new Date(window.fromMs).toISOString(), page, perPage: 50 });
      for (const order of result.orders) {
        audit.scanned += 1;
        try {
          const outcome = await applyWooOrder(ref.id, data, order, { eventOrigin, eventKey: events.idempotencyKey({ provider: "woocommerce", connectionId: ref.id, externalId: String(order?.id || ""), eventType: `${eventOrigin}@${order?.date_modified_gmt || ""}` }) });
          if (outcome.result === "created") audit.created += 1; else if (outcome.result === "updated") audit.updated += 1; else if (outcome.result === "merged") audit.merged += 1; else audit.skipped += 1;
        } catch (error) { audit.failed += 1; console.warn("woo reconcile: order failed", ref.id, order?.id, error?.message || error); }
      }
      if (page >= result.totalPages || result.orders.length === 0) break;
      if (page >= maxPages) { audit.truncated = true; break; }
      page += 1;
    }
    const complete = !audit.truncated && audit.failed === 0;
    await cursors.recordPass(db(), { provider: "woocommerce", connectionId: ref.id, companyId, fromMs: window.fromMs, toMs: window.toMs, complete, scanned: audit.scanned, applied: audit.created + audit.updated + audit.merged, failed: audit.failed, truncated: audit.truncated, now: now() });
    await health.touchHealth(db(), { provider: "woocommerce", connectionId: ref.id, companyId, kind: complete ? "success" : "attempt", now: now(), FieldValue });
    // WOO-009: a webhook WooCommerce switched off after failures is a silent outage.
    let webhooksHealthy = true;
    try {
      const live = await client.listWebhooks();
      const ours = (Array.isArray(data.webhooks) ? data.webhooks : []).map((h) => ({ ...h, status: String(live.find((l) => String(l.id) === String(h.id))?.status || "missing") }));
      webhooksHealthy = ours.length === WEBHOOK_TOPICS.length && ours.every((h) => h.status === "active");
      await ref.set({ webhooks: ours, webhooksHealthy, lastSyncAtMs: now(), ...(complete ? { lastSuccessAtMs: now() } : {}), lastErrorCode: webhooksHealthy ? "" : "webhook_disabled", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      await ref.set({ lastSyncAtMs: now(), lastErrorCode: events.classifyError(error) === "auth" ? "credentials_rejected" : "webhook_check_failed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return { ...audit, complete, webhooksHealthy };
  }

  const reconcileWooConnections = onSchedule
    ? onSchedule({ schedule: "every 15 minutes", timeZone: "Europe/London", region: "europe-west2", timeoutSeconds: 540 }, async () => {
        const snap = await connections().where("status", "==", "connected").get();
        const due = snap.docs.map((d) => ({ ref: d.ref, data: d.data() || {} })).filter((r) => r.data.settings?.autoSync !== false).sort((a, b) => Number(a.data.lastSyncAtMs || 0) - Number(b.data.lastSyncAtMs || 0)).slice(0, MAX_CONNECTIONS_PER_SWEEP);
        let swept = 0; let failed = 0;
        for (const row of due) {
          try { await reconcileConnection(row.ref, row.data); swept += 1; }
          catch (error) { failed += 1; console.warn("woo reconcile failed:", row.ref.id, error?.message || error); }
        }
        console.log(`woo reconcile sweep: ${swept} connection(s), ${failed} failed, ${snap.size} connected`);
      })
    : null;

  const syncWooNow = onCall({ region: "europe-west2", timeoutSeconds: 300 }, async (request) => {
    const { companyId } = await requireWorkspaceMember(request);
    const { ref, data } = await loadOwnedConnection(companyId, request.data?.connectionId);
    if (String(data.status) !== "connected") throw new HttpsError("failed-precondition", "This store is not connected.");
    if (Number(data.syncLockUntilMs || 0) > now()) throw new HttpsError("failed-precondition", "A sync is already running for this store.");   // REC-007
    await ref.set({ syncLockUntilMs: now() + SYNC_LOCK_MS }, { merge: true });
    try {
      const audit = await reconcileConnection(ref, data, { force: true, lookbackMs: 24 * 60 * 60 * 1000 });
      return { ok: true, ...audit };
    } finally { await ref.set({ syncLockUntilMs: 0 }, { merge: true }); }
  });

  const recreateWooWebhooks = onCall({ region: "europe-west2", timeoutSeconds: 120 }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref, data } = await loadOwnedConnection(companyId, request.data?.connectionId);
    const client = clientFor(data);
    for (const hook of Array.isArray(data.webhooks) ? data.webhooks : []) { if (hook.id) { try { await client.deleteWebhook(hook.id); } catch { /* best-effort */ } } }
    const { webhooks, secret, deliveryToken } = await ensureWebhooks(ref.id, { ...data, webhooks: [] }, client);
    await ref.set({ webhooks, webhooksHealthy: true, webhookSecretEncrypted: box(secret), deliveryToken, lastErrorCode: "", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true, webhooks: webhooks.map((h) => ({ topic: h.topic, status: h.status })) };
  });

  // ---- 6. import preview and backfill (§10.4) ---------------------------------
  const previewWooImport = onCall({ region: "europe-west2", timeoutSeconds: 120 }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref, data } = await loadOwnedConnection(companyId, request.data?.connectionId);
    const days = Math.min(Math.max(Number(request.data?.days) || 30, 1), 365);
    const client = clientFor(data);
    const afterIso = new Date(now() - days * 86400000).toISOString();
    const summary = { total: 0, paid: 0, unpaid: 0, cancelled: 0, alreadyHere: 0, truncated: false };
    const sample = [];
    for (let page = 1; page <= 2; page += 1) {
      const result = await client.listOrders({ afterIso, page, perPage: 50 });
      for (const order of result.orders) {
        summary.total += 1;
        const env = normalizeWooOrder(order, { connectionId: ref.id, siteUrl: data.siteUrl, storeName: data.storeName, eventOrigin: "import" });
        if (env.order.platform_status === "cancelled") summary.cancelled += 1; else if (["paid", "partially_refunded", "refunded"].includes(env.order.payment_status)) summary.paid += 1; else summary.unpaid += 1;
        if ((await orderDocRef(wooOrderDocId(companyId, env.identity.external_id)).get()).exists) summary.alreadyHere += 1;
        if (sample.length < 10) sample.push({ id: env.identity.external_id, number: env.source.provider_metadata.order_number, status: env.order.platform_status, total: env.order.grand_total, currency: env.order.currency, customer: env.customer.name || "", placedAt: env.order.placed_at });
      }
      if (page >= result.totalPages || result.orders.length === 0) break;
      if (page === 2 && result.totalPages > 2) summary.truncated = true;
    }
    return { ok: true, days, summary, sample };
  });

  const runWooImport = onCall({ region: "europe-west2", timeoutSeconds: 540 }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref, data } = await loadOwnedConnection(companyId, request.data?.connectionId);
    const days = Math.min(Math.max(Number(request.data?.days) || 30, 1), 365);
    const client = clientFor(data);
    const afterIso = new Date(now() - days * 86400000).toISOString();
    const counters = { scanned: 0, created: 0, updated: 0, merged: 0, skipped: 0, held: 0, failed: 0, truncated: false };
    await ref.set({ importState: "running", importStartedAtMs: now() }, { merge: true });
    for (let page = 1; page <= IMPORT_MAX_PAGES; page += 1) {
      const result = await client.listOrders({ afterIso, page, perPage: 50 });
      for (const order of result.orders) {
        counters.scanned += 1;
        try {
          const outcome = await applyWooOrder(ref.id, data, order, { eventOrigin: "import", eventKey: events.idempotencyKey({ provider: "woocommerce", connectionId: ref.id, externalId: String(order?.id || ""), eventType: `import@${order?.date_modified_gmt || ""}` }) });
          if (outcome.result === "created") counters.created += 1; else if (outcome.result === "updated") counters.updated += 1; else if (outcome.result === "merged") counters.merged += 1; else if (outcome.result === "held") counters.held += 1; else counters.skipped += 1;
        } catch (error) { counters.failed += 1; console.warn("woo import: order failed", ref.id, order?.id, error?.message || error); }
      }
      if (page >= result.totalPages || result.orders.length === 0) break;
      if (page === IMPORT_MAX_PAGES && result.totalPages > IMPORT_MAX_PAGES) counters.truncated = true;
    }
    await ref.set({ importState: "done", importFinishedAtMs: now(), importCounters: counters, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true, days, ...counters };
  });

  return {
    beginWooConnect, wooAuthCallback, finishWooConnect, getWooConnections, disconnectWooShop,
    wooConnectorWebhook, reconcileWooConnections, syncWooNow, recreateWooWebhooks, previewWooImport, runWooImport,
    _internal: { applyWooOrder, applyWooCustomer, reconcileConnection, processWooCommerceTask, publicView, connectionDocId, ensureWebhooks, findInstallmentCandidate, CONNECTION_COLLECTION, STATE_COLLECTION, WEBHOOK_TOPICS }
  };
}

module.exports = { createWooConnectorFunctions, CONNECTION_COLLECTION, STATE_COLLECTION, WEBHOOK_TOPICS, connectionDocId };

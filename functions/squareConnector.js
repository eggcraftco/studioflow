// The Square connector (Square spec §3–§14) — a merchant becomes one
// commerce connection on the common engine; its locations are channel
// locations under it (SQ-GOAL-002/003), never connections of their own.
//
//   * Connecting is Square's OAuth code flow for a server-held client
//     (SQ-AUTH-004): the state is a single-use document consumed in a
//     transaction, the code is exchanged server to server, and the merchant
//     and locations are read from the API rather than trusted from the
//     callback (SQ-AUTH-010, SQ-LOC-001). Tokens are boxed at rest under
//     their own key and refreshed ahead of expiry behind a per-connection
//     lock (SQ-AUTH-005/006/007).
//   * Webhooks are application-level: one subscription, one signature key,
//     and the verified merchant_id routes the event to its connection
//     (SQ-WEB-006). The signature is over the registered URL and the raw
//     body (SQ-WEB-001/002); the event id is the idempotency key
//     (SQ-WEB-005); the gateway records and queues, then answers (SQ-WEB-008).
//   * An event is a doorbell: the order, payment or refund is fetched again
//     before it is applied (§7.4), through the same engine every path uses
//     (SQ-ORD-011). A payment or refund never creates an order (SQ-PAY-006);
//     it is recorded beside the order it names, or as unmatched.
//   * Reconciliation runs SearchOrders over the selected locations on the
//     common cursor with an overlap (SQ-REC-004..007), payments and events
//     on cursors of their own (SQ-REC-009), and the Events API — when the
//     application token is configured — recovers what a webhook missed
//     (SQ-REC-001), inside its 28-day window.
//   * Which sales become workflow orders is the connection's import policy
//     (§8.5, SQ-OPEN-001 default): every sale is recorded for finance; only
//     sales with a fulfilment (or, when chosen, all of them) become orders.
const crypto = require("crypto");
const engine = require("./commerce/engine");
const cursors = require("./commerce/cursors");
const health = require("./commerce/health");
const events = require("./commerce/events");
const worker = require("./commerce/worker");
const { normalizeSquareOrder, normalizeSquarePayment, normalizeSquareRefund, squareMoneyToDecimal, isSquareReturnOrder, returnSourceOrderId } = require("./commerce/adapters/square");
const { sumDecimal } = require("./commerce/money");
const { verifySquareSignature } = require("./commerce/square/signature");
const squareOAuth = require("./commerce/square/oauth");
const { createSquareClient, createSquareEventsClient } = require("./commerce/square/client");

const CONNECTION_COLLECTION = "squareConnections";
const STATE_COLLECTION = "squareConnectStates";
const PAYMENTS_SUBCOLLECTION = "squarePayments";
const REFUNDS_SUBCOLLECTION = "squareRefunds";
const SALES_SUBCOLLECTION = "squareSales";
const PAYOUTS_SUBCOLLECTION = "squarePayouts";
const PAYOUT_PASS_MIN_INTERVAL_MS = 60 * 60 * 1000;   // §14.3: payouts every 1–6 hours is plenty
const STATE_TTL_MS = 10 * 60 * 1000;
const DELIVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_AHEAD_MS = 3 * 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_LOCK_MS = 60 * 1000;
const MAX_CONNECTIONS_PER_SWEEP = 25;
const RECONCILE_MAX_PAGES = 4;
const IMPORT_MAX_PAGES = 20;
const SYNC_LOCK_MS = 3 * 60 * 1000;
const LOCATIONS_PER_SEARCH = 10;   // SQ-LOC-007: Square's cap per SearchOrders call
const IMPORT_POLICIES = ["all", "fulfillment_only", "none"];
const SQUARE_SOURCES = ["SQUARE_POS", "SQUARE_ONLINE", "INVOICE", "APPOINTMENTS", "VIRTUAL_TERMINAL", "API", "OTHER"];
const ORDER_EVENTS = new Set(["order.created", "order.updated", "order.fulfillment.updated"]);
const PAYMENT_EVENTS = new Set(["payment.created", "payment.updated"]);
const REFUND_EVENTS = new Set(["refund.created", "refund.updated"]);

function safeIdPart(value) { return String(value || "").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120); }
function connectionDocId(companyId, merchantId) { return `${safeIdPart(companyId)}__${safeIdPart(merchantId)}`; }
function squareOrderDocId(companyId, orderId) { return `square_${safeIdPart(companyId)}_${safeIdPart(orderId)}`; }
function chunk(list, size) { const out = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; }

function createSquareConnectorFunctions(deps) {
  const {
    admin, onCall, onRequest, onSchedule = null, HttpsError,
    applicationId, applicationSecret, webhookSignatureKey, appAccessToken = () => "", tokenKey, environment = () => "production",
    encryptToken, decryptToken,
    requireWorkspaceOwner, requireWorkspaceMember,
    appReturnUrl, functionsBaseUrl, redirectUri,
    orderDocRef, integrationOrderCapacity, holdIntegrationOrder,
    upsertIntegrationCustomer, sendPushNotificationToCompany = async () => {},
    reconcileLineItems, resolveDefaultDeliveryTime, companySettingsDocRef,
    enqueue = null,
    createClient = createSquareClient, createEventsClient = createSquareEventsClient, oauth = squareOAuth, fetchImpl = globalThis.fetch,
    now = () => Date.now()
  } = deps;

  const db = () => admin.firestore();
  const connections = () => db().collection(CONNECTION_COLLECTION);
  const states = () => db().collection(STATE_COLLECTION);
  const FieldValue = admin.firestore.FieldValue;
  const env = () => squareOAuth.squareEnvironment(environment());
  const notificationUrl = () => `${functionsBaseUrl()}/squareWebhook`;
  const appToken = () => { const v = String(appAccessToken() || "").trim(); return v.length >= 10 ? v : ""; };

  // ---- secrets at rest ------------------------------------------------------
  const box = (plain) => encryptToken(plain, tokenKey());
  const unbox = (b) => (b && typeof b === "object" ? decryptToken(b, tokenKey()) : "");

  // SQ-AUTH-006/007 — refresh ahead of expiry, one flight per connection.
  async function refreshTokenWithLock(ref, { force = false } = {}) {
    const claimed = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const row = snap.exists ? (snap.data() || {}) : null;
      if (!row) return null;
      if (Number(row.tokenRefreshLockUntilMs || 0) > now()) return { locked: true, row };
      if (!force && Number(row.tokenExpiresAtMs || 0) - now() > TOKEN_REFRESH_AHEAD_MS) return { fresh: true, row };
      tx.update(ref, { tokenRefreshLockUntilMs: now() + TOKEN_REFRESH_LOCK_MS });
      return { row };
    });
    if (!claimed) return "";
    if (claimed.locked || claimed.fresh) return unbox(claimed.row.accessTokenEncrypted);
    const refreshToken = unbox(claimed.row.refreshTokenEncrypted);
    if (!refreshToken) { await ref.set({ status: "reconnect_required", lastErrorCode: "refresh_token_missing", tokenRefreshLockUntilMs: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); return ""; }
    try {
      const tokens = await oauth.refreshAccessToken({ environment: env(), applicationId: applicationId(), applicationSecret: applicationSecret(), refreshToken, fetchImpl });
      const accessToken = String(tokens?.access_token || "");
      if (!accessToken) throw new Error("square_refresh_incomplete");
      await ref.set({
        accessTokenEncrypted: box(accessToken), ...(tokens?.refresh_token ? { refreshTokenEncrypted: box(String(tokens.refresh_token)) } : {}),
        tokenExpiresAtMs: tokens?.expires_at ? Date.parse(tokens.expires_at) || 0 : 0, tokenRefreshedAtMs: now(), tokenRefreshLockUntilMs: 0,
        ...(String(claimed.row.status) === "reconnect_required" ? { status: "connected" } : {}), lastErrorCode: "", updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return accessToken;
    } catch (error) {
      const cls = events.classifyError(error);
      await ref.set({ tokenRefreshLockUntilMs: 0, ...(cls === "auth" || cls === "permission" || cls === "validation" ? { status: "reconnect_required", lastErrorCode: "token_refresh_failed" } : { lastErrorCode: "token_refresh_transient" }), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return "";
    }
  }

  async function clientFor(ref, data) {
    let accessToken = unbox(data.accessTokenEncrypted);
    if (!accessToken) { const e = new Error("square_credentials_missing"); e.errorClass = "auth"; throw e; }
    if (Number(data.tokenExpiresAtMs || 0) && Number(data.tokenExpiresAtMs) - now() < TOKEN_REFRESH_AHEAD_MS) accessToken = (await refreshTokenWithLock(ref)) || accessToken;
    return createClient({ environment: env(), accessToken, fetchImpl, onUnauthorized: () => refreshTokenWithLock(ref, { force: true }) });
  }

  function settingsOf(data) {
    const s = data.settings || {};
    return {
      autoSync: s.autoSync !== false,
      importPolicy: IMPORT_POLICIES.includes(s.importPolicy) ? s.importPolicy : "fulfillment_only",
      importSources: Array.isArray(s.importSources) && s.importSources.length ? s.importSources.filter((v) => SQUARE_SOURCES.includes(v)) : SQUARE_SOURCES.slice(),
      recordAllSales: s.recordAllSales !== false
    };
  }

  function publicView(id, data, extra = {}) {
    const locations = Array.isArray(data.locations) ? data.locations : [];
    const selected = new Set(Array.isArray(data.selectedLocationIds) ? data.selectedLocationIds : []);
    return {
      id, provider: "square", merchantId: String(data.merchantId || ""), merchantName: String(data.merchantName || ""), environment: String(data.environment || "production"),
      status: String(data.status || "pending"), scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
      locations: locations.map((l) => ({ id: String(l.id || ""), name: String(l.name || ""), status: String(l.status || ""), selected: selected.has(String(l.id || "")) })),
      selectedLocationIds: [...selected], settings: settingsOf(data),
      connectedAtMs: Number(data.connectedAtMs || 0), lastSyncAtMs: Number(data.lastSyncAtMs || 0), lastSuccessAtMs: Number(data.lastSuccessAtMs || 0),
      lastErrorCode: String(data.lastErrorCode || ""), importState: String(data.importState || "none"),
      apiVersion: squareOAuth.SQUARE_API_VERSION, tokenExpiresAtMs: Number(data.tokenExpiresAtMs || 0),
      eventsRecovery: Boolean(appToken()), capabilityProfile: "read_first",
      ...extra
    };
  }

  async function loadOwnedConnection(companyId, connectionId) {
    const snap = await connections().doc(String(connectionId || "")).get();
    const data = snap.exists ? (snap.data() || {}) : null;
    if (!data || String(data.companyId || "") !== companyId) throw new HttpsError("not-found", "No such Square connection in this workspace.");
    return { ref: snap.ref, data };
  }

  function connectRedirect(res, params) {
    const url = new URL(appReturnUrl());
    url.searchParams.set("section", "square");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    res.redirect(302, url.toString());
  }

  // ---- 1. begin: the owner presses Connect Square ------------------------------
  const beginSquareConnect = onCall({ region: "europe-west2" }, async (request) => {
    const { uid, companyId } = await requireWorkspaceOwner(request);
    const state = crypto.randomBytes(24).toString("base64url");
    await states().doc(state).set({
      companyId, uid, environment: env(), used: false, createdAt: FieldValue.serverTimestamp(),
      expiresAt: now() + STATE_TTL_MS, expireAt: admin.firestore.Timestamp.fromMillis(now() + STATE_TTL_MS)
    });
    return { ok: true, state, environment: env(), scopes: squareOAuth.READ_SCOPES.slice(), authorizeUrl: oauth.squareAuthorizeUrl({ environment: env(), applicationId: applicationId(), state }) };
  });

  // ---- 2. callback: Square sends the merchant's browser back with a code -------
  const squareOAuthCallback = onRequest({ region: "europe-west2", timeoutSeconds: 120 }, async (req, res) => {
    const state = String(req.query?.state || "");
    const code = String(req.query?.code || "");
    const denied = String(req.query?.error || "");
    if (denied) { connectRedirect(res, { square: "cancelled" }); return; }
    if (!state || !code) { connectRedirect(res, { square: "error", reason: "missing_code" }); return; }
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
    } catch (error) { console.error("squareOAuthCallback state failed:", error?.message || error); }
    if (!stateData) { connectRedirect(res, { square: "error", reason: "state" }); return; }
    if (String(stateData.environment || "production") !== env()) { connectRedirect(res, { square: "error", reason: "environment" }); return; }   // SQ-AUTH-009
    try {
      const tokens = await oauth.exchangeAuthorizationCode({ environment: env(), applicationId: applicationId(), applicationSecret: applicationSecret(), code, redirectUri: redirectUri ? redirectUri() : null, fetchImpl });
      const accessToken = String(tokens?.access_token || "");
      const refreshToken = String(tokens?.refresh_token || "");
      if (!accessToken || !refreshToken) throw new Error("square_token_incomplete");
      // SQ-AUTH-010: the merchant is whoever the token says, from the API.
      const client = createClient({ environment: env(), accessToken, fetchImpl });
      const merchant = await client.getMerchant();
      const merchantId = String(merchant?.id || "");
      if (!merchantId || (tokens?.merchant_id && String(tokens.merchant_id) !== merchantId)) throw new Error("square_merchant_mismatch");
      let scopes = [];
      try { scopes = (await oauth.tokenStatus({ environment: env(), accessToken, fetchImpl })).scopes; } catch { scopes = squareOAuth.READ_SCOPES.slice(); }
      const locations = (await client.listLocations()).map((l) => ({ id: String(l.id || ""), name: String(l.name || ""), status: String(l.status || ""), currency: String(l.currency || ""), timezone: String(l.timezone || "") }));
      const id = connectionDocId(stateData.companyId, merchantId);
      const existingSnap = await connections().doc(id).get();
      const existing = existingSnap.exists ? (existingSnap.data() || {}) : {};
      const active = locations.filter((l) => l.status === "ACTIVE").map((l) => l.id);
      const previouslySelected = Array.isArray(existing.selectedLocationIds) ? existing.selectedLocationIds.filter((v) => active.includes(v)) : [];
      await connections().doc(id).set({
        companyId: String(stateData.companyId), provider: "square", merchantId, merchantName: String(merchant?.business_name || "").slice(0, 200),
        merchantCountry: String(merchant?.country || ""), merchantCurrency: String(merchant?.currency || ""), environment: env(), status: "connected", scopes,
        accessTokenEncrypted: box(accessToken), refreshTokenEncrypted: box(refreshToken),
        tokenExpiresAtMs: tokens?.expires_at ? Date.parse(tokens.expires_at) || 0 : 0, tokenRefreshLockUntilMs: 0,
        locations, selectedLocationIds: previouslySelected.length ? previouslySelected : active,
        settings: { autoSync: true, importPolicy: "fulfillment_only", importSources: SQUARE_SOURCES.slice(), recordAllSales: true, ...(existing.settings || {}) },
        importState: existing.importState || "none", connectedAtMs: existing.connectedAtMs || now(), connectedByUid: String(stateData.uid || ""), connectState: state,
        apiVersion: squareOAuth.SQUARE_API_VERSION, lastErrorCode: "", updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      await states().doc(state).set({ connectionId: id }, { merge: true });
      await health.touchHealth(db(), { provider: "square", connectionId: id, companyId: String(stateData.companyId), kind: "success", now: now(), FieldValue }).catch(() => undefined);
      connectRedirect(res, { square: "connected" });
    } catch (error) {
      console.error("squareOAuthCallback failed:", String(error?.message || error).slice(0, 200));
      connectRedirect(res, { square: "error", reason: events.classifyError(error) === "auth" ? "token" : "exchange" });
    }
  });

  const getSquareConnections = onCall({ region: "europe-west2" }, async (request) => {
    const { companyId } = await requireWorkspaceMember(request);
    const snap = await connections().where("companyId", "==", companyId).get();
    const rows = [];
    for (const doc of snap.docs) {
      let unmatched = 0;
      try { unmatched = (await db().collection("companies").doc(companyId).collection(PAYMENTS_SUBCOLLECTION).where("connectionId", "==", doc.id).where("unmatched", "==", true).count().get()).data().count; } catch { unmatched = 0; }
      rows.push(publicView(doc.id, doc.data() || {}, { unmatchedPayments: unmatched }));
    }
    return { ok: true, connections: rows };
  });

  // SQ-LOC-002, §8.5 — which locations, which sources, which sales become orders.
  const updateSquareConnectionSettings = onCall({ region: "europe-west2" }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref, data } = await loadOwnedConnection(companyId, request.data?.connectionId);
    const patch = { updatedAt: FieldValue.serverTimestamp() };
    const input = request.data || {};
    if (Array.isArray(input.selectedLocationIds)) {
      const known = new Set((Array.isArray(data.locations) ? data.locations : []).map((l) => String(l.id || "")));
      const chosen = [...new Set(input.selectedLocationIds.map(String).filter((v) => known.has(v)))];
      if (!chosen.length) throw new HttpsError("invalid-argument", "Select at least one location.");
      patch.selectedLocationIds = chosen;
    }
    const settings = { ...settingsOf(data) };
    if (typeof input.autoSync === "boolean") settings.autoSync = input.autoSync;
    if (typeof input.recordAllSales === "boolean") settings.recordAllSales = input.recordAllSales;
    if (input.importPolicy !== undefined) {
      if (!IMPORT_POLICIES.includes(input.importPolicy)) throw new HttpsError("invalid-argument", "importPolicy must be all, fulfillment_only or none.");
      settings.importPolicy = input.importPolicy;
    }
    if (Array.isArray(input.importSources)) {
      const chosen = [...new Set(input.importSources.map(String).filter((v) => SQUARE_SOURCES.includes(v)))];
      if (!chosen.length) throw new HttpsError("invalid-argument", "Select at least one Square source.");
      settings.importSources = chosen;
    }
    patch.settings = settings;
    await ref.set(patch, { merge: true });
    return { ok: true, connection: publicView(ref.id, (await ref.get()).data() || {}) };
  });

  const disconnectSquare = onCall({ region: "europe-west2", timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref, data } = await loadOwnedConnection(companyId, request.data?.connectionId);
    let revoked = false;
    try {
      const accessToken = unbox(data.accessTokenEncrypted);
      if (accessToken) revoked = (await oauth.revokeToken({ environment: env(), applicationId: applicationId(), applicationSecret: applicationSecret(), accessToken, fetchImpl })).ok;   // SQ-SEC-008
    } catch (error) { console.warn("square revoke failed:", String(error?.message || error).slice(0, 120)); }
    await ref.set({
      status: "disconnected", accessTokenEncrypted: FieldValue.delete(), refreshTokenEncrypted: FieldValue.delete(), tokenExpiresAtMs: 0, tokenRefreshLockUntilMs: 0,
      disconnectedAtMs: now(), updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { ok: true, revoked, ordersKept: true };
  });

  // ---- the apply path every event and every pass goes through ------------------
  function locationName(data, locationId) {
    const found = (Array.isArray(data.locations) ? data.locations : []).find((l) => String(l.id) === String(locationId));
    return found ? String(found.name || "") : "";
  }

  async function recordSale(companyId, connectionId, envelope, order) {
    const ref = db().collection("companies").doc(companyId).collection(SALES_SUBCOLLECTION).doc(safeIdPart(envelope.identity.external_id));
    await ref.set({
      provider: "square", connectionId, orderExternalId: envelope.identity.external_id, locationId: String(order?.location_id || ""),
      squareSource: envelope.source.provider_metadata.square_source, state: String(order?.state || ""), paymentStatus: envelope.order.payment_status,
      grandTotal: envelope.order.grand_total, taxTotal: envelope.order.tax_total, discountTotal: envelope.order.discount_total, tipTotal: envelope.source.provider_metadata.tip_total, currency: envelope.order.currency,
      lineSummary: envelope.source.provider_metadata.design_name, itemCount: envelope.order.line_items.length, hasFulfillment: envelope.source.provider_metadata.has_fulfillment,
      // nivadeskOrderId is set once the engine names the order (below) and never blanked by a later pass.
      externalCreatedAt: envelope.order.placed_at, externalUpdatedAt: envelope.identity.external_updated_at, updatedAtMs: now()
    }, { merge: true });
    return ref;
  }

  /** The refunds NivaDesk already holds for a sale, so the order's payment status reflects them (SQ-REF-004/005). */
  async function refundsRecordedFor(companyId, orderExternalId) {
    if (!orderExternalId) return [];
    const snap = await db().collection("companies").doc(companyId).collection(REFUNDS_SUBCOLLECTION).where("orderExternalId", "==", String(orderExternalId)).limit(50).get();
    return snap.docs.map((d) => { const r = d.data() || {}; return { externalId: r.externalId, amount: r.amount, currency: r.currency, reason: r.reason, status: r.status, externalCreatedAt: r.externalCreatedAt }; });
  }

  async function applySquareOrder(ref, data, order, { eventKey = null, eventOrigin = "provider", eventType = "", client = null, viaReturn = false } = {}) {
    const companyId = String(data.companyId || "");
    const settings = settingsOf(data);
    // SQ-REF-002 / SQ-AC-012: Square's return order is the refund's own record,
    // never a sale. The sale it points at is refreshed instead, so the refund
    // shows on the order the customer actually placed.
    if (isSquareReturnOrder(order)) {
      const sourceId = returnSourceOrderId(order);
      if (sourceId && client && !viaReturn) {
        try { const source = await client.getOrder(sourceId); if (source) await applySquareOrder(ref, data, source, { eventKey: eventKey ? `${eventKey}#source` : null, eventOrigin, eventType, client, viaReturn: true }); }
        catch (error) { console.warn("square return→source refresh failed:", error?.message || error); }
      }
      return { result: "skipped", reason: "return_order", sourceOrderExternalId: sourceId };
    }
    const locationId = String(order?.location_id || "");
    const selected = new Set(Array.isArray(data.selectedLocationIds) ? data.selectedLocationIds.map(String) : []);
    if (locationId && selected.size && !selected.has(locationId)) return { result: "skipped", reason: "location_not_selected" };   // SQ-TEST-017
    let customer = null;
    if (order?.customer_id && client) { try { customer = await client.getCustomer(String(order.customer_id)); } catch { customer = null; } }
    const refunds = await refundsRecordedFor(companyId, String(order?.id || "")).catch(() => []);
    const envelope = normalizeSquareOrder(order, { connectionId: ref.id, environment: env(), merchantId: data.merchantId, merchantName: data.merchantName, locationName: locationName(data, locationId), customer, refunds, eventOrigin, rawSnapshotRef: eventKey });
    const externalId = envelope.identity.external_id;
    if (!externalId) return { result: "invalid", problems: ["missing_external_id"] };
    if (!settings.importSources.includes(envelope.source.provider_metadata.square_source)) return { result: "skipped", reason: "source_not_selected" };
    const state = String(order?.state || "").toUpperCase();
    if (state === "DRAFT") return { result: "skipped", reason: "draft" };
    if (settings.recordAllSales && state !== "DRAFT") await recordSale(companyId, ref.id, envelope, order);   // §8.5: nothing is lost from finance
    const docId = squareOrderDocId(companyId, externalId);
    const existing = await orderDocRef(docId).get();
    if (!existing.exists) {
      if (!settings.autoSync && eventOrigin !== "import") return { result: "skipped", reason: "auto_sync_off" };
      if (settings.importPolicy === "none") return { result: "skipped", reason: "policy_none" };
      if (settings.importPolicy === "fulfillment_only" && !envelope.source.provider_metadata.has_fulfillment) return { result: "skipped", reason: "policy_fulfillment_only" };
      if (state === "OPEN" && envelope.order.payment_status !== "paid" && !envelope.source.provider_metadata.has_fulfillment) return { result: "skipped", reason: "open_unpaid" };
    }
    const settingsSnap = await companySettingsDocRef(companyId).get();
    const outcome = await engine.applyEnvelope(db(), envelope, {
      companyId, mode: "apply", source: "square", eventKey,
      orderIdFor: () => docId,
      defaultDeliveryTime: resolveDefaultDeliveryTime(settingsSnap.data()),
      defaultStatus: "Not Yet", syncCancellations: true, reconcileLineItems,
      capacity: async () => { const c = await db().collection("companies").doc(companyId).get(); return integrationOrderCapacity(companyId, c.data() || {}); },
      hold: async (env2, capacity) => holdIntegrationOrder(companyId, "square", env2.identity.external_id, order, capacity, { squareConnectionId: ref.id, eventType })
    });
    if (outcome.orderId && settings.recordAllSales && ["created", "updated", "noop", "duplicate", "stale"].includes(outcome.result)) {
      await db().collection("companies").doc(companyId).collection(SALES_SUBCOLLECTION).doc(safeIdPart(externalId)).set({ nivadeskOrderId: outcome.orderId }, { merge: true }).catch(() => undefined);
    }
    if (outcome.result === "created") {
      try {
        const b = envelope.customer.billing_address || {}; const s = envelope.customer.shipping_address || {};
        await upsertIntegrationCustomer(companyId, {
          name: envelope.customer.name || "", externalCustomerId: envelope.customer.external_customer_id || "", email: envelope.customer.email || "", phone: envelope.customer.phone || "",
          address: [b.street, b.city, b.postalCode, b.country].filter(Boolean).join(", "), streetAddress: b.street || "", city: b.city || "", postalCode: b.postalCode || "", country: b.country || "",
          shippingAddress: [s.street, s.city, s.postalCode, s.country].filter(Boolean).join(", "), shippingStreetAddress: s.street || "", shippingCity: s.city || "", shippingPostalCode: s.postalCode || "", shippingCountry: s.country || "", shippingPhone: s.phone || envelope.customer.phone || ""
        }, "square");
      } catch (error) { console.warn("square customer upsert failed:", error?.message || error); }
      await sendPushNotificationToCompany(companyId, { title: "New Square order", body: `${envelope.customer.name || "Customer"}: ${envelope.source.provider_metadata.design_name}`, orderId: outcome.orderId, type: "square_order" });
    }
    return outcome;
  }

  /** SQ-PAY-001..010 — a payment is recorded once under its own id and linked to the order it names; never an order of its own. */
  async function recordPayment(ref, data, payment) {
    const companyId = String(data.companyId || "");
    const row = normalizeSquarePayment(payment, { connectionId: ref.id, companyId });
    if (!row.externalId) return { result: "invalid", problems: ["missing_payment_id"] };
    const orderDoc = row.orderExternalId ? await orderDocRef(squareOrderDocId(companyId, row.orderExternalId)).get() : null;
    const linkedOrderId = orderDoc && orderDoc.exists ? orderDoc.id : null;
    const paymentsRef = db().collection("companies").doc(companyId).collection(PAYMENTS_SUBCOLLECTION).doc(safeIdPart(row.externalId));
    const before = await paymentsRef.get();
    const prior = before.exists ? (before.data() || {}) : null;
    if (prior && prior.externalUpdatedAt && row.externalUpdatedAt && Date.parse(prior.externalUpdatedAt) > Date.parse(row.externalUpdatedAt)) return { result: "stale", paymentId: paymentsRef.id };
    await paymentsRef.set({ ...row, nivadeskOrderId: linkedOrderId, unmatched: !linkedOrderId, updatedAtMs: now(), ...(prior ? {} : { createdAtMs: now() }) }, { merge: true });
    await health.touchHealth(db(), { provider: "square", connectionId: ref.id, companyId, entity: "finance", kind: "success", now: now(), FieldValue }).catch(() => undefined);
    return { result: prior ? "updated" : "created", paymentId: paymentsRef.id, orderId: linkedOrderId, unmatched: !linkedOrderId };
  }

  async function recordRefund(ref, data, refund) {
    const companyId = String(data.companyId || "");
    const row = normalizeSquareRefund(refund, { connectionId: ref.id, companyId });
    if (!row.externalId) return { result: "invalid", problems: ["missing_refund_id"] };
    // A refund's own order_id is Square's return order; the sale is the one the
    // payment was taken for (SQ-REF-002). Fall back to the refund's order only
    // when the payment is unknown to us.
    const returnOrderExternalId = row.orderExternalId || null;
    let orderExternalId = "";
    if (row.paymentExternalId) {
      const p = await db().collection("companies").doc(companyId).collection(PAYMENTS_SUBCOLLECTION).doc(safeIdPart(row.paymentExternalId)).get();
      orderExternalId = p.exists ? String((p.data() || {}).orderExternalId || "") : "";
    }
    if (!orderExternalId) orderExternalId = returnOrderExternalId || "";
    const orderDoc = orderExternalId ? await orderDocRef(squareOrderDocId(companyId, orderExternalId)).get() : null;
    const linkedOrderId = orderDoc && orderDoc.exists ? orderDoc.id : null;
    const refundsRef = db().collection("companies").doc(companyId).collection(REFUNDS_SUBCOLLECTION).doc(safeIdPart(row.externalId));
    const before = await refundsRef.get();
    const prior = before.exists ? (before.data() || {}) : null;
    await refundsRef.set({ ...row, orderExternalId: orderExternalId || null, returnOrderExternalId, nivadeskOrderId: linkedOrderId, unmatched: !linkedOrderId, updatedAtMs: now(), ...(prior ? {} : { createdAtMs: now() }) }, { merge: true });
    if (row.paymentExternalId) {
      await db().collection("companies").doc(companyId).collection(PAYMENTS_SUBCOLLECTION).doc(safeIdPart(row.paymentExternalId)).set({ lastRefundExternalId: row.externalId, lastRefundStatus: row.status, updatedAtMs: now() }, { merge: true }).catch(() => undefined);
    }
    await health.touchHealth(db(), { provider: "square", connectionId: ref.id, companyId, entity: "finance", kind: "success", now: now(), FieldValue }).catch(() => undefined);
    return { result: prior ? "updated" : "created", refundId: refundsRef.id, orderId: linkedOrderId, orderExternalId: orderExternalId || null };
  }

  /** One entity event, whatever brought it (webhook, queue, Events API): fetch latest, then apply. */
  async function handleEntityEvent(ref, data, { entityType, externalId, eventKey, eventOrigin, eventType, client = null }) {
    const api = client || await clientFor(ref, data);
    if (entityType === "order") {
      const latest = await api.getOrder(externalId);
      return latest ? applySquareOrder(ref, data, latest, { eventKey, eventOrigin, eventType, client: api }) : { result: "skipped", reason: "not_found_at_provider" };
    }
    if (entityType === "payment") {
      const payment = await api.getPayment(externalId);
      if (!payment) return { result: "skipped", reason: "not_found_at_provider" };
      const outcome = await recordPayment(ref, data, payment);
      // SQ-PAY-005 / §7.4: the order the payment names is refreshed too — the tenders live there.
      if (payment.order_id) { try { const order = await api.getOrder(String(payment.order_id)); if (order) await applySquareOrder(ref, data, order, { eventKey: eventKey ? `${eventKey}#order` : null, eventOrigin, eventType, client: api }); } catch (error) { console.warn("square payment→order refresh failed:", error?.message || error); } }
      return outcome;
    }
    if (entityType === "refund") {
      const refund = await api.getRefund(externalId);
      if (!refund) return { result: "skipped", reason: "not_found_at_provider" };
      const outcome = await recordRefund(ref, data, refund);
      if (outcome.orderExternalId) { try { const order = await api.getOrder(outcome.orderExternalId); if (order) await applySquareOrder(ref, data, order, { eventKey: eventKey ? `${eventKey}#order` : null, eventOrigin, eventType, client: api }); } catch (error) { console.warn("square refund→order refresh failed:", error?.message || error); } }
      return outcome;
    }
    return { result: "skipped", reason: `unknown_entity_${safeIdPart(entityType)}` };
  }

  /** What an event names: the entity type and id, from Square's event shape. */
  function entityOfEvent(event) {
    const type = String(event?.type || "");
    const obj = event?.data?.object || {};
    if (ORDER_EVENTS.has(type)) {
      const inner = obj.order_created || obj.order_updated || obj.order_fulfillment_updated || {};
      return { entityType: "order", externalId: String(inner.order_id || event?.data?.id || ""), locationId: String(inner.location_id || "") };
    }
    if (PAYMENT_EVENTS.has(type)) return { entityType: "payment", externalId: String(obj.payment?.id || event?.data?.id || ""), locationId: String(obj.payment?.location_id || "") };
    if (REFUND_EVENTS.has(type)) return { entityType: "refund", externalId: String(obj.refund?.id || event?.data?.id || ""), locationId: String(obj.refund?.location_id || "") };
    return { entityType: "", externalId: String(event?.data?.id || ""), locationId: "" };
  }

  async function connectionsForMerchant(merchantId) {
    if (!merchantId) return [];
    const snap = await connections().where("merchantId", "==", merchantId).get();
    return snap.docs.map((d) => ({ ref: d.ref, data: d.data() || {} })).filter((r) => ["connected", "reconnect_required"].includes(String(r.data.status)));
  }

  async function processSquareTaskCore(task) {
    const snap = await connections().doc(String(task.connectionId || "")).get();
    const data = snap.exists ? (snap.data() || {}) : null;
    if (!data || String(data.status) !== "connected") { const e = new Error(data ? `connection_${data.status}` : "connection_missing"); e.errorClass = data && data.status === "reconnect_required" ? "auth" : "validation"; throw e; }
    return worker.processCommerceEvent(db(), task, {
      fetchLatest: async () => ({ ok: true }),   // the fetch happens in apply, per entity type
      normalize: (raw) => raw,
      apply: () => handleEntityEvent(snap.ref, data, { entityType: task.entityType || "order", externalId: String(task.externalId || ""), eventKey: task.key, eventOrigin: task.eventOrigin || "retry", eventType: task.eventType }),
      retryAfterOf: (error) => events.parseRetryAfter(error?.retryAfter), now
    });
  }

  // ---- 3. the doorbell (application-level webhook) -----------------------------
  const squareWebhook = onRequest({ region: "europe-west2" }, async (req, res) => {
    try {
      if (req.method !== "POST") { res.status(200).json({ ok: true, message: "NivaDesk Square webhook endpoint. POST only." }); return; }
      const rawBody = req.rawBody || Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}));
      const signature = String(req.headers["x-square-hmacsha256-signature"] || "");
      if (!verifySquareSignature({ notificationUrl: notificationUrl(), rawBody, header: signature, signatureKey: webhookSignatureKey() })) { res.status(401).json({ ok: false, error: "invalid_signature" }); return; }   // SQ-WEB-004
      const event = typeof req.body === "object" && req.body ? req.body : JSON.parse(rawBody.toString("utf8"));
      const merchantId = String(event?.merchant_id || "");
      const eventId = String(event?.event_id || "");
      const type = String(event?.type || "");
      const targets = await connectionsForMerchant(merchantId);   // SQ-WEB-006/007: the merchant id is the only tenant key
      if (!targets.length) { console.warn("square webhook: unknown merchant", merchantId.slice(0, 6)); res.status(200).json({ ok: true, result: "skipped", reason: "unknown_merchant" }); return; }
      const results = [];
      for (const { ref, data } of targets) {
        if (eventId) {
          const claim = ref.collection("deliveries").doc(safeIdPart(eventId));
          try { await claim.create({ type, receivedAtMs: now(), expireAt: admin.firestore.Timestamp.fromMillis(now() + DELIVERY_TTL_MS) }); }
          catch { results.push({ connection: ref.id, result: "duplicate" }); continue; }   // SQ-WEB-009
        }
        await health.touchHealth(db(), { provider: "square", connectionId: ref.id, companyId: String(data.companyId || ""), kind: "webhook", now: now(), FieldValue }).catch(() => undefined);
        if (type === "oauth.authorization.revoked") {   // SQ-AUTH-008
          await ref.set({ status: "reconnect_required", lastErrorCode: "authorization_revoked", accessTokenEncrypted: FieldValue.delete(), refreshTokenEncrypted: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          results.push({ connection: ref.id, result: "reconnect_required" }); continue;
        }
        const { entityType, externalId } = entityOfEvent(event);
        if (!entityType || !externalId) { results.push({ connection: ref.id, result: "skipped", reason: `unhandled_${safeIdPart(type)}` }); continue; }   // §7.1: unknown types are logged, not applied
        if (String(data.status) !== "connected") { results.push({ connection: ref.id, result: "skipped", reason: `connection_${data.status}` }); continue; }
        const eventKey = events.idempotencyKey({ provider: "square", connectionId: ref.id, eventId, externalId, eventType: type });
        const task = { key: eventKey, provider: "square", connectionId: ref.id, companyId: String(data.companyId || ""), entityType, externalId, eventType: type, attempt: 1, eventOrigin: "provider", correlationId: events.newCorrelationId() };
        await worker.recordReceived(db(), task, { status: enqueue ? "queued" : "received", now: now() }).catch(() => undefined);
        // SQ-WEB-008: durable, then 2xx. The queue is the normal road; when it
        // cannot be reached (an IAM gap, an outage) the event is applied here
        // and now rather than lost — the delivery claim above would otherwise
        // turn Square's retry into a "duplicate" of an event nobody handled.
        let queued = false;
        if (enqueue) {
          try { await enqueue(task, 0); queued = true; }
          catch (error) { console.error("squareWebhook enqueue failed, applying inline:", String(error?.message || error).slice(0, 200)); await worker.recordReceived(db(), task, { status: "received", now: now() }).catch(() => undefined); }
        }
        if (queued) { results.push({ connection: ref.id, result: "queued" }); continue; }
        let outcome;
        try { outcome = await processSquareTaskCore(task); }
        catch (error) {
          // Nothing was applied: give the claim back so Square's retry is not mistaken for a duplicate.
          if (eventId) await ref.collection("deliveries").doc(safeIdPart(eventId)).delete().catch(() => undefined);
          throw error;
        }
        if (outcome.status === "applied") await health.touchHealth(db(), { provider: "square", connectionId: ref.id, companyId: task.companyId, kind: "success", now: now(), FieldValue }).catch(() => undefined);
        results.push({ connection: ref.id, result: outcome.outcome?.result || outcome.status });
      }
      res.status(200).json({ ok: true, results });
    } catch (error) {
      console.error("squareWebhook error:", error?.message || error);
      res.status(500).json({ ok: false });
    }
  });

  /** The queue worker's brain for a Square task, for index.js's dispatcher. */
  async function processSquareCommerceTask(task) { return processSquareTaskCore(task); }

  // ---- 4. reconciliation: orders, payments, events — separate cursors ------------
  async function reconcileOrders(ref, data, client, { force, lookbackMs, maxPages, eventOrigin }) {
    const companyId = String(data.companyId || "");
    const cursor = await cursors.readCursor(db(), "square", ref.id, "order");
    const window = cursors.cursorWindow(cursor, now(), { force, lookbackMs: lookbackMs || undefined });
    const audit = { scanned: 0, created: 0, updated: 0, skipped: 0, failed: 0, truncated: false, fromMs: window.fromMs, toMs: window.toMs };
    const selected = (Array.isArray(data.selectedLocationIds) ? data.selectedLocationIds : []).map(String).filter(Boolean);
    if (!selected.length) { await cursors.recordPass(db(), { provider: "square", connectionId: ref.id, entityType: "order", companyId, fromMs: window.fromMs, toMs: window.toMs, complete: true, now: now() }); return { ...audit, complete: true }; }
    for (const locationIds of chunk(selected, LOCATIONS_PER_SEARCH)) {
      let pageCursor = null; let pages = 0;
      for (;;) {
        const page = await client.searchOrders({ locationIds, updatedAfterIso: new Date(window.fromMs).toISOString(), updatedBeforeIso: new Date(window.toMs).toISOString(), cursor: pageCursor });
        pages += 1;
        for (const order of page.orders) {
          audit.scanned += 1;
          try {
            const outcome = await applySquareOrder(ref, data, order, { eventOrigin, client, eventKey: events.idempotencyKey({ provider: "square", connectionId: ref.id, externalId: String(order?.id || ""), eventType: `${eventOrigin}@${order?.updated_at || ""}` }) });
            if (outcome.result === "created") audit.created += 1; else if (outcome.result === "updated") audit.updated += 1; else audit.skipped += 1;
          } catch (error) { audit.failed += 1; console.warn("square reconcile: order failed", ref.id, order?.id, error?.message || error); }
        }
        if (!page.cursor || page.orders.length === 0) break;
        if (pages >= maxPages) { audit.truncated = true; break; }
        pageCursor = page.cursor;
      }
    }
    const complete = !audit.truncated && audit.failed === 0;   // SQ-REC-006
    await cursors.recordPass(db(), { provider: "square", connectionId: ref.id, entityType: "order", companyId, fromMs: window.fromMs, toMs: window.toMs, complete, scanned: audit.scanned, applied: audit.created + audit.updated, failed: audit.failed, truncated: audit.truncated, now: now() });
    return { ...audit, complete };
  }

  async function reconcilePayments(ref, data, client, { force, lookbackMs, maxPages }) {
    const companyId = String(data.companyId || "");
    const cursor = await cursors.readCursor(db(), "square", ref.id, "payment");
    const window = cursors.cursorWindow(cursor, now(), { force, lookbackMs: lookbackMs || undefined });
    const audit = { scanned: 0, recorded: 0, unmatched: 0, failed: 0, truncated: false };
    let pageCursor = null; let pages = 0;
    for (;;) {
      const page = await client.listPayments({ beginTimeIso: new Date(window.fromMs).toISOString(), endTimeIso: new Date(window.toMs).toISOString(), cursor: pageCursor });
      pages += 1;
      for (const payment of page.payments) {
        audit.scanned += 1;
        try { const outcome = await recordPayment(ref, data, payment); if (outcome.result === "created" || outcome.result === "updated") audit.recorded += 1; if (outcome.unmatched) audit.unmatched += 1; }
        catch (error) { audit.failed += 1; console.warn("square reconcile: payment failed", ref.id, payment?.id, error?.message || error); }
      }
      if (!page.cursor || page.payments.length === 0) break;
      if (pages >= maxPages) { audit.truncated = true; break; }
      pageCursor = page.cursor;
    }
    const complete = !audit.truncated && audit.failed === 0;
    await cursors.recordPass(db(), { provider: "square", connectionId: ref.id, entityType: "payment", companyId, fromMs: window.fromMs, toMs: window.toMs, complete, scanned: audit.scanned, applied: audit.recorded, failed: audit.failed, truncated: audit.truncated, now: now() });
    return { ...audit, complete };
  }

  /** SQ-POUT-001..005 — a payout is its own entity, with every entry page taken, gross/fee/net kept in minor-unit-derived decimals, and a version that only moves forward. */
  async function recordPayout(ref, data, client, payout) {
    const companyId = String(data.companyId || "");
    const id = safeIdPart(payout?.id);
    if (!id) return { result: "invalid" };
    const payoutRef = db().collection("companies").doc(companyId).collection(PAYOUTS_SUBCOLLECTION).doc(id);
    const before = await payoutRef.get();
    const prior = before.exists ? (before.data() || {}) : null;
    const version = Number(payout?.version) || 0;
    if (prior && Number(prior.version || 0) > version) return { result: "stale", payoutId: id };
    const entries = [];
    let cursor = null; let pages = 0;
    for (;;) {
      const page = await client.listPayoutEntries(String(payout.id), { cursor });
      pages += 1;
      for (const e of page.entries) {
        entries.push({
          id: String(e?.id || ""), type: String(e?.type || "").toUpperCase(), effectiveAt: String(e?.effective_at || "") || null,
          gross: squareMoneyToDecimal(e?.gross_amount_money), fee: squareMoneyToDecimal(e?.fee_amount_money), net: squareMoneyToDecimal(e?.net_amount_money),
          currency: String(e?.net_amount_money?.currency || e?.gross_amount_money?.currency || "") || null,
          sourceType: e?.type_charge_details ? "payment" : (e?.type_refund_details ? "refund" : (e?.type_app_fee_revenue_details || e?.type_app_fee_refund_details ? "app_fee" : "other")),
          sourceExternalId: String(e?.type_charge_details?.payment_id || e?.type_refund_details?.refund_id || e?.type_refund_details?.payment_id || "") || null
        });
      }
      if (!page.cursor || page.entries.length === 0) break;
      if (pages >= 20) { const err = new Error("square_payout_entries_truncated"); err.errorClass = "transient"; throw err; }   // SQ-POUT-002: all pages or nothing
      cursor = page.cursor;
    }
    const totals = {
      gross: sumDecimal(entries.map((e) => e.gross)), fee: sumDecimal(entries.map((e) => e.fee)), net: sumDecimal(entries.map((e) => e.net)),
      charges: sumDecimal(entries.filter((e) => e.type === "CHARGE").map((e) => e.net)), refunds: sumDecimal(entries.filter((e) => e.type === "REFUND").map((e) => e.net)),
      adjustments: sumDecimal(entries.filter((e) => !["CHARGE", "REFUND"].includes(e.type)).map((e) => e.net))
    };
    const amount = squareMoneyToDecimal(payout?.amount_money);
    await payoutRef.set({
      provider: "square", connectionId: ref.id, companyId, externalId: String(payout.id), status: String(payout?.status || "").toUpperCase() || "UNKNOWN",
      amount, currency: String(payout?.amount_money?.currency || "") || null, locationId: String(payout?.location_id || "") || null,
      arrivalDate: String(payout?.arrival_date || "") || null, endToEndId: String(payout?.end_to_end_id || "") || null, payoutType: String(payout?.type || "") || null,
      destinationType: String(payout?.destination?.type || "") || null, version, entryCount: entries.length, totals,
      reconciled: totals.net !== null && amount !== null && Number(totals.net) === Number(amount),   // SQ-TEST-016
      bankMatch: prior?.bankMatch || null,   // Faz 5 writes here; a re-sync never clears a match
      externalCreatedAt: String(payout?.created_at || "") || null, externalUpdatedAt: String(payout?.updated_at || "") || null, updatedAtMs: now(), ...(prior ? {} : { createdAtMs: now() })
    }, { merge: true });
    const batch = db().batch();
    for (const e of entries.slice(0, 450)) batch.set(payoutRef.collection("entries").doc(safeIdPart(e.id) || crypto.randomUUID()), { ...e, updatedAtMs: now() }, { merge: true });
    await batch.commit();
    return { result: prior ? "updated" : "created", payoutId: id, entries: entries.length, reconciled: totals.net !== null && amount !== null && Number(totals.net) === Number(amount) };
  }

  async function reconcilePayouts(ref, data, client, { force, lookbackMs, maxPages }) {
    const companyId = String(data.companyId || "");
    const cursor = await cursors.readCursor(db(), "square", ref.id, "payout");
    if (!force && cursor && now() - Number(cursor.lastPassAtMs || 0) < PAYOUT_PASS_MIN_INTERVAL_MS) return { scanned: 0, recorded: 0, failed: 0, complete: true, skipped: "interval" };
    const window = cursors.cursorWindow(cursor, now(), { force, lookbackMs: lookbackMs || 7 * 24 * 60 * 60 * 1000, maxWindowMs: 7 * 24 * 60 * 60 * 1000 });
    const audit = { scanned: 0, recorded: 0, unreconciled: 0, failed: 0, truncated: false };
    let pageCursor = null; let pages = 0;
    for (;;) {
      const page = await client.listPayouts({ beginTimeIso: new Date(window.fromMs).toISOString(), endTimeIso: new Date(window.toMs).toISOString(), cursor: pageCursor });
      pages += 1;
      for (const payout of page.payouts) {
        audit.scanned += 1;
        try { const outcome = await recordPayout(ref, data, client, payout); if (["created", "updated"].includes(outcome.result)) audit.recorded += 1; if (outcome.reconciled === false) audit.unreconciled += 1; }
        catch (error) { audit.failed += 1; console.warn("square reconcile: payout failed", ref.id, payout?.id, error?.message || error); }
      }
      if (!page.cursor || page.payouts.length === 0) break;
      if (pages >= maxPages) { audit.truncated = true; break; }
      pageCursor = page.cursor;
    }
    const complete = !audit.truncated && audit.failed === 0;
    await cursors.recordPass(db(), { provider: "square", connectionId: ref.id, entityType: "payout", companyId, fromMs: window.fromMs, toMs: window.toMs, complete, scanned: audit.scanned, applied: audit.recorded, failed: audit.failed, truncated: audit.truncated, now: now() });
    return { ...audit, complete };
  }

  async function reconcileRefunds(ref, data, client, { force, lookbackMs, maxPages }) {
    const companyId = String(data.companyId || "");
    const cursor = await cursors.readCursor(db(), "square", ref.id, "refund");
    const window = cursors.cursorWindow(cursor, now(), { force, lookbackMs: lookbackMs || undefined });
    const audit = { scanned: 0, recorded: 0, failed: 0, truncated: false };
    const touched = new Set();
    let pageCursor = null; let pages = 0;
    for (;;) {
      const page = await client.listRefunds({ beginTimeIso: new Date(window.fromMs).toISOString(), endTimeIso: new Date(window.toMs).toISOString(), cursor: pageCursor });
      pages += 1;
      for (const refund of page.refunds) {
        audit.scanned += 1;
        try { const outcome = await recordRefund(ref, data, refund); if (["created", "updated"].includes(outcome.result)) { audit.recorded += 1; if (outcome.orderExternalId) touched.add(outcome.orderExternalId); } }
        catch (error) { audit.failed += 1; console.warn("square reconcile: refund failed", ref.id, refund?.id, error?.message || error); }
      }
      if (!page.cursor || page.refunds.length === 0) break;
      if (pages >= maxPages) { audit.truncated = true; break; }
      pageCursor = page.cursor;
    }
    // The sales those refunds belong to show the new balance (SQ-REF-004/005).
    for (const orderId of touched) {
      try { const order = await client.getOrder(orderId); if (order) await applySquareOrder(ref, data, order, { eventOrigin: "reconcile", client, eventKey: events.idempotencyKey({ provider: "square", connectionId: ref.id, externalId: orderId, eventType: `refund-reconcile@${now()}` }) }); }
      catch (error) { console.warn("square reconcile: refund→order refresh failed", ref.id, orderId, error?.message || error); }
    }
    const complete = !audit.truncated && audit.failed === 0;
    await cursors.recordPass(db(), { provider: "square", connectionId: ref.id, entityType: "refund", companyId, fromMs: window.fromMs, toMs: window.toMs, complete, scanned: audit.scanned, applied: audit.recorded, failed: audit.failed, truncated: audit.truncated, now: now() });
    return { ...audit, complete };
  }

  let eventsEnabledAtMs = 0;
  /** SQ-REC-001..003 — the Events API pass: what Square told the application in the window, that we may not have heard. */
  async function recoverEvents(ref, data, client, { force, lookbackMs, maxPages }) {
    const token = appToken();
    if (!token) return { scanned: 0, applied: 0, skipped: 0, failed: 0, complete: true, configured: false };
    const companyId = String(data.companyId || "");
    const eventsClient = createEventsClient({ environment: env(), appAccessToken: token, fetchImpl });
    if (now() - eventsEnabledAtMs > 6 * 60 * 60 * 1000) { try { await eventsClient.enableEvents(); eventsEnabledAtMs = now(); } catch (error) { console.warn("square enableEvents failed:", String(error?.message || error).slice(0, 120)); } }
    const cursor = await cursors.readCursor(db(), "square", ref.id, "events");
    const window = cursors.cursorWindow(cursor, now(), { force, lookbackMs: lookbackMs || undefined, maxWindowMs: 27 * 24 * 60 * 60 * 1000 });
    const audit = { scanned: 0, applied: 0, skipped: 0, failed: 0, truncated: false, configured: true };
    let pageCursor = null; let pages = 0;
    for (;;) {
      const page = await eventsClient.searchEvents({ createdAfterIso: new Date(window.fromMs).toISOString(), createdBeforeIso: new Date(window.toMs).toISOString(), merchantId: String(data.merchantId || ""), eventTypes: [...ORDER_EVENTS, ...PAYMENT_EVENTS, ...REFUND_EVENTS], cursor: pageCursor });
      pages += 1;
      for (const event of page.events) {
        audit.scanned += 1;
        const eventId = String(event?.event_id || "");
        const { entityType, externalId } = entityOfEvent(event);
        if (!entityType || !externalId) { audit.skipped += 1; continue; }
        if (eventId) {
          const claim = ref.collection("deliveries").doc(safeIdPart(eventId));
          try { await claim.create({ type: String(event?.type || ""), receivedAtMs: now(), via: "events_api", expireAt: admin.firestore.Timestamp.fromMillis(now() + DELIVERY_TTL_MS) }); }
          catch { audit.skipped += 1; continue; }   // heard already, by webhook
        }
        try {
          const eventKey = events.idempotencyKey({ provider: "square", connectionId: ref.id, eventId, externalId, eventType: String(event?.type || "") });
          const outcome = await handleEntityEvent(ref, data, { entityType, externalId, eventKey, eventOrigin: "reconcile", eventType: String(event?.type || ""), client });
          if (["created", "updated"].includes(outcome.result)) audit.applied += 1; else audit.skipped += 1;
        } catch (error) { audit.failed += 1; console.warn("square events recovery failed", ref.id, eventId, error?.message || error); }
      }
      if (!page.cursor || page.events.length === 0) break;
      if (pages >= maxPages) { audit.truncated = true; break; }
      pageCursor = page.cursor;
    }
    const complete = !audit.truncated && audit.failed === 0;
    await cursors.recordPass(db(), { provider: "square", connectionId: ref.id, entityType: "events", companyId, fromMs: window.fromMs, toMs: window.toMs, complete, scanned: audit.scanned, applied: audit.applied, failed: audit.failed, truncated: audit.truncated, now: now() });
    return { ...audit, complete };
  }

  async function reconcileConnection(ref, data, { force = false, lookbackMs = null, maxPages = RECONCILE_MAX_PAGES, eventOrigin = "reconcile" } = {}) {
    const companyId = String(data.companyId || "");
    const client = await clientFor(ref, data);
    // SQ-LOC-005: locations come and go; the list is refreshed, the selection kept.
    let locationsHealthy = true;
    try {
      const live = (await client.listLocations()).map((l) => ({ id: String(l.id || ""), name: String(l.name || ""), status: String(l.status || ""), currency: String(l.currency || ""), timezone: String(l.timezone || "") }));
      const selected = (Array.isArray(data.selectedLocationIds) ? data.selectedLocationIds : []).map(String);
      locationsHealthy = selected.every((id) => live.some((l) => l.id === id && l.status === "ACTIVE"));
      await ref.set({ locations: live, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      data = { ...data, locations: live };
    } catch (error) {
      const cls = events.classifyError(error);
      if (cls === "auth") { await ref.set({ status: "reconnect_required", lastErrorCode: "credentials_rejected", lastSyncAtMs: now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); throw error; }
    }
    const orders = await reconcileOrders(ref, data, client, { force, lookbackMs, maxPages, eventOrigin });
    let payments = { complete: true, scanned: 0, recorded: 0, unmatched: 0, failed: 0 };
    try { payments = await reconcilePayments(ref, data, client, { force, lookbackMs, maxPages }); } catch (error) { payments = { complete: false, scanned: 0, recorded: 0, unmatched: 0, failed: 1, error: String(error?.message || error).slice(0, 120) }; }
    let refunds = { complete: true, scanned: 0, recorded: 0, failed: 0 };
    try { refunds = await reconcileRefunds(ref, data, client, { force, lookbackMs, maxPages }); } catch (error) { refunds = { complete: false, scanned: 0, recorded: 0, failed: 1, error: String(error?.message || error).slice(0, 120) }; }
    let payouts = { complete: true, scanned: 0, recorded: 0, unreconciled: 0, failed: 0 };
    try { payouts = await reconcilePayouts(ref, data, client, { force, lookbackMs, maxPages }); } catch (error) { payouts = { complete: false, scanned: 0, recorded: 0, unreconciled: 0, failed: 1, error: String(error?.message || error).slice(0, 120) }; }
    let recovered = { complete: true, configured: false, scanned: 0, applied: 0 };
    try { recovered = await recoverEvents(ref, data, client, { force, lookbackMs, maxPages }); } catch (error) { recovered = { complete: false, configured: true, scanned: 0, applied: 0, error: String(error?.message || error).slice(0, 120) }; }
    const complete = orders.complete && payments.complete;
    await health.touchHealth(db(), { provider: "square", connectionId: ref.id, companyId, kind: orders.complete ? "success" : "attempt", now: now(), FieldValue });
    await health.touchHealth(db(), { provider: "square", connectionId: ref.id, companyId, entity: "finance", kind: payments.complete ? "success" : "attempt", now: now(), FieldValue });
    await ref.set({ lastSyncAtMs: now(), ...(complete ? { lastSuccessAtMs: now() } : {}), lastErrorCode: locationsHealthy ? "" : "location_inactive", locationsHealthy, lastReconcile: { orders: { scanned: orders.scanned, created: orders.created, updated: orders.updated, skipped: orders.skipped, failed: orders.failed }, payments: { scanned: payments.scanned, recorded: payments.recorded, unmatched: payments.unmatched, failed: payments.failed }, events: { configured: recovered.configured, scanned: recovered.scanned, applied: recovered.applied }, payouts: { scanned: payouts.scanned, recorded: payouts.recorded, unreconciled: payouts.unreconciled, failed: payouts.failed }, refunds: { scanned: refunds.scanned, recorded: refunds.recorded, failed: refunds.failed }, atMs: now() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ...orders, payments, refunds, payouts, events: recovered, complete, locationsHealthy };
  }

  const reconcileSquareConnections = onSchedule
    ? onSchedule({ schedule: "every 15 minutes", timeZone: "Europe/London", region: "europe-west2", timeoutSeconds: 540 }, async () => {
        const snap = await connections().where("status", "==", "connected").get();
        const due = snap.docs.map((d) => ({ ref: d.ref, data: d.data() || {} })).filter((r) => settingsOf(r.data).autoSync).sort((a, b) => Number(a.data.lastSyncAtMs || 0) - Number(b.data.lastSyncAtMs || 0)).slice(0, MAX_CONNECTIONS_PER_SWEEP);
        let swept = 0; let failed = 0;
        for (const row of due) {
          try { await reconcileConnection(row.ref, row.data); swept += 1; }
          catch (error) { failed += 1; console.warn("square reconcile failed:", row.ref.id, error?.message || error); }
        }
        console.log(`square reconcile sweep: ${swept} connection(s), ${failed} failed, ${snap.size} connected`);
      })
    : null;

  const syncSquareNow = onCall({ region: "europe-west2", timeoutSeconds: 300 }, async (request) => {
    const { companyId } = await requireWorkspaceMember(request);
    const { ref, data } = await loadOwnedConnection(companyId, request.data?.connectionId);
    if (String(data.status) !== "connected") throw new HttpsError("failed-precondition", "This Square account is not connected.");
    if (Number(data.syncLockUntilMs || 0) > now()) throw new HttpsError("failed-precondition", "A sync is already running for this account.");   // SQ-REC-010
    await ref.set({ syncLockUntilMs: now() + SYNC_LOCK_MS }, { merge: true });
    try {
      const audit = await reconcileConnection(ref, data, { force: true, lookbackMs: 24 * 60 * 60 * 1000 });
      return { ok: true, ...audit };
    } finally { await ref.set({ syncLockUntilMs: 0 }, { merge: true }); }
  });

  // ---- 5. import preview and backfill (SQ-OPEN-002: 90 days by default) --------
  async function* importOrders(client, data, days, maxPages) {
    const selected = (Array.isArray(data.selectedLocationIds) ? data.selectedLocationIds : []).map(String).filter(Boolean);
    const createdAfterIso = new Date(now() - days * 86400000).toISOString();
    for (const locationIds of chunk(selected, LOCATIONS_PER_SEARCH)) {
      let pageCursor = null; let pages = 0;
      for (;;) {
        const page = await client.searchOrders({ locationIds, createdAfterIso, cursor: pageCursor });
        pages += 1;
        for (const order of page.orders) yield { order, truncated: false };
        if (!page.cursor || page.orders.length === 0) break;
        if (pages >= maxPages) { yield { order: null, truncated: true }; break; }
        pageCursor = page.cursor;
      }
    }
  }

  const previewSquareImport = onCall({ region: "europe-west2", timeoutSeconds: 120 }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref, data } = await loadOwnedConnection(companyId, request.data?.connectionId);
    const days = Math.min(Math.max(Number(request.data?.days) || 90, 1), 365);
    const client = await clientFor(ref, data);
    const settings = settingsOf(data);
    const summary = { total: 0, withFulfillment: 0, posOnly: 0, wouldCreate: 0, financeOnly: 0, cancelled: 0, alreadyHere: 0, truncated: false };
    const sample = [];
    for await (const { order, truncated } of importOrders(client, data, days, 2)) {
      if (truncated) { summary.truncated = true; continue; }
      summary.total += 1;
      const env2 = normalizeSquareOrder(order, { connectionId: ref.id, environment: env(), merchantName: data.merchantName, locationName: locationName(data, order?.location_id), eventOrigin: "import" });
      const meta = env2.source.provider_metadata;
      if (meta.has_fulfillment) summary.withFulfillment += 1; else summary.posOnly += 1;
      if (env2.order.platform_status === "cancelled") summary.cancelled += 1;
      const creates = settings.importPolicy === "all" || (settings.importPolicy === "fulfillment_only" && meta.has_fulfillment);
      if (creates) summary.wouldCreate += 1; else summary.financeOnly += 1;
      if ((await orderDocRef(squareOrderDocId(companyId, env2.identity.external_id)).get()).exists) summary.alreadyHere += 1;
      if (sample.length < 10) sample.push({ id: env2.identity.external_id, number: meta.order_number, source: meta.square_source_name, location: meta.location_name, status: env2.order.platform_status, total: env2.order.grand_total, currency: env2.order.currency, customer: env2.customer.name || "", placedAt: env2.order.placed_at, wouldCreate: creates });
    }
    return { ok: true, days, importPolicy: settings.importPolicy, summary, sample };
  });

  const runSquareImport = onCall({ region: "europe-west2", timeoutSeconds: 540 }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref, data } = await loadOwnedConnection(companyId, request.data?.connectionId);
    const days = Math.min(Math.max(Number(request.data?.days) || 90, 1), 365);
    const client = await clientFor(ref, data);
    const counters = { scanned: 0, created: 0, updated: 0, skipped: 0, held: 0, failed: 0, truncated: false };
    await ref.set({ importState: "running", importStartedAtMs: now() }, { merge: true });
    for await (const { order, truncated } of importOrders(client, data, days, IMPORT_MAX_PAGES)) {
      if (truncated) { counters.truncated = true; continue; }
      counters.scanned += 1;
      try {
        const outcome = await applySquareOrder(ref, data, order, { eventOrigin: "import", client, eventKey: events.idempotencyKey({ provider: "square", connectionId: ref.id, externalId: String(order?.id || ""), eventType: `import@${order?.updated_at || ""}` }) });
        if (outcome.result === "created") counters.created += 1; else if (outcome.result === "updated") counters.updated += 1; else if (outcome.result === "held") counters.held += 1; else counters.skipped += 1;
      } catch (error) { counters.failed += 1; console.warn("square import: order failed", ref.id, order?.id, error?.message || error); }
    }
    await ref.set({ importState: "done", importFinishedAtMs: now(), importCounters: counters, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true, days, ...counters };
  });

  /** SQ-UX-005 — the review queue: payments and refunds that name no order NivaDesk holds. */
  const listSquareUnmatched = onCall({ region: "europe-west2" }, async (request) => {
    const { companyId } = await requireWorkspaceMember(request);
    const base = db().collection("companies").doc(companyId);
    const [payments, refunds] = await Promise.all([
      base.collection(PAYMENTS_SUBCOLLECTION).where("unmatched", "==", true).limit(100).get(),
      base.collection(REFUNDS_SUBCOLLECTION).where("unmatched", "==", true).limit(100).get()
    ]);
    const strip = (d) => { const r = d.data() || {}; return { id: d.id, externalId: r.externalId, orderExternalId: r.orderExternalId || null, paymentExternalId: r.paymentExternalId || null, status: r.status, amount: r.amount, total: r.total || r.amount, currency: r.currency, sourceType: r.sourceType || null, cardBrand: r.cardBrand || null, last4: r.last4 || null, locationId: r.locationId || null, receiptUrl: r.receiptUrl || null, at: r.externalCreatedAt || null }; };
    return { ok: true, payments: payments.docs.map(strip), refunds: refunds.docs.map(strip) };
  });

  /** SQ-POUT-009 — what the bank screen and the Square screen show: each payout with its gross/refunds/fees/net breakdown. */
  const listSquarePayouts = onCall({ region: "europe-west2" }, async (request) => {
    const { companyId } = await requireWorkspaceMember(request);
    const limit = Math.min(200, Math.max(1, Number(request.data?.limit) || 50));
    const snap = await db().collection("companies").doc(companyId).collection(PAYOUTS_SUBCOLLECTION).orderBy("externalCreatedAt", "desc").limit(limit).get();
    return { ok: true, payouts: snap.docs.map((d) => { const r = d.data() || {}; return { id: d.id, externalId: r.externalId, status: r.status, amount: r.amount, currency: r.currency, locationId: r.locationId, arrivalDate: r.arrivalDate, endToEndId: r.endToEndId, entryCount: r.entryCount || 0, totals: r.totals || {}, reconciled: r.reconciled === true, bankMatch: r.bankMatch || null, createdAt: r.externalCreatedAt || null }; }) };
  });

  /** §10.5 Missing Order Audit — Square's orders in the window against what NivaDesk holds: as an order, as a finance-only sale, or not at all. */
  const auditSquareOrders = onCall({ region: "europe-west2", timeoutSeconds: 300 }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref, data } = await loadOwnedConnection(companyId, request.data?.connectionId);
    const days = Math.min(Math.max(Number(request.data?.days) || 30, 1), 365);
    const client = await clientFor(ref, data);
    const settings = settingsOf(data);
    const report = { days, atSquare: 0, asOrders: 0, financeOnly: 0, missing: 0, notSelected: 0, truncated: false, missingIds: [], financeOnlyIds: [] };
    for await (const { order, truncated } of importOrders(client, data, days, IMPORT_MAX_PAGES)) {
      if (truncated) { report.truncated = true; continue; }
      if (String(order?.state || "").toUpperCase() === "DRAFT") continue;
      report.atSquare += 1;
      const externalId = String(order?.id || "");
      const orderDoc = await orderDocRef(squareOrderDocId(companyId, externalId)).get();
      if (orderDoc.exists) { report.asOrders += 1; continue; }
      const sale = await db().collection("companies").doc(companyId).collection(SALES_SUBCOLLECTION).doc(safeIdPart(externalId)).get();
      const env2 = normalizeSquareOrder(order, { connectionId: ref.id, environment: env(), eventOrigin: "reconcile" });
      const shouldBeOrder = settings.importPolicy === "all" || (settings.importPolicy === "fulfillment_only" && env2.source.provider_metadata.has_fulfillment);
      if (sale.exists && !shouldBeOrder) { report.financeOnly += 1; if (report.financeOnlyIds.length < 50) report.financeOnlyIds.push(externalId); continue; }
      if (!settings.importSources.includes(env2.source.provider_metadata.square_source)) { report.notSelected += 1; continue; }
      report.missing += 1;
      if (report.missingIds.length < 50) report.missingIds.push(externalId);
    }
    return { ok: true, ...report };
  });

  return {
    beginSquareConnect, squareOAuthCallback, getSquareConnections, updateSquareConnectionSettings, disconnectSquare,
    squareWebhook, reconcileSquareConnections, syncSquareNow, previewSquareImport, runSquareImport, listSquareUnmatched, listSquarePayouts, auditSquareOrders,
    _internal: { recordPayout, reconcilePayouts, PAYOUTS_SUBCOLLECTION, applySquareOrder, recordPayment, recordRefund, handleEntityEvent, entityOfEvent, reconcileConnection, processSquareCommerceTask, refreshTokenWithLock, clientFor, publicView, settingsOf, connectionDocId, squareOrderDocId, notificationUrl, CONNECTION_COLLECTION, STATE_COLLECTION, PAYMENTS_SUBCOLLECTION, REFUNDS_SUBCOLLECTION, SALES_SUBCOLLECTION, IMPORT_POLICIES, SQUARE_SOURCES }
  };
}

module.exports = { createSquareConnectorFunctions, CONNECTION_COLLECTION, STATE_COLLECTION, PAYMENTS_SUBCOLLECTION, REFUNDS_SUBCOLLECTION, SALES_SUBCOLLECTION, PAYOUTS_SUBCOLLECTION, connectionDocId, squareOrderDocId, IMPORT_POLICIES, SQUARE_SOURCES };

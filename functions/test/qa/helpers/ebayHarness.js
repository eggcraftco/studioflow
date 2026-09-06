"use strict";

// The eBay connector factory against the fake Firestore and a fake eBay — the
// harness the connect and sync qa tests share, so the two files build the SAME
// connector the same way and cannot drift apart in what they stub.
const crypto = require("crypto");
const { makeFakeFirestore, FakeHttpsError } = require("./fakeFirestore");
const { createEbayConnectorFunctions } = require("../../../ebayConnector");
const tokenBox = require("../../../security/tokenBox");
const realOAuth = require("../../../commerce/ebay/oauth");
const flagsModule = require("../../../commerce/flags");

const TOKEN_KEY = crypto.randomBytes(32).toString("hex");
const HASH_KEY = crypto.randomBytes(32).toString("hex");
// The relay key the callback POST is signed with (§5.4). Minted per run like the
// other two: it has no production meaning, is in no file and is in no commit.
const CALLBACK_KEY = crypto.randomBytes(32).toString("hex");
const passthrough = (_options, handler) => handler;
const harnessClocks = new WeakMap();   // fns → the nowRef the connector reads

/** A fixture order in the Sell Fulfillment shape, with a real person on it. */
function ebayOrder(id, { lastModifiedDate = "2026-09-02T10:30:00.000Z", creationDate = "2026-09-02T09:00:00.000Z", paymentStatus = "PAID", fulfillmentStatus = "NOT_STARTED", cancelState = "NONE_REQUESTED", marketplace = "EBAY_GB", total = "116.00", username = "ada_l", extra = {} } = {}) {
  return {
    orderId: id, legacyOrderId: `legacy-${id}`, creationDate, lastModifiedDate, orderFulfillmentStatus: fulfillmentStatus, orderPaymentStatus: paymentStatus, sellerId: "eggcraft_uk",
    buyerCheckoutNotes: "leave with neighbour",
    buyer: { username, buyerRegistrationAddress: { fullName: "Ada Lovelace", email: "ada@example.com", contactAddress: { addressLine1: "10 Analytical Way", city: "London", postalCode: "N1 1AA", countryCode: "GB" } } },
    pricingSummary: { priceSubtotal: { value: "100.00", currency: "GBP" }, priceDiscount: { value: "10.00", currency: "GBP" }, deliveryCost: { value: "5.00", currency: "GBP" }, tax: { value: "21.00", currency: "GBP" }, total: { value: total, currency: "GBP" } },
    cancelStatus: { cancelState, cancelRequests: [], ...(cancelState === "CANCELED" ? { cancelledDate: lastModifiedDate } : {}) },
    paymentSummary: { totalDueSeller: { value: "101.20", currency: "GBP" }, payments: paymentStatus === "PENDING" ? [] : [{ paymentMethod: "EBAY", paymentReferenceId: [{ referenceId: `PAY-${id}`, referenceType: "EXTERNAL_TRANSACTION_ID" }], paymentStatus: "PAID", paymentDate: creationDate, amount: { value: total, currency: "GBP" } }], refunds: [] },
    fulfillmentStartInstructions: [{ fulfillmentInstructionsType: "SHIP_TO", shippingStep: { shippingCarrierCode: "RoyalMail", shipTo: { fullName: "Ada Lovelace", email: "ada@example.com", primaryPhone: { phoneNumber: "+44 7700 900000" }, contactAddress: { addressLine1: "10 Analytical Way", addressLine2: "Flat 3", city: "London", postalCode: "N1 1AA", countryCode: "GB" } } } }],
    lineItems: [{ lineItemId: `${id}-1`, legacyItemId: "110419977151", sku: "RING-1", title: "Signet ring", quantity: 1, listingMarketplaceId: marketplace, lineItemCost: { value: "90.00", currency: "GBP" }, ebayCollectAndRemitTaxes: [{ taxType: "VAT", amount: { value: "19.00", currency: "GBP" }, collectionMethod: "GROSS" }], total: { value: "114.00", currency: "GBP" }, variationAspects: [{ name: "Size", value: "M" }] },
      { lineItemId: `${id}-2`, legacyItemId: "110419977152", sku: "BAND-2", title: "Wedding band", quantity: 2, listingMarketplaceId: marketplace, lineItemCost: { value: "10.00", currency: "GBP" }, ebayCollectAndRemitTaxes: [{ taxType: "VAT", amount: { value: "2.00", currency: "GBP" }, collectionMethod: "GROSS" }], total: { value: "12.00", currency: "GBP" }, variationAspects: [] }],
    ...extra
  };
}

/** A fake eBay Fulfillment API over an in-memory order map. */
function fakeEbay() {
  const state = { orders: new Map(), fulfillments: new Map(), clients: [], calls: [], failOrders: new Set(), pageLimit: 200 };
  const inWindow = (iso, fromMs, toMs) => { const ms = Date.parse(iso); return ms >= fromMs && ms <= toMs; };
  state.createClient = (options) => {
    state.clients.push(options);
    return {
      async getOrders({ lastModifiedFromMs = null, lastModifiedToMs = null, creationFromMs = null, creationToMs = null, limit = 200, offset = 0 } = {}) {
        state.calls.push({ op: "getOrders", lastModifiedFromMs, lastModifiedToMs, creationFromMs, creationToMs, limit, offset });
        if (options.quota) await options.quota.charge({ family: "orders" });
        let all = [...state.orders.values()];
        if (creationFromMs !== null) all = all.filter((o) => inWindow(o.creationDate, creationFromMs, creationToMs));
        else if (lastModifiedFromMs !== null) all = all.filter((o) => inWindow(o.lastModifiedDate, lastModifiedFromMs, lastModifiedToMs));
        all.sort((a, b) => a.orderId.localeCompare(b.orderId));
        const size = Math.min(limit, state.pageLimit);
        const page = all.slice(offset, offset + size);
        return { orders: page.map((o) => JSON.parse(JSON.stringify(o))), total: all.length, limit: size, offset, next: offset + size < all.length ? "next" : null, prev: null };
      },
      async getOrder(id) { state.calls.push({ op: "getOrder", id }); if (state.failOrders.has(id)) { const e = new Error("ebay_http_503"); e.status = 503; e.errorClass = "transient"; throw e; } const o = state.orders.get(id); return o ? JSON.parse(JSON.stringify(o)) : null; },
      async getOrdersByIds(ids) { state.calls.push({ op: "getOrdersByIds", ids }); return ids.map((id) => state.orders.get(id)).filter(Boolean).map((o) => JSON.parse(JSON.stringify(o))); },
      async getShippingFulfillments(id) { state.calls.push({ op: "getShippingFulfillments", id }); return JSON.parse(JSON.stringify(state.fulfillments.get(id) || [])); },
      async publicKey(kid) { return state.publicKeys && state.publicKeys[kid] ? state.publicKeys[kid] : null; },
      async probe() { return { ok: true }; }
    };
  };
  return state;
}

function buildEbay({ nowRef = { value: Date.parse("2026-09-06T12:00:00.000Z") }, owner = true, connectorOn = true, providerFlag = true, environment = "sandbox", capacity = { allowed: true, limit: null, active: 0 }, oauth: oauthOverrides = {}, ebay = fakeEbay(), configured = true, memberAccess = {} } = {}) {
  const store = makeFakeFirestore(nowRef);
  const admin = store.admin;
  flagsModule.resetCommerceFlagCache();
  store.write("appConfig/commerce", { connectors: { enabled: false, providers: { ebay: providerFlag }, connections: {} } });
  store.write("companies/c1", { ownerUid: "u1", companyName: "Acme", memberAccess });
  store.write("companySettings/c1", { defaultDeliveryTime: 14 });
  // `codes` is every code the connector actually presented to eBay's token
  // endpoint, in order: §5.4's refusal path spends the code on purpose, and a
  // counter alone cannot say WHICH code was spent.
  const calls = { pushes: [], held: [], enqueued: [], piiLog: [], exchanges: 0, codes: [], refreshes: 0, identities: 0, appTokens: 0 };
  // `callbackKey` is a switch so a test can blank it or truncate it and watch the
  // handler fail closed — with the SAME 401 a wrong key gets (§5.4).
  const switches = { connectorOn, callbackKey: CALLBACK_KEY };
  const oauth = {
    ...realOAuth,
    // A refusal is the REAL EbayOAuthError, not an Error wearing its fields: the
    // callback logs a caught message only for that class (§5.4), so a stand-in
    // would leave the one permitted message line unexercised by the log pin.
    exchangeCode: async ({ code }) => { calls.exchanges += 1; calls.codes.push(String(code)); if (code !== "good-code") throw new realOAuth.EbayOAuthError("ebay_oauth_http_400: invalid_grant", { status: 400, errorClass: "auth", code: "invalid_grant" }); return { access_token: `at_${calls.exchanges}`, expires_in: 7200, refresh_token: `rt_${calls.exchanges}`, refresh_token_expires_in: 47304000, token_type: "User Access Token", scope: realOAuth.SCOPES.join(" ") }; },
    refreshToken: async () => { calls.refreshes += 1; await new Promise((r) => setTimeout(r, 30)); return { access_token: `at_refreshed_${calls.refreshes}`, expires_in: 7200 }; },
    fetchIdentity: async () => { calls.identities += 1; return { userId: "ebayuser_xxx", username: "eggcraft_uk", accountType: "BUSINESS", registrationMarketplaceId: "EBAY_GB" }; },
    appToken: async () => { calls.appTokens += 1; return { access_token: "app-token", expires_in: 7200 }; },
    ...oauthOverrides
  };
  const fns = createEbayConnectorFunctions({
    admin, HttpsError: FakeHttpsError, onCall: passthrough, onRequest: passthrough, onSchedule: passthrough,
    clientId: () => (configured ? "app-id" : ""), clientSecret: () => "app-secret", tokenKey: () => TOKEN_KEY, hashKey: () => HASH_KEY, callbackKey: () => switches.callbackKey,
    environment: () => environment, ruName: () => "EGGcraft-sandbox-ru", deletionToken: () => "nivadesk_ebay_deletion-token_0123456789", deletionEndpointUrl: () => "https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayNotifications",
    dailyCap: () => 5000, connectorEnabled: () => switches.connectorOn,
    encryptToken: tokenBox.encryptToken, decryptToken: tokenBox.decryptToken,
    requireWorkspaceOwner: async (request) => { if (!owner) throw new FakeHttpsError("permission-denied", "not owner"); return { uid: String(request?.auth?.uid || "u1"), companyId: "c1", companyData: store.read("companies/c1") }; },
    requireWorkspaceMember: async (request) => ({ uid: String(request?.auth?.uid || "u1"), companyId: "c1", companyData: store.read("companies/c1") }),
    isWorkspaceOwner: (companyData, uid) => String(companyData?.ownerUid || "") === uid,
    appReturnUrl: () => "https://nivadesk.app/settings", functionsBaseUrl: () => "https://europe-west2-eggcraft-studio.cloudfunctions.net",
    orderDocRef: (id) => admin.firestore().collection("siparisler").doc(id),
    integrationOrderCapacity: async () => (typeof capacity === "function" ? capacity() : capacity),
    holdIntegrationOrder: async (companyId, provider, externalId, payload, cap, extra) => { calls.held.push({ companyId, provider, externalId, payload, extra }); await admin.firestore().collection("companies").doc(companyId).collection("heldIntegrationOrders").doc(`${provider}_${externalId}`).set({ provider, externalId, payload, ...extra, heldAtMs: nowRef.value }); },
    sendPushNotificationToCompany: async (companyId, notification) => { calls.pushes.push({ companyId, ...notification }); },
    reconcileLineItems: (items) => items, resolveDefaultDeliveryTime: () => 14,
    companySettingsDocRef: (id) => admin.firestore().collection("companySettings").doc(id),
    enqueue: async (task, delaySeconds) => { calls.enqueued.push({ task, delaySeconds }); },
    recordPiiAccess: async (entry) => { calls.piiLog.push(entry); },
    createClient: (options) => ebay.createClient(options), oauth,
    notificationVerifier: ({ signature }) => signature === "valid-signature",
    now: () => nowRef.value
  });
  harnessClocks.set(fns, nowRef);
  return { fns, store, admin, calls, ebay, nowRef, oauth, switches, TOKEN_KEY, HASH_KEY, CALLBACK_KEY };
}

function fakeRes() {
  const res = { statusCode: 200, payload: null, body: null, redirectedTo: "", contentType: "", headers: {} };
  res.status = (c) => { res.statusCode = c; return res; }; res.json = (p) => { res.payload = p; return res; }; res.send = (b) => { res.body = b; return res; }; res.type = (t) => { res.contentType = t; return res; };
  res.set = (k, v) => { res.headers[String(k).toLowerCase()] = v; return res; };
  res.redirect = (code, url) => { res.statusCode = code; res.redirectedTo = url; return res; };
  return res;
}

function callbackRid() { return crypto.randomBytes(8).toString("hex"); }
// The connector reads a frozen test clock, and the signature carries a timestamp
// the connector checks against it (±5 min). So a relay POST is stamped with the
// clock of the connector it is aimed at, not with the wall clock.
const clockOf = (fns) => (harnessClocks.get(fns) || { value: Date.now() }).value;

/**
 * One signed relay POST (§5.4). The body is serialised ONCE and the signature is
 * taken over those exact bytes; `body` is then parsed BACK from them, never the
 * reverse — if the literal were the body and rawBody a re-serialisation, a
 * body-swap test would go green while proving nothing about the Cloud Run path,
 * where key order and escaping need not match any re-serialisation of ours.
 */
async function signedCallback(fns, fields, { key = CALLBACK_KEY, timestampMs = null, method = "POST", originalUrl = "/ebayOAuthCallback", rawBody = null, signOver = null, omitRawBody = false, omitSignature = false, signature = null, timestampHeader = null, headers = {} } = {}) {
  if (timestampMs === null) timestampMs = clockOf(fns);
  const raw = rawBody === null ? JSON.stringify(fields) : rawBody;
  const buffer = Buffer.from(raw, "utf8");
  const ts = timestampHeader === null ? String(timestampMs) : timestampHeader;
  // `signOver` signs one body and sends another: the body-swap case.
  const digest = crypto.createHmac("sha256", key).update(`v1.${ts}.`, "utf8").update(signOver === null ? buffer : Buffer.from(signOver, "utf8")).digest("hex");
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  const req = {
    method, originalUrl,
    headers: { "content-type": "application/json", "x-nivadesk-timestamp": ts, ...(omitSignature ? {} : { "x-nivadesk-signature": signature === null ? `v1=${digest}` : signature }), ...headers },
    ...(omitRawBody ? {} : { rawBody: buffer }),
    body: parsed
  };
  const res = fakeRes();
  await fns.ebayOAuthCallback(req, res);
  return res;
}

/** The relay POST the web route would send for a browser that kept its nonce. */
async function callbackPost(fns, { state, code = "good-code", nonce = "", rid = null, ...rest } = {}) {
  const fields = { v: 1, rid: rid === null ? callbackRid() : rid, code, state, nonce };
  return signedCallback(fns, fields, rest);
}

/** Begin + callback with the browser nonce forwarded: a connected seller. */
async function connect(fns, { auth = { uid: "u1" } } = {}) {
  const begun = await fns.beginEbayConnect({ auth, data: { companyId: "c1" } });
  const res = await callbackPost(fns, { state: begun.state, code: "good-code", nonce: begun.nonce });
  return { begun, res, connectionId: "c1__ebayuser_xxx" };
}

module.exports = { buildEbay, fakeEbay, ebayOrder, fakeRes, connect, callbackPost, signedCallback, callbackRid, TOKEN_KEY, HASH_KEY, CALLBACK_KEY };

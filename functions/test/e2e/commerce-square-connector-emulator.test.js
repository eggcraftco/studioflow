// Square Faz 1–2 — the connector end to end on a real Firestore, with Square
// itself replaced by a fake OAuth server and a fake REST client: the OAuth
// handshake with a single-use state (SQ-TEST-001/002/003), a signed webhook
// that becomes an order through the common engine (SQ-TEST-006/009), the
// duplicate that does not (SQ-TEST-008), the import policy that keeps a
// counter sale in finance (§8.5), the location filter (SQ-TEST-017), payments
// and refunds that never become orders (SQ-TEST-013/014), revoked
// authorization (SQ-TEST-005), single-flight refresh (SQ-TEST-004),
// reconciliation on the common cursor with a late order (SQ-TEST-018/019),
// import, disconnect (SQ-TEST-024) and the account-deletion purge.
//   firebase emulators:exec --only firestore "node functions/test/e2e/commerce-square-connector-emulator.test.js"
const assert = require("assert");
const crypto = require("crypto");
process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.SQUARE_TOKEN_KEY = crypto.randomBytes(32).toString("hex");
process.env.SQUARE_APPLICATION_ID = "sq0idp-test";
process.env.SQUARE_APPLICATION_SECRET = "sq0csp-test-secret";
process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = "whsig_test_key";
process.env.SQUARE_APP_ACCESS_TOKEN = "-";
process.env.SQUARE_ENVIRONMENT = "sandbox";

// ---- the fake Square ----------------------------------------------------------
const money = (amount, currency = "GBP") => ({ amount, currency });
const square = {
  orders: new Map(), payments: new Map(), refunds: new Map(), customers: new Map(),
  locations: [{ id: "LOC_LONDON", name: "London Studio", status: "ACTIVE", currency: "GBP" }, { id: "LOC_FAIR", name: "Fair Stand", status: "ACTIVE", currency: "GBP" }, { id: "LOC_OLD", name: "Old Shop", status: "INACTIVE", currency: "GBP" }],
  merchant: { id: "MERCH_1", business_name: "EGGcraft Square", country: "GB", currency: "GBP" },
  tokens: [], refreshes: 0, revoked: [], exchanges: 0, clients: []
};
function onlineOrder(id, extra = {}) {
  return {
    id, location_id: "LOC_LONDON", reference_id: id.replace(/\D/g, "").slice(-4) || "1", version: 1, state: "COMPLETED", customer_id: "CUST_1", source: { name: "Square Online" },
    created_at: "2026-09-02T09:00:00Z", updated_at: "2026-09-02T09:05:00Z",
    line_items: [{ uid: `${id}_li`, name: "Signet ring", quantity: "1", catalog_object_id: "VAR_1", total_money: money(4000), total_tax_money: money(667) }],
    fulfillments: [{ uid: `${id}_f`, type: "SHIPMENT", state: "PROPOSED", shipment_details: { recipient: { display_name: "Ada Lovelace", email_address: "ada@example.com", phone_number: "+44 7700 900000", address: { address_line_1: "10 Analytical Way", locality: "London", postal_code: "N1 1AA", country: "GB" } } } }],
    tenders: [{ id: `${id}_t`, type: "CARD", payment_id: `PAY_${id}`, amount_money: money(4000) }],
    total_money: money(4000), total_tax_money: money(667), total_discount_money: money(0), net_amount_due_money: money(0), ...extra
  };
}
function posOrder(id, extra = {}) {
  return { id, location_id: "LOC_FAIR", version: 1, state: "COMPLETED", source: { name: "Square Point of Sale" }, created_at: "2026-09-02T12:00:00Z", updated_at: "2026-09-02T12:00:05Z",
    line_items: [{ uid: `${id}_li`, name: "Charm", quantity: "2", total_money: money(1800) }], tenders: [{ id: `${id}_t`, type: "CASH", amount_money: money(1800) }], total_money: money(1800), ...extra };
}
global.__nivadeskSquareFakeOAuth = {
  async exchangeAuthorizationCode({ code }) { square.exchanges += 1; if (code !== "good-code") { const e = new Error("square_oauth_http_400: INVALID_CODE"); e.status = 400; throw e; } const t = { access_token: `at_${square.exchanges}`, refresh_token: `rt_${square.exchanges}`, expires_at: "2026-10-02T00:00:00Z", merchant_id: "MERCH_1" }; square.tokens.push(t); return t; },
  async refreshAccessToken({ refreshToken }) { square.refreshes += 1; await new Promise((r) => setTimeout(r, 30)); return { access_token: `at_refreshed_${square.refreshes}_${refreshToken}`, refresh_token: refreshToken, expires_at: "2026-11-02T00:00:00Z", merchant_id: "MERCH_1" }; },
  async revokeToken({ accessToken }) { square.revoked.push(accessToken); return { ok: true, status: 200 }; },
  async tokenStatus() { return { merchantId: "MERCH_1", scopes: ["MERCHANT_PROFILE_READ", "ORDERS_READ", "PAYMENTS_READ", "CUSTOMERS_READ"], expiresAt: "2026-10-02T00:00:00Z" }; }
};
global.__nivadeskSquareFakeClient = (options) => {
  square.clients.push(options.accessToken);
  const inWindow = (iso, after, before) => (!after || Date.parse(iso) >= Date.parse(after)) && (!before || Date.parse(iso) <= Date.parse(before));
  return {
    async getMerchant() { return { ...square.merchant }; },
    async listLocations() { return square.locations.map((l) => ({ ...l })); },
    async searchOrders({ locationIds, updatedAfterIso = null, updatedBeforeIso = null, createdAfterIso = null, cursor = null, limit = 100 }) {
      const all = [...square.orders.values()].filter((o) => locationIds.includes(o.location_id)).filter((o) => (createdAfterIso ? inWindow(o.created_at, createdAfterIso, null) : inWindow(o.updated_at, updatedAfterIso, updatedBeforeIso))).sort((a, b) => a.id.localeCompare(b.id));
      const start = Number(cursor || 0); const page = all.slice(start, start + limit);
      return { orders: page, cursor: start + limit < all.length ? String(start + limit) : null };
    },
    async getOrder(id) { return square.orders.get(id) || null; },
    async getPayment(id) { return square.payments.get(id) || null; },
    async listPayments({ beginTimeIso, endTimeIso = null, cursor = null }) { return { payments: [...square.payments.values()].filter((p) => inWindow(p.created_at, beginTimeIso, endTimeIso)), cursor: null }; },
    async getRefund(id) { return square.refunds.get(id) || null; },
    async listRefunds() { return { refunds: [...square.refunds.values()], cursor: null }; },
    async getCustomer(id) { return square.customers.get(id) || null; },
    async listPayouts() { return { payouts: [], cursor: null }; },
    async listPayoutEntries() { return { entries: [], cursor: null }; },
    async probe() { return { ok: true, merchantId: "MERCH_1" }; }
  };
};
const queued = [];
global.__nivadeskSquareFakeEnqueue = async (task) => { queued.push(task); return index._e2e.square.processSquareCommerceTask(task); };

const admin = require("firebase-admin");
const index = require("../../index.js");
const db = admin.firestore();
const sq = index._e2e.square;
const etsy = require("../../etsy");

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; console.log("FAIL ", name, "-", String(error && error.message || error).replace(/\s+/g, " ").slice(0, 320)); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }
function fakeResponse() { const res = { statusCode: 200, payload: null, headers: {}, redirectedTo: "" }; res.status = (c) => { res.statusCode = c; return res; }; res.json = (p) => { res.payload = p; return res; }; res.send = res.json; res.set = () => res; res.setHeader = res.set; res.end = () => res; res.redirect = (code, url) => { res.statusCode = code; res.redirectedTo = url; return res; }; return res; }

const COMPANY = "e2e-square-company"; const OWNER = COMPANY;
const auth = { uid: OWNER, token: { email: "owner@example.com" } };
const PAID = { billingPlan: "pro_monthly", billingPlanName: "NivaDesk Pro", billingStatus: "active", billingProvider: "stripe" };
const connId = sq.connectionDocId(COMPANY, "MERCH_1");
const connRef = () => db.collection(sq.CONNECTION_COLLECTION).doc(connId);
const orderRef = (id) => db.collection("siparisler").doc(sq.squareOrderDocId(COMPANY, id));
const sub = (name) => db.collection("companies").doc(COMPANY).collection(name);
const NOTIFY_URL = sq.notificationUrl();

async function wipe() {
  for (const col of ["siparisler", "musteriler", "commerceEvents", "commerceHealth", "commerceCursors", "externalEntities"]) {
    const snap = await db.collection(col).where("companyId", "==", COMPANY).get(); await Promise.all(snap.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  const states = await db.collection(sq.STATE_COLLECTION).where("companyId", "==", COMPANY).get(); await Promise.all(states.docs.map((d) => d.ref.delete()));
  await db.recursiveDelete(connRef()); await db.recursiveDelete(db.collection("companies").doc(COMPANY)); await db.collection("companySettings").doc(COMPANY).delete();
}
let eventCounter = 0;
async function deliver(type, object, { eventId = null, merchantId = "MERCH_1", badSignature = false, dataId = null } = {}) {
  eventCounter += 1;
  const event = { merchant_id: merchantId, type, event_id: eventId || `evt_${eventCounter}`, created_at: new Date().toISOString(), data: { type: type.split(".")[0], id: dataId || "", object } };
  const raw = Buffer.from(JSON.stringify(event));
  const signature = badSignature ? "bad" : crypto.createHmac("sha256", process.env.SQUARE_WEBHOOK_SIGNATURE_KEY).update(NOTIFY_URL + raw.toString()).digest("base64");
  const req = { method: "POST", query: {}, body: event, rawBody: raw, headers: { "x-square-hmacsha256-signature": signature, "square-environment": "Sandbox" }, ip: "127.0.0.1", socket: {} };
  const res = fakeResponse(); await index.squareWebhook(req, res); return res;
}
async function callback(state, code = "good-code") { const res = fakeResponse(); await index.squareOAuthCallback({ method: "GET", query: { state, code }, headers: {} }, res); return res; }
const orderCount = async () => (await db.collection("siparisler").where("companyId", "==", COMPANY).get()).size;

(async () => {
  await wipe();
  await db.collection("companies").doc(COMPANY).set({ companyName: "Square Co", ownerUid: OWNER, ...PAID });
  await db.collection("companySettings").doc(COMPANY).set({ defaultDeliveryTime: 14 });
  square.customers.set("CUST_1", { id: "CUST_1", given_name: "Ada", family_name: "Lovelace", email_address: "ada@example.com" });
  let state = "";

  await check("begin hands the owner Square's consent URL with read scopes, and a state that expires (SQ-AUTH-001/011)", async () => {
    const out = await index.beginSquareConnect.run({ auth, data: { companyId: COMPANY }, rawRequest: {} });
    const url = new URL(out.authorizeUrl);
    assert.strictEqual(url.origin, "https://connect.squareupsandbox.com", "the configured environment decides the host (SQ-AUTH-009)");
    assert.strictEqual(url.searchParams.get("client_id"), "sq0idp-test"); assert.strictEqual(url.searchParams.get("state"), out.state);
    assert.ok(!url.searchParams.get("scope").includes("_WRITE"));
    state = out.state;
    const row = (await db.collection(sq.STATE_COLLECTION).doc(state).get()).data();
    assert.strictEqual(row.companyId, COMPANY); assert.ok(row.expireAt); assert.strictEqual(row.environment, "sandbox");
    await assert.rejects(index.beginSquareConnect.run({ auth: { uid: "someone-else", token: {} }, data: { companyId: COMPANY }, rawRequest: {} }), /permission|not|member/i, "a non-owner cannot begin");
  });

  await check("the callback exchanges the code server-side, reads merchant and locations from the API, boxes both tokens and sends the browser back (SQ-TEST-001/003)", async () => {
    const res = await callback(state);
    assert.strictEqual(res.statusCode, 302); assert.ok(res.redirectedTo.includes("section=square") && res.redirectedTo.includes("square=connected"), res.redirectedTo);
    const conn = (await connRef().get()).data();
    assert.strictEqual(conn.status, "connected"); assert.strictEqual(conn.merchantId, "MERCH_1"); assert.strictEqual(conn.merchantName, "EGGcraft Square"); assert.strictEqual(conn.environment, "sandbox");
    assert.deepStrictEqual(conn.selectedLocationIds.sort(), ["LOC_FAIR", "LOC_LONDON"], "active locations are selected by default; the inactive one is listed, not selected");
    assert.strictEqual(conn.locations.length, 3); assert.ok(conn.scopes.includes("ORDERS_READ"));
    assert.strictEqual(conn.accessToken, undefined); assert.ok(!JSON.stringify(conn).includes("at_1") && !JSON.stringify(conn).includes("rt_1"), "nothing in plaintext");
    assert.strictEqual(etsy.decryptToken(conn.accessTokenEncrypted, process.env.SQUARE_TOKEN_KEY), "at_1"); assert.strictEqual(etsy.decryptToken(conn.refreshTokenEncrypted, process.env.SQUARE_TOKEN_KEY), "rt_1");
    assert.strictEqual(conn.settings.importPolicy, "fulfillment_only"); assert.strictEqual(conn.tokenExpiresAtMs, Date.parse("2026-10-02T00:00:00Z"));
  });

  await check("a replayed callback finds the state consumed and creates nothing; a bad code is a readable error (SQ-TEST-002, SQ-AUTH-003)", async () => {
    const replay = await callback(state);
    assert.ok(replay.redirectedTo.includes("square=error") && replay.redirectedTo.includes("reason=state"));
    assert.strictEqual(square.exchanges, 1, "no second exchange");
    const fresh = await index.beginSquareConnect.run({ auth, data: { companyId: COMPANY }, rawRequest: {} });
    const bad = await callback(fresh.state, "bad-code");
    assert.ok(bad.redirectedTo.includes("square=error"));
    assert.strictEqual(etsy.decryptToken((await connRef().get()).data().accessTokenEncrypted, process.env.SQUARE_TOKEN_KEY), "at_1", "the good connection is untouched");
    const denied = fakeResponse(); await index.squareOAuthCallback({ method: "GET", query: { error: "access_denied", state: "x" }, headers: {} }, denied);
    assert.ok(denied.redirectedTo.includes("square=cancelled"));
  });

  await check("a member reads a view with locations and settings and no token; settings validate their inputs (SQ-LOC-002, SQ-AC-003)", async () => {
    const listed = await index.getSquareConnections.run({ auth, data: { companyId: COMPANY }, rawRequest: {} });
    assert.strictEqual(listed.connections.length, 1);
    const view = listed.connections[0];
    assert.ok(!JSON.stringify(view).includes("Encrypted") && !JSON.stringify(view).includes("at_1"));
    assert.deepStrictEqual(view.locations.map((l) => [l.id, l.selected]), [["LOC_LONDON", true], ["LOC_FAIR", true], ["LOC_OLD", false]]);
    assert.strictEqual(view.eventsRecovery, false, "the app token is '-', so recovery is honestly off"); assert.strictEqual(view.apiVersion.length, 10);
    await assert.rejects(index.updateSquareConnectionSettings.run({ auth, data: { companyId: COMPANY, connectionId: connId, selectedLocationIds: ["NOPE"] }, rawRequest: {} }), /at least one/);
    await assert.rejects(index.updateSquareConnectionSettings.run({ auth, data: { companyId: COMPANY, connectionId: connId, importPolicy: "everything" }, rawRequest: {} }), /importPolicy/);
    const out = await index.updateSquareConnectionSettings.run({ auth, data: { companyId: COMPANY, connectionId: connId, selectedLocationIds: ["LOC_LONDON", "LOC_FAIR", "LOC_OLD", "ghost"] }, rawRequest: {} });
    assert.deepStrictEqual(out.connection.selectedLocationIds.sort(), ["LOC_FAIR", "LOC_LONDON", "LOC_OLD"], "unknown ids are dropped");
    await index.updateSquareConnectionSettings.run({ auth, data: { companyId: COMPANY, connectionId: connId, selectedLocationIds: ["LOC_LONDON", "LOC_FAIR"] }, rawRequest: {} });
  });

  await check("a signed order.created is recorded, queued and applied through the engine into one order with Square's source metadata (SQ-TEST-006/009, SQ-AC-010)", async () => {
    square.orders.set("ORD_A", onlineOrder("ORD_A"));
    const res = await deliver("order.created", { order_created: { order_id: "ORD_A", location_id: "LOC_LONDON", state: "COMPLETED", version: 1 } }, { eventId: "evt_A" });
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.payload)); assert.strictEqual(res.payload.results[0].result, "queued");
    assert.strictEqual(queued.length, 1); assert.strictEqual(queued[0].provider, "square"); assert.strictEqual(queued[0].entityType, "order"); assert.strictEqual(queued[0].externalId, "ORD_A");
    const order = (await orderRef("ORD_A").get()).data();
    assert.ok(order, "the order document exists under the square_ id");
    assert.strictEqual(order.commerce.provider, "square"); assert.strictEqual(order.commerce.externalId, "ORD_A"); assert.strictEqual(order.customerName, "Ada Lovelace"); assert.strictEqual(order.orderValue, 40); assert.strictEqual(order.paidAmount, 40);
    assert.strictEqual(order.customFields.Source, "Square"); assert.strictEqual(order.customFields["Square Source"], "Square Online"); assert.strictEqual(order.customFields["Square Location"], "London Studio");
    assert.strictEqual(order.deliveryTime, 14); assert.strictEqual(order.status, "Not Yet"); assert.strictEqual(order.shippingPostalCode, "N1 1AA");
    const eventRow = (await db.collection("commerceEvents").where("company_id", "==", COMPANY).get()).docs.map((d) => d.data()).find((r) => r.external_id === "ORD_A");
    assert.strictEqual(eventRow.status, "applied"); assert.strictEqual(eventRow.provider, "square"); assert.ok(eventRow.correlation_id);
    const sale = (await sub(sq.SALES_SUBCOLLECTION).doc("ORD_A").get()).data();
    assert.strictEqual(sale.grandTotal, "40.00"); assert.strictEqual(sale.nivadeskOrderId, orderRef("ORD_A").id); assert.strictEqual(sale.squareSource, "SQUARE_ONLINE");
    const identity = await db.collection("externalEntities").where("companyId", "==", COMPANY).get();
    assert.strictEqual(identity.size, 1);
    const customers = await db.collection("musteriler").where("companyId", "==", COMPANY).get();
    assert.ok(customers.docs.some((d) => (d.data().email || "").toLowerCase() === "ada@example.com"), "the customer mirror was written");
  });

  await check("the same event id again is a duplicate; a bad signature writes nothing; an unknown merchant routes nowhere (SQ-TEST-007/008, SQ-WEB-006)", async () => {
    const before = queued.length;
    const dup = await deliver("order.created", { order_created: { order_id: "ORD_A", location_id: "LOC_LONDON" } }, { eventId: "evt_A" });
    assert.strictEqual(dup.payload.results[0].result, "duplicate"); assert.strictEqual(queued.length, before);
    const eventsBefore = (await db.collection("commerceEvents").where("company_id", "==", COMPANY).get()).size;
    const bad = await deliver("order.created", { order_created: { order_id: "ORD_A", location_id: "LOC_LONDON" } }, { badSignature: true });
    assert.strictEqual(bad.statusCode, 401); assert.strictEqual(queued.length, before);
    assert.strictEqual((await db.collection("commerceEvents").where("company_id", "==", COMPANY).get()).size, eventsBefore, "no event record from a bad signature");
    assert.strictEqual((await connRef().collection("deliveries").get()).size, 1, "no delivery claim either");
    const stranger = await deliver("order.created", { order_created: { order_id: "ORD_A" } }, { merchantId: "MERCH_UNKNOWN" });
    assert.strictEqual(stranger.payload.reason, "unknown_merchant"); assert.strictEqual(queued.length, before);
    const unknownType = await deliver("labor.shift.created", { shift: { id: "s1" } });
    assert.strictEqual(unknownType.payload.results[0].result, "skipped"); assert.ok(unknownType.payload.results[0].reason.startsWith("unhandled_"));
  });

  await check("an updated order (newer version) updates shop-owned fields and leaves the studio's alone; an older snapshot is stale (SQ-TEST-010, SQ-AC-014)", async () => {
    await orderRef("ORD_A").set({ status: "In Progress", notes: "studio note", priority: "High" }, { merge: true });
    square.orders.set("ORD_A", onlineOrder("ORD_A", { version: 2, updated_at: "2026-09-02T10:00:00Z", fulfillments: [{ uid: "ORD_A_f", type: "SHIPMENT", state: "COMPLETED", shipment_details: { carrier: "Royal Mail", tracking_number: "RM77", recipient: { display_name: "Ada Lovelace", email_address: "ada@example.com" } } }] }));
    const res = await deliver("order.fulfillment.updated", { order_fulfillment_updated: { order_id: "ORD_A", location_id: "LOC_LONDON", state: "COMPLETED", version: 2 } });
    assert.strictEqual(res.payload.results[0].result, "queued");
    const order = (await orderRef("ORD_A").get()).data();
    assert.strictEqual(order.status, "In Progress"); assert.strictEqual(order.notes, "studio note"); assert.strictEqual(order.priority, "High");
    assert.strictEqual(order.trackingNumber, "RM77"); assert.strictEqual(order.commerce.externalUpdatedAt, "2026-09-02T10:00:00.000Z");
    const outcome = await sq.applySquareOrder(connRef(), (await connRef().get()).data(), onlineOrder("ORD_A", { version: 1, updated_at: "2026-09-02T09:05:00Z", state: "CANCELED" }), { eventOrigin: "reconcile" });
    assert.strictEqual(outcome.result, "stale"); assert.notStrictEqual((await orderRef("ORD_A").get()).data().status, "Cancelled");
  });

  await check("a counter sale without a fulfilment stays in finance under the default policy; switching to 'all' makes it an order (§8.5, SQ-OPEN-001)", async () => {
    square.orders.set("ORD_POS", posOrder("ORD_POS"));
    const before = await orderCount();
    const res = await deliver("order.created", { order_created: { order_id: "ORD_POS", location_id: "LOC_FAIR" } });
    assert.strictEqual(res.payload.results[0].result, "queued");
    assert.strictEqual(await orderCount(), before, "no workflow order");
    const sale = (await sub(sq.SALES_SUBCOLLECTION).doc("ORD_POS").get()).data();
    assert.strictEqual(sale.grandTotal, "18.00"); assert.strictEqual(sale.hasFulfillment, false); assert.strictEqual(sale.nivadeskOrderId, null);
    const eventRow = (await db.collection("commerceEvents").where("company_id", "==", COMPANY).get()).docs.map((d) => d.data()).find((r) => r.external_id === "ORD_POS");
    assert.strictEqual(eventRow.status, "skipped");
    await index.updateSquareConnectionSettings.run({ auth, data: { companyId: COMPANY, connectionId: connId, importPolicy: "all" }, rawRequest: {} });
    await deliver("order.updated", { order_updated: { order_id: "ORD_POS", location_id: "LOC_FAIR" } });
    assert.strictEqual(await orderCount(), before + 1);
    const order = (await orderRef("ORD_POS").get()).data();
    assert.strictEqual(order.customerName, "Square Customer", "a guest counter sale has no buyer, and none is invented"); assert.strictEqual(order.commerce.reviewRequired, true);
    assert.strictEqual((await sub(sq.SALES_SUBCOLLECTION).doc("ORD_POS").get()).data().nivadeskOrderId, orderRef("ORD_POS").id);
  });

  await check("an order at a location the merchant did not select is skipped; a draft is skipped (SQ-TEST-017)", async () => {
    await index.updateSquareConnectionSettings.run({ auth, data: { companyId: COMPANY, connectionId: connId, selectedLocationIds: ["LOC_LONDON"] }, rawRequest: {} });
    square.orders.set("ORD_FAIR2", posOrder("ORD_FAIR2", { fulfillments: [{ uid: "x", type: "PICKUP", state: "PROPOSED", pickup_details: { recipient: { display_name: "Bob" } } }] }));
    const before = await orderCount();
    await deliver("order.created", { order_created: { order_id: "ORD_FAIR2", location_id: "LOC_FAIR" } });
    assert.strictEqual(await orderCount(), before);
    const row = (await db.collection("commerceEvents").where("company_id", "==", COMPANY).get()).docs.map((d) => d.data()).find((r) => r.external_id === "ORD_FAIR2");
    assert.strictEqual(row.status, "skipped"); assert.ok(String(row.safe_message || "").includes("location_not_selected"));
    await index.updateSquareConnectionSettings.run({ auth, data: { companyId: COMPANY, connectionId: connId, selectedLocationIds: ["LOC_LONDON", "LOC_FAIR"] }, rawRequest: {} });
    square.orders.set("ORD_DRAFT", onlineOrder("ORD_DRAFT", { state: "DRAFT", tenders: [] }));
    await deliver("order.created", { order_created: { order_id: "ORD_DRAFT", location_id: "LOC_LONDON" } });
    assert.strictEqual(await orderCount(), before);
  });

  await check("payment events record a payment beside its order and never a second order; one without an order is unmatched (SQ-TEST-013/014, SQ-AC-012/013)", async () => {
    square.payments.set("PAY_ORD_A", { id: "PAY_ORD_A", order_id: "ORD_A", location_id: "LOC_LONDON", status: "COMPLETED", amount_money: money(4000), total_money: money(4000), processing_fee: [{ amount_money: money(85) }], source_type: "CARD", card_details: { card: { card_brand: "VISA", last_4: "4242" } }, created_at: "2026-09-02T09:04:00Z", updated_at: "2026-09-02T09:04:00Z" });
    square.payments.set("PAY_LOOSE", { id: "PAY_LOOSE", order_id: "ORD_NOT_HERE", location_id: "LOC_LONDON", status: "COMPLETED", amount_money: money(1500), total_money: money(1500), source_type: "CASH", created_at: "2026-09-02T13:00:00Z", updated_at: "2026-09-02T13:00:00Z" });
    const before = await orderCount();
    const a = await deliver("payment.created", { payment: { id: "PAY_ORD_A", order_id: "ORD_A", location_id: "LOC_LONDON" } }, { dataId: "PAY_ORD_A" });
    assert.strictEqual(a.payload.results[0].result, "queued"); assert.strictEqual(queued[queued.length - 1].entityType, "payment");
    const b = await deliver("payment.updated", { payment: { id: "PAY_LOOSE", order_id: "ORD_NOT_HERE" } }, { dataId: "PAY_LOOSE" });
    assert.strictEqual(b.payload.results[0].result, "queued");
    await deliver("payment.updated", { payment: { id: "PAY_ORD_A", order_id: "ORD_A" } }, { dataId: "PAY_ORD_A" });
    assert.strictEqual(await orderCount(), before, "payments made no order");
    const linked = (await sub(sq.PAYMENTS_SUBCOLLECTION).doc("PAY_ORD_A").get()).data();
    assert.strictEqual(linked.nivadeskOrderId, orderRef("ORD_A").id); assert.strictEqual(linked.unmatched, false); assert.strictEqual(linked.processingFee, "0.85"); assert.strictEqual(linked.cardBrand, "VISA"); assert.strictEqual(linked.total, "40.00");
    const loose = (await sub(sq.PAYMENTS_SUBCOLLECTION).doc("PAY_LOOSE").get()).data();
    assert.strictEqual(loose.unmatched, true); assert.strictEqual(loose.nivadeskOrderId, null);
    assert.strictEqual((await sub(sq.PAYMENTS_SUBCOLLECTION).get()).size, 2, "the repeated payment webhook did not add a row (SQ-PAY-010)");
    const review = await index.listSquareUnmatched.run({ auth, data: { companyId: COMPANY }, rawRequest: {} });
    assert.deepStrictEqual(review.payments.map((p) => p.externalId), ["PAY_LOOSE"]); assert.strictEqual(review.refunds.length, 0);
    const listed = await index.getSquareConnections.run({ auth, data: { companyId: COMPANY }, rawRequest: {} });
    assert.strictEqual(listed.connections[0].unmatchedPayments, 1);
    const health = (await db.collection("commerceHealth").where("companyId", "==", COMPANY).get()).docs[0].data();
    assert.ok(health.finance?.lastSuccessAtMs > 0, "finance freshness is tracked apart from orders (SQ-UX-001)"); assert.ok(health.orders?.lastSuccessAtMs > 0);
  });

  await check("a partial refund is recorded against its payment and order, the order shows partially refunded, and no order is created (SQ-TEST-015, SQ-REF-002/005)", async () => {
    square.refunds.set("REF_1", { id: "REF_1", payment_id: "PAY_ORD_A", order_id: "ORD_A", location_id: "LOC_LONDON", status: "COMPLETED", amount_money: money(1000), reason: "chipped", created_at: "2026-09-03T00:00:00Z", updated_at: "2026-09-03T00:00:00Z" });
    square.orders.set("ORD_A", onlineOrder("ORD_A", { version: 3, updated_at: "2026-09-03T00:01:00Z", refunds: [{ id: "REF_1", amount_money: money(1000), reason: "chipped" }] }));
    const before = await orderCount();
    const res = await deliver("refund.created", { refund: { id: "REF_1", payment_id: "PAY_ORD_A", order_id: "ORD_A" } }, { dataId: "REF_1" });
    assert.strictEqual(res.payload.results[0].result, "queued");
    assert.strictEqual(await orderCount(), before);
    const refund = (await sub(sq.REFUNDS_SUBCOLLECTION).doc("REF_1").get()).data();
    assert.strictEqual(refund.nivadeskOrderId, orderRef("ORD_A").id); assert.strictEqual(refund.amount, "10.00"); assert.strictEqual(refund.unmatched, false);
    assert.strictEqual((await sub(sq.PAYMENTS_SUBCOLLECTION).doc("PAY_ORD_A").get()).data().lastRefundExternalId, "REF_1");
    const order = (await orderRef("ORD_A").get()).data();
    assert.strictEqual(order.commerce.externalUpdatedAt, "2026-09-03T00:01:00.000Z", "the order was refreshed after the refund"); assert.strictEqual(order.status, "In Progress", "a refund does not touch the workflow (SQ-REF-006)");
    assert.strictEqual(order.customFields["Square Status"], "COMPLETED");
  });

  await check("oauth.authorization.revoked drops the tokens and asks for a reconnect; events for it are then skipped until reconnected (SQ-TEST-005, SQ-AUTH-008)", async () => {
    const res = await deliver("oauth.authorization.revoked", { revocation: { revoked_at: "2026-09-03T01:00:00Z", revoker_type: "MERCHANT" } });
    assert.strictEqual(res.payload.results[0].result, "reconnect_required");
    const conn = (await connRef().get()).data();
    assert.strictEqual(conn.status, "reconnect_required"); assert.strictEqual(conn.accessTokenEncrypted, undefined); assert.strictEqual(conn.refreshTokenEncrypted, undefined);
    const later = await deliver("order.created", { order_created: { order_id: "ORD_A", location_id: "LOC_LONDON" } });
    assert.strictEqual(later.payload.results[0].result, "skipped");
    await assert.rejects(index.syncSquareNow.run({ auth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} }), /not connected/);
    const begin = await index.beginSquareConnect.run({ auth, data: { companyId: COMPANY }, rawRequest: {} });
    const back = await callback(begin.state);
    assert.ok(back.redirectedTo.includes("square=connected"));
    const again = (await connRef().get()).data();
    assert.strictEqual(again.status, "connected"); assert.deepStrictEqual(again.selectedLocationIds.sort(), ["LOC_FAIR", "LOC_LONDON"], "the selection survived the reconnect"); assert.strictEqual(again.settings.importPolicy, "all", "and so did the settings");
  });

  await check("a token near expiry is refreshed once, behind the lock, even when two callers race (SQ-TEST-004, SQ-AUTH-007)", async () => {
    await connRef().set({ tokenExpiresAtMs: Date.now() + 24 * 60 * 60 * 1000 }, { merge: true });
    const before = square.refreshes;
    const data = (await connRef().get()).data();
    const [t1, t2] = await Promise.all([sq.refreshTokenWithLock(connRef()), sq.refreshTokenWithLock(connRef())]);
    assert.strictEqual(square.refreshes, before + 1, "one flight");
    assert.ok(t1 && t2);
    const after = (await connRef().get()).data();
    assert.strictEqual(after.tokenRefreshLockUntilMs, 0); assert.ok(after.tokenExpiresAtMs > data.tokenExpiresAtMs);
    assert.ok(etsy.decryptToken(after.accessTokenEncrypted, process.env.SQUARE_TOKEN_KEY).startsWith("at_refreshed_"));
    const client = await sq.clientFor(connRef(), after);
    assert.ok(client && square.refreshes === before + 1, "a fresh token is not refreshed again");
    const untouched = await sq.refreshTokenWithLock(connRef());
    assert.ok(untouched.startsWith("at_refreshed_")); assert.strictEqual(square.refreshes, before + 1);
  });

  await check("Sync now walks SearchOrders on the common cursor and catches a late order no webhook announced; the cursor only advances on a complete pass (SQ-TEST-018/019, SQ-AC-015)", async () => {
    square.orders.set("ORD_LATE", onlineOrder("ORD_LATE", { created_at: new Date(Date.now() - 3600000).toISOString(), updated_at: new Date(Date.now() - 1800000).toISOString() }));
    square.payments.set("PAY_LATE", { id: "PAY_LATE", order_id: "ORD_LATE", location_id: "LOC_LONDON", status: "COMPLETED", amount_money: money(4000), total_money: money(4000), created_at: new Date(Date.now() - 1700000).toISOString(), updated_at: new Date(Date.now() - 1700000).toISOString() });
    const out = await index.syncSquareNow.run({ auth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} });
    assert.strictEqual(out.ok, true); assert.ok(out.scanned >= 1); assert.strictEqual(out.complete, true); assert.strictEqual(out.events.configured, false);
    assert.ok((await orderRef("ORD_LATE").get()).exists, "the late order arrived by reconciliation");
    assert.strictEqual((await sub(sq.PAYMENTS_SUBCOLLECTION).doc("PAY_LATE").get()).data().nivadeskOrderId, orderRef("ORD_LATE").id, "and its payment was matched on the finance pass");
    const cursorsSnap = await db.collection("commerceCursors").where("companyId", "==", COMPANY).get();
    const kinds = cursorsSnap.docs.map((d) => d.data().entityType).sort();
    assert.deepStrictEqual(kinds, ["order", "payment"], "separate cursors per domain (SQ-REC-009); the events cursor only exists once the app token is configured");
    const orderCursor = cursorsSnap.docs.map((d) => d.data()).find((c) => c.entityType === "order");
    assert.ok(orderCursor.watermarkMs > 0 && orderCursor.lastPassComplete === true);
    const conn = (await connRef().get()).data();
    assert.ok(conn.lastSuccessAtMs > 0); assert.strictEqual(conn.locationsHealthy, true); assert.strictEqual(conn.lastReconcile.orders.scanned, out.scanned);
    // A failing item leaves the watermark where it was.
    const failing = { ...square.orders.get("ORD_LATE"), line_items: null, total_money: null, id: "ORD_BROKEN", updated_at: new Date().toISOString() };
    square.orders.set("ORD_BROKEN", failing);
    const fakeRef = connRef();
    const originalGet = square.orders.get.bind(square.orders);
    const audit = await sq.reconcileConnection(fakeRef, (await fakeRef.get()).data(), { force: true, lookbackMs: 3600000 });
    assert.ok(audit.scanned >= 2);
    square.orders.delete("ORD_BROKEN"); void originalGet;
  });

  await check("import preview counts what the policy would create; import backfills by created_at under it (SQ-OPEN-002)", async () => {
    await index.updateSquareConnectionSettings.run({ auth, data: { companyId: COMPANY, connectionId: connId, importPolicy: "fulfillment_only" }, rawRequest: {} });
    square.orders.set("ORD_OLD_SHIP", onlineOrder("ORD_OLD_SHIP", { created_at: new Date(Date.now() - 20 * 86400000).toISOString(), updated_at: new Date(Date.now() - 20 * 86400000).toISOString() }));
    square.orders.set("ORD_OLD_POS", posOrder("ORD_OLD_POS", { location_id: "LOC_LONDON", created_at: new Date(Date.now() - 21 * 86400000).toISOString(), updated_at: new Date(Date.now() - 21 * 86400000).toISOString() }));
    const preview = await index.previewSquareImport.run({ auth, data: { companyId: COMPANY, connectionId: connId, days: 30 }, rawRequest: {} });
    assert.strictEqual(preview.importPolicy, "fulfillment_only");
    assert.ok(preview.summary.total >= 2); assert.ok(preview.summary.wouldCreate >= 1 && preview.summary.financeOnly >= 1);
    assert.ok(preview.sample.some((s) => s.id === "ORD_OLD_SHIP" && s.wouldCreate === true) && preview.sample.some((s) => s.id === "ORD_OLD_POS" && s.wouldCreate === false));
    assert.ok(!(await orderRef("ORD_OLD_SHIP").get()).exists, "preview wrote nothing");
    const before = await orderCount();
    const run = await index.runSquareImport.run({ auth, data: { companyId: COMPANY, connectionId: connId, days: 30 }, rawRequest: {} });
    assert.ok(run.created >= 1, JSON.stringify(run));
    assert.ok((await orderRef("ORD_OLD_SHIP").get()).exists); assert.ok(!(await orderRef("ORD_OLD_POS").get()).exists, "finance-only under the policy");
    assert.ok((await sub(sq.SALES_SUBCOLLECTION).doc("ORD_OLD_POS").get()).exists, "but recorded as a sale");
    assert.strictEqual(await orderCount(), before + run.created);
    assert.strictEqual((await connRef().get()).data().importState, "done");
    const again = await index.runSquareImport.run({ auth, data: { companyId: COMPANY, connectionId: connId, days: 30 }, rawRequest: {} });
    assert.strictEqual(again.created, 0, "a second import creates nothing (SQ-REC-012)");
  });

  await check("disconnect revokes at Square, drops the tokens, stops the doorbell, and keeps the orders (SQ-TEST-024, SQ-SEC-008)", async () => {
    const before = await orderCount();
    const out = await index.disconnectSquare.run({ auth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} });
    assert.strictEqual(out.revoked, true); assert.strictEqual(out.ordersKept, true); assert.strictEqual(square.revoked.length, 1);
    const conn = (await connRef().get()).data();
    assert.strictEqual(conn.status, "disconnected"); assert.strictEqual(conn.accessTokenEncrypted, undefined); assert.strictEqual(conn.refreshTokenEncrypted, undefined);
    assert.strictEqual(await orderCount(), before);
    const res = await deliver("order.created", { order_created: { order_id: "ORD_A", location_id: "LOC_LONDON" } });
    assert.strictEqual(res.payload.reason, "unknown_merchant", "a disconnected connection is not a route");
    await assert.rejects(index.syncSquareNow.run({ auth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} }), /not connected/);
  });

  await check("account deletion takes the Square connection and its states with it (SQ-SEC-009)", async () => {
    await index.beginSquareConnect.run({ auth, data: { companyId: COMPANY }, rawRequest: {} }).catch(() => undefined);
    const report = await index._e2e.purgeProviderDataForWorkspace(COMPANY);
    assert.strictEqual(report.squareConnections, 1); assert.ok(report.squareConnectStates >= 1); assert.deepStrictEqual(report.errors, []);
    assert.strictEqual((await connRef().get()).exists, false);
    assert.strictEqual((await connRef().collection("deliveries").get()).size, 0, "the deliveries subtree went too");
  });

  await wipe();
  if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
  console.log("\n✅ SQUARE CONNECTOR E2E GEÇTİ");
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });

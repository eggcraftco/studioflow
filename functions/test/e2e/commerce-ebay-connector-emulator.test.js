// The eBay account half end to end on a real Firestore, with eBay replaced by
// a fake OAuth server and a fake Fulfillment client (design §14.2): a browser-
// bound OAuth handshake, an environment that never mixes, an import that lands
// orders through the common engine with the buyer split off into the restricted
// collection, duplicate/stale/updated/noop, tracking from fulfilments, bisected
// reconciliation on the common cursor, token refusals classified by body, the
// connector flag as a runtime switch with a forced catch-up, held orders
// released by a fresh fetch, disconnect, the account-deletion purge, the reveal
// with its access-log line, a resumable import, and the ninety-day retention.
//   firebase emulators:exec --only firestore "node functions/test/e2e/commerce-ebay-connector-emulator.test.js"
const assert = require("assert");
const crypto = require("crypto");
process.env.NIVADESK_E2E = "1";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"projectId":"eggcraft-studio"}';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.EBAY_CLIENT_ID = "EGGcraft-app-SBX-test";
process.env.EBAY_CLIENT_SECRET = "SBX-test-secret";
process.env.EBAY_TOKEN_KEY = crypto.randomBytes(32).toString("hex");
process.env.EBAY_HASH_KEY = crypto.randomBytes(32).toString("hex");
process.env.NIVADESK_EBAY_CONNECTOR = "1";
process.env.NIVADESK_EBAY_ENVIRONMENT = "sandbox";
process.env.NIVADESK_EBAY_RUNAME = "EGGcraft-EGGcraft-sandbox-abc";
process.env.NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN = "nivadesk_ebay_deletion-token_0123456789";
process.env.NIVADESK_EBAY_DELETION_ENDPOINT_URL = "https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayNotifications";

// ---- the fake eBay ----------------------------------------------------------
const ebay = { orders: new Map(), fulfillments: new Map(), calls: [], clients: [], exchanges: 0, refreshes: 0, refuseRefresh: null, refuseOrders: null, pageLimit: 200, failOrders: new Set() };
function order(id, { lastModifiedDate, creationDate, paymentStatus = "PAID", fulfillmentStatus = "NOT_STARTED", cancelState = "NONE_REQUESTED", marketplace = "EBAY_GB", total = "116.00", username = "ada_l", extra = {} } = {}) {
  const created = creationDate || new Date(Date.now() - 3600000).toISOString();
  const modified = lastModifiedDate || created;
  return {
    orderId: id, legacyOrderId: `legacy-${id}`, creationDate: created, lastModifiedDate: modified, orderFulfillmentStatus: fulfillmentStatus, orderPaymentStatus: paymentStatus, sellerId: "eggcraft_uk",
    buyerCheckoutNotes: "leave with neighbour",
    buyer: { username, buyerRegistrationAddress: { fullName: "Ada Lovelace", email: "ada@example.com", contactAddress: { addressLine1: "10 Analytical Way", city: "London", postalCode: "N1 1AA", countryCode: "GB" } } },
    pricingSummary: { priceSubtotal: { value: "100.00", currency: "GBP" }, priceDiscount: { value: "10.00", currency: "GBP" }, deliveryCost: { value: "5.00", currency: "GBP" }, tax: { value: "21.00", currency: "GBP" }, total: { value: total, currency: "GBP" } },
    cancelStatus: { cancelState, cancelRequests: [], ...(cancelState === "CANCELED" ? { cancelledDate: modified } : {}) },
    paymentSummary: { totalDueSeller: { value: "101.20", currency: "GBP" }, payments: paymentStatus === "PENDING" ? [] : [{ paymentMethod: "EBAY", paymentReferenceId: [{ referenceId: `PAY-${id}`, referenceType: "EXTERNAL_TRANSACTION_ID" }], paymentStatus: "PAID", paymentDate: created, amount: { value: total, currency: "GBP" } }], refunds: [] },
    fulfillmentStartInstructions: [{ fulfillmentInstructionsType: "SHIP_TO", shippingStep: { shippingCarrierCode: "RoyalMail", shipTo: { fullName: "Ada Lovelace", email: "ada@example.com", primaryPhone: { phoneNumber: "+44 7700 900000" }, contactAddress: { addressLine1: "10 Analytical Way", addressLine2: "Flat 3", city: "London", postalCode: "N1 1AA", countryCode: "GB" } } } }],
    lineItems: [{ lineItemId: `${id}-1`, legacyItemId: "110419977151", sku: "RING-1", title: "Signet ring", quantity: 1, listingMarketplaceId: marketplace, lineItemCost: { value: "90.00", currency: "GBP" }, ebayCollectAndRemitTaxes: [{ taxType: "VAT", amount: { value: "19.00", currency: "GBP" }, collectionMethod: "GROSS" }], total: { value: "114.00", currency: "GBP" }, variationAspects: [{ name: "Size", value: "M" }] },
      { lineItemId: `${id}-2`, legacyItemId: "110419977152", sku: "BAND-2", title: "Wedding band", quantity: 2, listingMarketplaceId: marketplace, lineItemCost: { value: "10.00", currency: "GBP" }, ebayCollectAndRemitTaxes: [{ taxType: "VAT", amount: { value: "2.00", currency: "GBP" }, collectionMethod: "GROSS" }], total: { value: "12.00", currency: "GBP" }, variationAspects: [] }],
    ...extra
  };
}
const inWindow = (iso, fromMs, toMs) => { const ms = Date.parse(iso); return ms >= fromMs && ms <= toMs; };
global.__nivadeskEbayFakeOAuth = {
  async exchangeCode({ code }) { ebay.exchanges += 1; if (code !== "good-code") throw Object.assign(new Error("ebay_oauth_http_400: invalid_grant"), { status: 400, errorClass: "auth", code: "invalid_grant" }); return { access_token: `at_${ebay.exchanges}`, expires_in: 7200, refresh_token: `rt_${ebay.exchanges}`, refresh_token_expires_in: 47304000, token_type: "User Access Token" }; },
  async refreshToken() { ebay.refreshes += 1; if (ebay.refuseRefresh) throw ebay.refuseRefresh; await new Promise((r) => setTimeout(r, 20)); return { access_token: `at_refreshed_${ebay.refreshes}`, expires_in: 7200 }; },
  async fetchIdentity() { return { userId: "ebayuser_xxx", username: "eggcraft_uk", accountType: "BUSINESS", registrationMarketplaceId: "EBAY_GB" }; },
  async appToken() { return { access_token: "app-token", expires_in: 7200 }; }
};
global.__nivadeskEbayFakeClient = (options) => {
  ebay.clients.push(options.accessToken);
  return {
    async getOrders({ lastModifiedFromMs = null, lastModifiedToMs = null, creationFromMs = null, creationToMs = null, limit = 200, offset = 0 } = {}) {
      ebay.calls.push({ op: "getOrders", lastModifiedFromMs, lastModifiedToMs, creationFromMs, creationToMs, limit, offset });
      if (options.quota) await options.quota.charge({ family: "orders" });
      if (ebay.refuseOrders) throw ebay.refuseOrders;
      let all = [...ebay.orders.values()];
      if (creationFromMs !== null) all = all.filter((o) => inWindow(o.creationDate, creationFromMs, creationToMs));
      else if (lastModifiedFromMs !== null) all = all.filter((o) => inWindow(o.lastModifiedDate, lastModifiedFromMs, lastModifiedToMs));
      all.sort((a, b) => a.orderId.localeCompare(b.orderId));
      const size = Math.min(limit, ebay.pageLimit);
      const page = all.slice(offset, offset + size);
      return { orders: page.map((o) => JSON.parse(JSON.stringify(o))), total: all.length, limit: size, offset, next: offset + size < all.length ? "next" : null, prev: null };
    },
    async getOrder(id) { ebay.calls.push({ op: "getOrder", id }); if (ebay.failOrders.has(id)) throw Object.assign(new Error("ebay_http_503"), { status: 503, errorClass: "transient" }); const o = ebay.orders.get(id); return o ? JSON.parse(JSON.stringify(o)) : null; },
    async getOrdersByIds(ids) { ebay.calls.push({ op: "getOrdersByIds", ids }); return ids.map((id) => ebay.orders.get(id)).filter(Boolean).map((o) => JSON.parse(JSON.stringify(o))); },
    async getShippingFulfillments(id) { ebay.calls.push({ op: "getShippingFulfillments", id }); return JSON.parse(JSON.stringify(ebay.fulfillments.get(id) || [])); },
    async publicKey() { return null; },
    async probe() { return { ok: true }; }
  };
};
const queued = [];
global.__nivadeskEbayFakeEnqueue = async (task) => { queued.push(task); return index._e2e.runEbayEventTask(task); };

const admin = require("firebase-admin");
const index = require("../../index.js");
const db = admin.firestore();
const eb = index._e2e.ebay;
const etsy = require("../../etsy");
const flags = require("../../commerce/flags");
const hashing = require("../../commerce/ebay/hashing");
const retention = require("../../privacy/retention");

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; const where = String(error && error.stack || "").split("\n").find((l) => l.includes("emulator.test.js")) || ""; console.log("FAIL ", name, "-", String(error && error.message || error).replace(/\s+/g, " ").slice(0, 320), where.trim()); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }
function fakeResponse() { const res = { statusCode: 200, payload: null, body: null, headers: {}, redirectedTo: "", contentType: "" }; res.status = (c) => { res.statusCode = c; return res; }; res.json = (p) => { res.payload = p; return res; }; res.send = (b) => { res.body = b; return res; }; res.type = (t) => { res.contentType = t; return res; }; res.set = () => res; res.redirect = (code, url) => { res.statusCode = code; res.redirectedTo = url; return res; }; return res; }

const COMPANY = "e2e-ebay-company"; const OWNER = COMPANY; const MEMBER = "e2e-ebay-member"; const WORKFLOW = "e2e-ebay-workflow";
const auth = { uid: OWNER, token: { email: "owner@example.com" } };
const memberAuth = { uid: MEMBER, token: { email: "member@example.com" } };
const PAID = { billingPlan: "pro_monthly", billingPlanName: "NivaDesk Pro", billingStatus: "active", billingProvider: "stripe" };
const connId = eb.connectionDocId(COMPANY, "ebayuser_xxx");
const connRef = () => db.collection(eb.CONNECTION_COLLECTION).doc(connId);
const orderRef = (id) => db.collection("siparisler").doc(eb.ebayOrderDocId(COMPANY, id));
const restrictedRef = (id) => db.collection("companies").doc(COMPANY).collection("restrictedCustomer").doc(eb.ebayOrderDocId(COMPANY, id));
const cursorRef = () => db.collection("commerceCursors").doc(`ebay__${connId}__order`);
const HOUR = 3600000; const DAY = 24 * HOUR;

async function wipe() {
  for (const col of ["siparisler", "musteriler", "commerceEvents", "commerceHealth", "commerceCursors", "externalEntities", "ebayBuyers", "commerceReviewQueue"]) {
    const snap = await db.collection(col).where("companyId", "==", COMPANY).get(); await Promise.all(snap.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  const states = await db.collection(eb.STATE_COLLECTION).where("companyId", "==", COMPANY).get(); await Promise.all(states.docs.map((d) => d.ref.delete()));
  const quota = await db.collection(eb.QUOTA_COLLECTION).get(); await Promise.all(quota.docs.map((d) => d.ref.delete()));
  await db.recursiveDelete(connRef()); await db.recursiveDelete(db.collection("companies").doc(COMPANY)); await db.collection("companySettings").doc(COMPANY).delete();
  await db.collection("appConfig").doc("commerce").delete();
}
async function setFlags(doc) { await db.collection("appConfig").doc("commerce").set(doc); flags.resetCommerceFlagCache(); }
async function callback(state, { code = "good-code", nonce } = {}) { const res = fakeResponse(); await index.ebayOAuthCallback({ method: "GET", query: { state, code, ...(nonce ? { nonce } : {}) }, headers: {} }, res); return res; }
async function connect() { const begun = await index.beginEbayConnect.run({ auth, data: { companyId: COMPANY }, rawRequest: {} }); const res = await callback(begun.state, { nonce: begun.nonce }); return { begun, res }; }
const conn = async () => (await connRef().get()).data();
const orderCount = async () => (await db.collection("siparisler").where("companyId", "==", COMPANY).get()).size;
const views = async (who = auth) => (await index.getEbayConnections.run({ auth: who, data: { companyId: COMPANY }, rawRequest: {} }));

(async () => {
  await wipe();
  await db.collection("companies").doc(COMPANY).set({ companyName: "eBay Co", ownerUid: OWNER, ...PAID, members: { [MEMBER]: { role: "member" }, [WORKFLOW]: { role: "workflowOnly" } }, memberAccess: { [MEMBER]: { restrictedCustomer: false }, [WORKFLOW]: { restrictedCustomer: true } } });
  await db.collection("companySettings").doc(COMPANY).set({ defaultDeliveryTime: 14 });
  await setFlags({ connectors: { enabled: false, providers: { ebay: true }, connections: {} } });
  let state = "";

  await check("#1 begin writes a state with a TTL twin and the nonce's hash; a forged state is refused; the right state without the nonce is refused AND burned; the valid callback connects", async () => {
    const out = await index.beginEbayConnect.run({ auth, data: { companyId: COMPANY }, rawRequest: {} });
    const url = new URL(out.authorizeUrl);
    assert.strictEqual(url.origin, "https://auth.sandbox.ebay.com"); assert.strictEqual(url.searchParams.get("redirect_uri"), "EGGcraft-EGGcraft-sandbox-abc"); assert.strictEqual(url.searchParams.get("state"), out.state);
    assert.ok(out.authorizeUrl.includes("sell.fulfillment.readonly") && !out.authorizeUrl.includes("sell.inventory"));
    const row = (await db.collection(eb.STATE_COLLECTION).doc(out.state).get()).data();
    assert.ok(row.expireAt && row.nonceHash && !JSON.stringify(row).includes(out.nonce)); assert.strictEqual(row.companyId, COMPANY); assert.strictEqual(row.environment, "sandbox");
    await assert.rejects(index.beginEbayConnect.run({ auth: memberAuth, data: { companyId: COMPANY }, rawRequest: {} }), /owner/i, "a member cannot begin");
    const forged = await callback("forged-state-value-00000000", { nonce: "x" });
    assert.ok(forged.redirectedTo.includes("reason=state"), forged.redirectedTo);
    const phished = await callback(out.state);
    assert.ok(phished.redirectedTo.includes("reason=browser"), phished.redirectedTo);
    const again = await callback(out.state, { nonce: out.nonce });
    assert.ok(again.redirectedTo.includes("reason=state"), "burned");
    assert.strictEqual(ebay.exchanges, 0, "no code was exchanged for a phished state");
    const { begun, res } = await connect();
    state = begun.state;
    assert.strictEqual(res.statusCode, 302); assert.ok(res.redirectedTo.includes("section=ebay") && res.redirectedTo.includes("ebay=connected"), res.redirectedTo);
    const c = await conn();
    assert.strictEqual(c.status, "connected"); assert.strictEqual(c.environment, "sandbox"); assert.strictEqual(c.sellerUsername, "eggcraft_uk"); assert.strictEqual(c.readOnly, true);
    assert.deepStrictEqual(c.scopes, ["https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly", "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly"]);
    assert.strictEqual(c.capabilities["orders.read"], true); assert.strictEqual(c.capabilities["shipment.write"], "not_in_this_release");
    assert.strictEqual(c.sellerUserIdHash, hashing.userIdHash(process.env.EBAY_HASH_KEY, "ebayuser_xxx"));
    assert.deepStrictEqual(c.marketplaces, [{ marketplace: "EBAY_GB", enabled: true, currency: "GBP" }]);
    const cred = (await connRef().collection("credentials").doc("current").get()).data();
    assert.strictEqual(etsy.decryptToken(cred.accessTokenEncrypted, process.env.EBAY_TOKEN_KEY), "at_1"); assert.strictEqual(etsy.decryptToken(cred.refreshTokenEncrypted, process.env.EBAY_TOKEN_KEY), "rt_1");
    assert.ok(!JSON.stringify(c).includes("at_1") && !JSON.stringify(c).includes("rt_1") && !JSON.stringify(c).includes("Encrypted"));
    const listed = await views();
    assert.strictEqual(listed.configured, true); assert.strictEqual(listed.connections.length, 1);
    const view = listed.connections[0];
    assert.strictEqual(view.specStatus, "connected_read_only"); assert.strictEqual(view.status, "connected");
    assert.ok(!JSON.stringify(view).includes("at_1") && !Object.keys(view).some((k) => /Hash$/.test(k)) && !JSON.stringify(view).includes("Encrypted"));
    assert.strictEqual((await db.collection(eb.STATE_COLLECTION).doc(state).get()).data().connectionId, connId);
  });

  await check("#2 a state minted for production is refused on this sandbox server; a production row is skipped by the sweep with environment_mismatch", async () => {
    const begun = await index.beginEbayConnect.run({ auth, data: { companyId: COMPANY }, rawRequest: {} });
    await db.collection(eb.STATE_COLLECTION).doc(begun.state).set({ environment: "production" }, { merge: true });
    const res = await callback(begun.state, { nonce: begun.nonce });
    assert.ok(res.redirectedTo.includes("reason=environment"), res.redirectedTo);
    await connRef().set({ environment: "production" }, { merge: true });
    const calls = ebay.calls.length;
    const sweep = await eb.runSweep("sweep");
    assert.strictEqual(sweep.swept, 0); assert.strictEqual(ebay.calls.length, calls, "never called against the wrong host");
    assert.strictEqual((await conn()).lastErrorCode, "environment_mismatch");
    assert.strictEqual((await views()).connections[0].specStatus, "suspended");
    await assert.rejects(index.syncEbayNow.run({ auth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} }), /environment/);
    await connRef().set({ environment: "sandbox", lastErrorCode: "" }, { merge: true });
  });

  await check("#3 the owner's import lands orders through the engine: username as the name, no person on the document, the person in restrictedCustomer, the buyer index under a keyed hash, no customer mirror", async () => {
    const twelveDaysAgo = new Date(Date.now() - 12 * DAY).toISOString();
    ebay.orders.set("O1", order("O1", { creationDate: twelveDaysAgo, lastModifiedDate: twelveDaysAgo }));
    // Ten days old: outside the nightly's 7-day lookback, so #5 can prove the fulfilment follow-up finds it by id.
    ebay.orders.set("O2", order("O2", { creationDate: new Date(Date.now() - 10 * DAY).toISOString(), marketplace: "EBAY_DE" }));
    assert.strictEqual((await views()).connections[0].importState, "none");
    const early = await eb.reconcileConnection(connRef(), await conn(), { force: true, lookbackMs: 30 * DAY });
    assert.strictEqual(early.skipped, 2, "both orders were seen and skipped (awaiting_first_import)"); assert.strictEqual(early.created, 0);
    assert.strictEqual(await orderCount(), 0, "nothing lands from a pass before the first import");
    const preview = await index.previewEbayImport.run({ auth, data: { companyId: COMPANY, connectionId: connId, sinceDays: 30 }, rawRequest: {} });
    assert.strictEqual(preview.ordersFound, 2); assert.strictEqual(preview.duplicatesPrevented, 0); assert.deepStrictEqual(preview.marketplaces.sort(), ["EBAY_DE", "EBAY_GB"]); assert.ok(preview.windowsScanned >= 2, "7-day slices");
    await assert.rejects(index.previewEbayImport.run({ auth: memberAuth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} }), /owner/i, "preview is the owner's");
    assert.strictEqual(await orderCount(), 0, "preview wrote nothing");
    const run = await index.runEbayImport.run({ auth, data: { companyId: COMPANY, connectionId: connId, sinceDays: 30 }, rawRequest: {} });
    assert.strictEqual(run.complete, true, JSON.stringify(run)); assert.strictEqual(run.outcome.created, 2);
    const o = (await orderRef("O1").get()).data();
    assert.strictEqual(o.commerce.provider, "ebay"); assert.strictEqual(o.commerce.orderNumber, "O1"); assert.strictEqual(o.commerce.connectionId, connId);
    assert.strictEqual(o.customerName, "ada_l"); assert.strictEqual(o.customFields["eBay Buyer"], "ada_l"); assert.strictEqual(o.shippingCountry, "GB"); assert.strictEqual(o.deliveryTime, 14); assert.strictEqual(o.orderValue, 116);
    for (const f of ["emailAddress", "shippingPhone", "shippingStreetAddress", "shippingCity", "shippingPostalCode", "notes"]) assert.ok(!o[f], `${f}: ${o[f]}`);
    assert.ok(!JSON.stringify(o).includes("Lovelace") && !JSON.stringify(o).includes("example.com") && !JSON.stringify(o).includes("N1 1AA"));
    assert.ok((await orderRef("O2").get()).data().commerce.externalAdminUrl.startsWith("https://www.ebay.de/"), "the admin link is the order's own site");
    const identity = (await db.collection("externalEntities").doc(`ebay__${connId}__order__O1`).get()).data();
    assert.strictEqual(identity.companyId, COMPANY);
    const restricted = (await restrictedRef("O1").get()).data();
    assert.strictEqual(restricted.fields.fullName, "Ada Lovelace"); assert.strictEqual(restricted.fields.address.line1, "10 Analytical Way"); assert.strictEqual(restricted.fields.buyerCheckoutNotes, "leave with neighbour"); assert.strictEqual(restricted.mergeStatus, "unreviewed");
    const idx = (await db.collection("ebayBuyers").doc(`${COMPANY}__${hashing.usernameHash(process.env.EBAY_HASH_KEY, "ada_l")}`).get()).data();
    assert.deepStrictEqual(idx.orderIds.sort(), [eb.ebayOrderDocId(COMPANY, "O1"), eb.ebayOrderDocId(COMPANY, "O2")]);
    assert.strictEqual((await db.collection("musteriler").where("companyId", "==", COMPANY).get()).size, 0, "musteriler unchanged");
    const c = await conn();
    assert.strictEqual(c.importState, "done"); assert.deepStrictEqual(c.importCounters, { created: 2, updated: 0, held: 0, skipped: 0, failed: 0 });
    assert.ok((await cursorRef().get()).data().watermarkMs > 0, "the cursor is seeded at the import's start");
    assert.deepStrictEqual((await views()).connections[0].marketplaces.map((m) => m.marketplace).sort(), ["EBAY_DE", "EBAY_GB"]);
  });

  await check("#4 the same order again is a duplicate under the same key; an older snapshot is stale; a newer one with a changed total updates; a noop still refreshes restrictedCustomer", async () => {
    const data = await conn();
    const key = "ebay|" + connId + "|k-dup";
    const first = await eb.applyEbayOrder(connRef(), data, ebay.orders.get("O1"), { eventKey: key, eventOrigin: "reconcile" });
    assert.strictEqual(first.result, "noop");
    assert.strictEqual((await eb.applyEbayOrder(connRef(), data, ebay.orders.get("O1"), { eventKey: key, eventOrigin: "reconcile" })).result, "duplicate");
    const older = { ...ebay.orders.get("O1"), lastModifiedDate: new Date(Date.now() - 20 * DAY).toISOString() };
    assert.strictEqual((await eb.applyEbayOrder(connRef(), data, older, { eventKey: "ebay|x|k-old", eventOrigin: "reconcile" })).result, "stale");
    await orderRef("O1").set({ status: "In Progress", notes: "studio note" }, { merge: true });
    const newer = order("O1", { creationDate: ebay.orders.get("O1").creationDate, lastModifiedDate: new Date().toISOString(), total: "120.00" });
    ebay.orders.set("O1", newer);
    assert.strictEqual((await eb.applyEbayOrder(connRef(), data, newer, { eventKey: "ebay|x|k-new", eventOrigin: "reconcile" })).result, "updated");
    const o = (await orderRef("O1").get()).data();
    assert.strictEqual(o.orderValue, 120); assert.strictEqual(o.status, "In Progress"); assert.strictEqual(o.notes, "studio note", "the studio's own fields are untouched");
    await restrictedRef("O1").delete();
    assert.strictEqual((await eb.applyEbayOrder(connRef(), data, newer, { eventKey: "ebay|x|k-noop", eventOrigin: "reconcile" })).result, "noop");
    assert.ok((await restrictedRef("O1").get()).exists, "self-healing on a noop");
  });

  await check("#5 a fulfilment fills the tracking and marks dispatch; a manual tracking number is not overwritten; the nightly follow-up finds it without lastModifiedDate moving", async () => {
    const data = await conn();
    ebay.fulfillments.set("O2", [{ fulfillmentId: "f1", shippingCarrierCode: "RoyalMail", shipmentTrackingNumber: "RM77", shippedDate: new Date().toISOString(), shipTo: { fullName: "Ada Lovelace" } }]);
    ebay.orders.set("O2", { ...ebay.orders.get("O2"), orderFulfillmentStatus: "FULFILLED" });   // lastModifiedDate deliberately NOT moved (10 days old: outside the lookback)
    const from = ebay.calls.length;
    const nightly = await eb.reconcileConnectionNightly(connRef(), data);
    const during = ebay.calls.slice(from);
    assert.strictEqual(nightly.complete, true, JSON.stringify(nightly)); assert.ok(nightly.followUps >= 1, "the unfulfilled order was re-read by id");
    assert.ok(!during.some((c) => c.op === "getOrders" && c.lastModifiedFromMs !== null && c.lastModifiedFromMs <= Date.parse(ebay.orders.get("O2").lastModifiedDate)), "the nightly's lookback window did not reach O2; only the follow-up could");
    assert.ok(during.some((c) => c.op === "getOrdersByIds" && c.ids.includes("O2")));
    const o = (await orderRef("O2").get()).data();
    assert.strictEqual(o.trackingNumber, "RM77"); assert.strictEqual(o.isDispatched, true); assert.strictEqual(o.commerce.fulfillmentStatus, "fulfilled");
    assert.ok((await conn()).lastFullReconciliationAtMs > 0);
    await orderRef("O1").set({ trackingNumber: "MANUAL-1", isDispatched: true }, { merge: true });
    ebay.fulfillments.set("O1", [{ fulfillmentId: "f2", shippingCarrierCode: "RoyalMail", shipmentTrackingNumber: "RM99", shippedDate: new Date().toISOString() }]);
    ebay.orders.set("O1", { ...ebay.orders.get("O1"), orderFulfillmentStatus: "FULFILLED", lastModifiedDate: new Date().toISOString() });
    await eb.applyEbayOrder(connRef(), data, ebay.orders.get("O1"), { eventKey: "ebay|x|k-ship", eventOrigin: "reconcile", client: global.__nivadeskEbayFakeClient({ accessToken: "x" }) });
    assert.strictEqual((await orderRef("O1").get()).data().trackingNumber, "MANUAL-1", "the studio's tracking number wins");
  });

  await check("#6 a cancelled order is created as Cancelled; a cancellation on update writes a history entry", async () => {
    const data = await conn();
    ebay.orders.set("C1", order("C1", { cancelState: "CANCELED" }));
    const created = await eb.applyEbayOrder(connRef(), data, ebay.orders.get("C1"), { eventKey: "ebay|x|c1", eventOrigin: "reconcile" });
    assert.strictEqual(created.result, "created"); assert.strictEqual((await orderRef("C1").get()).data().status, "Cancelled");
    ebay.orders.set("C2", order("C2"));
    await eb.applyEbayOrder(connRef(), data, ebay.orders.get("C2"), { eventKey: "ebay|x|c2", eventOrigin: "reconcile" });
    const cancelled = order("C2", { creationDate: ebay.orders.get("C2").creationDate, lastModifiedDate: new Date(Date.now() + 1000).toISOString(), cancelState: "CANCELED" });
    assert.strictEqual((await eb.applyEbayOrder(connRef(), data, cancelled, { eventKey: "ebay|x|c2b", eventOrigin: "reconcile" })).result, "updated");
    const o = (await orderRef("C2").get()).data();
    assert.strictEqual(o.status, "Cancelled"); assert.ok(o.historyLog.some((h) => h.title === "Order cancelled"));
  });

  await check("#7 bisection: a 24 h window that does not fit the page budget is split; the watermark stands at the end of the last completed sub-window, never at now; a clean pass then reaches now", async () => {
    await cursorRef().delete();
    ebay.orders.clear(); ebay.fulfillments.clear();
    const start = Date.now() - DAY + HOUR;
    for (let i = 0; i < 9; i += 1) ebay.orders.set(`W${i}`, order(`W${i}`, { creationDate: new Date(start + i * 2.4 * HOUR).toISOString(), lastModifiedDate: new Date(start + i * 2.4 * HOUR).toISOString() }));
    ebay.pageLimit = 1;
    const pass = await eb.reconcileConnection(connRef(), await conn(), { force: true, lookbackMs: DAY, maxPages: 4 });
    assert.ok(pass.subWindows >= 2 && pass.bisections >= 1, JSON.stringify(pass)); assert.strictEqual(pass.failed, 0);
    const cursor = (await cursorRef().get()).data();
    assert.ok(cursor.watermarkMs > 0, "at least one sub-window completed");
    const c = await conn();
    if (pass.truncated) { assert.ok(cursor.watermarkMs < pass.window.toMs, "not now"); assert.strictEqual(c.lastErrorCode, "truncated"); assert.strictEqual((await views()).connections[0].specStatus, "connected_read_only"); }
    assert.ok(Number.isFinite(c.lastReconcile.orders.scanned) && Number.isFinite(c.lastReconcile.subWindows));
    ebay.pageLimit = 200;
    const clean = await eb.reconcileConnection(connRef(), await conn(), { maxPages: 4 });
    assert.strictEqual(clean.complete, true, JSON.stringify(clean));
    assert.strictEqual((await cursorRef().get()).data().watermarkMs, clean.window.toMs);
    assert.ok((await db.collection("commerceHealth").doc(`ebay__${connId}`).get()).data().orders.lastSuccessAtMs > 0);
    assert.strictEqual([...ebay.orders.keys()].filter(async (id) => (await orderRef(id).get()).exists).length, 9);
  });

  await check("#8 one failing order in a page: failed 1, that sub-window's watermark unchanged, partial_pass", async () => {
    const before = (await cursorRef().get()).data().watermarkMs;
    ebay.orders.set("BAD", order("BAD", { lastModifiedDate: new Date().toISOString(), extra: { sellerMemo: "ring me on 07700 900123" } }));
    const pass = await eb.reconcileConnection(connRef(), await conn());
    assert.strictEqual(pass.failed, 1); assert.strictEqual(pass.complete, false);
    assert.strictEqual((await cursorRef().get()).data().watermarkMs, before);
    assert.strictEqual((await conn()).lastErrorCode, "partial_pass"); assert.strictEqual((await views()).connections[0].specStatus, "degraded");
    ebay.orders.delete("BAD");
  });

  await check("#9 refresh answered 400 invalid_grant → reconnect_required; 400 invalid_client → status unchanged and the sweep stops; 429 → rateLimitedUntilMs and the sweep skips it", async () => {
    const expire = () => connRef().collection("credentials").doc("current").set({ accessTokenExpiresAtMs: Date.now() - 1 }, { merge: true });
    ebay.refuseRefresh = Object.assign(new Error("ebay_oauth_http_400: invalid_client"), { status: 400, errorClass: "permission", code: "app_credentials_invalid", body: { error: "invalid_client" } });
    await expire();
    const stopped = await eb.runSweep("sweep");
    assert.strictEqual(stopped.failed, 1);
    let c = await conn();
    assert.strictEqual(c.status, "connected", "our keyset, not the seller's problem"); assert.strictEqual(c.lastErrorCode, "app_credentials_invalid"); assert.strictEqual((await views()).connections[0].specStatus, "degraded");
    ebay.refuseRefresh = Object.assign(new Error("ebay_oauth_http_400: invalid_grant"), { status: 400, errorClass: "auth", code: "invalid_grant", body: { error: "invalid_grant" } });
    await expire();
    await eb.runSweep("sweep");
    c = await conn();
    assert.strictEqual(c.status, "reconnect_required"); assert.strictEqual(c.lastErrorCode, "credentials_rejected");
    const view = (await views()).connections[0];
    assert.strictEqual(view.specStatus, "reauthorization_required"); assert.strictEqual(view.needsReconnect, true);
    await assert.rejects(index.syncEbayNow.run({ auth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} }), /not connected/);
    ebay.refuseRefresh = null;
    const { res } = await connect();
    assert.ok(res.redirectedTo.includes("ebay=connected"));
    c = await conn();
    assert.strictEqual(c.status, "connected"); assert.strictEqual(c.importState, "done", "the reconnect kept the import state"); assert.ok(c.catchUpDueFromMs > 0, "and owes a catch-up");
    ebay.refuseOrders = Object.assign(new Error("ebay_http_429"), { status: 429, errorClass: "transient", retryAfter: "60" });
    const limited = await eb.reconcileConnection(connRef(), await conn());
    assert.strictEqual(limited.complete, false); assert.strictEqual(limited.rateLimited, true);
    c = await conn();
    assert.ok(c.rateLimitedUntilMs > Date.now()); assert.strictEqual(c.status, "connected"); assert.strictEqual(c.lastErrorCode, "rate_limited");
    ebay.refuseOrders = null;
    const skipped = await eb.eligibleRows("sweep");
    assert.ok(!skipped.rows.some((r) => r.ref.id === connId), "stood down until rateLimitedUntilMs");
    await connRef().set({ rateLimitedUntilMs: 0 }, { merge: true });
  });

  await check("#10 the connector flag in the document pauses one connection (suspended, Sync now refused); turning it back on owes a catch-up that applies what changed meanwhile and ends at now", async () => {
    await setFlags({ connectors: { enabled: false, providers: { ebay: true }, connections: { [`ebay:${connId}`]: false } } });
    await connRef().set({ catchUpDueFromMs: 0 }, { merge: true });
    const paused = await eb.runSweep("sweep");
    assert.strictEqual(paused.swept, 0);
    assert.strictEqual((await views()).connections[0].specStatus, "suspended"); assert.strictEqual((await views()).connections[0].paused, true);
    await assert.rejects(index.syncEbayNow.run({ auth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} }), /paused/);
    assert.strictEqual((await conn()).lastFlagState, false);
    // 36 simulated hours pass with three orders modified meanwhile.
    const watermark = (await cursorRef().get()).data().watermarkMs;
    await cursorRef().set({ watermarkMs: watermark - 36 * HOUR }, { merge: true });
    await connRef().set({ lastSuccessAtMs: Date.now() - 36 * HOUR }, { merge: true });
    for (let i = 0; i < 3; i += 1) ebay.orders.set(`G${i}`, order(`G${i}`, { creationDate: new Date(Date.now() - (30 - i * 6) * HOUR).toISOString(), lastModifiedDate: new Date(Date.now() - (30 - i * 6) * HOUR).toISOString() }));
    await setFlags({ connectors: { enabled: false, providers: { ebay: true }, connections: {} } });
    const resumed = await eb.runSweep("sweep");
    assert.strictEqual(resumed.swept, 1);
    for (let i = 0; i < 3; i += 1) assert.ok((await orderRef(`G${i}`).get()).exists, `G${i} applied by the catch-up`);
    const c = await conn();
    assert.strictEqual(c.catchUpDueFromMs, 0); assert.strictEqual(c.lastFlagState, true);
    const cursor = (await cursorRef().get()).data();
    assert.ok(cursor.watermarkMs > Date.now() - 60000, "the watermark ends at now, not at now − 24 h");
  });

  await check("#11 plan capacity: a held order's payload has no email; the release hands the row to the eBay worker rather than unboxing a token it has no key for, and the order lands fresh with its restricted document", async () => {
    // Deterministic: fill the free plan's limit rather than hoping the suite has
    // created enough orders by now. The old version of this check wrapped every
    // assertion in `if (outcome.result === "held")` and logged a shrug
    // otherwise, so it could pass while testing nothing — which is how a release
    // path that could never work shipped.
    await db.collection("companies").doc(COMPANY).set({ billingPlan: "free", billingPlanName: "Free", billingStatus: "active" }, { merge: true });
    const active = await db.collection("siparisler").where("companyId", "==", COMPANY).get();
    const fillers = [];
    try {
      for (let i = active.size; i < 12; i += 1) {
        const ref = db.collection("siparisler").doc(`e2e-ebay-filler-${i}`);
        fillers.push(ref);
        await ref.set({ companyId: COMPANY, isDeleted: false, isDelivered: false, customerName: "filler" });
      }
      const heldRef = db.collection("companies").doc(COMPANY).collection("heldIntegrationOrders").doc("ebay_H1");
      ebay.orders.set("H1", order("H1"));
      const data = await conn();
      const outcome = await eb.applyEbayOrder(connRef(), data, ebay.orders.get("H1"), { eventKey: "ebay|x|h1", eventOrigin: "reconcile" });
      assert.strictEqual(outcome.result, "held", JSON.stringify(outcome));
      const held = (await heldRef.get()).data();
      assert.ok(!JSON.stringify(held.payload).includes("example.com") && !JSON.stringify(held.payload).includes("Analytical"), "the held payload is the safe half");
      assert.strictEqual(held.ebayConnectionId, connId);
      assert.strictEqual((await restrictedRef("H1").get()).exists, false, "never on held");

      // Room again. releaseHeldIntegrationOrders mounts no eBay secret and
      // cannot take the eBay identity, so it must not decrypt anything itself:
      // the row goes to ebayEventWorker (the fake enqueue runs it inline here).
      await db.collection("companies").doc(COMPANY).set(PAID, { merge: true });
      ebay.failOrders.add("H1");
      const refused = await index.releaseHeldIntegrationOrders.run({ auth, data: { companyId: COMPANY }, rawRequest: {} });
      assert.strictEqual(refused.queued, 1, JSON.stringify(refused));
      assert.ok((await heldRef.get()).exists, "eBay refused the fetch, so the sale is still parked, not deleted");
      assert.strictEqual((await orderRef("H1").get()).exists, false);
      ebay.failOrders.delete("H1");
      const fetches = ebay.calls.filter((c) => c.op === "getOrder" && c.id === "H1").length;
      const released = await index.releaseHeldIntegrationOrders.run({ auth, data: { companyId: COMPANY }, rawRequest: {} });
      assert.strictEqual(released.queued, 1, JSON.stringify(released));
      assert.strictEqual(released.imported, 0, "this callable hands the row over; it does not import eBay orders itself");
      assert.ok(ebay.calls.filter((c) => c.op === "getOrder" && c.id === "H1").length > fetches, "fetched fresh, never replayed");
      assert.ok((await orderRef("H1").get()).exists, "the worker landed the order");
      assert.ok((await restrictedRef("H1").get()).exists, "the fresh fetch brought the address");
      assert.strictEqual((await heldRef.get()).exists, false, "and the parked copy went with it");
    } finally {
      for (const ref of fillers) await ref.delete().catch(() => undefined);
    }
  });

  await check("#14 the reveal: the owner gets shipping identity without taxIdentifier and an access-log line lands first; a member without the grant is refused; a workflow-only member with the grant is refused; the 61st reveal in an hour is refused", async () => {
    const orderId = eb.ebayOrderDocId(COMPANY, "O1");
    const out = await index.revealRestrictedCustomer.run({ auth, data: { companyId: COMPANY, orderId }, rawRequest: {} });
    assert.strictEqual(out.ok, true); assert.strictEqual(out.buyerUsername, "ada_l"); assert.strictEqual(out.fields.fullName, "Ada Lovelace"); assert.strictEqual(out.fields.address.postalCode, "N1 1AA"); assert.strictEqual(out.fields.email, "ada@example.com");
    assert.ok(!("taxIdentifier" in out.fields) && !("paths" in out) && !JSON.stringify(out).includes("neighbour"));
    const log = await db.collection("companies").doc(COMPANY).collection("piiAccessLog").get();
    const entry = log.docs.map((d) => d.data()).find((e) => e.action === "restricted_resource_accessed" && e.subject.id === orderId);
    assert.ok(entry, "an access-log line"); assert.strictEqual(entry.actorUid, OWNER); assert.strictEqual(entry.subject.provider, "ebay"); assert.ok(entry.categories.includes("address")); assert.ok(!JSON.stringify(entry).includes("Lovelace"));
    await assert.rejects(index.revealRestrictedCustomer.run({ auth: memberAuth, data: { companyId: COMPANY, orderId }, rawRequest: {} }), /permission|access/i);
    await assert.rejects(index.revealRestrictedCustomer.run({ auth: { uid: WORKFLOW, token: {} }, data: { companyId: COMPANY, orderId }, rawRequest: {} }), /permission|access/i);
    await db.collection("companies").doc(COMPANY).set({ memberAccess: { [MEMBER]: { restrictedCustomer: true } } }, { merge: true });
    assert.strictEqual((await index.revealRestrictedCustomer.run({ auth: memberAuth, data: { companyId: COMPANY, orderId }, rawRequest: {} })).ok, true, "with the grant");
    await assert.rejects(index.revealRestrictedCustomer.run({ auth: memberAuth, data: { companyId: COMPANY, orderId: eb.ebayOrderDocId(COMPANY, "NOPE") }, rawRequest: {} }), /No protected buyer details/);
    for (let i = 0; i < 59; i += 1) await index.revealRestrictedCustomer.run({ auth: memberAuth, data: { companyId: COMPANY, orderId }, rawRequest: {} });
    await assert.rejects(index.revealRestrictedCustomer.run({ auth: memberAuth, data: { companyId: COMPANY, orderId }, rawRequest: {} }), /Too many/);
  });

  await check("#15 a paused import resumes from its cursor; the cursor is seeded only when complete with no failures; a failed id is retried", async () => {
    ebay.orders.clear(); ebay.fulfillments.clear();
    await connRef().set({ importState: "none", importCursor: admin.firestore.FieldValue.delete() }, { merge: true });
    await cursorRef().delete();
    for (let i = 0; i < 3; i += 1) ebay.orders.set(`I${i}`, order(`I${i}`, { creationDate: new Date(Date.now() - (25 - i * 10) * DAY).toISOString(), lastModifiedDate: new Date(Date.now() - (25 - i * 10) * DAY).toISOString() }));
    ebay.orders.set("IBAD", order("IBAD", { creationDate: new Date(Date.now() - 2 * DAY).toISOString(), lastModifiedDate: new Date(Date.now() - 2 * DAY).toISOString(), extra: { sellerMemo: "call 07700 900123" } }));
    eb.limits.importSliceBudget = 1;
    const first = await index.runEbayImport.run({ auth, data: { companyId: COMPANY, connectionId: connId, sinceDays: 30 }, rawRequest: {} });
    assert.strictEqual(first.complete, false); assert.ok(first.resumeFromMs > 0);
    let c = await conn();
    assert.strictEqual(c.importState, "running"); assert.ok(c.importCursor.sliceFromMs > c.importCursor.sinceMs, "the cursor points past the first slice");
    assert.strictEqual((await cursorRef().get()).exists, false, "the common cursor is NOT seeded while the import is paused");
    assert.strictEqual((await views()).connections[0].importCursor.complete, false);
    eb.limits.importSliceBudget = Infinity;
    const second = await index.runEbayImport.run({ auth, data: { companyId: COMPANY, connectionId: connId, sinceDays: 30 }, rawRequest: {} });
    assert.strictEqual(second.complete, false, "the bad order keeps the import from completing"); assert.deepStrictEqual(second.failures, ["IBAD"]);
    c = await conn();
    assert.strictEqual(c.importState, "running"); assert.strictEqual(c.lastErrorCode, "partial_pass"); assert.strictEqual((await views()).connections[0].importCursor.failedCount, 1);
    for (let i = 0; i < 3; i += 1) assert.ok((await orderRef(`I${i}`).get()).exists, `I${i} landed`);
    ebay.orders.set("IBAD", order("IBAD", { creationDate: ebay.orders.get("IBAD").creationDate }));
    const retried = await index.retryEbayImportFailures.run({ auth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} });
    assert.strictEqual(retried.remaining, 0); assert.strictEqual(retried.complete, true);
    c = await conn();
    assert.strictEqual(c.importState, "done"); assert.strictEqual(c.lastErrorCode, "");
    assert.ok((await cursorRef().get()).data().watermarkMs > 0, "seeded at the import's start once complete");
    assert.strictEqual((await index.runEbayImport.run({ auth, data: { companyId: COMPANY, connectionId: connId, sinceDays: 30 }, rawRequest: {} })).outcome.created, 0, "a second import creates nothing");
  });

  await check("#16 retention: an eBay order delivered 91 days ago loses its person and its restricted document; a 60-day-old one is untouched; Amazon's pass is separate", async () => {
    const oldId = eb.ebayOrderDocId(COMPANY, "I0"); const youngId = eb.ebayOrderDocId(COMPANY, "I1");
    await db.collection("siparisler").doc(oldId).set({ isDelivered: true, deliveredAtMs: Date.now() - 91 * DAY, emailAddress: "" }, { merge: true });
    await db.collection("siparisler").doc(youngId).set({ isDelivered: true, deliveredAtMs: Date.now() - 60 * DAY }, { merge: true });
    await db.collection("privacyState").doc("retention-90d").delete();
    assert.deepStrictEqual(retention.retentionPeriodsInDays(), [30, 90]);
    const result = await index._e2e.sweepRetentionPeriod(90, Date.now());
    assert.ok(result.scrubbed >= 1, JSON.stringify(result)); assert.ok(result.restrictedDocsDeleted >= 1, "the restricted document went in the same iteration");
    const old = (await db.collection("siparisler").doc(oldId).get()).data();
    assert.strictEqual(old.customerName, "Buyer details removed"); assert.strictEqual(old.piiScrubbedReason, "ebay_address_withheld_after_90d"); assert.strictEqual(old.orderValue, 116, "the sale stays");
    assert.strictEqual((await db.collection("companies").doc(COMPANY).collection("restrictedCustomer").doc(oldId).get()).exists, false);
    const young = (await db.collection("siparisler").doc(youngId).get()).data();
    assert.strictEqual(young.customerName, "ada_l"); assert.ok((await db.collection("companies").doc(COMPANY).collection("restrictedCustomer").doc(youngId).get()).exists);
  });

  await check("#12 disconnect deletes the credentials, records who, keeps the orders; a task for that connection is dead with no order write", async () => {
    const before = await orderCount();
    const out = await index.disconnectEbay.run({ auth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} });
    assert.deepStrictEqual(out, { ok: true, ordersKept: true, revoked: false });
    assert.strictEqual((await connRef().collection("credentials").doc("current").get()).exists, false);
    const c = await conn();
    assert.strictEqual(c.status, "disconnected"); assert.strictEqual(c.disconnectedByUid, OWNER); assert.strictEqual(c.hasCredentials, false);
    assert.strictEqual(await orderCount(), before);
    ebay.orders.set("T1", order("T1"));
    const task = { key: `ebay|${connId}|evt-after`, provider: "ebay", connectionId: connId, companyId: COMPANY, entityType: "order", externalId: "T1", eventType: "ORDER_CONFIRMATION", attempt: 1, eventOrigin: "provider" };
    await assert.rejects(eb.processEbayCommerceTask(task), (e) => e.errorClass === "validation" || e.errorClass === "auth");
    assert.strictEqual((await orderRef("T1").get()).exists, false, "no order write after disconnect");
    assert.strictEqual((await views()).connections[0].specStatus, "disconnected");
    await assert.rejects(index.syncEbayNow.run({ auth, data: { companyId: COMPANY, connectionId: connId }, rawRequest: {} }), /not connected/);
  });

  await check("#13 the account-deletion purge takes the connection tree, the connect states and the buyer index", async () => {
    await index.beginEbayConnect.run({ auth, data: { companyId: COMPANY }, rawRequest: {} }).catch(() => undefined);
    const report = await index._e2e.purgeProviderDataForWorkspace(COMPANY);
    assert.deepStrictEqual(report.errors, []);
    assert.strictEqual(report.ebayConnections, 1); assert.ok(report.ebayConnectStates >= 1); assert.ok(report.ebayBuyers >= 1);
    assert.strictEqual((await connRef().get()).exists, false);
    assert.strictEqual((await connRef().collection("syncLog").get()).size, 0, "the syncLog subtree went too");
    assert.strictEqual((await db.collection("ebayBuyers").where("companyId", "==", COMPANY).get()).size, 0);
  });

  await wipe();
  if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
  console.log("\n✅ EBAY CONNECTOR E2E GEÇTİ");
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });

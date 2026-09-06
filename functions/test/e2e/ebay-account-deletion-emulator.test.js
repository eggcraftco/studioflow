// eBay's Marketplace Account Deletion endpoint on a real Firestore, with the
// signature verifier injected (design §9): the challenge hashed in eBay's
// order, a POST that answers 200 with a ledger row carrying keyed hashes only
// and a task carrying no username / userId / eiasToken, the anonymisation
// running with the connector switch OFF and the flag OFF (compliance is not a
// feature), a buyer with orders in two workspaces, the seller match through
// sellerUserIdHash, the U.S. case where the username field carries the
// immutable id, a replayed notificationId, a kid eBay does not know, and the
// endpoint's honest 503 when the secrets are absent.
//   firebase emulators:exec --only firestore "node functions/test/e2e/ebay-account-deletion-emulator.test.js"
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
process.env.NIVADESK_EBAY_CONNECTOR = "0";   // deliberately OFF: deletion compliance must not depend on it
process.env.NIVADESK_EBAY_ENVIRONMENT = "sandbox";
process.env.NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN = "nivadesk_ebay_deletion-token_0123456789";
process.env.NIVADESK_EBAY_DELETION_ENDPOINT_URL = "https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayNotifications";

const publicKeys = { "kid-known-0001": { key: "-----BEGIN PUBLIC KEY-----MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE-----END PUBLIC KEY-----", algorithm: "ECDSA", digest: "SHA1" } };
let keyFetches = 0;
global.__nivadeskEbayFakeOAuth = { async appToken() { return { access_token: "app-token", expires_in: 7200 }; } };
global.__nivadeskEbayFakeClient = () => ({
  async publicKey(kid) { keyFetches += 1; return publicKeys[kid] || null; },
  async getOrders() { return { orders: [], total: 0, limit: 200, offset: 0, next: null }; },
  async getOrder() { return null; },
  async getShippingFulfillments() { return []; }
});
global.__nivadeskEbayFakeVerifier = ({ signature }) => signature === "valid-signature";
const queued = [];
global.__nivadeskEbayFakeEnqueue = async (task) => { queued.push(task); return index._e2e.runEbayEventTask(task); };

const admin = require("firebase-admin");
const index = require("../../index.js");
const db = admin.firestore();
const eb = index._e2e.ebay;
const etsy = require("../../etsy");
const hashing = require("../../commerce/ebay/hashing");
const flags = require("../../commerce/flags");

let failures = 0;
function pass(name) { console.log("PASS ", name); }
function fail(name, error) { failures += 1; const where = String(error && error.stack || "").split("\n").find((l) => l.includes("emulator.test.js")) || ""; console.log("FAIL ", name, "-", String(error && error.message || error).replace(/\s+/g, " ").slice(0, 320), where.trim()); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { fail(name, error); } }
function fakeResponse() { const res = { statusCode: 200, payload: null, body: null, redirectedTo: "", contentType: "", headersSent: false }; res.status = (c) => { res.statusCode = c; return res; }; res.json = (p) => { res.payload = p; res.headersSent = true; return res; }; res.send = (b) => { res.body = b; res.headersSent = true; return res; }; res.type = (t) => { res.contentType = t; return res; }; return res; }

const A = "e2e-ebaydel-a"; const B = "e2e-ebaydel-b";
const PAID = { billingPlan: "pro_monthly", billingPlanName: "NivaDesk Pro", billingStatus: "active", billingProvider: "stripe" };
const HASH_KEY = process.env.EBAY_HASH_KEY;
const connIdA = eb.connectionDocId(A, "seller_a"); const connIdB = eb.connectionDocId(B, "seller_b"); const connIdBuyerSeller = eb.connectionDocId(A, "ma8vp1jySJC");
const connRef = (id) => db.collection(eb.CONNECTION_COLLECTION).doc(id);
const header = (kid = "kid-known-0001") => Buffer.from(JSON.stringify({ alg: "ecdsa", kid, signature: "valid-signature", digest: "SHA1" })).toString("base64");
let counter = 0;
function deletionBody({ username = "ada_l", userId = "ebayuser_ada", notificationId = null, eventDate = null } = {}) {
  counter += 1;
  return { metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0", deprecated: false }, notification: { notificationId: notificationId || `del-${counter}-${crypto.randomBytes(4).toString("hex")}`, eventDate: eventDate || new Date().toISOString(), publishDate: new Date().toISOString(), publishAttemptCount: 1, data: { username, userId, eiasToken: "nY+sHZ2PrBmdj6wVnY+sEZ2PrA2dj6wFk4GhC5eEoA2dj6x9nY+seQ==" } } };
}
async function post(body, { kid, signature = header(kid), raw = null } = {}) {
  const res = fakeResponse();
  const rawBody = raw || Buffer.from(JSON.stringify(body));
  await index.ebayNotifications({ method: "POST", query: {}, body: raw ? rawBody.toString("utf8") : body, rawBody, headers: { "x-ebay-signature": signature }, ip: "127.0.0.1" }, res);
  return res;
}

function order(id, username = "ada_l") {
  const created = new Date(Date.now() - 3600000).toISOString();
  return {
    orderId: id, creationDate: created, lastModifiedDate: created, orderFulfillmentStatus: "NOT_STARTED", orderPaymentStatus: "PAID", sellerId: "seller", buyerCheckoutNotes: "leave with neighbour",
    buyer: { username, buyerRegistrationAddress: { fullName: "Ada Lovelace", email: "ada@example.com" } },
    pricingSummary: { priceSubtotal: { value: "100.00", currency: "GBP" }, total: { value: "100.00", currency: "GBP" } },
    paymentSummary: { payments: [{ paymentMethod: "EBAY", paymentReferenceId: [{ referenceId: `PAY-${id}` }], paymentStatus: "PAID", paymentDate: created, amount: { value: "100.00", currency: "GBP" } }], refunds: [] },
    fulfillmentStartInstructions: [{ shippingStep: { shipTo: { fullName: "Ada Lovelace", contactAddress: { addressLine1: "10 Analytical Way", city: "London", postalCode: "N1 1AA", countryCode: "GB" } } } }],
    // A seller tax line beside an eBay-collected one → mixed → review row, so the review queue's customerName is exercised.
    lineItems: [{ lineItemId: `${id}-1`, legacyItemId: "1", sku: "RING", title: "Ring", quantity: 1, listingMarketplaceId: "EBAY_GB", lineItemCost: { value: "100.00", currency: "GBP" }, taxes: [{ taxType: "VAT", amount: { value: "10.00", currency: "GBP" } }], ebayCollectAndRemitTaxes: [{ taxType: "VAT", amount: { value: "5.00", currency: "GBP" }, collectionMethod: "GROSS" }] }]
  };
}
async function seedConnection(companyId, id, sellerUserId, username) {
  await connRef(id).set({ companyId, provider: "ebay", environment: "sandbox", sellerUserId, sellerUserIdHash: hashing.userIdHash(HASH_KEY, sellerUserId), sellerUsername: username, displayName: username, registrationMarketplaceId: "EBAY_GB", marketplaces: [{ marketplace: "EBAY_GB", enabled: true, currency: "GBP" }], status: "connected", readOnly: true, scopes: [], capabilities: {}, settings: { autoSync: true, includeUnpaid: false, includeCancelled: true }, hasCredentials: true, importState: "done", connectedAtMs: Date.now(), lastErrorCode: "" });
  await connRef(id).collection("credentials").doc("current").set({ accessTokenEncrypted: etsy.encryptToken("at", process.env.EBAY_TOKEN_KEY), refreshTokenEncrypted: etsy.encryptToken("rt", process.env.EBAY_TOKEN_KEY), accessTokenExpiresAtMs: Date.now() + 7200000, refreshTokenExpiresAtMs: Date.now() + 1e10, refreshLockUntilMs: 0 });
}
async function wipe() {
  for (const company of [A, B]) {
    for (const col of ["siparisler", "commerceEvents", "commerceHealth", "commerceCursors", "externalEntities", "ebayBuyers", "commerceReviewQueue"]) {
      const snap = await db.collection(col).where("companyId", "==", company).get(); await Promise.all(snap.docs.map((d) => db.recursiveDelete(d.ref)));
    }
    await db.recursiveDelete(db.collection("companies").doc(company)); await db.collection("companySettings").doc(company).delete();
  }
  for (const id of [connIdA, connIdB, connIdBuyerSeller]) await db.recursiveDelete(connRef(id));
  for (const col of ["ebayDeletionRequests", "ebayNotificationKeys", "ebayQuota"]) { const snap = await db.collection(col).get(); await Promise.all(snap.docs.map((d) => d.ref.delete())); }
  await db.collection("appConfig").doc("commerce").delete();
}

(async () => {
  await wipe();
  await db.collection("appConfig").doc("commerce").set({ connectors: { enabled: false, providers: { ebay: false } } }); flags.resetCommerceFlagCache();
  for (const company of [A, B]) { await db.collection("companies").doc(company).set({ companyName: company, ownerUid: company, ...PAID }); await db.collection("companySettings").doc(company).set({ defaultDeliveryTime: 14 }); }
  await seedConnection(A, connIdA, "seller_a", "seller_a"); await seedConnection(B, connIdB, "seller_b", "seller_b");
  // The seller who is also the buyer being deleted (the U.S. immutable-id case, below).
  await seedConnection(A, connIdBuyerSeller, "ma8vp1jySJC", "us_buyer_seller");
  const client = global.__nivadeskEbayFakeClient();
  const orderIdA = eb.ebayOrderDocId(A, "ORD-A"); const orderIdB = eb.ebayOrderDocId(B, "ORD-B"); const orderIdUS = eb.ebayOrderDocId(A, "ORD-US");
  const restricted = (company, id) => db.collection("companies").doc(company).collection("restrictedCustomer").doc(id);

  await check("setup: the buyer has an order in each workspace, each with a restricted document, an index row and a review row (applyEbayOrder is not gated by the switch)", async () => {
    assert.strictEqual((await eb.applyEbayOrder(connRef(connIdA), (await connRef(connIdA).get()).data(), order("ORD-A"), { eventKey: "ebay|a|1", eventOrigin: "reconcile", client, fulfillments: [] })).result, "created");
    assert.strictEqual((await eb.applyEbayOrder(connRef(connIdB), (await connRef(connIdB).get()).data(), order("ORD-B"), { eventKey: "ebay|b|1", eventOrigin: "reconcile", client, fulfillments: [] })).result, "created");
    assert.strictEqual((await eb.applyEbayOrder(connRef(connIdBuyerSeller), (await connRef(connIdBuyerSeller).get()).data(), order("ORD-US", "ma8vp1jySJC"), { eventKey: "ebay|us|1", eventOrigin: "reconcile", client, fulfillments: [] })).result, "created");
    for (const [company, id] of [[A, orderIdA], [B, orderIdB]]) {
      assert.strictEqual((await db.collection("siparisler").doc(id).get()).data().customerName, "ada_l");
      assert.ok((await restricted(company, id).get()).exists);
      assert.strictEqual((await db.collection("commerceReviewQueue").doc(id).get()).data().customerName, "ada_l");
    }
    await db.collection("companies").doc(A).collection("heldIntegrationOrders").doc("ebay_ORD-A").set({ provider: "ebay", externalId: "ORD-A", payload: { orderId: "ORD-A", buyer: { username: "ada_l" } } });
    const hash = hashing.usernameHash(HASH_KEY, "ada_l");
    assert.ok((await db.collection("ebayBuyers").doc(`${A}__${hash}`).get()).exists && (await db.collection("ebayBuyers").doc(`${B}__${hash}`).get()).exists);
  });

  await check("GET ?challenge_code answers sha256hex(code + token + endpointUrl) as JSON; without the code it is a plain text hello", async () => {
    const res = fakeResponse();
    await index.ebayNotifications({ method: "GET", query: { challenge_code: "abc123" }, headers: {} }, res);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.contentType, "application/json");
    const expected = crypto.createHash("sha256").update("abc123" + process.env.NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN + process.env.NIVADESK_EBAY_DELETION_ENDPOINT_URL).digest("hex");
    assert.deepStrictEqual(JSON.parse(res.body), { challengeResponse: expected });
    const hello = fakeResponse(); await index.ebayNotifications({ method: "GET", query: {}, headers: {} }, hello);
    assert.strictEqual(hello.statusCode, 200); assert.ok(String(hello.body).includes("eBay notification endpoint"));
  });

  await check("a bad or missing signature header is 401 with no detail; a malformed kid is 401 before any fetch; an unknown kid costs one fetch then 401", async () => {
    const before = keyFetches;
    const none = await post(deletionBody(), { signature: "" }); assert.strictEqual(none.statusCode, 401); assert.deepStrictEqual(none.payload, { ok: false, error: "invalid_signature" });
    const junk = await post(deletionBody(), { signature: "not-base64-json" }); assert.strictEqual(junk.statusCode, 401);
    const malformed = await post(deletionBody(), { kid: "bad kid!" }); assert.strictEqual(malformed.statusCode, 401);
    assert.strictEqual(keyFetches, before, "no fetch for a malformed kid");
    const unknown = await post(deletionBody(), { kid: "kid-unknown-9999" }); assert.strictEqual(unknown.statusCode, 401);
    assert.strictEqual(keyFetches, before + 1);
    const again = await post(deletionBody(), { kid: "kid-unknown-9999" }); assert.strictEqual(again.statusCode, 401);
    assert.strictEqual(keyFetches, before + 1, "the negative cache: no second fetch for the same unknown kid");
    const forged = await post(deletionBody(), { signature: Buffer.from(JSON.stringify({ alg: "ecdsa", kid: "kid-known-0001", signature: "forged", digest: "SHA1" })).toString("base64") });
    assert.strictEqual(forged.statusCode, 401, "the verifier refused it");
    assert.strictEqual((await db.collection("ebayDeletionRequests").get()).size, 0, "nothing was written by a refused request");
  });

  await check("a body that is not JSON is 400; a future eventDate is 400; an over-large body is 413", async () => {
    assert.strictEqual((await post(null, { raw: Buffer.from("not json") })).statusCode, 400);
    assert.strictEqual((await post(deletionBody({ eventDate: new Date(Date.now() + 3600000).toISOString() }))).statusCode, 400);
    assert.strictEqual((await post(null, { raw: Buffer.alloc(257 * 1024, 32) })).statusCode, 413);
  });

  let notificationId = "";
  await check("a verified deletion answers 200 at once; the ledger row carries keyed hashes only; the task carries no username, userId or eiasToken; the worker ran with the switch OFF and the flag OFF", async () => {
    const body = deletionBody(); notificationId = body.notification.notificationId;
    const res = await post(body);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.payload)); assert.strictEqual(res.payload.result, "queued");
    const ledger = (await db.collection("ebayDeletionRequests").doc(notificationId).get()).data();
    assert.strictEqual(ledger.usernameHash, hashing.usernameHash(HASH_KEY, "ada_l")); assert.strictEqual(ledger.userIdHash, hashing.userIdHash(HASH_KEY, "ebayuser_ada"));
    const ledgerText = JSON.stringify(ledger);
    for (const forbidden of ["ada_l", "ebayuser_ada", "eiasToken", "nY+sHZ2"]) assert.ok(!ledgerText.includes(forbidden), forbidden);
    assert.ok(ledger.expireAt, "a 400-day TTL twin");
    const task = queued[queued.length - 1];
    assert.strictEqual(task.entityType, "buyer_deletion"); assert.strictEqual(task.key, `ebay|deletion|${notificationId}`);
    const taskText = JSON.stringify(task);
    assert.ok(!/username"|userId"|eiasToken/.test(taskText) && !taskText.includes("ada_l") && !taskText.includes("ebayuser_ada"), taskText);
    assert.deepStrictEqual(task.usernameHashes, [hashing.usernameHash(HASH_KEY, "ada_l")]);
    // The fake enqueue ran the worker inline; both orders are anonymised.
    for (const [company, id] of [[A, orderIdA], [B, orderIdB]]) {
      const o = (await db.collection("siparisler").doc(id).get()).data();
      assert.strictEqual(o.customerName, "Buyer details removed"); assert.strictEqual(o.shippingName, ""); assert.strictEqual(o.customFields["eBay Buyer"], ""); assert.strictEqual(o.piiScrubbedReason, "ebay_account_deletion"); assert.ok(o.commerce.buyerRemovedAtMs > 0);
      assert.strictEqual(o.orderValue, 100, "the sale stays");
      assert.strictEqual((await restricted(company, id).get()).exists, false, "the restricted document is gone");
      assert.strictEqual((await db.collection("commerceReviewQueue").doc(id).get()).data().customerName, null, "the review row no longer names the buyer");
    }
    assert.strictEqual((await db.collection("companies").doc(A).collection("heldIntegrationOrders").doc("ebay_ORD-A").get()).data().payload.buyer.username, "", "the held payload's handle is blanked");
    const hash = hashing.usernameHash(HASH_KEY, "ada_l");
    assert.strictEqual((await db.collection("ebayBuyers").doc(`${A}__${hash}`).get()).exists, false); assert.strictEqual((await db.collection("ebayBuyers").doc(`${B}__${hash}`).get()).exists, false);
    const done = (await db.collection("ebayDeletionRequests").doc(notificationId).get()).data();
    assert.strictEqual(done.status, "done"); assert.strictEqual(done.ordersScrubbed, 2); assert.strictEqual(done.restrictedDocsDeleted, 2); assert.strictEqual(done.connectionsDisconnected, 0); assert.ok(done.finishedAtMs > 0);
    assert.strictEqual((await db.collection("commerceHealth").doc("ebay__").get()).exists, false, "a deletion task touches no health document");
    assert.strictEqual((await db.collection("commerceHealth").where("provider", "==", "ebay").get()).docs.filter((d) => !d.data().connectionId).length, 0);
    const logs = await db.collection("companies").doc(A).collection("piiAccessLog").get();
    assert.ok(logs.docs.some((d) => d.data().action === "erased" && d.data().note === "ebay_account_deletion"), "an erasure line in the access log");
    // The seller connections are untouched: the deleted buyer was not a seller here.
    assert.strictEqual((await connRef(connIdA).get()).data().status, "connected");
  });

  await check("the same notificationId again is 200 and changes nothing; running the task twice still reports done", async () => {
    const before = (await db.collection("ebayDeletionRequests").doc(notificationId).get()).data();
    const res = await post(deletionBody({ notificationId }));
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.payload.result, "duplicate");
    const after = (await db.collection("ebayDeletionRequests").doc(notificationId).get()).data();
    assert.strictEqual(after.attempts, before.attempts);
    const rerun = await eb.processEbayBuyerDeletion({ key: `ebay|deletion|${notificationId}`, notificationId, entityType: "buyer_deletion", usernameHashes: [hashing.usernameHash(HASH_KEY, "ada_l")], userIdHashes: [], attempt: 1 });
    assert.strictEqual(rerun.status, "applied"); assert.strictEqual(rerun.outcome.ordersScrubbed, 0, "idempotent: nothing left to find");
  });

  // The replay-after-SUCCESS case above was the only one covered, which is how
  // the opposite one shipped: the ledger row was created before the work and
  // every redelivery of that notificationId was answered `duplicate` whatever
  // the row said. A failed anonymisation was therefore permanent — eBay's
  // redelivery is the only safety net behind this endpoint, and the dedup threw
  // it away.
  await check("a deletion that FAILED is re-driven by eBay's redelivery, not answered duplicate; the ledger dedups on completion", async () => {
    const id = eb.ebayOrderDocId(A, "ORD-R");
    assert.strictEqual((await eb.applyEbayOrder(connRef(connIdA), (await connRef(connIdA).get()).data(), order("ORD-R", "retry_buyer"), { eventKey: "ebay|a|r", eventOrigin: "reconcile", client, fulfillments: [] })).result, "created");
    const hash = hashing.usernameHash(HASH_KEY, "retry_buyer");
    const indexRef = db.collection("ebayBuyers").doc(`${A}__${hash}`);
    // A real failure part-way through: an order id the index carries that
    // Firestore will not accept. The queue is down too, so the gateway's inline
    // fallback runs and fails.
    await indexRef.set({ orderIds: ["bad/id", id] }, { merge: true });
    const workingQueue = global.__nivadeskEbayFakeEnqueue;
    global.__nivadeskEbayFakeEnqueue = async () => { throw new Error("cloud tasks unavailable"); };
    const body = deletionBody({ username: "retry_buyer", userId: "u_retry" });
    const first = await post(body);
    assert.strictEqual(first.statusCode, 200); assert.strictEqual(first.payload.result, "queued");
    const failed = (await db.collection("ebayDeletionRequests").doc(body.notification.notificationId).get()).data();
    assert.strictEqual(failed.status, "failed", "the row records that the work did not happen");
    assert.strictEqual(failed.leaseUntilMs, 0, "and holds no lease, so it can be picked up again");
    assert.strictEqual((await db.collection("siparisler").doc(id).get()).data().customerName, "retry_buyer", "nothing was anonymised");

    global.__nivadeskEbayFakeEnqueue = workingQueue;
    await indexRef.set({ orderIds: [id] }, { merge: true });
    const again = await post(deletionBody({ username: "retry_buyer", userId: "u_retry", notificationId: body.notification.notificationId }));
    assert.strictEqual(again.statusCode, 200);
    assert.notStrictEqual(again.payload.result, "duplicate", "a redelivery of unfinished work must not be waved through");
    assert.strictEqual(again.payload.result, "requeued");
    const o = (await db.collection("siparisler").doc(id).get()).data();
    assert.strictEqual(o.customerName, "Buyer details removed"); assert.strictEqual(o.customFields["eBay Buyer"], "");
    const done = (await db.collection("ebayDeletionRequests").doc(body.notification.notificationId).get()).data();
    assert.strictEqual(done.status, "done"); assert.strictEqual(done.ordersScrubbed, 1); assert.strictEqual(done.redeliveries, 1);
    // Only now is a redelivery a duplicate.
    const third = await post(deletionBody({ username: "retry_buyer", userId: "u_retry", notificationId: body.notification.notificationId }));
    assert.strictEqual(third.payload.result, "duplicate");
  });

  await check("a row nobody redelivers is still finished: the reconciliation pass re-drives queued and failed rows, leaves leased and done ones alone, and is idempotent", async () => {
    const id = eb.ebayOrderDocId(A, "ORD-S");
    assert.strictEqual((await eb.applyEbayOrder(connRef(connIdA), (await connRef(connIdA).get()).data(), order("ORD-S", "stranded_buyer"), { eventKey: "ebay|a|s", eventOrigin: "reconcile", client, fulfillments: [] })).result, "created");
    const hash = hashing.usernameHash(HASH_KEY, "stranded_buyer");
    const stale = Date.now() - 30 * 60 * 1000;
    const ledger = (docId, patch) => db.collection("ebayDeletionRequests").doc(docId).set({ receivedAtMs: stale, eventDate: new Date(stale).toISOString(), usernameHash: hash, userIdHash: "", usernameHashes: [hash], userIdHashes: [], attempts: 1, lastAttemptAtMs: stale, ordersScrubbed: 0, restrictedDocsDeleted: 0, connectionsDisconnected: 0, finishedAtMs: 0, sanitizedError: "", ...patch });
    // Stranded: the enqueue threw, the fallback failed, nobody ever came back.
    await ledger("del-stranded", { status: "queued", leaseUntilMs: 0 });
    // In flight right now, and already finished: neither is the sweep's to take.
    await ledger("del-inflight", { status: "queued", leaseUntilMs: Date.now() + 60000 });
    await ledger("del-finished", { status: "done", leaseUntilMs: 0, finishedAtMs: stale });

    const out = await eb.reconcileDeletionRequests();
    assert.strictEqual(out.redriven, 1, JSON.stringify(out));
    assert.strictEqual(out.waiting, 1, "the leased row was left alone");
    const o = (await db.collection("siparisler").doc(id).get()).data();
    assert.strictEqual(o.customerName, "Buyer details removed", "the anonymisation eBay asked for finally happened");
    assert.strictEqual((await db.collection("ebayDeletionRequests").doc("del-stranded").get()).data().status, "done");
    assert.strictEqual((await db.collection("ebayBuyers").doc(`${A}__${hash}`).get()).exists, false);
    const secondPass = await eb.reconcileDeletionRequests();
    assert.strictEqual(secondPass.redriven, 0, "a finished row is never re-driven");
    assert.strictEqual((await db.collection("ebayDeletionRequests").doc("del-finished").get()).data().ordersScrubbed, 0, "and a done row was not touched");
  });

  await check("a seller whose account was deleted is matched through sellerUserIdHash: credentials deleted, disconnected, username blanked; the U.S. case (immutable id in the username field) still matches the buyer index", async () => {
    const res = await post(deletionBody({ username: "ma8vp1jySJC", userId: "ma8vp1jySJC" }));
    assert.strictEqual(res.statusCode, 200);
    const c = (await connRef(connIdBuyerSeller).get()).data();
    assert.strictEqual(c.status, "disconnected"); assert.strictEqual(c.disconnectReason, "ebay_account_deleted"); assert.strictEqual(c.sellerUsername, ""); assert.strictEqual(c.hasCredentials, false); assert.strictEqual(c.disconnectedByUid, "ebay");
    assert.strictEqual((await connRef(connIdBuyerSeller).collection("credentials").doc("current").get()).exists, false);
    const o = (await db.collection("siparisler").doc(orderIdUS).get()).data();
    assert.strictEqual(o.customerName, "Buyer details removed", "the index keyed by the id-as-username was found");
    assert.strictEqual((await restricted(A, orderIdUS).get()).exists, false);
    const ledger = (await db.collection("ebayDeletionRequests").where("connectionsDisconnected", "==", 1).get());
    assert.strictEqual(ledger.size, 1);
    assert.strictEqual((await connRef(connIdA).get()).data().status, "connected", "the other seller is untouched");
  });

  await check("without the secrets the endpoint answers 503 (retryable), never 401, and drops nothing", async () => {
    const saved = process.env.EBAY_CLIENT_ID;
    process.env.EBAY_CLIENT_ID = "";
    try {
      const res = await post(deletionBody());
      assert.strictEqual(res.statusCode, 503); assert.deepStrictEqual(res.payload, { ok: false, error: "verification_unavailable" });
      const challenge = fakeResponse(); await index.ebayNotifications({ method: "GET", query: { challenge_code: "x" }, headers: {} }, challenge);
      assert.strictEqual(challenge.statusCode, 200, "the challenge needs no secret");
    } finally { process.env.EBAY_CLIENT_ID = saved; }
    eb.resetCaches();
  });

  await check("an ORDER_CONFIRMATION with no known subscription is 200 skipped; an unknown topic is 200 ignored; with the switch off an order topic is received and not enqueued", async () => {
    const before = queued.length;
    const unknownSub = await post({ ...deletionBody(), metadata: { topic: "ORDER_CONFIRMATION", schemaVersion: "1.0" } });
    assert.strictEqual(unknownSub.statusCode, 200); assert.strictEqual(unknownSub.payload.reason, "unknown_subscription");
    await connRef(connIdA).set({ notificationSubscriptionId: "sub-1" }, { merge: true });
    const body = deletionBody(); body.metadata.topic = "ORDER_CONFIRMATION"; body.notification.data = { subscriptionId: "sub-1", orderId: "ORD-A" };
    const received = await post(body);
    assert.strictEqual(received.statusCode, 200); assert.strictEqual(received.payload.result, "received", "the switch is off: recorded, not enqueued");
    assert.strictEqual(queued.length, before, "no task");
    const ignored = await post({ ...deletionBody(), metadata: { topic: "SOMETHING_ELSE", schemaVersion: "1.0" } });
    assert.strictEqual(ignored.statusCode, 200); assert.strictEqual(ignored.payload.result, "ignored_topic");
  });

  await wipe();
  if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
  console.log("\n✅ EBAY ACCOUNT DELETION E2E GEÇTİ");
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });

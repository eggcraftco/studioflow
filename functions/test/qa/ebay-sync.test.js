// What the eBay sync promises (design §7.1 step 5, §7.3, §7.5, §7.7): the
// create-time policy (payment, cancellation, marketplace, first import,
// auto-sync), the restricted half written beside the order — on noop too,
// never on held, never when empty — the buyer index under a keyed hash, no
// customer mirror, no address in a held payload, the marketplace passed to the
// adapter, the queue path and the sweep path landing the same documents, an
// environment mismatch skipped, and one bad keyset stopping the sweep.
const assert = require("assert");
const { buildEbay, connect, ebayOrder, HASH_KEY } = require("./helpers/ebayHarness");
const hashing = require("../../commerce/ebay/hashing");
let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name)).catch((error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 320)); }); }
const auth = { uid: "u1" };

async function ready({ importState = "done", ...options } = {}) {
  const h = buildEbay(options);
  const { connectionId } = await connect(h.fns);
  h.store.write(`ebayConnections/${connectionId}`, { ...h.store.read(`ebayConnections/${connectionId}`), importState });
  h.ref = h.store.admin.firestore().collection("ebayConnections").doc(connectionId);
  h.connectionId = connectionId;
  h.data = () => h.store.read(`ebayConnections/${connectionId}`);
  h.client = () => h.ebay.createClient({ accessToken: "x" });
  h.apply = (order, opts = {}) => h.fns._internal.applyEbayOrder(h.ref, h.data(), order, { client: h.client(), ...opts });
  h.orderDoc = (id) => h.store.read(`siparisler/ebay_c1_${id}`);
  h.restricted = (id) => h.store.read(`companies/c1/restrictedCustomer/ebay_c1_${id}`);
  return h;
}

(async () => {
  await check("a paid order lands through the engine with the username as the name and no person on the document; the person lands in restrictedCustomer with the buyer index under a keyed hash", async () => {
    const h = await ready();
    const outcome = await h.apply(ebayOrder("O1"), { eventKey: "k1", eventOrigin: "reconcile" });
    assert.strictEqual(outcome.result, "created");
    const order = h.orderDoc("O1");
    assert.strictEqual(order.companyId, "c1"); assert.strictEqual(order.commerce.provider, "ebay"); assert.strictEqual(order.commerce.connectionId, h.connectionId); assert.strictEqual(order.commerce.orderNumber, "O1");
    assert.strictEqual(order.customerName, "ada_l"); assert.strictEqual(order.shippingName, "ada_l"); assert.strictEqual(order.customFields["eBay Buyer"], "ada_l");
    assert.strictEqual(order.shippingCountry, "GB");
    for (const field of ["emailAddress", "shippingPhone", "shippingStreetAddress", "shippingCity", "shippingPostalCode", "whatsappNumber", "notes"]) assert.ok(!order[field], `${field} must be blank: ${order[field]}`);
    assert.ok(!JSON.stringify(order).includes("Lovelace") && !JSON.stringify(order).includes("example.com") && !JSON.stringify(order).includes("N1 1AA"));
    assert.strictEqual(order.orderValue, 116); assert.strictEqual(order.taxResponsibility, "platform");
    const restricted = h.restricted("O1");
    assert.strictEqual(restricted.provider, "ebay"); assert.strictEqual(restricted.buyerUsername, "ada_l"); assert.strictEqual(restricted.fields.fullName, "Ada Lovelace"); assert.strictEqual(restricted.fields.address.postalCode, "N1 1AA"); assert.strictEqual(restricted.fields.buyerCheckoutNotes, "leave with neighbour");
    assert.strictEqual(restricted.mergeStatus, "unreviewed"); assert.strictEqual(restricted.piiPolicy, "provider_restricted"); assert.deepStrictEqual(restricted.externalIdentities, [{ provider: "ebay", connectionId: h.connectionId, externalId: "ada_l" }]);
    const index = h.store.read(`ebayBuyers/c1__${hashing.usernameHash(HASH_KEY, "ada_l")}`);
    assert.deepStrictEqual(index.orderIds, ["ebay_c1_O1"]); assert.strictEqual(index.companyId, "c1");
    assert.ok(!Object.keys(h.store.docs.keys ? Object.fromEntries(h.store.docs) : {}).some((p) => p.includes("ada_l")), "the index is keyed by the hash, never the handle");
    assert.strictEqual(h.store.paths("musteriler/").length, 0, "no customer mirror: eBay buyers are never merged by name");
    assert.strictEqual(h.calls.pushes.length, 1); assert.strictEqual(h.calls.pushes[0].type, "ebay_order");
    assert.strictEqual(h.store.read(`externalEntities/ebay__${h.connectionId}__order__O1`).companyId, "c1");
  });

  await check("the same order again is a duplicate under the same key and a noop under a new one — and the noop still refreshes restrictedCustomer", async () => {
    const h = await ready();
    await h.apply(ebayOrder("O1"), { eventKey: "k1" });
    assert.strictEqual((await h.apply(ebayOrder("O1"), { eventKey: "k1" })).result, "duplicate");
    h.store.docs.delete("companies/c1/restrictedCustomer/ebay_c1_O1");
    assert.strictEqual((await h.apply(ebayOrder("O1"), { eventKey: "k2" })).result, "noop");
    assert.ok(h.restricted("O1"), "self-healing: the restricted document is written on a noop too");
    const older = await h.apply(ebayOrder("O1", { lastModifiedDate: "2026-09-01T00:00:00.000Z" }), { eventKey: "k3" });
    assert.strictEqual(older.result, "stale");
  });

  await check("create-time policy: PENDING payment waits unless includeUnpaid; a cancellation stays out unless includeCancelled; a disabled marketplace is skipped; updates always apply", async () => {
    const h = await ready();
    assert.strictEqual((await h.apply(ebayOrder("P1", { paymentStatus: "PENDING" }))).reason, "awaiting_payment");
    await h.fns.updateEbayConnectionSettings({ auth, data: { connectionId: h.connectionId, settings: { includeUnpaid: true } } });
    assert.strictEqual((await h.apply(ebayOrder("P1", { paymentStatus: "PENDING" }))).result, "created");
    await h.fns.updateEbayConnectionSettings({ auth, data: { connectionId: h.connectionId, settings: { includeCancelled: false } } });
    assert.strictEqual((await h.apply(ebayOrder("C1", { cancelState: "CANCELED" }))).reason, "cancelled_not_imported");
    await h.fns.updateEbayConnectionSettings({ auth, data: { connectionId: h.connectionId, settings: { includeCancelled: true } } });
    const cancelled = await h.apply(ebayOrder("C1", { cancelState: "CANCELED" }));
    assert.strictEqual(cancelled.result, "created"); assert.strictEqual(h.orderDoc("C1").status, "Cancelled");
    // An existing order is updated whatever the create-time policy says.
    await h.fns.updateEbayConnectionSettings({ auth, data: { connectionId: h.connectionId, settings: { includeCancelled: false, autoSync: false } } });
    const update = await h.apply(ebayOrder("P1", { paymentStatus: "PAID", lastModifiedDate: "2026-09-03T00:00:00.000Z" }), { eventKey: "u1" });
    assert.strictEqual(update.result, "updated"); assert.strictEqual(h.orderDoc("P1").paidAmount, 116);
    assert.strictEqual((await h.apply(ebayOrder("N1"))).reason, "auto_sync_off", "auto-sync off skips creates from a pass");
    assert.strictEqual((await h.apply(ebayOrder("N1"), { eventOrigin: "import" })).result, "created", "but not from the owner's import");
    await h.fns.updateEbayConnectionSettings({ auth, data: { connectionId: h.connectionId, settings: { autoSync: true }, marketplaces: [{ marketplace: "EBAY_GB", enabled: false }] } });
    assert.strictEqual((await h.apply(ebayOrder("M1"))).reason, "marketplace_disabled");
  });

  await check("nothing lands from a pass before the owner's first import; the import origin bypasses that gate", async () => {
    const h = await ready({ importState: "none" });
    assert.strictEqual((await h.apply(ebayOrder("F1"))).reason, "awaiting_first_import");
    assert.strictEqual((await h.apply(ebayOrder("F1"), { eventOrigin: "import" })).result, "created");
  });

  await check("a new marketplace seen on an order is added to the account's list, and the adapter gets it — the admin link is the order's own site", async () => {
    const h = await ready();
    await h.apply(ebayOrder("D1", { marketplace: "EBAY_DE" }));
    assert.deepStrictEqual(h.data().marketplaces.map((m) => m.marketplace).sort(), ["EBAY_DE", "EBAY_GB"]);
    assert.ok(h.orderDoc("D1").commerce.externalAdminUrl.startsWith("https://www.ebay.de/"), h.orderDoc("D1").commerce.externalAdminUrl);
    assert.ok(h.orderDoc("D1").commerce.externalAdminUrl.includes("orderid=D1"));
  });

  await check("a held order (plan capacity) writes no restricted document, and the held payload carries no email or address", async () => {
    const h = await ready({ capacity: { allowed: false, limit: 10, active: 10 } });
    const outcome = await h.apply(ebayOrder("H1"));
    assert.strictEqual(outcome.result, "held");
    assert.strictEqual(h.restricted("H1"), undefined, "never on held");
    assert.strictEqual(h.calls.held.length, 1);
    const payload = JSON.stringify(h.calls.held[0].payload);
    assert.ok(!payload.includes("example.com") && !payload.includes("Analytical") && !payload.includes("Lovelace") && !payload.includes("N1 1AA"), payload.slice(0, 200));
    assert.strictEqual(h.calls.held[0].payload.buyer.username, "ada_l"); assert.strictEqual(h.calls.held[0].extra.ebayConnectionId, h.connectionId);
    assert.strictEqual(h.store.read("companies/c1/heldIntegrationOrders/ebay_H1").provider, "ebay");
  });

  await check("an order that carries nobody writes no restricted document and no index row", async () => {
    const h = await ready();
    const bare = ebayOrder("B1", { extra: { buyerCheckoutNotes: undefined, buyer: { username: "ghost_buyer" }, fulfillmentStartInstructions: [{ shippingStep: { shipTo: { contactAddress: { countryCode: "GB" } } } }] } });
    delete bare.buyerCheckoutNotes;
    assert.strictEqual((await h.apply(bare)).result, "created");
    assert.strictEqual(h.restricted("B1"), undefined);
    assert.strictEqual(h.store.paths("ebayBuyers/").length, 0);
    assert.strictEqual(h.orderDoc("B1").customerName, "ghost_buyer");
  });

  await check("personal data that survives the split is a loud invalid, never an order", async () => {
    const h = await ready();
    const leaky = ebayOrder("L1", { extra: { sellerMemo: "call the buyer on 07700 900123 at 10 Analytical Way" } });
    const outcome = await h.apply(leaky);
    assert.strictEqual(outcome.result, "invalid"); assert.strictEqual(outcome.problems[0], "pii_in_safe_half");
    assert.ok(!JSON.stringify(outcome.problems).includes("07700"), "the problem names the path, never the value");
    assert.strictEqual(h.orderDoc("L1"), undefined); assert.strictEqual(h.restricted("L1"), undefined);
  });

  await check("a disconnect mid-pass stops writes: the apply re-reads the connection", async () => {
    const h = await ready();
    const snapshot = h.data();
    await h.fns.disconnectEbay({ auth, data: { connectionId: h.connectionId } });
    const outcome = await h.fns._internal.applyEbayOrder(h.ref, snapshot, ebayOrder("X1"), { client: h.client() });
    assert.deepStrictEqual(outcome, { result: "skipped", reason: "connection_disconnected" });
    assert.strictEqual(h.orderDoc("X1"), undefined);
  });

  await check("the queue path and the sweep path land the same order, the same restricted document and the same index row", async () => {
    const q = await ready();
    q.ebay.orders.set("Q1", ebayOrder("Q1", { fulfillmentStatus: "FULFILLED" }));
    q.ebay.fulfillments.set("Q1", [{ fulfillmentId: "f1", shippingCarrierCode: "RoyalMail", shipmentTrackingNumber: "RM1", shippedDate: "2026-09-03T00:00:00.000Z", shipTo: { fullName: "Ada Lovelace" } }]);
    const task = { key: "ebay|c1__ebayuser_xxx|evt1", provider: "ebay", connectionId: q.connectionId, companyId: "c1", entityType: "order", externalId: "Q1", eventType: "ORDER_CONFIRMATION", attempt: 1, eventOrigin: "provider", correlationId: "corr_1" };
    const viaQueue = await q.fns._internal.processEbayCommerceTask(task);
    assert.strictEqual(viaQueue.status, "applied", JSON.stringify(viaQueue));
    const s = await ready();
    s.nowRef.value = Date.parse("2026-09-02T11:00:00.000Z");
    s.ebay.orders.set("Q1", ebayOrder("Q1", { fulfillmentStatus: "FULFILLED" }));
    s.ebay.fulfillments.set("Q1", [{ fulfillmentId: "f1", shippingCarrierCode: "RoyalMail", shipmentTrackingNumber: "RM1", shippedDate: "2026-09-03T00:00:00.000Z", shipTo: { fullName: "Ada Lovelace" } }]);
    const pass = await s.fns._internal.reconcileConnection(s.ref, s.data(), { force: true, lookbackMs: 24 * 3600000 });
    assert.strictEqual(pass.created, 1, JSON.stringify(pass));
    const strip = (o) => { const c = { ...o }; delete c.createdAtMs; delete c.paymentDate; delete c.commerce; delete c.historyLog; return c; };
    assert.deepStrictEqual(strip(q.orderDoc("Q1")), strip(s.orderDoc("Q1")));
    assert.strictEqual(q.orderDoc("Q1").trackingNumber, "RM1"); assert.strictEqual(s.orderDoc("Q1").isDispatched, true);
    const stripR = (r) => { const c = { ...r }; delete c.updatedAtMs; return c; };
    assert.deepStrictEqual(stripR(q.restricted("Q1")), stripR(s.restricted("Q1")));
    const hash = hashing.usernameHash(HASH_KEY, "ada_l");
    assert.deepStrictEqual(q.store.read(`ebayBuyers/c1__${hash}`).orderIds, s.store.read(`ebayBuyers/c1__${hash}`).orderIds);
    const event = q.store.read(`commerceEvents/${task.key.replace(/[^A-Za-z0-9_.-]/g, "_")}`);
    assert.strictEqual(event.status, "applied"); assert.strictEqual(event.result, "created"); assert.strictEqual(event.order_id, "ebay_c1_Q1"); assert.strictEqual(event.correlation_id, "corr_1");
  });

  await check("a queued task is recorded skipped when the connector switch or the flag is off, and never fetches", async () => {
    const off = await ready();
    off.switches.connectorOn = false;
    const task = { key: "ebay|x|evt2", provider: "ebay", connectionId: off.connectionId, companyId: "c1", entityType: "order", externalId: "Q2", eventType: "ORDER_CONFIRMATION", attempt: 1 };
    const out = await off.fns._internal.processEbayCommerceTask(task);
    assert.strictEqual(out.status, "skipped"); assert.strictEqual(out.outcome.reason, "connector_off");
    assert.ok(!off.ebay.calls.some((c) => c.op === "getOrder"));
    assert.strictEqual(off.store.read("commerceEvents/ebay_x_evt2").status, "skipped");
    const paused = await ready();
    paused.store.write("appConfig/commerce", { connectors: { providers: { ebay: true }, connections: { [`ebay:${paused.connectionId}`]: false } } });
    require("../../commerce/flags").resetCommerceFlagCache();
    assert.strictEqual((await paused.fns._internal.processEbayCommerceTask({ ...task, connectionId: paused.connectionId })).status, "skipped");
    const gone = await ready();
    await gone.fns.disconnectEbay({ auth, data: { connectionId: gone.connectionId } });
    await assert.rejects(gone.fns._internal.processEbayCommerceTask({ ...task, connectionId: gone.connectionId }), (e) => e.errorClass === "validation");
    gone.store.write(`ebayConnections/${gone.connectionId}`, { ...gone.data(), status: "reconnect_required" });
    await assert.rejects(gone.fns._internal.processEbayCommerceTask({ ...task, connectionId: gone.connectionId }), (e) => e.errorClass === "auth", "a reconnect_required connection is an auth-class retry (applies after reconnect)");
  });

  await check("a pass advances the common cursor only when complete; one failing order holds it and marks partial_pass", async () => {
    const h = await ready();
    h.nowRef.value = Date.parse("2026-09-02T12:00:00.000Z");
    h.ebay.orders.set("A1", ebayOrder("A1")); h.ebay.orders.set("A2", ebayOrder("A2"));
    const clean = await h.fns._internal.reconcileConnection(h.ref, h.data(), { force: true, lookbackMs: 24 * 3600000 });
    assert.strictEqual(clean.complete, true); assert.strictEqual(clean.created, 2);
    const cursor = h.store.read(`commerceCursors/ebay__${h.connectionId}__order`);
    assert.strictEqual(cursor.watermarkMs, h.nowRef.value); assert.strictEqual(cursor.lastPassComplete, true);
    assert.strictEqual(h.data().lastErrorCode, ""); assert.ok(h.data().lastSuccessAtMs > 0);
    assert.deepStrictEqual(h.data().lastReconcile.orders, { scanned: 2, created: 2, updated: 0, noop: 0, skipped: 0, held: 0, failed: 0, stale: 0 });
    assert.strictEqual(h.store.read(`commerceHealth/ebay__${h.connectionId}`).orders.lastSuccessAtMs, h.nowRef.value);
    h.nowRef.value += 3600000;
    h.ebay.orders.set("A3", ebayOrder("A3", { lastModifiedDate: "2026-09-02T12:30:00.000Z", extra: { sellerMemo: "ring me on 07700 900123" } }));
    const partial = await h.fns._internal.reconcileConnection(h.ref, h.data());
    assert.strictEqual(partial.complete, false); assert.strictEqual(partial.failed, 1);
    assert.strictEqual(h.store.read(`commerceCursors/ebay__${h.connectionId}__order`).watermarkMs, cursor.watermarkMs, "the watermark did not move past the failed order");
    assert.strictEqual(h.data().lastErrorCode, "partial_pass");
    assert.ok(h.store.paths(`ebayConnections/${h.connectionId}/syncLog/`).map((p) => h.store.read(p).type).includes("order_import_failed"));
  });

  await check("a window that does not fit the page budget is bisected and the watermark stands at the end of the last completed sub-window", async () => {
    const h = await ready();
    h.nowRef.value = Date.parse("2026-09-02T00:00:00.000Z") + 24 * 3600000;
    h.ebay.pageLimit = 1;
    for (let i = 0; i < 9; i += 1) h.ebay.orders.set(`W${i}`, ebayOrder(`W${i}`, { lastModifiedDate: new Date(Date.parse("2026-09-02T00:00:00.000Z") + i * 2.5 * 3600000).toISOString() }));
    const pass = await h.fns._internal.reconcileConnection(h.ref, h.data(), { force: true, lookbackMs: 24 * 3600000, maxPages: 2 });
    assert.ok(pass.subWindows >= 2, JSON.stringify(pass));
    assert.ok(pass.bisections >= 1);
    assert.strictEqual(pass.failed, 0);
    const cursor = h.store.read(`commerceCursors/ebay__${h.connectionId}__order`);
    assert.ok(cursor.watermarkMs > 0);
    if (pass.truncated) {
      assert.ok(cursor.watermarkMs < h.nowRef.value, "not now: something was left unread");
      assert.strictEqual(h.data().lastErrorCode, "truncated");
    } else assert.strictEqual(cursor.watermarkMs, h.nowRef.value);
    assert.ok(h.store.paths(`ebayConnections/${h.connectionId}/syncLog/`).map((p) => h.store.read(p).type).includes("sync_bisected"));
    // The orders that were read all landed, idempotently.
    assert.ok([...h.ebay.orders.keys()].filter((id) => h.orderDoc(id)).length >= 2);
  });

  await check("a sandbox row on a production server is skipped with environment_mismatch, never called", async () => {
    const h = await ready({ environment: "production" });
    h.store.write(`ebayConnections/${h.connectionId}`, { ...h.data(), environment: "sandbox" });
    const before = h.ebay.calls.length;
    const out = await h.fns._internal.reconcileConnection(h.ref, h.data());
    assert.strictEqual(out.skipped, "environment_mismatch"); assert.strictEqual(h.ebay.calls.length, before);
    assert.strictEqual(h.data().lastErrorCode, "environment_mismatch");
    const view = (await h.fns.getEbayConnections({ auth, data: {} })).connections[0];
    assert.strictEqual(view.specStatus, "suspended");
    await assert.rejects(h.fns.syncEbayNow({ auth, data: { connectionId: h.connectionId } }), /different environment/);
  });

  await check("the sweep skips a paused connection, records the flag state, and owes a catch-up when the flag turns back on; a rejected keyset stops the sweep after one row", async () => {
    const h = await ready();
    const flags = require("../../commerce/flags");
    h.store.write("appConfig/commerce", { connectors: { providers: { ebay: true }, connections: { [`ebay:${h.connectionId}`]: false } } }); flags.resetCommerceFlagCache();
    const paused = await h.fns._internal.runSweep("sweep");
    assert.strictEqual(paused.swept, 0); assert.strictEqual(h.data().lastFlagState, false);
    h.store.write("appConfig/commerce", { connectors: { providers: { ebay: true } } }); flags.resetCommerceFlagCache();
    h.store.write(`ebayConnections/${h.connectionId}`, { ...h.data(), lastSuccessAtMs: h.nowRef.value - 36 * 3600000 });
    const resumed = await h.fns._internal.runSweep("sweep");
    assert.strictEqual(resumed.swept, 1);
    assert.ok(h.ebay.calls.some((c) => c.op === "getOrders" && c.lastModifiedFromMs <= h.nowRef.value - 36 * 3600000), "the pass started at the catch-up point, not at now − 24 h");
    assert.strictEqual(h.data().catchUpDueFromMs, 0, "cleared once the catch-up reached now");
    assert.ok(h.store.paths(`ebayConnections/${h.connectionId}/syncLog/`).map((p) => h.store.read(p).type).includes("catch_up_completed"));
    assert.strictEqual((await buildEbay({ connectorOn: false }).fns._internal.runSweep("sweep")).off, true, "the switch off: no row is read");

    const bad = await ready({ oauth: { refreshToken: async () => { throw Object.assign(new Error("ebay_oauth_http_401: invalid_client"), { status: 401, errorClass: "permission", code: "app_credentials_invalid" }); } } });
    bad.store.write("ebayConnections/c1__second", { ...bad.data(), sellerUserId: "second", lastSyncAtMs: bad.nowRef.value });
    bad.store.write("ebayConnections/c1__second/credentials/current", { ...bad.store.read(`ebayConnections/${bad.connectionId}/credentials/current`) });
    for (const id of [bad.connectionId, "c1__second"]) bad.store.write(`ebayConnections/${id}/credentials/current`, { ...bad.store.read(`ebayConnections/${id}/credentials/current`), accessTokenExpiresAtMs: bad.nowRef.value - 1 });
    const stopped = await bad.fns._internal.runSweep("sweep");
    assert.strictEqual(stopped.failed, 1, "one bad secret, one log line, no second row touched");
    assert.strictEqual(bad.data().lastErrorCode, "app_credentials_invalid"); assert.strictEqual(bad.data().status, "connected");
    assert.strictEqual(bad.store.read("ebayConnections/c1__second").lastErrorCode, "", "the second connection was not touched");
  });

  await check("the retention patch for a deletion request removes the person from an order whether or not it was delivered", async () => {
    const h = await ready();
    const patch = h.fns._internal.deletionPatch({ customerName: "ada_l", shippingName: "ada_l", emailAddress: "", shippingStreetAddress: "", orderValue: 116, isDelivered: false });
    assert.strictEqual(patch.customerName, "Buyer details removed"); assert.strictEqual(patch.shippingName, ""); assert.strictEqual(patch.orderValue, undefined); assert.strictEqual(patch.piiScrubbedReason, "ebay_account_deletion");
  });

  if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
  console.log("\n✅ EBAY SYNC GEÇTİ");
})();

// The main project's half of the Amazon bridge: who may push an envelope in,
// what is believed, and what a workspace owner carries out.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createAmazonIngest, createAmazonConnect, createAmazonAdminClient, SYNC_IDENTITY } = require("../../commerce/amazon/ingest");
const { verifyIntent } = require("../../commerce/amazon/intent");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const AUD = "https://europe-west2-eggcraft-studio.cloudfunctions.net/ingestAmazonEnvelope";
const clean = () => ({
  version: 1, connectionId: "conn-1", companyId: "co-1", marketplaceId: "A1F83G8C2ARO7P", syncedAtMs: 1, taxKnown: false, removedPaths: [],
  order: { AmazonOrderId: "202-1", PurchaseDate: "2026-09-01T10:00:00Z", LastUpdateDate: "2026-09-02T10:00:00Z", OrderStatus: "Shipped", MarketplaceId: "A1F83G8C2ARO7P", OrderTotal: { CurrencyCode: "GBP", Amount: "42.00" } },
  items: [{ OrderItemId: "i1", ASIN: "B0", SellerSKU: "S", Title: "Ring", QuantityOrdered: 1, ItemPrice: { CurrencyCode: "GBP", Amount: "42.00" } }]
});
const goodPayload = { email: SYNC_IDENTITY, email_verified: true, aud: AUD };

function harness({ payload = goodPayload, workspace = true } = {}) {
  const applied = [];
  const logs = [];
  const ingest = createAmazonIngest({
    db: "db",
    applyEnvelope: async (db, envelope, ctx) => { applied.push({ envelope, ctx }); return { result: "created" }; },
    normalize: (order, ctx) => ({ identity: { provider: "amazon", external_id: order.AmazonOrderId }, order: { is_test: false }, ctxSeen: ctx }),
    contextFor: async (companyId) => (workspace ? { orderIdFor: () => `amazon_${companyId}_x`, defaultStatus: "new" } : null),
    verifyIdToken: async (token) => { if (token === "good") return payload; throw new Error("bad token"); },
    audience: AUD,
    now: () => 1_700_000_000_000,
    logger: { log: (l) => logs.push(l), warn: (l) => logs.push(l), error: (l) => logs.push(l) }
  });
  return { ingest, applied, logs };
}

check("the two copies of the intent module are identical", () => {
  const here = fs.readFileSync(path.join(__dirname, "..", "..", "commerce", "amazon", "intent.js"), "utf8");
  const there = fs.readFileSync(path.join(__dirname, "..", "..", "..", "functions-amazon", "src", "intent.js"), "utf8");
  assert.strictEqual(here, there, "functions/commerce/amazon/intent.js differs from functions-amazon/src/intent.js");
});

check("no token, a bad token, another identity, or another audience: 403 and nothing applied", () => {
  const cases = [
    { headers: {}, h: harness() },
    { headers: { authorization: "Bearer bad" }, h: harness() },
    { headers: { authorization: "Bearer good" }, h: harness({ payload: { ...goodPayload, email: "someone@else.iam.gserviceaccount.com" } }) },
    { headers: { authorization: "Bearer good" }, h: harness({ payload: { ...goodPayload, aud: "https://other" } }) },
    { headers: { authorization: "Bearer good" }, h: harness({ payload: { ...goodPayload, email_verified: false } }) }
  ];
  return Promise.all(cases.map(({ headers, h }) => h.ingest.ingest(clean(), headers).then((out) => {
    assert.strictEqual(out.status, 403);
    assert.strictEqual(h.applied.length, 0, "an envelope was applied without authentication");
  })));
});

check("a poisoned envelope is refused with 422, paths only, nothing applied", () => {
  const h = harness();
  const bad = clean(); bad.order.BuyerInfo = { BuyerEmail: "jane@example.com" };
  return h.ingest.ingest(bad, { authorization: "Bearer good" }).then((out) => {
    assert.strictEqual(out.status, 422);
    assert.strictEqual(h.applied.length, 0);
    assert.ok(out.body.violations.some((v) => /order\.BuyerInfo/.test(v)));
    assert.ok(!JSON.stringify({ out, logs: h.logs }).includes("jane"), "the refused value was echoed or logged");
  });
});

check("a clean envelope is normalised and applied in apply mode for the right workspace", () => {
  const h = harness();
  return h.ingest.ingest(clean(), { authorization: "Bearer good" }).then((out) => {
    assert.strictEqual(out.status, 200);
    assert.strictEqual(h.applied.length, 1);
    const { envelope, ctx } = h.applied[0];
    assert.strictEqual(ctx.companyId, "co-1");
    assert.strictEqual(ctx.mode, "apply");
    assert.strictEqual(ctx.source, "amazon");
    assert.ok(/^amazon\|conn-1\|/.test(ctx.eventKey), ctx.eventKey);
    assert.strictEqual(envelope.identity.external_id, "202-1");
    assert.strictEqual(envelope.ctxSeen.connectionId, "conn-1");
    assert.strictEqual(envelope.ctxSeen.items.length, 1);
  });
});

check("if a later phase ever admits buyer fields, they go to restrictedCustomer and never to the order", () => {
  // In A1 the allowlist refuses buyer fields before the split, so the
  // diversion cannot be driven end-to-end from outside. This pins what can be:
  // an allowlisted envelope writes nothing to restrictedCustomer and the
  // adapter sees no buyer field; and the diversion exists in the source,
  // targets the rules-protected collection, and comes before the engine call.
  const writes = [];
  const applied = [];
  const db = { collection: (c) => ({ doc: (id) => ({ collection: (sub) => ({ doc: (oid) => ({ async set(data) { writes.push({ path: `${c}/${id}/${sub}/${oid}`, data }); } }) }) }) }) };
  const ingest = createAmazonIngest({
    db,
    applyEnvelope: async (_db, envelope, ctx) => { applied.push({ envelope, ctx }); return { result: "created" }; },
    normalize: (order, ctx) => ({ identity: { provider: "amazon", external_id: order.AmazonOrderId }, order: { is_test: false }, orderSeen: order, itemsSeen: ctx.items }),
    contextFor: async (companyId) => ({ orderIdFor: (e) => `amazon_${companyId}_${e.identity.external_id}` }),
    verifyIdToken: async () => goodPayload,
    audience: AUD,
    now: () => 1_700_000_000_000,
    logger: { log() {}, warn() {}, error() {} }
  });
  return ingest.ingest(clean(), { authorization: "Bearer good" }).then((out) => {
    assert.strictEqual(out.status, 200);
    assert.strictEqual(writes.length, 0, "an A1 envelope wrote to restrictedCustomer");
    assert.ok(!("BuyerInfo" in applied[0].envelope.orderSeen), "the adapter saw a buyer field");
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "commerce", "amazon", "ingest.js"), "utf8");
    // The diversion exists, targets the rules-protected collection, and comes BEFORE the engine.
    const divert = src.indexOf('collection("restrictedCustomer")');
    const apply = src.indexOf("await applyEnvelope(");
    assert.ok(divert > 0, "ingest.js no longer diverts to restrictedCustomer");
    assert.ok(divert < apply, "the diversion comes after the engine has already written the order");
    assert.ok(!/order\.BuyerInfo|order\.ShippingAddress/.test(src.slice(apply)), "buyer fields are touched after the engine call");
  });
});

check("the same order twice yields the same event key; a newer update yields a different one", () => {
  const h = harness();
  const second = clean(); second.order.LastUpdateDate = "2026-09-03T10:00:00Z";
  return h.ingest.ingest(clean(), { authorization: "Bearer good" })
    .then(() => h.ingest.ingest(clean(), { authorization: "Bearer good" }))
    .then(() => h.ingest.ingest(second, { authorization: "Bearer good" }))
    .then(() => {
      assert.strictEqual(h.applied[0].ctx.eventKey, h.applied[1].ctx.eventKey);
      assert.notStrictEqual(h.applied[0].ctx.eventKey, h.applied[2].ctx.eventKey);
    });
});

check("an envelope for a workspace that does not exist is 404, not applied", () => {
  const h = harness({ workspace: false });
  return h.ingest.ingest(clean(), { authorization: "Bearer good" }).then((out) => {
    assert.strictEqual(out.status, 404);
    assert.strictEqual(h.applied.length, 0);
  });
});

check("the connect URL carries an intent the Amazon side would accept, for that owner only", () => {
  const hex = "0123456789abcdef".repeat(4);
  const connect = createAmazonConnect({ hmacKeyHex: hex, now: () => 1_700_000_000_000 });
  const url = new URL(connect.startUrlFor({ companyId: "co-1", ownerUid: "uid-1" }));
  assert.strictEqual(url.origin + url.pathname, "https://amazon.nivadesk.app/oauth/start");
  const r = verifyIntent(url.searchParams.get("intent"), { key: Buffer.from(hex, "hex"), now: () => 1_700_000_000_000 + 1000 });
  assert.strictEqual(r.ok, true, r.reason);
  assert.strictEqual(r.payload.companyId, "co-1");
  assert.strictEqual(r.payload.ownerUid, "uid-1");
  assert.throws(() => createAmazonConnect({ hmacKeyHex: "short" }), /hex/);
});

check("the admin client calls the zone with a bearer token and the right route", () => {
  const seen = [];
  const client = createAmazonAdminClient({
    identityToken: async () => "caller-token",
    fetchImpl: async (url, init) => { seen.push({ url, init }); return { status: 200, json: async () => ({ connections: [] }) }; }
  });
  return client.status("co-1").then((r) => {
    assert.strictEqual(r.status, 200);
    assert.strictEqual(seen[0].url, "https://amazon.nivadesk.app/admin/status?companyId=co-1");
    assert.strictEqual(seen[0].init.headers.Authorization, "Bearer caller-token");
    return client.disconnect("co-1", "conn-1");
  }).then(() => {
    assert.strictEqual(seen[1].url, "https://amazon.nivadesk.app/admin/disconnect");
    assert.deepStrictEqual(JSON.parse(seen[1].init.body), { companyId: "co-1", connectionId: "conn-1" });
  });
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log(`PASS  ${name}`); }
    catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ AMAZON INGEST GEÇTİ");
})();

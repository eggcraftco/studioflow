// What the main project may ask, and only with the right identity.
const assert = require("assert");
const { createAdmin } = require("../src/admin");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

function harness({ callerOk = true } = {}) {
  const rows = [
    { id: "c1", companyId: "co-1", status: "active", sellerId: "A2SELLER", marketplaces: [{ marketplaceId: "M1", countryCode: "GB", participating: true }], consentedAtMs: 1, lastSyncAtMs: 2 },
    { id: "c2", companyId: "co-2", status: "active", sellerId: "A3OTHER", marketplaces: [] }
  ];
  const disconnected = [];
  const connections = {
    async listForCompany(companyId) { return rows.filter((r) => r.companyId === companyId); },
    async get(id) { return rows.find((r) => r.id === id) || null; },
    async disconnect(id) { disconnected.push(id); }
  };
  const verifyCaller = async () => (callerOk ? { ok: true, email: "amazon-caller@eggcraft-studio.iam.gserviceaccount.com" } : { ok: false, reason: "wrong_identity" });
  const admin = createAdmin({ connections, verifyCaller, logger: { log() {}, warn() {}, error() {} } });
  return { admin, disconnected };
}

check("without the right identity every route is 403 and nothing is read", () => {
  const h = harness({ callerOk: false });
  return Promise.all([
    h.admin.status({ query: { companyId: "co-1" }, headers: {} }),
    h.admin.disconnect({ body: { companyId: "co-1", connectionId: "c1" }, headers: {} }),
    h.admin.syncNow({ body: { companyId: "co-1", connectionId: "c1" }, headers: {} })
  ]).then((outs) => {
    for (const out of outs) assert.strictEqual(out.status, 403);
    assert.strictEqual(h.disconnected.length, 0);
  });
});

check("status returns a workspace's own connections and nothing a workspace should not see", () => {
  const h = harness();
  return h.admin.status({ query: { companyId: "co-1" }, headers: {} }).then((out) => {
    assert.strictEqual(out.status, 200);
    const body = JSON.parse(out.body);
    assert.strictEqual(body.connections.length, 1);
    const c = body.connections[0];
    assert.strictEqual(c.connectionId, "c1");
    assert.ok(!("sellerId" in c), "the seller id was exposed");
    assert.ok(!JSON.stringify(body).includes("A3OTHER"), "another workspace's data was exposed");
  });
});

check("a workspace can disconnect only its own connection", () => {
  const h = harness();
  return h.admin.disconnect({ body: { companyId: "co-1", connectionId: "c2" }, headers: {} }).then((out) => {
    assert.strictEqual(out.status, 404, "a connection belonging to another workspace was disconnected");
    assert.strictEqual(h.disconnected.length, 0);
    return h.admin.disconnect({ body: { companyId: "co-1", connectionId: "c1" }, headers: {} });
  }).then((out) => {
    assert.strictEqual(out.status, 200);
    assert.deepStrictEqual(h.disconnected, ["c1"]);
  });
});

check("sync-now on the admin service says it is not available here", () => {
  const h = harness();
  return h.admin.syncNow({ body: { companyId: "co-1", connectionId: "c1" }, headers: {} }).then((out) => {
    assert.strictEqual(out.status, 501);
  });
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log(`PASS  ${name}`); }
    catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ ADMIN GEÇTİ");
})();

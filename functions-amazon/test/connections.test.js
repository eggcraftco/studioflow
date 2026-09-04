// Connections and the one secret each one owns, against fakes of Firestore
// and Secret Manager that record what was written.
const assert = require("assert");
const { createConnections, secretNameFor } = require("../src/connections");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const T0 = 1_700_000_000_000;

function harness() {
  const docs = new Map();   // "collection/id" → data
  const collection = (name) => ({
    doc: (id) => ({
      id,
      async get() { const d = docs.get(`${name}/${id}`); return { exists: Boolean(d), id, data: () => d }; },
      async set(data, opts) { docs.set(`${name}/${id}`, { ...(opts && opts.merge ? docs.get(`${name}/${id}`) : {}), ...data }); },
      async create(data) { if (docs.has(`${name}/${id}`)) { const e = new Error("ALREADY_EXISTS"); e.code = 6; throw e; } docs.set(`${name}/${id}`, data); },
      async delete() { docs.delete(`${name}/${id}`); },
      collection: (sub) => collection(`${name}/${id}/${sub}`)
    }),
    where: (field, op, value) => ({ limit: () => ({ async get() {
      const hits = [...docs.entries()].filter(([k, d]) => k.startsWith(`${name}/`) && k.split("/").length === name.split("/").length + 1 && d[field] === value);
      return { empty: hits.length === 0, docs: hits.map(([k, d]) => ({ id: k.split("/").pop(), data: () => d, ref: { async delete() { docs.delete(k); } } })) };
    } }) })
  });
  const admin = { firestore: () => ({ collection, collectionGroup: (sub) => ({ where: (field, op, value) => ({ limit: () => ({ async get() {
    const hits = [...docs.entries()].filter(([k, d]) => k.includes(`/${sub}/`) && Number(d[field]) < value);
    return { docs: hits.map(([k, d]) => ({ id: k, data: () => d, ref: { async delete() { docs.delete(k); } } })) };
  } }) }) }) }) };
  const secretStore = new Map();
  const created = [];
  const secrets = {
    async createSecret({ secretId, secret }) { created.push({ secretId, secret }); if (secretStore.has(secretId)) { const e = new Error("already exists"); e.code = 6; throw e; } secretStore.set(secretId, []); },
    async addSecretVersion({ parent, payload }) { const id = parent.split("/").pop(); (secretStore.get(id) || secretStore.set(id, []).get(id)).push(Buffer.from(payload.data).toString("utf8")); },
    async accessSecretVersion({ name }) { const id = name.split("/secrets/")[1].split("/")[0]; const versions = secretStore.get(id) || []; return [{ payload: { data: Buffer.from(versions[versions.length - 1] || "") } }]; },
    async deleteSecret({ name }) { const id = name.split("/").pop(); if (!secretStore.delete(id)) { const e = new Error("not found"); e.code = 5; throw e; } }
  };
  const conns = createConnections({ admin, secrets, projectId: "nivadesk-amazon", region: "europe-west2", now: () => T0 });
  return { conns, docs, secretStore, created };
}

check("a nonce is claimed once; the second claim loses", () => {
  const h = harness();
  return h.conns.recordNonce("n1").then((first) => {
    assert.strictEqual(first, true);
    return h.conns.recordNonce("n1");
  }).then((second) => {
    assert.strictEqual(second, false);
    return h.conns.nonceSeen("n1");
  }).then((seen) => assert.strictEqual(seen, true));
});

check("activating stores the refresh token in Secret Manager and NOT on the document", () => {
  const h = harness();
  return h.conns.createPending({ companyId: "co", ownerUid: "u", nonce: "n", state: "s" }).then((pendingId) =>
    h.conns.activate({ pendingId, companyId: "co", ownerUid: "u", sellerId: "A2S", marketplaces: [{ marketplaceId: "M", participating: true }], refreshToken: "Atzr|secret" })
  ).then((id) => {
    const doc = h.docs.get(`connections/${id}`);
    assert.ok(doc, "no connection document");
    assert.ok(!JSON.stringify(doc).includes("Atzr"), "the refresh token was written to Firestore");
    assert.deepStrictEqual(h.secretStore.get(secretNameFor(id)), ["Atzr|secret"]);
    assert.strictEqual(doc.status, "active");
    assert.strictEqual([...h.docs.keys()].filter((k) => k.startsWith("pendingConnections/")).length, 0, "the pending document survived activation");
    return h.conns.refreshTokenFor(id).then((t) => assert.strictEqual(t, "Atzr|secret"));
  });
});

check("a refresh-token secret is user-managed in europe-west2 only — never automatic replication", () => {
  // gcp.resourceLocations = europe-west2 refuses a globally replicated secret,
  // and a refresh token replicated to regions the design does not name would
  // be Amazon Information stored outside the boundary's stated location.
  const h = harness();
  return h.conns.activate({ companyId: "co", ownerUid: "u", marketplaces: [], refreshToken: "r" }).then(() => {
    assert.strictEqual(h.created.length, 1);
    const rep = h.created[0].secret && h.created[0].secret.replication;
    assert.ok(rep && rep.userManaged, `automatic replication: ${JSON.stringify(h.created[0].secret)}`);
    assert.ok(!rep.automatic, "automatic replication was requested");
    assert.deepStrictEqual(rep.userManaged.replicas, [{ location: "europe-west2" }]);
  });
});

check("disconnecting destroys the secret and marks the document, never deletes the record", () => {
  const h = harness();
  return h.conns.activate({ companyId: "co", ownerUid: "u", marketplaces: [], refreshToken: "r1" }).then((id) =>
    h.conns.disconnect(id).then(() => {
      assert.strictEqual(h.secretStore.has(secretNameFor(id)), false, "the refresh token secret survived disconnect");
      assert.strictEqual(h.docs.get(`connections/${id}`).status, "disconnected");
      return h.conns.refreshTokenFor(id).then(() => assert.fail("a destroyed token was readable"), (e) => assert.ok(/refresh_token_missing/.test(e.message)));
    })
  );
});

check("a pending connection is found by state only while fresh", () => {
  const h = harness();
  return h.conns.createPending({ companyId: "co", ownerUid: "u", nonce: "n", state: "st" }).then(() =>
    h.conns.findPendingByState("st", 15 * 60 * 1000)
  ).then((p) => {
    assert.ok(p && p.companyId === "co");
    return h.conns.findPendingByState("st", -1);   // already too old
  }).then((p) => assert.strictEqual(p, null));
});

check("only the safe half of an order is stored, and it expires", () => {
  const h = harness();
  return h.conns.saveSafeOrder("c1", { AmazonOrderId: "111-1", OrderStatus: "Shipped" }, [{ OrderItemId: "i" }]).then(() => {
    const key = [...h.docs.keys()].find((k) => k.includes("/orders/"));
    assert.ok(key, "no order stored");
    assert.strictEqual(h.docs.get(key).updatedAtMs, T0);
    return h.conns.sweepOrders({ retentionDays: 90 });
  }).then((r) => {
    assert.strictEqual(r.deleted, 0, "a fresh order was swept");
    const key = [...h.docs.keys()].find((k) => k.includes("/orders/"));
    h.docs.get(key).updatedAtMs = T0 - 91 * 24 * 3600 * 1000;
    return h.conns.sweepOrders({ retentionDays: 90 });
  }).then((r) => assert.strictEqual(r.deleted, 1));
});

check("the secret name is derived from the connection id and nothing else", () => {
  assert.strictEqual(secretNameFor("abc123"), "amazon-refresh-abc123");
  assert.strictEqual(secretNameFor("../x"), "amazon-refresh-x");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log(`PASS  ${name}`); }
    catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ CONNECTIONS GEÇTİ");
})();

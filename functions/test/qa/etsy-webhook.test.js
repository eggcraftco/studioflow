// The Etsy webhook endpoint, as an attacker and as Etsy.
//
// A public endpoint that creates orders in someone's workspace deserves the
// hostile reading: forged signatures, replays, duplicate deliveries, and a
// resource_url pointed somewhere it should not be.

const assert = require("assert");
const crypto = require("crypto");
const etsy = require("../../etsy");
const { createEtsyWebhookFunction } = require("../../etsyWebhook");

let failed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

const SECRET = "whsec_" + crypto.randomBytes(24).toString("base64");
const SERVER_TS = Symbol("ts");

function sign(body, { id = "msg_1", ts = Math.floor(Date.now() / 1000), secret = SECRET } = {}) {
  const key = Buffer.from(String(secret).replace(/^whsec_/, ""), "base64");
  return crypto.createHmac("sha256", key).update(`${id}.${ts}.${body}`, "utf8").digest("base64");
}

function makeWorld({ connections = [{ id: "c1_222", companyId: "c1", externalShopId: "222", status: "connected" }] } = {}) {
  const docs = new Map();
  const created = new Set();
  const events = [];
  function handle(path) {
    return {
      path,
      get: async () => ({ exists: docs.has(path), data: () => docs.get(path), ref: handle(path) }),
      set: async (patch, options = {}) => {
        const base = options.merge && docs.has(path) ? docs.get(path) : {};
        docs.set(path, { ...base, ...patch });
      },
      create: async (row) => {
        if (created.has(path)) throw new Error("already exists");
        created.add(path);
        docs.set(path, row);
      },
      delete: async () => { created.delete(path); docs.delete(path); }
    };
  }
  const firestore = () => ({
    collection: (name) => ({
      doc: (id) => handle(`${name}/${id}`),
      where: (field, _op, value) => {
        const filters = [[field, value]];
        // The limit is honoured, because it is the thing under test: the
        // webhook used to take limit(1) and reach only whichever connection id
        // sorted first. A fake that ignored it passed either way.
        let cap = Infinity;
        const q = {
          where: (f, _o, v) => { filters.push([f, v]); return q; },
          limit: (n) => { cap = Number(n) || Infinity; return q; },
          get: async () => {
            const rows = connections
              .filter((row) => filters.every(([f, v]) => String(row[f]) === String(v)))
              .slice(0, cap);
            return {
              empty: rows.length === 0,
              docs: rows.map((row) => ({ id: row.id, data: () => row, ref: handle(`etsyConnections/${row.id}`) }))
            };
          }
        };
        return q;
      }
    })
  });
  const admin = { firestore: Object.assign(firestore, { FieldValue: { serverTimestamp: () => SERVER_TS }, Timestamp: { fromMillis: (ms) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 }) } }) };
  return { admin, docs, created, events, handle };
}

function build({ world, secret = SECRET, fetched = { receipt_id: 555 }, applied = { status: "created", receiptId: "555" }, onApply = null, callEtsy = null, etsyOverride = null }) {
  const calls = { fetches: [], applies: 0 };
  return createEtsyWebhookFunction({
    admin: world.admin,
    onRequest: (_o, handler) => handler,
    etsy: etsyOverride || etsy,
    connect: {
      callEtsy: callEtsy || (async (_ref, url) => { calls.fetches.push(url); return fetched; }),
      writeSyncEvent: async (_ref, event) => { world.events.push(event); }
    },
    applyReceipt: onApply || (async () => { calls.applies += 1; return applied; }),
    signingSecret: () => secret,
    companySettingsDocRef: () => world.handle("companySettings/c1"),
    resolveDefaultDeliveryTime: () => 30,
    now: () => Date.now()
  });
}

function req(bodyObject, { id = "msg_1", ts = Math.floor(Date.now() / 1000), signature = null, secret = SECRET, method = "POST" } = {}) {
  const raw = JSON.stringify(bodyObject);
  const headers = {
    "webhook-id": id,
    "webhook-timestamp": String(ts),
    "webhook-signature": signature === null ? `v1,${sign(raw, { id, ts, secret })}` : signature
  };
  return {
    method,
    rawBody: Buffer.from(raw, "utf8"),
    body: bodyObject,
    get: (name) => headers[String(name).toLowerCase()]
  };
}

function res() {
  return {
    code: 0, payload: null,
    status(c) { this.code = c; return this; },
    json(p) { this.payload = p; return this; }
  };
}

const PAID = { event_type: "order.paid", shop_id: 222, resource_url: "https://openapi.etsy.com/v3/application/shops/222/receipts/555" };

// --- the happy path ---------------------------------------------------------

test("a correctly signed order.paid is applied", async () => {
  const world = makeWorld();
  const fn = build({ world });
  const r = res();
  await fn(req(PAID), r);
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.payload.outcome, "created");
  assert.ok(world.events.some((e) => e.type === "webhook" && e.event === "order.paid"));
});

// --- forgery ----------------------------------------------------------------

test("an unsigned request is refused", async () => {
  const world = makeWorld();
  const fn = build({ world });
  const r = res();
  await fn(req(PAID, { signature: "" }), r);
  assert.strictEqual(r.code, 401);
});

test("a signature from another secret is refused", async () => {
  const world = makeWorld();
  const fn = build({ world });
  const r = res();
  const other = "whsec_" + crypto.randomBytes(24).toString("base64");
  await fn(req(PAID, { secret: other }), r);
  assert.strictEqual(r.code, 401);
});

test("a tampered body is refused", async () => {
  const world = makeWorld();
  const fn = build({ world });
  const raw = JSON.stringify(PAID);
  const ts = Math.floor(Date.now() / 1000);
  const good = sign(raw, { ts });
  // Same signature, different body — the classic forgery attempt.
  const tampered = {
    method: "POST",
    rawBody: Buffer.from(JSON.stringify({ ...PAID, shop_id: 999 }), "utf8"),
    body: { ...PAID, shop_id: 999 },
    get: (name) => ({ "webhook-id": "msg_1", "webhook-timestamp": String(ts), "webhook-signature": `v1,${good}` })[String(name).toLowerCase()]
  };
  const r = res();
  await fn(tampered, r);
  assert.strictEqual(r.code, 401);
});

test("a replay from outside the time window is refused", async () => {
  const world = makeWorld();
  const fn = build({ world });
  const r = res();
  await fn(req(PAID, { ts: Math.floor(Date.now() / 1000) - 3600 }), r);
  assert.strictEqual(r.code, 401);
});

// --- duplicates -------------------------------------------------------------

test("the same delivery twice is applied once", async () => {
  const world = makeWorld();
  let applies = 0;
  const fn = build({ world, onApply: async () => { applies += 1; return { status: "created", receiptId: "555" }; } });
  const first = res(); const second = res();
  await fn(req(PAID, { id: "same" }), first);
  await fn(req(PAID, { id: "same" }), second);
  assert.strictEqual(first.payload.outcome, "created");
  assert.strictEqual(second.payload.duplicate, true);
  assert.strictEqual(applies, 1, "the second delivery must not create a second order");
});

test("a failed delivery releases its key so the retry can work", async () => {
  const world = makeWorld();
  let applies = 0;
  const fn = build({
    world,
    onApply: async () => {
      applies += 1;
      if (applies === 1) throw new Error("firestore blew up");
      return { status: "created", receiptId: "555" };
    }
  });
  const first = res();
  await fn(req(PAID, { id: "retry-me" }), first);
  assert.strictEqual(first.code, 500, "a real failure must ask Etsy to send it again");

  const retry = res();
  await fn(req(PAID, { id: "retry-me" }), retry);
  assert.strictEqual(retry.code, 200);
  assert.strictEqual(retry.payload.outcome, "created", "the retry must not be swallowed as a duplicate");
  assert.strictEqual(applies, 2);
});

// --- where the data is fetched from -----------------------------------------

test("a resource_url that is not Etsy is never fetched", async () => {
  const world = makeWorld();
  const fetches = [];
  const fn = build({
    world,
    callEtsy: async (_ref, url) => { fetches.push(url); return { receipt_id: 1 }; }
  });
  const r = res();
  await fn(req({ ...PAID, resource_url: "https://evil.example/steal" }), r);
  assert.strictEqual(fetches.length, 0, "the token must never be sent to an address Etsy did not own");
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.payload.fetched, false);
});

test("an Etsy resource_url is fetched with the seller's own connection", async () => {
  const world = makeWorld();
  const fetches = [];
  const fn = build({ world, callEtsy: async (ref, url) => { fetches.push([ref.path, url]); return { receipt_id: 555 }; } });
  await fn(req(PAID), res());
  assert.strictEqual(fetches.length, 1);
  assert.strictEqual(fetches[0][0], "etsyConnections/c1_222", "the workspace comes from the connection, never from the request");
});

// --- unknown and irrelevant -------------------------------------------------

test("an event for a shop we do not have is accepted and dropped", async () => {
  const world = makeWorld({ connections: [] });
  const fn = build({ world });
  const r = res();
  await fn(req(PAID), r);
  assert.strictEqual(r.code, 200, "retrying will not conjure a connection");
  assert.strictEqual(r.payload.unknownShop, true);
});

test("a disconnected shop does not receive orders", async () => {
  const world = makeWorld({ connections: [{ id: "c1_222", companyId: "c1", externalShopId: "222", status: "disconnected" }] });
  const fn = build({ world });
  const r = res();
  await fn(req(PAID), r);
  assert.strictEqual(r.payload.unknownShop, true, "a disconnected connection must not be matched");
});

test("an event type we do not handle is ignored, not failed", async () => {
  const world = makeWorld();
  const fn = build({ world });
  const r = res();
  await fn(req({ ...PAID, event_type: "listing.updated" }), r);
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.payload.ignored, "listing.updated");
});

test("a GET is a liveness check, not an error", async () => {
  const world = makeWorld();
  const fn = build({ world });
  const r = res();
  await fn({ method: "GET", get: () => "" }, r);
  assert.strictEqual(r.code, 200);
});

test("an unconfigured secret never accepts anything", async () => {
  const world = makeWorld();
  const fn = build({ world, secret: "" });
  const r = res();
  await fn(req(PAID), r);
  assert.strictEqual(r.payload.ok, false);
  assert.strictEqual(r.payload.reason, "not_configured");
});

// The signature diagnosis tries every plausible secret encoding and body
// framing — dozens of HMAC passes over bytes the caller chose. Worth doing once
// when a real webhook is misconfigured; not worth selling to a stranger for the
// price of one HTTP request, as often as they like.
test("a flood of bad signatures does not buy a diagnosis each time", async () => {
  const world = makeWorld();
  let diagnoses = 0;
  const etsyOverride = Object.create(etsy);
  etsyOverride.diagnoseWebhookSignature = (...args) => {
    diagnoses += 1;
    return etsy.diagnoseWebhookSignature(...args);
  };
  const fn = build({ world, etsyOverride });

  for (let i = 0; i < 5; i += 1) {
    const r = res();
    await fn(req({ event_type: "order.paid", shop_id: "222" }, { id: `probe-${i}`, secret: "whsec_" + Buffer.from("wrong").toString("base64") }), r);
    assert.strictEqual(r.code, 401, "every probe is still rejected");
  }
  assert.ok(diagnoses <= 1, `at most one diagnosis for five probes, ran ${diagnoses}`);
});

test("a shop connected to two workspaces reaches both, not whichever sorts first", async () => {
  // One shop really can be connected twice — a seller with two NivaDesk
  // accounts, or a workshop mid-migration. The design already allows for it:
  // order document ids carry the workspace precisely so the two cannot fight
  // over one order, and Square's webhook already fans out. This one took
  // limit(1), so a receipt went to whichever connection id happened to sort
  // first and the other workspace waited up to fifteen minutes for the sweep.
  const world = makeWorld({
    connections: [
      { id: "c1_222", companyId: "c1", externalShopId: "222", status: "connected" },
      { id: "c2_222", companyId: "c2", externalShopId: "222", status: "connected" }
    ]
  });
  const applied = [];
  const fn = build({ world, onApply: async ({ companyId }) => { applied.push(companyId); return { status: "created", receiptId: "555" }; } });
  const out = res();
  await fn(req(PAID, { id: "fanout" }), out);
  assert.strictEqual(out.payload.ok, true);
  assert.deepStrictEqual(applied.slice().sort(), ["c1", "c2"], "both workspaces holding the shop must get the receipt");
  assert.strictEqual(out.payload.applied, 2);
});

test("one workspace failing still asks Etsy to send it again", async () => {
  // Losing the delivery for the healthy workspace would be worse than
  // re-applying it: the order id is deterministic and applyReceipt refuses a
  // snapshot older than the one it holds, so a retry is safe.
  const world = makeWorld({
    connections: [
      { id: "c1_222", companyId: "c1", externalShopId: "222", status: "connected" },
      { id: "c2_222", companyId: "c2", externalShopId: "222", status: "connected" }
    ]
  });
  const fn = build({
    world,
    onApply: async ({ companyId }) => {
      if (companyId === "c2") throw new Error("firestore blew up");
      return { status: "created", receiptId: "555" };
    }
  });
  const out = res();
  await fn(req(PAID, { id: "partial" }), out);
  assert.strictEqual(out.code, 500, "a partial failure must still be retried");
});

(async () => {
  console.log("Etsy webhook endpoint");
  for (const [name, fn] of tests) {
    try { await fn(); console.log("  ok  " + name); } catch (error) {
      failed += 1;
      console.log("  FAIL " + name + "\n        " + (error?.message || error));
    }
  }
  if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
  console.log("\nPASS");
})();

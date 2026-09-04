// The one door out: validated before sending, carried with our identity,
// retried only on silence.
const assert = require("assert");
const { createBridge } = require("../src/bridge");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const good = () => ({
  version: 1, connectionId: "c", companyId: "co", marketplaceId: "M", syncedAtMs: 1, taxKnown: false, removedPaths: [],
  order: { AmazonOrderId: "1", OrderTotal: { CurrencyCode: "GBP", Amount: "1.00" } }, items: []
});

function harness(responses) {
  const calls = [];
  const queue = [...responses];
  const egress = { fetch: async (url, init) => {
    calls.push({ url, init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return { ok: next.status >= 200 && next.status < 300, status: next.status };
  } };
  const logs = [];
  const send = createBridge({ egress, bridgeUrl: "https://europe-west2-eggcraft-studio.cloudfunctions.net/ingestAmazonEnvelope",
    identityToken: async () => "oidc-token", sleep: async () => {}, logger: { log: (l) => logs.push(l), warn: (l) => logs.push(l), error: (l) => logs.push(l) } });
  return { send, calls, logs };
}

check("a valid envelope is POSTed once with our identity token", () => {
  const h = harness([{ status: 200 }]);
  return h.send(good()).then((r) => {
    assert.strictEqual(r.ok, true);
    assert.strictEqual(h.calls.length, 1);
    assert.strictEqual(h.calls[0].init.headers.Authorization, "Bearer oidc-token");
    assert.strictEqual(h.calls[0].init.method, "POST");
    assert.deepStrictEqual(JSON.parse(h.calls[0].init.body), good());
  });
});

check("an unsafe envelope never leaves — refused before any call", () => {
  const h = harness([{ status: 200 }]);
  const bad = good(); bad.order.BuyerInfo = { BuyerEmail: "jane@example.com" };
  return h.send(bad).then((r) => {
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "unsafe_envelope");
    assert.strictEqual(h.calls.length, 0, "an unsafe envelope was sent");
    assert.ok(h.logs.every((l) => !/jane/.test(l)), "the refused value was logged");
  });
});

check("silence and 5xx are retried; a 4xx is not — that is the contract, not the weather", () => {
  const flaky = harness([{ status: 503 }, { status: 503 }, { status: 200 }]);
  const refused = harness([{ status: 400 }]);
  const dead = harness([new Error("ECONNRESET")]);
  return Promise.all([
    flaky.send(good()).then((r) => { assert.strictEqual(r.ok, true); assert.strictEqual(flaky.calls.length, 3); }),
    refused.send(good()).then((r) => { assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, "http_400"); assert.strictEqual(refused.calls.length, 1); }),
    dead.send(good()).then((r) => { assert.strictEqual(r.ok, false); assert.strictEqual(dead.calls.length, 3); })
  ]);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log(`PASS  ${name}`); }
    catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ BRIDGE GEÇTİ");
})();

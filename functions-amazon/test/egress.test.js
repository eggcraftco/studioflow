// The one door out. Every outbound request goes through createEgress, and
// this is what that door guarantees.
const assert = require("assert");
const { createEgress, EgressRefused, AMAZON_HOSTS, hostnamesOf } = require("../src/egress");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

function harness({ extraHosts = [], response = { status: 200 } } = {}) {
  const calls = [];
  const logs = [];
  const egress = createEgress({
    extraHosts,
    fetchImpl: async (url, init) => { calls.push({ url, init }); if (response instanceof Error) throw response; return response; },
    logger: { log: (l) => logs.push(l), warn: (l) => logs.push(l), error: (l) => logs.push(l) },
    now: (() => { let t = 1000; return () => (t += 7); })()
  });
  return { egress, calls, logs };
}

check("the SP-API regional hosts and Login with Amazon are allowed", () => {
  const h = harness();
  return Promise.all(AMAZON_HOSTS.map((host) => h.egress.fetch(`https://${host}/orders/2026-01-01/orders`)))
    .then(() => assert.strictEqual(h.calls.length, AMAZON_HOSTS.length));
});

check("a host that is not on the list is refused before any connection is opened", () => {
  const h = harness();
  return Promise.all([
    "https://evil.example.com/x",
    "https://sellingpartnerapi-eu.amazon.com.evil.example/x",   // suffix trick
    "https://amazon.com/x",                                       // parent domain is not the host
    "https://api.amazon.com.attacker.net/",
    "https://169.254.169.253/",                                   // almost the metadata server
    "not a url"
  ].map((url) => h.egress.fetch(url).then(() => assert.fail(`allowed: ${url}`), (e) => {
    assert.ok(e instanceof EgressRefused, `wrong error for ${url}: ${e.message}`);
  }))).then(() => {
    assert.strictEqual(h.calls.length, 0, "a refused host was still contacted");
    assert.ok(h.logs.every((l) => /egress refused/.test(l)), h.logs.join("\n"));
  });
});

check("plaintext http is refused even to an allowed host", () => {
  const h = harness();
  return h.egress.fetch("http://api.amazon.com/auth/o2/token").then(() => assert.fail("http was allowed"), (e) => {
    assert.ok(e instanceof EgressRefused);
    assert.strictEqual(h.calls.length, 0);
  });
});

check("the bridge host is allowed only when configured, and only that host", () => {
  const without = harness();
  const withBridge = harness({ extraHosts: ["https://europe-west2-eggcraft-studio.cloudfunctions.net/ingestAmazonEnvelope"] });
  return Promise.all([
    without.egress.fetch("https://europe-west2-eggcraft-studio.cloudfunctions.net/ingestAmazonEnvelope")
      .then(() => assert.fail("bridge host allowed without configuration"), (e) => assert.ok(e instanceof EgressRefused)),
    withBridge.egress.fetch("https://europe-west2-eggcraft-studio.cloudfunctions.net/ingestAmazonEnvelope"),
    withBridge.egress.fetch("https://europe-west2-eggcraft-studio.cloudfunctions.net/somethingElse"),   // same host, fine: the path is the callee's business
    withBridge.egress.fetch("https://us-central1-eggcraft-studio.cloudfunctions.net/ingestAmazonEnvelope")
      .then(() => assert.fail("a different host was allowed"), (e) => assert.ok(e instanceof EgressRefused))
  ]).then(() => assert.strictEqual(withBridge.calls.length, 2));
});

check("every request is logged with host, method, status and duration — never the path, never a header", () => {
  const h = harness({ response: { status: 200 } });
  return h.egress.fetch("https://sellingpartnerapi-eu.amazon.com/orders/2026-01-01/orders/202-1234567-1234567", {
    method: "GET", headers: { "x-amz-access-token": "Atza|SECRET" }
  }).then(() => {
    const line = h.logs.find((l) => l.startsWith("egress host="));
    assert.ok(line, h.logs.join("\n"));
    assert.ok(/host=sellingpartnerapi-eu\.amazon\.com method=GET status=200 ms=\d+/.test(line), line);
    assert.ok(!/202-1234567/.test(line), "the order id (path) was logged");
    assert.ok(!/SECRET|Atza/.test(line), "a token (header) was logged");
  });
});

check("a network failure is logged as one and rethrown, not swallowed", () => {
  const h = harness({ response: Object.assign(new Error("ECONNRESET"), { name: "FetchError" }) });
  return h.egress.fetch("https://api.amazon.com/auth/o2/token", { method: "POST" })
    .then(() => assert.fail("swallowed"), (e) => {
      assert.strictEqual(e.message, "ECONNRESET");
      assert.ok(h.logs.some((l) => /status=network_error/.test(l)));
    });
});

check("hostnamesOf accepts URLs or hostnames, drops garbage, lower-cases", () => {
  const set = hostnamesOf(["https://Example.COM:443/path", "host.internal", "", null, "://bad"]);
  assert.deepStrictEqual([...set].sort(), ["example.com", "host.internal"]);
});

check("isAllowed answers without contacting anything", () => {
  const h = harness();
  assert.strictEqual(h.egress.isAllowed("https://api.amazon.com/x"), true);
  assert.strictEqual(h.egress.isAllowed("https://example.com/x"), false);
  assert.strictEqual(h.calls.length, 0);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log(`PASS  ${name}`); }
    catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ EGRESS GEÇTİ");
})();

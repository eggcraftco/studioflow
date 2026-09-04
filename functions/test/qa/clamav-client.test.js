// What to believe when the scanner does not answer.
//
// The scanner is scaled to zero, so the first request after an idle period
// arrives while ClamAV is still loading its signature database. A connection
// refused there is not a verdict — it is the scanner getting up. Retrying that
// is the difference between a working control and one that reports "error" on
// the first upload of every morning.
//
// What is never retried is a scanner that answers. "Infected" is the answer.
const assert = require("assert");
const { createClamavScanner, verdictFromResponse, isTransient, backoffMs } = require("../../security/clamavClient");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

function scanner(responses, options = {}) {
  const calls = [];
  const waits = [];
  const queue = [...responses];
  const fetchImpl = async () => {
    calls.push(1);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body ?? {}
    };
  };
  const scan = createClamavScanner({
    endpoint: "https://scanner.invalid/scan",
    fetchImpl,
    attempts: options.attempts ?? 4,
    baseDelayMs: 1,
    sleep: async (ms) => { waits.push(ms); },
    random: () => 0,
    logger: { log: () => {}, warn: () => {} }
  });
  return { scan, calls, waits };
}

check("no endpoint means no scanner, which means the trigger stays off", () => {
  assert.strictEqual(createClamavScanner({}), null);
  assert.strictEqual(createClamavScanner({ endpoint: "" }), null);
});

check("a clean answer is a clean answer", () => {
  const s = scanner([{ status: 200, body: { status: "clean" } }]);
  return s.scan(Buffer.from("x"), {}).then((v) => {
    assert.strictEqual(v, "clean");
    assert.strictEqual(s.calls.length, 1, "a successful scan was retried");
  });
});

check("a cold start is retried, and then succeeds", () => {
  // Two 503s while ClamAV loads its database, then the real answer.
  const s = scanner([
    { status: 503, body: { status: "starting" } },
    { status: 503, body: { status: "starting" } },
    { status: 200, body: { status: "clean" } }
  ]);
  return s.scan(Buffer.from("x"), {}).then((v) => {
    assert.strictEqual(v, "clean");
    assert.strictEqual(s.calls.length, 3);
    assert.strictEqual(s.waits.length, 2, "it waited a different number of times than it retried");
    assert.ok(s.waits[1] > s.waits[0],
      `the backoff did not grow between attempts: ${s.waits.join(", ")}`);
  });
});

check("a scanner that never comes up is an error, not a pass", () => {
  const s = scanner([{ status: 503, body: {} }]);
  return s.scan(Buffer.from("x"), {}).then((v) => {
    assert.strictEqual(v, "error", "an unavailable scanner released the file");
    assert.strictEqual(s.calls.length, 4, "it gave up without using its attempts");
  });
});

check("a network that refuses is retried; a timeout is reported as one", () => {
  const refused = scanner([Object.assign(new Error("ECONNREFUSED"), { name: "Error" })]);
  const timedOut = scanner([Object.assign(new Error("aborted"), { name: "AbortError" })]);
  return Promise.all([
    refused.scan(Buffer.from("x"), {}).then((v) => {
      assert.strictEqual(v, "error");
      assert.strictEqual(refused.calls.length, 4);
    }),
    timedOut.scan(Buffer.from("x"), {}).then((v) => {
      assert.strictEqual(v, "timeout", "a timeout is worth telling apart from a refusal");
    })
  ]);
});

check("an answer that retrying cannot fix is not retried", () => {
  // A 400 means we sent something wrong. Trying again sends the same thing.
  const s = scanner([{ status: 400, body: {} }]);
  return s.scan(Buffer.from("x"), {}).then((v) => {
    assert.strictEqual(v, "error");
    assert.strictEqual(s.calls.length, 1, "a permanent failure was retried");
  });
});

check("an infection is never retried away", () => {
  const s = scanner([{ status: 200, body: { status: "infected", signature: "Eicar-Test-Signature" } }]);
  return s.scan(Buffer.from("x"), {}).then((v) => {
    assert.strictEqual(v, "infected");
    assert.strictEqual(s.calls.length, 1);
  });
});

check("a 200 that says nothing useful is not a pass", () => {
  // The shape of a silent failure: the service answers, the body is empty or
  // carries a word this version does not know.
  for (const body of [{}, { status: "" }, { status: "probably fine" }, { ok: true }, null]) {
    assert.strictEqual(verdictFromResponse(body || {}).verdict, "unsupported",
      `${JSON.stringify(body)} was read as a pass`);
  }
  assert.strictEqual(verdictFromResponse({ status: "clean" }).verdict, "clean");
  assert.strictEqual(verdictFromResponse({ status: "OK" }).verdict, "clean");
});

check("the retry rule knows what is worth another go", () => {
  for (const status of [500, 502, 503, 504, 429, 408]) {
    assert.strictEqual(isTransient(status, null), true, `${status} should be retried`);
  }
  for (const status of [200, 400, 401, 403, 404, 422]) {
    assert.strictEqual(isTransient(status, null), false, `${status} should not be retried`);
  }
  assert.strictEqual(isTransient(0, new Error("refused")), true);
});

check("backoff grows and is capped", () => {
  const delays = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => backoffMs(n, 2000, () => 0));
  for (let i = 1; i < delays.length; i += 1) {
    assert.ok(delays[i] >= delays[i - 1], "the backoff went backwards");
  }
  assert.ok(delays[delays.length - 1] <= 30500, "the backoff is unbounded");
  // Jitter, so a burst of uploads does not retry in lockstep.
  assert.notStrictEqual(backoffMs(1, 2000, () => 0), backoffMs(1, 2000, () => 0.9));
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log(`PASS  ${name}`); }
    catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ CLAMAV CLIENT GEÇTİ");
})();

// A project's number is a promise: given once, never given again.
//
// The promise is easy to break by accident. Undoing a create could hand the
// number back. A seed read from the order count could hand it back too, because
// orders arrive from webhooks that mint nothing and orders get deleted, so the
// count moves around under the counter. Both of those are tested here, and both
// would be invisible in review.
const assert = require("assert");
const { nextProjectNumber, generatedProjectName, PLACEHOLDER_CUSTOMER_NAMES } = require("../../orders/projectNumber");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

/** A transaction and a company document, in memory. */
function workspace(initial = {}) {
  const store = { ...initial };
  return {
    store,
    ref: { id: "c1" },
    tx: {
      get: async () => ({ exists: Object.keys(store).length > 0, data: () => ({ ...store }) }),
      set: (_ref, value) => Object.assign(store, value)
    }
  };
}

check("the first project in an empty workspace is number one", async () => {
  const w = workspace();
  assert.strictEqual(await nextProjectNumber(w.tx, w.ref, 0), 1);
  assert.strictEqual(w.store.projectCounter, 1);
});

check("a workspace that already has three hundred jobs starts at 301", async () => {
  const w = workspace({ name: "Co" });
  assert.strictEqual(await nextProjectNumber(w.tx, w.ref, 300), 301);
});

check("the seed applies once and is ignored ever after", async () => {
  const w = workspace({ name: "Co" });
  assert.strictEqual(await nextProjectNumber(w.tx, w.ref, 300), 301);
  // The order count has since jumped — a store connector delivered fifty orders
  // that mint no number. The counter must not follow it.
  assert.strictEqual(await nextProjectNumber(w.tx, w.ref, 350), 302);
  assert.strictEqual(await nextProjectNumber(w.tx, w.ref, 9999), 303);
});

check("the count falling does not hand a number back", async () => {
  const w = workspace({ name: "Co" });
  assert.strictEqual(await nextProjectNumber(w.tx, w.ref, 10), 11);
  // Somebody emptied the bin and the workspace now has two orders.
  assert.strictEqual(await nextProjectNumber(w.tx, w.ref, 2), 12);
  assert.strictEqual(await nextProjectNumber(w.tx, w.ref, 0), 13);
});

check("a hundred mints produce a hundred different numbers, each one bigger", async () => {
  const w = workspace();
  const seen = new Set();
  let previous = 0;
  for (let i = 0; i < 100; i += 1) {
    const number = await nextProjectNumber(w.tx, w.ref, i % 7);
    assert.ok(!seen.has(number), `number ${number} was issued twice`);
    assert.ok(number > previous, `number ${number} did not follow ${previous}`);
    seen.add(number);
    previous = number;
  }
  assert.strictEqual(seen.size, 100);
});

check("a corrupt counter falls back to the seed rather than to NaN", async () => {
  for (const bad of ["not a number", null, undefined, -5, NaN, {}]) {
    const w = workspace({ projectCounter: bad });
    const number = await nextProjectNumber(w.tx, w.ref, 40);
    assert.strictEqual(number, 41, `a counter of ${JSON.stringify(bad)} produced ${number}`);
  }
});

check("a counter stored as a numeric string is still counted from", async () => {
  const w = workspace({ projectCounter: "17" });
  assert.strictEqual(await nextProjectNumber(w.tx, w.ref, 0), 18);
});

check("the name carries the customer when there is one", () => {
  assert.strictEqual(generatedProjectName("John Smith", 1042), "John Smith · Project #1042");
});

check("and stands alone when there is not, because stock jobs have no customer", () => {
  assert.strictEqual(generatedProjectName("", 1042), "Project #1042");
  assert.strictEqual(generatedProjectName(null, 7), "Project #7");
  assert.strictEqual(generatedProjectName("   ", 7), "Project #7");
});

check("the separator is the middle dot the decision wrote, not a hyphen", () => {
  const name = generatedProjectName("Ayşe", 3);
  assert.ok(name.includes(" · "), `expected a middle dot, got ${JSON.stringify(name)}`);
  assert.ok(!name.includes(" - "));
  assert.strictEqual(name, "Ayşe · Project #3");
});

check("a name with no number still reads as something", () => {
  assert.strictEqual(generatedProjectName("John Smith", 0), "John Smith · Project");
  assert.strictEqual(generatedProjectName("", 0), "Project");
});

check("the caller's own text cleaner is used, so the 180 cap is the server's", () => {
  const long = "x".repeat(400);
  const cleaned = generatedProjectName(long, 5, (value) => String(value).slice(0, 10));
  assert.strictEqual(cleaned, "xxxxxxxxxx · Project #5");
});

check("a placeholder name from a client that has no form yet is not a customer", () => {
  // A web client that has not shipped the form sends no customerName, and the
  // server falls back to "New Project" for it. Reading that as a person would
  // produce "New Project · Project #1", which reads like a bug because it is
  // one. The rule is the module's, not this test's — passing the placeholder
  // straight in is the point.
  for (const placeholder of PLACEHOLDER_CUSTOMER_NAMES) {
    assert.strictEqual(generatedProjectName(placeholder, 1), "Project #1", placeholder);
  }
  // A real business whose name merely begins the same way keeps it.
  assert.strictEqual(generatedProjectName("New Projects Ltd", 1), "New Projects Ltd · Project #1");
  assert.strictEqual(generatedProjectName("  New Project  ", 1), "Project #1");
});

(async () => {
  for (const { name, run } of checks) {
    try {
      await run();
      console.log("PASS ", name);
    } catch (error) {
      failures += 1;
      console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200));
    }
  }
  if (failures) {
    console.log(`\n❌ ${failures} failing`);
    process.exit(1);
  }
  console.log("\n✅ PROJECT NUMBER GEÇTİ");
})();

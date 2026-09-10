// The checklist callable, held to the two things that decide whether it can be
// shown at all: it must be cheap enough to load on a dashboard, and it must
// never ask somebody to do a thing they have already done.
//
// The second is the same failure the messaging rules exist to prevent, in
// checklist form — and the way it would arrive here is subtler: a query that
// needs a composite index nobody deployed fails to "no imported orders", and
// the card then tells a workspace with two hundred Etsy sales to import its
// first order.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
const start = source.indexOf("exports.getSetupChecklist = onCall(");
const body = start > 0 ? source.slice(start, source.indexOf("\n});", start)) : "";

check("the callable exists", () => {
  assert.ok(start > 0, "getSetupChecklist is gone");
});

check("any member may see their own workspace's progress", () => {
  // Not owner-only: this is the workspace's own setup, and hiding it from
  // everyone but the owner hides it from the people doing the work.
  assert.ok(body.includes("requireWorkspaceForBilling(request, false)"), "the checklist is gated on being the owner");
});

check("it reads one document per question, not the whole workspace", () => {
  // A dashboard card that read hundreds of documents on every load is a card
  // nobody could afford to show. Every probe is limit(1) — except the first
  // order, which since v2.1 is a bounded page of the newest fifty handed to the
  // SUBSTANTIVE_ORDER predicate (docs/onboarding/substantive-order-wiring.md
  // §3.2): "an order exists" is not "the first project was created". Fifty,
  // twice — the ordered read and its unordered fallback — and nothing else.
  const limits = body.match(/\.limit\((\d+)\)/g) || [];
  assert.ok(limits.length >= 7, `only ${limits.length} bounded reads`);
  const ones = limits.filter((limit) => limit === ".limit(1)");
  const fifties = limits.filter((limit) => limit === ".limit(50)");
  assert.ok(ones.length >= 6, `only ${ones.length} single-document probes`);
  assert.strictEqual(fifties.length, 2, "the first-order read is one bounded query plus its fallback, no more");
  assert.strictEqual(ones.length + fifties.length, limits.length, `a probe reads an unexpected page size: ${limits.join(" ")}`);
  assert.ok(body.includes("firstOrderProgress(recentOrders.docs"), "the bounded page is not handed to the predicate");
  assert.ok(body.includes('mark("order_created", firstOrder.state === "substantive")'), "an order that merely exists still ticks the first-project step");
  assert.ok(!body.includes('mark("order_created", !anyOrder.empty)'), "the old existence probe is still what ticks the step");
});

check("no query here needs an index nobody has deployed", () => {
  // The rule that matters: a missing composite index fails as "nothing found",
  // and "nothing found" here means telling somebody to do what they have done.
  // Only equality on companyId (auto-indexed) and single-field inequalities.
  assert.ok(!body.includes('"commerce.provider"'), "a composite index on companyId + commerce.provider");
  assert.ok(body.includes('collection("externalEntities")'), "the imported-order proof is not the commerce identity");
  // Two equality filters on the same query would need one too.
  const doubleEquality = /\.where\([^)]*"=="[^)]*\)\s*\n?\s*\.where\([^)]*"=="/.test(body);
  assert.ok(!doubleEquality, "two equality filters on one query need a composite index");
  // The one ordered query (companyId == … orderBy paymentDate) does need a
  // composite index, so it is declared, and it falls back to the unordered read
  // rather than failing as "no orders" while the index is missing or building.
  const ordered = body.match(/\.orderBy\("([A-Za-z]+)", "desc"\)\.limit\(50\)\.get\(\)\s*\n?\s*\.catch\(\(\) => db\.collection\("siparisler"\)\.where\("companyId", "==", companyId\)\.limit\(50\)\.get\(\)\)/);
  assert.ok(ordered, "the ordered first-order read has no unordered fallback");
  assert.strictEqual(ordered[1], "paymentDate", "ordering by a field most orders lack drops them (createdAt is on 65 of 450 sampled orders)");
  const indexes = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "..", "firestore.indexes.json"), "utf8"));
  const declared = (indexes.indexes || []).some((index) => index.collectionGroup === "siparisler" &&
    JSON.stringify(index.fields) === JSON.stringify([{ fieldPath: "companyId", order: "ASCENDING" }, { fieldPath: "paymentDate", order: "DESCENDING" }]));
  assert.ok(declared, "the composite index siparisler(companyId ASC, paymentDate DESC) is not declared in firestore.indexes.json");
});

check("a probe that fails answers 'not done' rather than throwing the card away", () => {
  // A workspace with no inventory subcollection must still see its checklist.
  const catches = (body.match(/\.catch\(\(\) => \(\{ empty: true/g) || []).length;
  assert.ok(catches >= 3, `only ${catches} probes degrade gracefully`);
});

check("the rules come from the shared module, not a second copy", () => {
  assert.ok(body.includes('require("./lifecycle/checklist")'));
  assert.ok(body.includes("setupChecklist("));
  assert.ok(!/STEP_COPY|Connect your first sales channel/.test(body), "the copy was duplicated into the callable");
});

check("every event name it marks is one the registry declares", () => {
  const { describeEvent } = require("../../lifecycle/events");
  const marked = [...body.matchAll(/mark\("([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(marked.length >= 8, `only ${marked.length} events marked`);
  for (const name of marked) {
    assert.strictEqual(describeEvent(name).declared, true, `${name} is not a declared event, so it counts for nothing`);
  }
});

check("the checklist module really produces what the callable spreads", () => {
  const { setupChecklist } = require("../../lifecycle/checklist");
  const result = setupChecklist({ profile: { onboardingMainGoal: "connect_store" }, events: [] });
  for (const field of ["path", "complete", "steps", "doneCount", "headline"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(result, field), `${field} is missing`);
  }
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ SETUP CHECKLIST WIRING GEÇTİ");
})();

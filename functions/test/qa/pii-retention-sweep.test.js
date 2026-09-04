// The part of retention that walks, as opposed to the part that decides.
//
// privacy/retention.js decides about one order and is tested next door. This
// file is about the sweep: which orders it looks at, how it stops looking at
// the same ones forever, and what it must never step over.
//
// The cursor is the whole risk. Move it too eagerly and an order that was not
// yet due is skipped and never revisited — buyer details kept past the deadline,
// silently, with a job that reports success every night.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const retention = require("../../privacy/retention");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const root = path.join(__dirname, "..", "..");
const source = fs.readFileSync(path.join(root, "index.js"), "utf8");
const sweepStart = source.indexOf("async function sweepRetentionPeriod(");
const sweep = sweepStart > 0
  ? source.slice(sweepStart, source.indexOf("exports.sweepMarketplacePii", sweepStart))
  : "";

const DAY = 24 * 60 * 60 * 1000;
const final = { scrub: true, reason: "amazon_dpp" };
const notDue = { scrub: false, reason: "not_due" };
const noRule = { scrub: false, reason: "no_retention_rule" };
const done = { scrub: false, reason: "already_scrubbed" };

// ---- the cursor ---------------------------------------------------------------

check("the cursor moves past orders the sweep has finished with", () => {
  const after = retention.cursorAfterSweep(0, [
    { deliveredAtMs: 100, decision: final },
    { deliveredAtMs: 200, decision: noRule },
    { deliveredAtMs: 300, decision: done }
  ]);
  assert.strictEqual(after, 300);
});

check("an order that is not yet due holds the cursor where it is", () => {
  // The one that matters. Stepping over this order means never looking at it
  // again, which means keeping a buyer's details past the deadline while the
  // job reports success.
  const after = retention.cursorAfterSweep(50, [
    { deliveredAtMs: 100, decision: final },
    { deliveredAtMs: 200, decision: notDue },
    { deliveredAtMs: 300, decision: final }
  ]);
  assert.strictEqual(after, 100, "the sweep skipped an order it had not finished with");
});

check("the cursor never goes backwards", () => {
  assert.strictEqual(retention.cursorAfterSweep(500, []), 500);
  assert.strictEqual(retention.cursorAfterSweep(500, [{ deliveredAtMs: 100, decision: final }]), 500);
  assert.strictEqual(retention.cursorAfterSweep(0, [{ deliveredAtMs: 0, decision: final }]), 0);
});

check("three answers count as finished, and only those three", () => {
  assert.strictEqual(retention.decisionIsFinal({ scrub: true, reason: "amazon_dpp" }), true);
  assert.strictEqual(retention.decisionIsFinal({ scrub: false, reason: "already_scrubbed" }), true);
  assert.strictEqual(retention.decisionIsFinal({ scrub: false, reason: "no_retention_rule" }), true);
  assert.strictEqual(retention.decisionIsFinal({ scrub: false, reason: "other_retention_period" }), true);
  // These change with time or with the order, so treating them as finished
  // would be treating "come back later" as "nothing to do here, ever".
  for (const reason of ["not_due", "not_delivered", "no_delivery_date", "no_clock"]) {
    assert.strictEqual(retention.decisionIsFinal({ scrub: false, reason }), false, `${reason} was treated as final`);
  }
  assert.strictEqual(retention.decisionIsFinal(null), false);
});

check("a real Amazon order walks the whole way through", () => {
  const delivered = 1_700_000_000_000;
  const order = {
    commerce: { provider: "amazon", externalId: "203-1" },
    isDelivered: true, deliveredAtMs: delivered,
    customerName: "Ada Lovelace", emailAddress: "ada@example.com",
    shippingStreetAddress: "10 Analytical Way", orderValue: 120
  };
  const early = retention.scrubPatch(order, delivered + 29 * DAY);
  assert.strictEqual(early.decision.scrub, false);
  assert.strictEqual(retention.cursorAfterSweep(0, [{ deliveredAtMs: delivered, decision: early.decision }]), 0,
    "an order still inside its thirty days advanced the cursor past itself");

  const late = retention.scrubPatch(order, delivered + 31 * DAY);
  assert.strictEqual(late.decision.scrub, true);
  assert.strictEqual(late.patch.customerName, "Buyer details removed");
  assert.strictEqual(late.patch.emailAddress, "");
  assert.strictEqual(late.patch.orderValue, undefined, "the sale went with the person");
  assert.strictEqual(retention.cursorAfterSweep(0, [{ deliveredAtMs: delivered, decision: late.decision }]), delivered);
});

// ---- how it walks -------------------------------------------------------------

check("the sweep exists and is scheduled", () => {
  assert.ok(sweep, "sweepCompanyMarketplacePii is gone");
  assert.ok(/exports\.sweepMarketplacePii = onSchedule\(/.test(source), "nothing runs the sweep");
  assert.ok(/schedule: "every 24 hours"/.test(source.slice(source.indexOf("exports.sweepMarketplacePii"))),
    "the sweep is no longer daily");
});

check("it reads the collection orders are actually in", () => {
  // This is the check that was missing, and its absence let a sweep ship that
  // read `companies/{id}/siparisler` — a path that sounds right and holds
  // nothing. It scanned zero documents and reported success every night.
  //
  // Asserting a literal here would only pin whatever literal was typed. The
  // engine owns the collection name; the sweep must take it from there.
  const { ORDER_COLLECTION } = require("../../commerce/engine");
  assert.strictEqual(ORDER_COLLECTION, "siparisler");
  assert.ok(/require\("\.\/commerce\/engine"\)/.test(sweep),
    "the sweep names its own collection instead of taking it from the engine");
  assert.ok(/db\.collection\(ORDER_COLLECTION\)/.test(sweep),
    "the sweep queries something other than the order collection");
  assert.ok(!/\.doc\(companyId\)\.collection\(/.test(sweep),
    "the sweep is reading a subcollection of a company; orders are top-level documents with a companyId field");
  // And the order document really is top-level, in the rules and in the reader
  // every other function uses.
  const rules = fs.readFileSync(path.join(root, "..", "firestore.rules"), "utf8");
  assert.ok(/\n\s*match \/siparisler\/\{orderId\} \{/.test(rules),
    "orders are no longer a top-level collection — re-check what the sweep should query");
  assert.ok(/collection\("siparisler"\)\.doc\(orderId\)/.test(source),
    "orderDocRef no longer reads the top-level collection");
});

check("it does not need an index somebody has to remember to deploy", () => {
  // A collection-group query needs its own composite index, and so does a range
  // on one field ordered by another. An index that has not been deployed does
  // not fail — it returns nothing, which for this job is indistinguishable from
  // having no work to do.
  assert.ok(!/collectionGroup\(/.test(sweep),
    "the sweep uses a collection-group query, which fails as 'nothing found' when its index is missing");
  const ranged = [...sweep.matchAll(/\.where\("([^"]+)",\s*"(>|>=|<|<=)"/g)].map((m) => m[1]);
  const ordered = [...sweep.matchAll(/\.orderBy\("([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ranged.length > 0, "the sweep has no range filter");
  const fields = new Set([...ranged, ...ordered]);
  assert.strictEqual(fields.size, 1,
    `range and order must be the same single field to use the automatic index; found ${[...fields].join(", ")}`);
  // Equality filters count too: companyId == x with a range on deliveredAtMs is
  // a composite index, which is the trap this check exists for.
  assert.ok(!/\.where\("[^"]+",\s*"=="/.test(sweep),
    "an equality filter alongside the range makes this a composite-index query");
});

check("one pass per retention period, so a longer rule cannot stall a shorter one", () => {
  // A single pass bounded by the shortest period meets orders belonging to
  // longer ones, and an order that is not yet due holds the cursor — one
  // sixty-day order stalling deletion for everybody behind it.
  assert.ok(/retentionPeriodsInDays\(\)/.test(source), "the sweep no longer enumerates the retention periods");
  assert.ok(/sweepRetentionPeriod\(days, nowMs\)/.test(source), "the sweep no longer runs a pass per period");
  assert.deepStrictEqual(retention.retentionPeriodsInDays(), [30],
    "the retention table changed; check the passes still make sense");
  assert.deepStrictEqual(retention.retentionPeriodsInDays({ ebay: { days: 60, reason: "x" } }), [30, 60],
    "a second period does not produce a second pass");
  // An order belonging to another period must not hold this pass's cursor.
  const amazon = { commerce: { provider: "amazon" }, isDelivered: true, deliveredAtMs: 1000, customerName: "A" };
  const inWrongPass = retention.sweepDecision(amazon, 1000 + 90 * 24 * 60 * 60 * 1000, 60);
  assert.strictEqual(inWrongPass.reason, "other_retention_period");
  assert.strictEqual(retention.decisionIsFinal(inWrongPass), true,
    "an order belonging to another period holds this pass's cursor forever");
  const inRightPass = retention.sweepDecision(amazon, 1000 + 90 * 24 * 60 * 60 * 1000, 30);
  assert.strictEqual(inRightPass.scrub, true, "the pass that owns the order does not scrub it");
});

check("it reads only what could be due, and in delivery order", () => {
  assert.ok(/\.where\("deliveredAtMs", ">", cursor\)/.test(sweep), "the cursor is not applied to the query");
  assert.ok(/\.where\("deliveredAtMs", "<=", cutoffMs\)/.test(sweep), "the sweep reads orders that cannot be due yet");
  assert.ok(/\.orderBy\("deliveredAtMs", "asc"\)/.test(sweep),
    "unordered, the cursor would move past orders the sweep never saw");
  assert.ok(/\.limit\(RETENTION_SWEEP_ORDER_LIMIT\)/.test(sweep), "the page is unbounded");
});

check("the cursor it writes is the one the pure rule produced", () => {
  assert.ok(/retention\.cursorAfterSweep\(cursor, considered\)/.test(sweep),
    "the sweep decides the cursor itself again, where no test can reach the decision");
  assert.ok(/if \(nextCursor > cursor\)/.test(sweep), "the cursor can be written backwards");
  // Each period keeps its own place. One shared cursor would let the thirty-day
  // pass step the sixty-day pass over its own work.
  assert.ok(/retention-\$\{days\}d/.test(source), "the passes share one cursor");
});

check("a failing order holds the cursor rather than being skipped", () => {
  // Counting a failed order as finished would step the cursor past it, and it
  // would never be looked at again — a deletion silently dropped.
  assert.ok(/decision = \{ scrub: false, reason: "not_due" \}/.test(sweep),
    "an order that threw is still treated as finished with");
  assert.strictEqual(retention.decisionIsFinal({ scrub: false, reason: "not_due" }), false);
});

check("one period's failure does not end the sweep", () => {
  // Bounded to this function's own body. Sliced to the end of the file, the
  // next unrelated try/catch in index.js would satisfy the check and the sweep
  // could throw on the first bad workspace unnoticed.
  const from = source.indexOf("exports.sweepMarketplacePii");
  assert.ok(from > 0, "the scheduled sweep is gone");
  const scheduled = source.slice(from, source.indexOf("\n);", from));
  assert.ok(/catch \(error\) \{[\s\S]{0,400}failed \+= 1;/.test(scheduled),
    "a single period throwing now stops every period after it");
  assert.ok(/sweepRetentionPeriod\(days, nowMs\)/.test(scheduled),
    "the per-period pass is no longer what is being guarded");
});

check("an erasure is written down", () => {
  assert.ok(/action: "erased"/.test(sweep), "buyer details are deleted with no record that it happened");
  assert.ok(/categories: \["name", "email", "phone", "address"\]/.test(sweep),
    "the erasure record does not say what categories were removed");
  // The log records categories and ids. If it recorded the values it would be a
  // second copy of exactly what was just deleted.
  assert.ok(!/customerName|emailAddress|shippingStreetAddress/.test(sweep.slice(sweep.indexOf('action: "erased"'))),
    "the erasure record carries the data it is recording the erasure of");
  const accessLog = fs.readFileSync(path.join(root, "privacy", "accessLog.js"), "utf8");
  assert.ok(/"erased"/.test(accessLog), "the access log does not accept an erasure");
  const { accessEntry, worthLogging } = require("../../privacy/accessLog");
  const entry = accessEntry({ companyId: "c1", atMs: 1, action: "erased", source: "server", categories: [] });
  assert.strictEqual(entry.action, "erased", "an erasure is recorded as something else");
  assert.strictEqual(worthLogging(entry), true,
    "an erasure with nothing left to remove is not recorded, so 'we looked and there was nothing' cannot be shown");
});

check("the cursor is unreachable from any client", () => {
  // Anybody who could push the cursor forward would stop buyer details ever
  // being deleted — quietly, with the job still reporting success. The cursor
  // is top-level rather than per-workspace, because the sweep is nobody's own
  // job; a top-level collection is denied by the catch-all, and named here as
  // well so a rule written later cannot widen it by accident.
  const rules = fs.readFileSync(path.join(root, "..", "firestore.rules"), "utf8");
  const at = rules.indexOf("match /privacyState/{document=**}");
  assert.ok(at > 0, "privacyState has no rule of its own");
  assert.ok(/allow read, write: if false;/.test(rules.slice(at, at + 200)),
    "a client can reach the sweep's cursor");
  assert.ok(!/collectionId != 'privacyState'/.test(rules),
    "privacyState is still listed in the company wildcard deny-list, where it no longer lives");
  assert.ok(/match \/\{document=\*\*\} \{\s*\n\s*allow read, write: if false;/.test(rules),
    "the catch-all that denies everything unmatched is gone");
});

for (const { name, run } of checks) {
  try { run(); console.log(`PASS  ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
}
if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
console.log("\n✅ PII RETENTION SWEEP GEÇTİ");

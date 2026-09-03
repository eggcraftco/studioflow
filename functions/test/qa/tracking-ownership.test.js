// Two things about tracking numbers that were quietly wrong.
//
// 1. The table a courier webhook reads to find its way back to an order is
//    global and keyed by the tracking number alone — no workspace in the key —
//    and the write was unconditional. Whoever registered a number LAST owned
//    the routing, so a workspace that knew a number could point it at itself
//    and the real owner's order stopped updating.
//
// 2. The hourly refresh read the same first eighty rows every time. Once the
//    platform held more than eighty, the rest were never refreshed again — and
//    the job reported success either way, so nothing would ever have shown it.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

function block(marker, endMarker) {
  const at = SOURCE.indexOf(marker);
  assert.ok(at > 0, `${marker} is where it was`);
  const end = SOURCE.indexOf(endMarker, at + marker.length);
  return SOURCE.slice(at, end > 0 ? end : at + 4000);
}

const api = require("../../index");
const decide = api._trackingClaimDecision;
const nextCursor = api._nextSweepCursor;

/** A Firestore snapshot, as the transaction hands one back. */
const order = (fields) => (fields === null ? { exists: false, data: () => ({}) } : { exists: true, data: () => fields });

// ---- who owns a tracking number --------------------------------------------
check("an unclaimed number is claimed", () => {
  assert.strictEqual(decide({ held: null, companyId: "acme", trackingNumber: "AB123" }).claim, true);
});

check("the workspace that already holds it may re-register it", () => {
  const held = { companyId: "acme", orderId: "o1", trackingNumber: "AB123" };
  assert.strictEqual(decide({ held, companyId: "acme", trackingNumber: "AB123" }).claim, true);
});

check("another workspace CANNOT take it while the holder is still using it", () => {
  // The attack: read a number off a parcel, register it against your own order,
  // and from then on the real owner's order stops updating while the shipment
  // shows up in yours.
  const held = { companyId: "acme", orderId: "o1", trackingNumber: "AB123" };
  const verdict = decide({
    held, companyId: "rival", trackingNumber: "AB123",
    previousOrder: order({ trackingNumber: "AB123" })
  });
  assert.strictEqual(verdict.claim, false);
  assert.strictEqual(verdict.reason, "in_use");
  assert.strictEqual(verdict.heldBy, "acme");
});

check("a whitespace-different spelling is still the same number", () => {
  const held = { companyId: "acme", orderId: "o1", trackingNumber: "AB123" };
  assert.strictEqual(decide({
    held, companyId: "rival", trackingNumber: " AB123 ",
    previousOrder: order({ trackingNumber: "AB 123" })
  }).claim, false);
});

check("but it moves once the holder has let it go", () => {
  // Orders are deleted and re-entered, businesses move workspace, couriers
  // reuse numbers a year later. A permanent claim would be its own bug.
  const held = { companyId: "acme", orderId: "o1", trackingNumber: "AB123" };
  const cases = [
    ["the holder's order no longer exists", order(null), "holder_order_gone"],
    ["the holder's order is in the bin", order({ trackingNumber: "AB123", isDeleted: true }), "holder_order_binned"],
    ["the holder put a different number on it", order({ trackingNumber: "ZZ999" }), "holder_moved_on"],
  ];
  for (const [why, previousOrder, reason] of cases) {
    const verdict = decide({ held, companyId: "rival", trackingNumber: "AB123", previousOrder });
    assert.strictEqual(verdict.claim, true, why);
    assert.strictEqual(verdict.reason, reason, why);
  }
});

check("a holder row with no workspace on it does not block anybody", () => {
  for (const held of [{}, { companyId: "" }, { companyId: "   " }]) {
    assert.strictEqual(decide({ held, companyId: "acme", trackingNumber: "AB123" }).claim, true, JSON.stringify(held));
  }
});

// ---- where the sweep resumes -----------------------------------------------
check("a full page hands the next run its last id", () => {
  const ids = Array.from({ length: 80 }, (_, i) => `doc-${i}`);
  assert.strictEqual(nextCursor(ids, 80), "doc-79");
});

check("a short page means the end, so the next run starts over", () => {
  assert.strictEqual(nextCursor(["a", "b"], 80), "");
  assert.strictEqual(nextCursor([], 80), "");
});

check("a full page of already-delivered parcels still advances the cursor", () => {
  // The original bug in a new costume: if the cursor only moved when something
  // was refreshed, a page of delivered rows would pin it in place forever.
  const ids = Array.from({ length: 80 }, (_, i) => `delivered-${i}`);
  assert.strictEqual(nextCursor(ids, 80), "delivered-79");
});

// ---- the routing row -------------------------------------------------------
check("the claim reads what is there before it writes", () => {
  const body = block("async function claimTrackingLookup(", "\nfunction lookupDocRef(");
  const read = body.indexOf("await transaction.get(ref)");
  const write = body.indexOf("transaction.set(ref");
  assert.ok(read > 0, "the existing row is read");
  assert.ok(write > 0, "the row is written");
  assert.ok(read < write, "it must read before it writes");
});

check("it is a transaction, because two registrations can race", () => {
  const body = block("async function claimTrackingLookup(", "\nfunction lookupDocRef(");
  assert.ok(/runTransaction\(/.test(body), "without one, two racing claims both read 'free'");
});

check("the transaction actually consults the decision", () => {
  const body = block("async function claimTrackingLookup(", "\n/**");
  assert.ok(/trackingClaimDecision\(/.test(body), "the shared decision is used, not a second copy");
  assert.ok(/if \(!decision\.claim\)/.test(body), "and its answer is acted on");
});

check("nothing writes the routing row behind the claim's back", () => {
  // The whole guard is worthless if some other line still calls .set() on it.
  const writes = SOURCE.match(/lookupDocRef\([^)]*\)\.set\(/g) || [];
  assert.deepStrictEqual(writes, [], `something still writes the lookup row directly: ${writes.join(", ")}`);
});

// ---- the hourly sweep ------------------------------------------------------
check("the sweep pages, so it does not read the same eighty rows forever", () => {
  const body = block("exports.scheduledTrackingRefresh = onSchedule(", "\nexports.");
  assert.ok(/orderBy\(admin\.firestore\.FieldPath\.documentId\(\)\)/.test(body), "it is ordered");
  assert.ok(/startAfter\(startAfterId\)/.test(body), "it resumes where it stopped");
  assert.ok(/cursorRef\.set\(/.test(body), "it records where to resume");
});

check("it orders by document id, which needs no new index", () => {
  // Ordering by lastCheckedAt would want a collection-group composite index,
  // and index deploys on this branch are done by hand and deliberately rare.
  const body = block("exports.scheduledTrackingRefresh = onSchedule(", "\nexports.");
  assert.ok(!/orderBy\("lastCheckedAt"/.test(body));
});

check("running off the end wraps rather than idling forever", () => {
  const body = block("exports.scheduledTrackingRefresh = onSchedule(", "\nexports.");
  assert.ok(/snap\.empty && startAfterId/.test(body), "an empty page past the end restarts");
  assert.ok(/cursorDocId: nextSweepCursor\(/.test(body), "the cursor goes through the shared rule");
});

check("the cursor moves even when nothing needed refreshing", () => {
  // Delivered parcels are skipped in memory. If the cursor only advanced on a
  // refresh, a page of delivered rows would pin it in place — the same bug in
  // a new costume.
  const body = block("exports.scheduledTrackingRefresh = onSchedule(", "\nexports.");
  const skip = body.indexOf('statusText.includes("delivered")');
  const cursorWrite = body.indexOf("await cursorRef.set(");
  assert.ok(skip > 0 && cursorWrite > 0);
  assert.ok(cursorWrite > skip, "the cursor is written after the loop, not inside it");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ TRACKING OWNERSHIP GEÇTİ");
})();

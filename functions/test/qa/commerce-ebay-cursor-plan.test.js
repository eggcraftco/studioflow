// How an eBay pass carves time (design §7.1, §7.6). eBay's page order is
// unspecified, so a window that does not fit the page budget is bisected and
// the watermark may only stand at the end of a sub-window read to its end —
// never at `now`, never past an unread order.
const assert = require("assert");
const plan = require("../../commerce/ebay/cursorPlan");
const cursors = require("../../commerce/cursors");
let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name)).catch((error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); }); }

const HOUR = 60 * 60 * 1000; const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 8, 6, 12, 0, 0);

(async () => {
  await check("a window that truncates is halved; the earlier half is read first; completed halves come back in time order", async () => {
    const reads = [];
    // Anything wider than 6 hours does not fit; anything narrower does.
    const result = await plan.walkWindow({ fromMs: T0 - DAY, toMs: T0 }, async (sub) => { reads.push(sub); return sub.toMs - sub.fromMs > 6 * HOUR ? { complete: false, truncated: true } : { complete: true }; });
    assert.strictEqual(result.truncatedAt, null, "everything eventually fit");
    assert.ok(result.bisections >= 2);
    for (let i = 1; i < result.completed.length; i += 1) assert.ok(result.completed[i].fromMs >= result.completed[i - 1].fromMs, "completed sub-windows are in time order");
    assert.strictEqual(result.completed[0].fromMs, T0 - DAY, "contiguous from the start");
    assert.strictEqual(result.completed[result.completed.length - 1].toMs, T0, "and reaching now, because everything completed");
    assert.ok(reads[1].fromMs === T0 - DAY && reads[1].toMs === T0 - DAY / 2, "the earlier half is read before the later half");
  });

  await check("the later half re-reads the overlap so nothing falls between two sub-windows", () => {
    const [earlier, later] = plan.splitWindow({ fromMs: 0, toMs: 100 }, 10);
    assert.deepStrictEqual(earlier, { fromMs: 0, toMs: 50 });
    assert.deepStrictEqual(later, { fromMs: 40, toMs: 100 });
  });

  await check("MAX_BISECTIONS is respected and the pass ends truncated at the first sub-window that did not fit", async () => {
    const result = await plan.walkWindow({ fromMs: T0 - DAY, toMs: T0 }, async () => ({ complete: false, truncated: true }), { maxBisections: 3 });
    assert.ok(result.truncatedAt, "never fit");
    assert.strictEqual(result.truncatedAt.reason, "budget");
    assert.deepStrictEqual(result.completed, [], "nothing completed, so the watermark must not move at all");
    assert.strictEqual(result.bisections, 3);
    assert.strictEqual(result.truncatedAt.fromMs, T0 - DAY, "the first unread sub-window is at the very start");
  });

  await check("a sub-window that FAILS (an order threw) is not bisected and stops the walk; later sub-windows are not read", async () => {
    const reads = [];
    const result = await plan.walkWindow({ fromMs: 0, toMs: 100 }, async (sub) => { reads.push(sub); if (sub.toMs - sub.fromMs > 60) return { complete: false, truncated: true }; return sub.fromMs === 0 ? { complete: false, truncated: false } : { complete: true }; }, { overlapMs: 5 });
    assert.strictEqual(result.truncatedAt.reason, "failed");
    assert.deepStrictEqual(result.completed, []);
    assert.strictEqual(reads.length, 2, "the whole window, then its earlier half; the later half is never read");
  });

  await check("the recorded watermark never exceeds the last completed sub-window", async () => {
    // First half completes, second half truncates forever.
    const result = await plan.walkWindow({ fromMs: 0, toMs: 1000 }, async (sub) => (sub.toMs <= 500 ? { complete: true } : { complete: false, truncated: true }), { maxBisections: 2, overlapMs: 0 });
    assert.ok(result.completed.length >= 1);
    const last = result.completed[result.completed.length - 1];
    assert.ok(last.toMs <= 1000 && last.toMs >= 500);
    assert.ok(result.truncatedAt.fromMs >= last.toMs - 1, "the unread part starts where the read part ended");
    assert.ok(last.toMs < 1000, "not now: something was left unread");
  });

  await check("a deadline ends the walk with the remaining sub-window reported, nothing skipped", async () => {
    let clock = 0;
    const result = await plan.walkWindow({ fromMs: 0, toMs: 1000 }, async (sub) => { clock += 100; return sub.toMs - sub.fromMs > 300 ? { complete: false, truncated: true } : { complete: true }; }, { deadlineMs: 250, now: () => clock, overlapMs: 0 });
    assert.ok(result.exhausted); assert.ok(result.truncatedAt);
  });

  await check("nightlyWindow is max(7 days ago, a day before the last full pass) .. now", () => {
    assert.deepStrictEqual(plan.nightlyWindow(T0, 0), { fromMs: T0 - 7 * DAY, toMs: T0, reason: "nightly_first" });
    assert.deepStrictEqual(plan.nightlyWindow(T0, T0 - DAY), { fromMs: T0 - 2 * DAY, toMs: T0, reason: "nightly" });
    assert.deepStrictEqual(plan.nightlyWindow(T0, T0 - 30 * DAY), { fromMs: T0 - 7 * DAY, toMs: T0, reason: "nightly" });
  });

  await check("catchUpWindow: no catch-up owed → the common cursor's window (24 h cap, overlap); owed → from catchUpDueFromMs regardless of the cap, in day slices", () => {
    const cursor = { watermarkMs: T0 - 2 * HOUR };
    const normal = plan.catchUpWindow(cursor, { catchUpDueFromMs: 0 }, T0);
    assert.strictEqual(normal.catchUp, false);
    assert.deepStrictEqual({ fromMs: normal.fromMs, toMs: normal.toMs }, { fromMs: cursors.cursorWindow(cursor, T0).fromMs, toMs: T0 });
    assert.strictEqual(normal.slices.length, 1);
    const owed = plan.catchUpWindow(cursor, { catchUpDueFromMs: T0 - 36 * HOUR }, T0);
    assert.strictEqual(owed.catchUp, true);
    assert.strictEqual(owed.fromMs, T0 - 36 * HOUR - cursors.DEFAULT_OVERLAP_MS, "starts at the catch-up point minus the overlap, not at now − 24 h");
    assert.strictEqual(owed.slices.length, 2, "36 hours in day-long slices");
    assert.strictEqual(owed.slices[0].fromMs, owed.fromMs);
    assert.strictEqual(owed.slices[owed.slices.length - 1].toMs, T0);
    assert.ok(owed.slices[1].fromMs < owed.slices[0].toMs, "the second slice overlaps the first");
    const first = plan.catchUpWindow(null, {}, T0);
    assert.strictEqual(first.reason, "first_pass"); assert.strictEqual(first.fromMs, T0 - DAY);
    const forced = plan.catchUpWindow(cursor, {}, T0, { force: true, lookbackMs: DAY });
    assert.strictEqual(forced.reason, "forced"); assert.strictEqual(forced.fromMs, T0 - DAY);
  });

  await check("sliceWindow cuts oldest first with an overlap and never emits an empty slice", () => {
    const slices = plan.sliceWindow({ fromMs: 0, toMs: 2.5 * DAY }, DAY, HOUR);
    assert.strictEqual(slices.length, 3);
    assert.deepStrictEqual(slices[0], { fromMs: 0, toMs: DAY });
    assert.deepStrictEqual(slices[1], { fromMs: DAY - HOUR, toMs: 2 * DAY });
    assert.deepStrictEqual(slices[2], { fromMs: 2 * DAY - HOUR, toMs: 2.5 * DAY });
    assert.deepStrictEqual(plan.sliceWindow({ fromMs: 10, toMs: 10 }), [{ fromMs: 10, toMs: 10 }]);
  });

  if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
  console.log("\n✅ COMMERCE EBAY CURSOR PLAN GEÇTİ");
})();

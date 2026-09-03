// A bank feed that has been broken for three weeks says so once.
//
// The alert fired only when the sync STATE changed, so a connection stuck in
// the same error mentioned it on the first day and then went quiet. That is the
// worst shape for this particular failure: a silent bank feed looks exactly
// like a quiet month — the money stops arriving and the books look thinner
// rather than broken.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const BANK = fs.readFileSync(path.join(__dirname, "..", "..", "bankFeed.js"), "utf8");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

const RECORD = (() => {
  const at = BANK.indexOf("async function recordSyncFailure(");
  assert.ok(at > 0);
  return BANK.slice(at, BANK.indexOf("\n  // Shared by the manual Refresh", at));
})();

check("a standing failure is repeated, not only announced once", () => {
  assert.ok(/dueAgain/.test(RECORD), "there is a repeat condition");
  assert.ok(/stateChanged \|\| dueAgain \|\| !lastAlertMs/.test(RECORD),
    "a change, a due reminder, or a connection never told");
});

check("but not on every eight-hourly run", () => {
  // Repeating each run would train the owner to dismiss it, which is the same
  // silence by another route.
  assert.ok(/REMIND_AFTER_MS = 14 \* 24 \* 60 \* 60 \* 1000/.test(RECORD));
  assert.ok(/Date\.now\(\) - lastAlertMs >= REMIND_AFTER_MS/.test(RECORD));
});

check("a healthy connection says nothing at all", () => {
  assert.ok(/nextState !== "ok" &&/.test(RECORD), "the whole branch is gated on it still being broken");
});

check("the clock starts only when the notice actually went out", () => {
  // Stamping before the send would begin the fortnight's silence on a
  // notification that never arrived — the workspace told nothing, twice.
  const notify = RECORD.indexOf("notifyCompany(companyId, {");
  const stamp = RECORD.indexOf("lastSyncAlertAtMs: Date.now()");
  assert.ok(notify > 0 && stamp > notify);
  assert.ok(/\.then\(\(\) => doc\.ref\.set\(\{ lastSyncAlertAtMs: Date\.now\(\) \}/.test(RECORD),
    "the stamp hangs off the send's success");
  const between = RECORD.slice(notify, stamp);
  assert.ok(!/catch/.test(between), "a failed send must not stamp");
});

check("recovery clears the clock, so the next break is immediate", () => {
  // Otherwise a connection that broke, recovered and broke again next month
  // would wait out the fortnight left over from the first time.
  const recovery = BANK.slice(BANK.indexOf('syncState: "ok",'), BANK.indexOf('syncState: "ok",') + 700);
  assert.ok(/lastSyncAlertAtMs: admin\.firestore\.FieldValue\.delete\(\)/.test(recovery));
});

check("the standing alert is still cleared when the feed recovers", () => {
  assert.ok(/clearNotification\(companyId, `bankSync_\$\{doc\.id\}`\)/.test(BANK));
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ BANK ALERT CADENCE GEÇTİ");
})();

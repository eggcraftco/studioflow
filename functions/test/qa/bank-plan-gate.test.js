// Banking is a Pro feature everywhere except on the server.
//
// The web page, the Mac and iPhone tab and the Android menu all hide it below
// Pro. All three are clients. Nothing on the server checked, so a Free or
// Starter owner could call bankCreateRequisition straight from a browser
// console, link a real bank account, and be polled every eight hours from then
// on — at NivaDesk's cost with TrueLayer, on a plan that does not include it.
//
// The other half is quieter: `bankFeedEnabled` on the company document means
// "this workspace has linked a bank", not "this workspace pays for one", so a
// workspace that downgraded kept being polled for ever.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const BANK = fs.readFileSync(path.join(ROOT, "bankFeed.js"), "utf8");
const INDEX = fs.readFileSync(path.join(ROOT, "index.js"), "utf8");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

function region(source, marker, length = 2000) {
  const at = source.indexOf(marker);
  assert.ok(at > 0, `${marker} is where it was`);
  return source.slice(at, at + length);
}

check("the plan table has a bank entitlement, and only the paid tiers get it", () => {
  // Read off the shipping table rather than restated here.
  const entitlements = require("../../index");
  assert.ok(typeof entitlements === "object");
  const table = region(INDEX, "const PLAN_ENTITLEMENTS", 12000);
  const demo = table.slice(table.indexOf('displayName: "Free"'), table.indexOf('displayName: "Free"') + 900);
  assert.ok(/bankFeedEnabled: false/.test(demo), "Free must not include the bank feed");
  assert.strictEqual((table.match(/bankFeedEnabled: true/g) || []).length, 2, "Pro and Team, and nothing else");
  assert.strictEqual((table.match(/bankFeedEnabled: false/g) || []).length, 2, "Free and Starter");
});

check("every bank callable passes one guard, and that guard checks the plan", () => {
  const guard = region(BANK, "async function requireOwner(request", 1800);
  assert.ok(/uidIsCompanyOwner\(companyData, uid\)/.test(guard), "ownership is still checked");
  assert.ok(/bankFeedEnabledForCompany\(companyData\) !== true/.test(guard), "and now the plan");
  assert.ok(/failed-precondition/.test(guard));
  // Twenty-nine callables, one guard. If a new one is written without it the
  // count below moves and this reads as a reminder rather than a mystery.
  assert.ok((BANK.match(/await requireOwner\(request/g) || []).length >= 25);
});

check("the gate is injected, not re-derived inside the bank module", () => {
  assert.ok(/bankFeedEnabledForCompany: \(companyData\) => billingEntitlementsForCompany\(companyData \|\| \{\}\)\.bankFeedEnabled === true/.test(INDEX),
    "one definition of the entitlement, in the billing table's own file");
  assert.ok(/createBankFeedFunctions\(\{ admin, onCall, onSchedule, HttpsError, uidIsCompanyOwner, bankFeedEnabledForCompany/.test(BANK));
});

check("a downgrade does not trap the workspace with a feed it cannot remove", () => {
  // The plan-downgrade rule: a smaller plan stops NEW work, it does not take
  // away what is already there. Disconnecting and reading back the history
  // must keep working, or the only way out is support.
  for (const name of ["bankDeleteConnection", "bankListAuditLog", "bankListPayouts"]) {
    const body = region(BANK, `const ${name} = onCall(`, 400);
    assert.ok(/requireOwner\(request, \{ requirePlan: false \}\)/.test(body), `${name} must not need the plan`);
  }
});

check("but connecting and spending still do", () => {
  for (const name of ["bankCreateRequisition", "bankFinalizeRequisition", "bankSyncTransactions", "paypalConnect"]) {
    const body = region(BANK, `const ${name} = onCall(`, 500);
    assert.ok(/await requireOwner\(request\)/.test(body), `${name} must go through the plan gate`);
    assert.ok(!/requirePlan: false/.test(body), `${name} is exempt and should not be`);
  }
});

check("the eight-hourly poll stops for a workspace that no longer pays", () => {
  const sweep = region(BANK, "const scheduledBankSync = onSchedule(", 2200);
  const gate = sweep.indexOf("bankFeedEnabledForCompany(companyDoc.data() || {}) !== true");
  const work = sweep.indexOf("syncCompanyConnections(companyDoc.id)");
  assert.ok(gate > 0, "the sweep checks the plan");
  assert.ok(work > gate, "before it spends a provider call");
  assert.ok(/continue;/.test(sweep.slice(gate, work)));
});

check("and says why, rather than showing a date that never moves", () => {
  const sweep = region(BANK, "const scheduledBankSync = onSchedule(", 2200);
  assert.ok(/bankFeedPausedReason: "plan"/.test(sweep));
  // And clears it again when the plan comes back, or the screen would keep
  // apologising after the workspace upgraded.
  assert.ok(/bankFeedPausedReason: admin\.firestore\.FieldValue\.delete\(\)/.test(sweep));
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ BANK PLAN GATE GEÇTİ");
})();

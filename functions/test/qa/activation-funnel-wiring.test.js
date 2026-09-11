// The funnel callable, held to the two things that make it safe and the one
// thing that makes it useful.
//
// It reads real business data across EVERY tenant, which is a shape this
// codebase has exactly one precedent for, so it must be gated the same way. And
// it must derive rather than read a stored funnel — a stored one would be empty
// for every workspace that signed up before tonight, which is all of them.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
const start = source.indexOf("exports.getActivationFunnel = onCall(");
const body = start > 0 ? source.slice(start, source.indexOf("\n});", start)) : "";

check("the callable exists and is registered", () => {
  assert.ok(start > 0, "getActivationFunnel is gone");
  assert.ok(body.includes('region: "europe-west2"'));
});

check("it is admin-only, on a verified address, exactly like the other cross-tenant read", () => {
  // The precedent is getCustomOrderLandingStats. Anything looser here hands
  // every workspace's order and customer counts to any signed-in user.
  assert.ok(body.includes("SUPPORT_ADMIN_EMAILS.has(email)"), "no admin list check");
  assert.ok(body.includes('request.auth.token?.email_verified !== true'), "an unverified address would pass");
  assert.ok(body.includes('throw new HttpsError("permission-denied"'), "no refusal");
  // And the check comes before any read.
  const guard = body.indexOf("permission-denied");
  const firstRead = body.indexOf("db.collection(");
  assert.ok(guard > 0 && firstRead > guard, "a workspace was read before the caller was checked");
});

check("it returns counts and states, never the documents it derived them from", () => {
  // A funnel that shipped customer names and order rows to an admin screen
  // would be a cross-tenant data export wearing a dashboard's clothes.
  for (const leak of ["customerName", "emailAddress", "paidAmount", "snapshot.orders,", "orders: snapshot.orders"]) {
    assert.ok(!body.includes(leak), `the response carries ${leak}`);
  }
  for (const field of ["orderCount", "customerCount", "riskScore", "state", "path"]) {
    assert.ok(body.includes(field), `${field} is missing from the response`);
  }
});

check("it derives rather than reading a stored funnel", () => {
  // Nothing has been recording lifecycle events. A stored funnel would report
  // every existing workspace as having done nothing at all.
  assert.ok(body.includes("deriveEvents("), "it is not deriving");
  assert.ok(!body.includes('collection("productEvents")'), "it reads a store that has never been written");
  assert.ok(body.includes("UNDERIVABLE_EVENTS"), "it does not say which events it could not derive");
});

check("a workspace's reads are bounded, so one large tenant cannot hang the call", () => {
  // Specifically the workspace list itself, not just "some limit somewhere":
  // the per-workspace reads were bounded while the outer scan was not, and a
  // check for any limit at all read that as safe.
  assert.ok(
    /collection\("companies"\)\.limit\(/.test(body),
    "the scan over every workspace is unbounded, whatever the inner reads do"
  );
  assert.ok(/\.limit\(\d+\)/.test(body), "an unbounded read inside a workspace");
  assert.ok(body.includes("Math.min(Math.max(Number(request.data?.limit)"), "the caller can ask for any number of workspaces");
  assert.ok(body.includes("timeoutSeconds"), "no timeout on a call that walks every workspace");
});

check("the three pure modules do the judging, not a second copy of the rules", () => {
  // The rules live in functions/lifecycle and are held by their own suites; a
  // copy here would drift and nothing would notice.
  assert.ok(body.includes('require("./lifecycle/derive")'));
  assert.ok(body.includes('require("./lifecycle/activation")'));
  assert.ok(body.includes('require("./lifecycle/risk")'));
  assert.ok(!/function .*activationProgress|const REQUIREMENTS/.test(body), "the rules were copied into the callable");
});

check("the modules it names really export what it calls", () => {
  const derive = require("../../lifecycle/derive");
  const activation = require("../../lifecycle/activation");
  const risk = require("../../lifecycle/risk");
  for (const [name, fn] of [
    ["derive.deriveEvents", derive.deriveEvents], ["derive.firstTime", derive.firstTime],
    ["activation.activationPathFor", activation.activationPathFor],
    ["activation.lifecycleState", activation.lifecycleState],
    ["activation.meaningfulEvents", activation.meaningfulEvents],
    ["risk.riskScore", risk.riskScore]
  ]) {
    assert.strictEqual(typeof fn, "function", `${name} is not a function`);
  }
  assert.ok(Array.isArray(derive.UNDERIVABLE_EVENTS));
});


check("its snapshot carries the five store connections derive.js derives integration_connected from, beside bank, accounting and inventory", () => {
  const body = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
  const block = body.slice(body.indexOf("exports.getActivationFunnel"), body.indexOf("exports.getActivationFunnel") + 6000);
  for (const read of [
    'db.collection("shopifyStores").where("companyId", "==", companyId).limit(20).get()',
    'db.collection("etsyConnections").where("companyId", "==", companyId).limit(20).get()',
    'db.collection("wooConnections").where("companyId", "==", companyId).limit(20).get()',
    'db.collection("squareConnections").where("companyId", "==", companyId).limit(20).get()',
    'db.collection("ebayConnections").where("companyId", "==", companyId).limit(20).get()'
  ]) assert.ok(block.includes(read), "missing read: " + read);
  for (const key of ["shopifyStores:", "etsyConnections:", "wooConnections:", "squareConnections:", "ebayConnections:", "bankConnections:", "accountingConnections:", "inventoryItems:"]) assert.ok(block.includes(key), "snapshot key not passed: " + key);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ ACTIVATION FUNNEL WIRING GEÇTİ");
})();

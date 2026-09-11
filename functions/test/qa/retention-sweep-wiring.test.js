// The retention sweep's wiring in index.js, pinned by text the way the other wiring tests
// are: the trigger snapshot must be the funnel's (plus the five store connections derive.js
// knows), the sweep must gate on the pilot/exclude lists and our own people, must hold the
// in-app nudge while a feedback prompt is recent, and the callable must accept "acted".
const assert = require("assert");
const fs = require("fs");
const path = require("path");
let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name)).catch((error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }); }
const index = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
const block = index.slice(index.indexOf("async function nvRetentionTriggerFor("), index.indexOf("exports.dismissRetentionMessage"));
(async () => {
  await check("the trigger reads the funnel's snapshot plus every store connection derive.js derives integration_connected from", () => {
    for (const read of [
      'db.collection("companies").doc(companyId).collection("bankConnections").limit(20).get()',
      'db.collection("companies").doc(companyId).collection("accountingConnections").limit(20).get()',
      'db.collection("companies").doc(companyId).collection("inventoryItems").limit(400).get()',
      'db.collection("shopifyStores").where("companyId", "==", companyId).limit(20).get()',
      'db.collection("etsyConnections").where("companyId", "==", companyId).limit(20).get()',
      'db.collection("wooConnections").where("companyId", "==", companyId).limit(20).get()',
      'db.collection("squareConnections").where("companyId", "==", companyId).limit(20).get()',
      'db.collection("ebayConnections").where("companyId", "==", companyId).limit(20).get()'
    ]) assert.ok(block.includes(read), "missing read: " + read);
    for (const key of ["bankConnections: rows(banks)", "accountingConnections: rows(accounting)", "inventoryItems: rows(inventory)", "shopifyStores: rows(shopify)", "etsyConnections: rows(etsy)", "wooConnections: rows(woo)", "squareConnections: rows(square)", "ebayConnections: rows(ebay)"]) assert.ok(block.includes(key), "snapshot key not passed to deriveEvents: " + key);
    const derive = fs.readFileSync(path.join(__dirname, "..", "..", "lifecycle", "derive.js"), "utf8");
    for (const key of ["shopifyStores", "etsyConnections", "wooConnections", "squareConnections", "ebayConnections", "bankConnections"]) assert.ok(derive.includes("snapshot." + key), "derive.js no longer reads " + key);
  });
  await check("the sweep gates every workspace on the pilot list, the exclude list and our own addresses, before any read", () => {
    assert.ok(block.includes("retentionRules.workspaceScope({"));
    assert.ok(block.includes("pilotList: process.env.NIVADESK_RETENTION_WORKSPACES"));
    assert.ok(block.includes("excludeList: process.env.NIVADESK_RETENTION_EXCLUDE_WORKSPACES"));
    assert.ok(block.includes("adminEmails: [...SUPPORT_ADMIN_EMAILS].join(\",\")"));
    assert.ok(block.includes("if (!scope.allowed) { summary.skipped[scope.reason] = (summary.skipped[scope.reason] || 0) + 1; continue; }"));
    assert.ok(block.indexOf("retentionRules.workspaceScope({") < block.indexOf("await nvRetentionTriggerFor(db, companyId, company, nowMs)"), "the gate comes before the reads");
  });
  await check("a recent feedback prompt for the owner holds the in-app nudge", () => {
    assert.ok(block.includes('collection("feedbackState").doc(ownerUid).get()'));
    assert.ok(block.includes("retentionRules.feedbackPromptRecent("));
    assert.ok(block.includes('holdInApp, holdReason: "feedback_prompt_recent"'));
  });
  await check("the dismiss callable accepts acted and treats everything else as a dismissal", () => {
    const callable = index.slice(index.indexOf("exports.dismissRetentionMessage"));
    assert.ok(callable.includes('request.data.outcome === "acted" ? "acted" : "dismissed"'));
    assert.ok(callable.includes("{ nowMs: Date.now(), outcome }"));
  });
  console.log(failures ? `\n❌ RETENTION SWEEP WIRING: ${failures} FAIL` : "\n✅ RETENTION SWEEP WIRING GEÇTİ");
  process.exit(failures ? 1 : 0);
})();

// The one credential a workspace's whole team could read.
//
// The OpenAI key used to live on `companySettings`, which every role can read —
// a member, a viewer, a Workflow Only bench hand. It was moved to a server-only
// collection, but the move is LAZY: it happens the first time something asks
// for the key. A workspace that has not opened Quick Reply since, or has
// stopped using it, still carries the plaintext key where its whole team can
// see it, and nothing was ever going to notice.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "functions", "index.js"), "utf8");
const RULES = fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

function body(marker, endMarker) {
  const at = SOURCE.indexOf(marker);
  assert.ok(at > 0, `${marker} is where it was`);
  const end = SOURCE.indexOf(endMarker, at + marker.length);
  return SOURCE.slice(at, end > 0 ? end : at + 5000);
}

check("something finishes the migration rather than waiting to be asked", () => {
  const sweep = body("exports.scheduledQuickReplyKeySweep = onSchedule(", "async function quickReplyKnowledgeWithContributions");
  assert.ok(sweep.length > 400, "the sweep exists");
  assert.ok(/collection\("companySettings"\)/.test(sweep), "it walks the readable documents");
  assert.ok(/openAIKey: admin\.firestore\.FieldValue\.delete\(\)/.test(sweep), "and removes the key from them");
});

check("it moves the key before it deletes it", () => {
  const sweep = body("exports.scheduledQuickReplyKeySweep = onSchedule(", "async function quickReplyKnowledgeWithContributions");
  const move = sweep.indexOf("secretRef.set(");
  const remove = sweep.indexOf("openAIKey: admin.firestore.FieldValue.delete()");
  assert.ok(move > 0 && remove > 0 && move < remove, "deleting first would lose the key");
});

check("a duplicate is deleted even when nothing needed moving", () => {
  // If the secret document already holds a key, the copy on the settings
  // document is a duplicate every member can read — which IS the problem.
  const sweep = body("exports.scheduledQuickReplyKeySweep = onSchedule(", "async function quickReplyKnowledgeWithContributions");
  const guard = sweep.indexOf("if (!existing)");
  const remove = sweep.indexOf("openAIKey: admin.firestore.FieldValue.delete()");
  assert.ok(guard > 0 && remove > guard, "the delete must be outside the moved-it branch");
  const branch = sweep.slice(guard, remove);
  assert.ok(branch.split("}").length >= 2, "the branch closes before the delete");
});

check("one workspace's failure does not stop the rest", () => {
  const sweep = body("exports.scheduledQuickReplyKeySweep = onSchedule(", "async function quickReplyKnowledgeWithContributions");
  assert.ok(/catch \(error\)/.test(sweep));
  assert.ok(/console\.warn\("quick reply key sweep failed for"/.test(sweep));
});

check("it pages, and starts again after the end", () => {
  const sweep = body("exports.scheduledQuickReplyKeySweep = onSchedule(", "async function quickReplyKnowledgeWithContributions");
  assert.ok(/orderBy\(admin\.firestore\.FieldPath\.documentId\(\)\)/.test(sweep), "no new index needed");
  assert.ok(/startAfter\(startAfterId\)/.test(sweep));
  assert.ok(/cursorDocId: page\.docs\.length < PAGE \? "" : lastId/.test(sweep),
    "a workspace created later must be reached too");
});

check("the lazy migration is still there, for the workspace that uses it today", () => {
  // The sweep is the backstop, not a replacement: a key saved this morning
  // should not wait until tonight to move.
  const lazy = body("async function secureQuickReplyOpenAIKey(", "async function quickReplyKnowledgeWithContributions");
  assert.ok(/migratedFromLegacySettingsAt/.test(lazy));
});

check("the collections that hold credentials are closed to clients, explicitly", () => {
  for (const collection of ["quickReplySecrets", "fileShares", "chatgptOAuthClients", "chatgptOAuthTokens", "workspaceInvitations"]) {
    const at = RULES.indexOf(`match /${collection}/`);
    assert.ok(at > 0, `${collection} is not named in the rules`);
    assert.ok(/allow read, write: if false;/.test(RULES.slice(at, at + 200)), `${collection} is not closed`);
  }
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 200)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ SECRET AT REST GEÇTİ");
})();

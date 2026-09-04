// The access control policy, pinned to the rules it describes.
//
// A policy document is a claim about a system. These checks read the deployed
// security rules and confirm the claim is still true — and one of them is a
// trip-wire: the policy promises that Amazon buyer data will live in a
// rules-protected subcollection rather than in the order document, and that
// promise becomes enforced the moment somebody wires the Amazon adapter into an
// ingestion path.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const root = path.join(__dirname, "..", "..");
const repo = path.join(root, "..");
const policyPath = path.join(repo, "docs", "security", "access-control-policy.md");
const policy = fs.existsSync(policyPath) ? fs.readFileSync(policyPath, "utf8") : "";
const rules = fs.readFileSync(path.join(repo, "firestore.rules"), "utf8");

check("the policy exists", () => {
  assert.ok(policy, `no access control policy at ${policyPath}`);
});

// ---- what the policy says the database enforces -------------------------------

check("a workspace cannot read another workspace's orders", () => {
  assert.ok(/function canReadCompany\(companyId\)/.test(rules), "canReadCompany is gone");
  assert.ok(/function canReadOrderDocument\(data\)/.test(rules), "order reads no longer go through one check");
  const fn = rules.slice(rules.indexOf("function canReadOrderDocument(data)"));
  assert.ok(/canReadCompany\(data\.companyId\)/.test(fn.slice(0, 400)),
    "an order read no longer checks the reader belongs to that workspace");
});

check("the three order tiers the policy names still exist", () => {
  for (const fn of ["isWorkflowOnlyMember", "isAssignedOnlyCustomMember", "usesWorkflowSafeView"]) {
    assert.ok(new RegExp(`function ${fn}\\(`).test(rules), `the policy describes a tier that ${fn} no longer implements`);
  }
  // Workflow Only must not reach the full order document — that is the whole
  // point of the finance-free view.
  const orders = rules.slice(rules.indexOf("match /siparisler/{orderId}"));
  assert.ok(/allow read: if canReadOrderDocument\(resource\.data\)\s*\n\s*&& !usesWorkflowSafeView\(resource\.data\.companyId\);/.test(orders),
    "a Workflow Only member can now read the full order document");
});

check("suspension is a server-only fact, not a member-writable flag", () => {
  assert.ok(/function memberSuspended\(companyId\)/.test(rules), "suspension is no longer checked in rules");
  assert.ok(/suspendedMembers/.test(rules), "the suspension map is gone from the rules");
  // The protected list lives in the rules, which is what makes it a database
  // fact rather than a server convention.
  const protectedList = rules.slice(rules.indexOf("function protectedBillingFields()"));
  assert.ok(/'suspendedMembers'/.test(protectedList.slice(0, 1500)),
    "suspendedMembers left the protected list, so an owner's client can write it");
});

check("the bank feed is gated in the rules, not only in the app", () => {
  assert.ok(/function canReadBankFeed\(companyId\)/.test(rules), "the bank feed gate is gone");
  assert.ok(/memberAccessAllows\(companyId, 'bankFeed'\)/.test(rules),
    "the bank feed no longer checks the per-member grant");
});

check("the access log stays owner-read and client-unwritable", () => {
  const block = rules.slice(rules.indexOf("piiAccessLog"));
  assert.ok(/allow read: if isCompanyOwner\(companyId\);/.test(block.slice(0, 400)), "the access log is readable by members");
  assert.ok(/allow write: if false;/.test(block.slice(0, 400)), "a client can write the access log");
  // The wildcard is a deny-list: named in both blocks, or all members read it.
  const denials = rules.match(/collectionId != 'piiAccessLog'/g) || [];
  assert.strictEqual(denials.length, 2,
    `piiAccessLog must be excluded from both wildcard blocks; found ${denials.length}`);
});

// ---- the trip-wire ------------------------------------------------------------

check("if the Amazon connector has shipped, its buyer data is rules-protected", () => {
  // Detected by use, not by intention: the adapter is a pure module today, and
  // the day something other than a test requires it, Amazon orders can exist.
  const wiredBy = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "test" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith(".js")) continue;
      const body = fs.readFileSync(full, "utf8");
      if (/require\(["'][^"']*adapters\/amazon["']\)/.test(body)) wiredBy.push(path.relative(root, full));
    }
  };
  walk(root);

  if (!wiredBy.length) {
    // Nothing ingests Amazon orders, so there is nothing yet to protect. The
    // outbound denial still stands on its own and is tested separately.
    return;
  }
  assert.ok(/match \/companies\/\{companyId\}\/siparisler\/\{orderId\}\/restrictedCustomer/.test(rules)
    || /restrictedCustomer/.test(rules),
    `the Amazon adapter is wired in by ${wiredBy.join(", ")}, and the access control policy §5 requires ` +
    "Amazon buyer personal data to live in a rules-protected subcollection rather than in the order " +
    "document. Add that rule — and name the subcollection in BOTH wildcard deny-lists — before shipping.");
});

// ---- the document keeps itself current ----------------------------------------

check("the policy is reviewed every six months, and is not overdue", () => {
  assert.ok(/reviewed \*\*every six months\*\*/.test(policy), "the six-month cadence is no longer stated");
  const match = policy.match(/\*\*Next scheduled review:\*\*\s*(\d{1,2}) (\w+) (\d{4})/);
  assert.ok(match, "the next review date cannot be read");
  const due = new Date(`${match[1]} ${match[2]} ${match[3]} UTC`);
  assert.ok(due.getTime() > Date.now(),
    `the access control policy was due for review on ${match[1]} ${match[2]} ${match[3]}. ` +
    "Check the operator accounts and their two-factor, re-read the rules against §3, record the review in §8, " +
    "and move the date on six months.");
});

check("the policy still admits which controls are interface-level", () => {
  // The honest paragraph is the load-bearing one. A policy that quietly drops it
  // starts claiming database enforcement it does not have.
  assert.ok(/What is enforced by the interface/.test(policy), "§4 is gone");
  assert.ok(/are \*\*not\*\* database rules\./.test(policy),
    "the policy no longer says the per-card capabilities are interface-level");
});

for (const { name, run } of checks) {
  try { run(); console.log(`PASS  ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
}
if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
console.log("\n✅ ACCESS CONTROL POLICY GEÇTİ");

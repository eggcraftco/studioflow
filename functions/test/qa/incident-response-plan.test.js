// The incident response plan, kept honest.
//
// A plan is easy to write and easy to let rot. Amazon's security questionnaire
// asks three specific things of it — defined roles, a six-month review cadence,
// and notification within 24 hours — and answering yes to those is only true
// while the document still says them. So the document is a tested artefact:
// these checks fail if somebody softens it, and they fail if it claims a
// containment mechanism that no longer exists in the code.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const root = path.join(__dirname, "..", "..");
const planPath = path.join(root, "..", "docs", "security", "incident-response-plan.md");
const plan = fs.existsSync(planPath) ? fs.readFileSync(planPath, "utf8") : "";

check("the plan exists at the path the questionnaire answer points at", () => {
  assert.ok(plan, `no incident response plan at ${planPath}`);
});

// ---- the three things Amazon actually asks for -------------------------------

check("roles are defined, and each one has a holder", () => {
  for (const role of ["Incident Lead", "Deputy Incident Lead", "Technical Remediation", "Communications", "Record Keeper"]) {
    assert.ok(plan.includes(role), `the plan no longer defines a ${role}`);
  }
  // A role with no named holder is an org chart, not a plan.
  assert.ok(/\| Holder \|/.test(plan), "the roles table lost its holder column");
  assert.ok(/contact@nivadesk\.co\.uk/.test(plan), "no role holder is reachable");
});

check("the review cadence is six months, stated as such", () => {
  assert.ok(/reviewed \*\*every six months\*\*/.test(plan), "the six-month cadence is no longer stated");
  assert.ok(/Next scheduled review:/.test(plan), "there is no next review date to be overdue against");
  assert.ok(/Review date \| Carried out by/.test(plan), "the review record table is gone, so nobody can show a review happened");
});

check("Amazon is notified within 24 hours, by name and by address", () => {
  assert.ok(/security@amazon\.com/.test(plan), "the plan does not say where to notify Amazon");
  assert.ok(/within 24 hours/i.test(plan), "the 24-hour clock is gone");
  assert.ok(/\*\*T \+ 24 hours\*\*/.test(plan), "the 24-hour notification is not in the timetable");
  // The clock must run from awareness, not from the end of the investigation:
  // that difference is the whole of the obligation.
  assert.ok(/within 24 hours of becoming aware/i.test(plan),
    "the 24-hour clock no longer runs from awareness");
});

check("the review is not overdue", () => {
  const match = plan.match(/\*\*Next scheduled review:\*\*\s*(\d{1,2}) (\w+) (\d{4})/);
  assert.ok(match, "the next review date cannot be read");
  const due = new Date(`${match[1]} ${match[2]} ${match[3]} UTC`);
  assert.ok(!Number.isNaN(due.getTime()), `unreadable review date: ${match[0]}`);
  assert.ok(due.getTime() > Date.now(),
    `the incident response plan was due for review on ${match[1]} ${match[2]} ${match[3]}. ` +
    "Run the tabletop exercise, confirm the role holders and the backup retention windows, " +
    "record the review in §11, and move the date on six months.");
});

// ---- what the plan promises must still be true -------------------------------

check("the Amazon denial the plan describes is the one in the code", () => {
  const outbound = require("../../privacy/outbound");
  for (const channel of outbound.OUTBOUND_CHANNELS) {
    assert.strictEqual(outbound.mayReleasePii({ commerce: { provider: "amazon" } }, channel).allow, false,
      `the plan says Amazon Information is denied on every outbound channel; ${channel} is open`);
  }
  assert.strictEqual(outbound.mayReleasePii({ commerce: { provider: "nobody_has_described_this" } }, "assistant").allow, false,
    "the plan says an undescribed provider is denied by default");
});

check("the access log the plan relies on for detection is still append-only", () => {
  const rules = fs.readFileSync(path.join(root, "..", "firestore.rules"), "utf8");
  assert.ok(/match \/companies\/\{companyId\}\/piiAccessLog/.test(rules),
    "the plan names the PII access log as a detection source; it has no rule of its own");
  const block = rules.slice(rules.indexOf("piiAccessLog"));
  assert.ok(/allow write: if false;/.test(block.slice(0, 400)),
    "a client can write the access log, so it is a claim rather than a record");
});

check("the recovery the plan offers is scheduled, with the retention it states", () => {
  const source = fs.readFileSync(path.join(root, "index.js"), "utf8");
  assert.ok(/exports\.backupAuthUsers = onSchedule\(/.test(source),
    "the plan offers a daily Auth snapshot that no longer runs");
  const retention = source.match(/const AUTH_BACKUP_RETENTION_DAYS = (\d+);/);
  assert.ok(retention, "the Auth backup retention is no longer stated in code");
  assert.ok(new RegExp(`kept for \\*\\*${retention[1]} days\\*\\*`).test(plan),
    `the plan and the code disagree about Auth backup retention (code says ${retention[1]} days)`);
  // The other recovery numbers are read from the Firestore Admin API, not from
  // anybody's recollection, and the plan must keep saying which is which.
  assert.ok(/read from the Firestore Admin API/.test(plan),
    "the plan no longer says where its recovery numbers came from");
  assert.ok(/version retention period of\s+\*\*7 days\*\*/.test(plan), "the point-in-time recovery window is gone");
  assert.ok(/\*\*Daily backup schedule\*\*, retention \*\*14 days\*\*/.test(plan), "the backup schedule is gone");
  // The uncomfortable one. Recovery is worth nothing if the database itself can
  // be deleted, and the plan says so until somebody turns it on.
  // Recovery is worth nothing if the database itself can be deleted, so the
  // plan has to keep saying which state it is in — and if it ever goes back to
  // disabled, saying that instead.
  assert.ok(/\*\*Delete protection: enabled\*\*/.test(plan) || /Delete protection.*DISABLED/.test(plan),
    "the plan stopped saying anything about delete protection");
});

check("the key rotation the plan offers is a mechanism, not a sentence", () => {
  const box = fs.readFileSync(path.join(root, "security", "tokenBox.js"), "utf8");
  assert.ok(/function tokenKeyId\(/.test(box) && /function tokenNeedsRebox\(/.test(box),
    "the plan says a sealed token is stamped with the key that sealed it; nothing stamps it");
  // And the stamp has to survive a round trip, not merely exist as a function.
  const { encryptToken, decryptToken, tokenKeyId, tokenNeedsRebox } = require("../../security/tokenBox");
  const oldKey = "a".repeat(64);
  const newKey = "b".repeat(64);
  const sealed = encryptToken("a refresh token", oldKey);
  assert.strictEqual(sealed.k, tokenKeyId(oldKey), "the box does not say which key sealed it");
  assert.strictEqual(decryptToken(sealed, [newKey, oldKey]), "a refresh token",
    "a box sealed with the retired key cannot be read during a rotation");
  assert.strictEqual(tokenNeedsRebox(sealed, [newKey, oldKey]), true,
    "nothing notices that this box is still on the old key, so a rotation never finishes");
});

for (const { name, run } of checks) {
  try { run(); console.log(`PASS  ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
}
if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
console.log("\n✅ INCIDENT RESPONSE PLAN GEÇTİ");

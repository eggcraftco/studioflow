// One password rule, mirrored in four languages.
//
// Web, macOS, iOS and Android each ask a person to choose a password, and each
// one enforces the rule in its own codebase. That is four chances to disagree,
// and they did: Android checked only that the two boxes matched, so an account
// refused in a browser could be created from a phone.
//
// These checks read all four and fail if they drift.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const policy = require("../../security/passwordPolicy");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const repo = path.join(__dirname, "..", "..", "..");
const read = (...parts) => fs.readFileSync(path.join(repo, ...parts), "utf8");

check("the rule itself refuses what it says it refuses", () => {
  assert.strictEqual(policy.passwordProblem("abc1"), "too_short");
  assert.strictEqual(policy.passwordProblem("abcdefgh"), "no_digit");
  assert.strictEqual(policy.passwordProblem("12345678"), "no_letter");
  assert.strictEqual(policy.passwordProblem("abcd1234"), "");
  assert.strictEqual(policy.passwordProblem("Sirius-B-1862"), "");
  // A password of exactly the minimum length is long enough. Off-by-one here
  // would reject a valid password with a message that says it is too short.
  assert.strictEqual(policy.MIN_LENGTH, 8);
  assert.strictEqual(policy.passwordProblem("a1234567"), "");
  // Nothing is not a password, and neither is the absence of one.
  assert.strictEqual(policy.passwordProblem(""), "too_short");
  assert.strictEqual(policy.passwordProblem(undefined), "too_short");
  assert.strictEqual(policy.passwordProblem(null), "too_short");
  assert.strictEqual(policy.passwordIsAcceptable("abcd1234"), true);
  assert.strictEqual(policy.passwordIsAcceptable("abcd"), false);
});

check("the web asks for the same thing", () => {
  const source = read("studioflow-web", "components", "PublicMarketing.tsx");
  assert.ok(new RegExp(`password\\.length < ${policy.MIN_LENGTH}`).test(source),
    `the web signup no longer requires ${policy.MIN_LENGTH} characters`);
  assert.ok(/!\/\[A-Za-z\]\/\.test\(password\)/.test(source), "the web signup no longer requires a letter");
  assert.ok(/!\/\[0-9\]\/\.test\(password\)/.test(source), "the web signup no longer requires a digit");
});

check("macOS and iOS ask for the same thing", () => {
  const source = read("EGGcraft", "AuthViewModel.swift");
  assert.ok(new RegExp(`sifre\\.count >= ${policy.MIN_LENGTH}`).test(source),
    `the Apple signup no longer requires ${policy.MIN_LENGTH} characters`);
  assert.ok(/rangeOfCharacter\(from: \.letters\) != nil/.test(source), "the Apple signup no longer requires a letter");
  assert.ok(/rangeOfCharacter\(from: \.decimalDigits\) != nil/.test(source), "the Apple signup no longer requires a digit");
});

check("Android asks for the same thing, and actually asks", () => {
  const source = read("studioflow-android", "app", "src", "main", "java", "uk", "co", "eggcraft",
    "studioflow", "features", "auth", "LoginScreen.kt");
  assert.ok(new RegExp(`PASSWORD_MIN_LENGTH = ${policy.MIN_LENGTH}`).test(source),
    `Android no longer requires ${policy.MIN_LENGTH} characters`);
  assert.ok(/password\.none \{ it\.isLetter\(\) \}/.test(source), "Android no longer requires a letter");
  assert.ok(/password\.none \{ it\.isDigit\(\) \}/.test(source), "Android no longer requires a digit");
  // The rule existing is not the same as the rule running: Android had the
  // password in hand and never looked at it.
  assert.ok(/!passwordIsAcceptable\(password\)/.test(source),
    "Android defines a password rule that the sign-up button never calls");
});

check("the policy document says what is enforced where", () => {
  const doc = read("docs", "security", "password-and-mfa-policy.md");
  assert.ok(doc, "no password and MFA policy document");
  assert.ok(new RegExp(`${policy.MIN_LENGTH} characters`).test(doc),
    "the document and the code disagree about the minimum length");
  assert.ok(/Firebase console/.test(doc), "the document no longer names where the server-side policy is set");
  assert.ok(/two-factor/i.test(doc), "the document no longer covers multi-factor authentication");
  // The server-side floor, as read from the console. If somebody changes the
  // console back to Notify, this page stops being true — and the honest
  // consequence is that the page has to change too, deliberately.
  assert.ok(/\| Enforcement mode \| \*\*Require\*\*/.test(doc),
    "the document no longer records the server-side enforcement mode");
  assert.ok(new RegExp(`\\| Minimum password length \\| \\*\\*${policy.MIN_LENGTH}\\*\\*`).test(doc),
    "the console minimum recorded in the document no longer matches the code");
  // The gap the console cannot close, kept where somebody has to read it.
  assert.ok(/cannot express "a letter"/.test(doc),
    "the document stopped admitting that the letter requirement is client-side only");
  // Operator accounts reach every workspace, so they carry the stricter rules —
  // and these particular numbers are what a marketplace's security
  // questionnaire asks for. Softening any of them changes a truthful Yes into
  // an untruthful one.
  for (const requirement of [/at least \*\*12 characters\*\*/, /special character/, /rotated at least every 365 days/]) {
    assert.ok(requirement.test(doc), `the operator account rules lost: ${requirement}`);
  }
});

check("the operator audit is not marked done before it is done", () => {
  // The failure this guards against is the easy one: a written policy read as a
  // completed control. Until every operator account has actually been checked
  // against §6, the questionnaire answer is No, and the document has to keep
  // saying so where somebody filling in that questionnaire will see it.
  const doc = read("docs", "security", "password-and-mfa-policy.md");
  assert.ok(/## 8\. Outstanding: the operator account audit/.test(doc),
    "the operator account audit section is gone");
  assert.ok(/NivaDesk answers\s+\*\*No\*\*/.test(doc),
    "the document no longer states that the answer stays No until the audit is done");
  // §7 and §8 have to agree. While the review table says the audit has not
  // happened, §8 must still say the answer is No — the two drifting apart is
  // precisely how a document comes to claim a control nobody performed.
  const notYetAudited = /Operator accounts audited/.test(doc) && /\*\*Not yet\*\*/.test(doc);
  if (notYetAudited) {
    assert.ok(/NivaDesk answers\s+\*\*No\*\*/.test(doc),
      "the review table says the operator audit has not happened, but §8 no longer answers No");
  } else {
    // Audit recorded as done: then every row must carry a result, or the record
    // is ahead of the work.
    const rows = doc.slice(doc.indexOf("| # | Account")).split("\n")
      .filter((line) => /^\| \d+ \|/.test(line));
    assert.ok(rows.length > 0, "the audit table lost its rows");
    for (const row of rows) {
      const cells = row.split("|").map((c) => c.trim());
      assert.ok(cells[cells.length - 2],
        `the review table says the audit is done, but this row has no result: ${cells[2] || row}`);
    }
  }
});

for (const { name, run } of checks) {
  try { run(); console.log(`PASS  ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
}
if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
console.log("\n✅ PASSWORD POLICY GEÇTİ");

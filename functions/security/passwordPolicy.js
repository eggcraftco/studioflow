// The password rule, in one place.
//
// Four clients ask a person to choose a password — web, macOS, iOS and
// Android — and until this file existed each one decided for itself what
// counted as strong enough. Three of them agreed and Android checked nothing at
// all, so the same account could be created with a six-character password from
// a phone and refused from a browser.
//
// The rule lives here. Each client mirrors it in its own language, and a test
// reads all four and fails if they drift apart. That is the only honest way to
// answer "do you have a password policy" when the policy is enforced in four
// codebases.
//
// This is a client-side rule. It stops an ordinary person choosing an ordinary
// weak password, which is what it is for. It does not stop somebody calling the
// Firebase Authentication REST API directly — only the project's own password
// policy in the Firebase console does that, and enabling it is recorded in
// docs/security/password-and-mfa-policy.md as a configuration step, not claimed
// here as code.

/** Minimum characters. Chosen to match NCSC guidance rather than to be memorable. */
const MIN_LENGTH = 8;

/** The categories a password must contain at least one of. */
const REQUIRES_LETTER = true;
const REQUIRES_DIGIT = true;

/**
 * Why this password is not acceptable, or "" if it is.
 *
 * Returns a reason code rather than a sentence: the sentence belongs to the
 * client, in the language the person is using.
 */
function passwordProblem(password) {
  const value = typeof password === "string" ? password : "";
  if (value.length < MIN_LENGTH) return "too_short";
  if (REQUIRES_LETTER && !/[A-Za-z]/.test(value)) return "no_letter";
  if (REQUIRES_DIGIT && !/[0-9]/.test(value)) return "no_digit";
  return "";
}

function passwordIsAcceptable(password) {
  return passwordProblem(password) === "";
}

module.exports = { MIN_LENGTH, REQUIRES_LETTER, REQUIRES_DIGIT, passwordProblem, passwordIsAcceptable };

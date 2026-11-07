/**
 * GN-10 (23 Oct 2026) — who is offered two-step verification on the web.
 *  P1 flag off → nobody is offered enrolment, card hidden unless a factor exists.
 *  P2 flag on → owner and admin are offered; member, viewer, workflow, custom roles, "" are not.
 *  P3 an account WITH a factor always sees the card (remove / recovery codes), any role, flag off too.
 *  P4 nobody is offered a second enrolment of the SAME kind (no factor list = any factor counts, the pre-SMS rule).
 *  P5 the card wires it: enrolment button needs the "apps up to date" tick, beginEnroll re-checks
 *     the policy, Settings passes the normalised workspace role, the native version is named.
 *  P6 SMS-MFA: text-message enrolment needs its own flag; owner/admin only; one phone; flag off hides it.
 *  P7 SMS-MFA: an account with SMS may add the authenticator app and the reverse; 5 factors is the cap.
 *  P8 SMS-MFA: the card names 2.5 for texts, says the Mac app cannot receive them, shows the privacy and
 *     SIM-swap sentences before the number field, and re-checks the policy in beginSms.
 * Run: node --experimental-strip-types --no-warnings scripts/check-second-factor-policy.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NATIVE_MFA_MIN_VERSION, NATIVE_SMS_MFA_MIN_VERSION, canOfferSmsEnrollment, canOfferTotpEnrollment, shouldShowTwoStepCard } from "../lib/auth/secondFactorPolicy.ts";

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok ${n} ${name}`); };
const roles = ["owner", "admin", "member", "viewer", "workflow", "custom_abc123", "", "Owner "];

ok("P1 flag off: no offer, no card without a factor", () => {
  for (const role of roles) {
    assert.equal(canOfferTotpEnrollment({ flagOn: false, role, factorCount: 0 }), false, role);
    assert.equal(shouldShowTwoStepCard({ flagOn: false, role, factorCount: 0 }), false, role);
  }
});
ok("P2 flag on: owner/admin only", () => {
  const offered = roles.filter(role => canOfferTotpEnrollment({ flagOn: true, role, factorCount: 0 }));
  assert.deepEqual(offered, ["owner", "admin", "Owner "]);
});
ok("P3 enrolled account always sees the card", () => {
  for (const role of roles) for (const flagOn of [true, false]) assert.equal(shouldShowTwoStepCard({ flagOn, role, factorCount: 1 }), true, `${role}/${flagOn}`);
});
ok("P4 no second enrolment", () => {
  for (const role of roles) assert.equal(canOfferTotpEnrollment({ flagOn: true, role, factorCount: 1 }), false, role);
});
ok("P5 card and settings wiring", () => {
  const card = readFileSync(new URL("../app/settings/TwoStepVerificationCard.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
  assert.match(card, /disabled=\{busy \|\| !appsUpdated\} onClick=\{\(\) => void beginEnroll\(\)\}/);
  assert.match(card, /if \(!user \|\| !canOfferTotpEnrollment\(/);
  assert.match(card, /if \(!shouldShowTwoStepCard\(policy\)\) return null;/);
  assert.match(card, /\.replace\("\{version\}", NATIVE_MFA_MIN_VERSION\)/);
  assert.match(page, /<TwoStepVerificationCard language=\{accountLanguage\} workspaceRole=\{normalizeWorkspaceRole\(workspace\.role\)\} \/>/);
  assert.match(NATIVE_MFA_MIN_VERSION, /^\d+\.\d+$/);
});
ok("P6 SMS: own flag, owner/admin, one phone", () => {
  for (const role of roles) {
    assert.equal(canOfferSmsEnrollment({ flagOn: true, smsFlagOn: false, role, factorCount: 0, factorIds: [] }), false, `flag off ${role}`);
    assert.equal(shouldShowTwoStepCard({ flagOn: false, smsFlagOn: false, role, factorCount: 0, factorIds: [] }), false, role);
    assert.equal(canOfferSmsEnrollment({ flagOn: true, smsFlagOn: true, role, factorCount: 1, factorIds: ["phone"] }), false, `second phone ${role}`);
  }
  const offered = roles.filter(role => canOfferSmsEnrollment({ flagOn: false, smsFlagOn: true, role, factorCount: 0, factorIds: [] }));
  assert.deepEqual(offered, ["owner", "admin", "Owner "]);
  // TOTP flag off does not hide the SMS card.
  assert.equal(shouldShowTwoStepCard({ flagOn: false, smsFlagOn: true, role: "owner", factorCount: 0, factorIds: [] }), true);
});
ok("P7 SMS: one of each kind, cap 5", () => {
  assert.equal(canOfferTotpEnrollment({ flagOn: true, smsFlagOn: true, role: "owner", factorCount: 1, factorIds: ["phone"] }), true, "TOTP after SMS");
  assert.equal(canOfferSmsEnrollment({ flagOn: true, smsFlagOn: true, role: "owner", factorCount: 1, factorIds: ["totp"] }), true, "SMS after TOTP");
  assert.equal(canOfferTotpEnrollment({ flagOn: true, smsFlagOn: true, role: "owner", factorCount: 2, factorIds: ["phone", "totp"] }), false);
  assert.equal(canOfferSmsEnrollment({ flagOn: true, smsFlagOn: true, role: "owner", factorCount: 2, factorIds: ["phone", "totp"] }), false);
  assert.equal(canOfferSmsEnrollment({ flagOn: true, smsFlagOn: true, role: "owner", factorCount: 5, factorIds: ["totp", "x", "y", "z", "w"] }), false, "cap");
  // Without the list the pre-SMS rule holds: any factor blocks both.
  assert.equal(canOfferSmsEnrollment({ flagOn: true, smsFlagOn: true, role: "owner", factorCount: 1 }), false);
  assert.equal(canOfferTotpEnrollment({ flagOn: true, smsFlagOn: true, role: "owner", factorCount: 1 }), false);
});
ok("P8 SMS card wiring", () => {
  const card = readFileSync(new URL("../app/settings/TwoStepVerificationCard.tsx", import.meta.url), "utf8");
  assert.match(card, /\.replace\("\{version\}", NATIVE_SMS_MFA_MIN_VERSION\)/);
  assert.equal(NATIVE_SMS_MFA_MIN_VERSION, "2.5");
  assert.match(card, /The Mac app cannot receive text-message codes yet/);
  assert.match(card, /if \(!user \|\| !canOfferSmsEnrollment\(livePolicy\(\)\)\) return;/);
  assert.match(card, /data-testid="two-step-add-sms" disabled=\{busy \|\| !appsUpdated\}/);
  const numberStep = card.slice(card.indexOf('step.kind === "sms-number" ?'));
  const privacy = numberStep.indexOf("two-step-sms-privacy");
  const risk = numberStep.indexOf("two-step-sms-risk");
  const field = numberStep.indexOf("two-step-sms-phone");
  assert.ok(privacy > 0 && risk > privacy && field > risk, "privacy + risk sentences come before the number field");
  const lib = readFileSync(new URL("../lib/auth/secondFactor.ts", import.meta.url), "utf8");
  assert.match(lib, /export const SMS_MFA_UI_ENABLED = SMS_MFA_OPENED \|\| process\.env\.NEXT_PUBLIC_NIVADESK_SMS_MFA === "1";/);
  assert.match(lib, /export const SMS_MFA_OPENED = (true|false);/);
  assert.doesNotMatch(lib, /console\.(log|info|debug)\(/, "no logging in the second-factor module");
});
console.log(`✅ SECOND FACTOR POLICY ${n}/8`);

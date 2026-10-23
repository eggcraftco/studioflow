/**
 * GN-10 (23 Oct 2026) — who is offered two-step verification on the web.
 *  P1 flag off → nobody is offered enrolment, card hidden unless a factor exists.
 *  P2 flag on → owner and admin are offered; member, viewer, workflow, custom roles, "" are not.
 *  P3 an account WITH a factor always sees the card (remove / recovery codes), any role, flag off too.
 *  P4 nobody is offered a second enrolment while one factor exists.
 *  P5 the card wires it: enrolment button needs the "apps up to date" tick, beginEnroll re-checks
 *     the policy, Settings passes the normalised workspace role, the native version is named.
 * Run: node --experimental-strip-types --no-warnings scripts/check-second-factor-policy.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NATIVE_MFA_MIN_VERSION, canOfferTotpEnrollment, shouldShowTwoStepCard } from "../lib/auth/secondFactorPolicy.ts";

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
console.log(`✅ SECOND FACTOR POLICY ${n}/5`);

// GN-10 (23 Oct 2026) — who is OFFERED two-step verification on the web, and which
// native app version can finish a sign-in that asks for the code.
//
// Owner instruction: optional TOTP for workspace owners and admins first; nothing
// mandatory. The Settings card offers enrolment only when the flag is on AND the
// active workspace role is owner/admin. An account that already HAS a factor always
// sees the card (so it can remove the factor or make recovery codes) whatever the role.
//
// Firebase decides the second step for every sign-in of an enrolled account (we can
// not exempt old app versions), so enrolment must not be offered before the native
// apps that can ask for the code are in the stores. NATIVE_MFA_MIN_VERSION is the
// version the enrolment notice names; keep it equal to the first store release that
// carries the native second-step screen (gn10-mfa-native-2026-10-23 → 2.3 candidate).
// Pure module (no Firebase import) so scripts can test it.

export const NATIVE_MFA_MIN_VERSION = "2.3";

const OFFER_ROLES = new Set(["owner", "admin"]);

export type TwoStepPolicyInput = { flagOn: boolean; role: string; factorCount: number };

/** May this person START enrolment here? */
export function canOfferTotpEnrollment({ flagOn, role, factorCount }: TwoStepPolicyInput): boolean {
  return Boolean(flagOn) && factorCount === 0 && OFFER_ROLES.has(String(role || "").trim().toLowerCase());
}

/** Is the Settings card rendered at all? */
export function shouldShowTwoStepCard(input: TwoStepPolicyInput): boolean {
  return input.factorCount > 0 || canOfferTotpEnrollment(input);
}

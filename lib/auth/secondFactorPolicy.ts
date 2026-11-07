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
//
// SMS-MFA (7 Nov 2026, owner: "güvenlik için … sms seçeneğini kullanalım"): a text-message
// code is a second METHOD next to the authenticator app. Same audience (owner/admin),
// own flag (NEXT_PUBLIC_NIVADESK_SMS_MFA=1, off until Identity Platform's SMS MFA and the
// GB-only region policy are on AND 2.5 is in the stores), own app version: 2.4.1 and older
// apps can only ask for an authenticator code, so a person with SMS as the ONLY method
// could not sign in there. One method of each kind; up to MAX_FACTORS in all.
// Pure module (no Firebase import) so scripts can test it.

export const NATIVE_MFA_MIN_VERSION = "2.3";

/** First store release whose iPhone/iPad/Android sign-in can ask for a text-message code. */
export const NATIVE_SMS_MFA_MIN_VERSION = "2.5";

const OFFER_ROLES = new Set(["owner", "admin"]);
const TOTP = "totp";
const PHONE = "phone";
const MAX_FACTORS = 5;

export type TwoStepPolicyInput = {
  flagOn: boolean;
  role: string;
  factorCount: number;
  /** factorId of every enrolled factor ("totp", "phone"); omitted = unknown, treated as "one of each kind". */
  factorIds?: readonly string[];
  /** NEXT_PUBLIC_NIVADESK_SMS_MFA (only read by the SMS checks). */
  smsFlagOn?: boolean;
};

const roleMayEnrol = (role: string) => OFFER_ROLES.has(String(role || "").trim().toLowerCase());

function hasKind(input: TwoStepPolicyInput, kind: string): boolean {
  // Without the list, any factor counts as "already has this kind" (the pre-SMS rule: no second enrolment).
  if (!input.factorIds) return input.factorCount > 0;
  return input.factorIds.includes(kind);
}

/** May this person START authenticator-app enrolment here? */
export function canOfferTotpEnrollment(input: TwoStepPolicyInput): boolean {
  return Boolean(input.flagOn) && roleMayEnrol(input.role) && !hasKind(input, TOTP) && input.factorCount < MAX_FACTORS;
}

/** May this person START text-message (SMS) enrolment here? */
export function canOfferSmsEnrollment(input: TwoStepPolicyInput): boolean {
  return Boolean(input.smsFlagOn) && roleMayEnrol(input.role) && !hasKind(input, PHONE) && input.factorCount < MAX_FACTORS;
}

/** Is the Settings card rendered at all? */
export function shouldShowTwoStepCard(input: TwoStepPolicyInput): boolean {
  return input.factorCount > 0 || canOfferTotpEnrollment(input) || canOfferSmsEnrollment(input);
}

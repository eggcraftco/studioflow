// SMS-MFA (7 Nov 2026) — text-message codes as a second way to do two-step verification.
//
// Pure rules (no Firebase import) so scripts/check-sms-second-factor.mts can test them:
// which numbers may receive a code, how a number is shown, and the sentence each Firebase
// error becomes. The sentences are English source keys; studioT() translates them
// (lib/studioflow/secondFactorTranslations.ts holds all 12 languages).
//
// Why only some countries: every text costs money and SMS "pumping" fraud sends codes to
// numbers that earn the attacker a share of the fee. Identity Platform's SMS region policy
// (smsRegionConfig allowlist, set by the owner) is the real gate; this list mirrors it so a
// number the server would refuse is refused here first, with a plain sentence.
// Keep SMS_ALLOWED_DIAL_CODES equal to the allowlist in docs/security/sms-second-factor.md.

/** Country dialling codes that may receive codes. "+44" = United Kingdom (region GB). */
export const SMS_ALLOWED_DIAL_CODES: readonly string[] = ["+44"];

/** Texts one sign-in prompt may ask for (the first one included) before it says "wait". */
export const SMS_MAX_TEXTS_PER_PROMPT = 3;

/** Seconds between two texts for the same prompt. */
export const SMS_RESEND_COOLDOWN_SECONDS = 30;

/** Firebase's own limit on enrolled second factors per account. */
export const MAX_SECOND_FACTORS = 5;

export type PhoneCheck =
  | { ok: true; e164: string }
  | { ok: false; reason: "empty" | "format" | "country" | "not-mobile" };

/**
 * "07700 900123", "+44 (0)7700 900123", "0044 7700-900123" → "+447700900123".
 * A number in another country is refused unless its code is in SMS_ALLOWED_DIAL_CODES;
 * a UK number must be a mobile (07…), because landlines cannot receive a text.
 */
export function checkSmsPhoneNumber(input: string, allowed: readonly string[] = SMS_ALLOWED_DIAL_CODES): PhoneCheck {
  let raw = String(input || "").trim();
  if (!raw) return { ok: false, reason: "empty" };
  raw = raw.replace(/\(0\)/g, "");
  if (/[^\d+\s().-]/.test(raw)) return { ok: false, reason: "format" };
  let digits = raw.replace(/[\s().-]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith("+")) {
    // A national UK number (the only national form we accept): 07xxx xxxxxx.
    if (/^0\d{10}$/.test(digits)) digits = `+44${digits.slice(1)}`;
    else return { ok: false, reason: "format" };
  }
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) return { ok: false, reason: "format" };
  const code = allowed.find(prefix => digits.startsWith(prefix));
  if (!code) return { ok: false, reason: "country" };
  if (code === "+44") {
    // +44 then 0 by mistake ("+44 07700…") is common; drop that 0.
    if (/^\+440\d{10}$/.test(digits)) digits = `+44${digits.slice(4)}`;
    if (!/^\+447\d{9}$/.test(digits)) return { ok: false, reason: "not-mobile" };
  }
  return { ok: true, e164: digits };
}

/** The sentence (translation key) for a refused number. */
export function phoneCheckMessage(reason: Exclude<PhoneCheck, { ok: true }>["reason"]): string {
  if (reason === "empty") return "Enter your mobile number.";
  if (reason === "country") return "Text-message codes can only be sent to UK mobile numbers (+44) for now. Use an authenticator app instead.";
  if (reason === "not-mobile") return "Enter a UK mobile number (it starts with 07 or +44 7). Landlines cannot receive texts.";
  return "That does not look like a phone number. Enter it like 07700 900123 or +44 7700 900123.";
}

/** Last digits only: "+447700900123" or Firebase's "+*******0123" → "•••• 0123" (a no-break space, so it never wraps). */
export function maskPhoneNumber(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••\u00a0${digits.slice(-4)}`;
}

/** The name stored with the factor (Firebase displayName, ≤ 60 chars, shown on every platform). */
export function smsFactorDisplayName(e164: string): string {
  const digits = String(e164 || "").replace(/\D/g, "");
  return digits.length >= 4 ? `SMS •• ${digits.slice(-4)}` : "SMS";
}

/** Seconds left before another text may be asked for (0 = now). */
export function resendSecondsLeft(resendAtMs: number, nowMs: number): number {
  if (!Number.isFinite(resendAtMs) || resendAtMs <= nowMs) return 0;
  return Math.ceil((resendAtMs - nowMs) / 1000);
}

/**
 * Firebase error code → sentence for sending a code or checking it.
 * "" means "not an SMS-specific error": the caller shows its normal error.
 */
export function smsErrorMessage(code: string): string {
  switch (code) {
    case "auth/invalid-verification-code":
    case "auth/missing-verification-code":
    case "auth/invalid-credential":
      return "That code is not right. Check the latest text message, or send a new code.";
    case "auth/code-expired":
    case "auth/session-expired":
      return "That code has expired. Send a new code.";
    case "auth/too-many-requests":
      return "Too many codes were asked for. Wait a while, or use your authenticator app or a recovery code.";
    case "auth/quota-exceeded":
      return "Text messages cannot be sent right now. Try again later, or use your authenticator app or a recovery code.";
    case "auth/invalid-phone-number":
    case "auth/missing-phone-number":
      return "That does not look like a phone number. Enter it like 07700 900123 or +44 7700 900123.";
    case "auth/operation-not-allowed":
      return "Text-message codes are not available for this number. Use an authenticator app instead.";
    case "auth/captcha-check-failed":
    case "auth/invalid-app-credential":
    case "auth/missing-app-credential":
      return "We could not check that this is a real browser. Reload the page and try again.";
    case "auth/second-factor-already-in-use":
      return "This number is already set up for two-step verification on this account.";
    case "auth/maximum-second-factor-count-exceeded":
      return "This account already has the most two-step methods allowed. Remove one first.";
    default:
      return "";
  }
}

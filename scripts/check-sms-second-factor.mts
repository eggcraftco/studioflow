/**
 * SMS-MFA (7 Nov 2026) — the pure rules behind text-message codes (lib/auth/smsSecondFactorRules.ts).
 *  S1 UK numbers in every common spelling become +447…; landlines, short and foreign numbers are refused
 *     with the right reason; the allowlist mirrors the GB-only region policy.
 *  S2 masking shows only the last four digits (also for Firebase's "+*******0123" hints); the stored
 *     factor name carries no more than the last four digits.
 *  S3 resend countdown; limits (3 texts per prompt, 30 s apart, 5 factors).
 *  S4 every Firebase error a text can raise maps to a sentence; unknown errors fall through ("").
 *  S5 the sign-in wrapper: authenticator first when both exist; texts only for phone; no number,
 *     code or verification id is ever logged; the emulator switch cannot reach production.
 * Run: node --experimental-strip-types --no-warnings scripts/check-sms-second-factor.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_SECOND_FACTORS,
  SMS_ALLOWED_DIAL_CODES,
  SMS_MAX_TEXTS_PER_PROMPT,
  SMS_RESEND_COOLDOWN_SECONDS,
  checkSmsPhoneNumber,
  maskPhoneNumber,
  phoneCheckMessage,
  resendSecondsLeft,
  smsErrorMessage,
  smsFactorDisplayName
} from "../lib/auth/smsSecondFactorRules.ts";

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok ${n} ${name}`); };

ok("S1 phone numbers", () => {
  for (const input of ["07700 900123", "07700900123", "+44 7700 900123", "+447700900123", "0044 7700 900123", "+44 (0)7700 900123", "+44 07700 900123", " 07700-900-123 ", "(07700) 900123"]) {
    assert.deepEqual(checkSmsPhoneNumber(input), { ok: true, e164: "+447700900123" }, input);
  }
  assert.deepEqual(checkSmsPhoneNumber(""), { ok: false, reason: "empty" });
  assert.deepEqual(checkSmsPhoneNumber("   "), { ok: false, reason: "empty" });
  assert.deepEqual(checkSmsPhoneNumber("020 7946 0000"), { ok: false, reason: "not-mobile" }, "London landline");
  assert.deepEqual(checkSmsPhoneNumber("+44 20 7946 0000"), { ok: false, reason: "not-mobile" });
  assert.deepEqual(checkSmsPhoneNumber("+90 532 000 00 00"), { ok: false, reason: "country" }, "Türkiye");
  assert.deepEqual(checkSmsPhoneNumber("+1 415 555 0100"), { ok: false, reason: "country" });
  assert.deepEqual(checkSmsPhoneNumber("+882 123456789"), { ok: false, reason: "country" }, "international network (pumping favourite)");
  assert.deepEqual(checkSmsPhoneNumber("07700 9001"), { ok: false, reason: "format" });
  assert.deepEqual(checkSmsPhoneNumber("tel:07700900123"), { ok: false, reason: "format" });
  assert.deepEqual(checkSmsPhoneNumber("+44 7700 900123 ext 2"), { ok: false, reason: "format" });
  assert.deepEqual(checkSmsPhoneNumber("+447700900123456"), { ok: false, reason: "not-mobile" }, "too long for UK");
  // A wider allowlist (owner decision later) still checks the shape.
  assert.deepEqual(checkSmsPhoneNumber("+353 85 123 4567", ["+44", "+353"]), { ok: true, e164: "+353851234567" });
  assert.deepEqual(SMS_ALLOWED_DIAL_CODES, ["+44"]);
  for (const reason of ["empty", "format", "country", "not-mobile"] as const) assert.ok(phoneCheckMessage(reason).length > 10);
});

ok("S2 masking", () => {
  assert.equal(maskPhoneNumber("+447700900123"), "••••\u00a00123", "no-break space: the mask never wraps");
  assert.equal(maskPhoneNumber("+*******0123"), "••••\u00a00123");
  assert.equal(maskPhoneNumber(""), "••••");
  assert.equal(maskPhoneNumber("12"), "••••");
  assert.equal(smsFactorDisplayName("+447700900123"), "SMS •• 0123");
  assert.ok(!smsFactorDisplayName("+447700900123").includes("7700"), "name holds only the last four digits");
  assert.ok(smsFactorDisplayName("+447700900123").length <= 60);
});

ok("S3 limits and countdown", () => {
  assert.equal(SMS_MAX_TEXTS_PER_PROMPT, 3);
  assert.equal(SMS_RESEND_COOLDOWN_SECONDS, 30);
  assert.equal(MAX_SECOND_FACTORS, 5);
  assert.equal(resendSecondsLeft(0, 1000), 0);
  assert.equal(resendSecondsLeft(31_000, 1000), 30);
  assert.equal(resendSecondsLeft(30_500, 1000), 30);
  assert.equal(resendSecondsLeft(1500, 1000), 1);
  assert.equal(resendSecondsLeft(Number.POSITIVE_INFINITY, 1000), 0, "no-more-texts is handled by the caller, not a countdown");
});

ok("S4 error sentences", () => {
  for (const code of [
    "auth/invalid-verification-code", "auth/missing-verification-code", "auth/invalid-credential", "auth/code-expired",
    "auth/session-expired", "auth/too-many-requests", "auth/quota-exceeded", "auth/invalid-phone-number",
    "auth/missing-phone-number", "auth/operation-not-allowed", "auth/captcha-check-failed", "auth/invalid-app-credential",
    "auth/missing-app-credential", "auth/second-factor-already-in-use", "auth/maximum-second-factor-count-exceeded"
  ]) {
    assert.ok(smsErrorMessage(code).length > 10, code);
  }
  assert.equal(smsErrorMessage("auth/network-request-failed"), "", "network errors keep the normal path");
  assert.equal(smsErrorMessage(""), "");
  assert.match(smsErrorMessage("auth/too-many-requests"), /recovery code/, "a blocked text points to the other ways in");
});

ok("S5 wrapper rules (source)", () => {
  const lib = readFileSync(new URL("../lib/auth/secondFactor.ts", import.meta.url), "utf8");
  assert.match(lib, /let method: SecondFactorMethod = totpHint \? "totp" : "phone";/, "authenticator first");
  assert.match(lib, /let wantText = method === "phone";/, "a text goes out at once only when SMS is the only way");
  assert.match(lib, /if \(textsSent >= SMS_MAX_TEXTS_PER_PROMPT\)/);
  assert.match(lib, /resendAtMs > Date\.now\(\)/);
  assert.doesNotMatch(lib, /console\./, "nothing logged");
  assert.doesNotMatch(lib, /localStorage|sessionStorage/, "no number, code or id kept in storage");
  const client = readFileSync(new URL("../lib/firebase/client.ts", import.meta.url), "utf8");
  const at = client.indexOf("appVerificationDisabledForTesting = true");
  const guard = client.lastIndexOf("if (USE_EMULATOR) {", at);
  assert.ok(at > 0 && guard > 0 && !/\n\}/.test(client.slice(guard, at)), "the reCAPTCHA bypass sits inside the emulator-only block");
  assert.match(client, /const USE_EMULATOR =[\s\S]{0,400}NEXT_PUBLIC_FIREBASE_EMULATOR === "1"/);
});

console.log(`✅ SMS SECOND FACTOR RULES ${n}/5`);

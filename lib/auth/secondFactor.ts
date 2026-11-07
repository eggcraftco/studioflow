"use client";

// GN-10 — two-step verification on the web: an authenticator app (TOTP) and, since
// SMS-MFA (7 Nov 2026), a code sent by text message (Firebase/Identity Platform phone factor).
//
// Sign-in side: every sign-in / re-authentication call is wrapped in
// withSecondFactor(). When Firebase answers auth/multi-factor-auth-required,
// the one <SecondFactorPromptHost/> (mounted in app/layout.tsx) asks for the
// 6-digit code and the sign-in is finished with the resolver. Users without a
// factor never see any of this — the wrapper only reacts to that one error.
// The same wrapper serves the lock screen's unlock and the “Is it still you?”
// check before an action that cannot be undone (lib/auth/recentAuth.ts), so a
// text-message code works there too.
//
// Which method first: the authenticator app when the account has one (stronger, free),
// else the text message — sent as soon as the prompt opens. The person can switch.
// A prompt sends at most SMS_MAX_TEXTS_PER_PROMPT texts, SMS_RESEND_COOLDOWN_SECONDS apart.
//
// Texts are sent by Firebase (Google), never by NivaDesk's servers. Before each one an
// invisible reCAPTCHA checks the browser is real (Firebase requires it on the web).
//
// Never log or send anywhere: the TOTP secret, the otpauth:// URL, codes, phone
// numbers, verification ids, recovery codes or tokens.

import {
  FactorId,
  getMultiFactorResolver,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  TotpMultiFactorGenerator,
  type ApplicationVerifier,
  type Auth,
  type MultiFactorError,
  type MultiFactorInfo,
  type MultiFactorResolver,
  type PhoneMultiFactorInfo,
  type TotpSecret,
  type User,
  type UserCredential
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import {
  SMS_MAX_TEXTS_PER_PROMPT,
  SMS_RESEND_COOLDOWN_SECONDS,
  checkSmsPhoneNumber,
  maskPhoneNumber,
  phoneCheckMessage,
  smsErrorMessage,
  smsFactorDisplayName
} from "@/lib/auth/smsSecondFactorRules";

/**
 * On since 29 Oct 2026: TOTP is enabled in Identity Platform and 2.3 is in the App Store (iOS + Mac) and on Play.
 * NEXT_PUBLIC_NIVADESK_TOTP_MFA=0 at build time hides the card again (an account with a factor still sees it).
 */
export const TOTP_MFA_UI_ENABLED = process.env.NEXT_PUBLIC_NIVADESK_TOTP_MFA !== "0";

/**
 * SMS-MFA: the day text-message codes open to customers. false until the owner has (1) turned SMS MFA on in
 * Identity Platform with the GB-only region policy and (2) 2.5 is in the App Store and on Play — the opening
 * commit flips it together with the guide and privacy text. NEXT_PUBLIC_NIVADESK_SMS_MFA=1 turns it on for a
 * local/emulator build only (the Dockerfile does not pass it). Only ENROLMENT hangs on it: a sign-in that asks
 * for a text-message code always works, so nobody who has one is locked out.
 */
export const SMS_MFA_OPENED = false;
export const SMS_MFA_UI_ENABLED = SMS_MFA_OPENED || process.env.NEXT_PUBLIC_NIVADESK_SMS_MFA === "1";

export const SECOND_FACTOR_CANCELLED = "nivadesk/second-factor-cancelled";
export const SECOND_FACTOR_REMOVED_BY_RECOVERY = "nivadesk/second-factor-removed";

// FactorId (a plain constant) rather than the generators' FACTOR_ID: in Firebase's Node build the phone generator is a
// stub without it, and the factor id strings are what Firebase puts in hints either way.
export const TOTP_FACTOR_ID: string = FactorId.TOTP; // "totp"
export const SMS_FACTOR_ID: string = FactorId.PHONE; // "phone"

export type SecondFactorMethod = "totp" | "phone";

export type SecondFactorAnswer =
  | { kind: "code"; code: string }
  | { kind: "switch"; method: SecondFactorMethod }
  | { kind: "resend" }
  | { kind: "recovery"; code: string; email: string }
  | { kind: "cancel" };

export type SecondFactorRequest = {
  /** Factor names the user enrolled ("Phone app", "SMS •• 0123"), for the prompt only. */
  hints: { uid: string; displayName: string; factorId: string }[];
  /** The method this prompt asks for now. */
  method: SecondFactorMethod;
  /** Every method this account can use here (the prompt offers to switch). */
  methods: SecondFactorMethod[];
  /** Last digits of the number the text went to ("•••• 0123"); "" for the authenticator app. */
  phoneHint: string;
  /** A text was sent for this prompt and can be typed in now. */
  textSent: boolean;
  /** When "Send a new code" becomes possible (epoch ms); 0 = now. Infinity = no more texts for this prompt. */
  resendAtMs: number;
  /** E-mail Firebase reported for the account, if any (recovery needs it). */
  email: string;
  /** Message from the previous attempt ("That code is not right"). */
  error: string;
  attempt: number;
};

type Presenter = (request: SecondFactorRequest) => Promise<SecondFactorAnswer>;
let presenter: Presenter | null = null;

export function registerSecondFactorPresenter(next: Presenter | null) {
  presenter = next;
}

/**
 * Makes the app verifier a text needs. Default: an invisible reCAPTCHA in a fresh hidden
 * element. Scripts swap it for a fake (the Auth emulator does not check reCAPTCHA).
 */
type VerifierFactory = (auth: Auth) => { verifier: ApplicationVerifier; dispose: () => void };
let verifierFactory: VerifierFactory = defaultVerifierFactory;
let verifierCounter = 0;

function defaultVerifierFactory(auth: Auth) {
  verifierCounter += 1;
  const element = document.createElement("div");
  element.id = `nv-sms-recaptcha-${verifierCounter}`;
  element.setAttribute("data-testid", "sms-recaptcha");
  document.body.appendChild(element);
  const verifier = new RecaptchaVerifier(auth, element, { size: "invisible" });
  return {
    verifier,
    dispose: () => {
      try {
        verifier.clear();
      } catch {
        // already cleared
      }
      element.remove();
    }
  };
}

/** Test seam: replace how the reCAPTCHA verifier is made (null = back to the default). */
export function setSmsVerifierFactory(next: VerifierFactory | null) {
  verifierFactory = next || defaultVerifierFactory;
}

async function withVerifier<T>(auth: Auth, run: (verifier: ApplicationVerifier) => Promise<T>): Promise<T> {
  const made = verifierFactory(auth);
  try {
    return await run(made.verifier);
  } finally {
    made.dispose();
  }
}

export function isMultiFactorRequired(error: unknown): error is MultiFactorError {
  return (error as { code?: string } | null)?.code === "auth/multi-factor-auth-required";
}

function codedError(code: string, message: string) {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}

const errorCode = (error: unknown) => (error as { code?: string } | null)?.code || "";

const WRONG_CODE_ERRORS = new Set(["auth/invalid-verification-code", "auth/invalid-credential", "auth/code-expired", "auth/missing-code", "auth/missing-verification-code", "auth/session-expired"]);
const MAX_ATTEMPTS = 5;

export function normalizeTotpCode(input: string) {
  const digits = String(input || "").replace(/\D/g, "");
  return digits.length === 6 ? digits : "";
}

/** Text messages use the same 6-digit shape. */
export const normalizeSmsCode = normalizeTotpCode;

/** Sends the sign-in text for this hint; returns the verification id the code is checked against. */
async function sendSignInText(auth: Auth, resolver: MultiFactorResolver, hint: MultiFactorInfo): Promise<string> {
  const provider = new PhoneAuthProvider(auth);
  return withVerifier(auth, verifier => provider.verifyPhoneNumber({ multiFactorHint: hint, session: resolver.session }, verifier));
}

/**
 * Run a sign-in / reauthenticate call; if the account has two-step
 * verification, ask for the code and finish the sign-in.
 */
export async function withSecondFactor<T extends UserCredential>(
  auth: Auth,
  run: () => Promise<T>,
  { email = "" }: { email?: string } = {}
): Promise<T | UserCredential> {
  try {
    return await run();
  } catch (error) {
    if (!isMultiFactorRequired(error)) throw error;
    const resolver = getMultiFactorResolver(auth, error);
    const totpHint = resolver.hints.find(hint => hint.factorId === TOTP_FACTOR_ID) || null;
    const phoneHint = resolver.hints.find(hint => hint.factorId === SMS_FACTOR_ID) || null;
    if (!totpHint && !phoneHint) {
      throw codedError("nivadesk/unsupported-second-factor", "This account uses a kind of two-step verification this app cannot ask for yet. Contact support.");
    }
    if (!presenter) throw error;
    const reportedEmail = String((error as MultiFactorError).customData?.email || email || "");
    const methods: SecondFactorMethod[] = [];
    if (totpHint) methods.push("totp");
    if (phoneHint) methods.push("phone");
    let method: SecondFactorMethod = totpHint ? "totp" : "phone";
    const maskedNumber = phoneHint ? maskPhoneNumber((phoneHint as PhoneMultiFactorInfo).phoneNumber || "") : "";

    // Text-message state for this prompt.
    let verificationId = "";
    let textsSent = 0;
    let resendAtMs = 0;
    let wantText = method === "phone";

    let lastError = "";
    let attempt = 0;
    let rounds = 0;
    while (attempt < MAX_ATTEMPTS && rounds < 40) {
      rounds += 1;
      if (method === "phone" && phoneHint && wantText) {
        wantText = false;
        if (textsSent >= SMS_MAX_TEXTS_PER_PROMPT) {
          lastError = "No more codes can be sent for this sign-in. Use your authenticator app or a recovery code, or start again later.";
        } else if (resendAtMs > Date.now()) {
          lastError = "Wait a moment before asking for another code.";
        } else {
          try {
            verificationId = await sendSignInText(auth, resolver, phoneHint);
            textsSent += 1;
            resendAtMs = textsSent >= SMS_MAX_TEXTS_PER_PROMPT ? Number.POSITIVE_INFINITY : Date.now() + SMS_RESEND_COOLDOWN_SECONDS * 1000;
            lastError = "";
          } catch (sendError) {
            const message = smsErrorMessage(errorCode(sendError));
            if (!message) throw sendError; // network, internal…: the caller's normal error path
            lastError = message;
            resendAtMs = Date.now() + SMS_RESEND_COOLDOWN_SECONDS * 1000;
          }
        }
      }
      const usable = method === "totp" ? [totpHint!] : [phoneHint!];
      const answer = await presenter({
        hints: usable.map(h => ({
          uid: h.uid,
          displayName: h.displayName || (h.factorId === SMS_FACTOR_ID ? "Text message" : "Authenticator app"),
          factorId: h.factorId
        })),
        method,
        methods,
        phoneHint: method === "phone" ? maskedNumber : "",
        textSent: method === "phone" && Boolean(verificationId),
        resendAtMs: method === "phone" ? resendAtMs : 0,
        email: reportedEmail,
        error: lastError,
        attempt: attempt + 1
      });
      if (answer.kind === "cancel") throw codedError(SECOND_FACTOR_CANCELLED, "");
      if (answer.kind === "switch") {
        if (answer.method !== method && methods.includes(answer.method)) {
          method = answer.method;
          lastError = "";
          // Switching to text messages sends the first text, once; switching back does not resend.
          if (method === "phone" && !verificationId) wantText = true;
        }
        continue;
      }
      if (answer.kind === "resend") {
        if (method === "phone") wantText = true;
        continue;
      }
      attempt += 1;
      if (answer.kind === "recovery") {
        const result = await redeemRecoveryCode(answer.email || reportedEmail, answer.code);
        if (result.ok) throw codedError(SECOND_FACTOR_REMOVED_BY_RECOVERY, result.message);
        lastError = result.message;
        continue;
      }
      const code = normalizeTotpCode(answer.code);
      if (!code) {
        lastError = method === "totp" ? "Enter the 6-digit code from your authenticator app." : "Enter the 6-digit code from the text message.";
        continue;
      }
      if (method === "phone" && !verificationId) {
        lastError = "Send a code first.";
        continue;
      }
      try {
        const assertion =
          method === "totp"
            ? // One authenticator per account in this version; the first TOTP hint is it.
              TotpMultiFactorGenerator.assertionForSignIn(totpHint!.uid, code)
            : PhoneMultiFactorGenerator.assertion(PhoneAuthProvider.credential(verificationId, code));
        return await resolver.resolveSignIn(assertion);
      } catch (resolveError) {
        const c = errorCode(resolveError);
        if (WRONG_CODE_ERRORS.has(c)) {
          lastError =
            method === "totp"
              ? "That code is not right, or it has expired. Codes change every 30 seconds — try the current one."
              : smsErrorMessage(c) || "That code is not right. Check the latest text message, or send a new code.";
          continue;
        }
        throw resolveError; // too-many-requests, network, …: the caller's normal error path
      }
    }
    throw codedError("auth/too-many-requests", "Too many attempts. Wait a moment and try again.");
  }
}

// ---------------------------------------------------------------- settings side

export function enrolledFactors(user: User | null): MultiFactorInfo[] {
  return user ? multiFactor(user).enrolledFactors : [];
}

export function isSmsFactor(factor: MultiFactorInfo): factor is PhoneMultiFactorInfo {
  return factor.factorId === SMS_FACTOR_ID;
}

export async function startTotpEnrollment(user: User): Promise<TotpSecret> {
  // Throws auth/requires-recent-login when the sign-in is old: the caller re-authenticates and retries.
  const session = await multiFactor(user).getSession();
  return TotpMultiFactorGenerator.generateSecret(session);
}

export function totpQrUrl(secret: TotpSecret, accountName: string) {
  return secret.generateQrCodeUrl(accountName || "NivaDesk", "NivaDesk");
}

export async function finishTotpEnrollment(user: User, secret: TotpSecret, code: string, displayName: string) {
  const clean = normalizeTotpCode(code);
  if (!clean) throw codedError("auth/invalid-verification-code", "Enter the 6-digit code from your authenticator app.");
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, clean);
  await multiFactor(user).enroll(assertion, displayName.trim().slice(0, 60) || "Authenticator app");
  // The fresh token carries firebase.sign_in_second_factor; the server gate needs it for the calls that follow.
  await user.getIdToken(true);
}

export type SmsEnrollmentStart = { verificationId: string; e164: string };

/**
 * Checks the number against the country list, then sends the enrolment text.
 * Throws auth/requires-recent-login when the sign-in is old (the caller re-authenticates and retries),
 * or a coded "nivadesk/sms-phone-refused" error whose message is the sentence to show.
 */
export async function startSmsEnrollment(auth: Auth, user: User, phoneInput: string): Promise<SmsEnrollmentStart> {
  const check = checkSmsPhoneNumber(phoneInput);
  if (!check.ok) throw codedError("nivadesk/sms-phone-refused", phoneCheckMessage(check.reason));
  const session = await multiFactor(user).getSession();
  const provider = new PhoneAuthProvider(auth);
  const verificationId = await withVerifier(auth, verifier => provider.verifyPhoneNumber({ phoneNumber: check.e164, session }, verifier));
  return { verificationId, e164: check.e164 };
}

export async function finishSmsEnrollment(user: User, start: SmsEnrollmentStart, code: string) {
  const clean = normalizeSmsCode(code);
  if (!clean) throw codedError("auth/invalid-verification-code", "Enter the 6-digit code from the text message.");
  const assertion = PhoneMultiFactorGenerator.assertion(PhoneAuthProvider.credential(start.verificationId, clean));
  await multiFactor(user).enroll(assertion, smsFactorDisplayName(start.e164));
  await user.getIdToken(true);
}

export async function removeFactor(user: User, factor: MultiFactorInfo) {
  await multiFactor(user).unenroll(factor);
}

export async function createRecoveryCodes(): Promise<string[]> {
  const call = httpsCallable<Record<string, never>, { codes: string[] }>(functions, "mfaRecoveryCodesCreate");
  return (await call({})).data.codes;
}

export async function recoveryStatus(): Promise<{ hasCodes: boolean; remaining: number; createdAtMs: number }> {
  const call = httpsCallable<Record<string, never>, { hasCodes: boolean; remaining: number; createdAtMs: number }>(functions, "mfaRecoveryStatus");
  return (await call({})).data;
}

export async function redeemRecoveryCode(email: string, code: string): Promise<{ ok: boolean; message: string }> {
  const call = httpsCallable<{ email: string; code: string }, { ok: boolean; message: string }>(functions, "mfaRecoveryRedeem");
  try {
    return (await call({ email, code })).data;
  } catch {
    return { ok: false, message: "Could not check the code. Try again in a minute." };
  }
}

export async function signOutEverywhere() {
  const call = httpsCallable<Record<string, never>, { ok: boolean }>(functions, "mfaSignOutEverywhere");
  return (await call({})).data;
}

/** Server refusal reasons from chatgptOAuthApprove / chatgptOAuthWorkspaces (GN-10 gate). */
export function secondFactorRefusalMessage(reason: string) {
  if (reason === "second_factor_required") {
    return "Two-step verification is on for this account. Sign out, sign in again and enter your two-step code, then connect.";
  }
  if (reason === "recent_sign_in_required") return "For your security, sign in again to connect.";
  if (reason === "mfa_lookup_failed") return "Could not check two-step verification. Try again in a minute.";
  return "";
}

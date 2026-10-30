"use client";

// GN-10 — two-step verification (TOTP authenticator app) on the web.
//
// Sign-in side: every sign-in / re-authentication call is wrapped in
// withSecondFactor(). When Firebase answers auth/multi-factor-auth-required,
// the one <SecondFactorPromptHost/> (mounted in app/layout.tsx) asks for the
// 6-digit code and the sign-in is finished with the resolver. Users without a
// factor never see any of this — the wrapper only reacts to that one error.
//
// Never log or send anywhere: the TOTP secret, the otpauth:// URL, codes,
// recovery codes or tokens.

import {
  getMultiFactorResolver,
  multiFactor,
  TotpMultiFactorGenerator,
  type Auth,
  type MultiFactorError,
  type MultiFactorInfo,
  type TotpSecret,
  type User,
  type UserCredential
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

/**
 * On since 29 Oct 2026: TOTP is enabled in Identity Platform and 2.3 is in the App Store (iOS + Mac) and on Play.
 * NEXT_PUBLIC_NIVADESK_TOTP_MFA=0 at build time hides the card again (an account with a factor still sees it).
 */
export const TOTP_MFA_UI_ENABLED = process.env.NEXT_PUBLIC_NIVADESK_TOTP_MFA !== "0";

export const SECOND_FACTOR_CANCELLED = "nivadesk/second-factor-cancelled";
export const SECOND_FACTOR_REMOVED_BY_RECOVERY = "nivadesk/second-factor-removed";

export type SecondFactorAnswer =
  | { kind: "code"; code: string }
  | { kind: "recovery"; code: string; email: string }
  | { kind: "cancel" };

export type SecondFactorRequest = {
  /** Factor names the user enrolled ("Phone app"), for the prompt only. */
  hints: { uid: string; displayName: string; factorId: string }[];
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

export function isMultiFactorRequired(error: unknown): error is MultiFactorError {
  return (error as { code?: string } | null)?.code === "auth/multi-factor-auth-required";
}

function codedError(code: string, message: string) {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}

const WRONG_CODE_ERRORS = new Set(["auth/invalid-verification-code", "auth/invalid-credential", "auth/code-expired", "auth/missing-code"]);
const MAX_ATTEMPTS = 5;

export function normalizeTotpCode(input: string) {
  const digits = String(input || "").replace(/\D/g, "");
  return digits.length === 6 ? digits : "";
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
    const totpHints = resolver.hints.filter(hint => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!totpHints.length) {
      throw codedError("nivadesk/unsupported-second-factor", "This account uses a kind of two-step verification this app cannot ask for yet. Contact support.");
    }
    if (!presenter) throw error;
    const reportedEmail = String((error as MultiFactorError).customData?.email || email || "");
    let lastError = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const answer = await presenter({
        hints: totpHints.map(h => ({ uid: h.uid, displayName: h.displayName || "Authenticator app", factorId: h.factorId })),
        email: reportedEmail,
        error: lastError,
        attempt
      });
      if (answer.kind === "cancel") throw codedError(SECOND_FACTOR_CANCELLED, "");
      if (answer.kind === "recovery") {
        const result = await redeemRecoveryCode(answer.email || reportedEmail, answer.code);
        if (result.ok) throw codedError(SECOND_FACTOR_REMOVED_BY_RECOVERY, result.message);
        lastError = result.message;
        continue;
      }
      const code = normalizeTotpCode(answer.code);
      if (!code) {
        lastError = "Enter the 6-digit code from your authenticator app.";
        continue;
      }
      try {
        // One TOTP factor per account in this version; the first hint is it.
        const assertion = TotpMultiFactorGenerator.assertionForSignIn(totpHints[0].uid, code);
        return await resolver.resolveSignIn(assertion);
      } catch (resolveError) {
        const c = (resolveError as { code?: string })?.code || "";
        if (WRONG_CODE_ERRORS.has(c)) {
          lastError = "That code is not right, or it has expired. Codes change every 30 seconds — try the current one.";
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
    return "Two-step verification is on for this account. Sign out, sign in again and enter your authenticator code, then connect.";
  }
  if (reason === "recent_sign_in_required") return "For your security, sign in again to connect.";
  if (reason === "mfa_lookup_failed") return "Could not check two-step verification. Try again in a minute.";
  return "";
}

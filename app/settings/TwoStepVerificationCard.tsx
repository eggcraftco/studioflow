"use client";

// GN-10 — Settings ▸ Profile & Security ▸ Two-step verification (authenticator app, TOTP).
//
// Shown unless NEXT_PUBLIC_NIVADESK_TOTP_MFA=0, AND only when the active workspace role is owner or
// admin (owner instruction 23 Oct: optional, owners/admins first), and ALWAYS when the
// account already has a factor (so nobody is left unable to see or remove one).
// Enrolment needs a tick that the person's NivaDesk apps are on NATIVE_MFA_MIN_VERSION+:
// older iOS/Mac/Android builds cannot finish a sign-in that asks for the code.
// Never logs or stores the secret, the otpauth URL, codes or recovery codes;
// the secret lives only in this component's state until enrolment ends.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  type MultiFactorInfo,
  type TotpSecret
} from "firebase/auth";
import { auth, appleProvider, googleProvider } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { signOutAndWipe } from "@/lib/auth/signOutSession";
import { studioT } from "@/lib/studioflow/language";
import { friendlyErrorMessage } from "@/lib/studioflow/friendlyError";
import {
  SECOND_FACTOR_CANCELLED,
  TOTP_MFA_UI_ENABLED,
  createRecoveryCodes,
  enrolledFactors,
  finishTotpEnrollment,
  recoveryStatus,
  removeFactor,
  signOutEverywhere,
  startTotpEnrollment,
  totpQrUrl,
  withSecondFactor
} from "@/lib/auth/secondFactor";
import { NATIVE_MFA_MIN_VERSION, canOfferTotpEnrollment, shouldShowTwoStepCard } from "@/lib/auth/secondFactorPolicy";

type Step =
  | { kind: "idle" }
  | { kind: "reauth"; then: "enroll" | "remove" | "codes"; factor?: MultiFactorInfo }
  | { kind: "enroll"; secret: TotpSecret; qr: string; key: string }
  | { kind: "codes"; codes: string[] };

const code = (error: unknown) => (error as { code?: string } | null)?.code || "";

export function TwoStepVerificationCard({ language = "English", workspaceRole = "" }: { language?: string; workspaceRole?: string }) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const { user } = useAuth();
  const [factors, setFactors] = useState<MultiFactorInfo[]>([]);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [appsUpdated, setAppsUpdated] = useState(false);

  const refresh = useCallback(async () => {
    setFactors(enrolledFactors(auth.currentUser));
    if (enrolledFactors(auth.currentUser).length) {
      try {
        setRemaining((await recoveryStatus()).remaining);
      } catch {
        setRemaining(null);
      }
    } else {
      setRemaining(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, user]);

  if (!user) return null;
  const policy = { flagOn: TOTP_MFA_UI_ENABLED, role: workspaceRole, factorCount: factors.length };
  if (!shouldShowTwoStepCard(policy)) return null;
  const mayEnroll = canOfferTotpEnrollment(policy);

  const providerIds = user.providerData.map(p => p.providerId);
  const hasPassword = providerIds.includes("password");
  const hasGoogle = providerIds.includes("google.com");
  const hasApple = providerIds.includes("apple.com");
  const accountName = user.email || "NivaDesk";

  function fail(err: unknown, fallback: string) {
    if (code(err) === SECOND_FACTOR_CANCELLED) return;
    setError(friendlyErrorMessage(err, t) || t(fallback));
  }

  async function beginEnroll() {
    setError("");
    setNotice("");
    if (!user || !canOfferTotpEnrollment({ flagOn: TOTP_MFA_UI_ENABLED, role: workspaceRole, factorCount: enrolledFactors(auth.currentUser).length })) return;
    if (!user.emailVerified) {
      setError(t("Verify your email address first. Two-step verification needs a verified email."));
      return;
    }
    setBusy(true);
    try {
      const secret = await startTotpEnrollment(user);
      const url = totpQrUrl(secret, accountName);
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 196 });
      setStep({ kind: "enroll", secret, qr, key: secret.secretKey });
      setOtp("");
    } catch (err) {
      if (code(err) === "auth/requires-recent-login") setStep({ kind: "reauth", then: "enroll" });
      else if (code(err) === "auth/unverified-email") setError(t("Verify your email address first. Two-step verification needs a verified email."));
      else if (code(err) === "auth/operation-not-allowed") setError(t("Two-step verification is not available yet."));
      else fail(err, "Could not start two-step verification.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll(event: FormEvent) {
    event.preventDefault();
    if (!user || step.kind !== "enroll") return;
    setBusy(true);
    setError("");
    try {
      await finishTotpEnrollment(user, step.secret, otp, deviceName || t("Authenticator app"));
      // Straight into recovery codes: the fresh token has the second factor and a new auth_time.
      const codes = await createRecoveryCodes().catch(() => [] as string[]);
      // Refresh after the codes exist, or the count reads the pre-enrolment "0 left".
      await refresh();
      setStep(codes.length ? { kind: "codes", codes } : { kind: "idle" });
      setNotice(t("Two-step verification is on. Next time you sign in, NivaDesk asks for a code from your authenticator app."));
    } catch (err) {
      if (code(err) === "auth/invalid-verification-code") setError(t("That code is not right, or it has expired. Codes change every 30 seconds — try the current one."));
      else fail(err, "Could not turn on two-step verification.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(factor: MultiFactorInfo) {
    if (!user) return;
    if (!window.confirm(t("Turn off two-step verification for this authenticator? Your account will be protected by your password only."))) return;
    setBusy(true);
    setError("");
    try {
      await removeFactor(user, factor);
      await refresh();
      setNotice(t("Two-step verification was removed."));
    } catch (err) {
      if (code(err) === "auth/requires-recent-login") setStep({ kind: "reauth", then: "remove", factor });
      else if (code(err) === "auth/user-token-expired") {
        // Removing the factor you signed in with ends this session (Firebase behaviour).
        // Through the shared sign-out so this browser's Firestore copy goes too (audit #17).
        await signOutAndWipe({ destination: "/login" }).catch(() => window.location.assign("/login"));
      } else fail(err, "Could not remove two-step verification.");
    } finally {
      setBusy(false);
    }
  }

  async function newCodes() {
    setBusy(true);
    setError("");
    try {
      setStep({ kind: "codes", codes: await createRecoveryCodes() });
      await refresh();
    } catch (err) {
      const reason = (err as { details?: { reason?: string } })?.details?.reason || "";
      if (reason === "recent_sign_in_required" || reason === "second_factor_required") setStep({ kind: "reauth", then: "codes" });
      else fail(err, "Could not make recovery codes.");
    } finally {
      setBusy(false);
    }
  }

  async function endOtherSessions() {
    if (!window.confirm(t("Sign out on every device, including this one? You sign in again with your password and authenticator code."))) return;
    setBusy(true);
    try {
      await signOutEverywhere();
      await signOutAndWipe({ destination: "/login" }).catch(() => window.location.assign("/login"));
    } catch (err) {
      fail(err, "Could not sign out everywhere.");
      setBusy(false);
    }
  }

  async function reauth(event?: FormEvent, provider?: "google" | "apple") {
    event?.preventDefault();
    if (!user || step.kind !== "reauth") return;
    const then = step.then;
    const factor = step.factor;
    setBusy(true);
    setError("");
    try {
      if (provider) {
        await withSecondFactor(auth, () => reauthenticateWithPopup(user, provider === "apple" ? appleProvider : googleProvider));
      } else {
        await withSecondFactor(auth, () => reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email || "", password)), { email: user.email || "" });
      }
      setPassword("");
      setStep({ kind: "idle" });
      setBusy(false);
      if (then === "enroll") await beginEnroll();
      else if (then === "remove" && factor) await remove(factor);
      else if (then === "codes") await newCodes();
    } catch (err) {
      fail(err, "Could not confirm it is you.");
      setBusy(false);
    }
  }

  function downloadCodes(codes: string[]) {
    const text = `NivaDesk recovery codes for ${accountName}\nEach code works once. Keep them somewhere safe.\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "nivadesk-recovery-codes.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="card app-card settings-security-card" data-testid="two-step-card">
      <div className="settings-security-item">
        <strong>{t("Two-step verification")}</strong>
        <p className="muted-copy">
          {factors.length
            ? t("On. Signing in asks for a 6-digit code from your authenticator app. AI assistant connections (ChatGPT, Claude) can only be approved after the code.")
            : t("Add a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Apple Passwords…) to your password, Google or Apple sign-in.")}
        </p>
      </div>

      {factors.map(factor => (
        <div className="settings-security-item" key={factor.uid}>
          <strong>{factor.displayName || t("Authenticator app")}</strong>
          <p className="muted-copy">{t("Added")} {new Date(factor.enrollmentTime).toLocaleDateString()}</p>
          <div className="settings-action-row">
            <button className="button secondary" type="button" disabled={busy} onClick={() => void remove(factor)}>{t("Remove")}</button>
          </div>
        </div>
      ))}

      {step.kind === "idle" && mayEnroll ? (
        <div className="settings-field-stack" data-testid="two-step-native-notice">
          <p className="muted-copy">{t("Before you turn this on, update NivaDesk on your iPhone, iPad, Mac and Android devices to version {version} or later. Older versions cannot finish a sign-in that asks for a code; devices that are already signed in keep working.").replace("{version}", NATIVE_MFA_MIN_VERSION)}</p>
          <label className="settings-inline-row">
            <input type="checkbox" checked={appsUpdated} onChange={e => setAppsUpdated(e.target.checked)} disabled={busy} />
            <span>{t("My NivaDesk apps are up to date")}</span>
          </label>
        </div>
      ) : null}

      {step.kind === "idle" && mayEnroll ? (
        <div className="settings-action-row">
          {!user.emailVerified ? (
            <button className="button secondary" type="button" disabled={busy} onClick={() => void sendEmailVerification(user, { url: "https://nivadesk.app/settings" }).then(() => setNotice(t("Check your inbox for the verification link.")))}>
              {t("Send verification email")}
            </button>
          ) : null}
          <button className="button" type="button" disabled={busy || !appsUpdated} onClick={() => void beginEnroll()}>{t("Set up authenticator app")}</button>
        </div>
      ) : null}

      {factors.length > 0 ? (
        <p className="muted-copy" data-testid="two-step-ai-note">{t("ChatGPT and Claude connections you approved before stay connected, also after Sign out everywhere. To end them, use Disconnect on the ChatGPT and Claude cards in Settings › Integrations.")}</p>
      ) : null}

      {step.kind === "idle" && factors.length > 0 ? (
        <div className="settings-action-row settings-action-row-split">
          <button className="button secondary" type="button" disabled={busy} onClick={() => void newCodes()}>
            {t("Make new recovery codes")}{remaining !== null ? ` (${t("{count} left").replace("{count}", String(remaining))})` : ""}
          </button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => void endOtherSessions()}>{t("Sign out everywhere")}</button>
        </div>
      ) : null}

      {step.kind === "enroll" ? (
        <form className="settings-field-stack" onSubmit={confirmEnroll}>
          <p className="muted-copy">{t("1. Scan this code with your authenticator app, or type the key.")}</p>
          <img src={step.qr} alt={t("QR code for your authenticator app")} width={196} height={196} />
          <code aria-label={t("Setup key")} style={{ wordBreak: "break-all", userSelect: "all" }}>{step.key}</code>
          <label className="settings-field">
            <span className="settings-field-label">{t("2. Enter the 6-digit code it shows")}</span>
            <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={otp} onChange={e => setOtp(e.target.value)} disabled={busy} />
          </label>
          <label className="settings-field">
            <span className="settings-field-label">{t("Name (optional)")}</span>
            <input className="input" value={deviceName} maxLength={60} placeholder={t("e.g. My iPhone")} onChange={e => setDeviceName(e.target.value)} disabled={busy} />
          </label>
          <div className="settings-action-row">
            <button className="button secondary" type="button" disabled={busy} onClick={() => setStep({ kind: "idle" })}>{t("Cancel")}</button>
            <button className="button" type="submit" disabled={busy || !otp.trim()}>{busy ? t("Checking...") : t("Turn on")}</button>
          </div>
        </form>
      ) : null}

      {step.kind === "codes" ? (
        <div className="settings-field-stack" data-testid="recovery-codes">
          <strong>{t("Recovery codes")}</strong>
          <p className="muted-copy">{t("If you lose your phone, each of these codes turns two-step verification off once. They are shown only now — save them somewhere safe. Making new codes cancels these.")}</p>
          <pre style={{ userSelect: "all", columns: 2 }}>{step.codes.join("\n")}</pre>
          <div className="settings-action-row">
            <button className="button secondary" type="button" onClick={() => void navigator.clipboard?.writeText(step.codes.join("\n"))}>{t("Copy")}</button>
            <button className="button secondary" type="button" onClick={() => downloadCodes(step.codes)}>{t("Download")}</button>
            <button className="button" type="button" onClick={() => setStep({ kind: "idle" })}>{t("I saved them")}</button>
          </div>
        </div>
      ) : null}

      {step.kind === "reauth" ? (
        <div className="settings-field-stack">
          <p className="muted-copy">{t("For your security, confirm it is you first.")}</p>
          {hasPassword ? (
            <form className="settings-inline-row" onSubmit={e => void reauth(e)}>
              <input className="input" type="password" autoComplete="current-password" placeholder={t("Password")} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
              <button className="button" type="submit" disabled={busy || !password}>{t("Continue")}</button>
            </form>
          ) : null}
          {!hasPassword && hasGoogle ? <button className="button" type="button" disabled={busy} onClick={() => void reauth(undefined, "google")}>{t("Continue with Google")}</button> : null}
          {!hasPassword && hasApple ? <button className="button" type="button" disabled={busy} onClick={() => void reauth(undefined, "apple")}>{t("Continue with Apple")}</button> : null}
          <button className="button secondary" type="button" disabled={busy} onClick={() => setStep({ kind: "idle" })}>{t("Cancel")}</button>
        </div>
      ) : null}

      {notice ? <p className="success-copy">{notice}</p> : null}
      {error ? <p className="layout-error" role="alert">{error}</p> : null}
    </section>
  );
}

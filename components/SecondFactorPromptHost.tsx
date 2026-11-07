"use client";

// GN-10 — the one place that asks for the two-step code during sign-in
// or re-authentication (lib/auth/secondFactor.ts → withSecondFactor). Rendered
// once at the app root. Reuses the session-lock dialog styles.
// SMS-MFA (7 Nov 2026): the code can also come by text message; the prompt names the
// last digits of the number, offers "Send a new code" after a short wait, and lets an
// account with both methods switch between the authenticator app and texts.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useStudioT } from "@/lib/studioflow/useStudioT";
import type { SecondFactorAnswer, SecondFactorRequest } from "@/lib/auth/secondFactor";
import { resendSecondsLeft } from "@/lib/auth/smsSecondFactorRules";
// Registered when Firebase is loaded (lib/firebase/lazy.ts): a sign-in can only ask for the code after that.
import { whenFirebaseKitLoaded, type FirebaseKit } from "@/lib/firebase/lazy";

type Pending = { request: SecondFactorRequest; resolve: (answer: SecondFactorAnswer) => void };

export function SecondFactorPromptHost() {
  const { language } = useAuth();
  const t = useStudioT(language);
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const pendingRef = useRef<Pending | null>(null);

  useEffect(() => {
    let registerSecondFactorPresenter: FirebaseKit["registerSecondFactorPresenter"] | null = null;
    const cancel = whenFirebaseKitLoaded(kit => {
      registerSecondFactorPresenter = kit.registerSecondFactorPresenter;
      registerSecondFactorPresenter(request => new Promise<SecondFactorAnswer>(resolve => {
        const next = { request, resolve };
        pendingRef.current = next;
        setCode("");
        setRecoveryEmail(request.email);
        setNow(Date.now());
        setPending(next);
      }));
    });
    return () => {
      cancel();
      registerSecondFactorPresenter?.(null);
      pendingRef.current?.resolve({ kind: "cancel" });
    };
  }, []);

  // The "Send a new code in 25 s" countdown.
  const waiting = pending && pending.request.method === "phone" ? resendSecondsLeft(pending.request.resendAtMs, now) : 0;
  useEffect(() => {
    if (!waiting || !Number.isFinite(waiting)) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(timer);
  }, [waiting, now]);

  function answer(value: SecondFactorAnswer) {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    setCode("");
    current?.resolve(value);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (useRecovery) answer({ kind: "recovery", code, email: recoveryEmail.trim() });
    else answer({ kind: "code", code });
  }

  if (!pending) return null;
  const { request } = pending;
  const sms = request.method === "phone";
  const canSwitchToSms = !sms && request.methods.includes("phone");
  const canSwitchToApp = sms && request.methods.includes("totp");
  const noMoreTexts = sms && request.resendAtMs === Number.POSITIVE_INFINITY;

  let copy: string;
  if (useRecovery) {
    copy = t("Enter one of the recovery codes you saved. It turns two-step verification off; you then sign in with your password and can turn it on again.");
  } else if (sms) {
    copy = request.textSent
      ? t("We sent a 6-digit code by text message to {number}. Enter it here.").replace("{number}", request.phoneHint || "••••")
      : t("We send a 6-digit code by text message to {number}.").replace("{number}", request.phoneHint || "••••");
  } else {
    copy = t("Open your authenticator app and enter the 6-digit code for NivaDesk.") + (request.hints[0]?.displayName ? ` (${request.hints[0].displayName})` : "");
  }

  return (
    <div className="session-lock-overlay" role="dialog" aria-modal="true" aria-label={t("Two-step verification")} data-testid="second-factor-prompt" data-method={request.method}>
      <div className="card session-lock-card">
        <h2 className="session-lock-title">{t("Two-step verification")}</h2>
        <p className="session-lock-copy" data-testid="second-factor-copy">{copy}</p>
        <form className="session-lock-form" onSubmit={submit}>
          {useRecovery && !request.email ? (
            <input
              className="input"
              type="email"
              autoComplete="email"
              placeholder={t("Email")}
              value={recoveryEmail}
              onChange={event => setRecoveryEmail(event.target.value)}
            />
          ) : null}
          <input
            className="input"
            autoFocus
            inputMode={useRecovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            pattern={useRecovery ? undefined : "[0-9 ]*"}
            maxLength={useRecovery ? 16 : 7}
            placeholder={useRecovery ? "XXXXX-XXXXX" : "123 456"}
            aria-label={useRecovery ? t("Recovery code") : sms ? t("Text message code") : t("Authenticator code")}
            data-testid="second-factor-code"
            value={code}
            onChange={event => setCode(event.target.value)}
          />
          <button className="button session-lock-button" type="submit" disabled={!code.trim()} data-testid="second-factor-submit">
            {useRecovery ? t("Use recovery code") : t("Verify")}
          </button>
        </form>
        {request.error ? <p className="session-lock-error" role="alert" data-testid="second-factor-error">{t(request.error)}</p> : null}
        {sms && !useRecovery && !noMoreTexts ? (
          <button
            className="session-lock-signout"
            type="button"
            data-testid="second-factor-resend"
            disabled={waiting > 0}
            onClick={() => answer({ kind: "resend" })}
          >
            {waiting > 0 ? t("Send a new code in {seconds} s").replace("{seconds}", String(waiting)) : request.textSent ? t("Send a new code") : t("Send the code")}
          </button>
        ) : null}
        {useRecovery ? <p className="session-lock-copy" data-testid="second-factor-support">{t("No recovery codes? Email contact@nivadesk.co.uk from your account's email address.")}</p> : null}
        {!useRecovery && canSwitchToSms ? (
          <button className="session-lock-signout" type="button" data-testid="second-factor-use-sms" onClick={() => answer({ kind: "switch", method: "phone" })}>
            {t("Text me a code instead")}
          </button>
        ) : null}
        {!useRecovery && canSwitchToApp ? (
          <button className="session-lock-signout" type="button" data-testid="second-factor-use-app" onClick={() => answer({ kind: "switch", method: "totp" })}>
            {t("Use my authenticator app instead")}
          </button>
        ) : null}
        <button className="session-lock-signout" type="button" data-testid="second-factor-toggle-recovery" onClick={() => { setUseRecovery(v => !v); setCode(""); }}>
          {useRecovery ? (sms ? t("Use a text message code instead") : t("Use my authenticator app instead")) : t("Lost your phone? Use a recovery code")}
        </button>
        <button className="session-lock-signout" type="button" onClick={() => answer({ kind: "cancel" })}>
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}

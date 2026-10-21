"use client";

// GN-10 — the one place that asks for the authenticator code during sign-in
// or re-authentication (lib/auth/secondFactor.ts → withSecondFactor). Rendered
// once at the app root. Reuses the session-lock dialog styles.

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import {
  registerSecondFactorPresenter,
  type SecondFactorAnswer,
  type SecondFactorRequest
} from "@/lib/auth/secondFactor";

type Pending = { request: SecondFactorRequest; resolve: (answer: SecondFactorAnswer) => void };

export function SecondFactorPromptHost() {
  const { language } = useAuth();
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const pendingRef = useRef<Pending | null>(null);

  useEffect(() => {
    registerSecondFactorPresenter(request => new Promise<SecondFactorAnswer>(resolve => {
      const next = { request, resolve };
      pendingRef.current = next;
      setCode("");
      setRecoveryEmail(request.email);
      setPending(next);
    }));
    return () => {
      registerSecondFactorPresenter(null);
      pendingRef.current?.resolve({ kind: "cancel" });
    };
  }, []);

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

  return (
    <div className="session-lock-overlay" role="dialog" aria-modal="true" aria-label={t("Two-step verification")}>
      <div className="card session-lock-card">
        <h2 className="session-lock-title">{t("Two-step verification")}</h2>
        {useRecovery ? (
          <p className="session-lock-copy">
            {t("Enter one of the recovery codes you saved. It turns two-step verification off; you then sign in with your password and can turn it on again.")}
          </p>
        ) : (
          <p className="session-lock-copy">
            {t("Open your authenticator app and enter the 6-digit code for NivaDesk.")}
            {request.hints[0]?.displayName ? ` (${request.hints[0].displayName})` : ""}
          </p>
        )}
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
            aria-label={useRecovery ? t("Recovery code") : t("Authenticator code")}
            value={code}
            onChange={event => setCode(event.target.value)}
          />
          <button className="button session-lock-button" type="submit" disabled={!code.trim()}>
            {useRecovery ? t("Use recovery code") : t("Verify")}
          </button>
        </form>
        {request.error ? <p className="session-lock-error" role="alert">{t(request.error)}</p> : null}
        <button className="session-lock-signout" type="button" onClick={() => { setUseRecovery(v => !v); setCode(""); }}>
          {useRecovery ? t("Use my authenticator app instead") : t("Lost your phone? Use a recovery code")}
        </button>
        <button className="session-lock-signout" type="button" onClick={() => answer({ kind: "cancel" })}>
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}

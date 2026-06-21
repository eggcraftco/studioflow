"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
  type AuthProvider as FirebaseAuthProvider
} from "firebase/auth";
import { auth, googleProvider, appleProvider } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import {
  AUTO_LOCK_CHANGED_EVENT,
  AUTO_LOCK_MINUTES_KEY,
  getAutoLockMinutes
} from "@/lib/auth/sessionLock";

// Watches for inactivity and, once the per-device interval elapses, drops a
// full-screen lock over the app. The session stays signed in — the user simply
// re-authenticates (password or their sign-in provider) to continue, mirroring the
// native app-lock. Rendered once at the app root, inside AuthProvider.
export function SessionAutoLock() {
  const { user, language } = useAuth();
  const t = useCallback((text: string) => studioT(text, language), [language]);

  const [minutes, setMinutes] = useState(0);
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lastActivityRef = useRef(Date.now());

  // Keep the interval in sync with the saved preference (this tab + other tabs).
  useEffect(() => {
    const sync = () => setMinutes(getAutoLockMinutes());
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTO_LOCK_MINUTES_KEY) sync();
    };
    window.addEventListener(AUTO_LOCK_CHANGED_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AUTO_LOCK_CHANGED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Clear the lock whenever the user signs out.
  useEffect(() => {
    if (!user) {
      setLocked(false);
      setPassword("");
      setError("");
    }
  }, [user]);

  // Activity tracking + idle polling.
  useEffect(() => {
    if (!user || minutes <= 0 || locked) return;

    lastActivityRef.current = Date.now();
    const thresholdMs = minutes * 60_000;
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    const checkIdle = () => {
      if (Date.now() - lastActivityRef.current >= thresholdMs) setLocked(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") checkIdle();
    };

    const events: string[] = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
    events.forEach(event => window.addEventListener(event, markActive, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(checkIdle, 5_000);

    return () => {
      events.forEach(event => window.removeEventListener(event, markActive));
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [user, minutes, locked]);

  const finishUnlock = useCallback(() => {
    setPassword("");
    setError("");
    lastActivityRef.current = Date.now();
    setLocked(false);
  }, []);

  const providerIds = user?.providerData.map(provider => provider.providerId) ?? [];
  const hasPassword = providerIds.includes("password");
  const hasGoogle = providerIds.includes("google.com");
  const hasApple = providerIds.includes("apple.com");

  async function handlePasswordUnlock(event: FormEvent) {
    event.preventDefault();
    if (!user || !user.email || busy) return;
    setBusy(true);
    setError("");
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      finishUnlock();
    } catch {
      setError(t("Incorrect password. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleProviderUnlock(provider: FirebaseAuthProvider) {
    if (!user || busy) return;
    setBusy(true);
    setError("");
    try {
      await reauthenticateWithPopup(user, provider);
      finishUnlock();
    } catch {
      setError(t("Could not unlock. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch {
      // Ignore — the auth listener will reconcile state.
    }
  }

  if (!user || !locked) return null;

  return (
    <div className="session-lock-overlay" role="dialog" aria-modal="true" aria-label={t("NivaDesk is locked")}>
      <div className="card session-lock-card">
        <div className="session-lock-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
            <circle cx="12" cy="15.5" r="1.3" />
          </svg>
        </div>
        <h2 className="session-lock-title">{t("NivaDesk is locked")}</h2>
        <p className="session-lock-copy">{t("Locked after inactivity. Re-authenticate to continue — you stay signed in.")}</p>

        {hasPassword ? (
          <form className="session-lock-form" onSubmit={handlePasswordUnlock}>
            <input
              className="input"
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder={t("Password")}
              value={password}
              disabled={busy}
              onChange={event => setPassword(event.target.value)}
            />
            <button className="button session-lock-button" type="submit" disabled={busy || !password}>
              {busy ? t("Unlocking...") : t("Unlock")}
            </button>
          </form>
        ) : null}

        {!hasPassword && hasGoogle ? (
          <button className="button session-lock-button" type="button" disabled={busy} onClick={() => handleProviderUnlock(googleProvider)}>
            {busy ? t("Unlocking...") : t("Unlock with Google")}
          </button>
        ) : null}

        {!hasPassword && hasApple ? (
          <button className="button session-lock-button" type="button" disabled={busy} onClick={() => handleProviderUnlock(appleProvider)}>
            {busy ? t("Unlocking...") : t("Unlock with Apple")}
          </button>
        ) : null}

        {error ? <p className="session-lock-error">{error}</p> : null}

        <button className="session-lock-signout" type="button" onClick={handleSignOut} disabled={busy}>
          {t("Sign out instead")}
        </button>
      </div>
    </div>
  );
}

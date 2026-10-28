"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  type AuthProvider as FirebaseAuthProvider
} from "firebase/auth";
import { googleProvider, appleProvider } from "@/lib/firebase/client";
import { signOutAndWipe, UNSYNCED_SIGN_OUT_TEXT } from "@/lib/auth/signOutSession";
import { useAppConfirm } from "@/components/AppConfirmDialog";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import {
  ACTIVITY_WRITE_GAP_MS,
  AUTO_LOCK_CHANGED_EVENT,
  AUTO_LOCK_MINUTES_KEY,
  getAutoLockMinutes,
  readSessionActivity,
  readSessionLockedAt,
  sessionLockedAtKey,
  shouldStartLocked,
  writeSessionActivity,
  writeSessionLockedAt
} from "@/lib/auth/sessionLock";
import { REAUTH_REQUEST_EVENT, type ReauthRequestDetail } from "@/lib/auth/recentAuth";

// Watches for inactivity and, once the per-device interval elapses, drops a
// full-screen lock over the app. The session stays signed in — the user simply
// re-authenticates (password or their sign-in provider) to continue, mirroring the
// native app-lock. Rendered once at the app root, inside AuthProvider.
//
// The lock survives a reload and reaches every tab (lib/auth/sessionLock.ts,
// audit #46). The same card also answers "is it still you?" before an action
// that cannot be undone (lib/auth/recentAuth.ts): same re-authentication, with
// Cancel instead of Sign out.
export function SessionAutoLock() {
  const { user, language } = useAuth();
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const [confirmSignOut, signOutConfirmDialog] = useAppConfirm(t);

  const [minutes, setMinutes] = useState(0);
  const [locked, setLocked] = useState(false);
  const [reauthRequest, setReauthRequest] = useState<ReauthRequestDetail | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lastActivityRef = useRef(Date.now());
  const lastActivityWriteRef = useRef(0);
  const uid = user?.uid ?? "";
  const lastSignInMs = user?.metadata.lastSignInTime ? Date.parse(user.metadata.lastSignInTime) || 0 : 0;

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
      setReauthRequest(current => {
        current?.resolve(false);
        return null;
      });
    }
  }, [user]);

  // A page that loads (F5, a new tab) for an account whose lock is down, or
  // after the idle interval passed in every tab, starts locked. Layout effect,
  // so nothing behind the lock is painted first.
  useLayoutEffect(() => {
    if (!uid) return;
    const startLocked = shouldStartLocked({
      lockedAt: readSessionLockedAt(uid),
      lastActivity: readSessionActivity(uid),
      lastSignIn: lastSignInMs,
      minutes: getAutoLockMinutes(),
      now: Date.now()
    });
    if (startLocked) {
      writeSessionLockedAt(uid, readSessionLockedAt(uid) || Date.now());
      setLocked(true);
    } else {
      lastActivityRef.current = Date.now();
      writeSessionActivity(uid, lastActivityRef.current);
      lastActivityWriteRef.current = lastActivityRef.current;
    }
  }, [uid, lastSignInMs]);

  // Another tab locked or unlocked this account.
  useEffect(() => {
    if (!uid) return;
    const key = sessionLockedAtKey(uid);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      if (event.newValue) {
        setLocked(true);
      } else {
        setLocked(false);
        setPassword("");
        setError("");
        lastActivityRef.current = Date.now();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [uid]);

  const lockNow = useCallback(() => {
    if (uid) writeSessionLockedAt(uid, Date.now());
    setLocked(true);
  }, [uid]);

  // Activity tracking + idle polling. Activity is shared through localStorage,
  // so the idle time is the whole browser's, not this tab's alone.
  useEffect(() => {
    if (!user || minutes <= 0 || locked) return;

    lastActivityRef.current = Math.max(lastActivityRef.current, readSessionActivity(uid));
    const thresholdMs = minutes * 60_000;
    const markActive = () => {
      const now = Date.now();
      lastActivityRef.current = now;
      if (now - lastActivityWriteRef.current >= ACTIVITY_WRITE_GAP_MS) {
        lastActivityWriteRef.current = now;
        writeSessionActivity(uid, now);
      }
    };
    const checkIdle = () => {
      const lastSeen = Math.max(lastActivityRef.current, readSessionActivity(uid));
      if (Date.now() - lastSeen >= thresholdMs) lockNow();
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
  }, [user, uid, minutes, locked, lockNow]);

  // "Is it still you?" before an action that cannot be undone.
  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<ReauthRequestDetail>).detail;
      if (!detail || typeof detail.resolve !== "function") return;
      if (!user) return;
      detail.handled = true;
      setPassword("");
      setError("");
      setReauthRequest(current => {
        current?.resolve(false);
        return detail;
      });
    };
    window.addEventListener(REAUTH_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(REAUTH_REQUEST_EVENT, onRequest);
  }, [user]);

  const finishUnlock = useCallback(() => {
    setPassword("");
    setError("");
    const now = Date.now();
    lastActivityRef.current = now;
    lastActivityWriteRef.current = now;
    if (uid) {
      writeSessionLockedAt(uid, null);
      writeSessionActivity(uid, now);
    }
    setLocked(false);
    // A re-authentication answers a waiting "is it still you?" too.
    setReauthRequest(current => {
      current?.resolve(true);
      return null;
    });
  }, [uid]);

  const cancelReauth = useCallback(() => {
    setPassword("");
    setError("");
    setReauthRequest(current => {
      current?.resolve(false);
      return null;
    });
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
      // The lock screen's sign-out is a sign-out like any other
      // (lib/auth/signOutSession.ts): the browser's Firestore copy goes with
      // it, after asking about writes that have not reached the server.
      await signOutAndWipe({
        confirmUnsynced: () => confirmSignOut({
          title: t(UNSYNCED_SIGN_OUT_TEXT.title),
          message: t(UNSYNCED_SIGN_OUT_TEXT.message),
          cancelLabel: t(UNSYNCED_SIGN_OUT_TEXT.stay),
          confirmLabel: t(UNSYNCED_SIGN_OUT_TEXT.leave),
          danger: true
        })
      });
    } catch {
      // Ignore — the auth listener will reconcile state.
    }
  }

  if (!user || (!locked && !reauthRequest)) return null;
  const confirming = !locked && Boolean(reauthRequest);
  const title = confirming ? t("Confirm it's you") : t("NivaDesk is locked");

  return (
    <div className="session-lock-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="card session-lock-card">
        <div className="session-lock-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
            <circle cx="12" cy="15.5" r="1.3" />
          </svg>
        </div>
        <h2 className="session-lock-title">{title}</h2>
        <p className="session-lock-copy">
          {confirming
            ? t("This cannot be undone, so NivaDesk checks it is still you. Re-authenticate to continue.")
            : t("Locked after inactivity. Re-authenticate to continue, you stay signed in.")}
        </p>

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
              {busy ? t("Unlocking...") : confirming ? t("Confirm") : t("Unlock")}
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

        {error ? <p className="session-lock-error">{t(error)}</p> : null}

        {confirming ? (
          <button className="session-lock-signout" type="button" onClick={cancelReauth} disabled={busy}>
            {t("Cancel")}
          </button>
        ) : (
          <button className="session-lock-signout" type="button" onClick={handleSignOut} disabled={busy}>
            {t("Sign out instead")}
          </button>
        )}
      </div>
      {signOutConfirmDialog}
    </div>
  );
}

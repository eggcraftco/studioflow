"use client";

// Branded Firebase Auth action handler. Set each email template's
// "Customise action URL" to https://nivadesk.app/auth/action so verification
// and password-reset links live on our own domain instead of firebaseapp.com.

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  applyActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";

type Phase =
  | "working"
  | "verified"
  | "resetForm"
  | "resetDone"
  | "recovered"
  | "error";

function AuthActionContent() {
  const params = useSearchParams();
  const mode = params.get("mode") ?? "";
  const oobCode = params.get("oobCode") ?? "";

  const [phase, setPhase] = useState<Phase>("working");
  const [message, setMessage] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!oobCode) {
        setPhase("error");
        setMessage("This link is missing its security code. Open the link from the email again.");
        return;
      }
      try {
        if (mode === "verifyEmail") {
          await applyActionCode(auth, oobCode);
          if (!cancelled) setPhase("verified");
        } else if (mode === "resetPassword") {
          const email = await verifyPasswordResetCode(auth, oobCode);
          if (!cancelled) {
            setResetEmail(email);
            setPhase("resetForm");
          }
        } else if (mode === "recoverEmail") {
          await applyActionCode(auth, oobCode);
          if (!cancelled) setPhase("recovered");
        } else {
          if (!cancelled) {
            setPhase("error");
            setMessage("Unknown action. Open the link from the email again.");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setPhase("error");
          setMessage(
            error instanceof Error && /expired|invalid/i.test(error.message)
              ? "This link has expired or was already used. Request a new email from the app."
              : error instanceof Error
                ? error.message
                : "Something went wrong. Request a new email from the app."
          );
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [mode, oobCode]);

  async function submitNewPassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setMessage("Password must be at least 8 characters and include a letter and a number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setPhase("resetDone");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the password.");
    } finally {
      setBusy(false);
    }
  }

  const goToLogin = (
    <Link href="/login" className="button" style={{ display: "inline-flex", justifyContent: "center", textDecoration: "none", minWidth: 200 }}>
      Continue to NivaDesk
    </Link>
  );

  return (
    <main className="page-shell" style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 20 }}>
      <section className="card" style={{ maxWidth: 440, width: "100%", textAlign: "center", padding: "34px 28px" }}>
        <img src="/brand/nivadesk-logo.png" alt="NivaDesk" style={{ width: 150, margin: "0 auto 18px", display: "block" }} />

        {phase === "working" ? (
          <>
            <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>One moment…</h1>
            <p style={{ color: "var(--muted)" }}>Checking your secure link.</p>
          </>
        ) : null}

        {phase === "verified" ? (
          <>
            <div style={{ fontSize: 40 }} aria-hidden="true">✅</div>
            <h1 style={{ fontSize: 22, margin: "12px 0 8px" }}>Email verified</h1>
            <p style={{ color: "var(--muted)", marginBottom: 22 }}>Your address is confirmed. Welcome to NivaDesk!</p>
            {goToLogin}
          </>
        ) : null}

        {phase === "resetForm" ? (
          <>
            <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Choose a new password</h1>
            <p style={{ color: "var(--muted)", marginBottom: 18 }}>for <strong>{resetEmail}</strong></p>
            <form onSubmit={submitNewPassword} className="grid" style={{ gap: 12, textAlign: "left" }}>
              <input
                className="input"
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
              <input
                className="input"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
              {message ? <p style={{ color: "var(--danger)", margin: 0, fontSize: 13 }}>{message}</p> : null}
              <button className="button" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save new password"}
              </button>
            </form>
          </>
        ) : null}

        {phase === "resetDone" ? (
          <>
            <div style={{ fontSize: 40 }} aria-hidden="true">🔒</div>
            <h1 style={{ fontSize: 22, margin: "12px 0 8px" }}>Password updated</h1>
            <p style={{ color: "var(--muted)", marginBottom: 22 }}>You can now sign in with your new password.</p>
            {goToLogin}
          </>
        ) : null}

        {phase === "recovered" ? (
          <>
            <div style={{ fontSize: 40 }} aria-hidden="true">↩️</div>
            <h1 style={{ fontSize: 22, margin: "12px 0 8px" }}>Email restored</h1>
            <p style={{ color: "var(--muted)", marginBottom: 22 }}>Your previous email address has been restored. We recommend changing your password.</p>
            {goToLogin}
          </>
        ) : null}

        {phase === "error" ? (
          <>
            <div style={{ fontSize: 40 }} aria-hidden="true">⚠️</div>
            <h1 style={{ fontSize: 22, margin: "12px 0 8px" }}>Link problem</h1>
            <p style={{ color: "var(--muted)", marginBottom: 22 }}>{message}</p>
            {goToLogin}
          </>
        ) : null}
      </section>
    </main>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense fallback={null}>
      <AuthActionContent />
    </Suspense>
  );
}

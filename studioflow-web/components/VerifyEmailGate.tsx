"use client";

// Blocks email/password accounts until the address is verified. OAuth users
// (Google, Apple) pass straight through — their providers verify the email.

import { useState } from "react";
import { sendEmailVerification, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export function emailVerificationRequired(user: User | null | undefined) {
  if (!user) return false;
  if (user.emailVerified) return false;
  return user.providerData.some(provider => provider.providerId === "password");
}

export function VerifyEmailScreen({ user }: { user: User }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    setStatus("");
    try {
      await sendEmailVerification(user);
      setStatus("Verification email sent. Check your inbox (and spam folder).");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send the email.");
    } finally {
      setBusy(false);
    }
  }

  async function checkVerified() {
    setBusy(true);
    setStatus("");
    try {
      await user.reload();
      if (auth.currentUser?.emailVerified) {
        window.location.reload();
      } else {
        setStatus("Not verified yet — click the link in the email first.");
      }
    } catch {
      setStatus("Could not check verification status. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell" style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 20 }}>
      <section className="card" style={{ maxWidth: 440, width: "100%", textAlign: "center", padding: "34px 28px" }}>
        <div style={{ fontSize: 40 }} aria-hidden="true">📬</div>
        <h1 style={{ fontSize: 24, margin: "14px 0 8px" }}>Verify your email</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 6px" }}>
          We sent a verification link to:
        </p>
        <p style={{ fontWeight: 800, margin: "0 0 18px" }}>{user.email}</p>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 20px" }}>
          Click the link in that email, then come back here.
        </p>
        {status ? <p style={{ fontSize: 13, fontWeight: 650, margin: "0 0 14px" }}>{status}</p> : null}
        <div style={{ display: "grid", gap: 10 }}>
          <button className="button" type="button" onClick={() => void checkVerified()} disabled={busy}>
            I&apos;ve verified — continue
          </button>
          <button className="button secondary" type="button" onClick={() => void resend()} disabled={busy}>
            Resend email
          </button>
          <button
            type="button"
            onClick={() => void signOut(auth).then(() => window.location.replace("/login"))}
            style={{ background: "none", border: 0, color: "var(--muted)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 8 }}
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}

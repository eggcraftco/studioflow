"use client";

// Blocks email/password accounts until the address is verified. OAuth users
// (Google, Apple) pass straight through — their providers verify the email.

import { useState } from "react";
import { sendEmailVerification, signOut, type User } from "firebase/auth";

// After clicking the verification link, land users back on the app instead of
// a bare Firebase page.
const VERIFY_CONTINUE = { url: "https://nivadesk.app/login" };
import { auth } from "@/lib/firebase/client";

const VERIFICATION_GRACE_DAYS = 3;

export function emailVerificationPending(user: User | null | undefined) {
  if (!user) return false;
  if (user.emailVerified) return false;
  return user.providerData.some(provider => provider.providerId === "password");
}

// Industry-standard soft gate: new accounts get full access with a banner for
// a few days; only stale unverified accounts hit the hard verification screen.
export function emailVerificationRequired(user: User | null | undefined) {
  if (!emailVerificationPending(user)) return false;
  const createdMs = Date.parse(user?.metadata?.creationTime ?? "");
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs > VERIFICATION_GRACE_DAYS * 86400000;
}

export function VerifyEmailBanner({ user }: { user: User }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [hiddenAfterVerify, setHiddenAfterVerify] = useState(false);

  if (hiddenAfterVerify) return null;

  async function resend() {
    setBusy(true);
    try {
      await sendEmailVerification(user, VERIFY_CONTINUE);
      setStatus("Sent ✓");
    } catch {
      setStatus("Try again later");
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    try {
      await user.reload();
      if (auth.currentUser?.emailVerified) {
        setHiddenAfterVerify(true);
        window.location.reload();
      } else {
        setStatus("Not verified yet");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "9px 14px",
        background: "#fff7e6",
        borderBottom: "1px solid #f1d9a7",
        color: "#7a5200",
        fontSize: 13,
        fontWeight: 650
      }}
    >
      <span>📬 Verify your email ({user.email}) to keep full access.</span>
      <button type="button" onClick={() => void resend()} disabled={busy} style={{ border: "1px solid #d9b96a", background: "#fff", borderRadius: 999, padding: "4px 12px", fontWeight: 700, cursor: "pointer", color: "#7a5200" }}>
        Resend
      </button>
      <button type="button" onClick={() => void check()} disabled={busy} style={{ border: 0, background: "transparent", fontWeight: 800, cursor: "pointer", color: "#7a5200", textDecoration: "underline" }}>
        I&apos;ve verified
      </button>
      {status ? <span style={{ fontWeight: 800 }}>{status}</span> : null}
    </div>
  );
}

export function VerifyEmailScreen({ user }: { user: User }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    setStatus("");
    try {
      await sendEmailVerification(user, VERIFY_CONTINUE);
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
        setStatus("Not verified yet. Click the link in the email first.");
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
            I&apos;ve verified, continue
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

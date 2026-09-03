"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { acceptInvitation, previewInvitation, type InvitationPreview } from "@/lib/studioflow/invitations";
import { studioT } from "@/lib/studioflow/language";

// The page somebody lands on from an invitation email. A standalone surface:
// no app shell, because whoever opens this may not have an account yet.
//
// The email address is not a field they fill in. The invitation was sent to one
// address and only that address can accept it, so it is shown and fixed —
// letting somebody type a different one here would only produce a refusal from
// the server after they had already chosen a password.

type Phase = "loading" | "unusable" | "signed_out" | "wrong_account" | "ready" | "joining" | "joined";

export function InviteAcceptContent({ token }: { token: string }) {
  const router = useRouter();
  const { user, loading: authLoading, language } = useAuth();
  const t = useCallback((value: string) => studioT(value, language), [language]);

  const [phase, setPhase] = useState<Phase>("loading");
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Sticky, because the redirect to /orders takes a moment and nothing that
  // happens in that moment should put a refusal on the screen.
  const [joined, setJoined] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Loaded once, on the token alone.
  //
  // The first version also depended on the translator, which changes the moment
  // the workspace language arrives — so the preview ran a SECOND time just
  // after somebody joined, found the invitation now marked accepted, and told
  // the person who had just succeeded that their invitation had already been
  // used. Nothing was wrong; the page simply asked a stale question.
  useEffect(() => {
    let cancelled = false;
    previewInvitation(token)
      .then(result => {
        if (cancelled) return;
        setInvitation(result.invitation);
        if (!result.ok) {
          setNotice(result.message || "This invitation link is not valid. Ask for a new one.");
          setPhase("unusable");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setNotice("This invitation link is not valid. Ask for a new one.");
        setPhase("unusable");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Which of the three doors this person is standing at. Recomputed whenever
  // sign-in state settles, because the page is often opened signed out and
  // finished signed in.
  useEffect(() => {
    if (phase === "unusable" || phase === "joining" || phase === "joined") return;
    if (!invitation || authLoading) return;
    if (joined) return;
    if (!user) {
      setPhase("signed_out");
      return;
    }
    const signedInEmail = (user.email || "").trim().toLowerCase();
    setPhase(signedInEmail === invitation.email ? "ready" : "wrong_account");
  }, [user, authLoading, invitation, phase]);

  const join = useCallback(async () => {
    setError("");
    setPhase("joining");
    try {
      const result = await acceptInvitation(token);
      setJoined(true);
      setNotice(result.companyName);
      setPhase("joined");
      // Straight to Orders rather than the dashboard: somebody who has just
      // joined a workspace wants the work, and an empty dashboard reads as a
      // broken invitation.
      router.replace("/orders");
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("This invitation could not be accepted."));
      setPhase("ready");
    }
  }, [token, router, t]);

  const submitCredentials = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!invitation) return;
    setError("");
    setBusy(true);
    try {
      if (creatingAccount) {
        if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
          setError(t("Use at least 8 characters, with a letter and a number."));
          return;
        }
        const credential = await createUserWithEmailAndPassword(auth, invitation.email, password);
        const name = fullName.trim();
        if (name) await updateProfile(credential.user, { displayName: name });
        void sendEmailVerification(credential.user, { url: "https://nivadesk.app/login" }).catch(() => undefined);
        // Every account has a workspace of its own, and this one is about to
        // join somebody else's. Creating it keeps every account the same shape,
        // so nothing later has to handle an account with nowhere to fall back
        // to.
        try {
          await httpsCallable(functions, "initializeFreeDemoWorkspace")({
            fullName: name || invitation.email,
            workspaceName: name ? `${name}'s Studio` : "My Studio",
            language
          });
        } catch {
          /* The invitation is what matters; their own workspace can wait. */
        }
      } else {
        await signInWithEmailAndPassword(auth, invitation.email, password);
      }
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t("That did not work. Check the password and try again."));
    } finally {
      setBusy(false);
    }
  }, [creatingAccount, password, fullName, invitation, language, t]);

  if (joined) {
    return (
      <section className="estimate-panel">
        <h1>{t("You have joined the workspace.")}</h1>
        <p className="estimate-note">{notice}</p>
      </section>
    );
  }

  if (phase === "loading" || !invitation) {
    return (
      <section className="estimate-panel">
        <p className="estimate-note">{t("Loading...")}</p>
      </section>
    );
  }

  if (phase === "unusable" && !joined) {
    return (
      <section className="estimate-panel">
        <h1>{t("This invitation cannot be used")}</h1>
        <p className="estimate-note">{t(notice)}</p>
      </section>
    );
  }

  const headline = invitation.invitedByName
    ? `${invitation.invitedByName} ${t("invited you to join")} ${invitation.companyName}`
    : `${t("You have been invited to join")} ${invitation.companyName}`;

  return (
    <section className="estimate-panel">
      <div className="estimate-head">
        <div>
          <strong>NivaDesk</strong>
          <span className="estimate-note">{invitation.companyName}</span>
        </div>
      </div>

      <h1>{headline}</h1>
      <p className="estimate-note">
        {t("Invitation sent to")} <strong>{invitation.email}</strong>
      </p>

      {phase === "wrong_account" ? (
        <>
          <p className="estimate-note">
            {t("This invitation was sent to a different email address. Sign in with that address to accept it.")}
          </p>
          <div className="estimate-actions" style={{ marginTop: 16 }}>
            <button className="estimate-secondary" type="button" onClick={() => void signOut(auth)}>
              {t("Sign out")}
            </button>
          </div>
        </>
      ) : null}

      {phase === "signed_out" ? (
        <form onSubmit={submitCredentials} style={{ display: "grid", gap: 12, marginTop: 18 }}>
          {creatingAccount ? (
            <label style={{ display: "grid", gap: 6 }}>
              <span className="estimate-note">{t("Your name")}</span>
              <input
                className="input"
                value={fullName}
                onChange={event => setFullName(event.target.value)}
                autoComplete="name"
              />
            </label>
          ) : null}
          <label style={{ display: "grid", gap: 6 }}>
            <span className="estimate-note">{t("Password")}</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete={creatingAccount ? "new-password" : "current-password"}
              required
            />
          </label>
          {error ? <p className="estimate-error">{error}</p> : null}
          <div className="estimate-actions">
            <button className="estimate-approve" type="submit" disabled={busy}>
              {creatingAccount ? t("Create account") : t("Sign in")}
            </button>
          </div>
          <button
            type="button"
            className="estimate-note"
            style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", textDecoration: "underline" }}
            onClick={() => { setCreatingAccount(current => !current); setError(""); }}
          >
            {creatingAccount ? t("I already have a NivaDesk account") : t("I do not have an account yet")}
          </button>
        </form>
      ) : null}

      {phase === "ready" || phase === "joining" ? (
        <>
          {error ? <p className="estimate-error" style={{ marginTop: 12 }}>{error}</p> : null}
          <div className="estimate-actions" style={{ marginTop: 18 }}>
            <button className="estimate-approve" type="button" onClick={() => void join()} disabled={phase === "joining"}>
              {phase === "joining" ? t("Joining...") : t("Accept Invitation")}
            </button>
          </div>
        </>
      ) : null}

      {phase === "joined" ? (
        <p className="estimate-note" style={{ marginTop: 16 }}>
          {t("You have joined the workspace.")}
        </p>
      ) : null}
    </section>
  );
}

"use client";

// Shared Apple + Google sign-in buttons for the login and signup screens.
// Button order follows the visitor's platform: Apple first on iPhone/iPad/Mac,
// Google first everywhere else.

import { useEffect, useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, appleProvider, googleProvider } from "@/lib/firebase/client";

function isApplePlatform() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod|Macintosh/.test(ua);
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M16.36 12.94c.03 3.04 2.66 4.05 2.69 4.06-.02.07-.42 1.44-1.39 2.85-.84 1.22-1.71 2.43-3.08 2.46-1.35.02-1.78-.8-3.32-.8-1.54 0-2.02.77-3.29.82-1.32.05-2.33-1.32-3.18-2.53C3.06 17.3 1.72 12.74 3.5 9.7c.88-1.51 2.46-2.47 4.18-2.49 1.3-.03 2.53.88 3.32.88.8 0 2.29-1.08 3.86-.92.66.02 2.5.26 3.69 2-.1.06-2.2 1.29-2.19 3.77ZM13.82 5.5c.7-.85 1.18-2.04 1.05-3.22-1.01.04-2.24.67-2.97 1.52-.65.76-1.23 1.97-1.07 3.13 1.13.09 2.28-.58 2.99-1.43Z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.51 5.51 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.93-2.92l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.29a12 12 0 0 0 0 10.76l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.43-3.43A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.62l4 3.1C6.23 6.88 8.88 4.77 12 4.77Z" />
    </svg>
  );
}

export function AuthProviderButtons({
  appleLabel,
  googleLabel,
  appleUnavailableMessage,
  disabled,
  onStart,
  onSuccess,
  onError
}: {
  appleLabel: string;
  googleLabel: string;
  appleUnavailableMessage: string;
  disabled?: boolean;
  onStart?: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const [appleFirst, setAppleFirst] = useState(false);
  useEffect(() => {
    setAppleFirst(isApplePlatform());
  }, []);

  async function signIn(provider: "apple" | "google") {
    onStart?.();
    try {
      await signInWithPopup(auth, provider === "apple" ? appleProvider : googleProvider);
      onSuccess();
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        onError("");
        return;
      }
      if (provider === "apple" && code === "auth/operation-not-allowed") {
        onError(appleUnavailableMessage);
        return;
      }
      onError(error instanceof Error ? error.message : "Sign-in failed.");
    }
  }

  const appleButton = (
    <button
      key="apple"
      type="button"
      className="auth-provider-btn auth-provider-apple"
      onClick={() => void signIn("apple")}
      disabled={disabled}
    >
      <AppleMark />
      {appleLabel}
    </button>
  );

  const googleButton = (
    <button
      key="google"
      type="button"
      className="auth-provider-btn auth-provider-google"
      onClick={() => void signIn("google")}
      disabled={disabled}
    >
      <GoogleMark />
      {googleLabel}
    </button>
  );

  return (
    <div className="auth-provider-stack">
      {appleFirst ? [appleButton, googleButton] : [googleButton, appleButton]}
    </div>
  );
}

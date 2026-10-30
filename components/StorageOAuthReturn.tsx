"use client";

// Where Google, Microsoft, Dropbox and Box send the browser back after their
// consent screen: https://nivadesk.app/oauth/<provider>/callback?code=…&state=…
// One component, rendered by one static page per provider (the redirect URI
// each provider's app registration names exactly).
//
// Two kinds of return, told apart by THIS browser's own memory:
//
//   a consent started from Settings in this browser left
//   `nvStorageConnect:<state>` in sessionStorage (lib/studioflow/storage.ts) —
//   it is finished here, signed in, and the person goes back to the card;
//
//   a consent started in the iPhone, iPad, Mac or Android app left nothing
//   here — the code is handed to the app (nivadesk://storage-connect), which
//   finishes it with its own sign-in. A visible "Open NivaDesk" link stays as
//   the fallback for a browser that does not follow the hand-off.
//
// Rules: the code is spent on the server and nowhere else (never logged, never
// in a notice); the address bar is cleaned at once so a refresh or Back cannot
// replay it; and the page asserts nothing about who or which workspace — the
// server compares the caller with the person who began the consent.
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { auth } from "@/lib/firebase/client";
import { studioT } from "@/lib/studioflow/language";
import {
  STORAGE_CONNECT_SESSION_PREFIX, finishStorageConnect, storageProviderLabel, type StorageProviderId
} from "@/lib/studioflow/storage";

const CARD = "/settings?section=integrations";

type Captured = { code: string; state: string; error: string; startedHere: boolean };

function capture(): Captured | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const state = (params.get("state") || "").trim();
  const key = `${STORAGE_CONNECT_SESSION_PREFIX}${state}`;
  let startedHere = false;
  try {
    startedHere = Boolean(state && window.sessionStorage.getItem(key));
    if (startedHere) window.sessionStorage.removeItem(key);
  } catch {
    startedHere = false;
  }
  return {
    code: (params.get("code") || "").trim(),
    state,
    error: (params.get("error") || "").trim(),
    startedHere
  };
}

function StorageReturn({ provider }: { provider: StorageProviderId }) {
  const router = useRouter();
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const label = storageProviderLabel(provider);
  // Read once, before anything can clear the address bar or re-run an effect:
  // React runs effects twice in development, and spending a single-use code
  // twice would turn a good connection into "already used".
  const captured = useRef<Captured | null | undefined>(undefined);
  if (captured.current === undefined) captured.current = capture();
  const started = useRef(false);
  const [appLink, setAppLink] = useState("");
  const [message, setMessage] = useState("Finishing your {provider} connection…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const got = captured.current;
    window.history.replaceState(null, "", `/oauth/${provider}/callback`);
    const leave = (outcome: string) =>
      router.replace(`${CARD}&storage=${encodeURIComponent(outcome)}&provider=${encodeURIComponent(provider)}`);

    if (!got || !got.state) {
      // Nothing to finish: somebody opened this address directly.
      leave("error");
      return;
    }

    if (!got.startedHere) {
      // Begun in the app: hand the code over and let the app finish it signed in.
      const query = new URLSearchParams({
        provider,
        state: got.state,
        ...(got.code ? { code: got.code } : {}),
        ...(got.error ? { error: got.error } : {})
      });
      const link = `nivadesk://storage-connect?${query.toString()}`;
      setAppLink(link);
      window.location.replace(link);
      return;
    }

    setMessage(got.error ? "Returning you to NivaDesk…" : "Finishing your {provider} connection…");
    // The callable needs a signed-in caller; a cold tab is still restoring auth,
    // so wait for the first real answer rather than failing one tick early.
    const stop = onAuthStateChanged(auth, (user) => {
      stop();
      if (!user) {
        leave("signin");
        return;
      }
      finishStorageConnect({ state: got.state, ...(got.code ? { code: got.code } : {}), ...(got.error ? { error: got.error } : {}) })
        .then((result) => leave(result.stage === "connected" ? "connected" : "cancelled"))
        // The reason is not carried in the URL: the card re-reads the connection
        // from the server and says what is true now.
        .catch(() => leave("error"));
    });
    return () => stop();
  }, [provider, router]);

  return (
    <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <p role="status" style={{ opacity: 0.8 }}>
          {appLink
            ? t("Returning to the NivaDesk app… If nothing happens, open NivaDesk yourself.")
            : t(message).replace("{provider}", label)}
        </p>
        {appLink ? <p style={{ marginTop: 14 }}><a className="button" href={appLink}>{t("Open NivaDesk")}</a></p> : null}
      </div>
    </main>
  );
}

export function StorageOAuthReturn({ provider }: { provider: StorageProviderId }) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <StorageReturn provider={provider} />
    </Suspense>
  );
}

import { deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { db, messagingServiceWorkerConfig } from "@/lib/firebase/client";
import { getApp } from "firebase/app";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";

// Persisted so the registration can be removed on sign-out even after a page
// reload (module state does not survive navigation).
const LAST_TOKEN_KEY = "pushDeviceTokenLastSavedV1";
const LAST_COMPANY_KEY = "pushDeviceTokenCompanyLastSavedV1";

export type WebPushStatus =
  | "ok"
  | "not_configured"
  | "unsupported"
  | "permission_denied"
  | "error";

// AppShell wraps every route, so this runs again on each navigation. Without
// these two guards a signed-in browser re-ran getToken and stacked a second
// foreground listener — one duplicate notification per page visited — and
// repeated the missing-key warning until the console was unreadable.
let warnedNotConfigured = false;
let registeredFor = "";
let foregroundListenerAttached = false;

function sanitizeTokenForDocId(token: string): string {
  return token.replace(/\//g, "_").replace(/\+/g, "-").replace(/:/g, "_");
}

/**
 * Register the browser for FCM web push and save the token to Firestore under
 * `companies/{companyId}/deviceTokens/{sanitizedToken}`, matching the Mac/iOS/Android shape.
 *
 * Requirements:
 *  - public/firebase-messaging-sw.js must exist (included in this repo).
 *  - NEXT_PUBLIC_FIREBASE_VAPID_KEY must be set (from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates).
 *  - User must accept the notification permission prompt.
 */
export async function registerWebPush(
  workspace: WorkspaceContext,
  user: { uid: string; email?: string | null },
): Promise<WebPushStatus> {
  try {
    if (!workspace.id || !user.uid) return "error";
    if (typeof window === "undefined") return "unsupported";
    if (!("serviceWorker" in navigator)) return "unsupported";
    const supported = await isSupported();
    if (!supported) return "unsupported";
    if (!VAPID_KEY) {
      if (!warnedNotConfigured) {
        warnedNotConfigured = true;
        console.warn("[push] NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured — skipping push registration.");
      }
      return "not_configured";
    }

    const registrationKey = `${workspace.id}|${user.uid}`;
    if (registeredFor === registrationKey) return "ok";

    // Ask permission if needed.
    if (Notification.permission === "default") {
      const result = await Notification.requestPermission();
      if (result !== "granted") return "permission_denied";
    }
    if (Notification.permission !== "granted") return "permission_denied";

    const configQuery = new URLSearchParams(messagingServiceWorkerConfig).toString();
    const swRegistration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${configQuery}`);
    const messaging = getMessaging(getApp());
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });
    if (!token) return "error";

    const documentId = sanitizeTokenForDocId(token);
    await setDoc(
      doc(db, "companies", workspace.id, "deviceTokens", documentId),
      {
        token,
        companyId: workspace.id,
        userId: user.uid,
        email: user.email ?? "",
        platform: "Web",
        language: navigator.language || "English",
        enabled: true,
        appName: "NivaDesk",
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    try {
      window.localStorage.setItem(LAST_TOKEN_KEY, token);
      window.localStorage.setItem(LAST_COMPANY_KEY, workspace.id);
    } catch {
      /* private mode — cleanup on sign-out just becomes a no-op */
    }

    // Foreground push: show a browser notification ourselves. Attached once for
    // the life of the page — a second listener means a second notification.
    if (!foregroundListenerAttached) {
      foregroundListenerAttached = true;
      onMessage(messaging, (payload) => {
        const title = payload.notification?.title || payload.data?.title || "New message";
        const body = payload.notification?.body || payload.data?.body || "";
        if (Notification.permission === "granted") {
          new Notification(title, { body, icon: "/icon.png" });
        }
      });
    }

    registeredFor = registrationKey;
    return "ok";
  } catch (err) {
    console.warn("[push] registration failed:", err);
    return "error";
  }
}

/**
 * Delete this browser's push registration from the company it was last saved
 * under. Must run BEFORE signOut(): the Firestore rule for deviceTokens
 * requires the caller to still be a signed-in member of that company. Without
 * cleanup the token stays enabled under the old company and the browser keeps
 * receiving that workspace's pushes after switching accounts.
 */
export async function unregisterWebPush(): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem(LAST_TOKEN_KEY) ?? "";
    const companyId = window.localStorage.getItem(LAST_COMPANY_KEY) ?? "";
    if (!token || !companyId) return;
    await deleteDoc(doc(db, "companies", companyId, "deviceTokens", sanitizeTokenForDocId(token)));
    window.localStorage.removeItem(LAST_TOKEN_KEY);
    window.localStorage.removeItem(LAST_COMPANY_KEY);
    // The next sign-in is a different workspace/user pair and must register again.
    registeredFor = "";
  } catch (err) {
    console.warn("[push] unregister failed:", err);
  }
}

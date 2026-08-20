import { deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { db } from "@/lib/firebase/client";
import { getApp } from "firebase/app";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";

// Persisted so the registration can be removed on sign-out even after a page
// reload (module state does not survive navigation).
const LAST_TOKEN_KEY = "pushDeviceTokenLastSavedV1";
const LAST_COMPANY_KEY = "pushDeviceTokenCompanyLastSavedV1";

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
): Promise<void> {
  try {
    if (!workspace.id || !user.uid) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const supported = await isSupported();
    if (!supported) return;
    if (!VAPID_KEY) {
      console.warn("[push] NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured — skipping push registration.");
      return;
    }

    // Ask permission if needed.
    if (Notification.permission === "default") {
      const result = await Notification.requestPermission();
      if (result !== "granted") return;
    }
    if (Notification.permission !== "granted") return;

    const swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(getApp());
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });
    if (!token) return;

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

    // Foreground push: show a browser notification ourselves
    onMessage(messaging, (payload) => {
      const title = payload.notification?.title || payload.data?.title || "New message";
      const body = payload.notification?.body || payload.data?.body || "";
      if (Notification.permission === "granted") {
        new Notification(title, { body, icon: "/icon.png" });
      }
    });
  } catch (err) {
    console.warn("[push] registration failed:", err);
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
  } catch (err) {
    console.warn("[push] unregister failed:", err);
  }
}

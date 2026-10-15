// The two ways out of a wait that does not end (15 Oct 2026, private-window "Login"/loading report). A screen that
// is still loading after BOOT_STALL_MS offers both; neither ever waits on the network for long.
import { signOut } from "firebase/auth";
import { auth, clearFirestoreLocalCache } from "@/lib/firebase/client";
import { clearDeviceLocalWorkspaceCache } from "@/lib/studioflow/deviceLocalCache";
import { bootMark } from "@/lib/studioflow/bootTrace";

/** How long a loading screen waits before it offers Retry and Sign in again. */
export const BOOT_STALL_MS = 12_000;

/** Settles when the promise does, or after ms — whichever is first. Never rejects. */
function settleWithin<T>(promise: Promise<T>, ms: number): Promise<void> {
  return Promise.race([
    promise.then(() => undefined, () => undefined),
    new Promise<void>(resolve => setTimeout(resolve, ms))
  ]);
}

/**
 * Retry: load the page again. A fresh load opens new connections to Firebase and starts the reads over — what a
 * manual refresh did for the person who reported this, and the one thing that also clears a stuck connection.
 */
export function retryBoot(): void {
  bootMark("recover:retry");
  window.location.reload();
}

/**
 * Sign in again: end this session on this browser and open the sign-in page. Each step that may need the network
 * gets a short budget instead of an open-ended wait, because this is the path for when the network is the problem.
 */
export async function signInAgain(): Promise<void> {
  bootMark("recover:sign-in-again");
  // Remove the push registration while still authenticated (rules refuse it after sign-out), if it can be done now.
  await settleWithin(import("@/lib/studioflow/pushNotifications").then(mod => mod.unregisterWebPush()), 2_500);
  try {
    clearDeviceLocalWorkspaceCache();
  } catch {
    /* nothing stored */
  }
  await settleWithin(signOut(auth), 3_000);
  // The browser's Firestore copy goes with the session; the instance is terminated, so leave with a full load.
  await settleWithin(clearFirestoreLocalCache(), 3_000);
  window.location.assign("/login");
}

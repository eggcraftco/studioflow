// One way out of a session on this browser (security audit #17, 28 Oct 2026).
//
// Every sign-out button used to repeat the same five steps, and each copy was a
// place to forget one. The order matters:
//   1. writes this browser has not delivered yet are waited for (briefly) and,
//      if they are still waiting, the person is asked — wiping the cache below
//      throws them away, exactly like the native "Stay signed in / Sign out
//      anyway" question;
//   2. the push registration goes while still authenticated (rules refuse it
//      after sign-out);
//   3. device-local UI state goes (deviceLocalCache.ts), and the lock/activity
//      record of the auto-lock (sessionLock.ts);
//   4. signOut();
//   5. the browser's Firestore copy (IndexedDB) is wiped — terminate() then
//      clearIndexedDbPersistence() — and the page leaves with a full load,
//      because the terminated instance cannot be used again. Another open tab
//      that still holds the store is told to stop by the SDK itself (its
//      versionchange listener terminates it), so the delete goes through.
import { signOut } from "firebase/auth";
import { waitForPendingWrites } from "firebase/firestore";
import { auth, clearFirestoreLocalCache, db } from "@/lib/firebase/client";
import { clearDeviceLocalWorkspaceCache } from "@/lib/studioflow/deviceLocalCache";
import { clearSessionLockState } from "@/lib/auth/sessionLock";

/** How long sign-out waits for undelivered writes before it asks. */
export const PENDING_WRITES_WAIT_MS = 3_000;

/** What a sign-out with undelivered writes says (translated by the caller's t()). */
export const UNSYNCED_SIGN_OUT_TEXT = {
  title: "Changes not saved yet",
  message: "Some changes made on this browser have not reached NivaDesk yet. Signing out now deletes them from this browser.",
  stay: "Stay signed in",
  leave: "Sign out anyway"
} as const;

/**
 * Settles true when every write already queued on this browser has been
 * acknowledged by the server, false when some are still waiting after `ms`
 * (offline, or a slow connection). Never rejects: a Firestore that cannot
 * answer at all is treated as "nothing known to be waiting".
 */
export async function pendingWritesSettled(ms = PENDING_WRITES_WAIT_MS, wait: () => Promise<void> = () => waitForPendingWrites(db)): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      wait().then(() => true, () => true),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), ms); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Settles when the promise does, or after ms — whichever is first. Never rejects. */
function settleWithin<T>(promise: Promise<T>, ms: number): Promise<void> {
  return Promise.race([
    promise.then(() => undefined, () => undefined),
    new Promise<void>(resolve => setTimeout(resolve, ms))
  ]);
}

export type SignOutSessionOptions = {
  /**
   * Asked only when writes are still waiting. Resolve true to sign out anyway,
   * false to stay signed in. Without it, sign-out does not wait or ask (the
   * account is already gone, or the network is the problem).
   */
  confirmUnsynced?: () => boolean | Promise<boolean>;
  /** Where the full load goes afterwards. */
  destination?: string;
  /** Runs right before signOut() (still authenticated), e.g. a screen's own cleanup. */
  beforeSignOut?: () => void;
};

/**
 * Sign out on this browser and wipe what it kept. Resolves false when the
 * person chose to stay signed in; otherwise the page navigates away.
 */
export async function signOutAndWipe(options: SignOutSessionOptions = {}): Promise<boolean> {
  if (options.confirmUnsynced) {
    const settled = await pendingWritesSettled();
    if (!settled && !(await options.confirmUnsynced())) return false;
  }
  await settleWithin(import("@/lib/studioflow/pushNotifications").then(mod => mod.unregisterWebPush()), 2_500);
  try {
    clearDeviceLocalWorkspaceCache();
    clearSessionLockState();
  } catch {
    /* nothing stored */
  }
  try {
    options.beforeSignOut?.();
  } catch {
    /* a screen's cleanup never blocks the sign-out */
  }
  await signOut(auth);
  // Bounded, so a tab that cannot let go of the store never strands the person
  // on this page; client.ts finishes an unfinished wipe on the next load.
  await settleWithin(clearFirestoreLocalCache(), 5_000);
  window.location.assign(options.destination || "/login");
  return true;
}

// ---------------------------------------------------------------------------
// Access lost at load (WorkspaceAccessLostError): the workspace this browser
// cached is one the person may no longer read. The copy is wiped once and the
// page loaded again; the marker stops a loop when the fresh load is refused too.
const ACCESS_LOST_WIPE_KEY = "nv_access_lost_wipe";
export const ACCESS_LOST_WIPE_GAP_MS = 10 * 60_000;

/** Whether a wipe for (uid, companyId) is due, given the stored markers; returns the markers to store. */
export function accessLostWipeStep(stored: unknown, uid: string, companyId: string, now: number): { wipe: boolean; markers: Record<string, number> } {
  const markers: Record<string, number> = {};
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const [key, at] of Object.entries(stored as Record<string, unknown>)) {
      if (typeof at === "number" && Number.isFinite(at) && now - at < ACCESS_LOST_WIPE_GAP_MS) markers[key] = at;
    }
  }
  const key = `${uid}:${companyId}`;
  if (!uid || !companyId || markers[key] !== undefined) return { wipe: false, markers };
  markers[key] = now;
  return { wipe: true, markers };
}

/**
 * Wipe the Firestore copy after the workspace refused this person at load, then
 * load the page again. Resolves false (and does nothing) when this pair was
 * already wiped within ACCESS_LOST_WIPE_GAP_MS.
 */
export async function wipeCacheAfterAccessLost(uid: string, companyId: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  let stored: unknown = null;
  try { stored = JSON.parse(window.sessionStorage.getItem(ACCESS_LOST_WIPE_KEY) || "null"); } catch { stored = null; }
  const step = accessLostWipeStep(stored, uid, companyId, Date.now());
  if (!step.wipe) return false;
  try {
    window.sessionStorage.setItem(ACCESS_LOST_WIPE_KEY, JSON.stringify(step.markers));
  } catch {
    // No sessionStorage: wiping again on every load would loop, so do not wipe.
    return false;
  }
  await settleWithin(clearFirestoreLocalCache(), 3_000);
  window.location.reload();
  return true;
}

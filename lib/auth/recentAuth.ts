// "Is it still you?" before an action that cannot be undone (security audit #46, 28 Oct 2026).
//
// An unlocked browser left on a desk could delete the workspace's orders and
// customers, remove a team member or delete the account with a few clicks.
// These three now ask for the sign-in again unless it happened in the last five
// minutes. The prompt is the lock screen's own re-authentication (password or
// Google/Apple popup) shown by SessionAutoLock, asked for through a window
// event so the action modules stay free of React.
//
// The server is still the real gate for who may do these things; this is the
// browser half. Checking the ID token's auth_time on the server as well is the
// server arm's step (it would also stop a call typed into DevTools).
import { auth } from "@/lib/firebase/client";

/** A sign-in this recent counts: no prompt. */
export const RECENT_AUTH_WINDOW_MS = 5 * 60_000;

/** SessionAutoLock listens for this and answers through detail.resolve. */
export const REAUTH_REQUEST_EVENT = "studioflow-reauth-request";

export type ReauthRequestDetail = {
  resolve: (confirmed: boolean) => void;
  /** Set by the listener, synchronously, so a missing listener reads as "no". */
  handled: boolean;
};

/** The English sentence (a translation key) a cancelled prompt leaves on screen. */
export const REAUTH_CANCELLED_MESSAGE = "Confirm it's you to continue.";

export class ReauthenticationRequiredError extends Error {
  constructor() {
    super(REAUTH_CANCELLED_MESSAGE);
    this.name = "ReauthenticationRequiredError";
  }
}

/**
 * Whether a sign-in at authTimeMs is recent enough at now. A time slightly in
 * the future (clock skew between this device and Google) counts as recent; an
 * unknown time does not.
 */
export function authIsRecent(authTimeMs: number, now: number, windowMs = RECENT_AUTH_WINDOW_MS): boolean {
  if (!Number.isFinite(authTimeMs) || authTimeMs <= 0) return false;
  return now - authTimeMs < windowMs;
}

/** Ask the mounted SessionAutoLock for a re-authentication. Resolves false when nobody can ask. */
export function requestReauthentication(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise<boolean>(resolve => {
    const detail: ReauthRequestDetail = { resolve, handled: false };
    window.dispatchEvent(new CustomEvent<ReauthRequestDetail>(REAUTH_REQUEST_EVENT, { detail }));
    if (!detail.handled) resolve(false);
  });
}

/**
 * Resolves when the signed-in person authenticated in the last five minutes,
 * or has just done so again; throws ReauthenticationRequiredError otherwise.
 */
export async function ensureRecentAuthentication(
  getAuthTime: () => Promise<number> = currentAuthTime,
  ask: () => Promise<boolean> = requestReauthentication,
  now: () => number = Date.now
): Promise<void> {
  let authTimeMs = Number.NaN;
  try {
    authTimeMs = await getAuthTime();
  } catch {
    authTimeMs = Number.NaN;
  }
  if (authIsRecent(authTimeMs, now())) return;
  if (!(await ask())) throw new ReauthenticationRequiredError();
}

/** The ID token's auth_time (last real sign-in or re-authentication), in ms. */
async function currentAuthTime(): Promise<number> {
  const user = auth.currentUser;
  if (!user) return Number.NaN;
  const result = await user.getIdTokenResult();
  return Date.parse(result.authTime);
}

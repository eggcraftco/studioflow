// Per-device (per-browser) auto-lock preference. Mirrors the native Apple/Android
// app-lock "Auto-lock" setting, but on the web the unlock is a password / provider
// re-authentication rather than a biometric prompt. Stored in localStorage so it is
// scoped to this browser only — it never syncs to Firestore and never affects other
// users. 0 == Off (no idle auto-lock).

export const AUTO_LOCK_MINUTES_KEY = "studioflow-auto-lock-minutes";
export const AUTO_LOCK_CHANGED_EVENT = "studioflow-auto-lock-changed";

// Off, then the same intervals offered on the native apps.
export const AUTO_LOCK_OPTIONS = [0, 1, 5, 15, 60] as const;

export function getAutoLockMinutes(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(AUTO_LOCK_MINUTES_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return AUTO_LOCK_OPTIONS.includes(parsed as (typeof AUTO_LOCK_OPTIONS)[number]) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function setAutoLockMinutes(minutes: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTO_LOCK_MINUTES_KEY, String(minutes));
    window.dispatchEvent(new CustomEvent(AUTO_LOCK_CHANGED_EVENT, { detail: { minutes } }));
  } catch {
    // localStorage unavailable — best-effort only.
  }
}

// ---------------------------------------------------------------------------
// The lock outlives a reload (security audit #46, 28 Oct 2026). It used to live
// only in React state, so F5 — or opening the app in a new tab — opened it.
// Both what makes the lock and what it records are kept per account in
// localStorage, shared by every tab of this browser:
//   lockedAt      set when the lock comes down, removed by a re-authentication
//                 (in any tab) or a sign-out; a page that loads with it set
//                 starts locked;
//   lastActivity  the newest activity in ANY tab (written at most every
//                 ACTIVITY_WRITE_GAP_MS), so an idle background tab does not
//                 lock the tab being used, and a page opened after the idle
//                 interval starts locked.
// A sign-in newer than either value wins: signing in is a re-authentication.
export const SESSION_LOCKED_AT_KEY_PREFIX = "studioflow-session-locked-at:";
export const SESSION_ACTIVITY_KEY_PREFIX = "studioflow-session-activity:";
export const ACTIVITY_WRITE_GAP_MS = 15_000;

export function sessionLockedAtKey(uid: string): string {
  return `${SESSION_LOCKED_AT_KEY_PREFIX}${uid}`;
}

export function sessionActivityKey(uid: string): string {
  return `${SESSION_ACTIVITY_KEY_PREFIX}${uid}`;
}

function readTime(key: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const parsed = Number(window.localStorage.getItem(key) || "");
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeTime(key: string, at: number | null): void {
  if (typeof window === "undefined") return;
  try {
    if (at && at > 0) window.localStorage.setItem(key, String(Math.round(at)));
    else window.localStorage.removeItem(key);
  } catch {
    // localStorage unavailable — the lock still works in this tab.
  }
}

export function readSessionLockedAt(uid: string): number {
  return uid ? readTime(sessionLockedAtKey(uid)) : 0;
}

export function writeSessionLockedAt(uid: string, at: number | null): void {
  if (uid) writeTime(sessionLockedAtKey(uid), at);
}

export function readSessionActivity(uid: string): number {
  return uid ? readTime(sessionActivityKey(uid)) : 0;
}

export function writeSessionActivity(uid: string, at: number): void {
  if (uid) writeTime(sessionActivityKey(uid), at);
}

/** Sign-out: no lock or activity record of any account stays behind. */
export function clearSessionLockState(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && (key.startsWith(SESSION_LOCKED_AT_KEY_PREFIX) || key.startsWith(SESSION_ACTIVITY_KEY_PREFIX))) keys.push(key);
    }
    keys.forEach(key => window.localStorage.removeItem(key));
  } catch {
    // localStorage unavailable — nothing was stored.
  }
}

/**
 * Whether a page that has just loaded for this account starts locked.
 *   lockedAt     persisted lock (0 = none)
 *   lastActivity newest recorded activity in any tab (0 = none)
 *   lastSignIn   the account's last sign-in on this browser (0 = unknown)
 *   minutes      the auto-lock interval (0 = Off)
 */
export function shouldStartLocked(input: { lockedAt: number; lastActivity: number; lastSignIn: number; minutes: number; now: number }): boolean {
  const { lockedAt, lastActivity, lastSignIn, minutes, now } = input;
  // A lock that came down after the last sign-in stays down, whatever the interval says now.
  if (lockedAt > 0 && lockedAt >= lastSignIn) return true;
  if (minutes <= 0 || lastActivity <= 0) return false;
  const lastSeen = Math.max(lastActivity, lastSignIn);
  return now - lastSeen >= minutes * 60_000;
}

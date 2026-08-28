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

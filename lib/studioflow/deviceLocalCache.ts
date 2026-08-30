// Device-local (localStorage) workspace UI state that must not leak from one
// signed-in account to the next on the same browser — mirrors the iOS/Mac
// clearDeviceLocalWorkspaceCardCache(). Call BEFORE signOut().
// Cosmetic per-device preferences (theme, sidebar width, cookie consent) are
// intentionally left alone.

const DEVICE_LOCAL_WORKSPACE_KEYS = [
  // The remembered UI language. Kept so the first paint after a reload is in
  // the right language instead of English, and cleared here so the next person
  // to sign in on this browser does not inherit the last one's language.
  "nv_lang",
  "workspaceCardsLockedV1",
  "orderDetailHeaderShowDeliveryTime",
  "orderDetailHeaderShowUpcomingSchedule",
  "orderDetailHeaderShowOrderValue"
];

export function clearDeviceLocalWorkspaceCache() {
  if (typeof window === "undefined") return;
  for (const key of DEVICE_LOCAL_WORKSPACE_KEYS) {
    try { window.localStorage.removeItem(key); } catch { /* storage unavailable */ }
  }
}

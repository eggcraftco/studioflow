// Device-local (localStorage) workspace UI state that must not leak from one
// signed-in account to the next on the same browser — mirrors the iOS/Mac
// clearDeviceLocalWorkspaceCardCache(). Call BEFORE signOut().
// Cosmetic per-device preferences (theme, sidebar width, cookie consent) are
// intentionally left alone.

const DEVICE_LOCAL_WORKSPACE_KEYS = [
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

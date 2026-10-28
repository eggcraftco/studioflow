// Kept apart from pushNotifications.ts so AppShell can listen without pulling
// firebase/messaging into every page's bundle.

/**
 * The page's half of a notification click. The service worker asks an open tab
 * to go to a link when Safari's navigate() refuses (it posts
 * { type: "nivadesk-open", url }); AppShell listens for both that message and
 * this window event and moves with the in-app router. Only a same-site path is
 * taken.
 */
export const OPEN_IN_APP_EVENT = "nivadesk-open";

export function inAppLink(url: unknown): string {
  const value = typeof url === "string" ? url.trim() : "";
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "";
}

export function openInApp(url: string): void {
  const link = inAppLink(url);
  if (link) window.dispatchEvent(new CustomEvent(OPEN_IN_APP_EVENT, { detail: link }));
}

// When the root layout may leave Firebase unloaded (site speed + NIVADESK_HUKUK.md O-01, 6 Nov 2026).
//
// Loading lib/firebase/client.ts starts App Check, which downloads Google's reCAPTCHA (≈356 KB gzip, an iframe and
// three IndexedDB databases) — and Firebase itself is ≈160 KB gzip. A visitor who has never signed in on this device
// and is reading a marketing page needs none of it: there is no account to restore. So on those pages Firebase waits
// until something asks for it (the sign-up form, the Google/Apple buttons, the chat, a price button) — see
// lib/firebase/lazy.ts. Every other page, and every device someone has signed in on, loads it at once, as before.
import { splitPublicLocalePath } from "@/lib/publicSite/locales";

/** Marketing pages (also under a language prefix: /de/pricing). Not /signup, /login, /guide or any app or customer page. */
const PAGES_THAT_CAN_WAIT: ReadonlySet<string> = new Set([
  "/",
  "/features",
  "/pricing",
  "/chatgpt",
  "/faq",
  "/contact",
  "/security",
  "/integrations",
  "/privacy",
  "/terms",
  "/cookies",
  "/acceptable-use",
  "/refund-cancellation",
  "/account-deletion",
  "/data-processing-agreement",
  "/subprocessors",
  "/changelog",
  "/custom-order-management"
]);

export function firebaseCanWait(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const { path } = splitPublicLocalePath(pathname);
  return PAGES_THAT_CAN_WAIT.has(path) || /^\/integrations\/[a-z0-9-]+$/.test(path);
}

/** Written by AuthProvider after every successful sign-in on this browser (`nv_ws_ready_<uid>`). */
export const SIGNED_IN_HERE_PREFIX = "nv_ws_ready_";
/** lib/firebase/client.ts: a Firestore wipe that did not finish at sign-out; loading Firebase finishes it. */
export const FIRESTORE_WIPE_PENDING_KEY = "nv_fs_wipe_pending";

type KeyedStorage = Pick<Storage, "length" | "key" | "getItem">;

/**
 * Whether this browser needs Firebase on every page: someone has signed in here (their session may still be
 * restorable), or a sign-out wipe is still pending. Storage that cannot be read counts as yes.
 */
export function firebaseNeededOnThisDevice(storage?: KeyedStorage | null): boolean {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    if (!store) return true;
    if (store.getItem(FIRESTORE_WIPE_PENDING_KEY) === "1") return true;
    for (let index = 0; index < store.length; index += 1) {
      if (store.key(index)?.startsWith(SIGNED_IN_HERE_PREFIX)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** The root layout's decision for this page on this device. */
export function firebaseMayWait(pathname: string | null | undefined, storage?: KeyedStorage | null): boolean {
  return firebaseCanWait(pathname) && !firebaseNeededOnThisDevice(storage);
}

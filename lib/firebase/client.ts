import { initializeApp, getApps } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { connectAuthEmulator, getAuth, signInWithCustomToken, GoogleAuthProvider, OAuthProvider } from "firebase/auth";
import { clearIndexedDbPersistence, connectFirestoreEmulator, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, terminate } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

// Local Firebase emulators, for exercising a signed-in workspace end to end
// without touching live data. Two locks, because a build flag alone is one
// mistake away from pointing the live site at a machine that is not there:
// the flag has to be set (only `dev:emulator` / `build:emulator` do that) AND
// the page has to be served from localhost.
const USE_EMULATOR =
  process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1" &&
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// The messaging service worker runs outside the bundle and cannot read
// process.env, so it is handed this same config as query parameters at
// registration time. That keeps one source of truth and stops the worker's
// copy from drifting — it used to ship REPLACE_* placeholders.
export const messagingServiceWorkerConfig: Record<string, string> = Object.fromEntries(
  Object.entries(firebaseConfig).filter(([, value]) => Boolean(value)) as [string, string][]
);

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// App Check (monitor mode): attaches a reCAPTCHA v3 attestation token to
// Firebase requests so bots hitting the API directly can later be rejected
// once enforcement is turned on in the console. Browser-only and best-effort —
// it must never block the app if it fails to initialise.
const APP_CHECK_SITE_KEY =
  process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "6Lf5SyItAAAAAED4Ok_Vp-J8njasXEauxtBg8clT";

if (typeof window !== "undefined" && APP_CHECK_SITE_KEY && !USE_EMULATOR) {
  try {
    // Dev: emit a debug token so localhost works without a registered domain.
    if (process.env.NODE_ENV !== "production") {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
  } catch {
    // Already initialised (Fast Refresh) or unavailable — ignore in monitor mode.
  }
}

export const auth = getAuth(app);
if (USE_EMULATOR) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}

// Persistent IndexedDB cache: repeat visits render instantly from disk while
// the network refreshes in the background (matches the native apps' behaviour).
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch {
    // Already initialized (e.g. Fast Refresh) — reuse the existing instance.
    return getFirestore(app);
  }
}

export const db = createDb();

// The persistent cache is this browser's copy of everything the signed-in
// person was allowed to read — bank transactions included. It must not outlive
// the sign-in: once the Firestore instance is stopped the IndexedDB store can be
// wiped. Call AFTER signOut(); the page must then navigate with a full load
// (window.location), because the instance is gone. Another open tab that holds
// the store is stopped by the SDK itself (its versionchange listener terminates
// it), so the delete normally completes at once; if a tab cannot let go in time
// and the caller leaves first, the marker below makes the next page load finish
// the wipe before Firestore is used (retryPendingFirestoreWipe).
const FIRESTORE_WIPE_PENDING_KEY = "nv_fs_wipe_pending";

function markFirestoreWipePending(pending: boolean) {
  try {
    if (pending) window.localStorage.setItem(FIRESTORE_WIPE_PENDING_KEY, "1");
    else window.localStorage.removeItem(FIRESTORE_WIPE_PENDING_KEY);
  } catch {
    /* storage unavailable: the wipe is still attempted now */
  }
}

export async function clearFirestoreLocalCache(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  markFirestoreWipePending(true);
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
    markFirestoreWipePending(false);
    return true;
  } catch {
    return false;
  }
}
export const storage = getStorage(app);
export const functions = getFunctions(app, "europe-west2");

if (USE_EMULATOR) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}

// A wipe that did not finish before the last page left (sign-out with another
// tab still holding the store): finish it now, before anything reads Firestore.
// Allowed because the instance has not been started yet; anything that uses it
// later queues behind the delete on the same queue.
if (typeof window !== "undefined") {
  let wipePending = false;
  try { wipePending = window.localStorage.getItem(FIRESTORE_WIPE_PENDING_KEY) === "1"; } catch { wipePending = false; }
  if (wipePending) {
    clearIndexedDbPersistence(db).then(() => markFirestoreWipePending(false), () => undefined);
  }
}

// Emulator only: lets a local script sign a test workspace in with a custom
// token, so the signed-in screens can be exercised without a real account.
if (USE_EMULATOR && typeof window !== "undefined") {
  const w = window as unknown as {
    __emulatorSignIn?: (token: string) => Promise<unknown>;
    __emulatorAuth?: typeof auth;
  };
  w.__emulatorSignIn = (token: string) => signInWithCustomToken(auth, token);
  w.__emulatorAuth = auth;
}
export const googleProvider = new GoogleAuthProvider();

export const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

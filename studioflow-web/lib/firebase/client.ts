import { initializeApp, getApps } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { connectAuthEmulator, getAuth, signInWithCustomToken, GoogleAuthProvider, OAuthProvider } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
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
export const storage = getStorage(app);
export const functions = getFunctions(app, "europe-west2");

if (USE_EMULATOR) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
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

import { initializeApp, getApps } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth, GoogleAuthProvider, OAuthProvider } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

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

if (typeof window !== "undefined" && APP_CHECK_SITE_KEY) {
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
export const googleProvider = new GoogleAuthProvider();

export const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

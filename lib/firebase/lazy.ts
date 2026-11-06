// Firebase on demand for the root layout and the public pages (site speed + NIVADESK_HUKUK.md O-01, 6 Nov 2026).
//
// lib/firebase/rootKit.ts holds everything they take from Firebase; it is loaded with one dynamic import, so a public
// page's first download has no Firebase in it and App Check's reCAPTCHA does not start until Firebase is wanted.
// AuthProvider loads it at once except on a marketing page on a device nobody has signed in on
// (lib/firebase/deferPolicy.ts); there, the first call below that needs it loads it.
//
// The functions at the bottom are drop-ins for the ones modules on public pages used to import from firebase/* and
// lib/firebase/client.ts, with the same names and call shapes, so those modules change only their import line.
// Never import firebase/* or lib/firebase/client.ts (values) from a module a public page loads: test:public-bundle
// fails on it.
import type { ActionCodeSettings, User, UserCredential } from "firebase/auth";
import type { HttpsCallableOptions, HttpsCallableResult } from "firebase/functions";

export type FirebaseKit = typeof import("@/lib/firebase/rootKit");

let kit: FirebaseKit | null = null;
let loading: Promise<FirebaseKit> | null = null;
const waiting = new Set<(loaded: FirebaseKit) => void>();

/** Loads Firebase (once; a failed load can be retried). */
export function loadFirebaseKit(): Promise<FirebaseKit> {
  if (kit) return Promise.resolve(kit);
  if (!loading) {
    loading = import("@/lib/firebase/rootKit").then(
      loaded => {
        kit = loaded;
        const callbacks = [...waiting];
        waiting.clear();
        for (const callback of callbacks) {
          try {
            callback(loaded);
          } catch (error) {
            console.error("[NivaDesk] Firebase listener failed", error);
          }
        }
        return loaded;
      },
      error => {
        loading = null;
        throw error;
      }
    );
  }
  return loading;
}

/** Firebase if it is loaded already, else null (for calls that must stay inside a click, like a sign-in popup). */
export function loadedFirebaseKit(): FirebaseKit | null {
  return kit;
}

/** Whether a load has been started (or finished). */
export function firebaseKitRequested(): boolean {
  return Boolean(kit || loading);
}

/** Firebase, for code that only runs once it is loaded (a signed-in user exists). */
export function firebaseKit(): FirebaseKit {
  if (!kit) throw new Error("Firebase is not loaded yet");
  return kit;
}

/** Calls back once Firebase is loaded — at once if it is. Returns a function that cancels a call still waiting. */
export function whenFirebaseKitLoaded(callback: (loaded: FirebaseKit) => void): () => void {
  if (kit) {
    callback(kit);
    return () => undefined;
  }
  waiting.add(callback);
  return () => {
    waiting.delete(callback);
  };
}

// ---------------------------------------------------------------- drop-ins

/** Stands in for `auth` from lib/firebase/client.ts: `currentUser` is null until Firebase is loaded. */
export const auth: { readonly currentUser: User | null } = {
  get currentUser() {
    return kit ? kit.auth.currentUser : null;
  }
};

/** Stands in for `functions` from lib/firebase/client.ts; httpsCallable below calls the real instance. */
export const functions = { lazy: true } as const;

export type LazyHttpsCallable<RequestData, ResponseData> = (data?: RequestData | null) => Promise<HttpsCallableResult<ResponseData>>;

/** httpsCallable(functions, name): the call loads Firebase first if it has to. */
export function httpsCallable<RequestData = unknown, ResponseData = unknown>(
  _functions: typeof functions,
  name: string,
  options?: HttpsCallableOptions
): LazyHttpsCallable<RequestData, ResponseData> {
  return async (data?: RequestData | null) => {
    const loaded = await loadFirebaseKit();
    return loaded.httpsCallable<RequestData, ResponseData>(loaded.functions, name, options)(data);
  };
}

/** onAuthStateChanged(auth, next): follows Auth from the moment Firebase is loaded (by anyone); nothing before. */
export function onAuthStateChanged(_auth: typeof auth, next: (user: User | null) => void): () => void {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  const cancel = whenFirebaseKitLoaded(loaded => {
    if (!stopped) unsubscribe = loaded.onAuthStateChanged(loaded.auth, next);
  });
  return () => {
    stopped = true;
    cancel();
    unsubscribe?.();
  };
}

export async function createUserWithEmailAndPassword(_auth: typeof auth, email: string, password: string): Promise<UserCredential> {
  const loaded = await loadFirebaseKit();
  return loaded.createUserWithEmailAndPassword(loaded.auth, email, password);
}

export async function sendEmailVerification(user: User, settings?: ActionCodeSettings | null): Promise<void> {
  const loaded = await loadFirebaseKit();
  return loaded.sendEmailVerification(user, settings);
}

export async function updateProfile(user: User, profile: { displayName?: string | null; photoURL?: string | null }): Promise<void> {
  const loaded = await loadFirebaseKit();
  return loaded.updateProfile(user, profile);
}

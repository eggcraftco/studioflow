// Everything the root layout and the public pages take from Firebase, behind ONE dynamic import (lib/firebase/lazy.ts),
// so none of it is in a public page's first download (site speed + NIVADESK_HUKUK.md O-01, 6 Nov 2026).
//
// Importing this module initialises Firebase exactly as a static import did: lib/firebase/client.ts starts the app,
// App Check (reCAPTCHA), Auth, Firestore with its persistent cache, Storage and Functions. App screens keep importing
// lib/firebase/client.ts directly; on them this module is already in the page, so loading it costs nothing.
export {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  signInWithPopup,
  updateProfile
} from "firebase/auth";
export { arrayUnion, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
export { httpsCallable } from "firebase/functions";
export { appleProvider, auth, clearFirestoreLocalCache, db, functions, googleProvider } from "@/lib/firebase/client";
export { signOutAndWipe, UNSYNCED_SIGN_OUT_TEXT } from "@/lib/auth/signOutSession";
export { registerSecondFactorPresenter, SECOND_FACTOR_CANCELLED, withSecondFactor } from "@/lib/auth/secondFactor";

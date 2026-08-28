// Firebase Admin bootstrap for the app server.
//
// On Cloud Run (same GCP project as NivaDesk) Application Default Credentials
// are ambient — no key files. For local `shopify app dev`, run
// `gcloud auth application-default login` once (documented in docs/).
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT || "eggcraft-studio",
  });
}

export const firestore = getFirestore();

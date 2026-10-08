// The browser's `TrackedUploadDeps`: firebase/storage's resumable task for
// the transfer and its metadata read for the retry check and the scan verdict,
// plus the window's online/offline and visibility events.

import { getMetadata, ref as storageRef, uploadBytesResumable, type UploadMetadata } from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import { scanStateFromMetadata, scanStateFromReadError, UploadBlockedError, type TrackedUploadDeps } from "./uploadRunner";

function storageErrorCode(error: unknown) {
  return error && typeof error === "object" ? String((error as { code?: unknown }).code || "") : "";
}

export function browserUploadDeps(file: Blob, metadata: UploadMetadata): TrackedUploadDeps {
  return {
    async objectExists(path) {
      try {
        await getMetadata(storageRef(storage, path));
        return true;
      } catch (error) {
        const code = storageErrorCode(error);
        if (code === "storage/object-not-found") return false;
        // The object is there but the rules will not show it: the scanner
        // settled it as not clean. Sending the bytes again would not change that.
        if (code === "storage/unauthorized") throw new UploadBlockedError();
        throw error;
      }
    },
    startUpload(path) {
      return uploadBytesResumable(storageRef(storage, path), file, metadata);
    },
    async readScan(path) {
      try {
        const current = await getMetadata(storageRef(storage, path));
        return scanStateFromMetadata(current.customMetadata);
      } catch (error) {
        return scanStateFromReadError(error);
      }
    },
    isOnline: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
    subscribeConnectivity(onChange) {
      if (typeof window === "undefined") return () => {};
      const online = () => onChange(true);
      const offline = () => onChange(false);
      window.addEventListener("online", online);
      window.addEventListener("offline", offline);
      return () => {
        window.removeEventListener("online", online);
        window.removeEventListener("offline", offline);
      };
    },
    subscribeVisible(onVisible) {
      if (typeof document === "undefined") return () => {};
      const handler = () => { if (document.visibilityState === "visible") onVisible(); };
      document.addEventListener("visibilitychange", handler);
      return () => document.removeEventListener("visibilitychange", handler);
    }
  };
}

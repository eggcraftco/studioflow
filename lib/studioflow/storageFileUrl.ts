// A stored file's address, asked of Storage at the moment it is shown
// (security audit #19, stage A1; DESIGN-19-storage-control.md, owner decision
// 28 Oct 2026: the control layer is Storage).
//
// Order files and message attachments keep a token download URL in Firestore,
// and a token URL ignores the Storage rules — a member whose Client Files key is
// off, a workspace whose Pro trial ended, a non-Team plan for message files, all
// still opened them. The rules themselves are right; they just were not asked.
// Now every place that shows, opens or downloads such a file goes through
// resolveStorageUrl():
//   storagePath known  → getDownloadURL(ref(storage, storagePath)) with this
//                        person's own sign-in, so the rule decides. Refused (or
//                        any other failure) → the file is NOT opened and the
//                        stored URL is NOT used instead;
//   no storagePath     → an older record: the stored URL, as before.
// Message attachments carry no storagePath: it is derived from the stored URL
// when that URL is this app's own bucket under companies/<id>/message_files/
// (the native apps do the same); otherwise the stored URL.
// New uploads keep writing downloadURL (stage A2 — not writing it — needs the
// older app versions retired first).
//
// Answers are kept in memory for ten minutes, per signed-in user; a sign-out
// leaves with a full page load (lib/auth/signOutSession.ts), which drops them.
import { useEffect, useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { auth, storage } from "@/lib/firebase/client";
import { createSharedFileLink, downloadSharedFile, maskFileUrl } from "@/lib/studioflow/fileMask";

/** The existing sentence for a file Storage will not give this person (11 languages). */
export const STORAGE_FILE_DENIED_TEXT = "This file's storage area is not accessible to your account.";
/** The existing sentence for any other failure. */
export const STORAGE_FILE_FAILED_TEXT = "The file could not be opened.";

export const STORAGE_URL_CACHE_MS = 10 * 60_000;

export type ResolvedFileUrl =
  | { status: "ready"; url: string; source: "storage" | "stored" }
  | { status: "denied" }
  | { status: "failed" }
  | { status: "missing" };

export type StorageUrlDeps = {
  fetchUrl: (storagePath: string) => Promise<string>;
  uid: () => string;
  now: () => number;
};

const defaultDeps: StorageUrlDeps = {
  fetchUrl: (storagePath) => getDownloadURL(ref(storage, storagePath)),
  uid: () => auth.currentUser?.uid ?? "",
  now: () => Date.now()
};

const cache = new Map<string, { url: string; at: number }>();

export function clearStorageUrlCache(): void {
  cache.clear();
}

/** A storage path we will ask for: relative, no empty / dot segments, no control characters. */
export function cleanStoragePath(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 1024 || raw.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(raw)) return "";
  const segments = raw.split("/");
  if (segments.some(segment => !segment || segment === "." || segment === "..")) return "";
  return raw;
}

function refusalKind(error: unknown): "denied" | "failed" {
  const code = error && typeof error === "object" ? String((error as { code?: unknown }).code || "") : "";
  return code === "storage/unauthorized" || code === "storage/unauthenticated" || code === "storage/object-not-found" ? "denied" : "failed";
}

/** The address to show for a stored file (see the header for the rule). Never throws. */
export async function resolveStorageUrl(storagePath: unknown, fallbackUrl: unknown, deps: StorageUrlDeps = defaultDeps): Promise<ResolvedFileUrl> {
  const path = cleanStoragePath(storagePath);
  if (path) {
    const key = `${deps.uid()}|${path}`;
    const hit = cache.get(key);
    if (hit && deps.now() - hit.at < STORAGE_URL_CACHE_MS) return { status: "ready", url: hit.url, source: "storage" };
    try {
      const url = await deps.fetchUrl(path);
      if (!url) return { status: "failed" };
      cache.set(key, { url, at: deps.now() });
      return { status: "ready", url, source: "storage" };
    } catch (error) {
      cache.delete(key);
      // Storage said no: the stored token URL would open it anyway, so it is not used.
      return { status: refusalKind(error) };
    }
  }
  const stored = typeof fallbackUrl === "string" ? fallbackUrl.trim() : "";
  return stored ? { status: "ready", url: stored, source: "stored" } : { status: "missing" };
}

/** The sentence for an open / download that did not happen, or "" when it did. */
export function openOutcomeProblem(status: ResolvedFileUrl["status"]): string {
  if (status === "ready") return "";
  return status === "denied" ? STORAGE_FILE_DENIED_TEXT : STORAGE_FILE_FAILED_TEXT;
}

/** The sentence for a file that cannot be shown, or "". */
export function resolvedFileProblem(resolved: ResolvedFileUrl | { status: "loading" }): string {
  if (resolved.status === "denied") return STORAGE_FILE_DENIED_TEXT;
  if (resolved.status === "failed") return STORAGE_FILE_FAILED_TEXT;
  return "";
}

/**
 * A message attachment's storage path, derived from its stored URL: this app's
 * own bucket, under companies/<companyId>/message_files/ (any workspace id when
 * companyId is not given — the path is only ever used to ask Storage with this
 * person's own sign-in, so another workspace's file is simply refused). "" when
 * it is not one (then the stored URL is used, as for any older record).
 */
export function messageAttachmentStoragePath(fileURL: unknown, bucket: unknown, companyId: unknown = ""): string {
  const raw = typeof fileURL === "string" ? fileURL.trim() : "";
  const ownBucket = typeof bucket === "string" ? bucket.trim() : "";
  const company = typeof companyId === "string" ? companyId.trim() : "";
  if (!raw || !ownBucket || company.includes("/")) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (!(url.protocol === "https:" && url.hostname === "firebasestorage.googleapis.com") && !(url.protocol === "http:" && loopback)) return "";
  const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/([^/]+)$/);
  if (!match) return "";
  let objectBucket = "";
  let path = "";
  try {
    objectBucket = decodeURIComponent(match[1]);
    path = decodeURIComponent(match[2]);
  } catch {
    return "";
  }
  if (objectBucket !== ownBucket) return "";
  const clean = cleanStoragePath(path);
  const parts = clean.split("/");
  if (parts.length < 4 || parts[0] !== "companies" || parts[2] !== "message_files") return "";
  if (company && parts[1] !== company) return "";
  return clean;
}

/** The app's own bucket (for messageAttachmentStoragePath). */
export function appStorageBucket(): string {
  return String(storage.app.options.storageBucket || "");
}

/** React: the address for a stored file, asked when the file changes. */
export function useResolvedFileUrl(storagePath: unknown, fallbackUrl: unknown): ResolvedFileUrl | { status: "loading" } {
  const path = cleanStoragePath(storagePath);
  const stored = typeof fallbackUrl === "string" ? fallbackUrl.trim() : "";
  const key = `${path}\n${stored}`;
  const [answer, setAnswer] = useState<{ key: string; value: ResolvedFileUrl } | null>(() =>
    path ? null : { key, value: stored ? { status: "ready", url: stored, source: "stored" } : { status: "missing" } }
  );
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setAnswer({ key, value: stored ? { status: "ready", url: stored, source: "stored" } : { status: "missing" } });
      return;
    }
    void resolveStorageUrl(path, stored).then(value => {
      if (!cancelled) setAnswer({ key, value });
    });
    return () => {
      cancelled = true;
    };
  }, [key, path, stored]);
  return answer && answer.key === key ? answer.value : { status: "loading" };
}

type StoredFile = { storagePath?: string; downloadURL?: string };

/**
 * Open a stored file in a new tab through the branded /f/ link. The tab is
 * opened inside the click (pop-up blockers), then pointed at the link — or
 * closed again when Storage refuses. Resolves the outcome for the caller to
 * explain ("denied" / "failed").
 */
export async function openStoredFile(file: StoredFile, brandedHost?: string): Promise<ResolvedFileUrl["status"]> {
  if (typeof window === "undefined") return "failed";
  const tab = window.open("about:blank", "_blank");
  const resolved = await resolveStorageUrl(file.storagePath, file.downloadURL);
  if (resolved.status !== "ready") {
    if (tab && !tab.closed) tab.close();
    return resolved.status;
  }
  let link = resolved.url;
  try {
    link = await createSharedFileLink(resolved.url, brandedHost);
  } catch {
    link = maskFileUrl(resolved.url, brandedHost);
  }
  if (tab && !tab.closed) tab.location.href = link;
  else window.open(link, "_blank");
  return "ready";
}

/** Download a stored file (same rule); resolves the outcome. */
export async function downloadStoredFile(file: StoredFile, fileName: string, brandedHost?: string): Promise<ResolvedFileUrl["status"]> {
  const resolved = await resolveStorageUrl(file.storagePath, file.downloadURL);
  if (resolved.status !== "ready") return resolved.status;
  await downloadSharedFile(resolved.url, fileName, brandedHost);
  return "ready";
}

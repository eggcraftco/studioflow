// Share a stored file (8 Nov 2026, the owner: "a Share button on the files in Files; on every device, Share opens
// that device's own share feature"). In a browser that can share files (navigator.canShare({ files })) the FILE is
// handed to the system share sheet — fetched from the address Storage gives this person now (audit #19 A1; a refusal
// shares nothing) and named after the file's display name. Anywhere else the workspace's own file link is shared or
// copied instead: createSharedFileLink's https://<file host>/f/<id>.<ext> (or the masked /f/ link) — never the raw
// firebasestorage.googleapis.com address. The apps: EGGcraft/FileShare.swift, Android features/files/FileShare.kt.
import { createSharedFileLink, maskFileUrl } from "@/lib/studioflow/fileMask";
import { resolveStorageUrl, STORAGE_FILE_DENIED_TEXT, type ResolvedFileUrl } from "@/lib/studioflow/storageFileUrl";

export const SHARE_PREPARING_TEXT = "Preparing to share…";
export const SHARE_FAILED_TEXT = "The file could not be prepared for sharing. Check your connection and try again.";
export const SHARE_LINK_COPIED_TEXT = "This browser cannot share files, so the file's link was copied.";
export const SHARE_AGAIN_TEXT = "The file is ready. Press Share again to send it.";

/** What happened: the sheet opened (shared / cancelled), the link went instead, or nothing could go. */
export type ShareOutcome = "shared" | "cancelled" | "link-shared" | "link-copied" | "again" | "denied" | "failed";

/** The sentence to show for an outcome (a key of the translation table), or null when the system's own UI said it. */
export function shareOutcomeMessage(outcome: ShareOutcome): { text: string; problem: boolean } | null {
  switch (outcome) {
    case "link-copied": return { text: SHARE_LINK_COPIED_TEXT, problem: false };
    case "again": return { text: SHARE_AGAIN_TEXT, problem: false };
    case "denied": return { text: STORAGE_FILE_DENIED_TEXT, problem: true };
    case "failed": return { text: SHARE_FAILED_TEXT, problem: true };
    default: return null;
  }
}

const MAX_NAME_BYTES = 200;
const TYPE_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
  "image/heif": "heif", "image/gif": "gif", "image/tiff": "tiff", "image/svg+xml": "svg",
  "image/vnd.adobe.photoshop": "psd", "text/plain": "txt", "text/csv": "csv", "application/zip": "zip",
  "video/mp4": "mp4", "video/quicktime": "mov"
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  const ext = name.slice(dot + 1);
  return /^[A-Za-z0-9]{1,8}$/.test(ext) ? ext : "";
}

function urlPath(raw: string): string {
  try { return decodeURIComponent(new URL(raw).pathname); } catch { return ""; }
}

/** The stored file's extension: its storage path's, else its stored address's path, else its content type's. */
export function shareFallbackExtension(storagePath: string, storedUrl: string, contentType: string): string {
  for (const candidate of [storagePath, urlPath(storedUrl)]) {
    const ext = extensionOf(candidate.split("/").pop() ?? "");
    if (ext) return ext.toLowerCase();
  }
  return TYPE_EXTENSIONS[contentType.trim().toLowerCase()] ?? "";
}

/** The name the shared file carries: the display name, safe for a file system, with the stored extension added when
 *  the display name has none. The same vectors as the apps (FileShareRules.swift / FileShareRules.kt). */
export function shareFileName(displayName: string, storagePath = "", storedUrl = "", contentType = ""): string {
  let name = displayName.trim().replace(/[/\\:\u0000]/g, "-").replace(/[\r\n]+/g, " ").replace(/^\.+/, "");
  if (!name.trim()) name = "file";
  const ext = shareFallbackExtension(storagePath, storedUrl, contentType);
  if (!extensionOf(name) && ext) name += `.${ext}`;
  const bytes = (text: string) => new TextEncoder().encode(text).length;
  if (bytes(name) <= MAX_NAME_BYTES) return name;
  const own = extensionOf(name);
  const suffix = own ? `.${own}` : "";
  let stem = own ? name.slice(0, name.length - suffix.length) : name;
  while (stem && bytes(stem + suffix) > MAX_NAME_BYTES) stem = Array.from(stem).slice(0, -1).join("");
  return (stem || "file") + suffix;
}

/** True for a raw Firebase Storage address — never handed to the share sheet or the clipboard. */
export function isStorageAddress(raw: string): boolean {
  try { return new URL(raw).hostname === "firebasestorage.googleapis.com"; } catch { return false; }
}

type ShareNavigator = {
  share?: (data: { files?: File[]; title?: string; url?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
  clipboard?: { writeText?: (text: string) => Promise<void> };
};

export type ShareDeps = {
  navigator: () => ShareNavigator | undefined;
  resolve: (storagePath: unknown, storedUrl: unknown) => Promise<ResolvedFileUrl>;
  fetch: (url: string) => Promise<{ ok: boolean; blob: () => Promise<Blob> }>;
  createLink: (rawUrl: string, brandedHost?: string) => Promise<string>;
  now: () => number;
};

const defaultDeps: ShareDeps = {
  navigator: () => (typeof navigator === "undefined" ? undefined : (navigator as unknown as ShareNavigator)),
  resolve: resolveStorageUrl,
  fetch: url => fetch(url, { cache: "no-store" }),
  createLink: createSharedFileLink,
  now: () => Date.now()
};

/** A file fetched for a share the browser refused for lack of a fresh tap: kept briefly so the next press shares it
 *  at once, inside that tap (Safari allows navigator.share only within a user gesture). */
const READY_FOR_MS = 2 * 60_000;
const ready = new Map<string, { file: File; at: number }>();

export function clearPreparedShares(): void {
  ready.clear();
}

/** The browser can hand a file to the system share sheet (sharing a file, not only a link). */
export function canShareFiles(nav: ShareNavigator | undefined): boolean {
  return Boolean(nav && typeof nav.share === "function" && typeof nav.canShare === "function");
}

async function shareFile(nav: ShareNavigator, file: File): Promise<ShareOutcome | "refused"> {
  try {
    await nav.share!({ files: [file], title: file.name });
    return "shared";
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "AbortError") return "cancelled";
    if (name === "NotAllowedError") return "refused";
    return "failed";
  }
}

export type ShareableFile = {
  storagePath?: string;
  downloadURL?: string;
  fileName: string;
  contentType?: string;
  /** A bank receipt (KO 8 Nov 2026): the masked link only, never nvCreateFileLink — no new 90-day share record. */
  maskedLinkOnly?: boolean;
};

/** Share one stored file: the file itself where the browser can, else the workspace's file link. */
export async function shareStoredFile(file: ShareableFile, brandedHost?: string, deps: ShareDeps = defaultDeps): Promise<ShareOutcome> {
  const nav = deps.navigator();
  if (!nav) return "failed";
  const key = `${file.storagePath ?? ""}\n${file.downloadURL ?? ""}`;
  const prepared = ready.get(key);
  if (prepared && deps.now() - prepared.at < READY_FOR_MS && canShareFiles(nav)) {
    // Nothing is awaited before this share: it runs inside the press that asked for it.
    ready.delete(key);
    const again = await shareFile(nav, prepared.file);
    return again === "refused" ? "failed" : again;
  }
  // #19 A1: the address Storage gives this person now; a refusal shares nothing.
  const resolved = await deps.resolve(file.storagePath, file.downloadURL);
  if (resolved.status === "denied") return "denied";
  if (resolved.status !== "ready") return "failed";
  const name = shareFileName(file.fileName, file.storagePath ?? "", file.downloadURL ?? "", file.contentType ?? "");

  if (canShareFiles(nav)) {
    let shareable: File | null = null;
    try {
      const response = await deps.fetch(resolved.url);
      if (response.ok) {
        const blob = await response.blob();
        const stated = (file.contentType ?? "").includes("/") ? file.contentType : "";
        shareable = new File([blob], name, { type: blob.type || stated || "application/octet-stream" });
      }
    } catch {
      shareable = null; // blocked (CORS) or offline: the link below
    }
    if (shareable && nav.canShare!({ files: [shareable] })) {
      const outcome = await shareFile(nav, shareable);
      if (outcome === "refused") {
        ready.set(key, { file: shareable, at: deps.now() });
        return "again";
      }
      return outcome;
    }
  }

  // The workspace's own file link instead — never the raw Storage address.
  let link = "";
  try {
    link = file.maskedLinkOnly ? maskFileUrl(resolved.url, brandedHost) : await deps.createLink(resolved.url, brandedHost);
  } catch {
    link = "";
  }
  if (!link || isStorageAddress(link)) return "failed";
  if (typeof nav.share === "function") {
    try {
      await nav.share({ title: name, url: link });
      return "link-shared";
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return "cancelled";
      // refused (no fresh tap) or not supported: copy it instead
    }
  }
  try {
    if (typeof nav.clipboard?.writeText !== "function") return "failed";
    await nav.clipboard.writeText(link);
    return "link-copied";
  } catch {
    return "failed";
  }
}

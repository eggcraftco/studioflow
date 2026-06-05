// Rebrands a raw Firebase Storage download URL as a nivadesk.app link for the
// "open file" viewer (see app/f/[...slug]/route.ts). Use this ONLY for links the
// user opens/shares/copies — never for inline <img>/<iframe> embeds inside the app
// (those must keep the raw URL so the bytes load as the actual file).

import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

const PUBLIC_ORIGIN = (process.env.NEXT_PUBLIC_NIVADESK_PUBLIC_ORIGIN || "https://nivadesk.app").replace(/\/$/, "");

// Creates a short, clean nivadesk.app link (company id + token hidden) by storing
// a mapping server-side. Falls back to the path-based masked URL on any failure.
export async function createSharedFileLink(rawUrl: string | null | undefined): Promise<string> {
  if (!rawUrl) return rawUrl ?? "";
  try {
    const callable = httpsCallable<{ url: string }, { id: string; ext: string }>(functions, "nvCreateFileLink");
    const result = await callable({ url: rawUrl });
    const id = result.data?.id;
    if (id) {
      const ext = result.data?.ext ? `.${result.data.ext}` : "";
      return `${PUBLIC_ORIGIN}/f/${id}${ext}`;
    }
  } catch {
    // ignore — fall back below
  }
  return maskFileUrl(rawUrl);
}

// Opens a client file in a new tab using a short branded link.
// We pre-open a blank tab synchronously (within the click gesture) WITHOUT
// "noopener" so we keep the window reference, then point it at the link once the
// short URL is ready. Using "noopener" here makes window.open return null and
// leaves an uncontrollable blank tab — which is the bug this avoids.
export async function openSharedFile(rawUrl: string | null | undefined): Promise<void> {
  if (!rawUrl || typeof window === "undefined") return;
  const tab = window.open("about:blank", "_blank");
  let link = rawUrl;
  try {
    link = await createSharedFileLink(rawUrl);
  } catch {
    link = maskFileUrl(rawUrl);
  }
  if (tab && !tab.closed) {
    tab.location.href = link;
  } else {
    window.open(link, "_blank");
  }
}

// Downloads a client file without ever showing the firebasestorage URL: the bytes
// are fetched in the background (requires bucket CORS for nivadesk.app) and saved
// as a blob with the original filename. Falls back to opening the branded viewer
// if the fetch is blocked (e.g. CORS not yet enabled).
export async function downloadSharedFile(rawUrl: string | null | undefined, fileName?: string): Promise<void> {
  if (!rawUrl || typeof window === "undefined") return;
  try {
    const response = await fetch(rawUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("fetch-failed");
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = fileName || "file";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
  } catch {
    // CORS blocked (or offline): fall back to the branded viewer so the address
    // bar still shows nivadesk.app instead of firebasestorage.
    await openSharedFile(rawUrl);
  }
}

export function maskFileUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return rawUrl ?? "";
  try {
    const url = new URL(rawUrl);
    if (url.hostname !== "firebasestorage.googleapis.com") return rawUrl;
    const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match) return rawUrl;
    const bucket = decodeURIComponent(match[1]);
    const storagePath = decodeURIComponent(match[2]);
    const token = url.searchParams.get("token");
    if (!token) return rawUrl;
    const segments = storagePath.split("/").map(encodeURIComponent).join("/");
    return `${PUBLIC_ORIGIN}/f/${segments}?b=${encodeURIComponent(bucket)}&t=${encodeURIComponent(token)}`;
  } catch {
    return rawUrl;
  }
}

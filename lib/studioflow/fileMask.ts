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
export async function openSharedFile(rawUrl: string | null | undefined): Promise<void> {
  if (!rawUrl) return;
  const tab = typeof window !== "undefined" ? window.open("", "_blank", "noopener") : null;
  const link = await createSharedFileLink(rawUrl);
  if (tab) {
    tab.location.href = link;
  } else if (typeof window !== "undefined") {
    window.open(link, "_blank", "noopener");
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

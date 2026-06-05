// Rebrands a raw Firebase Storage download URL as a nivadesk.app link for the
// "open file" viewer (see app/f/[...slug]/route.ts). Use this ONLY for links the
// user opens/shares/copies — never for inline <img>/<iframe> embeds inside the app
// (those must keep the raw URL so the bytes load as the actual file).

const PUBLIC_ORIGIN = (process.env.NEXT_PUBLIC_NIVADESK_PUBLIC_ORIGIN || "https://nivadesk.app").replace(/\/$/, "");

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

// What an in-app file preview <iframe> may load (security audit #18, 28 Oct 2026).
//
// The preview frames draw a file's stored downloadURL. That URL comes from a
// Firestore record, and a record is something a workspace member can write: a
// `javascript:` URL there runs in nivadesk.app when the frame loads it, and any
// other origin can draw a page of its choosing inside the app. A frame now loads
// only Firebase Storage (https) or this site's own /f/ file links; anything
// else gets no frame, just the Open / Download link next to it.
//
// No `sandbox` attribute on these frames, on purpose: they show PDFs, and
// Chromium refuses to render a PDF in a sandboxed frame whatever the tokens
// (measured 28 Oct 2026 on Chromium 152: sandbox="" and sandbox="allow-scripts
// allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"
// both gave the blocked error page; the same PDF without sandbox rendered).
// Every origin allowed here is a different origin from the app, so what a frame
// draws cannot reach the app's page, storage or session; it gets no referrer.
// Frames that draw other content (bank receipt e-mails, the PDF settings
// preview) keep sandbox="".
export const PREVIEW_FRAME_ORIGINS = ["https://firebasestorage.googleapis.com", "https://storage.googleapis.com"] as const;

/** The URL to put in a preview frame, or "" to draw no frame. */
export function safePreviewFrameUrl(url: string | null | undefined, pageOrigin: string): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return "";
  let page: URL;
  let target: URL;
  try {
    page = new URL(pageOrigin);
    target = new URL(raw, page);
  } catch {
    return "";
  }
  if (target.username || target.password) return "";
  if (target.protocol === "https:" && (PREVIEW_FRAME_ORIGINS as readonly string[]).includes(target.origin)) return target.toString();
  if (target.origin === page.origin && target.pathname.startsWith("/f/")) return target.toString();
  // Local development only: the Storage emulator on loopback, from a loopback page.
  const loopback = (host: string) => host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  if (loopback(page.hostname) && loopback(target.hostname) && (target.protocol === "http:" || target.protocol === "https:")) return target.toString();
  return "";
}

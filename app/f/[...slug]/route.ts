import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// NivaDesk file viewer ("wrapper" masking).
//
// A masked link looks like:
//   https://nivadesk.app/f/companies/<cid>/client_files/photo.jpg?b=<bucket>&t=<token>
//
// The address bar stays on nivadesk.app, but the actual file bytes are loaded by
// the viewer's browser DIRECTLY from Firebase Storage — they never pass through
// our server. This route only returns a tiny HTML shell (a few KB).

const BUCKET_PATTERN = /^[a-z0-9._-]+\.(appspot\.com|firebasestorage\.app)$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic", "heif", "avif"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "ogg"]);

function errorPage(message: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>NivaDesk</title><style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;background:#0b0b0c;color:#e6e6e6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}div{text-align:center;padding:24px}h1{font-size:18px;margin:0 0 6px}p{color:#9a9a9a;margin:0;font-size:13px}</style></head><body><div><h1>NivaDesk</h1><p>${escapeHtml(message)}</p></div></body></html>`;
  return new Response(html, {
    status: 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const bucket = (searchParams.get("b") || "").trim();
  const token = (searchParams.get("t") || "").trim();

  const pathSegments = (slug || []).map(segment => decodeURIComponent(segment));
  const storagePath = pathSegments.join("/");
  const fileName = pathSegments[pathSegments.length - 1] || "file";

  if (!storagePath || storagePath.includes("..")) return errorPage("This file link is invalid.");
  if (!BUCKET_PATTERN.test(bucket)) return errorPage("This file link is invalid or has expired.");
  if (!TOKEN_PATTERN.test(token)) return errorPage("This file link is invalid or has expired.");

  // Reconstruct the real Firebase Storage download URL (loaded directly by the browser).
  const firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;

  const ext = extensionOf(fileName);
  const safeUrl = escapeHtml(firebaseUrl);
  const safeName = escapeHtml(fileName);

  let body: string;
  if (IMAGE_EXTENSIONS.has(ext)) {
    body = `<img src="${safeUrl}" alt="${safeName}" />`;
  } else if (PDF_EXTENSIONS.has(ext)) {
    body = `<iframe src="${safeUrl}" title="${safeName}"></iframe>`;
  } else if (VIDEO_EXTENSIONS.has(ext)) {
    body = `<video src="${safeUrl}" controls autoplay playsinline></video>`;
  } else if (AUDIO_EXTENSIONS.has(ext)) {
    body = `<div class="generic"><div class="filecard"><p class="name">${safeName}</p><audio src="${safeUrl}" controls></audio></div></div>`;
  } else {
    body = `<div class="generic"><div class="filecard"><p class="name">${safeName}</p><a class="dl" href="${safeUrl}" download="${safeName}">Download file</a></div></div>`;
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeName} · NivaDesk</title>
  <link rel="icon" href="/favicon.ico" />
  <style>
    html, body { height: 100%; margin: 0; background: #0b0b0c; }
    body { display: flex; align-items: center; justify-content: center; overflow: hidden; }
    img, video { max-width: 100vw; max-height: 100vh; object-fit: contain; display: block; }
    iframe { border: 0; width: 100vw; height: 100vh; background: #1b1b1f; }
    .generic { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .filecard { text-align: center; color: #e6e6e6; padding: 28px 32px; background: #161618; border: 1px solid #2a2a2e; border-radius: 16px; }
    .filecard .name { margin: 0 0 14px; font-weight: 700; font-size: 15px; word-break: break-all; }
    .filecard .dl { display: inline-block; padding: 10px 18px; border-radius: 10px; background: #16a34a; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; }
    .dl-fab { position: fixed; right: 16px; bottom: 16px; padding: 9px 14px; border-radius: 999px; background: rgba(22,163,74,0.92); color: #fff; text-decoration: none; font: 600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,0.35); }
  </style>
</head>
<body>
  ${body}
  ${IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext) ? `<a class="dl-fab" href="${safeUrl}" download="${safeName}">Download</a>` : ""}
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, max-age=0, must-revalidate",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

import { NextRequest } from "next/server";
import {
  MAX_PROXY_BYTES,
  PROXY_DEADLINE_MS,
  canonicalFileBucket,
  capBytes,
  declaredLengthExceedsCap
} from "@/lib/studioflow/fileProxyGuards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// NivaDesk file viewer ("wrapper" masking).
//
// A masked link looks like:
//   https://nivadesk.app/f/companies/<cid>/client_files/photo.jpg?b=<bucket>&t=<token>
//
// The address bar stays on nivadesk.app. For VIEWING, the bytes are loaded by the
// viewer's browser directly from Firebase Storage and this route returns only a
// tiny HTML shell (a few KB).
//
// For DOWNLOADING (?dl=1, added 2026-08-27) that is not true: streamDownload below
// fetches the file server-side and pipes it through this host, so the Download
// button never has to show or CORS-fetch the storage URL. This comment used to say
// the bytes never pass through our server, full stop — which is the sentence that
// talks a reviewer out of looking for a size cap. They do pass through, and what
// bounds them lives in lib/studioflow/fileProxyGuards.ts.
//
// This route is unauthenticated BY DESIGN: the links go to customers who have no
// NivaDesk account, and the Firebase download token in `t` is the capability. What
// it does have to authenticate is the ORIGIN OF THE BYTES — see canonicalFileBucket.
//
// The bucket arrives by TWO routes and both are checked HERE, where it is used:
// the caller's `?b=`, and the `bucket` field of a fileShares row handed back by
// nvViewSharedFile. The second is server-side data, which is why it was missed:
// the gate on the mint side (nvParseFirebaseStorageUrl) is not retroactive and
// does not land in the same deploy as this file, so a row written before either
// — or during the window between the two deploys — would otherwise be honoured
// for ever. A value is checked where it is used or it is not checked.

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

// A customer's own domain is white-label territory: the viewer drops the
// NivaDesk name there and lets the file speak for itself. On branded hosts the
// Cloudflare Worker proxies to the primary origin, so the true host arrives in
// X-NivaDesk-Client-Host — the plain Host header always says nivadesk.app.
function isNivaDeskHost(request: NextRequest): boolean {
  const host = (request.headers.get("x-nivadesk-client-host") || request.headers.get("host") || "")
    .split(":")[0]
    .toLowerCase();
  return !host || host === "localhost" || host === "nivadesk.app" || host.endsWith(".nivadesk.app");
}

function errorPage(message: string, showBrand = true): Response {
  const heading = showBrand ? "NivaDesk" : "File";
  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${heading}</title><style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;background:#0b0b0c;color:#e6e6e6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}div{text-align:center;padding:24px}h1{font-size:18px;margin:0 0 6px}p{color:#9a9a9a;margin:0;font-size:13px}</style></head><body><div><h1>${heading}</h1><p>${escapeHtml(message)}</p></div></body></html>`;
  return new Response(html, {
    status: 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
  });
}

const FUNCTIONS_BASE = "https://europe-west2-eggcraft-studio.cloudfunctions.net";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const bucket = (searchParams.get("b") || "").trim();
  const token = (searchParams.get("t") || "").trim();
  const nivadeskHost = isNivaDeskHost(request);
  const brandSuffix = nivadeskHost ? " · NivaDesk" : "";
  // ?dl=1 streams the bytes through this route with an attachment header, so
  // the Download button never has to show (or CORS-fetch) the storage URL.
  const wantsDownload = searchParams.get("dl") === "1";

  // Three bounds, because any one of them alone is a bound in name only:
  // the deadline (a request cannot hold a connection for ever), the declared
  // length (refuse before a byte moves when the upstream is honest about being
  // too big), and the byte count through the stream (content-length can be
  // absent, and it can lie). The counter is the one that actually makes the cap
  // true — it aborts mid-transfer, which cancels the upstream body.
  // `redirect: "manual"` is the fourth bound, and it is about origin rather than
  // size: without it the allowlist constrains where we ASK for bytes, not where we
  // READ them from, because a 3xx from the storage host would be followed to any
  // origin at all and that body served under our hostname with our attachment
  // header. firebasestorage.googleapis.com does not 3xx an alt=media download, so
  // this is defence in depth — but it is the one remaining way the bucket check
  // can be true and the bytes still not be ours. A 3xx now arrives as !upstream.ok
  // and is answered like any other failure.
  async function streamDownload(fileUrl: string, downloadName: string): Promise<Response> {
    const upstream = await fetch(fileUrl, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(PROXY_DEADLINE_MS)
    });
    if (!upstream.ok || !upstream.body) return errorPage("This file could not be downloaded right now.", nivadeskHost);
    if (declaredLengthExceedsCap(upstream.headers.get("content-length"), MAX_PROXY_BYTES)) {
      await upstream.body.cancel().catch(() => {});
      return errorPage("This file could not be downloaded right now.", nivadeskHost);
    }
    const safeDownloadName = downloadName.replace(/["\r\n\\]/g, "").slice(0, 180) || "file";
    return new Response(upstream.body.pipeThrough(capBytes(MAX_PROXY_BYTES)), {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/octet-stream",
        "content-disposition": `attachment; filename="${safeDownloadName}"`,
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow"
      }
    });
  }

  // Short-link mode: a single clean segment like /f/aB9xK2.png (no b/t params).
  // Resolve it through the function (it reads the /fileShares mapping and returns
  // the viewer HTML). Company id and token are never exposed in the URL.
  if ((slug || []).length === 1 && !bucket && !token) {
    const id = slug[0].replace(/\.[a-z0-9]+$/i, "");
    // Short-link download: resolve the mapping to the real target, then
    // stream it from here — same origin, no CORS, no storage URL anywhere.
    if (wantsDownload) {
      try {
        const metaResponse = await fetch(`${FUNCTIONS_BASE}/nvViewSharedFile?id=${encodeURIComponent(id)}&meta=1`, { cache: "no-store" });
        const meta = (await metaResponse.json()) as { ok?: boolean; bucket?: string; path?: string; token?: string; fileName?: string };
        if (!metaResponse.ok || !meta?.ok || !meta.bucket || !meta.path || !meta.token) {
          return errorPage("This file link has expired or does not exist.", nivadeskHost);
        }
        // The stored bucket gets the same identity test as the caller-supplied
        // one. This row was written by nvCreateFileLink, which now refuses a
        // foreign bucket — but only for rows written after that deploy, and this
        // file ships in a different one. Refused with the wording an expired
        // link gets, since to the customer that is what a dead row is.
        const sharedBucket = canonicalFileBucket(meta.bucket);
        if (!sharedBucket) {
          return errorPage("This file link has expired or does not exist.", nivadeskHost);
        }
        const target = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(sharedBucket)}/o/${encodeURIComponent(meta.path)}?alt=media&token=${encodeURIComponent(meta.token)}`;
        return await streamDownload(target, String(meta.fileName || slug[0]));
      } catch {
        return errorPage("This file could not be downloaded right now.", nivadeskHost);
      }
    }
    try {
      const upstream = await fetch(`${FUNCTIONS_BASE}/nvViewSharedFile?id=${encodeURIComponent(id)}${nivadeskHost ? "" : "&brand=0"}`, { cache: "no-store" });
      const html = await upstream.text();
      return new Response(html, {
        status: upstream.status,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store, no-cache, max-age=0, must-revalidate",
          "x-robots-tag": "noindex, nofollow"
        }
      });
    } catch {
      return errorPage("Could not load this file right now.", nivadeskHost);
    }
  }

  const pathSegments = (slug || []).map(segment => decodeURIComponent(segment));
  const storagePath = pathSegments.join("/");
  const fileName = pathSegments[pathSegments.length - 1] || "file";

  if (!storagePath || storagePath.includes("..")) return errorPage("This file link is invalid.", nivadeskHost);
  // Identity, not shape. A bucket that is not ours is answered with the same
  // words as an expired link, on purpose: the caller learns nothing about why.
  // Everything below uses `ourBucket` — the spelling the allowlist matched —
  // rather than `bucket`, the caller's; checking one string and using another is
  // the split that every bypass in this file's history has been made of.
  const ourBucket = canonicalFileBucket(bucket);
  if (!ourBucket) return errorPage("This file link is invalid or has expired.", nivadeskHost);
  if (!TOKEN_PATTERN.test(token)) return errorPage("This file link is invalid or has expired.", nivadeskHost);

  // Reconstruct the real Firebase Storage download URL (loaded directly by the browser).
  const firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(ourBucket)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;

  if (wantsDownload) {
    try {
      return await streamDownload(firebaseUrl, fileName);
    } catch {
      return errorPage("This file could not be downloaded right now.", nivadeskHost);
    }
  }

  const ext = extensionOf(fileName);
  const safeUrl = escapeHtml(firebaseUrl);
  const safeName = escapeHtml(fileName);
  // Download links stay on THIS host: the route streams the bytes itself.
  const downloadHref = escapeHtml(`${request.nextUrl.pathname}?b=${encodeURIComponent(ourBucket)}&t=${encodeURIComponent(token)}&dl=1`);

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
    body = `<div class="generic"><div class="filecard"><p class="name">${safeName}</p><a class="dl" href="${downloadHref}">Download file</a></div></div>`;
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeName}${brandSuffix}</title>
  <link rel="icon" href="/favicon.ico" />
  <style>
    /* 100vh on a phone is the viewport WITHOUT the browser's own toolbars, so a
       portrait photo sized to it hangs off the bottom of the screen. dvh is the
       height actually on show; vh stays as the fallback for older browsers. */
    html, body { height: 100%; margin: 0; background: #0b0b0c; }
    body {
      height: 100vh; height: 100dvh;
      display: flex; align-items: center; justify-content: center; overflow: hidden;
    }
    img, video { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
    iframe { border: 0; width: 100%; height: 100%; background: #1b1b1f; }
    .generic { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .filecard { text-align: center; color: #e6e6e6; padding: 28px 32px; background: #161618; border: 1px solid #2a2a2e; border-radius: 16px; }
    .filecard .name { margin: 0 0 14px; font-weight: 700; font-size: 15px; word-break: break-all; }
    .filecard .dl { display: inline-block; padding: 10px 18px; border-radius: 10px; background: #16a34a; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; }
    /* Clear of the home indicator and the Safari toolbar. */
    .dl-fab { position: fixed; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom)); padding: 9px 14px; border-radius: 999px; background: rgba(22,163,74,0.92); color: #fff; text-decoration: none; font: 600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,0.35); }
  </style>
</head>
<body>
  ${body}
  ${IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext) ? `<a class="dl-fab" href="${downloadHref}">Download</a>` : ""}
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

// Where a `?next=` link may send someone after signing in or signing up
// (security audit #47, 28 Oct 2026).
//
// The old test was `next.startsWith("/") && !next.startsWith("//")`. Browsers
// read a backslash as a slash in the path of an http(s) URL, and drop tabs and
// newlines from it, so `/\evil.example` and `/<TAB>/evil.example` passed that
// test and still left the site. The answer is the browser's own parser: resolve
// the value against this origin and keep it only if it is still this origin.
// Backslashes and control characters are refused before parsing, so what is
// checked is what the router will be handed.

// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\\\u0000-\u001f\u007f]/;

/**
 * A same-origin path (pathname + search + hash) for `next`, or `fallback`.
 * `origin` is the page's own origin (window.location.origin).
 */
export function safeNextPath(next: string | null | undefined, origin: string, fallback: string): string {
  const raw = typeof next === "string" ? next : "";
  if (!raw || raw.length > 2048) return fallback;
  if (FORBIDDEN.test(raw)) return fallback;
  // Only a path on this site, never an absolute or protocol-relative URL.
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  let base: URL;
  let url: URL;
  try {
    base = new URL(origin);
    url = new URL(raw, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base.origin) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The page's own `?next=`, made safe; `fallback` outside a browser. */
export function safeNextFromLocation(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const next = new URLSearchParams(window.location.search).get("next");
  return safeNextPath(next, window.location.origin, fallback);
}

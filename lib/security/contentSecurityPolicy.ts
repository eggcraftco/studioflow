// The Content-Security-Policy, REPORT-ONLY (security audit #18, 28 Oct 2026).
//
// Report-only first: the browser enforces nothing and prints every would-be
// block in the console (no report endpoint — nothing new is collected or
// sent). Switching to the enforcing header is the owner's decision, after the
// console of the live site has been read on the main screens (NOTES-web.md).
//
// Sent by middleware.ts, because it carries a fresh nonce per response: Next
// reads the nonce from this same header on the request and puts it on its own
// inline scripts (the RSC payload), and the root layout puts it on the theme
// bootstrap. Every page is dynamic (app/layout.tsx force-dynamic), so a
// per-request nonce never ends up in a cached page.
//
// Hosts, and why each one is here:
//   script   gstatic (reCAPTCHA for App Check, the push worker's Firebase
//            scripts), www.google.com (reCAPTCHA api.js), apis.google.com
//            (Firebase Auth popup helper), googletagmanager (Google Ads tag on
//            the public site), connect.facebook.net (Meta sign-up SDK)
//   connect  Firestore, Identity Toolkit, Secure Token, Functions
//            (cloudfunctions.net + gen2 run.app, europe-west2), Storage, App
//            Check, Installations + FCM (web push), reCAPTCHA, the Ads/Meta
//            beacons
//   frame    reCAPTCHA, the Firebase Auth helper iframe (authDomain), Storage
//            (file previews), this site's own /f/ pages, Meta's dialogs
//   frame-ancestors 'none' (same as X-Frame-Options: DENY), object-src 'none',
//   base-uri 'self', form-action 'self'.

export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";

const STORAGE_ORIGINS = ["https://firebasestorage.googleapis.com", "https://storage.googleapis.com"];

export type CspOptions = {
  nonce: string;
  /** next dev: React refresh needs eval and a websocket. */
  dev?: boolean;
  /** NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN (the Auth helper iframe and its requests). */
  authDomain?: string;
  /** NEXT_PUBLIC_FIREBASE_EMULATOR=1: local emulators on 127.0.0.1. */
  emulator?: boolean;
};

function authDomainOrigin(authDomain: string | undefined): string {
  const host = String(authDomain ?? "").trim().toLowerCase();
  return /^[a-z0-9.-]+$/.test(host) && host.includes(".") ? `https://${host}` : "";
}

/** The policy text for one response. */
export function buildContentSecurityPolicy({ nonce, dev = false, authDomain, emulator = false }: CspOptions): string {
  const auth = authDomainOrigin(authDomain);
  const local = emulator || dev ? ["http://127.0.0.1:*", "http://localhost:*", "ws://127.0.0.1:*", "ws://localhost:*"] : [];
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", [
      "'self'", `'nonce-${nonce}'`,
      "https://www.gstatic.com", "https://www.google.com", "https://apis.google.com",
      "https://www.googletagmanager.com", "https://connect.facebook.net",
      ...(dev ? ["'unsafe-eval'"] : [])
    ]],
    // Inline style attributes are everywhere in this app (React style={...}).
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["media-src", ["'self'", "blob:", ...STORAGE_ORIGINS]],
    ["connect-src", [
      "'self'",
      "https://firestore.googleapis.com",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      "https://*.cloudfunctions.net",
      "https://*.run.app",
      ...STORAGE_ORIGINS,
      "https://firebaseinstallations.googleapis.com",
      "https://fcmregistrations.googleapis.com",
      "https://fcm.googleapis.com",
      "https://content-firebaseappcheck.googleapis.com",
      "https://firebaseappcheck.googleapis.com",
      "https://www.google.com",
      "https://www.gstatic.com",
      "https://apis.google.com",
      "https://www.googletagmanager.com",
      "https://*.google-analytics.com",
      "https://*.doubleclick.net",
      "https://www.googleadservices.com",
      "https://*.facebook.com",
      ...(auth ? [auth] : []),
      ...local
    ]],
    ["frame-src", [
      "'self'",
      "https://www.google.com",
      "https://recaptcha.google.com",
      ...STORAGE_ORIGINS,
      "https://*.facebook.com",
      "blob:",
      ...(auth ? [auth] : []),
      ...local
    ]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]]
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

/** A nonce: 16 random bytes, base64. Web Crypto, so it runs in the middleware (edge) runtime. */
export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

import type { NextConfig } from "next";

const firebaseFunctionsBaseUrl = "https://europe-west2-eggcraft-studio.cloudfunctions.net";

// Sent on every response. None of these can change what a page does — they
// narrow what a browser is willing to do with it — so they go on now, while the
// Content-Security-Policy that CAN break a page is introduced separately, in
// report-only first.
//
// Checked before writing them: nothing in this app is embedded in an iframe
// (there is no Shopify-admin embedded page here), and nothing asks for a
// camera, microphone or location. Both would have to be revisited before a
// feature that needs either.
const SECURITY_HEADERS = [
  // One year, subdomains included, and deliberately NOT preloaded. Preloading
  // is a one-way door through the browser vendors; max-age is ours to lower.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // A response that says it is JSON is JSON. Stops a browser guessing that an
  // uploaded file is a script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No page here is meant to be framed, so clickjacking has no surface.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Capabilities this app does not use are switched off rather than left
  // available to anything that ends up running on the page.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
  },
  // NOT "same-origin", and the difference is a working sign-in button.
  //
  // Firebase Auth's signInWithPopup opens Google's or Apple's page in a popup
  // and reads the credential back through window.opener. "same-origin" puts the
  // popup in a different browsing context group and severs that reference, so
  // the popup completes and the app never hears about it — the button spins
  // forever. Three paths depend on it: Google and Apple sign-in
  // (components/AuthProviders.tsx), the ChatGPT connect page, and unlocking a
  // locked session with reauthenticateWithPopup.
  //
  // "same-origin-allow-popups" keeps the protection that matters — a document
  // that opens US cannot reach into this one — while letting popups we open
  // ourselves keep talking back.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" }
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // "x-powered-by: Next.js" tells an attacker which framework to look up.
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/chatgptMcp",
        destination: `${firebaseFunctionsBaseUrl}/chatgptMcp`
      },
      {
        source: "/chatgptOAuthAuthorizationServer",
        destination: `${firebaseFunctionsBaseUrl}/chatgptOAuthAuthorizationServer`
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, max-age=0, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" }
        ]
      },
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          // Static chunks are fetched by the page itself, so they keep the
          // same-origin resource policy; without this they would be the one
          // response class that opts out of it.
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" }
        ]
      },
      {
        source: "/:path*",
        headers: SECURITY_HEADERS
      }
    ];
  }
};

export default nextConfig;

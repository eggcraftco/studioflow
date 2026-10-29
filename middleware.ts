import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildContentSecurityPolicy, createCspNonce, CSP_REPORT_ONLY_HEADER } from "@/lib/security/contentSecurityPolicy";

// Content-Security-Policy, report-only (security audit #18): a fresh nonce per
// response. The policy goes on the REQUEST too, because that is where Next looks
// for the nonce to put on its own inline scripts; the layout reads `x-nonce`
// for the theme bootstrap. See lib/security/contentSecurityPolicy.ts.
//
// Client-domain plan, D2: /r/<token> is the short customer link. It works on
// every host — nivadesk.app today, workspace subdomains and custom domains
// once the wildcard/custom-hostname serving is switched on — and lands on the
// same token-addressed portal page. A rewrite (not a redirect) keeps the
// branded hostname in the customer's address bar.
export function middleware(request: NextRequest) {
  const nonce = createCspNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV !== "production",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    emulator: process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1"
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(CSP_REPORT_ONLY_HEADER.toLowerCase(), policy);

  const match = request.nextUrl.pathname.match(/^\/r\/([A-Za-z0-9_-]{8,})\/?$/);
  let response: NextResponse;
  if (match) {
    const url = request.nextUrl.clone();
    url.pathname = `/track/${match[1]}`;
    response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  response.headers.set(CSP_REPORT_ONLY_HEADER, policy);
  return response;
}

// Pages and route handlers get the policy; static files (not documents), the
// proxied MCP / OAuth endpoints and router prefetches do not. /r/ always runs
// (the rewrite). Literals only: Next reads this at build time.
export const config = {
  matcher: [
    "/r/:path*",
    {
      source: "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|chatgptMcp|chatgptOAuth|claudeMcp|\\.well-known|.*\\.(?:png|jpe?g|gif|svg|webp|ico|mp4|mov|webm|woff2?|ttf|otf|css|js|map|txt|xml|json|pdf)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};

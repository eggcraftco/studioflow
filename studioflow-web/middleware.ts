import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Client-domain plan, D2: /r/<token> is the short customer link. It works on
// every host — nivadesk.app today, workspace subdomains and custom domains
// once the wildcard/custom-hostname serving is switched on — and lands on the
// same token-addressed portal page. A rewrite (not a redirect) keeps the
// branded hostname in the customer's address bar.
export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/^\/r\/([A-Za-z0-9_-]{8,})\/?$/);
  if (match) {
    const url = request.nextUrl.clone();
    url.pathname = `/track/${match[1]}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/r/:path*"]
};

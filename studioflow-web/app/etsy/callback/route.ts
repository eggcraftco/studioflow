import { NextRequest, NextResponse } from "next/server";

// Etsy's consent screen names the destination it will return the seller to, and
// warns in yellow when that destination is not the app's registered domain:
//
//   "The destination (europe-west2-eggcraft-studio.cloudfunctions.net) does not
//    match the registered domain for NivaDesk. Do not grant access if you did
//    not expect to see this application."
//
// Which is exactly right of Etsy, and exactly wrong for us: a seller who has
// never met us reads a phishing warning at the moment they are handing over
// access to their shop. Most will stop there, and they should.
//
// So the registered callback is on our own domain and this route passes the
// visit through to the Cloud Function that does the work. Etsy checks the
// redirect_uri, sees nivadesk.app, and drops the warning. Nothing else changes:
// the code is single-use, PKCE-bound, and the exchange still happens
// server-side where the tokens can be encrypted before anything is stored.

const CALLBACK = "https://europe-west2-eggcraft-studio.cloudfunctions.net/etsyOAuthCallback";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const target = new URL(CALLBACK);
  // Forward every parameter untouched — state, code and Etsy's own error
  // fields. Reading or rewriting any of them here would put this route in the
  // security path of the flow, and it has no business being there.
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return NextResponse.redirect(target.toString(), 302);
}

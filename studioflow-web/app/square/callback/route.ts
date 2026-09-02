import { NextRequest, NextResponse } from "next/server";

// Square's Developer Console holds one registered redirect URL per
// application, and the merchant's browser lands on it after consent. It is on
// our own domain for the same reason Etsy's is: a merchant meeting NivaDesk
// for the first time should see nivadesk.app, not a Google function host, at
// the moment they hand over access. This route forwards the visit untouched to
// the Cloud Function that consumes the single-use state, exchanges the code
// server-side and boxes the tokens before anything is stored.
const CALLBACK = "https://europe-west2-eggcraft-studio.cloudfunctions.net/squareOAuthCallback";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const target = new URL(CALLBACK);
  // Every parameter goes through as it came — code, state and Square's own
  // error fields. Reading or rewriting any of them here would put this route
  // in the security path of the flow, and it has no business being there.
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return NextResponse.redirect(target.toString(), 302);
}

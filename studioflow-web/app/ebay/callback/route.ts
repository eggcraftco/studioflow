import { NextRequest, NextResponse } from "next/server";

// eBay's RuName holds one "accepted URL" per application, and the seller's
// browser lands on it after consent. It is on our own domain for the same
// reason Etsy's and Square's are: a seller meeting NivaDesk for the first time
// should see nivadesk.app, not a Google function host, at the moment they hand
// over access to their orders. This route forwards the visit to the Cloud
// Function that consumes the single-use state, exchanges the code server-side
// and boxes the tokens before anything is stored.
//
// It adds exactly one thing of its own: the browser-binding nonce.
//
// Without it, an owner of workspace B could mint an authorize URL and phish a
// foreign seller into approving it — the seller's account, orders and buyers
// would land in B, and server-side binding to companyId+uid would not notice,
// because the attacker IS that uid. The nonce was set as a cookie by the
// browser that pressed Connect; a phished browser has no cookie, the callback
// carries no nonce, and the state is burned unused. The route still reads and
// rewrites no eBay parameter of any kind: it has no business in that half of
// the flow.
const CALLBACK = "https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayOAuthCallback";
const NONCE_COOKIE = "nv_ebay_nonce";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const target = new URL(CALLBACK);
  // Every eBay parameter goes through as it came — code, state, expires_in and
  // eBay's own error fields.
  request.nextUrl.searchParams.forEach((value, key) => {
    if (key !== "nonce") target.searchParams.set(key, value);
  });
  const nonce = request.cookies.get(NONCE_COOKIE)?.value || "";
  if (nonce) target.searchParams.set("nonce", nonce);

  const response = NextResponse.redirect(target.toString(), 302);
  // Single use, whatever the outcome: the state is burned on the other side and
  // a second attempt starts a fresh flow with a fresh nonce.
  response.cookies.set(NONCE_COOKIE, "", { path: "/ebay/callback", maxAge: 0, sameSite: "lax", secure: true });
  return response;
}

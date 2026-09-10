// The two cookie names of one eBay connect flow (design §5.5).
//
// This file exists so that the three parties that need a name — the browser
// script that writes the nonce, the route that seals the ticket, and the route
// that reads both when eBay lands — derive it the same way, with no key and no
// async crypto. It imports nothing on purpose: `lib/studioflow/ebay.ts` is a
// client module and pulls `node:crypto` into no bundle.
//
// The tag is NOT a secret and NOT a security boundary. The state is in
// Hostinger's access log by construction (§5.4, residual 1), so a flow tag tells
// an attacker nothing they could not read there. Its job is collision
// avoidance: before the tag, a seller who pressed Connect twice — or opened
// settings in two tabs — overwrote their first flow's pair with their second's,
// and a cross-site plant could overwrite a live ticket under a name it did not
// hold a ticket for. The security comes from the two things around it: the
// sealing route derives the name from the ticket's own MAC-COVERED state, and
// `__Host-` means no other origin can set that name at all.

/** The first sixteen characters of the state. The state's alphabet — §4.5's
 *  `[A-Za-z0-9_-]` — is a subset of what a cookie name may contain, so the tag
 *  needs no escaping and can never end a name early. */
export function ebayFlowTag(state: string): string {
  return String(state || "").slice(0, 16);
}

/** Written by client JavaScript; readable by script on this origin (residual 2). */
export function ebayNonceCookieName(state: string): string {
  return `__Host-nv_ebay_nonce_${ebayFlowTag(state)}`;
}

/** Written by `POST /ebay/ticket`, HttpOnly, never readable by script. */
export function ebayTicketCookieName(state: string): string {
  return `__Host-nv_ebay_ticket_${ebayFlowTag(state)}`;
}

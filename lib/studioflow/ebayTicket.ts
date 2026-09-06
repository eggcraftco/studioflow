// The browser-binding ticket, verified (design §5.5).
//
// SERVER ONLY. It reads `node:crypto` and the relay key, so it is imported by
// the two route handlers and by nothing a browser can reach. The client half of
// this flow is `lib/studioflow/ebay.ts`, which imports only the cookie NAMES.
//
// A ticket is one ASCII string:
//
//     nv1.<state>.<nonceTag>.<expMs>.<jti>.<mac>
//
// and it is verified without a JSON parser anywhere near attacker bytes: a
// length cap, one regex, one HMAC, two numeric comparisons and two constant-time
// compares. What a valid one proves, exactly: that something holding the shared
// key minted it, for this state, over this nonce, inside its window. It does not
// prove the FUNCTION minted it — the key below is derived from the key this tier
// already holds, so this tier can mint as easily as it verifies (residual 4).

import { createHmac, timingSafeEqual } from "node:crypto";

/** The label the function uses, character for character. Domain separation: a
 *  relay signature is `HMAC(key, "v1." + …)`, a ticket is
 *  `HMAC(derived, "nv1." + …)`, a nonce tag is `HMAC(derived, "nonce." + …)`. */
const TICKET_KEY_LABEL = "nivadesk/ebay/ticket/v1";
const TICKET_NONCE_LABEL = "nonce.";
/** A cheap cap applied before the regex, which is applied before any split. */
export const TICKET_MAX_LENGTH = 400;
export const TICKET_PATTERN = /^nv1\.[A-Za-z0-9_-]{20,120}\.[A-Za-z0-9_-]{43}\.[0-9]{13}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;
/** A state cannot live past ten minutes, so a ticket claiming more than this was
 *  minted by a rule that no longer exists. A belt over the MAC, not a substitute. */
export const TICKET_MAX_REMAINING_MS = 15 * 60 * 1000;

/** The six ways a ticket can fail. A closed set that can carry no value: it is
 *  counted and it reaches a log line, and the seller's answer is identical for
 *  all six, so the verifier is no more an oracle than the 401 wall is. */
export type TicketFailure = "no-cookie" | "shape" | "mac" | "expired" | "state" | "nonce";

export type TicketResult =
  | { ok: true; state: string; expMs: number; jti: string }
  | { ok: false; failure: TicketFailure };

/** There is no sixth secret: the ticket key is the relay key under a label, so a
 *  rotation of `EBAY_CALLBACK_KEY` rotates this with it and needs no new step. */
export function ebayTicketKey(relayKey: string): Buffer {
  return createHmac("sha256", relayKey).update(TICKET_KEY_LABEL, "utf8").digest();
}

/** `base64url(HMAC(ticketKey, "nonce." + nonce))` — keyed, so a ticket holder
 *  cannot confirm a guessed nonce, and NOT `sha256hex(nonce)`, which is the value
 *  the state document compares against `nonceHash`. */
export function ebayNonceTag(ticketKey: Buffer, nonce: string): string {
  return createHmac("sha256", ticketKey).update(`${TICKET_NONCE_LABEL}${nonce}`, "utf8").digest("base64url");
}

function sameBytes(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // timingSafeEqual throws on unequal lengths, and both lengths here are fixed
  // and public, so the guard leaks nothing the shape check did not already give.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Steps b–d of §5.5's edge verification: shape, MAC, window. Everything this can
 * decide without knowing which flow it belongs to — which is exactly what the
 * sealing route may check, since it holds no cookies and knows no nonce.
 */
export function verifyEbayTicket(ticketKey: Buffer, ticket: string, nowMs: number): TicketResult {
  const value = String(ticket || "");
  if (!value) return { ok: false, failure: "no-cookie" };
  if (value.length > TICKET_MAX_LENGTH || !TICKET_PATTERN.test(value)) return { ok: false, failure: "shape" };
  const cut = value.lastIndexOf(".");
  const payload = value.slice(0, cut);
  const mac = value.slice(cut + 1);
  if (!sameBytes(mac, createHmac("sha256", ticketKey).update(payload, "utf8").digest("base64url"))) return { ok: false, failure: "mac" };
  // Only now, with the MAC proven, are the fields read as values.
  const parts = payload.split(".");
  const expMs = Number(parts[3]);
  if (!(expMs > nowMs) || expMs > nowMs + TICKET_MAX_REMAINING_MS) return { ok: false, failure: "expired" };
  return { ok: true, state: parts[1], expMs, jti: parts[4] };
}

/**
 * Steps e–f as well: this ticket names THIS flow's state, and the nonce this
 * browser is holding is the one it was minted over. Step f is what makes §5.4's
 * criterion 4 literal — a ticket minted for another nonce fails in the web
 * layer, before anything is signed.
 */
export function verifyEbayTicketForFlow(
  ticketKey: Buffer, ticket: string, queryState: string, nonceCookie: string, nowMs: number
): TicketResult {
  const verified = verifyEbayTicket(ticketKey, ticket, nowMs);
  if (!verified.ok) return verified;
  // A plain byte comparison on purpose: neither value is a secret — the state is
  // in the access log by construction — and a constant-time compare here would
  // imply a protection this system does not have.
  if (verified.state !== String(queryState || "")) return { ok: false, failure: "state" };
  const tag = String(ticket).split(".")[2];
  if (!sameBytes(tag, ebayNonceTag(ticketKey, String(nonceCookie || "")))) return { ok: false, failure: "nonce" };
  return verified;
}

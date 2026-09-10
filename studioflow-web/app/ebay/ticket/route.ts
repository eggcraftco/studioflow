import { NextRequest, NextResponse } from "next/server";
import { ebayTicketCookieName } from "../../../lib/studioflow/ebayFlow";
import { ebayTicketKey, verifyEbayTicket, TICKET_MAX_LENGTH } from "../../../lib/studioflow/ebayTicket";
import { bucketFor, clientAddress, takeToken, type Bucket } from "../../../lib/studioflow/ebayAdmission";

// Sealing the browser-binding ticket into a cookie (design §5.5).
//
// The ticket cookie must be HttpOnly, and client JavaScript cannot set an
// HttpOnly cookie. So this route exists to do exactly one thing: take a ticket
// the client already holds, verify it with the key this tier already has, and
// answer with the one `Set-Cookie` that seals it. It reads no cookies, knows no
// nonce, talks to nothing, and stores nothing.
//
// The attack it is shaped against is a CROSS-SITE PLANT, and it is worth stating
// as an attack because two plausible readings of the platform are wrong:
// `request.json()` parses a body regardless of its content type, and
// `SameSite=Lax` governs whether a cookie is SENT, not whether a first-party
// `Set-Cookie` on the response is STORED. Without the checks below, a page on
// any origin could post a JSON-shaped body through an
// `enctype="text/plain"` form — no CORS preflight, nothing for the victim to
// see behind a 204 — and make the victim's browser store the ATTACKER's valid
// ticket. The victim then returns from eBay, the ticket names another state, the
// landing is refused and the live authorization code is destroyed: repeatable at
// will, from any page the seller happens to visit. Three independent controls
// close it — the `Sec-Fetch-Site`/`Origin` check (a browser cannot forge
// either), the exact content type (which forces a preflight this route answers
// for nobody), and the per-flow cookie name (so a plant cannot collide with a
// live flow even if one got through).
//
// Those header checks stop a BROWSER being used as somebody's agent, which is
// the whole of the CSRF harm. They do nothing against a direct, non-browser
// client — that is what the buckets and the counters below are for.

// Node, not Edge, for §5.4's reason: Next replaces process.env statically for
// Edge handlers, which would bake the relay key into the build output.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGIN = "https://nivadesk.app";
const KEY_MIN_LENGTH = 32;
const MAX_BODY_BYTES = 1024;
// Admission. Why the header is worth only a courtesy limit, and why the
// per-process bucket is the real bound, is stated once in
// lib/studioflow/ebayAdmission.ts for this route and the callback's alike.
//
// THE PER-PROCESS BUCKET USED TO BE AN ANONYMOUS GLOBAL KILL SWITCH, and that is
// what the reserve below exists for. It is charged for every caller before
// anything else, and sealing is the ONLY way a seller reaches eBay: `sealEbayTicket`
// returns false for anything but a 204 and `EbayStartContent`/`startConnect` then
// refuse to send them. Measured: 320 anonymous posts carrying a junk ticket, each
// from a different spoofed address, drained the bucket, and the very next call —
// a genuine seller sealing a REAL ticket the real minter produced — answered 429.
// Five requests a second, from anywhere, with no credential, closed Connect eBay
// for every seller on the process.
//
// The fix is not a bigger number; it is that an exhausted bucket must not refuse
// a caller who can PROVE a key holder minted their ticket. A ticket is a MAC over
// a state, a nonce tag and an expiry, and only `beginEbayConnect` and
// `claimEbayConnectState` mint them — both authenticated, both workspace-owner
// gated. So verification, which is one HMAC over at most 400 bytes, runs first,
// and a verified ticket draws on a RESERVE keyed on the ticket's own MAC-covered
// state. Keyed on the flow, not global, because the one party who can flood
// valid tickets is someone replaying a ticket of their own: that costs their own
// flow its reserve and nobody else's.
//
// What an exhausted process bucket still refuses is every request whose ticket
// does not verify, which is the whole of a flood.
const PER_ADDRESS_PER_MINUTE = 30;
const PER_PROCESS_PER_MINUTE = 300;
const RESERVE_PER_FLOW_PER_MINUTE = 10;
const COUNTER_WINDOW_MS = 60 * 1000;
const OPS_LOG_EVERY_MS = 60 * 1000;

const addressBuckets = new Map<string, Bucket>();
const flowBuckets = new Map<string, Bucket>();
const processBucket: Bucket = { tokens: PER_PROCESS_PER_MINUTE, atMs: 0 };

/** `ok`, or which of the two bounds refused — the caller treats them differently. */
type Admission = "ok" | "process" | "address";

function admitted(address: string, nowMs: number): Admission {
  if (!takeToken(processBucket, PER_PROCESS_PER_MINUTE, nowMs)) return "process";
  if (!address) return "ok";
  return takeToken(bucketFor(addressBuckets, address, PER_ADDRESS_PER_MINUTE, nowMs), PER_ADDRESS_PER_MINUTE, nowMs) ? "ok" : "address";
}

// Counts, not lines: a count over a throttled line measures minutes with at
// least one event. So the example line stays throttled and these are emitted
// unthrottled, once a minute, carrying numbers and nothing else. `blocked` is
// the cross-site plant — the one thing here an operator wants to see a spike of.
const counts = { sealed: 0, refused: 0, throttled: 0, blocked: 0, fromMs: 0 };
let saidAtMs = 0;
let saidKeyAtMs = 0;

function tick(field: "sealed" | "refused" | "throttled" | "blocked", nowMs: number) {
  counts[field] += 1;
  if (counts.fromMs === 0) { counts.fromMs = nowMs; return; }
  const window = nowMs - counts.fromMs;
  if (window < COUNTER_WINDOW_MS) return;
  if (counts.sealed || counts.refused || counts.throttled || counts.blocked) {
    console.warn(`ebay ticket route window=${window} sealed=${counts.sealed} refused=${counts.refused} throttled=${counts.throttled} blocked=${counts.blocked}`);
  }
  counts.sealed = 0; counts.refused = 0; counts.throttled = 0; counts.blocked = 0; counts.fromMs = nowMs;
}

/** One throttled ops line, and it names nothing: never a ticket, never an
 *  address, never a body. The volume lives in the aggregate above. */
function sayRefused(nowMs: number) {
  if (nowMs - saidAtMs < OPS_LOG_EVERY_MS) return;
  saidAtMs = nowMs;
  console.warn("ebay ticket: refused");
}

const NO_STORE = { "cache-control": "no-store" };
const refuse = (status: number) => NextResponse.json({ ok: false }, { status, headers: NO_STORE });

/** The body, read with a cap rather than parsed with none: `request.json()` on
 *  an uncapped body is the mistake this avoids. Returns null when the cap is
 *  passed, and nothing is parsed in that case. */
async function readCapped(request: NextRequest): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") || "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const stream = request.body;
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: NextRequest) {
  const nowMs = Date.now();

  // 1. Same-origin, enforced by header and not by hope. A browser sets both of
  // these itself and a page cannot forge either.
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if (site !== null ? site !== "same-origin" : origin !== ORIGIN) { tick("blocked", nowMs); sayRefused(nowMs); return refuse(400); }

  // 2. Exactly application/json, after lowercasing and stripping parameters.
  // This is what makes a cross-origin `<form>` post impossible without a
  // preflight, and the preflight is answered for nobody.
  const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") { tick("blocked", nowMs); sayRefused(nowMs); return refuse(400); }

  // 3. Admission, bounded twice. The address is used for a counter and never for
  // anything else. A refusal is not final yet: an exhausted PROCESS bucket is
  // reconsidered at step 5 for a caller whose ticket verifies, because that
  // bucket is anonymous and global and refusing on it alone is a kill switch.
  // The per-address bucket is final — it binds one address, so it cannot be a
  // kill switch for anybody else.
  const address = clientAddress(request.headers.get("x-forwarded-for"));
  const admission = admitted(address, nowMs);
  if (admission === "address") { tick("throttled", nowMs); sayRefused(nowMs); return refuse(429); }

  const text = await readCapped(request);
  if (text === null) { tick("refused", nowMs); sayRefused(nowMs); return refuse(400); }
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!body || typeof body !== "object" || Array.isArray(body)) { tick("refused", nowMs); sayRefused(nowMs); return refuse(400); }
  const ticket = (body as { ticket?: unknown }).ticket;
  if (typeof ticket !== "string" || !ticket || ticket.length > TICKET_MAX_LENGTH) { tick("refused", nowMs); sayRefused(nowMs); return refuse(400); }

  // 4. The key, read INSIDE the handler so a rotation is a restart and not a
  // rebuild, and never NEXT_PUBLIC_. A missing key is OUR failure, not the
  // caller's, and it must be told apart from a bad ticket: the client says "try
  // again" for a 503 and "start again in the same browser" for a 400.
  const key = String(process.env.NIVADESK_EBAY_CALLBACK_KEY || "");
  if (key.length < KEY_MIN_LENGTH) {
    // Throttled like every other line here, and for the same reason: this
    // endpoint is anonymous, so an unthrottled per-request error line is a way
    // for a stranger to bury the very line the rollout tells the operator to
    // grep for. What is suppressed is a repeat of a line already there.
    if (nowMs - saidKeyAtMs >= OPS_LOG_EVERY_MS) {
      saidKeyAtMs = nowMs;
      console.error("ebay ticket route: NIVADESK_EBAY_CALLBACK_KEY not configured");
    }
    return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE });
  }

  // 5. Shape, MAC, window. No cookie is read and no nonce is known here: this
  // route can only seal what a key holder minted, and only for the flow the
  // ticket itself names.
  const verified = verifyEbayTicket(ebayTicketKey(key), ticket, nowMs);
  if (!verified.ok) {
    // An unverifiable ticket under an exhausted process bucket is a flood, and it
    // is told so rather than told its ticket is bad: the 429 is the honest answer
    // and it costs the caller a retry rather than a diagnosis.
    tick(admission === "process" ? "throttled" : "refused", nowMs);
    sayRefused(nowMs);
    return refuse(admission === "process" ? 429 : 400);
  }
  // The reserve. Only reached when the anonymous global bucket is empty, and keyed
  // on the ticket's own MAC-covered state, so the one caller who can exhaust it —
  // somebody replaying a valid ticket of their own — closes their own flow and
  // nobody else's.
  if (admission === "process"
    && !takeToken(bucketFor(flowBuckets, verified.state, RESERVE_PER_FLOW_PER_MINUTE, nowMs), RESERVE_PER_FLOW_PER_MINUTE, nowMs)) {
    tick("throttled", nowMs); sayRefused(nowMs); return refuse(429);
  }

  // 6. One header, under a name derived from the ticket's OWN MAC-covered state
  // — so this is not a way to plant chosen bytes, and not a way to plant
  // anything under a name belonging to a flow the caller holds no ticket for.
  // `Max-Age` comes from the MAC-covered `expMs`, so a ticket is never extended:
  // two minutes left seals into a two-minute cookie, and none seals into nothing
  // (the window check above already refused it).
  const maxAge = Math.ceil((verified.expMs - nowMs) / 1000);
  const cookie = `${ebayTicketCookieName(verified.state)}=${ticket}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Lax`;
  tick("sealed", nowMs);
  return new NextResponse(null, { status: 204, headers: { ...NO_STORE, "set-cookie": cookie } });
}

// POST only. Everything else is 405 — including OPTIONS, which is how the
// preflight that the exact content type forces gets answered for nobody.
const notAllowed = () => NextResponse.json({ ok: false }, { status: 405, headers: NO_STORE });
export const GET = notAllowed;
export const PUT = notAllowed;
export const PATCH = notAllowed;
export const DELETE = notAllowed;
export const HEAD = notAllowed;
export const OPTIONS = notAllowed;

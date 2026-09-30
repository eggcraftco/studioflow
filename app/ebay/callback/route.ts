import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes } from "node:crypto";
import { ebayNonceCookieName, ebayTicketCookieName } from "../../../lib/studioflow/ebayFlow";
import { bucketFor, takeToken, untrustedBucketKey, type Bucket } from "../../../lib/studioflow/ebayAdmission";
import { ebayTicketKey, verifyEbayTicketForFlow, type TicketFailure, type TicketResult } from "../../../lib/studioflow/ebayTicket";
import { spendTicket } from "../../../lib/studioflow/ebayTicketSpend";

// eBay's RuName holds one "accepted URL" per application, and the seller's
// browser lands on it after consent. It is on our own domain for the same
// reason Etsy's and Square's are: a seller meeting NivaDesk for the first time
// should see nivadesk.app, not a Google function host, at the moment they hand
// over access to their orders.
//
// What this route does with that visit is design §5.4 and §5.5, and the reason
// for the transport is one sentence: Cloud Run writes httpRequest.requestUrl —
// query string included — into Cloud Logging on every request. Redirecting the
// browser onward to ebayOAuthCallback?code=…&state=…&nonce=… therefore published
// the authorization code AND the browser-binding nonce to everyone with log
// access on eggcraft-studio.
//
// So the browser stops here. eBay lands on nivadesk.app, this route decides the
// things only it can see — did eBay decline, and does this browser hold the
// binding this flow was started with — and everything after that is a
// server-to-server POST whose JSON body is signed with
// NIVADESK_EBAY_CALLBACK_KEY. The code and the nonce travel in a body Cloud Run
// does not record. They appear in no URL on this hop, and there is no other hop.
//
// §5.5 CLOSES THE PUBLIC ENTRANCE this route used to have. §5.4 signed
// unconditionally and recorded the consequence as an accepted residual: any
// anonymous caller who asked for /ebay/callback?code=x&state=<20–120 shaped
// characters> made our own server mint a valid HMAC and drove the function into
// a Firestore transaction against a state THEY named. The remedy is not an edge
// refusal — §5.4 proved that removing the POST leaves eBay's code alive with
// nothing on our side able to kill it, which is the whole of residual 1 — so it
// is a BINDING this edge can verify on its own, with no Firestore, no new
// credential and no round trip, plus a strictly weaker second envelope for the
// case where that binding is absent:
//
//   * a verified ticket, THE FIRST TIME THIS PROCESS IS SHOWN IT, posts §5.4's
//     `connect` envelope, unchanged byte for byte;
//   * anything else — an unverifiable ticket, or one already spent here — posts
//     a `dispose` envelope, which has NO state key and no nonce key, and which
//     the function refuses if it carries either.
//
// A public caller can therefore still make us sign — that cost is real and is
// not waved away — but what they can make us sign no longer names anything they
// chose. Its only Firestore effect is ONE `.create()` at `ebayPresentedCodes/`
// under an id the caller cannot aim (a hash of the code), and its only effect on
// the world is that an eBay authorization code stops working — through us for
// certain, and at eBay too if the disposal lands: an attacker who spends a
// request on that is doing our job.

// Node, not Edge, and this is load-bearing rather than a default: Next replaces
// process.env statically for Edge route handlers, which would bake the relay key
// into the build output and make a rotation a rebuild. `node:crypto` needs it too.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CALLBACK = "https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayOAuthCallback";
// An isolated acceptance run points this route at an emulator, and nothing else
// can: the override is honoured only in a NON-production build (next dev) and
// only for a loopback target. `next build` inlines NODE_ENV as "production", so
// on Hostinger the branch is dead code and the relay goes to CALLBACK whatever
// the environment says — a mistyped variable there cannot aim a signed body.
const LOOPBACK_RELAY = /^http:\/\/127\.0\.0\.1:\d{2,5}\/[A-Za-z0-9_\-/]+$/;
function relayTarget(): string {
  const override = String(process.env.NIVADESK_EBAY_CALLBACK_RELAY_URL || "");
  if (process.env.NODE_ENV !== "production" && LOOPBACK_RELAY.test(override)) return override;
  return CALLBACK;
}

// The same shapes the function enforces. They are checked here as an economy —
// a scan then never costs a function invocation — and there as well, because the
// function must not depend on a caller having checked anything (§5.4).
const STATE_PATTERN = /^[A-Za-z0-9_-]{20,120}$/;
const MAX_CODE_LENGTH = 4096;
const MAX_NONCE_LENGTH = 200;
// The function caps the BODY at 8192 bytes while capping `code` at 4096
// characters, and those are different units: a multi-byte code this route
// accepts can be an oversize 400 over there — a refusal with no burn, arrived at
// by disagreement rather than by decision. Both checks are therefore made here,
// in the function's own units, over the exact bytes that will be sent.
const MAX_BODY_BYTES = 8192;
const KEY_MIN_LENGTH = 32;
// Against the function's own 120 seconds. Overrunning this budget does not stop
// the connection — the function finishes and the row appears — but it lands the
// seller on "try again" at the moment of first impression, so it is set well
// above the realistic worst case rather than at a round number: a Cloud Run cold
// start on the functions bundle, eBay's token and identity round trips (20 s
// apiece inside `commerce/ebay/oauth.js`), the credential box and five Firestore
// writes; on a refusal, the redeem-and-discard token request instead.
// It is NOT measured. Deploy plan §4.3 step 9 records the real p99 of the first
// sandbox connections beside this constant, and if Hostinger imposes a shorter
// request ceiling of its own, that ceiling is the number to write here.
const RELAY_TIMEOUT_MS = 45 * 1000;
// A disposal is a belt and not the defence — the defence is the function's
// presented-code registry — so its admission counter may be exhausted without
// anything being turned off. What it bounds is OUR OWN COST, and that is the
// bound this route was missing: every landing here is a signed POST we mint and
// a Cloud Function invocation we pay for, and the per-address counter is a
// courtesy limit on a header nothing has established as trustworthy
// (lib/studioflow/ebayAdmission.ts states why, once, for both routes). Measured
// before this: 60 landings with no `x-forwarded-for` produced 60 signed POSTs,
// and 60 with one spoofed address each produced 60 more.
//
// So the per-process bucket is the real bound and is charged first, exactly as
// `app/ebay/ticket/route.ts` does. Its size is that route's, for the same reason:
// it is meant to be reached first by anything that matters, and it is far above
// any plausible rate of genuine phished landings — which are rare, because the
// common case is a seller with cookies, who never reaches this path.
//
// AND THE PER-ADDRESS COUNTER IS NOT A LEVER OF ITS OWN — which is L1, the
// callback's half of M1. It used to refuse FINALLY: thirty landings naming a
// chosen address drained that key's bucket, and after that a genuine phished
// landing from that address made no dispose POST at all, leaving eBay's code
// both unregistered and unspent. The reasoning that allowed it was the ticket
// route's word for word ("it binds one address, so it cannot be a kill switch
// for anybody else"), and it has the same hole: the key is not a property of
// the caller, it is a header the caller writes, so an attacker does not evade
// that bucket, they AIM it. Here it is worse than at the sealing route, because
// what a refusal withholds is not something the caller wanted — a disposal is
// OUR defence for the seller whose code just landed, and an attacker who
// triggers one "is doing our job". A bound that an attacker can point at a
// victim to switch off the victim's own protection is upside down.
//
// So no refusal keyed on that value is final any more, and BOTH escapes from it
// are keyed on something the caller cannot write:
//
//   * a landing whose TICKET VERIFIES — the one proof this route possesses at
//     that point, a MAC only `beginEbayConnect` and `claimEbayConnectState` can
//     produce — draws on a reserve keyed on the ticket's own MAC-covered state.
//     That is M1's reserve, in the same shape and for the same reason: the one
//     party who can exhaust it is somebody replaying a ticket of their own, and
//     they spend their own flow's.
//   * a landing with NO proof — the phished case, which is the one L1 executed —
//     falls through to a reserve keyed on NOTHING AT ALL. Being global, it
//     cannot be aimed: an attacker who wants a chosen address suppressed must
//     drain it as well, which costs the same whoever they are naming.
//
// WHAT THAT BUYS AND WHAT IT DOES NOT, said plainly rather than rounded up.
// Suppressing one named address went from thirty requests a minute to a hundred
// and fifty — the address bucket plus the whole unproven reserve — against the
// three hundred a minute that suppresses everybody. So the cheap lever is gone
// and the expensive one is the flood we already reason about. It is NOT a proof
// that a chosen address can never be suppressed, and this comment does not claim
// one.
//
// AND THAT THREE HUNDRED A MINUTE IS NO LONGER A BLANKET REFUSAL. It was this
// package's last standing residual, recorded in both admission scripts as the
// thing neither M1 nor L1 closed, and it is the same sentence one bound further
// out. The per-process bucket is keyed on nothing, so it cannot be AIMED — that
// is why it was chosen as the final bound — but being keyed on nothing also
// means it cannot tell anybody apart, and one caller can spend all of it. The
// cheapest way is to send NO header at all, because `disposeAdmitted` returns
// "ok" on an empty key and the per-key ration above never applies to the one
// caller who matters. Three hundred cookie-less landings a minute then refused
// EVERY other seller's disposal, a landing whose ticket VERIFIED included:
// `mayDispose` returned false on "process" before it looked at the proof. That is
// L1's own harm — eBay's code left unregistered and unspent — reached through the
// bound L1 did not cover.
//
// So the proof is consulted at BOTH bounds now, and what it buys above the
// process bucket is a bucket of its own, rationed by the per-flow reserve so that
// no single flow can take more than a sixth of it.
//
// THE CEILING THEREFORE MOVES, and it is stated rather than waved at: from three
// hundred signed POSTs a minute per process to three hundred and sixty. The extra
// sixty are not anonymous — every one needs a MAC only `beginEbayConnect` and
// `claimEbayConnectState` can produce, across at least six separate flows — which
// is what keeps the anonymous-abuse bound real. An unprovable caller cannot reach
// a token of the proven class at any rate, so the flood the per-process bucket
// exists to stop pays exactly what it paid before.
const DISPOSE_PER_ADDRESS_PER_MINUTE = 30;
const DISPOSE_PER_PROCESS_PER_MINUTE = 300;
// Keyed on the ticket's own MAC-covered state. The sealing route's number, for
// the sealing route's reason.
const DISPOSE_RESERVE_PER_FLOW_PER_MINUTE = 10;
// Keyed on nothing. Sized so that one bucketing key can never take more than
// half the process budget — thirty of its own plus this — which is the rationing
// the per-address bucket exists to do, and all of it that survives L1.
const DISPOSE_UNPROVEN_RESERVE_PER_MINUTE = 120;
// THE PROVEN CLASS'S OWN CEILING, and the whole of what the fairness fix adds.
//
// Keyed on nothing, like the process bucket — but it is charged ONLY by a landing
// whose ticket verifies, so the caller who can drain it is not the caller the
// process bucket exists to stop. An anonymous flood cannot spend a single token
// of it at any price: it is a MAC only `beginEbayConnect` and
// `claimEbayConnectState` can produce, both authenticated and both
// workspace-owner gated.
//
// It is rationed by the per-flow reserve above it — a landing reaches this bucket
// only after taking one of its own flow's ten — so no single flow can take more
// than a sixth of it, and draining it needs key-holder MACs across at least six
// separate flows. That is what stops this from becoming the defect it closes: a
// bound one caller can empty on their own is a bound one caller can point at
// everybody else.
const DISPOSE_PROVEN_PER_MINUTE = 60;
const COUNTER_WINDOW_MS = 60 * 1000;
const OPS_LOG_EVERY_MS = 60 * 1000;

// The seller-facing vocabulary: a union so nothing else can be spelled into a
// redirect, and a set so the function's answer is checked against it before it
// is obeyed. `cancelled` is produced only here; `unavailable` only here too.
type Reason =
  | "missing_code" | "unavailable"
  | "disabled" | "state" | "browser" | "environment" | "no_seller" | "token" | "exchange";
const FUNCTION_REASONS: ReadonlySet<string> = new Set<Reason>([
  "disabled", "missing_code", "state", "browser", "environment", "no_seller", "token", "exchange"
]);

// The settings page reads `ebay=…` and `reason=…` and says one sentence
// (lib/studioflow/ebay.ts, ebayReasonText). A technical code never reaches the
// screen, and no value from the query or from the function's body is ever
// interpolated into this URL — only a word from the union above.
const SETTINGS = "https://nivadesk.app/settings?section=ebay";

const disposeBuckets = new Map<string, Bucket>();
const disposeFlowBuckets = new Map<string, Bucket>();
const disposeProcessBucket: Bucket = { tokens: DISPOSE_PER_PROCESS_PER_MINUTE, atMs: 0 };
const disposeUnprovenBucket: Bucket = { tokens: DISPOSE_UNPROVEN_RESERVE_PER_MINUTE, atMs: 0 };
const disposeProvenBucket: Bucket = { tokens: DISPOSE_PROVEN_PER_MINUTE, atMs: 0 };

/** `ok`, or WHICH bound refused — because the caller treats them differently. */
type DisposeAdmission = "ok" | "process" | "key";

function disposeAdmitted(key: string, nowMs: number): DisposeAdmission {
  // The process bucket FIRST, so that omitting or spoofing the header does not
  // skip the only bound that binds an adversary. An absent key used to mean
  // "admit" here, with nothing above it. It is also what makes the ceiling
  // argument above true: every landing that reaches the buckets below has
  // already spent one of these.
  if (!takeToken(disposeProcessBucket, DISPOSE_PER_PROCESS_PER_MINUTE, nowMs)) return "process";
  if (!key) return "ok";
  if (takeToken(bucketFor(disposeBuckets, key, DISPOSE_PER_ADDRESS_PER_MINUTE, nowMs), DISPOSE_PER_ADDRESS_PER_MINUTE, nowMs)) return "ok";
  return "key";
}

/**
 * Whether the disposal goes out. L1 is in which refusals are reconsidered here;
 * the fairness fix is that NEITHER of them is final against a proof any more.
 *
 * THE TWO BOUNDS ARE NOT FINAL FOR THE SAME REASON. `key` is keyed on a value the
 * refused party chose, so a final refusal there is a lever an attacker points at
 * a chosen seller (L1). `process` is keyed on nothing, so it cannot be aimed —
 * but it also cannot tell anybody apart, and ONE caller can spend the whole of
 * it: an empty key skips the ration above it, so three hundred cookie-less
 * landings a minute used to refuse every seller's disposal at once, a verified
 * one included. A bound one caller can empty on their own is a bound one caller
 * can hold shut against everybody else.
 *
 * WHAT THE PROOF DRAWS ON IS RATIONED PER FLOW, and that is what makes recovery
 * fair rather than a race the fastest caller wins: the reserve is keyed on the
 * ticket's own MAC-covered state, so the only party who can exhaust it is
 * somebody replaying a ticket of their own, and what they spend is their own
 * flow's. Nobody can take another flow's share by asking sooner or more often.
 *
 * ABOVE THE PER-KEY BOUND that reserve is the whole of it: such a landing has
 * already spent a process token, so honouring it moves no ceiling. ABOVE THE
 * PROCESS BOUND it does move one, so it is charged to the proven class's own
 * bucket as well — and that bucket is unreachable without a key holder's MAC, so
 * the flood this route is bounded against cannot touch a token of it.
 *
 * A prover never does worse than an unprover: under `key` it tries its own
 * reserve first and falls through to the same global reserve an unprover gets.
 * Under `process` it does not fall through — that reserve sits below a bound
 * which is final for unproven callers, and a proof must not become a way to raid
 * what is being held back from a flood.
 */
function mayDispose(admission: DisposeAdmission, ticket: TicketResult, nowMs: number): boolean {
  if (admission === "ok") return true;
  if (ticket.ok && takeToken(bucketFor(disposeFlowBuckets, ticket.state, DISPOSE_RESERVE_PER_FLOW_PER_MINUTE, nowMs), DISPOSE_RESERVE_PER_FLOW_PER_MINUTE, nowMs)) {
    // The per-key case is already paid for; the process case is not, and buys a
    // token of the proven class's own bucket or nothing. A flow that spends its
    // reserve here and finds that bucket empty has spent one of its own ten and
    // nobody else's — the cost of a refusal stays inside the flow that asked.
    return admission === "key" || takeToken(disposeProvenBucket, DISPOSE_PROVEN_PER_MINUTE, nowMs);
  }
  // No proof at all: the anonymous bound is final, exactly as it was.
  if (admission === "process") return false;
  return takeToken(disposeUnprovenBucket, DISPOSE_UNPROVEN_RESERVE_PER_MINUTE, nowMs);
}

// The example is throttled; the COUNT is not. A count over a throttled line
// measures minutes with at least one event, so ten mis-cookied sellers and a
// campaign of thousands would have produced the same single line — which is
// exactly the difference an operator needs to see. Neither carries a value: the
// class list is a closed SEVEN-word set, and the aggregate is numbers only.
//
// `replay` is the seventh and it is not a ticket failure: the ticket verified
// and this process had already spent it (step 6). It is counted beside the six
// because it takes the same exit and because it is the one class an operator
// reads as a signal rather than as noise — a seller's own double-press produces
// one, and a stream of them is somebody landing a copied cookie pair over and
// over.
type Refusal = TicketFailure | "replay";
const refusalCounts: Record<Refusal, number> = { "no-cookie": 0, shape: 0, mac: 0, expired: 0, state: 0, nonce: 0, replay: 0 };
let countsFromMs = 0;
const saidAtMs = new Map<Refusal, number>();

function countRefusal(refusal: Refusal, rid: string, nowMs: number) {
  refusalCounts[refusal] += 1;
  if (nowMs - (saidAtMs.get(refusal) ?? -Infinity) >= OPS_LOG_EVERY_MS) {
    saidAtMs.set(refusal, nowMs);
    console.warn(`ebay callback ticket refused rid=${rid} class=${refusal}`);
  }
  if (countsFromMs === 0) { countsFromMs = nowMs; return; }
  const window = nowMs - countsFromMs;
  if (window < COUNTER_WINDOW_MS) return;
  console.warn(`ebay callback ticket refused window=${window} no-cookie=${refusalCounts["no-cookie"]} shape=${refusalCounts.shape} mac=${refusalCounts.mac} expired=${refusalCounts.expired} state=${refusalCounts.state} nonce=${refusalCounts.nonce} replay=${refusalCounts.replay}`);
  for (const word of Object.keys(refusalCounts) as Refusal[]) refusalCounts[word] = 0;
  countsFromMs = nowMs;
}

/**
 * `clearFlow` is the state whose two cookies this landing consumes, and it is
 * passed on exactly one kind of landing: one where THIS flow's ticket verified.
 *
 * That rule replaces §5.4's `CONSUMED` set, and it is both stronger and cheaper:
 * the edge decides it alone, without reading the function's answer. A verified
 * ticket means the flow this browser began has ended, one way or another. A
 * failed ticket means these cookies — if there are any — belong to some other
 * flow, and clearing them would be the exact nuisance §5.4 removed: anyone who
 * got a seller to open a shaped link during the ten-minute window would
 * otherwise destroy an in-flight connect from a link.
 *
 * Clearing is cooperative and not a control. An honest browser holds no reusable
 * ticket afterwards; a party who kept a copy of the cookie value is not an
 * honest browser, and what stops them is the state's single-use transaction.
 */
function land(outcome: "connected" | "cancelled" | "error", reason?: Reason, clearFlow?: string) {
  const url = reason ? `${SETTINGS}&ebay=${outcome}&reason=${reason}` : `${SETTINGS}&ebay=${outcome}`;
  const response = NextResponse.redirect(url, 302);
  if (clearFlow) {
    // A `__Host-` cookie is cleared with the attributes it was written with, or
    // the browser keeps it: Path=/ and Secure, and no Domain.
    for (const name of [ebayNonceCookieName(clearFlow), ebayTicketCookieName(clearFlow)]) {
      response.cookies.set(name, "", { path: "/", maxAge: 0, sameSite: "lax", secure: true });
    }
  }
  return response;
}

/**
 * One signed POST, of whichever envelope. The body is serialised ONCE by the
 * caller and signed here over those exact bytes, so the bytes signed and the
 * bytes sent cannot drift.
 *
 * HMAC-SHA256(key, "v1." + timestamp + "." + rawBody). The key itself is never
 * sent, so it survives any future proxy or error reporter that learns to record
 * headers, and the authentication is bound to THIS body, so a captured request
 * cannot be re-pointed at a different code.
 */
async function post(raw: string, key: string) {
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", key)
    .update(`v1.${timestamp}.`, "utf8")
    .update(Buffer.from(raw, "utf8"))
    .digest("hex");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);
  try {
    const response = await fetch(relayTarget(), {
      method: "POST",
      // No header this route was given: the seller's User-Agent, Referer, IP and
      // cookies stay on the first hop.
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-nivadesk-timestamp": timestamp,
        "x-nivadesk-signature": `v1=${signature}`
      },
      body: raw,
      cache: "no-store",
      // Nothing legitimate redirects here, and following one would re-point a
      // signed body at somewhere we did not choose.
      redirect: "error",
      signal: controller.signal
    });
    const text = await response.text();
    // A parse error's message quotes the body back, so it is caught and dropped
    // rather than logged.
    let answer: Record<string, unknown> | null = null;
    try { answer = JSON.parse(text) as Record<string, unknown>; } catch { answer = null; }
    return { status: response.status, answer, aborted: false };
  } catch {
    // Never the caught error: a fetch failure's message carries the URL and a
    // parse failure carries the body. The abort flag is the only thing read.
    return { status: 0, answer: null as Record<string, unknown> | null, aborted: controller.signal.aborted };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code") || "";
  // PRESENCE, not truthiness — design §5.4 step 1 says "`error` present". `.get`
  // answers "" (not null) for `?error=`, and Boolean("") is false, so a truthy
  // test sent an empty decline down the missing_code path and told the seller
  // "try again" instead of "cancelled, nothing was changed".
  const declined = params.has("error");

  // 0. Fail closed at the edge. eBay always arrives with `code` (accepted) or
  // `error` (declined); anything else is a scan, a stale bookmark or someone
  // poking the URL, and relaying it would spend a Cloud Function invocation on
  // an attacker-shaped body.
  if (!code && !declined) return land("error", "missing_code");

  // 1. eBay declined, and that is settled here in full. The POST body has no
  // `error` field and `cancelled` is not in the function's vocabulary, so this
  // is the only place in the system that produces the word. eBay's declined URL
  // points straight at the settings page anyway, so this is defence in depth —
  // either way a decline never reaches the connector, and no call is made.
  //
  // A CODE WINS OVER AN ERROR, and that ordering is the point: `?code=X&error=y`
  // was the single shaped query carrying a real code that took this branch, so
  // it answered `cancelled` with the code unspent and the state unburned — the
  // one exception to "a shaped callback always POSTs", stated absolutely in
  // three places. eBay sends one or the other, so requiring the code to be
  // absent costs nothing and removes the exception.
  if (!code) return land("cancelled");

  // 2. Shaped like a callback? Malformed gets the same word absence gets, and
  // the same silence: nothing from the query is logged, here or anywhere below.
  const state = params.get("state") || "";
  if (code.length > MAX_CODE_LENGTH || !STATE_PATTERN.test(state)) return land("error", "missing_code");

  // 3. The relay key, read per request rather than at module scope so a rotation
  // is a restart and not a rebuild. NEVER NEXT_PUBLIC_: that prefix would
  // compile the value into the browser bundle and publish it to every visitor.
  // The length floor is the one the function applies — without it a truncated
  // paste on Hostinger produces a signed POST that dies as an opaque 401 with no
  // ops line naming a cause. Only the variable's NAME is ever logged.
  //
  // This step MUST stay ahead of the ticket check, and the order is forced
  // rather than chosen: the ticket key is DERIVED from this value, so without it
  // there is nothing to verify a ticket with and nothing to sign either envelope
  // with. These two returns are the one place this route refuses without
  // posting, and the cost is §5.4's, now covering disposal too: while a key
  // outage lasts, every consent that lands leaves eBay's code unspent, sitting
  // verbatim in Hostinger's access log for the rest of its TTL. It fails closed
  // for the connection and open for the defence, and those are different things.
  //
  // The operator's action is docs/ebay-web-callback-deploy-plan.md §4.2: treat
  // every consent that landed while the relay was not answering 200 as
  // replayable for eBay's code TTL, tell those sellers to reconnect, and record
  // that nothing on our side can invalidate a code we never presented.
  const key = String(process.env.NIVADESK_EBAY_CALLBACK_KEY || "");
  if (!key) {
    console.error("ebay callback relay: NIVADESK_EBAY_CALLBACK_KEY not configured");
    return land("error", "unavailable");
  }
  if (key.length < KEY_MIN_LENGTH) {
    console.error("ebay callback relay: NIVADESK_EBAY_CALLBACK_KEY shorter than 32 characters");
    return land("error", "unavailable");
  }

  // 4. The trace id, minted HERE and accepted from nobody: eight random bytes,
  // derived from nothing, meaningful to nobody, and the only value either log
  // may hold, so a failed attempt can be traced across two logs without either
  // log holding something that matters. Both envelopes carry one.
  const rid = randomBytes(8).toString("hex");
  const nowMs = Date.now();

  // 5. The browser binding, verified with no round trip: shape, MAC, window,
  // this flow's state, and this flow's nonce. Every sub-step takes the same exit
  // and the seller sees the same sentence, so the verifier is no more an oracle
  // than the function's 401 wall is; the CLASS is counted and reaches an ops
  // line, and appears in no answer.
  //
  // The cookie names carry this flow's tag, so a seller who pressed Connect
  // twice, or opened settings in two tabs, no longer overwrites the first flow's
  // pair with the second's — each stands beside the other and completing either
  // consent finds that flow's own ticket.
  //
  // The nonce cookie needs no second decodeURIComponent: NextRequest's cookie jar
  // already applies one (next/dist/compiled/@edge-runtime/cookies, parseCookie),
  // and it is the identity for a base64url nonce in any case. An absent one is
  // the empty string and fails the nonce step — it is no longer forwarded as
  // `nonce: ""`, because there is now something at the edge that can tell "no
  // cookie" from "the right cookie", and the case that used to justify
  // forwarding is handled by the disposal below instead.
  const ticketCookie = request.cookies.get(ebayTicketCookieName(state))?.value || "";
  const nonceCookie = request.cookies.get(ebayNonceCookieName(state))?.value || "";
  const nonce = nonceCookie.length > MAX_NONCE_LENGTH ? "" : nonceCookie;
  const ticket = verifyEbayTicketForFlow(ebayTicketKey(key), ticketCookie, state, nonce, nowMs);

  // 6. Verified — AND SPENT, here, before a byte is signed. §5.4's contract is
  // otherwise unchanged: the body is built from the ticket's own state and the
  // nonce cookie — the two values step 5 just proved agree — serialised once,
  // signed over those exact bytes, and the answer obeyed.
  //
  // The spend is `&&`, so the order is the guarantee: a ticket this process has
  // already signed a connect envelope for never reaches `JSON.stringify`, never
  // reaches `post`, and never names a state again. Before it, a verified ticket
  // signed a connect envelope on EVERY presentation and nothing at this tier was
  // spent or counted — and this is the one path with no admission counter of its
  // own, so a party holding one captured cookie pair could land it at will and
  // each landing was a signature we minted, an invocation we paid for and a
  // Firestore read the function did. The two documents that answer a replay
  // authoritatively (the state's burn, the presented-code registry) still answer
  // it; they refuse the OUTCOME and never refused the request.
  //
  // What the second presentation gets instead is step 7's disposal, which is
  // bounded, names no state, and registers the code — so a replay carrying a
  // second live code now kills that code as well, which the connect path did
  // not: the function's `state` verdict deliberately does not redeem, to avoid
  // becoming a way to drive outbound token requests to eBay at will.
  //
  // Honest about what it is: one process's memory (`ebayTicketSpend.ts` states
  // the bound and the eviction rule), so a replay that lands on another instance
  // is signed and then refused exactly as it was before. It is a cost control
  // and the edge's own enforcement of the single use it already claimed
  // cooperatively by clearing this flow's cookies; it is not the replay defence.
  if (ticket.ok && spendTicket(ticket.jti, ticket.expMs, nowMs)) {
    const raw = JSON.stringify({ v: 1, rid, code, state: ticket.state, nonce });
    // The function's 8192-BYTE body cap, applied to the exact bytes about to be
    // sent. Without it the two shape checks disagree on units and a multi-byte
    // code lands as an opaque 400 instead of a sentence.
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return land("error", "missing_code");
    const sent = await post(raw, key);
    if (sent.status === 0) {
      console.error(`ebay callback relay rid=${rid} ${sent.aborted ? "timeout" : "unreachable"}`);
      // Cleared here too, and the rule is the one stated above rather than an
      // opinion about this branch: the ticket verified, so this flow has ended
      // whatever the transport did. A timeout in particular does not stop the
      // connection — the function finishes and the row appears — so leaving the
      // pair behind would leave a live-looking binding for a flow that is over.
      return land("error", "unavailable", state);
    }
    // A decided refusal is an ANSWER, not a transport failure, so it is 200 with
    // ok:false and it is obeyed. Everything else — 400, 401, 405, a 5xx,
    // unparseable JSON, an unknown word — becomes one seller-facing outcome.
    const answer = sent.answer;
    if (sent.status === 200 && answer && typeof answer === "object" && !Array.isArray(answer)) {
      if (answer.ok === true && answer.outcome === "connected") return land("connected", undefined, state);
      const word = typeof answer.reason === "string" ? answer.reason : "";
      if (answer.ok === false && answer.outcome === "error" && FUNCTION_REASONS.has(word)) {
        return land("error", word as Reason, state);
      }
    }
    // One ops line for every outcome that is not a clean answer, not only the
    // transport ones: an operator debugging a key mismatch is looking at exactly
    // this line, and this side always has the rid because this side minted it.
    // The rid the function echoed is never logged — only the one minted above.
    console.error(`ebay callback relay rid=${rid} status=${sent.status}`);
    return land("error", "unavailable", state);
  }

  // 7. Not verified — or verified and already spent above. Either way this is
  // the whole of §5.5's promise: nothing signed here may name the state the
  // caller asked about. The only thing that goes out is a disposal — "record
  // this code and spend it at eBay" — and it is subject to a counter, which is
  // exactly what the connect path above is not.
  //
  // An exhausted PER-PROCESS counter here is still the one place a landing leaves
  // eBay's code UNREGISTERED as well as unspent, and it is on deploy plan §4.2's
  // list for that reason — but it is final only for a caller who can prove
  // NOTHING. Keyed on nothing a caller can write, it cannot be aimed; keyed on
  // nothing at all, it also cannot tell anybody apart, so one caller could spend
  // the whole of it and hold every seller's disposal shut at once. A landing
  // whose ticket verifies is therefore no longer refused by it.
  //
  // The per-address bucket underneath it is NOT final and must not become final
  // again — it is keyed on a header the caller writes, so a final refusal there
  // is a lever an attacker points at a chosen seller rather than a bound an
  // attacker steps around (L1). `mayDispose` is where both are decided.
  if (ticket.ok) countRefusal("replay", rid, nowMs); else countRefusal(ticket.failure, rid, nowMs);
  const bucketKey = untrustedBucketKey(request.headers.get("x-forwarded-for"));
  const raw = JSON.stringify({ v: 1, op: "dispose", rid, code });
  // Over the cap there is nothing the function would accept, so the request is
  // not made rather than made to be refused — and the `&&` keeps the buckets
  // uncharged for a body that was never going to be sent.
  if (Buffer.byteLength(raw, "utf8") <= MAX_BODY_BYTES
    && mayDispose(disposeAdmitted(bucketKey, nowMs), ticket, nowMs)) {
    const sent = await post(raw, key);
    if (sent.status !== 200) console.error(`ebay callback dispose rid=${rid} status=${sent.status}`);
  }
  // The two landings differ in what the seller is told, and only there.
  //
  // A SPENT TICKET keeps the answer the seller already got: a second landing on
  // a consumed flow used to reach the function and come back `state` — "The eBay
  // sign-in link has expired or was already used. Start again." — and it still
  // says that, because it is true of a ticket this edge has already spent and
  // because a fix to what we SIGN must not change what a seller reads. This
  // flow's cookies go with it, under the same rule step 6 uses: a ticket that
  // verified means this flow has ended, however it ended.
  //
  // ANYTHING ELSE gets `browser`, the word the function would have produced for
  // the same condition — no new vocabulary, no new translation — and CLEARS
  // NOTHING, because whatever this browser is holding belongs to some other flow.
  // The answer is identical for all six failure classes, so the verifier is no
  // more an oracle than the 401 wall is; the spend is not one of the six and
  // tells a caller only what they did themselves.
  if (ticket.ok) return land("error", "state", ticket.state);
  return land("error", "browser");
}

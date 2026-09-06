import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes } from "node:crypto";

// eBay's RuName holds one "accepted URL" per application, and the seller's
// browser lands on it after consent. It is on our own domain for the same
// reason Etsy's and Square's are: a seller meeting NivaDesk for the first time
// should see nivadesk.app, not a Google function host, at the moment they hand
// over access to their orders.
//
// What this route does with that visit is design §5.4, and the reason for it is
// one sentence: Cloud Run writes httpRequest.requestUrl — query string included
// — into Cloud Logging on every request. Redirecting the browser onward to
// ebayOAuthCallback?code=…&state=…&nonce=… therefore published the
// authorization code AND the browser-binding nonce to everyone with log access
// on eggcraft-studio. The nonce is not a nuisance value: it is the single thing
// that stops a phished seller's consent landing in a stranger's workspace (§5).
//
// So the browser stops here. eBay lands on nivadesk.app, this route decides the
// two things only it can see — did eBay decline, and did this browser present
// the cookie — and everything after that is a server-to-server POST whose JSON
// body is signed with NIVADESK_EBAY_CALLBACK_KEY. The code and the nonce travel
// in a body Cloud Run does not record. They appear in no URL on this hop, and
// there is no other hop.
//
// The transport moved; not one decision did. In particular this route does NOT
// refuse a missing nonce cookie — see step 3, where the reason is the CODE and
// not, as an earlier revision of that comment claimed, the state.

// Node, not Edge, and this is load-bearing rather than a default: Next replaces
// process.env statically for Edge route handlers, which would bake the relay key
// into the build output and make a rotation a rebuild. `node:crypto` needs it too.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CALLBACK = "https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayOAuthCallback";
const NONCE_COOKIE = "nv_ebay_nonce";

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

// The answers that prove the function CONSUMED the state this cookie belongs to:
// the burn happens before each of them. `connected` is the sixth.
const CONSUMED: ReadonlySet<string> = new Set(["browser", "environment", "no_seller", "token", "exchange"]);

function land(outcome: "connected" | "cancelled" | "error", reason?: Reason) {
  const url = reason ? `${SETTINGS}&ebay=${outcome}&reason=${reason}` : `${SETTINGS}&ebay=${outcome}`;
  const response = NextResponse.redirect(url, 302);
  // Cleared exactly when the state it belongs to was consumed — never on a
  // landing that consumed nothing. Clearing rides a top-level GET response, so a
  // `SameSite=Lax` Set-Cookie applies in precisely the context an attacker can
  // create: a link. Anyone who gets a seller to open /ebay/callback (or
  // …?error=x, or a shaped query naming a state that is not theirs) during the
  // ten-minute window would otherwise destroy the in-flight nonce, and eBay's
  // genuine callback would then arrive cookie-less and be told to finish in the
  // browser it is already in. Recovery is one more press of Connect, so this is
  // a nuisance rather than a compromise — but the clear buys nothing on those
  // paths, so the surface goes. Max-Age 0 under the Path it was written with, or
  // the browser keeps it.
  if (outcome === "connected" || (reason && CONSUMED.has(reason))) {
    response.cookies.set(NONCE_COOKIE, "", { path: "/ebay/callback", maxAge: 0, sameSite: "lax", secure: true });
  }
  return response;
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

  // 3. The nonce cookie is READ, and never gated on.
  //
  // Attacker B owns workspace B, calls beginEbayConnect, keeps state_B and
  // nonce_B, and phishes seller S into consenting. S's browser has no cookie,
  // so this POST carries nonce:"" and the function burns state_B inside the
  // transaction that finds the nonce wrong.
  //
  // Burning state_B is NOT what ends the attack, and an earlier revision of
  // this comment said it was. eBay's authorization code is bound to our
  // APPLICATION, not to the state that fetched it — exchangeCode sends
  // grant_type, code and the one global RuName — so B never needs state_B
  // again: B mints a fresh state and nonce in B's own browser and presents the
  // observed code against that one. Executed against the real handler before it
  // learned to spend the code: the victim's state answered `browser` with the
  // exchange never called, and a second, freshly minted state then exchanged
  // the SAME code and answered `connected`.
  //
  // What ends it is that the function REDEEMS the code on that refusal and
  // discards the tokens (§5.4, "The burn, and the spend"), so an observed code
  // is already dead when a log reader reaches it (residual 1). That is the
  // whole reason this route posts rather than refusing: an edge refusal would
  // save one invocation and leave the code alive for the rest of eBay's TTL,
  // with nothing on our side able to kill it. The state was never the thing
  // being protected here.
  //
  // So the cookie's PRESENCE is settled here and its CORRECTNESS in the
  // transaction, where the hash lives and where this process has no credential
  // to look. An absent cookie travels as the empty string and answers `browser`
  // either way.
  //
  // No second decodeURIComponent: NextRequest's cookie jar already applies one
  // (next/dist/compiled/@edge-runtime/cookies, parseCookie), so the mirror of
  // setEbayNonceCookie's encodeURIComponent has already happened — and it is in
  // any case the identity for a base64url nonce.
  const cookieValue = request.cookies.get(NONCE_COOKIE)?.value || "";
  const nonce = cookieValue.length > MAX_NONCE_LENGTH ? "" : cookieValue;

  // 4. The relay key, read per request rather than at module scope so a rotation
  // is a restart and not a rebuild. NEVER NEXT_PUBLIC_: that prefix would
  // compile the value into the browser bundle and publish it to every visitor.
  // The length floor is the one the function applies — without it a truncated
  // paste on Hostinger produces a signed POST that dies as an opaque 401 with no
  // ops line naming a cause. Only the variable's NAME is ever logged.
  //
  // These two returns are the ONE place this route does what step 3 forbids: it
  // refuses without POSTing. That is not a choice — without the key there is
  // nothing to sign with, and an unsigned POST is a 401 that reaches nothing
  // either. But it is not neutral: for as long as the key is missing, short, or
  // disagrees with Secret Manager, every consent that lands leaves eBay's code
  // UNSPENT, sitting verbatim in Hostinger's access log for the rest of its TTL,
  // redeemable against a state the attacker mints later. The unburned state is
  // not the damage; the unspent code is. It fails closed for the connection and
  // open for the defence, and those are different things.
  //
  // The operator's action is docs/ebay-web-callback-deploy-plan.md §4.2, and it
  // is not "expire the outstanding states" — that closes nothing, because the
  // attacker does not need them. It is: treat every consent that landed while
  // the relay was not answering 200 as replayable for eBay's code TTL, tell
  // those sellers to reconnect, and record that nothing on our side can
  // invalidate a code we never presented. The same is true of every other way
  // this POST can fail to reach the transaction — unreachable, 401, 405, 400, a
  // 5xx, the abort below — which is why §4.2's trigger is all of them.
  const key = String(process.env.NIVADESK_EBAY_CALLBACK_KEY || "");
  if (!key) {
    console.error("ebay callback relay: NIVADESK_EBAY_CALLBACK_KEY not configured");
    return land("error", "unavailable");
  }
  if (key.length < KEY_MIN_LENGTH) {
    console.error("ebay callback relay: NIVADESK_EBAY_CALLBACK_KEY shorter than 32 characters");
    return land("error", "unavailable");
  }

  // 5. Mint the trace id, serialise ONCE, sign those exact bytes, send that same
  // string — so the bytes signed and the bytes sent cannot drift. `rid` is eight
  // random bytes: derived from nothing, meaningful to nobody, and the only value
  // either log may hold, so a failed attempt can be traced across two logs
  // without either log holding something that matters.
  //
  // HMAC-SHA256(key, "v1." + timestamp + "." + rawBody). The key itself is never
  // sent, so it survives any future proxy or error reporter that learns to
  // record headers, and the authentication is bound to THIS body, so a captured
  // request cannot be re-pointed at a different code.
  const rid = randomBytes(8).toString("hex");
  const raw = JSON.stringify({ v: 1, rid, code, state, nonce });
  // The function's 8192-BYTE body cap, applied to the exact bytes about to be
  // sent. Without it the two shape checks disagree on units and a multi-byte
  // code lands as an opaque 400 instead of a sentence.
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return land("error", "missing_code");
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", key)
    .update(`v1.${timestamp}.`, "utf8")
    .update(Buffer.from(raw, "utf8"))
    .digest("hex");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);
  let status = 0;
  let answer: Record<string, unknown> | null = null;
  try {
    const response = await fetch(CALLBACK, {
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
    status = response.status;
    const text = await response.text();
    // A parse error's message quotes the body back, so it is caught and dropped
    // rather than logged.
    try { answer = JSON.parse(text) as Record<string, unknown>; } catch { answer = null; }
  } catch {
    // Never the caught error: a fetch failure's message carries the URL and a
    // parse failure carries the body. The abort flag is the only thing read.
    console.error(`ebay callback relay rid=${rid} ${controller.signal.aborted ? "timeout" : "unreachable"}`);
    return land("error", "unavailable");
  } finally {
    clearTimeout(timer);
  }

  // 6. A decided refusal is an ANSWER, not a transport failure, so it is 200
  // with ok:false and it is obeyed. Everything else — 400, 401, 405, a 5xx,
  // unparseable JSON, an unknown word — becomes one seller-facing outcome.
  if (status === 200 && answer && typeof answer === "object" && !Array.isArray(answer)) {
    if (answer.ok === true && answer.outcome === "connected") return land("connected");
    const word = typeof answer.reason === "string" ? answer.reason : "";
    if (answer.ok === false && answer.outcome === "error" && FUNCTION_REASONS.has(word)) {
      return land("error", word as Reason);
    }
  }
  // One ops line for every outcome that is not a clean answer, not only the
  // transport ones: an operator debugging a key mismatch is looking at exactly
  // this line, and this side always has the rid because this side minted it.
  // The rid the function echoed is never logged — only the one minted above.
  console.error(`ebay callback relay rid=${rid} status=${status}`);
  return land("error", "unavailable");
}

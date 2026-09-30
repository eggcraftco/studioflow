// Three rules the eBay client screens must not get wrong, in a module with no
// imports so a test can execute them rather than read them.
//
// They were all broken in the same way: the rule was written in a comment at
// the top of `EbayIntegrationSection.tsx` ("no eBay error code ever reaches the
// screen"), in `lib/studioflow/ebay.ts` ("a technical code must never reach the
// screen"), or in the design (§5.2, "a signed-out visitor is sent to sign in
// **and back**"), and the code beneath it did something else.
//
// IMPORTING NOTHING IS THIS MODULE'S WHOLE POINT, and rule 3 is here rather than
// beside the tables it guards for exactly that reason: `ebay.ts` reaches
// Firebase at module scope, so no Node check can require it, and a check that
// re-implemented one of these rules would be a copy that agrees with the bug.

/**
 * RULE 1 — no callable error code ever reaches the screen.
 *
 * `EbayIntegrationSection` did `setError(err instanceof Error ? err.message : …)`.
 * That is right for the sentences the server writes on purpose ("eBay is not
 * enabled on this server yet.", "This eBay connection was started by a different
 * NivaDesk user."), and wrong for the one case that has no server behind it: a
 * callable that is **not deployed** answers HTTP 404, and `@firebase/functions`
 * turns that into a `FunctionsError` whose message is the bare word `not-found`.
 * The screen then said `not-found`.
 *
 * That is not a corner case. The deploy plan's own order is web first, functions
 * later, and the eBay card is `kind: "native"` in the integrations grid — live and
 * clickable — so every workspace owner who opens Settings → Integrations → eBay
 * between the two deploys is in exactly that state.
 *
 * The test is the message itself: `@firebase/functions` uses the status word as
 * the message when the response carries no error body, so a message that IS one
 * of those words is a code wearing a sentence's clothes and never something a
 * human wrote.
 */
const CALLABLE_CODE_WORDS: ReadonlySet<string> = new Set([
  "ok", "cancelled", "unknown", "invalid-argument", "deadline-exceeded", "not-found",
  "already-exists", "permission-denied", "resource-exhausted", "failed-precondition",
  "aborted", "out-of-range", "unimplemented", "internal", "unavailable", "data-loss",
  "unauthenticated"
]);

/** The sentence `disabled` already uses, so this adds no vocabulary and no translation. */
const NOT_SET_UP = "eBay is not set up on this server yet. Contact support and we will enable it.";

export function ebayCallableErrorText(error: unknown, fallback: string): string {
  const message = error instanceof Error ? String(error.message || "").trim() : "";
  const code = String((error as { code?: unknown } | null)?.code || "").replace(/^functions\//, "").trim();
  if (message && !CALLABLE_CODE_WORDS.has(message)) return message;
  // The function is not there at all — which is a deploy state, not a fault of
  // the seller's, and the one thing a sentence can usefully say.
  if (code === "not-found" || code === "unimplemented") return NOT_SET_UP;
  return fallback;
}

/**
 * RULE 2 — a signed-out visitor to `/ebay/start` comes back to `/ebay/start`.
 *
 * `EbayStartContent` did `router.replace("/login")` with no `?next=`, and design
 * §5.2 says the opposite in the present tense. This page is not like the other
 * ~15 `router.replace("/login")` call sites: those are ordinary screens a seller
 * can re-open, and this one carries a single-use state with a ten-minute TTL that
 * exists only in that URL. Losing it costs the whole flow — the seller lands on
 * Home with no message and has to go back to the Mac, iPhone or Android app and
 * press Connect again, at the moment of first impression. It is also the likeliest
 * case in practice, because the native app's session is not the browser's.
 *
 * `/login` already honours a same-origin `?next=` (`nextDestination`), which is
 * how the Shopify connect handshake gets back to itself.
 */
export function ebayStartLoginHref(state: string): string {
  const clean = String(state || "").trim();
  // The state's alphabet is §4.5's `[A-Za-z0-9_-]`; anything else is not a state
  // this deployment minted, and it must not be reflected into a URL we build.
  const back = /^[A-Za-z0-9_-]{20,120}$/.test(clean) ? `/ebay/start?state=${encodeURIComponent(clean)}` : "/ebay/start";
  return `/login?next=${encodeURIComponent(back)}`;
}

/**
 * RULE 3 — a word out of a URL is looked up in a TABLE, and a table is not a map.
 *
 * `lib/studioflow/ebay.ts` says of its three vocabularies that they are "the ONLY
 * place an eBay code becomes words" and that "a technical code must never reach
 * the screen". The lookup beneath that comment was `TABLE[key] || …` over a plain
 * object literal, so every key carried on `Object.prototype` resolved to a
 * FUNCTION — which is truthy, so it short-circuited the very fallback that was
 * there to catch an unknown word.
 *
 * What it cost a seller. `EbayIntegrationSection` reads `reason` straight from
 * `window.location.search`, and `studioT` hands a non-string argument back
 * unchanged in all twelve languages, so
 * `/settings?section=ebay&ebay=error&reason=constructor` put a function into
 * `setError`. React renders no function child: the seller saw a BLANK error
 * banner and was told nothing at all about a connection that had just failed,
 * which is the one outcome this vocabulary exists to prevent. `toString`,
 * `valueOf`, `hasOwnProperty`, `isPrototypeOf` and `propertyIsEnumerable` behave
 * the same way, and the reason word is the one input here a stranger can choose —
 * it costs them a link a signed-in seller is lured into opening, nothing more.
 *
 * The tables themselves stay in `ebay.ts`, because their English strings are the
 * keys `language.ts` translates into the other eleven languages. Only the lookup
 * moves here, where it can be executed.
 *
 * Own properties only, and a non-empty string or the fallback — never a value
 * inherited from a prototype, and never a value that is not a sentence.
 */
export function ebayTableText(table: Record<string, string>, key: string, fallback: string): string {
  const clean = String(key || "").trim();
  if (!Object.prototype.hasOwnProperty.call(table, clean)) return fallback;
  const value = table[clean];
  return typeof value === "string" && value ? value : fallback;
}

/**
 * RULE 4 — an edge flow's binding goes to the edge, and to nowhere else.
 *
 * A production flow returns through the Worker on connect.nivadesk.app
 * (docs/ebay-callback-edge.md), so its two cookies must live on THAT host: the
 * page hands state, nonce, ticket and the eBay URL to the Worker in a same-site
 * form POST and the Worker sets both cookies there, HttpOnly. The server names
 * the target (`handoff` on the begin/claim reply); this rule decides whether the
 * page will post the binding to it at all. Exactly one production target, and a
 * loopback one only when the page itself is on loopback (a local acceptance
 * run). Anything else is refused and the seller is not sent to eBay: a nonce
 * posted to a host we did not name is a binding given away.
 */
export const EBAY_EDGE_HANDOFF = "https://connect.nivadesk.app/ebay/start";
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost"]);
export function ebayHandoffTarget(handoff: unknown, pageHostname: string): string {
  const value = typeof handoff === "string" ? handoff.trim() : "";
  if (!value) return "";
  if (value === EBAY_EDGE_HANDOFF) return value;
  if (!LOOPBACK_HOSTS.has(String(pageHostname || ""))) return "";
  return /^http:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}\/ebay\/start$/.test(value) ? value : "";
}

/** The four fields the edge's /ebay/start reads, in the order a form carries
 *  them. `null` when any is missing: a partial binding must not leave the page. */
export function ebayHandoffFields(input: { state?: unknown; nonce?: unknown; ticket?: unknown; authorizeUrl?: unknown }): Array<[string, string]> | null {
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const fields: Array<[string, string]> = [["state", text(input.state)], ["nonce", text(input.nonce)], ["ticket", text(input.ticket)], ["authorize", text(input.authorizeUrl)]];
  return fields.every(([, v]) => v.length > 0) ? fields : null;
}

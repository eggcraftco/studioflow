// Two rules the eBay client screens must not get wrong, in a module with no
// imports so a test can execute them rather than read them.
//
// They were both broken in the same way: the rule was written in a comment at
// the top of `EbayIntegrationSection.tsx` ("no eBay error code ever reaches the
// screen") or in the design (§5.2, "a signed-out visitor is sent to sign in
// **and back**"), and the code beneath it did something else.

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

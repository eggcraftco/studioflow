// The ticket's single use, spent at the edge (design §5.5).
//
// SERVER ONLY, and imported by `app/ebay/callback/route.ts` alone. It holds the
// one piece of mutable state the callback edge has: the set of ticket `jti`
// values this process has already signed a CONNECT envelope for.
//
// WHY IT EXISTS. §5.5 said single use lives in two Firestore documents and
// "deliberately nowhere else", on the grounds that edge-side storage "would need
// a Firestore or KV credential on Hostinger and would buy nothing the two
// documents above do not already buy". The first half is true only of DURABLE
// storage; a Map in the process needs no credential. The second half was wrong,
// and this is what it missed: the connect path had no admission counter of any
// kind — the disposal has two, the sealing route has three — so anybody holding
// ONE valid ticket cookie could land it again and again, and every landing was a
// signed POST we minted, a Cloud Function invocation we paid for, a
// `claimCode()` write and a state read. The two documents refuse the outcome;
// they do not refuse the request, and nothing else did either.
//
// WHAT IT IS NOT. It is not the replay defence and does not become one: the
// authority is still `ebayConnectStates/{state}.used` inside the function's
// transaction and `ebayPresentedCodes/{sha256hex(code)}` above it. This is one
// process's memory, so a replay that lands on a second instance is signed and
// refused exactly as it was before. What it buys is that the common case — the
// same browser, or somebody who kept a copy of one cookie pair, landing on the
// instance that already served it — costs nothing after the first landing, and
// that the edge now ENFORCES the single use it already claimed cooperatively by
// clearing this flow's cookies on a verified landing.
//
// A DROPPED ENTRY IS NOT A HOLE ANYONE CAN AIM. The map is bounded, so under
// enough pressure a live entry is forgotten and that ticket could sign a second
// connect envelope. Reaching that needs 4,096 tickets, and only
// `beginEbayConnect` and `claimEbayConnectState` mint tickets — both
// authenticated and both workspace-owner gated — so the party who can apply the
// pressure is a signed-in owner, and what they win is a second signed POST
// against a state that is already burned. Eviction takes the entries CLOSEST TO
// EXPIRY first, which are the ones the ticket's own window is about to refuse
// anyway; the entry with the most life left is the last thing forgotten. That is
// the same rule, and the same reasoning, as `ebayAdmission.ts`'s richest-first
// eviction.

/** Ticket windows are ten minutes and the cap is fifteen (`ebayTicket.ts`), so
 *  this is far above any plausible number of live tickets on one instance. */
export const MAX_SPENT_TICKETS = 4096;

/** `jti` → the ticket's MAC-covered `expMs`. Nothing else is kept: not the
 *  state, not the code, not an address, not a time anyone could correlate. */
const spent = new Map<string, number>();

/**
 * Records this ticket as used and answers whether the caller may proceed.
 *
 * `true` exactly once per `jti` — the first presentation — and `false` for every
 * later one. Synchronous on purpose: the caller must be able to spend BEFORE it
 * signs, with no `await` between the check and the record where a second request
 * could slip through.
 */
export function spendTicket(jti: string, expMs: number, nowMs: number): boolean {
  if (spent.size >= MAX_SPENT_TICKETS) evict(nowMs);
  if (spent.has(jti)) return false;
  spent.set(jti, expMs);
  return true;
}

/** Expired entries first — those tickets are refused by the window check in any
 *  case — and only then live ones, soonest-to-expire first, down to half the cap
 *  so this does not run on every call. */
function evict(nowMs: number) {
  for (const [jti, expMs] of spent) if (expMs <= nowMs) spent.delete(jti);
  if (spent.size < MAX_SPENT_TICKETS) return;
  const target = Math.floor(MAX_SPENT_TICKETS / 2);
  const soonestFirst = [...spent.entries()].sort((a, b) => a[1] - b[1]);
  for (const [jti] of soonestFirst) {
    if (spent.size <= target) return;
    spent.delete(jti);
  }
}

/** How many tickets this process is holding. For the bound's own test. */
export function spentTicketCount(): number {
  return spent.size;
}

/**
 * Forget every spent ticket.
 *
 * For the test scripts, and it says so rather than hiding behind a neutral name:
 * `check-ebay-relay-vectors.mjs` replays ONE committed fixture ticket through
 * five frozen vectors, which is five presentations of a single `jti`, and those
 * vectors measure the bytes the route signs rather than this rule. No route
 * calls it.
 */
export function forgetSpentTickets() {
  spent.clear();
}

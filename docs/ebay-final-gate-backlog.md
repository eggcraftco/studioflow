# The eBay callback gate — backlog

Everything the final gate found that was **not** blocking. The verdict and the evidence are in
`docs/ebay-final-gate-result.md`; this is the list of what to fix next.

**Nothing here breaks any of the seven criteria** in `docs/ebay-callback-acceptance-criteria.md`. Four
mediums and nine lows. Three of the four mediums are documentation that has drifted away from the
code the gate just verified — in a tree whose comments the design treats as load-bearing, that is worth
a fix rather than a shrug.

Every file:line below was resolved against the tree at `4e74929f`.

---

## Blocking

**None.**

---

## M1 — [medium] An anonymous stranger can hold Connect eBay closed for a chosen seller, by spoofing `x-forwarded-for` at the sealing route

`studioflow-web/app/ebay/ticket/route.ts:162` refuses **finally** —

```
if (admission === "address") { tick("throttled", nowMs); sayRefused(nowMs); return refuse(429); }
```

— on a bucket keyed by `clientAddress(request.headers.get("x-forwarded-for"))`
(`lib/studioflow/ebayAdmission.ts:84`). That same module states at lines 17-21 that until Hostinger's
behaviour is established "the leftmost element is whatever the client sent", so a per-address bucket
"does not bind an adversary".

The reserve that rescues a caller who can prove a key holder minted their ticket
(`route.ts:205-208`) is consulted **only** for `admission === "process"`. So the branch reachable with
an attacker-chosen key is the branch with no escape hatch.

**Executed, against the compiled route.** 30 anonymous POSTs carrying a junk ticket and
`X-Forwarded-For: 203.0.113.77` drained that address's bucket (`[400, 429]`); the victim's next **five**
genuine, freshly minted tickets from that address all returned 429, while a different address sealed
204 throughout.

**Chain to seller impact.** `sealEbayTicket` returns false for anything but 204
(`lib/studioflow/ebay.ts:301-313`), and `startConnect` then refuses to send the seller to eBay
(`app/settings/EbayIntegrationSection.tsx:116`). Roughly 30 requests a minute, no credential, from
anywhere.

This is the same class the branch already fixed once — `route.ts:46-54` records that "THE PER-PROCESS
BUCKET USED TO BE AN ANONYMOUS GLOBAL KILL SWITCH" — narrowed from everybody to any address the
attacker names. The comment at `route.ts:158-159` ("The per-address bucket is final — it binds one
address, so it cannot be a kill switch for anybody else") is the claim this contradicts: because the
address is caller-supplied, an attacker does not *evade* the limit, they *aim* it.

**Why medium and not high.** It needs the victim's egress IP; it self-heals within a minute of the
flood stopping; it fails **closed** (the seller never reaches eBay, so no live authorization code is
manufactured); no data is exposed and no state is touched; and it does not apply at all if Hostinger's
front end overwrites rather than appends `x-forwarded-for` — an open question the tree itself records
(deploy plan §4.3 step 10).

**Fix.** Make an address-branch refusal non-final in exactly the way the process branch already is
(fall through to the per-flow reserve for a caller whose ticket verifies), or stop refusing on an
untrusted header at all and let the process bucket plus the reserve carry the bound.

---

## M2 — [medium] §5.4's "What does not change" list still describes the pre-ticket world, in the present tense, with no supersession note

`docs/ebay-connector-design.md:1275-1302`. §5.5 at `:1612-1620` states that four places outside §5.4
described the pre-ticket contract as current and that "All four now carry the current design", and
grants a text-preserving exemption to exactly one passage inside §5.4 — "§5.4's own step 3 keeps its
text with a supersession note" (that note is at `:827`). **This list is a fifth place, is inside §5.4,
and carries no note.** Four of its bullets are false against the tree:

- `:1277-1278` — "`beginEbayConnect`, `claimEbayConnectState`, `/ebay/start` and the whole native
  hand-off (§5.2) are **unchanged**, line for line." All three changed under §5.5:
  `functions/ebayConnector.js:525` now returns `ticket: mintTicket(...)`; `:546` refuses the claim
  outright when `ticketKey()` is null; `:566` refuses a web-origin state; `:577` mints a ticket over
  the fresh nonce; `studioflow-web/app/ebay/start/EbayStartContent.tsx:54` seals it and `:59` refuses
  to leave for eBay if sealing failed. §5.5's own minting table at `:1777-1780` says so.
- `:1280-1281` — "same burn — on an absent nonce and on a wrong one alike." An absent nonce cookie no
  longer reaches the function: `route.ts:333-335` turns it into ticket class `nonce`/`no-cookie` and
  `:409-417` posts a dispose envelope that reaches no state document. §5.5's own case table at `:2163`
  and `:2180` says the burn is lost in that case.
- `:1287-1288` — "The nonce cookie's transport attributes are unchanged: `nv_ebay_nonce`, `Secure`,
  `SameSite=Lax`, `Path=/ebay/callback`, `Max-Age=600`." The code writes
  `__Host-nv_ebay_nonce_<tag>` with `Path=/` (`lib/studioflow/ebayFlow.ts:28`,
  `lib/studioflow/ebay.ts:285`). §5.5 correction 8 (`:1658-1659`) rejects that path explicitly.
- `:1289-1290` — the clearing rule "on the landings whose answer proves the state was consumed
  (`connected`, `browser`, `environment`, `no_seller`, `token`, `exchange`)". The code clears only
  when the ticket verified (`route.ts:179-190`, `:385`, `:396`, `:434`); a `browser` landing clears
  nothing (`:435`), which `route.ts:428-430` and §5.5 `:2125` both state as the rule.

---

## M3 — [medium] The platform-logging note still argues from the disposal, not the registry — the one sentence §5.5 says it amends

`docs/ebay-callback-platform-logging.md:181` reads: "**The code in that log line is the one thing we
can still kill, and the disposal is what kills it.**" That is precisely the sentence
`docs/ebay-connector-design.md:1627-1633` amends — "**Amends one sentence of §5.4** … *the spend and
not the burn is what ends the attack* … What ends the attack is now **the presented-code registry** …
it is a belt and no longer the trousers." `docs/ebay-operator-approval-brief.md` §2 makes the same
correction ("an earlier version of this brief overstated it") and puts the registry first.

The same document's "What the residual exposure is worth" paragraph (`:50-53`) never mentions the
registry at all: it says a log reader is stopped by single use, a burned state and the client secret,
and that "To turn it into a connection an attacker needs the log **and** the client secret **and** the
seller's browser." Under the code as it stands, the seller's own landing registers the code on either
envelope (`functions/ebayConnector.js:794` on dispose, `:842` on connect), so that combination is
refused by `claimCode` returning `seen` at `:848` before any state is read — which is exactly what
EBAY-REG-08(a) executes, and what its mutant (c) shows the registry alone provides.

This is the document the production gate rests on, and the one both
`docs/ebay-callback-acceptance-criteria.md` and the brief point a reader at.

---

## M4 — [medium] The production Worker design is entirely pre-§5.5, and would reintroduce the edge refusal §5.4 proved removes the defence

`docs/ebay-production-callback-worker-design.md` contains no occurrence of "ticket", "dispose",
"registry", "presented" or "§5.5" (grep, zero hits). It specifies:

- `:53-54` — "**Browser binding.** No nonce cookie → 302 with `reason=browser`. The backend is never
  called, so a phished consent dies at the edge." That is the edge refusal
  `docs/ebay-connector-design.md:1679-1683` calls "the removal of the defence", and which §5.5
  replaced with a dispose envelope so the code is registered (`route.ts:399-417`,
  `ebayConnector.js:794`). Built as written, every phished production code would be left unregistered
  and unspent — the case §5.5 says the registry exists for (`:2163`).
- `:55-58` — "**Replay.** … a second arrival for the same state is refused with `reason=state` without
  calling the backend." Same consequence: no registration.
- `:96` — the binding cookie's `Path` is "the callback path", which §5.5 correction 8 (`:1658-1659`)
  rejects in favour of `__Host-` with `Path=/`; and `:100` cites the §5.4 clearing rule §5.5 replaced.
- `:156-157` — "the Worker and the Hostinger route are interchangeable callers and no backend change
  is needed to switch." The Hostinger route now signs two different envelopes, verifies a MAC'd ticket
  at the edge, and registers the code on every landing. A Worker that sends one envelope and skips the
  backend on a missing cookie is not an interchangeable caller of that contract.

The document is explicitly design-only ("Nothing has been created"), so no live invariant is broken —
but `docs/ebay-callback-acceptance-criteria.md` names this Worker as "the production answer", so it is
the plan a reader would build from.

---

## L1 — [low] The same spoofed-header lever suppresses code disposal for a named address at the callback route

`studioflow-web/app/ebay/callback/route.ts:129` charges a per-address dispose bucket keyed on the same
untrusted header. **Executed:** 30 landings carrying `X-Forwarded-For: <victim>` drained it, after
which a cookie-less landing from that address made **no dispose POST at all** — leaving eBay's
authorization code both unregistered in `ebayPresentedCodes` and unspent at eBay.

The route already documents this failure mode for the **process** bucket at `:404-408` ("the one place
a landing leaves eBay's code UNREGISTERED as well as unspent"), and justifies it by sizing that bound
"well above genuine traffic rather than a per-address one an attacker steps around". The per-address
bucket underneath it is exactly the per-address one, at 30/minute — and an attacker does not step
around it, they point it.

The seller-facing side is unaffected, confirmed: a seller **with** a ticket still posts a connect
envelope and lands `connected` from the same flooded address, and criterion 6's fail-closed behaviour
is untouched. Same one-line fix as M1.

## L2 — [low] Two guards in the sealing route have no test — including the cookie-name derivation the design calls a control

Twelve guards were deleted one at a time with `test:relay`, `test:ebay-regressions` and
`functions/test/qa/ebay-connect.test.js` re-run after each. Ten were caught. These two stayed fully
green:

**(a) `studioflow-web/app/ebay/ticket/route.ts:217`** — the `Set-Cookie` name derived from the
ticket's **own MAC-covered state**. Replacing `ebayTicketCookieName(verified.state)` with a name taken
from a caller-chosen `body.flow` field passed all three suites. This is not a minor guard:
`route.ts:26-28` names it as one of "Three independent controls" closing the cross-site plant, and
`lib/studioflow/ebayFlow.ts:15-17` says the tag is "NOT a security boundary" and that "The security
comes from the two things around it: the sealing route derives the name from the ticket's own
MAC-COVERED state, and `__Host-`". The shipped code is correct; nothing would notice if it stopped
being.

**(b) `studioflow-web/app/ebay/ticket/route.ts:122`** — the `content-length` pre-check in `readCapped`.
Removing it left everything green. Defence-in-depth only: the streaming cap at `:133` still enforces
`MAX_BODY_BYTES`, so there is no live exposure, only an untested line.

*Fix:* add a relay vector for (a) that seals a ticket while the body carries a decoy `flow`/`state`
field and asserts the `Set-Cookie` name is the ticket's; and one for (b) that sends a lying
`content-length`.

## L3 — [low] `ebayReasonText` reflects `Object.prototype` keys, so `?reason=constructor` puts a function into the settings error banner

`studioflow-web/lib/studioflow/ebay.ts:220-223` is
`REASON_TEXT[key] || ebayErrorText(key) || fallback`, and both tables are plain object literals
(`:156` and `:192`), not null-prototype maps. So `ebayReasonText("constructor")` — likewise
`toString`, `valueOf`, `hasOwnProperty` — returns a **function**, which is truthy and short-circuits
the fallback. It flows through `t()` unchanged (`studioT` returns its argument for English) into
`setError` at `app/settings/EbayIntegrationSection.tsx:94`, which reads `params.get("reason")`
straight from `window.location.search`.

Reachable by luring a signed-in seller to
`/settings?section=ebay&ebay=error&reason=constructor`. Impact is bounded and cosmetic: React does not
render a function child, so the outcome is a blank error banner plus a console warning — no script
executes, and no attacker-supplied **text** is reflected (React escapes strings, and the callback route
itself only ever redirects with a word from its closed union, `route.ts:108-119`).

*Fix, one line:* gate the lookup on `Object.prototype.hasOwnProperty.call(REASON_TEXT, key)`, or make
the tables `Object.create(null)`.

## L4 — [low] The callback route's comment overstates the presented-code registry's document id

`studioflow-web/app/ebay/callback/route.ts:47` says the disposal's "only Firestore effect is ONE
`.create()` at `ebayPresentedCodes/` under an id the caller cannot aim (a hash of the code)". The id is
`sha256hex(code)` (`functions/ebayConnector.js:666`) over a code the caller supplies in the query
string, so it is precisely aimable. What the hash prevents is **shaping a path** (the Firestore
argument-validator trap the same file names), not **choosing a document**.

Nothing follows from it, which is why this is low rather than a defect: pre-registering a code requires
knowing a live code, and anyone who knows one would redeem it instead of blocking it; `firestore.rules:1218`
denies every client read and write to the collection (`allow read, write: if false`), executed in the
emulator tier; and the genuine seller's own connect landing registers the code on the connect path
regardless of the dispose bucket. What **is** real and bounded: an anonymous caller can drive up to the
web route's 300/minute of Firestore `.create()` writes per web process into that collection, each with
a one-hour TTL — a cost surface, not an exposure.

*Fix:* reword the comment to say what the derivation actually buys, so a future reader does not lean on
"cannot aim" for something it does not cover.

## L5 — [low] The `jti` comment says the field is read by nothing; it is read by the callback edge's spend

`functions/ebayConnector.js:376-379`: "Read by nothing today. It exists so a ticket is not a
deterministic function of values an attacker may know, and so edge-side single-use storage — **if that
decision is ever taken** — already has a MAC-covered handle to key on."

The decision was taken, in this branch's most recent commit (`4e74929f`):
`studioflow-web/app/ebay/callback/route.ts:364` passes `ticket.jti` to `spendTicket`,
`lib/studioflow/ebayTicketSpend.ts:57-61` keys on it, and `docs/ebay-connector-design.md:1727` now
describes the field as "**Read by the callback edge's spend** (see *Single use*), which keys on it",
with `:2045-2046` naming the module.

Same class of defect as commit `46b9a3b8` ("Two eBay screen rules were written in a comment and
contradicted by the code under it"), in the file whose comments the design treats as load-bearing.

## L6 — [low] "A third exception is closed" — the oversize-body path still refuses without posting, and is on no list

`docs/ebay-connector-design.md:987-989`: "A third exception is **closed** rather than listed: the two
shape checks used to disagree on units (4096 characters at the route, 8192 bytes at the function) … The
route now applies the function's cap to the exact bytes it sends."

Applying the cap at the route did not close the exception to "a shaped callback always POSTs" — it
moved it to the edge. `studioflow-web/app/ebay/callback/route.ts:369` returns
`land("error", "missing_code")` with no POST when the serialised connect body exceeds 8192 bytes, and
`:414` skips the disposal for the same reason. So the landing neither registers nor spends the code —
which is exactly the property §5.5's list at `:2327-2331` enumerates for its four items ("All four
leave a code unpresented **and unregistered**").

It appears on neither §5.4's list (`:974-985`) nor §5.5's, nor on deploy plan §4.2's trigger list
(`docs/ebay-web-callback-deploy-plan.md:212-217`) — and it is the only such path that writes no log
line at all, so §4.2's "One observable covers all of them — `ebay callback relay rid=… status=…`" does
not cover it. The behaviour itself is executed and asserted as "no call" by
`studioflow-web/scripts/check-ebay-relay-vectors.mjs:545-547`. Not reachable from eBay in practice (its
codes are ASCII), which is why this is a list-completeness finding and not a defect.

## L7 — [low] Seven stale source citations in the design point a reader at unrelated code

Present-tense citations in `docs/ebay-connector-design.md` that do not resolve:

- `:1652` and `:1784` cite `ebayConnector.js:466` for `claimEbayConnectState`'s `nonceHash` rewrite.
  The rewrite is at `functions/ebayConnector.js:567`; `:466` is
  `const accessToken = String(tokens?.access_token || "")` inside `refreshWithLock`.
- `:2306` cites `ebayConnector.js:385` for `refreshWithLock`, which is defined at `:432`.
- `:859` cites `functions/index.js:32833` for the
  `req.rawBody || Buffer.from(JSON.stringify(req.body || {}))` fallback, which is at
  `functions/index.js:32845`.
- `:1956` and `:2649` cite `EbayIntegrationSection.tsx:104` for `startConnect`, which is at
  `studioflow-web/app/settings/EbayIntegrationSection.tsx:112`.
- `:1299` and `:1560` cite `ebay.ts:254-266` for `setEbayNonceCookie`'s JSDoc and `267-271` for the
  writer; they are at `studioflow-web/lib/studioflow/ebay.ts:255-282` and `:283-286`.

Citations to deleted pre-§5.4 code (`:1189` → `ebayConnector.js:417`, `:1313` → `ebayConnector.js:400`)
are past-tense records and are fine.

## L8 — [low] The acceptance-criteria file's own row-2 citation names tests that do not exist under that name

`docs/ebay-callback-acceptance-criteria.md` row 2 cites its evidence as "relay cases 1, 2, 3, 4, 6, 7".
`npm run test:relay` (`studioflow-web/scripts/check-ebay-relay-vectors.mjs`) has no numbered cases; its
vector ids are `relay-connect-valid`, `ticket-other-state` and so on. The cases meant are
`EBAY-REG-01/02/03/04/06/07` in `studioflow-web/scripts/check-ebay-callback-regressions.mjs`, run by the
separate `npm run test:ebay-regressions` — and the same table's row 6 cites `EBAY-REG-05` in exactly
that form.

The criterion holds, and all six cases exist and are guard-sensitive (verified by mutation, recorded in
the gate result). The citation is wrong — in the one file written so that "a gate agent could not
certify them" stops being true.

## L9 — [low] Two "Where the code makes it true" cells in the criteria file overstate the code

`docs/ebay-callback-acceptance-criteria.md`:

- **Row 6** says "the state is burned inside the transaction on every refusing path". Two of the four
  refusing paths return before the burn: `functions/ebayConnector.js:858` (`!snap.exists`) and `:860`
  (`used === true || expiresAt < now`) both `return { reason: "state" }` above the
  `tx.update(ref, { used: true, … })` at `:862`. The criterion itself — replay, unknown or expired
  state, and a session mismatch all fail closed — **does** hold on all four (an unknown state has
  nothing to burn, a used one is already burned, an expired one can never be used again). This is the
  sentence, not the property.
- **Row 7** says "the function refuses a body carrying `state` or `nonce`" without qualification. The
  connect envelope carries both by design; it is only a `dispose` body that is refused
  (`functions/ebayConnector.js:787`).

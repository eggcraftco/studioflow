# Deploying the eBay callback route to production

Written 6 September 2026, revised the same day after design §5.4. The plan covers one thing only:
putting `nivadesk.app/ebay/callback` and `nivadesk.app/ebay/start` on the live site so that a sandbox
OAuth attempt can be tested later, under a separate approval.

**What has already happened, so the rest reads honestly.** Round 166 went out on 6 September
(`docs/ebay-web-deploy-round-166.md`): the web half, including a callback route that *redirected the
seller's browser onward* to `ebayOAuthCallback?code=…&state=…&nonce=…`. That redirect is the finding
this revision closes. The route on the branch now performs a signed server-to-server POST instead
(§5.4), so **a further web deploy is required** — the site as it stands today is still the
redirect-forwarding version. Everything in §4 below describes that next deploy, and nothing in §4 has
been performed.

## 1. What actually ships

From `ebay-connector`, the web half only:

| Path | What it is |
|---|---|
| `app/ebay/callback/route.ts` | The accepted URL. Verifies the browser-binding **ticket** (§5.5) and, only then, sends `code`, `state` and the cookie nonce to the Cloud Function in a **signed POST body** — never a URL (design §5.4). A browser that holds no ticket gets the strictly weaker **dispose** envelope, which names no state. It forwards no eBay parameter, refuses anything that is not a callback, and turns the function's JSON answer into the seller-facing redirect |
| `app/ebay/ticket/route.ts` | **New with §5.5, and it ships in the same deploy or nothing works.** The sealing route: the client hands it the ticket `beginEbayConnect` returned, it verifies it and answers the one `Set-Cookie` that seals it `HttpOnly`. Client JavaScript cannot set an `HttpOnly` cookie, so there is no other way to write that half; and the callers refuse to send the seller to eBay when it answers anything but 204 |
| `lib/studioflow/ebayFlow.ts`, `lib/studioflow/ebayTicket.ts` | The two cookie NAMES (derived identically by three parties) and the ticket verifier. `ebayTicket.ts` is server-only — it reads `node:crypto` and the relay key |
| `app/ebay/start/page.tsx`, `EbayStartContent.tsx` | The native hand-off: a signed-in browser claims the state, seals the ticket, sets the nonce cookie, redirects to eBay |
| `app/settings/EbayIntegrationSection.tsx` and the registry, language and card changes | The eBay screen and the grid card |

The server half is **not** part of this deploy. Cloud Functions ship by name, and no eBay function is
on that list.

**This plan was written against the redirect-forwarding route and has been brought in line with design
§5.4**, which replaced that forwarding with a signed server-to-server POST because a query-string
redirect handed the authorization code and the browser nonce to Cloud Logging. The route now needs one
thing this plan did not previously mention: a **server-only** environment value,
`NIVADESK_EBAY_CALLBACK_KEY`, set in Hostinger by the operator. It must **not** carry a `NEXT_PUBLIC_`
prefix, and it is the first server-only env var this web tree has ever read — see §4.1 for the two
names and §4.3 step 4 for the runtime proof that it is readable at all.

## 2. Source of the build

The eBay branch's web tree is not behind the deploy branch: `git diff 1eef5c8b..HEAD -- studioflow-web`
on `macbook-save-before-macstudio-2026-06-01` is empty, so every web change since the merge base is
already on the eBay branch. The build can therefore be taken from the `studioflow-ebay` worktree and
rsynced into the publish repository as Round 166, without merging the server half into the deploy
branch and without disturbing the functions tree that the dependency-remediation soak is still
watching.

## 3. Pre-deploy checks, all of them locally verifiable

| # | Check | How | Status |
|---|---|---|---|
| 1 | Types and build clean | `npm run typecheck`, `npx next build --no-lint` | **done, clean** |
| 2 | The callback is dynamic, never cached | build output must list `ƒ /ebay/callback`, not `○` | **done — `ƒ /ebay/callback`** |
| 3 | No open redirect | the redirect target is a module constant; no query parameter reaches `NextResponse.redirect` | **done by construction** |
| 4 | The route puts no value in a URL | it builds a JSON body from `code`, `state` and the cookie nonce and POSTs it signed; `NextResponse.redirect` only ever receives a module constant plus `ebay`/`reason` from a fixed vocabulary | **done, commit `53f63d12`** — the built route was driven with `fetch` captured and the request it made carried no query string |
| 5 | A visit that is not a callback is refused at the edge | no `code` and no `error` → 302 to the settings page with one sentence, nothing forwarded, and — **corrected since this row was written** — **no cookie cleared**: a bare visit consumed nothing, so a `Set-Cookie` there would be a free way for any link to destroy a seller's in-flight connect | **done, commit 46a98b8d; the "no cookie cleared" half is executed by `npm run test:relay`** |
| 6 | Cookie flags — **rewritten by §5.5; the row this replaced described one cookie and the wrong path** | There are now **two** cookies per flow, and the flow's tag (the state's first sixteen characters) is in the NAME, so a seller who presses Connect twice no longer overwrites the first flow's pair with the second's. Both take the **`__Host-` prefix**, which is the change that matters: `Path=/ebay/callback` was a request-matching rule and not a boundary, and nivadesk.app fronts a Cloudflare-for-SaaS Worker with a catch-all route, so a `Domain=nivadesk.app` cookie of the same name written from any `*.nivadesk.app` origin would arrive beside the host-only one with no defined precedence. `__Host-` forbids `Domain`, forbids any `Path` but `/`, and requires `Secure`. So: `__Host-nv_ebay_nonce_<tag>` — `Secure; SameSite=Lax; Path=/; Max-Age=600`, written by client JavaScript, therefore **not** `HttpOnly`; and `__Host-nv_ebay_ticket_<tag>` — `Max-Age=<the ticket's own remaining life>; Path=/; Secure; HttpOnly; SameSite=Lax`, written **only** by `POST /ebay/ticket`. Clearing changed with them: a landing clears **this flow's pair and only this flow's**, and the disposal landing clears **nothing at all**, because whatever that browser is holding belongs to some other flow (a `Set-Cookie` there would be a link's free way to destroy someone's in-flight connect) | **verified in `lib/studioflow/ebay.ts` and `lib/studioflow/ebayFlow.ts`; the exact `Set-Cookie` attribute set, character for character, and every landing that does and does not clear, are executed by `npm run test:relay`** |
| 7 | No secret in the client bundle | grep the **client** chunks for `EBAY_`, `CLIENT_SECRET`, `CERT`, `TOKEN_KEY`, `NIVADESK_EBAY_CALLBACK_KEY` and the literal `x-nivadesk-signature` | **the §5.4 pair is clean** on the current build (no `NIVADESK_EBAY_CALLBACK_KEY`, no `x-nivadesk-signature` in `.next/static`); the older four are re-run on the deploy build |
| 7b | The key was **not inlined at build time** | grep the **server** chunk for the route: the literal `process.env.NIVADESK_EBAY_CALLBACK_KEY` must still be **present**. If Next replaced it statically the name vanishes and the value takes its place, so check 7 would pass in exactly the failure case. `export const runtime = "nodejs"` in the route is what prevents it | **done** — `.next/server/app/ebay/callback/route.js` still contains the literal `process.env.NIVADESK_EBAY_CALLBACK_KEY` |
| 8 | The eBay screen degrades when the server has no eBay functions | with the callables absent the callable answers HTTP 404 and `@firebase/functions` makes the FirebaseError's **message** the bare word `not-found`; the section must say a sentence, not the word. This is not a corner case — it is the state of every workspace between step 3 and step 6 of the order below, and the eBay card is `kind: "native"` in the integrations grid, so it is live and clickable throughout | **done** — the section no longer prints a raw callable message (`lib/studioflow/ebayScreenRules.ts`), and `npm run test:relay` drives the **real** `@firebase/functions` to a 404 to prove the premise, checks the sentence, and pins the section's source so the raw message cannot come back. Still worth one eyeball against the built app before the rsync |
| 9 | Nothing else changed on the site | diff the publish repository after the rsync, and expect only eBay files, the registry, the language tables and the build output | run at deploy time |
| 10 | `npm run test:relay` green — **and it is a CI job now, not a thing to remember** (`functions-tests.yml`, job `relay`) | the route's own signer is executed against the real `ebayOAuthCallback`: the canonical string agrees across the two trees, the signature binds the body, a browser without the binding posts a **dispose** envelope that names no state, both decline shapes make no call, and a blank or short key makes no call. Plus the route's source assertions (`runtime = "nodejs"`, `dynamic = "force-dynamic"`, the decline branch, the in-handler `process.env` read with its length floor, no `NEXT_PUBLIC_`). **And, since §5.5, the committed vectors**: the route's signer and its ticket verifier against a frozen fixture | **done — `studioflow-web/scripts/check-ebay-relay-vectors.mjs`, wired as `npm run test:relay`, green.** It **does** read the committed vector file now, and fails if it is missing; see below |

**Check 10 was the one gap in this list. It is now closed twice over, and the second half is what this
revision adds.** The plan was a committed vector file
(`functions/test/fixtures/ebay-callback-signature-vectors.json`) checked by both sides, and the earlier
revision of this paragraph said it was blocked on an owner decision: *a committed vector needs a fixed HMAC
key, and a 64-hex value in a committed file sits badly against this project's no-secret-values rule even
when the value is meaningless.* **There is nothing here for the operator to decide, and that sentence is
withdrawn.** The file is written, and it answers the question about itself: it **mints its own key inside
itself**, labels it `TEST-KEY-NOT-A-SECRET`, and carries a README saying in as many words that the value
must never be set in Secret Manager as `EBAY_CALLBACK_KEY` nor in Hostinger as
`NIVADESK_EBAY_CALLBACK_KEY`. A test in `ebay-connect.test.js` walks the whole repository and fails if
either fixture key appears in any file but the fixture and its generator. **No operator action, no new
value to mint, no new place to record one.**

The script also does the thing the vector was a proxy for, and both halves matter for different reasons.
It compiles the real `app/ebay/callback/route.ts`, drives it with `fetch` captured, and hands the request
it produced to the real `ebayOAuthCallback` through the functions qa harness, under a key minted per run
and written nowhere — which exercises the route's decisions as well as its arithmetic. But that check is
**symmetric**: it proves the two sides agree with each other, and it stays green if both of them move
together, which is one commit's work for anyone editing a canonical string. The fixture is the asymmetric
half: a frozen answer neither side can move. Five cases carry the transport — a valid signature, a wrong
key, a swapped body, a stale timestamp and a future timestamp — plus the dispose envelope's bytes and six
ticket cases.

**It now runs in CI, and the sentence that used to say so was false.** `.github/workflows/functions-tests.yml`
gained a third job, `relay`, which installs the web tree alone (the functions qa harness pulls in no
external package) and runs `npm run test:relay`. Getting there needed the workflow's own trigger list
widened, which is the sharper half of the finding: the file listened to `functions/**`, `firestore.rules`
and `firebase.json`, so **a change to `app/ebay/callback/route.ts` fired no workflow at all** — the side
most likely to change was covered by nothing automatic, and the failure it would cause is silent and
production-only (the canonical string drifting between the two trees, seen as an opaque 401 →
`unavailable` on every seller's connect). The list now carries `studioflow-web/app/ebay/**`,
`lib/studioflow/ebay.ts`, `lib/studioflow/ebayFlow.ts`, `lib/studioflow/ebayTicket.ts`, both scripts and
`studioflow-web/package.json`. **The `SKIP` line that used to print on every run is gone**, and it cannot
come back: a missing fixture is now one `FAIL` and a non-zero exit before the script compiles anything, and
a source pin in `ebay-connect.test.js` asserts the relay script's code contains no `SKIP` and that the
vector cases contain no `skip`, no `todo` and no early `return`. The canonical strings are recorded in the
fixture itself: `HMAC-SHA256(key, "v1." + timestampMs + "." + rawBodyBytes)` as lowercase hex for the
relay, and `nv1.<state>.<nonceTag>.<expMs>.<jti>.<mac>` under a ticket key derived as
`HMAC-SHA256(key, "nivadesk/ebay/ticket/v1")` — **derived, so there is still no sixth secret.**
`functions/test/fixtures/generate-ebay-callback-vectors.mjs` re-derives every frozen value from the real
implementations and refuses to overwrite a drifted one without `--force`; it runs in CI as
`npm run test:vectors`.

**One property that was stated rather than fixed, and then fixed.** This paragraph used to end: *making it
`HttpOnly` needs a server route to mint it, which is a change to the connect flow (the native hand-off
included), not to this deploy.* §5.5 made that change, and the server route is `POST /ebay/ticket`, which
ships in this deploy — so the paragraph is rewritten rather than left standing.

What is still true: the **nonce** cookie is written by the browser with `document.cookie`, so it is not
`HttpOnly` and cannot be — the value is returned to the client as JSON. It lives 600 seconds, it is single
use, and it is burned server-side. What changed: it is no longer the only thing the callback checks. Beside
it there is now a **ticket** cookie, `HttpOnly`, written only by our own origin, carrying a MAC over this
flow's state and a keyed tag over this flow's nonce. Script on nivadesk.app can still read the nonce; it
cannot read the ticket, and it cannot make the callback route sign a `connect` envelope without one. Both
cookies take the `__Host-` prefix, which is what a matching path never was: no other origin can set those
names at all.

## 4. Order of operations

Under §5.4 the connect flow needs **one shared value in two different systems**. Neither half is any use
alone, and the plan is explicit about what each state produces, because a half-configured key is the
most likely way this deploy goes wrong quietly.

### 4.1 The two names, and who sets what where

| Name | Where the operator enters it | Who reads it, and when |
|---|---|---|
| **`EBAY_CALLBACK_KEY`** | Google Secret Manager in `eggcraft-studio`, granted to `ebay-connector@eggcraft-studio.iam.gserviceaccount.com` **only**. It reaches the function only through `EBAY_RUNTIME`, which `functions/index.js` builds only when `functions/.ebay-secrets-ready` is committed (or `NIVADESK_EBAY_SECRETS_READY=1`) — so the secret existing is not enough; the marker and a deploy are part of it | `ebayOAuthCallback`, at call time, to **verify** the signature. It is the fifth eBay secret, beside `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_TOKEN_KEY` and `EBAY_HASH_KEY` |
| **`NIVADESK_EBAY_CALLBACK_KEY`** | The Hostinger environment for the `nivadesk.app` site. **No `NEXT_PUBLIC_` prefix** — that prefix compiles the value into the browser bundle and would publish it to every visitor | `app/ebay/callback/route.ts`, per request, to **sign** the body it POSTs. It is the first server-only environment value this web tree has ever read, which is why step 4 proves it separately |

Both hold the **same value**: 32 random bytes as hex, minted by the operator with `openssl rand -hex 32`
and typed into the two places above. It appears in no file, no commit, no log and no chat message — the
key is never sent on the wire either, because the web side signs and the function side verifies.

### 4.2 What happens if only one side is configured

| Hostinger `NIVADESK_EBAY_CALLBACK_KEY` | Function `EBAY_CALLBACK_KEY` (secret **and** marker **and** deploy) | Result |
|---|---|---|
| set | set, same value | The only combination that can complete a connection. |
| **unset**, or shorter than 32 characters | anything | **Since §5.5 the seller never reaches eBay at all, and that is the important half.** `POST /ebay/ticket` reads the same value and answers **503** without it; `sealEbayTicket` returns false; the Connect button stops with "eBay did not complete the connection. Try again." and never navigates to `authorizeUrl`. **No authorization code is ever minted**, so the residual below — a live code sitting in Hostinger's access log — does not open for a web-origin flow at all. If a code does land anyway (a stale tab, a bookmarked callback, a native flow begun before the outage), the callback route then makes **no call at all**, the seller lands on `…&ebay=error&reason=unavailable`, and the Hostinger log carries one line naming the variable and which check failed: `ebay callback relay: NIVADESK_EBAY_CALLBACK_KEY not configured` or `… shorter than 32 characters`. **No state is consumed and no code is spent — and the second is still the cost for that narrower case: see below.** |
| set | **unset**, or the marker not committed, or the functions not deployed | **The seller never reaches eBay, and the three ops lines this row used to name cannot appear.** The ticket is minted by the FUNCTION, from the same key: `ticketKey()` returns null below the 32-character floor, `mintTicket` returns `""`, `beginEbayConnect` answers `ticket: ""`, and the settings card refuses to navigate ("eBay did not complete the connection. Try again."). No code is minted, the callback route is never reached, and there is no `ebay callback relay … status=401`, no `… unreachable`, and no `ebay callback: EBAY_CALLBACK_KEY not configured` — the function is not called. **Where to look instead:** the seller-facing sentence, and nothing in either log. If the functions are not deployed *at all*, the settings card says "eBay is not set up on this server yet." (the callable answers 404). A code CAN still land from a flow begun before the outage — a stale tab, a bookmarked callback, a native start claimed earlier — and only then does the route make its POST and produce those lines. **No state is consumed.** |
| set, same value | set, same value, but the **web host's clock is more than five minutes off** Google's | **This fails at the EDGE, not at the function, and the ops line this row used to send the operator to grep for can never be written.** The ticket's window is checked in the web tier against the state's own expiry (`expMs > now` and `expMs ≤ now + 15 min`), so `POST /ebay/ticket` answers **400** and the seller never leaves. Measured on the compiled route: 4 minutes either way still seals (204); 6 and 11 minutes behind and 11 ahead are 400. The only line is `ebay ticket: refused` on Hostinger (throttled to once a minute) plus the `ebay ticket route window=… refused=n` aggregate. Google logs **nothing**, `ebay callback: relay timestamp outside the five-minute window` included. **Where to look:** `refused=` rising on the ticket-route aggregate with `sealed=` at zero — and then compare the two hosts' clocks, which is what that line used to be for. **No state is consumed.** |
| set | set, **different value** (a half-finished rotation) | **Also at the edge.** The ticket is minted under the function's key and verified under the route's, so `POST /ebay/ticket` answers **400** before the seller leaves — measured. Hostinger logs `ebay ticket: refused` and the same aggregate; Google logs nothing, because the function is never called. The `401` / `ebay callback relay … status=401` / `ebay callback: rejected unsigned request` triple this row used to promise belongs to a code that lands from a flow begun before the rotation. It is still the realistic steady-state row: a rotation where Hostinger already has the new value and Secret Manager does not. **No state is consumed — the cost, not the comfort: see below.** |

The pattern is the point: **every partial configuration fails closed for the connection.** No code is
exchanged, no token is written, and nothing on the seller's screen is more specific than one sentence.

**And since §5.5 there is a second pattern, which is what the three rows above were rewritten for: every
one of those failures now happens BEFORE the seller leaves for eBay, not on the return leg.** That is the
good news and the trap in one. The good news is that no authorization code is minted at all, so residual 1
never opens. The trap is that an operator debugging from the §5.4 text goes looking in Google's logs for
lines that cannot exist, finds nothing, re-mints the key, redeploys, and is no further forward — the exact
dead end the clock row warned about, created by the row itself.

**So the first place to look for any half-configured key is `POST /ebay/ticket`, on Hostinger**, not the
callback and not Google:

```
ebay ticket: refused                                                   (throttled, once a minute)
ebay ticket route window=<ms> sealed=<n> refused=<n> throttled=<n> blocked=<n>
ebay ticket route: NIVADESK_EBAY_CALLBACK_KEY not configured           (Hostinger's own half missing)
```

`sealed=0` with `refused=n` is every row above except the first. `sealed=0` with `refused=0` and the
"not configured" line is Hostinger's half. Only once sealing succeeds does anything reach the function, and
only then are `ebay callback relay rid=… status=…` and Google's own lines worth reading. Design §5.5's
*What a mis-set key looks like* says the same thing, and these two documents disagreed until now: the
deploy plan is the one the operator follows, so it is the one that was wrong.

Each of these five rows is executed rather than argued: `npm run test:relay` drives the compiled routes
against the real function with the function's key blanked, truncated and rotated, and with the web clock
moved 4, 6 and 11 minutes in both directions.

**What it does not do is keep §5's browser binding, and this plan used to say the opposite.** A shaped
callback always POSTs — but since design §5.5 it posts one of **two** envelopes, and which one depends on
whether the browser holds the binding: a verified ticket posts `connect`, which consumes the state and
exchanges the code, and anything else posts `dispose`, which names no state and whose whole effect is that
**eBay's code is presented to the token endpoint and thrown away**. In every row above the POST is either
never made or never authenticated, so neither envelope arrives and neither happens. (The earlier revision
of this paragraph said the no-cookie case burns a state. It no longer does, and nothing is lost by that:
the state left alive is the *attacker's own*, and the code is what mattered.)

**The damage is the unspent code, not the unburned state**, and this plan previously had that backwards
too. eBay binds a code to our application, never to the state that fetched it, so an attacker does not
need the state that was left alive: they mint their own after service is restored and present the code
against it. Meanwhile that code is sitting verbatim in Hostinger's access log (measured, no redaction, no
disable, retention and readers undisclosed — `docs/ebay-callback-platform-logging.md`).

**The trigger is wider than a key outage.** The code is registered and spent only when the POST reaches the
function *and* authenticates. So the same window opens on: a key outage, a bad or
missing functions deploy, a 401 from a clock drift, a 5xx, a Cloud Run scaling failure, a Firestore
transaction error, the route's own 45-second abort, and — new with §5.5 — an exhausted disposal counter at
the edge (per process or per address). One observable covers all of them — `ebay callback relay rid=… status=…`,
`ebay callback dispose rid=… status=…`, `… unreachable` or `… timeout` in the Hostinger log. **Any window
in which the relay was not answering 200 is one of these.**

**Two triggers are not outages at all, and they are the ones nobody would think to look for.** A disposal
has no state, so it cannot know which RuName or which environment the code it is spending was minted
against: it uses this deployment's current `EBAY_RUNAME` and `NIVADESK_EBAY_ENVIRONMENT`. So:

* **`EBAY_RUNAME` changed, or a second RuName added** — a code minted under the old one is rejected at the
  exchange and stays live at eBay for the rest of its TTL.
* **the environment flipped** — a sandbox code disposed against production, or the reverse, is not spent
  at all.

Neither is visible as an error, because a disposal's failure is swallowed by design. What makes them
visible is the count: `ebay callback dispose window=… spent=0 refused=n` on the Google side, where a
healthy deployment shows `spent` rising. The action for both is a quiet period at least as long as eBay's
code TTL around the change, and the same notification as above for anything that landed inside it.

**So the operator action, and it is not "wait for the fix to land".**

1. Fix the cause (both halves of the key, same value; or the deploy; or the clock).
2. **Treat every consent that landed during the window as replayable for the rest of eBay's code TTL.**
   Tell those sellers to reconnect — and know that this is a *notification*, not a remedy: there is no
   revoke, and the only lever that kills a code is redeeming it, which is exactly what the outage
   prevented. **Nothing on our side can invalidate a code we never presented.**
3. Expiring the outstanding `ebayConnectStates` (`used == false`, `expiresAt` in the future) is **not**
   the remedy this plan used to call it. It is harmless tidying — those states are worthless to their
   owners, whose remedy is to press Connect again — but the attacker was never going to use them, so it
   closes nothing. It is listed here only so nobody re-derives it and stops there.

Nothing here is live today — no function is deployed and no genuine code or state exists yet — so this is
a rule for the rollout and for every later rotation, not an incident.

### 4.3 The order itself

**The two web routes are one deploy and cannot be split**, and it is worth saying because §5.5 added the
second one after this plan was written. `/ebay/callback` and `/ebay/ticket` are two files in the same Next
build, so they arrive together by construction — but they also *depend* on each other: the callback signs a
`connect` envelope only for a browser holding a ticket, and only `/ebay/ticket` can write that cookie. A
site with the callback and no sealing route would refuse every consent with `reason=browser`; a site with
the sealing route and Round 166's callback would seal a cookie nothing reads. Step 5 below probes both.

**The web route ships before the functions, and that is a safety property, not a preference.** Today's
live site still runs Round 166's route, which forwards the seller's browser to `ebayOAuthCallback` as a
**GET** (`docs/ebay-web-deploy-round-166.md`). The new function answers any non-POST with `405
{"ok":false}`. So deploying the functions first would leave a real callback ending with the seller staring
at raw JSON on `europe-west2-eggcraft-studio.cloudfunctions.net` — the one landing in this whole design
that is neither a sentence nor on our own domain. Never invert steps 3 and 6.

**And the ugly landing is the smaller half of it, which this paragraph used to leave out.** Round 166's
route redirects the browser to `…/ebayOAuthCallback?code=…&state=…&nonce=…` (that document records the
exact shape). Cloud Run writes `httpRequest.requestUrl` — query string included — into Cloud Logging on
every request. So inverting the order does not merely produce a bad screen: it **reopens in full the leak
§5.4 exists to close**, on Google's side as well as Hostinger's, and it publishes the browser-binding
**nonce** as well as the code — the one value that stops a phished consent landing in someone else's
workspace. Worse, the 405 lands before the body is read, so the state is never burned, the code is never
registered and never spent, and both sit live in two logs for the rest of eBay's TTL. If the order is ever
inverted by accident, that is not "redeploy the web tier": it is deploy plan §4.2's notification, for every
consent that landed in the window, plus a Cloud Logging retention question for the entries themselves.

The reverse order — the one below — is safe by construction, which is worth recording beside it: the new
route posts to a function that is not deployed, the fetch fails, and the seller lands on
`reason=unavailable` with a sentence. Even against the **old** deployed function it would fail closed,
because the route sets `redirect: "error"`, so that function's 302 becomes a throw rather than a followed
redirect. (Both cases are moot today only because `ebayOAuthCallback` is not deployed at all; the rule is
for the next time this pair moves.)

1. **Sandbox RuName** registered in the eBay portal with the accepted and declined URLs (operator).
2. **The shared key, both places, before the deploy that depends on it.** Secret Manager first
   (`EBAY_CALLBACK_KEY`, granted to `ebay-connector@` only), then the same value in Hostinger as
   `NIVADESK_EBAY_CALLBACK_KEY`. The order between the two is not a safety property — §4.2 shows both
   partial states fail closed — but doing Secret Manager first means the function is already keyed the
   moment it ships, and doing both now means step 4 is testing the configuration that will actually run.
   What **is** a safety property: both are set before the first OAuth attempt in step 8, because that is
   the first moment a genuine code and a genuine nonce exist.
3. **Web deploy** — build from the eBay worktree, rsync, commit, push, wait for Hostinger, confirm the
   chunk hash changed. This is the deploy that replaces Round 166's redirect-forwarding route with the
   §5.4 signed POST **and adds §5.5's sealing route `POST /ebay/ticket`**. Confirm both are dynamic in the
   build manifest (`ƒ /ebay/callback`, `ƒ /ebay/ticket`); a `○` on either means it was prerendered and the
   per-request `process.env` read is gone.
4. **Prove the runtime environment**, immediately and before anything else depends on it. Every other
   environment value this web tree reads is `NEXT_PUBLIC_*`, inlined at build; this one is not, and the
   project's own precedent runs the wrong way (the web-push VAPID key had to go into Hostinger's *build*
   environment). Request
   `https://nivadesk.app/ebay/callback?code=probe&state=aaaaaaaaaaaaaaaaaaaaaa` and read the Hostinger
   log:
   - it must **not** say `ebay callback relay: NIVADESK_EBAY_CALLBACK_KEY not configured` — that line
     means the running server cannot see the value that was set in step 2;
   - it should say `ebay callback relay rid=<rid> unreachable`, because the function is not deployed yet.
   If the key line appears, Hostinger injects only at build time: rebuild with the value in the build
   environment, record that fact, and correct design §5.4's rotation sentence in the same commit
   (rotation then needs a rebuild, not a restart). Without this step a build that never sees the key
   fails silently and permanently, and the single log line above is the only diagnostic.
5. **Proof that the callback is live and fail-closed**, before any OAuth attempt:
   - `GET https://nivadesk.app/ebay/callback` → **302** to `…/settings?section=ebay&ebay=error&reason=missing_code`. Not 404, not 500, and no POST.
   - `GET https://nivadesk.app/ebay/callback?state=<20+ shaped chars>&code=made-up` → **302 to the
     settings page with `reason=browser`**, and a Hostinger log line
     `ebay callback ticket refused rid=<rid> class=no-cookie` beside
     `ebay callback dispose rid=<rid> status=0`. Under §5.5 a browser holding no ticket cannot make this
     route sign anything that names the state it asked about, so what goes out is a **dispose** envelope
     and the landing is `browser` rather than `unavailable` — the earlier revision of this step expected
     `unavailable` and a `relay … unreachable` line, which is what a *verified* landing produces when the
     function is not there. It is **not** a redirect to the Cloud Function: the browser never meets the
     function host, and until the connector's functions are deployed the POST has nowhere to land.
   - `POST https://nivadesk.app/ebay/ticket` with `content-type: application/json`, `{"ticket":"nv1.x"}`
     and no `Sec-Fetch-Site` or `Origin` → **400**, no `Set-Cookie`. The same body with
     `Sec-Fetch-Site: same-origin` → **400** too (the ticket is nonsense), and a **503** instead means the
     relay key is missing from the runtime environment — the same cause step 4 checks for, reached by a
     different symptom and visible **before** any seller leaves for eBay.
   - `GET https://nivadesk.app/ebay/start` without a session → the sign-in path, never a stack trace.
6. **Commit `functions/.ebay-secrets-ready` naming all five secrets**, then deploy **the connector's own
   functions** (`ebayOAuthCallback`, `beginEbayConnect`, `claimEbayConnectState` and the rest) by name — a
   separate approval, and not before the dependency soak closes. **After step 3, never before it:** the
   live route still GETs the function, and the new function answers a GET with 405 JSON. Without the marker `EBAY_RUNTIME` is
   empty, nothing is mounted, `EBAY_CALLBACK_KEY` reads as `""`, and every callback answers 401 →
   `reason=unavailable` forever, however correctly Hostinger is configured.
7. **Then** the controlled-response proof repeats and must show a real refusal:
   - a signed relay whose state was never minted → 302 to the settings page with `reason=state` (the
     function answered 200 `{"ok":false,"reason":"state"}`; the redirect is the route's). A **401** here
     instead means the signature was not accepted at all, and it has **three** causes, not two: the two
     halves of the key disagree, the secret is not mounted, **or this host's clock has drifted more than
     five minutes** (§4.2, rows 3, 4 and 5). Read the Google-side line to tell them apart —
     `rejected unsigned request` for the first two, `relay timestamp outside the five-minute window` for
     the third. The 401 itself says nothing about the state;
   - a callback with a valid state but **no ticket cookie** → `reason=browser`, **the state NOT burned**,
     and eBay's code presented to the token endpoint and discarded. §5.5 changed the first half of that
     sentence and an operator reading the old one will chase a burn that no longer happens: a browser
     without the binding never reaches the state transaction at all, because the envelope the route signs
     for it has no `state` field. What it does reach is the disposal — one token request, nothing kept —
     which is the half that was always the point: the function is the only thing that can *spend* the
     code and so make the copy in the access log worthless, and a route that refused locally would leave
     the code alive for the rest of eBay's TTL. So the verification here is `reason=browser` with the
     state still `used: false`, plus `ebay callback dispose window=… spent=… refused=…` on the Google
     side within the minute. (Use a sandbox code that has already been spent, or expect the redemption to
     be refused — `refused=1` is the disposal working, not failing.)
   - an **unsigned** POST straight to the function → 401, and the state survives untouched.
8. **One log check on the Google side, before the first OAuth attempt.** The state is a Firestore
   document id, and Firestore **Data Access** audit logs record the full document path in
   `protoPayload.resourceName`. They are off by default and nothing in this work turns them on, but §5.4
   now claims the flow's values are out of the logs we control, so the claim is checked rather than
   assumed: IAM → Audit Logs → Cloud Firestore API on `eggcraft-studio` — `DATA_READ` and `DATA_WRITE`
   must be unticked. Record the answer in `docs/ebay-callback-platform-logging.md` beside the Cloud Run
   finding, whichever way it comes out (design §5.4, residual 5).
9. **Only then**, and under its own approval, the first sandbox OAuth connection. **Record the latency**
   of each attempt (Hostinger's access log has the request duration; the function's own line has its
   own): `RELAY_TIMEOUT_MS` in `app/ebay/callback/route.ts` is **45 s against the function's 120 s**, and
   45 is reasoned, not measured — above a cold start plus eBay's two round trips, below a request ceiling
   the platform has not told us about. Write the observed p99 into the constant's comment, and if
   Hostinger cuts the request off before 45 s, that ceiling is the number instead. Sandbox only: the
   production accepted URL is blocked until the callback is served by a Cloudflare Worker on
   `connect.nivadesk.app`, because eBay puts the code in the query string of the first hop and
   Hostinger's access log keeps it (measured; no disable, no redaction, retention and readers
   undisclosed — `docs/ebay-callback-platform-logging.md`). Nothing in §5.4 touches that hop.
10. **Which proxy header carries the client address, recorded here beside `RELAY_TIMEOUT_MS`.** §5.5's two
   admission counters — 30 a minute per address on `POST /ebay/ticket`, and 30 a minute per address on the
   callback's disposal — read the first entry of `x-forwarded-for`, and **nothing on this stack has yet
   established that Hostinger's front end overwrites that header rather than passing a client-supplied one
   through**. Until it does, treat the per-address counter as a courtesy limit only: a spoofed value evades
   it, and the bounds that actually hold are the per-process one (300 a minute on the sealing route) and
   the function's own six-a-minute disposal bucket. Check it once — send a request with an
   `X-Forwarded-For: 198.51.100.9` header of your own and read what the route counted — and write the
   answer here. If the header cannot be trusted, the per-address counter comes out and only the
   per-process one stays. **The address is never logged either way**, so this check is the only place it
   is ever looked at.

## 5. Rollback

The web deploy is a commit in the publish repository. Reverting it and pushing restores the previous
build; the eBay routes disappear with it. No server state is created by anything in this plan, so
there is nothing to unwind beyond the site itself. The Hostinger environment value can be left in place
after a rollback — it is inert without the route — or removed; the Secret Manager version is inert
without the marker file and the deploy.

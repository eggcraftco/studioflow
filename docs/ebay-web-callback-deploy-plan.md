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
| `app/ebay/callback/route.ts` | The accepted URL. Reads the browser nonce from a cookie and sends `code`, `state` and that nonce to the Cloud Function in a **signed POST body** — never a URL (design §5.4). It forwards no eBay parameter, refuses anything that is not a callback, and turns the function's JSON answer into the seller-facing redirect |
| `app/ebay/start/page.tsx`, `EbayStartContent.tsx` | The native hand-off: a signed-in browser claims the state, sets the cookie, redirects to eBay |
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
| 5 | A visit that is not a callback is refused at the edge | no `code` and no `error` → 302 to the settings page with one sentence, cookie cleared, nothing forwarded | **done, commit 46a98b8d** |
| 6 | Cookie flags | `Secure`, `SameSite=Lax`, `Path=/ebay/callback`, `Max-Age=600`, cleared on every callback | **verified in `lib/studioflow/ebay.ts`** |
| 7 | No secret in the client bundle | grep the **client** chunks for `EBAY_`, `CLIENT_SECRET`, `CERT`, `TOKEN_KEY`, `NIVADESK_EBAY_CALLBACK_KEY` and the literal `x-nivadesk-signature` | **the §5.4 pair is clean** on the current build (no `NIVADESK_EBAY_CALLBACK_KEY`, no `x-nivadesk-signature` in `.next/static`); the older four are re-run on the deploy build |
| 7b | The key was **not inlined at build time** | grep the **server** chunk for the route: the literal `process.env.NIVADESK_EBAY_CALLBACK_KEY` must still be **present**. If Next replaced it statically the name vanishes and the value takes its place, so check 7 would pass in exactly the failure case. `export const runtime = "nodejs"` in the route is what prevents it | **done** — `.next/server/app/ebay/callback/route.js` still contains the literal `process.env.NIVADESK_EBAY_CALLBACK_KEY` |
| 8 | The eBay screen degrades when the server has no eBay functions | open the settings section against production, where the callables do not exist: it must say the connector is not set up, not throw | run against the built app before the rsync |
| 9 | Nothing else changed on the site | diff the publish repository after the rsync, and expect only eBay files, the registry, the language tables and the build output | run at deploy time |
| 10 | `npm run test:relay` green | the route's HMAC signer matches the shared vector file the function's verifier is checked against, and the route's source assertions hold (`runtime = "nodejs"`, the decline branch, the in-handler `process.env` read, no `NEXT_PUBLIC_`, no early return on an absent nonce cookie) | **not runnable yet — the script and the vector file do not exist**; see below |

**Check 10 is the one gap in this list, and it is named rather than glossed.** Neither
`studioflow-web/scripts/check-ebay-relay-vectors.mjs` nor
`functions/test/fixtures/ebay-callback-signature-vectors.json` has been written. The blocker is a
decision, not effort: a committed vector file needs a fixed HMAC key, and a 64-hex value in a committed
file sits badly against this project's no-secret-values rule even when the value is meaningless — so the
owner has to say who mints that fixture key and where it is recorded. What has been done instead is
weaker in one specific way and no weaker in any other: the built route was driven against the **real**
`ebayOAuthCallback` handler under a key minted per run and written nowhere, and the canonical string
matched across the boundary. That proves the two halves agree today; it does not guard the agreement in
CI, which is exactly what check 10 exists to do. The canonical string, for whoever writes the file, is
`HMAC-SHA256(key, "v1." + timestampMs + "." + rawBodyBytes)` as lowercase hex.

**One property stated rather than fixed.** The nonce cookie is written by the browser with
`document.cookie`, so it is not `HttpOnly` and it cannot be: the value is returned to the client as JSON
and written from client JavaScript. It defends against a phished foreign seller, not against script
running on our own origin — and `Path=/ebay/callback` does **not** change that, because a path is a
request-matching rule, not a security boundary, and same-origin script under a matching path reads the
cookie freely. What is true: it lives 600 seconds, it is single use, and it is burned server-side.
Making it `HttpOnly` needs a server route to mint it, which is a change to the connect flow (the native
hand-off included), not to this deploy.

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
| **unset**, or shorter than 32 characters | anything | The route makes **no call at all**. The seller lands on `…&ebay=error&reason=unavailable` → "eBay did not complete the connection. Try again." The Hostinger log carries one line naming the variable and which check failed: `ebay callback relay: NIVADESK_EBAY_CALLBACK_KEY not configured` or `… shorter than 32 characters`. **No state is consumed — and that is the cost, not the comfort: see below.** |
| set | **unset**, or the marker not committed, or the functions not deployed | The route signs and POSTs. An unconfigured function answers **401** — deliberately identical to a wrong key, so the status cannot be used to ask whether the secret exists — and an undeployed one is simply unreachable. Seller sees `reason=unavailable`; Hostinger logs `ebay callback relay rid=<rid> status=401` or `… unreachable`; Google logs `ebay callback: EBAY_CALLBACK_KEY not configured` when the function is there — **once a minute per instance, not once per request** (§5.4: that line is reachable without a key, so it is throttled; look for its presence, never count it). **No state is consumed — the cost, not the comfort: see below.** |
| set | set, **different value** (a half-finished rotation) | The signature does not verify: 401, seller `reason=unavailable`, `ebay callback relay rid=<rid> status=401` on Hostinger and `ebay callback: rejected unsigned request` on Google. The rid is the only value in either line, and it is minted by the web side for exactly this trace. **No state is consumed — the cost, not the comfort: see below.** This is the realistic steady-state row: a rotation where Hostinger already has the new value and Secret Manager does not. |

The pattern is the point: **every partial configuration fails closed for the connection.** No code is
exchanged, no token is written, and nothing on the seller's screen is more specific than one sentence.

**What it does not do is keep §5's browser binding, and this plan used to say the opposite.** That
defence is the burn (design §5.4, *The burn*): a shaped callback always POSTs, cookie or no cookie,
precisely so the state is consumed at the moment of consent, whoever presented it. In every row above the
POST is either never made or never authenticated, so **the state is not burned** — and an unburned state
is the damage, not the safety. Each consent that lands in a key outage leaves a live, unused
`ebayConnectStates` document for the rest of its ten-minute TTL, while eBay's `code` for that same consent
is written verbatim into Hostinger's access log (measured, with no redaction and no disable —
`docs/ebay-callback-platform-logging.md`). §5's attacker is a workspace owner who minted the state and
holds its nonce in their own browser; against a live state, the code is the only thing they were missing.
Ten minutes of that is a much smaller window than the design's residual 1, but it is the same collapse,
reached by configuration rather than by a code change.

**So the operator action, and it is not "wait for the fix to land".** Treat a key outage — unset, short,
or the two halves disagreeing — as a security event as well as downtime:

1. Fix the key (both halves, same value).
2. **Before** restoring service, expire the states minted during the outage: every `ebayConnectStates`
   document with `used == false` and `expiresAt` in the future, deleted or marked `used: true`. They are
   worthless to their owners anyway — the seller's remedy for any failed attempt is to press Connect
   again, which mints a fresh state and a fresh nonce.
3. If step 2 is awkward, the TTL does it for you: wait ten minutes after the **last** failed attempt
   before telling sellers to retry. Nothing older than that can still be presented.

Nothing here is live today — no function is deployed and no genuine code or state exists yet — so this is
a rule for the rollout and for every later rotation, not an incident.

### 4.3 The order itself

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
   §5.4 signed POST.
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
     settings page with `reason=unavailable`**, and a Hostinger log line
     `ebay callback relay rid=<rid> unreachable`. It is **not** a redirect to the Cloud Function: the
     browser never meets the function host under §5.4, and until the connector's functions are deployed
     the POST simply has nowhere to land.
   - `GET https://nivadesk.app/ebay/start` without a session → the sign-in path, never a stack trace.
6. **Commit `functions/.ebay-secrets-ready` naming all five secrets**, then deploy **the connector's own
   functions** (`ebayOAuthCallback`, `beginEbayConnect`, `claimEbayConnectState` and the rest) by name — a
   separate approval, and not before the dependency soak closes. Without the marker `EBAY_RUNTIME` is
   empty, nothing is mounted, `EBAY_CALLBACK_KEY` reads as `""`, and every callback answers 401 →
   `reason=unavailable` forever, however correctly Hostinger is configured.
7. **Then** the controlled-response proof repeats and must show a real refusal:
   - a signed relay whose state was never minted → 302 to the settings page with `reason=state` (the
     function answered 200 `{"ok":false,"reason":"state"}`; the redirect is the route's). A **401** here
     instead means the signature was not accepted at all — the two halves of the key disagree, or the
     secret is not mounted (§4.2, rows 3 and 4) — and says nothing about the state;
   - a callback with a valid state but **no nonce cookie** → `reason=browser`, **and the state burned**.
     This still holds under §5.4 and is the point of it: the route posts `nonce: ""` rather than refusing,
     precisely so the state is consumed at the moment of consent. A route that refused an absent cookie
     locally would leave the state alive for its full ten minutes and hand the §5 attacker a second try.
   - an **unsigned** POST straight to the function → 401, and the state survives untouched.
8. **One log check on the Google side, before the first OAuth attempt.** The state is a Firestore
   document id, and Firestore **Data Access** audit logs record the full document path in
   `protoPayload.resourceName`. They are off by default and nothing in this work turns them on, but §5.4
   now claims the flow's values are out of the logs we control, so the claim is checked rather than
   assumed: IAM → Audit Logs → Cloud Firestore API on `eggcraft-studio` — `DATA_READ` and `DATA_WRITE`
   must be unticked. Record the answer in `docs/ebay-callback-platform-logging.md` beside the Cloud Run
   finding, whichever way it comes out (design §5.4, residual 5).
9. **Only then**, and under its own approval, the first sandbox OAuth connection. Sandbox only: the
   production accepted URL is blocked until the callback is served by a Cloudflare Worker on
   `connect.nivadesk.app`, because eBay puts the code in the query string of the first hop and
   Hostinger's access log keeps it (measured; no disable, no redaction, retention and readers
   undisclosed — `docs/ebay-callback-platform-logging.md`). Nothing in §5.4 touches that hop.

## 5. Rollback

The web deploy is a commit in the publish repository. Reverting it and pushing restores the previous
build; the eBay routes disappear with it. No server state is created by anything in this plan, so
there is nothing to unwind beyond the site itself. The Hostinger environment value can be left in place
after a rollback — it is inert without the route — or removed; the Secret Manager version is inert
without the marker file and the deploy.

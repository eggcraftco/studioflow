# Deploying the eBay callback route to production

Written 6 September 2026. Nothing here has been performed. The plan covers one thing only: putting
`nivadesk.app/ebay/callback` and `nivadesk.app/ebay/start` on the live site so that a sandbox OAuth
attempt can be tested later, under a separate approval.

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
prefix, and it is the first server-only env var this web tree has ever read — see check 10 and step 3.

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
| 4 | The route puts no value in a URL | it builds a JSON body from `code`, `state` and the cookie nonce and POSTs it signed; `NextResponse.redirect` only ever receives a module constant plus `ebay`/`reason` from a fixed vocabulary | verify after the §5.4 rewrite |
| 5 | A visit that is not a callback is refused at the edge | no `code` and no `error` → 302 to the settings page with one sentence, cookie cleared, nothing forwarded | **done, commit 46a98b8d** |
| 6 | Cookie flags | `Secure`, `SameSite=Lax`, `Path=/ebay/callback`, `Max-Age=600`, cleared on every callback | **verified in `lib/studioflow/ebay.ts`** |
| 7 | No secret in the client bundle | grep the **client** chunks for `EBAY_`, `CLIENT_SECRET`, `CERT`, `TOKEN_KEY`, `NIVADESK_EBAY_CALLBACK_KEY` and the literal `x-nivadesk-signature` | run at build time |
| 7b | The key was **not inlined at build time** | grep the **server** chunk for the route: the literal `process.env.NIVADESK_EBAY_CALLBACK_KEY` must still be **present**. If Next replaced it statically the name vanishes and the value takes its place, so check 7 would pass in exactly the failure case. `export const runtime = "nodejs"` in the route is what prevents it | run at build time |
| 8 | The eBay screen degrades when the server has no eBay functions | open the settings section against production, where the callables do not exist: it must say the connector is not set up, not throw | run against the built app before the rsync |
| 9 | Nothing else changed on the site | diff the publish repository after the rsync, and expect only eBay files, the registry, the language tables and the build output | run at deploy time |
| 10 | `npm run test:relay` green | the route's HMAC signer matches the shared vector file the function's verifier is checked against, and the route's source assertions hold (`runtime = "nodejs"`, the decline branch, the in-handler `process.env` read, no `NEXT_PUBLIC_`, no early return on an absent nonce cookie) | run before the build |

**One property stated rather than fixed.** The nonce cookie is written by the browser with
`document.cookie`, so it is not `HttpOnly` and it cannot be: the value is returned to the client as JSON
and written from client JavaScript. It defends against a phished foreign seller, not against script
running on our own origin — and `Path=/ebay/callback` does **not** change that, because a path is a
request-matching rule, not a security boundary, and same-origin script under a matching path reads the
cookie freely. What is true: it lives 600 seconds, it is single use, and it is burned server-side.
Making it `HttpOnly` needs a server route to mint it, which is a change to the connect flow (the native
hand-off included), not to this deploy.

## 4. Order of operations

1. **Sandbox RuName** registered in the eBay portal with the accepted and declined URLs (operator).
2. **The shared key exists on both sides first.** The operator mints 32 random bytes as hex
   (`openssl rand -hex 32`), sets it as `EBAY_CALLBACK_KEY` in Secret Manager granted to
   `ebay-connector@` only, and sets the same value in Hostinger as `NIVADESK_EBAY_CALLBACK_KEY` (no
   `NEXT_PUBLIC_` prefix). The value goes in no file, no commit and no log.
3. **Web deploy, Round 166** — build from the eBay worktree, rsync, commit, push, wait for Hostinger,
   confirm the chunk hash changed.
4. **Prove the runtime environment**, immediately and before anything else depends on it. Every
   environment value this web tree reads today is `NEXT_PUBLIC_*`, inlined at build; this one is not, and
   the project's own precedent runs the wrong way (the web-push VAPID key had to go into Hostinger's
   *build* environment). Request
   `https://nivadesk.app/ebay/callback?code=probe&state=aaaaaaaaaaaaaaaaaaaaaa` and read the Hostinger
   log:
   - it must **not** say `ebay callback relay: NIVADESK_EBAY_CALLBACK_KEY not configured`;
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
   empty, nothing is mounted, and every callback answers 401 → `reason=unavailable` forever.
7. **Then** the controlled-response proof repeats and must show a real refusal:
   - a callback with a state that was never minted → 302 to the settings page with `reason=state`
     (the function answered 200 `{"ok":false,"reason":"state"}`; the redirect is the route's);
   - a callback with a valid state but **no nonce cookie** → `reason=browser`, **and the state burned**.
     This still holds under §5.4 and is the point of it: the route posts `nonce: ""` rather than refusing,
     precisely so the state is consumed at the moment of consent. A route that refused an absent cookie
     locally would leave the state alive for its full ten minutes and hand the §5 attacker a second try.
   - an **unsigned** POST straight to the function → 401, and the state survives untouched.
8. **Only then**, and under its own approval, the first sandbox OAuth connection.

## 5. Rollback

The web deploy is a commit in the publish repository. Reverting it and pushing restores the previous
build; the eBay routes disappear with it. No server state is created by anything in this plan, so
there is nothing to unwind beyond the site itself. The Hostinger environment value can be left in place
after a rollback — it is inert without the route — or removed; the Secret Manager version is inert
without the marker file and the deploy.

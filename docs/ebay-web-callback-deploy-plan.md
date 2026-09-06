# Deploying the eBay callback route to production

Written 6 September 2026. Nothing here has been performed. The plan covers one thing only: putting
`nivadesk.app/ebay/callback` and `nivadesk.app/ebay/start` on the live site so that a sandbox OAuth
attempt can be tested later, under a separate approval.

## 1. What actually ships

From `ebay-connector`, the web half only:

| Path | What it is |
|---|---|
| `app/ebay/callback/route.ts` | The accepted URL. Adds the browser nonce from a cookie, forwards every eBay parameter untouched to the Cloud Function, refuses anything that is not a callback |
| `app/ebay/start/page.tsx`, `EbayStartContent.tsx` | The native hand-off: a signed-in browser claims the state, sets the cookie, redirects to eBay |
| `app/settings/EbayIntegrationSection.tsx` and the registry, language and card changes | The eBay screen and the grid card |

The server half is **not** part of this deploy. Cloud Functions ship by name, and no eBay function is
on that list.

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
| 4 | The route reads no eBay parameter | it copies every parameter except `nonce`, and sets `nonce` only from the cookie, never from the query | **done by construction** |
| 5 | A visit that is not a callback is refused at the edge | no `code` and no `error` → 302 to the settings page with one sentence, cookie cleared, nothing forwarded | **done, commit 46a98b8d** |
| 6 | Cookie flags | `Secure`, `SameSite=Lax`, `Path=/ebay/callback`, `Max-Age=600`, cleared on every callback | **verified in `lib/studioflow/ebay.ts`** |
| 7 | No secret in the client bundle | grep the built chunks for `EBAY_`, `CLIENT_SECRET`, `CERT`, `TOKEN_KEY` | run at build time |
| 8 | The eBay screen degrades when the server has no eBay functions | open the settings section against production, where the callables do not exist: it must say the connector is not set up, not throw | run against the built app before the rsync |
| 9 | Nothing else changed on the site | diff the publish repository after the rsync, and expect only eBay files, the registry, the language tables and the build output | run at deploy time |

**One property stated rather than fixed.** The nonce cookie is written by the browser with
`document.cookie`, so it is not `HttpOnly`. It defends against a phished foreign seller, not against
script running on our own origin, and it lives 600 seconds, is scoped to the callback path, is single
use and is burned server-side. Making it `HttpOnly` needs a server route to mint it, which is a
change to the connect flow, not to this deploy.

## 4. Order of operations

1. **Sandbox RuName** registered in the eBay portal with the accepted and declined URLs (operator).
2. **Web deploy, Round 166** — build from the eBay worktree, rsync, commit, push, wait for Hostinger,
   confirm the chunk hash changed.
3. **Proof that the callback is live and fail-closed**, before any OAuth attempt:
   - `GET https://nivadesk.app/ebay/callback` → **302** to `…/settings?section=ebay&ebay=error&reason=missing_code`. Not 404, not 500, and no forward.
   - `GET https://nivadesk.app/ebay/callback?state=made-up&code=made-up` → 302 to the Cloud Function.
     Until the connector's functions are deployed this lands on a Google 404, which is why the test
     below is ordered after them.
   - `GET https://nivadesk.app/ebay/start` without a session → the sign-in path, never a stack trace.
4. **The connector's own functions** (`ebayOAuthCallback`, `beginEbayConnect`, `claimEbayConnectState`
   and the rest) deployed by name — a separate approval, and not before the dependency soak closes.
5. **Then** the controlled-response proof repeats and must show a real refusal:
   - a callback with a state that was never minted → 302 to the settings page with `reason=state`,
   - a callback with a valid state but no nonce cookie → `reason=browser`, and the state burned.
6. **Only then**, and under its own approval, the first sandbox OAuth connection.

## 5. Rollback

The web deploy is a commit in the publish repository. Reverting it and pushing restores the previous
build; the eBay routes disappear with it. No server state is created by anything in this plan, so
there is nothing to unwind beyond the site itself.

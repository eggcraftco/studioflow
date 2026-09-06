# Round 166 — the eBay web half on nivadesk.app

Deployed 6 September 2026 under the operator's approval, web only. Times in UTC.

## What went out

| Item | Value |
|---|---|
| Source | `ebay-connector` worktree, `studioflow-web` |
| Files | **12, all eBay** — the callback route, the start hand-off (2 files), the settings section, `lib/studioflow/ebay.ts`, the settings page wiring, the order screen's restricted-address reveal (2 files), the guide entries, the integration registry, the language table, one line in `lib/studioflow/orders.ts` |
| Not touched | Cloud Functions, Firestore rules, the lockfile (verified byte-identical to the deploy branch, so the Round 165 dependency remediation is intact), and every non-eBay page |
| Publish repository | `eggcraftco/studioflow` `main`, commit `0192411` "Round 166: the eBay callback, the start hand-off and the settings screen" |
| Pre-push proof | `npm ci` + `npm run build` on the publish tree, exit 0; the build manifest lists `/ebay/callback/route` and `/ebay/start/page`, the callback as **ƒ (dynamic)** so nothing can cache it |
| Push | 13:27:11 |
| Live | `/ebay/callback` answered 302 instead of 404 by 13:30 |

## The five checks the operator asked for

| # | Check | Result |
|---|---|---|
| 1 | `/ebay/callback` no longer 404 | **Pass** — 302 |
| 2 | A callback with no state and no code is refused fail-closed | **Pass** — `/ebay/callback`, `?state=made-up-state` and `?foo=bar` all answer `302 → /settings?section=ebay&ebay=error&reason=missing_code`. Nothing is forwarded to the Cloud Function, so a scan cannot spend an invocation and cannot reach the connector at all |
| 3 | The cancel URL works | **Pass** — `/settings?section=ebay&ebay=cancelled` answers 200, renders the eBay panel, and the app clears the parameter from the address bar after reading it |
| 4 | Sensitive query parameters are not logged | **Pass in our code, with one platform caveat below** |
| 5 | Settings does not crash while the eBay backend does not exist | **Pass** — `/settings?section=ebay` renders the panel, the honest scope line, the sandbox note and the Connect button, with **no console errors**. The connector's callables do not exist in production and the page does not try to call one on load |

Extra evidence from the same run: a callback carrying `error=access_denied` is forwarded (correct — that is a real eBay decline), the response is `cache-control: no-cache, no-store, must-revalidate`, and every callback clears the nonce cookie with `Path=/ebay/callback; Max-Age=0; Secure; SameSite=lax`.

## The one thing check 4 does not cover

Our code logs no query parameter anywhere: the route has no logging at all, and the Cloud Function logs only truncated error messages. But the **platforms** record request URLs. The browser is redirected to
`…/ebayOAuthCallback?code=…&state=…&nonce=…`, and Cloud Run writes `httpRequest.requestUrl` — query string included — into Cloud Logging. The same is true of the first hop in Hostinger's access log.

What that exposes: an authorization code that is single-use and short-lived, and the **browser-binding nonce**, which is the value that stops a phished seller's consent landing in someone else's workspace. Anyone who can read the project's logs can read both.

The fix, if the operator wants it, is to stop putting them in a URL: the web route can POST the parameters to the function server-side and return the function's redirect, so neither platform's access log ever sees them. That is a change to the connect flow and to the function's own reading of `req.query`, so it is proposed here rather than made. **It should be decided before the first real OAuth connection**, because that is the first time a genuine code and nonce exist.

## Rollback

`git revert 0192411` in the publish repository and push; Hostinger rebuilds in two to four minutes and the eBay routes disappear. No server state is created by anything in this round.

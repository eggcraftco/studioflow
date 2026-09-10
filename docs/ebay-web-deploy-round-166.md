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

The fix, if the operator wants it, is to stop putting them in a URL: the web route can POST the parameters to the function server-side and return the function's redirect, so the Cloud Run access log never sees them. (That sentence said *neither* platform's when it was written on the day, and that was wrong: eBay's redirect still delivers `code` and `state` to the first hop in a query string, and no change of ours touches it. See the section below.) That is a change to the connect flow and to the function's own reading of `req.query`, so it is proposed here rather than made. **It should be decided before the first real OAuth connection**, because that is the first time a genuine code and nonce exist.

**Decided (6 Sep 2026):** taken, and specified as §5.4 of `docs/ebay-connector-design.md` — a signed POST under a shared `EBAY_CALLBACK_KEY`, the function answering JSON and the web route performing the redirect. The residual this round could not remove — the code still landing in Hostinger's own access log on the first hop — is recorded there as residual 1.

## Where check 4's finding stands, later the same day

The finding has **two hops in it**, and only one of them is being closed by this work. They are written
separately here because collapsing them into a single "fixed" is the mistake that would matter.

**The Google side is being closed by this change.** The callback route and `ebayOAuthCallback` were both
rewritten on the `ebay-connector` branch to design §5.4: the seller's browser now stops on
`nivadesk.app`, and the code, the state and the nonce travel onward in a signed POST body instead of a
redirect URL. Cloud Run records `httpRequest.requestUrl`, and after this change that URL is the bare
function endpoint with no query string; Cloud Run records neither request headers nor bodies. So the
specific exposure this round reported — *our own redirect publishing an authorization code and the
browser-binding nonce into Cloud Logging on `eggcraft-studio`* — is removed by the design change.

**By the deploy, not by the commit.** What is running on nivadesk.app at this moment is still Round
166's redirect-forwarding route. The replacement needs a further web deploy and the connector's own
function deploy, both of which are gated and neither of which has been performed
(`docs/ebay-web-callback-deploy-plan.md` §4). Until then, live behaviour is unchanged. What *has* also
not happened is any real OAuth connection: no sandbox seller has consented, so no genuine code and no
genuine nonce has yet travelled either hop. That is why the change had to be decided before the first
connection rather than after it.

**The Hostinger first hop is a separate question, and it is open.** eBay's RuName has one accepted URL
and eBay decides how it calls it: a top-level browser GET carrying `code` and `state` in the query
string. Nothing in §5.4 touches that hop, and nothing can, short of eBay offering a different redirect.
It is recorded as §5.4 residual 1, and it is being worked separately in
`docs/ebay-callback-platform-logging.md`, which is where that investigation lives.

**Nothing here says OAuth values have stopped appearing in platform logs, and this round must not be
read as saying it.** The opposite is measured fact: three synthetic requests sent to production at
13:39 UTC on 6 September appear in hPanel's access-log view with their query strings verbatim, code and
all. What Hostinger's own answers do **not** establish is everything behind that view — retention
beyond the seven days the filter offers ("not established"), who inside Hostinger can read it ("not
disclosed"), and whether the entries are copied to any other system ("cannot confirm or deny") — and
they confirm there is no setting to disable or redact it. A written answer from a human agent on those
three points is outstanding. So the first hop is not "clean" and is not "unknown" either; it is
*known to record the code and the state, for an undocumented period, to an undocumented audience*, and
the operator's decision on that (sandbox accepted on the record, production blocked until the callback
is served from `connect.nivadesk.app`) is in the platform-logging note, not here.

This round's check 4 therefore keeps its original result: **pass in our code, with the platform caveat**
— the Google half of the caveat is being answered by §5.4, and the Hostinger half is open.

## Rollback

`git revert 0192411` in the publish repository and push; Hostinger rebuilds in two to four minutes and the eBay routes disappear. No server state is created by anything in this round.

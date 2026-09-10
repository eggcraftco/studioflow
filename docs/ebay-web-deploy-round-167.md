# Round 167 — the ticket contract on nivadesk.app

Deployed 6 September 2026, 22:39 UTC, web only, under the operator's approval and a frozen scope.

## What went out

| Item | Value |
|---|---|
| Files | **10, all eBay**: the callback route, the new ticket route, the start hand-off, the settings section, and six modules under `lib/studioflow/` (`ebay`, `ebayAdmission`, `ebayFlow`, `ebayScreenRules`, `ebayTicket`, `ebayTicketSpend`) |
| Deliberately left behind | `package.json` and the two `scripts/` checkers. The package diff is two test-script entries and **no dependency change**, verified by comparing both dependency maps; CI runs those checkers from the branch, and production does not need them |
| Not touched | Cloud Functions, Firestore rules, any shared backend, any dependency, and the production Worker |
| Publish commit | `3705865` "Round 167: the eBay callback moves to the signed browser-binding ticket" |
| Pre-push proof | `npm run build` on the publish tree, exit 0; the route manifest lists `/ebay/callback/route`, `/ebay/start/page` and `/ebay/ticket/route` |
| Live | `POST /ebay/ticket` answered instead of 404 by 22:42 UTC |

## The smoke tests

| Check | Result |
|---|---|
| The callback uses the new contract | **Pass** — `/ebay/ticket` exists and answers; the callback's refusals now carry the ticket contract's vocabulary |
| `POST /ebay/ticket` with no body | **400** — shape refused before anything |
| `POST /ebay/ticket`, wrong method | **405** |
| A callback with **no** ticket cookie | **302** to the settings page, nothing signed |
| A callback with a **forged** ticket cookie | **302**, nothing signed |
| A callback with an **expired** ticket shape | **302**, nothing signed |
| A decline | **302** to `ebay=cancelled`, and the backend is not called |
| Settings while the eBay functions are not live | **200**, the eBay section renders |
| `/ebay/start`, the cancel landing, `/`, `/orders`, `/bank` | **200** each — no regression |

**One honest limit on what this proves.** `NIVADESK_EBAY_CALLBACK_KEY` is not in the Hostinger
environment, so the ticket route cannot verify or seal and answers **503**, and the callback route
cannot sign a dispose envelope either — every callback path lands on `reason=unavailable`. That is
the designed fail-closed behaviour and it is what the smoke measured. It also means **production has
not exercised ticket verification itself**: a forged ticket and a valid one are both refused at the
missing-key step. The verification logic, the replay refusal and the spend-before-signing rule are
proven by the relay and regression suites, which pass, and they will be proven in production the
moment the key is configured — which is part of the functions deploy, not this round.

## Logs

| Surface | Result |
|---|---|
| Hostinger runtime (application) log | **clean** — searched for the synthetic code, the state and the ticket string; none appears. The route logs class words only |
| Hostinger access log | The **ticket and the nonce cannot reach it**: both travel in cookies, and the request line carries only the URL. The `code` and `state` still appear when eBay puts them in the query, which is the accepted residual recorded in `docs/ebay-callback-platform-logging.md` and unchanged by this round |
| Cloud Run | nothing — no request reached a function, because none was signed |

## What this round does not unblock

The first sandbox OAuth still needs the eBay functions deployed, and that waits for the dependency
soak to close at 04:28 UTC on 7 September and a separate approval.

**Production remains blocked on two gates, now both written down**: the platform-logging residual
(the callback must move to a Worker on `connect.nivadesk.app`, with the seven Cloudflare surfaces
proven empty) and the spoofable-proxy-header denial of service, which is accepted for sandbox and
blocks the production RuName until the edge header this stack actually trusts is identified and
spoofing is prevented.

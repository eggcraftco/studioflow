# Deploying the eBay functions — the order the operator set

Written 6 September 2026, before the soak closes. **Nothing here has been done.** No secret exists,
no function is deployed, the connector switch is off and the marker file is absent. Each step below
is executed only after the previous one has been verified, and only on the operator's approval.

## Preconditions

| # | Precondition | State |
|---|---|---|
| 1 | The dependency soak closes | **2026-09-07 04:28:31 UTC**, a full twenty-four hours from its start. The closing report runs at 05:41 UTC, after the window, and the whole soak is answered by one retrospective query |
| 2 | The soak's closing readback is clean | pending the above |
| 3 | The operator approves the functions deploy separately | pending |
| 4 | Round 167 is live and its smoke is clean | **done**, `docs/ebay-web-deploy-round-167.md` |

## Step 1 — the secrets, without exposing a value

Five secrets, all named in `functions/index.js:137`. Two are generated here and never printed; three
carry values only the operator has.

| Secret | Where the value comes from |
|---|---|
| `EBAY_CLIENT_ID` | the sandbox keyset's App ID — not a credential, but it lives with the others |
| `EBAY_CLIENT_SECRET` | the sandbox keyset's Cert ID — **the operator types this; it is never printed, logged or written down** |
| `EBAY_TOKEN_KEY` | generated here: 32 random bytes, hex |
| `EBAY_HASH_KEY` | generated here: 32 random bytes, hex, and deliberately not derived from the token key |
| `EBAY_CALLBACK_KEY` | generated here: the relay key the web route and the function share |

Generated the way the tracking token was rotated, so no value reaches a terminal or a transcript:

```bash
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create EBAY_TOKEN_KEY \
  --data-file=- --replication-policy=automatic --project eggcraft-studio
```

The operator's two are created from a file they write and delete, or by pasting into
`gcloud secrets create … --data-file=-` in their own terminal. The assistant does not handle them.

Then the marker that turns the wiring on: `functions/.ebay-secrets-ready` must exist on the deploying
machine. It is deliberately not committed, so it cannot arrive by accident.

## Step 2 — deploy only the frozen sandbox set

Seventeen functions, by name, from the repository root, never `--only functions`:

```
beginEbayConnect, claimEbayConnectState, disconnectEbay, ebayEventWorker, ebayNotifications,
ebayOAuthCallback, getEbayConnections, previewEbayImport, reconcileEbayConnections,
reconcileEbayConnectionsNightly, reconcileEbayDeletions, retryEbayImportFailures,
revealRestrictedCustomer, runEbayImport, syncEbayNow, updateEbayConnectionSettings,
verifyEbayConnection
```

Rollback revisions are recorded before the deploy, exactly as batches B0 to B5.3 were.

## Step 3 — revisions ready, and nothing new in the logs

Every one of the seventeen reports a new revision and serves; then a fifteen-minute watch over the
whole project for `severity>=ERROR` and `httpRequest.status>=500`, with a positive-control query so an
empty result cannot be mistaken for a clean one.

## Step 4 — the callback function itself

| Check | Expected |
|---|---|
| `POST` is the only method | GET, PUT, DELETE, PATCH, HEAD, OPTIONS → **405**, no state touched, no body read |
| Unauthenticated relay POST | **401**, bare body, no reason, no request id |
| Wrong relay key | **401**, byte-identical to the unauthenticated answer |
| Either of those | refused **before** any state document is read or written |
| Logs | no code, no state, no nonce, no ticket, no body value, on any path including errors |
| Replay and a consumed state | fail closed, and the state stays burned |

The commands are the matrix in `docs/ebay-connector-design.md`; the key is read into a shell variable
and never echoed.

## Step 5 — only then, the relay key into Hostinger

`NIVADESK_EBAY_CALLBACK_KEY`, the same value as `EBAY_CALLBACK_KEY`, into the Hostinger build
environment. **Deliberately last**: while it is absent the web route fails closed with a 503 and no
seller can start a flow, which is the state Round 167 shipped in on purpose.

## Step 6 — the web half, exercised for real

The ticket route stops answering 503, a ticket is minted and sealed, and — the thing production has
never yet done — a **valid** ticket is verified in production rather than refused at the missing-key
step. A forged one is still refused, and a consumed one cannot sign twice.

## Step 7 — the first sandbox OAuth, recorded on its own

A separate end-to-end record: the consent, the callback, what was written, what the seller saw, and
what the logs did and did not contain.

## What stays shut regardless

No production RuName. No Cloudflare Worker deployment. No production eBay credential. Production
OAuth remains blocked behind two gates that this plan does not touch: the platform-logging residual
and the spoofable-proxy-header denial of service. Hostinger's human-support answer, when it comes, is
evidence for the first of those and does not by itself open anything.

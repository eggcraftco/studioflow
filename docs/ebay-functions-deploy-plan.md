# Deploying the eBay functions — the order the operator set

Written 6 September 2026, verified against the live project on 7 September at 01:1x UTC, before the
soak closed. **Nothing here has been done.** No secret exists, no service exists, the connector
switch is off and the marker file is absent. Each step runs only after the previous one is verified,
and only on the operator's separate approval.

Everything below that says "verified" was read from the live project read-only, names only. No value
of any secret was read, printed or written down.

## Preconditions

| # | Precondition | State |
|---|---|---|
| 1 | The dependency soak closes | **DONE.** The window ended 2026-09-07 04:28:31 UTC, a full twenty-four hours from its start; the 05:41 UTC job is the closing *report*, not the gate |
| 2 | The soak's closing readback is clean | **DONE — PASS.** Read retrospectively at 04:29:53 UTC over the whole window: 0 errors, 0 5xx, 1151 requests as the positive control, 19/19 scheduler jobs on time, 0 query gaps; re-read project-wide with no service filter, also 0. All seven 4xx identified by name. `docs/security/evidence/amazon/functions-deploy-2026-09-06.md` |
| 3 | The operator approves the functions deploy separately | pending |
| 4 | Round 167 is live and its smoke is clean | **done**, `docs/ebay-web-deploy-round-167.md` |
| 5 | **The runtime service account exists** | **MISSING — see below. This blocks step 2 outright** |

### Precondition 5, found on 7 September and not previously recorded

`functions/index.js:139` pins a runtime identity for all seventeen functions:

```js
const EBAY_SERVICE_ACCOUNT = "ebay-connector@eggcraft-studio.iam.gserviceaccount.com";
const EBAY_RUNTIME = EBAY_SECRETS_READY ? { secrets: EBAY_SECRET_PARAMS, serviceAccount: EBAY_SERVICE_ACCOUNT } : {};
```

That account **does not exist**: `gcloud iam service-accounts describe` returns `NOT_FOUND`, and the
project IAM policy contains no binding for it. So the binding only comes into force at the same
moment the marker file does — and then every one of the seventeen deploys fails on an unknown runtime
identity, or fails halfway and leaves partial services behind.

Creating it, and granting it `roles/secretmanager.secretAccessor` on the five secrets plus the
Firestore access the connector needs, and granting the deployer `iam.serviceAccounts.actAs` on it,
are **IAM changes**. They were not made: the standing instruction for this window forbids IAM
changes. They belong to the morning approval, before step 1, not after it.

## Step 1 — the secrets, without exposing a value

Five secrets, named at `functions/index.js:137`. **Verified: all five are ABSENT from Secret Manager
today.** Two are generated on the machine and never printed; three carry values only the operator has.

| Secret | Where the value comes from |
|---|---|
| `EBAY_CLIENT_ID` | the sandbox keyset's App ID — not a credential, but it lives with the others |
| `EBAY_CLIENT_SECRET` | the sandbox keyset's Cert ID — **the operator types this; it is never printed, logged or written down** |
| `EBAY_TOKEN_KEY` | generated here: 32 random bytes, hex |
| `EBAY_HASH_KEY` | generated here: 32 random bytes, hex, deliberately not derived from the token key |
| `EBAY_CALLBACK_KEY` | generated here: the relay key the web route and the function share |

Generated the way the tracking token was rotated, so no value reaches a terminal or a transcript:

```bash
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create EBAY_TOKEN_KEY \
  --data-file=- --replication-policy=user-managed --locations=europe-west2 \
  --project eggcraft-studio
```

The operator's two are created from a file they write and delete, or by pasting into
`gcloud secrets create … --data-file=-` in their own terminal. The assistant does not handle them.

Then the marker that turns the wiring on: `functions/.ebay-secrets-ready` on the deploying machine.
It is deliberately not committed, so it cannot arrive by accident. **Do not create it until
precondition 5 is closed** — it is the switch that arms the missing service-account binding.

## Step 2 — deploy only the frozen sandbox set

Seventeen functions, by name, never `--only functions`. **Verified against source: each name is
exported exactly once, and the seventeen are the complete eBay surface** (sixteen eBay-named plus
`revealRestrictedCustomer`, the restricted-PII reveal, which belongs to the connector).

| Trigger | Functions | What deploying it starts |
|---|---|---|
| `onCall` × 11 | beginEbayConnect, claimEbayConnectState, getEbayConnections, verifyEbayConnection, updateEbayConnectionSettings, disconnectEbay, syncEbayNow, previewEbayImport, runEbayImport, retryEbayImportFailures, revealRestrictedCustomer | nothing until called |
| `onRequest` × 2 | ebayOAuthCallback, ebayNotifications | public endpoints, live the moment they deploy |
| `onSchedule` × 3 | reconcileEbayConnections (every 15 min), reconcileEbayDeletions (every 10 min), reconcileEbayConnectionsNightly (daily 02:40, Europe/London) | **three new Cloud Scheduler jobs that start firing immediately** |
| `onTaskDispatched` × 1 | ebayEventWorker | **a new Cloud Tasks queue `ebayEventWorker`** (today the project has only `commerceEventWorker`) |

```bash
firebase deploy --project eggcraft-studio --only \
"functions:beginEbayConnect,functions:claimEbayConnectState,functions:disconnectEbay,\
functions:ebayEventWorker,functions:ebayNotifications,functions:ebayOAuthCallback,\
functions:getEbayConnections,functions:previewEbayImport,functions:reconcileEbayConnections,\
functions:reconcileEbayConnectionsNightly,functions:reconcileEbayDeletions,\
functions:retryEbayImportFailures,functions:revealRestrictedCustomer,functions:runEbayImport,\
functions:syncEbayNow,functions:updateEbayConnectionSettings,functions:verifyEbayConnection"
```

The deploy ships with the connector switch **off**: `NIVADESK_EBAY_CONNECTOR` is unset, so
`beginEbayConnect` refuses, the callback answers `reason=disabled`, both sweeps return before reading
a row, and the queue records order tasks as skipped — while account-deletion compliance still runs.
Turning that switch on is its own approval, and it is the gate step 7 actually waits on.

### Rollback — deletion, not revert

**Verified: none of the seventeen exists in Cloud Run today.** A project-wide listing of 421 services
in `europe-west2` contains zero whose name matches `ebay`, and no `revealrestrictedcustomer`; the same
listing finds `track17webhook-00122-zux` as a positive control, so the absence is real and not a
failed match.

So there is no previous revision to roll back to, and rollback is deletion:

```bash
# 1. the functions
firebase functions:delete <name> --project eggcraft-studio --region europe-west2 --force
# 2. the three scheduler jobs the schedules created — a deleted function leaves them firing at a 404
gcloud scheduler jobs list --project eggcraft-studio --location europe-west2 | grep -i ebay
gcloud scheduler jobs delete <job> --project eggcraft-studio --location europe-west2
# 3. the queue the task worker created
gcloud tasks queues delete ebayEventWorker --project eggcraft-studio --location europe-west2
```

The good news in that fact: because all seventeen are new, no existing function's traffic can be
broken by this deploy. The blast radius is the three new schedules, the new queue and the two new
public endpoints — not the other 421 services.

## Step 3 — revisions ready, and nothing new in the logs

Every one of the seventeen reports a new revision and serves; then a fifteen-minute watch over the
whole project, with a positive control so an empty result cannot be mistaken for a clean one.

```bash
# each of the 17 ready and serving
gcloud run services list --project eggcraft-studio --region europe-west2 \
  --format='value(metadata.name,status.latestReadyRevisionName,status.conditions[0].status)' | grep -iE 'ebay|revealrestricted'
# errors and 5xx, project-wide, since the deploy started
gcloud logging read 'resource.type="cloud_run_revision" AND (severity>=ERROR OR httpRequest.status>=500) AND timestamp>="<T0>"' \
  --project eggcraft-studio --limit 200 --format='value(timestamp,resource.labels.service_name,severity)'
# positive control: the same window must NOT be empty
gcloud logging read 'resource.type="cloud_run_revision" AND httpRequest.status>0 AND timestamp>="<T0>"' \
  --project eggcraft-studio --limit 500 --format='value(httpRequest.status)' | wc -l
```

**Additional to the earlier plan, because the trigger audit found it:** the two frequent sweeps start
running on their own within ten and fifteen minutes of the deploy, against a workspace with zero eBay
connections. The watch is not finished until each has run at least once and returned clean on an
empty set — that is the first thing this deploy does unattended, and nobody has ever seen it happen.

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name=("reconcileebayconnections" OR "reconcileebaydeletions") AND timestamp>="<T0>"' \
  --project eggcraft-studio --limit 100 --format='value(timestamp,resource.labels.service_name,severity,textPayload)'
```

## Step 4 — the callback function itself

| Check | Expected |
|---|---|
| `POST` is the only method | GET, PUT, DELETE, PATCH, HEAD, OPTIONS → **405**, no state touched, no body read |
| Unauthenticated relay POST | **401**, bare body, no reason, no request id |
| Wrong relay key | **401**, byte-identical to the unauthenticated answer |
| Either of those | refused **before** any state document is read or written |
| Logs | no code, no state, no nonce, no ticket, no body value, on any path including errors |
| Replay and a consumed state | fail closed, and the state stays burned |

```bash
U=https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayOAuthCallback
for m in GET PUT DELETE PATCH HEAD OPTIONS; do printf '%s ' "$m"; curl -s -o /dev/null -w '%{http_code}\n' -X $m "$U"; done   # expect 405
curl -s -o /dev/null -w 'no-key %{http_code}\n' -X POST "$U" -H 'content-type: application/json' -d '{}'                      # expect 401
curl -s -o /dev/null -w 'bad-key %{http_code}\n' -X POST "$U" -H 'content-type: application/json' \
  -H "x-nivadesk-relay: $(printf wrong)" -d '{}'                                                                              # expect 401, same body
# then, in the same window, prove nothing sensitive was written:
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="ebayoauthcallback" AND timestamp>="<T0>"' \
  --project eggcraft-studio --limit 200 --format='value(textPayload,jsonPayload.message)' \
  | grep -icE 'code=|state=|nonce=|ticket=|authorization'      # expect 0
```

The real relay key is read into a shell variable and never echoed; the matrix in
`docs/ebay-connector-design.md` is the authority for the signed-request cases.

## Step 5 — only then, the relay key into Hostinger

`NIVADESK_EBAY_CALLBACK_KEY`, the same value as `EBAY_CALLBACK_KEY`, into the Hostinger build
environment. **Deliberately last**: while it is absent the web route fails closed with a 503 and no
seller can start a flow, which is the state Round 167 shipped in on purpose.

## Step 6 — the web half, exercised for real

The ticket route stops answering 503, a ticket is minted and sealed, and — the thing production has
never yet done — a **valid** ticket is verified in production rather than refused at the missing-key
step. A forged one is still refused, and a consumed one cannot sign twice.

## Step 7 — the first sandbox OAuth, recorded on its own

This is the first time a real credential travels the whole path. It needs the connector switch on,
which is a separate approval from the deploy. Recorded as its own evidence file, in this order:

| # | Step | What is written down | Fail-closed expectation |
|---|---|---|---|
| 1 | Preconditions | steps 1–6 all green; sandbox RuName recorded; connector switch turned on, with the time | if any is not green, stop |
| 2 | Consent begins | `beginEbayConnect` returns a ticket; the URL's `redirect_uri` is the sandbox RuName; scopes are the two read-only ones | a second call with the same ticket is refused |
| 3 | The seller consents in the sandbox | what the seller saw, screenshotted without the query string | — |
| 4 | The callback lands | one row written; which document; what fields; the state now burned | a replay of the same callback is refused and the state stays burned |
| 5 | The code | spent once, disposed within its bound; the presented-code registry shows exactly one entry | a second presentation of the same code is refused as already-seen |
| 6 | Logs, all seventeen services | no code, no state, no nonce, no ticket, no token, no body — checked with the grep in step 4 | any hit stops the test and is an incident |
| 7 | Token at rest | encrypted under `EBAY_TOKEN_KEY`; the plaintext appears nowhere in Firestore | — |
| 8 | What the seller sees | the connection lists as verified; `verifyEbayConnection` succeeds | — |
| 9 | The sweeps | the next `reconcileEbayConnections` run sees the connection and returns clean | — |
| 10 | Teardown decision | whether the sandbox connection stays or `disconnectEbay` is called, and the token destroyed | — |

## What stays shut regardless

No production RuName. No Cloudflare Worker deployment. No production eBay credential. Production
OAuth remains blocked behind two gates this plan does not touch: the platform-logging residual and
the spoofable-proxy-header denial of service. Hostinger's human-support answer, when it comes, is
evidence for the first of those and does not by itself open anything.

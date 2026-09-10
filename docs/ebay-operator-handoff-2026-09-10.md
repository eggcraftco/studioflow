# eBay — hand-off for the operator (10 September 2026, afternoon)

Written while the operator was away. Everything below is either done and verified, or a proposal that needs the
operator's word because the auto-mode classifier refused the assistant the action (rightly: both write to production
data or policy).

## 1. Live now

| Layer | State |
|---|---|
| Cloud Functions | 17/17 eBay functions on `ebay-connector@`, six secrets at version 1, sandbox env + RuName, connector switch **off** (`ebay-sandbox-rollout-2026-09-10.md`, `ebay-sandbox-backend-2026-09-10.md`) |
| Queue | `ebayEventWorker` with rows 4/6/8, logging 1.0; delivery from both OIDC identities verified (tests A2 / A2-compute) |
| Scheduler | three jobs; the 10-minute and 15-minute sweeps have run repeatedly with HTTP 200 (`connector off` / empty ledger); nightly first at 2026-09-11T01:40Z |
| Firestore rules | ruleset `8256326f` == committed `firestore.rules` (12:52Z) |
| Web | Hostinger `NIVADESK_EBAY_CALLBACK_KEY` set by the operator and proved equal to the secret (minted ticket → 204 + `__Host-` cookie), deployment 01a08b72 |
| Notification endpoint | challenge proved against the secret (12:56Z); registration waits for a production keyset |
| Health (13:20Z) | no WARNING/ERROR from any `ebay*` service other than the operator's own probes at 11:46–11:47Z; `dependency-audit` green on the deploy branch (e7f59525) |

## 2. Two proposals the classifier blocked — for the operator to run or decline

### 2a. Prove the runtime service account's own enqueue leg with a synthetic ledger row (no IAM change)

The one open behavioural gap: `cloudtasks.enqueuer` on the queue and the reflexive `actAs` for `ebay-connector@` (rows
4 and 5) have only been read back from policy. `reconcileEbayDeletions` runs as `ebay-connector@` every 10 minutes and
re-drives any `ebayDeletionRequests` row in status `queued` whose backoff has elapsed: it enqueues a `buyer_deletion`
task (`driveDeletion` → `enqueueEbayTask`), the worker looks up the hashes in `ebayBuyers`, finds nothing, and marks the
row `done`. A row with **random** hashes therefore touches no customer, calls no eBay API, and exercises exactly the
production enqueue path. Pass signal: no `ebay deletion enqueue failed, running inline` warning; a Cloud Tasks
`taskCreationLog` in queue `ebayEventWorker` a few seconds after the sweep; worker HTTP 204; the row at `status: done,
attempts: 1`. Then delete the row. Script (ADC, from `functions/`; writes one document):

```bash
cd functions && node -e '
const admin=require("firebase-admin"),crypto=require("crypto");admin.initializeApp({projectId:"eggcraft-studio"});const db=admin.firestore();
(async()=>{const id="preflight-synthetic-"+Date.now();const now=Date.now();const h1=crypto.randomBytes(32).toString("hex"),h2=crypto.randomBytes(32).toString("hex");
await db.collection("ebayDeletionRequests").doc(id).set({status:"queued",leaseUntilMs:0,receivedAtMs:now-7*60*1000,eventDate:new Date(now-7*60*1000).toISOString(),
usernameHash:h1,userIdHash:h2,usernameHashes:[h1],userIdHashes:[h2],attempts:0,redeliveries:0,ordersScrubbed:0,restrictedDocsDeleted:0,connectionsDisconnected:0,finishedAtMs:0,sanitizedError:"",
expireAt:admin.firestore.Timestamp.fromMillis(now+86400000),synthetic:true,note:"enqueue-leg pre-flight; random hashes; delete after evidence"});
console.log("wrote",id);process.exit(0)})()'
# wait for the next reconcileEbayDeletions run (every 10 min), then:
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name=~"^(reconcileebaydeletions|ebayeventworker)$" AND timestamp>="<T0>"' --project eggcraft-studio --limit 30 --format='value(timestamp,resource.labels.service_name,severity,httpRequest.status,textPayload)'
gcloud logging read 'logName="projects/eggcraft-studio/logs/cloudtasks.googleapis.com%2Ftask_operations_log" AND timestamp>="<T0>"' --project eggcraft-studio --limit 10 --format=json
# read the row (expect status done, attempts 1), then delete it:
#   db.collection("ebayDeletionRequests").doc(id).delete()
```

### 2b. TTL policies the design lists as an owner action (`ebay-connector-design.md`, owner actions step 5)

The code writes `expireAt` on `ebayConnectStates` (10 minutes), `ebayPresentedCodes` (§5.5), `ebayDeletionRequests`
(400 days) and `ebayConnections/*/deliveries`; TTL policies exist for eight other groups (`commerceEvents`,
`squareConnectStates`, `wooConnectStates`, `etsyOAuthStates`, …) but not for these. Without them the state and
presented-code documents accumulate for ever. `deliveries` is shared with the Square and Woo claim documents, so that
one is a cross-connector decision; the three eBay-only groups are not:

```bash
for CG in ebayConnectStates ebayPresentedCodes ebayDeletionRequests; do
  gcloud firestore fields ttls update expireAt --collection-group="$CG" --enable-ttl --project eggcraft-studio --async
done
gcloud firestore fields ttls list --project eggcraft-studio      # state CREATING → ACTIVE within minutes
```

## 3. Still gated on the operator's decisions (unchanged)

1. Production keyset → the portal's Marketplace Account Deletion registration (endpoint URL + the token from Secret
   Manager) → *Send Test Notification* → ledger row `done`.
2. Connector switch for one sandbox workspace → the first Sandbox OAuth → order → refund
   (`ebay-sandbox-approval-package-2026-09-10.md` §6 table).
3. First check after the nightly sweep: `gcloud scheduler jobs describe firebase-schedule-reconcileEbayConnectionsNightly-europe-west2 --location europe-west2`
   after 2026-09-11T01:40Z — expect an empty status and a `connector off` log line.

# eBay connector — least-privilege runtime service account: proposal for approval

Written 7 September 2026 on branch `ebay-connector`, worktree `/Users/gocmen/Developer/studioflow-ebay`.

**Nothing in this document has been executed.** No service account was created, no role bound, no
secret created, no API enabled, no function deployed. Every cloud fact below came from a read-only
call (`gcloud … list` / `describe` / `get-iam-policy`). No secret **value** was read — Secret Manager
was touched only with `list`, `describe` and `get-iam-policy`. `nivadesk-amazon` and VPC-SC were not
contacted.

This is a proposal to approve or reject. The commands that would create the account are written out
in the clearly-marked section near the end, ready to paste, and they have not been run.

---

## 0. How to read the claims in this document

Every assertion carries one of three labels. They are not decoration — the difference between them is
the difference between a grant that is right and a grant that quietly is not.

| Label | Means |
|---|---|
| **Established** | Read directly out of the committed code (file and line given), or returned by a live read-only command against `eggcraft-studio` (command given). |
| **Inferred** | Derived from the `firebase-tools` source on this machine plus an observed production analogue. Strong, but it is reasoning about CLI behaviour, not an observation of an eBay deploy that has never happened. |
| **Unestablished** | I could not settle it read-only. Each one names the exact command or dashboard that would settle it. |

Where a role is proposed on **Inferred** or **Unestablished** grounds, that is said in the row. Four
of the seven grants below are Established from code. Two are Inferred. One is Unestablished and is
proposed anyway, on the argument that it is correct under either answer and no broader than the need.

Versions the CLI-behaviour claims are read against: `firebase-tools` 15.19.0
(`/opt/homebrew/lib/node_modules/firebase-tools`), `firebase-admin` 12.7.0
(`functions/node_modules/firebase-admin`).

---

## 1. SA name

```
ebay-connector@eggcraft-studio.iam.gserviceaccount.com
```

Display name proposed: *"Runs the eBay connector's seventeen functions"*.

This name is not a choice being made now — it is **already committed in code and pinned by two
tests**, so it is the name or it is a code change:

- `functions/index.js:139` — `const EBAY_SERVICE_ACCOUNT = "ebay-connector@eggcraft-studio.iam.gserviceaccount.com";`
- `functions/test/qa/commerce-ebay-wiring.test.js:23` asserts that exact literal line.
- `functions/test/qa/access-control-policy.test.js:173` asserts it again by regex.
- `functions/test/qa/access-control-policy.test.js:269` asserts `docs/security/access-control-policy.md`
  still names `ebay-connector@eggcraft-studio` and `ebayEventWorker`.

**Established: the account does not exist today.**

```
$ gcloud iam service-accounts describe ebay-connector@eggcraft-studio.iam.gserviceaccount.com --project eggcraft-studio
ERROR: (gcloud.iam.service-accounts.describe) NOT_FOUND: Unknown service account.

$ gcloud iam service-accounts list --project eggcraft-studio --format='value(email)'
firebase-adminsdk-fbsvc@eggcraft-studio.iam.gserviceaccount.com
eggcraft-studio@appspot.gserviceaccount.com
477037475099-compute@developer.gserviceaccount.com
amazon-caller@eggcraft-studio.iam.gserviceaccount.com
```

Four accounts in the whole project. None of them is this one.

---

## 2. Which of the 17 functions use it

**All seventeen — and today, none of them, because the gate is shut.**

The seventeen are the sixteen returned by `createEbayConnectorFunctions`
(`functions/ebayConnector.js:1885-1888`) plus `ebayEventWorker`, defined directly at
`functions/index.js:34199-34206`. They receive the identity through one shared spread — not
seventeen separate declarations:

```js
// functions/index.js:135-140
const EBAY_SECRETS_READY = process.env.NIVADESK_EBAY_SECRETS_READY === "1" || require("fs").existsSync(require("path").join(__dirname, ".ebay-secrets-ready"));
const EBAY_SECRET_PARAMS = EBAY_SECRETS_READY ? [ …five defineSecret calls… ] : [];
const EBAY_SERVICE_ACCOUNT = "ebay-connector@eggcraft-studio.iam.gserviceaccount.com";
const EBAY_RUNTIME = EBAY_SECRETS_READY ? { secrets: EBAY_SECRET_PARAMS, serviceAccount: EBAY_SERVICE_ACCOUNT } : {};
```

and the sixteen connector functions get it because their trigger factories are wrapped at
`functions/index.js:6185-6187`:

```js
onCall:    (options, handler) => onCall({ ...options, ...EBAY_RUNTIME }, handler),
onRequest: (options, handler) => onRequest({ ...options, ...EBAY_RUNTIME }, handler),
onSchedule:(options, handler) => onSchedule({ ...options, ...EBAY_RUNTIME }, handler),
```

`ebayEventWorker` spreads `...EBAY_RUNTIME` in its own options at `functions/index.js:34203`.

| # | Function | Trigger | Definition |
|---|---|---|---|
| 1 | `beginEbayConnect` | `onCall` | `ebayConnector.js:505` |
| 2 | `claimEbayConnectState` | `onCall` | `ebayConnector.js:529` |
| 3 | `ebayOAuthCallback` | `onRequest` | `ebayConnector.js:720` |
| 4 | `getEbayConnections` | `onCall` | `ebayConnector.js:968` |
| 5 | `verifyEbayConnection` | `onCall` | `ebayConnector.js:988` |
| 6 | `updateEbayConnectionSettings` | `onCall` | `ebayConnector.js:1008` |
| 7 | `disconnectEbay` | `onCall` | `ebayConnector.js:1021` |
| 8 | `reconcileEbayConnections` | `onSchedule` every 15 min | `ebayConnector.js:1338` |
| 9 | `reconcileEbayConnectionsNightly` | `onSchedule` 02:40 | `ebayConnector.js:1339` |
| 10 | `syncEbayNow` | `onCall` | `ebayConnector.js:1357` |
| 11 | `previewEbayImport` | `onCall` | `ebayConnector.js:1386` |
| 12 | `runEbayImport` | `onCall` | `ebayConnector.js:1498` |
| 13 | `retryEbayImportFailures` | `onCall` | `ebayConnector.js:1505` |
| 14 | `reconcileEbayDeletions` | `onSchedule` every 10 min | `ebayConnector.js:1729` |
| 15 | `ebayNotifications` | `onRequest` | `ebayConnector.js:1848` |
| 16 | `revealRestrictedCustomer` | `onCall` | `ebayConnector.js:1851` |
| 17 | `ebayEventWorker` | `onTaskDispatched` | `index.js:34199` |

**Established: today none of them uses it, and today none of them can.**
`functions/.ebay-secrets-ready` does not exist (`ls` → *No such file or directory*; contrast
`functions/.xero-secrets-ready`, present, 262 bytes). So `EBAY_SECRETS_READY` is false,
`EBAY_RUNTIME` is `{}`, and a deploy right now names no identity and mounts no secret. That is the
designed fail-safe, and it is why nothing has broken yet.

**Two functions that are NOT among the seventeen, do not use this identity, and still matter to it:**

- `releaseHeldIntegrationOrders` (`index.js:15008`, enqueue at `:15183`)
- `retryCommerceEvent` (`index.js:34213`, eBay branch enqueues at `:34230`)

Both enqueue into the eBay worker's queue while running as the **compute default**. Their options
carry no `serviceAccount`. They are the reason the queue and the worker service must accept **two**
caller identities, not one — see §3, rows 4 and 6.

---

## 3. Exact IAM roles / permissions required

Seven grants. Three at project scope because the resource has no finer scope; four at resource
scope, which is preferred and is used wherever the API allows it.

| # | Role | Scope | Code that needs it | Class |
|---|---|---|---|---|
| 1 | `roles/datastore.user` | **project** (no choice) | all Firestore | Established |
| 2 | `roles/logging.logWriter` | **project** (no choice) | container log emission | Inferred |
| 3 | `roles/firebasecloudmessaging.admin` *(or a 1-permission custom role)* | **project** (FCM has no resource scope) | `sendPushNotificationToCompany` | Established |
| 4 | `roles/cloudtasks.enqueuer` | **resource**: queue `ebayEventWorker` | `enqueueEbayTask` | Established |
| 5 | `roles/iam.serviceAccountUser` | **resource**: this SA, member = itself | Cloud Tasks OIDC `actAs` | Unestablished |
| 6 | `roles/run.invoker` *(or custom `run.routes.invoke`)* | **resource**: Run service `ebayeventworker` | Cloud Tasks dispatch | Inferred |
| 7 | `roles/secretmanager.secretAccessor` | **resource**: each of five secrets | the five `EBAY_*` reads | Established |

### 3.1 `roles/datastore.user` — project scope, and this is the honest part

**Established.** `admin.firestore()` takes Application Default Credentials from the metadata server,
i.e. the runtime SA. Thirteen of the seventeen write; all seventeen read.

Inside the eBay/commerce surface:

| Collection | R/W | Anchor |
|---|---|---|
| `ebayConnections` (+ `/credentials/current`, `/syncLog`, `/deliveries`) | R+W+delete | `ebayConnector.js:183, 196, 222, 1824`; delete `:1030`, `:1607` |
| `ebayConnectStates` | R+W | `:184, 515, 549, 856, 927` |
| `ebayBuyers` | R+W+delete | `:185, 1061, 1573, 1601` |
| `ebayDeletionRequests` | R+W | `:186, 1567, 1698, 1801` |
| `ebayPresentedCodes` | create only | `:187, 665` |
| `ebayQuota/{YYYY-MM-DD}` | R+W | `commerce/ebay/quota.js:53` |
| `ebayNotificationKeys` | R+W | `ebayConnector.js:1750` |
| `commerceCursors` | R+W | `commerce/cursors.js:15, 45` |
| `commerceEvents` | W | `commerce/worker.js:9, 15, 28` |
| `commerceHealth` | W | `commerce/health.js:45` |
| `commerceReviewQueue` | W+delete | `commerce/engine.js:143-155`; `ebayConnector.js:1592` |
| `externalEntities` | R+W | `commerce/engine.js:44, 110`; read `ebayConnector.js:1407` |
| `appConfig/commerce` | R | `commerce/flags.js:29` |

Outside it — and this is substantial, not incidental:

| Path | Op | Anchor |
|---|---|---|
| `siparisler/{orderId}` | create/update in a transaction | `commerce/engine.js:57, 109, 119, 130`; scrub write `ebayConnector.js:1578-1583` |
| `companies/{cid}` | merge `heldOrdersNotifiedAtMs` | `index.js:2881` |
| `companies/{cid}/restrictedCustomer/{orderId}` | set + delete | `ebayConnector.js:1092-1098`, delete `:1596` |
| `companies/{cid}/heldIntegrationOrders/{id}` | set / merge / delete | `index.js:2861`; `ebayConnector.js:1588`, delete `:1084` |
| `companies/{cid}/notifications/held_integration_orders` | set | `index.js:2898` |
| `companies/{cid}/deviceTokens/*` | batch delete of dead tokens | `index.js:556, 561` |
| `companies/{cid}/piiAccessLog` | add | `index.js:29710-29713` |
| `companies/{cid}/revealCounters/{uid}` | set in a transaction | `ebayConnector.js:1864-1870` |

Reads: `users/{uid}` (`index.js:2760`), `companies/{cid}` (`index.js:2788`, `ebayConnector.js:1140`),
`companySettings/{cid}` (`index.js:6660`), `companies/{cid}/deviceTokens` (`index.js:492`), and a
`siparisler` scan for the plan limit (`index.js:2907-2911`).

**What the operator must not be allowed to misread.** `roles/datastore.user` cannot be scoped below
the database, and there is exactly one database:

```
$ gcloud firestore databases list --project eggcraft-studio --format='value(name)'
projects/eggcraft-studio/databases/(default)
```

Firestore Security Rules do not apply to the Admin SDK at all — `allow read, write: if false` on
`ebayConnections` (`firestore.rules:1196`), `restrictedCustomer` (`:714`), `revealCounters` (`:719`)
and `allow write: if false` on `piiAccessLog` (`:696`) constrain client SDKs only. And the project
IAM policy is `version: 1`, which cannot carry conditional bindings, so no condition narrows it
either.

**Therefore: `ebay-connector@` will have exactly the same data-plane reach as the default compute
account — every workspace's orders, customers, bank feeds and every other connector's boxed tokens.
The dedicated identity buys secret isolation. It does not buy data isolation.** That should be
approved with eyes open, and it is worth one sentence in `docs/security/access-control-policy.md` §5
so that nobody two years from now reads "dedicated service account" and assumes more.

A custom role instead of `roles/datastore.user` would drop only cosmetics
(`databasesconsole.studioQueries.*`, `datastore.statistics.*`, `datastore.namespaces.*`,
`datastore.schemas.list`, `appengine.applications.get`). The permissions that matter —
`datastore.entities.{create,get,list,update,delete}` — are all genuinely used.
`roles/datastore.viewer` is insufficient. **The tightening that would actually matter is not
expressible in IAM.**

One adjacency worth naming explicitly. `revealRestrictedCustomer` (`ebayConnector.js:1851-1883`) is
deliberately provider-agnostic: it reads `companies/{cid}/restrictedCustomer/{orderId}` with no
provider filter and stamps `provider: restricted.provider` into the audit line (`:1878`).
`functions/commerce/amazon/ingest.js:104` writes Amazon buyer PII into that same subcollection.
Today that is unreachable — phase A1 never requests BUYER/RECIPIENT (`ingest.js:98-101`) — so the
collection holds eBay rows only. **The day a later Amazon phase admits those fields,
`ebay-connector@` becomes an identity that can read Amazon buyer PII out of the main project.** Not
a cross-project access, but it crosses the Amazon isolation boundary, and it is a consequence of row
1 rather than of anything eBay-specific.

### 3.2 `roles/logging.logWriter` — project scope

**Inferred, not Established.** Every observability call in the seventeen is `console.log/warn/error`
(`ebayConnector.js:337-340` `opsSay`, `:696`, `:1333`). There is no `@google-cloud/logging` client,
no custom metric, no Error Reporting client (Error Reporting scrapes stderr and has no IAM of its
own). The role is needed for the *container* to emit logs at all.

I could not establish that requirement from inside this project, because both existing runtime
identities hold it (`477037475099-compute@` and `amazon-caller@`), so there is no counter-example
here. Settling it would mean deploying a throwaway function with an SA that lacks it — a write.
**Recommendation: grant it and skip the question.** Two permissions, both needed, and every runtime
identity in the project already has it.

### 3.3 `roles/firebasecloudmessaging.admin` — project scope, and the one that fails silently

**Established.** `applyEbayOrder` sends a push on every newly created order:

```js
// ebayConnector.js:1160
await sendPushNotificationToCompany(companyId, { title: "New eBay order", … }).catch(() => undefined);
```

→ `index.js:487` → `admin.messaging().sendEachForMulticast(...)` at `index.js:536`, then a batch
delete of dead token documents at `index.js:556, 561`. A second push comes from
`holdIntegrationOrder` (`index.js:2899`, also swallowed with `.catch(() => {})`).

Reachable from seven of the seventeen: `runEbayImport`, `retryEbayImportFailures`, `syncEbayNow`,
`reconcileEbayConnections`, `reconcileEbayConnectionsNightly`, `ebayEventWorker`, `ebayNotifications`
(its inline fallback). Not from `previewEbayImport` (never applies) or `ebayOAuthCallback`.

Needs `cloudmessaging.messages.create`. **The predefined role is much broader than the need:**

```
$ gcloud iam roles describe roles/firebasecloudmessaging.admin --format='value(includedPermissions)'
cloudmessaging.messages.create
cloudmessaging.topicSubscriptions.create / delete / get / list / update
fcmdata.deliverydata.list
resourcemanager.projects.get / list
```

Nine permissions; the code uses one. The five `topicSubscriptions.*` permissions are the ability to
move *any* device in the project into or out of any topic. A custom role with
`cloudmessaging.messages.create` alone is a clear tightening and is written out in the commands
section — **but see the caveat there**: I have verified that the code calls `sendEachForMulticast`
and that the predefined role contains `cloudmessaging.messages.create`; I have **not** verified that
the Admin SDK's multicast send needs nothing else at runtime. That makes the custom role a
second-step change, after push is observed working, not a first-deploy risk to take.

**Why this one deserves attention out of proportion to its size:** both call sites swallow the
error, and both sit downstream of `applyEbayOrder`, which is gated on `connectorOn()`
(`ebayConnector.js:1535` returns `recordSkipped(task, "connector_off")`). So while
`NIVADESK_EBAY_CONNECTOR` is unset — which is the whole first phase of the rollout — **no deploy
smoke test can detect that this grant is missing.** It surfaces weeks later, after the switch is
turned on, as "customers stopped getting order notifications", with no error anywhere.

### 3.4 `roles/cloudtasks.enqueuer` — **resource scope: the queue, not the project**

**Established from code.** One door to the queue:

```js
// index.js:6173-6181
const EBAY_QUEUE_FUNCTION = "ebayEventWorker";
async function enqueueEbayTask(task, delaySeconds = 0) {
  …
  const queue = getFunctions().taskQueue(`locations/europe-west2/functions/${EBAY_QUEUE_FUNCTION}`);
  await queue.enqueue(task, { scheduleDelaySeconds: Math.max(0, Math.round(delaySeconds)) });
}
```

Callers running as `ebay-connector@`: `ebayNotifications` (`ebayConnector.js:1832`),
`reconcileEbayDeletions` → `driveDeletion` (`ebayConnector.js:1642`), and the worker's own retry
(`index.js:34194`).

Callers running as the **compute default**: `releaseHeldIntegrationOrders` (`index.js:15183`) and
`retryCommerceEvent` (`index.js:34230`). Those already work — the compute default holds
`roles/cloudtasks.enqueuer` at project level.

**Bind at the queue, not the project.** Project-level enqueuer would also let the eBay identity push
tasks into `commerceEventWorker`, which is every other connector's worker. The queue name is
`ebayEventWorker` — `firebase-tools` names the queue after the function id
(`lib/gcp/cloudtasks.js:130-132`), which is why `gcloud tasks queues list` today returns exactly
`commerceEventWorker` and nothing else.

**Ordering trap: the queue does not exist yet.** `firebase-tools` creates it during the first eBay
deploy (`fabricator.js:699-702`, `upsertQueue`). So this binding is a **post-deploy** step. See §7.

### 3.5 `roles/iam.serviceAccountUser` — **resource scope: this SA, member = itself**

**Unestablished, and proposed anyway.** Cloud Tasks requires the principal creating a task to hold
`iam.serviceAccounts.actAs` on the service account named in the task's OIDC token. Here that account
is `ebay-connector@` itself, because `firebase-admin` reads the enqueuer's own runtime identity off
the metadata server and there is no way to override it:

```js
// functions/node_modules/firebase-admin/lib/functions/functions-api-client-internal.js:293-294
const account = await this.getServiceAccount();
task.httpRequest.oidcToken = { serviceAccountEmail: account };
```

→ `lib/utils/index.js:149 findServiceAccountEmail` → `ComputeEngineCredential.getServiceAccountEmail()`
→ metadata `/computeMetadata/v1/instance/service-accounts/default/email`.

What I could not settle: **whether a service account has implicit `actAs` on itself.** The working
precedent in this project is contaminated — `477037475099-compute@` holds project-level
`roles/iam.serviceAccountUser`, and its own SA-resource policy is empty (`etag: ACAB`), so today's
successful `commerceEventWorker` enqueue does not distinguish "implicit self-actAs" from "the
project binding is doing it". `amazon-caller@` would be a clean control, but it never enqueues.

*To settle it, without any write:* IAM & Admin → **Policy Troubleshooter** in the console, with
resource `//iam.googleapis.com/projects/eggcraft-studio/serviceAccounts/amazon-caller@eggcraft-studio.iam.gserviceaccount.com`,
principal `amazon-caller@eggcraft-studio.iam.gserviceaccount.com`, permission
`iam.serviceAccounts.actAs`. The CLI equivalent (`gcloud policy-troubleshoot iam …`) requires
`gcloud services enable policytroubleshooter.googleapis.com` first, which is a write and outside
this window.

**Grant it regardless.** It is correct under either answer, it is resource-level on one account, and
it costs nothing broader. What must **not** be copied is the compute default's shape: its
`roles/iam.serviceAccountUser` is at **project** scope, which is `actAs` over every service account
in the project — `amazon-caller@` included.

### 3.6 `roles/run.invoker` — **resource scope: the `ebayeventworker` service.** This is the finding

**Inferred, and the strongest practical risk in this proposal.**

A Cloud Tasks HTTP target with an OIDC token must be accepted by the receiving Cloud Run service.
`onTaskDispatched` endpoints get **no automatic invoker binding** unless `invoker` is set in the
options — `firebase-tools` only calls `setInvokerCreate` for a task-queue endpoint when
`endpoint.taskQueueTrigger.invoker` is present:

```js
// lib/deploy/functions/release/fabricator.js:366-374
else if (backend.isTaskQueueTriggered(endpoint)) {
    const invoker = endpoint.taskQueueTrigger.invoker;
    if (invoker && !invoker.includes("private")) { … await run.setInvokerCreate(…) … }
}
```

`ebayEventWorker`'s options set only `region`, `retryConfig`, `rateLimits`, `...EBAY_RUNTIME`
(`index.js:34199-34204`) — **no `invoker`.**

The live analogue confirms the consequence. `commerceEventWorker` dispatches fine today, and its
Cloud Run IAM policy is **empty**:

```
$ gcloud run services get-iam-policy commerceeventworker --region=europe-west2 --project eggcraft-studio
{ "etag": "ACAB" }
```

It works purely because its caller inherits **project-level** `roles/run.invoker`, which only
`477037475099-compute@` holds. `ebay-connector@` will hold nothing of the sort.

**Predicted failure:** a task enqueued by `ebayNotifications`, `reconcileEbayDeletions` or the
worker's own retry is accepted by Cloud Tasks — `enqueue()` returns success — and then **403s at
dispatch**. And `retryConfig: { maxAttempts: 1 }` (`index.js:34201`) is copied onto the queue
(`lib/gcp/cloudtasks.js:141-142`), so Cloud Tasks drops the task after that one attempt. The eBay
event is gone, the enqueuing function logged nothing, and the only trace is a Cloud Tasks/Cloud Run
403. Tasks enqueued by `releaseHeldIntegrationOrders` and `retryCommerceEvent` dispatch normally,
because the compute default's project binding covers them — so the symptom is *partial* loss, which
is harder to spot than total loss.

Bind at the service, not the project: `roles/run.invoker` at project level is invoke rights on all
421 Cloud Run services in `eggcraft-studio`. Even at the service, the predefined role is slightly
broad — `run.instances.invoke`, `run.jobs.run`, `run.routes.invoke`, of which only
`run.routes.invoke` is needed; `run.jobs.run` is the ability to start Cloud Run *jobs*.

**Ordering trap: the service does not exist yet either.** Post-deploy step. See §7.

### 3.7 `roles/secretmanager.secretAccessor` — resource scope, per secret

**Established.** Covered in full in §4.

### 3.8 What is NOT needed, and why — each with its disproof

| Role the default compute SA holds | Needed by `ebay-connector@`? | Why not |
|---|---|---|
| `roles/firebaseauth.admin` | **No** | No `admin.auth()` anywhere in `ebayConnector.js`, `functions/commerce/**`, `functions/privacy/**`, `functions/security/tokenBox.js`. `requireWorkspaceForBilling` (`index.js:2771`) is Firestore-only. |
| `roles/storage.objectViewer` | **No** | No object is read or written by any of the seventeen. The only `admin.storage()` in the candidate tree is `functions/security/downloadTokens.js:41`, and it is not in the require closure of `ebayConnector.js` (requires listed at `:33-57`; none reaches it). |
| `roles/eventarc.eventReceiver` | **No** | All seventeen are `onCall` / `onRequest` / `onSchedule` / `onTaskDispatched`. No Firestore or Storage trigger among them. The fan-out triggers (`syncWorkflowSafeOrderView`, `notifyCustomerOnStatusChange`) are separate functions with their own identity and their own secrets — the eBay SA needs no SMTP or Twilio grant, and customer email/SMS keeps working. |
| `roles/artifactregistry.writer` | **No** | Build-time, not runtime. `gcloud functions describe … --format='value(buildConfig.serviceAccount)'` returns `477037475099-compute@` for live gen2 functions, and `amazon-caller@` runs three deployed gen2 services today holding only `datastore.user` + `logging.logWriter` — a live counter-example that a runtime SA needs no Artifact Registry role. |
| Cloud KMS | **No** | Token encryption is Node `crypto` AES-256-GCM under a Secret Manager key (`functions/security/tokenBox.js:14-30`). |
| Pub/Sub | **No** | Firebase v2 `onSchedule` provisions a Cloud Scheduler job with an `httpTarget`, not a `pubsubTarget` — confirmed by describing a live job. |
| BigQuery | **No** | No client, no dataset reference anywhere in the surface. |
| Anything for outbound HTTPS | **No** | Five hosts, all eBay (`functions/commerce/ebay/oauth.js:28-29`): `auth.ebay.com`, `api.ebay.com`, `apiz.ebay.com` and the three sandbox equivalents. Plain `fetch` with default public egress; no VPC connector, no `egressSettings` in any of the seventeen. IAM does not govern this. |

**One thing the CLI does handle for you, so do not grant it manually.** The three `onSchedule`
functions will get Cloud Scheduler jobs whose OIDC identity is `ebay-connector@`
(`lib/gcp/cloudscheduler.js:135-137`: `endpoint.serviceAccount ?? defaultServiceAccount`), and
`firebase-tools` **does** create the matching `run.invoker` binding for schedule-triggered endpoints
(`fabricator.js:382-388`). Live confirmation of the default branch:
`firebase-schedule-reconcileSquareConnections-europe-west2` carries the compute SA in its
`oidcToken`, and `gcloud run services get-iam-policy reconcilesquareconnections` has exactly one
binding — `run.invoker` for that same SA. Scheduler is fine. Only the task queue is not.

---

## 4. Exact Secret Manager access required

### 4.1 The grant

Five secrets, `roles/secretmanager.secretAccessor` on **each secret as a resource**, member
`ebay-connector@` only:

```
EBAY_CLIENT_ID
EBAY_CLIENT_SECRET
EBAY_TOKEN_KEY
EBAY_HASH_KEY
EBAY_CALLBACK_KEY
```

**Established: none of the five exists today.** `gcloud secrets list --project eggcraft-studio`
returns 45 names; none matches `ebay`, case-insensitively.

**Established: this project already does per-secret granularity, and there is no project-wide
fallback.** `gcloud projects get-iam-policy` shows the compute default holds ten roles and
`roles/secretmanager.secretAccessor` is **not** among them. Spot-checked per-secret policies show
exactly one binding each — `ETSY_TOKEN_KEY`, `SQUARE_TOKEN_KEY`, `STRIPE_SECRET_KEY`,
`WOO_TOKEN_KEY` → compute default; `AMAZON_INTENT_HMAC_KEY` → `amazon-caller@` and **not** the
compute default:

```
$ gcloud secrets get-iam-policy AMAZON_INTENT_HMAC_KEY --project eggcraft-studio --format='value(bindings.role,bindings.members)'
roles/secretmanager.secretAccessor    ['serviceAccount:amazon-caller@eggcraft-studio.iam.gserviceaccount.com']
```

That is the exact shape proposed for the five eBay secrets.

Granularity is **per secret, not per version**. `roles/secretmanager.secretAccessor` bound on a
secret covers all its versions; that is what the code needs, since `defineSecret` resolves `latest`.

### 4.2 Which function needs which secret — and why narrowing the list does not narrow IAM

Traced through the accessor closures (`configured()` `:190`, `hashKeys()` `:193`, `box`/`unbox`
`:200-201`, `ticketKey()` `:352-359`):

| Function | CLIENT_ID | CLIENT_SECRET | TOKEN_KEY | HASH_KEY | CALLBACK_KEY |
|---|---|---|---|---|---|
| `beginEbayConnect` | ✔ `:508,519` | – | – | – | ✔ `:525`→`:374`→`:353` |
| `claimEbayConnectState` | ✔ `:578` | – | – | – | ✔ `:546, 577` |
| `ebayOAuthCallback` | ✔ `:886` | ✔ `:886, 635` | ✔ `:886`→`storeCredentials:429` | ✔ `:907` | ✔ `:739` |
| `getEbayConnections` | ✔ `:985` | – | – | – | – |
| `verifyEbayConnection` | ✔ `:465` | ✔ `:465` | ✔ `:485-490` | – | – |
| `updateEbayConnectionSettings` | – | – | – | – | – |
| `disconnectEbay` | – | – | – | – | – |
| `previewEbayImport` | ✔ | ✔ | ✔ | – | – |
| `runEbayImport` | ✔ | ✔ | ✔ | ✔ `:1060` | – |
| `retryEbayImportFailures` | ✔ | ✔ | ✔ | ✔ | – |
| `syncEbayNow` | ✔ | ✔ | ✔ | ✔ | – |
| `reconcileEbayConnections` | ✔ | ✔ | ✔ | ✔ `:1297, 1060` | – |
| `reconcileEbayConnectionsNightly` | ✔ | ✔ | ✔ | ✔ | – |
| `reconcileEbayDeletions` | – | – | – | – | – |
| `ebayEventWorker` | ✔ | ✔ | ✔ | ✔ | – |
| `ebayNotifications` | ✔ `:1786, 1738` | ✔ `:1738` | ✔ (inline fallback `:1832`) | ✔ `:1799-1800` | – |
| `revealRestrictedCustomer` | – | – | – | – | – |

Four functions need none of the five: `updateEbayConnectionSettings`, `disconnectEbay`,
`reconcileEbayDeletions`, `revealRestrictedCustomer`. `EBAY_CALLBACK_KEY` — arguably the
highest-value of the five, since it both verifies the relay POST and derives the browser-ticket key
(`:352-359`) — is needed by exactly three. `EBAY_HASH_KEY` by seven.

**But the code mounts all five on all seventeen** (`index.js:136-140`), and **narrowing that list
would not narrow IAM by one binding.** `firebase-tools` grants `secretAccessor` per secret to each
endpoint's service account (`lib/deploy/functions/ensure.js:70-92`:
`const sa = e.serviceAccount || defaultServiceAccount`), and all seventeen share one SA. The
resulting IAM is byte-identical whether the list is uniform or per-function.

What narrowing *would* buy is **runtime blast radius** — which live process has the plaintext in
`process.env`. Today, under the committed design, `revealRestrictedCustomer` — an internet-facing
callable that hands out buyer addresses — would carry `EBAY_CALLBACK_KEY` in its environment for no
reason. That is a real and cheap tightening. **It is a code change, not an IAM change, and it is out
of scope for this approval**; recording it here so it is not lost.

### 4.3 The sixth credential-shaped value, which is not in Secret Manager

`NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN` — eBay's endpoint verification token — is read as a
plain environment variable (`index.js:6197`, used at `ebayConnector.js:1769` for the GET challenge
handshake). It is not one of the five, it is not in Secret Manager, and no IAM grant covers it. That
is a decision for the operator to confirm or change, not a finding about this SA.

---

## 5. Cross-project permissions

**None. Nothing outside `eggcraft-studio`.**

Five independent checks, all read-only:

1. Grep for `nivadesk-amazon|projects/|gs://|\.appspot\.com|firebasestorage|bigquery|datasets/`
   across `ebayConnector.js`, `commerce/ebay/**`, `commerce/{engine,worker,health,cursors,events,flags}.js`,
   `privacy/{reveal,retention}.js` — **zero hits**.
2. Every hard-coded URL in the eBay closure resolves to
   `europe-west2-eggcraft-studio.cloudfunctions.net` (`index.js:6199, 6215`) or an `*.ebay.com` host
   (`commerce/ebay/oauth.js:28-29`).
3. The two `nivadesk-amazon` references in `index.js` (`:34463`, `:34506`) belong to
   `ingestAmazonEnvelope` / `amazonConnectStart` / `amazonDisconnect` / `amazonStatus` — separate
   functions running as `amazon-caller@`, none among the seventeen, and no eBay function calls them.
4. Require-closure trace from `ebayConnector.js:33-57`: no `@google-cloud/*` client, no
   `google-auth-library`, no `admin.storage`, no `admin.auth()` — there is no client that could be
   pointed at another project.
5. `gcloud run services list` shows only `amazonconnectstart` / `amazondisconnect` / `amazonstatus`
   on a non-default SA; no eBay service exists.

**No cross-project bucket, dataset, secret, topic, queue, or Amazon-project reference exists in the
eBay surface.** The only Amazon adjacency is the shared `restrictedCustomer` subcollection *inside*
`eggcraft-studio`, described at the end of §3.1 — which is a Firestore consequence, not a
cross-project grant.

---

## 6. What the default / current runtime identity is today

**The Compute Engine default service account.**

```
477037475099-compute@developer.gserviceaccount.com
```

`gcloud iam service-accounts list` gives its display name as *Default compute service account*, and
`477037475099` is the project number, so the email is default-by-construction.

**Established, whole-fleet:**

```
$ gcloud run services list --project eggcraft-studio --region europe-west2 \
    --format='value(metadata.name,spec.template.spec.serviceAccountName)' \
  | awk -F'\t' '{print $2}' | sort | uniq -c | sort -rn
  418 477037475099-compute@developer.gserviceaccount.com
    3 amazon-caller@eggcraft-studio.iam.gserviceaccount.com
```

421 Cloud Run services, all in `europe-west2`. Per-service `describe` was run on 16 of them covering
all five trigger kinds (`onCall`, `onRequest`, `onSchedule`, Firestore/Storage event, Cloud Tasks
worker) and every one returned the compute default; the other 405 come from the single fleet-wide
read of the same field, `spec.template.spec.serviceAccountName`.

The **ten** project roles that identity holds — this is the whole delta, and Editor is not in it:

```
$ gcloud projects get-iam-policy eggcraft-studio --flatten='bindings[].members' \
    --filter='bindings.members:serviceAccount:477037475099-compute@developer.gserviceaccount.com' \
    --format='value(bindings.role)'
roles/artifactregistry.writer
roles/cloudtasks.enqueuer
roles/datastore.user
roles/eventarc.eventReceiver
roles/firebaseauth.admin
roles/firebasecloudmessaging.admin
roles/iam.serviceAccountUser
roles/logging.logWriter
roles/run.invoker
roles/storage.objectViewer
```

Two things in that list matter here: there is **no project-level
`roles/secretmanager.secretAccessor`** (secret access is per-secret in this project, already), and
`roles/iam.serviceAccountUser` is at **project** scope, which is `actAs` over every service account
in the project.

Also true, and easy to assume away:

- The **App Engine default SA is not dead.** `eggcraft-studio@appspot.gserviceaccount.com` is the
  runtime of the one surviving gen1 function, `wooCommerceSiparis`.
- **`amazon-caller@` is the sole non-default precedent** — three services
  (`amazonconnectstart`, `amazondisconnect`, `amazonstatus`), declared in code exactly the way eBay
  intends to (`index.js:34519, :34540, :34550`), holding **`roles/datastore.user` +
  `roles/logging.logWriter` at project level and `secretAccessor` on one secret** — and its SA-resource
  policy carries one binding, `roles/iam.serviceAccountUser` for the compute default. It was created
  2026-09-04 by the committed, `DRY_RUN=1`-by-default script
  `infra/amazon/main-project-side.sh`, whose stated principle is *"amazonConnectStart and amazonStatus
  run AS this account … so it needs what those two functions need and nothing else."*
- The deployer is `user:contact@eggcraft.co.uk` with `roles/owner` — the only `user:` binding on the
  project.

---

## 7. What the operator must know before approving

### 7.1 The value being bought is narrower than the phrase "dedicated service account" suggests

It is **secret isolation only**. Five eBay secrets readable by seventeen functions instead of by the
identity that runs ~420, including every other connector's public endpoints and the ChatGPT MCP
surface. That is exactly the goal
`docs/security/access-control-policy.md:145` states under its own heading, *"Open remediation: one
identity can read every secret"*, and against that goal it works.

It is **not** data isolation (§3.1). Approving this should come with the expectation that
`access-control-policy.md` §5 gains one honest sentence saying so, in the same register as the
"What is enforced by the interface" paragraph the test suite already protects.

### 7.2 What breaks if the enumeration is incomplete — ordered by how hard it is to notice

| Missing grant | Failure | How loud |
|---|---|---|
| `roles/run.invoker` on `ebayeventworker` | `enqueue()` succeeds; dispatch 403s; `maxAttempts: 1` drops the task | **Silent, and worst.** No function error. eBay order events vanish. Compute-enqueued tasks still work, so the loss is partial. |
| `roles/firebasecloudmessaging.admin` | pushes throw inside `.catch(() => undefined)` | **Silent, and undetectable during the connector-off phase** (§3.3). Surfaces weeks later as "no order notifications". |
| `roles/cloudtasks.enqueuer` on the queue, or `actAs` on itself | `CreateTask` denied → `enqueue()` throws | **Loud and survivable at two of three sites.** `ebayNotifications` logs *"ebay notifications enqueue failed, applying inline:"* (`:1832`) and processes inline; `driveDeletion` logs *"ebay deletion enqueue failed, running inline:"* (`:1644`) and runs inline with a 40-second bound. **But `index.js:34194` — the worker's own retry — is the only enqueue in the whole eBay path with no try/catch and no fallback: a retrying event throws out of the handler and is lost.** |
| `roles/datastore.user` | first Firestore call fails | Loud. Everything fails immediately. |
| `roles/logging.logWriter` | logs do not reach Cloud Logging | Loud by absence, if anyone is looking. |
| `secretAccessor` on `EBAY_CALLBACK_KEY` | key unmounted → `ticketKey()` returns `null` → every relay POST answers 401 | Loud: no seller can complete OAuth. |
| `secretAccessor` on `EBAY_TOKEN_KEY` | *"No eBay key is configured."* | Loud. |
| `secretAccessor` on `EBAY_CLIENT_ID` | `configured()` false → **the account-deletion endpoint answers 503** (`ebayConnector.js:1786`) | Loud, and it is a compliance obligation to eBay, not just a feature. |

### 7.3 The ordering trap, stated plainly

Two of the seven grants (`run.invoker` on the service, `cloudtasks.enqueuer` on the queue) **cannot
be made before the first deploy, because neither resource exists until the deploy creates them.**
There is therefore an unavoidable window in which the worker exists and 403s.

Deploying with `NIVADESK_EBAY_CONNECTOR` unset covers the *order* path — `processEbayCommerceTask`
returns `recordSkipped(task, "connector_off")` at `ebayConnector.js:1535`, and the notification
gateway short-circuits the ORDER_CONFIRMATION branch at `:1818`. But the **account-deletion path is
deliberately ungated** (`ebayConnector.js:1797` onward, and the comment at `:1690-1692`: *"Ungated,
like the rest of the deletion path — no connector switch, no per-connection flag, no connection at
all"*), so during that window deletions ride `driveDeletion`'s inline fallback. That is by design and
it holds, but it should be a known state rather than a surprise.

**A cheaper alternative exists, and it is a code change the operator may prefer to make first.**
Setting `invoker: [EBAY_SERVICE_ACCOUNT]` in `ebayEventWorker`'s options would make
`firebase-tools` create **both** resource-level bindings automatically on the first deploy —
`setEnqueuer` on the queue (`fabricator.js:704-708`) and `setInvokerCreate` on the Run service
(`fabricator.js:366-374`). It would not break the three committed assertions, which pin
`EBAY_RUNTIME`, `EBAY_SERVICE_ACCOUNT` and the `EBAY_RUNTIME` spread, not the worker's option list.
Two caveats: `setInvokerCreate` **replaces** the service's whole IAM policy with that one binding
(`lib/gcp/run.js:116-128`) — harmless on a brand-new service, not harmless if re-run later against a
service someone has since bound something else onto; and the compute default would then rely on its
**project-level** `run.invoker` and `cloudtasks.enqueuer` to keep `releaseHeldIntegrationOrders` and
`retryCommerceEvent` working, which it holds today but which is exactly the kind of project-level
grant someone may one day narrow. I am flagging this as an option with its trade-offs, not
recommending it inside an IAM approval.

### 7.4 How to find out cheaply, before committing

Five checks. None of them writes anything; the first three can be done right now.

1. **Confirm the CLI will not create the worker's invoker binding.** Already done, and it is the
   cheapest proof there is:
   `gcloud run services get-iam-policy commerceeventworker --region=europe-west2 --project eggcraft-studio`
   → `{ "etag": "ACAB" }`. An empty policy on a working task worker means the project-level grant is
   carrying it, and `ebay-connector@` will not have that. Read `fabricator.js:366-374` beside it.
2. **Settle the self-`actAs` question** in the console's Policy Troubleshooter, inputs in §3.5. No
   API enable, no write.
3. **Read the Amazon precedent** — `infra/amazon/main-project-side.sh` — beside the commands in this
   document. It is the same shape, it ran successfully two days ago, and its one redundancy is
   flagged below.
4. **After the SA and the five secrets exist, before the real deploy:**
   `firebase deploy --only functions:ebayEventWorker --dry-run` (the flag exists in
   `firebase-tools` 15.19.0 — *"perform a dry run of your deployment. Validates…"*). **Honest
   caveat: I have not established what the dry run validates.** It may or may not check secret IAM.
   Treat a clean dry run as weak positive evidence, never as proof.
5. **After the first deploy, with the connector switch still off:**
   ```
   gcloud run services get-iam-policy ebayeventworker --region=europe-west2 --project eggcraft-studio
   gcloud tasks queues get-iam-policy ebayEventWorker --location=europe-west2 --project eggcraft-studio
   gcloud secrets get-iam-policy EBAY_CALLBACK_KEY --project eggcraft-studio
   ```
   An empty Run policy on `ebayeventworker` is the confirmation that the §3.6 binding is missing.
   Then, as an in-app signal after the switch goes on: query `commerceEvents` for rows written by
   `worker.recordReceived` with `status: "queued"` that never progress — that is a dispatch 403 seen
   from the inside, and it is visible without any log-explorer access at all.

### 7.5 Two claims in existing documents that this proposal corrects

- **`docs/ebay-functions-deploy-plan.md:35-37` says the deployer must be granted
  `iam.serviceAccounts.actAs` on the new account.** That grant is required by Cloud Functions — see
  the commands section — but it is **already held and does not need to be created**:
  `user:contact@eggcraft.co.uk` holds `roles/owner`, which contains `iam.serviceAccounts.actAs`
  (verified against the live role definition, not from memory:
  `gcloud iam roles describe roles/owner --format='value(includedPermissions)' | grep serviceAccounts.actAs`),
  and it inherits to a service account created a second ago. The build identity is the compute
  default (`buildConfig.serviceAccount` on three live gen2 functions), which holds project-level
  `roles/iam.serviceAccountUser`. **The `actAs` that is genuinely new and genuinely needed is a
  different one: the eBay SA on itself, for the Cloud Tasks OIDC token (§3.5).**
- **`infra/amazon/main-project-side.sh` step 4 was redundant the day it ran.** It binds
  `roles/iam.serviceAccountUser` for the compute default on `amazon-caller@`, but the compute default
  had already held that role at **project** scope since 2026-09-02T11:24:47Z (audit log). It grants
  nothing new. Worth knowing before this proposal copies it as if it were load-bearing — it is kept
  below as deliberate belt-and-braces, not as a requirement.

### 7.6 The one thing I could not read at all

**Organization-level IAM deny policies.** A deny on `iam.serviceAccounts.create` or
`iam.serviceAccounts.actAs` at org `378239481010` would override everything in §6 and §7.5, and I
cannot see it:

```
$ gcloud iam policies list --attachment-point="cloudresourcemanager.googleapis.com/organizations/378239481010" --kind=denypolicies
ERROR: … Permission iam.googleapis.com/denypolicies.list denied
```

The **project** attachment point is clean — the same command against
`cloudresourcemanager.googleapis.com/projects/eggcraft-studio` returns no output — so no deny policy
is attached at the project. That does not rule out one inherited from the org. *To establish:* run
that command as a principal holding `roles/iam.denyReviewer` on the organization, or open IAM &
Admin → Deny in the console with org 378239481010 selected.

Creating a service account is at least not blocked by an org policy constraint:
`gcloud resource-manager org-policies describe constraints/iam.disableServiceAccountCreation --project eggcraft-studio --effective`
→ `booleanPolicy: {}`, i.e. not enforced.

---

---

# ▶ THE COMMANDS THAT WOULD CREATE IT — WRITTEN OUT, **NOT RUN**

Nothing below has been executed. Every line is a write. Read §7 first.

```bash
PROJECT=eggcraft-studio
REGION=europe-west2
SA=ebay-connector@$PROJECT.iam.gserviceaccount.com
COMPUTE=477037475099-compute@developer.gserviceaccount.com
```

### Step 1 — create the account (grants nothing)

```bash
gcloud iam service-accounts create ebay-connector --project="$PROJECT" \
  --display-name="Runs the eBay connector's seventeen functions"
```
*Creates an identity with zero permissions. Idempotent guard, the Amazon script's pattern:
`gcloud iam service-accounts describe "$SA" --project="$PROJECT" >/dev/null 2>&1 || <create>`.*

```bash
gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format='value(uniqueId,email)'
```
*Not a grant — **record this numeric `uniqueId` somewhere durable.** It is the only handle
`gcloud iam service-accounts undelete` accepts, and it is the difference between a 30-day recovery
and a rebuild. See the rollback section.*

### Step 2 — the three project-level roles

```bash
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA" --role=roles/datastore.user --condition=None --quiet
```
*Read, write and delete on the single Firestore database — **the whole database**; Firestore IAM has
no collection scope and Security Rules do not apply to the Admin SDK.*

```bash
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA" --role=roles/logging.logWriter --condition=None --quiet
```
*Lets the Cloud Run container write log entries. Both existing runtime identities hold it.*

```bash
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA" --role=roles/firebasecloudmessaging.admin --condition=None --quiet
```
*Sends the two order push notifications. Broader than the need: 9 permissions for the 1 used
(`cloudmessaging.messages.create`).*

**Optional tightening for step 2c, as a second step and not the first deploy** (see the caveat in
§3.3 — the code path is verified, the SDK's full permission set at runtime is not):

```bash
gcloud iam roles create nivadeskFcmSender --project="$PROJECT" \
  --title="FCM send only" \
  --description="cloudmessaging.messages.create and nothing else" \
  --permissions=cloudmessaging.messages.create --stage=GA
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA" --role="projects/$PROJECT/roles/nivadeskFcmSender" --condition=None --quiet
gcloud projects remove-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA" --role=roles/firebasecloudmessaging.admin --condition=None --quiet
```
*Replaces nine permissions with one. Do this only after a push has been observed arriving.*

### Step 3 — `actAs` on itself, at resource scope

```bash
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT" \
  --member="serviceAccount:$SA" --role=roles/iam.serviceAccountUser --quiet
```
*Lets the eBay functions name themselves in a Cloud Tasks OIDC token. Scoped to this one account —
**do not** copy the compute default's project-level version of this role, which is `actAs` over every
service account including `amazon-caller@`.*

### Step 4 — deployer / build `actAs` (**already satisfied; belt-and-braces**)

```bash
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT" \
  --member="serviceAccount:$COMPUTE" --role=roles/iam.serviceAccountUser --quiet
```
*Deploying a gen2 function with a non-default runtime SA **does** require the deploying principal to
hold `iam.serviceAccounts.actAs` on that SA. Both legs already hold it —
`contact@eggcraft.co.uk` via `roles/owner`, and the build SA (`477037475099-compute@`) via
project-level `roles/iam.serviceAccountUser` — so this command **grants nothing new today**. It is
the Amazon precedent's step 4, kept because it survives a future narrowing of that project binding.
Skipping it is defensible; running it is harmless.*

### Step 5 — the five secrets, created **EMPTY**, one accessor binding each

```bash
for S in EBAY_CLIENT_ID EBAY_CLIENT_SECRET EBAY_TOKEN_KEY EBAY_HASH_KEY EBAY_CALLBACK_KEY; do
  gcloud secrets create "$S" --project="$PROJECT" \
    --replication-policy=user-managed --locations="$REGION"
  gcloud secrets add-iam-policy-binding "$S" --project="$PROJECT" \
    --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor --quiet
done
```
*Creates each secret with no version, then grants read of its versions to `ebay-connector@` **and
nobody else** — the `AMAZON_INTENT_HMAC_KEY` shape exactly.*

**`gcloud secrets versions add` is deliberately not written here.** The values are pasted by the
operator in the Cloud console: `EBAY_CLIENT_SECRET` is the sandbox keyset's Cert ID and must never
appear in a shell history, a log or a chat; `EBAY_TOKEN_KEY`, `EBAY_HASH_KEY` and `EBAY_CALLBACK_KEY`
are 32 random bytes each (`openssl rand -hex 32`), generated on the machine and never printed to a
shared surface. `EBAY_CALLBACK_KEY` additionally goes into Hostinger's build environment as
`NIVADESK_EBAY_CALLBACK_KEY` — same value, two places, per
`docs/ebay-web-callback-deploy-plan.md:265`.

### Step 6 — **POST-DEPLOY ONLY.** These two resources do not exist until the first eBay deploy

```bash
gcloud run services add-iam-policy-binding ebayeventworker --region="$REGION" --project="$PROJECT" \
  --member="serviceAccount:$SA" --role=roles/run.invoker --quiet
```
*Lets Cloud Tasks dispatch an `ebay-connector@`-signed task into the worker. **Without this, tasks
enqueue successfully and are then dropped at dispatch — the silent failure of §7.2.** Scoped to one
service; project scope would be invoke rights on all 421.*

```bash
gcloud tasks queues add-iam-policy-binding ebayEventWorker --location="$REGION" --project="$PROJECT" \
  --member="serviceAccount:$SA" --role=roles/cloudtasks.enqueuer --quiet
```
*Lets the eBay functions create tasks on their own queue and no other. The compute default keeps
working through its project-level binding, so `releaseHeldIntegrationOrders` and `retryCommerceEvent`
need nothing added.*

### Verification pass (read-only, safe to run at any point)

```bash
gcloud projects get-iam-policy "$PROJECT" --flatten='bindings[].members' \
  --filter="bindings.members:serviceAccount:$SA" --format='value(bindings.role)'
gcloud iam service-accounts get-iam-policy "$SA" --project="$PROJECT"
for S in EBAY_CLIENT_ID EBAY_CLIENT_SECRET EBAY_TOKEN_KEY EBAY_HASH_KEY EBAY_CALLBACK_KEY; do
  echo "== $S"; gcloud secrets get-iam-policy "$S" --project="$PROJECT" --format='value(bindings.role,bindings.members)'
done
gcloud run services get-iam-policy ebayeventworker --region="$REGION" --project="$PROJECT"
gcloud tasks queues get-iam-policy ebayEventWorker --location="$REGION" --project="$PROJECT"
```

---

# ▶ ROLLBACK

### What deleting the SA does to already-deployed functions

**It breaks all seventeen, immediately and hard.** A Cloud Run revision stores the runtime service
account email in its spec; deleting the account does not rewrite the revision. Every one of the
seventeen services would then be unable to obtain credentials — Firestore, FCM and Cloud Tasks calls
fail with authentication errors, and depending on how early the failure lands, the container may fail
to start at all. The three Cloud Scheduler jobs would fail to mint their OIDC tokens. Any task
already sitting in the queue with an `ebay-connector@` OIDC token would fail at dispatch.

Two specific consequences that outrank "the connector stops working":

- **`ebayNotifications` is the eBay account-deletion endpoint, and it is deliberately ungated by the
  connector switch.** Breaking it is a compliance failure toward eBay, not a feature outage. Turning
  `NIVADESK_EBAY_CONNECTOR` off does **not** protect it.
- **Deleting and recreating the same name does not restore the grants.** The recreated account gets a
  new `uniqueId`; existing bindings that referenced the old one become inert
  `deleted:serviceAccount:…?uid=…` entries and do not transfer. Recreation means re-running every
  grant in this document.

A deleted account can be recovered within **30 days** with
`gcloud iam service-accounts undelete <uniqueId>` — which is why step 1 records that number. Beyond
30 days there is no recovery.

### The safe order — code first, IAM last

1. **Stop new work.** Unset `NIVADESK_EBAY_CONNECTOR`. Order imports stop; deletion compliance keeps
   running deliberately.
2. **Take the identity off the functions, in code.** Remove `functions/.ebay-secrets-ready` (and any
   `NIVADESK_EBAY_SECRETS_READY=1`) and redeploy the seventeen. `EBAY_RUNTIME` becomes `{}`, so the
   services move back to the compute default and mount no secret. This is the designed fail-safe:
   the eBay functions stay deployed and refuse (*"No eBay key is configured."*, callback 401,
   deletion endpoint 503) rather than crash. **After this step nothing runs as the eBay SA.**
3. **Verify that before touching IAM.**
   ```
   gcloud run services list --project eggcraft-studio --region europe-west2 \
     --format='value(metadata.name,spec.template.spec.serviceAccountName)' | grep -i ebay
   gcloud scheduler jobs describe firebase-schedule-reconcileEbayConnections-europe-west2 \
     --location=europe-west2 --project eggcraft-studio --format='value(httpTarget.oidcToken.serviceAccountEmail)'
   ```
   Every row must show `477037475099-compute@developer.gserviceaccount.com`.
4. **Drain the queue.** Confirm no task is left carrying the old OIDC identity:
   `gcloud tasks queues describe ebayEventWorker --location=europe-west2 --project eggcraft-studio`.
5. **Remove the resource-level bindings** (Run service, queue, the SA's own policy), then the
   per-secret accessor bindings, then the project-level roles — each with
   `remove-iam-policy-binding` mirroring the grant.
6. **Delete the account last:**
   `gcloud iam service-accounts delete "$SA" --project=eggcraft-studio`.
7. **The secrets are a separate decision, and the most irreversible one.** Deleting a secret destroys
   its versions. Leave them; an unused secret with one accessor binding costs nothing, and if the
   accessor is gone it is readable by nobody.

**The wrong order — deleting the SA while the functions still name it — takes the seventeen down
instantly, including the compliance endpoint, and cannot be undone by re-granting; it needs an
undelete within 30 days or a full recreate plus redeploy.**

**Partial rollback of just the step-6 bindings** (Run service and queue) is safe and cheap: it
degrades enqueue to the inline fallbacks and loses worker retries, exactly as described in §7.2. It
does not take anything down.

---

# ▶ RECOMMENDATION ON THE SA SHAPE

**Recommended: one service account for all seventeen — Option A, the shape already in the code — with
no code change as part of this approval.** This is a recommendation, not a decision; the reasoning is
below so it can be rejected on its merits.

**Why not two** (one for the two public `onRequest` functions, one for the rest): the code defeats
the split rather than taste doing so. The public edge is not thin — `ebayOAuthCallback` uses
`EBAY_CALLBACK_KEY` (`:742`), both client credentials for the token exchange, and `EBAY_TOKEN_KEY`
for boxing; `ebayNotifications` uses `EBAY_HASH_KEY` (`:1798`) and, when the enqueue fails, **falls
through to the full apply path inline** (`:1832-1839`) — order writes, restricted-customer writes,
FCM, everything the worker does. Removing that fallback to make the split real would remove a
deliberate safety net that is currently the only thing carrying the deletion path through the §7.3
window. The split would also require splitting `EBAY_SECRET_PARAMS`; a second SA that still mounts
all five secrets isolates nothing and doubles the IAM surface — two accessor sets, two `actAs`
bindings, two `run.invoker` bindings, two things to forget. And it would break the three committed
assertions that pin the one-line `EBAY_RUNTIME` shape and the single `EBAY_SERVICE_ACCOUNT`
constant.

**Why not none:** dropping the SA puts the five eBay secrets on the identity that runs every other
function in the project — every other connector's unauthenticated public endpoints and the ChatGPT
MCP surface included. That is precisely what `access-control-policy.md:145-170` exists to prevent,
and it fails the same two tests.

**The decisive argument is not the count.** Every failure mode in this proposal lives in the grant
list, not in how many accounts there are. Splitting into two does not fix the `run.invoker` gap — it
creates two of them.

**What Option A costs, stated plainly so the approval is informed:**

- Seven IAM grants that no tooling creates for you, **two of which are only grantable after the first
  deploy**, and one of which (`run.invoker` on the worker), if forgotten, loses eBay order events
  **silently**.
- A permanent second identity to remember. Any future non-eBay function that reaches into eBay
  internals hits the trap `releaseHeldIntegrationOrders` already hit once — which is why the
  trip-wire at `functions/test/qa/access-control-policy.test.js:203` exists.
- **Zero data-plane isolation.** Anyone reading "dedicated service account" in the policy will assume
  more than is true. That deserves one honest sentence in
  `docs/security/access-control-policy.md` §5.

Two follow-ups worth recording, both **out of scope for this IAM approval** and neither a
prerequisite for it: narrowing the per-function `secrets:` lists (§4.2 — a runtime blast-radius win,
not an IAM win, and it would take `EBAY_CALLBACK_KEY` out of `revealRestrictedCustomer`'s
environment), and the `invoker:` option on `ebayEventWorker` (§7.3 — removes the ordering trap, with
its own trade-offs).

---

## Appendix — commands used to establish the facts in this document

All read-only. Reproducible.

```
gcloud config get-value account / project
gcloud projects describe eggcraft-studio --format='value(projectNumber,parent.type,parent.id)'
gcloud iam service-accounts list --project eggcraft-studio --format='table(email,displayName,disabled)'
gcloud iam service-accounts describe ebay-connector@eggcraft-studio.iam.gserviceaccount.com --project eggcraft-studio
gcloud iam service-accounts get-iam-policy amazon-caller@eggcraft-studio.iam.gserviceaccount.com --project eggcraft-studio
gcloud projects get-iam-policy eggcraft-studio --flatten='bindings[].members' --filter='bindings.members:serviceAccount:477037475099-compute@developer.gserviceaccount.com' --format='value(bindings.role)'
gcloud run services list --project eggcraft-studio --region europe-west2 --format='value(metadata.name,spec.template.spec.serviceAccountName)'
gcloud run services get-iam-policy commerceeventworker --region=europe-west2 --project eggcraft-studio
gcloud tasks queues list --location=europe-west2 --project eggcraft-studio
gcloud tasks queues get-iam-policy commerceEventWorker --location=europe-west2 --project eggcraft-studio
gcloud secrets list --project eggcraft-studio --format='value(name)'
gcloud secrets get-iam-policy AMAZON_INTENT_HMAC_KEY --project eggcraft-studio
gcloud firestore databases list --project eggcraft-studio
gcloud iam roles describe roles/{owner,iam.serviceAccountUser,datastore.user,firebasecloudmessaging.admin,cloudtasks.enqueuer,run.invoker}
gcloud resource-manager org-policies describe constraints/iam.disableServiceAccountCreation --project eggcraft-studio --effective
gcloud iam policies list --attachment-point="cloudresourcemanager.googleapis.com/projects/eggcraft-studio" --kind=denypolicies
```

Secret Manager was read with `list` and `get-iam-policy` only. `versions access` was not run, on any
secret, at any point.

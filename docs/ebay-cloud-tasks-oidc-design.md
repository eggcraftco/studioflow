# `ebayEventWorker` — Cloud Tasks OIDC identity design

Written 7 September 2026 on branch `ebay-connector`, worktree `/Users/gocmen/Developer/studioflow-ebay`.
Companion to `docs/ebay-runtime-service-account-proposal.md` §3.4–§3.6, which this document replaces
as the authority on the queue path.

**Nothing here has been executed.** No service account, no role binding, no secret, no marker file,
no API enable, no deploy, no task. Every command in this document is written to be read and approved,
not run by the author.

**Read-window caveat, stated once and honoured throughout.** `gcloud` credentials expired before this
document was written and were deliberately not renewed. Every *live-project* fact below is quoted
from `docs/ebay-runtime-service-account-proposal.md`, which was written while credentials were live,
and is labelled as such. Everything new in this document is read out of the committed code and the
libraries on this machine — those reads are first-hand. Where a claim needed a live read I could not
make, it says so and gives the exact command. **§8 is the complete list of what is not established.**

Versions the library claims are read against, first-hand:

| Package | Version | Path |
|---|---|---|
| `firebase-admin` | 12.7.0 | `functions/node_modules/firebase-admin` |
| `firebase-functions` | 6.6.0 | `functions/node_modules/firebase-functions` |
| `firebase-tools` | 15.19.0 | `/opt/homebrew/lib/node_modules/firebase-tools` |

Labels, as in the parent proposal:

| Label | Means |
|---|---|
| **Established** | Read directly out of committed code or an installed library on this machine, file and line given. |
| **Quoted** | A live-project fact recorded in `ebay-runtime-service-account-proposal.md` while credentials were live. Re-verification command given where it matters. |
| **Open** | Not settled. Names the exact command, console page or experiment that would settle it. |

---

## 0. The shape of the problem in one paragraph

`ebayEventWorker` is the only eBay function nothing calls directly: it is reached only by Cloud Tasks
dispatching a task at it. A dispatch is an ordinary authenticated HTTPS request, and the identity on
it is **not** the identity of the function that enqueued — it is whatever service account the *task*
names in its OIDC token, which `firebase-admin` fills in silently from the enqueuer's metadata
server. Two different principals therefore need two different permissions on two different resources,
and neither is granted by the other. On top of that, `retryConfig: { maxAttempts: 1 }`
(`functions/index.js:34201`) means a rejected dispatch is not retried: it is dropped. So the whole
failure surface here is *quiet*. The rest of this document is about making it loud on purpose.

---

## 1. Who enqueues

### 1.1 The one door

**Established.** There is exactly one function that creates eBay tasks:

```js
// functions/index.js:6173-6181
const EBAY_QUEUE_FUNCTION = "ebayEventWorker";
async function enqueueEbayTask(task, delaySeconds = 0) {
  if (process.env.NIVADESK_E2E === "1" && global.__nivadeskEbayFakeEnqueue) return global.__nivadeskEbayFakeEnqueue(task, delaySeconds);
  const queue = getFunctions().taskQueue(`locations/europe-west2/functions/${EBAY_QUEUE_FUNCTION}`);
  await queue.enqueue(task, { scheduleDelaySeconds: Math.max(0, Math.round(delaySeconds)) });
}
```

`getFunctions` is `firebase-admin/functions` (`functions/index.js:7`), and the app is
`admin.initializeApp()` with **no options** (`functions/index.js:74`) — no `serviceAccountId`, and
`grep -rn "serviceAccountId" functions/*.js functions/commerce/` returns nothing. That matters in §2.

### 1.2 The five call sites, and the identity each will run as

**Established from code.** Three call sites reach `enqueueEbayTask` directly; two reach it through the
`enqueue` dependency injected into the connector factory at `functions/index.js:6218` (and its
E2E-only twin at `:6223`, which calls the same function when no fake is installed).

| # | Call site | Enclosing deployed function | Its options | **Identity after the change** |
|---|---|---|---|---|
| 1 | `index.js:34194` (`runEbayEventTask`, the worker's own retry) | `ebayEventWorker` — `index.js:34199-34206` | `region`, `retryConfig`, `rateLimits`, `...EBAY_RUNTIME` (`:34203`) | **`ebay-connector@`** |
| 2 | `ebayConnector.js:1832` (notification gateway, ORDER_CONFIRMATION) | `ebayNotifications` — `ebayConnector.js:1848` | `onRequest` wrapped at `index.js:6186`, which spreads `...EBAY_RUNTIME` | **`ebay-connector@`** |
| 3 | `ebayConnector.js:1642` (`driveDeletion`), reached from `:1810` | `ebayNotifications` — same function as row 2 | same | **`ebay-connector@`** |
| 4 | `ebayConnector.js:1642` (`driveDeletion`), reached from `:1721` (`reconcileDeletionRequests`) | `reconcileEbayDeletions` — `ebayConnector.js:1729-1731` | `onSchedule` wrapped at `index.js:6187`, which spreads `...EBAY_RUNTIME` | **`ebay-connector@`** |
| 5 | `index.js:15183` (eBay branch of the held-order release) | `releaseHeldIntegrationOrders` — `index.js:15008` | `{ region, timeoutSeconds: 300, secrets: [SHOPIFY_TOKEN_KEY] }` — **no `serviceAccount`** | **compute default** `477037475099-compute@` |
| 6 | `index.js:34230` (eBay branch of the manual retry) | `retryCommerceEvent` — `index.js:34212` | `{ region, secrets: [SHOPIFY_TOKEN_KEY, WOO_TOKEN_KEY, ...SQUARE_SECRETS], timeoutSeconds: 120 }` — **no `serviceAccount`** | **compute default** `477037475099-compute@` |

Rows 3 and 4 are the same source line reached from two different deployed functions; both run as the
eBay account, so they collapse into one identity but not into one failure story (§5.4).

### 1.3 **Yes — the queue is fed from both, and this is the central fact of the design**

`ebayEventWorker`'s queue receives tasks from **two runtime identities**:

- **`ebay-connector@eggcraft-studio.iam.gserviceaccount.com`** — the notification gateway, the
  deletion reconciliation, and the worker's own retry loop. This is the *provider-driven* traffic:
  every real eBay order event and every account-deletion redrive.
- **`477037475099-compute@developer.gserviceaccount.com`** — the held-order release and the
  owner-initiated retry. This is the *human-driven* traffic: a workspace owner clicking a button.

Neither can be moved to the other's identity without a code change:

- `releaseHeldIntegrationOrders` and `retryCommerceEvent` are not eBay functions. They mount the
  Shopify, Woo and Square keys (`index.js:15008`, `:34212`) and serve every provider; giving them the
  eBay SA would hand it those keys and would strip them of the accounts they use today.
- The three eBay enqueuers cannot use the compute default, because `EBAY_RUNTIME`
  (`index.js:140`) binds the identity and the five secrets together in one object: you cannot take
  one without the other.

**The consequence, and the reason this section exists:** every grant below has to be written twice —
once for each principal — or written once and understood to be leaning on a project-wide grant that
nobody has audited. §3 and §5 keep them separate throughout.

### 1.4 Today, all six run as the compute default

**Established.** `EBAY_RUNTIME` is `{}` unless `EBAY_SECRETS_READY` is true, and that is true only
when `NIVADESK_EBAY_SECRETS_READY=1` or `functions/.ebay-secrets-ready` exists on the deploying
machine (`index.js:135`, `:140`). **Quoted:** that file does not exist today. So "after the change"
in the table above means *after the marker file exists and a deploy has run* — not after the service
account is created. The two events are separable and the ordering matters (§6).

---

## 2. What identity the task carries

### 2.1 It comes from the metadata server, and there is no way to override it

**Established, three files, first-hand.**

```js
// functions/node_modules/firebase-admin/lib/functions/functions-api-client-internal.js:291-304
else {
    try {
        const account = await this.getServiceAccount();
        task.httpRequest.oidcToken = { serviceAccountEmail: account };
    }
    catch (e) { … }
}
```

`getServiceAccount()` (`:197-210`) delegates to `utils.findServiceAccountEmail(app)`:

```js
// functions/node_modules/firebase-admin/lib/utils/index.js:149-159
function findServiceAccountEmail(app) {
    const accountId = getExplicitServiceAccountEmail(app);   // options.serviceAccountId, or a ServiceAccountCredential's clientEmail
    if (accountId) return Promise.resolve(accountId);
    const credential = app.options.credential;
    if (credential instanceof credential_internal_1.ComputeEngineCredential) {
        return credential.getServiceAccountEmail();
    }
    return Promise.resolve(null);
}
```

and in this deployment neither explicit source applies — `admin.initializeApp()` takes no options
(`index.js:74`), so `options.serviceAccountId` is undefined and the credential is whatever
`getApplicationDefault` returns. **Established:**

```js
// functions/node_modules/firebase-admin/lib/app/credential-internal.js:399-411
function getApplicationDefault(httpAgent) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) { … }
    if (GCLOUD_CREDENTIAL_PATH) { … }
    return new ComputeEngineCredential(httpAgent);
}
```

`grep -rn "GOOGLE_APPLICATION_CREDENTIALS" functions/ --include="*.js"` (excluding `node_modules`)
returns nothing, and a Cloud Run container has no `~/.config/gcloud` credential file. So the branch
taken is `ComputeEngineCredential`, and:

```js
// functions/node_modules/firebase-admin/lib/app/credential-internal.js:35, 195-209
const GOOGLE_METADATA_SERVICE_ACCOUNT_ID_PATH = '/computeMetadata/v1/instance/service-accounts/default/email';
getServiceAccountEmail() { … this.buildRequest(GOOGLE_METADATA_SERVICE_ACCOUNT_ID_PATH) … }
```

**Answer: the OIDC service account on every eBay task is read from the metadata server — it is the
enqueuing container's own runtime service account, verbatim.** Cached per `FunctionsApiClient`
instance (`:198-199`) and per `ComputeEngineCredential` (`:196-197`), so the metadata call happens
once per container, not once per task.

### 2.2 There is no option that changes it

**Established.** The full set of task options `firebase-admin` 12.7.0 recognises is enumerated in
`validateTaskOptions` (`functions-api-client-internal.js:211-275`): `scheduleTime`,
`scheduleDelaySeconds`, `dispatchDeadlineSeconds`, `id`, `uri`, `headers`. **There is no
`serviceAccountEmail`, no `oidcToken`, no `audience`.** The struct is initialised with an empty
`oidcToken.serviceAccountEmail` at `:215-217` and filled only by `updateTaskPayload` from the
metadata server.

`enqueueEbayTask` passes only `{ scheduleDelaySeconds }` (`index.js:6180`), so even the options that
do exist are unused here.

**Therefore: the identity on the task is a consequence of *which function enqueued*, and nothing in
the eBay code can change it.** That is what makes §1.3 structural rather than incidental.

### 2.3 What the dispatch actually looks like

**Established.**

- The CreateTask call is `POST https://cloudtasks.googleapis.com/v2/projects/eggcraft-studio/locations/europe-west2/queues/ebayEventWorker/tasks`
  (`functions-api-client-internal.js:26-27`, `:130-141`), authorised with the enqueuer's own ADC
  token (`AuthorizedHttpClient`, `:46`).
- The queue's target URL is
  `https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayEventWorker`
  (`FIREBASE_FUNCTION_URL_FORMAT`, `:28`, applied at `:277-283`). Not the `run.app` URL — the
  `cloudfunctions.net` hostname, which for a gen2 function fronts the Cloud Run service
  `ebayeventworker` (lower-cased, as `commerceeventworker` is today).
- The body is `{"data": <task>}`, base64-encoded, `Content-Type: application/json`
  (`:212-224`). That exact envelope matters for the pre-flight in §7.

### 2.4 One branch that does *not* apply, recorded so nobody rediscovers it as a surprise

`updateTaskPayload` has an extensions branch (`:284-290`) that sets an `Authorization: Bearer` header
and **deletes** `oidcToken`. It is guarded on `validator.isNonEmptyString(extensionId)`, and
`enqueueEbayTask` never passes an extension id, so it is dead here. Recorded because someone reading
that file cold could conclude the OIDC token is optional. It is not, on this path.

---

## 3. The two distinct permissions, kept distinct

They are different verbs, held by different principals, on different resources, checked by different
services, at different times. Conflating them is the most likely way this goes wrong.

### 3.1 Enqueue

| | |
|---|---|
| **Permission** | `cloudtasks.tasks.create` |
| **Predefined role** | `roles/cloudtasks.enqueuer` |
| **Resource** | the **queue**: `projects/eggcraft-studio/locations/europe-west2/queues/ebayEventWorker` |
| **Held by** | the **enqueuing function's runtime SA** — both of them (§1.3) |
| **Checked by** | Cloud Tasks, synchronously, inside `await queue.enqueue(...)` |
| **When** | at `index.js:6180`, before the enqueuing function returns |

Grants needed:

```
roles/cloudtasks.enqueuer
  on  projects/eggcraft-studio/locations/europe-west2/queues/ebayEventWorker
  to  serviceAccount:ebay-connector@eggcraft-studio.iam.gserviceaccount.com     ← REQUIRED, new
  to  serviceAccount:477037475099-compute@developer.gserviceaccount.com          ← redundant today, see below
```

**Quoted:** the compute default already holds `roles/cloudtasks.enqueuer` at **project** scope, so
rows 5 and 6 of §1.2 work without any queue-level binding. Adding it at the queue anyway grants
nothing new today and removes a hidden dependency on a project-wide grant that a future tightening
might remove; the argument against is that it is a binding nobody needs, on a resource that did not
exist when the project grant was made. **Recommendation: bind only `ebay-connector@` at the queue,
and record in `docs/security/access-control-policy.md` that `releaseHeldIntegrationOrders` and
`retryCommerceEvent` reach this queue through the project-level grant.** A grant that exists is
cheaper to audit than a comment, but a grant that is invisible in the resource policy and load-bearing
is the actual hazard — and writing it down is what fixes that.

**Bind at the queue, not the project.** Project-level `cloudtasks.enqueuer` for `ebay-connector@`
would also let the eBay identity push tasks into `commerceEventWorker`, which is the Shopify, Woo and
Square worker. **Quoted:** `gcloud tasks queues list` returns exactly `commerceEventWorker` today —
so that is not a hypothetical second queue, it is the only other one.

### 3.2 Dispatch

| | |
|---|---|
| **Permission** | `run.routes.invoke` |
| **Predefined role** | `roles/run.invoker` |
| **Resource** | the **Cloud Run service**: `ebayeventworker` in `europe-west2` |
| **Held by** | the SA named in the task's **OIDC token** — i.e. the enqueuer's SA (§2.1), which is *both* of them |
| **Checked by** | Cloud Run's front door, at the moment of dispatch, before the container is reached |
| **When** | seconds to minutes after `enqueue()` already returned success |

Grants needed:

```
roles/run.invoker  (or a custom role holding only run.routes.invoke)
  on  the Cloud Run service ebayeventworker, region europe-west2
  to  serviceAccount:ebay-connector@eggcraft-studio.iam.gserviceaccount.com     ← REQUIRED, new
  to  serviceAccount:477037475099-compute@developer.gserviceaccount.com          ← RECOMMENDED, see below
```

**Here the second binding is not redundant in the same way, and I recommend making it.** **Quoted:**
the compute default holds project-level `roles/run.invoker`, so its tasks would dispatch without it.
But the failure mode if that project grant is ever narrowed is *silent loss of every held-order
release and every owner-clicked retry* (§5.3) — and unlike the enqueue side, that failure produces no
exception in any function. One binding on one service turns a project-wide dependency into a local
one, at the cost of a member line.

**Established: `firebase-tools` will not create either binding.** The invoker branch for
task-queue endpoints is conditional:

```js
// firebase-tools 15.19.0 lib/deploy/functions/release/fabricator.js:366-375
else if (backend.isTaskQueueTriggered(endpoint)) {
    const invoker = endpoint.taskQueueTrigger.invoker;
    if (invoker && !invoker.includes("private")) {
        … await run.setInvokerCreate(endpoint.project, serviceName, invoker) …
    }
}
```

and so is the queue-policy branch:

```js
// fabricator.js:699-709
async upsertTaskQueue(endpoint) {
    … cloudtasks.upsertQueue(queue) …
    if (endpoint.taskQueueTrigger.invoker) {
        … cloudtasks.setEnqueuer(queue.name, endpoint.taskQueueTrigger.invoker) …
    }
}
```

`ebayEventWorker`'s options are `region`, `retryConfig`, `rateLimits`, `...EBAY_RUNTIME`
(`index.js:34199-34204`) — **no `invoker`**. So `endpoint.taskQueueTrigger.invoker` is undefined and
**both branches are skipped.**

Contrast the scheduled functions, which the CLI *does* handle (`fabricator.js:382-389`): the three
`onSchedule` eBay functions get a `run.invoker` binding for `endpoint.serviceAccount` automatically.
Only the task queue is left to the operator.

### 3.3 The property that makes manual binding the right choice

**Established, and it is the argument for leaving `invoker` unset in code.**

Because neither branch runs, `firebase-tools` **never writes** the queue's IAM policy or the Run
service's IAM policy — not on the first deploy and not on any redeploy. Manual resource-level
bindings are therefore **stable across redeploys**.

If somebody sets `invoker: [EBAY_SERVICE_ACCOUNT]` to have the CLI create the bindings for them
(the option is real: `firebase-functions/lib/v2/providers/tasks.js:56-57, 87-88`), they inherit two
clobbering writes on **every** subsequent deploy:

```js
// firebase-tools lib/gcp/run.js:116-128 — setInvokerCreate
const bindings = [{ role: invokerRole, members: invokerMembers }];
const policy = { bindings, etag: "", version: 3 };
await setIamPolicy(serviceName, policy, httpClient);
```

— the whole Run policy is **replaced** by that one binding, and

```js
// firebase-tools lib/gcp/cloudtasks.js:105-113 — setEnqueuer
const policy = {
    bindings: existing.bindings.filter((binding) => binding.role !== ENQUEUER_ROLE),
    …
};
if (invokerMembers.length) policy.bindings.push({ role: ENQUEUER_ROLE, members: invokerMembers });
```

— every existing `roles/cloudtasks.enqueuer` binding on the queue is **dropped** and replaced.

So the recommended `477037475099-compute@` binding on the Run service (§3.2) would be silently
deleted by the next `firebase deploy`, and the queue's enqueuer list would be reset to exactly what
the code names. That is a trap that fires weeks later, on an unrelated deploy, with no warning.

**Recommendation: leave `ebayEventWorker`'s options as they are, and make both bindings by hand.**
This reverses the "cheaper alternative" floated in `ebay-runtime-service-account-proposal.md` §7.3;
the reversal is on the clobbering evidence above, which that section named as a caveat but did not
weigh against redeploy frequency.

### 3.4 The two are independent in both directions

Worth stating because the failure modes in §5 depend on it:

- **Enqueue without dispatch** → `enqueue()` succeeds, the task is accepted and stored, and it is
  destroyed at dispatch. This is the silent case.
- **Dispatch without enqueue** → no task is ever created, so nothing dispatches. This is the loud
  case: an exception in the enqueuing function.

Neither grant implies the other. `roles/cloudtasks.enqueuer` contains no Run permission;
`roles/run.invoker` contains no Cloud Tasks permission.

---

## 4. The actAs link

### 4.1 What the rule is

Creating a task whose `httpRequest.oidcToken.serviceAccountEmail` names service account **X** requires
the **caller of CreateTask** to hold `iam.serviceAccounts.actAs` on **X**. The caller is the enqueuing
function's runtime SA. The named account is, per §2.1, that same runtime SA.

So the required binding is, unusually, **reflexive**:

```
iam.serviceAccounts.actAs
  on   the service account resource ebay-connector@eggcraft-studio.iam.gserviceaccount.com
  to   serviceAccount:ebay-connector@eggcraft-studio.iam.gserviceaccount.com
```

and, for the compute-default enqueuers, `477037475099-compute@` needs `actAs` on
`477037475099-compute@` — which it has, because (**Quoted**) it holds `roles/iam.serviceAccountUser`
at **project** scope, which is `actAs` over every service account in the project including itself.

### 4.2 Is self-actAs implicit? **Open. It is not established, and the existing precedent cannot settle it.**

I did not settle this, and I will not assert either answer.

What I can say precisely is **why the working analogue proves nothing**. `commerceEventWorker` is fed
by enqueuers running as `477037475099-compute@`, naming `477037475099-compute@` in the OIDC token.
That enqueue succeeds today. But (**Quoted**) `477037475099-compute@` holds `roles/iam.serviceAccountUser`
at *project* scope, and (**Quoted**) its own service-account-resource policy is empty (`etag: ACAB`).
So the observation "commerce enqueues work" is consistent with **both** hypotheses:

- *H1: self-actAs is implicit* — the reflexive check passes for free, and the project binding is
  irrelevant.
- *H2: self-actAs is not implicit* — the project-scope `serviceAccountUser` grants `actAs` on every
  account including itself, and that is what is carrying it.

The two hypotheses are indistinguishable on this evidence. `ebay-connector@` will hold **no**
project-scope `serviceAccountUser`, so under H2 it fails and under H1 it works — which is exactly the
distinction the precedent cannot draw.

### 4.3 The clean control that exists in this project

**Quoted:** `amazon-caller@eggcraft-studio.iam.gserviceaccount.com` holds `roles/datastore.user` and
`roles/logging.logWriter` at project scope and `secretAccessor` on one secret — **no
`serviceAccountUser` at any scope** — and its own SA-resource policy carries one binding,
`roles/iam.serviceAccountUser` for the *compute default*, not for itself. It therefore has **no
explicit `actAs` on itself from any source**. It is the control `commerceEventWorker` is not.

(It never enqueues a task, so it is a control for the *IAM evaluation*, not for the Cloud Tasks
behaviour. That distinction is why §4.5 exists.)

### 4.4 The Policy Troubleshooter query that would settle the IAM half

**Console — no API enable, no write, and the recommended form:**

> IAM & Admin → **Policy Troubleshooter** → *Check access*
>
> | Field | Value |
> |---|---|
> | Principal | `amazon-caller@eggcraft-studio.iam.gserviceaccount.com` |
> | Resource | `//iam.googleapis.com/projects/eggcraft-studio/serviceAccounts/amazon-caller@eggcraft-studio.iam.gserviceaccount.com` |
> | Permission | `iam.serviceAccounts.actAs` |

Reading the result:

- **GRANTED** → self-actAs is implicit (H1). The reflexive binding in §4.6 is unnecessary. Grant it
  anyway or not, as the operator prefers; it changes nothing either way.
- **NOT GRANTED** → H2. The reflexive binding is **required**, and without it every one of the three
  eBay enqueuers throws at `index.js:6180`.

Run the same query a second time with principal *and* resource set to
`ebay-connector@eggcraft-studio.iam.gserviceaccount.com` **after** the account exists and **before**
the reflexive binding is made — that is the direct question rather than the analogue, and it costs
nothing.

**CLI equivalent, if the operator prefers it:**

```bash
# NOTE: requires `gcloud services enable policytroubleshooter.googleapis.com` first — that is a WRITE.
gcloud policy-troubleshoot iam \
  //iam.googleapis.com/projects/eggcraft-studio/serviceAccounts/amazon-caller@eggcraft-studio.iam.gserviceaccount.com \
  --principal-email=amazon-caller@eggcraft-studio.iam.gserviceaccount.com \
  --permission=iam.serviceAccounts.actAs \
  --project=eggcraft-studio
```

**The honest limit of this query.** Policy Troubleshooter evaluates allow and deny *policies*. If
Google implements self-actAs as a built-in behaviour of the IAM check rather than as a binding,
Troubleshooter can return NOT GRANTED for a call that would nevertheless succeed. So:

- **GRANTED is conclusive** — the permission is there.
- **NOT GRANTED is not conclusive** — it means "no policy grants it", which is a reason to make the
  binding, not proof that the call would fail.

Either way the operational conclusion is the same, which is §4.6.

### 4.5 The empirical test that settles the *behaviour*, not just the policy

This is the only test that answers the real question. It is the second half of the pre-flight (§7.4,
step B) and is listed here because it belongs to this section logically:

```bash
# Run BEFORE making the reflexive binding, as the operator, from their own terminal.
gcloud tasks create-http-task \
  --project=eggcraft-studio --location=europe-west2 --queue=ebayEventWorker \
  --url='https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayEventWorker' \
  --method=POST \
  --header='Content-Type: application/json' \
  --body-content='{"data":{"key":"ebay|preflight|actas","provider":"ebay","connectionId":"__preflight__","companyId":"__preflight__","entityType":"order","externalId":"0","eventType":"preflight","attempt":1}}' \
  --oidc-service-account-email=ebay-connector@eggcraft-studio.iam.gserviceaccount.com \
  --impersonate-service-account=ebay-connector@eggcraft-studio.iam.gserviceaccount.com
```

`--impersonate-service-account` makes gcloud mint and use an access token **for** `ebay-connector@`,
so the CreateTask call is authenticated as that account — the same principal production will use —
while `--oidc-service-account-email` names the same account in the token, exactly as
`firebase-admin` would. **This reproduces the production enqueue leg precisely, including the
reflexive actAs check.**

- Succeeds without the reflexive binding → self-actAs is implicit, behaviourally, for this API.
- Fails `PERMISSION_DENIED` mentioning `iam.serviceAccounts.actAs` → the binding is required. Make it
  and re-run; it must then succeed.

**Open, and it gates this test:** whether `user:contact@eggcraft.co.uk`'s `roles/owner` includes
`iam.serviceAccounts.getAccessToken`, which impersonation needs. `roles/owner` is known to include
`iam.serviceAccounts.actAs` (**Quoted**, verified live against the role definition in the parent
proposal), but `getAccessToken` was not checked. Settle it read-only with:

```bash
gcloud iam roles describe roles/owner --format='value[](includedPermissions)' \
  | tr ',;' '\n\n' | grep 'iam.serviceAccounts.getAccessToken'
```

If it is absent, the operator grants themselves `roles/iam.serviceAccountTokenCreator` on
`ebay-connector@` for the duration of the pre-flight and removes it afterwards — a resource-scoped,
reversible, single-account grant.

### 4.6 The recommendation, which does not wait for the answer

**Make the reflexive binding.** It is correct under H1 (where it is a no-op) and necessary under H2.
It is resource-scoped to one service account whose only member is that same account, so it grants
nothing to anybody else and widens nothing.

```
# resource-scoped, one member, that member being the resource itself
roles/iam.serviceAccountUser
  on  projects/eggcraft-studio/serviceAccounts/ebay-connector@eggcraft-studio.iam.gserviceaccount.com
  to  serviceAccount:ebay-connector@eggcraft-studio.iam.gserviceaccount.com
```

**Tighter option, if the operator wants the minimum.** `roles/iam.serviceAccountUser` is understood to
carry `iam.serviceAccounts.actAs` plus `get`/`list` and `resourcemanager.projects.get`/`list`; a
custom role holding only `iam.serviceAccounts.actAs` is the exact need. **Open — I did not read the
live role definition in this window.** Command:

```bash
gcloud iam roles describe roles/iam.serviceAccountUser --format='value[](includedPermissions)'
```

Use the predefined role for the first deploy and tighten afterwards, for the same reason §3.3 of the
parent proposal gives about the FCM role: a custom role that turns out to be one permission short
fails in exactly the silent way this whole document is about.

**What must NOT be copied.** The compute default's shape — `roles/iam.serviceAccountUser` at
**project** scope — is `actAs` over every service account in `eggcraft-studio`, `amazon-caller@`
included. The eBay binding is resource-scoped for that reason and must stay that way.

---

## 5. The failure mode, written out

This is the section that matters. For each missing grant: the HTTP status, whether anything is
logged, whether it is retried, and where the event ends up.

Two facts govern every row.

**Fact 1 — Established.** `retryConfig: { maxAttempts: 1 }` (`index.js:34201`) is copied onto the
Cloud Tasks queue by `firebase-tools`:

```js
// lib/gcp/cloudtasks.js:141-142
if (endpoint.taskQueueTrigger.retryConfig) {
    proto.copyIfPresent(queue.retryConfig, endpoint.taskQueueTrigger.retryConfig, "maxAttempts", "maxDoublings");
```

overriding `DEFAULT_SETTINGS.retryConfig.maxAttempts = 3` (`:26-38`). One attempt. A failed dispatch
is not retried; the task is deleted.

**Fact 2 — Established.** The queue is created with **no `stackdriverLoggingConfig`** at all:
`DEFAULT_SETTINGS` (`lib/gcp/cloudtasks.js:26-38`) contains only `rateLimits`, `state` and
`retryConfig`, and `queueFromEndpoint` (`:133-148`) adds nothing else. So the queue takes the Cloud
Tasks API default sampling ratio. **Open:** I believe that default is `0.0` — i.e. **no dispatch
attempt is logged at all** — but I could not read the live default in this window. Settle it, and fix
it, with:

```bash
gcloud tasks queues describe ebayEventWorker --location=europe-west2 --project=eggcraft-studio \
  --format='value(stackdriverLoggingConfig.samplingRatio)'
gcloud tasks queues update ebayEventWorker --location=europe-west2 --project=eggcraft-studio \
  --log-sampling-ratio=1.0      # a WRITE; recommended for the rollout window, reversible
```

**A redeploy will not undo that.** `upsertQueue` → `updateQueue` sends
`updateMask: proto.fieldMasks(queue)` (`lib/gcp/cloudtasks.js:48-53`), and the queue object it builds
has no `stackdriverLoggingConfig` field, so that field is not in the mask and is left untouched.
Established.

### 5.1 Missing: `roles/cloudtasks.enqueuer` on the queue, for `ebay-connector@`

**Status:** CreateTask returns **HTTP 403 `PERMISSION_DENIED`**. `firebase-admin` maps it
(`functions-api-client-internal.js:307-322`, mapping table `:325-335`) to a `FirebaseFunctionsError`
with code `permission-denied`, message from the API body. `await queue.enqueue(...)` at
`index.js:6180` **rejects**.

**Retried:** no task was ever created, so Cloud Tasks is not involved. Whether the *work* is retried
depends entirely on the call site — and the four eBay call sites behave four different ways:

| Call site | Caught? | What the operator sees | Where the event ends up |
|---|---|---|---|
| `ebayConnector.js:1832` — notification gateway | **Yes**, `try/catch` inline | `console.error("ebay notifications enqueue failed, applying inline:", …)` | **Survives.** `processEbayCommerceTask` runs inline in the gateway (`:1834`). But `ebayNotifications` has `timeoutSeconds: 30` (`:1848`) and the ORDER_CONFIRMATION response is only sent at `:1837`, *after* the loop — a slow inline apply blows the 30s budget, eBay gets a 5xx and redelivers. Degraded, not lost. |
| `ebayConnector.js:1642` — `driveDeletion`, from the gateway `:1810` | **Yes** | `console.warn("ebay deletion enqueue failed, running inline:", …)` | **Survives, awkwardly.** eBay already got its 200 at `:1809`. The inline path races a 40s timeout (`:1645`) inside a function whose own budget is 30s — the container is killed first, the ledger row stays `queued` with `leaseUntilMs = now + 5 min` (`:1675`), and `reconcileEbayDeletions` picks it up after the lease expires. |
| `ebayConnector.js:1642` — `driveDeletion`, from `reconcileDeletionRequests` `:1721` | **Yes** | same warn line | **Survives.** `reconcileEbayDeletions` has `timeoutSeconds: 300` (`:1730`), so the 40s inline race fits. |
| **`index.js:34194` — the worker's own retry** | **No.** No `try`, no fallback. | `logger.error("Unhandled error", err)` from `firebase-functions/lib/common/providers/tasks.js` (see §5.5), then HTTP 500 | **Lost.** The rejection propagates out of `runEbayEventTask` (`:34181-34197`) and out of the handler (`:34204-34206`). Cloud Tasks records one failed attempt; `maxAttempts: 1` drops the task. The `commerceEvents` row remains at whatever `processCommerceEvent` last wrote — `status: "retrying"` with `next_retry_at` set — **and nothing will ever come back for it.** |

**How to recognise it:** three of four sites log a distinctive line. The fourth leaves a
`commerceEvents` document stuck at `status: "retrying"` past its `next_retry_at`. That query is the
detection signal and needs no log access:

```
commerceEvents where provider == "ebay" and status == "retrying" and next_retry_at < <now - 1h>
```

**Rows 5 and 6 of §1.2 are unaffected** by this particular missing grant, because the compute default
holds project-level enqueuer. That asymmetry is the fingerprint: *provider-driven eBay traffic fails,
owner-clicked buttons work.*

### 5.2 Missing: `iam.serviceAccounts.actAs` on `ebay-connector@`, for `ebay-connector@`

**Identical to §5.1 in every observable respect** — same 403 on the same call, same
`permission-denied`, same four call-site behaviours, same detection query.

**The only discriminator is the API error message**, which names the service account and the
`actAs` permission rather than the queue and `cloudtasks.tasks.create`. It appears in the
`console.error`/`console.warn` lines above, truncated to 120 characters (`ebayConnector.js:1832`,
`:1644`) — long enough to carry `PERMISSION_DENIED` and the permission name, which is why those
truncations are adequate.

Recorded separately from §5.1 because the *fix* is different and an operator who has already
confirmed the queue binding will otherwise re-check the wrong resource.

### 5.3 Missing: `roles/run.invoker` on the `ebayeventworker` service. **This is the bad one.**

**Status at enqueue: 200. The enqueue succeeds.** Cloud Tasks accepts and stores the task. The
enqueuing function returns normally, logs nothing, and reports success to its caller.

**Status at dispatch: HTTP 403**, returned by Cloud Run's front door to Cloud Tasks. The container is
never started. **The handler does not run, so no line of application code executes and no application
log is written** — including the `logger.error("Unhandled error", …)` that would otherwise be the
tell.

**Retried: no.** One attempt, then the task is deleted (Fact 1).

**Logged: possibly nothing at all** (Fact 2). If the queue's sampling ratio is 0, Cloud Tasks emits no
dispatch log. Cloud Run *request* logs are emitted by the infrastructure rather than by the runtime
service account, so a 403 at the door is **expected** to appear there — **Open: I could not verify
that IAM-denied requests reach `run.googleapis.com/requests` for this service.** Do not build the
runbook on it.

**Where the event ends up, per source:**

| Source | The durable trace it leaves | Outcome |
|---|---|---|
| Notification gateway, `ebayConnector.js:1829-1833` | `commerceEvents/<key>` written at `:1830` with `status: "queued"`; the gateway pushed `result: "queued"` at `:1833` and answered eBay `200 {ok:true, results:[…]}` at `:1837` | **The order is lost and eBay will not redeliver**, because we told it we had the event. The row sits at `queued` until `expireAt` deletes it — `EVENT_TTL_MS = 14 days` (`functions/commerce/events.js:15`). |
| Worker's own retry, `index.js:34194` | `commerceEvents/<key>` at `status: "retrying"` with `next_retry_at` | Lost. Same as §5.1's fourth row, reached a different way. |
| Account deletion, `driveDeletion` returning `{queued: true}` | ledger row `status: "queued"`, `leaseUntilMs = now + 5 min` (`ebayConnector.js:1675`) | **An invisible infinite loop — see below.** |
| Held-order release, `index.js:15181-15183` | held row gets `releaseQueuedAtMs` + `releaseTaskKey`; `commerceEvents` row `queued` | Unaffected *today*: the task carries the compute default's OIDC token, which has project-level `run.invoker`. Becomes lost the day that project grant is narrowed — which is the argument in §3.2 for binding the compute default at the service. |
| Manual retry, `index.js:34230` | `commerceEvents` row `queued`; the callable returned `{ok: true, queued: true, status: "queued"}` (`:34231`) | Same as above: the owner is told it worked. |

**The account-deletion loop, spelled out, because it is the worst-behaved path in the system.**

1. `reconcileDeletionRequests` finds the row (`ebayConnector.js:1696-1703`), sets
   `leaseUntilMs`, `lastRedeliveryAtMs`, `reconciledAtMs` (`:1720`), and calls `driveDeletion`.
2. `driveDeletion` enqueues successfully and returns `{ queued: true }` (`:1642`). **It writes
   nothing** on the success path.
3. The dispatch 403s. `processEbayBuyerDeletion` never runs, so its catch block at `:1626` — the
   **only** place `attempts` is ever incremented — never executes. `attempts` stays at the `0` that
   `claimDeletion` wrote on first receipt (`:1679`). Note that a genuine eBay *redelivery* does not
   reset it either — the redelivery branch at `:1676` merges `redeliveries` and the lease, and leaves
   `attempts` alone — so the counter is stuck at 0 by every route.
4. Ten minutes later the sweep runs again. The backoff at `:1706` is
   `min(5 min × max(1, attempts), 6 h)` = **5 minutes, forever**, because `attempts` never grows.
5. The stuck alarm at `:1716` — `if (attempts >= MAX_DELETION_ATTEMPTS * 2)`, i.e. `>= 12`
   (`MAX_DELETION_ATTEMPTS = 6`, `:101`) — **can never fire.**
6. `console.log` at `:1725` reports `redriven: 1` every pass. That is the *only* output, it looks
   like healthy activity, and the row's `expireAt` is 400 days out (`LEDGER_TTL_MS`, `:81`).

So a missing `run.invoker` turns eBay's account-deletion compliance obligation into a row that is
re-driven every ten minutes for over a year, reports success each time, never completes, and never
raises an alarm. **This is the single most important sentence in this document.**

**How to recognise it, in order of reliability:**

1. **Cloud Monitoring, the claim-free signal.** Cloud Tasks queue attempt counts broken down by
   response code, for queue `ebayEventWorker`. A queue whose attempts are all `403` and whose task
   count returns to zero is unambiguous. **Open — confirm the metric name in Metrics Explorer;
   `cloudtasks.googleapis.com/queue/task_attempt_count` with a `response_code` label is the one to
   look for, and I could not verify it live.**
2. **The Run service's IAM policy is empty.** **Quoted**, and this is the cheapest proof there is:
   `gcloud run services get-iam-policy commerceeventworker --region=europe-west2 --project eggcraft-studio`
   returns `{ "etag": "ACAB" }` today — an empty policy on a *working* task worker, which is only
   possible because the project-level grant is carrying it. Run the same command against
   `ebayeventworker` after deploy; an empty policy there means this grant is missing.
3. **From inside the app, no log access needed.** `commerceEvents` rows with
   `provider == "ebay"` and `status == "queued"` whose `started_at` is more than a few minutes old.
   A dispatch that works moves the row to `processing` within seconds (`worker.js:28`). A row stuck at
   `queued` **is** a dispatch failure, seen from the inside.
4. **The deletion ledger.** `ebayDeletionRequests` rows with `status == "queued"`, `attempts == 0`
   and a `redeliveries`/`reconciledAtMs` that keeps advancing. `attempts == 0` with a growing
   `reconciledAtMs` is the loop signature and cannot mean anything else.

### 5.4 Missing: `roles/logging.logWriter` — the interlock nobody expects

Not a Cloud Tasks grant, but it changes what every row above looks like. The runtime SA writes the
container's logs; without `logWriter`, the `console.error` lines in §5.1 and the
`logger.error("Unhandled error", …)` in §5.5 **do not reach Cloud Logging**. The operator would then
see the §5.1 pattern (a caught, logged, survivable failure) as if it were the §5.3 pattern (nothing at
all), and would go looking at the wrong resource.

**Grant `logging.logWriter` before running the pre-flight**, or the pre-flight's own pass signal
(§7.5) disappears.

### 5.5 What a *successful* dispatch looks like, so the pass signal is unambiguous

**Established**, `firebase-functions/lib/common/providers/tasks.js`, `onDispatchHandler`:

- The request must be `POST`, `Content-Type: application/json`, with a body whose only key is `data`
  (`https.js:98-131`, `isValidRequest`). Otherwise: `logger.error("Invalid request, unable to process.")`
  and **HTTP 400**.
- Outside the emulator, an `Authorization: Bearer …` header is required; without one the handler
  throws `unauthenticated` → **HTTP 401**. The library's own comment on that branch reads *"this
  should never happen since task queue functions are guarded by IAM"* — and it does not verify the
  token, it decodes it unsafely (`unsafeDecodeIdToken`) for context. **The authorisation decision is
  made entirely by Cloud Run's front door, not by this code.** That is why §3.2 is load-bearing and
  why a 401 is essentially unreachable in production: a request with no token is stopped at 403 first.
- Handler returns normally → `res.status(204).end()`.
- Handler throws a non-`HttpsError` → `logger.error("Unhandled error", err)` and **HTTP 500**
  (`internal` → 500, `https.js:64`).

| Observed | Means |
|---|---|
| **403**, no application log, no container start | `run.invoker` missing on the service for the SA the token names — §5.3 |
| **401** | no Authorization header at all — not reachable while the service is IAM-guarded; a private-service misconfiguration |
| **400**, `"Invalid request, unable to process."` | body shape wrong — a hand-made task, not a production one |
| **500**, `"Unhandled error"` + the thrown error | **the request reached the container.** IAM is correct. |
| **204** | full success |

---

## 6. The ordering problem

**Neither resource exists before the first deploy.** The queue `ebayEventWorker` is created by
`firebase-tools` during the deploy (`fabricator.js:699-703` → `cloudtasks.upsertQueue` →
`createQueue`, `lib/gcp/cloudtasks.js:54-73`), and the Cloud Run service `ebayeventworker` is created
by the same deploy. So `cloudtasks.enqueuer` on the queue and `run.invoker` on the service are
**post-deploy** bindings, unavoidably.

**And the identity and the secrets are welded together.** `EBAY_RUNTIME` is
`{ secrets, serviceAccount }` or `{}` (`index.js:140`) — there is no state in which the worker
deploys under `ebay-connector@` without the five secrets mounted. So the five secrets, their
`secretAccessor` bindings, and the marker file all precede any test of the queue path.

This is what §7 is built around: get the window down to one function.

---

## 7. A cheap pre-flight

The goal: **prove that a task enqueued as `ebay-connector@` is dispatched into `ebayEventWorker` and
reaches application code — before any eBay traffic depends on it — without deploying the connector.**

### 7.1 Why it is cheap: deploy one function, not seventeen

`ebayEventWorker` is the **only** one of the seventeen that is safe to deploy alone:

- It is not a public endpoint (unlike `ebayOAuthCallback`, `ebayNotifications`).
- It creates no Cloud Scheduler job (unlike the three `onSchedule` functions, which begin firing
  immediately — `docs/ebay-functions-deploy-plan.md` step 2).
- It is not callable from any client.
- **With none of the other sixteen deployed, nothing in the project can enqueue to it.** The only
  tasks it will ever see are the ones the operator creates by hand.

It does create the Cloud Tasks queue, which is exactly the resource the pre-flight needs.

Rollback is deletion, and it is two commands
(`docs/ebay-functions-deploy-plan.md`, *Rollback — deletion, not revert*):

```bash
firebase functions:delete ebayEventWorker --project eggcraft-studio --region europe-west2 --force
gcloud tasks queues delete ebayEventWorker --project eggcraft-studio --location europe-west2
```

### 7.2 Order of operations

| Step | Action | Why here |
|---|---|---|
| 1 | Create the five secrets (`docs/ebay-functions-deploy-plan.md` step 1) | `EBAY_RUNTIME` needs them |
| 2 | Create `ebay-connector@`; grant `datastore.user`, `logging.logWriter`, `firebasecloudmessaging.*` at project scope and `secretAccessor` on the five secrets | the pre-deploy grants from the parent proposal; **`logging.logWriter` is required for the pass signal** (§5.4) |
| 3 | **Run the §4.4 Policy Troubleshooter query** for `ebay-connector@` on itself | free, and it predicts step 6's outcome |
| 4 | Make the reflexive `actAs` binding — **or deliberately skip it** to run the §4.5 experiment first | §4.6 |
| 5 | Create `functions/.ebay-secrets-ready`, then deploy **`ebayEventWorker` alone**: `firebase deploy --project eggcraft-studio --only functions:ebayEventWorker` | creates the queue and the Run service; nothing can call it |
| 6 | `gcloud tasks queues update ebayEventWorker --location=europe-west2 --project=eggcraft-studio --log-sampling-ratio=1.0` | Fact 2 — turns dispatch logging on for the window; survives redeploys (§5, Fact 2) |
| 7 | Bind `roles/cloudtasks.enqueuer` on the queue and `roles/run.invoker` on the service, per §3 | the two resources now exist |
| 8 | **Run test A, then test B** (§7.3, §7.4) | |
| 9 | Deploy the other sixteen; turn the connector switch on separately | `docs/ebay-functions-deploy-plan.md` steps 2-7 |

### 7.3 Test A — dispatch only

Isolates §3.2 from §3.1 and §4. The operator creates the task under **their own** credentials
(owner), so no eBay-account permission is exercised on the enqueue side; only the OIDC token names
`ebay-connector@`.

```bash
gcloud tasks create-http-task \
  --project=eggcraft-studio --location=europe-west2 --queue=ebayEventWorker \
  --url='https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayEventWorker' \
  --method=POST \
  --header='Content-Type: application/json' \
  --body-content='{"data":{"key":"ebay|preflight|A","provider":"ebay","connectionId":"__preflight__","companyId":"__preflight__","entityType":"order","externalId":"0","eventType":"preflight","attempt":1}}' \
  --oidc-service-account-email=ebay-connector@eggcraft-studio.iam.gserviceaccount.com
```

### 7.4 Test B — the whole production path

Identical, plus impersonation, so the CreateTask call itself is authenticated as `ebay-connector@`.
This is the only test that exercises `cloudtasks.tasks.create` **and** the reflexive `actAs` **and**
`run.routes.invoke` in the arrangement production uses. See §4.5 for the command and its
`getAccessToken` prerequisite.

Run B **before** the reflexive binding of step 4 if the operator wants the H1/H2 answer; otherwise
run it after and treat a pass as sufficient.

### 7.5 What the payload does, and why this exact payload

**Established, traced end to end.** The task carries `entityType: "order"` and
`connectionId: "__preflight__"`.

1. `ebayEventWorker`'s handler calls `runEbayEventTask(request.data)` (`index.js:34204-34205`).
2. `runEbayEventTask` calls `processEbayCommerceTask` (`index.js:34182`).
3. `processEbayCommerceTask` (`ebayConnector.js:1530-1536`): `entityType` is not `buyer_deletion`, so
   it reads `ebayConnections/__preflight__` (`:1532`). The document does not exist, so `data` is
   `null`, and `:1534` throws
   `classedError("connection_missing", "validation", "connection")`.
4. The throw happens **before** the health-touch block (`index.js:34183-34191`), so **nothing is
   written to Firestore.** No `commerceEvents` row, no `commerceHealth` row, no cleanup needed.
5. `onDispatchHandler` catches it, emits `logger.error("Unhandled error", err)` and returns
   **HTTP 500** (§5.5).
6. Cloud Tasks records one failed attempt and, with `maxAttempts: 1`, deletes the task. **The queue
   returns to empty by itself.**

The payload is chosen so that the *only* effect of a successful pre-flight is one ERROR log line and
one deleted task. It touches no workspace, creates no document, sends no push, and contacts eBay not
at all.

### 7.6 Reading the result

```bash
# the application log — the pass signal
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="ebayeventworker" AND timestamp>="<T0>"' \
  --project eggcraft-studio --limit 50 --format='value(timestamp,severity,textPayload,jsonPayload.message)'

# the queue: it must drain back to zero
gcloud tasks queues describe ebayEventWorker --location=europe-west2 --project=eggcraft-studio

# the service policy: after step 7 this must NOT be `{ "etag": "ACAB" }`
gcloud run services get-iam-policy ebayeventworker --region=europe-west2 --project eggcraft-studio
gcloud tasks queues get-iam-policy ebayEventWorker --location=europe-west2 --project=eggcraft-studio
```

| Result | Verdict |
|---|---|
| An ERROR log reading `Unhandled error` with `connection_missing` | **PASS.** Enqueue, actAs and dispatch all work; the request reached application code. |
| Test A creates the task but no log appears and the queue drains anyway | Dispatch 403 — `run.invoker` missing on the service. §5.3. |
| Test A passes, test B fails at `create-http-task` with `PERMISSION_DENIED` | Enqueue-side: `cloudtasks.enqueuer` on the queue (§5.1) or reflexive `actAs` (§5.2). The error message names which. |
| Test B's `PERMISSION_DENIED` names `iam.serviceAccounts.getAccessToken` | The **operator** lacks impersonation rights, not the SA. §4.5. |
| No log, and the queue policy readback shows the bindings are present | Suspect `logging.logWriter` (§5.4) before re-diagnosing IAM; fall back to the Cloud Tasks response-code metric. |

### 7.7 The one thing this pre-flight does not cover

It proves the **queue path**. It does not prove `firebasecloudmessaging` (unreachable while the
connector switch is off — parent proposal §3.3), and it does not prove the secret mounts beyond the
fact that the function started. Those are separate checks and stay in
`docs/ebay-functions-deploy-plan.md`.

---

## 8. Everything in this document that is NOT established

Listed together so no reader has to hunt for the caveats.

| # | Claim | Why it is open | What settles it |
|---|---|---|---|
| 1 | Whether a service account has implicit `actAs` on itself | The only live analogue is contaminated by a project-scope `serviceAccountUser` (§4.2) | §4.4 Policy Troubleshooter on `amazon-caller@`, and definitively §4.5 test B |
| 2 | Whether `roles/owner` includes `iam.serviceAccounts.getAccessToken` | Not read in this window; `actAs` was (**Quoted**), `getAccessToken` was not | `gcloud iam roles describe roles/owner …` — §4.5 |
| 3 | The exact permission list of `roles/iam.serviceAccountUser` | Not read live; the custom-role tightening in §4.6 depends on it | `gcloud iam roles describe roles/iam.serviceAccountUser …` |
| 4 | The Cloud Tasks API's default `stackdriverLoggingConfig.samplingRatio` | `firebase-tools` sets none (Established); the API default was not read | `gcloud tasks queues describe … --format='value(stackdriverLoggingConfig.samplingRatio)'` — §5, Fact 2 |
| 5 | Whether an IAM-denied dispatch appears in `run.googleapis.com/requests` | Infrastructure behaviour, not code | Observe it during test A with the binding deliberately absent |
| 6 | The exact Cloud Monitoring metric name for queue attempts by response code | Not verified live | Metrics Explorer, resource `cloud_tasks_queue` — §5.3 |
| 7 | Exact `gcloud tasks create-http-task` flag spellings | gcloud not runnable in this window | `gcloud tasks create-http-task --help` before running §7.3 |
| 8 | Every live-project fact marked **Quoted** | Read while credentials were live, on 7 Sep; not re-read | The commands are already written out in `docs/ebay-runtime-service-account-proposal.md` |

Nothing in §1, §2, §5.5 or §7.5 is on this list: those are read out of committed code and installed
libraries on this machine, with file and line given, and they are the parts the design rests on.

---

## 9. Summary of the grants this document asks for

Three, on three different resources, none of which the CLI will make for you (§3.2).

| # | Role | Resource | Member | Class | When |
|---|---|---|---|---|---|
| 1 | `roles/cloudtasks.enqueuer` | queue `projects/eggcraft-studio/locations/europe-west2/queues/ebayEventWorker` | `ebay-connector@` | required | **post-deploy** |
| 2 | `roles/run.invoker` | Cloud Run service `ebayeventworker`, `europe-west2` | `ebay-connector@` | required | **post-deploy** |
| 2b | `roles/run.invoker` | same service | `477037475099-compute@` | recommended, §3.2 | post-deploy |
| 3 | `roles/iam.serviceAccountUser` | service account `ebay-connector@` | `ebay-connector@` (itself) | required-or-no-op, §4.6 | **pre-deploy** |

Plus one non-IAM change for the rollout window: `--log-sampling-ratio=1.0` on the queue (§5, Fact 2).

And one code decision, which is to **change nothing**: leave `invoker` unset in `ebayEventWorker`'s
options, so `firebase-tools` never rewrites either policy and the manual bindings survive every
redeploy (§3.3).

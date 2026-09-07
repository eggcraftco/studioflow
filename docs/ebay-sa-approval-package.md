# eBay connector — service account, Cloud Tasks identity and deletion token: **approval package**

Assembled 7 September 2026 on branch `ebay-connector`, worktree `/Users/gocmen/Developer/studioflow-ebay`.

---

> ## NOTHING HAS BEEN CREATED. NO IAM HAS BEEN CHANGED.
>
> No service account exists. No role has been bound. No secret has been created and no secret
> **value** has been read. No API has been enabled. No marker file has been written. No function has
> been deployed. Nothing has been pushed.
>
> `gcloud` credentials on this machine are **expired** and were not renewed. Every cloud fact below
> is either (a) read out of committed code in this worktree and re-verified today, or (b) read
> earlier today while credentials were live and **not re-read since** — §3 says which is which, and
> gives the exact command to settle each one.
>
> **The approval this document asks for is only for the grants listed in §1 and §2.3.** It is not
> approval to deploy, not approval to register anything with eBay, and not approval for any grant
> that is not written out here.

---

## What you are deciding

Three things were brought to this document:

| | Thing | Source document | Status |
|---|---|---|---|
| 1 | The seven-grant service-account proposal | `docs/ebay-runtime-service-account-proposal.md` (1007 lines) | restated **exactly** in §1 |
| 2 | The Cloud Tasks OIDC identity design | `docs/ebay-cloud-tasks-oidc-design.md` (904 lines) | decisions pulled up in §2.1 |
| 3 | The Secret Manager migration for the deletion token | `docs/ebay-deletion-token-migration.md` (467 lines) | decisions pulled up in §2.2 |

This document carries the **decisions**. The three source documents carry the evidence, the failure
analyses and the commands. Where they disagree with each other, §5 says so rather than smoothing it
over.

**Read in this order:** the banner above → §1 (the grants) → §4 (the questions) → §3 (what is not
established) if any answer in §4 depends on it.

---

# 1. The seven grants, exactly as the proposal has them

Seven grants. **Three at project scope because the resource has no finer scope; four at resource
scope**, which is preferred and is used wherever the API allows it. As written, the seven come to
**eleven IAM bindings** (three project-level, one queue, one on the SA's own policy, one on a Run
service, five on secrets).

Member throughout: `serviceAccount:ebay-connector@eggcraft-studio.iam.gserviceaccount.com`.
Project throughout: `eggcraft-studio` (number `477037475099`). Region throughout: `europe-west2`.

| # | Role | Scope | Code that needs it | Class | When |
|---|---|---|---|---|---|
| 1 | `roles/datastore.user` | **project** (no choice) | all Firestore | Established | pre-deploy |
| 2 | `roles/logging.logWriter` | **project** (no choice) | container log emission | Inferred | pre-deploy |
| 3 | `roles/firebasecloudmessaging.admin` *(or a 1-permission custom role)* | **project** (FCM has no resource scope) | `sendPushNotificationToCompany` | Established | pre-deploy |
| 4 | `roles/cloudtasks.enqueuer` | **resource**: queue `ebayEventWorker` | `enqueueEbayTask` | Established | **post-deploy** |
| 5 | `roles/iam.serviceAccountUser` | **resource**: this SA, member = itself | Cloud Tasks OIDC `actAs` | Unestablished | pre-deploy |
| 6 | `roles/run.invoker` *(or custom `run.routes.invoke`)* | **resource**: Run service `ebayeventworker` | Cloud Tasks dispatch | Inferred | **post-deploy** |
| 7 | `roles/secretmanager.secretAccessor` | **resource**: each of five secrets | the five `EBAY_*` reads | Established | pre-deploy |

**Class labels are the proposal's own** (§0): *Established* = read out of committed code, file and
line given, or returned by a live read-only command; *Inferred* = derived from the `firebase-tools`
source on this machine plus an observed production analogue; *Unestablished* = could not be settled
read-only, and the command that would settle it is named. Four Established, two Inferred, one
Unestablished and proposed anyway.

### 1.1 `roles/datastore.user` — **project scope**

**Scope: the project `eggcraft-studio`.** Firestore IAM has no collection scope and there is exactly
one database (`projects/eggcraft-studio/databases/(default)`). This is not a resource-scope grant
written loosely — no narrower scope exists.

**Reason.** `admin.firestore()` takes Application Default Credentials from the metadata server, i.e.
the runtime SA. Thirteen of the seventeen write; all seventeen read. Inside the eBay surface:
`ebayConnections` (+ `/credentials/current`, `/syncLog`, `/deliveries`) at `ebayConnector.js:183,
196, 222, 1824`, delete at `:1030`, `:1607`; `ebayDeletionRequests` at `:186, 1567, 1698, 1801`;
`commerceEvents` at `commerce/worker.js:9, 15, 28`. Outside it: `siparisler/{orderId}` created and
updated in a transaction (`commerce/engine.js:57, 109, 119, 130`),
`companies/{cid}/restrictedCustomer/{orderId}` set and deleted (`ebayConnector.js:1092-1098`,
`:1596`), `companies/{cid}/piiAccessLog` (`index.js:29710-29713`).

**Read the second half of proposal §3.1 before approving this one.** Security Rules do not apply to
the Admin SDK, and the project IAM policy is `version: 1`, which cannot carry conditional bindings.
`ebay-connector@` will therefore have **exactly the same data-plane reach as the default compute
account**. See §1.9.

### 1.2 `roles/logging.logWriter` — **project scope**

**Scope: the project.** **Class: Inferred, not Established.** Every observability call in the
seventeen is `console.log/warn/error` (`ebayConnector.js:337-340` `opsSay`, `:696`, `:1333`); there
is no `@google-cloud/logging` client. The role is what lets the *container* emit logs at all. It
could not be established from inside this project because both existing runtime identities already
hold it, so there is no counter-example here; settling it would mean deploying a throwaway function
with an SA that lacks it — a write. **Proposal's recommendation: grant it and skip the question.**

The OIDC design adds a reason to care: without it, a caught-and-logged enqueue failure looks
identical to a silent dispatch 403 (§2.1, decision D-OIDC-4).

### 1.3 `roles/firebasecloudmessaging.admin` — **project scope**

**Scope: the project. FCM has no resource scope.** *(Or a custom role holding
`cloudmessaging.messages.create` alone — see D5.)*

**Reason.** `applyEbayOrder` sends a push on every newly created order: `ebayConnector.js:1160` →
`index.js:487` → `admin.messaging().sendEachForMulticast(...)` at `index.js:536`, then a batch delete
of dead token documents at `index.js:556, 561`. A second push comes from `holdIntegrationOrder`
(`index.js:2899`). Reachable from seven of the seventeen.

**The predefined role is nine permissions for the one used.** The five `topicSubscriptions.*`
permissions are the ability to move *any* device in the project into or out of any topic.

**Why this one deserves attention out of proportion to its size:** both call sites swallow the error
(`.catch(() => undefined)`), and both sit downstream of `applyEbayOrder`, which is gated on
`connectorOn()` (`ebayConnector.js:1535`). So while `NIVADESK_EBAY_CONNECTOR` is unset — the whole
first phase of the rollout — **no deploy smoke test can detect that this grant is missing.** It
surfaces weeks later as "customers stopped getting order notifications", with no error anywhere.

### 1.4 `roles/cloudtasks.enqueuer` — **resource scope: the queue, not the project**

**Scope: `projects/eggcraft-studio/locations/europe-west2/queues/ebayEventWorker`.**
Not the project. Project-level enqueuer would also let the eBay identity push tasks into
`commerceEventWorker`, which is every other connector's worker.

**Reason.** One door to the queue — `enqueueEbayTask` at `index.js:6174-6181`, which calls
`getFunctions().taskQueue("locations/europe-west2/functions/ebayEventWorker").enqueue(...)`. Callers
that will run as `ebay-connector@`: `ebayNotifications` (`ebayConnector.js:1832`),
`reconcileEbayDeletions` → `driveDeletion` (`ebayConnector.js:1642`), and the worker's own retry
(`index.js:34194`).

**Post-deploy.** The queue does not exist until the first eBay deploy creates it
(`firebase-tools fabricator.js:699-702`, `upsertQueue`).

### 1.5 `roles/iam.serviceAccountUser` — **resource scope: this SA, member = itself**

**Scope: `projects/eggcraft-studio/serviceAccounts/ebay-connector@eggcraft-studio.iam.gserviceaccount.com`,
member `serviceAccount:ebay-connector@eggcraft-studio.iam.gserviceaccount.com`.** A binding on one
account whose only member is that same account.

**Reason.** Cloud Tasks requires the principal creating a task to hold `iam.serviceAccounts.actAs` on
the service account named in the task's OIDC token. Here that account is `ebay-connector@` itself,
because `firebase-admin` reads the enqueuer's own runtime identity off the metadata server:
`functions-api-client-internal.js:293-294` sets `oidcToken = { serviceAccountEmail: account }` from
`getServiceAccount()` → `utils/index.js:149` → `ComputeEngineCredential.getServiceAccountEmail()`.

**Class: Unestablished, and proposed anyway.** Whether a service account has implicit `actAs` on
itself could not be settled: the working precedent is contaminated, because `477037475099-compute@`
holds project-level `roles/iam.serviceAccountUser`. **Grant it regardless** — it is correct under
either answer, resource-level on one account, and costs nothing broader.

**What must NOT be copied:** the compute default's shape. Its `roles/iam.serviceAccountUser` is at
**project** scope, which is `actAs` over every service account in the project, `amazon-caller@`
included.

### 1.6 `roles/run.invoker` — **resource scope: the `ebayeventworker` service**

**Scope: Cloud Run service `ebayeventworker`, region `europe-west2`, project `eggcraft-studio`.**
*(Or a custom role holding only `run.routes.invoke` — the predefined role also carries
`run.instances.invoke` and `run.jobs.run`, the latter being the ability to start Cloud Run **jobs**.)*
Project-level `run.invoker` would be invoke rights on all 421 Cloud Run services in the project.

**Reason, and this is the strongest practical risk in the whole package.** A Cloud Tasks HTTP target
with an OIDC token must be accepted by the receiving Cloud Run service. `onTaskDispatched` endpoints
get **no automatic invoker binding** unless `invoker` is set in the options — `firebase-tools` only
calls `setInvokerCreate` for a task-queue endpoint when `endpoint.taskQueueTrigger.invoker` is
present (`fabricator.js:366-374`). `ebayEventWorker`'s options set only `region`, `retryConfig`,
`rateLimits`, `...EBAY_RUNTIME` (`index.js:34199-34204`) — **no `invoker`**.

**Predicted failure if it is forgotten:** `enqueue()` returns success, the task is accepted and
stored, and it **403s at dispatch**. `retryConfig: { maxAttempts: 1 }` (`index.js:34201`) is copied
onto the queue, so Cloud Tasks drops the task after that one attempt. The eBay event is gone, the
enqueuing function logged nothing. Tasks enqueued by the compute default dispatch normally, so the
symptom is *partial* loss — harder to spot than total loss.

**Post-deploy.** The service does not exist until the first deploy creates it.

### 1.7 `roles/secretmanager.secretAccessor` — **resource scope, per secret**

**Scope: each of five secrets as a resource — five separate bindings, member `ebay-connector@` and
nobody else.** Not project scope; `roles/secretmanager.secretAccessor` is not held at project level
by anyone in this project.

```
projects/eggcraft-studio/secrets/EBAY_CLIENT_ID
projects/eggcraft-studio/secrets/EBAY_CLIENT_SECRET
projects/eggcraft-studio/secrets/EBAY_TOKEN_KEY
projects/eggcraft-studio/secrets/EBAY_HASH_KEY
projects/eggcraft-studio/secrets/EBAY_CALLBACK_KEY
```

**Reason.** The five names are declared at `functions/index.js:137` and mounted on all seventeen
through `EBAY_RUNTIME` (`:140`). Granularity is **per secret, not per version** — a binding on the
secret covers all its versions, which is what the code needs, since `defineSecret` resolves `latest`.

This is the `AMAZON_INTENT_HMAC_KEY` shape exactly: one binding, one member, and **not** the compute
default.

Note: narrowing which function mounts which secret would **not remove one IAM binding** — all
seventeen share one SA and `firebase-tools` grants per secret per service account
(`ensure.js:70-92`). Narrowing buys runtime blast radius, not IAM, and is a code change explicitly
out of scope for this approval (proposal §4.2).

### 1.8 One command in the proposal that is **not** an eighth grant

Proposal **Step 4** binds `roles/iam.serviceAccountUser` on the new SA for the build identity
`477037475099-compute@`. It is written out as belt-and-braces and **grants nothing new today**:
`contact@eggcraft.co.uk` holds `roles/owner` (which contains `iam.serviceAccounts.actAs`, verified
against the live role definition) and the build SA holds project-level `roles/iam.serviceAccountUser`
already. This also **corrects** `docs/ebay-functions-deploy-plan.md:35-37`, which says the deployer
must be granted `actAs` on the new account. Running Step 4 is harmless; skipping it is defensible.
See D9.

### 1.9 What the seven do **not** buy — approve with this in view

**Secret isolation, yes. Data isolation, no.** Five eBay secrets become readable by seventeen
functions instead of by the identity that runs ~420. That is exactly the goal
`docs/security/access-control-policy.md:145` states under *"Open remediation: one identity can read
every secret"*, and against that goal it works.

It does not narrow Firestore by one document (§1.1). Two consequences the proposal names:

- `access-control-policy.md` §5 should gain **one honest sentence** saying so, or a reader in two
  years will see "dedicated service account" and assume more.
- `revealRestrictedCustomer` (`ebayConnector.js:1851-1883`) reads
  `companies/{cid}/restrictedCustomer/{orderId}` with no provider filter, and
  `functions/commerce/amazon/ingest.js:104` writes into that same subcollection. Today that is
  unreachable — phase A1 never requests BUYER/RECIPIENT (`ingest.js:98-101`). **The day a later
  Amazon phase admits those fields, `ebay-connector@` becomes an identity that can read Amazon buyer
  PII out of the main project.** Not a cross-project grant, but it crosses the Amazon isolation
  boundary, and it follows from grant 1 rather than from anything eBay-specific.

**Cross-project: none.** Nothing outside `eggcraft-studio`. Five independent read-only checks in
proposal §5, including a grep for `nivadesk-amazon|projects/|gs://|bigquery` across the whole eBay
closure returning **zero hits**.

---

# 2. The two new designs — their decisions, not their detail

Both documents were written today, both are read-only work, and both **change what §1 should be
approved as**. The detail stays in them; what is pulled up here is every decision they reached and
every place they contradict the parent proposal.

## 2.1 Cloud Tasks OIDC identity — `docs/ebay-cloud-tasks-oidc-design.md`

**The question it answers:** when an eBay function enqueues a task, what identity does the task
carry, who has to hold what, and where does it break.

**The central fact.** The queue is fed from **both** identities and neither group can be moved. Five
call sites go through the single door `enqueueEbayTask` (`index.js:6174-6181`):

| Call site | Deployed function | Identity after the change |
|---|---|---|
| `index.js:34194` (worker's own retry) | `ebayEventWorker` `:34199-34206` (`...EBAY_RUNTIME` at `:34203`) | `ebay-connector@` |
| `ebayConnector.js:1832` | `ebayNotifications` `:1848` | `ebay-connector@` |
| `ebayConnector.js:1642` from `:1810` | `ebayNotifications` | `ebay-connector@` |
| `ebayConnector.js:1642` from `:1721` | `reconcileEbayDeletions` `:1729` | `ebay-connector@` |
| `index.js:15183` | `releaseHeldIntegrationOrders` `:15008` — no `serviceAccount` | **compute default** |
| `index.js:34230` | `retryCommerceEvent` `:34212` — no `serviceAccount` | **compute default** |

The two compute-default enqueuers serve every provider and mount other connectors' keys; the three
eBay enqueuers cannot use the compute default because `EBAY_RUNTIME` (`index.js:140`) welds identity
and secrets into one object. **Every grant has to be written for both principals, or be understood to
be leaning on a project-wide grant nobody has audited.**

**The identity is unoverridable.** `firebase-admin` reads it off the metadata server, and
`validateTaskOptions` (`functions-api-client-internal.js:211-275`) recognises only `scheduleTime`,
`scheduleDelaySeconds`, `dispatchDeadlineSeconds`, `id`, `uri`, `headers` — **no service-account
field exists.**

### Decisions

**D-OIDC-1 — Leave `invoker` unset in `ebayEventWorker`'s options. This REVERSES proposal §7.3.**

Proposal §7.3 floats setting `invoker: [EBAY_SERVICE_ACCOUNT]` as a "cheaper alternative" that would
have the CLI create both resource-level bindings on the first deploy, removing the post-deploy
ordering trap. **The OIDC design recommends against it, on evidence §7.3 named as a caveat but did
not weigh:** every *subsequent* deploy would clobber both policies.

```js
// firebase-tools lib/gcp/run.js:116-128 — setInvokerCreate
const policy = { bindings: [{ role: invokerRole, members: invokerMembers }], etag: "", version: 3 };
await setIamPolicy(serviceName, policy, httpClient);   // the WHOLE Run policy is replaced
```

```js
// firebase-tools lib/gcp/cloudtasks.js:105-113 — setEnqueuer
bindings: existing.bindings.filter((b) => b.role !== ENQUEUER_ROLE)   // every enqueuer binding DROPPED
```

Because `ebayEventWorker` sets no `invoker`, **both branches are skipped and `firebase-tools` never
writes either policy — not on the first deploy and not on any redeploy.** Manual resource-level
bindings are therefore stable. Setting `invoker` would trade a one-time ordering problem for a trap
that fires weeks later on an unrelated deploy.

**Recommendation: change no code; make both bindings by hand.** This is a decision to leave things
as they are.

**D-OIDC-2 — Also bind `run.invoker` on `ebayeventworker` for `477037475099-compute@`.** *(New,
recommended, not in the seven.)* The compute default holds project-level `run.invoker` today, so its
tasks dispatch without it. But if that project grant is ever narrowed, the failure is *silent loss of
every held-order release and every owner-clicked retry* — with no exception in any function. One
member line turns a project-wide dependency into a local one.

**D-OIDC-3 — Make the reflexive `actAs` binding without waiting for the open question.** Grant 5
stands as written. It is a no-op if self-`actAs` is implicit and necessary if it is not. Use the
**predefined** role for the first deploy; a custom role holding only `iam.serviceAccounts.actAs` is
the exact need but the live role definition was not read (§3).

**D-OIDC-4 — `logging.logWriter` is an interlock, not just hygiene.** Without it, a
caught-and-logged enqueue failure is indistinguishable from a silent dispatch 403. It is already
grant 2; this raises its priority, not its scope.

**D-OIDC-5 — Set `--log-sampling-ratio=1.0` on the queue for the rollout window.** Non-IAM.
`firebase-tools` sets no `stackdriverLoggingConfig` (`cloudtasks.js:26-38`), and the API default was
not read — "nothing is logged" is a live possibility (§3).

**D-OIDC-6 — Pre-flight by deploying `ebayEventWorker` alone, before the other sixteen.** It is the
only one of the seventeen with no public endpoint, no scheduler job and no caller once the others are
absent, so the only tasks it can ever see are hand-made. Two `gcloud tasks create-http-task` tests
(plain, then `--impersonate-service-account`) with `connectionId: "__preflight__"`, which throws
`connection_missing` at `ebayConnector.js:1534` **before any Firestore write** — one ERROR log, a
self-draining queue, and rollback in two commands. Pass/fail is unambiguous: 403 = never reached the
container and no app log; 500 + `"Unhandled error"` = IAM correct; 204 = success.

### The finding that should decide D-OIDC-6 on its own

**If `run.invoker` is missing, the account-deletion path becomes an invisible infinite loop.**
`driveDeletion` writes nothing on its success path (`ebayConnector.js:1642`); `attempts` is
incremented only inside `processEbayBuyerDeletion`'s catch (`:1626`), which never runs when the task
dies at dispatch. So `attempts` stays 0, the backoff stays 5 minutes
(`DELETION_RETRY_AFTER_MS`, `:1706`), the stuck alarm `attempts >= MAX_DELETION_ATTEMPTS * 2` — i.e.
`>= 12` — at `:1716` **can never fire**, and the row is re-driven every 10 minutes for 400 days
(`LEDGER_TTL_MS`, `:81`), reporting `redriven: 1` each pass.

**Detection signature: `attempts == 0` with an advancing `reconciledAtMs`.**

## 2.2 Deletion-token migration — `docs/ebay-deletion-token-migration.md`

**The question it answers:** `NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN` is the sixth
credential-shaped value, read as a plain environment variable and covered by no IAM grant (proposal
§4.3 flagged it and scoped it out). Should it become a Secret Manager secret, and when.

**What the value is.** *We* choose it; eBay does not issue it. It is a shared secret the developer
invents and types into the Developer Portal beside the endpoint URL. eBay constrains only its shape —
32–80 chars, `[A-Za-z0-9_-]`, encoded at `functions/commerce/ebay/notification.js:29`. It is
**hashed, never echoed**: `sha256(challengeCode + verificationToken + endpointUrl)`, that exact order
(`notification.js:31-37`), endpoint byte-for-byte.

**It is set nowhere today.** No `functions/.env` in this worktree; the main checkout's `functions/.env`
has **no `NIVADESK_EBAY_*` key at all** (key names read, never values). It fails **closed**: unset →
`""` → the pattern rejects → 503 at `ebayConnector.js:1774`. It does not hash an empty token and
return 200.

**Exactly one function reads it, on exactly one path** — `ebayNotifications`, GET with a non-empty
`challenge_code`. The deletion **POST** path does not read it; its gate is `configured()`, which
checks `EBAY_CLIENT_ID` only (`:190`).

### The finding that shaped the design

**The token gates the registration handshake and none of the traffic that flows afterward.** A token
mismatched against the portal breaks nothing observable — deletions keep arriving, verifying,
processing, acknowledging 200 — until eBay next validates the endpoint, at which point the
24-hour / 30-day markdown clock becomes a compliance failure.

**This is the inverse of the TRACK17 lesson**, where a rotation announced itself in a wall of 401s
within seconds. Here the operator step is the last link and its absence announces nothing. That is
why the migration goes **before** the seventeen-function deploy: registering with a plain env token
and migrating later would introduce a rotation, and a rotation on this path is silent.

### Decisions

**D-TOK-1 — Migrate, and do it before the seventeen-function deploy, folded into the same
sequence.** Reason, in order of weight: it removes a rotation from the plan; it is one loop entry and
one array line today versus a second production deploy of a public compliance endpoint plus a
two-party rotation later; and the five secrets do not exist yet either, so there is no "already done"
state to disturb.

**D-TOK-2 — Name the secret `NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN`, identical to the env var.**
`defineSecret` delivers via `process.env`, so `index.js:6198`, all of `ebayConnector.js` and both e2e
tests need **no change**. It also matches the existing `NIVADESK_QBO_*` / `NIVADESK_XERO_*` house
style.

**D-TOK-3 — One more `secretAccessor` binding, same shape as the five.** Add the name to proposal
Step 5's `for` loop rather than running a separate command. **Grant 7 becomes six bindings, not
five.**

**D-TOK-4 — Mount it on all seventeen, like the five.** IAM is byte-identical either way, and
narrowing is structural, not a one-liner: `EBAY_RUNTIME.secrets` clobbers any `secrets` the inner
call passes (`index.js:6186`), so a per-function extra secret means changing the wrapper to merge and
having `ebayConnector.js` name a secret, breaking the factory's dependency-injection purity.

**D-TOK-5 — Two things the reviewer should not discover later.**

- **It breaks a test on purpose.** `functions/test/qa/commerce-ebay-wiring.test.js:22` pins the
  five-secret literal by regex; a sixth `defineSecret` fails it **by design** — the test exists so the
  mounted set cannot change without someone noticing. Updating it is part of the change, not a
  workaround. `npm test` stops at the first failure, so `commerce-ebay-wiring.test.js` must be read
  green explicitly.
- **It falsifies a design-doc promise.** `docs/ebay-connector-design.md:121`, `:3192` and `:3717` all
  assert the challenge GET needs no secrets. After this it depends on the marker, a secret version
  and one IAM binding. The failure *mode* is unchanged (503 either way); the number of causes goes
  from one to three. **Recommendation: pay it and correct those three sentences in the same commit**
  — a knowing trade, not a buried one.

**D-TOK-6 — Prove the endpoint against a locally computed hash before touching the eBay portal.**
The order is forced: **create the secret → deploy so it is mounted → prove it ourselves → register in
the portal.** Because the response is a hash and not an echo, a wrong token still returns a
well-formed 200; the only way to know is to compute the expected value locally and compare. Getting
this order wrong in the *other* direction is safe (portal-before-deploy gives a loud 503 and eBay
refuses to save the destination).

**After registration, Secret Manager and the eBay portal are one atomic pair.** Never add a version
without updating the portal in the same sitting, and never treat "the connector still works" as
evidence a rotation succeeded — that evidence does not exist on this path.

## 2.3 What the package comes to if every recommendation is accepted

| | Bindings | Change from §1 |
|---|---|---|
| The seven grants as proposed | **11** | — |
| \+ D-OIDC-2 (`run.invoker` for `477037475099-compute@` on `ebayeventworker`) | +1 | new member on an existing resource |
| \+ D-TOK-3 (`secretAccessor` on the sixth secret) | +1 | grant 7 becomes six bindings |
| **Total** | **13** | |
| Optional Step 4 belt-and-braces (§1.8) | +1 | grants nothing new today |

Plus, and outside IAM entirely: one queue setting (`--log-sampling-ratio=1.0`), one code line (the
sixth `defineSecret`) with its test edits, three corrected sentences in
`ebay-connector-design.md`, one honest sentence in `access-control-policy.md` §5 — and one decision
to **change nothing**, leaving `invoker` unset.

**Still true of all thirteen: three at project scope because no finer scope exists; ten at resource
scope.**

---

# 3. Established vs needs re-verification — one honest table

`gcloud` credentials are **expired** and were not renewed for this document. That splits every claim
into three classes, and the split matters: a grant approved on a stale reading of live state is how
an over-grant or an outage happens.

- **CODE** — read out of committed code in this worktree and **re-verified today** (§5). Safe to rely
  on.
- **STALE-LIVE** — returned by a live read-only `gcloud` call **earlier today, 7 Sep, while
  credentials were valid**, and **not re-read since**. Almost certainly still true; nothing here is
  fast-moving. But it is a memory of a reading, not a reading.
- **OPEN** — never established. The command or dashboard that would settle it is given.

| # | Claim | Class | Exact command that (re-)establishes it |
|---|---|---|---|
| 1 | SA email, the five secret names, the marker mechanism, `EBAY_RUNTIME` | **CODE** | `awk 'NR>=133 && NR<=141 {printf "%d\t%s\n", NR, $0}' functions/index.js` |
| 2 | The six enqueue call sites and their identities | **CODE** | `grep -n enqueueEbayTask functions/index.js` ; `awk 'NR>=1640 && NR<=1642' functions/ebayConnector.js` |
| 3 | `ebayEventWorker` sets no `invoker`; `maxAttempts: 1` | **CODE** | `awk 'NR>=34199 && NR<=34206 {printf "%d\t%s\n", NR, $0}' functions/index.js` |
| 4 | The deletion token's single reader, and the 503 | **CODE** | `grep -n deletionToken functions/ebayConnector.js` → `:1772`; gate at `:1774` |
| 5 | `functions/.ebay-secrets-ready` does not exist | **CODE** | `ls -la functions/.ebay-secrets-ready` → *No such file or directory* |
| 6 | `firebase-tools` never writes either policy for this endpoint | **CODE** (installed lib) | `sed -n '366,375p;699,709p' /opt/homebrew/lib/node_modules/firebase-tools/lib/deploy/functions/release/fabricator.js` |
| 7 | **`ebay-connector@` does not exist** | STALE-LIVE | `gcloud iam service-accounts describe ebay-connector@eggcraft-studio.iam.gserviceaccount.com --project eggcraft-studio` (expect `NOT_FOUND`) |
| 8 | **None of the five secrets exists** | STALE-LIVE | `gcloud secrets list --project eggcraft-studio --format='value(name)' \| grep -i ebay` (expect empty) |
| 9 | The sixth secret does not exist | **OPEN** (never read) | `gcloud secrets describe NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN --project eggcraft-studio` (expect `NOT_FOUND`) |
| 10 | No IAM binding exists on the sixth secret | **OPEN** | `gcloud secrets get-iam-policy NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN --project eggcraft-studio` |
| 11 | `commerceeventworker`'s Run policy is empty (`etag: ACAB`) — the proof that the CLI makes no invoker binding | STALE-LIVE | `gcloud run services get-iam-policy commerceeventworker --region=europe-west2 --project eggcraft-studio` |
| 12 | The compute default's ten project roles, incl. project-scope `run.invoker`, `cloudtasks.enqueuer`, `iam.serviceAccountUser` | STALE-LIVE | `gcloud projects get-iam-policy eggcraft-studio --flatten='bindings[].members' --filter='bindings.members:serviceAccount:477037475099-compute@developer.gserviceaccount.com' --format='value(bindings.role)'` |
| 13 | `secretAccessor` is **not** held at project level by anyone | STALE-LIVE | same command as 12, plus `gcloud secrets get-iam-policy AMAZON_INTENT_HMAC_KEY --project eggcraft-studio` |
| 14 | Exactly one Firestore database | STALE-LIVE | `gcloud firestore databases list --project eggcraft-studio --format='value(name)'` |
| 15 | `roles/owner` contains `iam.serviceAccounts.actAs` | STALE-LIVE | `gcloud iam roles describe roles/owner --format='value(includedPermissions)' \| tr ';' '\n' \| grep serviceAccounts.actAs` |
| 16 | No eBay function exists in Cloud Run; no eBay queue exists | STALE-LIVE | `gcloud run services list --project eggcraft-studio --region europe-west2 --format='value(metadata.name)' \| grep -i ebay` ; `gcloud tasks queues list --location=europe-west2 --project eggcraft-studio` |
| 17 | **Does a service account have implicit `actAs` on itself?** (grant 5) | **OPEN** | Console → IAM & Admin → **Policy Troubleshooter**, resource `//iam.googleapis.com/projects/eggcraft-studio/serviceAccounts/amazon-caller@eggcraft-studio.iam.gserviceaccount.com`, principal `amazon-caller@…`, permission `iam.serviceAccounts.actAs`. **`amazon-caller@` is the clean control** — the compute default's precedent is contaminated. Definitive answer: the `--impersonate-service-account` experiment in OIDC design §4.5. *(The CLI form needs `gcloud services enable policytroubleshooter.googleapis.com` — a **write**.)* |
| 18 | Does `roles/owner` carry `iam.serviceAccounts.getAccessToken`? (gates the §4.5 experiment) | **OPEN** | `gcloud iam roles describe roles/owner --format='value(includedPermissions)' \| tr ';' '\n' \| grep getAccessToken` |
| 19 | The exact permission list of `roles/iam.serviceAccountUser` (gates the custom-role tightening) | **OPEN** | `gcloud iam roles describe roles/iam.serviceAccountUser --format='value(includedPermissions)'` |
| 20 | The Cloud Tasks API's default `stackdriverLoggingConfig.samplingRatio` — "nothing is logged" is possible | **OPEN** | `gcloud tasks queues describe commerceEventWorker --location=europe-west2 --project eggcraft-studio --format='value(stackdriverLoggingConfig.samplingRatio)'` |
| 21 | Whether an IAM-denied dispatch appears in `run.googleapis.com/requests` | **OPEN** (infrastructure behaviour) | Observe it during pre-flight test A with the binding deliberately absent (D-OIDC-6) |
| 22 | The Cloud Monitoring metric name for queue attempts by response code | **OPEN** | Metrics Explorer, resource type `cloud_tasks_queue` |
| 23 | Exact `gcloud tasks create-http-task` flag spellings | **OPEN** | `gcloud tasks create-http-task --help` before running the pre-flight |
| 24 | Whether `firebase-tools` really refuses a deploy on a versionless declared secret | **OPEN** — asserted only from the repo's own note at `index.js:155-157` | confirm on a throwaway secret before relying on it |
| 25 | What `firebase deploy --dry-run` actually validates (does it check secret IAM?) | **OPEN** | treat a clean dry run as weak positive evidence, never as proof |
| 26 | **Organization-level IAM deny policies** — a deny on `iam.serviceAccounts.create` or `.actAs` at org `378239481010` would override everything above | **OPEN — could not be read at all**; the *project* attachment point is clean | `gcloud iam policies list --attachment-point="cloudresourcemanager.googleapis.com/organizations/378239481010" --kind=denypolicies` as a principal holding `roles/iam.denyReviewer`, or Console → IAM & Admin → **Deny** with org 378239481010 selected |
| 27 | Whether eBay re-challenges an already-registered destination | **OPEN — a question for eBay, not `gcloud`** | eBay Developer Portal, Notification API / Marketplace Account Deletion. **The §7 procedure is written so the answer does not matter** — Secret Manager and the portal are treated as one atomic pair |
| 28 | That the main checkout's `functions/.env` is the file the deploying machine holds | **OPEN** | operator confirms which `.env` the deploying machine has |

**Rows 7, 8, 11–16 are the ones an approval leans on.** They were read correctly while credentials
were live and nothing in this window could have changed them — no writes were made by anyone in this
session. Re-running them takes under a minute once `gcloud auth login` succeeds, and **doing that
before the first `add-iam-policy-binding` is cheap insurance**, particularly row 7: if the SA turns
out to exist already, the whole ordering changes.

---

# 4. The decisions you actually have to make

Each is a question, a recommended answer, and what each option costs. Nothing below is decided.

### D1 — Approve the seven grants at the scopes written in §1?

**Recommended: yes.**

| Option | Cost |
|---|---|
| **Approve as scoped** *(recommended)* | Three project-scope grants that cannot be narrowed by the API, and **zero data-plane isolation** (§1.9). You are buying secret isolation only. |
| Approve, but widen 4/5/6 to project scope "for simplicity" | `cloudtasks.enqueuer` at project = the eBay identity can push into `commerceEventWorker`, every other connector's worker. `run.invoker` at project = invoke rights on all 421 Cloud Run services. `serviceAccountUser` at project = `actAs` over every SA including `amazon-caller@`. **This is the specific mistake this document is written to prevent.** |
| Reject | See D2's "none" row. |

### D2 — SA shape: one SA for all seventeen, two, or none? *(raised by the proposal's "RECOMMENDATION ON THE SA SHAPE" section, `ebay-runtime-service-account-proposal.md:935`)*

**Recommended: one — Option A, the shape already in the code, with no code change as part of this
approval.**

| Option | Cost |
|---|---|
| **One SA for all seventeen** *(recommended)* | Seven grants no tooling creates for you, two only grantable post-deploy, one of which loses eBay order events **silently** if forgotten. A permanent second identity to remember. Zero data-plane isolation. |
| Two (one for the two public `onRequest` functions, one for the rest) | **The code defeats the split.** The public edge is not thin: `ebayOAuthCallback` uses `EBAY_CALLBACK_KEY` (`:742`), both client credentials and `EBAY_TOKEN_KEY`; `ebayNotifications` uses `EBAY_HASH_KEY` (`:1798`) and, when the enqueue fails, **falls through to the full apply path inline** (`:1832-1839`) — which is currently the only thing carrying the deletion path through the post-deploy window. A second SA that still mounts all five secrets isolates nothing and doubles the IAM surface. It also breaks three committed assertions. |
| None (keep the compute default) | Puts the five eBay secrets on the identity that runs every other function in the project — every other connector's unauthenticated public endpoints and the ChatGPT MCP surface included. This is precisely what `access-control-policy.md:145-170` exists to prevent. |

**The decisive argument is not the count.** Every failure mode in this package lives in the grant
list, not in how many accounts there are. Splitting into two does not fix the `run.invoker` gap — it
creates two of them.

### D3 — Set `invoker` in `ebayEventWorker`'s options so the CLI makes the bindings, or bind by hand?

**Recommended: bind by hand; leave the code alone.** *(This is D-OIDC-1, and it reverses the shortcut
proposal §7.3 floated.)*

| Option | Cost |
|---|---|
| **Leave `invoker` unset, bind manually** *(recommended)* | You must remember two post-deploy bindings, and there is an unavoidable window in which the worker exists and 403s. D5 (pre-flight) shrinks that window to one function. |
| Set `invoker: [EBAY_SERVICE_ACCOUNT]` | The window disappears — and **every subsequent deploy clobbers both policies**: `run.js:116-128` replaces the whole Run policy, `cloudtasks.js:105-113` drops every existing enqueuer binding. The D-OIDC-2 binding for the compute default would be silently deleted by an unrelated deploy weeks later. |

### D4 — Add `run.invoker` on `ebayeventworker` for the compute default? *(D-OIDC-2, new)*

**Recommended: yes.** Cost of yes: one member line on one service. Cost of no: the held-order release
and owner-clicked retry keep depending on a **project-level** grant, and if that is ever narrowed
they fail **silently** — no exception in any function.

### D5 — Deploy `ebayEventWorker` alone as a pre-flight before the other sixteen? *(D-OIDC-6)*

**Recommended: yes.**

| Option | Cost |
|---|---|
| **Pre-flight with one function** *(recommended)* | One extra deploy and two `gcloud tasks create-http-task` calls. Rollback is two commands. The payload throws `connection_missing` at `ebayConnector.js:1534` before any Firestore write. |
| Deploy all seventeen and find out in production | The `run.invoker` gap is **silent**, and on the deletion path it becomes an invisible 400-day redrive loop whose stuck alarm can never fire (§2.1). |

### D6 — Migrate the deletion token to Secret Manager, and when? *(D-TOK-1)*

**Recommended: yes, before the seventeen-function deploy, in the same sequence.**

| Option | Cost |
|---|---|
| **Migrate first** *(recommended)* | One loop entry, one array line, one test regex + two wording edits, three corrected sentences in `ebay-connector-design.md`. The challenge GET gains two new failure causes (marker, version, binding) for the same 503 symptom. |
| Migrate later | You register the portal with a plain env value, then have to **rotate** it — and a rotation on this path is **silent**: nothing breaks visibly until eBay next validates the endpoint, when the 24-hour / 30-day markdown clock becomes a compliance failure. |
| Never migrate | The token lives in `functions/.env` in plain text — the exact exposure class the TRACK17 incident was about. |

### D7 — Secret replication policy — **DECIDED: `user-managed --locations=europe-west2`**

The two documents used to disagree: the proposal (`:822-823`) said `user-managed --locations="$REGION"`,
the deploy plan (`:56-57`) said `automatic`. For a UK/EU project that is a **data-location decision, not
cosmetics**, which is why it was put to the operator rather than settled quietly. **Resolved: the deploy
plan now reads `user-managed --locations=europe-west2`, and all three documents agree.**

**DECIDED BY THE OPERATOR, 7 September 2026: `user-managed --locations=europe-west2`.** Not automatic.
The reason it was theirs to make and not mine: automatic replication stores secret material across
Google-selected regions worldwide, which for a UK/EU boundary project is a data-residency choice with
legal weight, not a convenience setting. The recommendation happened to match, but the decision is
recorded as theirs. Whatever is chosen, **all six
secrets get it, created in one loop on one day**: none of them exists yet, so the precedent is set
once and should not end up mixed.

### D8 — FCM: predefined role now, or custom role from the start? *(proposal §3.3)*

**Recommended: predefined now, custom role as a second step, only after a push is observed
arriving.** Cost of predefined: nine permissions where one is used, including the ability to move any
device in the project into or out of any topic. Cost of starting custom: the code path is verified but
the Admin SDK's full runtime permission set is **not**, and a custom role one permission short fails
in exactly the silent way §1.3 describes. Same reasoning applies to the `iam.serviceAccountUser`
custom-role tightening (D-OIDC-3) — and row 19 must be read before either.

### D9 — Run proposal Step 4 (compute default `actAs` on the new SA)?

**Recommended: run it.** It grants nothing today (§1.8); it survives a future narrowing of the
project binding. Cost of skipping: nothing today, and a confusing failure later if the project-level
`serviceAccountUser` is ever removed.

### D10 — Set the queue's log sampling to 1.0 for the rollout? *(D-OIDC-5, non-IAM)*

**Recommended: yes, for the rollout window.** `firebase-tools` sets no logging config and the API
default is unread (row 20). Cost of no: the pass/fail signals the pre-flight depends on may not exist.

### D11 — The two documentation corrections, in the same commits as the changes they describe?

**Recommended: yes, both.** One honest sentence in `docs/security/access-control-policy.md` §5 saying
this buys secret isolation and not data isolation (§1.9); and the three sentences in
`docs/ebay-connector-design.md` (`:121`, `:3192`, `:3717`) that assert the challenge GET needs no
secrets, which D-TOK-1 makes false. Cost of skipping: a reader in two years assumes more isolation
than exists, and a future operator registers the destination before the marker exists.

---

# 5. Verification pass against the code — including what did not match

After assembling the package, the load-bearing citations were re-read against the working tree.
**Discrepancies are reported here, not silently corrected in the source documents.**

## 5.1 The anchor: `functions/index.js`, lines 133–141

```
135  const EBAY_SECRETS_READY = process.env.NIVADESK_EBAY_SECRETS_READY === "1" || require("fs").existsSync(require("path").join(__dirname, ".ebay-secrets-ready"));
136  const EBAY_SECRET_PARAMS = EBAY_SECRETS_READY
137    ? [defineSecret("EBAY_CLIENT_ID"), defineSecret("EBAY_CLIENT_SECRET"), defineSecret("EBAY_TOKEN_KEY"), defineSecret("EBAY_HASH_KEY"), defineSecret("EBAY_CALLBACK_KEY")]
138    : [];
139  const EBAY_SERVICE_ACCOUNT = "ebay-connector@eggcraft-studio.iam.gserviceaccount.com";
140  const EBAY_RUNTIME = EBAY_SECRETS_READY ? { secrets: EBAY_SECRET_PARAMS, serviceAccount: EBAY_SERVICE_ACCOUNT } : {};
141  const ebaySecretValue = (name) => process.env[name] || "";
```

| Item | Verdict |
|---|---|
| SA email `ebay-connector@eggcraft-studio.iam.gserviceaccount.com` | **Correct**, at `:139`, character-for-character as quoted everywhere in this package. Also pinned by `commerce-ebay-wiring.test.js:23` and `access-control-policy.test.js:173`. |
| The five secret names | **Correct**, at `:137`, in this order: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_TOKEN_KEY`, `EBAY_HASH_KEY`, `EBAY_CALLBACK_KEY`. No sixth. |
| The marker-file mechanism | **Correct as a mechanism**, but see D-1 below — it lives at `:135`, **outside** the 137–141 range. |
| `EBAY_RUNTIME` welds secrets and identity | **Correct**, at `:140`. |
| `functions/.ebay-secrets-ready` absent | **Correct** — `ls` → *No such file or directory*. Contrast `functions/.xero-secrets-ready`, present, 262 bytes. |

## 5.2 Discrepancies found

**D-1 — The marker-file mechanism is at `functions/index.js:135`, not within 137–141.**
Lines 137–141 carry the five secret names, the SA email, `EBAY_RUNTIME` and the accessor. The marker
check — `process.env.NIVADESK_EBAY_SECRETS_READY === "1" || fs.existsSync(path.join(__dirname,
".ebay-secrets-ready"))` — is line **135**, with `EBAY_SECRET_PARAMS` opening at 136. **The source
documents are right**: the proposal quotes the block as `index.js:135-140` (proposal:81) and the OIDC
design cites `index.js:135` (§1.4). Only the review range was narrow. **No document needs changing;
the correct range to quote is 135–141.**

**D-2 — `docs/ebay-runtime-service-account-proposal.md` §4.3 cites `index.js:6197` for the deletion
token getter. The actual line is `:6198`.** Line 6197 is `ruName:`. The migration document cites
`:6198` and is **correct**. One-line off-by-one in the parent proposal; it does not change any claim.

**D-3 — The same §4.3 sentence cites `ebayConnector.js:1769` for the challenge use. The token is read
at `:1772` and the 503 gate is at `:1774`.** Line 1769 is `if (method === "GET")` — the right branch,
the wrong line. The migration document cites `:1770-1777` for the branch and `:1774` for the 503, and
is **correct**.

**D-4 — Proposal §2 cites `retryCommerceEvent` at `index.js:34213`. The export is at `:34212`**
(`:34213` is the first body line). The OIDC design cites `:34212` and is **correct**.

**D-5 — Migration §4.3 says the wording "five" appears at `commerce-ebay-wiring.test.js:15` and
`:24`. Precisely: `:15` says *"the five eBay secrets…"* (correct), `:24`'s assertion message says
*"the **fifth** secret rides the dedicated identity"*, and the comment block that says "the five" /
"none of the five" is `:17-21`.** The edit list should therefore read: the check name at `:15`, the
comment at `:17-21`, the regex at `:22`, and the message at `:24`. A pointer imprecision, not a wrong
claim — the test does fail on a sixth `defineSecret`, exactly as described.

**D-6 — The OIDC design says the two compute-default enqueuers "mount the Shopify, Woo and Square
keys (`index.js:15008`, `:34212`)". True collectively, not individually:**
`releaseHeldIntegrationOrders` (`:15008`) mounts `secrets: [SHOPIFY_TOKEN_KEY]` only;
`retryCommerceEvent` (`:34212`) mounts `[SHOPIFY_TOKEN_KEY, WOO_TOKEN_KEY, ...SQUARE_SECRETS]`.
**The conclusion is unaffected** — neither carries `serviceAccount`, both serve every provider, and
neither can be moved onto the eBay SA.

**Nothing else disagreed.** Every other citation in §1 and §2 was re-read and matched: the six
enqueue call sites (`index.js:15183`, `:34194`, `:34230`; `ebayConnector.js:1642` from `:1721` and
`:1810`; `:1832`), `ebayEventWorker`'s options at `:34199-34206` with `maxAttempts: 1` at `:34201` and
`...EBAY_RUNTIME` at `:34203` and **no `invoker`**, `enqueueEbayTask` at `:6174-6181` with
`EBAY_QUEUE_FUNCTION` at `:6173`, the wrapper spreads at `:6185-6187`, `ebayNotifications` at
`ebayConnector.js:1848`, `revealRestrictedCustomer` at `:1851`, the sixteen returned at `:1885-1888`,
`VERIFICATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,80}$/` at `commerce/ebay/notification.js:29` with
the hash order `challengeCode → verificationToken → endpointUrl` at `:31-37`, the deletion constants
(`MAX_DELETION_ATTEMPTS = 6` at `:101`, so the `:1716` alarm is `attempts >= 12`;
`DELETION_RETRY_AFTER_MS = 5 min` at `:108`; `LEDGER_TTL_MS = 400 days` at `:81`), and the
`attempts` increment living only in the catch at `:1626`.

---

# 6. If approved — the order, and the two places it must not be got wrong

Not part of the approval; recorded so the approval is informed. Full procedures are in the three
source documents.

1. **Re-authenticate and re-run rows 7, 8, 11–16 of §3.** Under a minute. Row 7 especially: if the SA
   already exists, everything below changes.
2. **Create the SA** (grants nothing) and **record its numeric `uniqueId`.** It is the only handle
   `gcloud iam service-accounts undelete` accepts, and it is the difference between a 30-day recovery
   and a rebuild.
3. **The three project-level roles** (grants 1–3), then **`actAs` on itself** (grant 5), then
   optionally Step 4 (§1.8).
4. **Create all six secrets in one loop** with the D7 replication policy, **empty**, one
   `secretAccessor` binding each. Values are pasted by the operator in the console or piped from a
   shell variable — **never written into a command in a transcript, never into `functions/.env`.**
5. **Write the marker file, deploy `ebayEventWorker` alone** (D5), then make the two post-deploy
   bindings (grants 4 and 6, plus D4), then run the two pre-flight tasks.
6. **Deploy the other sixteen by name** — never `--only functions`.
7. **Prove the challenge endpoint against a locally computed hash, then register with eBay** (D-TOK-6,
   in that order).

**The two orderings that must not be got wrong:**

- **Never delete the SA while the functions still name it.** A Cloud Run revision stores the runtime
  SA email in its spec; deleting the account breaks all seventeen immediately, including
  `ebayNotifications`, which is the eBay account-deletion endpoint and is **deliberately ungated by
  `NIVADESK_EBAY_CONNECTOR`**. That is a compliance failure toward eBay, not a feature outage. The
  safe rollback is **code first, IAM last**: remove the marker, redeploy so `EBAY_RUNTIME` becomes
  `{}` and the services return to the compute default, verify that, drain the queue, then unwind
  bindings, then delete the account. Deleting and recreating the same name does **not** restore the
  grants — the new account gets a new `uniqueId` and every binding must be re-run.
- **Never add a version to the deletion-token secret without updating the eBay portal in the same
  sitting** (D-TOK-6). After registration they are one atomic pair, and a mismatch is silent.

**Partial rollback of just the two post-deploy bindings is safe and cheap:** it degrades enqueue to
the inline fallbacks and loses worker retries. It takes nothing down.

---

## Provenance

Assembled from, and superseded by, these three on any point of detail:

- `docs/ebay-runtime-service-account-proposal.md` — the seven grants, the failure table, the
  create/rollback commands, the SA-shape recommendation.
- `docs/ebay-cloud-tasks-oidc-design.md` — who enqueues, what identity the task carries, the two
  distinct permissions, the failure modes by missing grant, the pre-flight.
- `docs/ebay-deletion-token-migration.md` — what the token is, where it is read, the code change, the
  IAM grant, the ordering, the rollback.

Read-only throughout. No secret **value** was read, on any secret, at any point, in any of the three.
`nivadesk-amazon` and VPC-SC were not contacted. Nothing was pushed.

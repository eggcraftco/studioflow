# eBay sandbox — step 1 of the rollout: source, identity, secrets, the worker alone (10 September 2026)

Operator's instruction (10 Sep, ~11:50Z): D1 / D2 / D4 / D9 approved at the narrow resource scopes of the
package's table; this step is limited to the service account, the six secrets, the deploy of **`ebayEventWorker` alone**
and the queue-delivery verification from the two identities. Out of scope, by instruction: the other sixteen functions,
the Hostinger relay value, the eBay-portal deletion token, Sandbox OAuth, production eBay settings, any OpenAI MCP/OAuth
redeploy. No secret value appears in this file, in the repository, in a shell history or in a transcript.

## 1. Two clarifications asked for first, settled from code and package

**1a. The post-deploy bindings are three, not two.** Table rows 4 (`cloudtasks.enqueuer` on the queue, `ebay-connector@`),
6 (`run.invoker` on the service, `ebay-connector@`) and 8 (`run.invoker` on the service, compute default) can only be
made after `ebayEventWorker` exists, because the queue and the service are created by that deploy. The package's §6 said
"two"; corrected in `e7f59525` (order sentence and the partial-rollback sentence).

**1b. `EBAY_CALLBACK_KEY` (backend) ↔ `NIVADESK_EBAY_CALLBACK_KEY` (Hostinger) is a deliberate mapping of one value
under two names.** The function reads the Secret Manager secret: `functions/index.js:6203`
(`callbackKey: () => ebaySecretValue("EBAY_CALLBACK_KEY")`) and `functions/ebayConnector.js:743` (a key shorter than 32
characters answers 401 and logs `EBAY_CALLBACK_KEY not configured`). The web relay reads the build-environment variable:
`studioflow-web/app/ebay/callback/route.ts:297-303` and `studioflow-web/app/ebay/ticket/route.ts:176-184`
(`process.env.NIVADESK_EBAY_CALLBACK_KEY`, same 32-character floor). The mapping is documented as a design decision in
`docs/ebay-connector-design.md:714` (the Hostinger row of the configuration table) and guarded by a test that requires
the README to name both — `functions/test/qa/ebay-connect.test.js:1111`. `studioflow-web/lib/studioflow/ebayTicket.ts:42`
records that rotating the secret rotates the relay key with it. Values not shown; the Hostinger side stays empty in this
step by instruction.

## 2. Source base

| | |
|---|---|
| Deploy branch before | `macbook-save-before-macstudio-2026-06-01` @ `b9757af9`; since the merge-base `0e2448fa` it had moved by four docs-only commits (`git diff --name-only` outside `docs/`: none) |
| Candidate | `ebay-carry-candidate` @ `c0a05b1b` (= `e4bb38b9` + the package), 93 commits, 107 files |
| Merge | normal `--no-ff` merge, no rewrite: **`cf9dd20b`**; zero conflicts |
| Proof the carry is exact | `git rev-parse HEAD:functions` == `ebay-carry-candidate:functions` — the deployed `functions/` tree is byte-identical to the tree whose full suite ran green this morning (exit 0, 1,655 PASS) |
| Protected code still in the ancestry | `76c5e3c3` (Stripe L1 / trial stamp), `baa21204` (OpenAI 1.2.0 surface, nodemailer floor `^9.1.1` confirmed in `functions/package.json`), `b9aeec70` (v2.1 checklist); onboarding was already on both sides of the merge-base |
| Exports on the merged tree | the seventeen eBay functions (17/17), plus `stripeWebhook`, `chatgptMcp`, `getSetupChecklist` present |
| Also carried, not deployed here | 34 files outside `docs/` and `functions/`: web (`studioflow-web`, eBay routes and scripts), Swift, Android, `firestore.rules`, `.github/workflows/functions-tests.yml` — they ride the branch; rules and web publish are their own gates |
| Follow-up commit | `e7f59525`: package correction (1a) + `.gitignore` entry for `functions/.ebay-secrets-ready` so the marker cannot be committed by accident |
| Push | both pushed; `origin/…:functions` == `HEAD:functions` re-checked after the push |

## 3. Service account and IAM — the diff as applied (read back, no secret content)

Created 2026-09-10T10:50:14Z: `ebay-connector@eggcraft-studio.iam.gserviceaccount.com`, uniqueId **111228669298464686658**,
display name "Runs the eBay connector's seventeen functions", not disabled.

| Row | Decision | Principal | Role | Resource | State |
|---|---|---|---|---|---|
| 1 | D1 | serviceAccount:ebay-connector@ | roles/datastore.user | project eggcraft-studio | applied 10:50:16Z, no condition |
| 2 | D1 | serviceAccount:ebay-connector@ | roles/logging.logWriter | project eggcraft-studio | applied |
| 3 | D1 | serviceAccount:ebay-connector@ | roles/firebasecloudmessaging.admin | project eggcraft-studio | applied |
| 4 | D1 | serviceAccount:ebay-connector@ | roles/cloudtasks.enqueuer | queue `…/queues/ebayEventWorker` | post-deploy — §5 |
| 5 | D1 | serviceAccount:ebay-connector@ | roles/iam.serviceAccountUser | service account ebay-connector@ (itself) | applied 10:50:24Z |
| 6 | D1 | serviceAccount:ebay-connector@ | roles/run.invoker | Cloud Run service `ebayeventworker` | post-deploy — §5 |
| 7 | D1 | serviceAccount:ebay-connector@ | roles/secretmanager.secretAccessor | each of the six secrets | applied 10:50:29–10:50:45Z; each secret's policy holds exactly this one binding |
| 8 | D4 | serviceAccount:477037475099-compute@ | roles/run.invoker | Cloud Run service `ebayeventworker` | post-deploy — §5 |
| 9 | D9 | serviceAccount:477037475099-compute@ | roles/iam.serviceAccountUser | service account ebay-connector@ | applied 10:50:24Z |

Nothing project-wide was added for `run.invoker`, `actAs` or `secretAccessor`; nothing existing was removed.

**Pre-existing facts recorded, untouched:** the compute default already holds project-level `roles/run.invoker`,
`roles/iam.serviceAccountUser`, `roles/cloudtasks.enqueuer` (and datastore/logging/FCM/others) — so rows 8 and 9 are
belt-and-braces at the resource, as the package intended, and become load-bearing only if those project grants are ever
narrowed.

**Two identities in the Cloud Tasks path, kept apart:**

| Role in a dispatch | Identity | Where it is granted |
|---|---|---|
| Mints the OIDC token | Cloud Tasks service agent `service-477037475099@gcp-sa-cloudtasks.iam.gserviceaccount.com` | `roles/cloudtasks.serviceAgent` on the project (pre-existing, Google-managed) |
| The account the token *represents* (the caller Cloud Run authorises) | `ebay-connector@` for tasks enqueued by eBay functions; `477037475099-compute@` for tasks enqueued by `releaseHeldIntegrationOrders` / `retryCommerceEvent` | `run.invoker` on `ebayeventworker` (rows 6, 8) |
| The principal that calls CreateTask | the enqueuing function's runtime SA (production) — or the operator in the pre-flight | `cloudtasks.enqueuer` on the queue (row 4; compute default at project scope, pre-existing); `actAs` on the SA named in the token (rows 5, 9) |

## 4. Secrets — names, policy, version state (values never here)

Six created 10:50:29–10:50:45Z, `--replication-policy=user-managed --locations=europe-west2` (D7), one loop; policy on
each: `roles/secretmanager.secretAccessor → serviceAccount:ebay-connector@` and nobody else.

| Secret | Version state | Value origin | Format check |
|---|---|---|---|
| `EBAY_TOKEN_KEY` | v1 enabled 10:50:4xZ | generated: `openssl rand -hex 32` piped into `versions add`, never printed | 64 hex = 32 bytes, the rule `tokenKeyBytes` enforces (`functions/security/tokenBox.js:22`) |
| `EBAY_HASH_KEY` | v1 enabled | generated the same way, independently | same rule |
| `EBAY_CALLBACK_KEY` | v1 enabled | generated the same way | ≥ 32 characters (`CALLBACK_KEY_MIN_LENGTH`, `ebayConnector.js:122`; web floor 32) |
| `NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN` | v1 enabled | generated the same way (migration Form B without the portal half) | 64 hex, inside eBay's 32–80 character rule |
| `EBAY_CLIENT_ID` | v1 enabled 10:59:12Z | the **sandbox** keyset's App ID, copied with the portal's own *Copy App ID* button into the clipboard and piped from the clipboard into `versions add` by a helper that checks shape and length, writes only if no version exists, and clears the clipboard | 40 characters, `…-SBX-…` shape passed |
| `EBAY_CLIENT_SECRET` | v1 enabled 11:02:23Z | the sandbox keyset's Cert ID, same path via *Copy Cert ID* (the Cert ID was never displayed: *Show Cert ID* was not pressed) | 36 characters, `SBX-…` shape passed |

Generation checked "no existing version" first; none existed, nothing was overwritten. The deletion token's portal
registration (D-TOK-6, "the same sitting") is deferred by this instruction; when that step comes the operator reads the
value with `gcloud secrets versions access` in their own terminal, no new version is minted.

**Six enabled versions confirmed at 11:02:23Z** (the chain's gate: 6/6 `state=enabled`), then the marker
`functions/.ebay-secrets-ready` was created (11:02:28Z; ignored by git since `e7f59525`) and two non-secret settings were
appended to the untracked `functions/.env`: `NIVADESK_EBAY_ENVIRONMENT=sandbox` (also the code default) and
`NIVADESK_EBAY_RUNAME=EGGCRAFT_LIMITE-EGGCRAFT-NivaDe-nerasfwi`. `NIVADESK_EBAY_CONNECTOR` is absent (connector switch off).

**Where the two keyset values came from — the account and the keyset, verified in the operator's signed-in Chrome
session (10 Sep 10:57–11:01Z):** developer.ebay.com profile: username `nivadesk`, e-mail `c***@eggcraft.co.uk`, legal
business name EGGCRAFT LIMITED, country GB, API License Agreement signed 4 Sep 2026. *Application Keys*: one Sandbox
keyset titled **NivaDesk**; no Production keyset exists ("Create Production keyset" is offered). *User Tokens*: environment
**Sandbox** selected, RuName **`EGGCRAFT_LIMITE-EGGCRAFT-NivaDe-nerasfwi`**, auth accepted URL exactly
`https://nivadesk.app/ebay/callback`, auth declined URL exactly `https://nivadesk.app/settings?section=ebay&ebay=cancelled`,
privacy URL `https://nivadesk.app/privacy`. Whether OAuth is enabled for the RuName was not verified here (Sandbox OAuth is
out of scope). One honest note: the browser tool's element description for the *Copy App ID* button quoted the App ID
text in its result, so the App ID (a public client identifier that travels in every consent URL, not a credential)
passed through the assistant's context once; it is not written anywhere. The Cert ID never appeared anywhere.

## 5. The worker alone — first attempt stopped by a session-reauthentication wall

The deploy chain (`chain-worker-deploy.sh`, started 11:02:17Z) passed every gate: Cert ID written, 6/6 enabled versions,
marker, env, the four runbook pre-checks (`HEAD` = `e7f59525`, `functions/` == origin tip). `npx firebase deploy --project
eggcraft-studio --only functions:ebayEventWorker --non-interactive` (firebase-tools 15.19.0) then: enabled/verified the
APIs, confirmed `ebay-connector@`'s accessor on all six secrets (already present — the CLI re-granted the same role, no
change), packaged and **uploaded the source (3.05 MB) successfully**, printed `creating Node.js 22 (2nd Gen) function
ebayEventWorker(europe-west2)...` and then failed on every call with `Authentication Error: Your credentials are no longer
valid. Please run firebase login --reauth` (89 repetitions). At 11:13Z `gcloud` showed the same wall for both the user
credential and Application Default Credentials: `There was a problem refreshing your current auth tokens:
Reauthentication failed. cannot prompt during non-interactive execution.` — the operator's Google Cloud session hit the
periodic re-authentication requirement at ~11:03Z (the last successful gcloud call was 11:02:23Z); this is a session
policy, not a permission change and not a revocation of anything created above.

**Action taken:** the stuck local CLI process was stopped at 11:13Z (local only; nothing server-side is cancelled by
that). **Not done:** no second deploy was started, no IAM or secret was touched, no scope was widened. The operator
re-authenticated all three (gcloud user credential, ADC, Firebase CLI) at ~11:15Z.

### 5.1 What the first attempt had already created — verified after reauth (11:15:53Z)

The create call had been accepted before the wall: Cloud Build `2cadd1c6-bce0-4080-ae4c-665e5ad903c0` SUCCESS at
11:03:39Z; the function reached ACTIVE at **11:05:07Z**. Only the CLI's *post-create* work was lost — the Cloud Tasks
queue upsert (and nothing else: `invoker` is unset in the code, so the CLI would not have touched the service policy).

| | |
|---|---|
| Function | `ebayEventWorker`, gen2, nodejs22, entryPoint `ebayEventWorker`, state ACTIVE, labels `deployment-tool: cli-firebase`, `deployment-taskqueue: true`, `firebase-functions-hash 60f528ed…` |
| Cloud Run service / revision | `ebayeventworker`, **`ebayeventworker-00001-cej`**, 100 % traffic, Ready True, created 11:04:51Z |
| Runtime service account | **`ebay-connector@eggcraft-studio.iam.gserviceaccount.com`** (the D2 identity; not the compute default) |
| Secrets mounted | six, all pinned to version **1**: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_TOKEN_KEY`, `EBAY_HASH_KEY`, `EBAY_CALLBACK_KEY`, `NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN` (`run.googleapis.com/secrets` annotation and `secretEnvironmentVariables` agree) |
| Sandbox settings present as env | `NIVADESK_EBAY_ENVIRONMENT`, `NIVADESK_EBAY_RUNAME` (values not printed; they are the two lines in §4); `NIVADESK_EBAY_CONNECTOR` **absent** — connector switch off |
| Also carried, as on every function from this `.env` | the Stripe/Apple/Play price and flag names, `STUDIOFLOW_WEB_APP_URL`, `NIVADESK_XERO_SECRETS_READY`, `NIVADESK_MALWARE_SCAN`, `NIVADESK_CLAMAV_URL`, `NIVADESK_MCP_ORCHESTRATOR` (names only) |
| Memory / timeout / concurrency / ingress | 256 Mi / 60 s / 80 / ALLOW_ALL (auth is IAM at the door, no `allUsers`) |
| Service IAM policy right after deploy | empty (etag only) — as the design predicted for `invoker` unset |
| Other functions deployed | **none** — `--only functions:ebayEventWorker`; the OpenAI/MCP, Stripe and every other revision untouched |

### 5.2 The failed step, finished the narrow way: the queue

The queue is created by firebase-tools *after* the function (`queueFromEndpoint`: `DEFAULT_SETTINGS` + the code's
`retryConfig`/`rateLimits`). Rather than re-running the deploy (a second build and revision for identical code), the
queue was created at **11:17:47Z** with exactly the field set the CLI computes: `maxAttempts 1`, `maxDoublings 16`,
`maxBackoff 3600s`, `minBackoff 0.100s`, `maxConcurrentDispatches 5`, `maxDispatchesPerSecond 500`, state RUNNING —
byte-for-byte the same shape as the CLI-created sibling `commerceEventWorker` (`maxBurstSize 100` is derived by the API).
A later by-name deploy of the worker will run the CLI's upsert against this queue and find nothing to change.

### 5.3 Rows 4, 6, 8 and queue logging — applied 11:17:50–11:17:54Z, read back 11:17:55Z

| Row | Binding | Read-back |
|---|---|---|
| 4 | `roles/cloudtasks.enqueuer` → `serviceAccount:ebay-connector@` on queue `…/queues/ebayEventWorker` | queue policy: exactly this one binding |
| 6 | `roles/run.invoker` → `serviceAccount:ebay-connector@` on service `ebayeventworker` | service policy: this binding |
| 8 | `roles/run.invoker` → `serviceAccount:477037475099-compute@` on service `ebayeventworker` | service policy: this binding — two members, nothing else |
| D10 | `--log-sampling-ratio=1.0` on the queue | `stackdriverLoggingConfig.samplingRatio: 1.0` |

Project-level roles naming `ebay-connector@` after all of this: `datastore.user`, `firebasecloudmessaging.admin`,
`logging.logWriter` — the three of §3, nothing more.


## 6. Delivery verification from the two identities — PASS on the second run, with the scope stated exactly

**Method** (design §7.3, `tests-ab.sh` in the raw folder): `gcloud tasks create-http-task` into the real queue
`ebayEventWorker`, target `POST https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayEventWorker`, body the
design's synthetic order event for a connection that does not exist. Two identities are involved in every task and are
reported separately:

| Identity in the path | Test A2 | Test A2-compute |
|---|---|---|
| **CreateTask caller** (the principal that enqueued) | `user:contact@eggcraft.co.uk` (roles/owner) — *not* a runtime SA | same |
| **OIDC token subject** (the identity Cloud Run authorised at the door) | `ebay-connector@eggcraft-studio.iam.gserviceaccount.com` | `477037475099-compute@developer.gserviceaccount.com` |
| Token minted by | Cloud Tasks service agent `service-477037475099@gcp-sa-cloudtasks…` (`roles/cloudtasks.serviceAgent` carries `iam.serviceAccounts.getOpenIdToken`, read live) | same |

**Run 1, 11:18Z — two instructive failures, both explained, neither a design fault of the grants:**

| Test | Cloud Tasks attempt | Cloud Run | Worker log |
|---|---|---|---|
| A (ebay SA) | `attemptResponseLog.status: PERMISSION_DENIED`, 1 attempt, task deleted | **403** `The request was not authenticated … The IAM principal lacks {run.routes.invoke} permission` (user-agent Google-Cloud-Tasks) | none — container not started |
| A-compute | `INTERNAL` | **500** | `Unhandled error Error: 3 INVALID_ARGUMENT: Resource id "__preflight__" is invalid because it is reserved` |

Reading: the token *was* present and named `ebay-connector@`; the binding of row 6 had been written 38 s earlier
(11:17:50Z) and had not propagated to Cloud Run's front door yet — the same task shape succeeded 3½ minutes later with no
change to any policy. The compute default passed at once because its pre-existing **project-level** `run.invoker` has
been in place for months. The second failure is in the design's payload: Firestore reserves `__x__` document ids, so the
lookup threw before the "missing connection" branch (fail-closed, no write, but not the intended signal). The design
document is corrected (`docs/ebay-cloud-tasks-oidc-design.md` §7.5 note; payload id now `preflight-missing-20260910`).

**Run 2, 11:21Z — corrected payload, no policy change since 11:17:54Z:**

| Test | Task | Cloud Tasks attempt | Cloud Run | Worker application log | Queue after |
|---|---|---|---|---|---|
| **A2** — OIDC `ebay-connector@` | `preflight-A2-112116`, created 11:21:17.077Z | dispatch 11:21:17.091Z → response 11:21:17.234Z, `INTERNAL`, 1 attempt | **500** at 11:21:17.126Z | 11:21:17.221Z **`Unhandled error Error: connection_missing at classedError (/workspace/ebayConnector.js:214:19)`** | 0 tasks |
| **A2-compute** — OIDC compute default | `preflight-A2-compute-112144`, created 11:21:45.013Z | dispatch 11:21:45.024Z → response 11:21:45.133Z, `INTERNAL`, 1 attempt | **500** at 11:21:45.052Z | 11:21:45.123Z **`Unhandled error Error: connection_missing`** | 0 tasks |

No 401, no 403. Firestore after both runs (read-only, ADC): `ebayConnections/preflight-missing-20260910` does not
exist; no `commerceEvents` row for `ebay|preflight|A2` or `ebay|preflight|A2-compute`; no `commerceHealth` row for the
id — the throw at `ebayConnector.js:1534` precedes every write, exactly as design §7.5 traces. No eBay API call, no push,
no workspace touched.

**What these two tests prove, and only that:**

- **Dispatch through the real queue with an OIDC token for each identity is accepted by Cloud Run and reaches
  application code**, and the handler fails closed. For `ebay-connector@` the *only* `run.routes.invoke` it holds is row 6
  on this service, so **row 6 is verified load-bearing**. For the compute default the acceptance is consistent with
  *both* row 8 and its pre-existing project-level `run.invoker`; **the test cannot distinguish them** — row 8 is verified
  only as present in the service policy (§5.3).
- They **do not** prove the runtime SA's own enqueue permission (row 4, `cloudtasks.enqueuer` for `ebay-connector@`) or
  the reflexive `actAs` (row 5): CreateTask was called by the operator, whose own owner-level `cloudtasks.tasks.create`
  and `actAs` were what the API checked. Those two are verified only as present in the policies. The production enqueue
  leg (a function running as `ebay-connector@` creating a task) is first exercised when one of the sixteen enqueues —
  design test B (`--impersonate-service-account`) would prove it earlier but needs `iam.serviceAccounts.getAccessToken`
  on `ebay-connector@` for the operator, which `roles/owner` does not carry (read live: false); **not granted, per
  instruction**.
- They do not prove secret readability beyond the container starting (no secret is read before the throw) — that is
  the sandbox OAuth step's job.

**Runbook lesson recorded:** after a fresh `run.invoker` binding, wait at least two minutes before a pre-flight; a 403
whose text says *lacks {run.routes.invoke}* within the first minute is propagation, not a missing grant.

## 7. Rollback plan — this step's resources only, nothing automatic

Nothing here runs on its own; each line is the operator's to order. Reverse order of creation; **never delete the service
account while a revision names it.**

| # | Undo | Command (all `--project eggcraft-studio`) |
|---|---|---|
| 1 | queue logging back to the CLI default | `gcloud tasks queues update ebayEventWorker --location europe-west2 --log-sampling-ratio=0` |
| 2 | rows 8, 6 (service) and 4 (queue) | `gcloud run services remove-iam-policy-binding ebayeventworker --region europe-west2 --member serviceAccount:477037475099-compute@developer.gserviceaccount.com --role roles/run.invoker`; same with `--member serviceAccount:ebay-connector@eggcraft-studio.iam.gserviceaccount.com`; `gcloud tasks queues remove-iam-policy-binding ebayEventWorker --location europe-west2 --member serviceAccount:ebay-connector@… --role roles/cloudtasks.enqueuer` |
| 3 | the worker (function + Cloud Run service; there is no previous revision — this is deletion, not revert) | `firebase functions:delete ebayEventWorker --region europe-west2 --force` |
| 4 | the queue (drain first: it is empty; `gcloud tasks list --queue ebayEventWorker --location europe-west2`) | `gcloud tasks queues delete ebayEventWorker --location europe-west2` |
| 5 | local arming | `rm functions/.ebay-secrets-ready`; delete the two `NIVADESK_EBAY_*` lines from the untracked `functions/.env` |
| 6 | the six secrets — **only on an explicit instruction**: the four generated values are unrecoverable, the two keyset values are re-copyable from the portal | `gcloud secrets delete <name>` ×6 |
| 7 | the SA's bindings, then the SA — only after step 3 (no revision may name it) | `gcloud projects remove-iam-policy-binding eggcraft-studio --member serviceAccount:ebay-connector@… --role roles/datastore.user` (and `logging.logWriter`, `firebasecloudmessaging.admin`); `gcloud iam service-accounts remove-iam-policy-binding ebay-connector@… --member serviceAccount:ebay-connector@… --role roles/iam.serviceAccountUser` (and the compute-default member); `gcloud iam service-accounts delete ebay-connector@…` |
| 8 | the source carry — a revert commit, never a reset or force-push | `git revert -m 1 cf9dd20b` (plus `e7f59525` if wanted); the deployed worker keeps running until step 3 regardless |

Pre-existing things this plan must not touch: the compute default's project-level roles, `commerceEventWorker` and its
queue, every other function, the Stripe/OpenAI revisions.

## 8. What remains, outside this step

1. **The other sixteen, by name** (deploy plan step 2's command minus `ebayEventWorker`), connector switch still off; the
   three scheduler jobs and the two public endpoints start with that deploy. Before it: the merge also changed
   `firestore.rules` — diff it against the live rules and deploy rules only as its own gate.
2. **Hostinger** `NIVADESK_EBAY_CALLBACK_KEY` = the value of `EBAY_CALLBACK_KEY` (read by the operator with `gcloud secrets
   versions access latest --secret EBAY_CALLBACK_KEY` in their own terminal), deploy-plan step 5, last.
3. **Portal deletion token** — prove the challenge hash locally against `ebayNotifications` (migration §7), then register
   the endpoint and subscribe `MARKETPLACE_ACCOUNT_DELETION`; the value is version 1 of the secret, no new version.
4. **Sandbox OAuth → order → refund** (package §6 table) once the connector switch is on for one workspace.
5. **Design test B** (enqueue as `ebay-connector@`) — either a temporary `roles/iam.serviceAccountTokenCreator` on the
   SA for the operator, removed afterwards, or the first real enqueue by one of the sixteen; read the queue's attempt
   records with `log-sampling-ratio` still 1.0.
6. Keep the queue's log sampling at 1.0 for the rollout window, then decide (D10).

# eBay sandbox — the approval package for D1 / D2 / D4 / D9 (10 September 2026)

Everything here is prepared, nothing is done: no service account, no IAM binding, no secret, no deploy, no relay
key in Hostinger, no OAuth flow, no RuName/Worker/production credential. The four decisions below are the only
things that need the operator's word; the rest is either already decided (D7 on 7 Sep) or already in the code.
Source documents: `ebay-runtime-service-account-proposal.md` (the grants), `ebay-cloud-tasks-oidc-design.md` (the
identity model), `ebay-deletion-token-migration.md` (the sixth secret), `ebay-functions-deploy-plan.md` (the
deploy), `ebay-sa-approval-package.md` (the eleven decisions), `ebay-morning-package-2026-09-10.md` (the night).

## 1. The four decisions

| | Subject | Recommended | Why it is needed |
|---|---|---|---|
| **D1** | Approve the seven grants at the scopes in §2 — three at project scope (`datastore.user`, `logging.logWriter`, `firebasecloudmessaging.admin`), four at resource scope (queue, service, the SA itself, each secret) | **Yes, as scoped.** Widening the resource-scoped ones to project would give the eBay identity enqueue rights on `commerceEventWorker` (Shopify/Woo/Square), invoke rights on all ~420 Cloud Run services and `actAs` over every SA including `amazon-caller@` | Without them the seventeen functions cannot read Firestore, write logs, send the two order pushes, read their secrets, or enqueue and receive their own tasks. Firestore IAM has no collection scope, so `datastore.user` is honest about buying secret isolation, not data isolation |
| **D2** | One runtime identity for all seventeen, two, or none | **One — `ebay-connector@eggcraft-studio.iam.gserviceaccount.com`, the shape already in the code (`EBAY_RUNTIME` binds the six secrets and the identity in one object); no code change** | "None" would mount the eBay secrets on the compute default that runs every other function and every public endpoint — the exact thing `access-control-policy.md` §5 exists to prevent. "Two" does not remove the `run.invoker` gap, it creates two of them, and the public edge (`ebayOAuthCallback`, `ebayNotifications`) needs the same secrets as the rest |
| **D4** | Also grant `roles/run.invoker` on `ebayeventworker` to the compute default (`477037475099-compute@`) | **Yes** — one member line on one service | The held-order release and the owner-clicked retry enqueue as the compute default; their tasks reach the worker only through a **project-level** `run.invoker` today. If that is ever narrowed the failure is silent (enqueue 200, dispatch 403, task deleted after one attempt, no application log). The local binding removes the hidden dependency |
| **D9** | Run proposal Step 4: `roles/iam.serviceAccountUser` on `ebay-connector@` for the compute default (deployer/build `actAs`) | **Run it** — it grants nothing today | Both deploying principals already hold `actAs` (the operator via `roles/owner`, the build SA via project-level `serviceAccountUser`); the binding is what survives a future narrowing of that project grant. Skipping is defensible; a confusing deploy failure later is the only cost |

Already settled and not reopened: **D3** (no `invoker` in `ebayEventWorker`'s options — the code has none, so `firebase-tools`
never rewrites the policies and the manual bindings survive redeploys), **D5** (pre-flight the worker alone), **D6** (the
sixth secret is in the code and the wiring test), **D7** (operator, 7 Sep: `user-managed --locations=europe-west2`),
**D8** (predefined FCM role now, custom later), **D10** (queue log sampling 1.0 for the rollout), **D11** (docs, done).

## 2. Identities and bindings — the exact IAM diff (nothing here exists today)

```
+ serviceAccount  ebay-connector@eggcraft-studio.iam.gserviceaccount.com      (display: "Runs the eBay connector's seventeen functions"; record its uniqueId)

project eggcraft-studio
+ roles/datastore.user                 member serviceAccount:ebay-connector@    (D1 — whole database; no finer scope exists)
+ roles/logging.logWriter              member serviceAccount:ebay-connector@    (D1)
+ roles/firebasecloudmessaging.admin   member serviceAccount:ebay-connector@    (D1, D8 — predefined now)

serviceAccount ebay-connector@  (the SA as a resource)
+ roles/iam.serviceAccountUser         member serviceAccount:ebay-connector@    (D1 grant 5 — names itself in the task's OIDC token)
+ roles/iam.serviceAccountUser         member serviceAccount:477037475099-compute@developer.gserviceaccount.com   (D9 — grants nothing today)

secrets (each as a resource; created empty; replication user-managed, europe-west2)
+ EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_TOKEN_KEY, EBAY_HASH_KEY, EBAY_CALLBACK_KEY, NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN
+ roles/secretmanager.secretAccessor   member serviceAccount:ebay-connector@   on each of the six, and nobody else

--- only after ebayEventWorker is deployed (the two resources do not exist before) ---
Cloud Run service ebayeventworker (europe-west2)
+ roles/run.invoker                    member serviceAccount:ebay-connector@                     (D1 grant 6)
+ roles/run.invoker                    member serviceAccount:477037475099-compute@…            (D4)
Cloud Tasks queue projects/eggcraft-studio/locations/europe-west2/queues/ebayEventWorker
+ roles/cloudtasks.enqueuer            member serviceAccount:ebay-connector@                     (D1 grant 4; the compute default already holds it at project scope — recorded, not duplicated)
```

Who needs what, and where: **`ebay-connector@`** runs all seventeen; it reads/writes Firestore (project), writes logs
(project), sends pushes (project), reads its six secrets (each secret), enqueues on its own queue (queue), names itself in
the OIDC token it attaches (itself), and is the identity Cloud Run must accept at the worker's door (service).
**`477037475099-compute@`** keeps running `releaseHeldIntegrationOrders` and `retryCommerceEvent` (they mount Shopify/Woo/
Square keys and serve every provider); it enqueues through its existing project-level `cloudtasks.enqueuer` and must be
accepted at the worker's door (service, D4). No grant crosses the project boundary; no Amazon resource is touched.

## 3. Cloud Tasks: who signs the token, who is invoked, what stops loss

- **The token.** `firebase-admin`'s task queue client attaches an OIDC token whose service account comes from the
  metadata server of the *enqueuing* function — there is no option that overrides it (design §2.1–2.2). So a task
  enqueued by `ebayNotifications`, `reconcileEbayDeletions` or the worker's own retry carries **`ebay-connector@`**; a
  task enqueued by `releaseHeldIntegrationOrders` or `retryCommerceEvent` carries **`477037475099-compute@`**.
- **The call.** Cloud Tasks dispatches to the `ebayeventworker` Cloud Run service; Cloud Run's front door checks
  `run.routes.invoke` for the token's SA before the container starts. Hence `run.invoker` for both principals (§2).
- **Two permissions, kept distinct:** `cloudtasks.tasks.create` on the queue at enqueue time (a synchronous 403 the
  enqueuing code sees) and `run.routes.invoke` on the service at dispatch time (seconds later, invisible to the enqueuer).
- **What prevents loss today, and where it does not.** The queue is deployed with `maxAttempts: 1` (`index.js:34201`),
  so a failed dispatch is not retried. Three of the four eBay enqueue sites catch an enqueue failure and **apply inline**
  (`ebayConnector.js:1832` notification gateway, `:1642` `driveDeletion` from the gateway and from `reconcileEbayDeletions`),
  so a missing **enqueue** grant degrades to inline processing and loses only worker retries. A missing **invoke** grant is
  the bad one: enqueue succeeds, dispatch 403s, the task is deleted, nothing in application code runs, and the
  account-deletion path loops invisibly (design §5.3). That is exactly why D5 deploys the worker alone first, D10 turns
  queue logging on, and tests A and B (design §7.3–7.4) prove enqueue + `actAs` + dispatch before the other sixteen exist.
  PASS signal: an ERROR log `Unhandled error … connection_missing` from `ebayeventworker` — application code reached, no
  Firestore write.

## 4. Secrets (names only, values never in a transcript)

| Secret | Value from | Read by |
|---|---|---|
| `EBAY_CLIENT_ID` | the **sandbox** keyset's App ID (operator) | OAuth begin/exchange, API calls |
| `EBAY_CLIENT_SECRET` | the sandbox keyset's Cert ID (operator, console paste) | token exchange |
| `EBAY_TOKEN_KEY` | `openssl rand -hex 32` piped straight into `gcloud secrets versions add` | seals refresh tokens at rest |
| `EBAY_HASH_KEY` | same, independent of the token key | `sellerUserIdHash`, notification matching |
| `EBAY_CALLBACK_KEY` | same; the identical value goes into Hostinger as `NIVADESK_EBAY_CALLBACK_KEY` in **step 5 of the deploy, last** | the web route's signed relay POST to `ebayOAuthCallback` |
| `NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN` | Form B of the migration: generated into a shell variable, `versions add` from it, pasted into the eBay portal from the same variable, then `unset` | the challenge GET on `ebayNotifications` |

All six: `--replication-policy=user-managed --locations=europe-west2` (D7), one `secretAccessor` binding each to
`ebay-connector@`, created in one loop so no secret ends up with a different policy. The CLI refuses a deploy while a
declared secret has no version, so values go in before the marker is written.

## 5. The seventeen, the sandbox settings, and what stays off

Deployed by name, never `--only functions` (each exported exactly once on the candidate, re-checked):

| Trigger | Functions |
|---|---|
| `onCall` ×11 | beginEbayConnect, claimEbayConnectState, getEbayConnections, verifyEbayConnection, updateEbayConnectionSettings, disconnectEbay, syncEbayNow, previewEbayImport, runEbayImport, retryEbayImportFailures, revealRestrictedCustomer |
| `onRequest` ×2 | ebayOAuthCallback, ebayNotifications (public the moment they deploy) |
| `onSchedule` ×3 | reconcileEbayConnections (15 min), reconcileEbayDeletions (10 min), reconcileEbayConnectionsNightly (02:40 Europe/London) — three new Cloud Scheduler jobs |
| `onTaskDispatched` ×1 | ebayEventWorker — new queue `ebayEventWorker` |

Settings on the deploying machine's `functions/.env` (not committed) — sandbox on, production off:

| Setting | Value | Effect |
|---|---|---|
| `functions/.ebay-secrets-ready` (marker file) or `NIVADESK_EBAY_SECRETS_READY=1` | present only on the deploying machine, only after the six secrets have versions | arms `EBAY_RUNTIME` = the six secrets + `ebay-connector@`; absent, every eBay function deploys on the compute default with no secret mounted |
| `NIVADESK_EBAY_ENVIRONMENT` | `sandbox` (also the code default) | `auth.sandbox.ebay.com` / `api.sandbox.ebay.com` / `apiz.sandbox.ebay.com` for every host; written on state and connection documents |
| `NIVADESK_EBAY_RUNAME` | the **sandbox** RuName (auth-accepted URL `https://nivadesk.app/ebay/callback`, declined URL `https://nivadesk.app/settings?section=ebay&ebay=cancelled`) | `redirect_uri` of the consent URL |
| `NIVADESK_EBAY_CONNECTOR` | **unset** | connector switch off: `beginEbayConnect` refuses, the callback answers `reason=disabled`, both sweeps return before reading a row, order tasks are recorded as skipped — account-deletion compliance still runs |
| `NIVADESK_EBAY_DELETION_ENDPOINT_URL` | default `https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayNotifications`, byte-identical to what the portal will hold | challenge hash input |
| `NIVADESK_EBAY_DAILY_CAP` / `NIVADESK_EBAY_DISPOSE` | defaults (5000 / `1`) | quota share; code disposal on |
| Hostinger `NIVADESK_EBAY_CALLBACK_KEY` | **absent until deploy step 5** | the web ticket route answers 503 until then; no seller can start a flow |

Production RuName, production keyset, the Cloudflare Worker cutover: **not part of this**; production OAuth stays behind
`ebay-final-gate-backlog.md` M1 (spoofable `x-forwarded-for`) and M4 (Worker design pre-§5.5).

## 6. Order, rollback, and the first sandbox verification

**Order** (`ebay-morning-package-2026-09-10.md` §3 has every command): 0 re-read the live facts → 1 create the SA, keep
`uniqueId` → 2 three project roles → 3 reflexive `actAs` (+ D9) → 4 six secrets, empty, D7 policy, accessor bindings;
values in (operator) → 5 marker file; deploy **`ebayEventWorker` alone**; `run.invoker` ×2 and `cloudtasks.enqueuer` on the
new resources → 6 queue `--log-sampling-ratio=1.0` → 7 pre-flight tests A and B → 8 the other sixteen by name, switch off →
9 challenge hash proved locally, then the portal: destination + `MARKETPLACE_ACCOUNT_DELETION` subscription + *Send Test
Notification* → ledger row `done`. Post-deploy watch: all 17 ready, project-wide ERROR/5xx window with a positive control,
and the two frequent sweeps seen returning clean on an empty set at least once (deploy plan step 3); callback matrix
(step 4: 405 on non-POST, 401 without/with a wrong relay key, no sensitive string in any log).

**Rollback** is deletion, not revert — none of the seventeen exists today: remove the marker, redeploy so `EBAY_RUNTIME`
becomes `{}`, delete the seventeen functions, the three scheduler jobs and the queue, drain, then unwind the bindings,
then the account. **Never delete the SA while a revision names it.** Partial rollback of the two post-deploy bindings alone
is safe: enqueue degrades to the inline fallbacks, worker retries are lost, nothing goes down.

**First sandbox OAuth → order → payment → refund** (its own approval and its own evidence file; needs the connector switch
on for one workspace):

| # | Step | Expect / evidence |
|---|---|---|
| 1 | `beginEbayConnect` from the test workspace | a ticket; consent URL with `auth.sandbox.ebay.com` and the sandbox RuName; scopes `sell.fulfillment.readonly` + `commerce.identity.readonly` only; the same ticket is refused twice |
| 2 | sandbox seller consents; callback lands via the signed relay | one state row, state burned; a replay refused; the code spent once, presented-code registry shows one entry |
| 3 | logs of all seventeen | no code/state/nonce/ticket/token/body string (the grep from deploy plan step 4) |
| 4 | token at rest | encrypted under `EBAY_TOKEN_KEY`; plaintext nowhere in Firestore; `verifyEbayConnection` succeeds; connection lists as verified |
| 5 | a sandbox order (created with eBay's sandbox buyer tooling) → `previewEbayImport` → `runEbayImport` | the order lands through the common engine: username as the name, buyer in `restrictedCustomer`, `commerce.provider = ebay`; the same order again is a duplicate under the same key |
| 6 | payment | the order's paid figure comes from the order's own totals (eBay has no `collectedBy`; the C&R array is the source, never NET — memory `marketplace-adapters-amazon-ebay`); payment keeps its external id and timestamp |
| 7 | a sandbox refund / cancellation | refund is its own record and never overwrites the sale; a cancelled order says cancelled without forgetting what the buyer paid; a cancellation on update writes a history entry |
| 8 | fulfilment | a sandbox shipment fills tracking and marks dispatch; a manual tracking number is not overwritten |
| 9 | sweeps | `reconcileEbayConnections` sees the connection and returns clean; the nightly follow-up finds the fulfilment |
| 10 | teardown decision | keep the sandbox connection or `disconnectEbay` (credentials deleted, who recorded, orders kept) |

Rows 5–9 are what the emulator suite already proves with a fake eBay (`commerce-ebay-connector-emulator.test.js`
#3–#6, #12, #15–#16); the sandbox run is the first time a real eBay answers.

## 7. What must be carried from the deploy branch — the candidate

The eBay branch (`ebay-connector` @ `5a3ea7f6`) and the deploy branch (`macbook-save-before-macstudio-2026-06-01` @
`2c2615dc`) diverged at `1eef5c8b`: 90 commits on the eBay side, 175 on the deploy side. Deploying the seventeen from the
eBay worktree would ship a `functions/` tree without the Stripe L1 fix (`76c5e3c3`), the OpenAI 1.2.0 surface and its
nodemailer 9.1.1 floor (`baa21204`…), and the v2.1 checklist (`b9aeec70`); by-name deploys would not touch those *live*
services, but the eBay bundle would be built from stale shared code and every later by-name deploy of a shared function
from that tree would regress it. So the deploy source must be the deploy branch with the eBay branch merged in.

**Candidate: `ebay-carry-candidate` @ `e4bb38b9`** (pushed) — `ebay-connector` merged `--no-ff` onto `2c2615dc`. Two
conflicts, both mechanical and resolved: `studioflow-web/package.json` scripts (union of `test:file-proxy`,
`test:relay`, `test:ebay-regressions`) and the generated `functions/assistant/guideTree.json` (rebuilt with
`buildGuideCorpus.js` from the auto-merged `guide.ts`; `guide-corpus-fresh` green). Verified on the merged tree: the
seventeen eBay exports, `getSetupChecklist`, `chatgptOAuthAuthorize`, `chatgptMcp`, `stripeWebhook`,
`resyncStripeWorkspaceEntitlements` and `getActivationFunnel` all present; nodemailer 9.1.1; `substantiveOrder` module
present. Full `functions` suite on the merged tree (`npm test`, qa + inventory, run 09:21 UTC): **exit 0, 1,655 PASS**.

**Scope that protects the live services:** the carry changes nothing that is deployed. The Stripe webhook
(`stripewebhook-00047-por`), the nineteen OpenAI/mail functions of 1.2.0 (in review — **frozen**: no redeploy of
`chatgptMcp` or the OAuth functions), and `getsetupchecklist-00003-noh` keep their revisions; the eBay deploy names only
the seventeen. The MCP/OAuth freeze is compatible: none of the seventeen touches tools/list, annotations, scopes or flags.

## 8. Not done, by instruction

No SA, no binding, no secret, no deploy, no relay key, no OAuth, no RuName/Worker/production credential. The candidate
branch is a merge on a scratch branch; the deploy branch itself was not moved.

**GO / NO-GO:** GO for approving D1, D2, D4, D9 as recommended and for the carry of `e4bb38b9` onto the deploy branch once
its full suite is green; NO-GO for anything in §8 until the next instruction.

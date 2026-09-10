# eBay sandbox — step 2 of the rollout: the remaining sixteen functions (10 September 2026)

Operator's instruction (10 Sep, ~11:38Z): the backend stage only — verify the source base, examine the Firestore rules
diff against the *live* rules and publish only eBay-required, non-widening, test-passing rules (stop and report any
unrelated diff), record the sixteen functions' identities and triggers, deploy them by name with the connector off, verify,
record rollback and open items. Out of scope, by instruction: the Hostinger relay key, the portal deletion token, the
connector switch, Sandbox OAuth, any production eBay connection, any redeploy of the OpenAI MCP/OAuth or Stripe/checklist
functions, any Google case activity.

## 1. Source base (11:39:54Z)

Branch `macbook-save-before-macstudio-2026-06-01` @ `05d6765e` == origin; working tree clean, nothing untracked.
Ancestors present: `76c5e3c3` (Stripe L1 / trial stamp), `baa21204` (OpenAI 1.2.0 + nodemailer floor — `functions/package.json`
carries `"nodemailer": "^9.1.1"`), `b9aeec70` (checklist v2.1), `cf9dd20b` (the eBay carry), `658fe5f8` (the CI YAML fix).
`functions/` tree identical to the origin tip and to the tree that passed CI run 34471692589 (unit + relay + rules/e2e, all
green at 11:33Z). Marker present; `.env` carries `NIVADESK_EBAY_ENVIRONMENT=sandbox` and the sandbox RuName; no
`NIVADESK_EBAY_CONNECTOR` line. All three credentials valid (gcloud user, ADC, Firebase CLI).

## 2. Firestore rules — the diff against what is live, and why the rules were NOT published

**Live ruleset:** `projects/eggcraft-studio/rulesets/f7e615d0-ddfb-44ba-b7b5-2a75d59f4f8a`, released 2026-09-04T15:04:56Z
(read through the Rules API; copy in the raw folder). **1,263 lines.** The branch's pre-merge `firestore.rules` (`b9757af9`)
has 1,272 lines; HEAD has 1,310.

**Finding 1 — the live rules are not the branch's pre-merge rules.** The branch had already gained, after the 4 Sep
release, a block that is not live:

```
+    match /fileScans/{document=**} {          // +9 lines incl. comment: the malware-scan verdicts and withheld
+      allow read, write: if false;            // download tokens — server-only, both directions
+    }
```

That block belongs to the malware-scan feature (4 Sep, flag on since 22:03Z that day), not to eBay. It is deny-only, so it
cannot widen anything, and under the live root catch-all (`match /{document=**} { allow read, write: if false; }`, line
1259) `fileScans` is already unreachable from clients — the block is declarative. But it is an **unrelated diff inside the
same file**, and the instruction for that case is to stop the rules deploy and report the concrete difference. **Stopped;
no rules were published.** Deploying HEAD's `firestore.rules` would ship the eBay lines *and* this block; deploying a
hand-edited file that omits it would publish something no commit holds. The operator decides which.

**Finding 2 — the eBay part of the diff (+36 lines), all deny-only:**

| Change | Lines | Effect |
|---|---|---|
| `match /companies/{companyId}/revealCounters/{document=**} { allow read, write: if false; }` | +8 | the per-member reveal rate-limit counters become server-only |
| `&& collectionId != 'revealCounters'` in both `companies/{cid}/{collectionId}` wildcard deny-lists (read at 927, write at 987) | +2 | closes the member wildcard for that subcollection (the file's 3-place rule for sensitive subcollections: `restrictedCustomer` was already listed) |
| seven top-level server-only collections: `ebayConnections`, `ebayConnectStates`, `ebayBuyers`, `ebayDeletionRequests`, `ebayQuota`, `ebayNotificationKeys`, `ebayPresentedCodes` | +26 | explicit deny; under the live root catch-all they are already unreachable, so these lines are declarative today |

**What is exposed while the eBay rules stay unpublished:** exactly one thing — a signed-in workspace member can read/write
`companies/{their cid}/revealCounters/{uid}` through the live member wildcard, i.e. reset their own reveal budget. That
matters only once `restrictedCustomer` rows exist, which needs the connector switch on and an import — neither is in this
step. Recorded as a **blocker before the connector switch** (§7). The seven top-level collections are protected by the
live catch-all regardless.

**Tests:** `functions/test/qa/ebay-rules.test.mjs` against the Firestore emulator with HEAD's rules — 52 assertions PASS
(outsider, signed-out visitor: no read/write/update/delete on any of the seven collections, on `restrictedCustomer`, on
`revealCounters`; no minting of connect states, presented codes, buyer documents; no counter reset). CI's
"rules + e2e (Firestore emulator)" job on the same tree: success (run 34471692589, 11:33Z).

## 3. The sixteen — names, identity, secrets, triggers, and what they do with the connector off

Every one is created through `createEbayConnectorFunctions` (`functions/index.js:6191-6212`) whose `onCall`/`onRequest`/
`onSchedule` wrappers spread `EBAY_RUNTIME` = the six secrets + `serviceAccount: ebay-connector@`; region `europe-west2`.

| # | Function | Trigger | Options | With `NIVADESK_EBAY_CONNECTOR` unset |
|---|---|---|---|---|
| 1 | beginEbayConnect | onCall | 60 s | after auth + membership: `failed-precondition` "eBay is not enabled on this server yet." (`ebayConnector.js:507`) |
| 2 | claimEbayConnectState | onCall | 60 s | same gate (`:532`) |
| 3 | getEbayConnections | onCall | 60 s | lists the workspace's rows (none exist); returns `configured: false`, `environment: sandbox` (`:985`) |
| 4 | verifyEbayConnection | onCall | 60 s | membership + row lookup; no rows |
| 5 | updateEbayConnectionSettings | onCall | 60 s | membership + row lookup; no rows |
| 6 | disconnectEbay | onCall | 60 s | membership + row lookup; no rows |
| 7 | syncEbayNow | onCall | 300 s | `failed-precondition` gate (`:1350`) |
| 8 | previewEbayImport | onCall | 300 s | membership + connection lookup; no rows |
| 9 | runEbayImport | onCall | 540 s | same |
| 10 | retryEbayImportFailures | onCall | 300 s | same |
| 11 | revealRestrictedCustomer | onCall | 60 s | membership, order ownership, reveal policy, rate counter; `not-found` while no `restrictedCustomer` row exists (`:1851-1866`) |
| 12 | ebayOAuthCallback | onRequest (public URL) | 120 s, maxInstances 10 | GET → 405; POST without a valid `EBAY_CALLBACK_KEY` signature → 401; with the connector off a signed POST answers `outcome: error`/disabled without touching state (`:769`) |
| 13 | ebayNotifications | onRequest (public URL) | 30 s | GET → plain text; GET with `challenge_code` → the sha256 challenge answer (token is mounted); POST without `x-ebay-signature` → 401; order notifications with the connector off → `received`, no processing (`:1818`); account-deletion notifications are processed regardless (compliance, `:1795-1810`) — nothing is registered in the portal yet, so none arrive |
| 14 | reconcileEbayConnections | onSchedule every 15 min, Europe/London | 540 s | `runSweep`: logs `ebay reconcile sweep: connector off` and returns **before reading any row** (`:1321`) |
| 15 | reconcileEbayConnectionsNightly | onSchedule every day 02:40, Europe/London | 540 s | same, `(nightly)` |
| 16 | reconcileEbayDeletions | onSchedule every 10 min, Europe/London | 300 s | ungated by design (compliance): reads `ebayDeletionRequests` where status ∈ {queued, failed} (single-field equality, no composite index needed); the ledger is empty → scans 0, logs nothing (`:1694-1728`) |

Not in this deploy: **ebayEventWorker** (live since step 1, `ebayeventworker-00001-cej`; not redeployed).

Effect on existing customers and on anything outside the sandbox: none by construction — every callable requires a
signed-in workspace member and then refuses or finds nothing; the two public endpoints refuse unsigned traffic; the
sweeps read nothing (14, 15) or an empty ledger (16); `NIVADESK_EBAY_ENVIRONMENT=sandbox` selects `*.sandbox.ebay.com`
for any call that could ever be made; the functions run as `ebay-connector@`, which holds no permission outside this
project.

**What the CLI does for these triggers (read from firebase-tools 15.19.0):** callables and `onRequest` get `run.invoker`
for `allUsers` (auth is enforced in the SDK/handler); the three scheduled functions get a Cloud Scheduler job whose OIDC
token names `ebay-connector@` (`cloudscheduler.js:136`, `endpoint.serviceAccount`) and `run.invoker` for `ebay-connector@`
on their own service (`fabricator.js` scheduleTrigger branch) — the Cloud Scheduler service agent
`service-477037475099@gcp-sa-cloudscheduler…` holds `roles/cloudscheduler.serviceAgent`, which carries
`iam.serviceAccounts.getOpenIdToken` (read live). No project-wide grant is made by the deploy.

## 4. Deploy — sixteen by name, one command, 11:43:25Z → 11:45:54Z

`chain-16-deploy.sh` (raw folder): pre-checks (credentials, Stripe ancestor, clean tree, `.env`, marker, connector flag
unset, sandbox env + RuName, `functions/` == origin tip, `HEAD` = `05d6765e`), then

```
npx firebase deploy --project eggcraft-studio --only functions:beginEbayConnect,functions:claimEbayConnectState,
  functions:disconnectEbay,functions:ebayNotifications,functions:ebayOAuthCallback,functions:getEbayConnections,
  functions:previewEbayImport,functions:reconcileEbayConnections,functions:reconcileEbayConnectionsNightly,
  functions:reconcileEbayDeletions,functions:retryEbayImportFailures,functions:revealRestrictedCustomer,
  functions:runEbayImport,functions:syncEbayNow,functions:updateEbayConnectionSettings,functions:verifyEbayConnection
  --non-interactive
```

Source uploaded once, sixteen `Successful create operation`, `Deploy complete!`, exit 0, no authentication error this time
(the session had been re-authenticated at 11:15Z). `ebayEventWorker` was not in the command and keeps
`ebayeventworker-00001-cej`. No other function was named; the OpenAI/MCP, Stripe and checklist revisions are untouched.

## 5. Verification (11:46–11:47Z, `verify-16.sh` in the raw folder)

**Services** — every one of the sixteen: revision `<name>-00001-*`, Ready `True`, runtime service account
**`ebay-connector@eggcraft-studio.iam.gserviceaccount.com`**, **6** secret-backed env vars (the six secrets at version 1),
`NIVADESK_EBAY_ENVIRONMENT` + `NIVADESK_EBAY_RUNAME` present and `NIVADESK_EBAY_CONNECTOR` absent, one shared source
hash `firebase-functions-hash 648dc3f…` (one upload for all sixteen), ingress `all`:

| Function | Revision | Invoker policy (set by the CLI per trigger type) |
|---|---|---|
| beginEbayConnect | beginebayconnect-00001-waj | `run.invoker: allUsers` (callable; auth in the SDK) |
| claimEbayConnectState | claimebayconnectstate-00001-run | allUsers |
| disconnectEbay | disconnectebay-00001-dep | allUsers |
| ebayNotifications | ebaynotifications-00001-wuv | allUsers (public endpoint by design) |
| ebayOAuthCallback | ebayoauthcallback-00001-bij | allUsers (public endpoint by design) |
| getEbayConnections | getebayconnections-00001-gun | allUsers |
| previewEbayImport | previewebayimport-00001-vul | allUsers |
| reconcileEbayConnections | reconcileebayconnections-00001-xan | **`run.invoker: ebay-connector@` only** |
| reconcileEbayConnectionsNightly | reconcileebayconnectionsnightly-00001-tiy | ebay-connector@ only |
| reconcileEbayDeletions | reconcileebaydeletions-00001-sah | ebay-connector@ only |
| retryEbayImportFailures | retryebayimportfailures-00001-pep | allUsers |
| revealRestrictedCustomer | revealrestrictedcustomer-00001-vom | allUsers |
| runEbayImport | runebayimport-00001-tod | allUsers |
| syncEbayNow | syncebaynow-00001-gun | allUsers |
| updateEbayConnectionSettings | updateebayconnectionsettings-00001-kat | allUsers |
| verifyEbayConnection | verifyebayconnection-00001-buj | allUsers |
| *(ebayEventWorker, unchanged)* | ebayeventworker-00001-cej | ebay-connector@ + compute default (step 1, rows 6/8) |

**Source match.** The worker's upload (11:03Z, hash `60f528e…`) and the sixteen's upload (11:44Z, hash `648dc3f…`) are two
archives of the same `functions/` tree object — `git rev-parse e7f59525:functions` == `05d6765e:functions` (the commits in
between touched only `docs/`, `.github/` and `.gitignore`). §5.1 below adds the archive-level check.

**Scheduler jobs** (created by the deploy, `europe-west2`): three, all ENABLED, HTTP POST to the function's own
`cloudfunctions.net` URL with an OIDC token for **`ebay-connector@`** (matches the `run.invoker` above):
`firebase-schedule-reconcileEbayConnections-europe-west2` — every 15 minutes; `…-reconcileEbayConnectionsNightly-…` — every
day 02:40; `…-reconcileEbayDeletions-…` — every 10 minutes; time zone Europe/London. No attempt yet at 11:47Z.

**Refusals (no credential, no signature), 11:46:59Z:**

| Probe | Answer |
|---|---|
| POST `{}` without auth → beginEbayConnect, getEbayConnections, revealRestrictedCustomer, syncEbayNow | **401** `UNAUTHENTICATED` ("You must be signed in …") — the membership gate runs before any eBay logic |
| GET ebayOAuthCallback | **405** `{"ok":false}` |
| POST ebayOAuthCallback, unsigned | **401** `{"ok":false}` |
| GET ebayNotifications (no `challenge_code`) | **200** `eBay notification endpoint` (plain text, no data) |
| POST ebayNotifications, no `x-ebay-signature` | **401** `{"ok":false,"error":"invalid_signature"}` |
| POST reconcileEbayConnections, no token | **403** from Cloud Run's door (only `ebay-connector@` may invoke) |

**Logs** from every `ebay*` service since 11:43:25Z at WARNING or above: none.

### 5.1 Source archive, file by file

`gs://gcf-v2-sources-477037475099-europe-west2/beginEbayConnect/function-source.zip` (generation 1789040647700460,
11:45:29Z) unpacked and compared with the working tree's `functions/` (node_modules excluded): **385 files, 0
differences, 0 files only on either side.** The worker's archive (`ebayEventWorker/function-source.zip`, generation
1789038218938066, 11:05:07Z) was built from the same tree object `159216d7…` (`git rev-parse e7f59525:functions` ==
`05d6765e:functions`); its different `firebase-functions-hash` reflects a separate upload, not different source.

### 5.2 The scheduler jobs, untruncated

| Job | Target | Schedule | Deadline | OIDC subject / audience |
|---|---|---|---|---|
| firebase-schedule-reconcileEbayConnections-europe-west2 | POST …/reconcileEbayConnections | every 15 minutes, Europe/London | 540 s | ebay-connector@ / the target URL |
| firebase-schedule-reconcileEbayConnectionsNightly-europe-west2 | POST …/reconcileEbayConnectionsNightly | every day 02:40, Europe/London | 540 s | same |
| firebase-schedule-reconcileEbayDeletions-europe-west2 | POST …/reconcileEbayDeletions | every 10 minutes, Europe/London | 300 s | same |

Retry config: none (Cloud Scheduler default, no retries). The Cloud Scheduler service agent mints the token
(`roles/cloudscheduler.serviceAgent` carries `getOpenIdToken`); the deployer's `actAs` on `ebay-connector@` was exercised
when the jobs were created (operator, roles/owner).

### 5.3 First scheduled runs — both frequent sweeps ran, with the connector off, and touched nothing

| Job | First attempt | Cloud Run | Application log | Job status |
|---|---|---|---|---|
| reconcileEbayDeletions (every 10 min) | 11:55:01.766Z | **HTTP 200**, user-agent Google-Cloud-Scheduler (11:55:01.788Z) | none — `reconcileDeletionRequests` logs only when a row is re-driven or stuck; the ledger is empty | OK (empty status), next 12:05Z |
| reconcileEbayConnections (every 15 min) | 12:00:00.212Z | **HTTP 200**, Google-Cloud-Scheduler (12:00:00.255Z) | **`ebay reconcile sweep: connector off`** at 12:00:00.293Z — `runSweep` returned before reading a row | OK, next 12:15Z |
| reconcileEbayConnectionsNightly | not yet — first at 2026-09-11T01:40Z (02:40 Europe/London) | — | — | scheduled |

So the scheduler's OIDC token for `ebay-connector@` is accepted at each sweep service's door (the CLI-made
`run.invoker: ebay-connector@`), the handlers reach application code, and with the connector off they do exactly what §3
predicted: the connection sweep exits on the flag, the deletion sweep scans an empty ledger. No WARNING or ERROR from any
`ebay*` service between the deploy and 12:04Z apart from the operator's own 403 probe at 11:47Z. No eBay API call is
possible from either path in this state.


## 6. Rollback for this step — deletion, nothing automatic, the worker and step 1 untouched

None of the sixteen has a previous revision; rollback is deletion. The three scheduler jobs are deleted together with
their functions by `firebase functions:delete` (the CLI removes the job it created); confirm with `gcloud scheduler jobs
list --location europe-west2` afterwards, and delete any survivor by name.

```
firebase functions:delete beginEbayConnect claimEbayConnectState disconnectEbay ebayNotifications ebayOAuthCallback \
  getEbayConnections previewEbayImport reconcileEbayConnections reconcileEbayConnectionsNightly reconcileEbayDeletions \
  retryEbayImportFailures revealRestrictedCustomer runEbayImport syncEbayNow updateEbayConnectionSettings \
  verifyEbayConnection --project eggcraft-studio --region europe-west2 --force
gcloud scheduler jobs list --location europe-west2 --project eggcraft-studio | grep -i ebay      # expect nothing
```

The two public endpoints stop existing with their functions; the callables likewise. Step 1's resources (worker, queue,
rows 4/6/8, secrets, SA) are covered by `ebay-sandbox-rollout-2026-09-10.md` §7 and are **not** touched by this rollback.
Pausing instead of deleting: `gcloud scheduler jobs pause <job> --location europe-west2` stops a sweep without a deploy.
No rules were published, so there is nothing to roll back on the rules side.

## 7. Open items and blockers

1. **Firestore rules — operator decision needed (§2).** Publishing HEAD's `firestore.rules` ships the 36 eBay lines
   together with the unrelated `fileScans` block (9 lines, deny-only, declarative under the root catch-all). Until the
   eBay lines are live, a member can reset their own `revealCounters` document — irrelevant while no
   `restrictedCustomer` row exists, **a blocker before the connector switch goes on**.
2. **Runtime SA's own enqueue leg still not behaviourally proven** (`cloudtasks.enqueuer` for `ebay-connector@`, row 4, and
   the reflexive `actAs`, row 5): nothing in this step enqueues — the sweeps return before any row with the connector
   off, the ledger is empty, and no notification is registered. First exercised by a real notification or an import once
   the connector is on; design test B remains the earlier option (needs a temporary tokenCreator grant).
3. The next step's items, unchanged: Hostinger `NIVADESK_EBAY_CALLBACK_KEY`; the portal deletion token (prove the
   challenge locally first — the endpoint now answers challenges); the connector switch for one workspace; Sandbox OAuth →
   order → refund.
4. The malware-scan `fileScans` rules block is on the branch but not live since 4 Sep — a separate, non-eBay decision.


# eBay — the morning package (10 September 2026, night)

Prepared on branch `ebay-connector` (worktree `~/Developer/studioflow-ebay`). **Nothing was created in
GCP, nothing deployed, no credential touched, no eBay portal change.** This page collects, in one place,
what the operator decides in the morning, what was resolved tonight because an earlier decision already
settled it, the exact delivery sequence with its commands, the test evidence, and the sandbox preparation.

## 1. The eleven decisions (`docs/ebay-sa-approval-package.md` §4)

| # | Decision | Recommendation in the package | Tonight |
|---|---|---|---|
| D1 | Approve the seven grants at the written scopes | yes | **operator** (IAM) |
| D2 | SA shape: one for all seventeen / two / none | one — the shape already in the code | **operator** (IAM); no code change either way |
| D3 | `invoker` in `ebayEventWorker`'s options, or bind by hand | bind by hand, leave the code alone | **resolved: already the code state** — `ebayEventWorker` options carry no `invoker` (re-read tonight, §5 of the package); nothing to change |
| D4 | `run.invoker` on `ebayeventworker` for the compute default | yes | **operator** (IAM) |
| D5 | Deploy `ebayEventWorker` alone as a pre-flight | yes | **resolved as the plan's order** — §3 step 5 below deploys it first and runs tests A and B before the sixteen |
| D6 | Migrate the deletion verification token to Secret Manager, before the deploy | yes, before | **done in code tonight**: sixth `defineSecret("NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN")` in `EBAY_SECRET_PARAMS` (`functions/index.js`), the pinned regex in `commerce-ebay-wiring.test.js` extended and its "five" wording made "six"; the secret itself is created in §3 step 4 (operator, with the value) |
| D7 | Secret replication policy | **decided by the operator, 7 Sep: `user-managed --locations=europe-west2`** | applied to every command in §3 |
| D8 | FCM: predefined role now, custom later | predefined now | **resolved as the plan's order** — §3 step 2 grants `roles/firebasecloudmessaging.admin`; the custom-role tightening is listed under "after a push is observed", not in the rollout |
| D9 | Run proposal Step 4 (compute default `actAs` on the new SA) | run it | **operator** (IAM; grants nothing today) — kept in §3 step 3 as optional |
| D10 | Queue `--log-sampling-ratio=1.0` for the rollout | yes | **resolved as the plan's order** — §3 step 6, right after the queue exists, before the pre-flight tasks; a non-IAM write, reversible |
| D11 | The two documentation corrections in the same commits as the changes | yes, both | **done tonight**: `docs/security/access-control-policy.md` §5 gains the "secret isolation, not data isolation" sentence; the three `ebay-connector-design.md` sentences (`:121`, `:3192`, `:3717`) now say the challenge needs the token secret mounted |

So the morning holds **four IAM approvals** (D1, D2, D4, D9) and nothing else: D3, D5, D8, D10 are
ordering choices the package already recommended and the runbook below simply follows; D6, D7 and D11 are
done or decided.

## 2. What was verified tonight

| Check | Result |
|---|---|
| The 13 eBay unit suites (`commerce-ebay-*`, `ebay-connect`, `ebay-sync`) | **all green** (see night report; `ebay-tests.log`) — `commerce-ebay-wiring` green *after* the D6 edit, read explicitly |
| The two emulator suites (`commerce-ebay-connector-emulator`, `ebay-account-deletion-emulator`) via `firebase emulators:exec --only firestore` | recorded in the night report's Task 5 row when the run finished |
| Gate state | `functions/.ebay-secrets-ready` absent; `NIVADESK_EBAY_CONNECTOR` unset; no eBay service in Cloud Run (unchanged since `ebay-functions-deploy-plan.md`'s listing) |
| Precondition 5 (the runtime SA) | still **MISSING** — by instruction |

## 3. Delivery runbook — the exact sequence, not run

Assembled from `ebay-runtime-service-account-proposal.md` §8, `ebay-cloud-tasks-oidc-design.md` §7 and
`ebay-deletion-token-migration.md` §5–§7, in the order `ebay-sa-approval-package.md` §6 sets. Every
command is the operator's to run **after D1/D2/D4/D9 are approved**; the assistant runs none of them.

```bash
PROJECT=eggcraft-studio; REGION=europe-west2
SA=ebay-connector@$PROJECT.iam.gserviceaccount.com
COMPUTE=477037475099-compute@developer.gserviceaccount.com
```

**Step 0 — re-read the live facts (read-only).** `gcloud iam service-accounts describe "$SA"` must still
say NOT_FOUND; `gcloud secrets list` must still show none of the six; `gcloud run services list … | grep -i ebay`
must be empty. If any differs, stop and re-read the package §3.

**Step 1 — create the account and record its `uniqueId`** (D2):
```bash
gcloud iam service-accounts describe "$SA" --project="$PROJECT" >/dev/null 2>&1 || \
gcloud iam service-accounts create ebay-connector --project="$PROJECT" --display-name="Runs the eBay connector's seventeen functions"
gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format='value(uniqueId,email)'   # keep the number
```

**Step 2 — the three project-level roles** (D1, D8 predefined):
```bash
for R in roles/datastore.user roles/logging.logWriter roles/firebasecloudmessaging.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="$R" --condition=None --quiet
done
```

**Step 3 — `actAs` on itself; optionally the compute default** (D1 grant 5; D9):
```bash
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT" --member="serviceAccount:$SA" --role=roles/iam.serviceAccountUser --quiet
# D9, optional, grants nothing today:
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT" --member="serviceAccount:$COMPUTE" --role=roles/iam.serviceAccountUser --quiet
```

**Step 4 — the six secrets, empty, D7 policy, one accessor binding each** (D6, D7):
```bash
for S in EBAY_CLIENT_ID EBAY_CLIENT_SECRET EBAY_TOKEN_KEY EBAY_HASH_KEY EBAY_CALLBACK_KEY NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN; do
  gcloud secrets create "$S" --project="$PROJECT" --replication-policy=user-managed --locations="$REGION"
  gcloud secrets add-iam-policy-binding "$S" --project="$PROJECT" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor --quiet
done
```
Values: `EBAY_CLIENT_ID` (sandbox App ID) and `EBAY_CLIENT_SECRET` (sandbox Cert ID) pasted by the operator
in the console; `EBAY_TOKEN_KEY`, `EBAY_HASH_KEY`, `EBAY_CALLBACK_KEY` and the deletion token generated
with `openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add "$S" --data-file=-` — never echoed,
never in `functions/.env`. `EBAY_CALLBACK_KEY` is also set in Hostinger's build environment as
`NIVADESK_EBAY_CALLBACK_KEY` (`ebay-web-callback-deploy-plan.md:265`). **The deletion token's value is
pasted into the eBay portal from the same shell variable in the same sitting — never a new version
without the portal (D-TOK-6).**

**Step 5 — arm the marker, pre-flight the worker alone** (D3, D5):
```bash
touch functions/.ebay-secrets-ready      # on the deploying machine only; not committed
firebase deploy --project "$PROJECT" --only "functions:ebayEventWorker"
gcloud run services add-iam-policy-binding ebayeventworker --region="$REGION" --project="$PROJECT" --member="serviceAccount:$SA" --role=roles/run.invoker --quiet
gcloud run services add-iam-policy-binding ebayeventworker --region="$REGION" --project="$PROJECT" --member="serviceAccount:$COMPUTE" --role=roles/run.invoker --quiet   # D4
gcloud tasks queues add-iam-policy-binding ebayEventWorker --location="$REGION" --project="$PROJECT" --member="serviceAccount:$SA" --role=roles/cloudtasks.enqueuer --quiet
```

**Step 6 — queue logging for the rollout window** (D10):
```bash
gcloud tasks queues update ebayEventWorker --location="$REGION" --project="$PROJECT" --log-sampling-ratio=1.0
```

**Step 7 — pre-flight tasks A and B** (`ebay-cloud-tasks-oidc-design.md` §7.3–§7.6; read the pass/fail
table there before running): task A with `--oidc-service-account-email=$SA`; task B the same plus
`--impersonate-service-account=$SA`. PASS is an ERROR log line `Unhandled error … connection_missing`
from `ebayeventworker` — the payload throws before any Firestore write. Check `gcloud tasks create-http-task --help`
for flag spellings first (design §8 row 7).

**Step 8 — the other sixteen, by name** (`ebay-functions-deploy-plan.md` step 2's command, minus the
worker already deployed). Connector switch stays **off** (`NIVADESK_EBAY_CONNECTOR` unset): three scheduler
jobs start and return early; `ebayNotifications` is live and answers the challenge once the token secret
has a version.

**Step 9 — prove the challenge against a locally computed hash, then register with eBay** (D-TOK-6,
migration §7): `sha256hex(code + token + "https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayNotifications")`
computed locally must equal the endpoint's answer **before** the portal registration; then subscribe
`MARKETPLACE_ACCOUNT_DELETION` and press *Send Test Notification*; expect a ledger row `done`.

**Rollback** (package §6): code first, IAM last — remove the marker, redeploy the seventeen so
`EBAY_RUNTIME` becomes `{}`, delete the seventeen functions, the three scheduler jobs and the queue
(`ebay-functions-deploy-plan.md` "Rollback — deletion, not revert"), drain, then unwind bindings, then the
account. **Never delete the SA while a revision names it.**

## 4. Sandbox preparation — what exists and what the operator brings

| Item | State |
|---|---|
| Sandbox keyset (App ID / Cert ID) | operator's (`ebay-operator-approval-brief.md` §3: sandbox and production are separate keysets, one value at a time) — pasted in step 4, never handled by the assistant |
| Sandbox RuName and the four URLs | `ebay-operator-approval-brief.md` §2 lists them; the web callback `nivadesk.app/ebay/callback` is live since Round 167 (`ebay-web-deploy-round-167.md`) with the signed browser-binding ticket |
| `NIVADESK_EBAY_CALLBACK_KEY` in Hostinger's build env | not set until step 4's value exists — the relay POST answers 401 until then (by design) |
| `NIVADESK_EBAY_ENVIRONMENT=sandbox` | the e2e suites run it this way; production value is a separate gate |
| First sandbox OAuth E2E checklist | `ebay-functions-deploy-plan.md` step 4 onward; needs the connector switch on for one workspace — its own approval |
| Production RuName / Cloudflare Worker cutover / production keyset | **not tonight, not in this package** — `ebay-final-gate-backlog.md` M1 (spoofable `x-forwarded-for`) and M4 (Worker design pre-§5.5) stand in front of production OAuth |

## 5. Left open, on purpose

- The four IAM approvals above; the secret values; the marker file; every deploy.
- `ebay-final-gate-backlog.md` items M1–M4 and L1–L8 are unchanged tonight.
- D8's custom FCM role and D-OIDC-3's custom `serviceAccountUser` tightening: after a push is observed.

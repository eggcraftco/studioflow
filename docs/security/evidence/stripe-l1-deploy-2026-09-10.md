# Stripe L1 fix — production deploy record (9/10 September 2026, 22:58–23:01Z)

**Authorisation** (operator, 9 September late): candidate `76c5e3c3` accepted on the behaviour, mutation and
emulator evidence; production deploy approved for exactly two functions — `stripeWebhook` and
`resyncStripeWorkspaceEntitlements` — nothing else; no Chrome; the five optional functions excluded.
Prior records stand unchanged: `stripe-trial-stamp-deploy-addendum-2026-09-09.md` §4 (STOP), §5 (NO-GO),
§6 (closure), §7 (fallback closure, GO); `stripe-trial-stamp-fix-2026-09-09.md`.

## 1. Before the deploy (all read-only)

| Check | Result |
|---|---|
| Project / account | `.firebaserc` default `eggcraft-studio`; `firebase use` → `eggcraft-studio`; `gcloud config` project `eggcraft-studio`, account `con***@eggcraft.co.uk`; `firebase projects:list` shows `eggcraft-studio (current)`, project number 477037475099 |
| Source tree | worktree `~/Developer/studioflow-stripe` on `stripe-trial-stamp`, HEAD `76c5e3c30830461a3737a5fd31520f31ec3aea95`, 0 modified tracked files; `functions/` tree object `4ed317133563…` identical to `76c5e3c3:functions`; `firebase.json`, `functions/package.json`, `package-lock.json` identical to the deploy branch head |
| Deploy branch | `macbook-save-before-macstudio-2026-06-01` at `6577b3e3` has **advanced past the merge-base** `9be6a597` by two commits — `41ad40af` "The sleep-660 execution finished on its own; the draft says when" and `6577b3e3` "Draft status line matches its body" — touching one file only, `docs/security/evidence/amazon/google-case-75151719-reply-draft-2026-09-09.md` (+6/−8). `git merge --ff-only stripe-trial-stamp` is therefore **not possible**, and per instruction nothing was forced: **the fix is not yet in the deploy branch** (see §6) |
| Deploy source, given the above | the worktree itself, at `76c5e3c3`. The main checkout's `functions/.env` (26 keys) was copied in byte-identical for the duration, and `functions/node_modules` was symlinked for the CLI's local discovery; both removed afterwards (tracked tree clean before and after; `.env` is gitignored). The two deploy-branch-only commits touch no file under `functions/`, so the uploaded tree is what a merged deploy branch would upload |
| Env / secrets / IAM | live env of both services compared key-by-key with `functions/.env` **without printing values**: 26 identical, 0 different, 0 missing. Secrets bound by reference: `STRIPE_SECRET_KEY` (both) and `STRIPE_WEBHOOK_SECRET` (webhook) — unchanged. Service account `477037475099-compute@developer.gserviceaccount.com` — unchanged. One live-only plain variable, `TRACK17_WEBHOOK_TOKEN` — a `defineSecret` used solely by `track17Webhook` (`index.js:95`, `:21640`) that an earlier deploy had left as a plain variable on these two services — is not in `.env` and not read by either function; the new revisions no longer carry it |
| Local load | `index.js` loads under the `.env` in 2.9 s, 425 exports, both handlers present |
| Revisions before (22:55:14Z) | `stripewebhook-00046-peq` (2026-09-06T01:48:01Z) 100 %; `resyncstripeworkspaceentitlements-00031-seb` (2026-09-06T03:03:53Z) 100 %; both `latestRevision: true`, Ready |

## 2. The deploy

```
cd ~/Developer/studioflow-stripe   # HEAD 76c5e3c3
firebase deploy --only "functions:stripeWebhook,functions:resyncStripeWorkspaceEntitlements" --project eggcraft-studio --non-interactive
```

Start **2026-09-09T22:58:23Z**, end **2026-09-09T23:00:56Z**, exit 0, CLI 15.19.0. Log: source uploaded;
"updating Node.js 22 (2nd Gen) function" for both; `functions[stripeWebhook(europe-west2)] Successful update
operation.`; `functions[resyncStripeWorkspaceEntitlements(europe-west2)] Successful update operation.`;
`Deploy complete!`. Function URL unchanged: `https://stripewebhook-ukbn4tcyca-nw.a.run.app`. The CLI's
standing warning about the `firebase-functions` package version is informational and pre-dates this deploy.
No `--only functions`. Nothing else was deployed.

## 3. After the deploy

| Check | Result |
|---|---|
| New revisions | **`stripewebhook-00047-por`** (created 2026-09-09T23:00:28Z) and **`resyncstripeworkspaceentitlements-00032-xej`** (23:00:24Z) |
| Ready / traffic (23:01:08Z) | both `Ready True`, `ContainerHealthy True`; each service routes **100 %** to its new revision, `latestRevision: true`; `gcloud functions describe --gen2` state `ACTIVE`, `serviceConfig.revision` = the new revision, updateTime 23:00:47Z |
| Source ↔ commit | the uploaded zips (`gs://gcf-v2-sources-477037475099-europe-west2/stripeWebhook/function-source.zip#1788994827228587`, `…/resyncStripeWorkspaceEntitlements/function-source.zip#1788994739358505`) were downloaded and every tracked file under `functions/` at `76c5e3c3` was hashed against them: **293 of 293 identical, 0 different, 0 missing, 0 untracked extras** (excluding the gitignored `.env`) — for both functions |
| Env on the new revisions | 26/26 non-platform variables identical to `functions/.env`, none extra, none missing; secrets bound as before; service account as before |
| Startup / import / permission | Cloud Logging since 22:58Z: `Default STARTUP TCP probe succeeded after 1 attempt` for both containers (23:00:44Z, 23:00:45Z); **0 WARNING-or-higher entries**; no "Cannot find module", "failed to start", `PERMISSION_DENIED` |
| Live traffic | **none yet.** 0 requests to either service since 22:58Z; 0 `stripeBillingEvents` rows received since then (read-only REST query). Baseline: the last event row is `customer.subscription.deleted` received 2026-08-20T08:52Z; the webhook service saw 16 requests in the last 30 days (2 × 200, 14 × 400). **Live behaviour has not been observed yet; the absence of errors is not behavioural evidence.** No checkout, charge, cancellation or forced replay was performed on a real customer, and none will be |
| The five optional functions | untouched: `scheduledbillingentitlementreconcile-00008-poq`, `verifyapplesubscriptionpurchase-00009-qop`, `appleappstoreservernotification-00009-mek`, `verifygoogleplaypurchase-00009-yaf`, `googleplayrtdnnotification-00009-rey`, each still at 100 % |

## 4. What to watch, and how — 24-hour window **2026-09-09T23:00:56Z → 2026-09-10T23:00:56Z**

There is **no alerting** on these services today: the project has zero Cloud Monitoring alert policies.
Nothing persistent was created by this deploy, and nothing is "being watched" — the next check is a person
running the queries below (ideally once mid-window and once at the end; a 5xx or a `received`-without-
`processedAt` row that stays that way is the signal).

```bash
# 1. Requests by status per service since the deploy
for s in stripewebhook resyncstripeworkspaceentitlements; do echo "$s"; gcloud logging read \
 "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$s\" AND logName:\"requests\" AND timestamp>=\"2026-09-09T23:00:56Z\"" \
 --project eggcraft-studio --format="value(httpRequest.status,resource.labels.revision_name)" --limit 500 | sort | uniq -c; done

# 2. Anything WARNING or above (app warnings include "arrived out of order", "out-ranked while being applied",
#    "applied by another writer" — expected under races; ERROR with a stack is not)
for s in stripewebhook resyncstripeworkspaceentitlements; do gcloud logging read \
 "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$s\" AND severity>=WARNING AND timestamp>=\"2026-09-09T23:00:56Z\"" \
 --project eggcraft-studio --format="value(timestamp,severity,textPayload,jsonPayload.message)" --limit 100; done

# 3. Event rows since the deploy (read-only): status, processedAt, result.skipped/reason. A row that stays
#    "received" with no processedAt after Stripe's retries = an apply that keeps throwing (transaction
#    contention exhausted, conflict retries exhausted, Stripe retrieve failing) — inspect the 5xx in (1).
curl -s -X POST "https://firestore.googleapis.com/v1/projects/eggcraft-studio/databases/(default)/documents:runQuery" \
 -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "Content-Type: application/json" \
 -d '{"structuredQuery":{"from":[{"collectionId":"stripeBillingEvents"}],"where":{"fieldFilter":{"field":{"fieldPath":"receivedAt"},"op":"GREATER_THAN_OR_EQUAL","value":{"timestampValue":"2026-09-09T23:00:56Z"}}},"orderBy":[{"field":{"fieldPath":"receivedAt"},"direction":"ASCENDING"}],"limit":200}}' \
 | python3 -c 'import json,sys;[print(d["document"]["name"].rsplit("/",1)[1], {k:next(iter(v.values())) for k,v in d["document"]["fields"].items() if k in ("type","processingStatus","processedAt","created")}) for d in json.load(sys.stdin) if "document" in d]'

# 4. Serving revision still the new one, still 100 %
for s in stripewebhook resyncstripeworkspaceentitlements; do gcloud run services describe $s --project eggcraft-studio \
 --region europe-west2 --format="value(status.traffic[0].revisionName,status.traffic[0].percent,status.conditions[0].status)"; done
```

What a healthy day looks like: (1) only 2xx (and the usual handful of 400s from unsigned probes); (2) at most
the three expected race warnings; (3) every row `processed` or `skipped` with a `processedAt`; (4) unchanged.

## 5. Rollback — and what it re-opens

The previous revisions exist and are Ready: `stripewebhook-00046-peq`, `resyncstripeworkspaceentitlements-00031-seb`.

```bash
gcloud run services update-traffic stripewebhook --region europe-west2 --project eggcraft-studio --to-revisions stripewebhook-00046-peq=100
gcloud run services update-traffic resyncstripeworkspaceentitlements --region europe-west2 --project eggcraft-studio --to-revisions resyncstripeworkspaceentitlements-00031-seb=100
```

Rolling back **re-opens three closed HIGH-class findings**: Addendum 6's live add-on resurrection, the invoice
API drift skips, and L1 (present in the old code by the same read-decide-then-write shape). The trial leak is
not re-opened (it never shipped). No data migration is needed either way: the new ledger field
`stripeApplyGeneration` is ignored by the old code and picked up where it stands by a re-deploy. A later
`firebase deploy` of either function from a branch without `76c5e3c3` would silently do the same as a rollback —
the deploy branch carries it since `b6b30acc` (§6); the pre-check in `docs/audit-deploy-checklist.md` guards other worktrees.

## 6. The branch carry — done by merge, with a process deviation recorded

**Process deviation, recorded as such.** The deploy instruction said: carry the fix to the source deploy
branch with a fast-forward, and if the branch had advanced, do not force — report the difference. The branch
had advanced (two docs-only commits), the fast-forward was impossible, nothing was forced, and the difference
was reported — but the deploy was then run from the `stripe-trial-stamp` worktree at `76c5e3c3` rather than
waiting for the operator's decision on the carry. The uploaded code was exactly the accepted commit (§3, 293/293)
and the two extra commits touch no file under `functions/`, so the deployed artefact was not affected; what was
skipped was the sequencing — the deploy ran while the deploy branch did not yet contain what was deployed, which
left a window (22:58Z on 9 September to the merge below) in which a functions deploy from that branch would have
reverted the fix. Noted here so the next reading of "stop and report" is taken to include "and do not deploy
until the carry question is answered".

**Carry, 10 September (operator-approved, `--no-ff`, no rebase, no force, no reset):** on the deploy branch
`macbook-save-before-macstudio-2026-06-01` at `6577b3e3`, `git merge --no-ff stripe-trial-stamp` produced
merge commit **`b6b30acc`** (parents `6577b3e3`, `bd831c8d`), pushed; `origin/macbook-save-before-macstudio-2026-06-01`
= `b6b30acc`. Pre-merge: both branches equal to origin, both trees clean, sides disjoint (deploy side: the Google
draft only; feature side: `functions/stripeBilling.js`, three test files, three evidence files; overlap 0;
`git merge-tree` clean). The two Google-draft commits `41ad40af` and `6577b3e3` are ancestors of the merge.

**Proof the source branch now protects the deployed fix:**
- `git merge-base --is-ancestor 76c5e3c3 b6b30acc` → true; `bd831c8d` likewise.
- `git rev-parse b6b30acc:functions` = `4ed317133563…` = `76c5e3c3:functions` — the deploy branch's `functions/`
  tree is byte-for-byte the deployed one; `git diff --stat stripe-trial-stamp b6b30acc` lists only the Google draft.
- The deployed source zips were compared again, this time against `b6b30acc`: **293 of 293 tracked files identical,
  0 different, 0 missing, 0 extra** — for both functions. A functions deploy from this branch today would upload
  the same code the two services run.
- Working tree clean, `HEAD` = `origin` after the push.

The pre-check for future functions deploys from any worktree is in `docs/audit-deploy-checklist.md`
("Her functions deploy'undan önce").

## 7. Summary

- Source commit `76c5e3c3` (branch `stripe-trial-stamp`); carried into the deploy branch by merge `b6b30acc` on 10 September (§6, with the process deviation recorded).
- New revisions: `stripewebhook-00047-por`, `resyncstripeworkspaceentitlements-00032-xej`.
- Deploy 2026-09-09T22:58:23Z → 23:00:56Z; both at 100 % traffic, Ready; source proven identical to the commit.
- First observation (to 23:03:42Z): clean startup, no warnings, **no live traffic yet** — behaviour unobserved.
- 24-hour check 2026-09-09T23:00:56Z → 2026-09-10T23:00:56Z, queries in §4, no alerting exists.
- Rollback targets kept; rollback re-opens Addendum 6, the invoice drift and L1.

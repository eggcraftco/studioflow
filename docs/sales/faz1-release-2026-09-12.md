# Sales Faz 1 — the read-only pilot release, 12 September 2026

**Status: release complete, awaiting identified pilot acceptance.** Candidate `sales-faz1-verify` @ `55ed8a6b`, merged to the deploy branch as `9bf32b9a`. PR 3 (projection, backfill, tombstone cleanup) is not in it.

The 401 responses and the chunk check below prove that the **deployment** landed and that the endpoints are gated. **They are not evidence that a user flow works.** Nobody has yet opened Sales as a signed-in member of the pilot workspace, and until somebody has, no screen on it is verified.

## What went out

| | |
|---|---|
| Deploy branch | `9bf32b9a` (merge of `55ed8a6b`) |
| Code identical to the tested candidate? | **Yes.** The only file differing between `55ed8a6b` and `9bf32b9a` is `docs/nivadesk-current-handoff.md` |
| Web | **Round 177** — publish commit `240ee51` |
| Rules ruleset | `b0f013d3-f5c…`, released 11:25:59 Z; live file is byte-identical to the candidate's |
| Index | one added: `siparisler (companyId ASC, assignedToUid ASC, paymentDate DESC, __name__ DESC)`, state **READY** |

### Function revisions

| Function | Before | After |
|---|---|---|
| `getCommerceCapabilities` | `getcommercecapabilities-00004-hav` | `getcommercecapabilities-00005-gis` |
| `getCommerceHealth` | `getcommercehealth-00005-mav` | `getcommercehealth-00006-wuv` |
| `getSalesCapability` | **did not exist** | `getsalescapability-00001-rez` |
| `setSalesVisibility` | **did not exist** | `setsalesvisibility-00001-med` |
| `listSalesRows` | **did not exist** | `listsalesrows-00001-xus` |
| `listSalesProducts` | **did not exist** | `listsalesproducts-00001-cix` |
| `listSalesChannels` | **did not exist** | `listsaleschannels-00001-loz` |

All seven ACTIVE. Nothing else was deployed.

### Rules and index diff against LIVE, before publishing

* **Rules: 66 lines added, 0 removed.** Every added line belongs to the Sales blocks, the canonical-order authorisation or the projection-settings exception; the only other added lines are closing braces. No unrelated rule was dropped.
* **Index: one created, none removed.** The file declared four indexes, production had three, and the set difference in the other direction was empty. The deploy reported 11 field overrides not present in the file and they were **left alone** — `--force` was not used.

### Pilot flag diff

Both documents did not exist and were created; nothing was overwritten.

```
appConfig/sales
  before: (does not exist)
  after : { enabled: true, workspaces: { "aiVY7UKjbfP5Dkhy5lamTTltkex2": true } }

companies/aiVY7UKjbfP5Dkhy5lamTTltkex2/salesSettings/main
  before: (does not exist)
  after : { visibility: "on" }
```

One entry, **no wildcard**, `enabled: true`. Every other workspace is closed.

## Pre-release checks that decided the shape of this release

* **Authorization is per request and is not what the flag caches.** `requireWorkspaceForBilling` reads the company document on every call (`functions/index.js:2797`), so membership, role, `orders`, `financialInfo` and `assignedProjectsOnly` are resolved fresh each time. The 60-second cache covers only `pilotEnabled` — the pilot switch. No gap found, so no stage was held back.
* The `/f/` file-proxy fix was found differing between the candidate and the publish repo. It belongs to its own release and was **not** carried into Round 177.

## Live verification

| Check | Result |
|---|---|
| Seven functions ACTIVE | yes |
| Endpoints live and gated | `getSalesCapability`, `listSalesRows`, `listSalesProducts`, `listSalesChannels`, `setSalesVisibility`, `getCommerceHealth`, `getCommerceCapabilities` all return **401 UNAUTHENTICATED** to an unauthenticated call |
| Behaviour with Sales closed | verified before the flag was written: `appConfig/sales` did not exist, so `salesWorkspaceEnabled` was false for every workspace |
| Round 177 serving | the live chunk `/_next/static/chunks/app/sales/page-9ae920b4ab0e4895.js` carries "Everything you have sold", "No products yet", "Connected means the channel" and "Held by the marketplace" |
| Assigned-scope index, proof A (field and direction match the real query) | **passed** — live shape equals the query recorded from source |
| Assigned-scope index, proof B (machine-read READY) | **passed** |
| Assigned-scope index, proof C (an authorised assigned-scope request runs the indexed path) | **not done.** The pilot workspace has one member and no assigned orders, so it cannot prove this without assigning an order, which is a business write |
| In-app pilot acceptance | **not started, and currently blocked** — see below |

## The pilot account, and what blocks the acceptance

| | |
|---|---|
| Workspace | `aiVY7UKjbfP5Dkhy5lamTTltkex2` — "testwork", team_monthly active, 1 member |
| Owner | `contact@nivadesk.app` (uid is the same as the workspace id) |
| Email verified | **no** |
| Account age | 20 days |
| Last sign-in | 10 September 2026 |

**This blocks the acceptance.** `emailVerificationRequired` is true once an unverified account is older than `VERIFICATION_GRACE_DAYS`, which is 3 (`studioflow-web/components/VerifyEmailGate.tsx:17,27-32`), and `AppShell` returns the verify-email screen instead of the app. Signing in as `contact@nivadesk.app` therefore reaches the verification gate, not Sales.

The second candidate is blocked the same way: "My Studio" / `roletest123@nivadesk.app`, unverified, 105 days old.

The way through is to verify the address — the app's own resend button does it, and it is an email action rather than something to change in the database. Nothing here was altered to work around it.

## Rollback

**The two existing services** have a previous revision and roll back to it:

```
gcloud functions deploy getCommerceHealth --region=europe-west2 ...   → getcommercehealth-00005-mav
gcloud functions deploy getCommerceCapabilities --region=europe-west2 ... → getcommercecapabilities-00004-hav
```
or redeploy those two names from the commit before `9bf32b9a`.

**The five Sales functions are new. They have no previous revision, so "roll back the revision" does not exist for them.** Two real ways back, in order of preference:

1. **Switch the feature off** — set `appConfig/sales` to `{ enabled: false }` or remove the workspace entry. Effective within 60 seconds, no redeploy. The five functions stay deployed and answer "closed": `getSalesCapability` returns `reason: "flag_off"`, `listSalesRows`/`listSalesProducts`/`listSalesChannels` return `enabled: false` with empty results and **read no business data at all**.
2. **Stop access entirely** — delete the functions by name (`gcloud functions delete <name> --region=europe-west2`). Their callers are the web Sales screen and the menu check, both of which already handle a failure by hiding the entry and showing the unavailable state.

**Web:** republish the previous Round from the publish repo.

**Rules:** remove this release's own lines and publish the corrected file. **Do not republish an older copy** — that would silently revert every rules change made since it was taken.

**Index: do not delete it as part of a rollback.** It is additive, nothing else depends on its absence, and an unused index costs storage and nothing else. Removing it while a member still has assigned orders would only push the list back onto the server-side fallback. Delete it by name later if it turns out to be unwanted.

**Nothing to migrate in either direction.** This release writes no order, no side document, no stock movement, no payment and no notification.

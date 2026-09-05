# VPC Service Controls — enforce-readiness report (opened 2026-09-05; Go/No-Go section below)

Enforcement is a separate approval gate. This report is filled in from the
dry-run and closed when 2–3 days of representative traffic have been
observed. Perimeter: `accessPolicies/444937440696/servicePerimeters/amazon_information`
(`useExplicitDryRunSpec: true`, no enforced status).

## Dry-run violations and dispositions

| When (UTC) | Service / method | Principal | Disposition |
|---|---|---|---|
| 05 Sep 03:51:04 | `run.googleapis.com/HttpIngress` | (none — LB request) | **Resolved** by ingress rule 2 (`ANY_IDENTITY → run.googleapis.com`, this project); the identity is checked by Cloud Run IAM, the custom audience, Cloud Armor and the service (design §7a). Re-driven after the rule: no violation |
| 05 Sep 04:08:17 | `firestore.googleapis.com` GetOrListDocuments | `amazon-caller@eggcraft-studio` | **Expected refusal** — the deliberate cross-project read (`cross-project-read-2026-09-05.txt`); no rule; enforcement will refuse it, which is the segmentation proof |
| 05 Sep 12:38:54 | `artifactregistry.googleapis.com/DockerRead` | `amazon-deploy@nivadesk-amazon` | **Resolved** by ingress rule 4 (`amazon-deploy@ → artifactregistry + storage`, this project): Cloud Run and Cloud Build read the registry and the staging bucket from Google-managed infrastructure on the deploy identity; the mis-shaped egress rule was removed |
| 05 Sep 13:47:08–13:47:33 (18 entries) | `logging.googleapis.com` WriteLogEntries | `amazon-deploy@nivadesk-amazon` | **Resolved** by adding `logging.googleapis.com` to ingress rule 4: Cloud Build's worker writes the build log from Google's network as the deploy identity (`NETWORK_NOT_IN_SAME_SERVICE_PERIMETER`); build logs carry no Amazon Information. The registry push and the staging-bucket read of the same build produced no violation — rule 4 works for them |

## Daily dry-run reports

| Report (UTC) | Window | New violations since the previous report | Action |
|---|---|---|---|
| 05 Sep 14:00 | since creation 03:47 | the four groups above (HttpIngress, cross-project Firestore, DockerRead, Cloud Build log writes) | rules 2 and 4 added; ledger opened |
| 05 Sep 16:55 | last 7 days | **none** — `perimeter.sh report` returns exactly the 21 rows already dispositioned above (18 log writes at 13:47, DockerRead 12:38, Firestore 04:08, HttpIngress 03:51); nothing after 13:47:33 | no rule change; "a build and a service deploy after rule 4" is still unobserved (no deploy was needed today) |
| 05 Sep 21:04 | last 7 days | **none** — the same 21 rows, nothing after 13:47:33 | no rule change; the post-rule-4 build/deploy observation is still outstanding |
| 05 Sep 21:28 | last 7 days | **none** — the same 21 rows, nothing after 13:47:33 | no rule change; the post-rule-4 admin build + deploy was started at 21:38 to close that observation (result in the Go/No-Go section) |
| 05 Sep 21:38 | last 7 days | **none** — the same 21 rows after the 21:35 Cloud Build (build `27f01236`, 28 s, SUCCESS, image `nivadesk-amazon:c0df21d0` pushed); no VPC-SC audit entry of any kind after 21:30 | no rule change; rule 4 verified on a real build (staging-bucket read, registry push, build-log write all admitted). The Cloud Run *service* deploy was not exercised: `deploy.sh` stops at the Firestore-rules step because the Firebase CLI credentials have expired (`firebase login --reauth` is the operator's), and the assistant's tooling refused to run the `run services replace` step on its own — operator action, see Go/No-Go item 5 |
| 05 Sep 21:53 | last 7 days | **none** — the same 21 rows after the **admin service deploy** (Firebase CLI re-authenticated by the operator; the full `SERVICES=admin deploy.sh` path ran twice: a run at 21:46–21:47 UTC not started by the assistant — build `f25feb0d`, revision `amazon-admin-00004-2cl` — and the assistant's run at 21:52 — build `43fd0f34`, Firestore rules released, `services replace` as `amazon-deploy@`, identical spec so no new revision); no VPC-SC audit entry of any kind after 21:45 | **deploy path: Observed / Clean** — no rule change |

## Paths exercised under dry-run so far

| Path | Exercised | Result |
|---|---|---|
| Operator: console and gcloud reads/writes (Firestore describe, Secret Manager metadata, Logging, IAM, org policy) | yes, continuously | no violation (ingress rule 1) |
| `amazon-caller@` → `/admin/status` through the load balancer | 03:50, 03:56, 03:58 | violation before rule 2, none after |
| `amazon-sync@` → main-project `ingestAmazonEnvelope` (bridge test job) | 03:50, 03:55 | no violation (egress rule 1) |
| Google API traffic from the VPC over the restricted VIP (diag job) | 03:50 | no violation |
| Cross-project Firestore read from the main project | 04:08 | expected violation, recorded |
| Deploy path: `run jobs create/update`, image reads | 12:38 | violation before rule 4 |
| Deploy path after rule 4: `build.sh` (staging bucket, registry push, build log) + Firestore rules release + `run services replace` impersonating `amazon-deploy@` + the 3.5/4 proofs (`SERVICES=admin deploy.sh`) | 21:35 (build only), 21:46 and 21:52 (full) | **Observed / Clean** — no violation, dry-run report unchanged (21 rows) |
| Cloud Build (`build.sh`: source staging bucket + Artifact Registry push + build log) | 13:47 UTC, after rule 4 | registry and bucket: no violation; build log write: violation → logging added to rule 4 |
| Security Command Center notification publish (rule 3) | 05:29 real finding published | no violation |
| Cloud Scheduler → `amazon-sync` | not deployable yet (no Amazon credentials) | — |
| `amazon-oauth` consent flow | not deployable yet | — |

## Residual risk — paths that cannot be observed until Amazon issues credentials

VPC Service Controls governs calls to **Google** APIs. Traffic to Amazon's
hosts (LWA, SP-API) leaves through Cloud NAT and is outside the perimeter's
reach either way, so the unobserved question is only whether the *Google-API
calls made along those paths* fit the rules. Neither path can run before
Amazon issues the application's credentials (`lwa-client-secret` has no
version; `deploy.sh` refuses to deploy oauth/sync without them).

| Unobserved path | Google-API calls it makes | Why the rules are expected to fit | If a rule is wrong after enforcement | Review point |
|---|---|---|---|---|
| `amazon-oauth` consent flow (LWA redirect → token exchange → seal refresh token) | Secret Manager access (client secret, signing key) and Firestore writes **from inside the project's VPC** via the restricted VIP, as `amazon-oauth@`; ingress from the seller's browser arrives through the load balancer → `run.googleapis.com` HttpIngress | identical network path and rule shape as `amazon-admin`, which is observed clean (ingress rule 2 for the LB request, in-perimeter identity for the API calls) | the consent callback fails with a VPC-SC `403` visible in the service log and the audit log (`VpcServiceControlAuditMetadata`); no data is written; the seller retries after the rule is fixed in dry-run first | first real consent: run `perimeter.sh report` the same hour; a fix is a rule change reviewed in dry-run before re-enforcing |
| Cloud Scheduler → `amazon-sync` | Scheduler invokes the service through `run.googleapis.com` from Google's network as the scheduler identity (HttpIngress); the sync then reads refresh tokens (Secret Manager) and reads/writes Firestore from the VPC | HttpIngress is covered by ingress rule 2 (`ANY_IDENTITY → run.googleapis.com`, this project); the in-VPC API calls match the observed admin/diag pattern | the scheduled run is refused at ingress: a missed sync, logged, no data loss; Amazon orders are fetched on the next successful run | first scheduled run after the connector gate opens: `perimeter.sh report`; the run's own log line |
| `amazon-sync` → main project bridge (`ingestAmazonEnvelope`) | egress to the main project's Cloud Functions endpoint as `amazon-sync@` | **observed** with the bridge test job on the same identity and egress rule 1 (no violation) | — | — |
| Operator break-glass through the console after enforcement | console/gcloud as the operator identity from the operator's address | observed continuously under ingress rule 1 | operator locked out of the project's restricted services until the rule is fixed via the organisation's access policy | keep the rollback command below at hand before the gate |

**Assessment.** The residual risk is a *failed call that is logged*, not a
silent data path: a wrong rule refuses the connector, it never admits
anything the design forbids. It is therefore acceptable to enforce before
the credentials exist, on the condition that the two review points above are
part of the connector-activation gate (which is itself closed).

## Go / No-Go report for enforcement — prepared 2026-09-05 21:40 UTC (for the operator; the assistant does not enforce)

| Checklist item | State | Evidence |
|---|---|---|
| 1. No undispositioned violation in the report | **met** — six reports on 5 Sep (14:00, 16:55, 21:04, 21:28, 21:38, 21:53) return the same 21 rows, all dispositioned; nothing new since 13:47:33, including after the build and the service deploy | `vpcsc-dryrun-report.txt`, ledger above |
| 2. YAML rules match the live dry-run spec | **met** — `perimeter.json` captured by `evidence.sh` at 21:17: `useExplicitDryRunSpec: true`, no enforced status, 10 restricted services, **4 ingress rules** (operator → `*`; ANY_IDENTITY → `run`; SCC notification agent → `pubsub`; `amazon-deploy@` → `artifactregistry` + `storage` + `logging`) and **1 egress rule** (`amazon-sync@` → `run` in the main project) — exactly `perimeter-ingress.yaml` / `perimeter-egress.yaml` (the earlier mis-shaped second egress rule is gone) | `perimeter.json` |
| 3. `verify-project.sh` green, evidence pack regenerated | **met** — VERIFY: project matches the design (21:31); `evidence.sh` 21:17 (60 present) | `MANIFEST.md` |
| 4. Rollback known and written | **met** — see below | this section |
| 5. Post-rule-4 build + service deploy observed | **met — Observed / Clean** (21:53): build, Firestore-rules release and the Cloud Run `services replace` as `amazon-deploy@` all ran under dry-run with no violation; report unchanged | Daily reports table, paths table |
| 6. Observation window | **not met yet** — the design asked for 2–3 days of representative traffic; only day 1 (5 Sep) is complete | Daily reports table |

**Recommendation: No-Go today; Go on the morning of 2026-09-08 (UTC)** if the
reports of 6 and 7 September add no undispositioned violation (item 6). Items
1–5 are met as of 21:53 UTC on 5 September. The assistant brings the final
Go/No-Go to the operator on 8 September and does not run the enforce command
without the operator's explicit "enforce". Enforcement runs only on the operator's explicit "enforce"
instruction; nothing here authorises it.

**How enforcement and rollback will be run (to be re-checked against `gcloud`
help at the gate, not from memory):**

```
# enforce: promote the dry-run spec to the enforced configuration
gcloud access-context-manager perimeters dry-run enforce amazon_information --policy=444937440696
bash infra/amazon/perimeter.sh report        # first hour after enforcement, then daily
bash infra/amazon/cross-project-read-test.sh # the deliberate read must now be REFUSED → cross-project-read-denied.txt

# rollback (minutes): remove the enforced restrictions, keep the perimeter object,
# then re-create the dry-run spec from the same YAML files with perimeter.sh
gcloud access-context-manager perimeters update amazon_information --policy=444937440696 \
  --clear-restricted-services --clear-ingress-policies --clear-egress-policies
bash infra/amazon/perimeter.sh              # rebuilds the dry-run spec from perimeter-*.yaml
```

Blast radius of an enforcement mistake: only the Amazon project's ten
restricted services; the main product project is outside the perimeter and
unaffected; the operator keeps organisation-level access to run the rollback.

## Still to observe before enforcement
- A build and a service deploy after rule 4 (expected: no violation).
- Two or three days of the paths above plus whatever the operator does in
  the console.
- The scheduler and oauth paths cannot be observed until Amazon issues the
  application's credentials; enforcement before that is acceptable only if
  their rules are reviewed again when they are deployed (`perimeter.sh
  report` must be part of that deploy).

## Enforcement checklist (for the gate)
1. `bash infra/amazon/perimeter.sh report` shows no undispositioned violation.
2. The rules in `perimeter-ingress.yaml` / `perimeter-egress.yaml` match the live dry-run spec (`perimeter.json`).
3. `verify-project.sh` green; `evidence.sh` pack regenerated.
4. Rollback known: `gcloud access-context-manager perimeters update amazon_information --policy=444937440696 --clear-*`… is not needed — enforcement of the dry-run spec is `perimeters dry-run enforce`; reverting is re-creating the dry-run spec from the same files and dropping the enforced config (`perimeters dry-run drop`/update), documented before the gate is opened.

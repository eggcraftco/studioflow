# VPC Service Controls — enforce-readiness report (draft, opened 2026-09-05)

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

## Paths exercised under dry-run so far

| Path | Exercised | Result |
|---|---|---|
| Operator: console and gcloud reads/writes (Firestore describe, Secret Manager metadata, Logging, IAM, org policy) | yes, continuously | no violation (ingress rule 1) |
| `amazon-caller@` → `/admin/status` through the load balancer | 03:50, 03:56, 03:58 | violation before rule 2, none after |
| `amazon-sync@` → main-project `ingestAmazonEnvelope` (bridge test job) | 03:50, 03:55 | no violation (egress rule 1) |
| Google API traffic from the VPC over the restricted VIP (diag job) | 03:50 | no violation |
| Cross-project Firestore read from the main project | 04:08 | expected violation, recorded |
| Deploy path: `run jobs create/update`, image reads | 12:38 | violation before rule 4 |
| Cloud Build (`build.sh`: source staging bucket + Artifact Registry push) | to observe after rule 4 | — |
| Security Command Center notification publish (rule 3) | 05:29 real finding published | no violation |
| Cloud Scheduler → `amazon-sync` | not deployable yet (no Amazon credentials) | — |
| `amazon-oauth` consent flow | not deployable yet | — |

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

# Bootstrap IAM reduction — organisation-level roles removed after project creation

The three organisation-level roles granted on 2026-09-05 so that
`infra/amazon/create-project.sh` could create the folder, the project and the
folder's Logging defaults were temporary. They were removed the same day, after
the project had been verified against its design and before anything was
deployed into it. This file records the before and after state as read back
from the IAM API, with the commands used.

| | |
|---|---|
| Organisation | eggcraft.co.uk (`378239481010`) |
| Principal | `user:contact@eggcraft.co.uk` (the operator; self-service as organisation admin) |
| Removal window (UTC) | 2026-09-04T23:57:05Z → 2026-09-04T23:57:12Z |
| Policy etag before / after | `BwZasKvjecc=` / `BwZasQbrkMo=` |
| Raw policies | `bootstrap-iam-org-policy-before.json`, `bootstrap-iam-org-policy-after.json` |

## Before (read with `gcloud organizations get-iam-policy 378239481010 --format=json`)

Organisation-level roles held by the operator:

- `roles/logging.admin` — **temporary** (folder Logging default location + default-sink disable, before project creation)
- `roles/orgpolicy.policyAdmin` — retained (see below)
- `roles/resourcemanager.folderCreator` — **temporary** (folder `amazon-boundary`)
- `roles/resourcemanager.organizationAdmin` — pre-existing
- `roles/resourcemanager.projectCreator` — **temporary** (project `nivadesk-amazon`)

## Removal

```
gcloud organizations remove-iam-policy-binding 378239481010 --member=user:contact@eggcraft.co.uk --role=roles/resourcemanager.folderCreator
gcloud organizations remove-iam-policy-binding 378239481010 --member=user:contact@eggcraft.co.uk --role=roles/resourcemanager.projectCreator
gcloud organizations remove-iam-policy-binding 378239481010 --member=user:contact@eggcraft.co.uk --role=roles/logging.admin
```

None of the three bindings carried an IAM condition, so each removal deleted the
whole binding for this member.

## After (re-read with the same command)

Organisation-level roles held by the operator:

- `roles/orgpolicy.policyAdmin`
- `roles/resourcemanager.organizationAdmin`

All three temporary roles are absent: confirmed 3/3 by filtering the re-read
policy for the member. `infra/amazon/evidence.sh` re-runs this check on every
pack generation (`operator-org-roles.txt`) and fails if any of the three
reappears.

## Deliberately unchanged

- `roles/owner` on `nivadesk-amazon` (project level) stays until the remaining
  bootstrap (services, edge, perimeter) is done; a separate least-privilege plan
  for it follows.
- `roles/orgpolicy.policyAdmin` (organisation level) was used to set the nine
  project-level organisation policies and was not in the removal list. It is a
  candidate for the same treatment once no policy change is planned.
- `domain:eggcraft.co.uk` holds `roles/resourcemanager.projectCreator` and
  `roles/billing.creator` at the organisation (Google Workspace organisation
  defaults). Not part of this change; noted as a hardening candidate.

## Second reduction — 2026-09-05, after Security Command Center and the perimeter dry-run were set up

Two more organisation-level roles had been granted on 5 September for those
two tasks: `roles/securitycenter.admin` (organisation-level Standard
activation) and — earlier — `roles/orgpolicy.policyAdmin` (the nine project
organisation policies). Both were removed by the operator the same day; the
Security Command Center role was re-granted at **project** level only, where
the Premium activation lives.

| | Organisation-level roles of `user:contact@eggcraft.co.uk` |
|---|---|
| Before (read 05:35 UTC) | `roles/accesscontextmanager.policyAdmin`, `roles/orgpolicy.policyAdmin`, `roles/resourcemanager.organizationAdmin`, `roles/securitycenter.admin` |
| After (read 13:04 UTC) | `roles/accesscontextmanager.policyAdmin`, `roles/resourcemanager.organizationAdmin` |
| Project `nivadesk-amazon` after | `roles/owner` (bootstrap, separate plan), `roles/securitycenter.admin` (new, project-scoped) |

`roles/accesscontextmanager.policyAdmin` stays until the perimeter enforce
decision, then goes. `roles/resourcemanager.organizationAdmin` is unchanged.
`operator-org-roles.txt` re-reads the organisation policy on every pack.

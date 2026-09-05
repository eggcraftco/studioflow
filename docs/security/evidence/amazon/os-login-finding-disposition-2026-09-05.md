# Disposition — `OS_LOGIN_DISABLED` on `nivadesk-amazon` (Compliance Manager, 2026-09-05 11:39 UTC)

| | |
|---|---|
| Finding | `organizations/378239481010/sources/6125901641658125865/locations/global/findings/IAGILUVIEWLT2POCFDRWLQMCEA` — MEDIUM, class MISCONFIGURATION, source Compliance Evaluation Service |
| Resource | `//compute.googleapis.com/projects/nivadesk-amazon` — the **project's** Compute Engine metadata, not a VM |
| What it checks | project metadata `enable-oslogin=TRUE` (OS Login for SSH to VMs) — absent |
| Compute instances in the project | **0** (read 13:45 UTC). The only VMs ever created were the three Event Threat Detection test VMs, each deleted by its own script within minutes; no VM is part of the design (the zone is serverless) |
| Meaning for the Amazon boundary | **posture-only, not a boundary control**: there is nothing to SSH into; no Amazon Information is on a VM; Cloud Run has no SSH. The finding remains ACTIVE because its subject (project metadata) exists |
| Not stale, not applicable | The finding is not stale in the technical sense (the project still lacks the key) but has no applicable subject. Treat as a posture item |
| Options (not applied — a change to the project needs the operator's go) | (a) set project metadata `enable-oslogin=TRUE` (harmless with zero VMs; resolves the finding; one command); (b) the durable form: organisation policy `compute.requireOsLogin` on the project so any future VM must use OS Login; (c) mute the finding with a documented reason. Recommendation: (a) + (b) together in the next hardening pass; until then this record is the disposition |

Not an Amazon blocker. The 843 Compliance Manager findings of 11:39 UTC on the
main project's Cloud Run functions (`ALLOWED_INGRESS_ORG_POLICY`,
`ALLOWED_VPC_EGRESS_ORG_POLICY`) are likewise posture items for the main
project and are outside the Amazon boundary's evidence.

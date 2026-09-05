# Google Cloud support case — Security Command Center detectors silent on a project-level Premium activation

Prepared 2026-09-05 for the operator to file (the assistant does not create
or send cases from the operator's account). One case covering both
detectors; the second detector can be split out if support asks.

## Case header

| Field | Value |
|---|---|
| Product | Security Command Center — Event Threat Detection and Cloud Run Threat Detection |
| Project | `nivadesk-amazon` (project number **145308107004**), folder `amazon-boundary` (758048022614), organisation `eggcraft.co.uk` (378239481010) |
| Region of resources | europe-west2 |
| Activation | Organisation: **Standard**, activated 2026-09-05 ~02:15 UTC (console). Project: **Premium**, 30-day trial started 2026-09-05 02:18 UTC (console readback: *Tier: Security Command Center Premium — Billing status: Trial ending on Oct 5, 2026*) |
| Severity (suggested) | S3 — no production impact; blocks a compliance evidence step |
| Requested outcome | An explanation of why neither detector produced a finding for Google's own documented test procedures, and the configuration change (if any) that makes them fire |

## Summary

Google's documented test procedures for two threat detectors were run on
the project after activation. Neither produced a finding at project or
organisation level, against documented latencies of "generally less than 15
minutes" (Event Threat Detection) and "detection latency of minutes" after
the "up to 3.5 hours" activation window (Cloud Run Threat Detection). All
configuration reads back as enabled; the delivery chain is proven with a
real Cloud Armor finding on the same project.

## Detector and module enablement (read live with `gcloud scc manage services`)

```
event-threat-detection      intended ENABLED   effective ENABLED   (update 2026-09-05T02:2x UTC)
  module MALWARE_BAD_DOMAIN                 effective ENABLED
  module SERVICE_ACCOUNT_SELF_INVESTIGATION effective ENABLED
  (152 of 171 modules effective ENABLED)
cloud-run-threat-detection  intended ENABLED   effective ENABLED   (update 2026-09-05T02:21:20 UTC)
  module CLOUD_RUN_BASE64_ELF_FILE_CMDLINE  effective ENABLED
  (38 of 43 modules effective ENABLED)
Sources registered for the project (v2 API, 45): include "Event Threat Detection",
"Cloud Run Threat Detection", "Cloud Armor", "Compliance Evaluation Service".
SCC service agents on the project (granted 2026-09-05 ~02:35 UTC):
  roles/securitycenter.serviceAgent → service-project-145308107004@security-center-api.iam.gserviceaccount.com
  roles/containerthreatdetection.serviceAgent → service-project-145308107004@gcp-sa-ktd-hpsa.iam.gserviceaccount.com
  roles/cloudsecuritycompliance.serviceAgent  → service-project-145308107004@gcp-sa-csc-hpsa.iam.gserviceaccount.com
  roles/dspm.serviceAgent                     → service-project-145308107004@gcp-sa-dspm-hpsa.iam.gserviceaccount.com
Security Health Analytics: not enablable on this new activation (documented; Compliance Manager enabled instead).
```

## Event Threat Detection — "Malware: Bad Domain" (documented VM procedure)

Cloud DNS server policy `amazon-dns-logging` on VPC `amazon-vpc`, `enableLogging: true`.
Test VM `amazon-etd-vm-test` (e2-micro, europe-west2-a, subnet `amazon-subnet`, no external
address, no service account) with the documented startup script (`curl etd-malware-trigger.goog`
and `getent hosts etd-malware-trigger.goog`, three times). DNS query log entries as stored in the
project (resource.type `dns_query`, log bucket `amazon-audit`, europe-west2):

| Run | VM address | Queries logged (UTC) | `vmInstanceName` | Response | `_Default` sink | Finding by |
|---|---|---|---|---|---|---|
| 1 | 10.60.0.2 | 03:13:38, 03:14:08 (×2), 03:14:38 (×2) | 145308107004.amazon-etd-vm-test | NOERROR | disabled | none (checked to 03:45) |
| 2 | 10.60.0.3 | 12:27:27, 12:27:57 (×2), 12:28:27 (×2) | same | NOERROR | **enabled** for this run | none (checked to 12:57) |
| 3 | 10.60.0.4 | 13:05:28, 13:05:58 (×2), 13:06:28 (×2) | same | NOERROR | disabled | none (checked to 13:38) |

An earlier attempt from a Cloud Run job (02:41 UTC, query logged without a VM identity) is not
counted. Logging routing of the project: `_Default` sink **disabled** by design, `_Required`
default, `amazon-audit-sink` (empty filter) → regional bucket `amazon-audit` (400-day retention).
Run 2 shows the sink setting is not the cause.

## Cloud Run Threat Detection — "Defense Evasion: Base64 ELF File Command Line" (documented job test)

Job `amazon-crtd-test` (since deleted; execution logs retained), image
`europe-west2-docker.pkg.dev/nivadesk-amazon/amazon/nivadesk-amazon:6ee4d01f` (node:22-slim base),
second-generation execution environment, direct VPC egress `amazon-vpc`/`amazon-subnet`
(all-traffic), service account `amazon-sync@nivadesk-amazon`, command exactly as documented:
`bash -c "sleep 60; base64 -d f0VMRgIB; sleep 10"`.

| Execution | Start → end (UTC) | Relative to enablement (02:21:20) | Container log line | Finding by |
|---|---|---|---|---|
| `amazon-crtd-test-895jz` | 03:01:39 → 03:03:03, succeeded | +40 min (inside the documented 3.5 h activation window) | 03:02:51 `base64: f0VMRgIB: No such file or directory` | none (checked to 03:33) |
| `amazon-crtd-test-cf7xf` | 12:38:59 → 12:40:24, succeeded | +10 h 18 min | 12:40:11 `base64: f0VMRgIB: No such file or directory` | none (checked to 13:10) |

No log entries of resource type `threat_detector` exist in the project.

## Findings that DO exist on the project (proving the pipeline and delivery)

- 2026-09-05T05:29:30Z **Cloud Armor — Increasing Deny Ratio** (MEDIUM, THREAT): created by the
  Cloud Armor source, published by notification config
  `projects/145308107004/locations/global/notificationConfigs/amazon-findings` to Pub/Sub topic
  `scc-findings` 3 s later, received by subscription `scc-findings-evidence`, alert fired.
- 2026-09-05T11:39:18Z **Compliance Evaluation Service — OS_LOGIN_DISABLED** (MEDIUM, MISCONFIGURATION) on the project.

## Expected behaviour

Per the documentation: an Event Threat Detection "Malware: Bad Domain" finding within about 15
minutes of the logged DNS query for `etd-malware-trigger.goog` from a VM in a VPC with Cloud DNS
logging; a Cloud Run Threat Detection "Defense Evasion: Base64 ELF File Command Line" finding
within minutes of the documented command executing in a gen2 Cloud Run job created after the
detector's activation window.

## Questions for Google

1. Is Event Threat Detection consuming this project's Cloud DNS logs for the project-level
   activation? If a Logging routing or sink configuration is required, which one?
2. Is Cloud Run Threat Detection serving europe-west2 for this project-level activation, and did
   its watcher attach to executions of a job created after enablement? Where should its own logs
   appear?
3. Is there any residual effect of the project having been "already onboarded" (the console
   activation flow failed with `GenerateServiceAccounts FAILED_PRECONDITION: project … is already
   onboarded` after the securitycenter API had been enabled by hand; the organisation-level
   Standard activation and the tier change to Premium were done afterwards)?

Attachments to include: `etd-investigation-2026-09-05.md`, `crtd-investigation-2026-09-05.md`,
`scc-activation-2026-09-05.md`, `scc-services.txt`, `scc-agents.txt` (all under
`docs/security/evidence/amazon/`).

## Where to file

- With a paid support plan (Standard or above): Google Cloud console → Support → Cases →
  Create case (project `nivadesk-amazon`). Basic support accepts billing/account questions only, so
  a technical case needs at least Standard Support (a paid plan — a decision for the operator).
- Without a paid plan: the public issue tracker component for Security Command Center
  (issuetracker.google.com), with the same text minus the project internals that should not be
  public (keep the project number, drop the identities), or the Google Cloud Community forum.

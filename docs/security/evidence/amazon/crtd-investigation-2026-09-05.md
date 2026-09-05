# Cloud Run Threat Detection — investigation record (2026-09-05): Google support / CRTD investigation required

## Configuration read live at 2026-09-05T13:11:51Z

```
project: nivadesk-amazon (145308107004), region europe-west2; SCC Premium on the project (trial from 02:18 UTC), Standard on the organisation
cloud-run-threat-detection service: ENABLED ENABLED 2026-09-05T02:21:20.627465877Z
module CLOUD_RUN_BASE64_ELF_FILE_CMDLINE = ENABLED
module CLOUD_RUN_ADDED_MALICIOUS_BINARY_EXECUTED = ENABLED
modules enabled: 37 of 43
SCC sources registered for the project include 'Cloud Run Threat Detection' (45 sources, read 03:36 UTC)
job amazon-crtd-test: europe-west2-docker.pkg.dev/nivadesk-amazon/amazon/nivadesk-amazon:6ee4d01f bash -c;sleep 60; base64 -d f0VMRgIB; sleep 10 amazon-sync@nivadesk-amazon.iam.gserviceaccount.com
job execution environment: gen2 (Cloud Run jobs); VPC egress all-traffic via amazon-vpc (project policy run.allowedVPCEgress)
```

## Executions of Google's documented test (command: sleep 60; base64 -d f0VMRgIB; sleep 10)

| Execution | Started (UTC) | Relative to CRTD enablement (02:21:20) | Container log | Finding within 30 min |
|---|---|---|---|---|
| `amazon-crtd-test-895jz` | 2026-09-05T03:01:39.453880Z 2026-09-05T03:03:03.862143Z 1 | inside the documented "up to 3.5 h" activation window (+40 min) | 2026-09-05T03:02:51.612807Z base64: f0VMRgIB: No such file or directory | none |
| `amazon-crtd-test-cf7xf` | 2026-09-05T12:38:59.845184Z 2026-09-05T12:40:24.087510Z 1 | after the window (+10 h 18 min) | 2026-09-05T12:40:11.943971Z base64: f0VMRgIB: No such file or directory | none |

The container log line `base64: f0VMRgIB: No such file or directory` is the expected outcome of Google's command: the argument is the trigger, not a file.

## Findings on the project at 13:11 UTC (v2 API, all sources)

```
2026-09-05T06:47:10 | Cloud Armor | Increasing Deny Ratio
2026-09-05T11:39:18 | Compliance Evaluation Service | OS_LOGIN_DISABLED
```

No Cloud Run Threat Detection finding of any category exists. What to ask Google (Premium support or a case): whether Cloud Run Threat Detection is serving europe-west2 for this project-level activation, whether the watcher attached to executions of a job created after enablement, and where the detector's own logs (resource type threat_detector) should appear — none exist in the project's log bucket.

## Final status (2026-09-05 21:45 UTC) — record closed

No Cloud Run Threat Detection finding of any category has appeared up to
21:30 UTC. Operator decision: **no further test triggering**; this record is
final and is the second attachment for the support case in
`google-support-case-scc-detectors.md`. The test job was deleted after the
second execution (`test-artifacts-cleanup-2026-09-05.md`); the detector stays
enabled on the project, and the real workloads (`amazon-admin`, later
`amazon-sync`/`amazon-oauth`) remain gen2 with the watcher expected to attach
to them.

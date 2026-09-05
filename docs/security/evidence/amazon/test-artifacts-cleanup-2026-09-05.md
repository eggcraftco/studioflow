# Test artefacts — cleanup record, 2026-09-05 13:39 UTC

| Artefact | Purpose | State after cleanup |
|---|---|---|
| Cloud Run job `amazon-etd-test` | first (non-official) ETD attempt | deleted |
| Cloud Run job `amazon-crtd-test` | Google's documented CRTD test, two executions | deleted (execution logs remain in the `amazon-audit` bucket, 400 days) |
| VM `amazon-etd-vm-test` | Google's documented ETD VM procedure, three runs | deleted by each run's own script; `gcloud compute instances list` → 0 instances |
| Secrets `amazon-refresh-conditiontest`, `amazon-refresh-probe`, `zz-probe-outside-prefix` | Secret Manager IAM-condition probes | deleted on 5 Sep (the first two by the admin identity's own probe) |
| Cloud Run job `amazon-secret-probe` | the IAM-condition probes | deleted on 5 Sep |
| Cloud Run job `amazon-edge-smoke`, `amazon-xproj-read` (main project) | edge and cross-project checks | deleted after each run |
| Cloud Run jobs `amazon-diag`, `amazon-bridge-test` | re-runnable verification tools read by `evidence.sh` | **kept** (no ingress, no schedule, no cost while idle) |

Secrets remaining in the project: intent-hmac-key lwa-client-secret — the two the design defines.

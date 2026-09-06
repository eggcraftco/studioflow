# Freeze watch — 2026-09-06

The change freeze on `nivadesk-amazon` and the VPC Service Controls perimeter runs until the
Go/No-Go on Monday 8 September. Nothing in this file changed any configuration: every entry is a
read. Checks are recorded whether they are clean or not, and a check that could not be run is
recorded as a gap rather than left out.

## Google Cloud support case 75151719 (ETD/CRTD produce no findings)

| Checked (UTC) | Status | Response from Google |
|---|---|---|
| 2026-09-06 01:35 | New, P3 – Medium | none |
| 2026-09-06 10:40 | New, P3 – Medium | none — the case page shows no engineer reply twelve hours after filing |

Filed Friday 2026-09-05 22:31:45 UTC. Standard Support's P3 target is measured in business hours, so
the first answer is realistically Monday. Nothing here blocks the Go/No-Go: the case asks Google why
two documented test procedures produce no findings, and the disposition already recorded is that the
detectors are enabled and the other detector families do produce findings.

## VPC Service Controls — dry-run violations, last 24 hours

Read from the `amazon-audit` log bucket (`europe-west2`, `_AllLogs`) in `nivadesk-amazon`:

| Violations in the window | Enforced (dryRun=False) | Newest entry |
|---|---|---|
| 19 | 0 | 2026-09-05 13:47:33 UTC |

Both classes are the ones already dispositioned: 18 × `NETWORK_NOT_IN_SAME_SERVICE_PERIMETER` on
`logging.googleapis.com WriteLogEntries` from `amazon-deploy@`, and 1 × `NO_MATCHING_ACCESS_LEVEL` on
an Artifact Registry `DockerRead`, all from the 5 September deploy window. **No new violation class
and no violation at all since 13:47 UTC on 5 September** — consistent with a freeze in which nothing
is being deployed. Every entry is still dry-run, so nothing is being denied in production.

Raw output kept with the run:
`scratchpad/vpcsc-dryrun-20260906T1039.txt` (same query as `vpcsc-dryrun-report.txt`, freshness 1d).

## Upload malware scanning — health since the flag went on

`eggcraft-studio`, last 24 hours:

| Signal | Result |
|---|---|
| `maintainFileScans` scheduled executions | 200 OK every time; 25 executions since the soak start at 04:28:31 UTC |
| `scanUploadedFile` entries | 7 INFO, 2 NOTICE, 1 unlabelled — no error, no exception |
| WARNING entries | 2, both at 02:39 and 02:44 UTC: "The request was not authenticated … Empty Authorization header value", `curl/8.7.1`, HTTP 403 |

The two warnings are this project's own unauthenticated deploy probes (the B4.2 and B4.3 baseline
runs), not a failure: an unauthenticated POST to a scheduled function is supposed to be refused, and
the Scheduler's own invocation one minute later returned 200. Scanning is healthy.

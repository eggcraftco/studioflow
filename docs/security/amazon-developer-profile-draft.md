# Amazon Developer Profile — second application, draft answers (updated 2026-09-05 21:50 UTC)

Working draft for the re-application after the first refusal (network
security question). Every answer below points at something that can be read
back from the live configuration or at a file in
`docs/security/evidence/amazon/` produced by `infra/amazon/evidence.sh`.
Items marked **open** are not ready to be claimed and must be closed before
submission.

## Context Amazon will see

- Application type: SP-API public/third-party developer, Orders API only
  (`includedData` without buyer or recipient data; access-control policy §5
  keeps any personal field that does arrive in a server-only collection).
- Hosting: Google Cloud, a dedicated project `nivadesk-amazon` (project
  number 145308107004) in folder `amazon-boundary`, region europe-west2 only
  (organisation policy `gcp.resourceLocations`), separate from the product's
  main project. Design: `amazon-hardened-project-design.md`.

## Network security (the refused question), answered per Amazon's four controls

**1. Network segmentation.** Amazon Information is processed only inside the
dedicated project. Its compute is serverless (Cloud Run gen2) on a VPC of its
own; nothing in the main product project can reach the Amazon project's
Firestore or Secret Manager. Google API traffic from inside the zone resolves
to the restricted VIP (private zone `googleapis.com` → `restricted.googleapis.com`),
proven by a job that fails before the zone and passes after it (`pga-diag-before.txt`,
`pga-diag-after.txt`). A VPC Service Controls perimeter around the project
(10 restricted services, 4 ingress rules, 1 egress rule) has run in dry-run
since 5 September: every dry-run violation is dispositioned in
`amazon-vpcsc-enforce-readiness.md`, the deliberate cross-project read is
recorded as the refusal enforcement will produce, and the Go/No-Go report
recommends enforcement from 8 September after two more clean daily reports
and the operator's explicit approval. **Open** until enforced: the enforced
perimeter (`perimeter.json`), the post-enforcement report and the denied
cross-project read (`cross-project-read-denied.txt`) go into the pack. Not
claimed as "segmented by VPC Service Controls" before that.

**2. Firewall / network ACLs.** *Passed internally 2026-09-05.* All inbound
HTTP enters through one global HTTPS load balancer with a Cloud Armor policy:
default deny, preconfigured WAF rules (SQLi/XSS/LFI/RFI/RCE/protocol/scanner),
per-address rate limiting that doubles as the only allow for `/admin/*`,
`/healthz` from one operator address, everything else refused at the edge.
Cloud Run ingress is `internal-and-cloud-load-balancing` by organisation
policy, so the default `run.app` addresses answer 404 to the internet even
with a valid identity. Egress leaves through direct VPC egress → Cloud NAT
with one static address (34.153.170.14); the VPC firewall denies all egress
except TCP/443; the connector's own hostname allowlist refuses any
destination but Amazon's SP-API/LWA hosts and one bridge endpoint. Evidence:
`cloud-armor-policy.json`, `lb-*.json`, `lb-certificate-and-address.txt`,
`run-ingress.txt`, `run-app-closed-to-internet.txt`, `vpc-firewall-rules.json`,
`nat-and-static-ip.txt`, `subnet-flow-logs.txt`, `armor-blocked-requests.txt`
(real internet scanners denied within minutes of go-live), `edge-smoke-2026-09-05.md`
(8 of 8 requests answered by the intended layer).

**3. IDS / IPS / threat detection.** Security Command Center Premium is active
on the project (Standard on the organisation). Event Threat Detection and
Cloud Run Threat Detection are enabled and effective (`scc-services.txt`);
every active finding is published to a Pub/Sub topic and raises an email
alert to the operator (`scc-notification.json`, `scc-alerting.txt`). The
prevention half is Cloud Armor (above). Audit and data-access logs for
Firestore and Secret Manager are kept 400 days in a regional log bucket
(`log-bucket-retention.txt`). **Open**: Google's documented detection tests were run — "Malware: Bad Domain" three times (the last two on a VM exactly as documented) and "Base64 ELF File Command Line" twice (the second after the documented activation window) — and produced no finding; both investigation records are closed as final (`etd-investigation-2026-09-05.md`, `crtd-investigation-2026-09-05.md`), no further tests are run, and the support-case text is ready for the operator to file (`google-support-case-scc-detectors.md`). The delivery chain is proven end to end with real findings: six notifications retained and decoded (`scc-notification-message-2026-09-05.json`), one alert-metric point per publish (`scc-topic-publishes-2026-09-05.txt`), the finding record (`scc-finding-2026-09-05.md`). Nothing about *detection* is claimed until a detector finding is in the pack; *prevention* (Cloud Armor) and *delivery* are claimed. Security Health
Analytics is retired for new activations by Google; Compliance Manager is
enabled in its place (`scc-activation-2026-09-05.md`).

**4. Anti-malware on privileged endpoints and servers.** *Passed internally
2026-09-05 (final evaluation `amazon-readiness-criteria.md` §4b).* Servers are
serverless (Google's host layer; runtime detection by Cloud Run Threat
Detection); every customer upload is scanned (`upload-scanner-production.txt`).
The one privileged endpoint — the operator's MacBook Pro — is enrolled in
Microsoft Intune (user-approved MDM, corporate) and onboarded to Microsoft
Defender for Endpoint (Defender for Business) with real-time protection,
tamper protection = block, cloud protection, automatic daily security
intelligence updates, a policy-scheduled weekly full scan plus a daily quick
scan, automatic agent updates, FileVault, firewall, screen lock and automatic
OS updates enforced by Intune; the device reports Compliant. The Mac Studio
and the phone are out of scope by written decision (`access-control-policy.md`
§6.1). Evidence: `edr-console-devices.png`, `edr-tamper-protection.png`,
`mdm-policy-export.pdf`, `device-inventory.md`, `intune-compliance.png`,
`intune-device-configuration.png`, `edr-onboarding-2026-09-05.md`; the EDR
pipeline itself was exercised by a real incident, triaged and closed
(`edr-incident-1-active.png`, `edr-incident-1-resolved.png`). Two attachments
follow without changing the result: the Defender health-report capture
(`edr-definitions-date.png`) and the first Sunday full-scan record.

## Identity and access (supporting answers)

- One human identity holds access; organisation-level bootstrap roles were
  removed after project creation, and the two later organisation-level roles
  (Security Command Center, organisation policy) were removed again the same
  day — Security Command Center administration is project-scoped; both
  reductions are re-checked on every pack (`bootstrap-iam-reduction.md`,
  `operator-org-roles.txt`).
- Each workload runs as its own service account with the permissions of its
  one job: the deploy identity cannot invoke services (`deploy-identity-2026-09-05.md`),
  the sync identity may read only refresh tokens, the admin identity may only
  delete them, none may read the signing key (`bridge-test-2026-09-05.md`,
  `secret-iam.txt`). No service-account keys can exist (organisation policy).
- The only cross-project paths are two service-account identities, each
  admitted to exactly one endpoint and refused everywhere else — verified
  live from both sides (`bridge-iam.txt`, `admin-iam.txt`, `bridge-test-2026-09-05.md`,
  `edge-smoke-2026-09-05.md`).
- Secrets: user-managed replication in europe-west2 only; the LWA client
  secret and refresh tokens live only in Secret Manager; nothing in
  repositories or logs.

## Data handling (supporting answers)

- Retention: order data only, 90 days in the zone; personal fields, if any
  ever arrive, are diverted to a server-only collection unreadable by clients.
- Encryption: Google-managed at rest; TLS in transit; Google-managed
  certificate on the public hostname.
- Logging: destination/connection logging (VPC Flow Logs, NAT, firewall,
  DNS queries), Cloud Armor request logs, audit logs — all regional, 400 days.

## Where the four controls stand (2026-09-05 21:50 UTC)

| Control | Status (operator-confirmed 2026-09-05) | Claimable in the application today? |
|---|---|---|
| 1. Network segmentation | **In Progress** — perimeter in dry-run; Go/No-Go written, enforcement from 8 Sep only on the operator's explicit "enforce" | dedicated project, private zone, restricted VIP, identity-scoped bridge: yes; "VPC Service Controls enforced": **not yet** |
| 2. Firewall / network ACLs | **Passed** | yes |
| 3. IDS / IPS / threat detection | **In Progress** — detectors enabled, delivery proven, no detector finding; support package ready to open | prevention (Cloud Armor), logging, alert delivery: yes; "threat detection verified": **not yet** |
| 4. Anti-malware / EDR on privileged endpoints | **Passed** | yes |

## Remaining real blockers for the re-application — one table

Only two items block the submission (operator decision 2026-09-05).

| # | Blocker | Owner | What closes it | Earliest |
|---|---|---|---|---|
| B1 | VPC Service Controls perimeter not enforced (control 1 stays In Progress) | operator approval, then the enforce command (`amazon-vpcsc-enforce-readiness.md` Go/No-Go) | clean daily dry-run reports on 6 and 7 Sep (the deploy path is already Observed / Clean); the operator says "enforce" explicitly; post-enforcement report and the denied cross-project read in the pack | 8 Sep 2026 |
| B2 | No Event Threat Detection or Cloud Run Threat Detection finding, investigation open with Google (control 3 stays In Progress) | operator opens the support case (paid plan or issue tracker — the assistant stops at the plan/price screen); Google answers | either a detector finding delivered through the proven chain, or a written answer from Google folded into the control-3 wording; the single support package `google-support-case-scc-detectors.md` is final; no further self-triggered tests | when Google answers |

**Supplementary evidence — not blockers** (attached when available, the
control-4 verdict does not depend on them): the Defender Antivirus-health
report capture `edr-definitions-date.png` once the report lists the Mac; the
record of the first policy-scheduled full scan (Sunday 7 Sep 03:00).

**Pre-submission checklist items — not blockers**: `infra/amazon/evidence.sh`
run the day before submission with no **missing** row for a claimed control;
every answer above re-read against the manifest.

Kept closed on purpose until after the application is approved: connector
activation, the Cloud Scheduler sync tick, the real Amazon OAuth consent and
order sync — they need Amazon's credentials, which only the approved
application provides; their perimeter rules are re-reviewed at that gate
(`amazon-vpcsc-enforce-readiness.md`, residual-risk section).

## Before submitting — checklist

1. B1 closed: perimeter enforced, post-enforcement report clean, denied
   cross-project read recorded (`cross-project-read-denied.txt`).
2. B2 closed or answered: a detector finding delivered, or Google's answer
   folded into the control-3 wording.
3. Supplementary evidence attached if available (does not gate).
4. `infra/amazon/evidence.sh` run the day before; manifest shows no
   **missing** row for the claimed controls.
5. Answers above re-read against the pack; nothing claimed that a file does
   not show.

# Amazon Developer Profile — second application, draft answers (2026-09-05)

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
`pga-diag-after.txt`). A VPC Service Controls perimeter around the project is
configured in dry-run and will be enforced after a week of observed traffic —
**open** until enforced; the dry-run report (`vpcsc-dryrun-report.txt`) and
the enforced perimeter (`perimeter.json`) go into the pack.

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
(`log-bucket-retention.txt`). **Open**: Google's documented detection tests ("Malware: Bad Domain" — Cloud Run resolver and the official VM procedure — and "Base64 ELF File Command Line") were executed on 5 September and produced no finding within Google's stated latency (`scc-test-2026-09-05.txt`, `scc-crtd-test-2026-09-05.txt`); the cause is being investigated before any claim is made. The delivery chain from the topic onward (subscription, alert, email) is shown working with one synthetic message (`scc-activation-2026-09-05.md`). Security Health
Analytics is retired for new activations by Google; Compliance Manager is
enabled in its place (`scc-activation-2026-09-05.md`).

**4. Anti-malware on privileged endpoints and servers.** Servers are
serverless (Google's host layer; runtime detection by Cloud Run Threat
Detection). **Blocked**: the operator's devices are not yet enrolled in an
MDM with a managed, tamper-protected EDR; the minimum policy and the device
scope are written (`amazon-readiness-criteria.md` §4a) and the evidence files
are named; nothing is claimed until they exist.

## Identity and access (supporting answers)

- One human identity holds access; organisation-level bootstrap roles were
  removed after project creation and re-checked on every pack
  (`bootstrap-iam-reduction.md`, `operator-org-roles.txt`).
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

## Before submitting — checklist

1. Control 3: both findings and their delivery recorded → readiness `Passed`.
2. Control 1: perimeter enforced after the dry-run period; denied cross-project
   read recorded (`cross-project-read-denied.txt`).
3. Control 4: MDM/EDR enrolled; five evidence files present.
4. `infra/amazon/evidence.sh` run the day before; manifest shows no
   **missing** row for the claimed controls.
5. Answers above re-read against the pack; nothing claimed that a file does
   not show.
